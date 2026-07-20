//! Treatment attestations — **designed, not built.**
//!
//! # Status
//!
//! Nothing writes these. There is no extractor, no UI, and no attestation flow.
//! The `treatments` table exists in the schema and the types exist here so the
//! data model is fixed and reviewable before anything is built on it. The node
//! must say "not yet available" wherever treatment would be shown. Do not let
//! this module's existence imply a working feature.
//!
//! # Why it is modelled this way
//!
//! [`molao_cite`] answers "does A cite B?" — a fact, recomputable by anyone
//! from the text, which is why the citation graph can be verified rather than
//! trusted.
//!
//! "Did A *follow* B, or *distinguish* it, or *overrule* it?" is a different
//! kind of claim. It is an interpretation. Two competent lawyers read the same
//! paragraph and disagree, and no amount of re-running an extractor settles it.
//! A classifier that emitted treatments as if they were facts would be the most
//! dangerous thing in this system: silently wrong headnotes are how a
//! practitioner cites overruled authority to a court.
//!
//! So treatments are **signed attestations**, not derived data. Somebody puts
//! their name to the claim. The record carries who said it, and a reader can
//! weigh a Law Faculty's attestation differently from an anonymous key's. The
//! graph can hold contradictory attestations about the same pair without being
//! broken — because that is the actual state of the law when practitioners
//! disagree, and flattening it to one answer would be a lie.
//!
//! This is also why treatments are deliberately **excluded from the release
//! root**: a release must be reproducible from the corpus by recomputation, and
//! attestations are not recomputable. They travel as their own signed objects.
//!
//! # Not built, specifically
//!
//! - No signature verification (the `signature` field is stored, never checked).
//! - No attestation ingest, gossip, or conflict presentation.
//! - No trust policy for deciding which signers a reader cares about.

use molao_core::DocId;
use serde::{Deserialize, Serialize};

/// How a later judgment treated an earlier one.
///
/// The five terms South African practice actually uses. Deliberately not
/// extensible into vaguer categories ("considered", "referred to") — those add
/// no information a citation edge does not already carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Treatment {
    /// Treated as binding and applied to like facts.
    Followed,
    /// Its principle extended to different facts.
    Applied,
    /// Held not to govern, on the facts. Not a criticism.
    Distinguished,
    /// Doubted or disapproved, but not displaced.
    Criticised,
    /// Deprived of authority by a court competent to do so.
    ///
    /// The one that matters most and the one a wrong answer is most costly on,
    /// which is the whole argument for attestations over classifiers.
    Overruled,
}

impl Treatment {
    /// Stable wire string. Matches the `serde` representation; both are part of
    /// the storage format, so they must not drift.
    pub fn as_str(self) -> &'static str {
        match self {
            Treatment::Followed => "followed",
            Treatment::Applied => "applied",
            Treatment::Distinguished => "distinguished",
            Treatment::Criticised => "criticised",
            Treatment::Overruled => "overruled",
        }
    }

    /// Parse a stored value. `None` for anything unrecognised — a future
    /// version's vocabulary must not crash this one.
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "followed" => Treatment::Followed,
            "applied" => Treatment::Applied,
            "distinguished" => Treatment::Distinguished,
            "criticised" | "criticized" => Treatment::Criticised,
            "overruled" => Treatment::Overruled,
            _ => return None,
        })
    }
}

/// One signer's claim about how one judgment treated another.
///
/// The signature covers the claim, not the judgment — the attestor is saying
/// "I, this key, assert this reading", and takes responsibility for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Attestation {
    /// The later judgment doing the treating.
    pub from_doc: DocId,
    /// The earlier judgment being treated.
    pub to_doc: DocId,
    /// The claim.
    pub treatment: Treatment,
    /// Paragraph of the citing judgment the claim rests on, if pinpointed.
    pub from_para: Option<u32>,
    /// Free-text reasoning. Short, and shown next to the claim so a reader can
    /// judge it rather than take it.
    pub note: Option<String>,
    /// Ed25519 public key of the attestor, hex.
    pub signer: String,
    /// Ed25519 signature over [`Attestation::signing_bytes`], hex.
    ///
    /// **Stored but never verified** — no verification path exists yet. Treat
    /// any value here as unchecked input.
    pub signature: String,
    /// RFC 3339 timestamp.
    pub created_at: String,
}

impl Attestation {
    /// Canonical bytes an attestor signs.
    ///
    /// Length-prefixed and fixed-order for the same reason as
    /// [`molao_core::Manifest::signing_bytes`]: without length prefixes, moving
    /// a character across a field boundary yields identical bytes and one
    /// claim's signature would validate another.
    ///
    /// Defined now, unused now. Fixing it before anything signs means the first
    /// attestation ever made is still verifiable by later code.
    pub fn signing_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"molao-treatment-v1\n");
        let mut field = |b: &[u8]| {
            out.extend_from_slice(&(b.len() as u64).to_be_bytes());
            out.extend_from_slice(b);
        };
        field(self.from_doc.to_string().as_bytes());
        field(self.to_doc.to_string().as_bytes());
        field(self.treatment.as_str().as_bytes());
        field(
            self.from_para
                .map(|p| p.to_string())
                .unwrap_or_default()
                .as_bytes(),
        );
        field(self.note.as_deref().unwrap_or("").as_bytes());
        field(self.signer.as_bytes());
        field(self.created_at.as_bytes());
        out
    }
}

