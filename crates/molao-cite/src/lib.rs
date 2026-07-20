//! # molao-cite
//!
//! Deterministic extraction of South African legal citations from judgment
//! text.
//!
//! ## Why this crate is the foundation
//!
//! Citation extraction is the one layer of a legal commons that is **verifiable
//! by recomputation**. Given the same corpus and the same [`EXTRACTOR_VERSION`],
//! any node re-running this code must produce a byte-identical set of citation
//! edges. That means the citation graph — unlike a vector index — can be
//! contributed by anyone and checked by everyone, with no trust in the
//! contributor at all.
//!
//! Determinism is therefore a hard contract, not an aspiration:
//!
//! - No hash-map iteration order reaches the output; results are sorted by
//!   byte span.
//! - No locale-, time-, or environment-dependent behaviour.
//! - Behaviour changes require a version bump, because a manifest pins the
//!   extractor version that produced its graph.
//!
//! ## What it recognises
//!
//! | Form | Example |
//! |---|---|
//! | Neutral citation | `[1995] ZACC 3` |
//! | Reported, modern | `2020 (3) SA 123 (SCA)` |
//! | Reported, historical | `1936 AD 123` |
//! | Court case number | `CCT 306/24` |
//!
//! Each may carry a pinpoint — `at para 87`, `at paras 12-15`, `at 123B-D`.
//!
//! ## What it deliberately does not do
//!
//! It does not decide whether a citation was *followed*, *distinguished*, or
//! *overruled*. That is interpretation, it cannot be verified by recomputation,
//! and it is modelled as signed attestations in `molao-graph` instead.

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]

pub mod series;

use molao_core::court;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::ops::Range;
use std::sync::LazyLock;

/// Pinned identity of this extractor, recorded in every release manifest.
///
/// **Any change to extraction behaviour must bump this.** A manifest asserts
/// "this graph is what `molao-cite@X` produces over this corpus"; if the same
/// version string can produce two different graphs, verification by
/// recomputation silently becomes verification of nothing.
pub const EXTRACTOR_VERSION: &str = concat!("molao-cite@", env!("CARGO_PKG_VERSION"));

/// A citation, normalised.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Citation {
    /// `[1995] ZACC 3`
    Neutral {
        year: u16,
        court: String,
        number: u32,
    },
    /// `2020 (3) SA 123 (SCA)` — `volume` is `None` for historical series
    /// cited as `1936 AD 123`.
    Reported {
        year: u16,
        volume: Option<u16>,
        series: String,
        page: u32,
        court: Option<String>,
    },
    /// `CCT 306/24` — the court's own file number.
    CaseNumber { prefix: String, number: String },
}

impl Citation {
    /// Stable key for this citation.
    ///
    /// Two spellings of the same citation must produce the same key, because
    /// this is what joins an edge to its target. Reported citations
    /// deliberately **exclude** the trailing court in the key: `2020 (3) SA 123
    /// (SCA)` and `2020 (3) SA 123` are the same report, and treating them as
    /// two nodes would split a case's inbound citations in half.
    pub fn key(&self) -> String {
        match self {
            Citation::Neutral {
                year,
                court,
                number,
            } => {
                format!("neutral:{year}:{}:{number}", court.to_uppercase())
            }
            Citation::Reported {
                year,
                volume,
                series,
                page,
                ..
            } => match volume {
                Some(v) => format!("reported:{year}:{v}:{series}:{page}"),
                None => format!("reported:{year}::{series}:{page}"),
            },
            Citation::CaseNumber { prefix, number } => {
                format!("caseno:{}:{number}", prefix.to_uppercase())
            }
        }
    }

    /// Canonical printed form.
    pub fn canonical(&self) -> String {
        match self {
            Citation::Neutral {
                year,
                court,
                number,
            } => format!("[{year}] {court} {number}"),
            Citation::Reported {
                year,
                volume,
                series,
                page,
                court,
            } => {
                let mut s = match volume {
                    Some(v) => format!("{year} ({v}) {series} {page}"),
                    None => format!("{year} {series} {page}"),
                };
                if let Some(c) = court {
                    s.push_str(&format!(" ({c})"));
                }
                s
            }
            Citation::CaseNumber { prefix, number } => format!("{prefix} {number}"),
        }
    }
}

