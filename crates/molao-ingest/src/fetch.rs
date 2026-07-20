//! A robots-respecting, rate-limited, politely-identified fetcher.
//!
//! Every judgment in Molao ultimately gets there because *some* process put
//! bytes on the wire and asked a server for them. `docs/SOURCES.md` sets the
//! ethics; this module is where they become code that cannot be bypassed by
//! accident:
//!
//! - **Identified.** Every request carries [`USER_AGENT`], naming this
//!   project and linking to it. Crawling anonymously is exactly the posture
//!   the sourcing model rejects.
//! - **robots.txt-honouring.** [`FetchClient::fetch`] fetches and parses the
//!   target host's `robots.txt` (see [`crate::robots`]) before ever asking
//!   for the actual URL, and refuses a disallowed path outright.
//! - **Rate-limited per host.** A minimum interval between requests to the
//!   same host, enforced against an injected [`crate::clock::Clock`] so it is
//!   testable without sleeping.
//! - **Hard-denied for SAFLII.** See [`HARD_DENIED_HOSTS`]. This is not an
//!   operator setting.
//!
//! ## Why the transport is a trait
//!
//! Nothing in this crate's test suite may touch a real socket — a test suite
//! that depends on the network is flaky by definition and unrunnable offline,
//! and this crate's whole job is to be trustworthy about what it fetched.
//! [`Transport`] is the seam: [`FixtureTransport`] answers from an in-memory
//! map and is what every test uses; [`UreqTransport`] is what a real
//! deployment wires in. `FetchClient` never knows which one it has.
//!
//! ## What this module does not do
//!
//! It does not decide *which* URLs are worth fetching — that is a
//! [`crate::adapter::SourceAdapter`]'s job. It does not parse a response into
//! a [`molao_core::Judgment`] — that is [`crate::akn`] or [`crate::html`]. It
//! only gets bytes, politely, and hands back exactly enough
//! ([`FetchRecord`]) for [`crate::witness::sign`] to attest to them. Keeping
//! "how do we get bytes" separate from "what do the bytes mean" is what lets
//! a witness daemon exist that never links against an XML parser at all.

use crate::clock::Clock;
use crate::robots::Robots;
use std::collections::HashMap;
use std::io::Read;
use std::sync::Mutex;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use url::Url;

/// Identifies every request this crate makes. Bulk crawling anonymously is
/// the behaviour `docs/SOURCES.md` exists to rule out — a site operator who
/// wants to block or rate-limit Molao specifically needs a name to write a
/// `robots.txt` rule against.
pub const USER_AGENT: &str = "molao-node/0.1 (+https://github.com/vul-os/molao)";

/// Hosts this crate refuses to bulk-fetch, unconditionally, with no
/// configuration path to override it.
///
/// SAFLII has said plainly that it declines to be a bulk re-supplier and
/// claims copyright in its own value-added layer (see `docs/SOURCES.md`).
/// That is not a rate limit to negotiate around; it is a line the project
/// does not cross. An operator who wants to look one case up on SAFLII does
/// that in a browser — SAFLII remains exactly what `docs/SOURCES.md` calls
/// it, a citation-resolution target, reached by a human clicking a link this
/// crate helps generate, never by this crate's own HTTP client.
pub const HARD_DENIED_HOSTS: &[&str] = &["saflii.org", "www.saflii.org"];

fn host_matches(host: &str, denied: &str) -> bool {
    let host = host.to_ascii_lowercase();
    let denied = denied.to_ascii_lowercase();
    host == denied || host.ends_with(&format!(".{denied}"))
}

fn is_hard_denied(host: &str) -> bool {
    HARD_DENIED_HOSTS.iter().any(|d| host_matches(host, d))
}

/// A raw HTTP response, decoupled from any particular client library.
#[derive(Debug, Clone)]
pub struct RawResponse {
    pub status: u16,
    pub body: Vec<u8>,
    pub content_type: Option<String>,
}

/// Errors from the transport layer itself — DNS, connection, timeout. Never
/// what a server said; that is a status code inside a successful
/// [`RawResponse`].
#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("network error fetching {0}: {1}")]
    Network(String, String),
}

/// The seam between this crate's fetch policy and an actual network socket.
/// See the module docs for why this exists.
pub trait Transport: std::fmt::Debug + Send + Sync {
    fn get(&self, url: &Url, user_agent: &str) -> Result<RawResponse, TransportError>;
}

