//! Threshold-signed corpus releases.
//!
//! A release is the unit everyone agrees on: "as of release 42, these are the
//! judgments and this is the citation graph derived from them." It is published
//! as a manifest plus signatures.
//!
//! **No single party can publish a release, including the project that wrote
//! this code.** A manifest is valid only when at least `threshold` distinct
//! signers from the signer set have signed it. That is the concrete meaning of
//! "decentralized" here — not that there is no authority, but that the
//! authority is a quorum of independent institutions rather than one operator
//! who can be pressured, bought, or breached.
//!
//! Releases chain: each names its predecessor's hash. A node that has followed
//! the chain can detect a fork, and a node that has not can compare its head
//! against any peer's. Combined with an append-only public log, silently
//! rewriting history requires colluding with a quorum *and* going undetected by
//! every monitor — rather than compromising one server.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// A party entitled to sign releases.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Signer {
    /// Human-readable identity, e.g. `"UCT Law Faculty"`. Display only —
    /// authority comes from the key.
    pub name: String,
    /// Ed25519 public key, hex-encoded (64 chars).
    pub key: String,
}

/// The set of signers and how many must agree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignerSet {
    /// Minimum distinct valid signatures for a release to be accepted.
    pub threshold: usize,
    pub signers: Vec<Signer>,
    /// Bumped whenever membership changes, so nodes can tell an older set from
    /// a newer one rather than guessing.
    pub epoch: u64,
}

impl SignerSet {
    /// Reject sets that cannot deliver the guarantee they claim.
    ///
    /// A threshold of 1 is a single point of authority wearing a quorum's
    /// clothes; a threshold above the member count can never be met and would
    /// wedge the network. Both are configuration mistakes that must fail loudly
    /// at load time rather than at publication time.
    pub fn validate(&self) -> Result<(), ReleaseError> {
        if self.threshold < 2 {
            return Err(ReleaseError::ThresholdTooLow(self.threshold));
        }
        if self.threshold > self.signers.len() {
            return Err(ReleaseError::ThresholdUnreachable {
                threshold: self.threshold,
                signers: self.signers.len(),
            });
        }
        let mut keys: Vec<&str> = self.signers.iter().map(|s| s.key.as_str()).collect();
        keys.sort_unstable();
        if keys.windows(2).any(|w| w[0] == w[1]) {
            // Otherwise one party holding a duplicated key counts twice toward
            // its own quorum.
            return Err(ReleaseError::DuplicateSigner);
        }
        Ok(())
    }

    fn verifying_key(&self, key_hex: &str) -> Option<VerifyingKey> {
        self.signers.iter().find(|s| s.key == key_hex)?;
        parse_key(key_hex).ok()
    }
}

/// What a release asserts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    /// Monotonic release number.
    pub release: u64,
    /// Hash of the previous manifest, hex. `None` only for release 0.
    pub previous: Option<String>,
    /// RFC 3339 timestamp.
    pub created_at: String,
    /// Root hash over the sorted document ids in this release.
    pub corpus_root: String,
    pub doc_count: u64,
    /// Hash of the citation graph derived from this corpus.
    pub graph_root: String,
    /// Exact version of the citation extractor used, e.g. `molao-cite@0.1.0`.
    ///
    /// Anyone can re-run this version over the same corpus and must get a
    /// byte-identical graph. This is what makes the graph verifiable by
    /// recomputation rather than by trust — the property embeddings can never
    /// have, which is why no embedding artifact is part of a release.
    pub extractor_version: String,
}

