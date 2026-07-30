# Vendored fonts

This site ships its own fonts so the page renders identically offline — no CDN,
no font service, no external request of any kind. That is the same promise the
node itself makes, and a landing page that fetched a webfont would be breaking
it in the first 200 milliseconds.

Both families are licensed under the **SIL Open Font License 1.1**
(<https://openfontlicense.org>).

| File | Family | Copyright | Upstream |
|------|--------|-----------|----------|
| `fraunces-var.woff2`, `fraunces-italic-var.woff2` | Fraunces (variable: `opsz` 9–144, `wght` 100–900, `SOFT` 0–100; subset to latin + typographic punctuation) | © 2020 The Fraunces Project Authors | <https://github.com/undercasetype/Fraunces> |
| `plex-mono-400.woff2`, `plex-mono-600.woff2` | IBM Plex Mono (latin subset) | © 2017 IBM Corp. | <https://github.com/IBM/plex> |

The OFL requires the copyright notice and licence to accompany every copy; that
is what this file is for. The full licence text is reproduced at the URL above
and in each upstream repository.
