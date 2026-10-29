#!/usr/bin/env node
/* Records landing/showcase.html (a MacBook and an iPhone 15 Pro side by side, the same live site on both)
 * into landing/assets/demo.mp4, demo.gif and demo-poster.jpg. Needs playwright (chromium) + ffmpeg.
 *   node scripts/record-demo.mjs                                   # site = https://spikestudiodxb.com
 *   node scripts/record-demo.mjs --site https://example.com/        # any site
 *   node scripts/record-demo.mjs --site-dir ../spike-rebuild/dist   # a local static build, served on a second port
 *   node scripts/record-demo.mjs --portrait [...]                    # the 1080x1350 phone-viewer take (demo-portrait.mp4 + poster)
 * How: 1) each device gets its own native take of the site: the Mac at 1440x900 @2x (2880x1800), the iPhone at
 *         393x852 @3x (1179x2556), scrolled with synthetic wheel events (smooth-scroll libraries pick them up) and
 *         captured straight from Chromium's screencast;
 *      2) those takes are placed as video textures that cover each device's screen rectangle exactly in the scene,
 *         and the scene (GSAP entrance, drift, pill) is captured at 2x and encoded once at 30 fps.
 * Nothing in the final frame is a live page scaled in a box. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PORTRAIT = argv.includes('--portrait');
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
    const st = fs.statSync(f), type = MIME[path.extname(f)] || 'application/octet-stream';
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) { const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : st.size - 1; r.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 }); return fs.createReadStream(f, { start: a, end: b }).pipe(r); }
    r.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  });
  s.listen(0, '127.0.0.1', () => res({ server: s, origin: `http://127.0.0.1:${s.address().port}` }));
});

const main = await serve(root);
const siteDir = arg('--site-dir');
const siteSrv = siteDir ? await serve(path.resolve(siteDir)) : null;
const site = siteSrv ? `${siteSrv.origin}/?nogate` : arg('--site', 'https://spikestudiodxb.com/?nogate');
const takes = await serve(tmp);

const SCROLL_MS = 8400, LAP_PX = 3400, PHONE_PX = 3800, HOLD_MS = 1400, FPS = 30;
const W = PORTRAIT ? 540 : 1280, H = PORTRAIT ? 675 : 720;
const cookie = () => { try { localStorage.setItem('spike-cookie-ok', '1'); } catch {} };   // pre-accept the site's cookie notice in every take

const browser = await chromium.launch();

/* eased scroll over `ms`, total `px`, via wheel events; falls back to scrollBy when nothing consumes them */
const scrollIn = (f, px, ms) => f.evaluate(({ px, ms }) => new Promise(res => {
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let last = 0, t0 = performance.now(), native = false, probed = false;
  const y0 = window.scrollY;
  (function tick(now) {
    const p = Math.min(1, (now - t0) / ms), cur = Math.round(px * ease(p)), d = cur - last; last = cur;
    if (!probed && now - t0 > 260) { probed = true; native = Math.abs(window.scrollY - y0) < 2; }
    if (d) { if (native) window.scrollBy(0, d); else window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, bubbles: true, cancelable: true })); }
    if (p < 1) requestAnimationFrame(tick); else res();
  })(t0);
}), { px, ms });