impl Manifest {
    /// Canonical bytes for signing.
    ///
    /// Hand-rolled rather than `serde_json`, deliberately: JSON field ordering
    /// and number formatting are not guaranteed stable across versions, and a
    /// signature over a representation that can shift is a signature over
    /// nothing. Length-prefixed fields, fixed order, no escaping ambiguity.
    pub fn signing_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"molao-release-v1\n");
        push_field(&mut out, self.release.to_string().as_bytes());
        push_field(&mut out, self.previous.as_deref().unwrap_or("").as_bytes());
        push_field(&mut out, self.created_at.as_bytes());
        push_field(&mut out, self.corpus_root.as_bytes());
        push_field(&mut out, self.doc_count.to_string().as_bytes());
        push_field(&mut out, self.graph_root.as_bytes());
        push_field(&mut out, self.extractor_version.as_bytes());
        out
    }

    /// Hash of this manifest — what the next release names as `previous`.
    pub fn hash(&self) -> String {
        hex::encode(blake3::hash(&self.signing_bytes()).as_bytes())
    }
}

fn push_field(out: &mut Vec<u8>, field: &[u8]) {
    out.extend_from_slice(&(field.len() as u64).to_be_bytes());
    out.extend_from_slice(field);
}

/// One signature over a manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestSignature {
    /// Signer's public key, hex.
    pub key: String,
    /// Ed25519 signature, hex.
    pub signature: String,
}

/// A manifest with its signatures — the published artifact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignedRelease {
    pub manifest: Manifest,
    pub signatures: Vec<ManifestSignature>,
}

impl SignedRelease {
    /// Verify against a signer set. Returns the number of valid distinct
    /// signatures on success.
    ///
    /// Fails closed at every step: unknown signers, malformed keys, and
    /// malformed signatures are ignored rather than counted, and duplicates
    /// from one key count once.
    pub fn verify(&self, set: &SignerSet) -> Result<usize, ReleaseError> {
        set.validate()?;
        let bytes = self.manifest.signing_bytes();

        let mut valid_keys: Vec<&str> = Vec::new();
        for sig in &self.signatures {
            if valid_keys.contains(&sig.key.as_str()) {
                continue; // one signer, one vote
            }
            let Some(vk) = set.verifying_key(&sig.key) else {
                continue; // not in the set
            };
            let Ok(parsed) = parse_signature(&sig.signature) else {
                continue;
            };
            if vk.verify(&bytes, &parsed).is_ok() {
                valid_keys.push(&sig.key);
            }
        }

        if valid_keys.len() < set.threshold {
            return Err(ReleaseError::ThresholdNotMet {
                got: valid_keys.len(),
                need: set.threshold,
            });
        }
        Ok(valid_keys.len())
    }

    /// Does this release correctly chain onto `previous`?
    pub fn chains_onto(&self, previous: &Manifest) -> bool {
        self.manifest.release == previous.release + 1
            && self.manifest.previous.as_deref() == Some(previous.hash().as_str())
    }
}

fn parse_key(hex_key: &str) -> Result<VerifyingKey, ReleaseError> {
    let bytes = hex::decode(hex_key).map_err(|_| ReleaseError::MalformedKey)?;
    let arr: [u8; 32] = bytes.try_into().map_err(|_| ReleaseError::MalformedKey)?;
    VerifyingKey::from_bytes(&arr).map_err(|_| ReleaseError::MalformedKey)
}

