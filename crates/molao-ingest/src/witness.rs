//! Witness signing and k-of-n corroboration.
//!
//! This is the collective-corpus core described in `docs/PROVENANCE.md`: a
//! document is not trusted because someone uploaded it, it is trusted because
//! independent witnesses who never spoke to each other fetched the same
//! canonical URL and agree, byte for byte, on what they got. Nothing in this
//! module trusts a single [`Provenance`] record — [`corroborate`] is the one
//! function everything else here exists to support.
//!
//! ## What a witness actually signs
//!
//! `docs/PROVENANCE.md` states the tuple in words: `(doc_id, source_url,
//! fetched_at, raw_hash)`. This module is where that becomes bytes.
//! [`signing_bytes`] follows the same shape as
//! [`molao_core::release::Manifest::signing_bytes`] and for the same
//! reason: length-prefixed fields in a fixed order, not `serde_json`, because
//! a signature over a representation whose byte layout can drift between
//! library versions is a signature over nothing.
//!
//! ## What verification proves, and what it does not
//!
//! [`verify`] proves that whoever holds the private key behind a
//! [`Provenance`] record's `witness` field produced that exact record. It
//! proves nothing about who that is, or whether they are independent of any
//! other witness on the same document — that is a social fact, not a
//! cryptographic one, and `docs/PROVENANCE.md` is explicit that the witness
//! set being public is what lets it be inspected rather than assumed.
//!
//! ## Corroboration groups on the *hash*, not the witness count
//!
//! The naive bug this module exists to avoid: counting witnesses for a
//! document without checking that they agree on what they saw. Two witnesses
//! who fetched different bytes are not corroboration, they are a
//! disagreement, and a corpus that averaged them into "two witnesses, must be
//! fine" would launder exactly the kind of tampering corroboration exists to
//! catch. [`corroborate`] groups verified records by `raw_hash` first and
//! only then counts distinct witnesses within the winning group.

use ed25519_dalek::{Signature, Signer as _, SigningKey, Verifier, VerifyingKey};
use molao_core::{DocId, Provenance, ProvenanceClass};
use std::collections::HashMap;

/// Something wrong with a witness record's cryptography.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum WitnessError {
    #[error("witness public key {0:?} is not a valid hex-encoded Ed25519 key")]
    MalformedKey(String),
    #[error("witness signature is not valid hex-encoded Ed25519 bytes")]
    MalformedSignature,
    #[error("witness signature does not verify against the claimed key")]
    InvalidSignature,
}

fn push_field(out: &mut Vec<u8>, field: &[u8]) {
    out.extend_from_slice(&(field.len() as u64).to_be_bytes());
    out.extend_from_slice(field);
}

/// Canonical bytes a witness signs over one fetch. See the module docs for
/// why this is hand-rolled rather than a serialisation format's output.
pub fn signing_bytes(doc_id: DocId, source_url: &str, fetched_at: &str, raw_hash: &str) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"molao-witness-v1\n");
    push_field(&mut out, doc_id.to_string().as_bytes());
    push_field(&mut out, source_url.as_bytes());
    push_field(&mut out, fetched_at.as_bytes());
    push_field(&mut out, raw_hash.as_bytes());
    out
}

/// Sign a fetch as a witness, producing a complete [`Provenance`] record.
///
/// This is what a witness daemon calls after a successful
/// [`crate::fetch::FetchClient::fetch`] and, separately, what this crate's
/// tests use to build well-formed fixtures without hand-assembling hex
/// strings.
pub fn sign(
    doc_id: DocId,
    source_url: &str,
    fetched_at: &str,
    raw_hash: &str,
    key: &SigningKey,
) -> Provenance {
    let bytes = signing_bytes(doc_id, source_url, fetched_at, raw_hash);
    let signature = key.sign(&bytes);
    Provenance {
        doc_id,
        source_url: source_url.to_string(),
        fetched_at: fetched_at.to_string(),
        raw_hash: raw_hash.to_string(),
        witness: hex::encode(key.verifying_key().to_bytes()),
        signature: hex::encode(signature.to_bytes()),
    }
}

/// Verify a [`Provenance`] record's signature against its own claimed key.
///
/// Fails closed on every malformed input — a bad key or signature is
/// evidence to reject, not to panic on, because both fields come from
/// whatever peer handed us the record.
pub fn verify(p: &Provenance) -> Result<(), WitnessError> {
    let key_bytes =
        hex::decode(&p.witness).map_err(|_| WitnessError::MalformedKey(p.witness.clone()))?;
    let key_arr: [u8; 32] = key_bytes
        .try_into()
        .map_err(|_| WitnessError::MalformedKey(p.witness.clone()))?;
    let verifying_key = VerifyingKey::from_bytes(&key_arr)
        .map_err(|_| WitnessError::MalformedKey(p.witness.clone()))?;

    let sig_bytes = hex::decode(&p.signature).map_err(|_| WitnessError::MalformedSignature)?;
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| WitnessError::MalformedSignature)?;
    let signature = Signature::from_bytes(&sig_arr);

    let bytes = signing_bytes(p.doc_id, &p.source_url, &p.fetched_at, &p.raw_hash);
    verifying_key
        .verify(&bytes, &signature)
        .map_err(|_| WitnessError::InvalidSignature)
}

