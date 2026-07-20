#!/usr/bin/env node
/**
 * Capture the screenshots that go in the README.
 *
 * Builds the UI in demo mode, serves `apps/web/dist` from a tiny static server,
 * and drives Playwright Chromium over the five screens. No node, no network, no
 * backend — that is the point: if this script needs something running, the demo
 * mode it is exercising is not really standalone.
 *
 *   npm run screenshots
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(ROOT, 'apps', 'web', 'dist');
const OUT = join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.MOLAO_SHOT_PORT ?? 4319);

const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;

/** The featured judgment in the demo corpus: Nkosi v Minister of Police. */
const FEATURED = '5941a989115f328d27731cd1c3e9b7eacae10638439bf862d3a9fb2d24f5c051';

const SHOTS = [
  { name: 'hero', hash: '#/?q=constitutional%20damages', wait: '.result' },
  { name: 'judgment', hash: `#/case/${FEATURED}`, wait: '.para .text' },
  { name: 'citations', hash: `#/case/${FEATURED}/citations`, wait: '.citelist .citerow' },
  { name: 'graph', hash: `#/case/${FEATURED}/graph`, wait: '.graph-wrap svg .gnode' },
  { name: 'status', hash: '#/status', wait: '.stats .stat' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with status ${res.status}`);
  }
}

function serve(dir, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index.html';
    // Contain the server to `dist`; it is a build tool, but it is still a server.
    const file = join(dir, path);
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

async function main() {
  console.log('› building the UI in demo mode');
  run('npm', ['run', 'build:demo', '--workspace', 'apps/web'], ROOT);

  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error(`build produced no index.html in ${DIST}`);
  }
  await mkdir(OUT, { recursive: true });

  const { chromium } = await import('playwright');

  const server = await serve(DIST, PORT);
  const browser = await chromium.launch();
  try {
    for (const theme of ['dark']) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();

      page.on('pageerror', (err) => {
        throw new Error(`page error: ${err.message}`);
      });
      page.on('requestfailed', (req) => {
        console.warn(`  ! request failed: ${req.url()}`);
      });

      for (const shot of SHOTS) {
        const url = `http://127.0.0.1:${PORT}/${shot.hash}`;
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForSelector(shot.wait, { state: 'visible', timeout: 10_000 });
        // Let the layout settle (fonts, the graph relaxation, tab paint).
        await page.waitForTimeout(320);
        const file = join(OUT, `${shot.name}.png`);
        await page.screenshot({ path: file, animations: 'disabled' });
        const size = (await stat(file)).size;
        if (size < 12_000) throw new Error(`${shot.name}.png looks blank (${size} bytes)`);
        console.log(`  ✓ docs/screenshots/${shot.name}.png  ${(size / 1024).toFixed(0)} kB`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`› done — ${SHOTS.length} screenshots at ${VIEWPORT.width}×${VIEWPORT.height} @${SCALE}x`);
}

main().catch((err) => {
  console.error(`\nscreenshots failed: ${err.message}`);
  process.exit(1);
});
