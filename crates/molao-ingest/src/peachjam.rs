//! The peachjam adapter: one crawler for the whole AfricanLII network.
//!
//! Almost every AfricanLII member LII — Kenya Law, ULII, ZambiaLII, ZimLII,
//! NigeriaLII, and a dozen others — runs the same open-source **peachjam**
//! platform (Laws.Africa). They share a URL scheme, a `robots.txt` shape, and
//! a place to find metadata, so Molao needs **one** adapter parameterised by
//! host, not one scraper per country. This module is that adapter, plus the
//! polite two-step fetch orchestration a PDF-backed judgment needs (the page,
//! then its `/source.pdf`), plus the data table of which host serves which
//! jurisdiction.
//!
//! SAFLII (South Africa, Botswana) is **not** peachjam and is never crawled —
//! it is a citation-resolution target only, hard-denied in [`crate::fetch`]
//! and marked [`Platform::SafliiCitationOnly`] here so a `crawl` command
//! refuses it with a clear message rather than a network error.
//!
//! ## What is verified, and what is not
//!
//! The parsing and enumeration *logic* is unit-tested offline against small
//! invented fixtures ([`FixtureTransport`](crate::fetch::FixtureTransport)).
//! Real peachjam markup varies between sites and over time — a listing page
//! may render its links through JavaScript, a judgment may be Akoma-Ntoso HTML
//! on one site and a scanned PDF on another. Confidence that this adapter
//! parses a *particular* live site comes only from running it against that
//! site (`molao crawl <host> --dry-run`), reported in `docs/SOURCES.md`, never
//! from the offline tests alone. This is a polite, rate-limited crawl of a few
//! documents at a time, not a bulk mirror — raw Akoma Ntoso XML for bulk work
//! is the licensed `api.laws.africa` path, which this module does not touch.

use crate::adapter::{AdapterError, FetchedDocument, SourceAdapter};
use crate::fetch::{FetchClient, FetchError, FetchRecord, Transport};
use crate::html::{self, Hints};
use molao_core::region::{self, RegionProfile};
use molao_core::{DocId, Judgment, Provenance};
use regex::Regex;
use std::sync::LazyLock;
use std::time::Duration;
use url::Url;

/// Which platform a jurisdiction's case law lives on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    /// An AfricanLII / Laws.Africa peachjam site: crawlable by this adapter.
    Peachjam,
    /// SAFLII-hosted: citation-resolution only, never crawled. See the module
    /// docs and [`crate::fetch::HARD_DENIED_HOSTS`].
    SafliiCitationOnly,
}

/// One row of the sources registry: a jurisdiction, its host, its platform.
#[derive(Debug, Clone, Copy)]
pub struct SourceEntry {
    /// Region code — an ISO 3166 country code for a national LII, or a
    /// descriptive code for a pan-African site. Judgments are filed under the
    /// country prefix of their own `akn` path, which for a national site is
    /// this same code.
    pub region: &'static str,
    /// Human-readable name, for operator-facing listings.
    pub name: &'static str,
    /// Base host, e.g. `new.kenyalaw.org`.
    pub host: &'static str,
    pub platform: Platform,
}

impl SourceEntry {
    /// The `https://<host>` base URL for this source.
    pub fn base_url(&self) -> String {
        format!("https://{}", self.host)
    }
}

/// The sources registry: which host serves which jurisdiction, and on what
/// platform. Data, not branches — adding a jurisdiction is a row here.
///
/// The peachjam hosts are the AfricanLII network; the two SAFLII entries mark
/// jurisdictions Molao resolves citations into but never crawls.
pub static SOURCES: &[SourceEntry] = &[
    SourceEntry {
        region: "KE",
        name: "Kenya Law",
        host: "new.kenyalaw.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "UG",
        name: "ULII (Uganda)",
        host: "ulii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "MW",
        name: "MalawiLII",
        host: "malawilii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "TZ",
        name: "TanzLII",
        host: "tanzlii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "ZM",
        name: "ZambiaLII",
        host: "zambialii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "ZW",
        name: "ZimLII",
        host: "zimlii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "LS",
        name: "LesothoLII",
        host: "lesotholii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "NA",
        name: "NamibLII",
        host: "namiblii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "SZ",
        name: "EswatiniLII",
        host: "eswatinilii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "GH",
        name: "GhaLII",
        host: "ghalii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "NG",
        name: "NigeriaLII",
        host: "nigerialii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "AFRICANLII",
        name: "AfricanLII (pan-African)",
        host: "africanlii.org",
        platform: Platform::Peachjam,
    },
    SourceEntry {
        region: "ZA",
        name: "SAFLII (South Africa) — citation-only",
        host: "www.saflii.org",
        platform: Platform::SafliiCitationOnly,
    },
    SourceEntry {
        region: "BW",
        name: "SAFLII (Botswana) — citation-only",
        host: "www.saflii.org",
        platform: Platform::SafliiCitationOnly,
    },
];

/// The first source registered for a region code, if any.
pub fn source_for_region(code: &str) -> Option<&'static SourceEntry> {
    SOURCES.iter().find(|s| s.region.eq_ignore_ascii_case(code))
}

/// The source whose host matches, if any. Matches the host exactly or as a
/// suffix (`new.kenyalaw.org` matches an entry for `kenyalaw.org` too).
pub fn source_for_host(host: &str) -> Option<&'static SourceEntry> {
    let host = host.trim().to_ascii_lowercase();
    SOURCES.iter().find(|s| {
        let h = s.host.to_ascii_lowercase();
        host == h || host.ends_with(&format!(".{h}")) || h.ends_with(&format!(".{host}"))
    })
}

