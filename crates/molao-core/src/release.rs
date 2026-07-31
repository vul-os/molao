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
//! A manifest also names the *signer set* it was signed under — as a
//! fingerprint, never as the set itself. The distinction is the whole point: a
//! release carrying the list of who may sign it would authorise itself, whereas
//! a release carrying a commitment to the list it was signed under lets a
//! reader who supplies their own set discover, in band and by name, that the
//! two rosters differ. Before that field existed a signature covered the corpus
//! and the chain but not the authority behind them, and a release signed under
//! a rotated-out set verified silently against anyone still holding it.
//!
//! A manifest names the *region profile* the graph was extracted under, the
//! same way and for a parallel reason. `extractor_version` pins the citation
//! grammar; it does not pin the court codes and law-report series the grammar
//! matches against, and those decide what the extractor finds. Two nodes on one
//! extractor version resolving different profiles produced different
//! `graph_root` values over the same corpus, which made "anyone can re-run that
//! exact version and must get a byte-identical graph" false for an input nobody
//! recorded — and the resulting disagreement was indistinguishable from a
//! corrupted corpus. Now it is named.
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

    /// A short, stable digest of *who may sign and how many must*.
    ///
    /// The one step of verification that cannot be automated is confirming the
    /// signer set you hold is the set the signing organisations published. That
    /// comparison is a human reading two values, so there has to be one value
    /// short enough to read. This is it: BLAKE3 over the epoch, the threshold
    /// and the sorted key list, deliberately **excluding** `name`, which is
    /// display text — two nodes that render the same institution differently
    /// must still agree that they hold the same set.
    ///
    /// It is not a security control. Matching fingerprints mean two parties
    /// hold the same bytes, nothing about whether those bytes are the right
    /// ones.
    pub fn fingerprint(&self) -> String {
        let mut keys: Vec<&str> = self.signers.iter().map(|s| s.key.as_str()).collect();
        keys.sort_unstable();
        let mut h = blake3::Hasher::new();
        h.update(b"molao-signer-set-v1\n");
        h.update(&self.epoch.to_be_bytes());
        h.update(&(self.threshold as u64).to_be_bytes());
        h.update(&(keys.len() as u64).to_be_bytes());
        for k in keys {
            h.update(&(k.len() as u64).to_be_bytes());
            h.update(k.as_bytes());
        }
        hex::encode(h.finalize().as_bytes())
    }

    /// Does `manifest` name this signer set?
    ///
    /// A cheap string comparison against [`SignerSet::fingerprint`], and worth
    /// having as its own check: it distinguishes "somebody tampered with this
    /// release" from "you and the publisher are working from different
    /// rosters", which is a rotation problem with a completely different fix.
    ///
    /// It is a consistency check, not an authority check. It cannot tell you
    /// the set you hold is the current one — see [`Manifest::signer_set`].
    pub fn check_binds(&self, manifest: &Manifest) -> Result<(), ReleaseError> {
        let expected = self.fingerprint();
        if manifest.signer_set != expected {
            return Err(ReleaseError::SignerSetMismatch {
                named: manifest.signer_set.clone(),
                held: expected,
            });
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
    /// [`crate::region::RegionProfile::fingerprint`] of the region profile the
    /// extractor was applied against.
    ///
    /// The other half of what [`Manifest::extractor_version`] claims. That
    /// field pins the citation *grammar*; this one pins the **court codes and
    /// law-report series the grammar matched against**, which decide whether a
    /// neutral citation is kept and whether a reported citation is found at
    /// all. Both are extraction output. Two nodes on the same extractor version
    /// resolving different profiles compute different `graph_root` values over
    /// one corpus, so a release recording only the version asserted a
    /// reproducibility no reader could actually test — the profile was an
    /// unrecorded input, and a root disagreement caused by it looked like
    /// corruption.
    ///
    /// **One profile, not the set a node loaded.** Only the profile the
    /// extractor ran under reaches the graph; a node's other profiles do not.
    /// Recording the whole set would fail two nodes that computed byte-identical
    /// graphs merely because one of them also had a jurisdiction loaded it never
    /// used, and a check that cries wolf is a check operators learn to skip.
    ///
    /// Like [`Manifest::signer_set`] this is a fingerprint rather than the
    /// thing, and for a related reason: a release carrying its own court
    /// registry would be a release that defined the data it was derived from.
    /// The reader supplies the profile — `--profiles`, or the compiled-in
    /// fallback — and this says whether it is the right one.
    ///
    /// What it cannot do: make a profile *available*. A reader whose node
    /// resolves a different profile learns that it does, by name, and has to go
    /// and get the right one. That is a smaller problem than not knowing.
    pub region_profile: String,
    /// [`SignerSet::fingerprint`] of the set this release was signed under.
    ///
    /// **Not the set itself, and not a way to obtain it.** A release that
    /// carried its own list of who may sign it would be a release that
    /// authorised itself; a release that carries a *commitment* to the list it
    /// was signed under is the opposite — the reader still supplies the set out
    /// of band, and this is what turns "your set and theirs differ" from a
    /// baffling `0 valid signatures` into a named failure.
    ///
    /// Before this field existed, a signer could not express which roster they
    /// believed they were signing as a member of, and a release signed under a
    /// superseded set verified perfectly against any reader still holding that
    /// superseded set, with nothing in band to say so. Because the field is
    /// inside [`Manifest::signing_bytes`], every signature now covers it.
    ///
    /// What it cannot do: tell a reader their set is current. Nothing in band
    /// can — the set *is* the trust root. Confirming it against what the
    /// signing organisations published is the one step of verification that
    /// stays human.
    pub signer_set: String,
}

impl Manifest {
    /// Canonical bytes for signing.
    ///
    /// Hand-rolled rather than `serde_json`, deliberately: JSON field ordering
    /// and number formatting are not guaranteed stable across versions, and a
    /// signature over a representation that can shift is a signature over
    /// nothing. Length-prefixed fields, fixed order, no escaping ambiguity.
    ///
    /// ## v3
    ///
    /// The format tag is `molao-release-v3`. Each bump added a field that
    /// signatures had to cover and could not cover by appending quietly — a
    /// signature over one version's encoding must not validate another's, in
    /// either direction:
    ///
    /// | Tag | Added | Why the old tag was not enough |
    /// |---|---|---|
    /// | v1 | — | — |
    /// | v2 | `signer_set` | signatures covered the corpus and the chain but never the authority that vouched for them, so a quorum of a rotated-out roster verified silently |
    /// | v3 | `region_profile` | `extractor_version` pinned the grammar but not the court and series registry it matched against, so "re-run this version and get the same graph" was false between nodes resolving different profiles |
    ///
    /// Nothing has ever been published under any of them: there is no public
    /// signed release, which is exactly why the format could still be fixed.
    /// Once one exists, a further field is a migration rather than an edit.
    pub fn signing_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"molao-release-v3\n");
        push_field(&mut out, self.release.to_string().as_bytes());
        push_field(&mut out, self.previous.as_deref().unwrap_or("").as_bytes());
        push_field(&mut out, self.created_at.as_bytes());
        push_field(&mut out, self.corpus_root.as_bytes());
        push_field(&mut out, self.doc_count.to_string().as_bytes());
        push_field(&mut out, self.graph_root.as_bytes());
        push_field(&mut out, self.extractor_version.as_bytes());
        push_field(&mut out, self.region_profile.as_bytes());
        push_field(&mut out, self.signer_set.as_bytes());
        out
    }

    /// Does this release name the region profile `fingerprint` describes?
    ///
    /// The counterpart of [`SignerSet::check_binds`], and separate from any
    /// root comparison for the same reason: it distinguishes "this corpus is
    /// not the one that was signed" from "you and the publisher extracted
    /// against different court registries", which have completely different
    /// fixes and used to be indistinguishable — the second surfaced as the
    /// first, as a `graph_root` that disagreed for no visible reason.
    ///
    /// A mismatch is not evidence the release is bad. It means this node cannot
    /// reproduce the graph, which is a different statement and is reported as
    /// one — see `molao verify` step 7.
    pub fn check_region_profile(&self, fingerprint: &str) -> Result<(), ReleaseError> {
        if self.region_profile != fingerprint {
            return Err(ReleaseError::RegionProfileMismatch {
                named: self.region_profile.clone(),
                held: fingerprint.to_string(),
            });
        }
        Ok(())
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
    /// Verify against a signer set: the release must have been signed **under
    /// this set**, and by a quorum of it. Returns the number of valid distinct
    /// signatures on success.
    ///
    /// This is the fail-closed entry point, and the one every caller outside
    /// this module should use. It is deliberately the composition of two checks
    /// that are separately callable — [`SignerSet::check_binds`] and
    /// [`SignedRelease::verify_signatures`] — so that a step-by-step verifier
    /// can report which of the two properties failed, and so that neither can
    /// act as a backstop hiding a break in the other.
    /// The set is checked for shape *before* binding: a set that cannot deliver
    /// a quorum at all is a worse problem than the wrong set, and reporting
    /// "these fingerprints differ" for a one-of-one set would bury it.
    pub fn verify(&self, set: &SignerSet) -> Result<usize, ReleaseError> {
        set.validate()?;
        set.check_binds(&self.manifest)?;
        self.verify_signatures(set)
    }

    /// Threshold signature verification alone — **does not** check that the
    /// release names this signer set. Use [`SignedRelease::verify`] unless you
    /// are reporting the two properties separately.
    ///
    /// Fails closed at every step: unknown signers, malformed keys, and
    /// malformed signatures are ignored rather than counted, and duplicates
    /// from one key count once.
    pub fn verify_signatures(&self, set: &SignerSet) -> Result<usize, ReleaseError> {
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
    #[error(
        "this release was signed under signer set {named}, but the set supplied is {held} — \
         one of you is working from a superseded roster"
    )]
    SignerSetMismatch { named: String, held: String },
    #[error(
        "this release's graph was extracted under region profile {named}, but this node \
         extracts under {held} — the court and series registries differ, so this node cannot \
         reproduce the graph and a root comparison would mean nothing"
    )]
    RegionProfileMismatch { named: String, held: String },
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

    /// A manifest bound to the [`three_of_five`] set, which is the set almost
    /// every test below verifies against.
    fn manifest() -> Manifest {
        manifest_bound_to(&three_of_five().0)
    }

    fn manifest_bound_to(set: &SignerSet) -> Manifest {
        Manifest {
            release: 1,
            previous: Some("00".repeat(32)),
            created_at: "2026-07-20T10:00:00Z".into(),
            corpus_root: "aa".repeat(32),
            doc_count: 130_161,
            graph_root: "bb".repeat(32),
            extractor_version: "molao-cite@0.1.0".into(),
            region_profile: "dd".repeat(32),
            signer_set: set.fingerprint(),
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
    fn a_signer_set_fingerprint_ignores_display_names_but_not_membership() {
        let (set, _) = three_of_five();
        let base = set.fingerprint();

        // Renaming an institution must not look like a different set.
        let mut renamed = set.clone();
        renamed.signers[0].name = "renamed after a merger".into();
        assert_eq!(renamed.fingerprint(), base);

        // Listing the same members in another order must not either.
        let mut reordered = set.clone();
        reordered.signers.reverse();
        assert_eq!(reordered.fingerprint(), base);

        // Everything that changes who can sign, or how many must, does.
        let mut epoch = set.clone();
        epoch.epoch += 1;
        assert_ne!(epoch.fingerprint(), base);

        let mut threshold = set.clone();
        threshold.threshold = 4;
        assert_ne!(threshold.fingerprint(), base);

        let mut swapped = set.clone();
        swapped.signers[0].key = keypair(77).1;
        assert_ne!(swapped.fingerprint(), base);

        let mut dropped = set.clone();
        dropped.signers.pop();
        assert_ne!(dropped.fingerprint(), base);
    }

    // -----------------------------------------------------------------------
    // Signer-set binding
    // -----------------------------------------------------------------------

    #[test]
    fn a_release_signed_under_another_signer_set_is_refused() {
        // The scenario the binding exists for: a perfectly valid quorum of a
        // *superseded* roster. Every signature below is cryptographically
        // sound; the release still must not verify against the set the reader
        // actually holds.
        let (old_set, old_pairs) = three_of_five();
        let mut new_set = old_set.clone();
        new_set.epoch = 2;
        new_set.signers.remove(4); // one institution left the commons

        let m = manifest_bound_to(&old_set);
        let release = SignedRelease {
            signatures: old_pairs[..3]
                .iter()
                .map(|(sk, pk)| sign(&m, sk, pk))
                .collect(),
            manifest: m,
        };

        // Against the set it was signed under: fine.
        assert_eq!(release.verify(&old_set).unwrap(), 3);

        // Against the set the reader holds: named, not mysterious.
        match release.verify(&new_set) {
            Err(ReleaseError::SignerSetMismatch { named, held }) => {
                assert_eq!(named, old_set.fingerprint());
                assert_eq!(held, new_set.fingerprint());
            }
            other => panic!("expected a signer-set mismatch, got {other:?}"),
        }
    }

    #[test]
    fn the_binding_is_covered_by_the_signatures_not_merely_carried() {
        // Rewriting signer_set on a signed manifest must invalidate every
        // signature, or the field would be an unauthenticated label a
        // man-in-the-middle could edit to match whatever set the victim holds.
        let (set, pairs) = three_of_five();
        let m = manifest_bound_to(&set);
        let signatures: Vec<_> = pairs[..3].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect();

        // A man-in-the-middle rewrites the binding to match whatever roster the
        // victim holds. Every signature over the manifest dies with it.
        let mut relabelled = m.clone();
        relabelled.signer_set = "cd".repeat(32);
        let release = SignedRelease {
            manifest: relabelled,
            signatures,
        };
        assert_eq!(
            release.verify_signatures(&set),
            Err(ReleaseError::ThresholdNotMet { got: 0, need: 3 }),
            "signer_set must be inside signing_bytes"
        );
    }

    #[test]
    fn binding_and_signatures_fail_independently_of_each_other() {
        // Neither check may act as a backstop for the other: each must be able
        // to go red on its own, or a break in one hides behind the other.
        let (set, pairs) = three_of_five();
        let m = manifest_bound_to(&set);

        // Binding right, signatures short.
        let short = SignedRelease {
            signatures: pairs[..2].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect(),
            manifest: m.clone(),
        };
        assert!(set.check_binds(&short.manifest).is_ok());
        assert!(matches!(
            short.verify_signatures(&set),
            Err(ReleaseError::ThresholdNotMet { .. })
        ));

        // Binding wrong, signatures a full quorum over what was actually signed.
        let mut other_set = set.clone();
        other_set.epoch = 7;
        let m2 = manifest_bound_to(&other_set);
        let quorum = SignedRelease {
            signatures: pairs[..3]
                .iter()
                .map(|(sk, pk)| sign(&m2, sk, pk))
                .collect(),
            manifest: m2,
        };
        assert!(matches!(
            set.check_binds(&quorum.manifest),
            Err(ReleaseError::SignerSetMismatch { .. })
        ));
        assert_eq!(
            quorum.verify_signatures(&set).unwrap(),
            3,
            "the signatures themselves are valid; only the roster is wrong"
        );
    }

    #[test]
    fn a_malformed_set_is_reported_as_malformed_not_as_a_binding_mismatch() {
        let (sk, pk) = keypair(1);
        let set = SignerSet {
            threshold: 1,
            epoch: 1,
            signers: vec![Signer {
                name: "sole operator".into(),
                key: pk.clone(),
            }],
        };
        let m = manifest_bound_to(&set);
        let release = SignedRelease {
            signatures: vec![sign(&m, &sk, &pk)],
            manifest: m,
        };
        assert_eq!(release.verify(&set), Err(ReleaseError::ThresholdTooLow(1)));
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
    // breaking change to `molao-release-v3` and needs a new format tag, not a
    // new constant here.
    //
    // These vectors have been regenerated exactly twice, each time for a
    // deliberate break taken while there is still no public signed release to
    // invalidate: once when `signer_set` was added (v1 to v2), once when
    // `region_profile` was added (v2 to v3). Everything below was computed
    // outside this crate, with independent BLAKE3 and Ed25519 implementations,
    // so a bug shared between the encoder and the signer here cannot make the
    // vectors agree with themselves. The generator reproduces the superseded v2
    // vectors byte for byte before emitting v3 ones, which is what establishes
    // that it encodes this format rather than one of its own.
    // -----------------------------------------------------------------------

    /// The vector signer set: threshold 2, epoch 1, the three keys below.
    fn vector_signer_set() -> SignerSet {
        SignerSet {
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
        }
    }

    /// [`SignerSet::fingerprint`] of [`vector_signer_set`].
    const VECTOR_SIGNER_SET_FINGERPRINT: &str =
        "bdfffb5c96aeec2e5f9725e01fb2780334fa47999110f461c8a5ff7f7fc55416";

    /// The vector manifest's `region_profile`. A fixed literal rather than a
    /// real profile's fingerprint: pinning, say, `region::ZA` here would tie
    /// this vector to a court registry that is allowed to change (with an
    /// `EXTRACTOR_VERSION` bump), and a known-answer vector that a legitimate
    /// data edit forces someone to rewrite is a vector nobody trusts.
    /// `RegionProfile::fingerprint` has its own vector, in `region.rs`.
    const VECTOR_REGION_PROFILE: &str =
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

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
            region_profile: VECTOR_REGION_PROFILE.to_string(),
            signer_set: VECTOR_SIGNER_SET_FINGERPRINT.to_string(),
        }
    }

    /// `signing_bytes` for [`vector_manifest`], hex.
    const VECTOR_SIGNING_BYTES: &str = "\
6d6f6c616f2d72656c656173652d76330a000000000000000234320000000000000040313131313131313131313131313131\
3131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313131313100\
00000000000014323032362d30372d32305431303a30303a30305a0000000000000040616161616161616161616161616161\
6161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616100\
0000000000000631333031363100000000000000406262626262626262626262626262626262626262626262626262626262\
626262626262626262626262626262626262626262626262626262626262626262626200000000000000106d6f6c616f2d63\
69746540302e312e300000000000000040636363636363636363636363636363636363636363636363636363636363636363\
6363636363636363636363636363636363636363636363636363636363636300000000000000406264666666623563393661\
6565633265356639373235653031666232373830333334666134373939393131306634363163386135666637663766633535\
343136";

    /// `hash()` of [`vector_manifest`] — what release 43 must name as its
    /// `previous`, on every platform and every future version of this crate.
    const VECTOR_HASH: &str = "aac1cb19e0ac032edf51d8a62a3501be7d8a4d1c881b2d1b8d8851c7e651100e";

    /// The superseded tags. Kept so each break stays explicit and a silent
    /// revert to a format whose signatures do not cover everything they must
    /// fails loudly rather than shipping.
    const V1_TAG: &[u8] = b"molao-release-v1\n";
    const V2_TAG: &[u8] = b"molao-release-v2\n";

    /// Ed25519 keys from seeds `[1; 32]`, `[2; 32]`, `[3; 32]`, and their
    /// signatures over [`VECTOR_SIGNING_BYTES`].
    const VECTOR_SIGNERS: &[(&str, &str)] = &[
        (
            "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c",
            "3115ccfd5f9cd730c0071e0147ed54d3761cbaec54c2845e2e47a6c7b8c7dfee\
             d1da4c88cec331e4a21a69b38de36a2b1746850bdad96a7d3d629b3f2a05fc08",
        ),
        (
            "8139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b394",
            "509fa28b745c3f3935bb1124275c45f119ed9f0302fe282aab394ebeda8f93d8\
             786ad9ac8ca931d0d51175493fed3a5f8dc7066256ca4b3628a2013dc815a400",
        ),
        (
            "ed4928c628d1c2c6eae90338905995612959273a5c63f93636c14614ac8737d1",
            "aa46dbd31ae0585585bd2746ead3e7ab9e54ada7233abcaa20295d6bb03cd0d5\
             295e8eb0acf70e6d3df52a8008e9c7671527b61401c35e6c28730639aa329405",
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
            "the molao-release-v3 signing encoding has changed; every signature \
             ever produced over a Molao manifest is now invalid"
        );
        assert_eq!(m.hash(), VECTOR_HASH, "the manifest hash has changed");
    }

    #[test]
    fn the_signing_encoding_is_v3_and_covers_the_signer_set_and_the_profile() {
        let m = vector_manifest();
        let bytes = m.signing_bytes();
        assert!(bytes.starts_with(b"molao-release-v3\n"));
        assert!(
            !bytes.starts_with(V1_TAG),
            "reverting to v1 would ship signatures that do not cover the roster \
             that produced them"
        );
        assert!(
            !bytes.starts_with(V2_TAG),
            "reverting to v2 would ship signatures that do not cover the region \
             profile the graph was extracted under"
        );
        // Each field is genuinely in the preimage, not merely on the struct.
        for edit in [
            |m: &mut Manifest| m.signer_set = "00".repeat(32),
            |m: &mut Manifest| m.region_profile = "00".repeat(32),
        ] {
            let mut other = m.clone();
            edit(&mut other);
            assert_ne!(other.signing_bytes(), bytes);
            assert_ne!(other.hash(), m.hash());
        }
    }

    #[test]
    fn the_region_profile_binding_is_covered_by_the_signatures_not_merely_carried() {
        // Same argument as for `signer_set`: an unauthenticated label is one a
        // man-in-the-middle edits to match whatever profile the victim's node
        // resolves, and the reader is back to comparing roots in the dark.
        let (set, pairs) = three_of_five();
        let m = manifest_bound_to(&set);
        let signatures: Vec<_> = pairs[..3].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect();

        let mut relabelled = m.clone();
        relabelled.region_profile = "ef".repeat(32);
        let release = SignedRelease {
            manifest: relabelled,
            signatures,
        };
        assert_eq!(
            release.verify_signatures(&set),
            Err(ReleaseError::ThresholdNotMet { got: 0, need: 3 }),
            "region_profile must be inside signing_bytes"
        );
    }

    #[test]
    fn a_release_extracted_under_another_region_profile_is_named_not_guessed() {
        let m = manifest();
        assert!(m.check_region_profile(&m.region_profile.clone()).is_ok());
        match m.check_region_profile(&"ab".repeat(32)) {
            Err(ReleaseError::RegionProfileMismatch { named, held }) => {
                assert_eq!(named, m.region_profile);
                assert_eq!(held, "ab".repeat(32));
            }
            other => panic!("expected a region-profile mismatch, got {other:?}"),
        }
    }

    #[test]
    fn the_region_profile_check_is_not_folded_into_signature_verification() {
        // It must stay a separate call, for the reason steps 2 and 3 are
        // separate: if `verify` also checked the profile, a break in the
        // profile check could never be observed on its own. A release extracted
        // under a profile this reader does not have is still a properly signed
        // release, and says so.
        let (set, pairs) = three_of_five();
        let m = manifest();
        let release = SignedRelease {
            signatures: pairs[..3].iter().map(|(sk, pk)| sign(&m, sk, pk)).collect(),
            manifest: m,
        };
        assert_eq!(release.verify(&set).unwrap(), 3);
        assert!(matches!(
            release.manifest.check_region_profile(&"ab".repeat(32)),
            Err(ReleaseError::RegionProfileMismatch { .. })
        ));
    }

    #[test]
    fn the_vector_signer_set_fingerprint_is_unchanged() {
        // Pins `fingerprint()` itself: the manifest's binding is only stable if
        // the function that produces it is.
        assert_eq!(
            vector_signer_set().fingerprint(),
            VECTOR_SIGNER_SET_FINGERPRINT,
            "the molao-signer-set-v1 fingerprint encoding has changed; every \
             manifest ever signed now names a set nobody can match"
        );
    }

    /// A quorum verifies against signatures this code did not just produce.
    /// This is the property that matters across versions: a release signed by
    /// yesterday's binary must still verify under today's.
    #[test]
    fn a_quorum_of_recorded_signatures_still_verifies() {
        let set = vector_signer_set();
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
        let set = vector_signer_set();
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
