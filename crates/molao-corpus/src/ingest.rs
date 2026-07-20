//! Getting judgments into the corpus.
//!
//! Two input formats, chosen for two different contributors.
//!
//! **JSON Lines** (`.jsonl`) is for machines: one judgment per line, no
//! enclosing array, so a scraper can append to a file it is still writing and a
//! reader can stream a corpus larger than memory. It is what a bulk conversion
//! pipeline emits.
//!
//! **Plain text** (`.txt`) is for people. A registrar with a judgment nobody has
//! digitised, a law student typing up a magistrate's decision that no publisher
//! will ever touch — they get RFC-822-style headers, a blank line, and the
//! judgment. Requiring JSON from those contributors would exclude exactly the
//! judgments the commercial databases already exclude, which would make the
//! project a worse copy of what exists.
//!
//! ## Ids are computed, never accepted
//!
//! An ingest file may carry an `id`, but it is treated as an *assertion to
//! check*, not as the truth. The id is always recomputed from the text; a
//! mismatch is an error naming the file and line. Accepting a supplied id would
//! let a contributor file arbitrary text under the hash of a real judgment,
//! which is the whole attack the content-addressing exists to prevent.
//!
//! ## Region
//!
//! Both formats carry an optional region profile — a `region` field in JSON, a
//! `Region:` header in text — defaulting to [`crate::DEFAULT_REGION`]. A corpus
//! can hold judgments from several jurisdictions at once; South Africa is the
//! first profile, not an assumption baked into the store.
//!
//! ## One bad record does not fail a run
//!
//! [`ingest_path`] collects per-record errors and keeps going, returning them in
//! the [`IngestReport`]. A 130 000-line corpus dump that aborts on line 4 is
//! useless; the caller decides whether to treat errors as fatal (the `molao
//! ingest` command does, by exit code, after reporting all of them).

use crate::error::{CorpusError, Result};
use crate::Corpus;
use molao_core::{DocId, Judgment, Paragraph, Provenance};
use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::{Path, PathBuf};

/// A judgment plus the provenance records that came with it.
#[derive(Debug, Clone, PartialEq)]
pub struct IngestedJudgment {
    /// The judgment, with its id computed from its text.
    pub judgment: Judgment,
    /// Witness records, possibly empty (then it classifies as `Manual`).
    pub provenance: Vec<Provenance>,
    /// Region profile to file it under. Defaults to
    /// [`crate::DEFAULT_REGION`] when the source does not say.
    pub region: String,
}

/// What one ingest run did.
#[derive(Debug, Clone, Default)]
pub struct IngestReport {
    /// Files read.
    pub files: usize,
    /// Judgments successfully inserted.
    pub inserted: usize,
    /// Citation edges that [`Corpus::relink`] resolved afterwards.
    pub relinked: usize,
    /// Records that failed, as `(location, reason)`. Location is
    /// `path:line` for JSON Lines, or the path for a text file.
    pub errors: Vec<(String, String)>,
}

/// Paragraph shape accepted in JSON: either a bare string or an object with an
/// optional printed number.
///
/// Both are accepted because both are natural, and rejecting the terse form
/// would make hand-written test fixtures needlessly verbose.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ParagraphInput {
    /// Just the text; no printed number.
    Text(String),
    /// Text with the number as printed.
    Numbered {
        /// The number as printed, e.g. `"12"`.
        #[serde(default)]
        number: Option<String>,
        /// Paragraph text.
        text: String,
    },
}

