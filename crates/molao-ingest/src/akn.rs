//! Akoma Ntoso judgment ingest — the primary, licensed path.
//!
//! `docs/SOURCES.md` rule 2: where a licensed bulk supplier exists, that is
//! the correct route, not a workaround. For Africa that supplier is
//! Laws.Africa / AfricanLII, who publish judgments as **Akoma Ntoso**, the
//! OASIS-standardised XML for legal documents, under CC-BY-NC-SA. This module
//! is the parser for that format, and it is deliberately the primary path:
//! structured metadata straight from a licensed source beats guessing at
//! structure from rendered HTML (see [`crate::html`]) every time it is
//! available.
//!
//! ## Scope: the subset actually published for judgments
//!
//! Akoma Ntoso is a large schema built to describe every kind of legal
//! document there is. This module targets the specific, much smaller subset
//! that Laws.Africa/AfricanLII actually emit for judgments: FRBR identity
//! metadata (`FRBRWork`/`FRBRExpression`/`FRBRManifestation`), a
//! `references` block of `TLCOrganization`/`TLCPerson` entries, a
//! `proprietary` block carrying the neutral citation and case number(s) as
//! Laws.Africa's own extension elements, and a `judgmentBody` of numbered
//! `<p>` paragraphs. It is not a general Akoma Ntoso reader, and it does not
//! try to be — a document that does not follow this shape produces a
//! specific [`AknError`] rather than a wrong [`Judgment`].
//!
//! ## Namespaces are matched by local name only
//!
//! Real documents mix the default `akn` namespace with Laws.Africa's own
//! `https://laws.africa/akn` prefix (typically bound to `akn:`) for their
//! proprietary elements. Rather than carrying a full namespace-resolution
//! table for two namespaces, every element and attribute here is matched by
//! its local name (the part after `:`), which is unambiguous in practice for
//! this document shape and considerably simpler to get right. If a future
//! source reuses a local name like `case` or `neutralCitation` for something
//! else entirely, that is a real limitation of this simplification, not a
//! silent miscategorisation — the fixtures and tests exist to catch drift.
//!
//! ## Deriving the court
//!
//! Laws.Africa's own FRBR URIs encode the court in the path:
//! `/akn/za/judgment/zacc/2026/26`. That segment is more reliable than
//! anything in `references`, which describes organisations and persons
//! generically and does not mark which one is "the court" — so the court
//! code is read from `FRBRWork/FRBRuri` (or `FRBRthis`, which carries the
//! same path), not guessed from the reference list.
//!
//! ## What this module does not extract
//!
//! It leaves `reported_citations` empty. Finding every citation a
//! judgment's *prose* makes — including reported citations a source's own
//! metadata never mentions — is `molao_cite`'s job, run deterministically
//! over `Judgment::paragraphs` at corpus-insert time (see `molao-corpus`),
//! not something this module duplicates. This module only fills
//! `neutral_citation` and `case_numbers` from the source's own explicit,
//! structured metadata. Contrast [`crate::html`], which has no structured
//! metadata to read and must lean on `molao_cite` directly.

use molao_core::{DocId, Judgment, Paragraph};
use quick_xml::events::Event;
use quick_xml::Reader;

/// Why an Akoma Ntoso document could not be parsed into a [`Judgment`].
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AknError {
    #[error("malformed XML: {0}")]
    Xml(String),
    #[error("no FRBRWork/FRBRuri (or FRBRthis) to derive document identity from")]
    MissingWorkUri,
    #[error(
        "could not derive a court code from the FRBRuri {0:?}; expected .../judgment/<court>/..."
    )]
    MissingCourt(String),
    #[error("judgment has no title (FRBRWork/FRBRalias[@name=\"title\"])")]
    MissingTitle,
    #[error("judgmentBody contains no paragraphs")]
    NoParagraphs,
}

fn local_name(qname: &[u8]) -> &str {
    let s = std::str::from_utf8(qname).unwrap_or("");
    match s.rfind(':') {
        Some(i) => &s[i + 1..],
        None => s,
    }
}

fn attr_value(e: &quick_xml::events::BytesStart<'_>, name: &str) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        if local_name(a.key.as_ref()) == name {
            a.unescape_value().ok().map(|v| v.into_owned())
        } else {
            None
        }
    })
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

