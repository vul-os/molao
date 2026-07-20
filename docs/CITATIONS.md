# Citations

What `molao-cite` actually recognises, how it normalises what it finds, and why
each rule is there. This document describes the code in
`crates/molao-cite/src/`, not an aspiration.

## Grammar in code, jurisdiction in data

The **citation grammar is jurisdiction-neutral**. The shapes below — neutral,
reported with a volume, reported historical, case number, and pinpoints — are
the same across the free-access-to-law world, which is why they live in code.

What differs between jurisdictions is **which court codes and which report
series exist**, and those live in a **region profile**
([COURTS.md](COURTS.md)). Each section below marks which parts the profile
drives.

A **generic** profile still parses neutral citations, using the shape rule
alone, and flags every court code as unknown. South Africa (`ZA`) is the first
fully-populated profile and supplies most of the worked examples here.

> **Status: implemented.** The court and series registries are region-profile
> data ([COURTS.md](COURTS.md)). `Extractor::for_profile(profile)` builds a
> parser for any profile and `Extractor::extract` runs it; the free
> `extract(&str)` function is a wrapper over an extractor for the default
> profile, and is unchanged in behaviour. Under the `GENERIC` profile, neutral
> citations and case numbers are extracted and reported citations are not — see
> [Series registry](#series-registry) below.

## The contract

`extract(&str) -> Vec<CitationRef>` is **deterministic**. Given the same text
and the same `EXTRACTOR_VERSION`, every node must produce a byte-identical
result. That is what makes the citation graph contributable by anyone and
checkable by everyone.

Concretely:

- Results are sorted by byte span start, then longest match first, then
  canonical form, so even a pathological exact overlap is ordered reproducibly.
- No hash-map iteration order reaches the output.
- No locale, clock, or environment input.
- **Any change in extraction behaviour must bump `EXTRACTOR_VERSION`.** If one
  version string can produce two different graphs, verification by recomputation
  silently becomes verification of nothing.

`EXTRACTOR_VERSION` is `molao-cite@` plus the crate version, e.g.
`molao-cite@0.1.0`. A release manifest records it.

## The four forms

### Neutral citations

*Grammar in code; court codes from the profile.*

```
[1995] ZACC 3      South Africa    (SAFLII)
[2026] ZAGPPHC 412 South Africa
[2020] UKSC 1      United Kingdom  (BAILII)
[2020] HCA 1       Australia       (AustLII)
[2020] NZSC 1      New Zealand     (NZLII)
```

Pattern: a four-digit year in square brackets, a court code, a number. This is
the LII neutral-citation convention, and it is shared across jurisdictions —
only the codes change.

The bracketed year is what distinguishes a neutral citation from ordinary prose
containing a year. That alone is not enough — `[2019] Act 5` has the same shape
— so the code additionally requires either a hit in the court registry, or a
code that *looks* like a court code: at least three characters, all upper-case
ASCII. `[2019] Act 5` fails both and is dropped.

A citation whose court code is not in the active profile's registry is **kept
and flagged** (`known_court: false`), not discarded. A new division must not
vanish from the graph until somebody notices the registry is stale; ingest logs
the unknown code so it gets fixed instead.

This is what makes the **generic** profile useful on day one: under it every
code is unknown, every neutral citation is still kept and flagged, and a
jurisdiction can be graphed before anyone has written its profile.

Parsed to `Citation::Neutral { year, court, number }`, with the court code
upper-cased.

### Reported citations, modern

*Grammar in code; series abbreviations from the profile.*

```
2020 (3) SA 123 (SCA)     South Africa
2015 (1) SACR 1 (CC)      South Africa
2011 (2) All SA 47 (SCA)  South Africa
1994 (1) NR 123           Namibia
```

Pattern: year, bracketed volume, a series abbreviation **from the profile's
series registry**, page, and an optional bracketed court.

The series registry is the whole trick. A parser that matches "capitalised word
between a volume and a page number" pulls in vast quantities of ordinary legal
prose, because judgments are full of constructions like `section 3 (1) of the
Companies Act 71 of 2008`. Enumerating the series is the difference between a
citation extractor and a random-number detector, and there is a test asserting
that exact statutory phrase yields nothing.

Series abbreviations are matched longest-first, so `All SA` wins over `SA` and
`SACR` is never read as `SA` followed by junk.

Parsed to `Citation::Reported { year, volume: Some(v), series, page, court }`.

### Reported citations, historical

*Grammar in code; series abbreviations from the profile.*

```
1941 AD 43      South Africa   (Appellate Division)
1936 CPD 123    South Africa   (Cape Provincial Division)
```

Most jurisdictions have a pre-volume era, cited as year, series, page, with no
volume. Those series are a separate profile group (`no_volume: true`) and a separate pattern, because
allowing an optional volume in one pattern would make the whole thing far
greedier than it should be.

Parsed to `Citation::Reported { year, volume: None, series, page, court }`.

### Court case numbers

*Grammar in code; nothing profile-driven.*

```
CCT 306/24     South Africa (Constitutional Court file number)
A 1234/2019
```

Pattern: an upper-case letter prefix of one to five characters, then digits, a
slash, and two to four digits.

The letter prefix is mandatory. A bare `1234/2019` matches dates, statutory
references and page ranges far too often to be usable.

Parsed to `Citation::CaseNumber { prefix, number }`. Case numbers never carry a
pinpoint.

## Series registry

The series list is **profile data**. A jurisdiction supplies its own; the
generic profile supplies none, in which case reported citations are not
extracted and neutral citations still are.

### The ZA profile's series

24 series: 14 modern volume-numbered, 10 historical. The modern set covers the
general reports (`SA`, `All SA`, `SACR`), the Butterworths reports (`BCLR`,
`BLLR`, `BPIR`), labour and tax (`ILJ`, `SALLR`, `SATC`), the online series
(`JOL`, `JDR`), and the regional reports of Namibia, Botswana and Lesotho
(`NR`, `BLR`, `LLR`) which South African judgments cite regularly. The
historical set covers the provincial and local division reports (`AD`, `CPD`,
`TPD`, `WLD`, `NPD`, `OPD`, `EDL`, `GWL`), plus `SR` and `PH`.

Lookup is **case-sensitive**. Series abbreviations are upper-case by
convention, and lowering that bar readmits exactly the prose false positives the
registry exists to exclude.

Adding a series — to the ZA profile or to a new jurisdiction's — changes
extraction behaviour, so it requires an `EXTRACTOR_VERSION` bump. See
[COURTS.md](COURTS.md#adding-a-jurisdiction).

## Pinpoints

A citation without a pinpoint is not much use to a lawyer, so the parser looks
at the text immediately following a match.

| Written | Parsed |
|---|---|
| `at para 87` | `Paragraph { from: 87, to: None }` |
| `at paras 12-15` | `Paragraph { from: 12, to: Some(15) }` |
| `at para [87]` | `Paragraph { from: 87, to: None }` |
| `at paragraphs 12 to 15` | `Paragraph { from: 12, to: Some(15) }` |
| `at 47B-D` | `Page { page: 47, from_letter: Some('B'), to_letter: Some('D') }` |
| `at 123` | `Page { page: 123, from_letter: None, to_letter: None }` |

Both `para` and `paras`, with or without the `graph`/`graphs` suffix and with
or without a full stop, are accepted; the range separator may be a hyphen, en
dash, em dash, or the word `to`; the paragraph number may be bracketed.

Paragraphs are tried **before** pages, deliberately: `at 12` following `paras`
must not be read as a page reference.

Page pinpoints carry the marginal letters `A` to `J` used by the printed
reports. This is why paragraph structure is kept in the `Judgment` model — a
citation graph that points at a document rather than a place in it is much less
useful than one that does not.

## Citation keys

`Citation::key()` is the value that joins an edge to its target. Two spellings
of the same citation must produce the same key.

| Citation | Key |
|---|---|
| `[1995] ZACC 3` | `neutral:1995:ZACC:3` |
| `2020 (3) SA 123 (SCA)` | `reported:2020:3:SA:123` |
| `2020 (3) SA 123` | `reported:2020:3:SA:123` |
| `1941 AD 43` | `reported:1941::AD:43` |
| `CCT 306/24` | `caseno:CCT:306/24` |

Two decisions worth stating plainly:

- **Whitespace is normalised away.** `[1995] ZACC 3` and `[1995]  ZACC   3`
  share a key. Converters and typists vary wildly.
- **Reported keys exclude the trailing court.** `2020 (3) SA 123 (SCA)` and
  `2020 (3) SA 123` are the same report. Treating them as two nodes would split
  a case's inbound citations in half, which is precisely the failure a citator
  exists to prevent.

Court codes and case-number prefixes are upper-cased in the key.
`Citation::canonical()` produces the canonical printed form, and there is a test
that `[1995] ZACC 3`, `2020 (3) SA 123 (SCA)` and `1941 AD 43` all round-trip
through parse and canonicalise unchanged.

## Overlap resolution

All four patterns run over the whole text and their matches are pooled, then
sorted by start position, longest first. Any candidate overlapping an
already-accepted span is dropped.

So `2020 (3) SA 123 (SCA)` is one reported citation rather than a reported
citation plus a stray fragment, and a string carrying both a neutral and a
parallel reported citation — `S v Makwanyane [1995] ZACC 3; 1995 (3) SA 391
(CC)` — yields two distinct citations, because their spans do not overlap.

## Precision

The parser is built to be quiet. These all extract nothing, and each has a test:

```
The applicant was 34 years old in 2019 and earned R123 000 per annum.
The contract, concluded on 3/4/2019, ran for 12 months.
in terms of section 3 (1) of the Companies Act 71 of 2008
[2019] and then some text
[2019] Act 5 of that year
```

Precision is prioritised over recall on purpose. A false edge in a citator is a
lie about what a court said. A missing edge is a gap, and gaps are visible.

## What it does not do

- **It does not resolve a citation to a judgment.** `extract` returns
  citations, not links. Resolution happens against the corpus, and a citation
  that resolves to nothing is surfaced as an unresolved citation showing the
  text as written. Never hidden.
- **It does not decide treatment.** Whether a case was followed, distinguished
  or overruled is interpretation, not extraction. **Designed, not built** — see
  [GOVERNANCE.md](../GOVERNANCE.md) and [ROADMAP.md](../ROADMAP.md).
- **It does not parse legislation references.** Statutes are a different
  citation grammar and a different corpus. Out of scope for v1.
- **It does not parse party names or case titles out of running text.** Style of
  cause comes from the structured judgment, not from the citation parser.
- **It does not guess a jurisdiction.** The active region profile is a node's
  configuration, not something inferred from the text. A corpus spanning
  jurisdictions is a set of profiles, not a heuristic.
