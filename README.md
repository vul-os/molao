<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-wordmark-dark.svg">
    <img src="assets/brand/logo-wordmark.svg" alt="molao" width="220">
  </picture>
</p>

<p align="center"><strong>The law, held in common.</strong></p>

<p align="center">
  <a href="#quick-start-standalone">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#documentation">Docs</a> ·
  <a href="GOVERNANCE.md">Governance</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

<!-- Plain-text badges on purpose: rendering this README triggers no external
     image fetches — the same no-network-calls ethos as the node. -->
<p align="center"><sub><a href="LICENSE">MIT license</a> · Rust 1.85+ · SQLite + FTS5 · TypeScript UI · offline-first · no accounts, no billing, ever</sub></p>

<p align="center">
  <sub><img src="site/assets/vulos-logo.png" height="14" alt="VulOS"> Part of <strong><a href="https://vulos.org">VulOS</a></strong> — the open, self-hostable web OS &amp; app suite. Runs standalone, or as an app hosted by the Vulos OS.</sub>
</p>

<p align="center">
  <img src="docs/screenshots/hero.png" alt="Molao — search results across the corpus, showing court, neutral citation, provenance class and authority" width="820">
  <br>
  <sub><em>Search across the corpus. Every judgment carries its court, neutral citation, provenance class and inbound-citation weight. All screenshots use the demo corpus — there is no bundled corpus yet (<a href="docs/SCREENSHOTS.md">full tour</a>).</em></sub>
</p>

<table align="center">
  <tr>
    <td align="center" width="33%"><strong>Free, forever</strong><br><sub>No accounts, no telemetry, no billing, no hosted service. Universities, firms and individuals run nodes. Nobody bills anybody.</sub></td>
    <td align="center" width="33%"><strong>Verifiable by recomputation</strong><br><sub>Judgment ids are BLAKE3 of canonical text. The citation graph comes from a pinned extractor anyone can re-run and compare byte for byte.</sub></td>
    <td align="center" width="33%"><strong>No single publisher</strong><br><sub>Releases need k-of-n signatures from independent organisations. A threshold below 2 is refused in code — including for us.</sub></td>
  </tr>
</table>

## What is Molao?

**Molao** (Sotho and Tswana for *law*) is a free, decentralized commons of case
law: a corpus of judgments, a citation graph over them, and a single binary that
serves both. It is not a product and not a business. There is no hosted service
to sign up for, no subscription, and no plan to add one.

A node is one executable over one SQLite file. It works fully offline, makes no
outbound requests of its own, and needs nothing from anyone to keep serving the
law. Judgments are identified by the hash of their canonical text, so two nodes
that have never exchanged a packet agree on what a judgment is, and a release is
signed by a quorum of independent organisations rather than published by one
operator who could be pressured, bought, or breached.

Molao is **infrastructure any jurisdiction can stand up for its own corpus** —
an LII, a law faculty, a bar council, a ministry of justice. It is the model the
LII network (AustLII, CanLII, BAILII, SAFLII, NZLII, the AfricanLII members) has
run for decades under the Free Access to Law Movement, and Molao is joining that
tradition rather than inventing it. What it adds is content-addressed identity,
threshold-signed releases, and a citator whose mechanical layer can be checked
by anyone.

### Regions are data, not code

**No jurisdiction is hardcoded.** Court codes, court names, hierarchy tiers,
authority weights and law-report series ship as **region profiles** — data a
node picks, never an assumption baked into the parser. A **generic** profile
makes Molao usable anywhere on day one, and **South Africa (`ZA`) is the first
fully-populated profile**, never a special case.

This works because the free-access-to-law world already converged on one
citation convention:

| Jurisdiction | Neutral citation | Published by |
|---|---|---|
| United Kingdom | `[2020] UKSC 1` | BAILII |
| Australia | `[2020] HCA 1` | AustLII |
| New Zealand | `[2020] NZSC 1` | NZLII |
| South Africa | `[1995] ZACC 3` | SAFLII |

