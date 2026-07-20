# Security

## Reporting

Report vulnerabilities privately through **GitHub Security Advisories** on
[github.com/vul-os/molao](https://github.com/vul-os/molao/security/advisories/new).

Please include what you did, what happened, and what you expected. A proof of
concept helps. If you are not sure whether something is a vulnerability, report
it anyway.

Do not open a public issue for a security problem until it has been addressed.

## Corpus integrity counts

**A judgment that does not match its source is a security issue**, and it uses
this same private path.

If you find a judgment in a Molao corpus whose text differs from what the court
or gazette published, report it here rather than in a public issue. Include the
`DocId`, the canonical source URL, and what differs.

The integrity of the law as read is the asset this project protects. A silent
alteration is more damaging than most memory-safety bugs would be.

## In scope

- Anything that lets altered text pass `Judgment::verify_id()`
- Anything that lets a release verify without a genuine quorum: signature
  reuse, key confusion, manifest ambiguity, signing-byte collisions
- Non-determinism in `molao-cite` — two runs, or two machines, producing
  different extraction from the same input, without an `EXTRACTOR_VERSION`
  change. This breaks verification by recomputation for everyone.
- Canonicalisation divergence: two reasonable converter outputs of the same
  judgment producing different `DocId`s
- Anything causing a node to make an unexpected outbound network request. A
  node is meant to make none.
- Injection, path traversal, or resource exhaustion in the node's HTTP surface
- Anything that lets an unresolved or unknown-court citation be silently
  dropped

## Out of scope

- **Legal correctness.** The node verifies bytes and signatures, never that a
  judgment is good law. Reporting that a judgment was overruled is not a
  vulnerability; treatment attestations are designed and not built.
- **Quorum collusion.** If k of n signers agree to publish falsehood, every
  check passes. This is a known and stated limit — the defence is institutional
  independence, not cryptography. See
  [docs/THREAT-MODEL.md](threat-model.md#what-this-does-not-protect-against).
- **Node operators seeing their users' searches.** Molao makes no anonymity
  claim. Run your own node; it is free and works offline.
- **A node administrator changing their own node's database.** Molao does not
  defend a machine against its own administrator.
- Vulnerabilities in third-party dependencies with no exploitable path through
  Molao. Report those upstream.
- Missing security headers on somebody's public mirror. Report to that operator.

## Signing keys

Release signing keys belong to independent attesting organisations, not to this
repository or its maintainers. If you believe a signing key is compromised,
report it here **and** to the organisation that holds it. A compromised key is
handled by a signer-set change and an epoch bump — see
[GOVERNANCE.md](GOVERNANCE.md).

Signing keys must never appear in a repository, a container image, or a backup
travelling with a corpus. If you find one, that is a report worth making
immediately.

## What we will do

- Acknowledge your report
- Tell you whether it is in scope and what we intend to do
- Credit you when it is fixed, unless you would rather we did not

There is no bug bounty. This project has no revenue and no funding; it will not
pretend otherwise.

## Supported versions

Molao is pre-1.0 (`0.1.0`). Fixes land on the main branch. There are no
backported security releases yet, and there is no long-term-support branch.
