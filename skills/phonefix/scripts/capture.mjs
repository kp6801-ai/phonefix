#!/usr/bin/env node
/* phonefix capture.mjs — render a site on a matrix of phone viewports, run checks.js, save screenshots.
 *
 *   node capture.mjs --url http://localhost:3000 --label before
 *   node capture.mjs --dir ./dist --label after --routes /,/pricing --devices iphone-se,pixel-7
 *
 * Flags: --url <origin> | --dir <static root>   --label before|after (default: before)
 *        --out <dir> (default ./phonefix-report)  --routes /a,/b (default /)
 *        --devices all|comma list of ids           --wait <ms> extra settle time (default 800)
 *        --timeout <ms> navigation timeout (default 30000)  --storage-state <file> (auth)
 *        --no-scroll  skip scroll-step screenshots  --inline-checks  print full issues JSON
 * Needs: Node 18+, playwright (npm i -D playwright && npx playwright install chromium webkit).
 * Output: <out>/<label>/<device>/{00-top.jpg,25.jpg,50.jpg,75.jpg,100.jpg,full.jpg,checks.json} + <out>/<label>/summary.json */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
if (!args.url && !args.dir) { console.error('phonefix: pass --url <origin> or --dir <static root>'); process.exit(2); }

let playwright;
try { playwright = await import('playwright'); }
catch { console.error('phonefix: playwright not found. Run: npm i -D playwright && npx playwright install chromium webkit'); process.exit(2); }
const { chromium, webkit, devices } = playwright;

// ---------- device matrix (ids are stable; see references/devices.md) ----------
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
export const DEVICES = [
  { id: 'iphone-se', name: 'iPhone SE (2nd/3rd gen)', browser: 'webkit', opts: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA } },
  { id: 'iphone-15', name: 'iPhone 15', browser: 'webkit', opts: { ...devices['iPhone 15'] } },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', browser: 'webkit', opts: { ...devices['iPhone 15 Pro Max'] } },
  { id: 'pixel-7', name: 'Pixel 7', browser: 'chromium', opts: { ...devices['Pixel 7'] } },
  { id: 'galaxy-s23', name: 'Galaxy S23', browser: 'chromium', opts: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: ANDROID_UA } },
  { id: 'ipad', name: 'iPad (portrait)', browser: 'webkit', opts: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS') } },
  { id: 'iphone-15-landscape', name: 'iPhone 15 landscape', browser: 'webkit', opts: { ...devices['iPhone 15 landscape'] } },
  { id: 'desktop', name: 'Desktop guard 1440', browser: 'chromium', opts: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, guard: true },
];
const wanted = (args.devices && args.devices !== 'all') ? args.devices.split(',').map(s => s.trim()) : DEVICES.map(d => d.id);
const matrix = DEVICES.filter(d => wanted.includes(d.id));
if (!matrix.length) { console.error('phonefix: no devices matched. ids: ' + DEVICES.map(d => d.id).join(', ')); process.exit(2); }

const label = args.label || 'before';
const out = path.resolve(args.out || 'phonefix-report');
const routes = (args.routes || '/').split(',').map(r => r.trim()).filter(Boolean);
const settle = +(args.wait ?? 800);
const navTimeout = +(args.timeout ?? 30000);
const checksSrc = fs.readFileSync(path.join(__dirname, 'checks.js'), 'utf8');

// ---------- static server for --dir ----------
let server, origin = args.url;
if (args.dir) {
  const root = path.resolve(args.dir);
  if (!fs.existsSync(root)) { console.error('phonefix: --dir not found: ' + root); process.exit(2); }
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain' };
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
}
origin = origin.replace(/\/$/, '');

// ---------- init script: hook hover listeners + WebGL contexts + reduced-motion JS usage ----------
const INIT = `(() => {
  window.__phonefixWebGL = 0;
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(t, ...r) { if (/webgl/i.test(t)) window.__phonefixWebGL++; return gc.call(this, t, ...r); };
  const ael = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, ...r) { if ((type === 'mouseenter' || type === 'mouseover') && this instanceof Element) this.setAttribute('data-phonefix-hover', '1'); return ael.call(this, type, ...r); };
  const mm = window.matchMedia;
  window.matchMedia = function(q) { if (/prefers-reduced-motion/.test(q)) window.__phonefixReducedMotionJS = true; return mm.call(this, q); };
})();`;

