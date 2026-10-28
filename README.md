# phonefix

**One command. Every phone.**

Your AI built the site for a laptop. phonefix is a skill for AI coding agents that audits any web app on seven real phone and tablet viewports, auto-fixes what breaks (layout, touch, forms, images, video, scroll animation, 3D), and proves it with before/after screenshots.

Works with Claude Code, Cursor, Codex, Windsurf, GitHub Copilot and Gemini CLI. MIT. Built by [SPIKE Studio](https://spikestudiodxb.com), Dubai.

**Landing page and live demo:** https://kp6801-ai.github.io/phonefix/

<p align="center">
  <img src="landing/assets/before-iphone-se.jpg" width="200" alt="Before: laptop-only page on iPhone SE, nav clipped, canvas off-screen" />
  &nbsp;&nbsp;
  <img src="landing/assets/after-iphone-se.jpg" width="200" alt="After: same page mobile-perfect on iPhone SE" />
</p>

## Install

| Agent | Command |
|---|---|
| Any agent (skills CLI) | `npx skills add kp6801-ai/phonefix` |
| Claude Code | `npx skills add kp6801-ai/phonefix -a claude-code` or `git clone https://github.com/kp6801-ai/phonefix ~/.claude/skills/phonefix` |
| Cursor | `curl -fsSL https://raw.githubusercontent.com/kp6801-ai/phonefix/main/skills/phonefix/scripts/install.sh \| sh -s -- --agent cursor` |
| Codex (AGENTS.md) | same, `--agent codex` |
| Windsurf | same, `--agent windsurf` |
| GitHub Copilot | same, `--agent copilot` |
| Gemini CLI | same, `--agent gemini` |
| Everything | same, `--agent all` |

The installer copies `skills/phonefix/` into `./.phonefix/` (and `./.claude/skills/` for Claude Code) and writes a 14-line pointer block into your agent's rules file between `<!-- phonefix:start -->` and `<!-- phonefix:end -->`. Re-running is safe. Playwright is needed once: `npx playwright install chromium webkit`.

Then tell your agent: **"make this mobile-perfect"**.

## What it does

1. **Discover**: detects framework (static, Vite, Next, Nuxt, SvelteKit, Astro), Tailwind, GSAP, ScrollTrigger, Lenis, Three.js, R3F, Spline, dev command and port.
2. **Baseline**: renders every route on iPhone SE 375, iPhone 15 393, iPhone 15 Pro Max 430, Pixel 7 412, Galaxy S23 360, iPad 768, iPhone 15 landscape, plus a 1440 desktop guard. Five scroll positions per device so scroll-driven animation actually runs.
3. **Audit**: 30 checks scored 1 to 4 across viewport, layout, touch, forms, type, media, motion, 3D and runtime. The agent also looks at the smallest-device screenshots, not just the numbers.
4. **Fix**: ordered rules, root cause first. Viewport meta, overflow offenders, fixed widths, 16px inputs, 44px tap targets, hover gated behind `(hover:hover)`, `100svh`, safe-area, srcset, `muted playsinline`, `gsap.matchMedia`, ScrollTrigger mobile config, DPR cap, resize and pause for WebGL.
5. **Verify**: captures again, builds `phonefix-report/report.html` with verdict, score deltas, before/after grid per device, remaining issues and desktop drift. Passes only with zero severity-4 issues.

See the demo report: [examples/report/report.html](examples/report/report.html). Broken input: [examples/laptop-only](examples/laptop-only/index.html). Fixed output: [examples/fixed](examples/fixed/index.html).

## Use the scripts without an agent

```bash
node skills/phonefix/scripts/detect.mjs .
node skills/phonefix/scripts/capture.mjs --url http://localhost:3000 --label before
# fix things
node skills/phonefix/scripts/capture.mjs --url http://localhost:3000 --label after
node skills/phonefix/scripts/report.mjs --title "My app"
```

Static folder instead of a URL: `--dir ./dist`. Several routes: `--routes /,/pricing`. Logged-in pages: `--storage-state auth.json`. Subset of devices: `--devices iphone-se,galaxy-s23`.

`checks.js` also runs on its own: paste it into DevTools on your phone-emulated tab and read the returned issues.

## The checks

| Category | Checks |
|---|---|
| Viewport | meta missing, no `width=device-width`, zoom disabled, no `viewport-fit=cover` |
| Layout | horizontal overflow with the widest offenders, fixed px widths over 430, no breakpoints, `100vh`, fixed bars without safe-area, oversized fixed headers, `overflow:hidden` on body |
| Touch | tap targets under 44px, `:hover`-only reveals outside `(hover:hover)`, JS `mouseenter`-only handlers |
| Forms | inputs under 16px (iOS zooms) |
| Type | body under 16px, text under 12px |
| Media | large images without `srcset`, missing dimensions, video without `muted`/`playsinline`/poster |
| Motion | no `prefers-reduced-motion` handling, pinned section taller than the viewport, ScrollTrigger without mobile config, desktop-pixel tweens |
| 3D | canvas DPR over 2, stretched canvas, over 4 megapixels of canvas, too many WebGL contexts |
| Runtime | console errors and uncaught exceptions on load |

Full rules with fixes: [skills/phonefix/references/checklist.md](skills/phonefix/references/checklist.md). Scroll animation: [gsap-mobile.md](skills/phonefix/references/gsap-mobile.md). 3D: [three-mobile.md](skills/phonefix/references/three-mobile.md). Frameworks and Tailwind: [frameworks.md](skills/phonefix/references/frameworks.md). Device matrix: [devices.md](skills/phonefix/references/devices.md).

## Limits

Playwright's WebKit and Chromium are emulations, not iOS Safari or Samsung Internet. The URL-bar collapse, the real keyboard and GPU memory limits are not reproduced. Spot-check the worst device in the report on a real phone before shipping. The report says so too.

Apps that cannot run locally (missing env, no `node_modules`) get a source-level audit only. Pages behind login need a Playwright storage state.

## Repo layout

```
skills/phonefix/   SKILL.md, scripts/, references/, assets/   (single source of truth)
adapters/          pointer.md.tmpl + sync.mjs → AGENTS.md, GEMINI.md, .cursor/rules, .windsurfrules, copilot-instructions
landing/           GitHub Pages site
examples/          laptop-only/ (broken), fixed/, report/ (before/after)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adding a check is one function in `checks.js` plus one section in `checklist.md`.

## License

MIT. Copyright 2026 SPIKE Studio.
