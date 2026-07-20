# Roadmap

Where the project actually is, and what comes next. Status labels are used
consistently across this repository:

- **Done** — written, tested, and usable
- **In progress** — being written now
- **Designed, not built** — the model and the reasoning exist; the code does not
- **Deliberately excluded** — not a gap; a decision, with reasons

## Phase 0 — Foundations · Done

The layers everything else has to agree on exactly.

- `DocId` as BLAKE3 of canonical text, with `verify_id()`
- `canonicalise()`: line endings, typography, whitespace, blank-line trimming;
  idempotent, with tests proving two converter outputs agree
- The structured `Judgment` and `Paragraph` model, keeping printed paragraph
  numbers alongside dense indices
- `Provenance` and `ProvenanceClass`, with corroboration that a misconfigured
  threshold cannot weaken
- The shared seven-tier hierarchy, authority weights and graceful handling of
  unknown codes, with `ZA` as the first fully-populated region profile (32
  courts)
- Threshold-signed releases: length-prefixed signing bytes, fail-closed
  verification, one-signer-one-vote, `threshold >= 2` enforced, hash chaining
- `molao-cite`: neutral, modern reported, historical reported and case-number
  citations, in a jurisdiction-neutral grammar; 24-series `ZA` registry; paragraph and page pinpoints; stable citation
  keys; deterministic ordering; precision tests against prose and statutes

### Region profiles · Done

Court and law-report registries are loadable TOML profiles, not compiled-in
constants. `ZA` ships populated; `GENERIC` works anywhere from day one.
`profiles/za.toml` is parsed in a test and asserted equal to the built-in ZA
profile, so the two cannot drift. Adding a jurisdiction means writing a file —
see [docs/COURTS.md](docs/COURTS.md#adding-a-jurisdiction) and
[profiles/README.md](profiles/README.md).

The honest limit: `GENERIC` finds neutral citations and case numbers, not
reported ones. Enumerating a jurisdiction's law-report series is what makes
reported-citation parsing possible at all.

## Phase 1 — A working node · In progress

Making the corpus readable.

- `molao-corpus`: SQLite storage, FTS5 search, ingest — **in progress**
- `molao-graph`: citation edges, resolution against the corpus, authority
  scoring — **in progress**
- The node binary: `axum` HTTP server implementing [docs/API.md](docs/API.md),
  UI embedded via `rust-embed` — **in progress**
- `apps/web`: TypeScript, Vite, Preact. Search, judgment, citations, graph and
  status screens — **in progress**
- `molao demo`: seed a synthetic corpus so a fresh clone shows something —
  **in progress**

**There is no bundled corpus.** A node starts empty. This remains true until
Phase 3.

## Phase 2 — Verification end to end · Designed, not built

Today `molao-core` can verify a quorum and a chain. It cannot yet check that the
corpus and graph are what the manifest says they are.

- Corpus root computation over sorted document ids
- Graph root computation, and re-running a pinned `EXTRACTOR_VERSION` to
  compare byte for byte
- A single `molao verify` command performing all six verification steps
- Reproducible-build tooling so two builders can prove they agree

## Phase 3 — The corpus · Designed, not built

The hardest phase, and mostly not a software problem.

- Direct ingest from courts and gazettes
- Akoma Ntoso ingest from licensed Laws.Africa / AfricanLII bulk data
- The witness daemon: fetch, hash raw bytes, sign, publish
- Corroboration collection and disagreement workflow
- Per-document licensing metadata (today `Provenance` records a source URL,
  which is a proxy and not the same thing)
- Assembling a genuinely independent signer set across institutions and
  jurisdictions — see [GOVERNANCE.md](GOVERNANCE.md)
- The first signed release

Sourcing ethics are settled and are a floor, not a default:
[docs/SOURCES.md](docs/SOURCES.md).

## Phase 4 — The citator · Designed, not built

The real prize, and the thing that makes the difference between a document
archive and a tool a lawyer can rely on.

A corpus that does not know case A was overruled by case B will hand a lawyer
dead authority. The mechanical layer — who cited whom, at which paragraph — is
deterministic and verifiable, and it is built. The interpretive layer is not.

- Treatment attestations: followed, distinguished, overruled, applied,
  questioned
- Attestations are **signed** and attributable
- Attestations **may conflict**, and conflicts are **shown, not resolved**. Two
  scholars can read the same judgments and differ; a system that picks a winner
  and hides the argument is lying about how law works
- UI that separates the verifiable mechanical edge from the interpretive claim
  on top of it
- Currency warnings driven by attestations rather than by guesswork

Until this exists, **check currency yourself**. It is the most important gap in
the project, and the documentation says so everywhere rather than in one
footnote.

## Phase 5 — Distribution · Designed, not built

- P2P release distribution over `iroh`
- Public append-only log of manifests, with independent monitors
- Systematic split-view detection rather than manual head comparison
- Network health surfaced publicly: who mirrors what, which release, how
  corroborated

P2P will make distribution faster and harder to censor. It will **never** be
required to read the law. The offline guarantee outranks it.

## Deliberately excluded

Not backlog. Decisions.

| Excluded | Why |
|---|---|
| **Embeddings in releases** | Float inference is not reproducible across hardware, so a contributed index could never be verified; and a poisoned index is worse than a poisoned document because the text stays correct while retrieval quietly steers. Build one locally if you want one. [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md#why-embeddings-are-excluded-from-releases) |
| **Any hosted service** | No accounts, no telemetry, no billing, ever. There is nothing to be a customer of. |
| **Bulk SAFLII scraping** | SAFLII declines to be a bulk re-supplier and has said so. [docs/SOURCES.md](docs/SOURCES.md) |
| **Legislation** | A different grammar and corpus. Laws.Africa does it well. |
| **Editorial headnotes from commercial reports** | Genuinely the publisher's work. |
| **A single-signer release mode** | `threshold >= 2` is enforced in code and will not be made configurable. |

## Not scheduled

Things that would be good and have no date: **fully-populated profiles beyond
`ZA`** (`UK`, `AU`, `NZ`, `CA`, and the AfricanLII jurisdictions — each is
profile data plus a sourcing agreement, not core work), translation of the
interface into more languages, and an offline distribution format for places
where bandwidth is the binding constraint.
