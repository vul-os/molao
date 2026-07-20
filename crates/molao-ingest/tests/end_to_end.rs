//! End-to-end: two independent "witnesses" fetch the same canonical URL
//! through the polite fetcher, sign what they saw, and their agreement
//! corroborates the resulting judgment — the whole point of this crate,
//! wired together across module boundaries rather than tested in isolation.
//!
//! Still no network: both witnesses share one [`FixtureTransport`], which is
//! exactly the point — the fixture stands in for "two processes independently
//! fetched the same court URL and got the same bytes".

use ed25519_dalek::SigningKey;
use molao_core::ProvenanceClass;
use molao_ingest::adapter::{FetchedDocument, LawsAfricaAdapter, SourceAdapter};
use molao_ingest::{corroborate, sign, verify, FakeClock, FetchClient, FixtureTransport};

const ZACC_FIXTURE: &[u8] = include_bytes!("../fixtures/akn/zacc_2026_26.xml");

fn witness_key(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

#[test]
fn two_independent_witnesses_corroborate_a_laws_africa_judgment() {
    let url = "https://africanlii.org/akn/za/judgment/zacc/2026/26/eng@/main.xml";

    let transport = FixtureTransport::new()
        .with_status("https://africanlii.org/robots.txt", 404)
        .with_body(url, ZACC_FIXTURE);
    let client = FetchClient::new(transport, FakeClock::new(time::OffsetDateTime::UNIX_EPOCH))
        .with_min_interval(time::Duration::ZERO);

    // Witness A fetches.
    let fetch_a = client.fetch(url).expect("witness A's fetch must succeed");

    // Witness B is a wholly separate process in reality; here it is a second
    // fetch through the same client, which is fine — the fixture always
    // returns the same bytes, exactly as two honest witnesses hitting a real
    // stable URL would see the same bytes.
    let fetch_b = client.fetch(url).expect("witness B's fetch must succeed");
    assert_eq!(
        fetch_a.raw_hash, fetch_b.raw_hash,
        "both witnesses must have seen the same bytes"
    );

    // Each witness independently parses the Akoma Ntoso to get a DocId to
    // attest to. Two honest witnesses running the same parser on the same
    // bytes get the same id — that is the whole load-bearing claim behind
    // DocId being a content hash.
    let adapter = LawsAfricaAdapter::za();
    let doc_a = FetchedDocument {
        url,
        body: &fetch_a.body,
        content_type: fetch_a.content_type.as_deref(),
    };
    let doc_b = FetchedDocument {
        url,
        body: &fetch_b.body,
        content_type: fetch_b.content_type.as_deref(),
    };
    let judgment_a = adapter.parse(&doc_a).expect("A's parse must succeed");
    let judgment_b = adapter.parse(&doc_b).expect("B's parse must succeed");
    assert_eq!(judgment_a.id, judgment_b.id);
    assert!(judgment_a.verify_id());

    // Each witness signs its own fetch attestation with its own key.
    let key_a = witness_key(11);
    let key_b = witness_key(22);
    let provenance_a = sign(
        judgment_a.id,
        &fetch_a.source_url,
        &fetch_a.fetched_at,
        &fetch_a.raw_hash,
        &key_a,
    );
    let provenance_b = sign(
        judgment_b.id,
        &fetch_b.source_url,
        &fetch_b.fetched_at,
        &fetch_b.raw_hash,
        &key_b,
    );
    assert!(verify(&provenance_a).is_ok());
    assert!(verify(&provenance_b).is_ok());

    // Corroboration: two independent, verified, agreeing witnesses reach
    // the Corroborated class.
    let records = vec![provenance_a, provenance_b];
    let result = corroborate(judgment_a.id, &records, 2);
    assert_eq!(result.class, ProvenanceClass::Corroborated);
    assert_eq!(result.agreeing_witnesses.len(), 2);
    assert!(result.conflicting.is_empty());
}

#[test]
fn a_lone_witness_produces_a_single_source_judgment_not_a_corroborated_one() {
    let url = "https://africanlii.org/akn/za/judgment/zacc/2026/26/eng@/main.xml";
    let transport = FixtureTransport::new()
        .with_status("https://africanlii.org/robots.txt", 404)
        .with_body(url, ZACC_FIXTURE);
    let client = FetchClient::new(transport, FakeClock::new(time::OffsetDateTime::UNIX_EPOCH))
        .with_min_interval(time::Duration::ZERO);

    let fetch = client.fetch(url).unwrap();
    let adapter = LawsAfricaAdapter::za();
    let doc = FetchedDocument {
        url,
        body: &fetch.body,
        content_type: fetch.content_type.as_deref(),
    };
    let judgment = adapter.parse(&doc).unwrap();

    let key = witness_key(1);
    let provenance = sign(
        judgment.id,
        &fetch.source_url,
        &fetch.fetched_at,
        &fetch.raw_hash,
        &key,
    );

    let result = corroborate(judgment.id, &[provenance], 2);
    assert_eq!(result.class, ProvenanceClass::Single);
}
