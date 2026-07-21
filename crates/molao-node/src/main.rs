//! The `molao` command-line entry point.
//!
//! Everything substantive lives in the library (`molao_node`); this file is the
//! CLI surface and the process lifecycle. Keeping them apart is what lets the
//! integration tests drive the real router rather than a copy of it.

#![forbid(unsafe_code)]

use molao_node::{api, demo, verify};

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use molao_corpus::Corpus;
use molao_graph::Graph;
use molao_index::{FakeEmbedder, HttpConfig, HttpEmbedder, Index};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

/// A node in the Molao commons of case law.
#[derive(Debug, Parser)]
#[command(
    name = "molao",
    version,
    about = "A free, decentralized commons of case law.",
    long_about = "molao — the law, held in common.\n\n\
                  A node holds a corpus of judgments and the citation graph \
                  derived from them, and serves both over a read-only HTTP API \
                  with the web interface built in. It needs no network, no \
                  account, and no hosted service to read the law.\n\n\
                  There is no bundled corpus: start with `molao demo` to see a \
                  working node seeded with fictional judgments, or `molao \
                  ingest` your own."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Serve a corpus over HTTP, with the web interface.
    Serve {
        /// Address to bind.
        #[arg(long, default_value = "127.0.0.1:8737")]
        addr: SocketAddr,
        /// Corpus database file. Created if it does not exist.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
        /// A signed release to report and verify against `--signers`.
        #[arg(long, requires = "signers")]
        release: Option<PathBuf>,
        /// The signer set to verify `--release` against.
        #[arg(long, requires = "release")]
        signers: Option<PathBuf>,
        /// OpenAI-compatible embeddings endpoint for `/api/rag/search`, used to
        /// embed queries against an index built with the HTTP embedder. Not
        /// needed for a fake-embedder index, which needs no configuration.
        #[arg(long, requires = "rag_model")]
        rag_endpoint: Option<String>,
        /// Model name to request from `--rag-endpoint`.
        #[arg(long, requires = "rag_endpoint")]
        rag_model: Option<String>,
    },

    /// Ingest judgments from a file or directory.
    ///
    /// `.jsonl` / `.ndjson` are JSON Lines, one judgment per line. `.txt` is the
    /// header-and-body plain-text format. `.xml` is Akoma Ntoso, the format
    /// Laws.Africa / AfricanLII publish — this is the licensed-bulk path, and
    /// the region is taken from the court code's country prefix. Anything else
    /// is skipped.
    ///
    /// Locally imported judgments carry `Manual` provenance: an import from a
    /// file is not a witnessed fetch, and the corpus should say so until a
    /// witness corroborates the bytes.
    Ingest {
        /// File or directory to ingest.
        path: PathBuf,
        /// Corpus database file. Created if it does not exist.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
    },

    /// Seed a demo corpus of fictional judgments and serve it.
    ///
    /// The judgments are invented — realistic in structure, citation, and
    /// hierarchy, but no real judgment text is reproduced. This is how to see a
    /// working node with no setup at all.
    Demo {
        /// Address to bind.
        #[arg(long, default_value = "127.0.0.1:8737")]
        addr: SocketAddr,
        /// Where to write the demo corpus. Omit to keep it in memory only.
        #[arg(long)]
        db: Option<PathBuf>,
        /// Seed the corpus and exit without serving.
        #[arg(long)]
        no_serve: bool,
    },

    /// Verify a threshold-signed release. Exits non-zero if it does not verify.
    Verify {
        /// The release JSON file.
        release: PathBuf,
        /// The signer set to verify against.
        ///
        /// Supplied by you, deliberately: a release that named its own signers
        /// would be a release that authorised itself.
        #[arg(long)]
        signers: PathBuf,
    },

    /// Report what this node holds.
    Stats {
        /// Corpus database file.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
    },

    /// Build and inspect the local search index.
    ///
    /// The index is an **unsigned, rebuildable cache** — never part of a
    /// release, and never something another node has to trust. It powers
    /// `/api/rag/search`. See `docs/RAG.md`.
    Index {
        #[command(subcommand)]
        command: IndexCommand,
    },

    /// Fetch and parse one judgment from a live AfricanLII (peachjam) site.
    ///
    /// Give the judgment's page URL, e.g.
    /// `https://new.kenyalaw.org/akn/ke/judgment/keca/2026/1460/eng`. The
    /// fetch honours the site's robots.txt and its crawl-delay, identifies
    /// itself, and follows a PDF-backed judgment to its `source.pdf`.
    ///
    /// Like a file import, a fetched judgment enters with **Manual**
    /// provenance until a witness signs the recorded bytes: an unsigned fetch
    /// is not independent corroboration. `--dry-run` prints the parsed
    /// judgment without storing anything.
    Fetch {
        /// The judgment page URL on a peachjam site. SAFLII hosts are refused.
        url: String,
        /// Parse and print the judgment without storing it.
        #[arg(long)]
        dry_run: bool,
        /// Corpus database to ingest into. Ignored with `--dry-run`.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
    },

    /// Crawl an AfricanLII (peachjam) site's judgment listing and ingest up to N.
    ///
    /// The target is a region code (`ke`, `zm`, `ng`, …) resolved through the
    /// built-in sources registry, or a base URL (`https://zambialii.org`).
    /// SAFLII-hosted jurisdictions (e.g. `bw`, `za`) are citation-only and are
    /// refused with a clear message — never crawled.
    ///
    /// Enumeration honours robots.txt and spaces every request by the site's
    /// crawl-delay. This is a polite sample, not a bulk mirror.
    Crawl {
        /// Region code or base URL of a peachjam site.
        target: String,
        /// Restrict to a single court code, e.g. `KECA`.
        #[arg(long)]
        court: Option<String>,
        /// Maximum judgments to ingest.
        #[arg(long, default_value_t = 10)]
        limit: usize,
        /// Parse and print judgments without storing them.
        #[arg(long)]
        dry_run: bool,
        /// Corpus database to ingest into. Ignored with `--dry-run`.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
    },
}

