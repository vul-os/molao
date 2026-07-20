# Roadmap

Where the project actually is, and what comes next. Status labels are used
consistently across this repository:

- **Done** — written, tested, and usable
- **In progress** — being written now
- **Designed, not built** — the model and the reasoning exist; the code does not
- **Deliberately excluded** — not a gap; a decision, with reasons

**This session (2026-07-20), three crates are landing in parallel:**
`molao-ingest` (sourcing — the robots-respecting crawler, the licensed-bulk
importer, and the witness-signing daemon behind [docs/SOURCES.md](docs/SOURCES.md)
and [docs/PROVENANCE.md](docs/PROVENANCE.md)), `molao-dist` (distribution — a
release as content-addressed files over iroh, a torrent export, or a plain
HTTP mirror; see [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)), and
`molao-index` (a local, rebuildable, unsigned RAG cache — never part of a
release; see [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md#why-a-rebuildable-cache-rag-index-does-not-reopen-this-hole)).
None of the three has run against real data yet. They move the phases below
from designed to in-progress; they do not produce a public corpus, a live P2P
network, or a shared index by themselves — that is still ahead.

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

### Local search (RAG index) · In progress

Lexical search over FTS5 is real and shipped. Semantic search is not excluded
outright — only excluded from ever being **trusted on say-so**. A node may
build its own local vector-plus-keyword index over already-verified corpus
text, embedded, no server, and may optionally share it with other nodes as an
**unsigned, model-tagged cache anyone can rebuild and check** — never as part
of a signed release. The corpus stays the only signed truth; see
[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md#why-a-rebuildable-cache-rag-index-does-not-reopen-this-hole)
for why that does not reopen the embeddings-exclusion argument below.

This is `molao-index`, landing this session. It has not built a real index
yet, and the cache-sharing path is design, not a running feature.

## Phase 2 — Verification end to end · Designed, not built

Today `molao-core` can verify a quorum and a chain. It cannot yet check that the
corpus and graph are what the manifest says they are.

- Corpus root computation over sorted document ids
- Graph root computation, and re-running a pinned `EXTRACTOR_VERSION` to
  compare byte for byte
- A single `molao verify` command performing all six verification steps
- Reproducible-build tooling so two builders can prove they agree

## Phase 3 — The corpus · In progress

The hardest phase, and mostly not a software problem. Sourcing ethics are
settled and are a floor, not a default: [docs/SOURCES.md](docs/SOURCES.md).

**Landing this session, as `molao-ingest`:**

- Direct ingest from courts and gazettes
- A polite, robots-respecting crawl for courts and gazettes that only
  self-publish, with no bulk licence and no LII in between
- Akoma Ntoso ingest from licensed Laws.Africa / AfricanLII bulk data
- The witness daemon: fetch, hash raw bytes, sign, publish
- Corroboration collection and disagreement workflow

None of the above has ingested a real document yet. Landing the software is
not the same as having run it against a real jurisdiction.

**Still designed, not built — and mostly institutional, not code:**

- Per-document licensing metadata (today `Provenance` records a source URL,
  which is a proxy and not the same thing)
- Assembling a genuinely independent signer set across institutions and
  jurisdictions — see [GOVERNANCE.md](GOVERNANCE.md)
- The first signed release — blocked on the above, not on `molao-ingest`

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

## Phase 5 — Distribution · In progress

A release is a content-addressed file set plus a signed manifest
([docs/RELEASES.md](docs/RELEASES.md)), which is what makes the transport
below safe to leave untrusted. Full story in
[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

**Landing this session, as `molao-dist`:**

- Content-addressed release packaging
- P2P release distribution over `iroh`, as the primary transport
- A torrent export for archival and fallback mirroring — universities and
  archives seed it with tools they already run, and the corpus can outlive
  this project

Neither transport has carried a real release yet, because there is no public
release yet. Today the only transport actually in use is a plain HTTP mirror,
fetched by hand.

**Still designed, not built:**

- Public append-only log of manifests, with independent monitors
- Systematic split-view detection rather than manual head comparison —
  depends on the log above
- Network health surfaced publicly: who mirrors what, which release, how
  corroborated

P2P will make distribution faster and harder to censor. It will **never** be
required to read the law. The offline guarantee outranks it.

## Deliberately excluded

Not backlog. Decisions.

| Excluded | Why |
|---|---|
| **Embeddings in releases** | Float inference is not reproducible across hardware, so a contributed index could never be verified; and a poisoned index is worse than a poisoned document because the text stays correct while retrieval quietly steers. Build one locally if you want one — that is exactly what `molao-index` (above, landing this session) is for: an unsigned, rebuildable cache, never a release artifact. [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md#why-embeddings-are-excluded-from-releases) |
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
