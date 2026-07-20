//! iroh transport — feature-gated scaffold.
//!
//! The founder decision names iroh as the *primary* transport for Molao:
//! content-addressed blobs, NAT traversal, and delta-friendly fetches
//! without running a torrent swarm or a bespoke server. This module is a
//! thin adapter over `iroh` + `iroh-blobs`, not a reimplementation of
//! either — everything here is a few lines of glue around
//! `iroh_blobs::store::mem::MemStore` and `iroh_blobs::BlobsProtocol`.
//!
//! It is **not** part of the default build. Enable it with `--features
//! iroh`. Two reasons, both load-bearing:
//!
//! 1. **Network at test time.** Establishing a real iroh connection — even a
//!    direct, relay-free, same-machine one — binds UDP sockets and runs a
//!    QUIC handshake. That is a legitimate thing to want in a test, but it
//!    is not something the rest of this crate's test suite should be able
//!    to flake on, and CI environments vary in how much of that they allow.
//!    Keeping it behind a feature means `cargo test` (default) never touches
//!    a socket.
//! 2. **`iroh-blobs` 0.103.0 itself says: "this version of iroh-blobs is not
//!    yet considered production quality."** Depending on it unconditionally
//!    would make every consumer of molao-dist pull in that caveat. Behind an
//!    opt-in feature, it stays exactly that: opt-in.
//!
//! ## What this module does not do
//!
//! It does not implement [`crate::transport::Transport`]. That trait is
//! deliberately synchronous, matching [`crate::transport::fs::FsTransport`]'s
//! plain `std::fs` model — the right shape for a filesystem or an HTTP
//! mirror. iroh's API is inherently async (QUIC connections, streamed
//! transfers), and bridging that to a blocking trait would mean either
//! spinning up a hidden Tokio runtime inside every call (surprising, and
//! wrong for a caller that already has its own runtime) or making
//! `Transport` async for every implementor to accommodate one of three. This
//! module instead exposes its own small async functions — [`BlobServer`] to
//! serve, [`fetch_blob`] to fetch — and leaves wiring a real async
//! `Transport`-equivalent to whatever node binary eventually embeds this
//! crate and already owns a runtime.
//!
//! ## What is honestly exercised here, offline
//!
//! [`tests::a_served_blob_can_be_fetched_back_by_hash`] runs two `iroh`
//! endpoints **in one process**, with relaying and address-lookup disabled,
//! connecting directly over a loopback/LAN socket the OS assigns — no
//! Internet access, no relay server, no DNS. It genuinely serves a blob and
//! fetches it back over a real QUIC connection and BLAKE3-verified stream,
//! and checks the bytes match. What it does *not* exercise: NAT traversal
//! (both endpoints are on the same host), relay fallback (disabled), or
//! wide-area address lookup (disabled) — the harder parts of "reachability"
//! that are the actual reason iroh was chosen over a bespoke transport. This
//! module is honest scaffolding for those, not a claim that they have been
//! proven here.
//!
//! ## BLAKE3 alignment
//!
//! `iroh_blobs::Hash` **is** a BLAKE3 hash (`pub struct Hash(blake3::Hash)`
//! in iroh-blobs' own source) — the same primitive
//! [`crate::package`] addresses files with. Converting between this crate's
//! hex-encoded content addresses and iroh's `Hash` is exact and lossless
//! ([`to_iroh_hash`] / [`from_iroh_hash`]); there is no hash-family mismatch
//! to paper over, only an encoding one.

use iroh::endpoint::presets;
use iroh::protocol::Router;
use iroh::{Endpoint, EndpointAddr, RelayMode};
use iroh_blobs::store::mem::MemStore;
use iroh_blobs::{BlobsProtocol, Hash};

#[derive(Debug, thiserror::Error)]
pub enum IrohError {
    #[error("iroh endpoint error: {0}")]
    Endpoint(String),
    #[error("iroh blob store error: {0}")]
    Store(String),
    #[error("iroh fetch error: {0}")]
    Fetch(String),
    #[error("{0} is not a valid BLAKE3 hash")]
    BadHash(String),
}

/// Convert one of this crate's hex content addresses into an iroh `Hash`.
/// Exact and lossless: both are 32-byte BLAKE3 digests.
pub fn to_iroh_hash(hex_hash: &str) -> Result<Hash, IrohError> {
    hex_hash
        .parse::<Hash>()
        .map_err(|_| IrohError::BadHash(hex_hash.to_string()))
}

