# OGL / CC-BY Reuse Confirmation — Scotland, Northern Ireland, Ireland

> Not legal advice; adapt before sending. Fill in every `[PLACEHOLDER]` and check
> every `[VERIFY: ...]` note before you send this.

## Context

Molao is a free, open-source, decentralised commons of case law (part of
VulOS; https://github.com/vul-os/molao). It builds a corpus of judgments and
a citation graph, with a local retrieval-augmented-generation (RAG) index for
legal research. It is non-commercial and honours sources' `robots.txt` and
content-signals.

Some sources already publish judgments under a named open licence — the
**Open Government Licence (OGL)** or **Creative Commons Attribution
(CC-BY)** — that, on its face, already permits reuse including bulk and
computational use. Unlike the Find Case Law computational licence, these
licences don't have a separate "computational use" carve-out or exclusion —
but they also don't explicitly *say* they cover AI/RAG indexing, so it's
worth writing a short, low-friction email to the publishing body confirming
that reading. This is lighter-weight than the permission-request or
licence-application templates in this directory: it's a confirmation, not an
application.

This template covers three sources:

- **Scotland** — Scottish Courts and Tribunals Service: enquiries@scotcourts.gov.uk
- **Northern Ireland** — Judiciary NI Library: Library@judiciaryni.uk
- **Ireland** — Courts Service: `[VERIFY: obtain the correct Courts Service
  of Ireland contact email at the time of sending — not given in the source
  brief for this template, and Ireland's case law licensing position may
  differ from the OGL/CC-BY sources above, so also verify which licence, if
  any, Irish judgments are published under before using this template
  as-is for Ireland.]`

Send a separate copy, adapted, to each body.

---

## Email template

**To:** `[enquiries@scotcourts.gov.uk / Library@judiciaryni.uk / VERIFIED IRISH COURTS SERVICE CONTACT]`
**Subject:** Confirming reuse for computational/AI indexing — Molao (open non-commercial case law commons)

Dear `[RECIPIENT / TEAM NAME, e.g. "Scottish Courts and Tribunals Service" or "Judiciary NI Library"]`,

I'm writing on behalf of **Molao**, a free, open-source, decentralised
commons of case law (part of the VulOS project; source code at
https://github.com/vul-os/molao). Molao builds a corpus of judgments and a
citation graph, together with a local retrieval-augmented-generation (RAG)
index, to support legal research. It is entirely **non-commercial**.

We understand that judgments published by `[BODY NAME]` are made available
under the `[SPECIFY: "Open Government Licence" or "Creative Commons
Attribution (CC-BY) licence" — use whichever applies to this source;
VERIFY the exact licence and version currently in force before sending]`,
which we understand already permits reuse including bulk and computational
use, without a separate application being required.

Before we begin sourcing from `[BODY NAME]` on that basis, we'd be grateful
for a short confirmation in writing, since the licence text doesn't
explicitly address this specific use: **does reuse under the
`[OGL/CC-BY]` extend to using judgment text as retrieval context supplied to
a language model at query time (retrieval-augmented generation, or "RAG"
indexing), as part of an openly redistributable, non-commercial corpus?**
Molao's design retrieves relevant text at query time and passes it to a
model as context; it does not currently train or fine-tune models on this
content. `[VERIFY: update this description if Molao's actual pipeline
changes to include model training/fine-tuning — that is a materially
different use and should be disclosed as such.]`

If it would help, we're glad to describe our access pattern too: we access
`[BODY NAME]`'s published judgments via `[SPECIFY: website, RSS, or API as
applicable]`, with an identified User-Agent, respecting `robots.txt` and any
other content signals, and rate-limited so as not to impose load on your
infrastructure.

We will of course retain the required attribution — `[SPECIFY EXACT
ATTRIBUTION WORDING REQUIRED BY THE LICENCE, e.g. for OGL: "Contains public
sector information licensed under the Open Government Licence v3.0" with a
link to the judgment and licence; for CC-BY: attribution to `[BODY NAME]`,
link to the licence, and indication of any changes]` — on every judgment
sourced this way, whether viewed directly through Molao or held by another
Molao node.

Thank you for your time, and for making `[JURISDICTION]` case law openly
available.

Kind regards,
`[YOUR NAME]`
`[YOUR ROLE / RELATIONSHIP TO MOLAO, e.g. "Molao node operator" or "maintainer"]`
`[YOUR EMAIL]`
`[YOUR ORGANISATION, IF ANY — OR "Individual contributor to the Molao open-source project"]`
`[DATE]`

---

## After sending

- Record the date sent and keep the email in your own records.
- If the body confirms RAG/computational use is covered, note the
  confirmation date here for this source's ongoing record:
  `[CONFIRMATION DETAILS]`
- If they decline, or say the licence doesn't extend that far, do not
  source from that body for RAG/computational use until the position is
  resolved — fall back to the `court-direct-permission-request.md` template
  to ask for that use explicitly, rather than assuming the existing licence
  covers it.
- Because this is a lighter-weight confirmation rather than a formal
  application, a non-reply is more likely than with the other templates —
  `[VERIFY: decide and note your own follow-up policy here, e.g. "follow up
  once after 4 weeks; if still no reply, treat the standing OGL/CC-BY terms
  as authoritative but keep a record that confirmation was sought and not
  refused"]`.
