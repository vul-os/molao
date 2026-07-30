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
use std::collections::BTreeMap;
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
    /// Directory of region-profile TOML files to load at start-up.
    ///
    /// Court codes, tiers and law-report series are data, and this is where a
    /// node supplies its own. A loaded profile takes precedence over the
    /// compiled-in profile of the same code, and anything not supplied falls
    /// back to the compiled-in registry — so correcting one court code is a
    /// file, not a rebuild. `profiles/` in the repository is a directory of
    /// exactly this shape.
    ///
    /// Loading is fail-closed: a malformed file, two files claiming one region
    /// code, or a directory with no profiles in it all abort before anything is
    /// ingested. `molao regions` prints what an invocation resolves.
    #[arg(long, global = true, value_name = "DIR")]
    profiles: Option<PathBuf>,

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

    /// Verify a threshold-signed release, step by step.
    ///
    /// Six steps: the signer set can deliver a quorum; a quorum signed this
    /// manifest; the release chains onto the head you hold; every document
    /// re-hashes to its own id; `corpus_root` and `doc_count` match the corpus;
    /// and re-running the pinned extractor reproduces `graph_root`.
    ///
    /// The last three need `--db`, and step 3 needs `--previous`. A step that
    /// cannot run is reported SKIP, which is **not** a pass: exit 0 means all
    /// six passed, 1 means one failed, 2 means the run was incomplete.
    Verify {
        /// The release JSON file.
        release: PathBuf,
        /// The signer set to verify against.
        ///
        /// Supplied by you, deliberately: a release that named its own signers
        /// would be a release that authorised itself. Compare its fingerprint,
        /// printed by step 1, against the set the signing organisations
        /// published — that comparison is the trust root and cannot be
        /// automated away.
        #[arg(long)]
        signers: PathBuf,
        /// The corpus to check the release against (steps 4, 5 and 6).
        #[arg(long)]
        db: Option<PathBuf>,
        /// The manifest of the release you already trust, for the chain check.
        ///
        /// A release directory's `manifest.json`, or the `manifest` field of a
        /// signed release you have already verified.
        #[arg(long, value_name = "MANIFEST.JSON")]
        previous: Option<PathBuf>,
    },

    /// Package, sign, move and inspect content-addressed releases.
    ///
    /// A release is a set of files each named by its own hash, plus a manifest
    /// naming the roots over them, plus a quorum's signatures over that
    /// manifest. Because the files are content-addressed and the manifest is
    /// signed, *how* a release travels is not part of what makes it
    /// trustworthy — so none of these transports is privileged and none of them
    /// is required. **P2P will never be needed to read the law.**
    ///
    /// There is no public signed release. Nothing here has carried a real one.
    Release {
        #[command(subcommand)]
        command: ReleaseCommand,
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
        /// Ingest even if the site's robots.txt Content-Signal says `ai-input=no`.
        ///
        /// Off by default. Setting it is your determination that this node's use
        /// is within the source's rights — the judgments are public-domain law
        /// and the signal is a non-binding convention. It never changes how the
        /// crawler identifies itself (always `molao-node`) or its respect for
        /// robots.txt `Disallow`/`Crawl-delay`; it only sets the corpus policy.
        #[arg(long)]
        ignore_content_signals: bool,
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
        /// Ingest even if the site's Content-Signal says `ai-input=no`. See
        /// `molao fetch --help`; off by default, an operator determination.
        #[arg(long)]
        ignore_content_signals: bool,
        /// Corpus database to ingest into. Ignored with `--dry-run`.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
    },

    /// List the case-law sources the crawler knows, and what each permits.
    ///
    /// Shows the built-in AfricanLII/peachjam registry with each host's
    /// recorded content-signal and the resulting corpus eligibility. The full
    /// cross-jurisdiction picture — court-direct sources, licensed routes, and
    /// what still needs an adapter or paperwork — is in docs/SOURCE-MAP.md.
    Sources,

    /// List the region profiles this node resolves, and where each came from.
    ///
    /// With `--profiles <DIR>`, profiles loaded from that directory are listed
    /// first and shadow the compiled-in profile of the same code; the rest of
    /// the built-in set is the fallback. Each line carries the profile's
    /// fingerprint — the hash of the registry itself. A citation graph is
    /// reproducible from the extractor version *and* the fingerprints of the
    /// profiles that produced it; a node running its own registry can say so
    /// exactly rather than leaving a reader to assume.
    Regions,
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
enum ReleaseCommand {
    /// Package a corpus into a content-addressed release directory.
    ///
    /// Writes `objects/`, `index.json` and an **unsigned** `manifest.json`. It
    /// is not a release until a quorum has signed it (`molao release sign`);
    /// one signature is never enough and this tool will not pretend otherwise.
    ///
    /// Deterministic: two builders running this over the same corpus, with the
    /// same `--release`, `--previous` and `--created-at`, produce byte-identical
    /// output. `molao release attest` prints the one line they compare.
    Publish {
        /// Corpus database file.
        #[arg(long, default_value = "molao.db")]
        db: PathBuf,
        /// Directory to write the release into. Created if it does not exist.
        #[arg(long)]
        out: PathBuf,
        /// Release number.
        #[arg(long)]
        release: u64,
        /// Hash of the previous manifest. Omit only for release 0.
        #[arg(long, value_name = "HASH")]
        previous: Option<String>,
        /// RFC 3339 timestamp to record. Supplied rather than taken from the
        /// clock, because a timestamp read at build time is the one input that
        /// would make two honest builders disagree.
        #[arg(long, value_name = "RFC3339")]
        created_at: String,
    },