/// Why a peachjam ingest failed.
#[derive(Debug, thiserror::Error)]
pub enum PeachjamError {
    #[error(transparent)]
    Fetch(#[from] FetchError),
    #[error(transparent)]
    Adapter(#[from] AdapterError),
    #[error(
        "{0} is not a peachjam site: it is a SAFLII citation-only target and is never crawled"
    )]
    NotPeachjam(String),
    #[error("no source is configured for region {0:?}; pass a base URL instead")]
    UnknownRegion(String),
    #[error("{0} is not a valid URL: {1}")]
    InvalidUrl(String, String),
    #[error("{0} does not look like a peachjam judgment URL (expected /akn/<cc>/judgment/...)")]
    NotAJudgmentUrl(String),
    #[error(
        "could not locate a judgment body (neither Akoma Ntoso HTML nor a source.pdf link) on {0}"
    )]
    NoBody(String),
    #[error("this judgment is PDF-backed but this build lacks the `pdf` feature; rebuild with --features pdf (molao-node enables it)")]
    PdfUnsupported,
    #[error("fetched {url}: server returned HTTP {status}")]
    BadStatus { url: String, status: u16 },
}

/// The peachjam adapter. Stateless with respect to any one site: every parse
/// derives the jurisdiction, court, and citation profile from the judgment's
/// own `akn` path, so a single instance handles every AfricanLII host.
///
/// The `region` field is only for [`SourceAdapter::region_code`] and registry
/// routing; parsing never reads it. Construct one with [`PeachjamAdapter::new`]
/// or leave it at the network-wide default.
#[derive(Debug, Clone, Copy)]
pub struct PeachjamAdapter {
    region: &'static str,
}

impl Default for PeachjamAdapter {
    fn default() -> Self {
        PeachjamAdapter {
            region: "AFRICANLII",
        }
    }
}

impl PeachjamAdapter {
    /// An adapter tagged with a region code for registry routing. The tag does
    /// not constrain what it parses — a `KE`-tagged adapter still parses a
    /// `ug` judgment correctly, deriving `UG` from that judgment's own path.
    pub const fn new(region: &'static str) -> Self {
        PeachjamAdapter { region }
    }
}

impl SourceAdapter for PeachjamAdapter {
    fn source_id(&self) -> &'static str {
        "peachjam"
    }

    fn region_code(&self) -> &'static str {
        self.region
    }

    fn is_corpus_url(&self, url: &str) -> bool {
        is_judgment_url(url)
    }

    /// Parse a fetched judgment **page**. Succeeds for an Akoma-Ntoso HTML
    /// judgment; for a PDF-backed judgment it returns
    /// [`AdapterError::SecondFetchRequired`] carrying the `source.pdf` URL,
    /// because that body is a second document this single-shot method cannot
    /// fetch — [`fetch_judgment`] handles that case.
    fn parse(&self, doc: &FetchedDocument<'_>) -> Result<Judgment, AdapterError> {
        let html_text = std::str::from_utf8(doc.body).map_err(|_| AdapterError::NotUtf8)?;
        let meta = PageMeta::parse(html_text, doc.url)?;
        match body_plan(html_text, doc.url)? {
            BodyPlan::Akn(body_html) => build_from_akn_html(&meta, &body_html),
            BodyPlan::Pdf(pdf_url) => Err(AdapterError::SecondFetchRequired(pdf_url)),
        }
    }
}

/// Where a judgment page's body actually lives.
#[derive(Debug, Clone, PartialEq, Eq)]
enum BodyPlan {
    /// An Akoma-Ntoso HTML body, sliced out of the page ready for
    /// [`html::extract`].
    Akn(String),
    /// A PDF-backed judgment: fetch this absolute URL and run
    /// [`html::extract_pdf`].
    Pdf(String),
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/// Is this a peachjam judgment URL? `.../akn/<cc>/judgment/...`.
pub fn is_judgment_url(url: &str) -> bool {
    match akn_path(url) {
        Some(path) => path.contains("/judgment/"),
        None => url.contains("/akn/") && url.contains("/judgment/"),
    }
}

/// The `/akn/...` portion of a URL, path-only.
fn akn_path(url: &str) -> Option<String> {
    let parsed = Url::parse(url).ok()?;
    let path = parsed.path();
    path.contains("/akn/").then(|| path.to_string())
}

/// The ISO country code from a peachjam judgment's `akn` path, upper-cased —
/// `/akn/ke/judgment/...` → `KE`. This is the jurisdiction a judgment is filed
/// under, taken from the document itself rather than the host it was served
/// from.
pub fn country_from_url(url: &str) -> Option<String> {
    let path = akn_path(url).unwrap_or_else(|| url.to_string());
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let akn = segs.iter().position(|s| *s == "akn")?;
    segs.get(akn + 1)
        .filter(|cc| cc.len() == 2 && cc.chars().all(|c| c.is_ascii_alphabetic()))
        .map(|cc| cc.to_ascii_uppercase())
}

/// `(court, year, number)` from a judgment's FRBR path:
/// `/akn/ke/judgment/keca/2026/1460` → `("KECA", 2026, 1460)`.
fn frbr_parts(url_or_path: &str) -> Option<(String, u16, u32)> {
    let path = akn_path(url_or_path).unwrap_or_else(|| url_or_path.to_string());
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let idx = segs.iter().position(|s| *s == "judgment")?;
    let court = segs.get(idx + 1)?.to_ascii_uppercase();
    let year = segs.get(idx + 2)?.parse::<u16>().ok()?;
    let number = segs.get(idx + 3)?.parse::<u32>().ok()?;
    Some((court, year, number))
}

/// The region citation profile for a judgment URL — the country's profile if
/// one is built in, else `GENERIC`, exactly as the rest of the crate treats an
/// unprofiled jurisdiction.
fn profile_for_url(url: &str) -> &'static RegionProfile {
    country_from_url(url)
        .and_then(|cc| region::builtin(&cc))
        .unwrap_or(&region::GENERIC)
}

// ---------------------------------------------------------------------------
// Metadata from og:title + FRBR path
// ---------------------------------------------------------------------------

/// Everything the page states about the judgment, before its body: parties,
/// case number, citations, date, decision type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageMeta {
    pub court: String,
    pub title: String,
    pub neutral_citation: Option<String>,
    pub reported_citations: Vec<String>,
    pub case_numbers: Vec<String>,
    pub date: Option<String>,
    pub decision_type: Option<String>,
}

