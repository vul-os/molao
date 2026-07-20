//! The index descriptor — what makes "an index for a model" a checkable claim.
//!
//! An index is not just a pile of vectors. It is vectors produced by *a
//! particular embedding model, at a particular dimension, with a particular
//! chunking*, over *a particular corpus*. Two of those vectors are only
//! comparable if every one of those things matches. The [`IndexDescriptor`]
//! records them all, so that:
//!
//! - a node can refuse to search a query embedded by model A against vectors
//!   built by model B (see [`crate::IndexError::DimMismatch`] and the space
//!   check in [`crate::store`]);
//! - several indexes for several models can coexist in one file, keyed by
//!   [`IndexDescriptor::descriptor_id`];
//! - a node can tell a stale index from a current one by comparing the recorded
//!   `corpus_root` against the corpus it actually holds;
//! - a peer offered a shared cache can read the descriptor and decide to rebuild
//!   and check rather than trust — which is the only way an unsigned index is
//!   ever allowed to travel between nodes.
//!
//! ## Why `corpus_root` is recorded but not part of the id
//!
//! The `descriptor_id` identifies the *model space*: embedder, version,
//! dimension, metric, quantization, normalization, and chunker. It deliberately
//! excludes `corpus_root`. If the corpus changes, the right thing is to rebuild
//! *the same* descriptor's vectors against the new corpus — not to mint a new,
//! orphaned index every time a judgment is added. So the corpus a build was made
//! from is *recorded* (for staleness) but does not change the model's identity.
//! Two nodes running the same model agree on its `descriptor_id` whether or not
//! their corpora are in sync.

use serde::{Deserialize, Serialize};

/// Distance metric. Only cosine is implemented; the field exists so a stored
/// index names its metric rather than leaving a reader to assume one.
pub const METRIC_COSINE: &str = "cosine";

/// The everything-is-f32 "quantization" — i.e. none. Named so that if a future
/// build quantizes vectors, old and new indexes are distinguishable by id.
pub const QUANTIZATION_NONE: &str = "f32";

/// Unit L2 normalization: vectors are scaled to length 1, so cosine similarity
/// is a plain dot product. The build enforces this regardless of embedder.
pub const NORMALIZATION_UNIT_L2: &str = "unit-l2";

/// The self-describing header of an index.
///
/// Serialized next to the vectors (as a row in `index_descriptors`) and returned
/// on every `/api/rag/search` response, so a client always knows which model
/// produced the results it is reading.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IndexDescriptor {
    /// Stable identifier of the embedding model, e.g. `"fake-hash"` or
    /// `"openai-compat"`. Distinguishes families of embedder.
    pub embedder_id: String,
    /// A version/weights tag for the model. For the deterministic fake embedder
    /// this is a real version (`"v1"`); for a remote model it is the model name
    /// the operator asked for. See the honesty note in `docs/RAG.md`: for a
    /// remote model this is a *label*, not a cryptographic hash of the weights,
    /// because a node cannot see another party's weights.
    pub model_version: String,
    /// Vector dimension, taken from the embeddings the model actually produced.
    pub dim: usize,
    /// Distance metric. Always [`METRIC_COSINE`] today.
    pub metric: String,
    /// Quantization. Always [`QUANTIZATION_NONE`] today.
    pub quantization: String,
    /// Normalization applied to every vector. Always [`NORMALIZATION_UNIT_L2`].
    pub normalization: String,
    /// Identifier of the chunker that split judgments into indexable units.
    pub chunker_id: String,
    /// Human-readable parameters of the chunker, for reproducibility.
    pub chunker_params: String,
    /// The `corpus_root` of the corpus this index was built from. Recorded for
    /// staleness detection; **not** part of [`Self::descriptor_id`].
    pub corpus_root: String,
}

impl IndexDescriptor {
    /// The model-space identity of this index, as a hex hash.
    ///
    /// Covers embedder, version, dimension, metric, quantization, normalization,
    /// and chunker — everything that determines whether two vectors are
    /// comparable — and deliberately **excludes** `corpus_root`. Domain-separated
    /// and length-prefixed so the id cannot collide with a corpus or graph root
    /// and cannot be shifted by moving a boundary between two fields.
    pub fn descriptor_id(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update(b"molao-index-descriptor-v1\n");
        for field in [
            self.embedder_id.as_str(),
            self.model_version.as_str(),
            self.metric.as_str(),
            self.quantization.as_str(),
            self.normalization.as_str(),
            self.chunker_id.as_str(),
            self.chunker_params.as_str(),
        ] {
            hasher.update(&(field.len() as u64).to_be_bytes());
            hasher.update(field.as_bytes());
        }
        hasher.update(&(self.dim as u64).to_be_bytes());
        hex::encode(hasher.finalize().as_bytes())
    }

    /// Is this index built from a different corpus than the one given?
    ///
    /// A `true` here is the signal to rebuild before trusting a result: the
    /// vectors describe a corpus that no longer matches what the node serves.
    pub fn is_stale_against(&self, current_corpus_root: &str) -> bool {
        self.corpus_root != current_corpus_root
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn descriptor() -> IndexDescriptor {
        IndexDescriptor {
            embedder_id: "fake-hash".into(),
            model_version: "v1".into(),
            dim: 256,
            metric: METRIC_COSINE.into(),
            quantization: QUANTIZATION_NONE.into(),
            normalization: NORMALIZATION_UNIT_L2.into(),
            chunker_id: "paragraph-v1".into(),
            chunker_params: "one-chunk-per-paragraph".into(),
            corpus_root: "aa".repeat(32),
        }
    }

    #[test]
    fn descriptor_id_is_stable() {
        assert_eq!(descriptor().descriptor_id(), descriptor().descriptor_id());
    }

    #[test]
    fn descriptor_id_ignores_the_corpus_root() {
        // The whole point: rebuilding the same model over a changed corpus keeps
        // the same descriptor id, so the index is updated in place, not orphaned.
        let mut a = descriptor();
        let mut b = descriptor();
        a.corpus_root = "aa".repeat(32);
        b.corpus_root = "bb".repeat(32);
        assert_eq!(a.descriptor_id(), b.descriptor_id());
        // ...but they differ on staleness.
        assert!(a.is_stale_against(&b.corpus_root));
        assert!(!a.is_stale_against(&a.corpus_root));
    }

    #[test]
    fn descriptor_id_changes_with_any_model_field() {
        let base = descriptor().descriptor_id();
        let mut d = descriptor();
        d.dim = 128;
        assert_ne!(base, d.descriptor_id(), "dimension must change the id");
        let mut d = descriptor();
        d.embedder_id = "openai-compat".into();
        assert_ne!(base, d.descriptor_id(), "embedder must change the id");
        let mut d = descriptor();
        d.model_version = "v2".into();
        assert_ne!(base, d.descriptor_id(), "version must change the id");
        let mut d = descriptor();
        d.chunker_id = "paragraph-v2".into();
        assert_ne!(base, d.descriptor_id(), "chunker must change the id");
    }

    #[test]
    fn a_shifted_field_boundary_does_not_collide() {
        // Length-prefixing means moving a character across a field boundary
        // cannot produce the same id.
        let mut a = descriptor();
        let mut b = descriptor();
        a.embedder_id = "ab".into();
        a.model_version = "c".into();
        b.embedder_id = "a".into();
        b.model_version = "bc".into();
        assert_ne!(a.descriptor_id(), b.descriptor_id());
    }
}