    /// Add one signature to a packaged release.
    ///
    /// Run once per signing institution, each on its own machine with its own
    /// key. The signature is appended to `signed-release.json`; a release is
    /// only a release once `threshold` distinct institutions have done this,
    /// and `threshold` is never less than 2.
    Sign {
        /// The release directory written by `molao release publish`.
        dir: PathBuf,
        /// File holding the Ed25519 signing key as 64 hex characters.
        ///
        /// Generate one with `openssl rand -hex 32 > signer.key`, and treat it
        /// the way the institution treats any other private key. Molao does not
        /// generate, escrow, or transmit signing keys.
        #[arg(long, value_name = "FILE")]
        key: PathBuf,
    },

    /// Fetch a release over a transport and verify it before keeping it.
    ///
    /// The bytes are checked against the manifest a quorum signed, so the
    /// transport is not part of the trust boundary: a mirror, a stranger's
    /// directory, or a USB stick are all the same to this command. A release
    /// that does not verify is not written.
    Fetch {
        /// Source release directory — a local mirror, or an HTTP mirror already
        /// mounted or synced locally.
        #[arg(long)]
        from: PathBuf,
        /// Where to write the verified release.
        #[arg(long)]
        into: PathBuf,
        /// The signer set to verify against. Supplied by you, as always.
        #[arg(long)]
        signers: PathBuf,
    },

    /// Export a release as a BitTorrent v2 `.torrent`.
    ///
    /// An export, not a client: it produces a file for tools libraries and
    /// universities already run, so a corpus can outlive this project. Nothing
    /// in Molao seeds or leeches.
    Torrent {
        /// The release directory.
        dir: PathBuf,
        /// Where to write the `.torrent`.
        #[arg(long)]
        out: PathBuf,
        /// Tracker announce URL. Omit for a trackerless (DHT) torrent.
        #[arg(long)]
        tracker: Option<String>,
    },

    /// Print the reproducibility attestation for a release directory.
    ///
    /// One line that two builders compare. If it matches, they built the same
    /// release from the same corpus with the same extractor and the same region
    /// registry; if it does not, the following lines say which input differed.
    Attest {
        /// The release directory.
        dir: PathBuf,
    },
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

    let cli = Cli::parse();

