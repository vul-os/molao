//! # molao
//!
//! A node in the Molao commons: it holds a corpus of case law, serves it over a
//! read-only HTTP API with the web interface embedded, and verifies
//! threshold-signed releases.
//!
//! ## Running it
//!
//! ```text
//! molao demo                  # seed a demo corpus and serve it — no setup
//! molao serve --db molao.db   # serve a corpus you have ingested into
//! molao ingest ./judgments/   # ingest a file or directory
//! molao stats --db molao.db   # what this node holds
//! molao verify release.json --signers signers.json
//! ```
//!
//! Every one of those commands works from a clean clone. Nothing here reaches
//! the network, at all, ever — a node with a corpus on disk works with no peers
//! and no internet.
//!
//! ## Honest status
//!
//! - There is **no bundled corpus**. A node starts empty; `molao demo` seeds
//!   *fictional* judgments so the interface has something to show.
//! - **Treatment attestations** (followed / distinguished / overruled) are
//!   designed and **not built**.
//! - **P2P distribution** is designed and **not built**. Releases are files.
//! - **Semantic search is never part of a release.** Embeddings are not
//!   reproducible across hardware, so they cannot be verified by recomputation,
//!   and an unverifiable index that quietly steers retrieval is worse than an
//!   unverifiable document. What a node *may* do is build its **own** local
//!   index over already-verified text — an unsigned, model-tagged,
//!   rebuildable cache, never signed and never something a peer must trust. That
//!   is [`molao_index`], surfaced at `/api/rag/search`. The node ships **no
//!   embedding model**: `molao demo` uses a deterministic fake embedder so the
//!   pipeline works offline, and real semantic search needs an
//!   operator-supplied model. See `docs/RAG.md` and `docs/THREAT-MODEL.md`.

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]

pub mod api;
pub mod assets;
pub mod demo;
pub mod verify;