/// Which embedder to build an index with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum EmbedderKind {
    /// Deterministic, offline, model-free. No semantics, but reproducible
    /// everywhere — the default, and what the demo uses.
    Fake,
    /// An OpenAI-compatible `/v1/embeddings` endpoint you supply. This is how a
    /// real node gets semantic search: point it at your own local model.
    Http,
}

#[derive(Debug, Subcommand)]
enum IndexCommand {
    /// (Re)build the index for the current corpus with a chosen embedder.
    ///
    /// Writes a sidecar file next to the corpus database (`<db>.index`) tagged
    /// with a descriptor recording the model, dimension, chunker, and the
    /// corpus it was built from. Rebuilding replaces the index for that model in
    /// place; building with a different model adds a second, coexisting index.
    Build {
        /// Corpus database file.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
        /// Embedder to use.
        #[arg(long, value_enum, default_value = "fake")]
        embedder: EmbedderKind,
        /// `--embedder http` only: the embeddings endpoint, e.g.
        /// `http://127.0.0.1:11434/v1/embeddings`.
        #[arg(long)]
        endpoint: Option<String>,
        /// `--embedder http` only: the model name to request.
        #[arg(long)]
        model: Option<String>,
        /// `--embedder fake` only: vector dimension.
        #[arg(long)]
        dim: Option<usize>,
    },

    /// Show the descriptors present in the index and whether each is stale.
    Info {
        /// Corpus database file.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
    },
}

