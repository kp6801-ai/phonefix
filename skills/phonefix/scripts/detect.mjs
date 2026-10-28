#!/usr/bin/env node
/* phonefix detect.mjs — pure, offline stack detection. Prints JSON.
 *   node detect.mjs [project-root]
 * Finds: framework, styling, animation/3D libs, dev command + port, where the viewport meta lives,
 * CDN script tags, and the capture command to run next. Never installs or runs anything. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const out = { root, framework: 'static', styling: [], libs: [], dev: null, viewportMeta: [], cdn: [], htmlFiles: [], notes: [] };
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };

// ---------- package.json ----------
let pkg = null;
try { pkg = JSON.parse(read('package.json')); } catch { /* static site */ }
const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
const has = (n) => n in deps;

if (has('next')) out.framework = 'next';
else if (has('nuxt')) out.framework = 'nuxt';
else if (has('@sveltejs/kit')) out.framework = 'sveltekit';
else if (has('astro')) out.framework = 'astro';
else if (has('@remix-run/react') || has('@react-router/dev')) out.framework = 'remix';
else if (has('gatsby')) out.framework = 'gatsby';
else if (has('vite')) out.framework = has('react') ? 'vite-react' : has('vue') ? 'vite-vue' : has('svelte') ? 'vite-svelte' : 'vite';
else if (has('react-scripts')) out.framework = 'cra';
else if (has('@angular/core')) out.framework = 'angular';
else if (pkg) out.framework = 'node-other';

for (const [k, label] of [['tailwindcss', 'tailwind'], ['styled-components', 'styled-components'], ['@emotion/react', 'emotion'], ['sass', 'sass'], ['@mui/material', 'mui'], ['@chakra-ui/react', 'chakra'], ['bootstrap', 'bootstrap']]) if (has(k)) out.styling.push(label);
if (exists('tailwind.config.js') || exists('tailwind.config.ts') || exists('tailwind.config.mjs')) if (!out.styling.includes('tailwind')) out.styling.push('tailwind');
for (const [k, label] of [['gsap', 'gsap'], ['@gsap/react', 'gsap-react'], ['three', 'three'], ['@react-three/fiber', 'r3f'], ['@react-three/drei', 'drei'], ['lenis', 'lenis'], ['@studio-freight/lenis', 'lenis'], ['framer-motion', 'framer-motion'], ['motion', 'motion'], ['aos', 'aos'], ['locomotive-scroll', 'locomotive'], ['swiper', 'swiper'], ['lottie-web', 'lottie'], ['@splinetool/runtime', 'spline'], ['@splinetool/react-spline', 'spline'], ['babylonjs', 'babylon'], ['@babylonjs/core', 'babylon'], ['pixi.js', 'pixi'], ['animejs', 'anime']]) if (has(k) && !out.libs.includes(label)) out.libs.push(label);

// ---------- dev command + port ----------
const scripts = (pkg && pkg.scripts) || {};
const devScript = scripts.dev || scripts.start || scripts.serve || null;
const pm = exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn' : exists('bun.lockb') || exists('bun.lock') ? 'bun' : 'npm';
const defaultPort = { next: 3000, nuxt: 3000, sveltekit: 5173, astro: 4321, remix: 5173, gatsby: 8000, cra: 3000, angular: 4200 }[out.framework] || (out.framework.startsWith('vite') ? 5173 : null);
const portMatch = devScript && /(?:--port|-p)[ =](\d+)/.exec(devScript);
if (devScript) out.dev = { command: `${pm} run ${scripts.dev ? 'dev' : scripts.start ? 'start' : 'serve'}`, script: devScript, port: portMatch ? +portMatch[1] : defaultPort, nodeModules: exists('node_modules') };
const buildDir = ['dist', 'build', 'out', '.output/public', '_site', 'public'].find(d => exists(path.join(d, 'index.html')));

// ---------- scan files (bounded) ----------
const SKIP = new Set(['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', 'dist', 'build', 'out', '.output', 'coverage', '.cache', 'phonefix-report', '.phonefix']);
const files = [];
(function walk(dir, depth) {
  if (depth > 6 || files.length > 600) return;
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else if (/\.(html?|jsx?|tsx?|vue|svelte|astro|mdx?)$/.test(e.name)) files.push(p);
  }
})(root, 0);

