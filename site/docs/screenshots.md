# Screenshots

Every screenshot in this repository shows the real web UI running against a
node seeded with the **demo corpus**. Nothing is mocked up, and no screenshot
shows a real judgment, because there is no bundled corpus yet.

## The set

| File | Screen |
|---|---|
| `docs/screenshots/hero.png` | Search results — the main view |
| `docs/screenshots/judgment.png` | A judgment, with numbered paragraphs and its provenance class |
| `docs/screenshots/citations.png` | The citations panel: cases cited and cases citing, including unresolved citations shown as written |
| `docs/screenshots/graph.png` | The citation graph around one judgment |
| `docs/screenshots/status.png` | Node status: release, quorum, provenance breakdown, court coverage |

## Regenerating

```sh
npm ci
npm run build:demo
npm run screenshots
```

`build:demo` builds the UI in demo mode, which seeds the synthetic corpus so the
screenshotter needs no real backend, no corpus, and no credentials. Output goes
to `docs/screenshots/`.

The screenshotter is Playwright over Chromium. If it has not been installed
before:

```sh
npx playwright install chromium
```

> The screenshotter (`scripts/screenshots.mjs`) and the demo mode it depends on
> are part of the in-progress UI work. If `npm run screenshots` fails in your
> clone, the UI is ahead of or behind this document; check
> `apps/web/package.json` for the scripts that actually exist.

## The mini-site copy

The standalone mini-site under `site/` carries its own flattened copy of the
docs (`site/docs/*.md`, lowercase) and its own `site/screenshots/`. After
regenerating screenshots or editing a doc, refresh those copies:

```sh
for f in docs/*.md; do cp "$f" "site/docs/$(basename "$f" | tr 'A-Z' 'a-z')"; done
mkdir -p site/screenshots && cp docs/screenshots/*.png site/screenshots/
```

The site is fully self-contained — no external requests of any kind — which is
why the copies exist rather than links out of the repository.

## Rules for screenshots in this repo

- **Demo data only.** Never a real judgment, never a real party's name in a
  screenshot of an unreleased corpus.
- **No faked states.** If a feature is not built, it does not appear in a
  screenshot. Treatment labels are designed and not built, so no screenshot
  shows them.
- **Provenance visible.** Any screenshot of a judgment shows its provenance
  class, because that is what the UI actually does and hiding it in marketing
  imagery would misrepresent the product.
- **Regenerate, do not retouch.** Screenshots are build output. If one is
  wrong, fix the UI or the demo seed and run the script again.