/// Where in the cited judgment the citing court pointed.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Pinpoint {
    /// `at para 87`, or `at paras 12-15` (`to` is the inclusive end).
    Paragraph { from: u32, to: Option<u32> },
    /// `at 123B-D` — page and marginal letter, used by the printed reports.
    Page {
        page: u32,
        from_letter: Option<char>,
        to_letter: Option<char>,
    },
}

/// One citation found in a document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CitationRef {
    pub citation: Citation,
    /// Exactly as it appeared, for display and for auditing the extractor.
    pub as_written: String,
    /// Byte range within the text passed to [`extract`].
    pub span: Range<usize>,
    pub pinpoint: Option<Pinpoint>,
    /// `false` when a neutral citation's court code is not in the registry.
    ///
    /// These are still returned. Silently dropping them would mean a new
    /// division's judgments vanish from the graph until someone notices; ingest
    /// logs them so the registry gets fixed instead.
    pub known_court: bool,
}

static NEUTRAL: LazyLock<Regex> = LazyLock::new(|| {
    // [2026] ZACC 26 — the bracketed year is what distinguishes a neutral
    // citation from ordinary prose containing a year.
    Regex::new(r"\[(\d{4})\]\s+([A-Z][A-Za-z]{1,11})\s+(\d{1,5})").expect("neutral pattern")
});

static REPORTED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(\d{{4}})\s*\((\d{{1,3}})\)\s*({})\s+(\d{{1,4}})(?:\s*\(([A-Za-z]{{1,8}})\))?",
        series::alternation(false)
    ))
    .expect("reported pattern")
});

static REPORTED_OLD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(\d{{4}})\s+({})\s+(\d{{1,4}})(?:\s*\(([A-Za-z]{{1,8}})\))?",
        series::alternation(true)
    ))
    .expect("historical reported pattern")
});

static CASE_NUMBER: LazyLock<Regex> = LazyLock::new(|| {
    // CCT 306/24, A 1234/2019. Requires a letter prefix: a bare `1234/2019`
    // matches dates, statute references, and page ranges far too often.
    Regex::new(r"\b([A-Z]{1,5})\s?(\d{1,6}/\d{2,4})\b").expect("case number pattern")
});

static PIN_PARA: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[\s,]*(?:at\s+)?paras?(?:graphs?)?\.?\s*\[?(\d{1,4})\]?(?:\s*(?:-|–|—|to)\s*\[?(\d{1,4})\]?)?")
        .expect("paragraph pinpoint pattern")
});

static PIN_PAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[\s,]*at\s+(\d{1,4})([A-J])?(?:\s*[-–—]\s*([A-J]))?\b")
        .expect("page pinpoint pattern")
});

