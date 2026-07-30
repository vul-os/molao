# Governance Ask — Invitation to an LII to Hold a Signing Key

> Not legal advice; adapt before sending. Fill in every `[PLACEHOLDER]` and check
> every `[VERIFY: ...]` note before you send this.

## Context — read this before you send anything

This is **not** a corpus request. It is the opposite kind of letter to the
other templates in this directory, and confusing the two would do real damage.

The LII aggregators — SAFLII, BAILII, AustLII, NZLII, CanLII, and most of the
AfricanLII network — are marked 🔴 **off-limits for corpus** in
[`docs/SOURCE-MAP.md`](../docs/SOURCE-MAP.md). SAFLII signals `use=reference`,
blocks AI crawlers, and has declined to act as a bulk re-supplier. BAILII's
terms forbid "incorporating judgments into the output of a computer program".
AustLII and NZLII publish an explicit no-AI-input policy. CanLII's terms
prohibit scraping and bulk use, and it has litigated the point.

**Asking any of them for their data is asking for something they have already
publicly declined, and will likely end the relationship on first contact.**

But closed to bulk AI use is not the same as wrong to approach. An LII is the
most credible signer Molao could have: these organisations have run free-access-
to-law infrastructure for decades, their independence is exactly what makes a
quorum mean anything, and Molao positions itself as *joining* the Free Access to
Law Movement tradition rather than competing with it
([`docs/SOURCES.md`](../docs/SOURCES.md), "The tradition Molao is joining").

So the right approach to an LII is **governance participation and citation-
resolution partnership, and never a data request.** This template is that
approach. It says "we are not asking for your corpus" in the second paragraph,
deliberately, to pre-empt the reflex no.

**Why this ask is on the critical path.** Molao's first release is blocked by
its own code, not by missing features. `crates/molao-core/src/release.rs:52`
refuses any release whose signing threshold is below 2, even when every
signature present is valid. Until at least two independent organisations each
hold a signing key, **Molao cannot publish anything at all.** The corpus
templates in this directory unblock *content*. This one unblocks the project
existing.

**Adapt per recipient.** Send a separate, specific letter to each institution.
The paragraph acknowledging their published policy must name *their* actual
policy — get it wrong and the letter proves you did not read it.

`[VERIFY: re-check the recipient's current published position — robots.txt,
Content-Signal, terms of use, and any public statement on AI — on the day you
send. These change, and citing a superseded policy is worse than citing none.]`

`[VERIFY: identify the right recipient. For most LIIs this is the executive
director or the academic director of the hosting faculty, not a generic info@
address. A governance invitation sent to a support inbox reads as spam.]`

---

## Email template

**To:** `[RECIPIENT NAME AND EMAIL]`
**Subject:** Invitation to hold a signing key — Molao, an open case-law commons (this is not a data request)

Dear `[RECIPIENT NAME]`,