    // Before anything reads a court code. An extractor caches the patterns its
    // profile compiles to, so the registry has to be settled before the first
    // one is built, not swapped underneath it later.
    install_profiles(cli.profiles.as_deref())?;

    match cli.command {
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

        Command::Verify {
            release,
            signers,
            db,
            previous,
        } => run_verify(&release, &signers, previous.as_deref(), db.as_deref()),

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

        Command::Release { command } => run_release(command),

        Command::Fetch {
            url,
            dry_run,
            ignore_content_signals,
            db,
        } => run_fetch(&url, dry_run, signal_policy(ignore_content_signals), &db),

        Command::Crawl {
            target,
            court,
            limit,
            dry_run,
            ignore_content_signals,
            db,
        } => run_crawl(
            &target,
            court.as_deref(),
            limit,
            dry_run,
            signal_policy(ignore_content_signals),
            &db,
        ),

        Command::Sources => {
            run_sources();
            Ok(())
        }

        Command::Regions => {
            run_regions();
            Ok(())
        }
    }
}

/// Load `--profiles <DIR>` and install it for the process.
///
/// Fail-closed, and loud on success: an operator who pointed at the wrong
/// directory must find out here, not by noticing months later that a graph was
/// built against the compiled-in registry. An empty directory is an error for
/// the same reason — silently falling back to the built-ins would be exactly
/// the failure that is hardest to see.
fn install_profiles(dir: Option<&std::path::Path>) -> Result<()> {
    use molao_core::region;

    let Some(dir) = dir else { return Ok(()) };
    let set = region::ProfileSet::load_dir(dir)
        .with_context(|| format!("loading region profiles from {}", dir.display()))?;
    if set.is_empty() {
        return Err(anyhow!(
            "no *.toml region profiles in {} — check the path, or drop the flag to use the \
             compiled-in profiles",
            dir.display()
        ));
    }
    for loaded in set.iter() {
        let p = loaded.profile;
        println!(
            "loaded region profile {} ({} court(s), {} series) from {}",
            p.code,
            p.courts.len(),
            p.series.len(),
            loaded.path.display()
        );
    }
    region::install(set)?;
    Ok(())
}

/// `molao regions` — every profile this invocation resolves, and its origin.
fn run_regions() {
    use molao_core::region;

    let installed = region::installed();
    println!("Region profiles this node resolves (see docs/COURTS.md):\n");
    println!(
        "  {:<8} {:<8} {:>6} {:>6}  {:<16} SOURCE",
        "CODE", "ORIGIN", "COURTS", "SERIES", "FINGERPRINT"
    );

    let mut shadowed = 0usize;
    if let Some(set) = installed {
        for loaded in set.iter() {
            let p = loaded.profile;
            if region::builtin(p.code).is_some() {
                shadowed += 1;
            }
            print_region_row(p, "loaded", &loaded.path.display().to_string());
        }
    }
    for p in region::all_builtin() {
        // A built-in whose code was supplied from disk is not what this node
        // uses; listing it as if it were would be the whole defect this command
        // exists to make visible.
        if installed.is_some_and(|s| s.get(p.code).is_some()) {
            continue;
        }
        print_region_row(p, "built-in", p.name);
    }

    println!();
    match installed {
        None => println!(
            "No profiles were loaded from disk; every profile above is compiled in.\n\
             Pass --profiles <DIR> to load your own — see profiles/ in the repository."
        ),
        Some(set) => {
            let fallback = region::all_builtin().len() - shadowed;
            println!(
                "{} profile(s) loaded from disk; {shadowed} shadow a compiled-in profile of the \
                 same code.\n{fallback} compiled-in profile(s) remain as the fallback.",
                set.len()
            );
        }
    }
    println!(
        "A citation graph is reproducible from the extractor version ({}) together with the\n\
         fingerprints above — the first pins the grammar, the second pins the registry.",
        molao_cite::EXTRACTOR_VERSION
    );
}

