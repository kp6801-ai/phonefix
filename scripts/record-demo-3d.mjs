#!/usr/bin/env node
/* Renders landing/showcase3d.html (3D MacBook + iPhone 15 Pro, the site's native screen takes mapped onto the screens)
 * frame by frame into landing/assets/demo.mp4, demo.gif, demo-poster.jpg (or the --portrait set).
 * Needs playwright (chromium) + ffmpeg.
 *   node scripts/record-demo-3d.mjs [--site <url> | --site-dir <dir>] [--portrait] [--test]
 * Step 1 records each device's screen natively (Mac 1440x900 @2x, iPhone 393x852 @3x) with synthetic wheel
 * scrolling, frame-stepped on a fake clock; step 2 opens the 3D scene with those takes and calls window.__scene.render(t) for every frame at 60 fps,
 * screenshotting each one, so the output is deterministic whatever the machine's GPU does. --test renders 3 frames only. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PORTRAIT = argv.includes('--portrait'), TEST = argv.includes('--test');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'landing', 'assets');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'phonefix-3d-'));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.txt': 'text/plain' };
const serve = (dir) => new Promise(res => {
  const s = http.createServer((req, r) => {
    let f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir)) { r.writeHead(403); return r.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    const st = fs.statSync(f), type = MIME[path.extname(f)] || 'application/octet-stream';
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) { const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : st.size - 1; r.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1, 'access-control-allow-origin': '*' }); return fs.createReadStream(f, { start: a, end: b }).pipe(r); }
    r.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); fs.createReadStream(f).pipe(r);
  });
  s.listen(0, '127.0.0.1', () => res({ server: s, origin: `http://127.0.0.1:${s.address().port}` }));
});
const main = await serve(root);
const siteDir = arg('--site-dir');
const siteSrv = siteDir ? await serve(path.resolve(siteDir)) : null;
const site = siteSrv ? `${siteSrv.origin}/?nogate` : arg('--site', 'https://spikestudiodxb.com/?nogate');
const takes = await serve(tmp);
const SCROLL_MS = 8400, LAP_PX = 3400, PHONE_PX = 3800, HOLD_MS = 1400, FPS = 60;
const W = PORTRAIT ? 540 : 1280, H = PORTRAIT ? 675 : 720;
const cookie = () => { try { localStorage.setItem('spike-cookie-ok', '1'); } catch {} };
const browser = await chromium.launch();

const scrollIn = (f, px, ms) => f.evaluate(({ px, ms }) => new Promise(res => {
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let last = 0, t0 = performance.now(), native = false, probed = false; const y0 = window.scrollY;
  (function tick(now) {
    const p = Math.min(1, (now - t0) / ms), cur = Math.round(px * ease(p)), d = cur - last; last = cur;
    if (!probed && now - t0 > 260) { probed = true; native = Math.abs(window.scrollY - y0) < 2; }
    if (d) { if (native) window.scrollBy(0, d); else window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, bubbles: true, cancelable: true })); }
    if (p < 1) requestAnimationFrame(tick); else res();
  })(t0);
}), { px, ms });

/* native screen take → h264 mp4. Frame-stepped on Playwright's fake clock: requestAnimationFrame, performance.now,
 * timers (so GSAP, Lenis and the scroll driver) advance exactly 1/FPS s between screenshots, so no frame is ever dropped. */
const screenTake = async (name, width, height, dpr, px) => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr }); await ctx.addInitScript(cookie);
  const page = await ctx.newPage(); await page.clock.install({ time: 0 });
  await page.goto(site, { waitUntil: 'load' }); await page.waitForTimeout(1400); await page.clock.pauseAt(30_000);
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const total = 350 + SCROLL_MS + HOLD_MS + 1500, n = Math.ceil(total / 1000 * FPS), step = 1000 / FPS;
  let scrolling = null;
  for (let i = 0; i < n; i++) {
    if (!scrolling && i * step >= 350) scrolling = scrollIn(page.mainFrame(), px, SCROLL_MS);   // resolves on the fake clock
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
    await page.clock.runFor(step);
  }
  await scrolling; await ctx.close();
  const mp4 = path.join(tmp, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'fast', '-movflags', '+faststart', mp4]);
  if (TEST) fs.copyFileSync(mp4, path.join(root, 'audits', `take-${name}.mp4`));
  console.log(`${name} take: ${n} frames at ${FPS} fps`);
  return `${takes.origin}/${name}.mp4`;
};
const phoneUrl = await screenTake('phone', 393, 852, 3, PHONE_PX);
const macUrl = await screenTake('mac', 1440, 900, 2, LAP_PX);

/* 3D scene, frame-stepped */
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
const u = new URL(`${main.origin}/landing/showcase3d.html`); u.searchParams.set('phone', phoneUrl); u.searchParams.set('mac', macUrl); if (PORTRAIT) u.searchParams.set('portrait', '');
await page.goto(u.toString(), { waitUntil: 'load' });
const info = await page.evaluate(() => window.__scene.ready);
console.log('scene ready', JSON.stringify(info));
const fdir = path.join(tmp, 'frames'); fs.mkdirSync(fdir);
const times = TEST ? [0.25, 1.6, 6.5] : Array.from({ length: Math.round(info.total * FPS) }, (_, i) => i / FPS);
const t0 = Date.now();
for (let i = 0; i < times.length; i++) {
  await page.evaluate(t => window.__scene.render(t), times[i]);
  await page.screenshot({ path: path.join(fdir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  if (i === 96 || (TEST && i === 1)) await page.screenshot({ path: path.join(out, PORTRAIT ? 'demo-portrait-poster.jpg' : 'demo-poster.jpg'), type: 'jpeg', quality: 86, scale: 'css' });
  if (i % 120 === 0 && i) console.log(`frame ${i}/${times.length} · ${((Date.now() - t0) / i).toFixed(0)} ms/frame`);
}
await browser.close(); main.server.close(); takes.server.close(); siteSrv && siteSrv.server.close();
if (TEST) { const keep = path.join(root, 'audits', '3d-test'); fs.rmSync(keep, { recursive: true, force: true }); fs.cpSync(fdir, keep, { recursive: true }); console.log('test frames →', keep); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); }
const sz = f => (fs.statSync(f).size / 1e6).toFixed(2) + ' MB';
const seq = ['-framerate', String(FPS), '-i', path.join(fdir, 'f%05d.jpg')];
if (PORTRAIT) {
  const mp4p = path.join(out, 'demo-portrait.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...seq, '-vf', 'scale=1080:1350:flags=lanczos', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', mp4p]);
  console.log(`${times.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s · portrait mp4 ${sz(mp4p)}`);
} else {
  const mp4 = path.join(out, 'demo.mp4'), gif = path.join(out, 'demo.gif'), pal = path.join(tmp, 'pal.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...seq, '-vf', 'scale=1920:1080:flags=lanczos', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=15,scale=720:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff', pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-i', pal, '-lavfi', 'fps=15,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', '-loop', '0', gif]);
  console.log(`${times.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s · mp4 ${sz(mp4)} · gif ${sz(gif)} · poster ${sz(path.join(out, 'demo-poster.jpg'))}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
