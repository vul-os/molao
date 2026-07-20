//! # molao-corpus
//!
//! The judgment store: SQLite with FTS5, citation extraction performed at
//! ingest, and a resolver that turns citation keys into document ids.
//!
//! ## Why SQLite and nothing else
//!
//! A node has to run on a laptop with no network, in a law-clinic office with
//! no sysadmin, and inside a signed OS image. That rules out a server database
//! outright. SQLite is a file — copy it, mirror it, seed it, put it on a USB
//! stick and hand it to a chambers in a district with no bandwidth. The corpus
//! being *one file* is not a compromise; it is what makes the thing mirrorable
//! by people who are not engineers.
//!
//! ## Citations are extracted once, at ingest
//!
//! [`Corpus::insert_judgment`] runs [`molao_cite::extract`] over every
//! paragraph and stores the result. Extraction is deterministic and pinned by
//! [`molao_cite::EXTRACTOR_VERSION`], so doing it at write time costs nothing
//! in verifiability and turns "what cites this?" into an index lookup.
//!
//! ## The resolver, and why relinking is a separate pass
//!
//! A citation names a case by a *string* (`[1995] ZACC 3`), not by an id — the
//! citing court had no idea what BLAKE3 hash we would later compute. So each
//! judgment registers all of its own identifiers (neutral citation, every
//! parallel reported citation, every court case number) in the `citation_keys`
//! table, and an edge resolves by looking its key up there.
//!
//! The order judgments arrive in is not controllable: a 2024 judgment citing
//! *Makwanyane* may be ingested days before *Makwanyane* itself. So an edge
//! that cannot resolve at insert time is stored **unresolved** rather than
//! dropped, and [`Corpus::relink`] fills in `to_doc` for every citation whose
//! key has since become resolvable. Ingest, then relink, always.
//!
//! Unresolved citations are kept forever and surfaced in the UI as written.
//! Hiding them would misrepresent the corpus as more complete than it is —
//! on any real corpus most cited cases are not held.
//!
//! ## Scope
//!
//! This crate stores and retrieves. It does not score: authority is computed by
//! `molao-graph` and written back through [`Corpus::set_authority`], so the
//! store has no opinion about what makes a judgment important.

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]
#![warn(missing_docs)]

pub mod error;
pub mod ingest;
pub mod schema;
pub mod search;

pub use error::{CorpusError, Result};
pub use search::{sanitise_query, Hit, SearchFilters, MAX_LIMIT};

use molao_core::{DocId, Judgment, Paragraph, Provenance, ProvenanceClass};
use rusqlite::{Connection, OptionalExtension};
use std::path::Path;

/// Number of independent witnesses required before a judgment counts as
/// corroborated.
///
/// Two is the minimum that means anything: one witness is an assertion, two who
/// never spoke to each other and fetched the same bytes is evidence.
pub const CORROBORATION_THRESHOLD: usize = 2;

/// Region assumed when an ingest file does not say.
///
/// South Africa is the first region profile, not the product. The default keeps
/// existing corpora and ingest files working; it is not a statement that Molao
/// is a South African system.
pub const DEFAULT_REGION: &str = "ZA";

/// Normalise a region code: trimmed, upper-cased, empty falls back to
/// [`DEFAULT_REGION`].
///
/// Deliberately permissive about *which* codes exist. The region registry lives
/// in `molao-core`, and a corpus that refused an unknown code would make
/// adding a jurisdiction a schema change rather than a profile.
pub fn normalise_region(region: &str) -> String {
    let trimmed = region.trim();
    if trimmed.is_empty() {
        DEFAULT_REGION.to_string()
    } else {
        trimmed.to_uppercase()
    }
}

/// The judgment store.
#[derive(Debug)]
pub struct Corpus {
    conn: Connection,
}

/// A citation edge whose target is known to be in the corpus.
///
/// `paragraph_count` is the number of distinct paragraphs of the citing
/// judgment in which the target appears. It is carried here because it is the
/// signal that separates real engagement from a string cite, and `molao-graph`
/// weights by it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedEdge {
    /// Citing judgment.
    pub from: DocId,
    /// Cited judgment.
    pub to: DocId,
    /// Distinct citing paragraphs. Always at least 1.
    pub paragraph_count: u32,
}

/// One paragraph of one judgment, as a flat row.
///
/// The feeding hook for `molao-index`: the index builds its chunks and vectors
/// from these. It lives here, rather than the index reaching into the schema,
/// so that the store stays the single writer of its own tables and the index
/// depends only on this crate's public surface — never the reverse. Chunking,
/// embedding, and everything model-specific are the index's concern; this is
/// just the verified text, in a stable order, with the pinpoint that makes a
/// retrieved passage citable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParagraphRow {
    /// Hex `DocId` of the judgment this paragraph belongs to.
    pub doc_id: String,
    /// Zero-based position within the judgment. Dense and monotonic.
    pub index: u32,
    /// Printed paragraph number, e.g. `"12"`, if the judgment had one.
    pub number: Option<String>,
    /// The paragraph text, exactly as stored (already canonicalised on ingest).
    pub text: String,
}

/// Enough of a judgment to build a graph node without loading its text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeRow {
    /// Hex `DocId`.
    pub id: String,
    /// Style of cause.
    pub title: String,
    /// Court code.
    pub court: String,
    /// ISO 8601 date of judgment.
    pub date: Option<String>,
    /// Region code, e.g. `ZA`.
    pub region: String,
}

