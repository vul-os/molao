//! Errors the index can return.
//!
//! The split mirrors `molao-corpus`: failures caused by *input* (a query, a
//! descriptor id a client asked for, an embedder endpoint that misbehaved) are
//! distinct variants so the node can answer them without a 500, and only a
//! genuine storage fault is treated as internal.

/// Anything that can go wrong building or querying an index.
#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    /// The underlying SQLite call failed. Exceptional: disk, or a bug here.
    #[error("index database error: {0}")]
    Db(#[from] rusqlite::Error),

    /// A stored or produced JSON value did not parse.
    #[error("malformed index JSON: {0}")]
    Json(#[from] serde_json::Error),

    /// Reading the corpus that feeds the index failed.
    #[error("corpus error: {0}")]
    Corpus(#[from] molao_corpus::CorpusError),

    /// The embedder produced nothing usable, or disagreed with itself about the
    /// vector dimension. A model that returns vectors of two different lengths
    /// cannot be indexed, and pretending otherwise would corrupt the space.
    #[error("embedder error: {0}")]
    Embed(String),

    /// A query vector's dimension does not match the descriptor's.
    ///
    /// This is the guard that stops a query embedded in one model's space from
    /// being scored against another model's vectors — which would return
    /// confident, wrong results. The caller must rebuild or pick the right
    /// descriptor, never silently search the wrong space.
    #[error("query vector has dimension {got}, but index descriptor {descriptor} is dimension {expected}")]
    DimMismatch {
        /// Descriptor id whose space was requested.
        descriptor: String,
        /// Dimension the descriptor was built at.
        expected: usize,
        /// Dimension of the query vector offered.
        got: usize,
    },

    /// No index with the requested descriptor id is present.
    #[error("no index with descriptor id {0}")]
    NoSuchDescriptor(String),

    /// The HTTP embedder could not reach or parse its endpoint. Never hit in a
    /// default build or in tests — real embeddings need an operator-supplied
    /// model, and this is what says so when one is misconfigured.
    #[error("http embedder: {0}")]
    Http(String),
}

/// Convenience alias used throughout the crate.
pub type Result<T> = std::result::Result<T, IndexError>;
