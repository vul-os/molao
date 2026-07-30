//! Schema and migrations.
//!
//! Migrations are a plain ordered list of SQL steps applied inside one
//! transaction, guarded by a `schema_version` row. They run on every
//! [`Corpus::open`](crate::Corpus::open) and are idempotent: opening an
//! up-to-date database is a single `SELECT`.
//!
//! ## Why not an external migration crate
//!
//! A node must be runnable from a clean clone with no tooling, and the schema
//! ships inside the binary that reads it. A list of `&str` steps plus an
//! integer is the whole requirement; anything larger is a dependency that can
//! break an offline build for no benefit.
//!
//! ## Why the FTS index is standalone rather than external-content
//!
//! FTS5's external-content mode stores no text of its own and reads it back
//! from the base table at query time. That is the right choice when the indexed
//! text *is* a column of the base table — but a judgment's text lives in
//! [`paragraphs`], one row per paragraph, and the searchable unit is the whole
//! judgment. There is no base-table column to point at. Contentless mode
//! (`content=''`) would avoid the duplication but cannot serve `snippet()`, and
//! the API contract requires `<mark>`-tagged snippets. So the index keeps its
//! own copy of the concatenated text, and we accept roughly a doubling of text
//! bytes on disk in exchange for snippets that do not need a second query.
//!
//! The index rowid is deliberately the `judgments` rowid, which is what makes
//! the join in [`crate::search`] a primary-key lookup rather than a scan.

use crate::error::Result;
use rusqlite::Connection;

/// Schema version this build writes and understands.
pub const SCHEMA_VERSION: i64 = 2;