/// One outbound citation as stored, resolved or not.
#[derive(Debug, Clone, PartialEq)]
pub struct CitationRow {
    /// Target judgment id, `None` when the cited case is not in the corpus.
    pub to_id: Option<String>,
    /// Stable key from [`molao_cite::Citation::key`].
    pub citation_key: String,
    /// The citation exactly as the judgment printed it.
    pub as_written: String,
    /// Normalised printed form.
    pub canonical: String,
    /// Index of the citing paragraph.
    pub from_para: Option<u32>,
    /// Pinpoint, if the citation carried one.
    pub pinpoint: Option<molao_cite::Pinpoint>,
}

impl CitationRow {
    /// Did this citation find its target in the corpus?
    pub fn resolved(&self) -> bool {
        self.to_id.is_some()
    }
}

/// One inbound citation — a judgment in the corpus citing this one.
#[derive(Debug, Clone, PartialEq)]
pub struct CitedByRow {
    /// Citing judgment id, hex.
    pub from_id: String,
    /// Style of cause of the citing judgment.
    pub title: String,
    /// Citing court's code.
    pub court: String,
    /// Date of the citing judgment.
    pub date: Option<String>,
    /// As printed by the citing judgment.
    pub as_written: String,
    /// Index of the citing paragraph.
    pub from_para: Option<u32>,
    /// Pinpoint, if any.
    pub pinpoint: Option<molao_cite::Pinpoint>,
}

/// A court with how many judgments of it the corpus holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CourtCount {
    /// Neutral-citation code.
    pub code: String,
    /// Full name, or the code when unknown to the registry.
    pub name: String,
    /// Serialised [`molao_core::Tier`], or `"unknown"`.
    pub tier: String,
    /// Seat, where the registry records one.
    pub seat: Option<String>,
    /// Judgments held.
    pub doc_count: u64,
}

/// Corpus-wide counts, for `/api/status`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Stats {
    /// Judgments held.
    pub docs: u64,
    /// Resolved citation edges (distinct citing/cited pairs, self-citations
    /// excluded).
    pub edges: u64,
    /// Citations whose target is not in the corpus. Reported honestly: on a
    /// young corpus this number is much larger than `edges`.
    pub unresolved: u64,
    /// Distinct courts represented.
    pub courts: u64,
    /// Judgments with independent corroboration.
    pub corroborated: u64,
    /// Judgments with exactly one witness.
    pub single: u64,
    /// Judgments entered by hand, with no online source.
    pub manual: u64,
    /// Region profiles present, as `(code, judgments)`, sorted by code.
    ///
    /// A corpus may hold several at once, so this is a list rather than a
    /// single value.
    pub regions: Vec<(String, u64)>,
}

