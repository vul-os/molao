//! Row-level access to the `treatments` table.
//!
//! # What this module is, and what it deliberately is not
//!
//! The store owns every table in [`crate::schema`], including `treatments`, and
//! this module is that table's read/write surface. It handles **rows of
//! strings**. It does not know what `"overruled"` means, it does not know what
//! an Ed25519 signature is, and it cannot tell a genuine attestation from a
//! forged one.
//!
//! That is the split on purpose. The vocabulary, the canonical signing bytes,
//! the signature check and the reader's trust policy all live in
//! `molao_graph::treatment`, because they are *interpretation of the claim* and
//! this crate has no opinion about claims — the same reason it does not score
//! authority. What lives here is durability and ordering.
//!
//! # Reading a row is not the same as believing it
//!
//! Nothing this module returns has been verified, and it cannot be: a row
//! arrives here as text and leaves as text.
//!
//! This matters more for `treatments` than for any other table. A judgment is
//! bound to its own id by [`crate::Corpus::insert_judgment`]'s hash check, and a
//! release manifest signs the corpus root over every judgment id — but
//! attestations are **excluded from the release root** by design, because a
//! release must be reproducible by recomputation and an attestation is not
//! recomputable. So there is no outer signature covering these rows. A corpus
//! file handed to you by a stranger can have anything at all in this table.
//!
//! The consequence, stated plainly because it is load-bearing: **every read path
//! that presents an attestation to a reader must verify its signature at read
//! time.** `molao_graph::treatment::verified_about` is that path. The functions
//! here are underneath it, and a caller that uses them directly is looking at
//! unchecked input.
//!
//! # Identity of an attestation
//!
//! A row is identified by `(signer, signature)`, enforced by a unique index.
//! Ed25519 signing is deterministic, so one signer re-publishing the same claim
//! produces byte-identical signature bytes and lands on the same row — which is
//! what makes re-importing an attestation bundle idempotent, the same property
//! judgment ingest already has. Changing *any* signed field changes the
//! signature, so an edited claim is a different row and fails verification
//! unless it was genuinely re-signed.

use crate::error::Result;
use crate::Corpus;

/// One attestation exactly as stored: eight strings and an optional number.
///
/// Deliberately untyped. `treatment` is whatever text is in the column,
/// including a vocabulary term this build has never heard of — a reader on an
/// older release must be able to *read past* a newer term rather than fail on
/// it, so the column is not constrained and parsing happens above this layer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttestationRow {
    /// Later judgment doing the treating, hex `DocId`.
    pub from_doc: String,
    /// Earlier judgment being treated, hex `DocId`.
    pub to_doc: String,
    /// The claim, as stored.
    pub treatment: String,
    /// Paragraph of the citing judgment the claim rests on, if pinpointed.
    pub from_para: Option<u32>,
    /// The attestor's stated reasoning.
    pub note: Option<String>,
    /// Ed25519 public key of the attestor, hex. **Not checked here.**
    pub signer: String,
    /// Ed25519 signature, hex. **Not checked here.**
    pub signature: String,
    /// RFC 3339 timestamp, as the attestor wrote it.
    pub created_at: String,
}

/// How many attestations the node holds, and from how many distinct keys.
///
/// Both counts are over *stored* rows, verified or not. A caller reporting
/// these to a reader must say so; `molao_graph::treatment` exposes the verified
/// counts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AttestationStats {
    /// Rows in `treatments`.
    pub rows: u64,
    /// Distinct values of `signer`.
    pub signers: u64,
}

/// Columns in the fixed order every query below uses.
const COLUMNS: &str = "from_doc, to_doc, treatment, from_para, note, signer, signature, created_at";

/// Total order for display.
///
/// Every field is in the key, ending with `signature`, which is unique per
/// signer. Two rows can therefore never compare equal, so the order is total
/// and the same corpus always renders the same list — the same determinism
/// requirement the graph has, for the same reason: a node that reordered
/// contradictory claims between requests would look like it was ranking them.
const ORDER: &str = "ORDER BY created_at, signer, from_doc, treatment, signature";

fn row_from(r: &rusqlite::Row<'_>) -> rusqlite::Result<AttestationRow> {
    Ok(AttestationRow {
        from_doc: r.get(0)?,
        to_doc: r.get(1)?,
        treatment: r.get(2)?,
        from_para: r.get(3)?,
        note: r.get(4)?,
        signer: r.get(5)?,
        signature: r.get(6)?,
        created_at: r.get(7)?,
    })
}

impl Corpus {
    /// Store one attestation row, ignoring an exact duplicate.
    ///
    /// Returns `true` if a row was written, `false` if `(signer, signature)` was
    /// already held.
    ///
    /// **This does not verify anything.** It is the storage primitive under
    /// `molao_graph::treatment::ingest`, which is the gate that checks
    /// signatures. Calling it directly stores unchecked input — which the read
    /// path will then reject, but only if the read path is the verifying one.
    pub fn insert_attestation_row(&self, a: &AttestationRow) -> Result<bool> {
        let changed = self.connection().execute(
            &format!("INSERT OR IGNORE INTO treatments ({COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"),
            rusqlite::params![
                a.from_doc,
                a.to_doc,
                a.treatment,
                a.from_para,
                a.note,
                a.signer,
                a.signature,
                a.created_at,
            ],
        )?;
        Ok(changed == 1)
    }