fn main() -> Result<()> {
    // `RUST_LOG` overrides; the default is quiet enough to run in a terminal and
    // loud enough to explain a failure.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "molao=info,tower_http=warn".into()),
        )
        .with_target(false)
        .init();

    match Cli::parse().command {
        Command::Serve {
            addr,
            db,
            release,
            signers,
            rag_endpoint,
            rag_model,
        } => {
            let corpus = open(&db)?;
            let mut state = api::AppState::new(corpus).context("building the citation graph")?;
            if let (Some(r), Some(s)) = (release, signers) {
                let release_text = std::fs::read_to_string(&r)
                    .with_context(|| format!("reading {}", r.display()))?;
                let signers_text = std::fs::read_to_string(&s)
                    .with_context(|| format!("reading {}", s.display()))?;
                state = state.with_release(
                    serde_json::from_str(&release_text).context("parsing the release")?,
                    serde_json::from_str(&signers_text).context("parsing the signer set")?,
                );
            }
            // Attach the sidecar index if one has been built. Its absence is not
            // an error: the node serves keyword search regardless, and
            // `/api/rag/search` reports plainly when no index is present.
            let index_path = Index::sidecar_path(&db);
            if index_path.exists() {
                match Index::open(&index_path) {
                    Ok(index) => {
                        let http =
                            rag_endpoint
                                .zip(rag_model)
                                .map(|(endpoint, model)| HttpConfig {
                                    endpoint,
                                    model,
                                    api_key: std::env::var("MOLAO_EMBED_API_KEY").ok(),
                                });
                        println!("attached search index {}", index_path.display());
                        state = state.with_index(index, http);
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "could not open the index; serving without it")
                    }
                }
            }
            run_server(addr, state)
        }

        Command::Ingest { path, db } => {
            let mut corpus = open(&db)?;
            let report = molao_corpus::ingest::ingest_path(&mut corpus, &path)
                .with_context(|| format!("ingesting {}", path.display()))?;

            // `.xml` is skipped by ingest_path (it only knows jsonl/txt), so the
            // Akoma Ntoso pass here does not double-process anything.
            let akn = ingest_akn(&mut corpus, &path)
                .with_context(|| format!("ingesting Akoma Ntoso from {}", path.display()))?;

            println!(
                "ingested {} judgment(s) from {} file(s); {} citation(s) newly resolved",
                report.inserted + akn.inserted,
                report.files + akn.files,
                report.relinked + akn.relinked
            );
            if akn.files > 0 {
                println!(
                    "  ({} from Akoma Ntoso, imported with Manual provenance)",
                    akn.inserted
                );
            }

            // Scores are stale the moment the corpus changes, so recompute
            // rather than leaving a node ranking on yesterday's graph.
            let graph = Graph::build(&corpus).context("building the citation graph")?;
            graph
                .write_authority(&corpus)
                .context("writing authority scores")?;
            println!(
                "recomputed authority over {} judgment(s)",
                graph.nodes().len()
            );

            let errors: Vec<(String, String)> =
                report.errors.into_iter().chain(akn.errors).collect();
            if !errors.is_empty() {
                eprintln!("\n{} record(s) failed:", errors.len());
                for (location, reason) in &errors {
                    eprintln!("  {location}: {reason}");
                }
                // Report everything, then fail — a silent partial ingest is how
                // a corpus quietly ends up missing judgments.
                std::process::exit(1);
            }
            Ok(())
        }

        Command::Demo { addr, db, no_serve } => {
            let mut corpus = match &db {
                Some(path) => open(path)?,
                None => Corpus::open_in_memory().context("opening an in-memory corpus")?,
            };
            let n = demo::seed(&mut corpus).context("seeding the demo corpus")?;
            let graph = Graph::build(&corpus).context("building the citation graph")?;
            graph
                .write_authority(&corpus)
                .context("writing authority scores")?;

            println!(
                "seeded {n} fictional judgments ({} region profile)",
                demo::DEMO_REGION
            );
            println!("these are invented cases — no real judgment text is reproduced");

            if no_serve {
                return Ok(());
            }
            // Build a fake-embedder index so `/api/rag/search` works out of the
            // box with no model and no network. It is a demo of the pipeline,
            // not semantic search — see `docs/RAG.md`.
            let index = demo::build_fake_index(&corpus).context("building the demo index")?;
            println!("built a demo search index (fake embedder — not semantic; see docs/RAG.md)");
            let state = api::AppState::new(corpus)?.with_index(index, None);
            run_server(addr, state)
        }

        Command::Verify { release, signers } => {
            let verdict = verify::verify_files(&release, &signers)?;
            if verdict.ok {
                println!(
                    "OK  release {}: {} of {} signature(s), threshold {}",
                    verdict.release, verdict.valid_signatures, verdict.signers, verdict.threshold
                );
                println!(
                    "this verifies bytes and signatures — not that the law is correctly stated"
                );
                Ok(())
            } else {
                eprintln!(
                    "FAILED  release {}: {}",
                    verdict.release,
                    verdict.reason.as_deref().unwrap_or("did not verify")
                );
                std::process::exit(1);
            }
        }

        Command::Stats { db } => {
            let corpus = open(&db)?;
            let stats = corpus.stats()?;
            println!("judgments          {}", stats.docs);
            println!("citation edges     {}", stats.edges);
            println!("unresolved cites   {}", stats.unresolved);
            println!("courts             {}", stats.courts);
            println!("corpus root        {}", corpus.corpus_root()?);
            println!("extractor          {}", molao_cite::EXTRACTOR_VERSION);
            println!();
            println!("provenance");
            println!("  corroborated     {}", stats.corroborated);
            println!("  single source    {}", stats.single);
            println!("  manually entered {}", stats.manual);
            if !stats.regions.is_empty() {
                println!();
                println!("regions");
                for (code, count) in &stats.regions {
                    println!("  {code:<16} {count}");
                }
            }
            Ok(())
        }

        Command::Index { command } => run_index(command),

        Command::Fetch { url, dry_run, db } => run_fetch(&url, dry_run, &db),

        Command::Crawl {
            target,
            court,
            limit,
            dry_run,
            db,
        } => run_crawl(&target, court.as_deref(), limit, dry_run, &db),
    }
}

