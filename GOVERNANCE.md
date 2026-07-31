# Governance

Who decides what, and what stops them.

Molao is a commons. The governance question is not "who runs it" but "what
happens when someone with money or power wants one judgment to change". This
document is the answer.

## The honest framing

**No central server** is achievable, and Molao achieves it: a node holds a
corpus, works offline, and needs nothing from anyone.

**No central authority** is not achievable, and claiming it would be dishonest.
Somebody has to attest that a particular hash is the real judgment. Content
addressing proves bytes have not changed; it cannot prove the bytes were ever
the judgment. Someone must vouch for the link between the text and the world.

So the trust root is a **quorum of independent organisations plus a public
append-only log**, not a single operator. That is a real and large improvement
over one database with one administrator, and it is not the same thing as
trustlessness.

## Two things governed separately

**The software** is an ordinary open-source project. MIT licensed, pull
requests, maintainers. If you dislike a decision, fork it.

**The corpus** is not, because forking a corpus does not help a lawyer who needs
to know which one is real. The corpus is governed by the signer set.

## The signer set

A release is valid only when at least `threshold` distinct signers from the
signer set have signed its manifest. Enforced in code, in
`crates/molao-core/src/release.rs`:

- `threshold < 2` is **refused**, even when every signature is valid. A
  threshold of 1 is a single point of authority wearing a quorum's clothes.
- `threshold > signers.len()` is refused. It could never be met and would wedge
  the network.
- Duplicate keys in a set are refused. One party holding two keys would count
  twice toward its own quorum.
- One key counts once no matter how many times it signs.
- Signatures from keys outside the set are ignored, however valid.

`epoch` is bumped whenever membership changes, and a manifest names the set it
was signed under (`molao-release-v2` carries `SignerSet::fingerprint()`), so a
release and a roster that do not match each other say so instead of failing as
a baffling "0 valid signatures".

Read that precisely: it is a **consistency** check between a release and the
set you hold, **not an authority check**. It cannot tell you the set you hold
is the current one — only the append-only log could, and that is designed, not
built. The ceremony and tooling for actually changing membership do not exist
either; see below.

**No single party can publish a release, including the project that wrote this
code.** That is not a policy statement; it is what `verify()` does.

## Who should be an attestor

Attestors should be institutions with an independent reason to care about the
integrity of their jurisdiction's law, and no shared point of failure:

- university law faculties and their libraries
- law societies and bar councils
- legal-aid and public-interest litigation organisations
- LII-network members and archives

Criteria that matter more than prestige:

| Criterion | Why |
|---|---|
| Institutional independence | A quorum of one organisation's departments is one organisation |
| Jurisdictional spread | Attestors in one jurisdiction can be compelled together |
| Key custody that survives people | The commonest failure is the person with the key leaving |
| Willingness to refuse | An attestor that has never declined to sign is a rubber stamp |
| Capacity to rebuild | Signing a manifest you did not independently verify makes the quorum theatre |

That last one is the substantive obligation. An attestor is not lending a
signature; it is asserting that it rebuilt the release from the same inputs and
got the same roots.

## What signing attests, and what it does not

An institution's counsel will ask this before anyone signs anything, so it is
answered here directly rather than left to be inferred from the rest of this
document.

**What a signature attests:** that your institution independently rebuilt the
release — the same corpus, the same pinned `EXTRACTOR_VERSION` — and computed
the same `corpus_root` and `graph_root` the manifest claims
([RELEASES.md](docs/RELEASES.md)). That is a factual, checkable claim about
bytes matching bytes. It is the only claim the act of signing makes.

**What a signature does not attest:** that any judgment in the release is
correctly decided, current, good law, or applicable to any reader's facts. The
software repeats this constraint everywhere it can
(`docs/API.md`, `docs/THREAT-MODEL.md`, `docs/FAQ.md`) and the same limit binds
a signer: an attestor's signature endorses a hash, not a holding, and carries no
opinion about the law inside it.

