//! # molao-index
//!
//! A local, rebuildable **hybrid search index** for a Molao corpus: FTS5 keyword
//! search and exact-cosine vector search over paragraph chunks, in a single
//! sidecar SQLite file, fused by Reciprocal Rank Fusion.
//!
//! ## What this is, and is not
//!
//! This is the semantic-search layer that `molao-core` and the release format
//! deliberately refuse to sign. It exists **only** as an unsigned, rebuildable
//! cache. The corpus stays the verifiable artifact; an index is something a node
//! builds for itself over already-verified text, and — if shared at all — is
//! shared as a cache a peer can rebuild and check, never as part of a release.
//! See `docs/RAG.md` and `docs/THREAT-MODEL.md`.
//!
//! Every index carries an [`IndexDescriptor`]: the embedding model, its version,
//! dimension, metric, quantization, normalization, the chunker, and the corpus
//! it was built from. A node uses the descriptor to pick the right index for a
//! query, to refuse a query embedded in the wrong space, to notice when an index
//! has gone stale against a changed corpus, and to tell a peer exactly what to
//! rebuild in order to check a shared cache.
//!
//! ## No model ships here
//!
//! The crate defines an [`Embedder`] trait and provides a deterministic,
//! offline [`FakeEmbedder`] (so `molao demo` and every test work with no model
//! and no network) and a thin [`HttpEmbedder`] for an operator-supplied,
//! OpenAI-compatible endpoint. Real semantic RAG requires the operator to supply
//! a model; the node ships none.
//!
//! ## Shape
//!
//! ```no_run
//! use molao_index::{Index, FakeEmbedder};
//! use molao_corpus::Corpus;
//!
//! let corpus = Corpus::open("molao.db")?;
//! let mut index = Index::open(Index::sidecar_path("molao.db".as_ref()))?;
//! let descriptor = index.build_from_corpus(&corpus, &FakeEmbedder::new(FakeEmbedder::DEFAULT_DIM))?;
//! let embedder = FakeEmbedder::new(descriptor.dim);
//! # use molao_index::Embedder;
//! let qv = &embedder.embed(&["eviction of occupiers".to_string()])?[0];
//! let hits = index.search(&descriptor.descriptor_id(), "eviction of occupiers", Some(qv), 5)?;
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]
#![warn(missing_docs)]

pub mod chunk;
pub mod descriptor;
pub mod embed;
pub mod error;
pub mod store;

pub use chunk::{chunk_paragraphs, Chunk, CHUNKER_ID, CHUNKER_PARAMS};
pub use descriptor::{IndexDescriptor, METRIC_COSINE, NORMALIZATION_UNIT_L2, QUANTIZATION_NONE};
pub use embed::{
    normalize, query_embedder, Embedder, EmbedderFragment, FakeEmbedder, HttpConfig, HttpEmbedder,
};
pub use error::{IndexError, Result};
pub use store::{Index, RagHit, RagResult, RetrievalMode, StoredDescriptor};
