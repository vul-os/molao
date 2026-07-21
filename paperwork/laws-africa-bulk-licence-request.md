# Laws.Africa — Bulk / API Licence Request (AfricanLII network)

> Not legal advice; adapt before sending. Fill in every `[PLACEHOLDER]` and check
> every `[VERIFY: ...]` note before you send this.

## Context

Molao is a free, open-source, decentralised commons of case law (part of
VulOS; https://github.com/vul-os/molao). It builds a corpus of judgments and
a citation graph, with a local retrieval-augmented-generation (RAG) index for
legal research. It is non-commercial and honours sources' `robots.txt` and
content-signals.

**Laws.Africa** (and the AfricanLII network of jurisdiction-specific LIIs it
supports) publishes legislation and case law in **Akoma Ntoso**, generally
under a **CC-BY-NC-SA** licence by default. CC-BY-NC-SA is broadly workable
for a non-commercial commons like Molao — attribution and share-alike are
things we're happy to do — but Laws.Africa's terms don't publicly say
whether that licence covers **ingesting content into an AI/RAG index** (using
it as inference-time context rather than redistributing the text itself), or
whether the share-alike condition is satisfied by Molao's own open-source,
attribution-preserving redistribution model. This letter asks them directly,
rather than assuming.

Contact: **info@laws.africa**

`[VERIFY: confirm this is still the correct contact address, and check
https://laws.africa for any published bulk-access or API documentation that
may have superseded a manual request, before sending.]`

---

## Email template

**To:** info@laws.africa
**Subject:** Bulk/API licence enquiry — Molao (open non-commercial case law commons)

Dear Laws.Africa team,

I'm writing on behalf of **Molao**, a free, open-source, decentralised
commons of case law (part of the VulOS project; source code at
https://github.com/vul-os/molao). Molao builds a corpus of judgments and a
citation graph, together with a local retrieval-augmented-generation (RAG)
index, to support legal research. It is entirely **non-commercial**.

We would like to source case law from the AfricanLII network via a bulk or
API licence, and I have a few questions before we do, so that we use your
content correctly and don't cause you any support burden through
uncoordinated scraping.

**1. Coverage.** Which jurisdictions and collections within the AfricanLII
network would a bulk/API licence cover? We are particularly interested in
`[SPECIFY JURISDICTIONS OF INTEREST, e.g. "case law for South Africa,
Kenya, Uganda" — or "the full network" if broad]`, but would appreciate
knowing the general scope on offer.

**2. Format and access.** We understand your content is published in Akoma
Ntoso. Is there a documented bulk-download or API mechanism we should use,
rather than crawling the website? We intend to access any API in an
identified, rate-limited, polite manner, and to honour `robots.txt` and any
other content signals throughout.

**3. Licensing scope for AI/RAG use.** We understand the default licence for
Laws.Africa content is **CC-BY-NC-SA**. We'd like to explicitly confirm two
things, since we couldn't find them addressed in your public terms:

   a. Does the licence permit **ingesting content into a retrieval-augmented
   generation (RAG) index** — i.e. using judgment text as inference-time
   context supplied to a language model at query time, rather than using it
   to train or fine-tune a model? Molao's design retrieves relevant text at
   query time and passes it to a model as context; it does not currently
   train models on this content. `[VERIFY: update this description if
   Molao's actual pipeline changes to include model training/fine-tuning —
   that is a materially different use and should be disclosed as such.]`

   b. Does CC-BY-NC-SA's share-alike condition permit **redistributing an
   open, non-commercial corpus** built from your content — i.e. Molao node
   operators holding and querying their own copies, with attribution to
   Laws.Africa/AfricanLII preserved and the same CC-BY-NC-SA (or compatible)
   licence applied to redistributed copies? This is the crux of how Molao
   works as a commons rather than a single licensed application, so we want
   to be upfront about it and get your confirmation rather than assume.

**4. Cost.** Is there a cost associated with a bulk/API licence for a
non-commercial project of this kind, or is it available free of charge under
the existing CC-BY-NC-SA terms with just this confirmation of scope?

We're glad to provide more detail about Molao, our attribution approach, or
our access pattern, or to complete any application form you have for this.
Thank you for the work AfricanLII and Laws.Africa do to make African case law
openly accessible — it's exactly the kind of source we most want to support
properly.

Kind regards,
`[YOUR NAME]`
`[YOUR ROLE / RELATIONSHIP TO MOLAO, e.g. "Molao node operator" or "maintainer"]`
`[YOUR EMAIL]`
`[YOUR ORGANISATION, IF ANY — OR "Individual contributor to the Molao open-source project"]`
`[DATE]`

---

## After sending

- Record the date sent and keep the email in your own records.
- If Laws.Africa confirms RAG ingestion and redistribution are within scope,
  note the confirmation date and any conditions here: `[CONFIRMATION DETAILS]`
- If they decline redistribution of the full corpus but permit something
  narrower (e.g. a derived index, or use restricted to specific
  jurisdictions), scope the Molao integration to match — do not redistribute
  beyond what's confirmed.
- Attribution for CC-BY-NC-SA requires, at minimum, credit to the original
  source, a link to the licence, and indication of any changes made.
  `[VERIFY: get the exact attribution wording/format Laws.Africa prefers, if
  any, from their reply or published terms, and use it consistently.]`
