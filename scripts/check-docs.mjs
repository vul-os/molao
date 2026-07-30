// Docs-viewer verifier. Same checks the landing page harness applies
// (outbound requests, 4xx, overflow, sub-12px, aspect ratio, fonts) plus the
// ones that only mean anything for a docs viewer: every chapter renders, the
// diagram renders, and on a phone the PROSE is what is on screen first.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ROOT = join(REPO, 'site');
// Screenshots go under the OS temp dir, never the repo — a verifier that
// writes into the tree it is verifying will eventually be committed by
// accident and then start verifying its own output.
const OUT = join(process.env.TMPDIR || '/tmp', 'molao-docshots');
await mkdir(OUT, { recursive: true });
const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml',
  '.png':'image/png', '.woff2':'font/woff2', '.md':'text/markdown', '.txt':'text/plain' };

const served = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = join(ROOT, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
  try {
    const buf = await readFile(p.endsWith('/') ? join(p, 'index.html') : p);
    served.push([200, url.pathname]);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    served.push([404, url.pathname]);
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let fail = 0;
const say = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const SLUGS = ['getting-started','running-a-node','api','rag','screenshots','faq','architecture','citations',
  'courts','provenance','releases','distribution','sources','source-map','content-signals','governance',
  'threat-model','security','contributing','roadmap','changelog'];

const browser = await chromium.launch();

// Instrumented page: returns the recorders so each check can read them.
async function open(w, h, scheme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const external = [], failed = [], consoleErrs = [];
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(base, '')}`); });
  page.on('requestfailed', r => failed.push(`requestfailed ${r.url().replace(base, '')}`));
  page.on('pageerror', e => consoleErrs.push(String(e).slice(0, 160)));
  return { ctx, page, external, failed, consoleErrs };
}

async function settle(page) {
  // Slow scroll: a fast auto-scroll does not fire IntersectionObserver and
  // yields blank captures that are an artifact, not a bug.
  await page.evaluate(async () => {
    for (const i of document.images) i.loading = 'eager';
    const step = window.innerHeight * 0.6;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 110));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map(i => i.complete ? null : Promise.race([
      new Promise(r => { i.onload = i.onerror = r; }),
      new Promise(r => setTimeout(r, 4000)),
    ])));
  });
  await page.waitForTimeout(350);
}

const overflowOf = page => page.evaluate(() => {
  const docW = document.documentElement.scrollWidth, winW = window.innerWidth;
  const bad = [];
  if (docW > winW + 1) for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.right > winW + 1 && r.width > 0) bad.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]} right=${Math.round(r.right)}`);
  }
  return { docW, winW, bad: bad.slice(0, 6) };
});

