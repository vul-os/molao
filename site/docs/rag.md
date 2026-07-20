# Search, retrieval, and the rebuildable index

This document describes Molao's semantic-search layer and, more importantly, the
line it does not cross. Read [THREAT-MODEL.md](THREAT-MODEL.md) first: the
argument for why embeddings are excluded from releases is the premise this whole
design is built to respect.

## The one rule

**A vector index is never part of a release, never signed, and never
authoritative.** It is a local, rebuildable *cache*. The corpus — content-addressed
judgments and a deterministically-extracted citation graph — remains the only
verifiable artifact. Nothing here changes that, and nothing here may be read as
changing it.

The reason is not effort. It is that float inference is not reproducible across
hardware, so a shared vector index could only ever be *trusted*, not *checked* —
and a poisoned index is worse than a poisoned document, because every judgment
stays byte-perfect while retrieval quietly steers you away from the case that
would have won the argument. There is no hash to compare and no witness to
disagree. So the index stays local, optional, and unsigned.

## What a node may do

A node operator may build an index **over already-verified text** and search it.
That is legitimate precisely because it is local: the text was verified by
recomputation before it was indexed, the index helps *you* find what is already
in *your* corpus, and no one else has to trust it. If an index is ever shared
between nodes, it travels as an **unsigned, model-tagged cache that the receiver
can rebuild and check** — see [Sharing and verification](#sharing-and-verification)
— never as part of an authoritative release.

## Engine

The index is `molao-index`: **embedded, single-file, no server, no network.**

- **Keywords** — SQLite **FTS5** over paragraph chunks (bm25 ranking). This is
  the same lexical engine as `/api/search`, applied at chunk granularity.
- **Vectors** — f32 embeddings stored in the same SQLite file, searched by
  **exact cosine** (brute force). Vectors are L2-normalized at build, so cosine
  is a dot product.
- **Fusion** — the two ranked lists are combined by **Reciprocal Rank Fusion**
  (RRF, k=60). RRF needs no score calibration between the two very different
  scales — bm25 scores and cosine similarities are not comparable numbers, but
  their ranks are.

Everything lives in a **sidecar file** next to the corpus, named `<db>.index`.
The corpus database is untouched; the index can be deleted and rebuilt at any
time with no risk to it. The signed thing and the unsigned cache are literally
different files.

### Why exact cosine, not an approximate index

Two reasons, both about the threat model rather than performance.

1. **Scale.** A legal commons is small — thousands of judgments, tens of
   thousands of paragraph chunks. Brute-force cosine over that is
   sub-millisecond. There is no problem an ANN index would solve here.
2. **Reproducibility.** An approximate-nearest-neighbour index (HNSW and
   friends) has a build order that is not deterministic across runs. That would
   add a *second* source of non-reproducibility on top of the one we cannot
   remove — float inference — and weaken the rebuild-and-check story below for no
   benefit. Exact search removes the index structure as a variable entirely.

We did not use the `sqlite-vec` extension. Registering a SQLite loadable
extension requires `unsafe` FFI, and `molao-index` is `#![forbid(unsafe_code)]`;
it would also link a second SQLite amalgamation beside the one `rusqlite` already
bundles. At this corpus size the extension buys nothing that justifies either
cost. If a corpus ever outgrows exact search, an ANN index drops in behind the
same interface.

## The index descriptor

This is what makes "an index for a model" a *checkable* claim rather than an
opaque blob. Every index records an `IndexDescriptor`:

| Field | Meaning |
|---|---|
| `embedder_id` | Family of embedding model, e.g. `fake-hash`, `openai-compat` |
| `model_version` | Version/weights tag, or the model name for a remote model |
| `dim` | Vector dimension, taken from the embeddings actually produced |
| `metric` | `cosine` |
| `quantization` | `f32` (none) |
| `normalization` | `unit-l2` |
| `chunker_id` / `chunker_params` | How judgments were split into chunks |
| `corpus_root` | The `corpus_root` this index was built from |

The **`descriptor_id`** is a BLAKE3 hash over the *model-space* fields —
embedder, version, dimension, metric, quantization, normalization, chunker. It
deliberately **excludes `corpus_root`**, for a specific reason:

- `descriptor_id` identifies the *space*. Two vectors are comparable only if
  their descriptor ids match. Different models get different ids, and several
  indexes for several models coexist in one file, each keyed by its id. The API's
  `?model=<descriptor-id>` selects one.
- `corpus_root` is recorded *alongside* for **staleness**. When the corpus
  changes, the right thing is to rebuild *the same* descriptor's vectors against
  the new corpus — not to mint a new, orphaned index. So a rebuild keeps the same
  `descriptor_id` and updates the recorded `corpus_root`; `/api/status` and
  `molao index info` flag an index as **stale** when its recorded root no longer
  matches the corpus the node serves.

A node checks the descriptor **before** using a cache. A dimension mismatch is
refused outright (`molao-index` returns a `DimMismatch` error; the API answers
400) rather than scoring a query against the wrong space and returning confident
nonsense. That refusal is the descriptor earning its place.

## Embedders — the node ships no model

`molao-index` defines an `Embedder` trait and provides two implementations.
**The node ships no embedding model of its own**, and never downloads one.

- **`FakeEmbedder`** — deterministic, offline, model-free. It feature-hashes
  tokens into a fixed-dimension vector and L2-normalizes. It is **not semantic**;
  it turns shared vocabulary into vector similarity, which is enough to exercise
  the whole hybrid pipeline. It is bit-for-bit reproducible on every machine,
  which is exactly why tests and `molao demo` use it — everything works with no
  model and no network.
- **`HttpEmbedder`** — a thin client for an OpenAI-compatible `/v1/embeddings`
  endpoint. This is how a real node gets semantic search: point it at a model
  **you** run — your own `llmux`, `llama.cpp`, Ollama, vLLM. It speaks plain
  HTTP/1.1 to a local endpoint (no bundled TLS stack); for a remote HTTPS
  provider, front it with a local proxy. It is optional in every sense: nothing
  in a default build or a test calls it, it adds no build dependency, and the
  operator supplies the model.

**Real semantic RAG requires the operator to supply an embedding model. Molao
provides none, and `molao demo`'s results are a demonstration of the pipeline,
not semantic search.**

## The API

### `GET /api/rag/search?q=&k=&model=<descriptor-id>`

Hybrid retrieval. Returns ranked chunks, each with:

- `doc_id` and `para_index` — the **pinpoint**: judgment id plus the paragraph
  that makes the passage citable. `title`, `court`, `date`, `region` are joined
  in for display; the full judgment is one hop away at `/api/case/:id`.
- `score` (fused RRF), and `vector_score` / `keyword_rank` / `vector_rank` so a
  client can see *why* a chunk ranked where it did.
- the **`descriptor`** the results came from — the "which model" answer — with a
  `stale` flag against the current corpus.

`model` selects a descriptor for a node holding several; omitted, the most
recently built is used. If no query embedder is available for the chosen
descriptor (a remote-model index on a node started without the endpoint),
retrieval **falls back to keyword-only and says so** in `retrieval`, rather than
returning results from the wrong space. Query input is sanitised exactly as
`/api/search` is — FTS operators and injection attempts are reduced to literal
terms — so no query can 500 the node.

### `GET /api/status` — index block

Reports whether an index is present, and for each descriptor: its id, embedder,
dimension, chunker, chunk count, the corpus root it was built from, and — the
load-bearing field — whether it is **stale** against the corpus the node serves.

`/api/search` (keyword) is unchanged and works whether or not an index exists.

## CLI

```text
molao index build [--db PATH] [--embedder fake|http] [--endpoint URL --model NAME] [--dim N]
molao index info  [--db PATH]
molao demo                     # builds a fake-embedder index so /api/rag/search works with zero setup
molao serve --db molao.db      # auto-attaches <db>.index if present
```

`molao index build` writes the sidecar and prints the descriptor. Rebuilding
with the same embedder replaces that model's index in place; building with a
different embedder or dimension adds a second, coexisting index. For the HTTP
embedder, an API key may be supplied out-of-band via the `MOLAO_EMBED_API_KEY`
environment variable rather than on the command line.

## Sharing and verification

An index cache is a file plus its descriptor. A node offered someone else's cache
does **not** trust it. The verification model is **rebuild and check**:

1. Read the descriptor. Confirm its `corpus_root` matches your corpus and its
   model/chunker are ones you can reproduce.
2. Rebuild the index locally from *your* verified corpus with the *same*
   embedder and chunker.
3. Spot-check: sample chunks and compare the shared vectors against your rebuilt
   ones by **cosine similarity ≈ 1.0**.

The check is **cosine ≈ 1, not exact-hash equality** — and this is the crux.
Float inference is not bit-reproducible across hardware (different GPU kernels,
different BLAS, different reduction orders), so two honest builds of the same
model over the same text will produce *almost* identical vectors, not identical
bytes. A shared index that matches to cosine ≈ 1 on sampled chunks is consistent
with the model it claims; one that diverges is not. (With the deterministic
`FakeEmbedder` the match is exact — but that is a property of the fake, not
something a real model can promise, which is the whole reason the check is
approximate.)

This is a consistency check a receiver can run for themselves. It is **not** a
signature and it does **not** make a shared index authoritative. Even a cache
that passes is only ever a convenience — the honest default is to rebuild your
own, which is cheap, local, and needs no one's trust. If in doubt, delete the
sidecar and run `molao index build`.

## What this does not do

- It does not sign, publish, or distribute an index as part of a release.
- It does not ship or download an embedding model.
- It does not claim a retrieved judgment is good law, current, or applicable —
  retrieval finds text, nothing more.
- It does not make a shared index trustworthy. Rebuild and check, or rebuild and
  use your own.
