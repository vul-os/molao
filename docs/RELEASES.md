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
| `region_profile` | `RegionProfile::fingerprint()` of the profile that extractor ran under |
| `signer_set` | `SignerSet::fingerprint()` of the set this release was signed under |

`extractor_version` **and** `region_profile` together are what make the graph
checkable. Anyone holding both can run that extraction over that corpus and
must get a byte-identical graph. It is the property embeddings can never have,
which is why no embedding artifact is part of a release
([THREAT-MODEL.md](THREAT-MODEL.md)).

Neither field is sufficient alone, and that is why there are two.
`extractor_version` pins the citation *grammar*. The region profile supplies
the *court codes and law-report series* the grammar matches against, which
decide whether a neutral citation is kept and whether a reported citation is
found at all — see [CITATIONS.md](CITATIONS.md#the-contract) for one corpus
producing two different `graph_root` values under two profiles. Before
`region_profile` existed the profile was an input nobody recorded, so
"re-run that exact version and get the same graph" was not a claim a reader
could test, and a disagreement caused by a registry difference was
indistinguishable from a corrupted corpus.

It names **one profile — the one the extractor ran under**, not the set a node
loaded. Only that profile reaches the graph; recording the whole set would fail
two nodes whose graphs are byte-identical merely because one of them also had a
jurisdiction loaded that it never used. It is also the profile the extractor
actually *bound*, not the one the process would resolve now: those differ in a
process that loaded profiles after its first extraction, and only the former
describes edges that exist.

Like `signer_set` it is a fingerprint rather than the thing. A release carrying
its own court registry would be a release that defined the data it was derived
from. The reader supplies the profile — `--profiles`, or the compiled-in
fallback — and the field says whether it is the right one. What it cannot do is
*get* you the right one; a reader whose node resolves a different profile
learns that it does, by name, and has to go and find it.

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

The format is a fixed magic line `molao-release-v3\n`, then each field in fixed
order as an 8-byte big-endian length followed by the raw bytes. No escaping, no
ambiguity, no optional whitespace.

Length prefixing is not decoration. Without it, moving a character between two
adjacent fields would produce identical signing bytes, and one manifest's
signature would validate another. There is a test for exactly that:
`corpus_root: "ab"` with `doc_count: 1` must not collide with
`corpus_root: "a"` with `doc_count: 11`.

`Manifest::hash()` is BLAKE3 over those signing bytes, and it is what the next
release names as `previous`.

The tag is `v3`. Adding a field to a signed encoding is a breaking change and
gets a new tag rather than a quiet append, so a signature over one version's
encoding cannot accidentally validate another's, in either direction:

| Tag | Added | Why the previous tag was not enough |
|---|---|---|
| `v1` | — | — |
| `v2` | `signer_set` | signatures covered the corpus and the chain but never the authority that vouched for them, so a quorum of a rotated-out roster verified silently against anyone still holding it |
| `v3` | `region_profile` | `extractor_version` pinned the grammar but not the court and series registry it matched against, so "re-run this version and get the same graph" was false between nodes resolving different profiles |

Nothing has ever been published under any of the three — there is no public
signed release, which is exactly why the format could still be fixed. Once one
exists, a further field is a migration rather than an edit.

Both superseded tags are pinned by test, so a silent revert to an encoding whose
signatures do not cover everything they must fails loudly rather than shipping.
The known-answer vectors are computed outside the crate with independent BLAKE3
and Ed25519 implementations, and the generator reproduces every superseded v2
vector byte for byte before emitting a v3 one.

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
one. It arrives with zero. That includes `signer_set` and `region_profile`:
rewriting either binding to match whatever roster or registry a victim happens
to hold kills every signature with it. An unauthenticated label is one a
man-in-the-middle edits, and a check over it would be theatre.

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

Eight steps, each reported `PASS`, `FAIL` or `SKIP` on its own line with what
it examined:

| # | Step | Needs |
|---|---|---|
| 1 | the signer set can deliver a quorum (`validate()`) | the signer set |
| 2 | the release was signed under **this** signer set | release + signer set |
| 3 | a quorum actually signed this manifest | release + signer set |
| 4 | the release chains onto the head you already hold | `--previous`, or a genesis release |
| 5 | every document re-hashes to the id it is stored under | `--db` |
| 6 | `corpus_root` and `doc_count` match the documents held | `--db` |
| 7 | this node extracts under the `region_profile` the release names | nothing |
| 8 | re-running the pinned `extractor_version` reproduces `graph_root` | `--db` |

A full run on a corpus a release was built from:

```
  PASS  1  signer set           threshold 2 of 3 signer(s), epoch 1, set fingerprint f379ccbeba1a5eed
  PASS  2  signer-set binding   release names signer set f379ccbeba1a5eed, this node holds f379ccbeba1a5eed
  PASS  3  signatures           2 distinct valid signature(s) over the manifest, threshold 2
  PASS  4  chain                genesis release 0, no predecessor to chain onto
  PASS  5  documents            2 document(s) re-hashed from their stored text
  PASS  6  corpus root          2 document(s), recomputed root dc4522112ce09c58aedfdcf317ae9ae7d6d65bc0ac64c028ad6fd0ac43376d3f
  PASS  7  region profile       release names region profile 2ce45543e4273829, this node extracts under 2ce45543e4273829 (ZA, 32 court(s), 24 series)
  PASS  8  graph root           1 edge(s) re-extracted with molao-cite@0.1.0 under region profile ZA (2ce45543e4273829), recomputed root fc2c2501dfc6c3aef12d857308fe50bc6f51d2f5eac76ce6affbd3bcb2647082

OK  release 0 — all 8 step(s) passed
```

**`SKIP` is not a pass.** Exit 0 means all eight passed; 1 means one failed; 2
means the run was incomplete and the release has *not* been verified. Running
three checks and printing OK is exactly the failure the per-step reporting and
the third exit code exist to prevent.

Step 8 is not a string comparison. It re-extracts every citation from the
stored paragraph text, resolves them, rebuilds the edge set and recomputes the
root — and separately requires the corpus's own citation table to agree with
what the text produces, so a database whose citation rows were edited
underneath its paragraphs fails rather than verifying against its own
tampering. A binary that is not the pinned extractor reports `SKIP`; it does
not compare roots anyway and call it a pass.

**Step 7 is why step 8's answer means anything.** The pinned extractor is only
half of what produced the graph; the region profile is the other half. A node
running a different court or series registry is not re-running the extraction
the manifest describes, so it says so and step 8 declines to compare roots at
all. The same release as above, verified on a node whose `--profiles` directory
adds one local court code:

```
  PASS  6  corpus root          2 document(s), recomputed root dc4522112ce09c58aedfdcf317ae9ae7d6d65bc0ac64c028ad6fd0ac43376d3f
  SKIP  7  region profile       release names region profile 2ce45543e4273829, this node extracts under 3ab1661d39cf893e (ZA, 33 court(s), 24 series)
              this release's graph was extracted under region profile 2ce455…, but this node
              extracts under 3ab166… — the court and series registries differ, so this node
              cannot reproduce the graph and a root comparison would mean nothing — re-run
              with `--profiles <DIR>` pointing at the registry this release was built
              against, or ask the publisher which one that is
  SKIP  8  graph root           not examined

INCOMPLETE  release 0 — 6 of 8 step(s) ran; this release has NOT been fully verified
```

Exit 2. A mismatch is `SKIP` rather than `FAIL` deliberately: the release may be
perfectly good, and what is actually true is that *this node cannot check it*.
That is the same verdict an unpinned `extractor_version` gets in step 8 and the
same distinction the third exit code exists to draw — "this release is bad"
versus "you did not give me enough to tell". It is still not a pass.

Note that the run above would have passed before `region_profile` existed: the
extra court code changes no citation in that corpus, so the roots happened to
agree. Agreeing by accident and agreeing by reproduction are not the same
claim, and step 7 is the one that tells them apart.

**Step 1 has a half no software can do.** Confirming the signer set you hold is
the set the signing organisations published is a human comparing two values out
of band. `molao verify` prints the set's fingerprint so there is one short value
to compare; it cannot tell you the set is the right one. Step 2 answers only the
mechanical half — whether the roster you hold is the roster the signers said
they were acting for.

**No public signed release exists**, so nothing described here has been run
against a real one. The output above is from a two-judgment corpus built for
the purpose; no release has ever carried real data.

## What a verified release does and does not mean

It means: a quorum of the organisations in the signer set attested that this
corpus root and this graph root are the ones they built, and the text you are
reading hashes to the id it claims.

It does not mean the judgment is good law, that the corpus is complete, or that
the quorum was right. The node verifies bytes and signatures. It does not
verify legal correctness, and no software can.
