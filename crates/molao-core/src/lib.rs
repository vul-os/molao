//! # molao-core
//!
//! Shared types for Molao: the free, decentralized commons of South African
//! law.
//!
//! This crate owns the things every other crate and every node must agree on
//! exactly:
//!
//! - [`doc`] — how a judgment is identified ([`DocId`], the BLAKE3 hash of its
//!   canonical text), what a structured judgment looks like, and how provenance
//!   is recorded.
//! - [`court`] — the South African court registry and the hierarchy that gives
//!   authority ranking its meaning.
//! - [`release`] — threshold-signed corpus releases. No single party can
//!   publish one.
//!
//! ## Design commitment
//!
//! Everything in a release is **verifiable by recomputation**. Document ids are
//! hashes of canonical text; the citation graph is produced by a pinned,
//! versioned extractor that any node can re-run to get byte-identical output.
//!
//! Embeddings deliberately are **not** part of a release. Floating-point
//! inference is not reproducible across hardware, so a contributed vector index
//! could never be verified — and a poisoned index is worse than a poisoned
//! document, because the text stays correct while retrieval quietly steers.
//! Nodes build their own indexes locally. See `docs/THREAT-MODEL.md`.
//!
//! ## No network dependency
//!
//! Nothing here reaches the network. A node with a corpus on disk works with no
//! peers, no relay, and no internet — the P2P layer distributes releases faster,
//! it is never required to read the law.

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]

pub mod court;
pub mod doc;
pub mod release;

pub use court::{Court, Tier};
pub use doc::{canonicalise, DocId, Judgment, Paragraph, Provenance, ProvenanceClass};
pub use release::{Manifest, SignedRelease, Signer, SignerSet};

/// Version of this crate, surfaced in release manifests and the node's
/// `/api/version` so a reader can tell which code produced an artifact.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
