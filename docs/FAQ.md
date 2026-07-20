# FAQ

### Is this free?

Yes, and permanently. No accounts, no subscriptions, no tiers, no "free for
individuals" asterisk. There is no hosted Molao service to charge for, because
there is no hosted Molao service. Universities, firms and individuals run nodes;
nobody bills anybody.

### Is this a startup?

No. It is a commons. Nothing about it is designed to be sold, and the release
mechanism means the project could not unilaterally take control of the corpus
even if it later wanted to.

### How can it be decentralized if someone still decides what goes in?

It cannot be, entirely, and the project says so rather than pretending.

"No central **server**" is achievable: a node holds a corpus, works offline,
and needs nothing from anyone. That part is real.

"No central **authority**" is not, because someone has to attest that a
particular hash is the real judgment. A pure content-addressed system tells you
that bytes have not changed. It cannot tell you the bytes were ever the judgment
in the first place.

So the trust root is a **quorum plus a public log**, not one operator. A release
needs k-of-n independent organisations to sign, `threshold >= 2` is enforced in
code, and releases chain by hash so history cannot be rewritten quietly. What
this buys is that capturing the corpus means capturing several institutions
across several jurisdictions and going undetected, rather than compromising one
server. That is a large improvement and it is not the same thing as no
authority.

### Why not just use SAFLII?

Use SAFLII, and use your own jurisdiction's LII. SAFLII is the reason South
African case law has been publicly accessible for two decades, largely unfunded,
and its counterparts elsewhere have done the same.

Molao is not a replacement, and it deliberately does not scrape SAFLII —
[SOURCES.md](SOURCES.md) sets out that position in full. What it adds is
content-addressed identity so nodes agree on what a judgment is, threshold
signing so no single institution can publish alone, and a citation graph that is
verifiable by recomputation. Access is solved. Verifiability and single points
of failure are what is left.

### Where does the corpus come from?

Courts and gazettes directly wherever possible, and licensed bulk data from
Laws.Africa / AfricanLII in Akoma Ntoso for the rest. SAFLII is a
citation-resolution target — somewhere to send a reader — not a scrape target.
A bulk SAFLII scraper will not be accepted into this repository.
[SOURCES.md](SOURCES.md).

### Is there a corpus I can download right now?

**No.** A node starts empty. Ingest exists, a public signed release does not
yet. `molao demo` seeds a small synthetic corpus so you can see the software
work. This is the honest state of the project.

### Can I trust a judgment I read on a Molao node?

You can check two things: that the text hashes to the id it claims, and that a
quorum of independent organisations signed the release it came from. That is
what the software verifies.

You cannot conclude the judgment is good law. Whether it has been overruled,
distinguished, or superseded by statute is a legal question the node does not
answer, and until treatment attestations exist it does not attempt to. The node
verifies bytes and signatures. Nothing more, and it will never say otherwise on
screen.

### Does it tell me if a case was overruled?

**Not yet, and this is the most important gap in the project.**

A corpus that does not know case A was overruled by case B will hand a lawyer
dead authority. Mechanical citation edges — who cited whom, at which paragraph —
are deterministic and verifiable, and those are built. Treatment labels
(followed, distinguished, overruled) are interpretation, cannot be verified by
recomputation, and are **designed, not built**.

When they land they will be modelled as **signed attestations that may
conflict**, and the UI will show the disagreement rather than resolve it. Two
scholars can read the same pair of judgments and differ; a system that picks a
winner and hides the argument is lying about how law works.

Until then, check currency yourself.

### Why is there no semantic search?

Because it cannot be verified, and an unverifiable retrieval layer is the most
dangerous component you could put in a legal corpus.

Float inference is not reproducible across hardware, so a contributed vector
index could never be checked by recomputation — only trusted. And a poisoned
index is worse than a poisoned document: a tampered judgment fails its hash
check immediately, while a tampered index leaves every judgment byte-perfect and
simply never returns the case that would have lost you the argument. The text
stays correct while retrieval quietly steers, with no hash to compare and no
symptom to notice.

So no embedding artifact is part of a release. Build one locally over verified
text if you want one — that is the right place for it. Search in v1 is lexical,
over SQLite FTS5, and that is a real limitation knowingly accepted.
[THREAT-MODEL.md](THREAT-MODEL.md#why-embeddings-are-excluded-from-releases).

### Can I put an LLM on top of it?

Yes, and the design is friendly to it: verified text, structured paragraphs, a
citation graph with pinpoints. Retrieval over a corpus whose documents are
hash-verified is a much better foundation than retrieval over a scrape.

Molao itself ships no model and calls no inference API. A node makes no network
requests at all.

### What is a "witness"?

Someone who fetched a judgment from its canonical source and signed the bytes
they saw. Not an authority on the judgment, just a record of an observation. A
document is `Corroborated` when independent witnesses agree, `Single` when only
one looked, and `Manual` when it was typed in by hand because no court published
it. Every judgment shows which. [PROVENANCE.md](PROVENANCE.md).

### Why include hand-entered judgments at all?

Because some courts still do not publish, and excluding them would quietly bias
the corpus toward the well-resourced divisions. A commons that reflects Sandton
better than Mthatha is a worse outcome than a clearly-labelled hand-entered
judgment. `Manual` is always visible to the reader.

### What if a node lies to me?

Fetch a judgment, hash its canonical text, compare against the id. The API
returns the paragraphs precisely so a client can do this without asking the node
anything further. For the corpus as a whole, compare your release head against
another node's — releases chain by hash, so a fork is detectable.

Molao does not defend your own machine against its own administrator. Anyone
with write access to the SQLite file can change what your node shows you.
Re-verification against a release catches it.

### Does it work offline?

Completely. A node with a corpus on disk needs no peers, no relay, and no
internet. This is a hard guarantee, not a degraded mode, and it is why P2P
distribution — which is designed, not built — will never be a requirement for
reading the law.

### Does it track me?

No. No telemetry, no analytics, no phone-home, no licence check, no update
check. A node makes no outbound requests of its own.

Reader privacy has one real limit worth stating: a node's operator can see what
its users search for. Molao makes no anonymity claim. If your research is
sensitive, run your own node, which is free and works offline.

### What does "Molao" mean?

*Law*, in Sotho and Tswana. The mark is a ring of nodes joined by chords: the
kgotla, the assembly where matters are heard in the open, and a peer network at
the same time.

### Is this South Africa only?

No. **Molao is jurisdiction-neutral by design.** Court codes, court names,
hierarchy tiers, authority weights and law-report series are **region profile
data**, not hardcoded logic. A `generic` profile works anywhere from day one;
South Africa (`ZA`) is simply the first fully-populated profile.

This is feasible because the free-access-to-law world already shares one
citation convention: `[2020] UKSC 1`, `[2020] HCA 1`, `[2020] NZSC 1`,
`[1995] ZACC 3`. Same grammar, different court codes. Adding a jurisdiction
means writing a profile and touching no core logic —
[docs/COURTS.md](COURTS.md#adding-a-jurisdiction).

The honest caveat: the profile refactor is **in progress**. The registries are
currently ZA-populated constants.

### How do I help?

Court registry corrections, series registry additions, citation-parser test
cases from real judgments that are mis-parsed, running a node, and the
institutional work of assembling a genuinely independent signer set. See
[CONTRIBUTING.md](../CONTRIBUTING.md).

### What happens if the project stops?

Every node keeps working, offline, with the corpus it holds. The software is
MIT. The release format and signing scheme are documented well enough to
reimplement. That is the point of the design: nothing here should require this
particular project to survive.
