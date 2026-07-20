# Releases

A release is the unit everyone agrees on: *as of release 42, these are the
judgments and this is the citation graph derived from them.*

It is published as a manifest plus signatures. **No single party can publish
one, including the project that wrote this code.**

## What a manifest asserts

`Manifest` in `crates/molao-core/src/release.rs`:

| Field | Meaning |
|---|---|
| `release` | Monotonic release number |
| `previous` | Hash of the previous manifest, hex. `None` only for release 0 |
| `created_at` | RFC 3339 timestamp |
| `corpus_root` | Root hash over the sorted document ids in this release |
| `doc_count` | How many judgments |
| `graph_root` | Hash of the citation graph derived from this corpus |
| `extractor_version` | Exact extractor that produced the graph, e.g. `molao-cite@0.1.0` |

`extractor_version` is the field that makes the graph checkable. Anyone can run
that version over that corpus and must get a byte-identical graph. It is the
property embeddings can never have, which is why no embedding artifact is part
of a release ([THREAT-MODEL.md](THREAT-MODEL.md)).

## Signing bytes

`Manifest::signing_bytes()` is hand-rolled, not `serde_json`. Deliberately.

JSON field ordering and number formatting are not guaranteed stable across
library versions, and a signature over a representation that can shift is a
signature over nothing.

The format is a fixed magic line `molao-release-v1\n`, then each field in fixed
order as an 8-byte big-endian length followed by the raw bytes. No escaping, no
ambiguity, no optional whitespace.

Length prefixing is not decoration. Without it, moving a character between two
adjacent fields would produce identical signing bytes, and one manifest's
signature would validate another. There is a test for exactly that:
`corpus_root: "ab"` with `doc_count: 1` must not collide with
`corpus_root: "a"` with `doc_count: 11`.

`Manifest::hash()` is BLAKE3 over those signing bytes, and it is what the next
release names as `previous`.

## The signer set

```rust
SignerSet { threshold: usize, signers: Vec<Signer>, epoch: u64 }
Signer    { name: String, key: String }  // key: Ed25519 public key, hex
```

`name` is display only. Authority comes from the key.

`epoch` is bumped whenever membership changes, so a node can tell an older set
from a newer one rather than guessing.

`SignerSet::validate()` refuses sets that cannot deliver the guarantee they
claim, and it fails at load time rather than at publication time:

| Refused | Why |
|---|---|
| `threshold < 2` | A threshold of 1 is a single point of authority wearing a quorum's clothes. Refused even when the signature is perfectly valid. |
| `threshold > signers.len()` | Can never be met. Would wedge the network. |
| duplicate keys | One party holding a duplicated key would count twice toward its own quorum. |

## Verification

`SignedRelease::verify(&SignerSet) -> Result<usize, ReleaseError>` returns the
number of valid distinct signatures, and **fails closed at every step**:

- signatures from keys not in the set are ignored, not counted, even when
  cryptographically valid
- malformed keys and malformed signatures are ignored rather than treated as
  fatal, so one corrupt entry cannot deny service to a valid quorum
- **one signer, one vote** — a key that signs three times counts once
- if fewer than `threshold` distinct valid signatures remain, it returns
  `ThresholdNotMet { got, need }`

Tampering with any manifest field invalidates every signature over it, so a
swapped `corpus_root` does not arrive with two valid signatures and a missing
one. It arrives with zero.

## Chaining

`SignedRelease::chains_onto(&Manifest) -> bool` is true when the release number
is exactly one greater and `previous` equals the earlier manifest's hash.

A node that has followed the chain detects a fork. A node that has not can
compare its head against any peer's. Combined with a public append-only log,
silently rewriting history requires colluding with a quorum **and** going
undetected by every monitor, rather than compromising one server.

The append-only log is **designed, not built**. Chaining and quorum
verification are implemented and tested; log-based monitoring is not yet.

## Verifying a release yourself

The intended flow, in order:

1. Fetch the signer set for the epoch the release names. Compare it against the
   set published independently by the signing organisations. This step is
   the trust root and cannot be automated away.
2. Check `SignerSet::validate()` passes.
3. Check `SignedRelease::verify()` reaches the threshold.
4. Check the release chains onto the head you already trust.
5. Recompute `corpus_root` over the documents.
6. Re-run the pinned `extractor_version` over the corpus and compare
   `graph_root` byte for byte.

Steps 1 to 4 are implemented in `molao-core` and covered by tests. Steps 5 and
6 need the corpus and graph crates, which are **in progress**. A single
`molao verify` command that performs all six is on the roadmap and does not
exist yet — do not expect it in this version.

## What a verified release does and does not mean

It means: a quorum of the organisations in the signer set attested that this
corpus root and this graph root are the ones they built, and the text you are
reading hashes to the id it claims.

It does not mean the judgment is good law, that the corpus is complete, or that
the quorum was right. The node verifies bytes and signatures. It does not
verify legal correctness, and no software can.