/// Handle `molao index build` and `molao index info`.
fn run_index(command: IndexCommand) -> Result<()> {
    match command {
        IndexCommand::Build {
            db,
            embedder,
            endpoint,
            model,
            dim,
        } => {
            let corpus = open(&db)?;
            let index_path = Index::sidecar_path(&db);
            let mut index = Index::open(&index_path)
                .with_context(|| format!("opening {}", index_path.display()))?;

            let descriptor = match embedder {
                EmbedderKind::Fake => {
                    let dim = dim.unwrap_or(FakeEmbedder::DEFAULT_DIM);
                    index
                        .build_from_corpus(&corpus, &FakeEmbedder::new(dim))
                        .context("building the index")?
                }
                EmbedderKind::Http => {
                    let endpoint = endpoint.ok_or_else(|| {
                        anyhow!("--embedder http requires --endpoint (an OpenAI-compatible /v1/embeddings URL)")
                    })?;
                    let model = model.ok_or_else(|| {
                        anyhow!("--embedder http requires --model (the model name)")
                    })?;
                    let http = HttpEmbedder::new(HttpConfig {
                        endpoint,
                        model,
                        api_key: std::env::var("MOLAO_EMBED_API_KEY").ok(),
                    });
                    index
                        .build_from_corpus(&corpus, &http)
                        .context("building the index (is the embeddings endpoint reachable?)")?
                }
            };

            let stored = index
                .descriptor(&descriptor.descriptor_id())
                .context("reading back the descriptor")?
                .ok_or_else(|| anyhow!("the index was built but its descriptor is missing"))?;

            println!("built index {}", index_path.display());
            println!("  descriptor      {}", descriptor.descriptor_id());
            println!(
                "  embedder        {} ({})",
                descriptor.embedder_id, descriptor.model_version
            );
            println!("  dimension       {}", descriptor.dim);
            println!("  chunker         {}", descriptor.chunker_id);
            println!("  chunks          {}", stored.chunk_count);
            println!("  corpus root     {}", descriptor.corpus_root);
            println!();
            println!("this index is an UNSIGNED, rebuildable cache — never part of a release");
            if descriptor.embedder_id == FakeEmbedder::ID {
                println!("the fake embedder is not semantic search; supply a model for real RAG (docs/RAG.md)");
            }
            Ok(())
        }

        IndexCommand::Info { db } => {
            let index_path = Index::sidecar_path(&db);
            if !index_path.exists() {
                println!("no index at {}", index_path.display());
                println!("run `molao index build --db {}` to build one", db.display());
                return Ok(());
            }
            let index = Index::open(&index_path)?;
            let descriptors = index.descriptors().context("reading descriptors")?;
            // The corpus is optional here — info should work even if the corpus
            // file has moved — but if it is present, report staleness against it.
            let current_root = Corpus::open(&db).ok().and_then(|c| c.corpus_root().ok());

            println!("index {}", index_path.display());
            if let Some(root) = &current_root {
                println!("corpus root now {root}");
            }
            println!();
            if descriptors.is_empty() {
                println!("(no descriptors — the index is empty)");
            }
            for d in &descriptors {
                let stale = current_root
                    .as_deref()
                    .map(|r| d.descriptor.is_stale_against(r));
                println!("descriptor {}", d.descriptor_id);
                println!(
                    "  embedder      {} ({})",
                    d.descriptor.embedder_id, d.descriptor.model_version
                );
                println!("  dimension     {}", d.descriptor.dim);
                println!("  chunker       {}", d.descriptor.chunker_id);
                println!("  chunks        {}", d.chunk_count);
                println!("  built at      {}", d.built_at);
                println!("  built from    {}", d.descriptor.corpus_root);
                match stale {
                    Some(true) => {
                        println!("  status        STALE — rebuild before relying on results")
                    }
                    Some(false) => println!("  status        current"),
                    None => println!("  status        unknown (corpus not found)"),
                }
                println!();
            }
            println!("indexes are unsigned rebuildable caches, never part of a release");
            Ok(())
        }
    }
}

