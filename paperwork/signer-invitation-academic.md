# Governance Ask — Invitation to a Law Faculty, Law Library, or Bar Council to Hold a Signing Key

> Not legal advice; adapt before sending. Fill in every `[PLACEHOLDER]` and check
> every `[VERIFY: ...]` note before you send this.

## Context — read this before you send anything

This is the **governance ask**, not a corpus ask. It is the same request as
[`signer-invitation-lii.md`](./signer-invitation-lii.md) — will your institution
hold one of the keys that authorise a Molao release — aimed at a different
reader with different motivations and a different internal approval path.

**Why this ask is on the critical path.** `crates/molao-core/src/release.rs:52`
refuses any release whose signing threshold is below 2, even when every
signature present is valid. Until at least two independent organisations each
hold a signing key, **Molao cannot publish anything at all.** The corpus
templates in this directory unblock content. This one unblocks the project
existing.

**Which of the three readers you are writing to** changes the letter materially:

| Recipient | Who decides | What motivates them | The reflex objection to pre-empt |
|---|---|---|---|
| Law faculty | Dean, faculty board; university legal counsel and IT security on custody | Research, teaching, open-scholarship mission | "Is this a student project that dies when someone graduates?" |
| Law library | Library director, possibly the university librarian | Stewardship of the record; digital preservation is already their trade | "Are you asking us to redistribute our licensed databases?" |
| Bar council / law society | CEO or secretary, then a committee or council resolution | Access to justice; members' and the public's ability to know the law | "What is our liability, and what does it cost members?" |

The **library** objection is the sharpest and the easiest to trip: a law
library's first thought will be that you want their subscription content, which
they cannot give you and which asking for puts them in breach. Say early and
plainly that you are not asking for it. The template below does.

`[VERIFY: identify the actual decision-maker and the actual approval path before
writing. A letter that says "I understand this would need to go to [the wrong
body]" is worse than one that asks.]`

`[VERIFY: if the institution has an open-access, open-scholarship, or digital-
preservation policy, read it and cite it by name. This ask sits squarely inside
most of them, and showing that is more persuasive than any argument you can make
from first principles.]`

---

## Email template

**To:** `[RECIPIENT NAME AND EMAIL]`
**Subject:** Invitation to `[INSTITUTION]` — holding a signing key for an open case-law commons

Dear `[RECIPIENT NAME]`,

