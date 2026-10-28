#!/usr/bin/env node
/* Records landing/showcase.html (laptop + phone, both demos scrolling) into
 * landing/assets/demo.mp4, demo.gif and demo-poster.jpg. Needs playwright + ffmpeg.
 *   node scripts/record-demo.mjs */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'landing', 'assets');
const tmp = fs.mkdtempSync('/tmp/phonefix-rec-');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.goto(`${origin}/landing/showcase.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, 'demo-poster.jpg'), type: 'jpeg', quality: 80 });
const t0 = Date.now();
await page.evaluate(() => window.__showcase);
const played = (Date.now() - t0) / 1000;
await page.waitForTimeout(600);
const video = page.video();
await ctx.close();
const webm = await video.path();
await browser.close(); server.close();

// trim the first ~1.5 s of load, encode mp4 + gif
const start = '1.5';
const mp4 = path.join(out, 'demo.mp4'), gif = path.join(out, 'demo.gif'), pal = path.join(tmp, 'pal.png');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start, '-i', webm, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '13', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start, '-i', webm, '-t', '13', '-vf', 'fps=10,scale=900:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff', pal]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start, '-i', webm, '-i', pal, '-t', '13', '-lavfi', 'fps=10,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', '-loop', '0', gif]);
const sz = f => (fs.statSync(f).size / 1e6).toFixed(2) + ' MB';
console.log(`scroll scene played ${played.toFixed(1)}s\nmp4 ${sz(mp4)} · gif ${sz(gif)} · poster ${sz(path.join(out, 'demo-poster.jpg'))}`);
fs.rmSync(tmp, { recursive: true, force: true });