const CDN = [[/gsap/i, 'gsap'], [/ScrollTrigger/i, 'scrolltrigger'], [/three(\.module)?(\.min)?\.js|unpkg\.com\/three|three@/i, 'three'], [/lenis/i, 'lenis'], [/aos\.js|unpkg\.com\/aos/i, 'aos'], [/locomotive/i, 'locomotive'], [/spline/i, 'spline'], [/lottie/i, 'lottie'], [/swiper/i, 'swiper'], [/tailwindcss/i, 'tailwind-cdn']];
for (const f of files) {
  const rel = path.relative(root, f);
  let txt = ''; try { if (fs.statSync(f).size > 1.5e6) continue; txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (/\.html?$/.test(f)) out.htmlFiles.push(rel);
  const vm = /<meta[^>]+name=["']viewport["'][^>]*>/i.exec(txt);
  if (vm) out.viewportMeta.push({ file: rel, tag: vm[0].slice(0, 160) });
  else if (/export\s+const\s+viewport\s*[:=]/.test(txt) || /generateViewport/.test(txt)) out.viewportMeta.push({ file: rel, tag: 'Next.js viewport export' });
  else if (/viewport\s*:\s*['"`]width=device-width/.test(txt)) out.viewportMeta.push({ file: rel, tag: 'head config (nuxt/astro/framework)' });
  for (const m of txt.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) { const src = m[1]; if (/^(https?:)?\/\//.test(src)) for (const [re, label] of CDN) if (re.test(src) && !out.cdn.some(c => c.src === src)) out.cdn.push({ file: rel, src, lib: label }); }
  if (/from\s+['"]three['"]|THREE\./.test(txt) && !out.libs.includes('three')) out.libs.push('three');
  if (/from\s+['"]gsap|gsap\./.test(txt) && !out.libs.includes('gsap')) out.libs.push('gsap');
  if (/ScrollTrigger/.test(txt) && !out.libs.includes('scrolltrigger')) out.libs.push('scrolltrigger');
}
for (const c of out.cdn) if (!out.libs.includes(c.lib)) out.libs.push(c.lib);

// ---------- advice ----------
if (!out.viewportMeta.length) out.notes.push('No viewport meta found in source — sev4, fix first (see references/frameworks.md for where it lives in ' + out.framework + ').');
if (out.framework === 'static' || (!out.dev && out.htmlFiles.length)) out.capture = `node ${path.relative(process.cwd(), new URL('./capture.mjs', import.meta.url).pathname)} --dir ${path.relative(process.cwd(), root) || '.'} --label before`;
else if (buildDir) out.capture = `node capture.mjs --dir ${path.join(path.relative(process.cwd(), root) || '.', buildDir)} --label before   # built output; or run the dev server and use --url`;
else if (out.dev) out.capture = `${out.dev.command}   # then: node capture.mjs --url http://localhost:${out.dev.port || 3000} --label before`;
else out.capture = 'node capture.mjs --url <running app origin> --label before';
if (out.dev && !out.dev.nodeModules) out.notes.push('node_modules missing — the dev server cannot run until dependencies are installed. Ask before installing.');
if (out.libs.includes('three') || out.libs.includes('r3f') || out.libs.includes('spline') || out.libs.includes('babylon')) out.notes.push('3D present → read references/three-mobile.md (DPR cap, perf-lite, resize, pause off-screen).');
if (out.libs.includes('gsap') || out.libs.includes('scrolltrigger') || out.libs.includes('lenis') || out.libs.includes('locomotive') || out.libs.includes('aos')) out.notes.push('Scroll animation present → read references/gsap-mobile.md (matchMedia, ignoreMobileResize, pins, reduced motion).');
if (out.styling.includes('tailwind')) out.notes.push('Tailwind → fixes go in class lists (mobile-first: base = phone, sm:/md: = larger). See references/frameworks.md.');
if (out.cdn.some(c => c.lib === 'tailwind-cdn')) out.notes.push('Tailwind CDN script in use — fine for prototypes; fixes are class edits in HTML.');

console.log(JSON.stringify(out, null, 2));
