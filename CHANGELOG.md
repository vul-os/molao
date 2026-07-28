# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Release checksums are now fail-closed and cover every asset.** The release
  job ran `cd dist && sha256sum molao-*`, which covered only files whose names
  begin with `molao-` (anything else would have shipped unvouched-for) and
  asserted nothing about coverage, so a manifest with one line for a
  three-binary release was indistinguishable from a complete one. The manifest
  is now written over every file in the staging directory, refuses to be
  written at all for an empty directory, asserts one line per staged asset, and
  is then re-verified — in both directions — with the same `scripts/verify.sh`
  a user runs.

- **Releases carry a sigstore build-provenance attestation.**
  `actions/attest-build-provenance` signs every asset including
  `SHA256SUMS.txt`, with a short-lived certificate minted from the release
  job's OIDC token — no long-lived key, no repository secret, nothing to
  rotate. This is the *software* release; it is unrelated to the threshold
  signing of a **corpus** release by attesting organisations, and neither
  vouches for the other. It is also **not** OS code-signing: Gatekeeper and
  SmartScreen still warn.

- **Added `scripts/verify.sh`** — the fail-closed check a user runs before
  executing a downloaded binary. Distinct exit code and diagnostic per failure
  mode (missing manifest 3, HTML page served as the manifest 4, empty/malformed
  manifest 5, no entry 6, unfetchable artifact 7, truncated download 8, digest
  mismatch 9, missing tool 10, failed attestation 11, plaintext origin 12).
  There is no skip flag, and an absent `SHA256SUMS.txt` is never read as
  "nothing to check". `--selftest` runs 24 synthetic-origin cases asserting the
  exit code and that a diagnostic was printed; CI runs it on every push and the
  release job runs it again before publishing.


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
  - Region profiles for court registries: the shared seven-tier hierarchy and
    its authority weights, graceful handling of unknown codes, and `ZA` as the
    first fully-populated profile with 32 courts. The weights are constants
    shared by every jurisdiction; a profile picks a court's tier, it does not
    re-weight one
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

### Changed

- **Region profiles now load at run time.** `molao --profiles <DIR>` reads a
  directory of profile TOML (`molao_core::region::ProfileSet::load_dir`) and
  installs it for the process; `region::resolve` and `region::default_profile`
  answer from the loaded set first and fall back to the compiled-in constants.
  Before this, the fourteen `profiles/*.toml` files were mirrors of the
  constants that nothing read at run time, and "regions are data, not code" was
  true of the shape of the data and not of how a node behaved. A loaded profile
  now reaches the default ingest path, so it changes what a node extracts.
  Loading is fail-closed and every error names its file.
- `molao regions` — what an invocation resolves, whether each profile was
  loaded or compiled in, and each one's fingerprint.
- `RegionProfile::fingerprint()` — BLAKE3 over the registry, so a graph built
  against an operator's own profile is still pinned: `EXTRACTOR_VERSION` for
  the grammar, the fingerprint for the data.
- Docs corrected where the code did not support the claim: a profile does not
  carry authority weights and does not select citation styles (both were
  claimed in `docs/COURTS.md`); the TOML/constant equality test is a profile
  comparison, not a byte comparison; `molao-dist`, `molao-ingest` and
  `molao-index` are no longer described as "landing this session", and
  `molao-dist` is now stated to have no dependents.

### In progress

- `molao-corpus` (SQLite + FTS5 storage and ingest), `molao-graph` (citation
  graph and authority scoring), the node HTTP server, and the web UI
- `molao-ingest` (sourcing and witness corroboration) and `molao-index` (the
  local rebuildable search cache), both wired into the node
- `molao-dist` (release packaging, torrent export, transports) — in the
  workspace and tested, but **nothing depends on it**

### Notes

- **There is no bundled corpus.** A node starts empty.
- **Treatment attestations** (followed / distinguished / overruled) are
  designed, not built.
- **P2P distribution** is not running. `molao-dist` holds the packaging and
  the transports, but no node command publishes or fetches a release, so
  releases are still plain files mirrored by hand.
- **Semantic search is deliberately excluded**, because embeddings cannot be
  verified by recomputation and a poisoned index is worse than a poisoned
  document.

[Unreleased]: https://github.com/vul-os/molao/commits/main
