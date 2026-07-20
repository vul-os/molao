//! Release verification for `molao verify`.
//!
//! Verification answers exactly one question: **did at least `threshold`
//! distinct members of this signer set sign this manifest?** It says nothing
//! about whether the judgments are accurate, whether the signers are
//! trustworthy, or whether the law is correctly stated. A node verifies bytes
//! and signatures. Wording anywhere near this code must not suggest more.
//!
//! The signer set is supplied by the reader, not read out of the release. A
//! release that carried its own list of who may sign it would be a release that
//! authorised itself, and the k-of-n guarantee would mean nothing.

use anyhow::{Context, Result};
use molao_core::{SignedRelease, SignerSet};
use std::path::Path;

/// What verification found. Rendered by the CLI; the exit code follows `ok`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Verdict {
    /// Did the release meet the threshold?
    pub ok: bool,
    /// Release number from the manifest.
    pub release: u64,
    /// Valid distinct signatures counted.
    pub valid_signatures: usize,
    /// Signatures required.
    pub threshold: usize,
    /// Members of the signer set.
    pub signers: usize,
    /// Failure reason when `ok` is false.
    pub reason: Option<String>,
}

/// Load and verify a release against a signer set.
///
/// Both paths are JSON. Missing or malformed files are errors, not a `false`
/// verdict: "this file is not a release" and "this release is not signed" are
/// different problems, and collapsing them would let a typo in a path read as a
/// verification failure.
pub fn verify_files(release_path: &Path, signers_path: &Path) -> Result<Verdict> {
    let release_text = std::fs::read_to_string(release_path)
        .with_context(|| format!("reading release {}", release_path.display()))?;
    let release: SignedRelease = serde_json::from_str(&release_text)
        .with_context(|| format!("parsing release {}", release_path.display()))?;

    let signers_text = std::fs::read_to_string(signers_path)
        .with_context(|| format!("reading signer set {}", signers_path.display()))?;
    let signers: SignerSet = serde_json::from_str(&signers_text)
        .with_context(|| format!("parsing signer set {}", signers_path.display()))?;

    Ok(verify(&release, &signers))
}

/// Verify an already-loaded release.
pub fn verify(release: &SignedRelease, signers: &SignerSet) -> Verdict {
    match release.verify(signers) {
        Ok(count) => Verdict {
            ok: true,
            release: release.manifest.release,
            valid_signatures: count,
            threshold: signers.threshold,
            signers: signers.signers.len(),
            reason: None,
        },
        Err(e) => Verdict {
            ok: false,
            release: release.manifest.release,
            // A failed verification reports zero rather than a partial count:
            // the count is only meaningful once the set itself is valid, and
            // "2 of 3 signatures" next to a FAILED reads like a near miss when
            // the real problem may be a malformed signer set.
            valid_signatures: 0,
            threshold: signers.threshold,
            signers: signers.signers.len(),
            reason: Some(e.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use molao_core::release::ManifestSignature;
    use molao_core::{Manifest, Signer};

    fn manifest() -> Manifest {
        Manifest {
            release: 7,
            previous: None,
            created_at: "2026-07-20T10:00:00Z".into(),
            corpus_root: "aa".repeat(32),
            doc_count: 15,
            graph_root: "bb".repeat(32),
            extractor_version: molao_cite::EXTRACTOR_VERSION.to_string(),
        }
    }

    fn keypair(seed: u8) -> (ed25519_dalek::SigningKey, String) {
        let sk = ed25519_dalek::SigningKey::from_bytes(&[seed; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        (sk, pk)
    }

    fn signed(n: usize) -> (SignedRelease, SignerSet) {
        use ed25519_dalek::Signer as _;
        let pairs: Vec<_> = (1..=3u8).map(keypair).collect();
        let set = SignerSet {
            threshold: 2,
            epoch: 1,
            signers: pairs
                .iter()
                .map(|(_, pk)| Signer {
                    name: "institution".into(),
                    key: pk.clone(),
                })
                .collect(),
        };
        let m = manifest();
        let signatures = pairs[..n]
            .iter()
            .map(|(sk, pk)| ManifestSignature {
                key: pk.clone(),
                signature: hex::encode(sk.sign(&m.signing_bytes()).to_bytes()),
            })
            .collect();
        (
            SignedRelease {
                manifest: m,
                signatures,
            },
            set,
        )
    }

    #[test]
    fn a_quorum_verifies() {
        let (release, set) = signed(2);
        let v = verify(&release, &set);
        assert!(v.ok);
        assert_eq!(v.valid_signatures, 2);
        assert_eq!(v.release, 7);
        assert_eq!(v.reason, None);
    }

    #[test]
    fn one_signature_short_fails_with_a_reason() {
        let (release, set) = signed(1);
        let v = verify(&release, &set);
        assert!(!v.ok);
        assert!(v.reason.is_some());
    }

    #[test]
    fn a_tampered_manifest_fails() {
        let (mut release, set) = signed(3);
        release.manifest.corpus_root = "cc".repeat(32);
        assert!(!verify(&release, &set).ok);
    }

    #[test]
    fn a_single_signer_set_is_refused_however_valid_the_signature() {
        use ed25519_dalek::Signer as _;
        let (sk, pk) = keypair(9);
        let m = manifest();
        let release = SignedRelease {
            signatures: vec![ManifestSignature {
                key: pk.clone(),
                signature: hex::encode(sk.sign(&m.signing_bytes()).to_bytes()),
            }],
            manifest: m,
        };
        let set = SignerSet {
            threshold: 1,
            epoch: 1,
            signers: vec![Signer {
                name: "sole operator".into(),
                key: pk,
            }],
        };
        let v = verify(&release, &set);
        assert!(!v.ok, "a one-of-one release must never verify");
    }

    #[test]
    fn a_missing_file_is_an_error_not_a_failed_verdict() {
        let err = verify_files(
            Path::new("/nonexistent/release.json"),
            Path::new("/nonexistent/signers.json"),
        );
        assert!(err.is_err());
    }

    #[test]
    fn files_round_trip_through_verification() {
        let dir = std::env::temp_dir().join(format!("molao-verify-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (release, set) = signed(2);
        let rp = dir.join("release.json");
        let sp = dir.join("signers.json");
        std::fs::write(&rp, serde_json::to_string(&release).unwrap()).unwrap();
        std::fs::write(&sp, serde_json::to_string(&set).unwrap()).unwrap();

        assert!(verify_files(&rp, &sp).unwrap().ok);

        // A file that is JSON but not a release is a parse error.
        std::fs::write(&rp, "{}").unwrap();
        assert!(verify_files(&rp, &sp).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