I am writing to `[INSTITUTION]` about a governance role in **Molao**, a free,
open-source project building a verifiable commons of case law
(https://github.com/vul-os/molao). Molao is part of the VulOS project. It is
non-commercial: MIT-licensed software, no hosted service, no accounts, no
telemetry, no billing, and no paid tier.

**First, so it is not hanging over the rest of this letter: I am not asking for
your data.** I know that `[INSTITUTION]` `[STATE THEIR ACTUAL PUBLISHED
POSITION — e.g. "publishes a use=reference content signal, blocks AI crawlers,
and has said it does not act as a bulk re-supplier"]`. Molao's own documentation
records that position, treats `[INSTITUTION]` as a citation-resolution target
rather than a source, and states that a bulk scraper aimed at it will not be
accepted into the repository. Nothing in this letter asks you to reconsider any
of that, now or later.

What I am asking is a different thing entirely: **would `[INSTITUTION]` consider
holding one of the signing keys that authorise a Molao release?**

### What the project is trying to solve

Molao gives every judgment a content-addressed identity, so any two independent
copies can be checked byte for byte, and derives a citation graph that can be
recomputed from the same inputs by anyone. The access problem was solved by the
LII network decades ago. What Molao is trying to add is narrower: verifiability,
and the removal of a single point of failure over what the corpus *is*.

That requires somebody to attest that a published set of documents is the set it
claims to be. A hash proves bytes have not changed; it cannot prove the bytes
were ever the judgment. So Molao's design puts that attestation in the hands of
a **quorum of independent organisations** rather than one operator — and
enforces it in code. A release needs at least *k* signatures from *n* distinct
signers, and the software **refuses any release configured with a threshold
below 2**, even if every signature is valid. There is no single-publisher mode,
including for the people who wrote the code.

That is why this ask exists and why it cannot be worked around. Until two
independent institutions each hold a key, Molao cannot publish a release at all.

### What you would be attesting to

That the bytes are what the manifest says they are. Specifically: that your
institution rebuilt the release from the same inputs, using the pinned extractor
version named in the manifest, and computed the same corpus and graph root
hashes it claims.

**That is the whole of it.** A signature does not assert that any judgment in
the release is authentic law, correctly decided, current, good law, or
applicable to anyone's facts. It endorses a hash, not a holding. The software
states this everywhere it can, and the same limit binds a signer.

The distinction matters for your exposure: you would not be publishing the
judgments, editing them, certifying their correctness, or standing behind their
legal effect. You would be one of several independent parties confirming that a
reproducible computation produced the number it says it produced. Our governance
document sets out that scope in writing so your counsel can read it directly:
[`GOVERNANCE.md`](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md),
section "What signing attests, and what it does not". What signing exposes
`[INSTITUTION]` to under `[JURISDICTION]` law is a question only your own
counsel can answer, and I would not presume to answer it for you.

### What it would cost you

- **Money: nothing.** There is no fee, no membership, no subscription, and
  nothing to buy. Molao bills nothing and will not have a paid tier.
- **Infrastructure: a machine you already have.** To rebuild a release you need
  enough storage for the corpus and a machine that can run the software. Nothing
  needs to be exposed to the internet, and you would not host anything on our
  behalf. If you later chose to mirror a release, that is a static directory of
  files on any web server — but it is optional and separate from signing.
- **Staff time: this is the real cost, and I will not pretend to know it
  precisely.** It is (a) someone technically competent enough to run a rebuild
  and compare hashes, per release, and (b) custody of a signing key that
  outlives whoever set it up. The commonest failure in schemes like this is that
  the key belonged to a person who left. Honestly: **no release has ever been
  built, so I cannot yet quote you a number of hours.** I would rather say that
  than invent a figure.
- **Your counsel's time**, which is a genuine cost to you and one I am asking
  you to incur.

### What is not built yet, stated plainly

This is an early project and I would rather you hear its limits from me than
find them yourself:

- **There is no public corpus and no signed release.** Not one. Nothing has been
  distributed over any transport.
- **The signer set is empty.** You would be among the first, not joining an
  existing group.
- **There is no tooling to generate a key or produce a signature.** Verification
  is implemented and shipped as a command; *signing* is not. This is why I am
  not asking you to sign anything now — you could not, and I will not ask until
  the tooling and a documented ceremony exist for your people to review.
- **The independent-rebuild step is designed, not built.** The obligation I
  described above is the substantive one, and today there is no single command
  that performs it end to end.
- **The membership-change process is designed, not built**, including the
  removal ceremony described below.
- **No jurisdiction has been run end to end**, and the code has had no external
  security audit. Its commit history records that it was largely
  machine-generated and not human-reviewed; you will see that if you look, so I
  am saying it rather than letting you discover it.

### Leaving

Any institution must be able to stop. Keys are lost, organisations change, and
an institution that has stopped genuinely rebuilding *should* stop signing —
a signer that never declines is a rubber stamp, and the design says so.

Concretely: you can decline to sign any particular release, for any reason,
without explanation. You can ask to be removed from the signer set. A signature
you have already given is a historical fact about a set of bytes and cannot be
recalled, but nothing obliges you to give another. The mechanism for removing a
signer requires quorum approval, so that no single party can quietly rewrite who
the signers are — and, as above, that ceremony is designed and not yet built. I
would want it built, documented, and reviewed by your people *before* you held a
key, not after.

One practical consequence worth naming: if the number of signers falls to the
threshold, the departure of one stalls releases until membership is changed.
That is an argument for a set meaningfully larger than its threshold, and a
reason this letter is going to several institutions.

### Who else signs, and why you specifically

Today, nobody — that is the honest answer, and it is the reason for this letter.
I am approaching `[VERIFY: describe honestly who else you have written to, or
say that you are approaching several institutions across jurisdictions and can
name them once they have replied. Do not imply anyone has agreed.]`

Why an LII rather than simply publishing this myself: because publishing it
myself is exactly the outcome the design refuses. A corpus attested by one
party — however well-intentioned, and whatever its code does — is one database
with one administrator, and the interesting question about legal infrastructure
is not what it does on a normal day but what happens when somebody with money or
power wants one judgment to change. The answer has to be structural.

And why `[INSTITUTION]` in particular: you have been operating free access to
law in `[JURISDICTION]` for `[VERIFY: number]` years, largely on institutional
goodwill rather than commercial return. That is the record that makes an
attestation credible. A quorum drawn from parties with no independent reason to
care about the integrity of `[JURISDICTION]`'s law would be theatre.

### Separately, and much more simply: citation resolution

Independent of anything above: when Molao encounters a citation it cannot
resolve, it shows the citation as written rather than hiding it — that part is
built and is a standing commitment. The intended next step is to link out, so
the reader goes and reads the case where it is properly published, which for
`[JURISDICTION]` is you. **That link-out is not implemented yet**, which is
precisely why I would rather ask than guess: if there is a citation format,
link structure, or attribution wording you would prefer — or would prefer we
did not use — I would like to know before it is written rather than after. This
costs you nothing and does not depend on the governance question at all.

### What I am actually asking for now

Not a commitment. A conversation — `[VERIFY: propose something concrete and
small, e.g. "half an hour, at your convenience, in the next month"]` — and, if
it seems worth pursuing, an indication of whether this is the kind of role
`[INSTITUTION]` could hold in principle, and what your internal approval would
have to look like. I would then come back to you with the ceremony
documentation and tooling once they exist, so that the people who need to
approve this are reading a finished description rather than an intention.

If the answer is no, that is a legitimate answer and I will not press it. If the
answer is "not us, but talk to `[X]`", that would be genuinely useful.

Thank you for the work `[INSTITUTION]` has done in making `[JURISDICTION]`'s law
publicly accessible. Whatever comes of this letter, Molao's position on your
corpus does not change.

Kind regards,
`[YOUR NAME]`
`[YOUR ROLE / RELATIONSHIP TO MOLAO]`
`[YOUR EMAIL]`
`[YOUR ORGANISATION, IF ANY — OR "Individual contributor to the Molao open-source project"]`
`[DATE]`

---

## After sending

- **Do not follow up with a data request.** If the governance conversation goes
  nowhere, the relationship is still worth more than a corpus. The rule in
  [`docs/SOURCES.md`](../docs/SOURCES.md) does not become negotiable because a
  letter went unanswered.
- Record what was sent, to whom, and any reply. If an institution indicates
  interest in principle, note precisely what was and was not agreed — "willing
  to discuss" is not "willing to sign".
- If they raise a question this letter cannot answer, that is a governance gap
  and belongs in an issue against
  [`GOVERNANCE.md`](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md),
  not in a better-worded second letter.
- Do not name an institution publicly as a prospective signer without its
  written agreement to be named. Implying a quorum that does not exist would
  discredit the project faster than having no quorum at all.
