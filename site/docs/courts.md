# Courts and region profiles

Molao is jurisdiction-neutral. **No country is hardcoded into core logic.**
Everything jurisdiction-specific — court codes, court names, hierarchy tiers,
law-report series — ships as a **region profile**: data a node loads, never an
assumption baked into the parser. (The authority weight of a tier is shared
across jurisdictions and is *not* profile data; see below.)

A **generic** profile makes Molao usable in any jurisdiction from day one,
before a dedicated profile for it exists. **ZA (South Africa) is the first
fully-populated profile**, and it is the worked example throughout this
document. It is never special-cased.

> **Status: implemented.** Region profiles live in `molao_core::region`.
> `RegionProfile` carries the court and series registries. Fourteen profiles
> ship built in, and each also ships as [`profiles/<cc>.toml`](https://github.com/vul-os/molao/blob/main/profiles/);
> a test parses every file in that directory and asserts it equals the
> constant, so the two cannot drift.
>
> **A node loads its own profiles at run time.** `molao --profiles <DIR>` reads
> every `*.toml` in the directory (`ProfileSet::load_dir`) and installs them
> for the process; `region::resolve` then answers from the loaded set first and
> falls back to the compiled-in constants, and `region::default_profile` does
> the same for the code a node has not chosen. So the constants are a fallback,
> not the source of truth: a wrong court code is fixed by editing a file.
> `molao regions` prints what an invocation resolves and where each profile
> came from.
>
> Loading is fail-closed. A malformed file, two files claiming one region code,
> a missing directory, or a directory with no profiles in it each abort before
> anything is ingested, and every error names its file.
>
> `region::builtin` and `region::all_builtin` deliberately keep answering from
> the constants alone — they are what the drift tests use, and a test a file on
> the test machine could answer would prove nothing.
>
> `molao_core::court::lookup`, `is_known_code` and `authority_weight` remain as
> convenience wrappers over the default profile, and follow a loaded one. The
> `court::COURTS` and `series::SERIES` constants are the compiled-in ZA
> registry specifically, and do not.

## Why this is feasible

Because the free-access-to-law world already converged on one citation
convention. The LII network — AustLII, CanLII, BAILII, SAFLII, NZLII and the
roughly sixteen AfricanLII members — publishes neutral citations with the same
shape everywhere:

| Jurisdiction | Neutral citation | Published by |
|---|---|---|
| United Kingdom | `[2020] UKSC 1` | BAILII |
| Australia | `[2020] HCA 1` | AustLII |
| New Zealand | `[2020] NZSC 1` | NZLII |
| South Africa | `[1995] ZACC 3` | SAFLII |
| Canada | `2020 SCC 1` | CanLII |

Year, court code, sequential number. Same grammar, different court codes —
which is exactly why the codes belong in data and the grammar belongs in code.

## What a profile contains

| Element | What it is | ZA example |
|---|---|---|
| Profile code | Jurisdiction identifier | `ZA` |
| Display name | Human-readable, never interpreted | `South Africa` |
| Court registry | Neutral-citation code → name, tier, seat | `ZACC` → Constitutional Court of South Africa, `Apex`, Johannesburg |
| Report series | Abbreviation → title, and whether it is cited with a volume | `SA` → South African Law Reports; `AD` → Appellate Division Reports, no volume |

That is the whole format. Two things a profile does **not** carry, both of
which earlier drafts of this document claimed it did:

- **Authority weights.** The multiplier per tier (`Apex` 1.00 … `Lower` 0.10)
  is a constant in `molao_core::court::Tier::authority_weight`, shared by every
  jurisdiction. A profile chooses which tier each of its courts sits in; it
  cannot re-weight a tier. If a hierarchy genuinely needs different weights,
  that is a gap in the model — report it as one.
- **Citation styles.** There is no field selecting which citation forms apply.
  Every profile is parsed with the same grammar; a jurisdiction that does not
  use reported citations simply enumerates no series and matches none, which is
  what the `GENERIC` profile does and is the correct answer rather than a
  missing feature.

The **generic** profile carries no court codes and no series. It still parses
neutral citations, using the shape rule described in
[CITATIONS.md](CITATIONS.md), and flags every court code as unknown. That is
enough to build a citation graph over any jurisdiction's judgments on the day
somebody starts, and the profile can be filled in later without re-ingesting
anything.

## The tier model

Tiers are the one part deliberately shared across jurisdictions, because every
common-law hierarchy has the same shape: an apex court, a general appellate
court, specialist appellate courts, first-instance superior courts, specialist
courts of equivalent standing, tribunals of record, and inferior courts.

`Tier` is ordered, `Apex` first. The weight is the multiplier applied to a
citation edge when scoring authority.

| Tier | Weight | What it is | ZA | UK |
|---|---|---|---|---|
| `Apex` | 1.00 | Binds every other court | Constitutional Court | Supreme Court |
| `Appellate` | 0.80 | General appellate court | Supreme Court of Appeal | Court of Appeal |
| `SpecialistAppellate` | 0.65 | Appellate courts of limited subject-matter | Labour Appeal, Competition Appeal | Employment Appeal Tribunal |
| `HighCourt` | 0.50 | First-instance superior courts | High Court divisions | High Court |
| `SpecialistHigh` | 0.45 | Superior standing, specialist jurisdiction | Labour, Land Claims, Tax, Electoral | — |
| `Tribunal` | 0.20 | Tribunals of record; cited, not binding | Competition Tribunal | First-tier Tribunal |
| `Lower` | 0.10 | Inferior courts. Rarely reported, never binding | Magistrates' courts | Magistrates' courts |

A profile need not populate every tier. It maps its own courts onto the tiers
that fit. The weights themselves are shared across jurisdictions and are not
profile data — see above.

These weights are deliberately coarse. They encode "an appellate judgment
relying on a case says more about that case than a first-instance judgment
does". They are not a theory of precedent, and no constant could be. If you
need doctrinal precision, read the judgments; the weights rank search results,
they do not settle arguments.

## The ZA profile

32 courts. This is the reference profile — the shape any other jurisdiction's
profile follows.

### Apex

| Code | Court | Seat |
|---|---|---|
| `ZACC` | Constitutional Court of South Africa | Johannesburg |

### Appellate

| Code | Court | Seat |
|---|---|---|
| `ZASCA` | Supreme Court of Appeal of South Africa | Bloemfontein |

### Specialist appellate

| Code | Court | Seat |
|---|---|---|
| `ZALAC` | Labour Appeal Court of South Africa | — |
| `ZACAC` | Competition Appeal Court of South Africa | — |

### High Court divisions

| Code | Division | Seat |
|---|---|---|
| `ZAGPPHC` | Gauteng Division | Pretoria |
| `ZAGPJHC` | Gauteng Local Division | Johannesburg |
| `ZAWCHC` | Western Cape Division | Cape Town |
| `ZAKZDHC` | KwaZulu-Natal Local Division | Durban |
| `ZAKZPHC` | KwaZulu-Natal Division | Pietermaritzburg |
| `ZAECGHC` | Eastern Cape Division | Grahamstown |
| `ZAECPEHC` | Eastern Cape Local Division | Gqeberha |
| `ZAECBHC` | Eastern Cape Local Division | Bhisho |
| `ZAECMHC` | Eastern Cape Local Division | Mthatha |
| `ZAFSHC` | Free State Division | Bloemfontein |
| `ZANWHC` | North West Division | Mahikeng |
| `ZANCHC` | Northern Cape Division | Kimberley |
| `ZALMPPHC` | Limpopo Division | Polokwane |
| `ZALMPTHC` | Limpopo Local Division | Thohoyandou |
| `ZAMPMBHC` | Mpumalanga Division | Mbombela |
| `ZAMPMHC` | Mpumalanga Local Division | Middelburg |

### Specialist courts of High Court status

| Code | Court | Seat |
|---|---|---|
| `ZALC` | Labour Court of South Africa | — |
| `ZALCJHB` | Labour Court of South Africa | Johannesburg |
| `ZALCCT` | Labour Court of South Africa | Cape Town |
| `ZALCD` | Labour Court of South Africa | Durban |
| `ZALCPE` | Labour Court of South Africa | Gqeberha |
| `ZALCC` | Land Claims Court of South Africa | — |
| `ZATC` | Tax Court of South Africa | — |
| `ZAEC` | Electoral Court of South Africa | — |

### Tribunals

| Code | Body |
|---|---|
| `ZACT` | Competition Tribunal of South Africa |
| `ZAWT` | Water Tribunal of South Africa |
| `ZACGSO` | Companies Tribunal of South Africa |
| `ZAICT` | Information Regulator of South Africa |

## Pan-African profiles

Twelve further profiles ship built in, covering AfricanLII / Free Access to Law
member jurisdictions. Each uses the neutral-citation designators the relevant LII
already publishes — inventing codes would fragment the graph against every
citation already in the literature — and each ships both as a
`molao_core::region` constant and as `profiles/<cc>.toml`. A test parses the
file and asserts it is the *same profile* as the constant — same courts, same
series, same fingerprint. (It is not a byte comparison: reformatting the TOML
or moving a comment is allowed, changing a code is not.) None is the default; a
node serving one selects it with `region::resolve("KE")` and holds an
`Extractor::for_profile`, and because they are never read by the default
extractor, adding them changes no existing extraction output and is **not** an
`EXTRACTOR_VERSION` bump.

The honesty rule for these is strict: a court code is exactly the thing a legal
tool must get right, because a wrong code silently drops every citation carrying
it. So a code that could not be verified against a published judgment was
omitted, and a jurisdiction whose citation practice is genuinely thin is marked
**partial** rather than padded to look complete. A partial-but-correct profile is
useful; a complete-but-wrong one is a liability.

| Code | Jurisdiction | Apex | Status | Report series |
|---|---|---|---|---|
| `KE` | Kenya | `KESC` (Supreme Court) | complete — superior courts | `KLR` |
| `UG` | Uganda | `UGSC` (Supreme Court) | complete — principal courts | — |
| `TZ` | Tanzania | `TZCA` (Court of Appeal) | complete — principal courts | — |
| `ZW` | Zimbabwe | `ZWCC` + `ZWSC` | complete — principal courts | `ZLR` |
| `NA` | Namibia | `NASC` (Supreme Court) | complete — principal courts | `NR` |
| `BW` | Botswana | `BWCA` (Court of Appeal) | complete — principal courts | `BLR` |
| `GH` | Ghana | `GHASC` (Supreme Court) | complete — superior courts | — |
| `NG` | Nigeria | `NGSC` (Supreme Court) | **partial / seed** | — |
| `MW` | Malawi | `MWSC` (Supreme Court of Appeal) | complete — principal courts | — |
| `ZM` | Zambia | `ZMSC` + `ZMCC` | complete — principal courts | — |
| `LS` | Lesotho | `LSCA` (Court of Appeal) | complete — principal courts | `LLR` |
| `SZ` | Eswatini | `SZSC` (Supreme Court) | complete — principal courts | — |

A few points these profiles surface about the model:

- **Not every jurisdiction has a supreme court above its court of appeal.**
  Tanzania, Botswana and Lesotho are apex *at* the Court of Appeal, and Malawi's
  apex is styled the Supreme Court of Appeal. The `Apex` tier is defined by
  finality, not by name, so each maps cleanly.
- **Some jurisdictions have two apex courts.** Zimbabwe (`ZWCC`/`ZWSC`) and
  Zambia (`ZMSC`/`ZMCC`) each have a constitutional court that is final on
  constitutional questions and a general court final on everything else. Both sit
  at `Apex`; the tier model allows more than one, and the "no court outranks the
  apex" invariant still holds because apex does not outrank apex.
- **A superior court can carry High-Court status without being the High Court.**
  Kenya's Employment and Labour Relations Court and Environment and Land Court
  have, by the Constitution, the status of the High Court; they map to
  `SpecialistHigh`, exactly as South Africa's Labour Court does.
- **Most enumerate few or no report series.** These LIIs cite mainly by neutral
  citation, so an empty series list is the correct, precise answer — the same
  stance the generic profile takes — not a missing feature. Series were added
  only where a jurisdiction's local report is verifiable and cited in the
  `year (volume) ABBR page` form the parser models (`KLR`, `ZLR`, `NR`, `BLR`,
  `LLR`).

**Nigeria is a deliberate seed, not an authority.** Only `NGSC` was confirmed
against a published judgment in this pass; `NGCA` and `NGHC` follow the
laws.africa country-plus-court convention but were not each verified. More
fundamentally, Nigerian citation runs overwhelmingly on the reported series
(chiefly the Nigerian Weekly Law Reports, `NWLR`), cited in forms this extractor
does not model, so a Nigerian corpus is under-covered by neutral-citation
extraction whatever the profile holds. `profiles/ng.toml` states this in full.
Treat it as a starting point to be completed by someone who works in the
jurisdiction, not as a checked reference.

## Unknown codes

No profile is exhaustive of every tribunal in its jurisdiction, and no
jurisdiction's registry stays current by itself. So unknown codes are handled
rather than assumed away:

- Looking up an unregistered code returns nothing. It does not panic.
- Its authority weight is the `Lower` floor, `0.10`. Unknown does not mean
  unimportant; it means there is no basis to weight it up, so it gets the floor
  rather than a guess.
- The citation parser **keeps** a citation with an unrecognised court code and
  flags it (`known_court: false`). Ingest records it. A new division's
  judgments must not silently vanish from the graph while somebody gets round to
  updating a table.

This is also what makes the **generic** profile usable: under it every code is
unknown, so every citation is kept and flagged, and the graph is built on the
shape of the citation alone.

Lookup is case-insensitive.

## Adding a jurisdiction

Adding a jurisdiction must never require touching core logic. What you supply,
in one TOML file:

1. **A profile code** — the ISO country code is the convention (`ZA`, `UK`,
   `AU`, `NZ`, `KE`) — and a display name.
2. **The court registry** — for each court: neutral-citation code, name as it
   appears on judgments, tier, and seat where the code distinguishes one. Use
   the codes your LII already publishes; inventing new ones fragments the graph
   against every existing citation.
3. **The report series** — abbreviation, full title, and whether it is cited
   with a volume number. Enumerating these is what stops the reported-citation
   parser matching ordinary prose ([CITATIONS.md](CITATIONS.md)).

Both `[[courts]]` and `[[series]]` may be empty; a profile with neither is
legitimate, and is what `GENERIC` is. The format in full, with a worked
example, is in [`profiles/README.md`](https://github.com/vul-os/molao/blob/main/profiles/README.md).

Then run your node against it:

```sh
molao --profiles /etc/molao/profiles regions   # check what resolved
molao --profiles /etc/molao/profiles serve
```

What you do **not** supply: any code. If a jurisdiction cannot be expressed as
profile data, that is a gap in the profile model and it should be reported as
one rather than worked around with a special case.

Contributing a profile *to this repository* is the same file plus its constant
in `molao_core::region`, because the compiled-in set is the fallback a node with
no `--profiles` flag reads. The directory-scan test above fails if you add one
without the other.

Tests enforce the invariants for every profile: codes unique within a profile,
no court outranking the apex court, tier ordering matching the hierarchy.

**Adding or changing profile data changes what the citation parser accepts as a
known code, which changes extraction output.** For a profile that ships in this
repository, that means an `EXTRACTOR_VERSION` bump — see
[CITATIONS.md](CITATIONS.md).

A profile you loaded from your own disk is outside that pin by construction: no
version string here can describe a file this project has never seen. What makes
such a graph reproducible instead is the pair (`EXTRACTOR_VERSION`, the
profile's **fingerprint**) — a BLAKE3 hash over the registry itself, printed by
`molao regions`. The first pins the grammar, the second pins the data it was
applied to. Record both alongside any graph you publish.

## What a profile does not encode

- **Which court binds which.** Cross-division and cross-jurisdiction
  persuasiveness is a doctrinal question with contested answers; a lookup table
  would be a confident wrong answer.
- **Court name changes over time.** The name recorded is the current one.
  Historical renaming is handled by the series registry where the old court's
  reports have their own abbreviation, not by the court registry.
- **Anything about the merits.** A tier is about where a judgment sits in the
  hierarchy, never about whether it was correctly decided.
