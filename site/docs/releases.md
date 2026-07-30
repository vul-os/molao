# Releases

A release is the unit everyone agrees on: *as of release 42, these are the
judgments and this is the citation graph derived from them.*

It is published as a **content-addressed set of files** — the documents and
the citation graph, each named by its own hash — plus a **signed manifest**
naming the roots computed over them. **No single party can publish one,
including the project that wrote this code.** What a release *is* does not
depend on how it travels; see [Packaging and transport](#packaging-and-transport)
below for how it moves once it exists.

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
| `signer_set` | `SignerSet::fingerprint()` of the set this release was signed under |

`extractor_version` is the field that makes the graph checkable. Anyone can run
that version over that corpus and must get a byte-identical graph. It is the
property embeddings can never have, which is why no embedding artifact is part
of a release ([THREAT-MODEL.md](THREAT-MODEL.md)).

`signer_set` is a **commitment to** the signer set, never the set itself. A
release carrying the list of who may sign it would authorise itself; a release
carrying a fingerprint of the list it was signed under lets a reader who
supplies their own set discover, by name, that the two rosters differ. Without
it a quorum of a rotated-out set verified silently against anyone still holding
that set, and a signer had no way to say which roster they believed they were
acting for. It is inside the signing bytes, so every signature covers it.

It cannot tell you your set is *current*. Nothing in band can — the set is the
trust root, and confirming it is the one step that stays human.

## Signing bytes

`Manifest::signing_bytes()` is hand-rolled, not `serde_json`. Deliberately.

JSON field ordering and number formatting are not guaranteed stable across
library versions, and a signature over a representation that can shift is a
signature over nothing.

The format is a fixed magic line `molao-release-v2\n`, then each field in fixed
order as an 8-byte big-endian length followed by the raw bytes. No escaping, no
ambiguity, no optional whitespace.

Length prefixing is not decoration. Without it, moving a character between two
adjacent fields would produce identical signing bytes, and one manifest's
signature would validate another. There is a test for exactly that:
`corpus_root: "ab"` with `doc_count: 1` must not collide with
`corpus_root: "a"` with `doc_count: 11`.

`Manifest::hash()` is BLAKE3 over those signing bytes, and it is what the next
release names as `previous`.

The tag is `v2`. `v1` had no `signer_set` field. Adding a field to a signed
encoding is a breaking change and gets a new tag rather than a quiet append, so
a v1 signature cannot accidentally validate a v2 manifest or the reverse.
Nothing was ever published under v1 — there is no public signed release, which
is exactly why the format could still be fixed.

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

- the set is refused outright if it cannot deliver a quorum (`validate()`)
- a release naming a *different* signer set is refused before any signature is
  checked, as `SignerSetMismatch` rather than as a baffling `0 valid signatures`

- signatures from keys not in the set are ignored, not counted, even when
  cryptographically valid
- malformed keys and malformed signatures are ignored rather than treated as
  fatal, so one corrupt entry cannot deny service to a valid quorum
- **one signer, one vote** — a key that signs three times counts once
- if fewer than `threshold` distinct valid signatures remain, it returns
  `ThresholdNotMet { got, need }`

Tampering with any manifest field invalidates every signature over it, so a
swapped `corpus_root` does not arrive with two valid signatures and a missing
one. It arrives with zero. That includes `signer_set`: rewriting the binding to
match whatever roster a victim happens to hold kills every signature with it.

`verify()` is deliberately the composition of two separately callable checks,
`SignerSet::check_binds` and `SignedRelease::verify_signatures`, so that a
step-by-step verifier can report which of the two failed — and so that neither
can act as a backstop hiding a break in the other.

## Chaining

`SignedRelease::chains_onto(&Manifest) -> bool` is true when the release number
is exactly one greater and `previous` equals the earlier manifest's hash.

A node that has followed the chain detects a fork. A node that has not can
compare its head against any peer's. Combined with a public append-only log,
silently rewriting history requires colluding with a quorum **and** going
undetected by every monitor, rather than compromising one server.

The append-only log is **designed, not built**. Chaining and quorum
verification are implemented and tested; log-based monitoring is not yet.

## Packaging and transport

A release's identity — content-addressed files, a manifest naming their
roots, a quorum's signatures over it — is independent of any transport. That
is deliberate: it means the manifest and the files can move over **any**
channel, including one nobody has a reason to trust, without weakening what
"verified" means. Verification recomputes the roots from the files it
actually received and checks the signatures over the manifest; it never asks
where the bytes came from.

Three transports carry the same content-addressed release:

- **iroh** — the primary peer-to-peer transport. Direct node-to-node,
  content-addressed by design, so asking a peer for a release is just asking
  for known hashes.
- **A torrent export** — a release exported as a `.torrent` plus the file
  set, so any node, library or university that wants to can seed it with
  tools that already exist, and the corpus can outlive this project whether
  or not it is still maintained. This is an **export you generate from a
  release**, not a mechanism the node itself runs.
- **A plain HTTP mirror** — the simplest option, and the only one in actual
  use today: a directory of content-addressed files and a manifest, served
  by any static host.

None of the three is privileged. A node fetches from whichever it has
access to, and the verification in the next section is identical either way.
See [DISTRIBUTION.md](DISTRIBUTION.md) for the full story, including why an
untrusted transport cannot smuggle in altered bytes, and what content
addressing does *not* solve on its own (split view — see
[THREAT-MODEL.md](THREAT-MODEL.md#distribution-content-addressed-release-over-an-untrusted-transport)).

**Status:** the packaging model is settled, `molao-dist` implements it, and the
node reaches it: `molao release publish` packages a corpus, `sign` adds one
institution's signature, `fetch` pulls a release over a transport and refuses to
keep one that does not verify, `torrent` writes the BEP 52 export, and `attest`
prints the one line two builders compare to prove they built the same release.
The `iroh` adapter stays behind its feature flag.

**None of it has carried a real release.** There is no public signed release for
it to carry. Today a release is a directory of files on a plain host, mirrored
by hand.

## Verifying a release yourself

```
molao verify release.json --signers signers.json --db molao.db \
    --previous head-manifest.json
```

Seven steps, each reported `PASS`, `FAIL` or `SKIP` on its own line with what
it examined:

| # | Step | Needs |
|---|---|---|
| 1 | the signer set can deliver a quorum (`validate()`) | the signer set |
| 2 | the release was signed under **this** signer set | release + signer set |
| 3 | a quorum actually signed this manifest | release + signer set |
| 4 | the release chains onto the head you already hold | `--previous`, or a genesis release |
| 5 | every document re-hashes to the id it is stored under | `--db` |
| 6 | `corpus_root` and `doc_count` match the documents held | `--db` |
| 7 | re-running the pinned `extractor_version` reproduces `graph_root` | `--db` |

**`SKIP` is not a pass.** Exit 0 means all seven passed; 1 means one failed; 2
means the run was incomplete and the release has *not* been verified. Running
three checks and printing OK is exactly the failure the per-step reporting and
the third exit code exist to prevent.

Step 7 is not a string comparison. It re-extracts every citation from the
stored paragraph text, resolves them, rebuilds the edge set and recomputes the
root — and separately requires the corpus's own citation table to agree with
what the text produces, so a database whose citation rows were edited
underneath its paragraphs fails rather than verifying against its own
tampering. A binary that is not the pinned extractor reports `SKIP`; it does
not compare roots anyway and call it a pass.

**Step 1 has a half no software can do.** Confirming the signer set you hold is
the set the signing organisations published is a human comparing two values out
of band. `molao verify` prints the set's fingerprint so there is one short value
to compare; it cannot tell you the set is the right one. Step 2 answers only the
mechanical half — whether the roster you hold is the roster the signers said
they were acting for.

**No public signed release exists**, so nothing described here has been run
against a real one.

## What a verified release does and does not mean

It means: a quorum of the organisations in the signer set attested that this
corpus root and this graph root are the ones they built, and the text you are
reading hashes to the id it claims.

It does not mean the judgment is good law, that the corpus is complete, or that
the quorum was right. The node verifies bytes and signatures. It does not
verify legal correctness, and no software can.