/// One JSON Lines record.
///
/// Every field except `court`, `title`, and the body is optional — a judgment
/// with no neutral citation is common in the older reports, and refusing it
/// would bias the corpus toward the recent and the well-published.
#[derive(Debug, Clone, Deserialize)]
pub struct JudgmentRecord {
    /// Optional claimed id. Checked against the recomputed id, never trusted.
    #[serde(default)]
    pub id: Option<String>,
    /// Region profile, e.g. `ZA`. Defaults to [`crate::DEFAULT_REGION`].
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    #[allow(missing_docs)]
    pub neutral_citation: Option<String>,
    /// Court code, e.g. `ZACC`.
    pub court: String,
    /// Style of cause.
    pub title: String,
    #[serde(default)]
    #[allow(missing_docs)]
    pub case_numbers: Vec<String>,
    #[serde(default)]
    #[allow(missing_docs)]
    pub date: Option<String>,
    #[serde(default)]
    #[allow(missing_docs)]
    pub judges: Vec<String>,
    #[serde(default)]
    #[allow(missing_docs)]
    pub reported_citations: Vec<String>,
    /// Structured paragraphs. Mutually exclusive with `text`.
    #[serde(default)]
    pub paragraphs: Vec<ParagraphInput>,
    /// Whole body as one blob; split on blank lines. Convenient for scrapers
    /// that never had paragraph structure to begin with.
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    #[allow(missing_docs)]
    pub provenance: Vec<ProvenanceRecord>,
}

/// Provenance as it appears in an ingest file — same as
/// [`molao_core::Provenance`] but without the `doc_id`, which is filled in from
/// the computed id so a file cannot claim provenance for a different document.
#[derive(Debug, Clone, Deserialize)]
pub struct ProvenanceRecord {
    #[allow(missing_docs)]
    pub source_url: String,
    #[allow(missing_docs)]
    pub fetched_at: String,
    #[allow(missing_docs)]
    pub raw_hash: String,
    #[allow(missing_docs)]
    pub witness: String,
    #[allow(missing_docs)]
    pub signature: String,
}

impl JudgmentRecord {
    /// Turn a record into a judgment, computing and checking the id.
    pub fn build(self, location: &str) -> Result<IngestedJudgment> {
        let invalid = |reason: &str| CorpusError::InvalidRecord {
            location: location.to_string(),
            reason: reason.to_string(),
        };

        if self.court.trim().is_empty() {
            return Err(invalid("court code is empty"));
        }
        if self.title.trim().is_empty() {
            return Err(invalid("title is empty"));
        }

        let mut paras: Vec<(Option<String>, String)> = Vec::new();
        for p in self.paragraphs {
            match p {
                ParagraphInput::Text(t) => paras.push(split_leading_number(&t)),
                ParagraphInput::Numbered { number, text } => paras.push((number, text)),
            }
        }
        if let Some(body) = &self.text {
            for block in split_blocks(body) {
                paras.push(split_leading_number(&block));
            }
        }
        paras.retain(|(_, t)| !t.trim().is_empty());
        if paras.is_empty() {
            return Err(invalid("judgment has no text"));
        }

        let judgment = assemble(
            self.neutral_citation,
            self.court,
            self.title,
            self.case_numbers,
            self.date,
            self.judges,
            self.reported_citations,
            paras,
        );

        // The claimed id is checked, not trusted. See module docs.
        if let Some(claimed) = &self.id {
            if claimed != &judgment.id.to_string() {
                return Err(invalid(&format!(
                    "id in file ({claimed}) is not the hash of the text ({})",
                    judgment.id
                )));
            }
        }

        let provenance = self
            .provenance
            .into_iter()
            .map(|p| Provenance {
                doc_id: judgment.id,
                source_url: p.source_url,
                fetched_at: p.fetched_at,
                raw_hash: p.raw_hash,
                witness: p.witness,
                signature: p.signature,
            })
            .collect();

        Ok(IngestedJudgment {
            judgment,
            provenance,
            region: crate::normalise_region(self.region.as_deref().unwrap_or_default()),
        })
    }
}

