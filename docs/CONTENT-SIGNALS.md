# Content signals: what a source lets us do with its law

A judgment is a public document. A website's *edition* of that judgment — its
markup, its rendering, its editorial apparatus, and increasingly its objection
to being fed to AI — is not. Molao honours that distinction mechanically, not
just in prose.

## The signal

Legal-information sites publish a machine-readable statement in `robots.txt`,
separate from the `Disallow` question of whether a robot may fetch a page at
all. It states what a robot may *do with* the content once fetched:

```text
Content-Signal: ai-train=no, search=yes, ai-input=no
```

- `search=yes` — you may build a search index (return links and short excerpts).
- `ai-train=no` — you may not train a model on this content.
- `ai-input=no` — you may not input this content to an AI model at inference
  time (retrieval-augmented generation, grounding, an AI answer).
- `use=reference` — the content is for reference/citation only.

This is real and current. As of July 2026, most of the AfricanLII network, and
its counterparts elsewhere, publish it.

## Why it speaks to Molao specifically

Molao's corpus is not a plain search index. It feeds a **RAG index** — the exact
"input content into an AI model" that `ai-input=no` names. So the signal is
about *which use*, not who fetched the document: collecting a judgment by hand
does not change that it later grounds an AI answer. A plain keyword search over
the same text is the `search=yes` case these sites permit; RAG grounding is the
`ai-input=no` case they do not.

## Three layers, and which are absolute

Molao separates what is a firm line from what is a judgement call:

1. **Identity — always honest.** The crawler always identifies as
   `molao-node/0.1 (+https://github.com/vul-os/molao)`. There is no
   browser-spoofing path and never will be: disguising the crawler to defeat an
   identity-based control is the one thing this project does not do, whatever
   the payoff. This is also why the AI-crawler blocks that name `ClaudeBot`,
   `GPTBot`, `Google-Extended` and the like do **not** bind Molao — we are not
   those agents, and the sites' `User-agent: *` rule admits us. Those blocks are
   recorded and surfaced, not treated as a bar.
2. **`robots.txt` `Disallow` / `Crawl-delay` — always honoured.** These are the
   access control, and they are absolute. A host that disallows its judgment
   path (ULII and ZambiaLII do) is not fetched, full stop — including under the
   override below. The override relaxes the *signal*, never robots.
3. **`Content-Signal: ai-input=no` — a policy.** The judgments are
   public-domain law and the signal is a non-binding convention, so whether a
   given node's use falls within it is the operator's determination to make, not
   a fact the software can settle. The default **respects** it — a corpus that
   is redistributed, and a tool other people run, should not quietly override a
   source's stated wish. An operator who has made their own determination
   (public-domain text, permission held) can set `--ignore-content-signals`,
   which is loud, logged, and changes nothing about layers 1 and 2.

> **Default: a source that signals `ai-input=no` is not ingested. The operator
> may override that one layer explicitly — never by disguise, never past
> `robots.txt`.**

## The four classes

The gate reads a parsed signal into one of four classes
([`molao_ingest::signals::CorpusEligibility`]):

| Class | Meaning | In the corpus? |
|---|---|---|
| **RAG-permitted** | No `ai-input` restriction and no `use` restriction (or an explicit `ai-input=yes`) | **Yes** |
| **Search-only** | `ai-input=no` but `search=yes` | No — the corpus is a RAG index, not a plain search index |
| **Citation-only** | `ai-input=no`/`use=reference` with no `search=yes` | No — Molao links to it; a reader follows the link |
| **Forbidden** | `ai-input=no` and `search=no` | No — no automated use at all |

Two deliberate judgement calls, both erring toward honesty rather than
convenience:

- **`ai-train=no` alone does not block Molao.** RAG grounding is inference-time
  input, not training, and Molao trains nothing. Reading `ai-train=no` as a bar
  on RAG would claim a restriction the site did not write.
- **Any `use=<value>` directive is treated as reference-only** for AI purposes.
  The observed value is `reference`; a purpose-limiting `use` key is a limitation
  whatever its value, so absent an explicit `ai-input=yes` it means not-for-AI.

## Where the check happens

The **live `robots.txt` is the authority**, not a stored table. Before a
`molao fetch` or `molao crawl` ingests any judgment it reads the host's current
signal, and under the default policy refuses anything that is not RAG-permitted
— with a message that names the signal, says what it means, and points to the
court-direct or licensed-bulk route instead. `--ignore-content-signals` sets the
policy to `Ignore` for that run: the signal is still read and logged, it just
does not block. The sources registry records a signal *hint* per host for
listings, but the live `robots.txt` is what the gate consults.

This sits alongside the mechanisms that are **not** a policy and cannot be
overridden: `robots.txt` `Disallow` and `Crawl-delay` are always honoured, and
SAFLII — which declines bulk re-supply and blocks AI crawlers by name — is
hard-denied regardless of any flag.

## What this means for coverage

Most LII aggregators now signal `ai-input=no` or block AI crawlers outright, so
they are **not** corpus sources for Molao. The corpus is built instead from
sources that permit the use: courts and official publishers directly (their
judgments are public domain and carry no third-party AI restriction),
open-licensed datasets, and licensed bulk feeds whose licence permits AI. See
[SOURCES.md](SOURCES.md) for the per-jurisdiction picture.

This narrows what can be collected. That is the correct outcome: a smaller
corpus honestly sourced is the product; a larger one built against the sources'
stated wishes is a liability wearing a corpus's clothes.
