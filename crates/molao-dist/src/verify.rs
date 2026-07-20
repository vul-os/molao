//! Verification on receipt.
//!
//! A file that merely hashes to its declared address is not yet a release —
//! anyone can produce content-addressed garbage; content addressing only
//! guarantees that a hash names *some* bytes, not that those bytes were ever
//! attested to by anyone with authority. What makes a fetched file set a
//! *release* is a quorum of the signer set (`molao_core::release::SignerSet`)
//! having signed the manifest that names it. This module is where that
//! signature check, the per-file hash check, and the root-agreement check
//! ([`crate::package::verify_file_set`]) are required together, in that
//! order — a receiver that only does some of these has not verified
//! anything, it has merely made itself feel better about untrusted bytes.
//!
//! Order matters: signatures are checked first because they are cheap
//! relative to hashing an entire corpus, and a manifest with no valid quorum
//! is not worth spending I/O on regardless of what its file set contains.

use crate::package::{self, FileIndex, IntegrityError};
use molao_core::release::{Manifest, ReleaseError, SignedRelease, SignerSet};

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum VerifyError {
    #[error("signature verification failed: {0}")]
    Signatures(#[from] ReleaseError),
    #[error("content verification failed: {0}")]
    Content(#[from] IntegrityError),
}

/// A release that has cleared every check this crate knows how to run:
/// threshold signatures, per-file content addressing, and root agreement.
/// Holding one of these — and only one of these — is what should let a node
/// adopt a release as its new head. A bare `Manifest` or `FileIndex` proves
/// nothing on its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedRelease {
    pub manifest: Manifest,
    /// How many distinct valid signatures the release carried — always
    /// `>= signer_set.threshold`, since [`verify_received`] would have
    /// rejected it otherwise. Callers that want to display "signed by N of
    /// M" have it without re-verifying.
    pub signatures: usize,
}

/// Verify a fetched release: threshold signatures, then per-file hashes and
/// root agreement.
///
/// `fetch` is transport-agnostic on purpose — an in-memory map in tests, a
/// [`crate::transport::Transport`] in a real node — because verification
/// must give the same answer regardless of where the bytes came from. That
/// is the entire point of a content-addressed, signed release: the
/// transport is not part of the trust boundary.
pub fn verify_received(
    signed: &SignedRelease,
    signer_set: &SignerSet,
    index: &FileIndex,
    fetch: impl Fn(&str) -> Option<Vec<u8>>,
) -> Result<VerifiedRelease, VerifyError> {
    let signatures = signed.verify(signer_set)?;
    package::verify_file_set(&signed.manifest, index, fetch)?;
    Ok(VerifiedRelease {
        manifest: signed.manifest.clone(),
        signatures,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::package::{pack, CorpusInput, DocumentInput, FileEntry};
    use ed25519_dalek::{Signer as _, SigningKey};
    use molao_core::doc::DocId;
    use molao_core::release::{ManifestSignature, Signer};
    use std::collections::BTreeMap;

    fn keypair(seed: u8) -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[seed; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        (sk, pk)
    }

    fn three_of_five() -> (SignerSet, Vec<(SigningKey, String)>) {
        let pairs: Vec<_> = (1..=5).map(keypair).collect();
        let set = SignerSet {
            threshold: 3,
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
        (set, pairs)
    }

    fn doc(text: &str) -> DocumentInput {
        DocumentInput {
            id: DocId::of_canonical(text),
            bytes: text.as_bytes().to_vec(),
        }
    }

    fn packaged() -> (Manifest, FileIndex, BTreeMap<String, Vec<u8>>) {
        let corpus = CorpusInput {
            documents: vec![doc("first judgment\n"), doc("second judgment\n")],
            graph: package::GraphInput {
                bytes: b"edges".to_vec(),
                graph_root: "gg".repeat(32),
            },
            release: 1,
            previous: None,
            created_at: "2026-07-20T10:00:00Z".into(),
            extractor_version: "molao-cite@0.1.0".into(),
        };
        let p = pack(&corpus).unwrap();
        let mut blobs = BTreeMap::new();
        for entry in &p.index.files {
            blobs.insert(entry.hash.clone(), p.blob(&entry.hash).unwrap().to_vec());
        }
        (p.manifest, p.index, blobs)
    }

    fn sign_all(
        manifest: &Manifest,
        pairs: &[(SigningKey, String)],
        n: usize,
    ) -> Vec<ManifestSignature> {
        pairs[..n]
            .iter()
            .map(|(sk, pk)| ManifestSignature {
                key: pk.clone(),
                signature: hex::encode(sk.sign(&manifest.signing_bytes()).to_bytes()),
            })
            .collect()
    }

    #[test]
    fn a_correctly_signed_and_intact_release_is_accepted() {
        let (set, pairs) = three_of_five();
        let (manifest, index, blobs) = packaged();
        let signed = SignedRelease {
            signatures: sign_all(&manifest, &pairs, 3),
            manifest,
        };

        let verified = verify_received(&signed, &set, &index, |h| blobs.get(h).cloned()).unwrap();
        assert_eq!(verified.signatures, 3);
        assert_eq!(verified.manifest, signed.manifest);
    }

    #[test]
    fn a_release_with_too_few_signatures_is_rejected() {
        let (set, pairs) = three_of_five();
        let (manifest, index, blobs) = packaged();
        let signed = SignedRelease {
            signatures: sign_all(&manifest, &pairs, 2), // one short of threshold 3
            manifest,
        };

        let err = verify_received(&signed, &set, &index, |h| blobs.get(h).cloned()).unwrap_err();
        assert!(matches!(err, VerifyError::Signatures(_)));
    }

    #[test]
    fn a_release_with_a_tampered_file_is_rejected_even_with_a_full_quorum() {
        let (set, pairs) = three_of_five();
        let (manifest, index, blobs) = packaged();
        let signed = SignedRelease {
            signatures: sign_all(&manifest, &pairs, 3),
            manifest,
        };

        let tampered_hash = index.files[0].hash.clone();
        let err = verify_received(&signed, &set, &index, |h| {
            if h == tampered_hash {
                Some(b"an attacker's substituted judgment".to_vec())
            } else {
                blobs.get(h).cloned()
            }
        })
        .unwrap_err();
        assert!(matches!(
            err,
            VerifyError::Content(IntegrityError::HashMismatch { .. })
        ));
    }

    #[test]
    fn a_release_whose_manifest_was_altered_after_signing_is_rejected() {
        // Tampering with the manifest itself (not just a file) invalidates
        // every signature over it — SignedRelease::verify in molao-core
        // already guarantees this; this test proves molao-dist's receive
        // path surfaces that as a rejection rather than silently trusting
        // the manifest values it happens to read.
        let (set, pairs) = three_of_five();
        let (manifest, index, blobs) = packaged();
        let signatures = sign_all(&manifest, &pairs, 3);
        let mut tampered_manifest = manifest;
        tampered_manifest.corpus_root = "ff".repeat(32);
        let signed = SignedRelease {
            manifest: tampered_manifest,
            signatures,
        };

        let err = verify_received(&signed, &set, &index, |h| blobs.get(h).cloned()).unwrap_err();
        assert!(matches!(err, VerifyError::Signatures(_)));
    }

    #[test]
    fn a_missing_file_is_rejected_after_signatures_pass() {
        let (set, pairs) = three_of_five();
        let (manifest, index, blobs) = packaged();
        let signed = SignedRelease {
            signatures: sign_all(&manifest, &pairs, 3),
            manifest,
        };

        let missing_hash = index.files[0].hash.clone();
        let err = verify_received(&signed, &set, &index, |h| {
            if h == missing_hash {
                None
            } else {
                blobs.get(h).cloned()
            }
        })
        .unwrap_err();
        assert!(matches!(
            err,
            VerifyError::Content(IntegrityError::Missing { .. })
        ));
    }

    #[test]
    fn an_index_entry_is_just_a_claim_and_must_still_be_checked() {
        // A malicious or buggy transport can hand back an index that lies
        // about a file's size or path; verify_file_set must still catch a
        // mismatched hash rather than trusting the index's own bookkeeping.
        let (set, pairs) = three_of_five();
        let (manifest, index, blobs) = packaged();
        let mut lying_index = index.clone();
        lying_index.files[0].size += 1; // claims a size the real bytes don't have
        let signed = SignedRelease {
            signatures: sign_all(&manifest, &pairs, 3),
            manifest,
        };

        let err =
            verify_received(&signed, &set, &lying_index, |h| blobs.get(h).cloned()).unwrap_err();
        assert!(matches!(
            err,
            VerifyError::Content(IntegrityError::HashMismatch { .. })
        ));
    }

    #[test]
    fn file_entry_helper_type_is_exercised() {
        // Sanity check that FileEntry equality is what the delta and index
        // tests rely on.
        let a = FileEntry {
            hash: "h".into(),
            path: "documents/h".into(),
            size: 1,
        };
        let b = a.clone();
        assert_eq!(a, b);
    }
}
