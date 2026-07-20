//! Jurisdiction adapters: what turns "a URL and some fetched bytes" into a
//! [`molao_core::Judgment`], and what decides whether a URL is worth
//! fetching in the first place.
//!
//! This is the layer that keeps the rest of the crate pan-African rather
//! than South-Africa-shaped code with data bolted on afterwards. Everything
//! upstream of here — [`crate::fetch`], [`crate::akn`], [`crate::html`] — is
//! jurisdiction-neutral machinery; everything jurisdiction-specific is
//! exactly one [`SourceAdapter`] plus, usually, a
//! [`molao_core::region::RegionProfile`] for its citation grammar. Adding a
//! new country or a new court's self-published site to the corpus should
//! never require a new branch in the fetcher or either parser — it should be
//! a new adapter, built from data, registered in an [`AdapterRegistry`]
//! keyed by region code exactly the way [`molao_core::region::builtin`]
//! keys its profiles.
//!
//! ## Corpus vs. chrome
//!
//! `docs/SOURCES.md`'s rules are about *bulk* fetching, and most of any
//! court or LII website is not a judgment: search forms, navigation, an
//! about page, a contact form. [`SourceAdapter::is_corpus_url`] is the one
//! place a node decides "this URL is worth fetching for the corpus" versus
//! "this is chrome, leave it alone" — a witness daemon or crawl frontier is
//! expected to call it before ever handing a URL to
//! [`crate::fetch::FetchClient::fetch`], so that a node's crawl surface is
//! exactly what its adapters claim, and nothing wider.

use crate::akn::{self, AknError};
use crate::html::{self, Hints, HtmlError};
use molao_core::region::{self, RegionProfile};
use molao_core::Judgment;

/// Why turning a fetched document into a [`Judgment`] failed.
#[derive(Debug, thiserror::Error)]
pub enum AdapterError {
    #[error(transparent)]
    Akn(#[from] AknError),
    #[error(transparent)]
    Html(#[from] HtmlError),
    #[error("document body is not valid UTF-8")]
    NotUtf8,
}

/// A fetched document, ready to be handed to an adapter.
///
/// Deliberately just bytes plus what was asked for — nothing here has parsed
/// anything yet. Keeping [`crate::fetch::FetchRecord`] and this decoupled
/// from `SourceAdapter` is what lets [`crate::witness::sign`] attest to
/// exactly the same fetch that [`SourceAdapter::parse`] later structures,
/// without either module depending on the other.
#[derive(Debug, Clone, Copy)]
pub struct FetchedDocument<'a> {
    pub url: &'a str,
    pub body: &'a [u8],
    pub content_type: Option<&'a str>,
}

/// One source: a licensed bulk supplier, a single court's site, a gazette.
/// Maps its URLs to judgments.
///
/// See the module docs for why this is the pluggable unit rather than a
/// per-jurisdiction branch anywhere else in the crate.
pub trait SourceAdapter: std::fmt::Debug + Send + Sync {
    /// Stable identifier for this source, e.g. `"laws-africa"` or
    /// `"za-zagpphc-direct"`. For operator-facing configuration and logging;
    /// not interpreted by this crate.
    fn source_id(&self) -> &'static str;

    /// Region profile code this source's judgments should be parsed and
    /// cited against — see [`molao_core::region::builtin`].
    fn region_code(&self) -> &'static str;

    /// Is this URL a judgment to ingest, or navigation/chrome to leave
    /// alone? An adapter must never assume every URL under a domain is
    /// corpus content.
    fn is_corpus_url(&self, url: &str) -> bool;

    /// Turn a fetched document into a structured judgment.
    fn parse(&self, doc: &FetchedDocument<'_>) -> Result<Judgment, AdapterError>;
}

fn resolve_profile(code: &str) -> &'static RegionProfile {
    region::builtin(code).unwrap_or(&region::GENERIC)
}

fn body_as_str<'a>(doc: &FetchedDocument<'a>) -> Result<&'a str, AdapterError> {
    std::str::from_utf8(doc.body).map_err(|_| AdapterError::NotUtf8)
}

/// Laws.Africa / AfricanLII: the licensed bulk path (`docs/SOURCES.md` rule
/// 2). Akoma Ntoso XML, served at URLs following Laws.Africa's own `/akn/
/// <country>/judgment/...` scheme, which is also how [`akn::parse`] derives
/// the court.
#[derive(Debug, Clone, Copy)]
pub struct LawsAfricaAdapter {
    region: &'static str,
}