/// A [`Transport`] backed by a real, blocking HTTP client.
///
/// `ureq` rather than an async client: nothing else in this crate needs an
/// async runtime, and a witness process fetching one judgment at a time gets
/// nothing from one either. `reqwest` would be the obvious alternative and
/// would work equally well if a deployment already carries `tokio` for other
/// reasons — swapping transports is exactly what [`Transport`] is for.
#[derive(Debug)]
pub struct UreqTransport {
    agent: ureq::Agent,
}

impl UreqTransport {
    pub fn new() -> Self {
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(20))
            .build();
        UreqTransport { agent }
    }
}

impl Default for UreqTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl Transport for UreqTransport {
    fn get(&self, url: &Url, user_agent: &str) -> Result<RawResponse, TransportError> {
        let result = self
            .agent
            .get(url.as_str())
            .set("User-Agent", user_agent)
            .call();
        // A non-2xx status is `Err(ureq::Error::Status(..))` by default, but
        // it is still a real, well-formed response (e.g. a 404 robots.txt,
        // which conventionally means "no restrictions") — extract it rather
        // than treating every non-2xx as a transport failure.
        let response = match result {
            Ok(r) => r,
            Err(ureq::Error::Status(_, r)) => r,
            Err(e) => return Err(TransportError::Network(url.to_string(), e.to_string())),
        };
        let status = response.status();
        let content_type = response.header("Content-Type").map(str::to_string);
        let mut body = Vec::new();
        response
            .into_reader()
            .read_to_end(&mut body)
            .map_err(|e| TransportError::Network(url.to_string(), e.to_string()))?;
        Ok(RawResponse {
            status,
            body,
            content_type,
        })
    }
}

/// A [`Transport`] that answers from an in-memory fixture map. Every test in
/// this crate uses this; nothing in the test suite reaches the network.
#[derive(Debug, Default)]
pub struct FixtureTransport {
    responses: Mutex<HashMap<String, RawResponse>>,
}

impl FixtureTransport {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a full response for a URL.
    pub fn with(self, url: &str, response: RawResponse) -> Self {
        self.responses
            .lock()
            .expect("fixture transport mutex poisoned")
            .insert(url.to_string(), response);
        self
    }

    /// Register a `200 OK` text/plain body for a URL — the common case.
    pub fn with_body(self, url: &str, body: impl Into<Vec<u8>>) -> Self {
        self.with(
            url,
            RawResponse {
                status: 200,
                body: body.into(),
                content_type: None,
            },
        )
    }

    /// Register a status-only response with no body — for simulating, e.g.,
    /// a missing `robots.txt` (404).
    pub fn with_status(self, url: &str, status: u16) -> Self {
        self.with(
            url,
            RawResponse {
                status,
                body: Vec::new(),
                content_type: None,
            },
        )
    }
}

impl Transport for FixtureTransport {
    fn get(&self, url: &Url, _user_agent: &str) -> Result<RawResponse, TransportError> {
        self.responses
            .lock()
            .expect("fixture transport mutex poisoned")
            .get(url.as_str())
            .cloned()
            .ok_or_else(|| {
                TransportError::Network(
                    url.to_string(),
                    "no fixture registered for this URL".into(),
                )
            })
    }
}

/// Everything a witness needs to attest to a fetch: what was asked for, when,
/// and the hash of exactly what came back. See [`crate::witness::sign`].
#[derive(Debug, Clone)]
pub struct FetchRecord {
    pub source_url: String,
    /// RFC 3339 timestamp of the fetch.
    pub fetched_at: String,
    /// Hex BLAKE3 of `body`, exactly as served — before any decoding,
    /// conversion, or parsing. See `docs/PROVENANCE.md` on why this is kept
    /// separate from a document's `DocId`.
    pub raw_hash: String,
    pub body: Vec<u8>,
    pub status: u16,
    pub content_type: Option<String>,
}

