# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `molao-core` — the layers every node must agree on exactly:
  - `DocId`, the BLAKE3 hash of a judgment's canonical text, with
    `verify_id()` so a judgment from an untrusted peer can be checked before it
    is kept
  - `canonicalise()` — line endings, typographic quotes and dashes,
    non-breaking spaces, whitespace runs, blank-line trimming. Idempotent, so
    two converters over the same judgment produce the same id
  - The structured `Judgment` and `Paragraph` model, keeping printed paragraph
    numbers alongside dense indices so pinpoint citations work
  - `Provenance` and `ProvenanceClass` (Corroborated / Single / Manual), with
    corroboration that a misconfigured threshold cannot weaken
  - Region profiles for court registries: the shared seven-tier hierarchy,
    authority weights, graceful handling of unknown codes, and `ZA` as the
    first fully-populated profile with 32 courts
  - Threshold-signed releases: length-prefixed signing bytes, fail-closed
    verification, one signer one vote, `threshold >= 2` enforced in code, and
    hash chaining so forks are detectable
- `molao-cite` — deterministic, jurisdiction-neutral citation extraction:
  - Neutral (`[1995] ZACC 3`), modern reported (`2020 (3) SA 123 (SCA)`),
    historical reported (`1941 AD 43`), and court case numbers (`CCT 306/24`)
  - Profile-driven law-report series, matched longest-abbreviation-first; 24
    entries in the `ZA` profile
  - Paragraph and page pinpoints, including marginal letters (`at 47B-D`)
  - Stable citation keys that join spellings of the same citation, and
    deliberately exclude the trailing court so a report does not split into two
    graph nodes
  - `EXTRACTOR_VERSION`, pinned into release manifests
  - Precision tests: ordinary prose, statutory references and bare bracketed
    years extract nothing
- Documentation: architecture, citation grammar, court registry, releases,
  provenance, threat model, sourcing ethics, node roles, HTTP API, getting
  started, screenshots, FAQ; plus governance, roadmap, contributing and
  security policy
- A standalone, fully self-contained mini-site under `site/`
- CI: build, test, clippy with warnings denied, format check, and the web UI
  build and typecheck

### In progress

- `molao-corpus` (SQLite + FTS5 storage and ingest), `molao-graph` (citation
  graph and authority scoring), the node HTTP server, and the web UI

### Notes

- **There is no bundled corpus.** A node starts empty.
- **Treatment attestations** (followed / distinguished / overruled) are
  designed, not built.
- **P2P distribution** is designed, not built. Releases are plain files.
- **Semantic search is deliberately excluded**, because embeddings cannot be
  verified by recomputation and a poisoned index is worse than a poisoned
  document.

[Unreleased]: https://github.com/vul-os/molao/commits/main
