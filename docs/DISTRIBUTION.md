# Distribution

How a release gets from a builder's machine to your node, and why it is safe
to fetch one from someone you have never met and have no reason to trust.

## What travels

A release ([RELEASES.md](RELEASES.md)) is two things: a **content-addressed
set of files** — every document, the citation graph — and a **signed
manifest** naming the roots computed over them. The manifest is small; the
files are the bulk of the bytes.

Because every file is named by its own hash, and the manifest is signed over
roots computed from those hashes, *what* a release is does not depend on *how*
it arrived. A release fetched from a stranger's laptop over iroh, from a
ten-year-old torrent seeded by a library that has long since forgotten why,
or from a university's plain HTTP mirror is the same release, checked the
same way, the moment its bytes match the names they were fetched under.

That is deliberate. It means the transport can be anything, including
something nobody has a reason to trust.

## The transports

| Transport | Role | Status |
|---|---|---|
| **iroh** | Primary peer-to-peer transport. Direct node-to-node, NAT-punching, content-addressed by design — asking a peer for a release is just asking for known hashes, which is the vocabulary Molao already speaks. | **Being built this session** as `molao-dist`. |
| **Torrent export** | Archival and fallback. A release exported as a `.torrent` plus its file set, so libraries, universities and archives can seed it with tools they already run, and the corpus can outlive this project whether or not `molao-dist` itself is still maintained. An **export you generate from a release**, not a mechanism the node runs on its own. | **Being built this session** as `molao-dist`. |
| **Plain HTTP mirror** | The simplest possible option: a directory of content-addressed files and a manifest, served by any static host. | Works today — needs nothing but files on a server. The only transport actually moving bytes right now. |

None of these is "the" way to get a release. A node fetches from whichever
transport its operator has access to, or several at once, and the
verification path described below is identical regardless of which one
delivered the bytes.

## Why an untrusted transport is fine

This only works because verification never trusts the channel it arrived
over.

1. Every document's id is the BLAKE3 hash of its own canonical text
   ([ARCHITECTURE.md](ARCHITECTURE.md)). A transport that hands over a
   corrupted, truncated or substituted file hands over bytes that do not
   hash to the name they were fetched under, and `verify_id()` catches it
   before anything is kept.
2. The manifest's `corpus_root` and `graph_root` are recomputed from the
   files actually received, never taken on the transport's word.
3. The manifest itself is only trusted once `threshold` independent
   signatures verify over it ([RELEASES.md](RELEASES.md)).

So a torrent seeder, a compromised mirror, or a malicious iroh peer can waste
your bandwidth or simply refuse to serve — denial, which multiple transports
and mirroring address — but cannot make your node accept altered content.
There is nothing to trust in the pipe. The trust lives entirely in the hashes
and the signatures at the end of it, which is the point of content
addressing: it turns "who do I trust to carry this" into a question that
does not need an answer.

## What it does not solve

**Split view.** A transport — or an adversary who controls one — could in
principle show two different peers two different, both internally-valid,
releases, so neither peer has reason to suspect the other saw something
different. Content addressing does not catch this on its own, because both
versions verify perfectly well in isolation.

The defence is release chaining: `chains_onto()` ties each release to the
hash of the one before it, so two nodes comparing heads will disagree if they
were shown different histories. A public append-only log of manifests, with
independent monitors watching for exactly this, would make that comparison
automatic instead of manual — and it is **designed, not built**
([THREAT-MODEL.md](THREAT-MODEL.md#split-view)). Until it exists, comparing
heads with nodes you trust is a manual check, not an automated guarantee, and
it is a real one worth doing.

**Denial and censorship.** Taking down one host, or blocking one set of iroh
peers, does not take down a release that is content-addressed and multiply
mirrored: any node that has ever fully fetched a release can go on serving it
to others without asking permission from anyone, this project included. That
resilience is the reason distribution is not built around one mechanism.

**A corpus to distribute in the first place.** None of the above matters
until a release exists. As of this session there is **no public signed
release** and **no corpus moving over any transport** — the transports above
describe how one will move once [Phase 3](../ROADMAP.md#phase-3--the-corpus--in-progress)
produces a corpus and a first release is signed.

## Verifying on receipt

Whichever transport delivered the bytes, the check on receipt is the same,
and is described in full in
[RELEASES.md](RELEASES.md#verifying-a-release-yourself):

1. Confirm the signer set for the release's epoch against the one you already
   trust — the one step that cannot be automated away.
2. Check the manifest reaches `threshold` distinct valid signatures.
3. Check the release chains onto the head you already hold.
4. Recompute `corpus_root` and `graph_root` from the files you received and
   compare them to what the manifest claims.

A release that fails any of these is rejected regardless of where it came
from. Trusting a transport is never a substitute for this, and Molao does not
offer a way to skip it.

## Status

The **model** is settled: content-addressed files, a manifest that is
transport-independent, iroh as the primary transport, a torrent export for
archival seeding, a plain HTTP mirror as the simple fallback that always
works.

The **software** is landing this session as `molao-dist`. It has not moved a
real release yet, because there is no real release yet. Today, the only
transport in actual use is a plain file host, mirrored by hand — exactly the
limitation this crate exists to remove.