impl LawsAfricaAdapter {
    /// A Laws.Africa/AfricanLII adapter for `region_code` (any code known to
    /// [`molao_core::region::builtin`], or any other — an unrecognised code
    /// resolves to [`region::GENERIC`], never a parse error, matching how
    /// the rest of the crate treats an unprofiled jurisdiction).
    pub const fn new(region_code: &'static str) -> Self {
        LawsAfricaAdapter {
            region: region_code,
        }
    }

    /// South Africa, the reference jurisdiction.
    pub const fn za() -> Self {
        Self::new("ZA")
    }
}

impl SourceAdapter for LawsAfricaAdapter {
    fn source_id(&self) -> &'static str {
        "laws-africa"
    }

    fn region_code(&self) -> &'static str {
        self.region
    }

    fn is_corpus_url(&self, url: &str) -> bool {
        // Laws.Africa's own akn: URI scheme doubles as its web path scheme.
        // Everything else on the domain — the homepage, search, the about
        // page — is chrome.
        url.contains("/akn/") && url.contains("/judgment/")
    }

    fn parse(&self, doc: &FetchedDocument<'_>) -> Result<Judgment, AdapterError> {
        Ok(akn::parse(body_as_str(doc)?)?)
    }
}

/// A single court or gazette that only publishes HTML, matched by a URL
/// prefix — the pattern for "courts/gazettes that only self-publish"
/// (`docs/SOURCES.md` rule 1). One of these per site, built from data (a
/// prefix, a court code, a region), never a new parser.
#[derive(Debug, Clone)]
pub struct HtmlCourtAdapter {
    pub id: &'static str,
    pub region: &'static str,
    pub court_code: &'static str,
    /// URL prefix that identifies a judgment page on this site, e.g.
    /// `"https://judiciary.example.gov/decisions/"`.
    pub corpus_prefix: &'static str,
}

impl SourceAdapter for HtmlCourtAdapter {
    fn source_id(&self) -> &'static str {
        self.id
    }

    fn region_code(&self) -> &'static str {
        self.region
    }

    fn is_corpus_url(&self, url: &str) -> bool {
        url.starts_with(self.corpus_prefix)
    }

    fn parse(&self, doc: &FetchedDocument<'_>) -> Result<Judgment, AdapterError> {
        let text = body_as_str(doc)?;
        let hints = Hints {
            court: Some(self.court_code.to_string()),
            title: None,
            date: None,
        };
        Ok(html::extract(text, resolve_profile(self.region), &hints)?)
    }
}

/// A node's configured set of sources, looked up by region code — the same
/// data-driven join [`RegionProfile`] uses for citation grammar, so a node
/// serving several jurisdictions dispatches ingest the same way it
/// dispatches citation parsing: by asking the data which adapter applies,
/// never by branching on jurisdiction in code.
#[derive(Debug, Default)]
pub struct AdapterRegistry {
    adapters: Vec<Box<dyn SourceAdapter>>,
}