/* screencast → jpg frames → concat list with real durations */
const capture = async (ctx, page, dir, maxW, maxH) => {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page); const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const f = path.join(dir, `f${String(n++).padStart(5, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  // frame 0: a plain screenshot, so the take starts on the resting page even before the compositor repaints
  const first = path.join(dir, 'first.jpg'); await page.screenshot({ path: first, type: 'jpeg', quality: 90 }); const t0 = Date.now() / 1000;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: maxW, maxHeight: maxH, everyNthFrame: 1 });
  return {
    stop: async () => {
      await cdp.send('Page.stopScreencast').catch(() => {});
      const all = [{ f: first, t: t0 }, ...frames.filter(fr => fr.t > t0)];
      const list = all.map((fr, i) => `file '${fr.f}'\nduration ${(i + 1 < all.length ? Math.max(0.001, all[i + 1].t - fr.t) : 1 / FPS).toFixed(5)}`).join('\n') + `\nfile '${all[all.length - 1].f}'\n`;
      const lp = path.join(dir, 'list.txt'); fs.writeFileSync(lp, list); return { list: lp, count: all.length, span: all[all.length - 1].t - t0 };
    },
  };
};

/* 1) native screen takes */
const screenTake = async (name, width, height, dpr, px) => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  await ctx.addInitScript(cookie);
  const page = await ctx.newPage();
  await page.goto(site, { waitUntil: 'load' }); await page.waitForTimeout(1400);
  const rec = await capture(ctx, page, path.join(tmp, name), width * dpr, height * dpr);
  await page.waitForTimeout(350);
  await scrollIn(page.mainFrame(), px, SCROLL_MS);
  await page.waitForTimeout(HOLD_MS + 1200);
  const r = await rec.stop(); await ctx.close();
  const mp4 = path.join(tmp, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', r.list, '-vf', `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'fast', '-movflags', '+faststart', mp4]);
  console.log(`${name} take: ${r.count} frames over ${r.span.toFixed(1)}s → ${path.basename(mp4)}`);
  return `${takes.origin}/${name}.mp4`;
};
const phoneUrl = await screenTake('phone', 393, 852, 3, PHONE_PX);
const macUrl = PORTRAIT ? null : await screenTake('mac', 1440, 900, 2, LAP_PX);

/* 2) the scene, with the takes as screen textures */
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const u = new URL(`${main.origin}/landing/showcase.html`); u.searchParams.set('site', site); u.searchParams.set('phone', phoneUrl); if (macUrl) u.searchParams.set('mac', macUrl); if (PORTRAIT) u.searchParams.set('portrait', '');
await page.goto(u.toString(), { waitUntil: 'load' });
await page.evaluate(() => window.__showcase.ready);
const rec = await capture(ctx, page, path.join(tmp, 'scene'), W * 2, H * 2);
await page.waitForTimeout(250);
const tPlay = Date.now();
await page.evaluate(() => window.__showcase.play());
await page.screenshot({ path: path.join(out, PORTRAIT ? 'demo-portrait-poster.jpg' : 'demo-poster.jpg'), type: 'jpeg', quality: 86, scale: 'css' });
await page.waitForTimeout(350);
await page.evaluate(() => window.__showcase.start());
await page.waitForTimeout(SCROLL_MS + 350);
await page.evaluate(() => window.__showcase.cmd());
await page.waitForTimeout(HOLD_MS);
await page.evaluate(() => window.__showcase.outro());
await page.waitForTimeout(150);
const r = await rec.stop();
const played = (Date.now() - tPlay) / 1000;
await browser.close(); main.server.close(); takes.server.close(); siteSrv && siteSrv.server.close();

/* 3) encode */
const src = ['-f', 'concat', '-safe', '0', '-i', r.list];
const sz = f => (fs.statSync(f).size / 1e6).toFixed(2) + ' MB';
if (PORTRAIT) {
  const mp4p = path.join(out, 'demo-portrait.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-vf', `fps=${FPS},scale=1080:1350:flags=lanczos`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', mp4p]);
  console.log(`scene ${r.count} frames over ${r.span.toFixed(1)}s · played ${played.toFixed(1)}s\nportrait mp4 ${sz(mp4p)} · poster ${sz(path.join(out, 'demo-portrait-poster.jpg'))}`);
} else {
  const mp4 = path.join(out, 'demo.mp4'), gif = path.join(out, 'demo.gif'), pal = path.join(tmp, 'pal.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-vf', `fps=${FPS},scale=1920:1080:flags=lanczos`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', mp4]);
  // gif from the finished mp4 (uniform frame size), 10 fps, 720 px wide
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=10,scale=720:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff', pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-i', pal, '-lavfi', 'fps=10,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', '-loop', '0', gif]);
  console.log(`scene ${r.count} frames over ${r.span.toFixed(1)}s · played ${played.toFixed(1)}s\nmp4 ${sz(mp4)} · gif ${sz(gif)} · poster ${sz(path.join(out, 'demo-poster.jpg'))}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
