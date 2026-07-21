# Molao Paperwork Templates

Molao is a free, open-source, decentralised commons of case law (part of VulOS;
https://github.com/vul-os/molao). It builds a corpus of judgments and a citation
graph, with a local retrieval-augmented-generation (RAG) index for legal research.
It is non-commercial and honours sources' `robots.txt` and content-signals.
Judgments are public documents; the project sources them from courts/official
publishers directly or under licence, never by scraping sites that decline it.

This directory holds fill-in-the-blank templates for the paperwork a human running
a Molao node needs to file to obtain permission or a licence to source case law
legitimately from a given jurisdiction or publisher.

**Every template contains `[PLACEHOLDERS IN BRACKETS]` that must be filled in
before sending, and marks anything uncertain as `[VERIFY: ...]`.** These are
drafts to adapt, not finished letters, and **not legal advice** — have someone
competent (ideally with local legal knowledge) review before sending, especially
for the licence applications.

**Filing these is a human action.** The Molao software does not, and will not,
submit applications, sign licences, or make representations on anyone's behalf.
A person operating a node must read, adapt, sign, and send each of these
themselves, and is responsible for complying with whatever terms come back.

## Which template for which source

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