fn open(path: &std::path::Path) -> Result<Corpus> {
    Corpus::open(path).with_context(|| format!("opening corpus {}", path.display()))
}

/// What an Akoma Ntoso ingest pass did — same shape as the corpus ingest report
/// so the two can be summed in the handler.
#[derive(Default)]
struct AknReport {
    files: usize,
    inserted: usize,
    relinked: usize,
    errors: Vec<(String, String)>,
}

/// Ingest every `.xml` (Akoma Ntoso) file under `path` into the corpus.
///
/// This is the licensed-bulk path: Laws.Africa and AfricanLII publish judgments
/// as Akoma Ntoso, and [`molao_ingest::akn::parse`] turns one into a structured
/// judgment. Region comes from the court code's ISO country prefix (`ZACC` is
/// `ZA`, `UGSC` is `UG`), which is how the LII neutral-citation codes are
/// built; an unrecognised prefix falls back to the default profile.
///
/// A file import is not a witnessed fetch, so judgments enter with **no**
/// provenance — `ProvenanceClass::Manual`. A witness corroborates the bytes
/// later; the corpus should not pretend a local file was independently seen.
fn ingest_akn(corpus: &mut Corpus, path: &std::path::Path) -> Result<AknReport> {
    let mut report = AknReport::default();
    let mut files = Vec::new();
    collect_xml(path, &mut files);

    for file in files {
        report.files += 1;
        let loc = file.display().to_string();
        let xml = match std::fs::read_to_string(&file) {
            Ok(x) => x,
            Err(e) => {
                report.errors.push((loc, e.to_string()));
                continue;
            }
        };
        let judgment = match molao_ingest::akn::parse(&xml) {
            Ok(j) => j,
            Err(e) => {
                report.errors.push((loc, e.to_string()));
                continue;
            }
        };
        // LII court codes carry the ISO country prefix; use it as the region
        // when it names a profile we know, else let the corpus default apply.
        let region = judgment.court.get(..2).filter(|p| {
            let up = p.to_uppercase();
            molao_core::region::builtin(&up).is_some()
        });
        let result = match region {
            Some(code) => corpus.insert_judgment_in_region(&judgment, &[], &code.to_uppercase()),
            None => corpus.insert_judgment(&judgment, &[]),
        };
        match result {
            Ok(()) => report.inserted += 1,
            Err(e) => report.errors.push((loc, e.to_string())),
        }
    }

    if report.inserted > 0 {
        report.relinked = corpus
            .relink()
            .context("relinking citations after Akoma Ntoso ingest")?;
    }
    Ok(report)
}