/// Build a [`Judgment`] from its parts, computing the id from the text.
#[allow(clippy::too_many_arguments)]
fn assemble(
    neutral_citation: Option<String>,
    court: String,
    title: String,
    case_numbers: Vec<String>,
    date: Option<String>,
    judges: Vec<String>,
    reported_citations: Vec<String>,
    paras: Vec<(Option<String>, String)>,
) -> Judgment {
    let paragraphs: Vec<Paragraph> = paras
        .into_iter()
        .enumerate()
        .map(|(i, (number, text))| Paragraph {
            index: i as u32,
            number,
            text: text.trim().to_string(),
        })
        .collect();

    // Must match Judgment::canonical_text exactly, or nothing would verify.
    let body = paragraphs
        .iter()
        .map(|p| p.text.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");

    Judgment {
        id: DocId::of_raw(&body),
        neutral_citation: neutral_citation.filter(|s| !s.trim().is_empty()),
        court: court.trim().to_uppercase(),
        title: title.trim().to_string(),
        case_numbers,
        date: date.filter(|s| !s.trim().is_empty()),
        judges,
        reported_citations,
        paragraphs,
    }
}

/// Split a body into paragraph blocks on blank lines.
fn split_blocks(body: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut current = String::new();
    for line in body.replace("\r\n", "\n").lines() {
        if line.trim().is_empty() {
            if !current.trim().is_empty() {
                blocks.push(current.trim().to_string());
            }
            current.clear();
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(line.trim());
        }
    }
    if !current.trim().is_empty() {
        blocks.push(current.trim().to_string());
    }
    blocks
}

/// Peel a printed paragraph number off the front of a block.
///
/// Recognises `[12]`, `12.`, and `(12)` — the three forms South African
/// judgments actually use, including sub-numbering like `12.3`. The marker is
/// moved out of the text and into [`Paragraph::number`], so the hashed text is
/// prose only and two transcriptions that differ solely in how they punctuate
/// the numbering produce the same id.
fn split_leading_number(block: &str) -> (Option<String>, String) {
    let t = block.trim_start();

    // [12] or [12.3]
    if let Some(rest) = t.strip_prefix('[') {
        if let Some(close) = rest.find(']') {
            let inner = &rest[..close];
            if is_paragraph_number(inner) {
                return (
                    Some(inner.to_string()),
                    rest[close + 1..].trim().to_string(),
                );
            }
        }
    }

    // (12)
    if let Some(rest) = t.strip_prefix('(') {
        if let Some(close) = rest.find(')') {
            let inner = &rest[..close];
            if is_paragraph_number(inner) {
                return (
                    Some(inner.to_string()),
                    rest[close + 1..].trim().to_string(),
                );
            }
        }
    }

    // 12. — but only when a space follows, so a decimal amount ("1.5 million")
    // or a date is not mistaken for a paragraph marker.
    if let Some(dot) = t.find(". ") {
        let head = &t[..dot];
        if is_paragraph_number(head) {
            return (Some(head.to_string()), t[dot + 2..].trim().to_string());
        }
    }

    (None, t.to_string())
}

/// Digits, optionally dot-separated, at most six characters — `12`, `12.3`.
fn is_paragraph_number(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 6
        && s.chars().all(|c| c.is_ascii_digit() || c == '.')
        && s.chars().any(|c| c.is_ascii_digit())
}

/// Parse the plain-text format: `Key: Value` headers, a blank line, then the
/// judgment.
///
/// Header keys are matched case-insensitively and ignore `-`, `_`, and spaces,
/// so `Neutral Citation`, `neutral-citation`, and `NEUTRAL_CITATION` are one
/// key. Repeatable keys (`Case-Number`, `Judge`, `Reported`) may appear more
/// than once, and a comma-separated value is split.
///
/// Unknown headers are ignored rather than rejected: a contributor adding
/// `Source: registrar's copy` should not have their submission refused.
pub fn parse_text(input: &str, location: &str) -> Result<IngestedJudgment> {
    let normalised = input.replace("\r\n", "\n");
    let (header_block, body) = match normalised.find("\n\n") {
        Some(i) => (&normalised[..i], &normalised[i + 2..]),
        // No blank line: treat the whole thing as headers only, which will fail
        // the "no text" check below with a message that says so.
        None => (normalised.as_str(), ""),
    };

    let invalid = |reason: &str| CorpusError::InvalidRecord {
        location: location.to_string(),
        reason: reason.to_string(),
    };

    let mut court = String::new();
    let mut title = String::new();
    let mut neutral = None;
    let mut date = None;
    let mut case_numbers = Vec::new();
    let mut judges = Vec::new();
    let mut reported = Vec::new();
    let mut region = String::new();

    for line in header_block.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            return Err(invalid(&format!(
                "header line is not `Key: Value`: {:?}",
                line.trim()
            )));
        };
        let key: String = key
            .chars()
            .filter(|c| c.is_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect();
        let value = value.trim().to_string();
        if value.is_empty() {
            continue;
        }
        match key.as_str() {
            "court" => court = value,
            "title" | "case" | "styleofcause" | "parties" => title = value,
            "neutralcitation" | "neutral" | "citation" => neutral = Some(value),
            "date" | "dateofjudgment" => date = Some(value),
            "casenumber" | "casenumbers" | "caseno" => case_numbers.extend(split_list(&value)),
            "judge" | "judges" | "coram" => judges.extend(split_list(&value)),
            "reported" | "reportedcitations" | "parallel" => reported.extend(split_list(&value)),
            "region" | "jurisdiction" | "country" => region = value,
            _ => {}
        }
    }

    if court.is_empty() {
        // Recoverable in one common case: the neutral citation carries the code.
        if let Some(n) = &neutral {
            if let Some(c) = molao_cite::extract(n)
                .into_iter()
                .find_map(|c| match c.citation {
                    molao_cite::Citation::Neutral { court, .. } => Some(court),
                    _ => None,
                })
            {
                court = c;
            }
        }
    }
    if court.is_empty() {
        return Err(invalid(
            "no `Court:` header and no court code in the citation",
        ));
    }
    if title.is_empty() {
        return Err(invalid("no `Title:` header"));
    }

    let paras: Vec<(Option<String>, String)> = split_blocks(body)
        .iter()
        .map(|b| split_leading_number(b))
        .filter(|(_, t)| !t.trim().is_empty())
        .collect();
    if paras.is_empty() {
        return Err(invalid("no judgment text after the header block"));
    }

    Ok(IngestedJudgment {
        judgment: assemble(
            neutral,
            court,
            title,
            case_numbers,
            date,
            judges,
            reported,
            paras,
        ),
        provenance: Vec::new(),
        region: crate::normalise_region(&region),
    })
}

