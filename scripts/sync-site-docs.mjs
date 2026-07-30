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
//
// The stale check used to only walk `sources` (docs/*.md + ROOT_DOCS) and
// compare each one's rewritten content to its destination. It never looked at
// what was actually sitting in site/docs/, so a file left behind by a rename
// or a retired doc — anything site/docs/ holds that `sources` does not name —
// was never visited and never flagged. Proven by dropping an untracked file
// into site/docs/ and running --check: it printed "already in sync" with the
// orphan sitting right there. Now every *.md under site/docs/ is required to
// be accounted for by exactly one entry in `sources`, and the number of
// sources actually examined is asserted against the number found on disk.

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
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

if (sources.length === 0) {
  console.error('sync-site-docs: no source docs found (docs/*.md + ROOT_DOCS) — refusing to report an empty mirror as in sync')
  process.exit(1)
}

const knownDestNames = new Set(sources.map(([, destName]) => destName))

let stale = []
let examined = 0
for (const [src, destName] of sources) {
  const want = rewrite(readFileSync(join(root, src), 'utf8'))
  const dest = join(root, 'site', 'docs', destName)
  const have = existsSync(dest) ? readFileSync(dest, 'utf8') : null
  examined++
  if (have === want) continue
  stale.push(`${src} -> site/docs/${destName}`)
  if (!check) writeFileSync(dest, want)
}

if (examined !== sources.length) {
  console.error(`sync-site-docs: examined ${examined} of ${sources.length} source(s) — the check did not do its whole job`)
  process.exit(1)
}

// site/docs/ is written only by this script, so any *.md there that no source
// names is an orphan — left behind by a rename or a retired doc, and still
// served to readers of the site.
const siteDocsDir = join(root, 'site', 'docs')
const orphans = (existsSync(siteDocsDir) ? readdirSync(siteDocsDir) : [])
  .filter((f) => f.endsWith('.md') && !knownDestNames.has(f))

if (check && (stale.length || orphans.length)) {
  console.error(`site/docs is stale (${stale.length} file(s), ${orphans.length} orphan(s)):`)
  for (const s of stale) console.error(`  ${s}`)
  for (const o of orphans) console.error(`  orphan: site/docs/${o} is not a mirror of any source doc`)
  console.error('\nRun: node scripts/sync-site-docs.mjs')
  process.exit(1)
}

if (!check) {
  for (const o of orphans) unlinkSync(join(siteDocsDir, o))
}

const summary = []
if (stale.length) summary.push(`synced ${stale.length} file(s):\n  ${stale.join('\n  ')}`)
if (orphans.length) summary.push(`removed ${orphans.length} orphan(s):\n  ${orphans.join('\n  ')}`)
console.log(summary.length ? summary.join('\n') : `site/docs already in sync (${examined} file(s), 0 orphans)`)
