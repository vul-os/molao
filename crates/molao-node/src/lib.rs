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
//! molao verify release.json --signers signers.json --db molao.db
//! molao release publish --db molao.db --out ./release --release 0 \
//!     --created-at 2026-07-20T10:00:00Z
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
//!   partly built. Signed attestations verify on the way in and again on the
//!   way out, store, group into conflicts that are shown rather than resolved,
//!   weigh against a reader-supplied trust policy, and surface at
//!   `/api/case/{id}/treatment`; `molao attest import` and `molao serve
//!   --trust` reach them from the command line. **Nobody has attested
//!   anything.** There is no authoring path, no way for attestations to reach
//!   another node, and no interface for reading them — so currency warnings
//!   remain something to check yourself.
//! - **P2P distribution** is written and **has never carried a release**.
//!   `molao release publish` / `sign` / `fetch` / `torrent` package, sign, move
//!   and export a content-addressed release, and `molao verify` checks one in
//!   seven steps. There is no public signed release for any of it to carry, and
//!   P2P is never required to read the law: a release is files, and a node with
//!   files works with no network at all.
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