const smallOf = page => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.firstChild) continue;
    let hasText = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const fs = parseFloat(cs.fontSize);
    if (fs < 12) out.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]}=${fs}px "${el.textContent.trim().slice(0,28)}"`);
  }
  return out;
});

const stretchedOf = page => page.evaluate(() => {
  const out = [];
  for (const img of document.querySelectorAll('img')) {
    if (!img.naturalWidth || !img.naturalHeight) { out.push(`${img.getAttribute('src')} DID NOT LOAD`); continue; }
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const nat = img.naturalWidth / img.naturalHeight, ren = r.width / r.height;
    if (Math.abs(nat - ren) / nat > 0.02) out.push(`${img.getAttribute('src')} natural ${nat.toFixed(3)} vs rendered ${ren.toFixed(3)}`);
  }
  return out;
});

// ── Pass A: every chapter renders, at a phone and at a desk ────────────────
for (const [w, h, scheme] of [[390, 844, 'light'], [1280, 900, 'dark']]) {
  const { ctx, page, external, failed, consoleErrs } = await open(w, h, scheme);
  await page.goto(`${base}/docs.html`, { waitUntil: 'networkidle' });
  for (const slug of SLUGS) {
    await page.evaluate(s => { location.hash = '#' + s; }, slug);
    await page.waitForFunction(s => {
      const c = document.getElementById('content');
      return c && !c.querySelector('.loading') && location.hash === '#' + s;
    }, slug, { timeout: 15000 });
    await page.waitForTimeout(slug === 'architecture' ? 1800 : 120);

    const info = await page.evaluate(() => {
      const c = document.getElementById('content');
      return {
        err: !!c.querySelector('.notice-err'),
        h1: (document.querySelector('#chapter h1') || {}).textContent || '',
        chars: c.textContent.trim().length,
        heads: c.querySelectorAll('h2,h3').length,
        anchors: c.querySelectorAll('.anchor').length,
        tables: c.querySelectorAll('.tablewrap table').length,
        rawTables: c.querySelectorAll('table').length,
        codes: c.querySelectorAll('.codefig pre').length,
        rawPre: c.querySelectorAll('pre').length,
        diagrams: c.querySelectorAll('.diagram svg').length,
        unrendered: c.querySelectorAll('code.language-mermaid').length,
        tocLinks: document.querySelectorAll('#toc-inline-body a, #toc-rail-body a').length,
        crumb: document.getElementById('crumb-now').textContent,
        current: (document.querySelector('#idx a[aria-current="page"]') || {}).textContent || '',
      };
    });
    const tag = `${scheme}/${w}/${slug}`;
    say(!info.err && info.chars > 400 && info.h1.length > 0,
      `${tag}  renders (h1="${info.h1.replace('§','')}", ${info.chars} chars, ${info.heads} sections, ${info.tables}/${info.rawTables} tables wrapped, ${info.codes}/${info.rawPre} code blocks)`);
    say(info.anchors === info.heads + (info.h1 ? 0 : 0) || info.anchors >= info.heads,
      `${tag}  every section heading is deep-linkable (${info.anchors} anchors >= ${info.heads} h2/h3)`);
    say(info.rawTables === info.tables, `${tag}  every table sits in a scroller (${info.tables}/${info.rawTables})`);
    say(info.crumb.length > 0 && info.current.includes(info.crumb), `${tag}  index marks the open chapter ("${info.current}" / "${info.crumb}")`);
    if (slug === 'architecture') {
      say(info.diagrams === 1 && info.unrendered === 0, `${tag}  mermaid diagram rendered to SVG (${info.diagrams} svg, ${info.unrendered} unrendered)`);
    }
    const ov = await overflowOf(page);
    say(ov.docW <= ov.winW + 1, `${tag}  no horizontal overflow (${ov.docW} vs ${ov.winW})${ov.bad.length ? ' :: ' + ov.bad.join(' | ') : ''}`);
    const sm = await smallOf(page);
    say(sm.length === 0, `${tag}  no text below 12px${sm.length ? ' :: ' + sm.slice(0, 6).join(' | ') : ''}`);
  }
  say(external.length === 0, `${scheme}/${w}  outbound requests across all 21 chapters: ${external.length ? external.join(', ') : 'none'}`);
  say(failed.length === 0, `${scheme}/${w}  failed/4xx resources: ${failed.length ? failed.join(', ') : 'none'}`);
  say(consoleErrs.length === 0, `${scheme}/${w}  no uncaught page errors${consoleErrs.length ? ' :: ' + consoleErrs.join(' | ') : ''}`);
  await ctx.close();
}

// ── Pass B: breakpoint sweep on the chapters with the hard content ─────────
for (const scheme of ['light', 'dark']) {
  for (const w of [320, 375, 768, 1024, 1440]) {
    const { ctx, page, external, failed } = await open(w, 900, scheme);
    await page.goto(`${base}/docs.html#screenshots`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('#content .loading'));
    await settle(page);
    const tag = `${scheme}/${w}`;
    say(external.length === 0, `${tag}  outbound requests: ${external.length ? external.join(', ') : 'none'}`);
    say(failed.length === 0, `${tag}  failed/4xx resources: ${failed.length ? failed.join(', ') : 'none'}`);
    const ov = await overflowOf(page);
    say(ov.docW <= ov.winW + 1, `${tag}  no horizontal page overflow (${ov.docW} vs ${ov.winW})${ov.bad.length ? ' :: ' + ov.bad.join(' | ') : ''}`);
    const sm = await smallOf(page);
    say(sm.length === 0, `${tag}  no text below 12px${sm.length ? ' :: ' + sm.slice(0, 6).join(' | ') : ''}`);
    const st = await stretchedOf(page);
    say(st.length === 0, `${tag}  every image keeps its aspect ratio${st.length ? ' :: ' + st.join(' | ') : ''}`);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return { fraunces: document.fonts.check('16px Fraunces'), plex: document.fonts.check('12px "Plex Mono"') };
    });
    say(fonts.fraunces && fonts.plex, `${tag}  vendored fonts loaded (Fraunces=${fonts.fraunces}, Plex Mono=${fonts.plex})`);

    // The defect this rebuild exists to fix: on a phone the reader used to get
    // the whole sidebar as the first screen. Measure where the prose starts.
    if (w <= 768) {
      const geo = await page.evaluate(() => {
        const h1 = document.querySelector('#chapter h1');
        const idx = document.getElementById('index');
        return {
          proseTop: Math.round(h1.getBoundingClientRect().top + window.scrollY),
          navVisible: getComputedStyle(idx).visibility !== 'hidden',
          navOffscreen: Math.round(idx.getBoundingClientRect().right),
        };
      });
      say(geo.proseTop < 320, `${tag}  chapter title is on the first screen (starts at y=${geo.proseTop}px)`);
      say(!geo.navVisible && geo.navOffscreen <= 0, `${tag}  index is a closed drawer, not the first screen (visible=${geo.navVisible}, right=${geo.navOffscreen})`);

      // ...and the drawer must actually open.
      await page.click('#burger');
      await page.waitForTimeout(320);
      const open = await page.evaluate(() => {
        const idx = document.getElementById('index');
        const r = idx.getBoundingClientRect();
        return { vis: getComputedStyle(idx).visibility, left: Math.round(r.left), links: idx.querySelectorAll('a[data-slug]').length,
                 expanded: document.getElementById('burger').getAttribute('aria-expanded') };
      });
      say(open.vis === 'visible' && open.left >= -1 && open.links === 21 && open.expanded === 'true',
        `${tag}  Contents drawer opens with all 21 chapters (visible=${open.vis}, left=${open.left}, links=${open.links})`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const closed = await page.evaluate(() => document.getElementById('burger').getAttribute('aria-expanded'));
      say(closed === 'false', `${tag}  Escape closes the drawer (aria-expanded=${closed})`);
    }
    await page.screenshot({ path: `${OUT}/${scheme}-${w}.png`, fullPage: false });
    await ctx.close();
  }
}