static OG_TITLE_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<meta\b[^>]*\bproperty\s*=\s*"og:title"[^>]*>"#)
        .expect("static og:title tag pattern")
});
static TWITTER_TITLE_TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<meta\b[^>]*\bname\s*=\s*"twitter:title"[^>]*>"#)
        .expect("static twitter:title tag pattern")
});
static CONTENT_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?is)\bcontent\s*=\s*"([^"]*)""#).expect("static content attr"));
static H1_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<h1[^>]*>(.*?)</h1>").expect("static h1 pattern"));
static WORK_FRBR_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)data-work-frbr-uri\s*=\s*"([^"]*)""#).expect("static work-frbr attr")
});
/// `(17 July 2026)` or `17 January 2026` anywhere in the title tail.
static DATE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})").expect("static date pattern")
});
/// Parenthesised groups, in order — case number, citations, date, type.
static PAREN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\(([^()]*)\)").expect("static paren pattern"));

fn og_title(html: &str) -> Option<String> {
    let tag = OG_TITLE_TAG
        .find(html)
        .or_else(|| TWITTER_TITLE_TAG.find(html))?;
    let content = CONTENT_ATTR.captures(tag.as_str())?.get(1)?.as_str();
    let decoded = decode_entities(content);
    (!decoded.trim().is_empty()).then(|| decoded.trim().to_string())
}

fn h1_title(html: &str) -> Option<String> {
    let inner = H1_TAG.captures(html)?.get(1)?.as_str();
    let stripped = strip_tags_lossy(inner);
    let decoded = decode_entities(&stripped);
    (!decoded.trim().is_empty()).then(|| decoded.trim().to_string())
}

fn month_number(name: &str) -> Option<u8> {
    let n = name.to_ascii_lowercase();
    let months = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];
    months
        .iter()
        .position(|m| *m == n || m.starts_with(&n) && n.len() >= 3)
        .map(|i| (i + 1) as u8)
}

/// `17 July 2026` → `2026-07-17`.
fn parse_iso_date(text: &str) -> Option<String> {
    let caps = DATE_RE.captures(text)?;
    let day: u8 = caps.get(1)?.as_str().parse().ok()?;
    let month = month_number(caps.get(2)?.as_str())?;
    let year: u16 = caps.get(3)?.as_str().parse().ok()?;
    if (1..=31).contains(&day) {
        Some(format!("{year:04}-{month:02}-{day:02}"))
    } else {
        None
    }
}

impl PageMeta {
    /// Parse metadata from a peachjam judgment page's HTML and its URL.
    ///
    /// The court, year, and number come from the FRBR path (authoritative);
    /// everything else — parties, case number, reported citation, date,
    /// decision type — comes from the `og:title` string, cross-checked with
    /// [`molao_cite`].
    pub fn parse(html: &str, url: &str) -> Result<Self, AdapterError> {
        // Court/year/number: FRBR path from the page, falling back to the URL.
        let frbr = WORK_FRBR_ATTR
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .and_then(|p| frbr_parts(&p))
            .or_else(|| frbr_parts(url))
            .ok_or_else(|| AdapterError::NoFrbrPath(url.to_string()))?;
        let (court, year, number) = frbr;

        let title_line = og_title(html)
            .or_else(|| h1_title(html))
            .unwrap_or_default();

        // Parties and the court's own case description. Party names can
        // themselves contain parentheses ("… (NIG) LTD …"), so splitting on
        // the first `(` is wrong; split at the neutral-citation bracket
        // instead, then peel the case-number parenthetical off the tail.
        let (parties, case_desc) = split_title(&title_line);

        // Citations from the title, via the jurisdiction's profile.
        let profile = profile_for_url(url);
        let extractor = molao_cite::Extractor::for_profile(profile);
        let refs = extractor.extract(&title_line);
        let mut neutral_citation = None;
        let mut reported_citations = Vec::new();
        let mut case_numbers = Vec::new();
        for r in &refs {
            match &r.citation {
                molao_cite::Citation::Neutral { .. } if neutral_citation.is_none() => {
                    neutral_citation = Some(r.citation.canonical());
                }
                molao_cite::Citation::Reported { .. } => {
                    let c = r.citation.canonical();
                    if !reported_citations.contains(&c) {
                        reported_citations.push(c);
                    }
                }
                molao_cite::Citation::CaseNumber { .. } => {
                    let c = r.citation.canonical();
                    if !case_numbers.contains(&c) {
                        case_numbers.push(c);
                    }
                }
                molao_cite::Citation::Neutral { .. } => {}
            }
        }
        // The FRBR path reconstructs the neutral citation when the title's
        // spelling did not parse (a new court code not in any profile still
        // has a well-formed path).
        let neutral_citation =
            neutral_citation.or_else(|| Some(format!("[{year}] {court} {number}")));

        let date = parse_iso_date(&title_line);
        let decision_type = decision_type_from(&title_line);

        // The parenthetical just before the citation — "(Civil Application
        // E044 of 2026)", "(SC. 310/2008)" — is the court's own case
        // description; keep it as a case number if molao_cite found none of the
        // slash-form kind.
        if case_numbers.is_empty() {
            if let Some(desc) = case_desc {
                case_numbers.push(desc);
            }
        }

        Ok(PageMeta {
            court,
            title: parties,
            neutral_citation,
            reported_citations,
            case_numbers,
            date,
            decision_type,
        })
    }
}

/// The last parenthesised group, when it is a short word like `Ruling`,
/// `Judgment`, `Order` — peachjam's decision-type tag.
fn decision_type_from(title: &str) -> Option<String> {
    let groups: Vec<&str> = PAREN_RE
        .captures_iter(title)
        .filter_map(|c| c.get(1).map(|m| m.as_str().trim()))
        .collect();
    let last = groups.last()?;
    let words = last.split_whitespace().count();
    let looks_like_type =
        words <= 3 && last.chars().next().is_some_and(|c| c.is_ascii_alphabetic());
    // Not a date and not a citation.
    if looks_like_type && parse_iso_date(last).is_none() && !last.contains('[') {
        Some(last.to_string())
    } else {
        None
    }
}