I am writing to ask whether `[INSTITUTION]` would consider holding one of the
signing keys that authorise a release of **Molao**, a free, open-source project
building a verifiable commons of case law
(https://github.com/vul-os/molao). Molao is part of the VulOS project. It is
non-commercial: MIT-licensed software, no hosted service, no accounts, no
telemetry, no billing, and no paid tier. There is nothing to buy and no fee of
any kind.

**To rule out the obvious concern first: I am not asking for access to any
material `[INSTITUTION]` holds** — not your licensed databases, not your
subscriptions, not anything under a publisher's terms. Molao sources judgments
from courts and official publishers directly or under licence, and never from a
party that has declined. `[VERIFY: for a law library, keep this sentence and
name the concern explicitly — e.g. "in particular I am not asking you to
redistribute anything from your subscription providers, which I know you could
not do." For a faculty or bar council, shorten it.]`

### The problem, briefly

Molao gives every judgment a content-addressed identity, so two independent
copies can be checked byte for byte, and derives a citation graph that anyone
can recompute from the same inputs and check.

That leaves one thing cryptography cannot do. A hash proves bytes have not
changed; it cannot prove the bytes were ever the judgment. Somebody has to
vouch for the link between the text and the world. Molao's answer is to put that
attestation in the hands of a **quorum of independent institutions** instead of
one operator, and to enforce it in code: a release needs at least *k* signatures
from *n* distinct signers, and the software **refuses any release configured
with a threshold below 2**, however valid the signatures. There is no
single-publisher mode, including for the people who wrote the code.

So the design's central claim — that no one party controls what the corpus is —
is only true if institutions like yours actually hold the keys. Right now,
nobody does, which is why this letter exists.

### What signing attests, and what it does not

A signature says: **your institution rebuilt the release from the same inputs,
using the pinned extractor version the manifest names, and got the same corpus
and graph root hashes it claims.** Bytes match bytes. That is the entire claim.

A signature does **not** assert that any judgment in the release is authentic
law, correctly decided, current, good law, or applicable to anyone's facts. It
endorses a hash, not a holding. You would not be publishing the judgments,
editing them, certifying their correctness, or standing behind their legal
effect — you would be one of several independent parties confirming that a
reproducible computation produced the number it says it produced.

That scope is written down so your counsel can read it directly rather than take
my word for it:
[`GOVERNANCE.md`](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md),
section "What signing attests, and what it does not". What signing exposes
`[INSTITUTION]` to under `[JURISDICTION]` law is a question only your own
counsel can answer, and I would not presume to answer it for you. The design's
contribution is to keep the thing being asserted as narrow and as checkable as
possible.

### Why this fits `[INSTITUTION]`

`[VERIFY: keep the paragraph that fits your recipient and delete the others.]`

**For a law faculty.** The obligation a signer takes on — independently
rebuilding a published artifact and confirming it reproduces — is a research
practice, not an administrative burden bolted onto one. It is reproducibility,
applied to the corpus your own people teach and cite. It is also teachable: a
release that must be rebuilt and checked is a concrete object for a seminar on
legal information, evidence, or research method. And the mission fit is direct —
`[VERIFY: cite the faculty's own open-scholarship or public-mission commitment
by name]`.

**For a law library.** This is close to work you already do. Libraries have run
distributed preservation for the printed and digital record for decades, on the
principle that copies in independent institutional hands are what keeps a record
honest. Molao adds the part that print did not need: a way to prove
mechanically that two copies are the same copy, and a rule that no single party
can declare what the authoritative set is. Holding a key is the institutional
form of that role.

**For a bar council or law society.** Your members' ability to rely on the law
depends on the record being what it says it is, and on access to it not being
controlled by whoever owns the database. Molao does not sell anything and never
will, so there is no vendor relationship here — the ask is for institutional
independence, which is the one thing a commercial provider cannot supply.

### What it would cost

- **Money: nothing.** No fee, no membership, no subscription.
- **Infrastructure: a machine you already have.** Enough storage for the corpus
  and a machine that can run the software. Nothing needs to be exposed to the
  internet, and you would host nothing on our behalf. Mirroring a release is a
  static directory of files on any web server, and is optional and entirely
  separate from signing.
- **Staff time, which is the real cost.** Two distinct things: someone
  technically competent to run a rebuild and compare hashes, once per release;
  and custody of a signing key that outlives whoever set it up. **Honestly: no
  release has ever been built, so I cannot quote you hours. I would rather say
  that than invent a figure.**
- **Your counsel's or risk office's time**, which is a genuine cost and one I
  am asking you to incur.

A specific warning rather than a sales point: **this cannot be one enthusiastic
person's project inside your institution.** The commonest way schemes like this
fail is that the key belonged to someone who left. If `[INSTITUTION]` takes this
on, it should be as an institutional function with a named custodian and a
successor, reviewed by whoever normally reviews key custody with you. If that
review concludes you are not set up to do it, that is a real answer and a useful
one.

### What is not built yet

You are being asked to consider an early project, and I would rather you hear
its limits from me:

- **There is no public corpus and no signed release.** Not one. Nothing has been
  distributed over any transport.
- **The signer set is empty.** You would be among the first, not joining an
  existing group.
- **There is no tooling to generate a key or produce a signature.** Verification
  is implemented and shipped as a command; signing is not. That is why I am not
  asking you to sign anything now — you could not, and I will not ask until the
  tooling and a documented ceremony exist for your people to review.
- **The independent-rebuild step is designed, not built.** The obligation
  described above is the substantive one, and today there is no single command
  that performs it end to end.
- **The process for adding or removing a signer is designed, not built.**
- **No jurisdiction has been run end to end**, and the code has had no external
  security audit. Its commit history records that it was largely
  machine-generated and not human-reviewed; you would find that if you looked,
  so I am saying it rather than letting you discover it.

If any of that is disqualifying for `[INSTITUTION]` today, I would rather know
now and come back when it is not.

### Leaving

You can decline to sign any particular release, for any reason, without
explanation — a signer that has never refused is a rubber stamp, and the design
says so in those words. You can ask to be removed from the signer set. A
signature already given is a historical fact about a set of bytes and cannot be
recalled, but nothing obliges you to give another. Removing a signer requires
quorum approval precisely so that no single party can quietly rewrite who the
signers are; as noted above, that ceremony is designed and not yet built, and I
would want it built, documented, and reviewed by your people *before* you held a
key rather than after.

One practical consequence: if the number of signers ever equals the threshold,
one departure stalls releases until membership changes. That is an argument for
a set meaningfully larger than its threshold, and a reason this letter is going
to several institutions in different jurisdictions.

### Who else signs, and why not just publish it myself

Today, nobody signs — that is the honest answer and the reason for the letter.
I am approaching `[VERIFY: describe honestly who else you have written to, or
say you are approaching several institutions across jurisdictions and can name
them once they have replied. Do not imply anyone has agreed.]`

As for publishing it myself: that is the outcome the design refuses. A corpus
attested by one party is one database with one administrator, and the question
that matters about legal infrastructure is not what it does on an ordinary day
but what happens when someone with money or power wants one judgment to change.
The answer has to be structural rather than a promise, and it only becomes
structural when the keys are in genuinely independent institutional hands.
`[INSTITUTION]`'s independence is not incidental to this request; it is the
entire content of it.

### What I am actually asking for now

Not a commitment. A conversation — `[VERIFY: propose something concrete and
small, e.g. "half an hour, at your convenience, in the next month"]` — and, if
it seems worth pursuing, an indication of whether this is a role `[INSTITUTION]`
could hold in principle and what your internal approval would require
`[VERIFY: name the body you believe it would go to, and ask whether that is
right]`. I would come back with the ceremony documentation and tooling once they
exist, so the people who must approve this are reading a finished description
rather than an intention.

If the answer is no, that is a legitimate answer and I will not press it. If it
is "not us, but speak to `[X]`", that would be genuinely useful.

Thank you for your time.

Kind regards,
`[YOUR NAME]`
`[YOUR ROLE / RELATIONSHIP TO MOLAO]`
`[YOUR EMAIL]`
`[YOUR ORGANISATION, IF ANY — OR "Individual contributor to the Molao open-source project"]`
`[DATE]`

---

## After sending

- Record what was sent, to whom, and any reply. Note precisely what was and was
  not agreed — "willing to discuss" is not "willing to sign", and an academic
  saying yes personally is not their institution saying yes.
- Expect the real answer to come from counsel or a risk office rather than your
  correspondent. Questions from them are the most valuable output of this
  letter: each one is a governance gap. Raise them as issues against
  [`GOVERNANCE.md`](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md)
  rather than answering them privately and losing the answer.
- Do not name an institution publicly as a prospective signer without its
  written agreement to be named. Implying a quorum that does not exist would
  discredit the project faster than having no quorum at all.
- If the conversation turns into an offer of *content* rather than governance,
  it still goes through the sourcing rules in
  [`docs/SOURCES.md`](../docs/SOURCES.md). A friendly institution is not an
  exception to them.
