#!/usr/bin/env node
/* Records landing/showcase.html (a MacBook and an iPhone 15 Pro, both running the same live site,
 * scrolling together) into landing/assets/demo.mp4, demo.gif and demo-poster.jpg.
 * Needs playwright (chromium) + ffmpeg.
 *   node scripts/record-demo.mjs                                   # site = https://spikestudiodxb.com
 *   node scripts/record-demo.mjs --site https://example.com/        # any site that allows framing
 *   node scripts/record-demo.mjs --site-dir ../spike-rebuild/dist   # a local static build, served on a second port
 * Frames come straight from Chromium's screencast at 2x (2560x1440 JPEG, no VP8 re-encode), timed by
 * the compositor timestamps, then encoded once at 30 fps. The scrolling is driven from here, not from
 * inside the page, so cross-origin frames work: synthetic wheel events (Lenis and friends listen to them),
 * falling back to scrollBy. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'landing', 'assets');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'phonefix-rec-'));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.txt': 'text/plain' };
const serve = (dir) => new Promise(res => {
  const s = http.createServer((req, r) => {
    let f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir)) { r.writeHead(403); return r.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  });
  s.listen(0, '127.0.0.1', () => res({ server: s, origin: `http://127.0.0.1:${s.address().port}` }));
});

const main = await serve(root);
const siteDir = arg('--site-dir');
const siteSrv = siteDir ? await serve(path.resolve(siteDir)) : null;
const site = siteSrv ? `${siteSrv.origin}/?nogate` : arg('--site', 'https://spikestudiodxb.com/?nogate');

const SCROLL_MS = 8400, LAP_PX = 3400, PHONE_PX = 3800, HOLD_MS = 1400, FPS = 30;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
// runs in every frame, including cross-origin ones: pre-accept the site's cookie notice so it never shows in the take
await ctx.addInitScript(() => { try { localStorage.setItem('spike-cookie-ok', '1'); } catch {} });
const page = await ctx.newPage();
await page.goto(`${main.origin}/landing/showcase.html?site=${encodeURIComponent(site)}`, { waitUntil: 'load' });
await page.evaluate(() => window.__showcase.ready);

// ---- screencast: every compositor frame, 2x, JPEG ----
const cdp = await ctx.newCDPSession(page);
const frames = []; let n = 0;
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const f = path.join(tmp, `f${String(n++).padStart(5, '0')}.jpg`);
  fs.writeFileSync(f, Buffer.from(data, 'base64'));
  frames.push({ f, t: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
await page.waitForTimeout(250);

const tPlay = Date.now();
await page.evaluate(() => window.__showcase.play());
await page.screenshot({ path: path.join(out, 'demo-poster.jpg'), type: 'jpeg', quality: 86, scale: 'css' });

const frame = (name) => page.frames().find(f => f.name() === name);
const lapF = frame('lap'), phF = frame('ph');
if (!lapF || !phF) throw new Error('device frames not found');

/* eased scroll over `ms`, total `px`, via wheel events (smooth-scroll libraries listen to them); falls back to scrollBy */
const scrollIn = (f, px, ms) => f.evaluate(({ px, ms }) => new Promise(res => {
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // cubic in-out: slow start, slow settle
  let last = 0, t0 = performance.now(), native = false, probed = false;
  const y0 = window.scrollY;
  (function tick(now) {
    const p = Math.min(1, (now - t0) / ms), cur = Math.round(px * ease(p)), d = cur - last; last = cur;
    if (!probed && now - t0 > 260) { probed = true; native = Math.abs(window.scrollY - y0) < 2; }   // nobody consumed the wheel: scroll natively
    if (d) { if (native) window.scrollBy(0, d); else window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, bubbles: true, cancelable: true })); }
    if (p < 1) requestAnimationFrame(tick); else res();
  })(t0);
}), { px, ms });

await page.waitForTimeout(400);
await Promise.all([scrollIn(lapF, LAP_PX, SCROLL_MS), scrollIn(phF, PHONE_PX, SCROLL_MS)]);
await page.evaluate(() => window.__showcase.cmd());
await page.waitForTimeout(HOLD_MS);
await page.evaluate(() => window.__showcase.outro());
await page.waitForTimeout(150);
await cdp.send('Page.stopScreencast');
const played = (Date.now() - tPlay) / 1000;
await browser.close(); main.server.close(); siteSrv && siteSrv.server.close();

// ---- encode: concat frames with their real durations, resample to 30 fps ----
if (frames.length < 30) throw new Error(`only ${frames.length} frames captured`);
const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${(i + 1 < frames.length ? frames[i + 1].t - fr.t : 1 / FPS).toFixed(5)}`).join('\n') + `\nfile '${frames[frames.length - 1].f}'\n`;
const listPath = path.join(tmp, 'list.txt'); fs.writeFileSync(listPath, list);
const mp4 = path.join(out, 'demo.mp4'), mp4s = path.join(out, 'demo-720.mp4'), gif = path.join(out, 'demo.gif'), pal = path.join(tmp, 'pal.png');
const src = ['-f', 'concat', '-safe', '0', '-i', listPath];
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-vf', `fps=${FPS},scale=1920:1080:flags=lanczos`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-vf', `fps=${FPS},scale=1280:720:flags=lanczos`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', mp4s]);   // phones get this one
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-vf', 'fps=10,scale=720:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff', pal]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-i', pal, '-lavfi', 'fps=10,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', '-loop', '0', gif]);
const sz = f => (fs.statSync(f).size / 1e6).toFixed(2) + ' MB';
const span = frames[frames.length - 1].t - frames[0].t;
console.log(`site ${site}\n${frames.length} frames over ${span.toFixed(1)}s (${(frames.length / span).toFixed(0)} fps captured) · scene ${played.toFixed(1)}s\nmp4 ${sz(mp4)} · 720p ${sz(mp4s)} · gif ${sz(gif)} · poster ${sz(path.join(out, 'demo-poster.jpg'))}`);
fs.rmSync(tmp, { recursive: true, force: true });