// ---------- run ----------
const browsers = {};
const summary = { label, origin: args.url || args.dir, generatedAt: new Date().toISOString(), devices: [] };
const t0 = Date.now();
console.log(`phonefix capture · label=${label} · ${matrix.length} devices × ${routes.length} route(s) · ${origin}`);
for (const dev of matrix) {
  if (!browsers[dev.browser]) {
    try { browsers[dev.browser] = await (dev.browser === 'webkit' ? webkit : chromium).launch(); }
    catch (e) { console.error(`phonefix: cannot launch ${dev.browser}: ${e.message.split('\n')[0]}\n  → npx playwright install ${dev.browser}`); summary.devices.push({ id: dev.id, name: dev.name, error: 'browser-missing' }); continue; }
  }
  const ctx = await browsers[dev.browser].newContext({ ...dev.opts, reducedMotion: 'no-preference', ...(args['storage-state'] ? { storageState: args['storage-state'] } : {}) });
  await ctx.addInitScript(INIT);
  for (const route of routes) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', e => consoleErrors.push('Uncaught: ' + String(e.message || e).slice(0, 300)));
    const dir = path.join(out, label, dev.id + (routes.length > 1 ? '__' + (route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root') : ''));
    fs.mkdirSync(dir, { recursive: true });
    const rec = { id: dev.id, name: dev.name, route, browser: dev.browser, guard: !!dev.guard, viewport: dev.opts.viewport, dpr: dev.opts.deviceScaleFactor, dir: path.relative(out, dir), shots: [] };
    try {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: navTimeout });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(settle);
      // scroll steps (exercise scroll-driven animations), then back to top
      if (!args['no-scroll']) {
        const steps = [0, 25, 50, 75, 100];
        for (const s of steps) {
          await page.evaluate(p => window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * p / 100, behavior: 'instant' }), s);
          await page.waitForTimeout(250);
          const f = `${String(s).padStart(2, '0')}.jpg`;
          await page.screenshot({ path: path.join(dir, f), type: 'jpeg', quality: 72 });
          rec.shots.push(f);
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(250);
      }
      await page.screenshot({ path: path.join(dir, 'full.jpg'), type: 'jpeg', quality: 60, fullPage: true }).catch(() => {});
      rec.shots.push('full.jpg');
      const result = await page.evaluate(checksSrc);
      for (const err of consoleErrors.slice(0, 5)) result.issues.unshift({ id: 'console-error', category: 'runtime', severity: 4, selector: 'window', detail: err, fix: 'Fix the runtime error first — nothing below is trustworthy while scripts throw.' });
      if (dev.guard) result.issues = result.issues.filter(i => ['console-error', 'overflow-x'].includes(i.id)); // desktop guard only cares about breakage
      result.consoleErrors = consoleErrors;
      fs.writeFileSync(path.join(dir, 'checks.json'), JSON.stringify(result, null, 2));
      rec.metrics = result.metrics;
      rec.issues = result.issues;
      rec.counts = countBySeverity(result.issues);
      rec.cssUnreadable = result.coverage.cssUnreadable;
    } catch (e) {
      rec.error = String(e.message || e).split('\n')[0];
    }
    summary.devices.push(rec);
    const c = rec.counts || {};
    console.log(`  ${rec.error ? '✗' : '·'} ${dev.name.padEnd(24)} ${String(dev.opts.viewport.width).padStart(4)}px  ${rec.error ? rec.error : `sev4:${c[4] || 0} sev3:${c[3] || 0} sev2:${c[2] || 0} sev1:${c[1] || 0}${rec.metrics && rec.metrics.docWidth > rec.metrics.viewport.w + 1 ? `  OVERFLOW ${rec.metrics.docWidth}px` : ''}`}`);
    await page.close();
  }
  await ctx.close();
}
for (const b of Object.values(browsers)) await b.close();
if (server) server.close();

summary.totals = countBySeverity(summary.devices.flatMap(d => d.issues || []));
summary.uniqueIssues = uniqueIssues(summary.devices);
summary.durationMs = Date.now() - t0;
fs.writeFileSync(path.join(out, label, 'summary.json'), JSON.stringify(summary, null, 2));
const u = summary.uniqueIssues;
console.log(`\n${u.length} unique issue(s) across devices · sev4:${u.filter(i => i.severity === 4).length} sev3:${u.filter(i => i.severity === 3).length} sev2:${u.filter(i => i.severity === 2).length} sev1:${u.filter(i => i.severity === 1).length} · ${(summary.durationMs / 1000).toFixed(1)}s`);
for (const i of u.filter(i => i.severity >= 3)) console.log(`  [${i.severity}] ${i.id.padEnd(18)} ${i.devices.length}/${matrix.length} devices  ${i.detail.slice(0, 110)}${i.detail.length > 110 ? '…' : ''}`);
if (args['inline-checks']) console.log(JSON.stringify(u, null, 2));
console.log(`\nwrote ${path.join(out, label)}/  → next: fix, re-run with --label after, then node report.mjs --out ${path.relative(process.cwd(), out) || '.'}`);
process.exit(u.some(i => i.severity === 4) ? 1 : 0);

// ---------- helpers ----------
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) o[k] = true; else { o[k] = v; i++; } }
  }
  return o;
}
function countBySeverity(issues) { const c = {}; for (const i of issues) c[i.severity] = (c[i.severity] || 0) + 1; return c; }
function uniqueIssues(devs) {
  const m = new Map();
  for (const d of devs) for (const i of d.issues || []) {
    const k = i.id + '|' + i.selector;
    if (!m.has(k)) m.set(k, { ...i, devices: [] });
    const e = m.get(k); e.devices.push(d.id); if (i.severity > e.severity) e.severity = i.severity;
  }
  return [...m.values()].sort((a, b) => b.severity - a.severity || b.devices.length - a.devices.length);
}
