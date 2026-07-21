# Generic Template — Direct Permission Request to a Court / Registry

> Not legal advice; adapt before sending. Fill in every `[PLACEHOLDER]` and check
> every `[VERIFY: ...]` note before you send this.

## Context

Molao is a free, open-source, decentralised commons of case law (part of
VulOS; https://github.com/vul-os/molao). It builds a corpus of judgments and
a citation graph, with a local retrieval-augmented-generation (RAG) index for
legal research. It is non-commercial and honours sources' `robots.txt` and
content-signals.

This is a **generic, reusable template** for requesting written permission to
systematically download and reuse judgments directly from a court or
judiciary registry that does not publish under a standing bulk/computational
licence. It is intended for sources such as, but not limited to:

- Australia — High Court of Australia, Federal Court of Australia, NSW
  Caselaw
- South Africa — Supreme Court of Appeal (SCA)
- Any other court-direct source not covered by another template in this
  directory

Fill in `[COURT NAME]`, `[REGISTRY EMAIL]`, and `[JURISDICTION]` (and the
other placeholders) for the specific court you're approaching. Send a
separate copy of this letter, adapted, to each court individually — don't
send one letter naming multiple courts.

`[VERIFY: before sending, check whether the specific court already publishes
under a named open licence (e.g. Creative Commons) or has an existing bulk-
access process — if so, this generic "please may we" letter may not be the
right template; see `ogl-ccby-reuse-confirmation.md` for the confirm-an-
existing-licence case instead.]`

---

## Email template

**To:** `[REGISTRY EMAIL]`
**Subject:** Request for permission — systematic reuse of published judgments (Molao, open non-commercial case law commons)

Dear `[COURT NAME]` Registry,

I am writing to request written permission for **Molao**, a free,
open-source, decentralised commons of case law (part of the VulOS project;
source code at https://github.com/vul-os/molao), to systematically download
and reuse judgments published by the `[COURT NAME]` (`[JURISDICTION]`).

**About Molao.** Molao builds an open corpus of judgments and a citation
graph between them, together with a local retrieval-augmented-generation
(RAG) index, so that legal researchers, students, and the public can search
and analyse case law without depending on paywalled commercial providers.
The project is entirely **non-commercial**: it is not sold, does not carry
advertising, and no one profits from it.

**Why we believe this is appropriate.** Judgments handed down by
`[COURT NAME]` are public documents, made available so that the workings of
the court are open to scrutiny and so that the law they state can be known
and relied upon. `[VERIFY: state the specific public-domain / open-access
basis that applies in this jurisdiction — e.g. Crown/state copyright with
reuse rights, an explicit "no copyright" or public-domain statement on the
court's own publication, or a general common-law principle that judgments
are public documents. Do not assert a specific legal basis without checking
it holds for this jurisdiction.]`

**What we would do, specifically.** With your permission, Molao would:

- Access judgments via `[SPECIFY: the court's official website, RSS feed,
  or API if one exists — describe the actual planned access route]`.
- Identify itself with a clear, identified User-Agent string (`[e.g.
  "Molao/0.x (+https://github.com/vul-os/molao; contact: YOUR-EMAIL)"]`) so
  the registry can identify, rate-limit, or contact this client
  independently of ordinary public traffic.
- Honour `robots.txt` and any other content signals the court's site
  publishes, and would not access the site if `robots.txt` declines
  automated access.
- Rate-limit requests conservatively (`[SPECIFY YOUR PLANNED RATE, e.g. "no
  more than N requests per second, with backoff on errors, spread over
  off-peak hours where possible"]`) so as not to impose load on court
  infrastructure.
- Store the judgment text as published, without alteration, alongside
  metadata (case citation, date, court, parties as published) used to build
  the citation graph.

**What we're asking you to confirm.** We would be grateful if you could
confirm, in writing, that:

1. `[COURT NAME]` permits this kind of systematic, identified, rate-limited
   download of its published judgments for the purpose described; and
2. Reuse extends to inclusion in an **open, non-commercial corpus** —
   meaning the sourced judgments (or an index built from them) may be held
   and queried by other Molao node operators and, potentially, members of
   the public running the open-source Molao software, not only by us — and
   to **computational/AI indexing**, meaning the judgment text may be used
   as retrieval context supplied to a language model for legal research
   (rather than published or altered as if it were a new authoritative
   version of the judgment).

We are glad to attribute `[COURT NAME]` clearly wherever a judgment sourced
from it is shown — for example: `[SPECIFY ATTRIBUTION WORDING YOU PROPOSE,
e.g. "Sourced from [COURT NAME], [JURISDICTION]"]` — and to accept any
conditions (such as excluding specific judgment types, respecting takedown
or correction requests, or limiting redistribution) that make this workable
for the court. Please let us know if a different process, form, or contact
is more appropriate for this request.

Thank you for your time, and for the work the `[COURT NAME]` does in making
its judgments publicly available.

Kind regards,
`[YOUR NAME]`
`[YOUR ROLE / RELATIONSHIP TO MOLAO, e.g. "Molao node operator" or "maintainer"]`
`[YOUR EMAIL]`
`[YOUR ORGANISATION, IF ANY — OR "Individual contributor to the Molao open-source project"]`
`[DATE]`

---

## After sending

- Record the date sent and keep the email in your own records.
- If the registry replies with conditions, follow them exactly — e.g. if
  redistribution is limited, restricted judgment types are excluded, or a
  takedown process is required, encode that into how this source is
  configured in Molao.
- If there is no reply after a reasonable period, `[VERIFY: decide and note
  your own follow-up policy here — e.g. "follow up once after 4 weeks;
  do not proceed to source this court's judgments without an affirmative
  response"]`. Silence is not permission.
- Note any reference number, named contact, or scope agreed, for this
  court's ongoing record: `[PERMISSION DETAILS / DATE GRANTED / SCOPE]`
