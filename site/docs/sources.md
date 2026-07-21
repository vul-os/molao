# Sources and sourcing ethics

Where a corpus comes from, and the lines the project will not cross to get it.

This is a deliberate ethical position, not a legal disclaimer. Read it before
writing an ingester for any jurisdiction.

## The general rule

Court judgments are public documents. They are the work of the courts, they are
not copyrightable, and no one owns the law. The right of access to them is the
foundation of the Free Access to Law Movement, which the LII network has
operated under since the 1990s.

That settles the judgments. It does not settle everything, because the
organisations that have spent decades making judgments findable have added work
of their own on top — markup, alternative citations, editorial apparatus — and
that added work is theirs.

So the rule generalises to every jurisdiction:

**1. Take from courts and gazettes directly wherever possible.** The court that
handed down the judgment is the canonical source. Going direct means the
provenance record points where it should, avoids loading volunteer
infrastructure, and does not depend on anyone's goodwill continuing. Where a
court or gazette only self-publishes — no LII covers it, no bulk licence
exists — the way in is a **polite, identified crawl**: a named user agent,
`robots.txt` honoured without exception, and a fetch rate that looks like a
careful clerk working through a filing room, not a script draining a server.
An ingester that ignores `robots.txt` or hides what it is is not a Molao
ingester regardless of what it fetches.

**2. Licence bulk data where a licensed bulk supplier exists.** For everything
not available directly, the correct route is an organisation that publishes
machine-readable corpora under a licence that permits it, on their terms, with
attribution. This is a paid-for or agreed relationship, not a workaround.

**3. Treat an LII that declines bulk supply as a citation-resolution target,
not a scrape target.** When a judgment cites a case the corpus does not hold,
show the citation as written and link out so the reader can go and read it
there. Sending readers to an LII is support. Draining it in bulk is not.

**4. Never launder provenance.** A witness record names the URL it actually
fetched. It never claims a court URL for a document obtained elsewhere.

The rest of this document is the **South African worked example** — the first
region profile, and the pattern to follow for BAILII in the UK, AustLII in
Australia, CanLII in Canada, NZLII in New Zealand, the AfricanLII members, and
national gazettes anywhere.

## A collective corpus, not a bulk upload

No single node, and no single person, is trusted to say what is in the corpus.
Nodes **collectively build it**: any node can run the sourcing steps above and
contribute what it fetched, and what makes a contribution count is not who
sent it but whether independent others agree on the bytes.

That is the corroboration model in full, and it is what makes rule 4 above
enforceable rather than aspirational: a witness fetches from a canonical
source — direct, licensed bulk, or a polite crawl — hashes exactly what it
received, and signs the tuple. A document becomes trustworthy when **k-of-n
independent witnesses** sign the same raw bytes, not when one uploader
vouches for it. See [PROVENANCE.md](PROVENANCE.md) for the record format and
the corroboration classes.

This is why the sourcing rules and the provenance model are one design, not
two. Sourcing decides *where* a witness is allowed to look. Corroboration
decides *how much a fetch is worth* once it has looked. Neither one alone
would be enough: sourcing rules with no corroboration would still trust a
single uploader; corroboration with no sourcing rules would happily corroborate
a bulk SAFLII scrape by running it three times.

**Status:** the software that enacts this is `molao-ingest`. The **licensed-bulk
path is wired into the node**: `molao ingest <file-or-dir>` reads Akoma Ntoso
`.xml` (alongside the JSON Lines and plain-text formats), takes the region from
the court code's country prefix, and stores each judgment with `Manual`
provenance — because a file import is not a witnessed fetch, and the corpus
should say so until a witness corroborates the bytes. The **robots-respecting
crawler is now exposed** as `molao fetch` and `molao crawl` (see the AfricanLII
section below), and has fetched, parsed, and ingested real judgments from live
sites. The **witness-signing daemon** is built and tested as library code but is
not yet a long-running node command — a fetch it performs enters with `Manual`
provenance until a witness signs the recorded bytes. There is no public corpus.

## The AfricanLII peachjam crawler (built and live-tested)

Almost every AfricanLII member institute runs the same open-source **peachjam**
platform (Laws.Africa). Because they share a URL scheme, a `robots.txt` shape,
and where they put metadata, Molao needs **one** adapter, parameterised by host,
not one scraper per country. It lives in `molao-ingest/src/peachjam.rs` and is
driven by two node commands:

- `molao fetch <judgment-url> [--dry-run] [--db <path>]` — fetch and parse one
  judgment. A PDF-backed judgment (common on Kenya Law) is followed to its
  `/source.pdf` and the text extracted; an HTML-bodied judgment is parsed from
  the page. `--dry-run` prints the parsed judgment (court, citation, date,
  paragraph count, provenance) without storing.
- `molao crawl <region-code|base-url> [--court CODE] [--limit N] [--dry-run]
  [--db <path>]` — enumerate a site's `/judgments/` listing (following
  `?page=N`) and ingest up to `N`, honouring `robots.txt` and spacing every
  request by the site's crawl-delay.

Both send the identified user agent `molao-node/0.1
(+https://github.com/vul-os/molao)`, honour `robots.txt` **including the
per-judgment `Disallow` lines** LIIs use for takedowns and privacy, and enforce
the 5-second crawl-delay. Ingested judgments carry `Manual` provenance until a
witness signs the recorded bytes. This is a **polite sample, not a bulk
mirror** — for bulk work the correct route remains the licensed
`api.laws.africa` Akoma Ntoso feed (raw AKN XML is **not** served on the public
web pages; the pages carry a rendered HTML or PDF body plus an `og:title` with
the citation metadata, which is what this adapter reads).

### What is actually verified

Real peachjam markup varies between sites and over time, so "works for the whole
network" is a claim this adapter earns host by host, not once. Verified live on
2026-07-21:

| Host | Region | Body form | Result |
|------|--------|-----------|--------|
| `new.kenyalaw.org` | KE | PDF-backed | **Verified** — `fetch` and `crawl` both parse and ingest; e.g. *Kigen v Kigen* `[2026] KECA 1460`, 117 paras from the PDF; a crawled `[2026] KEHC 10827` ingested and found by search. |
| `nigerialii.org` | NG | HTML body (`content__html`) | **Verified** — `fetch` parses federal `/akn/ng/judgment/…`; e.g. *Compagnie Generale…* `[2017] NGSC 7`, 60 paras, party name with embedded `(NIG)` handled. |
| `zambialii.org` | ZM | — | **Enumeration works, bodies not crawlable**: its `robots.txt` sets `Disallow: /akn/zm/judgment/` for generic agents, so the adapter correctly *refuses* every judgment fetch. ZambiaLII judgments are effectively citation-only for us. |

The remaining registry hosts (UG, MW, TZ, ZW, LS, NA, SZ, GH, and pan-African
AfricanLII) are **listed but not yet live-verified**; enumeration or a body
form may differ and should be checked with `molao crawl <host> --dry-run` before
relying on them. Two honest caveats seen already in testing:

- **Enumeration depends on server-rendered links.** Where a `/judgments/`
  listing renders its links via JavaScript, a static fetch sees none and
  `crawl` reports finding nothing rather than guessing.
- **`robots.txt` is authoritative and can forbid the whole judgment tree**
  (ZambiaLII does). The crawler fails closed and skips, per rule 1.

The parsing and enumeration *logic* is unit-tested offline against small
**invented** fixtures (no real judgment text is committed); the live results
above are reported here, not baked into the test suite, so `cargo test` needs no
network.

**SAFLII is never crawled by these commands.** SAFLII hosts are hard-denied in
the fetcher and marked citation-only in the sources registry, so `molao crawl za`
or `molao crawl bw` refuses with a clear message rather than fetching.

## The organisations (ZA)

**SAFLII** — the Southern African Legal Information Institute, hosted at Wits.
It has been the primary point of public access to South African case law for two
decades, largely unfunded, largely on goodwill. It publishes judgments freely to
readers, and it **explicitly declines to act as a bulk re-supplier**. It also
claims copyright in its own value-added layer: its markup, its alternative
citations, its editorial work.

**Laws.Africa and AfricanLII** — Laws.Africa maintains machine-readable African
legal corpora in **Akoma Ntoso**, the open XML standard for legal documents, and
AfricanLII is the network of roughly sixteen African legal information
institutes it works with. Their content is offered under **CC-BY-NC-SA** for
non-commercial use, with a commercial licence available on request.

