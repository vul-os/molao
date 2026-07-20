//! Errors the store can return.
//!
//! Everything that can fail because of *input* — a malformed ingest file, an
//! unparseable id, a query full of FTS5 operators — is a distinct variant, so
//! the node can map it to a 4xx rather than a 500. The spec is explicit that
//! user input must never produce a 500; that promise is only keepable if the
//! store distinguishes "your file is broken" from "the disk is broken".

/// Anything that can go wrong reading or writing the corpus.
#[derive(Debug, thiserror::Error)]
pub enum CorpusError {
    /// The underlying SQLite call failed. Genuinely exceptional: disk, schema
    /// corruption, or a bug in this crate.
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),

    /// A JSON-lines record, or a stored JSON column, did not parse.
    #[error("malformed JSON: {0}")]
    Json(#[from] serde_json::Error),

    /// Reading or writing an ingest path failed.
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    /// An ingest record was structurally wrong.
    ///
    /// `Display` renders only the reason. The location is carried as a field so
    /// a caller that already prints one (the ingest report pairs every error
    /// with its location) does not print it twice.
    #[error("{reason}")]
    InvalidRecord {
        /// `path:line` for JSON Lines, or the path for a text file.
        location: String,
        /// What was wrong, in terms a contributor can act on.
        reason: String,
    },

    /// A judgment's stored id does not match the hash of its own text.
    ///
    /// This is the one invariant that makes a judgment from an untrusted peer
    /// safe to keep, so it is a hard error and never a warning.
    #[error("judgment {id} failed id verification: its id is not the hash of its text")]
    IdMismatch {
        /// The claimed id, hex.
        id: String,
    },

    /// The database was written by a newer version of Molao.
    ///
    /// Refusing is the safe direction: a newer schema may carry columns this
    /// build would silently drop on write.
    #[error("database schema version {found} is newer than this build supports ({supported})")]
    SchemaTooNew {
        /// Version found in the database.
        found: i64,
        /// Highest version this build knows how to write.
        supported: i64,
    },
}

/// Convenience alias used throughout the crate.
pub type Result<T> = std::result::Result<T, CorpusError>;
