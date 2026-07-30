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

`epoch` is bumped whenever membership changes, so a node can tell an older set
from a newer one rather than guessing.

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
([RELEASES.md](releases.md)). That is a factual, checkable claim about
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
| Sourcing ethics ([docs/SOURCES.md](sources.md)) | Maintainers, and it is a floor rather than a default — the ethical position is not up for optimisation |

## Saying yes

There is no formal onboarding ceremony yet — the membership-change process is
**designed, not built**, as stated above, and pretending otherwise here would
undo the honesty the rest of this document relies on. What exists today is the
real first step: open an issue at
[github.com/vul-os/molao](https://github.com/vul-os/molao) naming your
institution and which role you are considering. [docs/RUNNING-A-NODE.md](running-a-node.md)
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
described in [docs/DISTRIBUTION.md](distribution.md) — and backup storage
is your own bucket. No reachability broker is required for a node to
function; Ephor is not part of Molao's default path and, as of 2026-07-30, is
not itself ready for that role. **Molao bills nothing, hosts nothing, and has
no paid tier.** It runs standalone and can also be hosted as an app by the
Vulos OS. Nothing about the VulOS relationship gives any party — including
VulOS — a vote in the signer set.
