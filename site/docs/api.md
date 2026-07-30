# HTTP API

The node serves this; the web UI consumes it. Nothing else is required to build
a client.

## Shape

- **All JSON.** `Content-Type: application/json`.
- **All read-only.** There is no write surface. Ingest happens through the CLI,
  not over HTTP.
- **No authentication.** It is public law. There is nothing to log in to, and
  no account exists anywhere in the system.
- Unknown ids return **404** with `{ "error": "..." }`.
- User input never produces a 500. Malformed queries, absurd depths, and
  nonsense ids are handled, not crashed on.

The node binds `127.0.0.1` by default. Exposing it on a network is a deliberate
flag, not an accident of configuration — see
[RUNNING-A-NODE.md](RUNNING-A-NODE.md).

## Endpoints

### `GET /api/version`

```json
{
  "name": "molao",
  "version": "0.1.0",
  "extractor_version": "molao-cite@0.1.0",
  "release": 42,
  "corpus_root": "9f2c…"
}
```

`release` and `corpus_root` are `null` on a node that has not loaded a release
— the state a freshly installed node is in.

`extractor_version` matters to clients: it is what a graph was built with, and
a client comparing two nodes should compare this before comparing edges.

### `GET /api/status`

```json
{
  "docs": 130161,
  "edges": 894233,
  "unresolved": 21044,
  "release": 42,
  "signers": 5,
  "threshold": 3,
  "provenance": { "corroborated": 128904, "single": 1102, "manual": 155 },
  "courts": 32,
  "regions": [ { "code": "ZA", "doc_count": 130161 } ],
  "verified": true,
  "index": {
    "present": true,
    "corpus_root": "9f2c…",
    "descriptors": [
      { "descriptor_id": "b71a…", "embedder_id": "fake-hash", "model_version": "v1",
        "dim": 256, "metric": "cosine", "chunker_id": "paragraph",
        "chunk_count": 4102, "built_at": "2026-07-28T10:00:00Z",
        "corpus_root": "9f2c…", "stale": false }
    ]
  }
}
```

`verified` reports whether the loaded release passed quorum verification against
the signer set. `false` is not an error state to hide — it means this node is
serving material it has not been able to verify, and a client should say so.

The `provenance` breakdown is what makes network health legible. A corpus
drifting toward `single` is a corpus losing its corroboration guarantee, and
that should be visible without asking anyone.

`unresolved` is how many citation edges point at a judgment this node does not
hold — the same count that shows up per-case as `resolved: false` on
`/api/case/:id/citations`, rolled up network-wide.

`regions` is the per-jurisdiction breakdown of what this node actually holds.
Molao is jurisdiction-neutral and a single node may serve more than one region
profile at once ([COURTS.md](COURTS.md)); this is how a client tells the two
apart rather than assuming `ZA`.

