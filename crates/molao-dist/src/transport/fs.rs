//! The default transport: a release directory on a local filesystem.
//!
//! This is deliberately the plainest possible implementation of
//! [`Transport`] — `std::fs` reads against the layout `crate::layout`
//! writes, nothing else. It is always available (no feature flag, no
//! network, no async runtime) and it is what the test suite exercises for
//! every "fetch a release and verify it" scenario, because a release
//! directory served by a dumb static file server is byte-for-byte the same
//! thing from a client's point of view — one implementation covers both "a
//! local mirror" and "a plain HTTP mirror" from the founder's distribution
//! model.

use crate::layout::{self, LayoutError};
use crate::package::FileIndex;
use crate::transport::Transport;
use molao_core::release::SignedRelease;
use std::path::{Path, PathBuf};

/// A release directory, read as a [`Transport`].
#[derive(Debug, Clone)]
pub struct FsTransport {
    root: PathBuf,
}

impl FsTransport {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        FsTransport { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

impl Transport for FsTransport {
    type Error = LayoutError;

    fn fetch_signed_release(&self) -> Result<SignedRelease, Self::Error> {
        layout::read_signed_release(&self.root)
    }

    fn fetch_index(&self) -> Result<FileIndex, Self::Error> {
        layout::read_index(&self.root)
    }

    fn fetch_blob(&self, hash: &str) -> Result<Vec<u8>, Self::Error> {
        layout::read_blob(&self.root, hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::package::{pack, CorpusInput, DocumentInput, GraphInput};
    use crate::verify::verify_received;
    use ed25519_dalek::{Signer as _, SigningKey};
    use molao_core::doc::DocId;
    use molao_core::release::{ManifestSignature, Signer, SignerSet};

    fn keypair(seed: u8) -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[seed; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        (sk, pk)
    }

    fn doc(text: &str) -> DocumentInput {
        DocumentInput {
            id: DocId::of_canonical(text),
            bytes: text.as_bytes().to_vec(),
        }
    }

    #[test]
    fn a_release_written_to_disk_can_be_fetched_and_verified_via_fs_transport() {
        let pairs: Vec<_> = (1..=3).map(keypair).collect();
        let set = SignerSet {
            threshold: 2,
            epoch: 1,
            signers: pairs
                .iter()
                .enumerate()
                .map(|(i, (_, pk))| Signer {
                    name: format!("signer-{i}"),
                    key: pk.clone(),
                })
                .collect(),
        };

        let corpus = CorpusInput {
            documents: vec![doc("first judgment\n"), doc("second judgment\n")],
            graph: GraphInput {
                bytes: b"edges".to_vec(),
                graph_root: "gg".repeat(32),
            },
            release: 1,
            previous: None,
            created_at: "2026-07-20T10:00:00Z".into(),
            extractor_version: "molao-cite@0.1.0".into(),
        };
        let packaged = pack(&corpus).unwrap();
        packaged.verify_integrity().unwrap();

        let dir = tempfile::tempdir().unwrap();
        packaged.write_to(dir.path()).unwrap();

        let signatures: Vec<_> = pairs[..2]
            .iter()
            .map(|(sk, pk)| ManifestSignature {
                key: pk.clone(),
                signature: hex::encode(sk.sign(&packaged.manifest.signing_bytes()).to_bytes()),
            })
            .collect();
        let signed = molao_core::release::SignedRelease {
            manifest: packaged.manifest.clone(),
            signatures,
        };
        layout::write_signed_release(dir.path(), &signed).unwrap();

        let transport = FsTransport::new(dir.path());
        let fetched_signed = transport.fetch_signed_release().unwrap();
        let fetched_index = transport.fetch_index().unwrap();
        assert_eq!(fetched_signed, signed);
        assert_eq!(fetched_index, packaged.index);

        let verified = verify_received(&fetched_signed, &set, &fetched_index, |h| {
            transport.fetch_blob(h).ok()
        })
        .unwrap();
        assert_eq!(verified.manifest, packaged.manifest);
        assert_eq!(verified.signatures, 2);
    }

    #[test]
    fn fetching_a_blob_that_does_not_exist_errors_instead_of_panicking() {
        let dir = tempfile::tempdir().unwrap();
        let transport = FsTransport::new(dir.path());
        assert!(transport.fetch_blob("deadbeef").is_err());
    }

    #[test]
    fn fetching_from_an_empty_directory_errors_instead_of_panicking() {
        let dir = tempfile::tempdir().unwrap();
        let transport = FsTransport::new(dir.path());
        assert!(transport.fetch_signed_release().is_err());
        assert!(transport.fetch_index().is_err());
    }
}
