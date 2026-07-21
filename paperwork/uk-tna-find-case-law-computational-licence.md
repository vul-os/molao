# UK: The National Archives "Find Case Law" — Computational Analysis Licence

> Not legal advice; adapt before sending. Fill in every `[PLACEHOLDER]` and check
> every `[VERIFY: ...]` note before you send this.

## Context

Molao is a free, open-source, decentralised commons of case law (part of VulOS;
https://github.com/vul-os/molao). It builds a corpus of judgments and a
citation graph, with a local retrieval-augmented-generation (RAG) index for
legal research. It is non-commercial and honours sources' `robots.txt` and
content-signals.

Judgments and tribunal decisions published by **The National Archives' "Find
Case Law"** service (England & Wales judgments, plus UK tribunal decisions)
are released under the **Open Justice Licence v2.0**. That licence covers
normal reuse, but **bulk or computational use (including building a corpus,
an index, or feeding material to a machine-learning system) requires a
separate, free licence** applied for directly with The National Archives.
This template is the cover email plus a structured answer sheet for that
application.

Contact: **caselawlicence@nationalarchives.gov.uk**

`[VERIFY: confirm this is still the correct address and that a computational
licence is still required, at the URL for Find Case Law's licensing/reuse
information, before sending — TNA's process may be updated over time.]`

`[VERIFY: the brief says the application is "a ~29-question form" — confirm
the current form's exact questions from The National Archives at the time of
application, and map the answers below onto it. The categories below are the
substance TNA is known to ask about; the live form may phrase, order, or
add to them differently.]`

---

## Part 1 — Cover email

**To:** caselawlicence@nationalarchives.gov.uk
**Subject:** Computational analysis licence application — Molao (open non-commercial case law commons)

Dear Find Case Law Licensing Team,

I am writing to apply for a computational analysis licence under the Open
Justice Licence v2.0, to use Find Case Law content in a project called
**Molao**.

Molao is a free, open-source, decentralised commons of case law (part of the
VulOS project; source code at https://github.com/vul-os/molao). It builds a
corpus of judgments and a citation graph, together with a local
retrieval-augmented-generation (RAG) index, to support legal research. The
project is **non-commercial**, and it accesses sources only via their
official APIs (or, where no API exists, via a polite, identified crawl that
honours `robots.txt` and other content signals) — it does not scrape sites
that decline automated access.

I have set out answers to the standard questions I understand the licence
application covers in the answer sheet below. I am glad to complete these
directly on your form, or to provide further detail, in whatever format is
easiest for your team.

I want to flag one point up front because I expect it to be the crux of your
review: Molao is intended to be **redistributed as an open corpus** — the
whole point of the project is that any node operator can hold and query a
copy of the sourced case law, with proper attribution retained. I've
described what that means and how attribution is preserved in the
redistribution section below, and I'm happy to discuss safeguards,
restrictions, or a narrower scope if that would make approval easier.

Please let me know if you need anything further, or if there is a different
process I should be using.

Kind regards,
`[YOUR NAME]`
`[YOUR ROLE / RELATIONSHIP TO MOLAO, e.g. "Molao node operator" or "maintainer"]`
`[YOUR EMAIL]`
`[YOUR ORGANISATION, IF ANY — OR "Individual contributor to the Molao open-source project"]`
`[DATE]`

---

## Part 2 — Structured answer sheet

Use this to prepare answers before transcribing into TNA's actual form.

### Who we are

- **Applicant name:** `[YOUR NAME]`
- **Organisation (if any):** `[YOUR ORGANISATION OR "N/A — individual contributor"]`
- **Role in relation to Molao:** `[e.g. maintainer / node operator]`
- **Contact email:** `[YOUR EMAIL]`
- **Project:** Molao — an open-source, decentralised commons of case law,
  part of VulOS. Source: https://github.com/vul-os/molao
- **Is this a commercial venture?** No. Molao is non-commercial: it is not
  sold, does not carry advertising, and is not operated for profit.
  `[VERIFY: if your specific node or organisation has any commercial
  activity elsewhere, disclose it here and be precise about how it relates
  — or doesn't relate — to this use of the data.]`

### Purpose

Molao exists to build and maintain an open, freely available corpus of case
law and a citation graph between judgments, so that legal researchers,
students, civil society, and the public can search and analyse case law
without depending on paywalled commercial providers. Part of that corpus
supports a local RAG (retrieval-augmented generation) index — the case law
text is retrieved and supplied as context to a language model for legal
research assistance, rather than the model being trained on it.
`[VERIFY: if you also intend model fine-tuning/training rather than
retrieval-only use, say so explicitly here — training and retrieval are
different in kind and TNA may want to know which applies.]`

### What data

- **Content requested:** Judgments and tribunal decisions available via Find
  Case Law, in **Akoma Ntoso XML** (the format the service publishes in).
- **Scope:** `[SPECIFY: e.g. "all published judgments and tribunal decisions
  currently on Find Case Law, plus new ones as published" — or a narrower
  scope such as specific courts/tribunals or date ranges, if you are starting
  small]`
- **Metadata:** Case citation, court, date, neutral citation number, and any
  other structured metadata included in the Akoma Ntoso records, used to
  build the citation graph.

### How accessed

- **Access method:** The official Find Case Law **API**, not scraping the
  website.
- **Identification:** Requests will carry an identified User-Agent string
  (`[e.g. "Molao/0.x (+https://github.com/vul-os/molao; contact:
  YOUR-EMAIL)"]`) so TNA can identify and, if needed, contact or rate-limit
  this client independently of other traffic.
- **Rate limiting:** Requests will respect any documented rate limits, and
  will otherwise be paced conservatively (`[SPECIFY YOUR PLANNED RATE, e.g.
  "no more than N requests per second, with backoff on errors"]`) to avoid
  imposing load on TNA's infrastructure.
- **Frequency of re-fetch:** `[SPECIFY: e.g. "initial bulk fetch of the
  existing corpus, then incremental polling for new judgments at most
  daily"]`
- **robots.txt / content signals:** Honoured throughout; Molao does not
  access sources that decline automated access via `robots.txt` or
  equivalent signals.

### Storage and security

- **Where stored:** `[SPECIFY: e.g. local storage on the node operator's own
  infrastructure; describe whether this is a personal machine, a
  self-hosted server, or a specific cloud provider/region]`
- **Retention:** `[SPECIFY: e.g. "retained indefinitely as the corpus,
  updated as new judgments are published and any corrections/removals from
  Find Case Law are propagated"]`
- **Security measures:** `[SPECIFY: e.g. access controls, encryption at
  rest, who has access]`
- **Any processing beyond storage:** Parsing of Akoma Ntoso XML into the
  Molao data model; extraction of citations to build the citation graph;
  indexing for full-text and semantic (RAG) search. No modification of the
  underlying judgment text is performed; the authoritative text is preserved
  as sourced.

### Redistribution — the key question

**This is the point we expect you to scrutinise most closely, and we want to
be upfront about it.**

Molao is designed to be **redistributed**: it is an open-source project, and
the corpus it builds is intended to be shareable so that other Molao node
operators (and the public) can hold and query their own copy, offline or
self-hosted, rather than everyone depending on a single central server. This
is the core of what makes it a "commons" rather than a single licensed
application.

Concretely, redistribution means:

- Copies of the sourced Akoma Ntoso judgments (or a derived index/format
  built from them) may be distributed to other Molao nodes and, potentially,
  to members of the public running the open-source Molao software.
- Attribution to The National Archives / Find Case Law and the Open Justice
  Licence would be carried with every redistributed copy (see Attribution,
  below) — we do not intend to strip provenance.
- Molao does not charge for this redistribution and does not restrict who
  may run a node.

We are asking you directly: **does the computational analysis licence
permit this kind of open redistribution, with attribution, as part of a
non-commercial commons?** If not in full, we would welcome guidance on what
scope of redistribution (e.g. redistribution of a derived index without the
full original text, or redistribution restricted to non-commercial users) is
compatible with the licence, and we are willing to accept conditions that
make this workable for both sides.

### Attribution

Molao will display, alongside any judgment or extract sourced from Find Case
Law: **"Contains information licensed under the Open Justice - Licence
v2.0."** together with a link back to the original judgment on Find Case
Law and its neutral citation. `[VERIFY: confirm this exact attribution
wording against the current Open Justice Licence v2.0 text at the time of
application, in case it has been updated.]`

---

## After sending

- Record the date sent and keep the email in your own records.
- If TNA replies with conditions Molao cannot meet (e.g. no redistribution
  at all), do not source Find Case Law content in a way that breaches those
  conditions — narrow the integration or drop this source until it can be
  reconciled.
- If approved, note any licence reference number/scope limits here for the
  node's own records: `[LICENCE REFERENCE / DATE GRANTED / SCOPE]`
