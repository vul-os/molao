//! molao-dist: the distribution layer for Molao.
//!
//! The founder decision this crate implements: **a release is a
//! content-addressed set of files plus a signed manifest, transport-agnostic
//! by construction.** `molao_core::release::{Manifest, SignedRelease,
//! SignerSet}` (see `crates/molao-core/src/release.rs` and
//! `docs/RELEASES.md` in the parent repo) is the only thing anyone needs to
//! trust. Everything in this crate exists to move the files that manifest
//! describes across a transport without ever asking a receiver to trust the
//! transport itself:
//!
//! - [`package`] — turns a corpus (judgment files plus the derived citation
//!   graph) into content-addressed blobs, a [`package::FileIndex`], and a
//!   `Manifest`. This is the packaging that makes any transport safe: once a
//!   file is named by the hash of its own bytes, a receiver can check that
//!   name against the bytes it actually got, regardless of who or what
//!   handed them over.
//! - [`torrent`] — exports a BitTorrent v2 `.torrent` deterministically from
//!   a packaged release. Content addressing gives this away almost for
//!   free: BEP 52 already identifies files by a merkle root over content, so
//!   exporting one is mostly re-expressing hashes this crate already
//!   computed. Export only — this crate is not, and does not become, a
//!   torrent client.
//! - [`delta`] — the difference between two releases' file sets, by hash, so
//!   a node holding release N only fetches what changed to reach N+1.
//! - [`transport`] — a minimal trait implemented by [`transport::fs::FsTransport`]
//!   (always available, no network — a local directory or a plain HTTP
//!   mirror served the same way) and, behind the `iroh` feature, a scaffold
//!   iroh adapter. See `transport::iroh`'s module docs for exactly what is
//!   and is not exercised there.
//! - [`verify`] — the receiver side: threshold signature verification (via
//!   molao-core) layered on top of the same per-file hash and root checks
//!   `package` uses internally. This is the only path that should ever let a
//!   node adopt a fetched release as its new head.
//!
//! ## Scope
//!
//! This crate depends on `molao-core`'s release types (read-only) and on
//! files. It does **not** depend on `molao-corpus` or `molao-graph` — see
//! [`package`]'s module docs for what that means concretely for
//! `corpus_root` and `graph_root` verification, and where the honest
//! boundary is.
//!
//! ## Standalone workspace
//!
//! This crate's `Cargo.toml` declares its own `[workspace]` so it builds,
//! tests, and lints independently of the parent `molao` workspace during
//! development. That stanza is removed and the crate added to the parent
//! workspace's members at integration time.

#![forbid(unsafe_code)]

pub mod bencode;
pub mod delta;
pub mod layout;
pub mod package;
pub mod torrent;
pub mod transport;
pub mod verify;

pub use delta::{delta, ReleaseDelta};
pub use package::{
    pack, CorpusInput, DocumentInput, FileEntry, FileIndex, GraphInput, IntegrityError,
    PackageError, PackagedRelease,
};
pub use transport::Transport;
pub use verify::{verify_received, VerifiedRelease, VerifyError};
