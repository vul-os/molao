# Roadmap

Where the project actually is, and what comes next. Status labels are used
consistently across this repository:

- **Done** — written, tested, and usable
- **In progress** — being written now
- **Designed, not built** — the model and the reasoning exist; the code does not
- **Deliberately excluded** — not a gap; a decision, with reasons

**Three crates are in the workspace against the phases below:**
`molao-ingest` (sourcing — the robots-respecting crawler, the licensed-bulk
importer, and the witness-signing daemon behind [docs/SOURCES.md](docs/SOURCES.md)
and [docs/PROVENANCE.md](docs/PROVENANCE.md)), `molao-dist` (distribution — a
release as content-addressed files over iroh, a torrent export, or a plain
HTTP mirror; see [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)), and
`molao-index` (a local, rebuildable, unsigned RAG cache — never part of a
release; see [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md#why-a-rebuildable-cache-rag-index-does-not-reopen-this-hole)).

All three are now wired into the node binary: `molao release
publish/sign/fetch/torrent` reaches `molao-dist`, `molao index build` reaches
`molao-index`, and `molao fetch` / `molao crawl` reach `molao-ingest`.
**None of the three has run against real data.** They move the phases below
from designed to in-progress; they do not produce a public corpus, a live P2P
network, or a shared index by themselves — that is still ahead, and it is the
part that is not a software problem.

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

Court and law-report registries are TOML profiles a node loads at run time:
`molao --profiles <DIR>` reads a directory of them and they take precedence
over the profiles compiled into the binary, which remain as the fallback for
whatever an operator did not supply. `molao regions` prints what an invocation
resolves, where each profile came from, and its fingerprint.

Fourteen profiles ship both ways — as `profiles/<cc>.toml` and as constants in
`molao_core::region`. A test scans the directory and asserts every file is the
same profile as its constant, so the two cannot drift and neither can be added
without the other. `ZA` is populated; `GENERIC` works anywhere from day one.
Adding a jurisdiction to *your node* means writing a file; adding one to this
repository means the file plus its fallback constant — see
[docs/COURTS.md](docs/COURTS.md#adding-a-jurisdiction) and
[profiles/README.md](profiles/README.md).

The weights per tier are shared constants, not profile data. That is a
deliberate limit of the model, not an omission.

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

This is `molao-index`. It is in the workspace, tested, and wired into the
node (`molao index build`, `/api/rag/search`). It has not built an index over a
real corpus yet, and the cache-sharing path is design, not a running feature.

## Phase 2 — Verification end to end · Built, never run on a real release

`molao verify` performs **seven** steps, each reporting PASS / FAIL / SKIP with
the evidence it examined, and a SKIP is not a pass — the command exits 0 only
when all seven pass, 1 on failure, and 2 on an incomplete run.

- Corpus root computation over sorted document ids · **built**
- Graph root computation, and re-running the pinned `EXTRACTOR_VERSION` to
  compare byte for byte · **built** (step 7 also requires the corpus's own
  citation table to agree with what the stored text produces, so a database
  edited underneath its paragraphs fails rather than verifying against its
  own tampering)
- A single `molao verify` command performing every step · **built**
- Signer-set binding: a manifest names the set that signed it
  (`molao-release-v2`), so a roster mismatch is reported as such · **built**
- Reproducible-build tooling so two builders can prove they agree · **not
  built**

`molao-core`'s roots are defined once and shared, rather than transcribed per
crate as they were. The seven steps were each mutation-tested individually —
including with backstops disabled, so that a guard sitting behind a broader
integrity check could not read as live when it was dead.

**What this does not mean:** no public release has ever been verified, because
none exists. The command has only ever run against synthetic corpora.

## Phase 3 — The corpus · In progress

The hardest phase, and mostly not a software problem. Sourcing ethics are
settled and are a floor, not a default: [docs/SOURCES.md](docs/SOURCES.md).

**In `molao-ingest`:**

- Direct ingest from courts and gazettes
- A polite, robots-respecting crawl for courts and gazettes that only
  self-publish, with no bulk licence and no LII in between
- Akoma Ntoso ingest from licensed Laws.Africa / AfricanLII bulk data
- A live crawler for the AfricanLII peachjam network (`molao fetch` / `molao
  crawl`), honouring `robots.txt`, crawl-delay, and `Content-Signal`
- The witness daemon: fetch, hash raw bytes, sign, publish
- Corroboration collection and disagreement workflow

None of the above has assembled a real corpus yet. Writing the software is
not the same as having run it against a real jurisdiction.

### Where the corpus can come from · a live map

A July 2026 sweep of the free-access-to-law world found the honest shape of the
problem: **the LII aggregators mostly forbid AI use** (via `Content-Signal:
ai-input=no`, or by blocking AI crawlers, or in their terms), so a RAG corpus
has to come from **courts and official publishers directly, or under licence**.
The full per-jurisdiction picture — what is usable now, what needs an adapter,
and what needs a licence application — is [docs/SOURCE-MAP.md](docs/SOURCE-MAP.md).
`molao sources` prints the crawler's built-in registry and each host's live
eligibility.

Coverage in brief: **usable now** — New Zealand, Kenya, Ghana, Scotland,
Northern Ireland, South Africa (Constitutional Court direct); **with a free
paperwork step** — England & UK Supreme Court (National Archives), Ireland,
Australia, federal Canada; **via a Laws.Africa licence** — most of Africa as
bulk; **preliminary** — the EU (EUR-Lex/CJEU), France, the Netherlands,
Germany. Off-limits by their own policy: BAILII, AustLII, NZLII, CanLII, SAFLII.

### How the community can help

This is where an OSS community moves the needle faster than any single team,
and the work is deliberately laid out as pick-up tasks in
[docs/SOURCE-MAP.md](docs/SOURCE-MAP.md#how-the-community-can-help):

- **Verify a court-direct host** with `molao crawl <host> --dry-run` and report.
- **Write a court-direct adapter** (NZ courts, Ghana e-Judgment, SA
  Constitutional Court, EUR-Lex) behind the same `SourceAdapter` trait the
  peachjam adapter uses — the highest-leverage code contribution.
- **Add a region profile** (court codes + report series) for a new jurisdiction:
  a TOML file, no code — [docs/COURTS.md](docs/COURTS.md#adding-a-jurisdiction).
- **File the paperwork.** The licence and permission requests are drafted and
  ready in [`paperwork/`](paperwork/) — filing them is a human action, and the
  single biggest unlock.

**Still designed, not built — and mostly institutional, not code:**

- Per-document licensing metadata (today `Provenance` records a source URL,
  which is a proxy and not the same thing)
- Assembling a genuinely independent signer set across institutions and
  jurisdictions — see [GOVERNANCE.md](GOVERNANCE.md)
- The first signed release — blocked on the above, not on `molao-ingest`

## Phase 4 — The citator · Mechanism built, nobody has attested anything

The real prize, and the thing that makes the difference between a document
archive and a tool a lawyer can rely on.

A corpus that does not know case A was overruled by case B will hand a lawyer
dead authority. The mechanical layer — who cited whom, at which paragraph — is
deterministic and verifiable, and it was already built. The interpretive layer
now has machinery too, but no content.

- Treatment attestations: followed, distinguished, overruled, applied,
  questioned · **built**
- Attestations are **signed** and attributable · **built** — Ed25519, checked
  on ingest *and again on every read*, because attestations are excluded from
  the release root and so carry no outer signature over them
- Attestations **may conflict**, and conflicts are **shown, not resolved**. Two
  scholars can read the same judgments and differ; a system that picks a winner
  and hides the argument is lying about how law works · **built**, and there is
  no resolution function anywhere in the crate — a test greps the API payload
  for `winner`, `preferred`, `consensus`, `majority` and `authoritative` to
  keep it that way
- A reader-side trust policy: which signers *this reader* weighs · **built**
- API that separates the verifiable mechanical edge from the interpretive claim
  on top of it · **built** — they are sibling objects with distinct `kind`
  tags, never one list with a flag
- Currency warnings driven by attestations rather than by guesswork · **built**,
  and no signal variant means "good law"
- **UI for any of the above · not built**
- **Gossip and an authoring path · not built.** Attestations arrive only by
  `molao attest import` against a local database

**Nobody has ever attested anything.** The machinery is exercised entirely by
fixtures. Until real attestors exist, **check currency yourself** — this
remains the most important gap in the project, and building the mechanism did
not close it. What it closed is the excuse for not having somewhere to put the
answer.

## Phase 5 — Distribution · In progress

A release is a content-addressed file set plus a signed manifest
([docs/RELEASES.md](docs/RELEASES.md)), which is what makes the transport
below safe to leave untrusted. Full story in
[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

**Built, as `molao-dist`, and reachable from `molao release`:**

- Content-addressed release packaging · `molao release publish`
- P2P release distribution over `iroh`, as the primary transport · behind its
  feature flag
- A torrent export for archival and fallback mirroring — universities and
  archives seed it with tools they already run, and the corpus can outlive
  this project · `molao release torrent`
- Fetch with verification on receipt · `molao release fetch`, which **writes
  nothing if verification fails**

Neither transport has carried a real release, because there is no public
release. Nothing has been seeded. The only transport ever actually used is a
plain HTTP mirror, fetched by hand.

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
| **Embeddings in releases** | Float inference is not reproducible across hardware, so a contributed index could never be verified; and a poisoned index is worse than a poisoned document because the text stays correct while retrieval quietly steers. Build one locally if you want one — that is exactly what `molao-index` (above) is for: an unsigned, rebuildable cache, never a release artifact. [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md#why-embeddings-are-excluded-from-releases) |
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