/// Store an attestation.
///
/// Provided so the table is exercised and the shape is real rather than
/// aspirational. **It does not verify the signature**, because no verification
/// path exists yet; callers must not treat a stored attestation as a checked
/// one.
pub fn store(conn: &rusqlite::Connection, a: &Attestation) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO treatments \
           (from_doc, to_doc, treatment, from_para, note, signer, signature, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            a.from_doc.to_string(),
            a.to_doc.to_string(),
            a.treatment.as_str(),
            a.from_para,
            a.note,
            a.signer,
            a.signature,
            a.created_at,
        ],
    )?;
    Ok(())
}

/// Every attestation about a judgment, ordered for stable display.
///
/// Returns contradictory attestations side by side, deliberately: see the
/// module docs.
pub fn for_doc(conn: &rusqlite::Connection, to_doc: &DocId) -> rusqlite::Result<Vec<Attestation>> {
    let mut stmt = conn.prepare(
        "SELECT from_doc, treatment, from_para, note, signer, signature, created_at \
         FROM treatments WHERE to_doc = ?1 ORDER BY created_at, signer",
    )?;
    let to = *to_doc;
    let rows = stmt.query_map([to.to_string()], |r| {
        let from: String = r.get(0)?;
        let treatment: String = r.get(1)?;
        Ok((
            from,
            treatment,
            r.get::<_, Option<u32>>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
            r.get::<_, String>(6)?,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (from, treatment, from_para, note, signer, signature, created_at) = row?;
        // Unparseable rows are skipped rather than fatal: a reader on an older
        // build must still be able to show the attestations it understands.
        let (Ok(from_doc), Some(treatment)) = (from.parse(), Treatment::parse(&treatment)) else {
            tracing::warn!("skipping unreadable treatment attestation");
            continue;
        };
        out.push(Attestation {
            from_doc,
            to_doc: to,
            treatment,
            from_para,
            note,
            signer,
            signature,
            created_at,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use molao_corpus::Corpus;

    fn doc(seed: &str) -> DocId {
        DocId::of_raw(seed)
    }

    fn attestation(t: Treatment) -> Attestation {
        Attestation {
            from_doc: doc("later judgment"),
            to_doc: doc("earlier judgment"),
            treatment: t,
            from_para: Some(41),
            note: Some("The reasoning is expressly departed from.".into()),
            signer: "aa".repeat(32),
            signature: "bb".repeat(64),
            created_at: "2026-07-20T09:00:00Z".into(),
        }
    }

    #[test]
    fn treatment_strings_round_trip() {
        for t in [
            Treatment::Followed,
            Treatment::Applied,
            Treatment::Distinguished,
            Treatment::Criticised,
            Treatment::Overruled,
        ] {
            assert_eq!(Treatment::parse(t.as_str()), Some(t));
        }
        assert_eq!(Treatment::parse("criticized"), Some(Treatment::Criticised));
        assert_eq!(Treatment::parse("considered"), None);
    }

    #[test]
    fn attestations_round_trip_through_the_store() {
        let c = Corpus::open_in_memory().unwrap();
        store(c.connection(), &attestation(Treatment::Overruled)).unwrap();
        let back = for_doc(c.connection(), &doc("earlier judgment")).unwrap();
        assert_eq!(back, vec![attestation(Treatment::Overruled)]);
    }

    #[test]
    fn contradictory_attestations_both_survive() {
        // The design commitment: disagreement is data, not corruption.
        let c = Corpus::open_in_memory().unwrap();
        let mut followed = attestation(Treatment::Followed);
        followed.signer = "cc".repeat(32);
        store(c.connection(), &attestation(Treatment::Overruled)).unwrap();
        store(c.connection(), &followed).unwrap();

        let back = for_doc(c.connection(), &doc("earlier judgment")).unwrap();
        assert_eq!(back.len(), 2);
        assert!(back.iter().any(|a| a.treatment == Treatment::Overruled));
        assert!(back.iter().any(|a| a.treatment == Treatment::Followed));
    }

    #[test]
    fn signing_bytes_are_unambiguous_across_field_boundaries() {
        let mut a = attestation(Treatment::Followed);
        let mut b = attestation(Treatment::Followed);
        a.note = Some("ab".into());
        a.signer = "c".into();
        b.note = Some("a".into());
        b.signer = "bc".into();
        assert_ne!(a.signing_bytes(), b.signing_bytes());
    }

    #[test]
    fn changing_the_claim_changes_the_signed_bytes() {
        let followed = attestation(Treatment::Followed);
        let overruled = attestation(Treatment::Overruled);
        assert_ne!(followed.signing_bytes(), overruled.signing_bytes());
    }

    #[test]
    fn a_row_with_an_unknown_treatment_is_skipped_not_fatal() {
        let c = Corpus::open_in_memory().unwrap();
        c.connection()
            .execute(
                "INSERT INTO treatments \
                   (from_doc, to_doc, treatment, signer, signature, created_at) \
                 VALUES (?1, ?2, 'invented-by-a-newer-build', 'k', 's', 't')",
                rusqlite::params![
                    doc("later judgment").to_string(),
                    doc("earlier judgment").to_string()
                ],
            )
            .unwrap();
        store(c.connection(), &attestation(Treatment::Followed)).unwrap();
        assert_eq!(
            for_doc(c.connection(), &doc("earlier judgment"))
                .unwrap()
                .len(),
            1
        );
    }
}
