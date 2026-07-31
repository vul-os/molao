# Court-ordered takedown

An options memo. What Molao can and cannot do when a court orders a judgment
removed, what could be built, what each option would cost, and how each could
be abused.

This paper exists because an LII will ask this first. Suppression is routine
business for a legal information institute and an edge case for nobody who has
run one. [GOVERNANCE.md](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md) already states the position honestly
and incompletely: Molao can stop distributing a judgment, and cannot
un-distribute one. This memo does not change that. It sets out the space of
things that could change it, so that a conversation with the people who
actually receive these orders starts from shared facts rather than from a
design someone wrote without them.

**It recommends building nothing yet.** The reasoning is in
[§5](#5-recommendation), and it is a recommendation about sequence, not a claim
that the problem is unimportant.

**Nothing here is legal advice, and none of it is offered as a defence.**
Whether any arrangement described below satisfies any particular order is a
question of that court's law and of an institution's own duties. This project
cannot answer it and does not try to. What it can do is state precisely what
the software does, so the question can be put to counsel in a form that is
answerable.

---

## In one page

**Where Molao stands.** Compliance is forward-looking. A judgment can be omitted
from the next release; the copy already distributed stays complete and
verifiable in the hands of whoever holds it. This is not a missing feature. A
document's id is the hash of its text, and `molao verify` recomputes the corpus
root and document count from what a node holds — so **deleting a judgment is
detected as corruption**, and a node that deletes one to comply can no longer
prove its corpus is the signed one. As built, compliance-by-deletion and
verifiability are mutually exclusive.

**What is already handled, and how narrowly.** The crawler honours `robots.txt`,
including the per-judgment `Disallow` lines LIIs use for takedowns. That covers
suppression which *precedes* acquisition. Suppression usually *follows*
publication, and nothing re-checks documents already held. The control is also
weaker than it looks: at least one LII's case-law exclusion has silently
vanished from its live `robots.txt`, replaced by CDN-managed boilerplate (§4).

**Nobody else achieves retraction either.** Verified: the free-access world's
mechanism is search-engine exclusion, not deletion — and Google's own
documentation says `Disallow` "is not a mechanism for keeping a web page out of
Google". BAILII states the problem in its own words: removal "is more difficult
once the judgment has been indexed by a search engine, and cannot be carried out
promptly". European courts have repeatedly required de-indexing or anonymisation
rather than permanent removal, and **no case was found in which a court ordered
a legal database to delete rather than de-index** — a search that found nothing,
offered as context and not as reassurance. US appellate courts put the
underlying point plainly: "Secrecy is a one-way street" (*In re Copley Press*,
9th Cir. 2008).

**The options, in short.** Seven are surveyed in §2. **None of them retracts a
copy already distributed**, because none can; they differ only in how far
forward compliance reaches. The one that looks most attractive — a network-wide
signed suppression list — is the one this memo recommends against, because it is
a censorship lever: whoever holds the key decides what the law says, the
software cannot tell a valid order from a well-funded demand, and **suppression
is the only operation in the system with no recomputation defence** (§3).

**Recommendation.** Build nothing yet, and ask an LII first (§5, §6). Settle
three constraints now, which cost nothing and foreclose the worst designs:
withhold at serve time and never mutate or delete corpus bytes; never build
redaction under an existing id; and if a network-wide list is ever built, it is
append-only and public or it is not built. Explore two options *with* an LII
rather than in advance of one — build-time re-validation against the source's
own `robots.txt`, and a notices channel that adds information and removes none.

---

## 1. The problem, precisely

### What Molao can do

Compliance in Molao is forward-looking. A judgment can be omitted from the next
release, and that release is the one nodes fetch. This is a real capability and
it covers a real class of orders — those directed at future publication.

Anonymisation, which in practice is more common than deletion, fits this model
better than it first appears: a later release can carry an anonymised text in
place of a named one, exactly as an LII replaces a document on its own site.
The difference is what happens to the copy that was already handed out.

### What Molao cannot do

A release is a content-addressed set. Three properties, each verified in the
code rather than taken from documentation:

- A document's id is the BLAKE3 hash of its canonical text, and
  `Judgment::verify_id()` recomputes it. Altering the text changes the id.
  There is no way to change what a document says while it keeps the name it is
  cited under — that is the point of the design, and it does not have an
  exception for good reasons.
- `corpus_root` is a root hash over the sorted document ids in a release, and
  the manifest also carries `doc_count`.
- `molao verify` step 6 recomputes both from the documents a node actually
  holds. Remove one judgment from a verified corpus and the step fails with
  `manifest claims N document(s); this corpus holds N-1`
  (`crates/molao-node/src/verify.rs`).

The third point is the one that matters and it is stronger than "there is no
takedown command". **Deletion is not merely unsupported; it is detected as
corruption.** A node that deletes a judgment in order to comply stops being
able to prove its corpus is the signed one. As the system is built today,
compliance-by-deletion and verifiability are mutually exclusive.

This is worth stating plainly to an LII, because it is the difference between
"we have not got round to it" and "the thing you are asking for is the thing
this design is made of". A grep of `crates/` finds no takedown, suppression or
redaction path of any kind. That is not an oversight.

### The acquisition-side control is narrower than it looks

GOVERNANCE.md says takedown "at acquisition is already handled", and within its
scope that is true: the crawler honours `robots.txt` including the per-judgment
`Disallow` lines LIIs use for takedowns and privacy
([SOURCES.md](SOURCES.md)), and it fails closed.

The scope is narrower than the sentence suggests, and the gap runs the wrong
way. `robots.txt` is consulted **at fetch time**. Suppression orders are very
often made *after* first publication — a judgment is handed down, reported, and
then a party seeks anonymisation. A `Disallow` line added at that point tells
Molao not to fetch a document it fetched last month. Nothing re-checks a
source's `robots.txt` against documents already held, and nothing could remove
them if it did.

So the accurate statement is: **acquisition-side controls handle the case where
suppression precedes acquisition. They are not a retraction channel, and the
common case is retraction.**

There is a further weakness in that channel, and it is not Molao's to fix.
`robots.txt` is increasingly served by a CDN rather than maintained by hand, and
a vendor-managed file can replace a hand-maintained one without the institution
intending it. This is not hypothetical: as at 31 July 2026 AustLII's live
`robots.txt` no longer contains the case-law exclusion its own published policy
describes, having been replaced by AI-crawler boilerplate (see
[§4](#the-mechanism-they-all-rely-on-and-its-verified-failure)). **Molao's only
existing takedown control therefore depends on a file the source institution may
no longer fully control.**

There is one further existing control, and it is worth naming because it is the
only precedent in the codebase for refusing to handle something. The fetcher
carries a two-tier host denylist: `HARD_DENIED_HOSTS` (SAFLII, not an operator
setting, and no allowlist overrides it) plus an operator-configured
`extra_denylist` (`crates/molao-ingest/src/fetch.rs`). Both are **per-host, at
acquisition, and local to one operator's node.** There is no document-level
equivalent and nothing network-wide.

### Who bears what risk

The risks are not evenly spread, and they do not fall where the design's
rhetoric suggests.

| Party | Exposure | Can it comply? |
|---|---|---|
| **Attestor (signer)** | Signs a manifest naming a corpus root. May be asked to sign a release containing material a court has ordered removed, or ordered not to sign at all. | Can decline to sign future releases. **Cannot un-sign**: an Ed25519 signature over bytes other people hold cannot be withdrawn. |
| **Mirror operator** | Holds and serves the bytes. In most jurisdictions this is the party a distribution order names, and it is identifiable and located. | Can stop serving. Cannot recall what it has already served. |
| **Node operator / reader** | Holds a complete offline copy. Reachable only if identifiable, and most are not. | Commitment 4 is that a node works fully offline. That is by design, and it is what places the corpus beyond recall. |
| **The project** | No legal entity, no instrument, nothing to serve an order on ([GOVERNANCE.md](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md)). | Can change the software. Cannot change any copy in anyone's hands. |
| **The person the order protects** | A minor, a complainant, an acquitted defendant, a party granted anonymity. | Bears the entire cost of the status quo. |

One line in that table deserves expanding, because it has happened. In *Allen v.
Chanel, Inc.* (S.D.N.Y. 2020) a court ordered thirteen publishers and seven
search engines to remove all material relating to a case; on the record of Free
Law Project, one of those publishers, none of them "were parties to this case,
nor did they receive notice or an opportunity to be heard until after the
issuance of the Removal Order" ([§4](#what-courts-have-actually-ordered)). The
order was later vacated. **A mirror operator can be ordered before it is
heard**, and that is a concrete thing to put in front of an institution's
counsel rather than a theoretical exposure.

Two asymmetries follow, and both should be said out loud rather than left to be
noticed later.

**Risk lands on whoever is identifiable and located, not on the design.**
Molao's censorship-resistance is real, and it is purchased with the exposure of
the mirror operators and attestors who can be found. An institution should
understand that it is being asked to be the reachable part of an unreachable
system.

**The status quo's cost is borne by the person with the least power in the
record.** "We omit it from the next release" is a coherent engineering position.
It is not a comfortable answer to give to someone whose name a court ordered
removed from a judgment about them, and a memo that dressed it up as a complete
answer would be misleading.

---

## 2. The design space

Seven options, including the two that consist of doing nothing new. For each:
how it works, what it costs, and how it can be abused. The abuse column is not
a formality — for one of these options it is the whole story.

One structural rule falls out of all of them and is worth stating before the
list, because it eliminates a large part of the space immediately:

> **Any mechanism must withhold at serve time. None may mutate or delete corpus
> bytes.** Mutation breaks `verify_id()`; deletion breaks `molao verify` step 6.
> A node that keeps the bytes and refuses to serve them stays verifiable. A node
> that deletes them cannot prove anything about its corpus ever again.

### A. Do nothing (status quo)

**How it works.** A later release omits the judgment. Earlier releases remain
valid, complete and verifiable in the hands of whoever holds them.

**What it costs.** It places the entire burden on the signer. An institution
whose own statutory or professional duty is to give effect to suppression
orders may find it cannot join the signer set at all — and since assembling a
first quorum is the project's actual critical path, this is not a theoretical
cost. It also offers a wronged individual no remedy whatsoever.

**How it is abused.** Barely at all, and that is its virtue: there is no lever,
so there is nothing to capture. The status quo's failure mode is not abuse but
inaction — the harm it permits is harm it simply declines to address.

### B. Local, operator-held withholding

**How it works.** A node operator configures their own node to refuse to serve
named document ids. Bytes are retained, so verification is unaffected. This is
the document-level analogue of the `extra_denylist` that already exists for
hosts. No new authority, no new key, no shared list, nothing distributed.

**What it costs.** Very little to build, and it delivers exactly what a mirror
operator under an order in its own jurisdiction actually needs: the ability to
stop serving a specific judgment without abandoning the corpus or breaking
verification. What it does not deliver is any effect on any other node — which
may or may not be what an order demands, and that is a question for counsel.

**How it is abused.** The blast radius is one node. An operator can already
switch their node off, so this grants them no power over anyone they did not
already have. A node that silently withholds while claiming a complete corpus
would be misrepresenting itself to its own readers, which argues for the
withholding being visible (see G) rather than silent.

**This is the option most likely to be confused with the next one, and the
distinction is the most important in this memo.** A mirror operator served with
an order needs a *local* control. Only a *network-wide* list requires a new
authority — and only a network-wide list is a censorship lever.

### C. A network-wide, separately-signed suppression list

**How it works.** A signed list of document ids, distributed out of band from
releases, which nodes honour by refusing to serve the ids named. The release
itself stays intact and verifiable; suppression becomes a serving policy rather
than a corpus edit. This is the option GOVERNANCE.md names as "the obvious
design", and correctly records as neither built nor designed.

**What it costs.** Everything a second trust root costs: a key, custody
arrangements that survive the person holding them, a membership question, a
threshold question, and its own append-only log — because a suppression channel
without a public record is an unlogged edit channel. It also raises a scheduling
problem with no good answer. If suppression requires quorum it is
capture-resistant and slow; orders have deadlines. If it does not require
quorum it is fast and it is a single point of authority, which is the thing
`threshold >= 2` exists to prevent.

**How it is abused.** This is the censorship lever, and it should be described
without softening. Whoever holds the suppression key decides what the law says.
The list is add-only by nature, and additions are cheap, unreviewable at speed,
and — if not published — invisible. A powerful litigant does not need to alter
a judgment if they can have it withheld.

There is a further problem specific to publishing the list, and it does not
have a clean answer. Making suppression **visible** — a tombstone reading "id X
withheld on the order of court Y, dated Z" — is what makes the mechanism
auditable rather than a silent memory hole. But the existence and terms of an
order are themselves sometimes confidential. **A mechanism that publicly logs
suppressions cannot comply with an order that suppresses the existence of the
order; a mechanism that suppresses silently is a censorship lever with no
audit.** Both halves of that are true simultaneously. This memo does not resolve
it and does not believe it is resolvable in software.

Two partial mitigations are worth knowing, because both are in production
elsewhere ([§4](#immutable-and-content-addressed-archives)). IPFS's public
denylist stores **hashed** identifiers, so the list does not itself republish
what it suppresses — a suppression list in the clear is otherwise a convenient
index of exactly what someone wanted hidden. And Software Heritage, having
reached the same conclusion this section does — "**such a list of objects can
easily be weaponized**" — publishes only the *category* of reason ("copyright
violation", "harmful content") and never the request itself. Neither mitigation
touches the confidential-order problem. Both are worth copying if this is ever
built.

### D. Per-judgment redaction or replacement

**How it works.** It does not, and the reason is worth being precise about,
because "it breaks content addressing" understates it.

There are exactly two ways to redact. Change the text, and the id changes — so
it is a *new document*, the old one is still in every copy of the old release,
and nothing has been retracted. Or keep the id and change the text, in which
case `verify_id()` fails on every node that checks, and the corpus has been
corrupted rather than corrected.

**Retroactive redaction is therefore not expensive; it is incoherent within this
design.** The only coherent form is forward-only: the next release carries the
anonymised text. Which is option A, described accurately.

**How it is abused.** A redaction channel is a text-alteration channel. Molao's
headline adversary wants "one judgment altered". A mechanism that alters
judgment text under an existing id is that adversary's objective, implemented,
signed, and shipped as a feature. **No version of this should be built, under
any governance arrangement.** It is the one option in this memo the project can
close now without consulting anybody, because closing it costs nothing that any
legitimate order actually requires — anonymisation works forward.

### E. Jurisdictional scoping

**How it works.** Withholding entries carry a jurisdiction; a node serves what
is lawful where it runs. A mirror in one country honours that country's orders;
a node elsewhere does not.

**What it costs.** It mirrors how the orders actually work, which is its main
attraction: an order binds persons subject to a jurisdiction, not the world, and
this lets one operator comply without deciding for every reader everywhere. The
cost is that it produces, deliberately, the thing the threat model is built to
prevent — **different readers seeing different corpora.** That is split view,
chosen on purpose. It is only tolerable if it is loud: a node must be able to
say "N documents are withheld here under policy P" so a reader knows the corpus
is incomplete rather than silently differing from a colleague's.

This is not speculative. Software Heritage publishes exactly this policy for its
mirrors: removals from the main archive "are not to be automatically removed
from any mirrors", and mirror operators "are responsible for reviewing the
reasons of removals and decide if they should be propagated" — precisely because
a takedown may not be applicable in the mirror's jurisdiction
([§4](#immutable-and-content-addressed-archives)).

**How it is abused.** A node's jurisdiction is self-declared and trivially
misdeclared. More seriously, the mechanism is a ready-made compliance surface: a
state that wishes to impose a broad withholding list on nodes in its territory
finds the plumbing already installed. Its virtue is that it localises damage
rather than globalising it; its vice is that it makes local damage easy.

### F. Acquisition-side controls, extended to build time

**How it works.** Today `robots.txt` is honoured at fetch. The extension is to
re-check a source's `robots.txt` when a release is *built*, and to decline to
carry forward a held document whose source now `Disallow`s it. Suppression then
propagates through a channel LIIs already operate, using a signal they already
publish, with no new key and no new authority anywhere.

**What it costs.** Reproducibility, unless handled carefully: an attestor's duty
is to rebuild a release and get the same roots, and a build that consults the
live network is not reproducible. The fix is to pin a dated snapshot of each
source's `robots.txt` as a build input, so every rebuilder sees the same signal.
Beyond that, coverage is partial — it works for sources that express suppression
through `robots.txt`, which LIIs do and courts frequently do not, and it does
nothing for material taken court-direct. And it remains forward-only: it changes
what the next release carries, never what the last one did.

Its efficacy also depends on a signal that is less reliable than it looks.
[§4](#the-mechanism-they-all-rely-on-and-its-verified-failure) records that the
LII world's whole suppression practice rests on robots directives, that Google's
own documentation says `Disallow` "is not a mechanism for keeping a web page out
of Google", and that at least one LII's case-law exclusion has silently
disappeared from its live file. An option built on `robots.txt` inherits all of
that. Whether a per-judgment `Disallow` reliably appears for every suppression
is the single question that decides whether this option is worth anything, and
only an LII can answer it (§6.5).

**How it is abused.** Whoever controls a source host gains influence over the
corpus's future contents — including an attacker who compromises DNS or the
host itself, which the pinned-snapshot approach makes visible but does not
prevent. Against that: **it moves no authority to anyone who does not already
have it.** The source institution can already suppress a document for its own
readers. This lets it do the same thing for Molao's, and grants no new power to
Molao, to the signer set, or to any third party. Of every option here, this has
the best abuse profile.

### G. Notices without removal

**How it works.** A signed, append-only notices channel records that a document
is subject to a restriction — a reporting restriction, an anonymity order, a
publication ban — and nodes display the notice alongside the judgment. Nothing
is removed, withheld or altered.

**What it costs.** Little, and it serves the reader directly. A lawyer who must
not repeat a name is better served by being told so than by the case quietly
vanishing. It plainly cannot satisfy an order to remove a document; whether it
addresses any obligation at all is for counsel, not for this memo.

It has good precedent. CourtListener, complying with an order to redact,
"generally anonymize[s] or redact[s] cases... **and plac[es] a note at the top of
the document explaining the change**". The ECtHR in *Węgrzynowski* treated an
appended note as the appropriate remedy for an archived article already found
defamatory, in preference to removal. An enforcing IPFS gateway returns **410
Gone rather than 404** — telling the reader the material is withheld rather than
pretending it never existed. All three are the same instinct: a visible absence
is better than an invisible one
([§4](#what-courts-have-actually-ordered)).

**How it is abused.** It is additive, and additive channels cannot make things
disappear — the worst outcome is a false notice, which is visible and
correctable, rather than an invisible absence. That is a categorically better
failure mode than C. It is not risk-free: a false or over-broad "this case is
subject to a restriction" notice would chill citation of a case without
removing it, which is soft suppression achieved through accurate-looking
metadata. Append-only publication and attributable signatures are what keep that
correctable.

### Summary

| Option | Retracts a published copy? | New authority needed | Worst abuse |
|---|---|---|---|
| A. Do nothing | No | None | None; no remedy either |
| B. Local withholding | No | None | One node misrepresents its corpus |
| C. Network-wide signed list | No (withholds) | **A second trust root** | Silent, authorised disappearance |
| D. Redaction | No — incoherent | n/a | Altering what the law says |
| E. Jurisdictional scoping | No | Shared policy source | Ready-made state compliance surface |
| F. Build-time source re-check | No | None | Source-host compromise |
| G. Notices | No | Notice issuer | Chilling by false restriction notice |

**Nothing in the first column says yes.** No option here retracts a copy that
has already been distributed, because none can. Every mechanism above changes
what is served next, and the honest way to present this list to an LII is as a
choice about *how far forward* compliance reaches, not whether it reaches
backwards.

---

## 3. The tension, not minimised

Every mechanism that lets a court remove a judgment lets a well-funded litigant
try to. This is not a caveat on the design space; it is the shape of it.

**The software cannot tell the two apart.** A valid order and an invalid demand
arrive identically: as an authenticated request from a party asserting standing.
Distinguishing them requires reading the order, knowing the law, and being
willing to refuse — none of which is a property of code. **Any suppression
mechanism's safety rests entirely on the judgment of whoever holds the key.**
That is the same honest limit GOVERNANCE.md already states about quorum
collusion, and it applies here with more force, because a suppression key is
used alone and quickly while a signing key is used jointly and slowly.

**Suppression is the one operation with no recomputation defence.** This follows
from an argument the project has already made in a different context.
[THREAT-MODEL.md](THREAT-MODEL.md) rules embeddings out of releases because "a
tampered index leaves every judgment byte-perfect and simply never returns the
one case that would have lost you the argument. There is no hash to compare, no
witness to disagree, and no user-visible symptom." A suppression list is
functionally that attack, authorised and signed. A forged release is caught by
attestors rebuilding and disagreeing. A suppressed document produces no
disagreement, because nothing was altered — the case is simply not there, and
detecting its absence requires knowing it should have been present, which is
precisely what the reader came to find out.

Two consequences follow directly.

**A suppression key would be worth more than a signing key.** A signing key
forges releases that independent rebuilders will contradict. A suppression key
makes a case invisible with no contradiction available. The most valuable key in
the system would be the one guarding the mechanism added for compliance.

**If a network-wide mechanism is ever built, append-only publication is not a
nice-to-have.** It is the only thing that restores detectability, because it
converts a silent absence into a public record of an absence. And, as §2C says,
that requirement collides head-on with orders whose existence is itself
confidential. This memo does not have an answer to that collision and does not
think one exists in software.

The threat model's headline adversary is "a silent, patient, well-funded
adversary with a specific interest in one case". A suppression list is a
single-case removal instrument. **It is not that this adversary might misuse the
mechanism; it is that the mechanism is a precise description of what the
adversary wants.** That does not settle the question — courts do issue orders
that ought to be obeyed, and people are genuinely harmed by their absence — but
it does mean the tension cannot be engineered away, only allocated to somebody
whose judgment is trusted. Deciding who that is is the whole problem, and it is
not a problem the project can solve by writing code first.

---

## 4. What comparable systems do

Claims below are marked **verified** where they rest on a primary or
near-primary source — the organisation's own published policy, a statute, or a
published judgment — and **unverified** otherwise. Doc claims are not evidence
and neither is recollection. Where a source was reachable only through a web
archive, that is stated, because it affects how much weight the claim carries.
Retrieval notes and the full list of what could not be established are at the
end of this section.

### The LII position: the database does not decide

**Verified.** Every free-access publisher examined routes the decision to the
court, and says so in public.

**AustLII** (Privacy Policy §B5, page dated 31 July 2003; read via the Internet
Archive, as the live host refuses automated requests) undertakes to "bring the
matter to the attention of the Court or Tribunal... and will obtain its advice
concerning whether the case is to be removed, is to be replaced by an
alternative version of the case (including an anonymised version in some
situations), or is to remain as it currently stands", adding that "In all
instances to date, AustLII has followed the advice provided by the Court or
Tribunal." Its §B1 disclaims editorial power outright: AustLII "does not and can
not censor" what public bodies provide. Its FAQ tells an applicant that the
complaint "is not an argument with AustLII, but with the nature of our legal
system itself", and directs them to the registrar.

**CanLII** (Privacy Policy ¶20, dated 22 November 2023; read via the Internet
Archive) is the sharpest: "Requests for withdrawal or redaction that are not
justified by relevant legislative provisions or a court order will be refused."

**CourtListener / Free Law Project** (Content Removal Policy, last modified 23
July 2026, fully reachable) runs two explicitly separate tracks. De-indexing is
granted fairly readily via robots meta tags and `X-Robots-Tag`. Removal is not:
"We will not remove any public document from our database without a court
order." Where an order requires redaction they "generally anonymize or redact
cases by replacing names with initials or black boxes, **and placing a note at
the top of the document explaining the change**." They also tell applicants the
truth about reach: "there may be other websites that have copies of it... we
have no control over any search engine".

The relevance to Molao is direct. **The established LII posture is that the
publisher is not the decider.** That is a good match for a signer set, which
should not want to become the body that decides what the law says — and it is an
argument for routing any future mechanism through the court or the source
institution rather than through the quorum.

**Verified negative, and worth knowing:** the *Declaration on Free Access to
Law* — the founding instrument of the Free Access to Law Movement, made in
Montreal in 2002 and amended through 2012 — says **nothing** about suppression,
takedown, removal, anonymisation or indexing. The tradition Molao is joining has
no shared written standard on this. There is nothing to inherit.

### The mechanism they all rely on, and its verified failure

This is the most consequential finding in this section, and it cuts against
Molao's own acquisition-side control.

**Verified.** The free-access world's suppression mechanism is not deletion. It
is search-engine exclusion. AustLII's Usage Policy (dated 30 October 2010)
states it "specifically blocks all spiders and other automated agents from
accessing its case-law via the Robots Exclusion Standard", giving as a reason
"the need to allow compliance with take-down, anonymisation and other
modification requests from courts and parties". CanLII's policy says it "does
not permit its case law collections to be indexed by external search engines".
BAILII's says judgments "should not be accessible using search engines".

**Verified: the mechanism does not work as its users believe.** Google's own
documentation states that `Disallow` "is not a mechanism for keeping a web page
out of Google" and that rules other than `allow`, `disallow` and `user-agent` —
which includes the `Noindex:` directive BAILII's `robots.txt` relies on — "are
ignored by the robots.txt parser". Consistent with that, general web searches
restricted to these hosts return indexed judgments, including anonymised family
cases on BAILII. As at 31 July 2026, AustLII's live `robots.txt` no longer
contains the `/au/cases/` exclusion its published policy describes, and CanLII's
has permitted Googlebot and Bingbot to crawl case law since at least March 2024.

**BAILII states Molao's exact problem in its own words** (FAQ, verified): it is
sometimes necessary to remove a judgment, "for example if BAILII has been
provided with a copy of a judgment which discloses confidential information such
as the name of a child. **This is more difficult once the judgment has been
indexed by a search engine, and cannot be carried out promptly.**"

Two consequences for Molao, and the second is operational.

First, **the incumbent model does not achieve retraction either.** It achieves
reduced findability, imperfectly, through a channel it does not control. That is
context for the conversation with an LII, not a defence of Molao's position — a
mechanism that partly fails is not equivalent to no mechanism, and this memo
does not argue that it is.

Second, and more directly: Molao's only existing takedown control is that its
crawler honours `robots.txt`, including per-judgment `Disallow` lines. **The
AustLII observation shows that a hand-maintained `robots.txt` carrying takedown
lines can be silently replaced by a vendor-managed one that does not** — in that
case an AI-crawler boilerplate file served through a CDN. If Molao ever depends
on that signal for suppression, it depends on a file the source institution may
no longer fully control. This is worth putting to an LII as a question about
their own infrastructure (§6.5).

### What courts have actually ordered

**Verified, and consistently:** courts confronted with already-published
material have repeatedly required **de-indexing or anonymisation rather than
permanent removal**.

- ***Biancardi v Italy***, no. 77419/16 (ECtHR, 25 November 2021) — the
  official headnote records an "Obligation to de-index material applicable not
  only to Internet search engine providers but also to administrators of
  newspaper or journalistic archives... **No requirement to permanently remove
  article from Internet or to anonymise it**". §59 draws "a clear distinction"
  between de-listing and "the permanent removal or erasure" of published
  articles.
- ***Węgrzynowski and Smolczewski v Poland***, no. 33846/07 (16 July 2013) §65:
  "**it is not the role of judicial authorities to engage in rewriting history
  by ordering the removal from the public domain of all traces of
  publications**" — said of an article already adjudged defamatory. The
  preferred remedy was a note appended to the archive.
- ***Hurbain v Belgium*** [GC], no. 57292/16 (4 July 2023): the domestic measure
  was replacing a name with the letter X in an online archive, and the ECtHR
  observed that anonymisation "was less detrimental to freedom of expression
  than the removal of an entire article". The Liège Court of Appeal expressly
  noted that "**the paper archives remained intact**".
- ***Google Spain***, C-131/12 (CJEU, 13 May 2014): the obligation was imposed
  on the **search engine operator alone**, expressly "in a case where that name
  or information is not erased beforehand or simultaneously from those web
  pages, and even... when its publication in itself on those pages is lawful".
  It is frequently misdescribed as requiring the publisher to delete; it did not,
  and that question was not referred. ***Google v CNIL***, C-507/17 (2019),
  confines de-referencing to EU versions rather than globally.

**Verified: no case was found in which a court ordered a legal database to
delete rather than de-index.** The nearest thing, *A.T. v Globe24h.com*, 2017 FC
114, is distinguishable on its face: the respondent bulk-copied CanLII,
deliberately configured the copies to be search-indexed, and charged fees to
remove people's information. The same judgment commends the no-indexing practice
of the real databases, recording at ¶76 that "the Federal Court has taken such
measures to prevent our decisions from being indexed."

This is a search that found nothing, not a proof that nothing exists, and it
says nothing about what any court would do tomorrow or in any particular
jurisdiction. **It is not a basis for reassurance and is not offered as one.**

**Verified, on the underlying impossibility, from US appellate courts:**
*In re Copley Press, Inc.*, 518 F.3d 1022, 1025 (9th Cir. 2008) — "Secrecy is a
one-way street: **Once information is published, it cannot be made secret
again.**" *Gambale v. Deutsche Bank AG*, 377 F.3d 133 (2d Cir. 2004) — "We
simply do not have the power... to make what has thus become public private
again... The genie is out of the bottle... We have not the means to put the
genie back."

**Verified, and directly relevant to mirror operators:** in *Allen v. Chanel,
Inc.* (S.D.N.Y. 2020), a sealing order was followed by an order requiring seven
search engines and thirteen publishers to remove all content relating to the
case. Per Free Law Project's own filing, "**none of the affected search engines
or publishers were parties to this case, nor did they receive notice or an
opportunity to be heard until after the issuance of the Removal Order.**" The
case was unsealed and the order vacated in December 2020. A Molao mirror
operator should understand that being ordered without first being heard is a
thing that has actually happened to publishers in this position.

**Verified, on scope:** suppression orders, reporting restrictions, publication
bans and sealing orders are real and distinct instruments, and they ordinarily
operate against persons amenable to the court. NSW's *Court Suppression and
Non-publication Orders Act 2010* s 11 is explicit that an order "applies **only**
to the disclosure or publication of information in a place where the order
applies, as specified in the order", and may be made to apply anywhere in the
Commonwealth — with Australia, not the world, as the outer bound contemplated.
**Important qualification:** orders *contra mundum* exist. UK Judicial College
guidance describes the *Venables* jurisdiction as granting injunctions "against
the world", while recording that its exercise is "rare and exceptional". The
defensible statement is that the routine order binds persons within a
jurisdiction; the exceptional one does not.

### Print reports and official publishers

**Verified.** ICLR, in its published response to the Transparency and Open
Justice Board consultation (10 March 2025), records "**practical limits on the
extent to which versions, once distributed, can be re-treated**", and that "it
is an almost weekly occurrence for the ICLR to receive an email from The
National Archives requesting that we 'take down' a judgment which has already
been published, or to update a judgment because of reporting restrictions,
insufficient anonymity of certain parties, or for some other reason." Note the
frequency: this is not an edge case for a law reporter either. Note also the
scope — that passage is about digital publication under an open licence, not
bound volumes.

**Verified.** The National Archives' *Find Case Law* publishing policy states
"Once we have published a judgment or decision, we will only remove it if the
court or tribunal tells us to", that its usual take-down and reclosure policy
does not apply, and — architecturally interesting — "**We keep the digital
record of each version, but we only publish the latest version the court has
approved.**" That is a versioned store with suppressed history: retention plus
serve-time selection, which is structurally the rule §2 arrives at.

**Could not verify — and this qualifies an argument GOVERNANCE.md makes.**
[GOVERNANCE.md](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md) observes that forward-only compliance "is the
same property a printed law report has". No published policy, practice note or
account was found, from ICLR or any other reporter series, describing what
happens when a judgment already printed in a bound volume becomes subject to a
later restriction. No errata-slip tradition, withdrawal notice, replacement
volume or recall procedure could be documented. The proposition is intuitively
sound and one court has reasoned from it — the Liège Court of Appeal in
*Hurbain* treated the intact paper archive as simply beyond the remedy's reach —
but **the print analogy is unverified as a matter of publishing practice and
should be presented as an observation, not as an established comparator.**

### Immutable and content-addressed archives

This is the closest technical family, and one member has worked the problem
through in public and reached conclusions that match §2 and §3 almost exactly.

**Software Heritage** — a Merkle-DAG archive, the nearest structural analogue to
Molao. **Verified**, from its content and mirror policies:

- On erasure: "**we cannot alter or delete data in the software development
  history**, as version control systems like Git are designed to maintain an
  immutable record."
- On what removal means: "For online mirrors, data removed from the main archive
  should be made **inaccessible, but not deleted**, as soon as possible." This
  is independently the rule §2 derives from Molao's verification behaviour.
- On propagation: "**Data removed from the main Software Heritage archive is not
  to be automatically removed from any mirrors.** Mirror operators are
  responsible for reviewing the reasons of removals and decide if they should be
  propagated" — because a takedown may not be "applicable to the mirror
  jurisdiction". That is §2E, as published policy.
- On the list itself: a feed of removed objects is needed, but "**such a list of
  objects can easily be weaponized**", therefore "we should assume that such
  information is already public", and Software Heritage "will not relay the
  request itself... but only the reasons for which the organization deemed the
  request legitimate ('copyright violation', 'harmful content', etc.)".
- Status: "The necessary tooling to implement this policy is not yet available."

**IPFS "bad bits"** — **verified.** A denylist of **hashed** CIDs, so the list
does not itself republish the identifiers it suppresses. It is explicitly
opt-in — its "purpose... is to allow IPFS node operators to opt into *not*
hosting previously flagged content" — applies to the public gateways and "does
not apply to *all* IPFS nodes, nor to the IPFS network as a whole", and is
administered by a takedown team at Protocol Labs. An enforcing gateway returns
**HTTP 410 Gone rather than 404**: the reader is told the content is withheld,
not that it never existed. Two transferable design points — hash the entries,
and signal withholding rather than absence.

**Debian** — **verified**, and the strongest working precedent found for
purging an immutable layer under legal compulsion. `snapshot.debian.org` retains
every package ever shipped, and maintains a short public removal log: roughly
two dozen entries over twenty years, each dated and reasoned, e.g. "2011-01-17 —
dropbox - unredistributable / Removed from ftp.debian.org due to license issues",
"2015-04-17 — webkitgtk - unredistributable / non-free images in packages". The
pattern is: preserve by default, purge only for a narrow legal category, and
publish a permanent itemised reasoned record of every purge.

**Certificate Transparency** — **verified.** Deletion is not an available
operation: "Certificates can only be added to a log, not deleted, modified, or
retroactively inserted." The remedy lives elsewhere, in revocation and in
client-side blocklists (Chrome's CRLSets, Mozilla's OneCRL). Note the governance
smell that Molao should avoid: CRLSets are acknowledged to cover only "a subset"
of revocations and "the process by which they are generated is not" public. Even
a misbehaving log is retired or made read-only, never purged.

**Zenodo** — **verified, and it is not the clean precedent it is often taken
for.** Its policy does provide a tombstone: a withdrawn object is replaced by a
tombstone page giving the reason, and "The DOI and the URL of the original
object are retained", withdrawal being "an exceptional action". But the same
policy states elsewhere that records "can be retracted from public view;
**however, the data files and record are preserved**". The two passages are in
tension, and on their face the tombstone hides rather than destroys. **Dataverse**
is similar and clearer: deaccession leaves a tombstone with citation metadata,
and "Users will not be able to see any of the files" — silent on whether the
bytes are destroyed.

### What could not be verified

Stated because unverified claims presented as facts are exactly what this
project says it will not do.

- **Print-report suppression practice** — errata, withdrawal notices,
  replacement volumes or recall, from ICLR, West's National Reporter System, or
  Canadian or Australian reporter series. Nothing found. This appears not to be
  on the open web; establishing it would mean asking a publisher or a
  print-collection law librarian.
- **Whether CanLII applies page-level `noindex`** despite permitting Googlebot
  in `robots.txt` — its decision pages block automated inspection, so the
  headers could not be read. The apparent contradiction with its published
  policy is therefore unexplained, and should not be characterised either way.
- **Why AustLII's live `robots.txt` no longer excludes case law.** Observed
  twice on 31 July 2026. It is possible a different file is served to verified
  crawlers. The cause is unknown.
- **Any published US judiciary guidance** — Administrative Office, Judicial
  Conference or Federal Judicial Center — stating that post-hoc sealing cannot
  undo distribution. It does not appear to exist; the proposition rests on case
  law (above), not on administrative guidance.
- **Internet Archive's position on court orders**, and any general
  discontinuation of `robots.txt` compliance. The 2017 change is verified only
  for US government and military sites, described as something the Archive was
  "looking to do this more broadly".
- **Harvard Dataverse's own preservation policy**, and Fedora's position on
  legally-compelled removal — hosts blocked automated retrieval.
- **Whether Debian removals propagate to third-party mirrors.**
- **Any documented request to delete a Certificate Transparency log entry**, and
  the GDPR-versus-CT tension generally, which appears only in industry
  commentary.
- **CJEU C-199/24**, concerning a Swedish paid criminal-records database and
  reportedly decided around July 2026. News reports only; the judgment text
  could not be obtained. Not relied on anywhere above.

**Retrieval caveat.** AustLII's, CanLII's and BAILII's policy pages, and several
others, are behind anti-bot protection and were read through the Internet
Archive. The text is authentic but the retrieval is not canonical. **Anything
in this section that would be relied on in a conversation with an institution
should be re-checked against the live page first**, particularly the
observations about current `robots.txt` contents, which are time-sensitive by
nature and were true on 31 July 2026.

---

## 5. Recommendation

**Build nothing yet.** Not because the problem is small — §1 and §3 argue it is
not — but because of sequence.

The project has no operational experience of suppression orders. LIIs have
decades of it. There is currently no public corpus, no signed release, no
quorum, and no signer set. To design the governance of the most dangerous
capability in the system *before* knowing which institutions hold keys, in which
jurisdictions, under what duties, and how often they actually receive these
orders, would be to invert the only sensible order of work. It would also
produce the familiar bad outcome where a mechanism exists, is therefore used,
and its governance is retrofitted around the fact of its existence.

Three things can be settled now, at no cost, because they foreclose the worst
designs rather than choose among the good ones:

1. **Withhold at serve time; never mutate or delete corpus bytes.** This is
   forced by the code as it stands, not a preference: mutation breaks
   `verify_id()` and deletion breaks `molao verify` step 6. Any future mechanism
   that ignores this trades away verifiability, which is the only thing Molao
   has that a website does not. The closest structural analogue reached the same
   rule independently: Software Heritage requires that data removed from its
   archive "should be made **inaccessible, but not deleted**" on its mirrors,
   and The National Archives' *Find Case Law* keeps "the digital record of each
   version" while publishing only the current one
   ([§4](#immutable-and-content-addressed-archives)).
2. **Never build redaction under an existing id** (§2D). Anonymisation works
   forward; retroactive text alteration is the headline adversary's objective
   with a compliance label on it. Closing this costs nothing.
3. **If a network-wide list is ever built, it is append-only and public, or it
   is not built.** With the honest rider that this rules it out for orders whose
   existence is confidential, and that is a real limit rather than a solved
   problem. Debian has run this pattern for twenty years — an immutable snapshot
   archive, purged only for a narrow legal category, with every purge recorded
   permanently and with its reason — and it is the best evidence available that
   the pattern is workable at all ([§4](#immutable-and-content-addressed-archives)).

Two options are worth exploring **with** an LII rather than in advance of one,
because they are the only ones whose failure modes do not include silent
disappearance: **F**, build-time re-validation against the source's own
`robots.txt`, pinned for reproducibility — which moves no authority to anyone
who does not already hold it; and **G**, a notices channel, which adds
information and never removes any. **B**, local operator-held withholding, is
the thing a mirror operator under an order will actually ask for, and it is
worth confirming with counsel that a local control is what such an order
contemplates before building even that.

**C is not recommended, and this memo's view is that it should not be built
until someone can answer §3.** That is not a permanent no. It is a statement
that the case for it has to be made by people with operational experience of
suppression orders, and that nobody involved in the project has that experience
today.

There is a further reason to hesitate, and it comes from the LIIs themselves.
Every free-access publisher examined in [§4](#the-lii-position-the-database-does-not-decide)
routes the decision to the court and says publicly that it does not decide:
AustLII obtains the court's advice and has always followed it, and CanLII
refuses any request not backed by legislation or a court order. A network-wide
suppression list would make the **signer set** the decider — a body with no
statutory role, no standing, and no process for hearing anyone. That is the
opposite of established practice in this field, and it would put the quorum in
exactly the position [GOVERNANCE.md](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md) says the project has no
standing to occupy: deciding what the law says.

The recommendation to an institution considering the signer set is therefore
narrow and specific: what Molao offers on takedown today is forward-only
compliance, described accurately in [GOVERNANCE.md](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md), and the
question of whether that is sufficient for your institution is one for your
counsel, to be asked before signing rather than after.

---

## 6. Questions for an LII

These are asked because the project does not know the answers and cannot work
them out from the outside. They are ordered by how much the answer would change
the design.

**On what actually happens**

1. How many suppression, anonymisation or removal requests do you handle in a
   year, and what proportion arrive *after* the judgment was first published?
   The whole weight of §1 rests on that proportion.
2. What do you actually do — delete the document, replace it with an anonymised
   version, de-index it while leaving it reachable, or leave it and add a
   warning? Roughly in what proportions?
3. **Has any order ever required you to pursue copies you had already
   distributed** — to mirrors, bulk licensees, subscribers, or search engines?
   What did you do, and was it accepted? This is the closest thing to Molao's
   exact position and the single most useful answer on this list.
4. Do your bulk licence terms today say anything about propagating a takedown
   downstream? If so, that is an existing, tested, contractual answer to a
   problem this memo has been treating as novel.

**On mechanism**

5. Would a per-judgment `robots.txt` `Disallow` reliably appear for every
   suppression, or is it applied inconsistently? Option F depends entirely on
   this and the project cannot verify it from outside.
6. Does an order typically name the document, the parties, or the fact of the
   proceeding? Can you act on a stable document identifier, or does
   identification require judgement each time?
7. Is the *existence* of an order ever itself confidential in your
   jurisdiction? If yes, §3's collision is live for you and not hypothetical.
8. Who inside the institution decides — librarian, counsel, director — and what
   turnaround do orders typically demand? A mechanism requiring quorum
   agreement across time zones may simply be too slow to be useful.

**On signing**

9. Given that a Molao signature attests only that you rebuilt a release and got
   the same hashes — and carries no opinion on the content
   ([GOVERNANCE.md](https://github.com/vul-os/molao/blob/main/GOVERNANCE.md)) — would signing a release containing a
   judgment you had suppressed create a problem for you? The project's
   characterisation of what a signature means is not binding on a court, and
   your counsel's reading of it matters more than ours.
10. If a network-wide suppression list existed, would your institution want to
    hold that key? And would it accept the corresponding duty — refusing
    requests that are not backed by an order you consider valid, including from
    parties with the resources to make refusal expensive?
11. Has a court ever ordered you to do something you believed was wrong, and
    what happened? Of everything on this list, the answer to this one tells the
    project most about whether a suppression lever is safe in anyone's hands.

---

## Status

Nothing in this document is implemented. There is no takedown, suppression or
redaction path in `crates/`, and this memo does not propose adding one now. The
facts asserted about the code — content-addressed ids, `corpus_root` and
`doc_count` recomputation, the failure of `molao verify` step 6 on a deleted
document, and the host-level acquisition denylists — were verified against the
source, not taken from documentation.
