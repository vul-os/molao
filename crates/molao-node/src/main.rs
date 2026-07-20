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
    /// header-and-body plain-text format. Anything else is skipped.
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

            println!(
                "ingested {} judgment(s) from {} file(s); {} citation(s) newly resolved",
                report.inserted, report.files, report.relinked
            );

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

            if !report.errors.is_empty() {
                eprintln!("\n{} record(s) failed:", report.errors.len());
                for (location, reason) in &report.errors {
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
            vec!["serve", "ingest", "demo", "verify", "stats", "index"],
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