/// Why [`FetchClient::fetch`] refused or failed a request.
#[derive(Debug, thiserror::Error)]
pub enum FetchError {
    #[error("{0} is not a fetchable URL: {1}")]
    InvalidUrl(String, String),
    #[error("refusing to bulk-fetch {0}: hard-denied (see docs/SOURCES.md)")]
    HardDenied(String),
    #[error("refusing to fetch {0}: not on the configured allowlist")]
    NotAllowlisted(String),
    #[error("refusing to fetch {0}: operator denylist")]
    Denied(String),
    #[error("robots.txt at {host} disallows fetching {path}")]
    RobotsDisallowed { host: String, path: String },
    #[error("rate limited: {host} was fetched too recently; wait {retry_after_secs:.1}s")]
    RateLimited { host: String, retry_after_secs: f64 },
    #[error(transparent)]
    Transport(#[from] TransportError),
}

/// Default minimum time between two requests to the same host, when a site's
/// `robots.txt` does not ask for something longer via `Crawl-delay`. Chosen
/// as "polite for a small court website", not tuned for throughput — this
/// crate is not trying to crawl fast.
pub const DEFAULT_MIN_INTERVAL: time::Duration = time::Duration::seconds(2);

/// A robots-respecting, rate-limited, hard-denylisted HTTP fetcher.
#[derive(Debug)]
pub struct FetchClient<T: Transport> {
    transport: T,
    clock: Box<dyn Clock>,
    user_agent: String,
    min_interval: time::Duration,
    /// If set, only these hosts may be fetched at all — on top of, never
    /// instead of, the hard denylist.
    allowlist: Option<Vec<String>>,
    /// Operator-configured denylist, additional to [`HARD_DENIED_HOSTS`].
    /// Unlike the hard list, this one *is* something a caller controls.
    extra_denylist: Vec<String>,
    robots_cache: Mutex<HashMap<String, Robots>>,
    last_fetch: Mutex<HashMap<String, OffsetDateTime>>,
}

impl<T: Transport> FetchClient<T> {
    pub fn new(transport: T, clock: impl Clock + 'static) -> Self {
        FetchClient {
            transport,
            clock: Box::new(clock),
            user_agent: USER_AGENT.to_string(),
            min_interval: DEFAULT_MIN_INTERVAL,
            allowlist: None,
            extra_denylist: Vec::new(),
            robots_cache: Mutex::new(HashMap::new()),
            last_fetch: Mutex::new(HashMap::new()),
        }
    }

    pub fn with_min_interval(mut self, interval: time::Duration) -> Self {
        self.min_interval = interval;
        self
    }

    /// Restrict fetching to exactly these hosts. Applied on top of the hard
    /// denylist, which no allowlist can override.
    pub fn with_allowlist(mut self, hosts: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.allowlist = Some(hosts.into_iter().map(Into::into).collect());
        self
    }

    pub fn with_extra_denylist(
        mut self,
        hosts: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        self.extra_denylist = hosts.into_iter().map(Into::into).collect();
        self
    }

    /// Fetch `url`, honouring robots.txt, the rate limit, and both
    /// denylists. Returns everything a witness needs to sign the fetch.
    pub fn fetch(&self, url_str: &str) -> Result<FetchRecord, FetchError> {
        let url = Url::parse(url_str)
            .map_err(|e| FetchError::InvalidUrl(url_str.to_string(), e.to_string()))?;
        let host = url
            .host_str()
            .ok_or_else(|| FetchError::InvalidUrl(url_str.to_string(), "URL has no host".into()))?
            .to_string();

        if is_hard_denied(&host) {
            return Err(FetchError::HardDenied(host));
        }
        if let Some(allowlist) = &self.allowlist {
            if !allowlist.iter().any(|h| host_matches(&host, h)) {
                return Err(FetchError::NotAllowlisted(host));
            }
        }
        if self.extra_denylist.iter().any(|h| host_matches(&host, h)) {
            return Err(FetchError::Denied(host));
        }

        let robots = self.robots_for(&url)?;
        if !robots.is_allowed(&self.user_agent, url.path()) {
            return Err(FetchError::RobotsDisallowed {
                host,
                path: url.path().to_string(),
            });
        }

        let interval = robots
            .crawl_delay(&self.user_agent)
            .unwrap_or(self.min_interval)
            .max(self.min_interval);
        self.check_rate_limit(&host, interval)?;

        let now = self.clock.now();
        let response = self.transport.get(&url, &self.user_agent)?;
        self.record_fetch(&host, now);

        let raw_hash = hex::encode(blake3::hash(&response.body).as_bytes());
        let fetched_at = now
            .format(&Rfc3339)
            .unwrap_or_else(|_| now.unix_timestamp().to_string());

        Ok(FetchRecord {
            source_url: url.to_string(),
            fetched_at,
            raw_hash,
            body: response.body,
            status: response.status,
            content_type: response.content_type,
        })
    }

    fn check_rate_limit(&self, host: &str, interval: time::Duration) -> Result<(), FetchError> {
        let last_fetch = self.last_fetch.lock().expect("fetch client mutex poisoned");
        if let Some(&last) = last_fetch.get(host) {
            let elapsed = self.clock.now() - last;
            if elapsed < interval {
                return Err(FetchError::RateLimited {
                    host: host.to_string(),
                    retry_after_secs: (interval - elapsed).as_seconds_f64(),
                });
            }
        }
        Ok(())
    }

