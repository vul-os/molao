//! # molao-ingest
//!
//! The sourcing layer for Molao: how case law actually gets into the corpus.
//!
//! `docs/SOURCES.md` sets the ethics — take from courts and gazettes
//! directly wherever possible, licence bulk data where a licensed supplier
//! exists, treat an LII that declines bulk supply as a citation-resolution
//! target and never a scrape target, never launder provenance. This crate is
//! where those rules become code that cannot be bypassed by an ingest script
//! that "just this once" skips a check:
//!
//! - [`fetch`] — a robots-respecting, rate-limited, identified HTTP fetcher.
//!   SAFLII bulk fetching is hard-denied at the type level (see
//!   [`fetch::HARD_DENIED_HOSTS`]), not left to operator discipline.
//! - [`akn`] — Akoma Ntoso ingest, the primary path: Laws.Africa/AfricanLII's
//!   licensed bulk corpus, parsed into structured [`molao_core::Judgment`]s.
//! - [`html`] — a fallback for courts and gazettes that only self-publish as
//!   HTML or PDF, leaning on [`molao_cite`] to recover what structured
//!   metadata a page does not state.
//! - [`witness`] — signing a fetch, and k-of-n corroboration: the collective
//!   part of "collective corpus". No single node's upload is evidence; see
//!   `docs/PROVENANCE.md`.
//! - [`adapter`] — the pluggable, data-driven join between "a source" and
//!   "how to parse it", keyed by region code so the crate is pan-African by
//!   construction rather than South-Africa-shaped code with data bolted on.
//!
//! ## What this crate is not
//!
//! It is not a corpus store — [`molao_core::Judgment`] and
//! [`molao_core::Provenance`] values come out of it; what a node does with
//! them (dedupe, index, extract citations at insert time) is
//! `molao-corpus`'s job, downstream. It is not a running crawler — nothing
//! here schedules a crawl, runs a daemon, or holds a signing key beyond a
//! test fixture. Wiring [`fetch::FetchClient`], [`witness::sign`], and an
//! [`adapter::AdapterRegistry`] into an actual long-running witness process
//! is a real deployment's job, same as every other "designed, not built yet"
//! item `docs/PROVENANCE.md` and `docs/RUNNING-A-NODE.md` are honest about.
//!
//! ## Nothing here touches the network in a test
//!
//! [`fetch::Transport`] is a trait for exactly this reason: every test in
//! this crate runs against [`fetch::FixtureTransport`], an in-memory
//! fixture map. `cargo test` on this crate proves the *logic* — robots
//! parsing, rate-limit arithmetic, Akoma Ntoso structure, HTML fallback
//! heuristics, corroboration counting, signature verification — is correct.
//! It proves nothing about whether a real court's `robots.txt` parses the
//! way its operator intended, whether a real site's HTML matches the shape
//! [`html`] assumes, or whether a real Laws.Africa document exercises a
//! corner this crate's two small fixtures do not. That confidence only comes
//! from real deployment against real sources, same as the network side of
//! every distributed system — this crate is the logic; live crawling is a
//! separate, later concern.

#![forbid(unsafe_code)]
#![warn(missing_debug_implementations)]

pub mod adapter;
pub mod akn;
pub mod clock;
pub mod fetch;
pub mod html;
pub mod robots;
pub mod witness;

pub use adapter::{
    AdapterError, AdapterRegistry, FetchedDocument, HtmlCourtAdapter, LawsAfricaAdapter,
    SourceAdapter,
};
pub use akn::AknError;
pub use clock::{Clock, FakeClock, SystemClock};
pub use fetch::{
    FetchClient, FetchError, FetchRecord, FixtureTransport, RawResponse, Transport, TransportError,
    UreqTransport, HARD_DENIED_HOSTS, USER_AGENT,
};
pub use html::{Hints, HtmlError};
pub use robots::Robots;
pub use witness::{corroborate, sign, verify, Corroboration, WitnessError};

/// Version of this crate. Not yet surfaced anywhere a manifest reads — unlike
/// [`molao_cite::EXTRACTOR_VERSION`], nothing this crate produces is a pinned,
/// re-runnable transform over a fixed input, so there is no verification
/// contract that needs a version pinned to it (yet: a future
/// `molao-ingest`-driven build pipeline might change that).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