/// Collect `.xml` files from a file or directory (one level; the corpus ingest
/// walker is the model for depth, and judgments are not nested deep).
fn collect_xml(path: &std::path::Path, out: &mut Vec<PathBuf>) {
    let is_xml = |p: &std::path::Path| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("xml"));
    if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
            paths.sort(); // deterministic order
            for p in paths {
                if p.is_file() && is_xml(&p) {
                    out.push(p);
                }
            }
        }
    } else if is_xml(path) {
        out.push(path.to_path_buf());
    }
}

// ---------------------------------------------------------------------------
// Live fetch / crawl of AfricanLII (peachjam) sites
// ---------------------------------------------------------------------------

use molao_ingest::Sleeper as _;

/// A polite gap between requests to one host. Above peachjam's 5s crawl-delay
/// so the fetcher's own per-host rate limiter is always satisfied and never
/// has to reject a too-soon request during a crawl.
const CRAWL_DELAY: std::time::Duration = std::time::Duration::from_secs(6);

/// A real, robots-respecting, rate-limited fetcher for live crawling.
fn peachjam_client() -> molao_ingest::FetchClient<molao_ingest::UreqTransport> {
    molao_ingest::FetchClient::new(
        molao_ingest::UreqTransport::new(),
        molao_ingest::SystemClock,
    )
}

/// Insert one judgment under its country region. Like a file import, a fetched
/// judgment carries **no** witness provenance (`&[]` → `Manual`): a fetch that
/// nobody has signed is not independent corroboration, and the corpus should
/// not pretend otherwise until a witness attests the bytes.
fn ingest_one(corpus: &mut Corpus, j: &molao_core::Judgment, region: &str) -> Result<()> {
    corpus
        .insert_judgment_in_region(j, &[], region)
        .with_context(|| format!("inserting {}", j.id))?;
    Ok(())
}

fn region_of(url: &str) -> String {
    molao_ingest::peachjam::country_from_url(url)
        .unwrap_or_else(|| molao_corpus::DEFAULT_REGION.to_string())
}

/// `molao fetch <url>`.
fn run_fetch(url: &str, dry_run: bool, db: &std::path::Path) -> Result<()> {
    if url.to_ascii_lowercase().contains("saflii") {
        return Err(anyhow!(
            "SAFLII is a citation-only target and is never fetched for the corpus (see docs/SOURCES.md)"
        ));
    }
    let client = peachjam_client();
    let sleeper = molao_ingest::RealSleeper;
    let fj = molao_ingest::fetch_judgment(&client, url, CRAWL_DELAY, &sleeper)
        .with_context(|| format!("fetching {url}"))?;

    let region = region_of(url);
    print_fetched(&fj, &region);

    if dry_run {
        println!("\n(dry run — nothing stored)");
        return Ok(());
    }

    let mut corpus = open(db)?;
    ingest_one(&mut corpus, &fj.judgment, &region)?;
    let relinked = corpus.relink().context("relinking citations")?;
    let graph = Graph::build(&corpus).context("building the citation graph")?;
    graph
        .write_authority(&corpus)
        .context("writing authority scores")?;
    println!(
        "\nstored into {} ({} citation(s) resolved; Manual provenance)",
        db.display(),
        relinked
    );
    Ok(())
}

