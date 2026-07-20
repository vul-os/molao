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

## Why a rebuildable-cache RAG index does not reopen this hole

The argument above rules out shipping a vector index **as part of a release**.
It does not rule out semantic search entirely — it rules out *trusting one on
anyone else's say-so*. Those are different problems, and the difference is
where the index is allowed to carry authority.

Each node may build its **own** local vector-plus-keyword index, over
already-verified corpus text, with an embedded engine and no server. That
index may optionally be **shared** with other nodes as a cache — but only as
an artifact with three properties that a release artifact is not allowed to
have:

- **Unsigned.** Nothing in the signer set attests to it. It carries no
  authority a manifest confers.
- **Model-tagged, not release-tagged.** It names the embedding model and
  version that produced it, so a receiving node knows exactly what it would
  need to recompute to check it — and knows to throw it away once that model
  is superseded.
- **Rebuildable, not merely re-fetchable.** Anyone holding the same
  already-verified corpus text and the named model can regenerate the index
  from scratch and diff it against the one they were handed. Disagreement is
  visible, even though the two builds may not be byte-identical the way the
  citation graph is.

This preserves the property the whole design rests on: **the corpus stays the
only signed truth.** A poisoned index cannot be laundered into authority,
because authority was never on offer — it isn't signed, so no node trusts it
by provenance rather than by checking it, and it can be independently rebuilt
and compared rather than merely believed. And because the index only ever
*ranks candidates*, never *serves text*, a node always reads the actual
verified judgment once it opens one; a poisoned index can make you miss a
case, exactly as reasoned above, but it cannot make you misread one you do
open.

**Status:** this local, rebuildable, unsigned index is `molao-index`, being
written this session. It does not exist yet, has not been shared between two
nodes, and the sharing path described above is the design it is being built
to. The embeddings-exclusion argument above is unaffected by its existence —
if anything, `molao-index` is the proof that the exclusion was the right call:
semantic search was never blocked, only its promotion to something a release
would need to trust.

## Distribution: content-addressed release over an untrusted transport

**Threat:** a release is fetched over a transport nobody has reason to trust —
a stranger's iroh peer, a decade-old torrent, a mirror run by someone unknown
to the fetching node.

**Defence:** none of that matters, because verification does not trust the
transport in the first place. A release is a **content-addressed** file set:
every document's id is the hash of its own text, `corpus_root` and
`graph_root` are recomputed from the files actually received rather than
taken on the sender's word, and the manifest naming those roots is only
trusted once `threshold` independent signatures verify over it
([RELEASES.md](RELEASES.md)). A transport that hands over altered or
substituted bytes hands over a file that fails its own hash check, no matter
how it was carried. This is exactly why the transport can be anything —
iroh directly, a torrent export seeded by whoever still has the files, or a
plain HTTP mirror — without weakening what "verified" means.

**Residual:** an untrusted transport can still refuse to serve, or waste your
time — denial, not corruption — and mirroring across transports is the
answer to that, not a cryptographic one. And content addressing on its own
does not stop **split view**: a transport could in principle show two peers
two different, both internally-valid, releases. That is the same split-view
threat described above, and the same defence applies — chaining plus a public
append-only log, not the transport layer. Content addressing makes bad bytes
detectable; chaining and the log are what make a fork visible. See
[DISTRIBUTION.md](DISTRIBUTION.md) for the full transport story.

**Status:** the model is settled. `molao-dist` — iroh as the primary
transport, and a torrent export for archival mirroring — is being written
this session. It has not carried a real release yet, because there is no
public release yet; today the only transport in actual use is a plain file
host, mirrored by hand.

## What this does not protect against

Stated plainly, because a threat model that only lists wins is marketing.

- **Quorum collusion.** If k of n signers agree to publish something false,
  every verification passes. The defence is institutional: independent
  organisations, published membership, an append-only log so history cannot be
  rewritten quietly. It is not cryptographic.
- **A quorum under common pressure.** Signers drawn from one jurisdiction can
  be compelled together. Geographic and institutional spread of the signer set
  is a governance problem, not a code problem. See
  [GOVERNANCE.md](../GOVERNANCE.md).
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
  defence and it is entirely manual. Content-addressed packaging over iroh
  plus a torrent export — so any host that has ever fetched a release can go
  on serving it without asking anyone, this project included — is **landing
  this session** as `molao-dist` ([DISTRIBUTION.md](DISTRIBUTION.md)). It is
  not deployed yet, and there is no public corpus for it to carry.
- **Reader anonymity.** A node's operator can see what its users search for.
  Molao makes no anonymity claim. If your query is sensitive, run your own node
  — which is free, offline, and the reason the offline guarantee exists.

## Reporting

Security issues go to the process in [SECURITY.md](../SECURITY.md). Corpus
integrity problems — a judgment that does not match its source — are as
important as code vulnerabilities and use the same path.
