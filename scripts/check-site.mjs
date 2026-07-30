// Landing-page verifier: breakpoints, type floor, overflow, image aspect,
// and — the one that matters most for this project — zero outbound requests.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = '/Users/pc/code/vulos/molao/site';
const OUT = '/private/tmp/claude-501/-Users-pc-code-vulos/8606e9de-dcba-4abc-8a2a-dc73a4da360b/scratchpad/shots';
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

const BPS = [320, 375, 768, 1024, 1440];
const SCHEMES = ['light', 'dark'];
let fail = 0;
const say = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const browser = await chromium.launch();
for (const scheme of SCHEMES) {
  for (const w of BPS) {
    // `reducedMotion: 'reduce'` is load-bearing, not politeness. The page sets
    // `scroll-behavior: smooth`, which races the driver: a scroll issued and
    // then measured immediately reports a position the browser is still
    // animating towards, so sticky-element geometry comes back wrong and
    // screenshots come back mid-scroll or blank. It cost a previous pass two
    // bogus captures before the cause was found. Same class of trap as
    // fast auto-scroll not firing IntersectionObserver.
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      colorScheme: scheme,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    const external = [];
    const failed = [];
    page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
    page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(base, '')}`); });
    page.on('requestfailed', r => failed.push(`requestfailed ${r.url().replace(base, '')}`));

    await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      // Aspect ratio is what this checks; lazy loading is not.
      for (const i of document.images) i.loading = 'eager';
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
      await Promise.all([...document.images].map(i => i.complete ? null : Promise.race([
        new Promise(r => { i.onload = i.onerror = r; }),
        new Promise(r => setTimeout(r, 4000)),
      ])));
    });
    await page.waitForTimeout(500);

    const tag = `${scheme}/${w}`;
    say(external.length === 0, `${tag}  outbound requests: ${external.length ? external.join(', ') : 'none'}`);
    say(failed.length === 0, `${tag}  failed/4xx resources: ${failed.length ? failed.join(', ') : 'none'}`);

    const overflow = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth, winW = window.innerWidth;
      const bad = [];
      if (docW > winW + 1) {
        for (const el of document.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.right > winW + 1 && r.width > 0) bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} right=${Math.round(r.right)}`);
        }
      }
      return { docW, winW, bad: bad.slice(0, 6) };
    });
    say(overflow.docW <= overflow.winW + 1, `${tag}  no horizontal page overflow (scrollWidth ${overflow.docW} vs ${overflow.winW})${overflow.bad.length ? ' :: ' + overflow.bad.join(' | ') : ''}`);

    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.firstChild) continue;
        let hasText = false;
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
        if (!hasText) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const fs = parseFloat(cs.fontSize);
        if (fs < 12) out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}=${fs}px "${el.textContent.trim().slice(0, 28)}"`);
      }
      return out;
    });
    say(small.length === 0, `${tag}  no text below 12px${small.length ? ' :: ' + small.slice(0, 8).join(' | ') : ''}`);

    // SVG label check: viewBox units scale, so measure the rendered height of
    // a text node inside each figure rather than its declared font-size.
    const svgSmall = await page.evaluate(() => {
      const out = [];
      for (const t of document.querySelectorAll('.fig svg text')) {
        const box = t.getBoundingClientRect();
        const svg = t.ownerSVGElement;
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const eff = parseFloat(getComputedStyle(t).fontSize) * scale;
        if (box.width > 0 && eff < 12) out.push(`${t.textContent.slice(0, 22)}=${eff.toFixed(1)}px`);
      }
      return out;
    });
    say(svgSmall.length === 0, `${tag}  no SVG label below 12px effective${svgSmall.length ? ' :: ' + svgSmall.slice(0, 5).join(' | ') : ''}`);

    const stretched = await page.evaluate(() => {
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
    say(stretched.length === 0, `${tag}  every image keeps its aspect ratio${stretched.length ? ' :: ' + stretched.join(' | ') : ''}`);

    const fontOk = await page.evaluate(async () => {
      await document.fonts.ready;
      return { fraunces: document.fonts.check('16px Fraunces'), plex: document.fonts.check('12px "Plex Mono"') };
    });
    say(fontOk.fraunces && fontOk.plex, `${tag}  vendored fonts loaded (Fraunces=${fontOk.fraunces}, Plex Mono=${fontOk.plex})`);

    await page.screenshot({ path: `${OUT}/${scheme}-${w}.png`, fullPage: false });
    await ctx.close();
  }
}
await browser.close();
server.close();

const misses = served.filter(([s]) => s === 404);
say(misses.length === 0, `server saw no 404s (${misses.map(m => m[1]).join(', ') || 'none'})`);
console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
