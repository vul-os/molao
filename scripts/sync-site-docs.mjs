#!/usr/bin/env node
// Mirror the canonical docs into the standalone mini-site.
//
// `docs/*.md` (plus a few root files) are the single source of truth. The
// mini-site at `site/` needs its own lower-cased copies because `site/docs.html`
// is a self-contained client-side renderer that fetches them by path.
//
// This script exists because the two copies drifted the first time the docs
// changed: a refactor updated `docs/COURTS.md` and left `site/docs/courts.md`
// telling readers the feature was still unimplemented. Anything maintained by
// hand in two places is eventually wrong in one of them.
//
// Usage:  node scripts/sync-site-docs.mjs [--check]
//   --check  exit non-zero if the mirror is stale, without writing (for CI)

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

/** Root-level docs that also belong in the mini-site. */
const ROOT_DOCS = ['ROADMAP.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'GOVERNANCE.md', 'SECURITY.md']

const REPO = 'https://github.com/vul-os/molao/blob/main'

/**
 * Rewrite links that only resolve from the repo.
 *
 * The mini-site flattens `docs/` into `site/docs/`, so a link like
 * `../profiles/za.toml` would climb out of the site root and 404. Point those
 * at the repository instead, where they always resolve.
 */
function rewrite(md) {
  return md
    .replace(/\]\(\.\.\/([^)]+)\)/g, `](${REPO}/$1)`)
    .replace(/\]\(docs\/([^)]+)\)/g, (_, f) => `](${f.toLowerCase()})`)
}

const sources = [
  ...readdirSync(join(root, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => [join('docs', f), f.toLowerCase()]),
  ...ROOT_DOCS.filter((f) => existsSync(join(root, f))).map((f) => [f, f.toLowerCase()]),
]

let stale = []
for (const [src, destName] of sources) {
  const want = rewrite(readFileSync(join(root, src), 'utf8'))
  const dest = join(root, 'site', 'docs', destName)
  const have = existsSync(dest) ? readFileSync(dest, 'utf8') : null
  if (have === want) continue
  stale.push(`${src} -> site/docs/${destName}`)
  if (!check) writeFileSync(dest, want)
}

if (check && stale.length) {
  console.error(`site/docs is stale (${stale.length} file(s)):`)
  for (const s of stale) console.error(`  ${s}`)
  console.error('\nRun: node scripts/sync-site-docs.mjs')
  process.exit(1)
}

console.log(
  stale.length ? `synced ${stale.length} file(s):\n  ${stale.join('\n  ')}` : 'site/docs already in sync',
)