/// Extract every citation in `text`, ordered by position.
///
/// Overlapping matches are resolved by preferring the earliest, then the
/// longest — so `2020 (3) SA 123 (SCA)` is one reported citation rather than a
/// reported citation plus a stray fragment.
pub fn extract(text: &str) -> Vec<CitationRef> {
    let mut found: Vec<CitationRef> = Vec::new();

    for caps in NEUTRAL.captures_iter(text) {
        let m = caps.get(0).expect("group 0 always present");
        let court_code = &caps[2];
        // A bracketed year followed by any capitalised token is a common shape
        // in prose. Requiring a registry hit (or at least a plausible all-caps
        // court-like code) is what keeps precision high.
        let known = court::is_known_code(court_code);
        if !known && !looks_like_court_code(court_code) {
            continue;
        }
        found.push(CitationRef {
            citation: Citation::Neutral {
                year: caps[1].parse().unwrap_or(0),
                court: court_code.to_uppercase(),
                number: caps[3].parse().unwrap_or(0),
            },
            as_written: m.as_str().to_string(),
            span: m.range(),
            pinpoint: pinpoint_after(text, m.end()),
            known_court: known,
        });
    }

    for caps in REPORTED.captures_iter(text) {
        let m = caps.get(0).expect("group 0 always present");
        found.push(CitationRef {
            citation: Citation::Reported {
                year: caps[1].parse().unwrap_or(0),
                volume: caps[2].parse().ok(),
                series: caps[3].to_string(),
                page: caps[4].parse().unwrap_or(0),
                court: caps.get(5).map(|c| c.as_str().to_uppercase()),
            },
            as_written: m.as_str().to_string(),
            span: m.range(),
            pinpoint: pinpoint_after(text, m.end()),
            known_court: true,
        });
    }

    for caps in REPORTED_OLD.captures_iter(text) {
        let m = caps.get(0).expect("group 0 always present");
        found.push(CitationRef {
            citation: Citation::Reported {
                year: caps[1].parse().unwrap_or(0),
                volume: None,
                series: caps[2].to_string(),
                page: caps[3].parse().unwrap_or(0),
                court: caps.get(4).map(|c| c.as_str().to_uppercase()),
            },
            as_written: m.as_str().to_string(),
            span: m.range(),
            pinpoint: pinpoint_after(text, m.end()),
            known_court: true,
        });
    }

    for caps in CASE_NUMBER.captures_iter(text) {
        let m = caps.get(0).expect("group 0 always present");
        found.push(CitationRef {
            citation: Citation::CaseNumber {
                prefix: caps[1].to_string(),
                number: caps[2].to_string(),
            },
            as_written: m.as_str().to_string(),
            span: m.range(),
            pinpoint: None,
            known_court: true,
        });
    }

    // Deterministic order: by start, then longest first, then by canonical form
    // so that even a pathological exact-overlap is ordered reproducibly.
    found.sort_by(|a, b| {
        a.span
            .start
            .cmp(&b.span.start)
            .then(b.span.len().cmp(&a.span.len()))
            .then(a.citation.canonical().cmp(&b.citation.canonical()))
    });

    // Drop anything contained in an already-accepted span.
    let mut out: Vec<CitationRef> = Vec::with_capacity(found.len());
    for candidate in found {
        if out.iter().any(|kept| overlaps(&kept.span, &candidate.span)) {
            continue;
        }
        out.push(candidate);
    }
    out
}

fn overlaps(a: &Range<usize>, b: &Range<usize>) -> bool {
    a.start < b.end && b.start < a.end
}

/// Court codes are upper-case and at least three characters (`ZACC`,
/// `ZAGPPHC`). This admits genuinely new codes the registry has not caught up
/// with, while rejecting prose like `[2019] Act 5`.
fn looks_like_court_code(code: &str) -> bool {
    code.len() >= 3 && code.chars().all(|c| c.is_ascii_uppercase())
}