/// Split a comma- or semicolon-separated header value.
fn split_list(value: &str) -> Vec<String> {
    value
        .split([',', ';'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Read a JSON Lines stream, one judgment per line.
///
/// Blank lines are skipped. Errors are per-line and returned alongside the
/// successes rather than aborting: see the module docs.
pub fn read_jsonl(
    reader: impl BufRead,
    path: &str,
) -> (Vec<IngestedJudgment>, Vec<(String, String)>) {
    let mut out = Vec::new();
    let mut errors = Vec::new();
    for (n, line) in reader.lines().enumerate() {
        let location = format!("{path}:{}", n + 1);
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                errors.push((location, e.to_string()));
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<JudgmentRecord>(&line) {
            Ok(rec) => match rec.build(&location) {
                Ok(j) => out.push(j),
                Err(e) => errors.push((location, e.to_string())),
            },
            Err(e) => errors.push((location, e.to_string())),
        }
    }
    (out, errors)
}

/// Ingest a file or a directory tree into the corpus, then relink.
///
/// Dispatch is by extension: `.jsonl` and `.ndjson` are JSON Lines, `.txt` is
/// the plain-text format. Anything else in a directory is skipped silently —
/// corpus directories collect `README`s and checksums, and warning about them
/// every run trains people to ignore warnings.
///
/// Directory traversal is sorted, so an ingest run is reproducible and its log
/// is diffable.
pub fn ingest_path(corpus: &mut Corpus, path: impl AsRef<Path>) -> Result<IngestReport> {
    let mut report = IngestReport::default();
    let mut files = Vec::new();
    collect_files(path.as_ref(), &mut files)?;
    files.sort();

    for file in files {
        let name = file.display().to_string();
        let ext = file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        let (records, errors) = match ext.as_str() {
            "jsonl" | "ndjson" => {
                let f = std::fs::File::open(&file)?;
                read_jsonl(std::io::BufReader::new(f), &name)
            }
            "txt" => {
                let text = std::fs::read_to_string(&file)?;
                match parse_text(&text, &name) {
                    Ok(j) => (vec![j], Vec::new()),
                    Err(e) => (Vec::new(), vec![(name.clone(), e.to_string())]),
                }
            }
            _ => continue,
        };

        report.files += 1;
        report.errors.extend(errors);
        for rec in records {
            match corpus.insert_judgment_in_region(&rec.judgment, &rec.provenance, &rec.region) {
                Ok(()) => report.inserted += 1,
                Err(e) => report.errors.push((name.clone(), e.to_string())),
            }
        }
    }

    // Always relink: the whole point is that a judgment ingested late resolves
    // the edges that were waiting for it.
    report.relinked = corpus.relink()?;
    Ok(report)
}

fn collect_files(path: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    if path.is_dir() {
        let mut entries: Vec<PathBuf> = std::fs::read_dir(path)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();
        entries.sort();
        for e in entries {
            collect_files(&e, out)?;
        }
    } else if path.is_file() {
        out.push(path.to_path_buf());
    } else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("no such file or directory: {}", path.display()),
        )
        .into());
    }
    Ok(())
}

