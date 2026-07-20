//! Transports move bytes. They do not establish trust.
//!
//! Every transport implements the same three-method [`Transport`] trait:
//! fetch a signed release, its file index, and blobs by content hash. That
//! is deliberately the whole interface. Any type that can do those three
//! things is interchangeable with any other — swapping a filesystem mirror
//! for iroh, or for whatever a future HTTP client wraps, changes nothing
//! about how a release is verified, because [`crate::verify::verify_received`]
//! never trusts the transport. It re-hashes every byte and re-checks
//! signatures on whatever comes back, regardless of which `Transport`
//! fetched it. That is the concrete meaning of "transports are
//! interchangeable and untrusted" from the founder's distribution model: the
//! trait boundary *is* the untrusted boundary.
//!
//! Note that `torrent::export` in [`crate::torrent`] is **not** a
//! `Transport` in this trait's sense — it produces a static file for a real
//! BitTorrent client to serve, not something this crate fetches through
//! itself. [`fs::FsTransport`] is the transport every other one is judged
//! against: always available, no network, no feature flag.

use crate::package::FileIndex;
use molao_core::release::SignedRelease;

pub mod fs;

#[cfg(feature = "iroh")]
pub mod iroh;

/// Fetches release artifacts by content address.
///
/// Implementors are untrusted by construction (see the module docs): every
/// value a `Transport` returns is a candidate to be checked, never a fact to
/// be believed.
pub trait Transport {
    type Error: std::error::Error + Send + Sync + 'static;

    fn fetch_signed_release(&self) -> Result<SignedRelease, Self::Error>;
    fn fetch_index(&self) -> Result<FileIndex, Self::Error>;
    fn fetch_blob(&self, hash: &str) -> Result<Vec<u8>, Self::Error>;
}