/// `molao crawl <region|base-url>`.
fn run_crawl(
    target: &str,
    court: Option<&str>,
    limit: usize,
    dry_run: bool,
    db: &std::path::Path,
) -> Result<()> {
    let base = resolve_crawl_target(target)?;
    match court {
        Some(c) => println!("crawling {base} (court {c}, up to {limit})"),
        None => println!("crawling {base} (up to {limit})"),
    }

    let client = peachjam_client();
    let sleeper = molao_ingest::RealSleeper;
    let urls = molao_ingest::enumerate(&client, &base, court, limit, CRAWL_DELAY, &sleeper)
        .with_context(|| format!("enumerating judgments from {base}"))?;

    if urls.is_empty() {
        println!(
            "no judgment links found — the listing may render links via JavaScript this static \
             fetch cannot see. Try a specific judgment URL with `molao fetch`."
        );
        return Ok(());
    }
    println!("found {} judgment URL(s)\n", urls.len());

    let mut corpus = if dry_run { None } else { Some(open(db)?) };
    let mut stored = 0usize;
    let mut failed = 0usize;

    for url in &urls {
        // Space every judgment fetch by the crawl-delay: the previous request
        // (enumeration, or the last judgment) was to this same host.
        sleeper.sleep(CRAWL_DELAY);
        match molao_ingest::fetch_judgment(&client, url, CRAWL_DELAY, &sleeper) {
            Ok(fj) => {
                let j = &fj.judgment;
                let cite = j.neutral_citation.as_deref().unwrap_or("(no citation)");
                let kind = if fj.pdf_backed { "pdf" } else { "akn" };
                match corpus.as_mut() {
                    Some(c) => {
                        let region = region_of(url);
                        match ingest_one(c, j, &region) {
                            Ok(()) => {
                                stored += 1;
                                println!(
                                    "  [stored] {} {cite} — {} ({} para, {kind})",
                                    j.court,
                                    j.title,
                                    j.paragraphs.len()
                                );
                            }
                            Err(e) => {
                                failed += 1;
                                eprintln!("  [error]  {url}: {e:#}");
                            }
                        }
                    }
                    None => {
                        println!(
                            "  [parsed] {} {cite} — {} ({} para, {kind})",
                            j.court,
                            j.title,
                            j.paragraphs.len()
                        );
                    }
                }
            }
            Err(e) => {
                failed += 1;
                eprintln!("  [skip]   {url}: {e}");
            }
        }
    }

    match corpus.as_ref() {
        Some(c) => {
            let relinked = c.relink().context("relinking citations after crawl")?;
            let graph = Graph::build(c).context("building the citation graph")?;
            graph
                .write_authority(c)
                .context("writing authority scores")?;
            println!(
                "\nstored {stored}, {failed} failed; {relinked} citation(s) resolved over {} judgment(s)",
                graph.nodes().len()
            );
        }
        None => {
            println!(
                "\nparsed {} judgment(s), {failed} failed (dry run — nothing stored)",
                urls.len() - failed
            );
        }
    }
    Ok(())
}