// ── Search, deep links, screenshot plates ─────────────────────────────────
{
  const { ctx, page, external, failed } = await open(390, 844, 'light');
  await page.goto(`${base}/docs.html`, { waitUntil: 'networkidle' });
  await page.click('#rail-search');
  await page.fill('#search', 'quorum');
  await page.waitForFunction(() => document.querySelectorAll('#idx .hit').length > 0, null, { timeout: 15000 });
  const hits = await page.evaluate(() => ({
    n: document.querySelectorAll('#idx .hit').length,
    chapters: [...new Set([...document.querySelectorAll('#idx .hit')].map(a => a.getAttribute('href').split('/')[0]))].length,
    first: document.querySelector('#idx .hit').getAttribute('href'),
  }));
  say(hits.n > 3 && hits.chapters > 2, `search "quorum" -> ${hits.n} hits across ${hits.chapters} chapters (first: ${hits.first})`);

  // A search hit is a deep link: follow it and confirm we land on the heading.
  await page.click('#idx .hit');
  await page.waitForTimeout(1200);
  const landed = await page.evaluate(() => {
    const raw = location.hash.replace('#', '');
    const [slug, anchor] = raw.split('/');
    const el = anchor ? document.getElementById(anchor) : null;
    return { slug, anchor: anchor || '', found: !!el, top: el ? Math.round(el.getBoundingClientRect().top) : null,
             crumb: document.getElementById('crumb-now').textContent };
  });
  say(landed.slug.length > 0 && landed.crumb.length > 0 && (!landed.anchor || landed.found),
    `search hit is a working deep link (#${landed.slug}${landed.anchor ? '/' + landed.anchor : ''}, heading found=${landed.found}, chapter="${landed.crumb}")`);

  // Direct deep link, cold, into the middle of a long chapter.
  await page.goto(`${base}/docs.html#threat-model/what-this-does-not-protect-against`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#content .loading'));
  await page.waitForTimeout(600);
  const deep = await page.evaluate(() => {
    const el = document.getElementById('what-this-does-not-protect-against');
    return { found: !!el, scrolled: Math.round(window.scrollY), heads: [...document.querySelectorAll('#content h2')].slice(0,3).map(h => h.id) };
  });
  say(deep.found && deep.scrolled > 100, `cold deep link scrolls to the section (found=${deep.found}, scrollY=${deep.scrolled})`);

  // Every screenshot plate the site ships must be reachable at the path the
  // viewer rewrites to.
  const plates = ['hero.png','judgment.png','citations.png','graph.png','status.png','mobile-search.png','mobile-judgment.png','mobile-graph.png'];
  const plateStatus = await page.evaluate(async names => {
    const out = [];
    for (const n of names) {
      try { const r = await fetch('./screenshots/' + n, { method: 'GET' }); out.push(`${n}:${r.status}`); }
      catch (e) { out.push(`${n}:ERR`); }
    }
    return out;
  }, plates);
  say(plateStatus.every(s => s.endsWith(':200')), `all 8 screenshot plates resolve at ./screenshots/ :: ${plateStatus.join(' ')}`);

  say(external.length === 0, `search/deep-link pass  outbound requests: ${external.length ? external.join(', ') : 'none'}`);
  say(failed.length === 0, `search/deep-link pass  failed/4xx: ${failed.length ? failed.join(', ') : 'none'}`);
  await ctx.close();
}

await browser.close();
server.close();

const misses = served.filter(([s]) => s === 404);
say(misses.length === 0, `server saw no 404s (${[...new Set(misses.map(m => m[1]))].join(', ') || 'none'})`);
console.log(`\n${fail === 0 ? 'ALL DOCS CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
