# Molao Paperwork Templates

Molao is a free, open-source, decentralised commons of case law (part of VulOS;
https://github.com/vul-os/molao). It builds a corpus of judgments and a citation
graph, with a local retrieval-augmented-generation (RAG) index for legal research.
It is non-commercial and honours sources' `robots.txt` and content-signals.
Judgments are public documents; the project sources them from courts/official
publishers directly or under licence, never by scraping sites that decline it.

This directory holds fill-in-the-blank templates for the letters a human has to
send on Molao's behalf. They come in **two kinds, which must not be confused**:

1. **The governance ask** — will your institution hold one of the signing keys
   that authorise a release. Two templates.
2. **Corpus-licensing asks** — may we source judgments from you, and on what
   terms. Four templates.

**The governance ask is the critical path.** The corpus letters unblock
*content*: each one that succeeds adds a jurisdiction. The governance letter
unblocks the project existing at all, because
`crates/molao-core/src/release.rs:52` refuses any release whose signing
threshold is below 2, even when every signature present is valid. Until at
least two independent organisations each hold a key, **Molao cannot publish a
release — not a small one, not a provisional one, not any.** Every licensed
corpus in the world would not change that.

The two categories also fail differently. A corpus request that gets a no costs
you that source. A governance request sent to the wrong institution, or sent as
a data request to an institution that has publicly declined to supply data,
costs you the relationship permanently — see the warning at the top of
[`signer-invitation-lii.md`](./signer-invitation-lii.md).

**Every template contains `[PLACEHOLDERS IN BRACKETS]` that must be filled in
before sending, and marks anything uncertain as `[VERIFY: ...]`.** These are
drafts to adapt, not finished letters, and **not legal advice** — have someone
competent (ideally with local legal knowledge) review before sending, especially
for the licence applications.

**Filing these is a human action.** The Molao software does not, and will not,
submit applications, sign licences, or make representations on anyone's behalf.
A person operating a node must read, adapt, sign, and send each of these
themselves, and is responsible for complying with whatever terms come back.

## 1. The governance ask — hold a signing key

Same request, two readers. Neither letter asks for data, and both say so
explicitly and early, because the reflex answer to a stranger writing about
case law is "we don't supply bulk data".

| Recipient | Template | Notes |
|---|---|---|
| An LII — SAFLII, AfricanLII, BAILII, AustLII, NZLII, CanLII, and the wider Free Access to Law Movement network | [`signer-invitation-lii.md`](./signer-invitation-lii.md) | The most credible possible signers and the **worst possible corpus targets** — they are 🔴 in [`docs/SOURCE-MAP.md`](../docs/SOURCE-MAP.md) and have declined bulk or AI use publicly. Approach them about governance and citation resolution only. |
| A law faculty, law library, or bar council / law society | [`signer-invitation-academic.md`](./signer-invitation-academic.md) | Different motivations (research, preservation, access to justice) and a different approval path (dean and university counsel; library director; council resolution). Carries a routing table for the three. |

Both letters answer, in the recipient's own terms: what a signature attests to
(that the bytes are what the manifest says) and what it does not (anything at
all about whether the judgment is good law); what it costs in money,
infrastructure, and staff time; how an institution leaves; how the signer set
changes; and why the founder cannot simply publish the corpus alone.

Both also state plainly what does not exist yet — no public corpus, no signed
release, an empty signer set, no key-generation or signing tooling, no
end-to-end rebuild command, no external audit. **Do not soften that section
when you adapt a letter.** For this audience a checkable overstatement is
fatal, and every one of those absences is checkable from the repository in
about five minutes.

Neither letter asks anyone to sign anything today, because with the shipped
software nobody could: signing tooling does not exist. The ask is a
conversation and an in-principle indication, with the commitment deferred until
there is a documented ceremony for an institution's people to review.

## 2. Corpus-licensing asks — which template for which source

| Source | Template | Notes |
|---|---|---|
| UK — The National Archives "Find Case Law" (England & Wales, UK tribunals) | [`uk-tna-find-case-law-computational-licence.md`](./uk-tna-find-case-law-computational-licence.md) | Separate, free computational-analysis licence required on top of Open Justice Licence v2.0. |
| AfricanLII / Laws.Africa network jurisdictions | [`laws-africa-bulk-licence-request.md`](./laws-africa-bulk-licence-request.md) | Default licence is CC-BY-NC-SA; AI/RAG use needs explicit confirmation. |
| Australia — High Court, Federal Court, NSW Caselaw; South Africa — SCA; any other court/registry sourced directly | [`court-direct-permission-request.md`](./court-direct-permission-request.md) | Generic template, fill in court name, registry email, jurisdiction. |
| Scotland (Scottish Courts and Tribunals Service), Northern Ireland (Judicial Studies / Library), Ireland (Courts Service) | [`ogl-ccby-reuse-confirmation.md`](./ogl-ccby-reuse-confirmation.md) | Already published under OGL/CC-BY; confirming the licence covers computational/AI use. |

If a jurisdiction isn't listed here, the closest fit is usually
`court-direct-permission-request.md` (direct approach to the publishing court
or registry) or `ogl-ccby-reuse-confirmation.md` (if the material is already
under a named open licence and you just need AI-use confirmation).

## Before sending any of these

- Fill in every `[PLACEHOLDER]`.
- Resolve every `[VERIFY: ...]` note against the current source at the time of
  filing — licence terms, contact addresses, and forms change.
- Keep a copy of what was sent and any reply; a node's legitimate right to
  source a given corpus rests on that correspondence.
- If a source says no, or attaches conditions Molao can't meet (e.g. no
  redistribution), respect that and do not source from it. The whole point
  of this process is sourcing legitimately.

Two more that apply only to the governance letters:

- **Never name an institution publicly as a prospective signer without its
  written agreement to be named.** Implying a quorum that does not exist would
  discredit the project faster than having no quorum at all.
- When counsel or a risk office asks a question the letter cannot answer, that
  is a governance gap, not a drafting problem. Raise it as an issue against
  [`GOVERNANCE.md`](../GOVERNANCE.md) so the answer survives; do not settle it
  privately and re-word the letter.
