//! Fallback extraction for courts and gazettes that only publish HTML or PDF.
//!
//! `docs/SOURCES.md` rule 1 is "take from courts and gazettes directly
//! wherever possible", and most courts that self-publish do it as rendered
//! HTML or scanned-then-OCRed PDF, not Akoma Ntoso — Laws.Africa's licensed
//! bulk corpus (see [`crate::akn`]) does not cover every division of every
//! court in every jurisdiction, and it should not have to for this crate to
//! be useful there.
//!
//! ## The honest limitation this module exists to name
//!
//! Unlike Akoma Ntoso, HTML carries no standard place to find "which court",
//! "who are the judges", or "what is the case number" — that information is
//! wherever the page's designer put it, and it differs across every site. So
//! this module does **not** try to be a general HTML judgment scraper. It
//! does two things well:
//!
//! 1. Strips markup down to paragraph-shaped plain text, detecting printed
//!    paragraph numbers the way SA judgments format them (`[12]`, `12.`).
//! 2. Runs [`molao_cite::Extractor`] over the resulting text to recover
//!    whatever citations the judgment states about itself — its own neutral
//!    citation is usually printed at the top of the page, and that is
//!    normally enough to identify it.
//!
//! Everything a *site* knows and the *page* does not state in a recognisable
//! form — the court, a caller-known title, a caller-known date — comes in as
//! [`Hints`], supplied by the [`crate::adapter::SourceAdapter`] that knows
//! which site it fetched from. That division of labour is deliberate: a
//! generic extractor guessing at site-specific markup is a maintenance trap
//! that breaks every time a court redesigns its website, while an adapter
//! that says "this is `judiciary.example.gov`, its judgments are always this
//! court" is one line of data.
//!
//! ## PDF
//!
//! Behind the `pdf` feature, [`extract_pdf`] runs the same pipeline over text
//! pulled from a PDF's content streams. It is feature-gated because
//! PDF-to-text is a real, non-trivial dependency for a fallback of a
//! fallback — most self-publishing courts serve HTML — and a plain `cargo
//! build` of this crate should not have to pay for it. There is no test
//! fixture for the PDF path: a small hand-built PDF byte sequence would not
//! meaningfully exercise a third-party PDF parser, and a large realistic one
//! does not belong in this repository. `cargo build --features pdf` and
//! `cargo clippy --features pdf --all-targets -- -D warnings` both need to
//! pass, and did when this module was written; genuine PDF extraction
//! confidence needs real deployment, same as live crawling — see the crate
//! root docs.

use molao_cite::{Citation, Extractor};
use molao_core::region::RegionProfile;
use molao_core::{DocId, Judgment, Paragraph};
use regex::Regex;
use std::sync::LazyLock;

/// Why HTML/PDF extraction failed.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum HtmlError {
    #[error("no readable paragraph text found in the document")]
    Empty,
    #[cfg(feature = "pdf")]
    #[error("could not extract text from PDF: {0}")]
    Pdf(String),
}

/// What the caller already knows about the page that generic text extraction
/// cannot recover from the HTML itself. See the module docs.
#[derive(Debug, Clone, Default)]
pub struct Hints {
    /// Court code, e.g. `"ZAGPPHC"`. An adapter fetching from one court's
    /// site normally knows this outright.
    pub court: Option<String>,
    /// Style of cause, if the caller already extracted it from page markup
    /// this module does not understand (a heading with a known CSS class,
    /// for instance). Falls back to the page's `<title>` tag, then to empty.
    pub title: Option<String>,
    /// ISO 8601 date, if known by the caller.
    pub date: Option<String>,
}

const BLOCK_TAGS: &[&str] = &[
    "p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article",
];

/// Elements whose entire contents are dropped, never contributing text to
/// the body stream: `script`/`style` for the obvious reason, and `head` so
/// that `<title>` — real, readable text, unlike `script`/`style` — does not
/// leak into the document body as a phantom paragraph. [`html_title`] reads
/// the title separately, straight from the raw HTML.
const SKIP_TAGS: &[&str] = &["script", "style", "head"];

/// Strip HTML tags down to block-separated plain text.
///
/// Deliberately not a full HTML parser: a fixed set of block-level tags
/// becomes a paragraph break, [`SKIP_TAGS`] contents are dropped outright,
/// and everything else is discarded as markup. A misjudged edge case here
/// degrades to "wrong paragraph breaks" — it cannot execute anything, and it
/// cannot mis-hash a document silently, because the extracted text is
/// exactly what gets hashed, not the source HTML.
fn strip_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let chars = html.chars();
    let mut in_tag = false;
    let mut tag_buf = String::new();
    let mut skip_tag: Option<String> = None;

    for c in chars {
        if in_tag {
            if c == '>' {
                in_tag = false;
                let tag = tag_buf.trim();
                let closing = tag.starts_with('/');
                let name: String = tag
                    .trim_start_matches('/')
                    .split(|ch: char| ch.is_whitespace() || ch == '/')
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();

                if let Some(skip) = &skip_tag {
                    if closing && name == *skip {
                        skip_tag = None;
                    }
                    tag_buf.clear();
                    continue;
                }

                if !closing && SKIP_TAGS.contains(&name.as_str()) {
                    skip_tag = Some(name);
                } else if BLOCK_TAGS.contains(&name.as_str()) {
                    out.push_str("\n\n");
                }
                tag_buf.clear();
            } else {
                tag_buf.push(c);
            }
            continue;
        }
        if c == '<' {
            in_tag = true;
            tag_buf.clear();
            continue;
        }
        if skip_tag.is_some() {
            continue;
        }
        out.push(c);
    }
    out
}

