# Threat model

What Molao defends against, how, and — more importantly — what it does not.

The asset is the **integrity of the law as read**. Not confidentiality:
judgments are public documents and there is nothing secret here. The question is
whether the text a lawyer reads is the text the court handed down, and whether
the case that would have changed the argument is findable.

## Adversaries

| Adversary | Wants | Capability |
|---|---|---|
| Interested litigant | One judgment altered or one case unfindable | Can contribute, can run a node, can afford patience |
| Compromised operator | Same, via a node others trust | Full control of one node and its keys |
| State or corporate pressure | A judgment removed from circulation | Legal process against a single identifiable operator |
| Opportunistic vandal | Visible damage | Can submit anything to any open contribution path |

The first is the one the design is really about. A silent, patient, well-funded
adversary with a specific interest in one case is a realistic threat to a legal
database, and it is the threat that centralised systems handle worst, because
there is exactly one place to apply pressure.

## Defences

### Document substitution

**Threat:** a peer serves altered text under a known id.

**Defence:** `DocId` is the BLAKE3 hash of the canonical text.
`Judgment::verify_id()` recomputes it. Altering any paragraph breaks the check,
and a node that runs it cannot be handed a modified judgment under a genuine id.

**Residual:** a node that skips verification is unprotected. Verification must
run on ingest of anything from an untrusted source, without exception.

### Canonicalisation divergence

**Threat:** two nodes extract the same judgment with different converters,
compute different ids, and the network silently forks. Not an attack, but the
same damage.

**Defence:** `canonicalise()` is aggressive and idempotent — line endings,
typographic quotes and dashes, non-breaking spaces, whitespace runs, blank-line
trimming. Tests assert that two converter outputs of the same text produce the
same id.

**Residual:** canonicalisation cannot fix a converter that drops a footnote or
mangles a table. Corroboration on `raw_hash` is what catches that, because
witnesses compare bytes as served, before conversion.

### Single-publisher capture

**Threat:** whoever publishes releases alters, withholds, or is compelled.

**Defence:** k-of-n threshold signatures. `threshold < 2` is refused in code.
Signatures from outside the set are ignored. One key signing repeatedly counts
once. Tampering with the manifest invalidates every signature over it.

**Residual:** a quorum can still collude, and a quorum drawn from institutions
in one jurisdiction can be pressured together. This is the honest limit — see
"What this does not protect against" below.

### Split view

**Threat:** an adversary shows one node a corpus and another node a different
one, so nobody sees a contradiction.

**Defence:** releases chain by hash. `chains_onto()` detects a fork against a
known head, and any two nodes can compare heads directly.

**Status:** chaining is implemented. The public append-only log and the
monitors that would make split-view detection systematic are **designed, not
built**. Today, comparing heads is a manual act.

### Poisoned contribution

**Threat:** an adversary contributes a fabricated judgment, or a real judgment
with a changed sentence.

**Defence:** k-of-n independent re-fetch. Witnesses fetch from the canonical
source and sign the bytes they saw; a document reaches `Corroborated` only when
independent witnesses agree. A fabricated judgment has no canonical source to
corroborate against, and an altered one disagrees with every honest witness.

**Residual:** `Single` and `Manual` documents have not cleared that bar. They
are included because excluding them would bias the corpus against
non-publishing courts, and they are labelled on every screen so the reader
knows what they are relying on. See [PROVENANCE.md](PROVENANCE.md).

### Graph poisoning

**Threat:** a contributed citation graph adds edges that do not exist, or drops
edges that do — the second being far more useful to an attacker, since a missing
edge means a lawyer never finds the case.

**Defence:** the graph is produced by a pinned deterministic extractor. Anyone
can re-run `EXTRACTOR_VERSION` over the corpus and compare byte for byte. A
manifest that names its extractor version is making a checkable claim.

**Residual:** this rests entirely on extraction being genuinely deterministic.
Any behaviour change without a version bump breaks it silently. That is why the
version bump is a hard rule and not a convention.

## Why embeddings are excluded from releases

This is the sharpest design decision in the project, so it is worth stating in
full.

Semantic search would be useful. It is still excluded, for two reasons:

**1. Float inference is not reproducible across hardware.** The same model on
two machines can produce different vectors — different GPU kernels, different
BLAS, different reduction orders. So a contributed vector index could never be
verified by recomputation. It could only be trusted. Accepting one artifact into
a release on trust rather than on verification would break the property the
entire design rests on, and once one exception exists there is no principled
place to stop.

**2. A poisoned index is worse than a poisoned document.** A tampered judgment
fails `verify_id()` the moment anyone checks. A tampered index leaves every
judgment byte-perfect and simply never returns the one case that would have lost
you the argument. The text stays correct while retrieval quietly steers. There
is no hash to compare, no witness to disagree, and no user-visible symptom — the
results merely look like search results. Detecting it would require knowing what
should have been returned, which is precisely what the user came to find out.

So: no embedding artifact is part of any release. A node operator may build an
index locally over already-verified text, and that is the right place for it —
local, optional, and never something anyone else has to trust.

Search in v1 is lexical, over SQLite FTS5. That is a real limitation and it is
the chosen one.

## What this does not protect against

Stated plainly, because a threat model that only lists wins is marketing.

- **Quorum collusion.** If k of n signers agree to publish something false,
  every verification passes. The defence is institutional: independent
  organisations, published membership, an append-only log so history cannot be
  rewritten quietly. It is not cryptographic.
- **A quorum under common pressure.** Signers drawn from one jurisdiction can
  be compelled together. Geographic and institutional spread of the signer set
  is a governance problem, not a code problem. See
  [GOVERNANCE.md](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md).
- **Upstream error.** If a court publishes the wrong file, witnesses will
  faithfully corroborate the wrong file. Molao attests to what the canonical
  source served, not to what the court meant to serve.
- **Omission at source.** A judgment that was never published anywhere cannot be
  corroborated, and its absence is invisible. `Manual` entry is the partial
  answer, and it is partial.
- **Legal correctness of any kind.** The node verifies bytes and signatures. It
  never claims a judgment is good law, current, or applicable to your facts.
- **Stale authority — today.** A corpus that does not know case A was overruled
  by case B will hand a lawyer dead authority. Mechanical citation edges are
  built; **treatment labels are designed, not built**, and until they exist you
  must check currency yourself. This is the most important gap in the project
  and it is deliberately not hidden.
- **Your own node.** Anyone with write access to the SQLite file can change what
  your node shows you. Re-verification against a release is what catches it.
  Molao does not defend a machine against its own administrator.
- **Denial of service and censorship of distribution.** Today releases are
  plain files on ordinary hosts, which can be taken down. Mirroring is the
  defence and it is entirely manual. P2P distribution is **designed, not
  built**.
- **Reader anonymity.** A node's operator can see what its users search for.
  Molao makes no anonymity claim. If your query is sensitive, run your own node
  — which is free, offline, and the reason the offline guarantee exists.

## Reporting

Security issues go to the process in [SECURITY.md](https://github.com/vul-os/molao/blob/main/SECURITY.md). Corpus
integrity problems — a judgment that does not match its source — are as
important as code vulnerabilities and use the same path.