## The four rules applied to ZA

**1. Direct.** South African courts and the *Government Gazette*, wherever they
publish.

**2. Licensed bulk.** Laws.Africa / AfricanLII, in Akoma Ntoso, under
CC-BY-NC-SA with attribution — or a commercial licence where a downstream user
needs one.

**3. Resolution, not scraping.** SAFLII has said plainly that it declines to be
a bulk re-supplier. So Molao links to it and does not drain it. **A bulk SAFLII
scraper will not be accepted into this repository.**

**4. Honest provenance.** If the bytes came from a licensed bulk corpus, the
witness record says so rather than naming a court URL.

## Why hold this line

Two reasons, one principled and one practical.

The principled one: SAFLII made South African case law publicly accessible when
nobody else would, and it is still doing it on a shoestring. A project claiming
to build a legal commons cannot begin by taking from the commons that already
exists, against the explicit wishes of the people maintaining it. That is not a
commons, it is extraction with better branding.

The practical one: a corpus assembled by scraping is a corpus with one supplier
and one point of failure. If SAFLII changes its markup, adds a rate limit, or
simply stops, a scraped pipeline breaks and the corpus dies with it. Direct
sourcing plus licensed bulk data is slower to build and durable once built,
which is the correct trade for a project whose entire premise is longevity.

Both reasons transfer unchanged to any jurisdiction. Substitute the LII that
serves it, and the argument is identical.

## Applying this in a new jurisdiction

Before writing an ingester for a jurisdiction, answer four questions in the open:

1. **What does the court itself publish, and where?** That is source one.
2. **Is there a licensed bulk supplier?** Laws.Africa in Africa; elsewhere, ask
   the national LII or the courts' own publisher. Agree terms before ingesting.
3. **What has the local LII said about bulk access?** If it declines, that
   settles it. Link out instead.
4. **What attribution travels with the data**, and how will it survive being
   mirrored to another node?

Record the answers alongside the ingester. An ingester whose sourcing basis is
not written down is not reviewable, and it will not be merged.

## The tradition Molao is joining

This is not a new idea, and the project should not pretend otherwise.

AustLII, CanLII, BAILII, SAFLII and the roughly sixteen AfricanLII members have
been running university-hosted legal-information nodes for decades under the
Free Access to Law Movement. Distributed institutional hosting of the law is
their model. Akoma Ntoso is their standard.

What Molao adds is narrower than it sounds: content-addressed document identity
so any two nodes agree on what a judgment is, threshold-signed releases so no
single institution — including this one — can publish alone, and a citator whose
mechanical layer is verifiable by recomputation.

The LII network solved access. Molao is trying to add verifiability and remove
the single point of failure. It is joining a tradition, not inventing one.

## Attribution

Where content is used under CC-BY-NC-SA, the attribution requirement is real and
travels with the document. Attribution must be surfaced to the reader, not
buried in a licence file, and it must survive being mirrored to another node.

## Licensing of what Molao itself produces

The **software** is MIT ([LICENSE](https://github.com/vul-os/molao/blob/main/LICENSE)).

The **judgments** are not Molao's to license; they are public documents of the
jurisdiction that produced them.

The **derived artifacts** — canonicalised text, the citation graph, the region
profiles — are intended to be as freely reusable as the licences on
the inputs permit. Where an input carries CC-BY-NC-SA, derived artifacts over
that input inherit its terms. Where a judgment was taken directly from a court,
nothing further attaches.

Anyone shipping a commercial product on top of a Molao corpus needs to check
the licences of the inputs that corpus was built from. The manifest is the place
that will record it.

**Status:** licensing metadata per document is **designed, not built**. Today
`Provenance` records the source URL, which is a good proxy and not the same
thing. Per-document licence fields are on the roadmap and this section describes
the intent.

## What is not in the corpus

- **Legislation.** A different citation grammar and a different corpus.
  Laws.Africa already does this well. Out of scope for v1.
- **Anything not published by a court or gazette.** No pleadings, no unreported
  matter passed along privately, no leaked material. If a court did not hand it
  down publicly, it does not belong here.
- **Editorial headnotes from commercial reports.** These are genuinely the
  publisher's work. Molao does not carry them.