/// Fixture builders shared by tests across the workspace.
///
/// Public because `molao-graph` and `molao-node` build corpora in their own
/// tests and duplicating this would let the fixtures drift apart. Not part of
/// the supported API — nothing in a running node calls it.
pub mod test_support {
    use super::*;

    /// Build a judgment with a correctly computed id.
    ///
    /// `paragraphs` are plain text; the first is treated as paragraph 0 and
    /// numbering starts at 1 for display.
    pub fn judgment(court: &str, neutral: &str, title: &str, paragraphs: &[&str]) -> Judgment {
        let paras: Vec<(Option<String>, String)> = paragraphs
            .iter()
            .enumerate()
            .map(|(i, t)| (Some((i + 1).to_string()), (*t).to_string()))
            .collect();
        assemble(
            Some(neutral.to_string()),
            court.to_string(),
            title.to_string(),
            Vec::new(),
            Some("2026-01-01".to_string()),
            Vec::new(),
            Vec::new(),
            paras,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_jsonl_record_becomes_a_judgment_with_a_computed_id() {
        let line = r#"{"court":"ZACC","title":"A v B","neutral_citation":"[2026] ZACC 1","paragraphs":["First.","Second."]}"#;
        let (out, errs) = read_jsonl(line.as_bytes(), "test.jsonl");
        assert!(errs.is_empty(), "{errs:?}");
        assert_eq!(out.len(), 1);
        assert!(out[0].judgment.verify_id());
        assert_eq!(out[0].judgment.paragraphs.len(), 2);
        assert_eq!(out[0].judgment.court, "ZACC");
    }

    #[test]
    fn a_claimed_id_that_does_not_match_the_text_is_rejected() {
        // The attack this exists to stop: filing arbitrary text under a real
        // judgment's hash.
        let line = format!(
            r#"{{"id":"{}","court":"ZACC","title":"A v B","text":"Some text."}}"#,
            "aa".repeat(32)
        );
        let (out, errs) = read_jsonl(line.as_bytes(), "evil.jsonl");
        assert!(out.is_empty());
        assert_eq!(errs.len(), 1);
        assert!(
            errs[0].1.contains("is not the hash of the text"),
            "{errs:?}"
        );
    }

    #[test]
    fn a_correct_claimed_id_is_accepted() {
        let j = test_support::judgment("ZACC", "[2026] ZACC 1", "A v B", &["Only paragraph."]);
        let line = serde_json::json!({
            "id": j.id.to_string(),
            "court": "ZACC",
            "title": "A v B",
            "neutral_citation": "[2026] ZACC 1",
            "paragraphs": [{"number": "1", "text": "Only paragraph."}],
        })
        .to_string();
        let (out, errs) = read_jsonl(line.as_bytes(), "ok.jsonl");
        assert!(errs.is_empty(), "{errs:?}");
        assert_eq!(out[0].judgment.id, j.id);
    }

    #[test]
    fn one_bad_line_does_not_lose_the_good_ones() {
        let input = concat!(
            r#"{"court":"ZACC","title":"A v B","text":"One."}"#,
            "\n",
            "{ not json at all\n",
            "\n",
            r#"{"court":"ZASCA","title":"C v D","text":"Two."}"#,
            "\n",
        );
        let (out, errs) = read_jsonl(input.as_bytes(), "mixed.jsonl");
        assert_eq!(out.len(), 2);
        assert_eq!(errs.len(), 1);
        assert!(errs[0].0.ends_with(":2"), "wrong line reported: {errs:?}");
    }

    #[test]
    fn records_missing_required_fields_are_reported_not_silently_dropped() {
        for (line, expect) in [
            (
                r#"{"court":"","title":"A","text":"x"}"#,
                "court code is empty",
            ),
            (
                r#"{"court":"ZACC","title":"","text":"x"}"#,
                "title is empty",
            ),
            (r#"{"court":"ZACC","title":"A","text":"   "}"#, "no text"),
        ] {
            let (out, errs) = read_jsonl(line.as_bytes(), "bad.jsonl");
            assert!(out.is_empty(), "{line}");
            assert_eq!(errs.len(), 1, "{line}");
            assert!(errs[0].1.contains(expect), "{line}: {errs:?}");
        }
    }

    #[test]
    fn a_text_blob_splits_into_paragraphs_on_blank_lines() {
        let line =
            r#"{"court":"ZACC","title":"A v B","text":"[1] First para.\n\n[2] Second para."}"#;
        let (out, _) = read_jsonl(line.as_bytes(), "t.jsonl");
        let j = &out[0].judgment;
        assert_eq!(j.paragraphs.len(), 2);
        assert_eq!(j.paragraphs[0].number.as_deref(), Some("1"));
        assert_eq!(j.paragraphs[0].text, "First para.");
        assert_eq!(j.paragraphs[1].number.as_deref(), Some("2"));
    }

    #[test]
    fn the_text_format_parses() {
        let doc = "\
Court: ZASCA
Neutral Citation: [2026] ZASCA 14
Title: Khumalo v Sibanda
Date: 2026-03-04
Case Number: 442/2025
Judges: Khampepe JA, Petse JA
Reported: 2026 (2) SA 55 (SCA)

[1] This is the first paragraph.

[2] This is the second, which cites [1995] ZACC 3.
";
        let ing = parse_text(doc, "k.txt").unwrap();
        let j = &ing.judgment;
        assert_eq!(j.court, "ZASCA");
        assert_eq!(j.title, "Khumalo v Sibanda");
        assert_eq!(j.neutral_citation.as_deref(), Some("[2026] ZASCA 14"));
        assert_eq!(j.date.as_deref(), Some("2026-03-04"));
        assert_eq!(j.case_numbers, vec!["442/2025"]);
        assert_eq!(j.judges, vec!["Khampepe JA", "Petse JA"]);
        assert_eq!(j.reported_citations, vec!["2026 (2) SA 55 (SCA)"]);
        assert_eq!(j.paragraphs.len(), 2);
        assert!(j.verify_id());
    }

    #[test]
    fn header_keys_are_forgiving_about_case_and_separators() {
        let a = parse_text(
            "COURT: ZACC\nNEUTRAL_CITATION: [2026] ZACC 1\ntitle: A v B\n\nText.",
            "a.txt",
        )
        .unwrap();
        let b = parse_text(
            "Court: ZACC\nNeutral-Citation: [2026] ZACC 1\nTitle: A v B\n\nText.",
            "b.txt",
        )
        .unwrap();
        assert_eq!(a.judgment.id, b.judgment.id);
        assert_eq!(a.judgment.neutral_citation, b.judgment.neutral_citation);
    }

    #[test]
    fn the_court_can_be_recovered_from_the_neutral_citation() {
        // A contributor who gives a citation but forgets the Court header
        // should not be turned away.
        let j = parse_text(
            "Neutral Citation: [2026] ZAWCHC 88\nTitle: A v B\n\nText.",
            "c.txt",
        )
        .unwrap();
        assert_eq!(j.judgment.court, "ZAWCHC");
    }

    #[test]
    fn unusable_text_files_report_why() {
        for (doc, expect) in [
            ("Title: A v B\n\nText.", "no `Court:` header"),
            ("Court: ZACC\n\nText.", "no `Title:` header"),
            ("Court: ZACC\nTitle: A v B\n\n   ", "no judgment text"),
            ("Court ZACC no colon here\n\nText.", "not `Key: Value`"),
        ] {
            let err = parse_text(doc, "x.txt").unwrap_err().to_string();
            assert!(err.contains(expect), "{doc:?} gave {err}");
        }
    }

    #[test]
    fn unknown_headers_are_ignored_not_fatal() {
        let j = parse_text(
            "Court: ZACC\nTitle: A v B\nSource: registrar's photocopy\n\nText.",
            "u.txt",
        )
        .unwrap();
        assert_eq!(j.judgment.court, "ZACC");
    }

    #[test]
    fn paragraph_markers_are_recognised_in_every_common_form() {
        assert_eq!(
            split_leading_number("[12] Text here"),
            (Some("12".into()), "Text here".into())
        );
        assert_eq!(
            split_leading_number("(12) Text here"),
            (Some("12".into()), "Text here".into())
        );
        assert_eq!(
            split_leading_number("12. Text here"),
            (Some("12".into()), "Text here".into())
        );
        assert_eq!(
            split_leading_number("12.3 Text here"),
            (None, "12.3 Text here".into())
        );
    }

    #[test]
    fn prose_is_not_mistaken_for_a_paragraph_marker() {
        // The false positives that would eat the first words of a paragraph.
        for text in [
            "The award of R1.5 million was excessive.",
            "In 2019. The parties met.",
            "[Editorial note] omitted",
            "(a) the first ground",
        ] {
            let (number, out) = split_leading_number(text);
            assert_eq!(number, None, "{text:?} was read as numbered");
            assert_eq!(out, text);
        }
    }

    #[test]
    fn ingesting_a_directory_is_order_independent_and_relinks() {
        let dir = std::env::temp_dir().join(format!("molao-ingest-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Deliberately named so the citing judgment sorts first.
        std::fs::write(
            dir.join("a-citing.jsonl"),
            r#"{"court":"ZASCA","title":"M v R","neutral_citation":"[2020] ZASCA 9","text":"Following [1995] ZACC 3."}"#,
        )
        .unwrap();
        std::fs::write(
            dir.join("b-cited.txt"),
            "Court: ZACC\nNeutral Citation: [1995] ZACC 3\nTitle: S v Ndlovu\n\n[1] Held.",
        )
        .unwrap();
        std::fs::write(dir.join("README.md"), "not a judgment").unwrap();

        let mut c = Corpus::open_in_memory().unwrap();
        let report = ingest_path(&mut c, &dir).unwrap();
        assert!(report.errors.is_empty(), "{:?}", report.errors);
        assert_eq!(report.files, 2, "the README must be skipped");
        assert_eq!(report.inserted, 2);
        assert_eq!(report.relinked, 1, "the late-arriving target must relink");
        assert_eq!(c.stats().unwrap().edges, 1);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_region_can_be_given_in_either_format_and_defaults_otherwise() {
        let (out, errs) = read_jsonl(
            r#"{"court":"KESC","title":"Wanjiku v AG","region":"ke","text":"A petition."}"#
                .as_bytes(),
            "r.jsonl",
        );
        assert!(errs.is_empty(), "{errs:?}");
        assert_eq!(out[0].region, "KE");

        let (out, _) = read_jsonl(
            r#"{"court":"ZACC","title":"A v B","text":"Text."}"#.as_bytes(),
            "d.jsonl",
        );
        assert_eq!(out[0].region, crate::DEFAULT_REGION);

        let t = parse_text(
            "Court: KESC\nRegion: KE\nTitle: Wanjiku v AG\n\n[1] A petition.",
            "r.txt",
        )
        .unwrap();
        assert_eq!(t.region, "KE");

        let t = parse_text("Court: ZACC\nTitle: A v B\n\n[1] Text.", "d.txt").unwrap();
        assert_eq!(t.region, crate::DEFAULT_REGION);
    }

    #[test]
    fn a_missing_path_is_an_error_not_a_silent_no_op() {
        let mut c = Corpus::open_in_memory().unwrap();
        assert!(ingest_path(&mut c, "/nonexistent/molao/path").is_err());
    }
}
