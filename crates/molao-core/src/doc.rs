//! Document identity, the structured judgment model, and provenance.
//!
//! Three ideas hold this module together:
//!
//! 1. **A judgment is identified by the hash of its canonical text**, not by a
//!    database id, a URL, or a filename. Two nodes that have never spoken agree
//!    on what `f3a9…` is. Ids in the old centralised systems were row keys and
//!    became meaningless the moment the database was gone.
//! 2. **A judgment is structured**, not a blob. Parties, court, date, case
//!    number, and *numbered paragraphs* — because a citation without a pinpoint
//!    is not much use to a lawyer, and paragraph structure is what lets the
//!    citation graph point at a place rather than a document.
//! 3. **Provenance is a first-class field, and it is plural.** A document enters
//!    a release when independent witnesses fetched it from a canonical source
//!    and agree on the bytes they saw. One person's upload is not evidence.

use serde::{Deserialize, Serialize};
use std::fmt;

/// BLAKE3 hash of a document's canonical text. The identity of a judgment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct DocId([u8; 32]);

impl DocId {
    /// Compute the id of a canonical text. See [`canonicalise`] — callers must
    /// pass text that has already been through it, or ids will not match
    /// between nodes.
    pub fn of_canonical(canonical_text: &str) -> Self {
        DocId(*blake3::hash(canonical_text.as_bytes()).as_bytes())
    }

    /// Canonicalise then hash. The usual entry point.
    pub fn of_raw(raw_text: &str) -> Self {
        Self::of_canonical(&canonicalise(raw_text))
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Short form for display — first 12 hex chars. Never use for equality.
    pub fn short(&self) -> String {
        hex::encode(&self.0[..6])
    }
}

impl fmt::Display for DocId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&hex::encode(self.0))
    }
}

impl From<DocId> for String {
    fn from(id: DocId) -> String {
        id.to_string()
    }
}

impl TryFrom<String> for DocId {
    type Error = IdError;
    fn try_from(s: String) -> Result<Self, IdError> {
        s.parse()
    }
}

impl std::str::FromStr for DocId {
    type Err = IdError;
    fn from_str(s: &str) -> Result<Self, IdError> {
        let bytes = hex::decode(s).map_err(|_| IdError::NotHex)?;
        let arr: [u8; 32] = bytes.try_into().map_err(|_| IdError::WrongLength)?;
        Ok(DocId(arr))
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IdError {
    #[error("document id is not valid hex")]
    NotHex,
    #[error("document id must be 32 bytes (64 hex chars)")]
    WrongLength,
}

/// Reduce raw extracted text to the form that gets hashed.
///
/// Judgments reach us as RTF (SAFLII's native format), PDF, or HTML, and every
/// converter disagrees about whitespace. Without canonicalisation, two nodes
/// extracting the same judgment with different tool versions would compute
/// different ids and the network would silently fork. So: normalise line
/// endings, collapse runs of whitespace, strip trailing space, drop leading and
/// trailing blank lines, and normalise the handful of typographic characters
/// that converters swap around.
///
/// This is deliberately aggressive. Formatting is not part of a judgment's
/// meaning, and a stable id matters more than round-tripping the source bytes —
/// the raw bytes are preserved separately in the [`Provenance`] record.
pub fn canonicalise(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for line in raw.replace("\r\n", "\n").replace('\r', "\n").lines() {
        let normalised: String = line
            .chars()
            .map(|c| match c {
                // Converters disagree on these; the text does not.
                '\u{2018}' | '\u{2019}' | '\u{201B}' => '\'',
                '\u{201C}' | '\u{201D}' | '\u{201F}' => '"',
                '\u{2013}' | '\u{2014}' | '\u{2212}' => '-',
                '\u{00A0}' | '\u{2007}' | '\u{202F}' | '\t' => ' ',
                other => other,
            })
            .collect();

        // Collapse internal whitespace runs.
        let mut collapsed = String::with_capacity(normalised.len());
        let mut prev_space = false;
        for c in normalised.chars() {
            if c == ' ' {
                if !prev_space {
                    collapsed.push(' ');
                }
                prev_space = true;
            } else {
                collapsed.push(c);
                prev_space = false;
            }
        }

        out.push_str(collapsed.trim_end());
        out.push('\n');
    }
    out.trim_matches('\n').to_string() + "\n"
}

/// One numbered paragraph of a judgment.
///
/// South African judgments are paragraph-numbered by convention, and lawyers
/// pinpoint by paragraph, not page. Keeping the printed number alongside our
/// own index matters: judgments skip, repeat, and restart numbers, and the
/// citation must reproduce what the judgment actually says.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Paragraph {
    /// Zero-based position in the document. Always dense and monotonic.
    pub index: u32,
    /// The number as printed, e.g. `"12"`, `"[12]"`, `"12.3"`. `None` for
    /// unnumbered matter (headings, the coram, the order).
    pub number: Option<String>,
    pub text: String,
}

/// A judgment, structured.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Judgment {
    pub id: DocId,
    /// Neutral citation as printed, e.g. `[2026] ZACC 26`.
    pub neutral_citation: Option<String>,
    /// Court code from the registry, e.g. `ZACC`.
    pub court: String,
    /// Style of cause, e.g. `Minister of Police v Mboweni`.
    pub title: String,
    /// Court's own case number(s), e.g. `CCT 306/24`.
    pub case_numbers: Vec<String>,
    /// Date of judgment, ISO 8601 (`YYYY-MM-DD`).
    pub date: Option<String>,
    /// Judge(s). Free text — SA judgments format the coram inconsistently.
    pub judges: Vec<String>,
    /// Parallel reported citations, e.g. `2020 (3) SA 123 (SCA)`.
    pub reported_citations: Vec<String>,
    pub paragraphs: Vec<Paragraph>,
}