/// What corroborating a document's provenance records found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Corroboration {
    /// The class this evidence supports, per
    /// [`ProvenanceClass::from_witness_count`].
    pub class: ProvenanceClass,
    /// Hex witness keys that agreed on `raw_hash`, sorted for determinism.
    /// Empty for [`ProvenanceClass::Manual`].
    pub agreeing_witnesses: Vec<String>,
    /// The raw hash the agreeing witnesses converged on, if any verified
    /// record existed at all.
    pub raw_hash: Option<String>,
    /// Verified records that disagreed with the winning hash — a live
    /// discrepancy, kept rather than discarded, because it is exactly the
    /// signal that something needs a human look: either the canonical source
    /// served different bytes to different fetchers, or one witness is
    /// wrong or compromised.
    pub conflicting: Vec<Provenance>,
    /// Records for this document that failed signature verification and
    /// were excluded before any grouping happened. They carry zero
    /// evidential weight, for or against corroboration.
    pub rejected: usize,
}

/// Classify a document's provenance evidence.
///
/// `records` may contain records for other documents (they are filtered out)
/// and duplicate submissions from the same witness (the first is kept; a
/// witness signing twice must not count twice — the same rule
/// [`molao_core::release::SignedRelease::verify`] applies to release
/// signatures, applied here to fetch attestations).
pub fn corroborate(doc_id: DocId, records: &[Provenance], threshold: usize) -> Corroboration {
    let mut by_witness: HashMap<&str, &Provenance> = HashMap::new();
    let mut rejected = 0usize;
    for p in records {
        if p.doc_id != doc_id {
            continue;
        }
        if verify(p).is_err() {
            rejected += 1;
            continue;
        }
        by_witness.entry(p.witness.as_str()).or_insert(p);
    }

    let mut by_hash: HashMap<&str, Vec<&Provenance>> = HashMap::new();
    for p in by_witness.values() {
        by_hash.entry(p.raw_hash.as_str()).or_default().push(p);
    }

    // Largest agreeing group wins; ties broken by hash value so the result
    // does not depend on hash map iteration order.
    let winner = by_hash
        .iter()
        .max_by(|a, b| a.1.len().cmp(&b.1.len()).then_with(|| b.0.cmp(a.0)));

    let Some((&winning_hash, winning_records)) = winner else {
        return Corroboration {
            class: ProvenanceClass::Manual,
            agreeing_witnesses: Vec::new(),
            raw_hash: None,
            conflicting: Vec::new(),
            rejected,
        };
    };

    let class = ProvenanceClass::from_witness_count(winning_records.len(), threshold);

    let mut agreeing_witnesses: Vec<String> =
        winning_records.iter().map(|p| p.witness.clone()).collect();
    agreeing_witnesses.sort();

    let mut conflicting: Vec<Provenance> = by_hash
        .iter()
        .filter(|(hash, _)| **hash != winning_hash)
        .flat_map(|(_, group)| group.iter().map(|p| (*p).clone()))
        .collect();
    conflicting.sort_by(|a, b| a.witness.cmp(&b.witness));

    Corroboration {
        class,
        agreeing_witnesses,
        raw_hash: Some(winning_hash.to_string()),
        conflicting,
        rejected,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keypair(seed: u8) -> SigningKey {
        // Deterministic, not random: a fixed seed makes test fixtures
        // reproducible and needs no RNG dependency, matching
        // `molao_core::release`'s test convention.
        SigningKey::from_bytes(&[seed; 32])
    }

    const DOC: fn() -> DocId = || DocId::of_raw("the text of a judgment");

    fn record(key: &SigningKey, raw_hash: &str) -> Provenance {
        sign(
            DOC(),
            "https://example.gov/j/1",
            "2026-07-20T10:00:00Z",
            raw_hash,
            key,
        )
    }

    #[test]
    fn a_well_formed_record_verifies() {
        let key = keypair(1);
        assert!(verify(&record(&key, "aa".repeat(32).as_str())).is_ok());
    }

    #[test]
    fn tampering_with_any_field_breaks_verification() {
        let key = keypair(1);
        let mut p = record(&key, "aa".repeat(32).as_str());
        p.raw_hash = "bb".repeat(32);
        assert_eq!(verify(&p), Err(WitnessError::InvalidSignature));
    }

    #[test]
    fn a_forged_signature_from_a_real_looking_key_is_rejected() {
        let key = keypair(1);
        let mut p = record(&key, "aa".repeat(32).as_str());
        // Someone else's valid-looking signature, pasted onto this record.
        let other = keypair(2);
        let other_sig = other.sign(b"not the real signing bytes");
        p.signature = hex::encode(other_sig.to_bytes());
        assert_eq!(verify(&p), Err(WitnessError::InvalidSignature));
    }

    #[test]
    fn malformed_key_and_signature_are_rejected_not_panicked() {
        let key = keypair(1);
        let mut p = record(&key, "aa".repeat(32).as_str());
        p.witness = "not-hex".into();
        assert!(matches!(verify(&p), Err(WitnessError::MalformedKey(_))));

        let mut p2 = record(&key, "aa".repeat(32).as_str());
        p2.signature = "not-hex".into();
        assert_eq!(verify(&p2), Err(WitnessError::MalformedSignature));
    }

    #[test]
    fn two_independent_agreeing_witnesses_corroborate() {
        let a = keypair(1);
        let b = keypair(2);
        let hash = "aa".repeat(32);
        let records = vec![record(&a, &hash), record(&b, &hash)];

        let result = corroborate(DOC(), &records, 2);
        assert_eq!(result.class, ProvenanceClass::Corroborated);
        assert_eq!(result.agreeing_witnesses.len(), 2);
        assert_eq!(result.raw_hash.as_deref(), Some(hash.as_str()));
        assert!(result.conflicting.is_empty());
        assert_eq!(result.rejected, 0);
    }

    #[test]
    fn one_witness_is_single_not_corroborated() {
        let a = keypair(1);
        let hash = "aa".repeat(32);
        let records = vec![record(&a, &hash)];

        let result = corroborate(DOC(), &records, 2);
        assert_eq!(result.class, ProvenanceClass::Single);
        assert_eq!(
            result.agreeing_witnesses,
            vec![hex::encode(a.verifying_key().to_bytes())]
        );
    }

    #[test]
    fn no_records_at_all_is_manual() {
        let result = corroborate(DOC(), &[], 2);
        assert_eq!(result.class, ProvenanceClass::Manual);
        assert!(result.raw_hash.is_none());
        assert!(result.agreeing_witnesses.is_empty());
    }

    #[test]
    fn disagreeing_byte_hashes_are_not_corroborated() {
        // Two witnesses, two different sets of bytes for the same doc id.
        // This is the case the module docs call out explicitly: naively
        // counting "two witnesses" here would wrongly call it corroborated.
        let a = keypair(1);
        let b = keypair(2);
        let records = vec![record(&a, &"aa".repeat(32)), record(&b, &"bb".repeat(32))];

        let result = corroborate(DOC(), &records, 2);
        assert_ne!(result.class, ProvenanceClass::Corroborated);
        assert_eq!(result.class, ProvenanceClass::Single);
        assert_eq!(result.agreeing_witnesses.len(), 1);
        assert_eq!(
            result.conflicting.len(),
            1,
            "the losing group must be surfaced, not dropped"
        );
    }

    #[test]
    fn a_forged_record_cannot_inflate_the_witness_count() {
        let a = keypair(1);
        let hash = "aa".repeat(32);
        let mut forged = record(&a, &hash);
        // Claim to be a different witness, but keep A's signature — it will
        // not verify against the claimed key.
        let b = keypair(2);
        forged.witness = hex::encode(b.verifying_key().to_bytes());

        let records = vec![record(&a, &hash), forged];
        let result = corroborate(DOC(), &records, 2);

        assert_eq!(result.class, ProvenanceClass::Single);
        assert_eq!(result.rejected, 1);
    }

    #[test]
    fn one_witness_signing_twice_counts_once() {
        let a = keypair(1);
        let hash = "aa".repeat(32);
        let records = vec![record(&a, &hash), record(&a, &hash)];

        let result = corroborate(DOC(), &records, 2);
        assert_eq!(result.class, ProvenanceClass::Single);
        assert_eq!(result.agreeing_witnesses.len(), 1);
    }

    #[test]
    fn records_for_a_different_document_are_ignored() {
        let a = keypair(1);
        let b = keypair(2);
        let hash = "aa".repeat(32);
        let other_doc = DocId::of_raw("a different judgment entirely");
        let mut unrelated = record(&b, &hash);
        unrelated.doc_id = other_doc;
        // Signature no longer matches its own doc_id field, but that is
        // irrelevant: it is filtered out by doc_id before verification.
        let records = vec![record(&a, &hash), unrelated];

        let result = corroborate(DOC(), &records, 2);
        assert_eq!(result.class, ProvenanceClass::Single);
    }

    #[test]
    fn a_threshold_of_one_still_requires_two_witnesses() {
        // ProvenanceClass::from_witness_count already enforces max(threshold, 2);
        // this test proves corroborate() does not route around it.
        let a = keypair(1);
        let hash = "aa".repeat(32);
        let result = corroborate(DOC(), &[record(&a, &hash)], 1);
        assert_eq!(result.class, ProvenanceClass::Single);
    }
}
