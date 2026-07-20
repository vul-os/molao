//! The on-disk shape of a packaged release.
//!
//! ```text
//! <release-dir>/
//!   objects/<hash[0..2]>/<hash>   content-addressed blobs (git-style prefix
//!                                 sharding, so a release of a hundred
//!                                 thousand judgments does not put a hundred
//!                                 thousand entries in one directory)
//!   index.json                    the FileIndex: hash, path, size for every
//!                                 blob in the release
//!   manifest.json                 the unsigned Manifest this crate computed
//!                                 during packaging
//!   signed-release.json           Manifest + threshold signatures, written
//!                                 by whichever tool ran the signing
//!                                 ceremony — that ceremony is outside this
//!                                 crate's scope (see docs/RELEASES.md in the
//!                                 parent repo); this module just knows where
//!                                 to find the result
//! ```
//!
//! This layout is deliberately dumb enough that a plain HTTP file server with
//! directory listing off can serve it byte-for-byte identically to
//! [`crate::transport::fs::FsTransport`] reading it off a local disk — one of
//! the three transports the founder decision names ("[a] plain HTTP mirror
//! also works") falls out of this module for free, it does not need its own
//! code.
//!
//! Nothing here trusts what it reads. Every function is a dumb filesystem
//! operation; [`crate::verify`] re-hashes and re-checks signatures on
//! whatever comes back before molao-dist treats it as a real release.

use crate::package::FileIndex;
use molao_core::release::{Manifest, SignedRelease};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum LayoutError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

/// Where a blob with this content address lives under `dir`.
///
/// Two-character prefix sharding, same idea as a git object store: it keeps
/// any one directory from accumulating one entry per document in the corpus.
pub fn blob_path(dir: &Path, hash: &str) -> PathBuf {
    let split = hash.len().min(2);
    let (prefix, rest) = hash.split_at(split);
    dir.join("objects").join(prefix).join(rest)
}

pub fn write_blob(dir: &Path, hash: &str, bytes: &[u8]) -> Result<(), LayoutError> {
    let path = blob_path(dir, hash);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, bytes)?;
    Ok(())
}

pub fn read_blob(dir: &Path, hash: &str) -> Result<Vec<u8>, LayoutError> {
    Ok(fs::read(blob_path(dir, hash))?)
}

pub fn write_index(dir: &Path, index: &FileIndex) -> Result<(), LayoutError> {
    fs::create_dir_all(dir)?;
    fs::write(dir.join("index.json"), serde_json::to_vec_pretty(index)?)?;
    Ok(())
}

pub fn read_index(dir: &Path) -> Result<FileIndex, LayoutError> {
    let bytes = fs::read(dir.join("index.json"))?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub fn write_manifest(dir: &Path, manifest: &Manifest) -> Result<(), LayoutError> {
    fs::create_dir_all(dir)?;
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_vec_pretty(manifest)?,
    )?;
    Ok(())
}

pub fn read_manifest(dir: &Path) -> Result<Manifest, LayoutError> {
    let bytes = fs::read(dir.join("manifest.json"))?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub fn write_signed_release(dir: &Path, signed: &SignedRelease) -> Result<(), LayoutError> {
    fs::create_dir_all(dir)?;
    fs::write(
        dir.join("signed-release.json"),
        serde_json::to_vec_pretty(signed)?,
    )?;
    Ok(())
}

pub fn read_signed_release(dir: &Path) -> Result<SignedRelease, LayoutError> {
    let bytes = fs::read(dir.join("signed-release.json"))?;
    Ok(serde_json::from_slice(&bytes)?)
}