Same grammar, different court codes — which is exactly why the codes belong in
data. Adding a jurisdiction means supplying a profile (court registry, tiers,
weights, report series, applicable citation styles) and touching no core logic:
[docs/COURTS.md](docs/COURTS.md#adding-a-jurisdiction).

> [!NOTE]
> **Status: 0.1.0, early.** `molao-core` and `molao-cite` are written and
> tested. Storage, graph, node server and UI are **in progress**, as is the
> **region-profile refactor** — the registries are currently ZA-populated
> constants rather than loadable profiles. **There is no bundled corpus — a node
> starts empty.** Treatment attestations and P2P
> distribution are **designed, not built**. Semantic search is **deliberately
> excluded** ([why](docs/THREAT-MODEL.md#why-embeddings-are-excluded-from-releases)).
> Full status in [ROADMAP.md](ROADMAP.md).

## Part of VulOS

**Vulos = free, open-source software plus two paid services.** The Vulos OS, all
its apps, and the app store are OSS and free — you self-host them. Users
self-provision and self-pay their own box (Fly, Hetzner, any VPS, a home
server); Vulos does not host or provision boxes. Vulos bills for exactly two
things: **Vulos Relay** (reachability) and **backup storage** (buckets). There
is no compute billing, no mail billing, and no app-store subscription.

The product map:

- **Vulos OS** — the web-native desktop shell that hosts the apps
- **Vulos Office** — documents: docs, sheets, slides, PDF, and whiteboards
- **Vulos Files** — file storage and P2P sharing, built into the OS
- **Vulos Relay** — sovereign connectivity fabric; one of the two paid services
- **llmux** — sovereign AI gateway

PIM is bring-your-own via **lilmail**. Comms are third-party (Matrix/Element for
chat, Element Call or Jitsi for video). Account: email, password, OAuth,
passkeys.

**Molao's role:** the legal commons. It is **neither paid service** — it bills
nothing, hosts nothing, and has no paid tier. It runs standalone **and** is
hosted as an app by the Vulos OS. Products never import each other; Molao
depends on no VulOS service and works with no network at all.

## Features

<table>
  <tr>
    <th align="left" width="50%">⚖️ For reading the law</th>
    <th align="left" width="50%">🔗 For trusting it</th>
  </tr>
  <tr>
    <td valign="top">
      <ul>
        <li>Full-text search over the corpus (SQLite FTS5) with court, year-from and year-to filters, and <code>&lt;mark&gt;</code>-highlighted snippets</li>
        <li>Judgments as structured documents — parties, court, case numbers, date, coram, parallel reported citations, and numbered paragraphs</li>
        <li>Citations both ways: cases this judgment cites, and cases citing it, each with the paragraph it was cited from and the pinpoint it pointed at</li>
        <li><strong>Unresolved citations shown as written</strong>, never hidden. A citator that quietly drops what it cannot resolve tells a lawyer the case cites less than it does</li>
        <li>Citation graph around any judgment, weighted by the citing court's place in the hierarchy</li>
        <li>Authority ranking from inbound citations weighted by court tier — an appellate judgment relying on a case says more than a first-instance one does</li>
        <li>Works completely offline. Pull the plug and it keeps working</li>
      </ul>
    </td>
    <td valign="top">
      <ul>
        <li>Judgment ids are <strong>BLAKE3 of canonical text</strong>. Alter a paragraph and the id no longer matches — which is what makes a judgment from an untrusted peer safe to keep</li>
        <li><strong>Threshold-signed releases</strong>: k-of-n independent organisations, <code>threshold &gt;= 2</code> refused below that in code, one signer one vote, outsiders ignored however valid their signature</li>
        <li>Releases <strong>chain by hash</strong>, so a fork is detectable against any known head</li>
        <li><strong>Provenance on every judgment</strong> — Corroborated, Single source, or Manually entered — because lawyers already reason in reported versus unreported terms</li>
        <li>Contributed documents corroborated by <strong>k-of-n independent re-fetch</strong>: witnesses sign the bytes they saw at the canonical source</li>
        <li><strong>Deterministic citation extraction</strong> pinned to <code>EXTRACTOR_VERSION</code>, so anyone can rebuild the graph and compare it byte for byte</li>
        <li>The node verifies bytes and signatures. It <strong>never</strong> claims a judgment is verified law</li>
      </ul>
    </td>
  </tr>
</table>

**Honest about the hard parts**

- **The citator is the real prize, and its interpretive half is not built.** A
  corpus that does not know case A was overruled by case B will hand a lawyer
  dead authority. Mechanical citation edges are deterministic and verifiable, and
  those exist. Treatment labels (followed / distinguished / overruled) are
  interpretation — they will be **signed attestations that may conflict, showing
  disagreement rather than resolving it**, and they are **designed, not built**.
  Until then, check currency yourself.
- **"No central server" is achievable; "no central authority" is not.** Somebody
  must attest that a hash is the real judgment. So the trust root is a quorum
  plus a public append-only log, not one operator. That is a large improvement
  over one database with one administrator, and it is not trustlessness.
  [GOVERNANCE.md](GOVERNANCE.md)
- **Federations decay when the person running the node leaves.** Hence a
  zero-maintenance single binary with no external database and nothing to
  rotate, plus network health exposed publicly on `/api/status`.
  [docs/RUNNING-A-NODE.md](docs/RUNNING-A-NODE.md)
- **Sourcing is an ethical position, not a technical one.** Courts and gazettes
  directly, licensed bulk data from Laws.Africa / AfricanLII, and SAFLII treated
  as a citation-resolution target rather than a scrape target.
  [docs/SOURCES.md](docs/SOURCES.md)

## Screenshots

The web UI running against the **demo corpus** — synthetic judgments with a real
citation graph between them. There is no bundled corpus yet. Full tour in
[docs/SCREENSHOTS.md](docs/SCREENSHOTS.md).

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/judgment.png" alt="Judgment view"><br><sub><em>A judgment — numbered paragraphs as printed, court, case number, coram, parallel reported citations, and its provenance class</em></sub></td>
    <td width="50%"><img src="docs/screenshots/citations.png" alt="Citations panel"><br><sub><em>Citations both ways, with the paragraph cited from and the pinpoint cited to. Unresolved citations appear as written rather than being dropped</em></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/graph.png" alt="Citation graph"><br><sub><em>The citation graph around one judgment, edges weighted by the citing court's tier</em></sub></td>
    <td width="50%"><img src="docs/screenshots/status.png" alt="Node status"><br><sub><em>Node status — release number, quorum and threshold, provenance breakdown, court coverage, and whether verification passed</em></sub></td>
  </tr>
</table>

## Quick start (standalone)

Molao runs by itself. It has no dependency on VulOS, on any hosted service, or
on a network.

### Prerequisites

Rust 1.85 or newer, and Node 20 or newer for the web UI. Nothing else — SQLite
is bundled by `rusqlite`, so there is no database to install and no connection
string to configure.

### Build and test

```sh
git clone https://github.com/vul-os/molao
cd molao

cargo build --workspace
cargo test --workspace
```

The tests are the fastest way to see what the project guarantees: that
canonicalisation is idempotent, that tampering with a judgment breaks its id,
that one signer cannot reach a quorum by signing repeatedly, and that ordinary
prose extracts no citations.

### Build the UI and run a node

```sh
npm ci
npm run build

cargo run -p molao-node
```

The node binds `127.0.0.1` and serves the [HTTP API](docs/API.md) plus the
embedded UI.

> **The node crate and UI are in progress.** The API contract is specified and
> the core crates are complete, but the server is still being written. Run
> `cargo run -p molao-node -- --help` to see what your clone actually offers.

### There is no corpus yet

**A node starts empty.** Molao ships no bundled corpus, and no public signed
release exists. `molao demo` seeds a small synthetic corpus so you can see
search, judgments, citations and the graph working — it is part of the same
in-progress work as the server above.

To ingest real documents, read [docs/SOURCES.md](docs/SOURCES.md) first. The
sourcing rules are a deliberate ethical position.

### Use the crates on their own

Both core crates work standalone, with no node and no network. If all you want
is a citation parser for your jurisdiction, `molao-cite` plus a region profile is that:

```rust
use molao_cite::{extract, Pinpoint};

let refs = extract("as held in S v Makwanyane [1995] ZACC 3 at para 87");
assert_eq!(refs[0].citation.key(), "neutral:1995:ZACC:3");
assert_eq!(refs[0].pinpoint, Some(Pinpoint::Paragraph { from: 87, to: None }));
```

## How it works

Sources are fetched by independent witnesses who sign the bytes they saw. A
builder canonicalises the text, extracts citations with a pinned extractor, and
produces a manifest. A quorum of independent organisations signs it. A node
verifies the quorum and the chain, then serves the corpus locally — offline,
forever, with nothing to phone home to.

```mermaid
flowchart TB
    subgraph sources["Sources"]
        courts["Courts &amp; gazettes<br/>(direct — canonical)"]
        la["Laws.Africa / AfricanLII<br/>(Akoma Ntoso, licensed)"]
    end

    subgraph witnesses["Independent witnesses"]
        w["Witness A · B · C<br/>sign (doc_id, url, fetched_at, raw_hash)"]
    end

    subgraph build["Reproducible build"]
        canon["canonicalise()<br/>DocId = BLAKE3(text)"]
        cite["molao-cite extract()<br/>pinned EXTRACTOR_VERSION"]
        man["Manifest<br/>corpus_root · graph_root · previous"]
    end

    subgraph quorum["Attestation — k-of-n, k ≥ 2"]
        sig["Independent signers<br/>(universities, law societies, LIIs)"]
        log["Public append-only log<br/><em>designed, not built</em>"]
    end

    subgraph node["A node — one binary, one SQLite file"]
        ver["verify: quorum + chain"]
        db[("SQLite + FTS5")]
        api["axum HTTP API"]
        ui["Embedded web UI"]
    end

    courts --> w
    la --> w
    w -->|"k-of-n corroboration"| canon
    canon --> cite --> man --> sig
    man -.-> log
    sig -->|"SignedRelease"| ver
    ver --> db --> api --> ui
```

Two absences are deliberate. There is **no server a node must reach** to
function: a node with a corpus on disk needs no peers and no internet. And there
is **no embedding or vector index anywhere**, because float inference is not
reproducible across hardware — so a contributed index could never be verified —
and a poisoned index is worse than a poisoned document, since the text stays
correct while retrieval quietly steers.

Between nodes there is no hub. Every node holds a full copy; releases are plain
files today, mirrored however you like. P2P distribution is **designed, not
built**, and it will never be required to read the law.

## Configuration

There is nothing to configure to read the law. No config file is required, no
database to point at, no credentials, no account, and no service endpoint.

| What | Default | Note |
|---|---|---|
| Bind address | `127.0.0.1` | Serving a network is a deliberate flag, not an accident |
| Storage | one SQLite file | Bundled; no external database |
| Network calls | none | A node makes no outbound requests of its own |
| Telemetry | none | There is no code to disable |

Node roles, what each costs to run, and the practical guidance are in
[docs/RUNNING-A-NODE.md](docs/RUNNING-A-NODE.md).

## Documentation

| Document | What it covers |
|---|---|
| [GETTING-STARTED.md](docs/GETTING-STARTED.md) | Clean clone to a running node, and what does not work yet |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | The binding contract: layers, identity, canonicalisation, storage, non-negotiables |
| [CITATIONS.md](docs/CITATIONS.md) | The citation grammar the parser implements — neutral, reported, historical, case numbers, pinpoints, keys; and which parts are profile-driven |
| [COURTS.md](docs/COURTS.md) | The region-profile contract, the shared tier model, and how to add a jurisdiction |
| [RELEASES.md](docs/RELEASES.md) | Threshold signing, manifest chaining, and how to verify a release yourself |
| [PROVENANCE.md](docs/PROVENANCE.md) | Witnesses, corroboration, and the Corroborated / Single / Manual classes |
| [THREAT-MODEL.md](docs/THREAT-MODEL.md) | Poisoning, split view, why embeddings are excluded, and what is **not** protected |
| [SOURCES.md](docs/SOURCES.md) | How to source responsibly in a jurisdiction: direct, licensed bulk, and why an LII that declines bulk supply is not scraped |
| [RUNNING-A-NODE.md](docs/RUNNING-A-NODE.md) | The four roles — Mirror, Witness, Builder, Attestor — and what each costs |
| [API.md](docs/API.md) | The node's read-only HTTP API, endpoint by endpoint |
| [SCREENSHOTS.md](docs/SCREENSHOTS.md) | The screenshot set and how to regenerate it |
| [FAQ.md](docs/FAQ.md) | Straight answers, including the ones that are "not yet" |

Also: [GOVERNANCE.md](GOVERNANCE.md) (the signer set, and what "decentralized"
honestly means here), [ROADMAP.md](ROADMAP.md) (phases, with what is done, in
progress, designed-not-built, and deliberately excluded),
[SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md).

## Development

```sh
# Rust workspace
cargo build --workspace
cargo test --workspace
cargo clippy --all-targets -- -D warnings
cargo fmt --all -- --check

# Web UI
npm ci
npm run build
npm run typecheck
npm run lint
```

CI runs exactly these ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

Every crate is `#![forbid(unsafe_code)]`. Determinism in `molao-cite` is a hard
contract, not a preference: no hash-map iteration order in output, no locale, no
clock, and **any change to extraction behaviour bumps `EXTRACTOR_VERSION`** —
including adding a court or a law-report series. Read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing anything
structural; it is the contract.

## Contributing

Contributions welcome, and some of the most useful ones involve no code:
citation-parser test cases from real judgments that are mis-parsed, court and
series registry corrections, running a node, and the institutional work of
assembling a genuinely independent signer set. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) for the software. The judgments themselves are not anyone's to
license — they are public documents of the Republic.
