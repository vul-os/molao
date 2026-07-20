//! Chunking: turning judgments into the units that get embedded and retrieved.
//!
//! A retrieval unit has to be small enough that its embedding means something —
//! a whole judgment averaged into one vector says little — and it has to carry a
//! **pinpoint**, because a passage a lawyer cannot cite is a passage they cannot
//! use. South African judgments are already paragraph-numbered, and the store
//! keeps that structure, so the natural chunk is the paragraph: small, coherent,
//! and citable as `[para 12]`.
//!
//! The chunker is versioned ([`CHUNKER_ID`]) and part of the index descriptor,
//! for the same reason the citation extractor is versioned: if chunking changes,
//! the vectors change, and an index built by an old chunker must be
//! distinguishable from one built by a new one rather than silently mixed.

use molao_corpus::ParagraphRow;

/// Identifier of the current chunker. Bump this if the chunking behaviour below
/// changes in any way that alters which text lands in which chunk.
pub const CHUNKER_ID: &str = "paragraph-v1";

/// Human-readable parameters, recorded in the descriptor for reproducibility.
pub const CHUNKER_PARAMS: &str = "one-chunk-per-paragraph; empty-paragraphs-skipped";

/// One indexable unit: a paragraph of a judgment, with the location that makes
/// a retrieved hit citable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chunk {
    /// Hex `DocId` of the judgment.
    pub doc_id: String,
    /// Zero-based paragraph index within the judgment — the pinpoint.
    pub para_index: u32,
    /// Printed paragraph number, if the judgment had one.
    pub para_number: Option<String>,
    /// The paragraph text.
    pub text: String,
}

/// Split a flat list of paragraph rows into chunks.
///
/// One chunk per paragraph, in the order given (the corpus returns paragraphs in
/// a stable `(doc_id, index)` order). Empty or whitespace-only paragraphs are
/// dropped — they carry no retrievable content and would only dilute the space
/// with zero-ish vectors.
///
/// Deterministic: the same corpus produces the same chunks in the same order on
/// every node, which is what lets a rebuilt index be compared against a shared
/// one chunk for chunk.
pub fn chunk_paragraphs(rows: &[ParagraphRow]) -> Vec<Chunk> {
    rows.iter()
        .filter(|r| !r.text.trim().is_empty())
        .map(|r| Chunk {
            doc_id: r.doc_id.clone(),
            para_index: r.index,
            para_number: r.number.clone(),
            text: r.text.clone(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(doc: &str, idx: u32, text: &str) -> ParagraphRow {
        ParagraphRow {
            doc_id: doc.into(),
            index: idx,
            number: Some((idx + 1).to_string()),
            text: text.into(),
        }
    }

    #[test]
    fn one_chunk_per_non_empty_paragraph() {
        let rows = vec![
            row("aa", 0, "first"),
            row("aa", 1, "   "),
            row("aa", 2, "third"),
        ];
        let chunks = chunk_paragraphs(&rows);
        assert_eq!(chunks.len(), 2, "the whitespace paragraph must be dropped");
        assert_eq!(chunks[0].text, "first");
        assert_eq!(chunks[0].para_index, 0);
        assert_eq!(chunks[1].para_index, 2, "the pinpoint is preserved");
    }

    #[test]
    fn chunking_preserves_input_order() {
        let rows = vec![
            row("aa", 0, "one"),
            row("bb", 0, "two"),
            row("bb", 1, "three"),
        ];
        let chunks = chunk_paragraphs(&rows);
        let ids: Vec<_> = chunks
            .iter()
            .map(|c| (c.doc_id.as_str(), c.para_index))
            .collect();
        assert_eq!(ids, vec![("aa", 0), ("bb", 0), ("bb", 1)]);
    }
}