fn print_region_row(p: &molao_core::RegionProfile, origin: &str, source: &str) {
    let fp = p.fingerprint();
    println!(
        "  {:<8} {:<8} {:>6} {:>6}  {:<16} {source}",
        p.code,
        origin,
        p.courts.len(),
        p.series.len(),
        &fp[..16]
    );
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

/// `molao verify` — every step, printed one per line.
///
/// The exit code is the whole point of the command in a script, so it is
/// derived from the report rather than from a summary line someone might later
/// edit: 0 only when every step passed, 1 when one failed, 2 when the run was
/// incomplete.
fn run_verify(
    release: &std::path::Path,
    signers: &std::path::Path,
    previous: Option<&std::path::Path>,
    db: Option<&std::path::Path>,
) -> Result<()> {
    let report = verify::verify_files(release, signers, previous, db)?;
    // A report missing a step would understate what was left unchecked. Refuse
    // to print one rather than print a narrower check under a wider name.
    report.check_shape()?;

    println!("release {}\n", report.release);
    for step in &report.steps {
        println!(
            "  {}  {}  {:<19}  {}",
            step.status.label(),
            step.number,
            step.name,
            step.detail
        );
        if let Some(message) = step.status.message() {
            println!("              {message}");
        }
    }
    println!();

    match report.outcome() {
        verify::Outcome::Verified => {
            println!(
                "OK  release {} — all {} step(s) passed",
                report.release,
                verify::STEP_COUNT
            );
        }
        verify::Outcome::Failed => {
            eprintln!(
                "FAILED  release {} — {} of {} step(s) passed",
                report.release,
                report.passed(),
                verify::STEP_COUNT
            );
        }
        verify::Outcome::Incomplete => {
            eprintln!(
                "INCOMPLETE  release {} — {} of {} step(s) ran; this release has NOT been \
                 fully verified",
                report.release,
                report.passed(),
                verify::STEP_COUNT
            );
        }
    }
    println!("this verifies bytes and signatures — not that the law is correctly stated");
    println!(
        "step 1 also needs a human: compare the signer-set fingerprint above against the set \
         the signing organisations published"
    );

    let code = report.outcome().exit_code();
    if code != 0 {
        std::process::exit(code);
    }
    Ok(())
}

/// Handle `molao release …` — the commands that wire `molao-dist` in.
fn run_release(command: ReleaseCommand) -> Result<()> {
    match command {
        ReleaseCommand::Publish {
            db,
            out,
            release,
            previous,
            created_at,
        } => run_release_publish(&db, &out, release, previous, &created_at),
        ReleaseCommand::Sign { dir, key } => run_release_sign(&dir, &key),
        ReleaseCommand::Fetch {
            from,
            into,
            signers,
        } => run_release_fetch(&from, &into, &signers),
        ReleaseCommand::Torrent { dir, out, tracker } => {
            run_release_torrent(&dir, &out, tracker.as_deref())
        }
        ReleaseCommand::Attest { dir } => run_release_attest(&dir),
    }
}

/// Everything a release directory needs, read back off disk.
fn read_release_dir(
    dir: &std::path::Path,
) -> Result<(molao_dist::FileIndex, BTreeMap<String, Vec<u8>>)> {
    let index = molao_dist::layout::read_index(dir)
        .with_context(|| format!("reading {}/index.json", dir.display()))?;
    let mut blobs = BTreeMap::new();
    for entry in &index.files {
        let bytes = molao_dist::layout::read_blob(dir, &entry.hash)
            .with_context(|| format!("reading blob {}", entry.hash))?;
        blobs.insert(entry.hash.clone(), bytes);
    }
    Ok((index, blobs))
}

fn run_release_publish(
    db: &std::path::Path,
    out: &std::path::Path,
    release: u64,
    previous: Option<String>,
    created_at: &str,
) -> Result<()> {
    let signers_note = "a release is not a release until a quorum has signed it";
    let corpus = open(db)?;

    // Documents, re-hashed on the way in. Packaging a corpus whose stored text
    // no longer matches its ids would mint a release nobody can verify.
    let mut documents = Vec::new();
    for node in corpus.nodes().context("listing judgments")? {
        let id: molao_core::doc::DocId = node.id.parse()?;
        let judgment = corpus
            .judgment(&id)?
            .ok_or_else(|| anyhow!("judgment {id} is listed but cannot be read"))?;
        let text = judgment.canonical_text();
        if molao_core::doc::DocId::of_canonical(&text) != id {
            return Err(anyhow!(
                "judgment {id} does not hash to its own stored text — run \
                 `molao verify … --db {}` before publishing",
                db.display()
            ));
        }
        documents.push(molao_dist::DocumentInput {
            id,
            bytes: text.into_bytes(),
        });
    }

    // The graph is re-extracted, not read out of the citation table: a release
    // must ship the graph the pinned extractor produces from the text it also
    // ships, not whatever rows happen to be in the database.
    let edges = verify::reextract_edges(&corpus).context("re-extracting the citation graph")?;

    let input = molao_dist::CorpusInput {
        documents,
        graph: molao_dist::GraphInput { edges },
        release,
        previous,
        created_at: created_at.to_string(),
        extractor_version: molao_cite::EXTRACTOR_VERSION.to_string(),
        signer_set: read_signer_set_fingerprint()?,
    };
    let packaged = molao_dist::pack(&input).map_err(|e| anyhow!("packaging the release: {e}"))?;
    packaged
        .verify_integrity()
        .map_err(|e| anyhow!("the release this build produced does not verify: {e}"))?;
    packaged
        .write_to(out)
        .with_context(|| format!("writing the release to {}", out.display()))?;

    println!("wrote release {} to {}", release, out.display());
    println!("  documents      {}", packaged.manifest.doc_count);
    println!("  corpus root    {}", packaged.manifest.corpus_root);
    println!("  graph root     {}", packaged.manifest.graph_root);
    println!("  extractor      {}", packaged.manifest.extractor_version);
    println!("  signer set     {}", packaged.manifest.signer_set);
    println!("  manifest hash  {}", packaged.manifest.hash());
    println!();
    println!("this manifest is UNSIGNED — {signers_note}");
    println!(
        "each signing institution now runs `molao release sign {}` on its own machine",
        out.display()
    );
    Ok(())
}

/// The signer set a publish is bound to.
///
/// Read from `MOLAO_SIGNER_SET`, a path to the signer-set JSON. It is required:
/// the fingerprint is inside the manifest's signing bytes, so it has to be
/// decided before there is anything to sign, and defaulting it to "no set"
/// would produce releases that can never verify against any real one.
fn read_signer_set_fingerprint() -> Result<String> {
    let path = std::env::var("MOLAO_SIGNER_SET").map_err(|_| {
        anyhow!(
            "set MOLAO_SIGNER_SET to the signer-set JSON this release will be signed under.\n\
             The manifest names that set (by fingerprint, never by listing it), and every \
             signature covers the name — so it has to be chosen before packaging, not after."
        )
    })?;
    let text =
        std::fs::read_to_string(&path).with_context(|| format!("reading signer set {path}"))?;
    let set: molao_core::SignerSet =
        serde_json::from_str(&text).with_context(|| format!("parsing signer set {path}"))?;
    // Refuse to package against a set that could never deliver a quorum, here
    // rather than at signing time — see SignerSet::validate.
    set.validate()
        .map_err(|e| anyhow!("the signer set at {path} is not usable: {e}"))?;
    Ok(set.fingerprint())
}

fn run_release_sign(dir: &std::path::Path, key: &std::path::Path) -> Result<()> {
    use ed25519_dalek::{Signer as _, SigningKey};

    let manifest = molao_dist::layout::read_manifest(dir)
        .with_context(|| format!("reading {}/manifest.json", dir.display()))?;

    let key_text = std::fs::read_to_string(key)
        .with_context(|| format!("reading signing key {}", key.display()))?;
    let key_bytes: [u8; 32] = hex::decode(key_text.trim())
        .map_err(|_| anyhow!("the signing key must be 64 hex characters"))?
        .try_into()
        .map_err(|_| anyhow!("the signing key must be 32 bytes (64 hex characters)"))?;
    let sk = SigningKey::from_bytes(&key_bytes);
    let public = hex::encode(sk.verifying_key().to_bytes());

    let mut signed = match molao_dist::layout::read_signed_release(dir) {
        Ok(existing) => {
            // Signing a different manifest into the same file would produce a
            // release whose signatures cover two different things.
            if existing.manifest != manifest {
                return Err(anyhow!(
                    "{}/signed-release.json is for a different manifest than \
                     {}/manifest.json — repackage rather than mixing them",
                    dir.display(),
                    dir.display()
                ));
            }
            existing
        }
        Err(_) => molao_core::SignedRelease {
            manifest: manifest.clone(),
            signatures: Vec::new(),
        },
    };

    // Re-signing with the same key replaces rather than appends: one signer,
    // one vote, and a duplicate entry would only ever confuse a reader.
    signed.signatures.retain(|s| s.key != public);
    signed
        .signatures
        .push(molao_core::release::ManifestSignature {
            key: public.clone(),
            signature: hex::encode(sk.sign(&manifest.signing_bytes()).to_bytes()),
        });
    molao_dist::layout::write_signed_release(dir, &signed)
        .with_context(|| format!("writing {}/signed-release.json", dir.display()))?;

    println!("signed release {} as {}", manifest.release, public);
    println!("  manifest hash  {}", manifest.hash());
    println!("  signer set     {}", manifest.signer_set);
    println!("  signatures now {}", signed.signatures.len());
    println!();
    println!(
        "a release needs at least two distinct institutions. This tool counts signatures; it \
         cannot tell you whether the keys behind them are independent, and that is the part \
         that matters."
    );
    Ok(())
}

fn run_release_fetch(
    from: &std::path::Path,
    into: &std::path::Path,
    signers: &std::path::Path,
) -> Result<()> {
    use molao_dist::transport::fs::FsTransport;
    use molao_dist::Transport as _;

    let signers_text = std::fs::read_to_string(signers)
        .with_context(|| format!("reading signer set {}", signers.display()))?;
    let signer_set: molao_core::SignerSet =
        serde_json::from_str(&signers_text).context("parsing the signer set")?;

    let transport = FsTransport::new(from);
    let signed = transport
        .fetch_signed_release()
        .with_context(|| format!("fetching the signed release from {}", from.display()))?;
    let index = transport
        .fetch_index()
        .with_context(|| format!("fetching the file index from {}", from.display()))?;

    // Fetch once, into memory, then verify against what was actually fetched —
    // never re-fetch for the write, or the bytes verified and the bytes kept
    // could differ.
    let mut blobs: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    for entry in &index.files {
        match transport.fetch_blob(&entry.hash) {
            Ok(bytes) => {
                blobs.insert(entry.hash.clone(), bytes);
            }
            // A missing blob is a verification failure, not a fetch error: it
            // is exactly what an incomplete or hostile mirror looks like.
            Err(e) => tracing::debug!(hash = %entry.hash, error = %e, "blob not available"),
        }
    }

    let verified =
        molao_dist::verify_received(&signed, &signer_set, &index, |h| blobs.get(h).cloned())
            .map_err(|e| anyhow!("this release does not verify and was NOT kept: {e}"))?;

    for (hash, bytes) in &blobs {
        molao_dist::layout::write_blob(into, hash, bytes)
            .with_context(|| format!("writing blob {hash}"))?;
    }
    molao_dist::layout::write_index(into, &index)?;
    molao_dist::layout::write_manifest(into, &verified.manifest)?;
    molao_dist::layout::write_signed_release(into, &signed)?;

    println!(
        "fetched and verified release {} into {}",
        verified.manifest.release,
        into.display()
    );
    println!("  files          {}", index.files.len());
    println!("  documents      {}", verified.manifest.doc_count);
    println!("  signatures     {}", verified.signatures);
    println!("  corpus root    {}", verified.manifest.corpus_root);
    println!("  graph root     {}", verified.manifest.graph_root);
    println!();
    println!(
        "the transport was not trusted: every byte was re-hashed and every signature re-checked."
    );
    println!(
        "this checked the release's own integrity. To check it against a corpus you hold, and \
         to re-run the pinned extractor, use `molao verify`."
    );
    Ok(())
}

/// Piece length for the torrent export: 256 KiB, the usual default for a file
/// set of this shape and a power of two as BEP 52 requires.
const TORRENT_PIECE_LENGTH: u32 = 256 * 1024;

fn run_release_torrent(
    dir: &std::path::Path,
    out: &std::path::Path,
    tracker: Option<&str>,
) -> Result<()> {
    let manifest = molao_dist::layout::read_manifest(dir)
        .with_context(|| format!("reading {}/manifest.json", dir.display()))?;
    let (index, blobs) = read_release_dir(dir)?;
    let name = format!("molao-release-{}", manifest.release);
    let bytes = molao_dist::torrent::export_release(&name, TORRENT_PIECE_LENGTH, &index, &blobs)
        .map_err(|e| anyhow!("exporting a torrent: {e}"))?;
    std::fs::write(out, &bytes).with_context(|| format!("writing {}", out.display()))?;

    let info_hash = molao_dist::torrent::info_hash(&bytes)
        .map_err(|e| anyhow!("computing the info hash: {e}"))?;
    println!("wrote {} ({} bytes)", out.display(), bytes.len());
    println!("  files          {}", index.files.len());
    println!("  v2 info hash   {}", hex::encode(info_hash));
    match tracker {
        Some(url) => println!(
            "  tracker        {url} — add it with your client; the export itself is trackerless \
             so the file stays byte-identical between builders"
        ),
        None => println!("  tracker        none (DHT only)"),
    }
    println!();
    println!("this is an export. Molao does not seed, leech, or run a torrent client.");
    Ok(())
}

/// The domain-separated attestation over everything that determines a release.
const ATTESTATION_DOMAIN: &[u8] = b"molao-build-attestation-v1\n";

fn run_release_attest(dir: &std::path::Path) -> Result<()> {
    let manifest = molao_dist::layout::read_manifest(dir)
        .with_context(|| format!("reading {}/manifest.json", dir.display()))?;
    let (index, blobs) = read_release_dir(dir)?;

    // Recompute rather than report: an attestation over a release directory
    // nobody checked would agree with any other unchecked directory built by
    // the same buggy code.
    molao_dist::verify_file_set(&manifest, &index, |h| blobs.get(h).cloned())
        .map_err(|e| anyhow!("this release directory does not verify: {e}"))?;

    let profile = molao_core::region::default_profile();
    let mut h = blake3::Hasher::new();
    let mut field = |bytes: &[u8]| {
        h.update(&(bytes.len() as u64).to_be_bytes());
        h.update(bytes);
    };
    field(ATTESTATION_DOMAIN);
    field(manifest.hash().as_bytes());
    field(molao_core::VERSION.as_bytes());
    field(molao_cite::EXTRACTOR_VERSION.as_bytes());
    field(profile.code.as_bytes());
    field(profile.fingerprint().as_bytes());
    for entry in &index.files {
        field(entry.hash.as_bytes());
        field(entry.path.as_bytes());
    }
    let attestation = hex::encode(h.finalize().as_bytes());

    println!("release        {}", manifest.release);
    println!("manifest hash  {}", manifest.hash());
    println!("corpus root    {}", manifest.corpus_root);
    println!("graph root     {}", manifest.graph_root);
    println!("doc count      {}", manifest.doc_count);
    println!("signer set     {}", manifest.signer_set);
    println!("created at     {}", manifest.created_at);
    println!("extractor      {}", manifest.extractor_version);
    println!("core version   {}", molao_core::VERSION);
    println!("region profile {} {}", profile.code, profile.fingerprint());
    println!("files          {}", index.files.len());
    println!();
    println!("attestation    {attestation}");
    println!();
    println!(
        "Two builders comparing that one line have compared every input above. If it differs, \
         the lines above say which one did."
    );
    println!(
        "It attests that two builds agree — not that either is correct, and not that the corpus \
         they were built from is complete."
    );
    Ok(())
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
/// built; a prefix this node resolves no profile for falls back to the corpus
/// default.
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
        // when it names a profile this node resolves — one loaded from
        // `--profiles`, else a compiled-in one — and otherwise let the corpus
        // default apply.
        let region = judgment.court.get(..2).filter(|p| {
            let up = p.to_uppercase();
            molao_core::region::resolve(&up).is_some()
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

/// `molao sources` — the crawler's registry and what each host permits.
fn run_sources() {
    use molao_ingest::peachjam::{Platform, SOURCES};
    println!("Case-law sources the crawler knows (see docs/SOURCE-MAP.md for the full map):\n");
    println!(
        "  {:<6} {:<26} {:<22} CORPUS ELIGIBILITY",
        "REGION", "SOURCE", "HOST"
    );
    for s in SOURCES {
        let platform = match s.platform {
            Platform::Peachjam => "peachjam",
            Platform::SafliiCitationOnly => "saflii",
        };
        let elig = s.eligibility();
        let mark = if elig.permits_rag() { "ok" } else { "--" };
        println!(
            "  {:<6} {:<26} {:<22} {mark} {} ({platform})",
            s.region, s.name, s.host, elig
        );
    }
    println!(
        "\nEligibility is the recorded hint; the live robots.txt is authoritative at fetch time.\n\
         Most AfricanLII hosts signal ai-input=no and are not corpus sources by default —\n\
         the corpus comes from court-direct and licensed routes. See docs/SOURCE-MAP.md."
    );
}

/// Map the CLI flag to the ingest policy, and warn loudly when it is set — an
/// override is a deliberate, on-the-record choice, never a quiet default.
fn signal_policy(ignore: bool) -> molao_ingest::SignalPolicy {
    if ignore {
        eprintln!(
            "note: --ignore-content-signals is set. Molao will ingest sources whose robots.txt\n\
             Content-Signal says ai-input=no. This is your determination that the use is within\n\
             the source's rights (public-domain law, a permission you hold). The crawler still\n\
             identifies as molao-node and still honours robots.txt Disallow/Crawl-delay.\n"
        );
        molao_ingest::SignalPolicy::Ignore
    } else {
        molao_ingest::SignalPolicy::Respect
    }
}

/// `molao fetch <url>`.
fn run_fetch(
    url: &str,
    dry_run: bool,
    signals: molao_ingest::SignalPolicy,
    db: &std::path::Path,
) -> Result<()> {
    if url.to_ascii_lowercase().contains("saflii") {
        return Err(anyhow!(
            "SAFLII is a citation-only target and is never fetched for the corpus (see docs/SOURCES.md)"
        ));
    }
    let client = peachjam_client();
    let sleeper = molao_ingest::RealSleeper;
    let fj = molao_ingest::fetch_judgment(&client, url, CRAWL_DELAY, &sleeper, signals)
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
    signals: molao_ingest::SignalPolicy,
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
        match molao_ingest::fetch_judgment(&client, url, CRAWL_DELAY, &sleeper, signals) {
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
            vec![
                "serve", "ingest", "demo", "verify", "release", "stats", "index", "fetch",
                "crawl", "sources", "regions"
            ],
            "a subcommand was added or renamed without updating the docs, and \
             TOP_LEVEL_COMMANDS in tests/cli.rs"
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
