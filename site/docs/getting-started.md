# Getting started

From a clean clone to a running node.

Every command on this page is meant to work exactly as written. Where something
does not work yet, it says so beside the command rather than letting you find
out.

## Prerequisites

| Need | Version | Why |
|---|---|---|
| Rust | 1.85 or newer | The workspace sets `rust-version = "1.85"` |
| Node.js | 20 or newer | Building the web UI |

Nothing else. SQLite is bundled by `rusqlite`, so there is no database to
install, no service to start, and no connection string to configure.

```sh
rustc --version   # 1.85.0 or newer
node --version    # v20 or newer
```

## Clone and build

```sh
git clone https://github.com/vul-os/molao
cd molao

cargo build --workspace
cargo test --workspace
```

The tests are the fastest way to see what the project actually guarantees.
`molao-core` proves that canonicalisation is idempotent, that tampering with a
judgment breaks its id, and that a single signer cannot reach a quorum by
signing repeatedly. `molao-cite` proves that extraction is deterministic across
runs and that ordinary prose produces no citations.

## Build the web UI

```sh
npm ci
npm run build
npm run typecheck
```

The UI is TypeScript, Vite and Preact. It is embedded into the node binary via
`rust-embed`, so a release build of the node needs the UI built first.

`npm run dev` runs the UI against a node on localhost, with hot reload.

## Run a node

```sh
cargo run -p molao-node
```

The node binds `127.0.0.1` by default and serves the HTTP API described in
[API.md](API.md) plus the embedded UI.

> **The node crate is in progress.** The API contract is specified and the core
> crates it depends on are complete, but the server itself is still being
> written. Run `cargo run -p molao-node -- --help` to see what the version in
> your clone actually offers, and treat this section as describing the target
> rather than a promise.

## There is no corpus yet

This is the part to be clear about, because it is the first thing a new user
runs into.

**A node starts empty.** Molao does not ship a bundled corpus. There is no
"download the law" button, and pointing a fresh node at a URL will not populate
it. Ingest exists; a public release does not yet.

You have two paths:

1. **Seed the demo corpus.** A small set of synthetic judgments with a real
   citation graph between them, enough to see search, a judgment view, the
   citations panel and the graph working. This is what the screenshots use.
2. **Ingest your own documents.** Point the ingester at judgments you have
   lawfully obtained. Read [SOURCES.md](SOURCES.md) first — the sourcing rules
   are a deliberate ethical position, not paperwork.

The demo path is a `molao demo` subcommand on the node binary. It is part of
the same in-progress work as the server; check `--help` in your clone.

## Verifying a release

Once a signed release exists, verifying it means: check the signer set against
what the signing organisations published independently, check the quorum, check
the chain onto the head you already trust, recompute the corpus root, and re-run
the pinned extractor to compare the graph root byte for byte.

Steps one to four are implemented and tested in `molao-core`. The last two need
the corpus and graph crates, which are in progress. There is no single
`molao verify` command yet. Full detail in [RELEASES.md](RELEASES.md).

## Using the crates directly

Both core crates are usable on their own, with no node and no network.

```rust
use molao_cite::{extract, Pinpoint};

let refs = extract("as held in S v Makwanyane [1995] ZACC 3 at para 87");
assert_eq!(refs[0].citation.key(), "neutral:1995:ZACC:3");
assert_eq!(refs[0].pinpoint, Some(Pinpoint::Paragraph { from: 87, to: None }));
```

```rust
use molao_core::{canonicalise, DocId};

// Two converters, different whitespace, same judgment, same id.
assert_eq!(DocId::of_raw("A v B\r\n\r\n"), DocId::of_raw("A  v   B\n"));
```

If all you want is a citation parser for your jurisdiction, `molao-cite` plus a
region profile is that, and it depends on nothing but `regex`, `serde`, and
`molao-core`'s registries.

## Development commands

```sh
cargo build --workspace
cargo test --workspace
cargo clippy --all-targets -- -D warnings
cargo fmt --all -- --check

npm ci
npm run build
npm run typecheck
npm run lint
```

These are exactly what CI runs ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).

## Where to go next

| You want | Read |
|---|---|
| The binding design contract | [ARCHITECTURE.md](ARCHITECTURE.md) |
| What the citation parser recognises | [CITATIONS.md](CITATIONS.md) |
| How releases are signed and verified | [RELEASES.md](RELEASES.md) |
| Which role to run, and what it costs | [RUNNING-A-NODE.md](RUNNING-A-NODE.md) |
| What is defended and what is not | [THREAT-MODEL.md](THREAT-MODEL.md) |
| Where the corpus may come from | [SOURCES.md](SOURCES.md) |
| Straight answers | [FAQ.md](FAQ.md) |