**On liability beyond that:** this project cannot tell an institution what
signing exposes it to under its own jurisdiction's law, and it would be
overreach to try. That is a question for the institution's own counsel to
answer before joining the signer set — this section exists to make the
question precise and askable, not to answer it for you. What this project can
state is the scope of the thing being signed, above, and that the design
keeps that scope deliberately narrow: an attestor is one of several
independent parties vouching for a reproducible hash. It is not a sole
publisher, not an editor of the underlying judgments, and not a certifier of
their correctness.

## When a court orders a judgment removed

An LII will ask this first, because suppression is routine business for them
and not an edge case. **Molao does not have a complete answer, and the
incomplete one is stated here rather than discovered later.**

**At acquisition, this is handled only where suppression comes first.** The
crawler honours `robots.txt` including the **per-judgment `Disallow` lines LIIs
use for takedowns and privacy** ([docs/SOURCES.md](docs/SOURCES.md)). A judgment
an LII has suppressed at source before we collect it is not collected. **This is
not a retraction channel:** `robots.txt` is read at fetch time, suppression
usually follows publication, and nothing re-checks documents already held.

Two things make that channel weaker than it looks, both verified rather than
assumed:

- **It may not be under the source institution's control.** AustLII's
  `robots.txt` historically excluded its case-law directories for all agents; a
  live fetch on 31 July 2026 returned only a Cloudflare-managed file with
  `Allow: /` and no case-law exclusions at all. CanLII's own privacy policy says
  it prohibits external indexing of decisions, but its live `robots.txt` grants
  Googlebot `Allow: /` with no case-law directories excluded. A CDN can replace
  a hand-maintained file, and the institution may not know.
- **`robots.txt` was never an indexing control.** Google's own documentation
  states it "is not a mechanism for keeping a web page out of Google", and that
  directives other than `allow`, `disallow` and `user-agent` are ignored — so
  the `Noindex:` lines BAILII publishes have no effect. Judgments from LII sites
  that disallow crawling are findable in search results today.

**At publication, there is no mechanism at all.** No command removes a judgment
from a published release, and none could without breaking the property the
whole design rests on: a release is a content-addressed, immutable set of
documents whose manifest a quorum has signed and whose identity *is* the hash
of its contents.

**So the honest position is: Molao can stop distributing a judgment; it cannot
un-distribute one.** Deletion is not merely unsupported — it is *detected*.
`molao verify` step 6 reads every judgment the corpus lists, so a removed one
surfaces as "listed but cannot be read" and the release fails verification.
Compliance-by-deletion and verifiability cannot both hold as the system is
built. A subsequent release omits it, and that release is the one
nodes fetch. Anyone already holding the earlier release keeps a complete,
still-verifiable copy. Compliance is forward-looking — it changes what is
published next, not what was published before.

A printed law report has a comparable property — once volumes are on shelves, a
later order governs what the next volume prints. **That parallel is offered as
context and is not a legal argument, and its premise is unverified:** a search
for any published policy on withdrawing, recalling or issuing errata for a bound
volume found none, from any reporter series. Do not lean on it. What *is*
documented is narrower and comes from the European Court of Human Rights in
*Hurbain v Belgium* (2023), where the domestic court required an online archive
to be anonymised while noting the paper archives remained intact.

What the surveyed authority does show is that **courts have consistently
required de-indexing or anonymisation rather than deletion** — *Google Spain*
imposed the obligation on the search engine while expressly declining to reach
the publisher; *Węgrzynowski* held it "is not the role of judicial authorities to
engage in rewriting history"; *Biancardi* imposed de-indexing and not removal.
**No case was located of a court ordering a legal database to delete.** The one
documented attempt against a database — a US sealing order naming Free Law
Project in 2020 — was resisted and the court unsealed. "No authority located" is
not "no such authority exists", and none of this is advice about any particular
order.