/// Resolve a crawl target — a region code or a base URL — to a base URL,
/// refusing SAFLII-hosted jurisdictions outright.
fn resolve_crawl_target(target: &str) -> Result<String> {
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        if lower.contains("saflii") {
            return Err(anyhow!(
                "SAFLII is a citation-only target and is never crawled (see docs/SOURCES.md)"
            ));
        }
        return Ok(target.to_string());
    }
    match molao_ingest::source_for_region(target) {
        Some(src) if src.platform == molao_ingest::Platform::SafliiCitationOnly => Err(anyhow!(
            "{} is a SAFLII citation-only jurisdiction — Molao resolves citations into it but never \
             crawls it (see docs/SOURCES.md). Its case law is on SAFLII, not a peachjam host.",
            target.to_uppercase()
        )),
        Some(src) => Ok(src.base_url()),
        None => Err(anyhow!(
            "no peachjam source is configured for region {:?}. Known regions: {}. \
             Or pass a base URL like https://<host>.",
            target.to_uppercase(),
            molao_ingest::SOURCES
                .iter()
                .filter(|s| s.platform == molao_ingest::Platform::Peachjam)
                .map(|s| s.region)
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

/// Print a parsed judgment and its provenance for `--dry-run` and the fetch
/// summary.
fn print_fetched(fj: &molao_ingest::FetchedJudgment, region: &str) {
    let j = &fj.judgment;
    println!("court            {}", j.court);
    println!("region           {region}");
    println!("title            {}", j.title);
    if let Some(n) = &j.neutral_citation {
        println!("neutral citation {n}");
    }
    if !j.reported_citations.is_empty() {
        println!("reported         {}", j.reported_citations.join("; "));
    }
    if !j.case_numbers.is_empty() {
        println!("case number(s)   {}", j.case_numbers.join("; "));
    }
    if let Some(d) = &j.date {
        println!("date             {d}");
    }
    println!(
        "body source      {}",
        if fj.pdf_backed {
            "source.pdf"
        } else {
            "Akoma Ntoso HTML"
        }
    );
    println!("paragraphs       {}", j.paragraphs.len());
    println!("doc id           {}", j.id);
    println!("verifies         {}", j.verify_id());
    if let Some(p) = j.paragraphs.first() {
        let snippet: String = p.text.chars().take(180).collect();
        let ellipsis = if p.text.chars().count() > 180 {
            "…"
        } else {
            ""
        };
        println!("first paragraph  {snippet}{ellipsis}");
    }
    println!("provenance");
    println!("  source_url     {}", fj.provenance.source_url);
    println!("  fetched_at     {}", fj.provenance.fetched_at);
    println!("  raw_hash       {}", fj.provenance.raw_hash);
    println!("  class          manual (unsigned fetch; a witness signs to corroborate the bytes)");
}

/// Start the HTTP server and block until shutdown.
fn run_server(addr: SocketAddr, state: api::AppState) -> Result<()> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("starting the async runtime")?;

    runtime.block_on(async move {
        let app = api::router(Arc::new(state));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .with_context(|| format!("binding {addr}"))?;

        println!("molao serving on http://{addr}");
        println!("the law, held in common");

        axum::serve(listener, app)
            .with_graceful_shutdown(shutdown())
            .await
            .context("serving")
    })
}

/// Wait for Ctrl-C, or SIGTERM where there is one.
///
/// Graceful shutdown matters even for a read-only server: a node is often run
/// under a supervisor, and one that has to be killed produces a confusing
/// non-zero exit on every restart.
async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            // No SIGTERM handler is not fatal; Ctrl-C still works.
            Err(e) => {
                tracing::warn!(error = %e, "could not install a SIGTERM handler");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }

    println!("\nshutting down");
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn the_cli_definition_is_valid() {
        // Catches conflicting args, bad defaults, and broken `requires` links at
        // test time rather than when a user types the command.
        Cli::command().debug_assert();
    }

    #[test]
    fn every_subcommand_has_help() {
        let mut cmd = Cli::command();
        let names: Vec<String> = cmd
            .get_subcommands()
            .map(|s| s.get_name().to_string())
            .collect();
        assert_eq!(
            names,
            vec!["serve", "ingest", "demo", "verify", "stats", "index", "fetch", "crawl"],
            "a subcommand was added or renamed without updating the docs"
        );
        for name in &names {
            let sub = cmd.find_subcommand_mut(name).unwrap();
            assert!(
                sub.get_about().is_some(),
                "subcommand `{name}` has no help text"
            );
        }
    }

    #[test]
    fn release_and_signers_must_be_given_together() {
        // Half a verification setup would silently serve an unverified release.
        assert!(Cli::try_parse_from(["molao", "serve", "--release", "r.json"]).is_err());
        assert!(Cli::try_parse_from(["molao", "serve", "--signers", "s.json"]).is_err());
        assert!(Cli::try_parse_from([
            "molao",
            "serve",
            "--release",
            "r.json",
            "--signers",
            "s.json"
        ])
        .is_ok());
    }

    #[test]
    fn documented_defaults_are_what_the_docs_claim() {
        let Command::Serve { addr, db, .. } =
            Cli::try_parse_from(["molao", "serve"]).unwrap().command
        else {
            panic!("expected the serve subcommand");
        };
        assert_eq!(addr.to_string(), "127.0.0.1:8737");
        assert_eq!(db, PathBuf::from("molao.db"));
    }

    #[test]
    fn verify_requires_a_signer_set() {
        // Verifying against a release's own claims would be circular.
        assert!(Cli::try_parse_from(["molao", "verify", "release.json"]).is_err());
        assert!(
            Cli::try_parse_from(["molao", "verify", "release.json", "--signers", "s.json"]).is_ok()
        );
    }
}