impl AdapterRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, adapter: Box<dyn SourceAdapter>) -> &mut Self {
        self.adapters.push(adapter);
        self
    }

    /// Every adapter registered for a region, in registration order.
    pub fn for_region(&self, region_code: &str) -> Vec<&dyn SourceAdapter> {
        self.adapters
            .iter()
            .filter(|a| a.region_code().eq_ignore_ascii_case(region_code))
            .map(|a| a.as_ref())
            .collect()
    }

    /// The first registered adapter for this region willing to claim `url`
    /// as corpus content. `None` means nothing configured for this region
    /// recognises the URL — under `docs/SOURCES.md`, that means it should
    /// not be bulk-fetched, not that a fallback should guess.
    pub fn adapter_for_url(&self, region_code: &str, url: &str) -> Option<&dyn SourceAdapter> {
        self.for_region(region_code)
            .into_iter()
            .find(|a| a.is_corpus_url(url))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ZACC_FIXTURE: &[u8] = include_bytes!("../fixtures/akn/zacc_2026_26.xml");
    const HTML_FIXTURE: &[u8] = include_bytes!("../fixtures/html/gazette_notice.html");

    #[test]
    fn laws_africa_adapter_distinguishes_corpus_from_chrome() {
        let adapter = LawsAfricaAdapter::za();
        assert!(adapter
            .is_corpus_url("https://africanlii.org/akn/za/judgment/zacc/2026/26/eng@/main.xml"));
        assert!(!adapter.is_corpus_url("https://africanlii.org/about"));
        assert!(!adapter.is_corpus_url("https://africanlii.org/search?q=makwanyane"));
    }

    #[test]
    fn laws_africa_adapter_parses_a_fetched_document() {
        let adapter = LawsAfricaAdapter::za();
        let doc = FetchedDocument {
            url: "https://africanlii.org/akn/za/judgment/zacc/2026/26/eng@/main.xml",
            body: ZACC_FIXTURE,
            content_type: Some("application/xml"),
        };
        let j = adapter.parse(&doc).expect("must parse");
        assert_eq!(j.court, "ZACC");
        assert_eq!(adapter.region_code(), "ZA");
        assert_eq!(adapter.source_id(), "laws-africa");
    }

    #[test]
    fn html_court_adapter_only_claims_its_own_prefix() {
        let adapter = HtmlCourtAdapter {
            id: "za-zagpphc-direct",
            region: "ZA",
            court_code: "ZAGPPHC",
            corpus_prefix: "https://judiciary.example.gov/decisions/",
        };
        assert!(adapter.is_corpus_url("https://judiciary.example.gov/decisions/2026/1.html"));
        assert!(!adapter.is_corpus_url("https://judiciary.example.gov/about"));
        assert!(!adapter.is_corpus_url("https://other.example.gov/decisions/1.html"));
    }

    #[test]
    fn html_court_adapter_parses_and_fills_the_configured_court() {
        let adapter = HtmlCourtAdapter {
            id: "za-zagpphc-direct",
            region: "ZA",
            court_code: "ZAGPPHC",
            corpus_prefix: "https://judiciary.example.gov/decisions/",
        };
        let doc = FetchedDocument {
            url: "https://judiciary.example.gov/decisions/2026/1.html",
            body: HTML_FIXTURE,
            content_type: Some("text/html"),
        };
        let j = adapter.parse(&doc).expect("must parse");
        assert_eq!(j.court, "ZAGPPHC");
        assert!(!j.paragraphs.is_empty());
    }

    #[test]
    fn a_non_utf8_body_is_rejected_not_panicked() {
        let adapter = LawsAfricaAdapter::za();
        let doc = FetchedDocument {
            url: "https://africanlii.org/akn/za/judgment/zacc/2026/26/eng@/main.xml",
            body: &[0xff, 0xfe, 0x00],
            content_type: None,
        };
        assert!(matches!(adapter.parse(&doc), Err(AdapterError::NotUtf8)));
    }

    #[test]
    fn the_registry_resolves_by_region_and_url_and_is_pan_african_by_construction() {
        let mut registry = AdapterRegistry::new();
        registry.register(Box::new(LawsAfricaAdapter::za()));
        registry.register(Box::new(HtmlCourtAdapter {
            id: "za-zagpphc-direct",
            region: "ZA",
            court_code: "ZAGPPHC",
            corpus_prefix: "https://judiciary.example.gov/decisions/",
        }));
        // A jurisdiction nobody has written a RegionProfile for yet still
        // gets an adapter — the region-profile mechanism degrades to
        // GENERIC, it never refuses to register or resolve.
        registry.register(Box::new(HtmlCourtAdapter {
            id: "ke-judiciary-direct",
            region: "KE",
            court_code: "KESC",
            corpus_prefix: "https://kenyalaw.example/decisions/",
        }));

        assert_eq!(registry.for_region("ZA").len(), 2);
        assert_eq!(
            registry.for_region("za").len(),
            2,
            "region lookup is case-insensitive"
        );
        assert_eq!(registry.for_region("KE").len(), 1);
        assert_eq!(registry.for_region("NG").len(), 0);

        let found = registry
            .adapter_for_url(
                "ZA",
                "https://africanlii.org/akn/za/judgment/zacc/2026/26/eng@/main.xml",
            )
            .expect("laws-africa adapter should claim this URL");
        assert_eq!(found.source_id(), "laws-africa");

        let found = registry
            .adapter_for_url("KE", "https://kenyalaw.example/decisions/2026/1.html")
            .expect("kenyan adapter should claim its own prefix");
        assert_eq!(found.source_id(), "ke-judiciary-direct");

        assert!(registry
            .adapter_for_url("ZA", "https://africanlii.org/about")
            .is_none());
    }
}
