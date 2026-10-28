---
name: phonefix
description: Make any web app mobile-perfect on real phones. Use when a site or app was built laptop-first and must work on iPhone and Android, or whenever the user says mobile, responsive, "breaks on my phone", horizontal scroll, overflow, tiny buttons, hover menus not working on touch, 100vh jump, safe-area, notch, GSAP or ScrollTrigger on mobile, Three.js or WebGL on phones, "test on iPhone", "optimize for mobile", "make it responsive". Audits on 7 phone and tablet viewports with Playwright, auto-fixes layout, touch, forms, media, scroll animation and 3D, then re-verifies with before and after screenshots and a report. Works on static HTML, Vite, Next.js, Nuxt, SvelteKit, Astro, Tailwind, GSAP, Three.js, R3F, Lenis.
license: MIT
compatibility: Node 18+ and Playwright (npx playwright install chromium webkit). Needs a running URL or a static folder. Agent must be able to run shell commands and edit files.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# phonefix

One command. Every phone. Audit a web app on real phone viewports, fix every element that breaks, prove it with before/after screenshots.

Scripts live next to this file in `scripts/`. Deep rules live in `references/` and are loaded **only** when a category fails. Paths below are relative to this SKILL.md.

## When to stop and ask

- No running URL and no static build, and `node_modules` is missing. Ask before installing dependencies.
- Pages behind login. Ask for a Playwright storage state file (`--storage-state`).
- A fix would change the desktop design (not just make it fluid). Show the diff, ask.
- The selector from `checks.json` maps to several source files. Ask, never guess.

## Phase 1: Discover

```bash
node scripts/detect.mjs <project-root>
```

Prints framework, styling, animation and 3D libs, dev command and port, where the viewport meta lives, CDN tags, and the exact capture command to run next. Read `references/frameworks.md` for where fixes live in that framework. If `libs` includes gsap, scrolltrigger, lenis, aos or locomotive, you will need `references/gsap-mobile.md`. If it includes three, r3f, spline or babylon, you will need `references/three-mobile.md`.

Get a URL: start the dev server in the background (`npm run dev &`), or for static sites use `--dir`.

## Phase 2: Baseline

Checkpoint first: `git add -A && git commit -m "phonefix: baseline"` (or copy the folder when there is no git). Then:

```bash
node scripts/capture.mjs --url http://localhost:3000 --label before --out phonefix-report
# or: node scripts/capture.mjs --dir ./dist --label before --out phonefix-report
```

Devices: iPhone SE 375, iPhone 15 393, iPhone 15 Pro Max 430, Pixel 7 412, Galaxy S23 360, iPad 768, iPhone 15 landscape 734, plus a 1440 desktop guard. Each device gets five scroll-position screenshots (so scroll-driven animations run), a full-page shot, and `checks.json`. Multiple routes: `--routes /,/pricing,/app`.

The console prints the unique issues with severity. Exit code 1 means at least one severity-4 issue.

## Phase 3: Audit

Severity scale: **4** breaks the page on a phone (no viewport meta, horizontal overflow, runtime error). **3** clearly wrong (16px input rule, tap targets under 32px, hover-only content, autoplay video without muted/playsinline, uncapped canvas DPR, fixed widths over 430px, no breakpoints, pinned section taller than the viewport). **2** should fix (100vh, safe-area, srcset, reduced motion, tiny text). **1** nice to have.

Score each category 0 to 4 (4 minus the worst severity in it): viewport, layout, touch, forms, type, media, motion, 3d, runtime. Write the table in your reply before fixing anything.

Then **look at the screenshots** for the two smallest devices (`phonefix-report/before/galaxy-s23/`, `iphone-se/`). The checks catch what the DOM can prove. Your eyes catch clipped headings, overlapping sections, a hero that is empty for a whole screen, buttons under a fixed bar. Add what you see to the issue list.

For every failing category, open the matching section of `references/checklist.md` (search the check id, for example `## overflow-x`). Do not read the whole file.

## Phase 4: Fix

Work in this order. One commit per group. Never skip a group because a later one looks more interesting.