/// Pull `<court>` out of a Laws.Africa FRBR URI: `/akn/za/judgment/<court>/...`.
fn court_from_uri(uri: &str) -> Option<String> {
    let segments: Vec<&str> = uri.split('/').filter(|s| !s.is_empty()).collect();
    let idx = segments.iter().position(|s| *s == "judgment")?;
    segments.get(idx + 1).map(|c| c.to_ascii_uppercase())
}

/// A neutral citation constructed from the FRBR URI's year and sequence
/// number, used only when no explicit `neutralCitation` element was found —
/// most Laws.Africa documents carry one explicitly, but the URI alone is
/// still enough to reconstruct the citation shape.
fn neutral_citation_from_uri(uri: &str, court: &str) -> Option<String> {
    let segments: Vec<&str> = uri.split('/').filter(|s| !s.is_empty()).collect();
    let idx = segments.iter().position(|s| *s == "judgment")?;
    let year = segments.get(idx + 2)?;
    let number = segments.get(idx + 3)?;
    if year.len() == 4
        && year.chars().all(|c| c.is_ascii_digit())
        && number.chars().all(|c| c.is_ascii_digit())
    {
        Some(format!("[{year}] {court} {number}"))
    } else {
        None
    }
}

#[derive(Default)]
struct Parsed {
    work_uri: Option<String>,
    title: Option<String>,
    date: Option<String>,
    neutral_citation: Option<String>,
    case_numbers: Vec<String>,
    judges: Vec<String>,
    paragraphs: Vec<Paragraph>,
}

/// Parse Akoma Ntoso judgment XML into a structured [`Judgment`].
///
/// The returned judgment's [`DocId`] is computed from its paragraphs exactly
/// as [`Judgment::canonical_text`] would — so `verify_id()` on the result is
/// always `true`, and a peer receiving this judgment later verifies it the
/// same way regardless of how it was produced.
pub fn parse(xml: &str) -> Result<Judgment, AknError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut parsed = Parsed::default();

    // Element-name stack, so we know which ancestor a piece of text is
    // inside without re-deriving it from a saved position.
    let mut stack: Vec<String> = Vec::new();

    // State for the FRBRWork block: only the *first* FRBRdate[@name="Judgment"]
    // counts (FRBRExpression and FRBRManifestation repeat similarly-shaped
    // dates for other purposes).
    let mut date_captured = false;

    // State for a TLCPerson currently being read, to decide if it is a judge.
    // Judges are the convention this crate uses for the eId prefix `judge-`;
    // see the module docs' honesty note on the reference-list ambiguity.

    // State while inside <judgmentBody>.
    let mut in_body = false;
    let mut in_paragraph = false;
    let mut in_num = false;
    let mut para_text = String::new();
    let mut para_number: Option<String> = None;
    let mut para_index: u32 = 0;

    let mut buf = Vec::new();
    loop {
        let event = reader
            .read_event_into(&mut buf)
            .map_err(|e| AknError::Xml(e.to_string()))?;
        // Decided before the `match event` below moves `event`: a
        // self-closing tag (`<p/>`) will never produce a matching
        // `Event::End`, so it must not be pushed onto `stack`.
        let is_empty = matches!(&event, Event::Empty(_));
        match event {
            Event::Eof => break,
            Event::Start(e) | Event::Empty(e) => {
                let name = local_name(e.name().as_ref()).to_string();

                match name.as_str() {
                    "FRBRthis" | "FRBRuri"
                        if parsed.work_uri.is_none()
                            && stack.last().map(String::as_str) == Some("FRBRWork") =>
                    {
                        if let Some(v) = attr_value(&e, "value") {
                            parsed.work_uri = Some(v);
                        }
                    }
                    "FRBRalias" if stack.last().map(String::as_str) == Some("FRBRWork") => {
                        if attr_value(&e, "name").as_deref() == Some("title") {
                            parsed.title = attr_value(&e, "value");
                        }
                    }
                    "FRBRdate"
                        if !date_captured
                            && stack.last().map(String::as_str) == Some("FRBRWork") =>
                    {
                        if attr_value(&e, "name").as_deref() == Some("Judgment") {
                            parsed.date = attr_value(&e, "date");
                            date_captured = true;
                        }
                    }
                    "TLCPerson" => {
                        let eid = attr_value(&e, "eId").unwrap_or_default();
                        if eid.starts_with("judge-") {
                            if let Some(show_as) = attr_value(&e, "showAs") {
                                parsed.judges.push(show_as);
                            }
                        }
                    }
                    "case" => {
                        if let Some(number) = attr_value(&e, "number") {
                            parsed.case_numbers.push(number);
                        }
                    }
                    "judgmentBody" => in_body = true,
                    "p" if in_body => {
                        in_paragraph = true;
                        para_text.clear();
                        para_number = None;
                    }
                    "num" if in_paragraph => {
                        in_num = true;
                    }
                    _ => {}
                }

                if is_empty {
                    if name == "p" && in_body {
                        // A self-closing <p/>: nothing to record, and no
                        // matching End will arrive to close it.
                        in_paragraph = false;
                    }
                } else {
                    stack.push(name);
                }
            }
            Event::End(e) => {
                let name = local_name(e.name().as_ref()).to_string();
                stack.pop();
                match name.as_str() {
                    "judgmentBody" => in_body = false,
                    "num" => in_num = false,
                    "p" if in_paragraph => {
                        let text = normalize_ws(&para_text);
                        if !text.is_empty() || para_number.is_some() {
                            parsed.paragraphs.push(Paragraph {
                                index: para_index,
                                number: para_number.take(),
                                text,
                            });
                            para_index += 1;
                        }
                        in_paragraph = false;
                    }
                    _ => {}
                }
            }
            Event::Text(t) => {
                let text = t.unescape().unwrap_or_default().into_owned();
                if in_paragraph {
                    if in_num {
                        para_number.get_or_insert_with(String::new).push_str(&text);
                    } else {
                        if !para_text.is_empty() {
                            para_text.push(' ');
                        }
                        para_text.push_str(&text);
                    }
                } else if stack.last().map(String::as_str) == Some("neutralCitation") {
                    let cleaned = normalize_ws(&text);
                    if !cleaned.is_empty() {
                        parsed
                            .neutral_citation
                            .get_or_insert_with(String::new)
                            .push_str(&cleaned);
                    }
                }
            }
            _ => {}
        }
        buf.clear();
    }

    build_judgment(parsed)
}