/// Ordered migration steps. Index `n` takes the schema from version `n` to
/// `n + 1`. **Never edit a step that has shipped** — append a new one, or
/// deployed databases and fresh ones diverge silently.
const MIGRATIONS: &[&str] = &[
    // ---- v0 -> v1: the initial schema -----------------------------------
    r#"
    CREATE TABLE judgments (
        id                  TEXT PRIMARY KEY,
        neutral_citation    TEXT,
        court               TEXT NOT NULL,
        title               TEXT NOT NULL,
        case_numbers        TEXT NOT NULL DEFAULT '[]',
        date                TEXT,
        judges              TEXT NOT NULL DEFAULT '[]',
        reported_citations  TEXT NOT NULL DEFAULT '[]',
        provenance_class    TEXT NOT NULL DEFAULT 'manual',
        authority           REAL NOT NULL DEFAULT 0.0,
        -- Jurisdiction this judgment belongs to, e.g. 'ZA'. Molao is not a
        -- South African product with other countries bolted on later: a region
        -- is a profile, and the corpus can hold several at once. The default
        -- keeps every existing caller and ingest file working unchanged.
        region              TEXT NOT NULL DEFAULT 'ZA'
    );
    CREATE INDEX idx_judgments_court  ON judgments(court);
    CREATE INDEX idx_judgments_date   ON judgments(date);
    CREATE INDEX idx_judgments_region ON judgments(region);

    CREATE TABLE paragraphs (
        doc_id  TEXT NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
        idx     INTEGER NOT NULL,
        number  TEXT,
        text    TEXT NOT NULL,
        PRIMARY KEY (doc_id, idx)
    );

    -- Three columns, and the third earns its place: `citation` holds the
    -- neutral citation, every parallel reported citation, and every case
    -- number. Looking a case up by its citation is the commonest thing a
    -- lawyer does, and without this column pasting "[2019] ZACC 11" into the
    -- search box matches nothing, because a judgment's own citation is
    -- metadata and appears nowhere in its text.
    CREATE VIRTUAL TABLE judgments_fts USING fts5(
        title,
        text,
        citation,
        tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE provenance (
        doc_id      TEXT NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
        source_url  TEXT NOT NULL,
        fetched_at  TEXT NOT NULL,
        raw_hash    TEXT NOT NULL,
        witness     TEXT NOT NULL,
        signature   TEXT NOT NULL,
        PRIMARY KEY (doc_id, witness, source_url)
    );

    CREATE TABLE citations (
        id            INTEGER PRIMARY KEY,
        from_doc      TEXT NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
        from_para     INTEGER,
        citation_key  TEXT NOT NULL,
        as_written    TEXT NOT NULL,
        canonical     TEXT NOT NULL,
        pinpoint      TEXT,
        to_doc        TEXT
    );
    CREATE INDEX idx_citations_from ON citations(from_doc);
    CREATE INDEX idx_citations_to   ON citations(to_doc);
    CREATE INDEX idx_citations_key  ON citations(citation_key);

    -- Every identifier by which a judgment can be cited, mapped onto its id.
    -- A judgment has several: its neutral citation, each parallel reported
    -- citation, and each court case number. Resolution is a lookup here, which
    -- is why a case cited by its SALR reference resolves to the same node as
    -- one cited neutrally.
    CREATE TABLE citation_keys (
        citation_key  TEXT PRIMARY KEY,
        doc_id        TEXT NOT NULL REFERENCES judgments(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_citation_keys_doc ON citation_keys(doc_id);

    -- Signed treatment attestations. See molao-graph::treatment for the
    -- vocabulary, the canonical signing bytes and the signature check, and
    -- crate::attest for this table's row access. Written only through a
    -- verifying ingest; every read path that shows a row to a reader re-checks
    -- its signature, because these rows are excluded from the release root and
    -- so carry no outer signature over them.
    CREATE TABLE treatments (
        id          INTEGER PRIMARY KEY,
        from_doc    TEXT NOT NULL,
        to_doc      TEXT NOT NULL,
        treatment   TEXT NOT NULL,
        from_para   INTEGER,
        note        TEXT,
        signer      TEXT NOT NULL,
        signature   TEXT NOT NULL,
        created_at  TEXT NOT NULL
    );
    CREATE INDEX idx_treatments_to ON treatments(to_doc);
    "#,
    // ---- v1 -> v2: attestation identity ---------------------------------
    //
    // An attestation is identified by `(signer, signature)`. Ed25519 signing is
    // deterministic, so a signer re-publishing the same claim produces the same
    // signature bytes and lands on the same row — which is what makes importing
    // an attestation bundle twice idempotent, matching the guarantee judgment
    // ingest already gives. Without this index a mirror that re-ran a bundle
    // would show a reader the same claim five times and make one signer look
    // like a chorus.
    //
    // The DELETE runs first because a unique index cannot be created over a
    // table that already violates it, and refusing to open such a corpus would
    // be worse than collapsing rows that are byte-identical anyway.
    //
    // (The v1 step above had a comment calling this table "designed, not
    // built". Only that comment was corrected when ingest landed; not one
    // character of its SQL changed, so v1 databases and fresh ones still agree.)
    r#"
    DELETE FROM treatments
     WHERE id NOT IN (SELECT MIN(id) FROM treatments GROUP BY signer, signature);
    CREATE UNIQUE INDEX idx_treatments_identity ON treatments(signer, signature);
    -- The conflict view groups by the pair being argued about.
    CREATE INDEX idx_treatments_pair ON treatments(to_doc, from_doc);
    "#,
];

/// Apply any outstanding migrations. Safe to call on every open.
pub fn migrate(conn: &Connection) -> Result<()> {
    // Foreign keys are off by default in SQLite and must be enabled per
    // connection, not per database — the ON DELETE CASCADE clauses above are
    // decorative without this.
    conn.pragma_update(None, "foreign_keys", "ON")?;
    // A node is read-heavy and often runs against a database being ingested
    // into concurrently; WAL is what makes a reader not block behind a writer.
    conn.pragma_update(None, "journal_mode", "WAL")?;

    conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);")?;

    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if current > SCHEMA_VERSION {
        return Err(crate::error::CorpusError::SchemaTooNew {
            found: current,
            supported: SCHEMA_VERSION,
        });
    }

    for (i, step) in MIGRATIONS.iter().enumerate() {
        let target = i as i64 + 1;
        if target <= current {
            continue;
        }
        conn.execute_batch("BEGIN")?;
        match conn.execute_batch(step) {
            Ok(()) => {
                conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [target])?;
                conn.execute_batch("COMMIT")?;
                tracing::debug!(version = target, "applied migration");
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(e.into());
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrating_twice_is_a_no_op() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
        let v: i64 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);
    }

    #[test]
    fn a_newer_database_is_refused_rather_than_downgraded() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (999)", [])
            .unwrap();
        assert!(matches!(
            migrate(&conn),
            Err(crate::error::CorpusError::SchemaTooNew { found: 999, .. })
        ));
    }

    /// Build a database at v1 exactly as the shipped v1 step left it, so the
    /// migration tests below exercise a real upgrade rather than a fresh
    /// install that happens to end at the same version.
    fn at_version_1() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);")
            .unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (1)", [])
            .unwrap();
        conn
    }

    fn insert_raw(conn: &Connection, signer: &str, signature: &str) {
        conn.execute(
            "INSERT INTO treatments \
               (from_doc, to_doc, treatment, signer, signature, created_at) \
             VALUES ('a', 'b', 'overruled', ?1, ?2, 't')",
            rusqlite::params![signer, signature],
        )
        .unwrap();
    }

    #[test]
    fn upgrading_a_v1_database_collapses_duplicate_attestations() {
        // A v1 corpus could hold the same claim any number of times, because
        // nothing stopped it. Upgrading must leave exactly one of each.
        let conn = at_version_1();
        for _ in 0..3 {
            insert_raw(&conn, "signer-a", "sig-1");
        }
        insert_raw(&conn, "signer-a", "sig-2");
        insert_raw(&conn, "signer-b", "sig-1");
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM treatments", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            5
        );

        migrate(&conn).unwrap();

        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM treatments", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            3,
            "only the duplicated (signer, signature) pair should collapse"
        );
        let v: i64 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 2);
    }

    #[test]
    fn a_duplicate_attestation_cannot_be_inserted_after_the_upgrade() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        insert_raw(&conn, "signer-a", "sig-1");
        // Not `INSERT OR IGNORE` here: the index itself must be doing the work,
        // so a plain insert has to fail.
        let err = conn
            .execute(
                "INSERT INTO treatments \
                   (from_doc, to_doc, treatment, signer, signature, created_at) \
                 VALUES ('a', 'b', 'followed', 'signer-a', 'sig-1', 't')",
                [],
            )
            .unwrap_err();
        assert!(
            err.to_string().contains("UNIQUE"),
            "expected a uniqueness failure, got {err}"
        );
    }

    #[test]
    fn fts5_is_actually_compiled_in() {
        // rusqlite's bundled SQLite needs the fts5 feature; without it every
        // search silently becomes an error at runtime rather than build time.
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn.execute(
            "INSERT INTO judgments_fts (rowid, title, text, citation) VALUES (1, 'a', 'b', 'c')",
            [],
        )
        .unwrap();
    }
}