    /// Every stored attestation about one judgment, in [`ORDER`].
    pub fn attestation_rows_about(&self, to_doc: &str) -> Result<Vec<AttestationRow>> {
        let mut stmt = self.connection().prepare(&format!(
            "SELECT {COLUMNS} FROM treatments WHERE to_doc = ?1 {ORDER}"
        ))?;
        let rows = stmt.query_map([to_doc], row_from)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Every stored attestation, in [`ORDER`].
    ///
    /// Whole-table reads are what the conflict view needs, and the table is
    /// small by construction: it holds one row per claim a human put their name
    /// to, not one row per citation.
    pub fn attestation_rows(&self) -> Result<Vec<AttestationRow>> {
        let mut stmt = self
            .connection()
            .prepare(&format!("SELECT {COLUMNS} FROM treatments {ORDER}"))?;
        let rows = stmt.query_map([], row_from)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Counts over the stored rows, verified or not.
    pub fn attestation_stats(&self) -> Result<AttestationStats> {
        let (rows, signers) = self.connection().query_row(
            "SELECT COUNT(*), COUNT(DISTINCT signer) FROM treatments",
            [],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
        )?;
        Ok(AttestationStats {
            rows: rows.max(0) as u64,
            signers: signers.max(0) as u64,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(signer: &str, signature: &str, treatment: &str) -> AttestationRow {
        AttestationRow {
            from_doc: "11".repeat(32),
            to_doc: "22".repeat(32),
            treatment: treatment.into(),
            from_para: Some(41),
            note: Some("stated reasoning".into()),
            signer: signer.into(),
            signature: signature.into(),
            created_at: "2026-07-20T09:00:00Z".into(),
        }
    }

    #[test]
    fn a_row_round_trips_unchanged() {
        let c = Corpus::open_in_memory().unwrap();
        let r = row("aa", "bb", "overruled");
        assert!(c.insert_attestation_row(&r).unwrap());
        assert_eq!(c.attestation_rows_about(&r.to_doc).unwrap(), vec![r]);
    }

    #[test]
    fn re_importing_the_same_attestation_is_idempotent() {
        let c = Corpus::open_in_memory().unwrap();
        let r = row("aa", "bb", "overruled");
        assert!(c.insert_attestation_row(&r).unwrap(), "first insert writes");
        assert!(
            !c.insert_attestation_row(&r).unwrap(),
            "the second insert must be ignored, not duplicated"
        );
        assert_eq!(c.attestation_rows().unwrap().len(), 1);
    }

    #[test]
    fn one_signer_may_hold_several_distinct_claims() {
        // Identity is (signer, signature), not (signer, pair): a signer who
        // attests about two different judgments must keep both rows.
        let c = Corpus::open_in_memory().unwrap();
        c.insert_attestation_row(&row("aa", "b1", "overruled"))
            .unwrap();
        let mut other = row("aa", "b2", "followed");
        other.to_doc = "33".repeat(32);
        c.insert_attestation_row(&other).unwrap();
        assert_eq!(c.attestation_rows().unwrap().len(), 2);
    }

    #[test]
    fn contradictory_rows_from_different_signers_both_survive() {
        // The design commitment, at the storage layer: disagreement is data.
        let c = Corpus::open_in_memory().unwrap();
        c.insert_attestation_row(&row("aa", "b1", "overruled"))
            .unwrap();
        c.insert_attestation_row(&row("cc", "b2", "followed"))
            .unwrap();
        let back = c.attestation_rows_about(&"22".repeat(32)).unwrap();
        assert_eq!(back.len(), 2);
        assert!(back.iter().any(|r| r.treatment == "overruled"));
        assert!(back.iter().any(|r| r.treatment == "followed"));
    }

    #[test]
    fn a_vocabulary_this_build_does_not_know_is_still_stored() {
        // The column is unconstrained on purpose: an older reader must be able
        // to hold a newer term rather than refuse the bundle carrying it.
        let c = Corpus::open_in_memory().unwrap();
        c.insert_attestation_row(&row("aa", "bb", "invented-by-a-newer-build"))
            .unwrap();
        assert_eq!(
            c.attestation_rows().unwrap()[0].treatment,
            "invented-by-a-newer-build"
        );
    }

    #[test]
    fn the_order_is_total_and_stable() {
        let c = Corpus::open_in_memory().unwrap();
        // Same timestamp and same signer: the tiebreaks have to do the work.
        for (sig, t) in [("b3", "applied"), ("b1", "followed"), ("b2", "criticised")] {
            c.insert_attestation_row(&row("aa", sig, t)).unwrap();
        }
        let first = c.attestation_rows().unwrap();
        assert_eq!(first.len(), 3);
        for _ in 0..8 {
            assert_eq!(c.attestation_rows().unwrap(), first);
        }
        // Ordered by treatment before signature, per ORDER.
        let terms: Vec<&str> = first.iter().map(|r| r.treatment.as_str()).collect();
        assert_eq!(terms, ["applied", "criticised", "followed"]);
    }

    #[test]
    fn stats_count_rows_and_distinct_signers() {
        let c = Corpus::open_in_memory().unwrap();
        assert_eq!(c.attestation_stats().unwrap(), AttestationStats::default());
        c.insert_attestation_row(&row("aa", "b1", "followed"))
            .unwrap();
        c.insert_attestation_row(&row("aa", "b2", "applied"))
            .unwrap();
        c.insert_attestation_row(&row("cc", "b3", "overruled"))
            .unwrap();
        assert_eq!(
            c.attestation_stats().unwrap(),
            AttestationStats {
                rows: 3,
                signers: 2
            }
        );
    }

    #[test]
    fn attestations_do_not_move_the_corpus_root() {
        // Treatments are excluded from the release root because a release must
        // be reproducible by recomputation and an attestation is not. If storing
        // one changed the root, two honest nodes holding different attestation
        // sets over the same judgments would fail to agree on a release.
        let c = Corpus::open_in_memory().unwrap();
        let before = c.corpus_root().unwrap();
        c.insert_attestation_row(&row("aa", "bb", "overruled"))
            .unwrap();
        assert_eq!(c.corpus_root().unwrap(), before);
    }
}