1. **Viewport meta**: `width=device-width, initial-scale=1, viewport-fit=cover`. Remove `user-scalable=no` and `maximum-scale=1`. Framework location in `references/frameworks.md`.
2. **Overflow root cause**: use the widest-offender list in `checks.json` (`overflow-x` issue). Fix the element, not the symptom. Fixed px widths become `width:min(1200px,100%)` or `max-width`. Grid columns become `repeat(auto-fit, minmax(min(100%, 280px), 1fr))` or `minmax(0,1fr)`. Flex rows get `flex-wrap:wrap` and children `min-width:0`. Nowrap headings get `white-space:normal` or `font-size:clamp()`. `overflow-x:clip` on `html` is the last resort and must be commented as such.
3. **Fixed widths and breakpoints**: convert remaining unconditional px widths, heights and font sizes to fluid values (`clamp()`, `%`, `min()`). Add breakpoints where the content breaks, not at device sizes.
4. **Forms**: inputs, selects, textareas `font-size:16px` minimum. Add `inputmode`, `enterkeyhint`, `autocomplete`. Submit buttons at least 44px tall.
5. **Tap targets**: every control at least 44×44 via padding or `min-height`. Icon buttons keep the glyph size and grow the hit area. Nav links get vertical padding.
6. **Hover**: decorative hover inside `@media (hover:hover) and (pointer:fine)`. Content revealed on hover (menus, "learn more", tooltips) gets a tap toggle with `aria-expanded`, or is shown by default on touch. JS `mouseenter` handlers get a `click` or `pointerdown` twin.
7. **Viewport units**: `100vh` becomes `100svh` for sections, `100dvh` for pinned or full-screen UI, with the `vh` line kept above it as a fallback.
8. **Safe area**: fixed or sticky bars get `padding-bottom: calc(<existing> + env(safe-area-inset-bottom))` and the top ones `env(safe-area-inset-top)`. Fixed headers shrink to 64px or less on phones.
9. **Media**: images `max-width:100%; height:auto`, `width`/`height` attributes, `srcset`+`sizes` or `<picture>` for anything over 1200px, `loading="lazy"` below the fold. Video: `muted playsinline` (plus `autoplay loop` if intended), `poster`, `preload="metadata"`.
10. **Scroll animation**: read `references/gsap-mobile.md`. Wrap tweens in `gsap.matchMedia()` with mobile, desktop and reduced-motion conditions. Pixel tweens become `xPercent` or function-based values with `invalidateOnRefresh`. Pinned sections fit `100svh` or the pin is disabled under 768. `ScrollTrigger.config({ ignoreMobileResize:true })`, refresh after `document.fonts.ready`.
11. **3D and canvas**: read `references/three-mobile.md`. Cap DPR at 2 (1.5 on `pointer:coarse` or `hardwareConcurrency <= 4`). Size from the container with `ResizeObserver`. Pause off-screen and on `visibilitychange`. Handle `webglcontextlost`. Lower geometry on phones. Static render under reduced motion. `touch-action:pan-y` on the canvas so the page still scrolls.
12. **Keyboard and sticky**: `scroll-margin-top` on anchors under sticky headers. Fixed footers above the on-screen keyboard via `visualViewport` (pattern in `references/checklist.md#forms--keyboard`).
13. **Performance budget**: phone LCP under 2.5 s, JS under 300 KB gzipped, images at most 2× their CSS size. `references/checklist.md#performance-budget`.

Tailwind, CSS-in-JS and framework specifics: `references/frameworks.md`. Map a `checks.json` selector to source with grep on class names and component names; when ambiguous, ask.

## Phase 5: Verify and report

```bash
node scripts/capture.mjs --url http://localhost:3000 --label after --out phonefix-report
node scripts/report.mjs --out phonefix-report --title "<app name>"
```

`report.html` shows the verdict, category scores before and after, a before/after screenshot grid per device, remaining issues, and the desktop guard (section layout drift on the 1440 capture; over 2% means open the desktop screenshots and check nothing regressed).

Pass criteria: **zero severity-4** on every device, every remaining severity-3 either fixed or listed in your reply with a one-line reason. Loop Fix → Verify at most three times. Then open `report.html` for the user and summarize in this shape:

```
phonefix · <app>  before 15 issues → after 2
viewport 0→4 · layout 0→4 · touch 1→4 · forms 1→4 · type 2→4 · media 1→4 · motion 2→3 · 3d 1→4
remaining: [3] pin-taller (.story): pin disabled under 768, desktop unchanged
desktop guard: 0.8% drift (ok)
report: phonefix-report/report.html
```

Emulated WebKit and Chromium are not real iOS Safari or Samsung Internet. Recommend a real-device spot check of the worst device in the report. Details: `references/devices.md`.

## Hard rules

- Never hide overflow to pass the check. Find the element.
- Never disable zoom. Never set `maximum-scale=1`.
- Never remove an animation to pass; adapt it (matchMedia, reduced motion, lighter geometry) unless the user asks for removal.
- Never change the desktop design beyond making it fluid. The desktop guard exists for this.
- Never trust the numbers alone. Open the smallest-device screenshots before and after.
- Never commit `phonefix-report/` into the user's repo unless they ask (add it to `.gitignore`).

## Files

- `scripts/detect.mjs`: stack detection, offline.
- `scripts/capture.mjs`: Playwright device matrix, screenshots, injects `checks.js`.
- `scripts/checks.js`: in-page audit, also usable from DevTools (paste and run).
- `scripts/report.mjs`: before/after report (HTML and Markdown).
- `scripts/install.sh`: copies this skill into a project and writes adapter files for Cursor, Codex, Windsurf, Copilot, Gemini CLI, Claude Code.
- `references/checklist.md`: every check with Why, Detect, Fix, Don't.
- `references/gsap-mobile.md`, `references/three-mobile.md`, `references/frameworks.md`, `references/devices.md`.
- `assets/report-template.html`: report skeleton.

Built by SPIKE Studio, Dubai. https://spikestudiodxb.com · https://github.com/kp6801-ai/phonefix
