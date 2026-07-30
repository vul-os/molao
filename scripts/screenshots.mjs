#!/usr/bin/env node
/**
 * Capture the screenshots that go in the README.
 *
 * Builds the UI in demo mode, serves `apps/web/dist` from a tiny static server,
 * and drives Playwright Chromium over the five desktop screens and three mobile
 * ones. No node, no network, no
 * backend — that is the point: if this script needs something running, the demo
 * mode it is exercising is not really standalone.
 *
 *   npm run screenshots
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(ROOT, 'apps', 'web', 'dist');
const OUT = join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.MOLAO_SHOT_PORT ?? 4319);
const THEME = process.env.MOLAO_SHOT_THEME === 'light' ? 'light' : 'dark';

const DESKTOP = { viewport: { width: 1440, height: 900 }, scale: 2 };
const MOBILE = { viewport: { width: 390, height: 844 }, scale: 3 };

/**
 * Tallest shape a DESKTOP screenshot may be, as height/width.
 *
 * This is a guard, not a preference. A previous pass switched every shot to
 * full-page capture to stop elements being sliced, and silently produced
 * 1:7.5 and 1:8.3 mobile images — correct in content, useless as pictures.
 * Nothing in the pipeline noticed, because "is it blank?" was the only shape
 * check there was. 1.6 comfortably admits a full desktop page (the tallest
 * today is judgment at ~1:1.42) and rejects a scroll strip.
 *
 * Mobile is deliberately NOT subject to this: a phone frame is 1:2.16 by
 * nature, and is pinned to its exact device dimensions instead.
 */
const MAX_RATIO = 1.6;

/**
 * Read a PNG's pixel dimensions from its IHDR chunk.
 *
 * Deliberately not a dependency: width and height are a fixed offset into
 * every PNG (bytes 16..24, big-endian u32 each, immediately after the 8-byte
 * signature and the IHDR length+type), and pulling an image library into a
 * screenshot script to read eight bytes would be the wrong trade.
 */
async function sharpish(file) {
  const fh = await open(file);
  try {
    const buf = Buffer.alloc(24);
    const { bytesRead } = await fh.read(buf, 0, 24, 0);
    if (bytesRead < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error(`${file} is not a PNG (no IHDR)`);
    }
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    await fh.close();
  }
}

/** The featured judgment in the demo corpus: Nkosi v Minister of Police. */
const FEATURED = '5941a989115f328d27731cd1c3e9b7eacae10638439bf862d3a9fb2d24f5c051';

const SEARCH = '#/?q=constitutional%20damages';
const JUDGMENT = `#/case/${FEATURED}`;

/** The five the README names, at 1440x900. Do not rename these. */
const DESKTOP_SHOTS = [
  { name: 'hero', hash: SEARCH, wait: '.result' },
  { name: 'judgment', hash: JUDGMENT, wait: '.para .text' },
  { name: 'citations', hash: `${JUDGMENT}/citations`, wait: '.citelist .citerow' },
  { name: 'graph', hash: `${JUDGMENT}/graph`, wait: '.graph-wrap svg .gnode' },
  { name: 'status', hash: '#/status', wait: '.stats .stat' },
];

/** Mobile is a first-class target, so it is a first-class screenshot set. */
const MOBILE_SHOTS = [
  { name: 'mobile-search', hash: SEARCH, wait: '.result' },
  { name: 'mobile-judgment', hash: JUDGMENT, wait: '.para .text' },
  // Below the breakpoint the SVG is hidden and the neighbourhood renders as
  // grouped lane lists, so wait for those rather than for nodes that are
  // present in the DOM but never visible.
  { name: 'mobile-graph', hash: `${JUDGMENT}/graph`, wait: '.graph-lanes .lane-item' },
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
  let count = 0;
  try {
    for (const set of [
      { device: DESKTOP, shots: DESKTOP_SHOTS, mobile: false },
      { device: MOBILE, shots: MOBILE_SHOTS, mobile: true },
    ]) {
      const context = await browser.newContext({
        viewport: set.device.viewport,
        deviceScaleFactor: set.device.scale,
        colorScheme: THEME,
        reducedMotion: 'reduce',
        isMobile: set.mobile,
        hasTouch: set.mobile,
      });
      const page = await context.newPage();

      page.on('pageerror', (err) => {
        throw new Error(`page error: ${err.message}`);
      });
      page.on('requestfailed', (req) => {
        console.warn(`  ! request failed: ${req.url()}`);
      });

      for (const shot of set.shots) {
        const url = `http://127.0.0.1:${PORT}/${shot.hash}`;
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForSelector(shot.wait, { state: 'visible', timeout: 10_000 });
        // Let the layout settle (fonts, the graph layout, tab paint).
        await page.waitForTimeout(320);

        // A page that scrolls sideways on a phone is a bug, not a screenshot.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 0) {
          throw new Error(`${shot.name}: body scrolls horizontally by ${overflow}px`);
        }

        // Desktop is captured full-page; mobile is captured at the device frame.
        //
        // The asymmetry is deliberate, and both halves of it are bug fixes.
        //
        // Desktop was viewport-clipped, and a fixed-height window cuts a tall
        // panel wherever it happens to end — which sliced the graph legend
        // mid-glyph, and left a citation card and a graph-lane card with no
        // closing edge. Full-page framing cannot recur as the demo corpus
        // grows, because it has no fixed height to run past, and at 1:1 to
        // 1:1.4 the result is still a usable image.
        //
        // Mobile must NOT be full-page. These are pictures of a phone, and a
        // phone is 1170×2532. Full-page capture turned them into 1:7.5 and
        // 1:8.3 scroll strips (mobile-judgment reached 1170×9675), which
        // render as unreadable slivers wherever they are embedded and no
        // longer look like a phone at all. A cut at the fold is not a defect
        // here — it is what a phone screen is. The sticky header keeps the
        // "demo corpus" chip in frame either way, which is what the
        // disclosure rule actually protects; the footer's honesty line is a
        // nice-to-have and is not worth a nine-thousand-pixel image.
        const file = join(OUT, `${shot.name}.png`);
        await page.screenshot({ path: file, fullPage: !set.mobile, animations: 'disabled' });
        const size = (await stat(file)).size;
        if (size < 12_000) throw new Error(`${shot.name}.png looks blank (${size} bytes)`);

        // Assert the shape, so neither failure mode can come back silently.
        const { width: pxW, height: pxH } = await sharpish(file);
        if (set.mobile) {
          // A phone is 1:2.16 by nature, so a ratio ceiling is the wrong tool
          // here — the exact device frame is both the intent and a stricter
          // check than any ratio would be.
          if (pxW !== 1170 || pxH !== 2532) {
            throw new Error(
              `${shot.name}.png is ${pxW}×${pxH}, expected the 1170×2532 device frame`,
            );
          }
        } else {
          const ratio = pxH / pxW;
          if (ratio > MAX_RATIO) {
            throw new Error(
              `${shot.name}.png is ${pxW}×${pxH} (1:${ratio.toFixed(2)}) — taller than 1:${MAX_RATIO}. ` +
                `A screenshot this shape renders as a sliver wherever it is embedded.`,
            );
          }
        }
        console.log(
          `  ✓ docs/screenshots/${shot.name}.png  ${pxW}×${pxH}  ${(size / 1024).toFixed(0)} kB`,
        );
        count += 1;
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`› done — ${count} screenshots (desktop 1440×900 @2x, mobile 390×844 @3x)`);
}

main().catch((err) => {
  console.error(`\nscreenshots failed: ${err.message}`);
  process.exit(1);
});