**What is genuinely unresolved, and is the largest open governance question in
the project:** the obvious design — a separately-signed suppression list,
distributed out of band from the release, that nodes honour by refusing to
serve named ids — is **neither built nor designed**. It has now been surveyed rather than merely
left undesigned — [docs/TAKEDOWN.md](docs/TAKEDOWN.md) sets out the design
space, why a signed network-wide suppression list is recommended against, and
three constraints worth adopting now at no cost. Its recommendation is to settle
this *with* an LII rather than before one, because suppression is routine work
for them and not for this project. It also cuts against the
censorship-resistance the rest of the document claims, and reconciling those
two is real work nobody has done. Raising it is welcome; it will not be
hand-waved.

## Data protection

Judgments are public records of public proceedings, and most jurisdictions
treat them accordingly. That does not dispose of the question.

- A judgment contains personal data about real people — parties, witnesses,
  minors, complainants. Some jurisdictions grant erasure rights that do not
  stop at "it was already public". Against an immutable corpus the answer is
  the forward-only one above, with the same caveat: whether that suffices is
  for an institution's counsel, and POPIA and the GDPR are the two most likely
  to be raised first.
- **A signer set is public by design.** Institution names and public keys are
  published, and the append-only log (designed, not built) would publish
  signing activity over time. An institution should expect its participation to
  be permanent, attributable and public — that is the point of it, and it is
  not something the project could quietly walk back later.

## Key compromise, rotation and loss

**Not built, and the gap is wider than tooling.** A `Signer` is `{name, key}`
and nothing else — no contact, no jurisdiction, no validity dates — so there is
no in-band way to bind a key to the institution it belongs to, or to say when
it was valid.

There is no rotation ceremony, no defined response to a compromised key, and no
stated position on the status of signatures that key already made.

What *does* exist: a manifest now names the signer set it was signed under
(`molao-release-v2` carries `SignerSet::fingerprint()`), so signatures can at
least be scoped to the roster in force at the time rather than floating free.
That is a consistency check, not an authority check — it can report a roster
mismatch, but it cannot tell a reader that the set they hold is the current
one. Only the append-only log could do that, and it is designed, not built.

## Compulsion

Jurisdictional spread is a signer-set criterion precisely so that no single
legal system can compel the whole quorum. The protection is structural: with
`threshold >= 2` enforced in code and one signer one vote, **compelling a
single signer does not produce a valid release.**

What is *not* stated anywhere is what a signer should do when ordered to sign,
or to surrender a key. There is no canary, no defined disclosure practice, and
no agreed expectation that a compelled signer will tell the others where
permitted to. An institution that considers this a live risk in its
jurisdiction should raise it before joining rather than assume a practice
exists.

## What you would be dealing with

There is **no legal entity and no instrument.** Counsel's natural first
question — "who are we contracting with?" — answers to: a public repository
under MIT OR Apache-2.0, and whichever other institutions hold keys. There is
no incorporated body, no foundation, no membership agreement, and nothing to
countersign.

That is defensible for a commons at this stage, and it may not survive contact
with an institution's own procurement or risk process. It is stated here so it
is negotiated deliberately rather than discovered halfway through an approval
chain.

## Review window and deadlock

**Not defined.** How long a signer has to examine a release before signing, and
what happens when a quorum splits and cannot reach its threshold, are both
open. Today the answer is "whatever the signers agree at the time", which is
workable among two or three institutions that know each other and will not
scale past that.

## Changing membership

Adding or removing an attestor changes the signer set, which is itself an act
requiring quorum approval and an epoch bump. A set that could be changed by one
party would make the threshold meaningless, because the way to defeat a 3-of-5
quorum is to become the person who decides who the five are.

Removal must be possible: keys are lost, organisations dissolve, and an
institution that has stopped rebuilding should stop signing.

**Status:** the membership-change process is **designed, not built**. The data
model supports epochs; the ceremony, its documentation, and the tooling do not
exist yet. Getting this right is a prerequisite for the first real release and
it is honest to say it is unfinished.

## The public log

