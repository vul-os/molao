# Courts and region profiles

Molao is jurisdiction-neutral. **No country is hardcoded into core logic.**
Everything jurisdiction-specific — court codes, court names, hierarchy tiers,
authority weights, law-report series, citation styles — ships as a **region
profile**: data a node picks, never an assumption baked into the parser.

A **generic** profile makes Molao usable in any jurisdiction from day one,
before a dedicated profile for it exists. **ZA (South Africa) is the first
fully-populated profile**, and it is the worked example throughout this
document. It is never special-cased.

> **Status: implemented.** Region profiles live in
> `molao_core::region`. `RegionProfile` carries the court and series registries;
> `ZA` and `GENERIC` ship built in; `RegionProfile::from_toml` loads one at
> runtime; `region::builtin`, `region::all_builtin` and `region::default_profile`
> (which returns `ZA`) select between them. The ZA profile also ships as
> [`profiles/za.toml`](https://github.com/vul-os/molao/blob/main/profiles/za.toml), and a test asserts that parsing it
> yields exactly the built-in constant, so the two cannot drift.
>
> `molao_core::court::lookup`, `is_known_code` and `authority_weight` remain as
> convenience wrappers over the default profile.

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
| Court registry | Neutral-citation code → name, tier, seat | `ZACC` → Constitutional Court of South Africa, `Apex`, Johannesburg |
| Hierarchy tiers | Which of the tiers below the jurisdiction uses | All seven |
| Authority weights | Multiplier per tier when scoring citation edges | `Apex` 1.00 … `Lower` 0.10 |
| Report series | Abbreviation → title, and whether it is cited with a volume | `SA` → South African Law Reports; `AD` → Appellate Division Reports, no volume |
| Citation styles | Which citation forms the jurisdiction uses | Neutral, reported (volume), reported (historical), case number |

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
that fit; the weights come from the profile, so a jurisdiction whose hierarchy
weights differently may say so.

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

Adding a jurisdiction must never require touching core logic. What you supply:

1. **A profile code** — the ISO country code is the convention (`ZA`, `UK`,
   `AU`, `NZ`, `KE`).
2. **The court registry** — for each court: neutral-citation code, name as it
   appears on judgments, tier, and seat where the code distinguishes one. Use
   the codes your LII already publishes; inventing new ones fragments the graph
   against every existing citation.
3. **Authority weights**, if the defaults do not fit your hierarchy.
4. **The report series** — abbreviation, full title, and whether it is cited
   with a volume number. Enumerating these is what stops the reported-citation
   parser matching ordinary prose ([CITATIONS.md](CITATIONS.md)).
5. **Which citation styles apply.** Not every jurisdiction uses all four forms.

What you do **not** supply: any code. If a jurisdiction cannot be expressed as
profile data, that is a gap in the profile model and it should be reported as
one rather than worked around with a special case.

Tests enforce the invariants for every profile: codes unique within a profile,
no court outranking the apex court, tier ordering matching the hierarchy.

**Adding or changing profile data changes what the citation parser accepts as a
known code, which changes extraction output.** That means an
`EXTRACTOR_VERSION` bump — see [CITATIONS.md](CITATIONS.md).

## What a profile does not encode

- **Which court binds which.** Cross-division and cross-jurisdiction
  persuasiveness is a doctrinal question with contested answers; a lookup table
  would be a confident wrong answer.
- **Court name changes over time.** The name recorded is the current one.
  Historical renaming is handled by the series registry where the old court's
  reports have their own abbreviation, not by the court registry.
- **Anything about the merits.** A tier is about where a judgment sits in the
  hierarchy, never about whether it was correctly decided.