impl Judgment {
    /// The canonical text of the judgment: paragraphs joined by blank lines.
    /// This is what [`DocId`] hashes.
    pub fn canonical_text(&self) -> String {
        let body = self
            .paragraphs
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        canonicalise(&body)
    }

    /// Does the stored id actually match the stored text?
    ///
    /// Cheap, and the single most important invariant in the system: it is what
    /// makes a judgment received from an untrusted peer safe to keep.
    pub fn verify_id(&self) -> bool {
        DocId::of_canonical(&self.canonical_text()) == self.id
    }
}

/// One witness's record of fetching a document from a canonical source.
///
/// The signature covers `(doc_id, source_url, fetched_at, raw_hash)`. A witness
/// is asserting "I went to this URL at this time and these were the bytes" —
/// nothing more. It is not asserting the document is authentic; agreement
/// between independent witnesses is what does that.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Provenance {
    pub doc_id: DocId,
    /// Where it came from — a court, gazette, or LII URL.
    pub source_url: String,
    /// RFC 3339 timestamp of the fetch.
    pub fetched_at: String,
    /// BLAKE3 of the *raw* served bytes, before any conversion. Two witnesses
    /// using different RTF converters will agree here but may not agree on
    /// extracted text, which is why both hashes exist.
    pub raw_hash: String,
    /// Ed25519 public key of the witness, hex-encoded.
    pub witness: String,
    /// Ed25519 signature over the canonical serialisation, hex-encoded.
    pub signature: String,
}

/// How much corroboration a document has. Surfaced in the UI, because lawyers
/// already reason in terms of reported versus unreported and will not accept a
/// system that flattens the distinction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProvenanceClass {
    /// Independent witnesses agreed on the raw bytes. The normal case.
    Corroborated,
    /// One witness only. Included, clearly marked, never silently.
    Single,
    /// No online source; entered by hand and reviewed by a named person.
    /// Some courts still do not publish, and excluding them entirely would
    /// quietly bias the corpus toward the well-resourced divisions.
    Manual,
}

impl ProvenanceClass {
    /// Classify by witness count against the corroboration threshold.
    pub fn from_witness_count(count: usize, threshold: usize) -> Self {
        if count >= threshold.max(2) {
            ProvenanceClass::Corroborated
        } else if count >= 1 {
            ProvenanceClass::Single
        } else {
            ProvenanceClass::Manual
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalisation_is_idempotent() {
        let raw = "  Hello   world  \r\n\r\n\tSecond\u{00A0}line   \n\n\n";
        let once = canonicalise(raw);
        assert_eq!(once, canonicalise(&once));
    }

    #[test]
    fn converter_whitespace_differences_do_not_change_the_id() {
        // The same judgment through two different RTF converters.
        let a = "In the matter between:\r\n\r\nA v B\r\n";
        let b = "In the matter between:\n\nA  v   B\n\n\n";
        assert_eq!(DocId::of_raw(a), DocId::of_raw(b));
    }

    #[test]
    fn typographic_quotes_do_not_change_the_id() {
        let curly = "the court held \u{201C}so be it\u{201D} and it\u{2019}s done";
        let straight = "the court held \"so be it\" and it's done";
        assert_eq!(DocId::of_raw(curly), DocId::of_raw(straight));
    }

    #[test]
    fn different_text_gives_different_ids() {
        assert_ne!(
            DocId::of_raw("appeal upheld"),
            DocId::of_raw("appeal dismissed")
        );
    }

    #[test]
    fn doc_id_round_trips_through_hex() {
        let id = DocId::of_raw("some judgment");
        let parsed: DocId = id.to_string().parse().unwrap();
        assert_eq!(id, parsed);
    }

    #[test]
    fn bad_doc_ids_are_rejected() {
        assert_eq!("nothex".parse::<DocId>(), Err(IdError::NotHex));
        assert_eq!("abcd".parse::<DocId>(), Err(IdError::WrongLength));
    }

    fn sample_judgment() -> Judgment {
        let paragraphs = vec![
            Paragraph {
                index: 0,
                number: None,
                text: "MBOWENI J:".into(),
            },
            Paragraph {
                index: 1,
                number: Some("1".into()),
                text: "This is an appeal.".into(),
            },
        ];
        let body = paragraphs
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        Judgment {
            id: DocId::of_raw(&body),
            neutral_citation: Some("[2026] ZACC 26".into()),
            court: "ZACC".into(),
            title: "Minister of Police v Mboweni".into(),
            case_numbers: vec!["CCT 306/24".into()],
            date: Some("2026-06-26".into()),
            judges: vec!["Mboweni J".into()],
            reported_citations: vec![],
            paragraphs,
        }
    }

    #[test]
    fn a_well_formed_judgment_verifies() {
        assert!(sample_judgment().verify_id());
    }

    #[test]
    fn tampering_with_the_text_breaks_verification() {
        // The whole point: a peer cannot hand us an altered judgment under a
        // known id.
        let mut j = sample_judgment();
        j.paragraphs[1].text = "This appeal is dismissed.".into();
        assert!(!j.verify_id());
    }

    #[test]
    fn provenance_classes_need_genuine_corroboration() {
        // A threshold below 2 must not be able to call one witness corroborated.
        assert_eq!(
            ProvenanceClass::from_witness_count(1, 1),
            ProvenanceClass::Single
        );
        assert_eq!(
            ProvenanceClass::from_witness_count(2, 2),
            ProvenanceClass::Corroborated
        );
        assert_eq!(
            ProvenanceClass::from_witness_count(0, 2),
            ProvenanceClass::Manual
        );
    }
}