static CITE_BRACKET: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\d{4}\]").expect("static citation-bracket pattern"));

/// Split a peachjam title `PARTIES (case desc) [YYYY] COURT n (report) (date)
/// (type)` into `(parties, case_description)`.
///
/// The split point is the neutral-citation bracket, not the first `(` — party
/// names contain parentheses ("… (NIG) LTD …"). Everything before the bracket
/// is the parties plus, usually, a trailing case-number parenthetical, which is
/// peeled off as the description.
fn split_title(title: &str) -> (String, Option<String>) {
    let head = match CITE_BRACKET.find(title) {
        Some(m) => title[..m.start()].trim(),
        // No citation bracket: fall back to the first parenthetical.
        None => {
            return (
                title
                    .split_once('(')
                    .map_or(title, |(h, _)| h)
                    .trim()
                    .to_string(),
                None,
            )
        }
    };

    if head.ends_with(')') {
        if let Some(open) = head.rfind('(') {
            let desc = head[open + 1..head.len() - 1].trim().to_string();
            let parties = head[..open].trim().to_string();
            let desc = (!desc.is_empty()).then_some(desc);
            let parties = if parties.is_empty() {
                head.to_string()
            } else {
                parties
            };
            return (parties, desc);
        }
    }
    (head.to_string(), None)
}

// ---------------------------------------------------------------------------
// Body detection & extraction
// ---------------------------------------------------------------------------

static SOURCE_PDF_HREF: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)href\s*=\s*"([^"]*?/source\.pdf)""#).expect("static source.pdf href pattern")
});
static LA_AKN_OPEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<la-akoma-ntoso\b").expect("static la-akoma-ntoso open"));

/// Decide where a judgment page's body is, and produce a fetch/extract plan.
fn body_plan(html: &str, page_url: &str) -> Result<BodyPlan, AdapterError> {
    let pdf_backed = html.contains("content__pdf")
        || html.contains(r#"data-display-type="pdf""#)
        || html.contains("data-display-type='pdf'");

    // Prefer an HTML body when the page carries one with substance — either as
    // a `<la-akoma-ntoso>` custom element, or as standard HTML inside peachjam's
    // `content content__html` container.
    if !pdf_backed {
        if let Some(body) = slice_html_body(html) {
            if body_has_text(&body) {
                return Ok(BodyPlan::Akn(body));
            }
        }
    }

    // Otherwise the body is the source PDF: use the link the page gives, or
    // construct it from the dated expression the link would have carried.
    if let Some(href) = SOURCE_PDF_HREF.captures(html).and_then(|c| c.get(1)) {
        let abs = resolve(page_url, href.as_str())
            .ok_or_else(|| AdapterError::NoBody(page_url.to_string()))?;
        return Ok(BodyPlan::Pdf(abs));
    }

    // A page that was neither HTML-bodied nor advertised a PDF: an honest
    // "cannot find a body" rather than a guess.
    Err(AdapterError::NoBody(page_url.to_string()))
}

/// Slice a judgment's HTML body region out of a peachjam page, handling both
/// renderings: the `<la-akoma-ntoso>` custom element, and standard HTML inside
/// a `content content__html` container (bounded by the `<la-gutter>` peachjam
/// places after the content).
fn slice_html_body(html: &str) -> Option<String> {
    if let Some(body) = slice_la_akoma_ntoso(html) {
        if body_has_text(&body) {
            return Some(body);
        }
    }

    let marker = html
        .find("content content__html")
        .or_else(|| html.find("content__html"))?;
    // Back up to the `<div` that opens this container.
    let start = html[..marker].rfind("<div")?;
    let rest = &html[start..];
    // The judgment content ends where the annotation gutter begins; failing
    // that, at the enclosing article's close, else the end of the document.
    let end = rest
        .find("<la-gutter")
        .or_else(|| rest.find("</article"))
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

/// Slice the `<la-akoma-ntoso>…</la-akoma-ntoso>` element out of a page.
fn slice_la_akoma_ntoso(html: &str) -> Option<String> {
    let open = LA_AKN_OPEN.find(html)?;
    let start = open.start();
    let close_tag = "</la-akoma-ntoso>";
    let rel_end = html[start..].to_ascii_lowercase().rfind(close_tag)?;
    let end = start + rel_end + close_tag.len();
    Some(html[start..end].to_string())
}

/// Does a sliced body carry a real judgment's worth of text, or is it an empty
/// PDF placeholder shell? A "Loading PDF…" placeholder is a handful of words; a
/// judgment body is hundreds.
fn body_has_text(body: &str) -> bool {
    strip_tags_lossy(body).split_whitespace().count() >= 40
}

/// Laws.Africa renders Akoma Ntoso to HTML as custom elements — `<akn-p>`,
/// `<akn-blockList>`, `<akn-item>` — which the generic [`html`] extractor does
/// not know are block-level. Rewrite the block-level ones to `<div>` so
/// paragraph breaks land where the judgment's structure actually is, while
/// leaving inline elements (`<akn-ref>`, `<akn-inline>`) untouched so a
/// citation does not become its own paragraph.
static AKN_BLOCK_OPEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)<akn-(?:p|block|blockList|item|listIntroduction|heading|subheading|crossHeading|intro|wrapUp|paragraph|subparagraph|section|article|hcontainer|division|tr)\b[^>]*>",
    )
    .expect("static akn block-open pattern")
});
static AKN_BLOCK_CLOSE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)</akn-(?:p|block|blockList|item|listIntroduction|heading|subheading|crossHeading|intro|wrapUp|paragraph|subparagraph|section|article|hcontainer|division|tr)>",
    )
    .expect("static akn block-close pattern")
});

fn akn_html_to_blocks(body: &str) -> String {
    let opened = AKN_BLOCK_OPEN.replace_all(body, "<div>");
    AKN_BLOCK_CLOSE.replace_all(&opened, "</div>").into_owned()
}