    fn record_fetch(&self, host: &str, at: OffsetDateTime) {
        self.last_fetch
            .lock()
            .expect("fetch client mutex poisoned")
            .insert(host.to_string(), at);
    }

    /// robots.txt for `url`'s host, fetched once and cached. Fetched via the
    /// transport directly rather than through [`Self::fetch`] — checking
    /// robots.txt for the robots.txt request itself would be a paradox, and
    /// real crawlers do not rate-limit or gate the one request that decides
    /// whether the rest are allowed.
    ///
    /// A `robots.txt` that itself fails to fetch (a real network error, not a
    /// 404) fails the whole request closed rather than silently proceeding —
    /// a crawler that cannot find out what it is allowed to do should not
    /// guess "everything".
    fn robots_for(&self, url: &Url) -> Result<Robots, FetchError> {
        let host = url.host_str().unwrap_or_default().to_string();
        {
            let cache = self
                .robots_cache
                .lock()
                .expect("fetch client mutex poisoned");
            if let Some(robots) = cache.get(&host) {
                return Ok(robots.clone());
            }
        }

        let mut robots_url = url.clone();
        robots_url.set_path("/robots.txt");
        robots_url.set_query(None);
        robots_url.set_fragment(None);

        let robots = match self.transport.get(&robots_url, &self.user_agent) {
            // A missing robots.txt (404, or any other non-2xx) conventionally
            // means "no restrictions" — that is the standard interpretation
            // and the one every major crawler applies.
            Ok(response) if (200..300).contains(&response.status) => {
                let text = String::from_utf8_lossy(&response.body);
                Robots::parse(&text)
            }
            Ok(_) => Robots::default(),
            Err(e) => return Err(e.into()),
        };

        self.robots_cache
            .lock()
            .expect("fetch client mutex poisoned")
            .insert(host, robots.clone());
        Ok(robots)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FakeClock;

    fn epoch() -> OffsetDateTime {
        OffsetDateTime::UNIX_EPOCH
    }

    fn client(transport: FixtureTransport) -> FetchClient<FixtureTransport> {
        FetchClient::new(transport, FakeClock::new(epoch())).with_min_interval(time::Duration::ZERO)
    }

    #[test]
    fn saflii_bulk_fetch_is_hard_denied_before_any_network_call() {
        // No fixture registered for this URL at all: if the denial did not
        // happen first, this would fail with a *different* error (missing
        // fixture), which is exactly what this test is checking against.
        let transport = FixtureTransport::new();
        let client = client(transport);
        let err = client
            .fetch("https://www.saflii.org/za/cases/ZACC/2026/26.html")
            .unwrap_err();
        assert!(matches!(err, FetchError::HardDenied(host) if host == "www.saflii.org"));
    }

    #[test]
    fn saflii_subdomains_are_also_denied() {
        let client = client(FixtureTransport::new());
        let err = client
            .fetch("https://zacc.saflii.org/anything")
            .unwrap_err();
        assert!(matches!(err, FetchError::HardDenied(_)));
    }

    #[test]
    fn a_normal_fetch_succeeds_and_hashes_the_body() {
        let transport = FixtureTransport::new()
            .with_status("https://court.example.gov/robots.txt", 404)
            .with_body("https://court.example.gov/j/1", "the judgment text");
        let record = client(transport)
            .fetch("https://court.example.gov/j/1")
            .unwrap();
        assert_eq!(record.status, 200);
        assert_eq!(
            record.raw_hash,
            hex::encode(blake3::hash(b"the judgment text").as_bytes())
        );
        assert_eq!(record.source_url, "https://court.example.gov/j/1");
        assert!(!record.fetched_at.is_empty());
    }

    #[test]
    fn robots_disallow_refuses_the_fetch() {
        let transport = FixtureTransport::new()
            .with_body(
                "https://court.example.gov/robots.txt",
                "User-agent: *\nDisallow: /private/\n",
            )
            .with_body("https://court.example.gov/private/x", "secret");
        let err = client(transport)
            .fetch("https://court.example.gov/private/x")
            .unwrap_err();
        assert!(matches!(err, FetchError::RobotsDisallowed { .. }));
    }

    #[test]
    fn robots_allow_lets_a_narrower_path_through() {
        let transport = FixtureTransport::new()
            .with_body(
                "https://court.example.gov/robots.txt",
                "User-agent: *\nDisallow: /private/\nAllow: /private/public-notice/\n",
            )
            .with_body(
                "https://court.example.gov/private/public-notice/1",
                "notice",
            );
        let record = client(transport)
            .fetch("https://court.example.gov/private/public-notice/1")
            .unwrap();
        assert_eq!(record.body, b"notice");
    }

    #[test]
    fn a_missing_robots_txt_means_no_restrictions() {
        let transport = FixtureTransport::new()
            .with_status("https://court.example.gov/robots.txt", 404)
            .with_body("https://court.example.gov/j/1", "text");
        assert!(client(transport)
            .fetch("https://court.example.gov/j/1")
            .is_ok());
    }

    #[test]
    fn rate_limiting_refuses_a_second_fetch_too_soon_and_allows_it_after_advancing() {
        let transport = FixtureTransport::new()
            .with_status("https://court.example.gov/robots.txt", 404)
            .with_body("https://court.example.gov/j/1", "one")
            .with_body("https://court.example.gov/j/2", "two");
        // An `Arc` handle survives being handed into the client (which boxes
        // whatever `Clock` it is given), so the test can still advance it.
        let clock = std::sync::Arc::new(FakeClock::new(epoch()));

        let fc = FetchClient::new(transport, clock.clone())
            .with_min_interval(time::Duration::seconds(10));

        assert!(fc.fetch("https://court.example.gov/j/1").is_ok());

        let err = fc.fetch("https://court.example.gov/j/2").unwrap_err();
        assert!(matches!(err, FetchError::RateLimited { .. }), "{err:?}");

        clock.advance(time::Duration::seconds(11));
        assert!(fc.fetch("https://court.example.gov/j/2").is_ok());
    }

    #[test]
    fn crawl_delay_extends_but_never_shortens_the_configured_minimum() {
        let transport = FixtureTransport::new()
            .with_body(
                "https://slow.example.gov/robots.txt",
                "User-agent: *\nCrawl-delay: 100\n",
            )
            .with_body("https://slow.example.gov/j/1", "one")
            .with_body("https://slow.example.gov/j/2", "two");
        let fc = FetchClient::new(transport, FakeClock::new(epoch()))
            .with_min_interval(time::Duration::seconds(1));

        assert!(fc.fetch("https://slow.example.gov/j/1").is_ok());
        let err = fc.fetch("https://slow.example.gov/j/2").unwrap_err();
        match err {
            FetchError::RateLimited {
                retry_after_secs, ..
            } => {
                assert!(
                    retry_after_secs > 90.0,
                    "crawl-delay of 100s should dominate: {retry_after_secs}"
                );
            }
            other => panic!("expected RateLimited, got {other:?}"),
        }
    }

    #[test]
    fn an_allowlist_refuses_hosts_not_on_it() {
        let transport = FixtureTransport::new()
            .with_status("https://ok.example.gov/robots.txt", 404)
            .with_body("https://ok.example.gov/j/1", "ok")
            .with_body("https://other.example.gov/j/1", "other");
        let fc = FetchClient::new(transport, FakeClock::new(epoch()))
            .with_min_interval(time::Duration::ZERO)
            .with_allowlist(["ok.example.gov"]);

        assert!(fc.fetch("https://ok.example.gov/j/1").is_ok());
        assert!(matches!(
            fc.fetch("https://other.example.gov/j/1"),
            Err(FetchError::NotAllowlisted(_))
        ));
    }

    #[test]
    fn an_operator_denylist_refuses_a_specific_host() {
        let transport = FixtureTransport::new();
        let fc = FetchClient::new(transport, FakeClock::new(epoch()))
            .with_min_interval(time::Duration::ZERO)
            .with_extra_denylist(["blocked.example.gov"]);

        assert!(matches!(
            fc.fetch("https://blocked.example.gov/j/1"),
            Err(FetchError::Denied(_))
        ));
    }

    #[test]
    fn an_invalid_url_is_an_error_not_a_panic() {
        let fc = client(FixtureTransport::new());
        assert!(matches!(
            fc.fetch("not a url"),
            Err(FetchError::InvalidUrl(_, _))
        ));
    }

    #[test]
    fn hard_denylist_cannot_be_bypassed_by_an_allowlist() {
        let transport = FixtureTransport::new();
        let fc = FetchClient::new(transport, FakeClock::new(epoch()))
            .with_min_interval(time::Duration::ZERO)
            .with_allowlist(["saflii.org", "www.saflii.org"]);
        assert!(matches!(
            fc.fetch("https://www.saflii.org/anything"),
            Err(FetchError::HardDenied(_))
        ));
    }
}