fn pinpoint_after(text: &str, end: usize) -> Option<Pinpoint> {
    let rest = text.get(end..)?;
    // Paragraphs first: `at 12` after `paras` must not be read as a page.
    if let Some(caps) = PIN_PARA.captures(rest) {
        return Some(Pinpoint::Paragraph {
            from: caps[1].parse().ok()?,
            to: caps.get(2).and_then(|m| m.as_str().parse().ok()),
        });
    }
    if let Some(caps) = PIN_PAGE.captures(rest) {
        return Some(Pinpoint::Page {
            page: caps[1].parse().ok()?,
            from_letter: caps.get(2).and_then(|m| m.as_str().chars().next()),
            to_letter: caps.get(3).and_then(|m| m.as_str().chars().next()),
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(text: &str) -> Vec<String> {
        extract(text)
            .into_iter()
            .map(|c| c.citation.key())
            .collect()
    }

    #[test]
    fn parses_a_neutral_citation() {
        let refs = extract("as held in S v Makwanyane [1995] ZACC 3");
        assert_eq!(refs.len(), 1);
        assert_eq!(
            refs[0].citation,
            Citation::Neutral {
                year: 1995,
                court: "ZACC".into(),
                number: 3
            }
        );
        assert_eq!(refs[0].as_written, "[1995] ZACC 3");
        assert!(refs[0].known_court);
    }

    #[test]
    fn parses_a_modern_reported_citation() {
        let refs = extract("see 2020 (3) SA 123 (SCA) on this point");
        assert_eq!(refs.len(), 1);
        assert_eq!(
            refs[0].citation,
            Citation::Reported {
                year: 2020,
                volume: Some(3),
                series: "SA".into(),
                page: 123,
                court: Some("SCA".into()),
            }
        );
    }

    #[test]
    fn parses_a_historical_citation_without_a_volume() {
        let refs = extract("the rule in Union Government v Vianini 1941 AD 43");
        assert_eq!(refs.len(), 1);
        assert!(matches!(
            &refs[0].citation,
            Citation::Reported { year: 1941, volume: None, series, page: 43, .. } if series == "AD"
        ));
    }

    #[test]
    fn longer_series_abbreviations_win() {
        // `SACR` must not be read as `SA` followed by junk, and `All SA` must
        // not be read as bare `SA`.
        assert_eq!(keys("2015 (1) SACR 1 (CC)"), vec!["reported:2015:1:SACR:1"]);
        assert_eq!(
            keys("2011 (2) All SA 47 (SCA)"),
            vec!["reported:2011:2:All SA:47"]
        );
    }

    #[test]
    fn captures_paragraph_pinpoints() {
        let refs = extract("[1995] ZACC 3 at para 87");
        assert_eq!(
            refs[0].pinpoint,
            Some(Pinpoint::Paragraph { from: 87, to: None })
        );

        let refs = extract("[1995] ZACC 3 at paras 12-15");
        assert_eq!(
            refs[0].pinpoint,
            Some(Pinpoint::Paragraph {
                from: 12,
                to: Some(15)
            })
        );

        let refs = extract("[1995] ZACC 3 at para [87]");
        assert_eq!(
            refs[0].pinpoint,
            Some(Pinpoint::Paragraph { from: 87, to: None })
        );
    }

    #[test]
    fn captures_page_and_letter_pinpoints() {
        let refs = extract("1941 AD 43 at 47B-D");
        assert_eq!(
            refs[0].pinpoint,
            Some(Pinpoint::Page {
                page: 47,
                from_letter: Some('B'),
                to_letter: Some('D')
            })
        );
    }

    #[test]
    fn parses_a_case_number() {
        let refs = extract("Case CCT 306/24 was heard in May");
        assert!(refs.iter().any(|r| r.citation
            == Citation::CaseNumber {
                prefix: "CCT".into(),
                number: "306/24".into()
            }));
    }

    // ---- precision: the parser must not invent citations -----------------

    #[test]
    fn ordinary_prose_produces_nothing() {
        let prose = "The applicant was 34 years old in 2019 and earned R123 000 per annum. \
                     The contract, concluded on 3/4/2019, ran for 12 months.";
        assert!(
            extract(prose).is_empty(),
            "false positives: {:?}",
            extract(prose)
        );
    }

    #[test]
    fn statute_references_are_not_citations() {
        // The classic false positive: section numbers look like volumes.
        let text = "in terms of section 3 (1) of the Companies Act 71 of 2008";
        assert!(
            extract(text).is_empty(),
            "false positives: {:?}",
            extract(text)
        );
    }

    #[test]
    fn a_bracketed_year_alone_is_not_a_neutral_citation() {
        assert!(extract("[2019] and then some text").is_empty());
        assert!(extract("[2019] Act 5 of that year").is_empty());
    }

    #[test]
    fn unknown_court_codes_are_kept_but_flagged() {
        // A new division must not vanish from the graph before someone updates
        // the registry.
        let refs = extract("[2027] ZANEWHC 4");
        assert_eq!(refs.len(), 1);
        assert!(!refs[0].known_court);
    }

    #[test]
    fn overlapping_matches_collapse_to_one() {
        let refs = extract("2020 (3) SA 123 (SCA)");
        assert_eq!(refs.len(), 1, "got {refs:?}");
    }

    // ---- determinism: the contract the whole graph rests on ---------------

    #[test]
    fn extraction_is_deterministic_across_runs() {
        let text = "Following [1995] ZACC 3 at para 87 and 2020 (3) SA 123 (SCA), \
                    and distinguishing 1941 AD 43 at 47B, in CCT 306/24 the court held.";
        let first = extract(text);
        for _ in 0..64 {
            assert_eq!(extract(text), first);
        }
    }

    #[test]
    fn results_are_sorted_by_position() {
        let text = "second 2020 (3) SA 123, but first [1995] ZACC 3 came before";
        let refs = extract(text);
        assert!(refs.windows(2).all(|w| w[0].span.start <= w[1].span.start));
    }

    #[test]
    fn spans_point_at_the_real_text() {
        let text = "as held in [1995] ZACC 3 at para 87";
        for r in extract(text) {
            assert_eq!(&text[r.span.clone()], r.as_written);
        }
    }

    // ---- key stability: what joins an edge to its target ------------------

    #[test]
    fn the_same_citation_written_differently_shares_a_key() {
        // Spacing varies wildly between converters and typists.
        assert_eq!(keys("[1995] ZACC 3"), keys("[1995]  ZACC   3"));
        // Court suffix is presentation, not identity.
        assert_eq!(
            keys("2020 (3) SA 123 (SCA)")[0],
            keys("2020 (3) SA 123")[0],
            "the same report must not split into two graph nodes"
        );
    }

    #[test]
    fn different_citations_do_not_share_a_key() {
        assert_ne!(keys("[1995] ZACC 3")[0], keys("[1995] ZACC 4")[0]);
        assert_ne!(keys("[1995] ZACC 3")[0], keys("[1996] ZACC 3")[0]);
        assert_ne!(keys("[1995] ZASCA 3")[0], keys("[1995] ZACC 3")[0]);
    }

    #[test]
    fn canonical_forms_round_trip_through_the_parser() {
        for text in ["[1995] ZACC 3", "2020 (3) SA 123 (SCA)", "1941 AD 43"] {
            let parsed = extract(text);
            assert_eq!(parsed.len(), 1, "{text}");
            assert_eq!(parsed[0].citation.canonical(), text);
        }
    }

    #[test]
    fn extractor_version_is_pinned() {
        assert!(EXTRACTOR_VERSION.starts_with("molao-cite@"));
    }

    #[test]
    fn a_realistic_judgment_passage_extracts_cleanly() {
        let passage = "\
[12] The approach in S v Makwanyane and Another [1995] ZACC 3; 1995 (3) SA 391 (CC) \
at para 87 remains binding. This Court applied it in Minister of Police v Mboweni \
2020 (3) SA 123 (SCA) at paras 14-16, and the earlier rule in Union Government v \
Vianini Ferro-Concrete Pipes 1941 AD 43 at 47B-D was not disturbed.";
        let refs = extract(passage);
        let found: Vec<String> = refs.iter().map(|r| r.citation.key()).collect();
        assert!(
            found.contains(&"neutral:1995:ZACC:3".to_string()),
            "{found:?}"
        );
        assert!(
            found.contains(&"reported:1995:3:SA:391".to_string()),
            "{found:?}"
        );
        assert!(
            found.contains(&"reported:2020:3:SA:123".to_string()),
            "{found:?}"
        );
        assert!(
            found.contains(&"reported:1941::AD:43".to_string()),
            "{found:?}"
        );
        // Every extracted span must be real text, and pinpoints must attach.
        assert!(refs.iter().any(|r| matches!(
            r.pinpoint,
            Some(Pinpoint::Paragraph {
                from: 14,
                to: Some(16)
            })
        )));
    }
}