/// Build a [`Judgment`] from a metadata block and an Akoma-Ntoso HTML body.
fn build_from_akn_html(meta: &PageMeta, body_html: &str) -> Result<Judgment, AdapterError> {
    let hints = Hints {
        court: Some(meta.court.clone()),
        title: Some(meta.title.clone()),
        date: meta.date.clone(),
    };
    let blocked = akn_html_to_blocks(body_html);
    let mut j = html::extract(&blocked, &region::GENERIC, &hints)?;
    merge_meta(&mut j, meta);
    Ok(j)
}

/// Overlay metadata parsed from the page onto a judgment whose *paragraphs*
/// (and therefore [`DocId`]) came from the body. The id is unaffected because
/// it hashes only paragraph text, which this never touches.
fn merge_meta(j: &mut Judgment, meta: &PageMeta) {
    j.court = meta.court.clone();
    if !meta.title.is_empty() {
        j.title = meta.title.clone();
    }
    if meta.neutral_citation.is_some() {
        j.neutral_citation = meta.neutral_citation.clone();
    }
    if j.date.is_none() {
        j.date = meta.date.clone();
    }
    for c in &meta.case_numbers {
        if !j.case_numbers.contains(c) {
            j.case_numbers.push(c.clone());
        }
    }
    for c in &meta.reported_citations {
        if !j.reported_citations.contains(c) {
            j.reported_citations.push(c.clone());
        }
    }
}

/// Build a [`Judgment`] from a page's metadata and the bytes of its source
/// PDF. Available only with the `pdf` feature; without it, a PDF-backed
/// judgment is reported as unsupported rather than silently skipped.
#[cfg(feature = "pdf")]
fn build_from_pdf(meta: &PageMeta, pdf_bytes: &[u8]) -> Result<Judgment, PeachjamError> {
    let hints = Hints {
        court: Some(meta.court.clone()),
        title: Some(meta.title.clone()),
        date: meta.date.clone(),
    };
    let mut j = html::extract_pdf(pdf_bytes, &region::GENERIC, &hints)
        .map_err(|e| PeachjamError::Adapter(AdapterError::Html(e)))?;
    merge_meta(&mut j, meta);
    // Recompute the id from the merged paragraphs (unchanged by merge, but
    // explicit so the returned judgment always verifies).
    j.id = DocId::of_raw(
        &j.paragraphs
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n"),
    );
    Ok(j)
}

#[cfg(not(feature = "pdf"))]
fn build_from_pdf(_meta: &PageMeta, _pdf_bytes: &[u8]) -> Result<Judgment, PeachjamError> {
    Err(PeachjamError::PdfUnsupported)
}

// ---------------------------------------------------------------------------
// Fetch orchestration
// ---------------------------------------------------------------------------

/// A polite pause between requests to the same host. Real crawls inject
/// [`RealSleeper`]; tests inject [`NoSleeper`] and never wait.
pub trait Sleeper: std::fmt::Debug + Send + Sync {
    fn sleep(&self, dur: Duration);
}

/// Sleeps for real. What a live crawl uses.
#[derive(Debug, Default, Clone, Copy)]
pub struct RealSleeper;
impl Sleeper for RealSleeper {
    fn sleep(&self, dur: Duration) {
        std::thread::sleep(dur);
    }
}

/// Never sleeps. What offline tests use.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoSleeper;
impl Sleeper for NoSleeper {
    fn sleep(&self, _dur: Duration) {}
}

/// A fetched judgment plus the provenance of the bytes it was built from.
#[derive(Debug, Clone)]
pub struct FetchedJudgment {
    pub judgment: Judgment,
    /// Provenance of the *body* bytes — the source PDF for a PDF-backed
    /// judgment, the page HTML for an Akoma-Ntoso one. Unsigned at fetch time:
    /// a witness signs it separately (see [`crate::witness::sign`]), so its
    /// `witness` and `signature` are empty and its class is
    /// [`molao_core::ProvenanceClass::Manual`] until then.
    pub provenance: Provenance,
    /// Was the body a source PDF (`true`) or Akoma-Ntoso HTML (`false`)?
    pub pdf_backed: bool,
}

fn unsigned_provenance(doc_id: DocId, rec: &FetchRecord) -> Provenance {
    Provenance {
        doc_id,
        source_url: rec.source_url.clone(),
        fetched_at: rec.fetched_at.clone(),
        raw_hash: rec.raw_hash.clone(),
        witness: String::new(),
        signature: String::new(),
    }
}

fn check_status(rec: &FetchRecord) -> Result<(), PeachjamError> {
    if (200..300).contains(&rec.status) {
        Ok(())
    } else {
        Err(PeachjamError::BadStatus {
            url: rec.source_url.clone(),
            status: rec.status,
        })
    }
}

/// Fetch and parse a single peachjam judgment, following its body to a source
/// PDF when the page is PDF-backed. Sleeps `delay` between the page fetch and
/// the PDF fetch (same host) via `sleeper`.
pub fn fetch_judgment<T: Transport>(
    client: &FetchClient<T>,
    url: &str,
    delay: Duration,
    sleeper: &dyn Sleeper,
) -> Result<FetchedJudgment, PeachjamError> {
    if !is_judgment_url(url) {
        return Err(PeachjamError::NotAJudgmentUrl(url.to_string()));
    }

    let page = client.fetch(url)?;
    check_status(&page)?;
    let adapter = PeachjamAdapter::default();
    let doc = FetchedDocument {
        url,
        body: &page.body,
        content_type: page.content_type.as_deref(),
    };

    match adapter.parse(&doc) {
        Ok(judgment) => {
            let provenance = unsigned_provenance(judgment.id, &page);
            Ok(FetchedJudgment {
                judgment,
                provenance,
                pdf_backed: false,
            })
        }
        Err(AdapterError::SecondFetchRequired(pdf_url)) => {
            let html_text = std::str::from_utf8(&page.body)
                .map_err(|_| PeachjamError::Adapter(AdapterError::NotUtf8))?;
            let meta = PageMeta::parse(html_text, url)?;
            sleeper.sleep(delay);
            let pdf = client.fetch(&pdf_url)?;
            check_status(&pdf)?;
            let judgment = build_from_pdf(&meta, &pdf.body)?;
            let provenance = unsigned_provenance(judgment.id, &pdf);
            Ok(FetchedJudgment {
                judgment,
                provenance,
                pdf_backed: true,
            })
        }
        Err(e) => Err(PeachjamError::Adapter(e)),
    }
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

static JUDGMENT_HREF: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r##"(?is)href\s*=\s*"(/akn/[a-z]{2}/judgment/[^"#?]+)""##)
        .expect("static judgment href pattern")
});

