# The source map: where a Molao corpus can legitimately come from

This is the working map of case-law sources per jurisdiction, the licence or
policy that governs each, and whether Molao may build its **corpus** (which
feeds a RAG index) from it. It is deliberately public and unfinished: **most
rows are things the community can help verify, adapt, or unlock.** See
[SOURCES.md](SOURCES.md) for the sourcing ethics and [CONTENT-SIGNALS.md](CONTENT-SIGNALS.md)
for how the crawler decides.

The one rule that shapes the whole map: **the LII aggregators are mostly closed
to AI use, so the corpus comes from courts and official publishers directly, or
under licence.** That is the honest inversion of where you'd instinctively start.

Status key: 🟢 usable now · 🟡 needs a (usually free) paperwork step · 🔵 needs
an adapter or live verification · 🔴 off-limits by policy.

## Legend for the columns
- **Route** — where the judgments actually come from.
- **Access** — API / bulk / crawl.
- **Licence / policy** — the reuse basis, and any AI/computational-use position.
- **Verdict** — RAG-eligible under Molao's default policy.

---

## Africa

| Jur. | Route | Access | Licence / policy | Status |
|---|---|---|---|---|
| **South Africa** | Constitutional Court (`concourt.org.za`, `collections.concourt.org.za`); SCA | crawl | Judgments **public domain** — Copyright Act 1978 s12(8)(a) excludes official texts of a legal nature. Sites carry no AI block, no reuse licence stated. | 🔵 clean route, needs an adapter |
| South Africa | SAFLII, LawLibrary | — | SAFLII: `use=reference` + blocks AI crawlers + declines bulk. LawLibrary: `ai-input=no`. | 🔴 citation-only |
| **Kenya** | Kenya Law (`new.kenyalaw.org`) | crawl | No `Content-Signal`; robots allows the path for `molao-node`. | 🟢 **live-proven** (may paywall) |
| **Ghana** | Judiciary e-Judgment (`ejudgment.judicial.gov.gh`) | crawl | Court-direct, open robots, no AI block. | 🔵 clean route, needs an adapter |
| Uganda, Tanzania, Zambia, Zimbabwe, Namibia, Lesotho, Eswatini, Malawi, Nigeria, Sierra Leone, Seychelles | Their LII sites | — | `ai-input=no` or `use=reference`; several also `Disallow` the judgment path. | 🔴 off by default |
| **All of the above (bulk)** | **Laws.Africa** (`api.laws.africa`) | licensed bulk (Akoma Ntoso) | CC-BY-NC-SA default (workable for a non-commercial commons); AI terms unpublished → negotiate. Upstream digitiser for the whole network. | 🟡 needs a licence conversation |
| Nigeria, Uganda, Tanzania… (court-direct) | National judiciary portals | crawl | Some open (e.g. Nigeria `supremecourt.gov.ng`), reuse terms often unstated. | 🔵 verify per-site |

## United Kingdom & Ireland

| Jur. | Route | Access | Licence / policy | Status |
|---|---|---|---|---|
| **England & Wales + UK Supreme Court** | National Archives *Find Case Law* | official **API**, Akoma Ntoso XML | Open Justice Licence v2.0 — bulk/computational use needs a **free licence application** (caselawlicence@nationalarchives.gov.uk). | 🟡 best-structured source; file the form |
| **Scotland** | `scotcourts.gov.uk` | crawl (no bulk API) | Open Government Licence — no AI carve-out; open robots. | 🟢 usable; confirm reuse in writing |
| **Northern Ireland** | `judiciaryni.uk` | crawl | Open Government Licence; open robots. | 🟢 usable; confirm in writing |
| **Ireland** | `courts.ie` | crawl | CC-BY default (govt PSI); robots allow-lists `/judgments`. | 🟢 usable; confirm CC-BY basis |
| England/Ireland | BAILII | — | Terms ban bulk + "incorporating judgments into the output of a computer program"; robots blocks the judgment dirs. | 🔴 forbidden |

## Australia, New Zealand, Canada

| Jur. | Route | Access | Licence / policy | Status |
|---|---|---|---|---|
| **New Zealand** | `courtsofnz.govt.nz` | crawl | Judgments have **no copyright at all** (Copyright Act 1994 s27(g)); open robots. The cleanest source anywhere. | 🔵 pristine; needs an adapter |
| **Australia** | High Court, Federal Court, NSW Caselaw | crawl w/ permission, or reuse the **Open Australian Legal Corpus** (CC-BY-4.0, permission pre-cleared) | Courts grant written scraping permission on request (precedent exists); several release under CC-BY. | 🟡 permission or reuse the open corpus |
| Australia / NZ | AustLII, NZLII, JADE | — | Explicit "no AI input" policy; block `ClaudeBot` by name. | 🔴 forbidden |
| **Canada (federal)** | Supreme Court, Federal Court | data request | Reproduction of Federal Law Order (SI/97-5) — open reuse; but the sites block crawling, so request a bulk export. | 🟡 registry data request |
| Canada | CanLII | — | Terms prohibit scraping/bulk/AI; **litigated** (*CanLII v Caseway AI*, settled 2026). | 🔴 forbidden |
| Canada (provincial) | — | — | No clean aggregator; CanLII is the choke point. | 🔴 coverage gap |

## Europe

Preliminary — a fuller pass is in progress. The likely-clean, reuse-friendly
official routes (to be confirmed and adapter-built):

| Jur. | Route | Notes |
|---|---|---|
| **EU** | EUR-Lex / CURIA (CJEU) | EU open-data reuse policy; Cellar repository, Akoma Ntoso/Formex. 🔵 |
| **Council of Europe** | HUDOC (ECHR) | Documented API. 🔵 |
| **France** | Légifrance / DILA open data | France's open-data judgment programme; permissive. 🔵 |
| **Netherlands** | `rechtspraak.nl` open data API | Known permissive/open. 🔵 |
| **Germany** | `rechtsprechung-im-internet.de` | Official federal case law; open-data. 🔵 |

---

## How the community can help

Every 🔵 and 🟡 row is a contribution waiting to happen. Concrete tasks:

1. **Verify a host.** Run `molao crawl <host> --dry-run` (or `molao fetch <url> --dry-run`) against a court-direct source, confirm it parses, and report the result. Update this table.
2. **Add a court-direct adapter.** The peachjam adapter (`crates/molao-ingest/src/peachjam.rs`) handles the AfricanLII network; the clean court-direct sources (NZ courts, Ghana e-Judgment, SA Constitutional Court, EUR-Lex) each need their own small adapter behind the same `SourceAdapter` trait. This is the highest-leverage code contribution.
3. **Add a region profile.** A new jurisdiction needs its court codes and report series — a TOML file under `profiles/` (see [COURTS.md](COURTS.md#adding-a-jurisdiction)). No code.
4. **File the paperwork.** The 🟡 rows need a human to send a licence/permission request. Templates are ready in [`paperwork/`](https://github.com/vul-os/molao/blob/main/paperwork/) — the National Archives computational licence, a Laws.Africa bulk request, court-direct permission letters, and OGL/CC-BY confirmations. Filing these is the single biggest unlock, and only a person can do it.
5. **Correct the map.** Policies change. If a source's `robots.txt`, content-signal, or terms have shifted, open a PR against this file with the evidence.

`molao sources` prints the crawler's built-in registry and each host's current
eligibility. This document is the wider map around it.