fn decode_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&") // last: must not re-expand entities it just produced
}

fn normalize_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !prev_space {
                out.push(' ');
            }
            prev_space = true;
        } else {
            out.push(c);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

/// A judgment paragraph as SA courts typically print it: `[12]`, `12.`, or
/// `12` at the start of the paragraph, optionally followed by punctuation.
static PARA_NUM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\[?(\d{1,4})\]?[.)]?\s+").expect("static paragraph-number pattern")
});

static TITLE_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<title[^>]*>(.*?)</title>").expect("static title-tag pattern")
});

fn html_title(html: &str) -> Option<String> {
    let captured = TITLE_TAG.captures(html)?.get(1)?.as_str();
    let cleaned = normalize_ws(&decode_entities(&strip_tags(captured)));
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

/// Split normalized text into paragraphs, stripping a leading printed number
/// from each. Returns the paragraphs *and*, separately, each chunk exactly as
/// normalized before any number was stripped — see [`build_judgment`] for why
/// both are needed.
fn split_paragraphs(text: &str) -> (Vec<Paragraph>, Vec<String>) {
    let mut out = Vec::new();
    let mut raw_chunks = Vec::new();
    let mut index = 0u32;
    for chunk in text.split("\n\n") {
        let normalized = normalize_ws(chunk);
        if normalized.is_empty() {
            continue;
        }
        raw_chunks.push(normalized.clone());
        let (number, para_text) = match PARA_NUM.captures(&normalized) {
            Some(caps) => {
                let end = caps.get(0).map_or(0, |m| m.end());
                (
                    Some(caps[1].to_string()),
                    normalized[end..].trim().to_string(),
                )
            }
            None => (None, normalized),
        };
        out.push(Paragraph {
            index,
            number,
            text: para_text,
        });
        index += 1;
    }
    (out, raw_chunks)
}

fn build_judgment(
    raw_text: &str,
    profile: &'static RegionProfile,
    hints: &Hints,
    title_from_page: Option<String>,
) -> Result<Judgment, HtmlError> {
    let decoded = decode_entities(raw_text);
    let (paragraphs, raw_chunks) = split_paragraphs(&decoded);
    if paragraphs.is_empty() {
        return Err(HtmlError::Empty);
    }

    // Citations are found in the text *before* paragraph-number stripping,
    // not after: a heading line like `[2027] ZANEWHC 4` is itself a neutral
    // citation, and this crate's own number-stripping heuristic — which
    // exists to pull a leading `[12]` off a body paragraph — would otherwise
    // eat the citation's own bracketed year first and leave `molao_cite`
    // nothing recognisable to find. `Judgment::paragraphs` still stores the
    // number-stripped form; only citation-finding reads the unstripped one.
    let raw_full_text = raw_chunks.join("\n\n");
    let extractor = Extractor::for_profile(profile);
    let refs = extractor.extract(&raw_full_text);

    let neutral_citation = refs.iter().find_map(|r| match &r.citation {
        Citation::Neutral { .. } => Some(r.citation.canonical()),
        _ => None,
    });

    let mut reported_citations = Vec::new();
    let mut case_numbers = Vec::new();
    for r in &refs {
        match &r.citation {
            Citation::Reported { .. } => {
                let c = r.citation.canonical();
                if !reported_citations.contains(&c) {
                    reported_citations.push(c);
                }
            }
            Citation::CaseNumber { .. } => {
                let c = r.citation.canonical();
                if !case_numbers.contains(&c) {
                    case_numbers.push(c);
                }
            }
            Citation::Neutral { .. } => {}
        }
    }

    let court = hints.court.clone().unwrap_or_else(|| {
        // Best-effort: the court embedded in the judgment's own neutral
        // citation, if the page states one and no adapter hint overrode it.
        refs.iter()
            .find_map(|r| match &r.citation {
                Citation::Neutral { court, .. } => Some(court.clone()),
                _ => None,
            })
            .unwrap_or_else(|| "UNKNOWN".to_string())
    });

    let title = hints.title.clone().or(title_from_page).unwrap_or_default();
    let full_text = paragraphs
        .iter()
        .map(|p| p.text.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let id = DocId::of_raw(&full_text);

    Ok(Judgment {
        id,
        neutral_citation,
        court,
        title,
        case_numbers,
        date: hints.date.clone(),
        judges: Vec::new(),
        reported_citations,
        paragraphs,
    })
}

/// Extract a [`Judgment`] from an HTML page.
pub fn extract(
    html: &str,
    profile: &'static RegionProfile,
    hints: &Hints,
) -> Result<Judgment, HtmlError> {
    let title_from_page = html_title(html);
    let stripped = strip_tags(html);
    build_judgment(&stripped, profile, hints, title_from_page)
}

/// Extract text from a PDF's content streams, without structuring it. Exposed
/// separately from [`extract_pdf`] so a caller that wants the raw text (for
/// its own heuristics, or just to inspect what came back) does not have to
/// go through the paragraph pipeline to get it.
#[cfg(feature = "pdf")]
pub fn extract_pdf_text(bytes: &[u8]) -> Result<String, HtmlError> {
    pdf_extract::extract_text_from_mem(bytes).map_err(|e| HtmlError::Pdf(e.to_string()))
}

/// Extract a [`Judgment`] from a PDF. See the module docs for why this is
/// behind the `pdf` feature and untested by fixture.
#[cfg(feature = "pdf")]
pub fn extract_pdf(
    bytes: &[u8],
    profile: &'static RegionProfile,
    hints: &Hints,
) -> Result<Judgment, HtmlError> {
    let text = extract_pdf_text(bytes)?;
    build_judgment(&text, profile, hints, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use molao_core::region;

    const NOTICE_FIXTURE: &str = include_str!("../fixtures/html/gazette_notice.html");

    #[test]
    fn strips_tags_and_finds_block_breaks() {
        let stripped = strip_tags("<html><body><p>One</p><p>Two</p></body></html>");
        let normalized: Vec<&str> = stripped
            .split("\n\n")
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        assert_eq!(normalized, vec!["One", "Two"]);
    }

    #[test]
    fn script_and_style_contents_are_dropped() {
        let stripped =
            strip_tags("<p>Keep</p><script>evil();</script><style>.x{}</style><p>This too</p>");
        assert!(!stripped.contains("evil"));
        assert!(!stripped.contains(".x{}"));
        assert!(stripped.contains("Keep"));
        assert!(stripped.contains("This too"));
    }

    #[test]
    fn a_realistic_html_judgment_page_extracts_cleanly() {
        let hints = Hints {
            court: Some("ZAGPPHC".to_string()),
            ..Hints::default()
        };
        let j = extract(NOTICE_FIXTURE, region::default_profile(), &hints)
            .expect("fixture must extract");
        assert_eq!(j.court, "ZAGPPHC");
        assert!(j.paragraphs.len() >= 2, "{:?}", j.paragraphs);
        assert_eq!(j.paragraphs[0].number, None);
        assert_eq!(j.paragraphs[1].number.as_deref(), Some("1"));
        assert!(
            j.paragraphs.iter().any(|p| p.text.contains("Makwanyane")),
            "{:?}",
            j.paragraphs
        );
        assert!(j.verify_id());
    }

    #[test]
    fn the_page_title_is_used_when_no_hint_is_given() {
        let j = extract(NOTICE_FIXTURE, region::default_profile(), &Hints::default()).unwrap();
        assert_eq!(j.title, "Nkosi v Nkosi");
    }

    #[test]
    fn an_explicit_hint_title_overrides_the_page_title() {
        let hints = Hints {
            title: Some("Overridden Title".to_string()),
            ..Hints::default()
        };
        let j = extract(NOTICE_FIXTURE, region::default_profile(), &hints).unwrap();
        assert_eq!(j.title, "Overridden Title");
    }

    #[test]
    fn a_citation_embedded_in_the_page_is_found_via_molao_cite() {
        let j = extract(NOTICE_FIXTURE, region::default_profile(), &Hints::default()).unwrap();
        assert!(
            j.reported_citations.iter().any(|c| c.contains("SA 391"))
                || j.neutral_citation.is_some(),
            "{:?} / {:?}",
            j.reported_citations,
            j.neutral_citation
        );
    }

    #[test]
    fn empty_input_is_an_error_not_a_panic() {
        assert_eq!(
            extract(
                "<html><body></body></html>",
                region::default_profile(),
                &Hints::default()
            ),
            Err(HtmlError::Empty)
        );
    }

    #[test]
    fn without_a_court_hint_the_embedded_neutral_citation_court_is_used() {
        let html = "<p>[2027] ZANEWHC 4</p><p>[1] The order is set out below.</p>";
        let j = extract(html, region::default_profile(), &Hints::default()).unwrap();
        assert_eq!(j.court, "ZANEWHC");
    }

    #[test]
    fn with_neither_hint_nor_embedded_citation_the_court_is_honestly_unknown() {
        let html =
            "<p>Some ordinary heading.</p><p>[1] No citation appears anywhere in this text.</p>";
        let j = extract(html, region::default_profile(), &Hints::default()).unwrap();
        assert_eq!(j.court, "UNKNOWN");
    }
}