/// Every distinct judgment URL linked from a listing page, resolved absolute
/// against `base`, in first-seen order. Robust to markup: it matches the
/// `/akn/<cc>/judgment/...` href wherever it appears.
pub fn extract_judgment_links(html: &str, base: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for caps in JUDGMENT_HREF.captures_iter(html) {
        let Some(m) = caps.get(1) else { continue };
        let href = m.as_str();
        // Skip obvious non-leaf links (a court/year index, not a judgment).
        let Some(abs) = resolve(base, href) else {
            continue;
        };
        if !is_judgment_url(&abs) {
            continue;
        }
        if seen.insert(abs.clone()) {
            out.push(abs);
        }
    }
    out
}

/// Enumerate up to `limit` judgment URLs from a peachjam site's listing pages,
/// following `?page=N` until the limit is reached or a page yields nothing new.
///
/// Honors robots and the crawl-delay through `client` and `sleeper`: it sleeps
/// `delay` before each listing-page fetch after the first.
pub fn enumerate<T: Transport>(
    client: &FetchClient<T>,
    base_url: &str,
    court: Option<&str>,
    limit: usize,
    delay: Duration,
    sleeper: &dyn Sleeper,
) -> Result<Vec<String>, PeachjamError> {
    let base = Url::parse(base_url)
        .map_err(|e| PeachjamError::InvalidUrl(base_url.to_string(), e.to_string()))?;
    let listing = match court {
        Some(c) => base
            .join(&format!("/judgments/{}/", c.to_ascii_uppercase()))
            .map_err(|e| PeachjamError::InvalidUrl(base_url.to_string(), e.to_string()))?,
        None => base
            .join("/judgments/")
            .map_err(|e| PeachjamError::InvalidUrl(base_url.to_string(), e.to_string()))?,
    };

    let mut found: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    // A hard cap on pages so a site that never stops paginating cannot make
    // this loop unbounded; polite crawling wants a handful of pages at most.
    let max_pages = 20usize;
    for page_no in 1..=max_pages {
        if found.len() >= limit {
            break;
        }
        let mut page_url = listing.clone();
        if page_no > 1 {
            page_url.set_query(Some(&format!("page={page_no}")));
        }
        if page_no > 1 {
            sleeper.sleep(delay);
        }
        let rec = client.fetch(page_url.as_str())?;
        // A 404 past page 1 just means we ran off the end of the listing.
        if !(200..300).contains(&rec.status) {
            break;
        }
        let html = String::from_utf8_lossy(&rec.body);
        let links = extract_judgment_links(&html, base_url);
        let before = found.len();
        for link in links {
            if found.len() >= limit {
                break;
            }
            if seen.insert(link.clone()) {
                found.push(link);
            }
        }
        // No new links on this page: the listing is exhausted (or JS-rendered
        // beyond what a static fetch sees) — stop rather than spin.
        if found.len() == before {
            break;
        }
    }
    Ok(found)
}

/// Resolve `href` (absolute or root-relative) against a base URL.
fn resolve(base: &str, href: &str) -> Option<String> {
    if href.starts_with("http://") || href.starts_with("https://") {
        return Some(href.to_string());
    }
    Url::parse(base)
        .ok()?
        .join(href)
        .ok()
        .map(|u| u.to_string())
}

// ---------------------------------------------------------------------------
// Small HTML helpers (local, lossy — the real extractor is html.rs)
// ---------------------------------------------------------------------------