fn parse_signature(hex_sig: &str) -> Result<Signature, ReleaseError> {
    let bytes = hex::decode(hex_sig).map_err(|_| ReleaseError::MalformedSignature)?;
    let arr: [u8; 64] = bytes
        .try_into()
        .map_err(|_| ReleaseError::MalformedSignature)?;
    Ok(Signature::from_bytes(&arr))
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ReleaseError {
    #[error(
        "signer threshold {0} is too low: a release must need at least two independent signers"
    )]
    ThresholdTooLow(usize),
    #[error("threshold {threshold} can never be met by {signers} signer(s)")]
    ThresholdUnreachable { threshold: usize, signers: usize },
    #[error("the signer set contains a duplicate key")]
    DuplicateSigner,
    #[error("release has {got} valid signature(s), needs {need}")]
    ThresholdNotMet { got: usize, need: usize },
    #[error("malformed public key")]
    MalformedKey,
    #[error("malformed signature")]
    MalformedSignature,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer as _, SigningKey};

    fn keypair(seed: u8) -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[seed; 32]);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        (sk, pk)
    }

    fn manifest() -> Manifest {
        Manifest {
            release: 1,
            previous: Some("00".repeat(32)),
            created_at: "2026-07-20T10:00:00Z".into(),
            corpus_root: "aa".repeat(32),
            doc_count: 130_161,
            graph_root: "bb".repeat(32),
            extractor_version: "molao-cite@0.1.0".into(),
        }
    }

    fn sign(m: &Manifest, sk: &SigningKey, key: &str) -> ManifestSignature {
        ManifestSignature {
            key: key.to_string(),
            signature: hex::encode(sk.sign(&m.signing_bytes()).to_bytes()),
        }
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

    #[test]
    fn a_quorum_verifies() {
        let (set, pairs) = three_of_five();
        let m = manifest();
        let release = SignedRelease {
            signatures: pairs[..3].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect(),
            manifest: m,
        };
        assert_eq!(release.verify(&set).unwrap(), 3);
    }

    #[test]
    fn one_short_of_quorum_is_rejected() {
        let (set, pairs) = three_of_five();
        let m = manifest();
        let release = SignedRelease {
            signatures: pairs[..2].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect(),
            manifest: m,
        };
        assert_eq!(
            release.verify(&set),
            Err(ReleaseError::ThresholdNotMet { got: 2, need: 3 })
        );
    }

    #[test]
    fn one_signer_cannot_reach_quorum_by_signing_repeatedly() {
        let (set, pairs) = three_of_five();
        let m = manifest();
        let (sk, pk) = &pairs[0];
        let release = SignedRelease {
            signatures: vec![sign(&m, sk, pk), sign(&m, sk, pk), sign(&m, sk, pk)],
            manifest: m,
        };
        assert_eq!(
            release.verify(&set),
            Err(ReleaseError::ThresholdNotMet { got: 1, need: 3 })
        );
    }

    #[test]
    fn outsiders_do_not_count_even_with_valid_signatures() {
        let (set, pairs) = three_of_five();
        let (outsider, outsider_pk) = keypair(99);
        let m = manifest();
        let mut signatures: Vec<_> = pairs[..2].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect();
        signatures.push(sign(&m, &outsider, &outsider_pk));
        let release = SignedRelease {
            signatures,
            manifest: m,
        };
        assert_eq!(
            release.verify(&set),
            Err(ReleaseError::ThresholdNotMet { got: 2, need: 3 })
        );
    }

    #[test]
    fn tampering_with_the_manifest_invalidates_every_signature() {
        let (set, pairs) = three_of_five();
        let m = manifest();
        let signatures: Vec<_> = pairs[..3].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect();
        let mut tampered = m.clone();
        tampered.corpus_root = "cc".repeat(32); // swap in a different corpus
        let release = SignedRelease {
            manifest: tampered,
            signatures,
        };
        assert!(matches!(
            release.verify(&set),
            Err(ReleaseError::ThresholdNotMet { got: 0, .. })
        ));
    }

    #[test]
    fn a_single_signer_set_is_refused() {
        let (sk, pk) = keypair(1);
        let set = SignerSet {
            threshold: 1,
            epoch: 1,
            signers: vec![Signer {
                name: "sole operator".into(),
                key: pk.clone(),
            }],
        };
        let m = manifest();
        let release = SignedRelease {
            signatures: vec![sign(&m, &sk, &pk)],
            manifest: m,
        };
        // Even with a perfectly valid signature, the *shape* is refused.
        assert_eq!(release.verify(&set), Err(ReleaseError::ThresholdTooLow(1)));
    }

    #[test]
    fn unreachable_thresholds_are_refused() {
        let (_, pk) = keypair(1);
        let set = SignerSet {
            threshold: 4,
            epoch: 1,
            signers: vec![Signer {
                name: "a".into(),
                key: pk,
            }],
        };
        assert_eq!(
            set.validate(),
            Err(ReleaseError::ThresholdUnreachable {
                threshold: 4,
                signers: 1
            })
        );
    }

    #[test]
    fn duplicate_keys_in_a_set_are_refused() {
        let (_, pk) = keypair(1);
        let set = SignerSet {
            threshold: 2,
            epoch: 1,
            signers: vec![
                Signer {
                    name: "a".into(),
                    key: pk.clone(),
                },
                Signer {
                    name: "b (same key)".into(),
                    key: pk,
                },
            ],
        };
        assert_eq!(set.validate(), Err(ReleaseError::DuplicateSigner));
    }

    #[test]
    fn malformed_signatures_are_ignored_not_fatal() {
        let (set, pairs) = three_of_five();
        let m = manifest();
        let mut signatures: Vec<_> = pairs[..3].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect();
        signatures.push(ManifestSignature {
            key: pairs[3].1.clone(),
            signature: "not-hex".into(),
        });
        let release = SignedRelease {
            signatures,
            manifest: m,
        };
        assert_eq!(release.verify(&set).unwrap(), 3);
    }

    #[test]
    fn releases_chain() {
        let first = manifest();
        let mut second = manifest();
        second.release = 2;
        second.previous = Some(first.hash());
        let release = SignedRelease {
            manifest: second,
            signatures: vec![],
        };
        assert!(release.chains_onto(&first));
    }

    #[test]
    fn a_forked_chain_is_detected() {
        let first = manifest();
        let mut second = manifest();
        second.release = 2;
        second.previous = Some("ff".repeat(32)); // points somewhere else
        let release = SignedRelease {
            manifest: second,
            signatures: vec![],
        };
        assert!(!release.chains_onto(&first));
    }

    // -----------------------------------------------------------------------
    // Known-answer vectors
    //
    // Every other test in this module signs with the same code it verifies
    // with, so all of them would still pass if the signing encoding changed
    // wholesale — and a changed encoding silently invalidates every signature
    // anyone has ever produced over a Molao manifest, including on releases
    // already published. These vectors are the fixed point: literal bytes,
    // computed once, never regenerated from the code under test.
    //
    // **If one of these fails, the release format has changed.** That is a
    // breaking change to `molao-release-v1` and needs a new format tag, not a
    // new constant here.
    // -----------------------------------------------------------------------

    /// The vector manifest. Fixed values, deliberately not the one the other
    /// tests use, so nobody edits it to make a test pass.
    fn vector_manifest() -> Manifest {
        Manifest {
            release: 42,
            previous: Some("11".repeat(32)),
            created_at: "2026-07-20T10:00:00Z".into(),
            corpus_root: "aa".repeat(32),
            doc_count: 130_161,
            graph_root: "bb".repeat(32),
            extractor_version: "molao-cite@0.1.0".into(),
        }
    }

    /// `signing_bytes` for [`vector_manifest`], hex.
    const VECTOR_SIGNING_BYTES: &str = "\
6d6f6c616f2d72656c656173652d76310a00000000000000023432000000000000004031313131313131313131313131\
313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131\
3131310000000000000014323032362d30372d32305431303a30303a30305a0000000000000040616161616161616161\
616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161\
616161616161610000000000000006313330313631000000000000004062626262626262626262626262626262626262\
626262626262626262626262626262626262626262626262626262626262626262626262626262626262626262000000\
00000000106d6f6c616f2d6369746540302e312e30";

    /// `hash()` of [`vector_manifest`] — what release 43 must name as its
    /// `previous`, on every platform and every future version of this crate.
    const VECTOR_HASH: &str = "4db6f22386c48fa11db51e6b958cf635a35a4349958d46866c11337a1a08f5e3";

    /// Ed25519 keys from seeds `[1; 32]`, `[2; 32]`, `[3; 32]`, and their
    /// signatures over [`VECTOR_SIGNING_BYTES`].
    const VECTOR_SIGNERS: &[(&str, &str)] = &[
        (
            "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c",
            "d56b089d11d62afb9b21cc7ca9ce53935a74bb78749ead0cbfc1f05a3c29d9bf\
             15fa1bff1b40ea658a81a90261e880d214090ef2fa22905e0a023d12220bda03",
        ),
        (
            "8139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b394",
            "2ad65042e7c3da5186c3d01d4715617a20be80d8f45856169b2fe2a451b1ef4a\
             604a3f73bb99f7848b5e3154f36100d38bff26eece51d1f2c42c454dc6e02c0c",
        ),
        (
            "ed4928c628d1c2c6eae90338905995612959273a5c63f93636c14614ac8737d1",
            "385307fbf23e7f259402baf39f3b3c85df86930fef09a4fbd6698b6398848de6\
             b4c876ce97eda877aedf20b1c2e6da889821eb667afb187c762160b4b6dea600",
        ),
    ];

    /// Strip the line-continuation whitespace the constants above use to stay
    /// inside a readable line length.
    fn unwrap_hex(s: &str) -> String {
        s.chars().filter(|c| !c.is_whitespace()).collect()
    }

    #[test]
    fn vector_signing_bytes_and_hash_are_unchanged() {
        let m = vector_manifest();
        assert_eq!(
            hex::encode(m.signing_bytes()),
            unwrap_hex(VECTOR_SIGNING_BYTES),
            "the molao-release-v1 signing encoding has changed; every signature \
             ever produced over a Molao manifest is now invalid"
        );
        assert_eq!(m.hash(), VECTOR_HASH, "the manifest hash has changed");
    }

    /// A quorum verifies against signatures this code did not just produce.
    /// This is the property that matters across versions: a release signed by
    /// yesterday's binary must still verify under today's.
    #[test]
    fn a_quorum_of_recorded_signatures_still_verifies() {
        let set = SignerSet {
            threshold: 2,
            epoch: 1,
            signers: VECTOR_SIGNERS
                .iter()
                .enumerate()
                .map(|(i, (key, _))| Signer {
                    name: format!("institution-{i}"),
                    key: (*key).to_string(),
                })
                .collect(),
        };
        let release = SignedRelease {
            manifest: vector_manifest(),
            signatures: VECTOR_SIGNERS[..2]
                .iter()
                .map(|(key, sig)| ManifestSignature {
                    key: (*key).to_string(),
                    signature: unwrap_hex(sig),
                })
                .collect(),
        };
        assert_eq!(
            release
                .verify(&set)
                .expect("recorded signatures must verify"),
            2
        );
    }

    /// The vectors must be able to fail. A signature over a *different*
    /// manifest must not verify against this one, which is what proves the test
    /// above is checking the bytes and not merely the key set.
    #[test]
    fn a_recorded_signature_does_not_verify_over_a_different_manifest() {
        let set = SignerSet {
            threshold: 2,
            epoch: 1,
            signers: VECTOR_SIGNERS
                .iter()
                .enumerate()
                .map(|(i, (key, _))| Signer {
                    name: format!("institution-{i}"),
                    key: (*key).to_string(),
                })
                .collect(),
        };
        let mut altered = vector_manifest();
        altered.doc_count += 1;
        let release = SignedRelease {
            manifest: altered,
            signatures: VECTOR_SIGNERS[..2]
                .iter()
                .map(|(key, sig)| ManifestSignature {
                    key: (*key).to_string(),
                    signature: unwrap_hex(sig),
                })
                .collect(),
        };
        assert_eq!(
            release.verify(&set),
            Err(ReleaseError::ThresholdNotMet { got: 0, need: 2 })
        );
    }

    #[test]
    fn signing_bytes_are_unambiguous_across_field_boundaries() {
        // Without length prefixes, moving a character between adjacent fields
        // would produce identical signing bytes and let one manifest's
        // signature validate another.
        let mut a = manifest();
        let mut b = manifest();
        a.corpus_root = "ab".into();
        a.doc_count = 1;
        b.corpus_root = "a".into();
        b.doc_count = 11; // "b" + "1" vs "" + "11"
        assert_ne!(a.signing_bytes(), b.signing_bytes());
    }
}