`index` reports the local RAG cache honestly: `present: false` (with no
`descriptors`) when no index has been built, and otherwise one entry per
model-tagged descriptor, including whether it is `stale` against the corpus
this node currently serves. This index is never signed and never part of a
release — see [RAG.md](RAG.md) for what it is and is not, and
[THREAT-MODEL.md](THREAT-MODEL.md#why-a-rebuildable-cache-rag-index-does-not-reopen-this-hole)
for why exposing it here does not weaken the verification story.

### `GET /api/courts`

```json
[ { "code": "ZACC", "name": "Constitutional Court of South Africa",
    "tier": "apex", "seat": "Johannesburg", "doc_count": 812 } ]
```

`tier` is the snake-case serialisation of `Tier`: `apex`, `appellate`,
`specialist_appellate`, `high_court`, `specialist_high`, `tribunal`, `lower`.

`doc_count` is this node's holding for that court, not a claim about how many
judgments the court has handed down.

### `GET /api/search`

| Parameter | Default | Meaning |
|---|---|---|
| `q` | — | Query string, FTS5 syntax |
| `limit` | `20` | Results per page |
| `offset` | `0` | Pagination offset |
| `court` | — | Restrict to a court code, e.g. `ZACC` |
| `region` | — | Restrict to a region-profile code, e.g. `ZA` — see [COURTS.md](COURTS.md) |
| `year_from` | — | Inclusive lower bound on judgment date |
| `year_to` | — | Inclusive upper bound |

```json
{
  "total": 47,
  "hits": [
    {
      "id": "f3a9…",
      "title": "Minister of Police v Mboweni",
      "court": "ZACC",
      "court_name": "Constitutional Court of South Africa",
      "region": "ZA",
      "date": "2026-06-26",
      "neutral_citation": "[2026] ZACC 26",
      "snippet": "…the <mark>unlawful arrest</mark> of the applicant…",
      "authority": 0.83,
      "cited_by_count": 14
    }
  ]
}
```

`snippet` comes from FTS5's `snippet()` with `<mark>` around matches. It is the
only field in the API containing markup, and a client should treat it as such
rather than as plain text.

`authority` is a score derived from inbound citations weighted by the citing
court's tier ([COURTS.md](COURTS.md)). It ranks results. It is not a measure of
whether a case is good law, and nothing in the API is.

**Search is lexical.** There is no semantic or vector search, deliberately —
see [THREAT-MODEL.md](THREAT-MODEL.md#why-embeddings-are-excluded-from-releases).

### `GET /api/rag/search`

Hybrid retrieval over the node's local, optional **RAG index** — never a
release artifact, never signed. Full model in [RAG.md](RAG.md); this section
is the wire shape only.

| Parameter | Default | Meaning |
|---|---|---|
| `q` | — | Query string |
| `k` | `5` | Number of chunks, clamped to 1–100 |
| `model` | most recently built | Selects an index descriptor when the node holds several |

```json
{
  "query": "unlawful arrest damages",
  "k": 5,
  "retrieval": "hybrid",
  "descriptor": {
    "descriptor_id": "b71a…", "embedder_id": "fake-hash", "model_version": "v1",
    "dim": 256, "metric": "cosine", "quantization": "f32", "normalization": "unit-l2",
    "chunker_id": "paragraph", "chunker_params": "{}", "corpus_root": "9f2c…",
    "stale": false
  },
  "hits": [
    {
      "doc_id": "f3a9…", "para_index": 12, "para_number": 87,
      "title": "Minister of Police v Mboweni", "court": "ZACC",
      "court_name": "Constitutional Court of South Africa", "region": "ZA",
      "date": "2026-06-26", "text": "…",
      "score": 0.041, "vector_score": 0.91, "keyword_rank": 3, "vector_rank": 1
    }
  ]
}
```

`doc_id` plus `para_index`/`para_number` is the pinpoint — the full judgment is
one hop away at `/api/case/:id`. `descriptor` is the "which model produced
this" answer, with the same `stale` flag as the `/api/status` index block: a
stale descriptor was built from a corpus root this node no longer serves.

If no index exists at all, this returns `{ "hits": [], "descriptor": null,
"retrieval": "none", "note": "..." }` rather than a 404 — an empty index is not
an error. If a `model` is named but not found, that **is** a 404. If the
descriptor's embedder cannot be reached (a remote-model index with no endpoint
configured), retrieval silently degrades to keyword-only and `retrieval`
reports `"keyword"` rather than returning results from the wrong vector space.

This index is a local cache, never authoritative and never part of a release
— see
[THREAT-MODEL.md](THREAT-MODEL.md#why-a-rebuildable-cache-rag-index-does-not-reopen-this-hole).

### `GET /api/case/:id`

```json
{
  "judgment": { "id": "f3a9…", "neutral_citation": "[2026] ZACC 26",
                "court": "ZACC", "title": "Minister of Police v Mboweni",
                "case_numbers": ["CCT 306/24"], "date": "2026-06-26",
                "judges": ["Mboweni J"], "reported_citations": [],
                "paragraphs": [ { "index": 0, "number": null, "text": "MBOWENI J:" } ] },
  "court_name": "Constitutional Court of South Africa",
  "region": "ZA",
  "provenance_class": "corroborated",
  "cites_count": 23,
  "cited_by_count": 14,
  "authority": 0.83,
  "reported_citations": ["2026 (4) SA 1 (CC)"]
}
```

`judgment` is the `Judgment` type serialised as-is, paragraphs included. A
client can therefore recompute the id from the text it received and check the
node's honesty without asking the node anything further.

`provenance_class` is `corroborated`, `single`, or `manual`. Show it. See
[PROVENANCE.md](PROVENANCE.md).

`:id` is the full 64-character hex `DocId`. Short forms are for display only and
are not accepted here.

### `GET /api/case/:id/citations`

```json
{
  "cites": [
    { "to_id": "a71b…", "citation_key": "neutral:1995:ZACC:3",
      "as_written": "[1995] ZACC 3", "canonical": "[1995] ZACC 3",
      "from_para": 12,
      "pinpoint": { "kind": "paragraph", "from": 87, "to": null },
      "resolved": true },
    { "to_id": null, "citation_key": "reported:1941::AD:43",
      "as_written": "1941 AD 43", "canonical": "1941 AD 43",
      "from_para": 19,
      "pinpoint": { "kind": "page", "page": 47, "from_letter": "B", "to_letter": "D" },
      "resolved": false }
  ],
  "cited_by": [
    { "from_id": "c04e…", "title": "S v Dlamini", "court": "ZASCA",
      "date": "2027-02-11", "as_written": "[2026] ZACC 26",
      "from_para": 31, "pinpoint": { "kind": "paragraph", "from": 14, "to": 16 } }
  ]
}
```

The second `cites` entry is the important one. `resolved: false` and
`to_id: null` mean this node does not hold the cited judgment. It is still
returned, with the text as written.

**Unresolved citations are never hidden.** A citator that quietly drops what it
cannot resolve tells a lawyer the case cites less than it does, which is worse
than telling them nothing.

`pinpoint` is `null`, or an object tagged `paragraph` or `page`, matching the
`Pinpoint` enum in [CITATIONS.md](CITATIONS.md#pinpoints).

**Treatment labels are not in this response**, because they are **designed, not
built**. There is no `treatment` field, and a client must not synthesise one.
Until they exist, a citation edge means "case A referred to case B", and nothing
about approval or disapproval.

### `GET /api/case/:id/graph`

| Parameter | Default | Meaning |
|---|---|---|
| `depth` | `1` | How many hops out from the subject judgment, clamped to a maximum so a client cannot walk the whole corpus in one request |

```json
{
  "depth": 1,
  "nodes": [ { "id": "f3a9…", "title": "Minister of Police v Mboweni",
               "court": "ZACC", "region": "ZA", "date": "2026-06-26",
               "authority": 0.83, "depth": 0 } ],
  "edges": [ { "from": "c04e…", "to": "f3a9…", "weight": 1.0, "paragraph_count": 2 } ]
}
```

The top-level `depth` echoes the clamped value actually used, which may be
lower than requested. Per node, `depth: 0` is the subject judgment. `weight` is
the citing court's authority weight ([COURTS.md](COURTS.md#tiers)).
`paragraph_count` on an edge is how many distinct paragraphs of the citing
judgment cite the target — more than one usually means a sustained discussion,
not a passing mention.

Only resolved edges appear here — an unresolved citation has no node to point
at. The full picture including unresolved citations is on
`/api/case/:id/citations`, and a UI should not present the graph as the complete
set of citations.

## Client notes

- **Verify what you receive.** `/api/case/:id` returns the paragraphs. Hashing
  the canonical text and comparing against `id` costs nothing and is the whole
  reason ids are hashes.
- **Do not cache across releases.** `/api/version` reports `release` and
  `corpus_root`. If either changes, drop cached results.
- **Do not treat `authority` as merit.** It is inbound-citation weight. A
  much-criticised judgment is heavily cited.
- **Never render a judgment as "verified law".** The node verifies bytes and
  signatures. That is all it can honestly claim.

## Status

The API contract above is the specification the node implements against. The
node crate is **in progress**; check `/api/version` against a running node
rather than assuming any endpoint is live in the version you have.