fn decode_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// Strip tags to bare text — for measuring "does this body have words", not for
/// building paragraphs (that is [`html::extract`]'s job).
fn strip_tags_lossy(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FakeClock;
    use crate::fetch::{FixtureTransport, RawResponse};
    use time::OffsetDateTime;

    fn client(transport: FixtureTransport) -> FetchClient<FixtureTransport> {
        FetchClient::new(transport, FakeClock::new(OffsetDateTime::UNIX_EPOCH))
            .with_min_interval(time::Duration::ZERO)
    }

    // A tiny invented PDF-backed page, mirroring peachjam's structure but with
    // fictional parties and text — no real judgment is reproduced.
    const PDF_PAGE: &str = r#"<!doctype html><html><head>
        <meta property="og:title" content="Mbeki v Ndlovu (Civil Appeal E12 of 2027) [2027] KECA 99 (KLR) (3 March 2027) (Judgment)" />
        </head><body>
        <div id="document-content" data-work-frbr-uri="/akn/ke/judgment/keca/2027/99" data-display-type="pdf">
          <div class="content-and-enrichments__inner la-akoma-ntoso-with-gutter">
            <div class="content content__pdf">
              <div class="pdf-loading"><strong>Loading PDF...</strong></div>
            </div>
          </div>
        </div>
        <a href="/akn/ke/judgment/keca/2027/99/eng@2027-03-03/source.pdf">Download PDF</a>
        </body></html>"#;

    // A tiny invented Akoma-Ntoso HTML page: real markup shape, fictional body.
    const AKN_PAGE: &str = r#"<!doctype html><html><head>
        <meta property="og:title" content="Okafor v Republic (Criminal Appeal 5 of 2026) [2026] NGHC 7 (10 June 2026) (Ruling)" />
        </head><body>
        <div id="document-content" data-work-frbr-uri="/akn/ng/judgment/nghc/2026/7" data-display-type="html">
          <la-akoma-ntoso>
            <akn-akomaNtoso>
              <akn-p class="akn-p">The appellant approached this court seeking leave to appeal against the sentence imposed by the trial court, contending that the sentence was manifestly excessive in the circumstances of the case and that the trial court failed to take adequate account of the mitigating factors advanced on his behalf during the proceedings below.</akn-p>
              <akn-p class="akn-p">Having considered the record and the written submissions filed by both parties, and having heard oral argument, we are satisfied that the trial court properly directed itself as to the applicable sentencing principles and that no error of law has been demonstrated that would warrant the intervention of this court on appeal.</akn-p>
            </akn-akomaNtoso>
          </la-akoma-ntoso>
        </div>
        </body></html>"#;

    #[test]
    fn country_and_frbr_come_from_the_akn_path() {
        assert_eq!(
            country_from_url("https://new.kenyalaw.org/akn/ke/judgment/keca/2026/1460/eng"),
            Some("KE".to_string())
        );
        assert_eq!(
            frbr_parts("/akn/ke/judgment/keca/2026/1460"),
            Some(("KECA".to_string(), 2026, 1460))
        );
    }

    #[test]
    fn is_judgment_url_distinguishes_corpus_from_chrome() {
        assert!(is_judgment_url(
            "https://zambialii.org/akn/zm/judgment/zmhc/2025/12/eng"
        ));
        assert!(!is_judgment_url("https://zambialii.org/judgments/"));
        assert!(!is_judgment_url("https://zambialii.org/about"));
    }

    // A tiny invented page in peachjam's *other* body rendering: standard HTML
    // paragraphs inside `content content__html`, bounded by `<la-gutter>`, with
    // a party name that itself contains parentheses — no real judgment text.
    const HTML_BODY_PAGE: &str = r#"<!doctype html><html><head>
        <meta property="og:title" content="Acme (PVT) Ltd v Grande &amp; Sons (SC. 5/2019) [2019] NGSC 3 (14 May 2019)" />
        </head><body>
        <div id="document-content" data-work-frbr-uri="/akn/ng/judgment/ngsc/2019/3" data-display-type="html">
          <div class="content-and-enrichments__inner la-akoma-ntoso-with-gutter">
            <div class="content content__html frbr-doctype-judgment" id="document_content">
              <div>
                <p class="rtecenter"><strong>In the Supreme Court</strong></p>
                <p class="rtejustify">The appellant sought leave to appeal against the decision of the court below, contending that the trial court had no jurisdiction to entertain the suit as constituted and that the proceedings were therefore a nullity from the outset regardless of the merits.</p>
                <p class="rtejustify">Having examined the record and considered the arguments advanced by counsel on both sides, we are unable to accept the submission that the court below fell into error in the manner contended for by the appellant in its brief of argument.</p>
              </div>
            </div>
            <la-gutter akoma-ntoso=".content-and-enrichments .content"></la-gutter>
          </div>
        </div>
        </body></html>"#;

    #[test]
    fn split_title_keeps_parens_inside_party_names() {
        let (parties, desc) =
            split_title("Acme (PVT) Ltd v Grande & Sons (SC. 5/2019) [2019] NGSC 3 (14 May 2019)");
        assert_eq!(parties, "Acme (PVT) Ltd v Grande & Sons");
        assert_eq!(desc.as_deref(), Some("SC. 5/2019"));
    }

    #[test]
    fn body_plan_detects_a_standard_html_content_body() {
        let plan = body_plan(
            HTML_BODY_PAGE,
            "https://nigerialii.org/akn/ng/judgment/ngsc/2019/3",
        )
        .expect("plan");
        assert!(matches!(plan, BodyPlan::Akn(_)), "{plan:?}");
    }

    #[test]
    fn parse_builds_a_judgment_from_a_standard_html_body_page() {
        let adapter = PeachjamAdapter::default();
        let doc = FetchedDocument {
            url: "https://nigerialii.org/akn/ng/judgment/ngsc/2019/3",
            body: HTML_BODY_PAGE.as_bytes(),
            content_type: Some("text/html"),
        };
        let j = adapter.parse(&doc).expect("html-body page must parse");
        assert_eq!(j.court, "NGSC");
        assert_eq!(j.title, "Acme (PVT) Ltd v Grande & Sons");
        assert_eq!(j.neutral_citation.as_deref(), Some("[2019] NGSC 3"));
        assert_eq!(j.date.as_deref(), Some("2019-05-14"));
        assert!(j.paragraphs.len() >= 2, "{:?}", j.paragraphs);
        assert!(j.verify_id());
    }

    #[test]
    fn og_title_parses_parties_citation_date_and_type() {
        let meta = PageMeta::parse(
            PDF_PAGE,
            "https://new.kenyalaw.org/akn/ke/judgment/keca/2027/99",
        )
        .expect("must parse metadata");
        assert_eq!(meta.court, "KECA");
        assert_eq!(meta.title, "Mbeki v Ndlovu");
        assert_eq!(meta.neutral_citation.as_deref(), Some("[2027] KECA 99"));
        assert_eq!(meta.date.as_deref(), Some("2027-03-03"));
        assert_eq!(meta.decision_type.as_deref(), Some("Judgment"));
        assert!(
            meta.case_numbers.iter().any(|c| c.contains("E12")),
            "{:?}",
            meta.case_numbers
        );
    }

    #[test]
    fn body_plan_detects_a_pdf_backed_page_and_its_source_url() {
        let plan = body_plan(
            PDF_PAGE,
            "https://new.kenyalaw.org/akn/ke/judgment/keca/2027/99",
        )
        .expect("plan");
        assert_eq!(
            plan,
            BodyPlan::Pdf(
                "https://new.kenyalaw.org/akn/ke/judgment/keca/2027/99/eng@2027-03-03/source.pdf"
                    .to_string()
            )
        );
    }

    #[test]
    fn body_plan_detects_an_akoma_ntoso_html_body() {
        let plan = body_plan(
            AKN_PAGE,
            "https://nigerialii.org/akn/ng/judgment/nghc/2026/7",
        )
        .expect("plan");
        assert!(matches!(plan, BodyPlan::Akn(_)));
    }

    #[test]
    fn parse_builds_a_judgment_from_an_akoma_ntoso_page() {
        let adapter = PeachjamAdapter::default();
        let doc = FetchedDocument {
            url: "https://nigerialii.org/akn/ng/judgment/nghc/2026/7",
            body: AKN_PAGE.as_bytes(),
            content_type: Some("text/html"),
        };
        let j = adapter.parse(&doc).expect("akn page must parse");
        assert_eq!(j.court, "NGHC");
        assert_eq!(j.title, "Okafor v Republic");
        assert_eq!(j.neutral_citation.as_deref(), Some("[2026] NGHC 7"));
        assert!(j.paragraphs.len() >= 2, "{:?}", j.paragraphs);
        assert!(j.verify_id());
    }

    #[test]
    fn parse_signals_a_second_fetch_for_a_pdf_backed_page() {
        let adapter = PeachjamAdapter::default();
        let doc = FetchedDocument {
            url: "https://new.kenyalaw.org/akn/ke/judgment/keca/2027/99",
            body: PDF_PAGE.as_bytes(),
            content_type: Some("text/html"),
        };
        match adapter.parse(&doc) {
            Err(AdapterError::SecondFetchRequired(url)) => {
                assert!(url.ends_with("/source.pdf"), "{url}");
            }
            other => panic!("expected SecondFetchRequired, got {other:?}"),
        }
    }

    #[test]
    fn extract_judgment_links_dedupes_and_filters_chrome() {
        let listing = r#"<html><body>
            <a href="/akn/zm/judgment/zmhc/2025/12/eng">Case one</a>
            <a href="/akn/zm/judgment/zmhc/2025/13/eng">Case two</a>
            <a href="/akn/zm/judgment/zmhc/2025/12/eng">Case one again</a>
            <a href="/about">About</a>
            <a href="/judgments/?page=2">Next</a>
        </body></html>"#;
        let links = extract_judgment_links(listing, "https://zambialii.org");
        assert_eq!(links.len(), 2, "{links:?}");
        assert!(links[0].ends_with("/akn/zm/judgment/zmhc/2025/12/eng"));
        assert!(links.iter().all(|l| l.starts_with("https://zambialii.org")));
    }

    #[test]
    fn fetch_judgment_follows_a_pdf_backed_page_to_its_source() {
        // Only meaningful with the pdf feature — without it, the PDF path is
        // reported unsupported rather than parsed, which we assert instead.
        let page_url = "https://new.kenyalaw.org/akn/ke/judgment/keca/2027/99/eng";
        let pdf_url =
            "https://new.kenyalaw.org/akn/ke/judgment/keca/2027/99/eng@2027-03-03/source.pdf";
        let transport = FixtureTransport::new()
            .with_status("https://new.kenyalaw.org/robots.txt", 404)
            .with(
                page_url,
                RawResponse {
                    status: 200,
                    body: PDF_PAGE.as_bytes().to_vec(),
                    content_type: Some("text/html".into()),
                },
            )
            .with(
                pdf_url,
                RawResponse {
                    status: 200,
                    // Not a real PDF; exercises the fetch plumbing and, without
                    // the pdf feature, the unsupported path.
                    body: b"%PDF-1.4 not a real pdf".to_vec(),
                    content_type: Some("application/pdf".into()),
                },
            );
        let client = client(transport);
        let result = fetch_judgment(&client, page_url, Duration::ZERO, &NoSleeper);

        #[cfg(not(feature = "pdf"))]
        assert!(matches!(result, Err(PeachjamError::PdfUnsupported)));

        #[cfg(feature = "pdf")]
        {
            // With the feature, the bytes above are not a valid PDF, so
            // extraction fails cleanly — the point proven is that the page was
            // parsed, the source.pdf URL resolved, and the second fetch ran.
            assert!(
                matches!(result, Err(PeachjamError::Adapter(_))),
                "expected a clean PDF-extraction error, got {result:?}"
            );
        }
    }

    #[test]
    fn enumerate_walks_listing_pages_and_stops_when_exhausted() {
        let transport = FixtureTransport::new()
            .with_status("https://zambialii.org/robots.txt", 404)
            .with_body(
                "https://zambialii.org/judgments/",
                r#"<a href="/akn/zm/judgment/zmhc/2025/1/eng">1</a>
                   <a href="/akn/zm/judgment/zmhc/2025/2/eng">2</a>"#,
            )
            .with_body(
                "https://zambialii.org/judgments/?page=2",
                r#"<a href="/akn/zm/judgment/zmhc/2025/3/eng">3</a>"#,
            )
            .with_status("https://zambialii.org/judgments/?page=3", 404);
        let client = client(transport);
        let urls = enumerate(
            &client,
            "https://zambialii.org",
            None,
            10,
            Duration::ZERO,
            &NoSleeper,
        )
        .expect("enumerate");
        assert_eq!(urls.len(), 3, "{urls:?}");
    }

    #[test]
    fn enumerate_honors_the_limit() {
        let transport = FixtureTransport::new()
            .with_status("https://zambialii.org/robots.txt", 404)
            .with_body(
                "https://zambialii.org/judgments/",
                r#"<a href="/akn/zm/judgment/zmhc/2025/1/eng">1</a>
                   <a href="/akn/zm/judgment/zmhc/2025/2/eng">2</a>
                   <a href="/akn/zm/judgment/zmhc/2025/3/eng">3</a>"#,
            );
        let client = client(transport);
        let urls = enumerate(
            &client,
            "https://zambialii.org",
            None,
            2,
            Duration::ZERO,
            &NoSleeper,
        )
        .expect("enumerate");
        assert_eq!(urls.len(), 2, "{urls:?}");
    }

    #[test]
    fn sources_registry_marks_saflii_citation_only_and_finds_peachjam_hosts() {
        assert_eq!(
            source_for_region("KE").map(|s| s.platform),
            Some(Platform::Peachjam)
        );
        assert_eq!(
            source_for_region("BW").map(|s| s.platform),
            Some(Platform::SafliiCitationOnly)
        );
        assert_eq!(
            source_for_host("new.kenyalaw.org").map(|s| s.region),
            Some("KE")
        );
    }
}
