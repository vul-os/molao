# Provenance

Where a judgment came from, who says so, and how much that is worth.

The rule the model encodes: **one person's upload is not evidence.**

## The witness record

`Provenance` in `crates/molao-core/src/doc.rs`:

| Field | Meaning |
|---|---|
| `doc_id` | The judgment this record is about |
| `source_url` | Where it was fetched — a court, gazette, or LII URL |
| `fetched_at` | RFC 3339 timestamp of the fetch |
| `raw_hash` | BLAKE3 of the **raw served bytes**, before any conversion |
| `witness` | Ed25519 public key of the witness, hex |
| `signature` | Ed25519 signature over the canonical serialisation, hex |

A witness is asserting exactly one thing: *I went to this URL at this time and
these were the bytes.* Nothing more. It is not asserting the document is
authentic, that it is good law, or that it is complete. Agreement between
independent witnesses is what carries weight, not any single signature.

## Why two hashes

`doc_id` is the hash of the **canonical text**. `raw_hash` is the hash of the
**raw bytes as served**.

They exist separately because two witnesses running different RTF converters
over the same SAFLII file will agree on `raw_hash` and may not agree on
extracted text. Keeping both lets a disagreement be diagnosed rather than
merely detected: matching `raw_hash` with differing `doc_id` means a converter
difference to fix, while differing `raw_hash` means the sources genuinely served
different bytes, which is the case that matters.

## Corroboration

`ProvenanceClass::from_witness_count(count, threshold)`:

| Class | Condition | What it means |
|---|---|---|
| `Corroborated` | `count >= max(threshold, 2)` | Independent witnesses agreed on the raw bytes. The normal case. |
| `Single` | `count >= 1` | One witness only. Included, clearly marked, never silently. |
| `Manual` | `count == 0` | No online source. Entered by hand and reviewed by a named person. |

The `max(threshold, 2)` is load-bearing. A misconfigured threshold of 1 must not
be able to call a single witness corroborated, and there is a test that says
so. Corroboration means *more than one party looked*, and no configuration
value may redefine that.

## Why `Manual` exists

It would be cleaner to refuse anything without an online source. It would also
quietly bias the corpus toward the well-resourced divisions.

Some courts still do not publish. Excluding their judgments entirely means a
commons that reflects Sandton better than Mthatha, and that is a worse failure
than a clearly-labelled hand-entered judgment. So `Manual` exists, it is always
visible to the reader, and it is never mixed in with corroborated material
without a label.

## What the reader sees

Every judgment surfaces its provenance class, in these words:

- **Corroborated** — independent witnesses agreed on the source bytes
- **Single source** — one witness fetched this; nobody has confirmed it
- **Manually entered** — no online source; typed and reviewed by a named person

Lawyers already reason in reported-versus-unreported terms and will not accept a
system that flattens the distinction. Surfacing the class is not a nicety; it is
what makes the corpus usable by someone who has to stand up and rely on it.

The UI never says "verified law". The node verifies bytes and signatures. It
does not verify that a judgment is correct, current, or applicable.

## Running a witness

A witness fetches from a canonical source, hashes what it received, and signs
the tuple. It does not need to hold the corpus, build releases, or run a public
service. The role is cheap on purpose, because corroboration is only meaningful
if the witnesses are genuinely independent, and independence is easier to get
when the cost of participating is low.

See [RUNNING-A-NODE.md](RUNNING-A-NODE.md) for the roles and what each costs.

Independence is a social property, not a cryptographic one. Five witnesses on
one university's network, or five keys held by one administrator, produce five
signatures and one point of failure. The signer set is public precisely so that
this can be inspected by anyone who cares to look.

## Status

The `Provenance` type, `ProvenanceClass`, and the corroboration rule are
implemented and tested in `molao-core`.

The witness fetching daemon, the signature-collection path, and the
disagreement-resolution workflow are **designed, not built**. What exists today
is the data model and the classification rule the rest will be built against.
