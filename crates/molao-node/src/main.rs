//! The `molao` command-line entry point.
//!
//! Everything substantive lives in the library (`molao_node`); this file is the
//! CLI surface and the process lifecycle. Keeping them apart is what lets the
//! integration tests drive the real router rather than a copy of it.

#![forbid(unsafe_code)]

use molao_node::{api, demo, verify};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use molao_corpus::Corpus;
use molao_graph::Graph;
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
            run_server(addr, api::AppState::new(corpus)?)
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
            vec!["serve", "ingest", "demo", "verify", "stats"],
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