Quorum signing stops one party publishing alone. It does not by itself stop a
quorum from rewriting history quietly, or from showing different corpora to
different readers.

Two mechanisms address that:

- **Release chaining**, implemented: each manifest names its predecessor's
  hash, so a fork is detectable against any known head.
- **A public append-only log**, **designed, not built**: an independent record
  of every published manifest, monitored by parties who are not signers. With
  it, silently rewriting history requires colluding with a quorum *and* evading
  every monitor.

Until the log exists, split-view detection is manual: compare your head against
another node's.

## Treatment attestations

Treatment — whether a case was followed, distinguished, or overruled — is
interpretation, not extraction. It cannot be verified by recomputation, and it
is the place where governance and product design meet most sharply.

The design, which is **not built**:

- treatment is a **signed attestation**, attributable to whoever made it
- attestations **may conflict**, and conflicts are **shown, not resolved**
- the mechanical citation edge remains separate and verifiable underneath

A system that silently picks a winner between two competent scholars who read
the same judgments differently is lying about how law works. Showing the
disagreement is less tidy and more honest, and it keeps the project out of the
business of deciding what the law means, which it has no standing to do.

## Contribution decisions

Ordinary code and documentation changes go through pull requests and
maintainers. Some decisions are not the maintainers' to make:

| Decision | Who |
|---|---|
| Code and docs | Maintainers, by pull request |
| Court and series registry entries | Maintainers, with an `EXTRACTOR_VERSION` bump where behaviour changes |
| What enters a release | The quorum, by signing |
| Signer set membership | The quorum, with an epoch bump |
| Sourcing ethics ([docs/SOURCES.md](docs/SOURCES.md)) | Maintainers, and it is a floor rather than a default — the ethical position is not up for optimisation |

## Saying yes

There is no formal onboarding ceremony yet — the membership-change process is
**designed, not built**, as stated above, and pretending otherwise here would
undo the honesty the rest of this document relies on. What exists today is the
real first step: open an issue at
[github.com/vul-os/molao](https://github.com/vul-os/molao) naming your
institution and which role you are considering. [docs/RUNNING-A-NODE.md](docs/RUNNING-A-NODE.md)
sets out what each role — Mirror, Witness, Builder, Attestor — actually costs,
and an institution can hold more than one without holding more than one
attestor key.

An attestor conversation additionally needs answers to two questions, and
having them ready is more useful at this stage than a decision:

1. **Who inside the institution can commit to key custody that survives one
   person leaving?** The commonest failure mode named above is the person with
   the key moving on.
2. **Can the institution genuinely rebuild a release**, independently, rather
   than trust one handed to it? Signing without rebuilding is the thing
   [Who should be an attestor](#who-should-be-an-attestor) calls "quorum
   theatre."

The first quorum has not been assembled yet. How it gets assembled — which
institutions, how many, from how many jurisdictions — is being worked out in
the open, not decided in advance by this project.

## Commitments

These do not change without changing what Molao is:

1. No hosted service, no account, no telemetry, no billing. Ever.
2. `threshold >= 2`, enforced in code.
3. Nothing enters a release that cannot be verified by recomputation.
4. A node works fully offline.
5. Unresolved citations are shown as written, never hidden.
6. The software never claims a judgment is verified law.

## Part of VulOS

Molao is part of [VulOS](https://vulos.org), which is free, open-source
software — all of it, with no paid Vulos services. Distribution runs over
content-addressed transports you already control — a plain HTTP mirror today,
with a torrent export and an optional, feature-gated peer-to-peer transport
described in [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) — and backup storage
is your own bucket. No reachability broker is required for a node to
function; Ephor is not part of Molao's default path and, as of 2026-07-30, is
not itself ready for that role. **Molao bills nothing, hosts nothing, and has
no paid tier.** It runs standalone and can also be hosted as an app by the
Vulos OS. Nothing about the VulOS relationship gives any party — including
VulOS — a vote in the signer set.
