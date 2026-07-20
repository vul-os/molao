# Running a node

Four roles, escalating in cost and commitment. Most people should run the first
one, and the first one is free.

The honest problem this document exists to address: **federations decay when the
person running the node leaves.** Every distributed academic network has watched
nodes go dark because a postgraduate graduated. So every role below is designed
to need as close to zero ongoing attention as possible, and the network's health
is meant to be visible to everyone rather than known only to whoever is looking
after it.

## The roles

| Role | Does what | Needs | Ongoing effort |
|---|---|---|---|
| **Mirror** | Holds a release and serves it. Reading the law. | A machine, disk for the corpus | Nearly none. Fetch new releases. |
| **Witness** | Fetches judgments from canonical sources and signs the bytes it saw | A machine with outbound network, a signing key | Low. It runs and reports. |
| **Builder** | Assembles a release: canonicalises, extracts, computes roots | CPU, disk, patience | Per release. |
| **Attestor** | Holds a key in the signer set and signs manifests | An organisation, key custody, a willingness to say no | Per release, and judgement. |

A single organisation may hold several roles. It should not hold several
*attestor* keys — that is the failure the threshold exists to prevent, and
`SignerSet::validate()` rejects duplicate keys outright.

## Mirror

The baseline. A mirror holds a corpus and serves it, and that is the whole of
what most people want: the law, locally, forever, with no dependency on anyone
being alive.

- **Cost:** whatever a small VM or an old laptop costs you. Disk scales with
  the corpus.
- **Network:** none required to read. A mirror with no internet works
  identically; it just does not learn about new releases.
- **Maintenance:** fetch releases when you want them. There is nothing to
  patch on a schedule, no database to vacuum, no certificate to rotate for local
  use, and no service to keep credentials for.

Running a mirror privately is also the answer to reader privacy. A node's
operator can see its users' searches. If your research is sensitive, the fix is
to run your own, which costs nothing.

## Witness

A witness fetches a judgment from its canonical source, hashes the raw served
bytes, and signs `(doc_id, source_url, fetched_at, raw_hash)`. It is asserting
only *I went here at this time and these were the bytes*.

Corroboration works because witnesses are **independent**. Five witnesses on one
university's network, or five keys held by one administrator, produce five
signatures and one point of failure. Independence is a social property, not a
cryptographic one, which is exactly why the witness set is public and can be
inspected.

- **Cost:** minimal. Outbound HTTPS and a key.
- **Storage:** none required. A witness need not hold the corpus.
- **Maintenance:** key custody, and noticing if it stops.

The role is deliberately cheap, because corroboration is only meaningful if
genuinely independent parties can afford to participate.

**Status: the witness daemon is designed, not built.** The `Provenance` type
and the corroboration rule exist in `molao-core`; the fetching and
signature-collection path does not.

## Builder

A builder takes corroborated documents, canonicalises them, runs the pinned
extractor over the corpus, computes the corpus and graph roots, and produces a
manifest.

The build must be **reproducible**. Two builders on the same inputs with the
same `EXTRACTOR_VERSION` must produce byte-identical roots. If they do not, that
is a bug in the extractor's determinism and it is a serious one, because the
whole verification story rests on it.

- **Cost:** CPU and disk during a build.
- **Trust required:** none. That is the point. A builder cannot smuggle
  anything in, because anyone can rebuild and compare.

**Status: the build pipeline is in progress.** `molao-core` and `molao-cite`
are complete; `molao-corpus` and `molao-graph` are being written.

## Attestor

An attestor holds a key in the signer set and signs manifests. This is the only
role carrying real responsibility, and it is not a technical one.

An attestor should:

- **rebuild independently** before signing, and compare roots. Signing a
  manifest you did not verify converts the quorum into theatre
- **hold its key properly** — hardware token, offline, custody documented and
  survivable when a person leaves
- **be prepared to refuse.** An attestor that has never declined to sign is
  indistinguishable from a rubber stamp
- **be genuinely independent** of the other attestors: different institution,
  ideally different jurisdiction

`threshold >= 2` is enforced in code. A signer set with a threshold of 1 is
refused outright, even if every signature in it is valid, because it is a single
point of authority wearing a quorum's clothes.

The honest limit: a quorum can still collude, and attestors drawn from one
jurisdiction can be pressured together. Spread of the signer set is the only
answer, and it is governance, not cryptography. See
[GOVERNANCE.md](../GOVERNANCE.md) and
[THREAT-MODEL.md](THREAT-MODEL.md#what-this-does-not-protect-against).

## Designing against decay

What the project does about nodes going quiet:

- **A single binary.** One executable, one SQLite file. No external database,
  no runtime, no package manager, no service dependencies. The commonest reason
  a node dies is that maintaining it became somebody's unpaid second job.
- **No credentials to rotate for local use.** Nothing expires and silently
  breaks a mirror.
- **Offline-correct.** A node that loses its network keeps serving the law. It
  degrades to "not receiving new releases", not to "broken".
- **Public network health.** `/api/status` exposes document counts, the
  provenance breakdown, the release number, and whether verification passed.
  A network whose corroborated share is falling should be visible to anyone,
  not just to whoever thinks to look.
- **Roles are separable.** An institution that can afford a mirror but cannot
  commit to attesting should run a mirror. Making the cheap role useful is what
  keeps the network wide.

## Practical guidance

- Bind to `127.0.0.1` unless you intend to serve others. Public exposure should
  be a decision.
- Keep the corpus on the machine, not on a network mount that can vanish.
- If you serve others, publish which release you are on. Comparing heads across
  nodes is how forks get caught, and today that comparison is manual.
- Signing keys never go in the repository, in a container image, or in a
  backup that travels with the corpus.

## What a node never does

It never phones home, reports telemetry, checks a licence, requires an account,
or bills anybody. There is no hosted Molao service to be a client of. If a
future version of this document says otherwise, the project has failed.