impl Corpus {
    /// Open (creating if needed) a corpus at `path`, applying migrations.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path)?;
        schema::migrate(&conn)?;
        Ok(Corpus { conn })
    }

    /// Open a private in-memory corpus. Used by tests and by `molao demo` when
    /// no database path is given.
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        schema::migrate(&conn)?;
        Ok(Corpus { conn })
    }

    /// Borrow the underlying connection.
    ///
    /// An escape hatch for crates that own their own tables in this database —
    /// `molao-graph` owns `treatments`. Callers must not write to tables this
    /// crate manages; nothing enforces that, which is why the table list in
    /// [`schema`] is the contract.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Insert a judgment together with the provenance records witnessing it.
    ///
    /// Also, in the same transaction:
    /// - extracts and stores every citation in every paragraph, tagged with the
    ///   paragraph it came from;
    /// - registers the judgment's own identifiers in the resolver table;
    /// - resolves outbound citations whose targets are already held;
    /// - classifies provenance from the number of *distinct* witnesses.
    ///
    /// Re-inserting an existing id replaces it wholesale — ingest is idempotent
    /// so a mirror can re-run a release without accumulating duplicate edges.
    ///
    /// Fails with [`CorpusError::IdMismatch`] if the judgment's id is not the
    /// hash of its own text. That check is what makes a judgment received from
    /// an untrusted peer safe to store, so it is not optional and not a warning.
    ///
    /// The judgment is filed under [`DEFAULT_REGION`]; use
    /// [`Corpus::insert_judgment_in_region`] to say otherwise.
    pub fn insert_judgment(&mut self, j: &Judgment, provenance: &[Provenance]) -> Result<()> {
        self.insert_judgment_in_region(j, provenance, DEFAULT_REGION)
    }

    /// As [`Corpus::insert_judgment`], filing the judgment under an explicit
    /// region profile.
    ///
    /// Region is a property of the *corpus row*, not of
    /// [`molao_core::Judgment`]: the same judgment text is the same document
    /// wherever it is held, and its id must not change because a different node
    /// files it under a different profile.
    pub fn insert_judgment_in_region(
        &mut self,
        j: &Judgment,
        provenance: &[Provenance],
        region: &str,
    ) -> Result<()> {
        let region = normalise_region(region);
        if !j.verify_id() {
            return Err(CorpusError::IdMismatch {
                id: j.id.to_string(),
            });
        }

        let id = j.id.to_string();
        let witnesses: usize = {
            let mut w: Vec<&str> = provenance.iter().map(|p| p.witness.as_str()).collect();
            w.sort_unstable();
            w.dedup();
            w.len()
        };
        let class = ProvenanceClass::from_witness_count(witnesses, CORROBORATION_THRESHOLD);

        let tx = self.conn.transaction()?;

        // Replace rather than merge: a re-ingest must not leave stale edges
        // from a previous version of the text.
        tx.execute(
            "DELETE FROM judgments_fts WHERE rowid = (SELECT rowid FROM judgments WHERE id = ?1)",
            [&id],
        )?;
        tx.execute("DELETE FROM paragraphs WHERE doc_id = ?1", [&id])?;
        tx.execute("DELETE FROM citations WHERE from_doc = ?1", [&id])?;
        tx.execute("DELETE FROM citation_keys WHERE doc_id = ?1", [&id])?;
        tx.execute("DELETE FROM provenance WHERE doc_id = ?1", [&id])?;

        tx.execute(
            "INSERT INTO judgments \
               (id, neutral_citation, court, title, case_numbers, date, judges, \
                reported_citations, provenance_class, authority, region) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0.0, ?10) \
             ON CONFLICT(id) DO UPDATE SET \
               neutral_citation = excluded.neutral_citation, \
               court = excluded.court, title = excluded.title, \
               case_numbers = excluded.case_numbers, date = excluded.date, \
               judges = excluded.judges, \
               reported_citations = excluded.reported_citations, \
               provenance_class = excluded.provenance_class, \
               region = excluded.region",
            rusqlite::params![
                &id,
                &j.neutral_citation,
                j.court.to_uppercase(),
                &j.title,
                serde_json::to_string(&j.case_numbers)?,
                &j.date,
                serde_json::to_string(&j.judges)?,
                serde_json::to_string(&j.reported_citations)?,
                provenance_class_str(class),
                &region,
            ],
        )?;

        let rowid: i64 = tx.query_row("SELECT rowid FROM judgments WHERE id = ?1", [&id], |r| {
            r.get(0)
        })?;

        {
            let mut para_stmt = tx.prepare(
                "INSERT INTO paragraphs (doc_id, idx, number, text) VALUES (?1, ?2, ?3, ?4)",
            )?;
            let mut cite_stmt = tx.prepare(
                "INSERT INTO citations \
                   (from_doc, from_para, citation_key, as_written, canonical, pinpoint, to_doc) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, \
                         (SELECT doc_id FROM citation_keys WHERE citation_key = ?3))",
            )?;

            for p in &j.paragraphs {
                para_stmt.execute(rusqlite::params![&id, p.index, &p.number, &p.text])?;
                for c in molao_cite::extract(&p.text) {
                    let pin = match &c.pinpoint {
                        Some(pp) => Some(serde_json::to_string(pp)?),
                        None => None,
                    };
                    cite_stmt.execute(rusqlite::params![
                        &id,
                        p.index,
                        c.citation.key(),
                        c.as_written,
                        c.citation.canonical(),
                        pin,
                    ])?;
                }
            }
        }

        // The searchable unit is the whole judgment, not the paragraph: a
        // lawyer searching two terms expects to find a case that discusses
        // both, not to be told no single paragraph contains both.
        let full_text = j
            .paragraphs
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        // Identifiers go in their own column so that pasting a citation into
        // the search box finds the case. See the schema comment.
        let citation_text = j
            .neutral_citation
            .iter()
            .chain(j.reported_citations.iter())
            .chain(j.case_numbers.iter())
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" ");
        tx.execute(
            "INSERT INTO judgments_fts (rowid, title, text, citation) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![rowid, &j.title, full_text, citation_text],
        )?;

        {
            let mut key_stmt = tx.prepare(
                "INSERT INTO citation_keys (citation_key, doc_id) VALUES (?1, ?2) \
                 ON CONFLICT(citation_key) DO NOTHING",
            )?;
            // First registration wins. Two judgments claiming one key means a
            // typo in a case number somewhere upstream; letting the later one
            // steal the key would make resolution depend on ingest order.
            for key in own_citation_keys(j) {
                key_stmt.execute(rusqlite::params![key, &id])?;
            }
        }

        for p in provenance {
            tx.execute(
                "INSERT INTO provenance \
                   (doc_id, source_url, fetched_at, raw_hash, witness, signature) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
                 ON CONFLICT(doc_id, witness, source_url) DO UPDATE SET \
                   fetched_at = excluded.fetched_at, raw_hash = excluded.raw_hash, \
                   signature = excluded.signature",
                rusqlite::params![
                    &id,
                    &p.source_url,
                    &p.fetched_at,
                    &p.raw_hash,
                    &p.witness,
                    &p.signature
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Resolve a citation key to the judgment it names, if the corpus holds it.
    pub fn resolve(&self, citation_key: &str) -> Result<Option<DocId>> {
        let found: Option<String> = self
            .conn
            .query_row(
                "SELECT doc_id FROM citation_keys WHERE citation_key = ?1",
                [citation_key],
                |r| r.get(0),
            )
            .optional()?;
        // A stored id that no longer parses would mean database corruption, not
        // bad input; treat it as absent rather than panicking a read path.
        Ok(found.and_then(|s| s.parse().ok()))
    }

    /// Fill in `to_doc` for every citation whose key has become resolvable.
    ///
    /// Run after any ingest. Cheap and idempotent: a single indexed `UPDATE`
    /// touching only rows that are still unresolved.
    ///
    /// Returns the number of edges newly resolved.
    pub fn relink(&self) -> Result<usize> {
        let n = self.conn.execute(
            "UPDATE citations \
             SET to_doc = (SELECT doc_id FROM citation_keys k \
                           WHERE k.citation_key = citations.citation_key) \
             WHERE to_doc IS NULL \
               AND EXISTS (SELECT 1 FROM citation_keys k \
                           WHERE k.citation_key = citations.citation_key)",
            [],
        )?;
        Ok(n)
    }

    /// Load a judgment in full, paragraphs included.
    pub fn judgment(&self, id: &DocId) -> Result<Option<Judgment>> {
        let key = id.to_string();
        let row = self
            .conn
            .query_row(
                "SELECT neutral_citation, court, title, case_numbers, date, judges, \
                        reported_citations \
                 FROM judgments WHERE id = ?1",
                [&key],
                |r| {
                    Ok((
                        r.get::<_, Option<String>>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, String>(6)?,
                    ))
                },
            )
            .optional()?;

        let Some((neutral, court, title, case_numbers, date, judges, reported)) = row else {
            return Ok(None);
        };

        let mut stmt = self
            .conn
            .prepare("SELECT idx, number, text FROM paragraphs WHERE doc_id = ?1 ORDER BY idx")?;
        let paragraphs = stmt
            .query_map([&key], |r| {
                Ok(Paragraph {
                    index: r.get(0)?,
                    number: r.get(1)?,
                    text: r.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(Some(Judgment {
            id: *id,
            neutral_citation: neutral,
            court,
            title,
            case_numbers: serde_json::from_str(&case_numbers)?,
            date,
            judges: serde_json::from_str(&judges)?,
            reported_citations: serde_json::from_str(&reported)?,
            paragraphs,
        }))
    }

    /// Region profile a judgment is filed under.
    pub fn region(&self, id: &DocId) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT region FROM judgments WHERE id = ?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// Provenance class of a judgment.
    pub fn provenance_class(&self, id: &DocId) -> Result<Option<ProvenanceClass>> {
        let s: Option<String> = self
            .conn
            .query_row(
                "SELECT provenance_class FROM judgments WHERE id = ?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        Ok(s.map(|s| match s.as_str() {
            "corroborated" => ProvenanceClass::Corroborated,
            "single" => ProvenanceClass::Single,
            _ => ProvenanceClass::Manual,
        }))
    }

    /// Provenance records for a judgment, ordered for stable display.
    pub fn provenance(&self, id: &DocId) -> Result<Vec<Provenance>> {
        let mut stmt = self.conn.prepare(
            "SELECT source_url, fetched_at, raw_hash, witness, signature \
             FROM provenance WHERE doc_id = ?1 ORDER BY witness, source_url",
        )?;
        let rows = stmt
            .query_map([id.to_string()], |r| {
                Ok(Provenance {
                    doc_id: *id,
                    source_url: r.get(0)?,
                    fetched_at: r.get(1)?,
                    raw_hash: r.get(2)?,
                    witness: r.get(3)?,
                    signature: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Authority score written back by `molao-graph`, or `0.0` if unknown.
    pub fn authority(&self, id: &DocId) -> Result<f64> {
        Ok(self
            .conn
            .query_row(
                "SELECT authority FROM judgments WHERE id = ?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(0.0))
    }

    /// Store a computed authority score.
    pub fn set_authority(&self, id: &DocId, score: f64) -> Result<()> {
        self.conn.execute(
            "UPDATE judgments SET authority = ?2 WHERE id = ?1",
            rusqlite::params![id.to_string(), score],
        )?;
        Ok(())
    }

    /// Does the corpus hold this judgment?
    pub fn contains(&self, id: &DocId) -> Result<bool> {
        Ok(self
            .conn
            .query_row(
                "SELECT 1 FROM judgments WHERE id = ?1",
                [id.to_string()],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    }

    /// Outbound citations of a judgment, in document order.
    ///
    /// Includes unresolved citations, deliberately. See the crate docs.
    pub fn citations_from(&self, id: &DocId) -> Result<Vec<CitationRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT to_doc, citation_key, as_written, canonical, from_para, pinpoint \
             FROM citations WHERE from_doc = ?1 \
             ORDER BY from_para, id",
        )?;
        let rows = stmt
            .query_map([id.to_string()], |r| {
                let pin: Option<String> = r.get(5)?;
                Ok(CitationRow {
                    to_id: r.get(0)?,
                    citation_key: r.get(1)?,
                    as_written: r.get(2)?,
                    canonical: r.get(3)?,
                    from_para: r.get(4)?,
                    // A pinpoint that no longer deserialises is a display
                    // detail; losing it must not fail the whole request.
                    pinpoint: pin.and_then(|s| serde_json::from_str(&s).ok()),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Judgments in the corpus that cite this one.
    ///
    /// Self-citations are excluded: a judgment's own header repeats its neutral
    /// citation, and counting that would make every case cite itself.
    pub fn cited_by(&self, id: &DocId) -> Result<Vec<CitedByRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.from_doc, j.title, j.court, j.date, c.as_written, c.from_para, c.pinpoint \
             FROM citations c JOIN judgments j ON j.id = c.from_doc \
             WHERE c.to_doc = ?1 AND c.from_doc <> ?1 \
             ORDER BY j.date DESC, j.id, c.from_para",
        )?;
        let rows = stmt
            .query_map([id.to_string()], |r| {
                let pin: Option<String> = r.get(6)?;
                Ok(CitedByRow {
                    from_id: r.get(0)?,
                    title: r.get(1)?,
                    court: r.get(2)?,
                    date: r.get(3)?,
                    as_written: r.get(4)?,
                    from_para: r.get(5)?,
                    pinpoint: pin.and_then(|s| serde_json::from_str(&s).ok()),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Count of distinct judgments citing this one.
    pub fn cited_by_count(&self, id: &DocId) -> Result<u64> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT from_doc) FROM citations WHERE to_doc = ?1 AND from_doc <> ?1",
            [id.to_string()],
            |r| r.get(0),
        )?;
        Ok(n.max(0) as u64)
    }

    /// Count of citations made by this judgment, resolved or not.
    pub fn cites_count(&self, id: &DocId) -> Result<u64> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM citations WHERE from_doc = ?1",
            [id.to_string()],
            |r| r.get(0),
        )?;
        Ok(n.max(0) as u64)
    }

    /// Every paragraph of every judgment, ordered by `(doc_id, index)`.
    ///
    /// The deterministic order is not cosmetic: it is what lets an index built
    /// on one node be compared against one rebuilt on another. Two nodes holding
    /// the same corpus feed their index the same rows in the same order, so any
    /// difference in the resulting vectors is attributable to the embedder
    /// alone — which is the whole point of the rebuild-and-check verification.
    ///
    /// The text is already canonical (it was canonicalised at ingest), so an
    /// index built from it is built over exactly the bytes that were hashed into
    /// each `DocId`.
    pub fn paragraphs(&self) -> Result<Vec<ParagraphRow>> {
        let mut stmt = self
            .conn
            .prepare("SELECT doc_id, idx, number, text FROM paragraphs ORDER BY doc_id, idx")?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ParagraphRow {
                    doc_id: r.get(0)?,
                    index: r.get(1)?,
                    number: r.get(2)?,
                    text: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Every judgment as a graph node, ordered by id.
    ///
    /// The ordering is not cosmetic: `molao-graph` requires a deterministic node
    /// order for its scores to be reproducible.
    pub fn nodes(&self) -> Result<Vec<NodeRow>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, title, court, date, region FROM judgments ORDER BY id")?;
        let rows = stmt
            .query_map([], |r| {
                Ok(NodeRow {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    court: r.get(2)?,
                    date: r.get(3)?,
                    region: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Every resolved citation edge, deduplicated to one per (citing, cited)
    /// pair and carrying the count of distinct citing paragraphs.
    ///
    /// Self-edges are excluded, for the reason given on [`Corpus::cited_by`].
    /// Ordered by `(from, to)` for determinism.
    pub fn resolved_edges(&self) -> Result<Vec<ResolvedEdge>> {
        let mut stmt = self.conn.prepare(
            "SELECT from_doc, to_doc, COUNT(DISTINCT COALESCE(from_para, -1)) \
             FROM citations \
             WHERE to_doc IS NOT NULL AND to_doc <> from_doc \
             GROUP BY from_doc, to_doc \
             ORDER BY from_doc, to_doc",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })?;

        let mut out = Vec::new();
        for row in rows {
            let (from, to, count) = row?;
            // Ids come from our own writes; a parse failure means corruption,
            // and skipping is better than aborting graph construction.
            let (Ok(from), Ok(to)) = (from.parse::<DocId>(), to.parse::<DocId>()) else {
                tracing::warn!("skipping citation edge with an unparseable stored id");
                continue;
            };
            out.push(ResolvedEdge {
                from,
                to,
                paragraph_count: count.clamp(1, i64::from(u32::MAX)) as u32,
            });
        }
        Ok(out)
    }

    /// Courts represented in the corpus, with counts, ordered by tier then code.
    pub fn courts(&self) -> Result<Vec<CourtCount>> {
        let mut stmt = self
            .conn
            .prepare("SELECT court, COUNT(*) FROM judgments GROUP BY court ORDER BY court")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut out: Vec<CourtCount> = rows
            .into_iter()
            .map(|(code, count)| match molao_core::court::lookup(&code) {
                Some(c) => CourtCount {
                    code: c.code.to_string(),
                    name: c.name.to_string(),
                    tier: tier_str(c.tier).to_string(),
                    seat: c.seat.map(str::to_string),
                    doc_count: count.max(0) as u64,
                },
                // An unknown code is shown as itself rather than dropped: a new
                // division must be visible immediately, not after a registry
                // release.
                None => CourtCount {
                    code: code.clone(),
                    name: code,
                    tier: "unknown".to_string(),
                    seat: None,
                    doc_count: count.max(0) as u64,
                },
            })
            .collect();

        out.sort_by(|a, b| {
            tier_rank(&a.tier)
                .cmp(&tier_rank(&b.tier))
                .then(a.code.cmp(&b.code))
        });
        Ok(out)
    }

    /// Corpus-wide counts.
    pub fn stats(&self) -> Result<Stats> {
        let one = |sql: &str| -> Result<u64> {
            let n: i64 = self.conn.query_row(sql, [], |r| r.get(0))?;
            Ok(n.max(0) as u64)
        };
        Ok(Stats {
            docs: one("SELECT COUNT(*) FROM judgments")?,
            edges: one(
                "SELECT COUNT(*) FROM (SELECT DISTINCT from_doc, to_doc FROM citations \
                 WHERE to_doc IS NOT NULL AND to_doc <> from_doc)",
            )?,
            unresolved: one("SELECT COUNT(*) FROM citations WHERE to_doc IS NULL")?,
            courts: one("SELECT COUNT(DISTINCT court) FROM judgments")?,
            corroborated: one(
                "SELECT COUNT(*) FROM judgments WHERE provenance_class = 'corroborated'",
            )?,
            single: one("SELECT COUNT(*) FROM judgments WHERE provenance_class = 'single'")?,
            manual: one("SELECT COUNT(*) FROM judgments WHERE provenance_class = 'manual'")?,
            regions: self.regions()?,
        })
    }

    /// Region profiles present in the corpus, with counts, sorted by code.
    pub fn regions(&self) -> Result<Vec<(String, u64)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT region, COUNT(*) FROM judgments GROUP BY region ORDER BY region")?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?.max(0) as u64))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Root hash over the sorted document ids: the `corpus_root` of a
    /// [`molao_core::Manifest`].
    ///
    /// Sorted, length-prefixed, and independent of insertion order, so two nodes
    /// holding the same judgments compute the same root byte-for-byte — which is
    /// the entire point of a release manifest.
    pub fn corpus_root(&self) -> Result<String> {
        let mut stmt = self.conn.prepare("SELECT id FROM judgments ORDER BY id")?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        // Domain separation: a corpus root must never collide with a graph root
        // computed over structurally similar bytes.
        let mut hasher = blake3::Hasher::new();
        hasher.update(b"molao-corpus-root-v1\n");
        for id in ids {
            hasher.update(&(id.len() as u64).to_be_bytes());
            hasher.update(id.as_bytes());
        }
        Ok(hex::encode(hasher.finalize().as_bytes()))
    }
}

fn provenance_class_str(c: ProvenanceClass) -> &'static str {
    match c {
        ProvenanceClass::Corroborated => "corroborated",
        ProvenanceClass::Single => "single",
        ProvenanceClass::Manual => "manual",
    }
}

fn tier_str(t: molao_core::Tier) -> &'static str {
    match t {
        molao_core::Tier::Apex => "apex",
        molao_core::Tier::Appellate => "appellate",
        molao_core::Tier::SpecialistAppellate => "specialist_appellate",
        molao_core::Tier::HighCourt => "high_court",
        molao_core::Tier::SpecialistHigh => "specialist_high",
        molao_core::Tier::Tribunal => "tribunal",
        molao_core::Tier::Lower => "lower",
    }
}

fn tier_rank(t: &str) -> u8 {
    match t {
        "apex" => 0,
        "appellate" => 1,
        "specialist_appellate" => 2,
        "high_court" => 3,
        "specialist_high" => 4,
        "tribunal" => 5,
        "lower" => 6,
        _ => 7,
    }
}

/// Every citation key by which this judgment can itself be cited.
///
/// Derived by running the extractor over the judgment's own identifiers rather
/// than by formatting keys by hand — so a judgment registers under exactly the
/// keys a *citing* judgment's text would produce. If the two ever drifted,
/// nothing would resolve, and the drift would be invisible.
fn own_citation_keys(j: &Judgment) -> Vec<String> {
    let mut keys = Vec::new();
    let mut push_from = |text: &str| {
        for c in molao_cite::extract(text) {
            keys.push(c.citation.key());
        }
    };
    if let Some(n) = &j.neutral_citation {
        push_from(n);
    }
    for r in &j.reported_citations {
        push_from(r);
    }
    for c in &j.case_numbers {
        push_from(c);
    }
    keys.sort();
    keys.dedup();
    keys
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::test_support::judgment;

    #[test]
    fn a_judgment_round_trips() {
        let mut c = Corpus::open_in_memory().unwrap();
        let j = judgment(
            "ZACC",
            "[2026] ZACC 1",
            "Nkosi v Minister of Home Affairs",
            &["The application succeeds."],
        );
        c.insert_judgment(&j, &[]).unwrap();
        assert_eq!(c.judgment(&j.id).unwrap().unwrap(), j);
    }

    #[test]
    fn a_judgment_whose_id_does_not_match_its_text_is_refused() {
        let mut c = Corpus::open_in_memory().unwrap();
        let mut j = judgment("ZACC", "[2026] ZACC 1", "A v B", &["text"]);
        j.paragraphs[0].text = "different text".into();
        assert!(matches!(
            c.insert_judgment(&j, &[]),
            Err(CorpusError::IdMismatch { .. })
        ));
    }

    #[test]
    fn citations_resolve_when_the_target_is_already_present() {
        let mut c = Corpus::open_in_memory().unwrap();
        let target = judgment("ZACC", "[1995] ZACC 3", "S v Ndlovu", &["Held."]);
        c.insert_judgment(&target, &[]).unwrap();
        let citing = judgment(
            "ZASCA",
            "[2020] ZASCA 9",
            "Mokoena v Road Accident Fund",
            &["We follow [1995] ZACC 3 at para 12."],
        );
        c.insert_judgment(&citing, &[]).unwrap();

        let cites = c.citations_from(&citing.id).unwrap();
        let hit = cites
            .iter()
            .find(|r| r.citation_key == "neutral:1995:ZACC:3")
            .expect("the citation was extracted");
        assert_eq!(hit.to_id.as_deref(), Some(target.id.to_string().as_str()));
        assert!(hit.resolved());
    }

    #[test]
    fn relinking_resolves_edges_ingested_before_their_target() {
        // The ordering that matters: the citing judgment arrives first.
        let mut c = Corpus::open_in_memory().unwrap();
        let citing = judgment(
            "ZASCA",
            "[2020] ZASCA 9",
            "Mokoena v RAF",
            &["We follow [1995] ZACC 3."],
        );
        c.insert_judgment(&citing, &[]).unwrap();
        assert!(!c.citations_from(&citing.id).unwrap()[0].resolved());

        let target = judgment("ZACC", "[1995] ZACC 3", "S v Ndlovu", &["Held."]);
        c.insert_judgment(&target, &[]).unwrap();
        assert_eq!(c.relink().unwrap(), 1);

        let cites = c.citations_from(&citing.id).unwrap();
        assert_eq!(
            cites[0].to_id.as_deref(),
            Some(target.id.to_string().as_str())
        );
        // Idempotent: a second pass has nothing left to do.
        assert_eq!(c.relink().unwrap(), 0);
    }

    #[test]
    fn a_case_cited_by_its_reported_citation_resolves_to_the_same_judgment() {
        let mut c = Corpus::open_in_memory().unwrap();
        let mut target = judgment("ZACC", "[1995] ZACC 3", "S v Ndlovu", &["Held."]);
        // Reported citations are metadata, not text, so the id is unchanged.
        target.reported_citations = vec!["1995 (3) SA 391 (CC)".into()];
        c.insert_judgment(&target, &[]).unwrap();

        let citing = judgment(
            "ZAGPJHC",
            "[2021] ZAGPJHC 4",
            "Dlamini v Eskom",
            &["See 1995 (3) SA 391 (CC)."],
        );
        c.insert_judgment(&citing, &[]).unwrap();
        assert_eq!(
            c.citations_from(&citing.id).unwrap()[0].to_id.as_deref(),
            Some(target.id.to_string().as_str())
        );
    }

    #[test]
    fn unresolved_citations_are_kept_not_dropped() {
        let mut c = Corpus::open_in_memory().unwrap();
        let j = judgment(
            "ZACC",
            "[2026] ZACC 1",
            "A v B",
            &["Citing [1910] ZACC 1 which we do not hold."],
        );
        c.insert_judgment(&j, &[]).unwrap();
        let cites = c.citations_from(&j.id).unwrap();
        assert_eq!(cites.len(), 1);
        assert!(!cites[0].resolved());
        assert_eq!(cites[0].as_written, "[1910] ZACC 1");
    }

    #[test]
    fn a_judgment_does_not_cite_itself_through_its_own_header() {
        let mut c = Corpus::open_in_memory().unwrap();
        let j = judgment(
            "ZACC",
            "[2026] ZACC 1",
            "A v B",
            &["Neutral citation: [2026] ZACC 1", "Held."],
        );
        c.insert_judgment(&j, &[]).unwrap();
        c.relink().unwrap();
        assert_eq!(c.cited_by_count(&j.id).unwrap(), 0);
        assert!(c.resolved_edges().unwrap().is_empty());
    }

    #[test]
    fn re_ingesting_a_judgment_does_not_duplicate_its_edges() {
        let mut c = Corpus::open_in_memory().unwrap();
        let target = judgment("ZACC", "[1995] ZACC 3", "S v Ndlovu", &["Held."]);
        let citing = judgment(
            "ZASCA",
            "[2020] ZASCA 9",
            "M v R",
            &["Following [1995] ZACC 3."],
        );
        c.insert_judgment(&target, &[]).unwrap();
        for _ in 0..3 {
            c.insert_judgment(&citing, &[]).unwrap();
        }
        assert_eq!(c.cites_count(&citing.id).unwrap(), 1);
        assert_eq!(c.stats().unwrap().docs, 2);
        assert_eq!(c.resolved_edges().unwrap().len(), 1);
    }

    #[test]
    fn paragraph_counts_reflect_depth_of_engagement() {
        let mut c = Corpus::open_in_memory().unwrap();
        let target = judgment("ZACC", "[1995] ZACC 3", "S v Ndlovu", &["Held."]);
        c.insert_judgment(&target, &[]).unwrap();
        let citing = judgment(
            "ZASCA",
            "[2020] ZASCA 9",
            "M v R",
            &[
                "We begin with [1995] ZACC 3.",
                "The reasoning in [1995] ZACC 3 at para 4 is decisive.",
                "Applying [1995] ZACC 3 to these facts.",
            ],
        );
        c.insert_judgment(&citing, &[]).unwrap();
        let edges = c.resolved_edges().unwrap();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].paragraph_count, 3);
    }

    #[test]
    fn provenance_classification_needs_two_distinct_witnesses() {
        let mut c = Corpus::open_in_memory().unwrap();
        let j = judgment("ZACC", "[2026] ZACC 1", "A v B", &["Held."]);

        c.insert_judgment(&j, &[]).unwrap();
        assert_eq!(
            c.provenance_class(&j.id).unwrap(),
            Some(ProvenanceClass::Manual)
        );

        let p = |w: &str| Provenance {
            doc_id: j.id,
            source_url: "https://example.invalid/j".into(),
            fetched_at: "2026-01-01T00:00:00Z".into(),
            raw_hash: "00".repeat(32),
            witness: w.into(),
            signature: "11".repeat(64),
        };

        c.insert_judgment(&j, &[p("aa")]).unwrap();
        assert_eq!(
            c.provenance_class(&j.id).unwrap(),
            Some(ProvenanceClass::Single)
        );

        // The same witness twice must not manufacture corroboration.
        c.insert_judgment(&j, &[p("aa"), p("aa")]).unwrap();
        assert_eq!(
            c.provenance_class(&j.id).unwrap(),
            Some(ProvenanceClass::Single)
        );

        c.insert_judgment(&j, &[p("aa"), p("bb")]).unwrap();
        assert_eq!(
            c.provenance_class(&j.id).unwrap(),
            Some(ProvenanceClass::Corroborated)
        );
        assert_eq!(c.provenance(&j.id).unwrap().len(), 2);
    }

    #[test]
    fn corpus_root_is_insertion_order_independent() {
        let a = judgment("ZACC", "[2026] ZACC 1", "A v B", &["one"]);
        let b = judgment("ZASCA", "[2026] ZASCA 2", "C v D", &["two"]);

        let mut first = Corpus::open_in_memory().unwrap();
        first.insert_judgment(&a, &[]).unwrap();
        first.insert_judgment(&b, &[]).unwrap();

        let mut second = Corpus::open_in_memory().unwrap();
        second.insert_judgment(&b, &[]).unwrap();
        second.insert_judgment(&a, &[]).unwrap();

        assert_eq!(first.corpus_root().unwrap(), second.corpus_root().unwrap());
    }

    #[test]
    fn corpus_root_changes_when_the_corpus_changes() {
        let mut c = Corpus::open_in_memory().unwrap();
        let empty = c.corpus_root().unwrap();
        c.insert_judgment(&judgment("ZACC", "[2026] ZACC 1", "A v B", &["one"]), &[])
            .unwrap();
        assert_ne!(empty, c.corpus_root().unwrap());
    }

    #[test]
    fn courts_are_counted_and_ordered_by_hierarchy() {
        let mut c = Corpus::open_in_memory().unwrap();
        c.insert_judgment(
            &judgment("ZAGPJHC", "[2026] ZAGPJHC 1", "A v B", &["one"]),
            &[],
        )
        .unwrap();
        c.insert_judgment(&judgment("ZACC", "[2026] ZACC 1", "C v D", &["two"]), &[])
            .unwrap();
        c.insert_judgment(&judgment("ZACC", "[2026] ZACC 2", "E v F", &["three"]), &[])
            .unwrap();
        let courts = c.courts().unwrap();
        assert_eq!(courts[0].code, "ZACC");
        assert_eq!(courts[0].doc_count, 2);
        assert_eq!(courts[0].name, "Constitutional Court of South Africa");
        assert_eq!(courts[1].code, "ZAGPJHC");
    }

    #[test]
    fn an_unknown_court_code_is_kept_and_shown_as_itself() {
        let mut c = Corpus::open_in_memory().unwrap();
        c.insert_judgment(
            &judgment("ZANEWHC", "[2027] ZANEWHC 1", "A v B", &["one"]),
            &[],
        )
        .unwrap();
        let courts = c.courts().unwrap();
        assert_eq!(courts[0].code, "ZANEWHC");
        assert_eq!(courts[0].tier, "unknown");
    }

    #[test]
    fn resolve_returns_none_for_unknown_or_hostile_keys() {
        let c = Corpus::open_in_memory().unwrap();
        assert_eq!(c.resolve("neutral:1999:ZACC:99").unwrap(), None);
        // Junk input must be a miss, not an error, and must not execute.
        assert_eq!(c.resolve("'; DROP TABLE judgments; --").unwrap(), None);
        assert_eq!(c.stats().unwrap().docs, 0);
    }

    #[test]
    fn paragraphs_are_returned_in_a_stable_order_for_the_index() {
        let mut c = Corpus::open_in_memory().unwrap();
        // Insert out of id order; the output must still be grouped and ordered.
        c.insert_judgment(
            &judgment(
                "ZASCA",
                "[2026] ZASCA 2",
                "C v D",
                &["beta one", "beta two"],
            ),
            &[],
        )
        .unwrap();
        c.insert_judgment(
            &judgment("ZACC", "[2026] ZACC 1", "A v B", &["alpha only"]),
            &[],
        )
        .unwrap();

        let rows = c.paragraphs().unwrap();
        assert_eq!(rows.len(), 3);
        // Grouped by doc_id, and within a doc by paragraph index ascending.
        let mut sorted = rows.clone();
        sorted.sort_by(|a, b| a.doc_id.cmp(&b.doc_id).then(a.index.cmp(&b.index)));
        assert_eq!(
            rows, sorted,
            "paragraphs must come back in (doc_id, index) order"
        );
        // Each row is pinpoint-able and carries the verified text.
        assert!(rows.iter().all(|r| !r.text.is_empty()));
        assert!(rows.iter().any(|r| r.text == "alpha only"));
    }

    #[test]
    fn stats_report_unresolved_citations_honestly() {
        let mut c = Corpus::open_in_memory().unwrap();
        c.insert_judgment(
            &judgment(
                "ZACC",
                "[2026] ZACC 1",
                "A v B",
                &["Citing [1910] ZACC 1 and [1911] ZACC 2."],
            ),
            &[],
        )
        .unwrap();
        let s = c.stats().unwrap();
        assert_eq!(s.docs, 1);
        assert_eq!(s.edges, 0);
        assert_eq!(s.unresolved, 2);
    }
}