/// The inverse of [`to_iroh_hash`].
pub fn from_iroh_hash(hash: Hash) -> String {
    hash.to_hex().to_string()
}

/// An endpoint that binds an in-memory blob store to an iroh endpoint and
/// serves whatever is added to it. Relay and address-lookup are always
/// disabled here — see the module docs for why a real deployment would want
/// neither disabled, and why this scaffold does anyway.
pub struct BlobServer {
    store: MemStore,
    router: Router,
}

impl BlobServer {
    /// Bind a new server: an endpoint with no relay and no address lookup,
    /// an in-memory blob store, and a router that answers iroh-blobs
    /// requests on it.
    pub async fn bind() -> Result<Self, IrohError> {
        let endpoint = Endpoint::builder(presets::Minimal)
            .relay_mode(RelayMode::Disabled)
            .bind()
            .await
            .map_err(|e| IrohError::Endpoint(e.to_string()))?;

        let store = MemStore::new();
        let blobs = BlobsProtocol::new(&store, None);
        let router = Router::builder(endpoint)
            .accept(iroh_blobs::ALPN, blobs)
            .spawn();

        Ok(BlobServer { store, router })
    }

    /// Where a client can reach this server — pass to [`fetch_blob`].
    pub fn addr(&self) -> EndpointAddr {
        self.router.endpoint().addr()
    }

    /// Add a blob to the store, returning its content address as this
    /// crate's hex encoding (not iroh's `Hash` type) so callers can compare
    /// it directly against a [`crate::package::FileEntry::hash`].
    pub async fn add(&self, bytes: Vec<u8>) -> Result<String, IrohError> {
        let tag = self
            .store
            .blobs()
            .add_bytes(bytes)
            .await
            .map_err(|e| IrohError::Store(e.to_string()))?;
        Ok(from_iroh_hash(tag.hash))
    }

    /// Shut the router and its endpoint down cleanly.
    pub async fn shutdown(self) -> Result<(), IrohError> {
        self.router
            .shutdown()
            .await
            .map_err(|e| IrohError::Endpoint(e.to_string()))
    }
}

/// Fetch one blob by content address from a running [`BlobServer`], over a
/// fresh connection this function opens and closes itself.
///
/// `hex_hash` is this crate's hex encoding, converted to iroh's `Hash` via
/// [`to_iroh_hash`] — see the module docs on why that conversion is exact.
pub async fn fetch_blob(server_addr: EndpointAddr, hex_hash: &str) -> Result<Vec<u8>, IrohError> {
    let hash = to_iroh_hash(hex_hash)?;

    let endpoint = Endpoint::builder(presets::Minimal)
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .map_err(|e| IrohError::Endpoint(e.to_string()))?;

    let connection = endpoint
        .connect(server_addr, iroh_blobs::ALPN)
        .await
        .map_err(|e| IrohError::Fetch(e.to_string()))?;

    let progress = iroh_blobs::get::request::get_blob(connection, hash);
    let (bytes, _stats) = progress
        .bytes_and_stats()
        .await
        .map_err(|e| IrohError::Fetch(e.to_string()))?;

    endpoint.close().await;
    Ok(bytes.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The one thing this scaffold actually proves offline: serve a blob,
    /// fetch it back by content hash over a real (loopback-only) iroh
    /// connection, and confirm the bytes — and the hash — match. See the
    /// module docs for exactly what this does and does not demonstrate
    /// about iroh's wider-area reachability story.
    #[tokio::test]
    async fn a_served_blob_can_be_fetched_back_by_hash() {
        let server = BlobServer::bind().await.expect("bind server");
        let bytes = b"a judgment, served over iroh".to_vec();
        let hash = server.add(bytes.clone()).await.expect("add blob");

        let expected_hash = hex::encode(blake3::hash(&bytes).as_bytes());
        assert_eq!(hash, expected_hash, "iroh's BLAKE3 hash must match ours");

        let addr = server.addr();
        let fetched = fetch_blob(addr, &hash).await.expect("fetch blob");
        assert_eq!(fetched, bytes);

        server.shutdown().await.expect("shutdown");
    }
}