fn build_judgment(parsed: Parsed) -> Result<Judgment, AknError> {
    let work_uri = parsed.work_uri.ok_or(AknError::MissingWorkUri)?;
    let court =
        court_from_uri(&work_uri).ok_or_else(|| AknError::MissingCourt(work_uri.clone()))?;
    let title = parsed.title.ok_or(AknError::MissingTitle)?;
    if parsed.paragraphs.is_empty() {
        return Err(AknError::NoParagraphs);
    }

    let neutral_citation = parsed
        .neutral_citation
        .or_else(|| neutral_citation_from_uri(&work_uri, &court));

    let body = parsed
        .paragraphs
        .iter()
        .map(|p| p.text.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let id = DocId::of_raw(&body);

    Ok(Judgment {
        id,
        neutral_citation,
        court,
        title,
        case_numbers: parsed.case_numbers,
        date: parsed.date,
        judges: parsed.judges,
        reported_citations: Vec::new(),
        paragraphs: parsed.paragraphs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ZACC_FIXTURE: &str = include_str!("../fixtures/akn/zacc_2026_26.xml");
    const GPPHC_FIXTURE: &str = include_str!("../fixtures/akn/zagpphc_2025_112.xml");

    #[test]
    fn parses_court_title_date_and_citation() {
        let j = parse(ZACC_FIXTURE).expect("fixture must parse");
        assert_eq!(j.court, "ZACC");
        assert_eq!(j.title, "Minister of Police v Mboweni");
        assert_eq!(j.date.as_deref(), Some("2026-06-26"));
        assert_eq!(j.neutral_citation.as_deref(), Some("[2026] ZACC 26"));
        assert_eq!(j.case_numbers, vec!["CCT 306/24".to_string()]);
        assert_eq!(j.judges, vec!["Mboweni J".to_string()]);
    }

    #[test]
    fn parses_numbered_paragraphs_in_order() {
        let j = parse(ZACC_FIXTURE).unwrap();
        assert!(j.paragraphs.len() >= 3, "{:?}", j.paragraphs);
        // The unnumbered coram line comes first.
        assert_eq!(j.paragraphs[0].number, None);
        assert_eq!(j.paragraphs[0].text, "MBOWENI J:");
        // Then numbered paragraphs, indices dense and monotonic.
        for (i, p) in j.paragraphs.iter().enumerate() {
            assert_eq!(p.index, i as u32);
        }
        let numbered: Vec<&str> = j
            .paragraphs
            .iter()
            .filter_map(|p| p.number.as_deref())
            .collect();
        assert_eq!(numbered, vec!["1", "2"]);
    }

    #[test]
    fn a_citation_embedded_in_a_paragraph_is_findable_by_molao_cite() {
        let j = parse(ZACC_FIXTURE).unwrap();
        let full_text = j
            .paragraphs
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let refs = molao_cite::extract(&full_text);
        let keys: Vec<String> = refs.iter().map(|r| r.citation.key()).collect();
        assert!(
            keys.contains(&"neutral:1995:ZACC:3".to_string()),
            "{keys:?}"
        );
    }

    #[test]
    fn the_parsed_judgment_verifies_its_own_id() {
        let j = parse(ZACC_FIXTURE).unwrap();
        assert!(j.verify_id());
    }

    #[test]
    fn a_different_court_and_case_shape_still_parses() {
        let j = parse(GPPHC_FIXTURE).expect("high court fixture must parse");
        assert_eq!(j.court, "ZAGPPHC");
        assert_eq!(j.title, "Nkosi v Nkosi");
        assert_eq!(j.case_numbers, vec!["12345/2025".to_string()]);
        assert!(j.verify_id());
        assert!(!j.paragraphs.is_empty());
    }

    #[test]
    fn a_missing_explicit_neutral_citation_falls_back_to_the_frbr_uri() {
        // This fixture has no akn:neutralCitation element at all.
        let j = parse(GPPHC_FIXTURE).unwrap();
        assert_eq!(j.neutral_citation.as_deref(), Some("[2025] ZAGPPHC 112"));
    }

    #[test]
    fn missing_frbr_uri_is_a_specific_error_not_a_panic() {
        let xml = r#"<?xml version="1.0"?><akomaNtoso><judgment><meta></meta><judgmentBody><decision><p><num>[1]</num>Text.</p></decision></judgmentBody></judgment></akomaNtoso>"#;
        assert_eq!(parse(xml), Err(AknError::MissingWorkUri));
    }

    #[test]
    fn malformed_xml_is_an_error_not_a_panic() {
        let result = parse("<not really <xml");
        assert!(matches!(result, Err(AknError::Xml(_))));
    }

    #[test]
    fn a_document_with_no_paragraphs_is_rejected() {
        let xml = r#"<?xml version="1.0"?>
<akomaNtoso>
  <judgment>
    <meta>
      <identification>
        <FRBRWork>
          <FRBRuri value="/akn/za/judgment/zacc/2026/1"/>
          <FRBRalias name="title" value="Empty v Case"/>
        </FRBRWork>
      </identification>
    </meta>
    <judgmentBody><decision></decision></judgmentBody>
  </judgment>
</akomaNtoso>"#;
        assert_eq!(parse(xml), Err(AknError::NoParagraphs));
    }

    #[test]
    fn a_uri_with_no_judgment_segment_cannot_yield_a_court() {
        let xml = r#"<?xml version="1.0"?>
<akomaNtoso>
  <judgment>
    <meta><identification><FRBRWork>
      <FRBRuri value="/akn/za/act/2026/1"/>
      <FRBRalias name="title" value="Not A Judgment"/>
    </FRBRWork></identification></meta>
    <judgmentBody><decision><p><num>[1]</num>Text.</p></decision></judgmentBody>
  </judgment>
</akomaNtoso>"#;
        assert!(matches!(parse(xml), Err(AknError::MissingCourt(_))));
    }
}
