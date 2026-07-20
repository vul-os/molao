# Region profiles

A region profile is one jurisdiction's citation data: which court codes exist,
where each court sits in the hierarchy, and which law-report series are cited.
It is **data, not code**. Adding a jurisdiction to Molao means adding a file
like the ones here and nothing else.

| File | What it is |
|---|---|
| `za.toml` | South Africa. The reference profile — 32 courts, 24 series. Kept byte-equal to the built-in `molao_core::region::ZA` by a test. |
| `generic.toml` | No courts, no series. Usable in any jurisdiction on day one; see its comments for exactly what it does and does not find. |

Every file below ships alongside a built-in constant in `molao_core::region`, and
a test asserts the two are byte-for-byte the same profile, so the "data, not
code" claim holds for each — a hand-edit to either side fails the build.

See [docs/COURTS.md](../docs/COURTS.md) for the model and
[docs/CITATIONS.md](../docs/CITATIONS.md) for what the parser does with it.

## Pan-African profiles

Twelve jurisdictions of the AfricanLII / Free Access to Law network, using the
neutral-citation designators the relevant LII already publishes. Each file's
header names the source URLs the codes were taken from. Court codes are the one
thing a legal tool cannot afford to get wrong — a wrong code silently drops every
citation carrying it out of the graph — so where a code could not be verified it
was **omitted**, and where a jurisdiction's practice is genuinely thin the whole
profile is marked **partial** rather than padded with plausible guesses.

| File | Jurisdiction | Status | Notes |
|---|---|---|---|
| `ke.toml` | Kenya | complete (superior courts) | Apex `KESC`; `KEELRC`/`KEELC` have High-Court status. Series: `KLR`. |
| `ug.toml` | Uganda | complete (principal courts) | Apex `UGSC`; High Court under `UGHC`, `UGHCCD`, `UGHCCRD`. |
| `tz.toml` | Tanzania | complete (principal courts) | Apex is the Court of Appeal `TZCA`; High Court divisions included. |
| `zw.toml` | Zimbabwe | complete (principal courts) | Two apex courts (`ZWCC`, `ZWSC`); per-seat High Court. Series: `ZLR`. |
| `na.toml` | Namibia | complete (principal courts) | Apex `NASC`; per-division High/Labour Court. Series: `NR`. |
| `bw.toml` | Botswana | complete (principal courts) | Apex is the Court of Appeal `BWCA`. Series: `BLR`. |
| `gh.toml` | Ghana | complete (superior courts) | `GHASC` / `GHACA` / `GHAHC`. No verifiable series. |
| `ng.toml` | Nigeria | **partial / seed** | Only `NGSC` verified; practice runs on reported series (`NWLR`) this extractor does not model. |
| `mw.toml` | Malawi | complete (principal courts) | Apex is the Supreme Court of Appeal `MWSC`. |
| `zm.toml` | Zambia | complete (principal courts) | Two apex courts (`ZMSC`, `ZMCC`); `ZMCA` below them. |
| `ls.toml` | Lesotho | complete (principal courts) | Apex is the Court of Appeal `LSCA`. Series: `LLR`. |
| `sz.toml` | Eswatini | complete (principal courts) | Apex `SZSC`; `SZICA` / `SZIC` for labour. |

"Complete" here means the apex, appellate and principal superior courts — what a
citation graph needs to rank authority — not an exhaustive roll of every registry
and tribunal. Adding a further division later is a data edit, not a code change.
Most of these enumerate few or no report series, because their LIIs cite mainly
by neutral citation; that is honest (see `generic.toml`), not a stub.

## Format

```toml
code = "ZA"            # jurisdiction identifier; the ISO country code by convention
name = "South Africa"  # display only

[[courts]]
code = "ZACC"                                    # neutral-citation code
name = "Constitutional Court of South Africa"    # as it appears on the judgment
tier = "apex"                                    # see the tier table below
seat = "Johannesburg"                            # optional; omit where the code carries no seat

[[series]]
abbr = "SA"                                # abbreviation as cited
name = "South African Law Reports"         # full title
# no_volume = true                         # only for pre-volume series cited as `1936 AD 123`
```

Both `[[courts]]` and `[[series]]` are optional. A profile with neither is
legitimate — that is what `generic.toml` is.

### Tiers

| `tier` value | Weight | What it is |
|---|---|---|
| `apex` | 1.00 | Binds every other court |
| `appellate` | 0.80 | General appellate court |
| `specialist_appellate` | 0.65 | Appellate courts of limited subject-matter |
| `high_court` | 0.50 | First-instance superior courts |
| `specialist_high` | 0.45 | Superior standing, specialist jurisdiction |
| `tribunal` | 0.20 | Tribunals of record; cited, not binding |
| `lower` | 0.10 | Inferior courts |

A profile need not use every tier. Map your courts onto the ones that fit.

## Contributing a jurisdiction

1. **Use the codes your LII already publishes.** BAILII, AustLII, NZLII, CanLII
   and the AfricanLII members all publish neutral citations with the same
   grammar; inventing new codes fragments the graph against every citation that
   already exists in the literature.
2. **Enumerate the report series.** This is the part that matters most for
   precision. The series list is the only thing standing between the
   reported-citation parser and every `section 3 (1) of the Companies Act 71 of
   2008` in the corpus.
3. **Mark historical series** with `no_volume = true` — those cited as year,
   series, page with no bracketed volume.
4. **Run the tests.** Uniqueness of codes and series within a profile, and no
   court outranking the apex court, are enforced for every built-in profile.
5. **Bump `EXTRACTOR_VERSION`** if you change a profile that is already in use.
   Court codes decide whether a citation is flagged known, and series decide
   whether a reported citation is found at all — both are extraction output, and
   extraction output is what a release manifest pins. If one version string can
   produce two different graphs, verification by recomputation verifies nothing.

If your jurisdiction cannot be expressed in this format, that is a gap in the
model. Report it as one; do not work around it with a special case in the
parser.

## Worked example: a UK stub

**This is an illustrative example, not a maintained profile.** It is here to
show the shape of a second jurisdiction — it is deliberately tiny, it is not
checked against BAILII, and it should not be used as-is. Nothing in the codebase
loads it.

```toml
code = "UK"
name = "United Kingdom"

[[courts]]
code = "UKSC"
name = "Supreme Court of the United Kingdom"
tier = "apex"
seat = "London"

[[courts]]
code = "EWCA"
name = "Court of Appeal of England and Wales"
tier = "appellate"
seat = "London"

[[courts]]
code = "EWHC"
name = "High Court of Justice of England and Wales"
tier = "high_court"
seat = "London"

[[series]]
abbr = "WLR"
name = "Weekly Law Reports"

[[series]]
abbr = "All ER"
name = "All England Law Reports"

[[series]]
abbr = "AC"
name = "Law Reports, Appeal Cases"
```

A real UK profile would need the divisional codes (`EWHC (Admin)`, `(Ch)`,
`(QB)`/`(KB)`), the tribunals, and the Scottish and Northern Irish hierarchies,
which is exactly the sort of work this file format exists to make possible
without touching a line of Rust.
