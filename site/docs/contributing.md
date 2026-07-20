# Contributing

Molao is a commons. Contributions of every size are welcome, and some of the
most valuable ones involve no code at all.

## What helps most

| Contribution | Why it matters |
|---|---|
| **Citation-parser test cases** | A real judgment whose citations are mis-parsed is worth more than a feature. Open an issue with the text and what should have been extracted. |
| **Court registry corrections** | Divisions get renamed, seats move, new codes appear. The registry is only as current as somebody keeps it. |
| **Series registry additions** | A missing series means citations to it silently do not exist. |
| **Running a node** | A mirror costs almost nothing and makes the network real. [docs/RUNNING-A-NODE.md](running-a-node.md) |
| **Institutional attestation** | Assembling a genuinely independent signer set is the hardest unsolved problem here, and it is organisational rather than technical. [GOVERNANCE.md](GOVERNANCE.md) |
| **Code** | The corpus, graph and node crates are where the work is. |

## Before you write code

Read [docs/ARCHITECTURE.md](architecture.md). It is the contract, and the
non-negotiables at the end of it are genuinely non-negotiable.

The two that catch people out:

- **Nothing enters a release that cannot be verified by recomputation.** This is
  why there is no vector index, and it is why a PR adding one to the release
  format will be declined regardless of how well it works.
- **Any change to extraction behaviour bumps `EXTRACTOR_VERSION`.** Registry
  additions count. If one version string can produce two different graphs,
  verification silently becomes verification of nothing.

## Development

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

CI runs exactly these ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
Run them before opening a pull request.

## Standards

- **`#![forbid(unsafe_code)]`** in every crate. No exceptions.
- **Determinism in `molao-cite` is a hard contract.** No hash-map iteration
  order in output, no locale, no clock, no environment. If a change makes
  extraction non-deterministic it is a bug even if every test passes.
- **Fail closed.** Unknown signers, malformed keys, malformed signatures: ignore
  them, never count them, never treat them as fatal to a valid quorum. Look at
  `SignedRelease::verify()` for the pattern.
- **Never drop data to look tidy.** An unknown court code is kept and flagged,
  not discarded. An unresolved citation is shown as written, not hidden. Silence
  is the failure mode this project cares most about.
- **British and South African spelling** in code, comments and docs.
- **Comments explain why, not what.** The existing crates are the house style;
  match them.

## Tests

New behaviour needs tests. Two kinds are particularly welcome:

- **Precision tests for the parser.** Prose that must *not* extract as a
  citation is as valuable as prose that must. Statutory references, dates and
  page ranges are the usual false positives.
- **Fail-closed tests for release verification.** Anything of the form "this
  should not have counted toward a quorum".

## Sourcing

If you are writing an ingester, read [docs/SOURCES.md](sources.md) first.
The short version: courts and gazettes directly, licensed bulk data from
Laws.Africa / AfricanLII, and SAFLII is a citation-resolution target rather than
a scrape target. **A bulk SAFLII scraper will not be merged.** That is a
deliberate ethical position, and it is not a performance question.

Never launder provenance. A witness record names the URL actually fetched.

## Pull requests

- One concern per pull request.
- Say what the change does to the guarantees, if anything. "This adds a series
  and bumps `EXTRACTOR_VERSION`" is the kind of sentence that gets a PR read
  quickly.
- If a change makes something honest that was previously overclaimed, say so
  prominently. Those are good changes.

## Honest status

Documentation in this repository marks designed-but-unbuilt features in place,
every time. If you add a feature, remove its "designed, not built" marker in the
same pull request. If you document something aspirational, mark it.

Every command in a README or docs page must actually work from a clean clone.
This is checked, and it is the rule most often broken by well-meaning
contributors.

## Reporting problems

- **Security issues:** [SECURITY.md](SECURITY.md).
- **Corpus integrity** — a judgment that does not match its source — is as
  serious as a code vulnerability and uses the same path.
- **Everything else:** open an issue.

## Licence

Contributions are MIT, matching the project ([LICENSE](LICENSE)). The judgments
themselves are not anyone's to license; they are public documents of the
Republic.
