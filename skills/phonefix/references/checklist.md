# phonefix checklist

Per-check fixes for the ids emitted by `scripts/checks.js` (plus `console-error` from `scripts/capture.mjs`); load the section for the failing id only.

## Contents

- Viewport: [viewport-missing](#viewport-missing) · [viewport-width](#viewport-width) · [viewport-nozoom](#viewport-nozoom) · [viewport-fit](#viewport-fit)
- Layout: [overflow-x](#overflow-x) · [fixed-width-rules](#fixed-width-rules) · [no-breakpoints](#no-breakpoints) · [vh-units](#vh-units) · [fixed-tall](#fixed-tall) · [safe-area](#safe-area) · [body-overflow-hidden](#body-overflow-hidden)
- Forms and touch: [input-font](#input-font) · [tap-targets](#tap-targets) · [hover-only](#hover-only) · [hover-js](#hover-js)
- Type: [body-font](#body-font) · [tiny-text](#tiny-text)
- Media: [img-srcset](#img-srcset) · [img-dims](#img-dims) · [video-attrs](#video-attrs)
- Runtime: [console-error](#console-error)
- Motion and 3D ids: [Motion and 3D checks](#motion-and-3d-checks)
- Extras: [Fix order](#fix-order) · [Forms & keyboard](#forms--keyboard) · [Performance budget](#performance-budget)

Conventions: severity 4 = page broken, 3 = clearly wrong, 2 = should fix, 1 = nice to have. `rg` is ripgrep; with plain grep use `grep -rnE "<pattern>" src`. Selectors in `checks.json` have the shape described in `frameworks.md#selector--source-mapping`.

## viewport-missing

Severity 4. **Why:** without the meta tag, mobile browsers lay the page out at roughly 980px and shrink it, so every layout fix below is moot.

**Detect:** `document.querySelector('meta[name="viewport"]')` is null. Source: `rg -n 'name=.viewport' --glob '*.{html,tsx,jsx,vue,svelte,astro}'`.

**Fix:** put in `<head>` (framework locations in `frameworks.md`):
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

**Don't:** set a fixed `width=1200` or `width=1024`; do not scale the page with `initial-scale=0.5` to "fit" a desktop layout.

## viewport-width

Severity 4. **Why:** a viewport meta exists but lacks `width=device-width`, so the layout width is not the phone width.

**Detect:** content string does not match `width\s*=\s*device-width`. Source: same grep as `viewport-missing`; read the `content` value.

**Fix:** `content="width=device-width, initial-scale=1"` (add `viewport-fit=cover` per [viewport-fit](#viewport-fit)).

**Don't:** hard-code a pixel width (`width=375`); it breaks every other device.

## viewport-nozoom

Severity 3. **Why:** pinch-zoom is blocked, which fails WCAG 1.4.4 for low-vision users. Android Chrome honors it; iOS Safari ignores `user-scalable=no` since iOS 10, so the "fix" only hurts Android users.

**Detect:** content matches `user-scalable=(no|0)` or `maximum-scale=1`. Source: `rg -n 'user-scalable|maximum-scale'`.

**Fix:** delete `user-scalable` and `maximum-scale` from the content string.

**Don't:** keep `maximum-scale=1` to stop iOS input zoom. Fix the cause instead: [input-font](#input-font). Do not use `minimum-scale` to compensate.

## viewport-fit

Severity 1. **Why:** without `viewport-fit=cover`, `env(safe-area-inset-*)` stays 0 on notched iPhones, so fixed bars cannot clear the home indicator.

**Detect:** viewport meta lacks `viewport-fit=cover`, no inline `style` contains `position:fixed`, and CSS text contains `position: fixed|sticky`. Source: `rg -n 'viewport-fit'`.

**Fix:** append `, viewport-fit=cover` to the meta content and pad the bars; see [safe-area](#safe-area).

**Don't:** add `cover` without padding fixed bars, or content will sit under the notch in landscape.

## overflow-x

Severity 4. **Why:** the page scrolls sideways and zooms out on load; the most visible phone bug.

**Detect:** `max(documentElement.scrollWidth, body.scrollWidth) > innerWidth + 1`; the detail lists up to 5 widest elements not clipped by an `overflow` ancestor. Reproduce in DevTools:
```js
[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1)
  .map(e => [e.tagName, e.className, Math.round(e.getBoundingClientRect().right)])
```
Source: `rg -n '(min-)?width:\s*[0-9]{3,}px|100vw|white-space:\s*nowrap'`.

**Fix:** repair the widest offender first, then re-run. Common causes:
```css
img, video, canvas, svg { max-width: 100%; height: auto; }
.wrap  { width: min(1200px, 100%); margin-inline: auto; padding-inline: 16px; }
.grid  { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
.flex > *, .grid > * { min-width: 0; }          /* lets children shrink below content width */
h1, p, a { overflow-wrap: anywhere; }            /* long words, URLs */
.hero-title { font-size: clamp(2rem, 8vw, 4.5rem); white-space: normal; }
```
`100vw` includes the scrollbar width on desktop; prefer `100%`. Pseudo-elements and `transform: translateX()` offsets also count and are not listed by selector; search for `::before|::after` with `left: -`/`right: -` and wide `width`.

**Don't:** `body { overflow-x: hidden }`. It hides the symptom, breaks `position: sticky` and iOS momentum scrolling on some versions, and leaves content unreachable. `overflow-x: clip` on `html` (Safari 16+, Chrome 90+) is the last resort after the cause is fixed, and only for decorative bleed such as blurred blobs.

## fixed-width-rules

Severity 3. **Why:** a rule forces 430px or more regardless of screen, so the element overflows or forces a zoomed-out page.

**Detect:** top-level (not inside any `@media`) CSS rules whose `width` or `min-width` is a px value over 430. Source: `rg -n '(min-)?width:\s*(4[3-9][0-9]|[5-9][0-9]{2}|[0-9]{4,})px'`.

**Fix:**
```css
.card { width: min(720px, 100%); }     /* was width: 720px */
.pane { width: 100%; max-width: 960px; } /* was min-width: 960px */
.modal { width: min(560px, calc(100vw - 32px)); }
```

**Don't:** wrap the rule in `@media (min-width: 768px)` only to silence the check without giving phones a rule. Do not stack `!important` overrides at the phone breakpoint.

## no-breakpoints

Severity 3. **Why:** with no `min-width`/`max-width` media query anywhere, the desktop layout cannot rearrange (multi-column rows stay multi-column).

**Detect:** no `(min|max)-width` in readable CSS. Skipped when any stylesheet is cross-origin and unreadable (`coverage.cssUnreadable`). Source: `rg -n '@media|min-width|max-width' --glob '*.{css,scss}'`.

**Fix:** author mobile-first; add a breakpoint where the content breaks:
```css
.cols { display: grid; gap: 16px; }
@media (min-width: 768px) { .cols { grid-template-columns: 1fr 1fr; } }
```
Fluid layouts (`clamp()`, `auto-fit`, container queries) may legitimately have none; if screenshots show no overflow or cramping, record it as an accepted false positive. See `devices.md#breakpoints-content-not-devices`.

**Don't:** add an empty or decorative `@media` to satisfy the regex.

## vh-units

Severity 2. **Why:** on mobile, `100vh` equals the tallest viewport (URL bar hidden), so content sits behind the bar and full-screen sections jump or cut off.

**Detect:** `height`, `min-height`, `max-height` containing `100vh` in a CSS rule or an inline style. Source: `rg -n '\b100vh\b|h-screen|min-h-screen'`.

**Fix:** declare fallback first, then the unit that suits the job:
```css
.hero  { min-height: 100vh; min-height: 100svh; }  /* always fully visible */
.stage { height: 100vh;     height: 100dvh; }      /* follows the URL bar; may resize while scrolling */
```
`svh/lvh/dvh` need Safari 15.4+, Chrome 108+, Firefox 101+. Use `svh` for hero sections, `dvh` for full-screen overlays and pinned scenes only when the resize is acceptable.

**Don't:** set `height` from `window.innerHeight` in a resize handler, or hack a `--vh` custom property. `svh/dvh` replace both.

## fixed-tall

Severity 2. **Why:** a fixed or sticky bar that covers more than 20% of the viewport height (and over half the width) leaves little room to read.

**Detect:** computed `position` is `fixed` or `sticky`, visible, `height > 0.2 * innerHeight`, `width > 0.5 * innerWidth`. Source: `rg -n 'position:\s*(fixed|sticky)|\b(fixed|sticky)\b' --glob '*.{css,scss,tsx,jsx,vue,svelte}'`.

**Fix:**
```css
.site-header { position: sticky; top: 0; min-height: 0; }
@media (max-width: 767px) {
  .site-header { padding-block: 8px; }
  .site-header .tagline, .site-header .secondary-nav { display: none; }
}
```
Keep fixed bars at about 64px or less on phones; a cookie banner or promo bar should be dismissible or static.

**Don't:** keep a tall fixed hero nav and shrink the font; the height is the problem.

## safe-area

Severity 2. **Why:** the iPhone home indicator and rounded corners overlap a fixed bottom bar, making buttons hard to hit.

**Detect:** a `position: fixed` element touching the bottom edge, over half the width, and no `safe-area-inset` anywhere in CSS. Source: `rg -n 'safe-area-inset'`.

**Fix:** pair with `viewport-fit=cover` ([viewport-fit](#viewport-fit)):
```css
.bottom-bar { position: fixed; inset: auto 0 0 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
.page   { padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right)); }
.footer { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
```
Landscape iPhones put the notch on a side; the left/right insets matter there. Playwright emulation does not apply real insets; verify on device (`devices.md#what-emulation-does-not-cover`).

**Don't:** hard-code `padding-bottom: 34px`; it is wrong on every other device and in landscape.

## body-overflow-hidden

Severity 3. **Why:** the page cannot scroll with a finger.

**Detect:** `overflow` on body or html includes `hidden`, no horizontal overflow, `scrollHeight > 1.5 * innerHeight`, and no Lenis present. Source: `rg -n 'overflow(-y)?:\s*hidden|overflow-hidden' --glob '*.{css,scss,tsx,jsx,vue,svelte}'`; check JS that sets `document.body.style.overflow`.

**Fix:** remove it from the root. For modals, lock only while open and always restore:
```css
body.modal-open { overflow: hidden; }
.sheet { overscroll-behavior: contain; overflow-y: auto; }
```
```js
const lock = (on) => document.body.classList.toggle('modal-open', on); // call lock(false) in close AND unmount
```
Preloaders and intro animations commonly set it and never undo it; clear it on `load` or in the animation `onComplete`.

**Don't:** override with `overflow: auto !important` on the phone breakpoint without finding who sets it.

## input-font

Severity 3. **Why:** iOS Safari zooms the page when a field with a computed font-size under 16px is focused, and does not zoom back out.

**Detect:** visible `input` (not hidden/checkbox/radio), `select`, `textarea` with computed font-size below 16px. Source: `rg -n '(input|select|textarea)[^{]*\{[^}]*font-size|text-(xs|sm)'` and check the global `input { font: inherit }` rule.

**Fix:**
```css
input, select, textarea { font-size: 16px; }              /* or 1rem with a 16px root */
@media (min-width: 768px) { input, select, textarea { font-size: 14px; } }
```
`font-size: max(16px, 1em)` keeps larger text larger. Add `inputmode`, `enterkeyhint`, `autocomplete` per [Forms & keyboard](#forms--keyboard).

**Don't:** `maximum-scale=1` or `user-scalable=no` ([viewport-nozoom](#viewport-nozoom)); scaling the input with `transform: scale(.875)` tricks.

## tap-targets

Severity 3 if any target has a short side under 32px, else 2. **Why:** small controls cause mis-taps; WCAG 2.5.8 requires at least 24px, Apple and phonefix aim for 44px.

**Detect:** visible `a[href]`, `button`, `[role=button]`, button-type inputs, checkbox, radio, `select`, `summary`, `label[for]`, `[onclick]` where `min(width, height) < 44`. Inline links in running text are exempt. Source: `rg -n '(w|h)-(4|5|6|7|8|9)\b|(width|height):\s*([1-3][0-9])px'` and icon-only buttons `rg -n '<button[^>]*>\s*<(svg|img|i)\b'`.

**Fix:**
```css
.btn, .icon-btn { min-width: 44px; min-height: 44px; display: inline-grid; place-items: center; }
.link-small { position: relative; }
.link-small::before { content: ""; position: absolute; inset: -12px; }  /* bigger hit area, same look */
button, a, summary, [role=button] { touch-action: manipulation; }
```
Keep 8px or more between adjacent targets. Icon buttons need `aria-label`.

**Don't:** enlarge only the glyph; resize the hit area. Do not rely on `padding` alone for `<a>` set to `display: inline` (padding on inline boxes does not grow the box vertically).

## hover-only

Severity 3. **Why:** touch devices have no hover; menus and reveals are unreachable, or stick open after a tap (iOS keeps `:hover` on the last tapped element).

**Detect:** `:hover` rules outside `@media (hover: hover)` / `(pointer: fine)` that set `display`, `visibility`, `opacity`, `transform`, `pointer-events`, `max-height`, or `height`. Source: `rg -n ':hover|group-hover:|hover:(block|flex|visible|opacity|scale|translate|max-h)'`.

**Fix:** gate decoration, give touch an explicit toggle:
```css
@media (hover: hover) and (pointer: fine) { .card:hover { transform: translateY(-2px); } }
@media (hover: none) { .card:active { transform: scale(.98); } }
.menu[hidden] { display: none; }            /* shown by a button with aria-expanded, not hover */
```
```js
btn.addEventListener('click', () => {
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open)); menu.hidden = open;
});
```
Hybrid devices (laptop with touchscreen): `@media (any-hover: hover)` matches if any input can hover; `hover` reflects the primary input only.

**Don't:** hide content behind `:hover` and "fix" with `@media (max-width: 768px) { * { transition: none } }`; screen width is not input type.

## hover-js

Severity 2. **Why:** `mouseenter`/`mouseover` listeners never fire on a tap in the way desktop expects; content tied to them may never appear.

**Detect:** capture.mjs patches `addEventListener` and marks any Element given a `mouseenter` or `mouseover` listener with `data-phonefix-hover`. Source: `rg -n 'mouseenter|mouseover|onMouseEnter|@mouseenter|on:mouseenter|onmouseenter|\.hover\('`.

**Fix:** use pointer events and add a click path:
```js
el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
el.addEventListener('click', toggle);   // touch and keyboard path
```
**Don't:** gate essential content or navigation behind `mouseenter`; do not detect touch via `'ontouchstart' in window` (false on some laptops, true on others).

## body-font

Severity 2 under 14px, 1 under 16px. **Why:** body text under 16px is hard to read on phones.

**Detect:** computed `font-size` of `body`. Source: `rg -n 'font-size' --glob '*global*' --glob '*base*' --glob '*reset*'`; check `html { font-size: 62.5% }`.

**Fix:**
```css
html { font-size: 100%; }
body { font-size: clamp(1rem, 0.95rem + 0.25vw, 1.125rem); line-height: 1.5; }
```
**Don't:** use the 62.5% root hack without resetting `body { font-size: 1.6rem }`; do not size body text in `vw` alone (it ignores user font settings).

## tiny-text

Severity 2. **Why:** text under 12px is illegible on a phone.

**Detect:** visible text-bearing elements with computed `font-size < 12px` (first 5 listed). Source: `rg -n 'font-size:\s*([0-9]|1[01])(\.[0-9]+)?px|text-\[(8|9|10|11)px\]|text-xs'`.

**Fix:** labels and captions to 12px minimum, body copy 16px:
```css
.caption, .badge, .legend { font-size: max(0.75rem, 12px); }
```
**Don't:** make the text uppercase or letter-spaced at the same size and call it fixed; do not use `transform: scale()` on text.

## img-srcset

Severity 2. **Why:** phones download desktop-sized files (wasted data, slow LCP).

**Detect:** visible `img` with `naturalWidth > 1200`, no `srcset`, not inside `<picture>`. Source: `rg -n '<img\b(?![^>]*srcset)' -P --glob '*.{html,tsx,jsx,vue,svelte,astro}'`.

**Fix:**
```html
<img src="hero-800.jpg" width="1600" height="900" alt="..."
     srcset="hero-480.jpg 480w, hero-800.jpg 800w, hero-1200.jpg 1200w, hero-1600.jpg 1600w"
     sizes="(min-width: 1024px) 1200px, 100vw" decoding="async">
```
Below the fold add `loading="lazy"`; the LCP image gets `fetchpriority="high"` and never `lazy`. Cap at 2x CSS size (see [Performance budget](#performance-budget)). Framework image components (`next/image`, `astro:assets`) generate `srcset` when given `sizes`.

**Don't:** shrink with CSS only (`width: 100%` still downloads the full file); do not lazy-load the hero image.

## img-dims

Severity 1, reported when more than 2 images lack `width` or `height` attributes. **Why:** images pop in and shift the layout.

**Detect:** visible `img` without both attributes (SVG children excluded). Source: `rg -n '<img\b(?![^>]*\bwidth=)' -P`.

**Fix:** add the intrinsic pixel size; CSS still controls display size:
```html
<img src="a.jpg" width="1200" height="800" alt="..." style="max-width:100%;height:auto">
```
Or `aspect-ratio: 3 / 2` in CSS for unknown sources.

**Don't:** set `height: 100%` with no parent height; do not omit `alt`.

## video-attrs

Severity 3 for autoplay-without-muted or missing `playsinline`, else 1 (no poster). **Why:** iOS opens videos in the full-screen player without `playsinline`; autoplay needs `muted`; no poster shows a black box until data loads.

**Detect:** each `<video>`: `autoplay` without muted, no `playsinline`, no `poster`. Source: `rg -n '<video\b|<Video\b'`.

**Fix:**
```html
<video autoplay muted loop playsinline preload="metadata" poster="hero.jpg" width="1280" height="720">
  <source src="hero-720.mp4" type="video/mp4">
</video>
```
iOS Low Power Mode and data-saver modes can still block autoplay; the poster is the fallback. In React, set `muted` and verify it appears as the DOM attribute or property (the check accepts either).

**Don't:** autoplay with sound; ship a 20 MB desktop video to phones (use a smaller `<source media="(max-width: 767px)">` or a poster-only fallback).

## console-error

Severity 4, added by `capture.mjs` (not `checks.js`) from `console.error` calls and uncaught page errors (first 5 per device). Also kept on the desktop guard run. **Why:** a thrown script often explains the other failures (a blank canvas, a menu that does nothing).

**Detect:** the issue `detail` holds the message; `window` is the selector. Source: grep the message text: `rg -n "<first 40 chars of message>"`.

**Fix:** fix the error first, then re-run the whole matrix. Frequent phone causes: a 404 asset path, a missing WebGL context, code using `window`/`matchMedia` at import time, cross-origin font/CSS, a hydration mismatch from phone-only branches ([Next.js notes](frameworks.md#nextjs)). Benign `ResizeObserver loop` messages can appear as uncaught errors; confirm they are benign before ignoring.

**Don't:** wrap in `try/catch {}` or `window.onerror = () => true` to quiet the log.

## Motion and 3D checks

These ids are fixed in other reference files. Load the one that matches; do not fix them from here.

| id | where |
|---|---|
| `reduced-motion`, `pin-taller`, `st-mobile-config`, `tween-px` | [gsap-mobile.md](gsap-mobile.md) |
| `canvas-dpr`, `canvas-stretch`, `canvas-pixels`, `webgl-contexts` | [three-mobile.md](three-mobile.md) |

## Fix order

Re-run `capture.mjs --label after` between steps; each step can remove later findings.

1. Viewport meta ([viewport-missing](#viewport-missing), [viewport-width](#viewport-width), [viewport-nozoom](#viewport-nozoom), [viewport-fit](#viewport-fit)) and `console-error`.
2. Overflow root cause ([overflow-x](#overflow-x)).
3. Fixed widths and breakpoints ([fixed-width-rules](#fixed-width-rules), [no-breakpoints](#no-breakpoints)).
4. Inputs ([input-font](#input-font)).
5. Tap targets ([tap-targets](#tap-targets)).
6. Hover ([hover-only](#hover-only), [hover-js](#hover-js)).
7. Viewport height units ([vh-units](#vh-units), [fixed-tall](#fixed-tall), [body-overflow-hidden](#body-overflow-hidden)).
8. Safe areas ([safe-area](#safe-area)).
9. Type and media ([body-font](#body-font), [tiny-text](#tiny-text), [img-srcset](#img-srcset), [img-dims](#img-dims), [video-attrs](#video-attrs)).
10. Motion ([gsap-mobile.md](gsap-mobile.md)).
11. 3D ([three-mobile.md](three-mobile.md)).
12. Forms and keyboard ([Forms & keyboard](#forms--keyboard)).
13. Performance ([Performance budget](#performance-budget)).

## Forms & keyboard

The on-screen keyboard is not emulated by Playwright; verify on a device.

**Fixed footer above the keyboard.** On iOS Safari the layout viewport does not shrink when the keyboard opens, so a `position: fixed; bottom: 0` bar is covered. `visualViewport` reports the visible region (Safari 13+, Chrome 61+):
```js
const vv = window.visualViewport, bar = document.querySelector('.bottom-bar');
if (vv && bar) {
  const place = () => {
    const covered = window.innerHeight - vv.height - vv.offsetTop;   // px under the keyboard
    bar.style.transform = `translateY(${-Math.max(0, covered)}px)`;
  };
  vv.addEventListener('resize', place); vv.addEventListener('scroll', place); place();
}
```
Chrome on Android (108+) resizes only the visual viewport by default, so the same code applies. `<meta name="viewport" content="..., interactive-widget=resizes-content">` makes the layout viewport shrink instead (Chromium and Firefox honor it; Safari does not).

**Sticky headers hiding anchors and focused fields:**
```css
html { scroll-padding-top: 72px; }                 /* anchor links and in-page jumps */
input, textarea, select { scroll-margin-block: 80px 120px; }
```
`scroll-margin` applies to `scrollIntoView()` and anchor jumps; scrolling triggered by iOS when a field gains focus can ignore it, so test on a device.

**Attributes per field:**

| Field | `type` | `inputmode` | `enterkeyhint` | `autocomplete` |
|---|---|---|---|---|
| Email | `email` | `email` | `next` | `email` |
| Phone | `tel` | `tel` | `next` | `tel` |
| Full name | `text` | (omit) | `next` | `name` |
| Postal code | `text` | `numeric` if digits only | `next` | `postal-code` |
| One-time code | `text` | `numeric` | `done` | `one-time-code` |
| Amount | `text` | `decimal` | `done` | `off` |
| Search | `search` | `search` | `search` | `off` |
| URL | `url` | `url` | `go` | `url` |
| Password (login / signup) | `password` | (omit) | `go` | `current-password` / `new-password` |
| Chat message | `text` | (omit) | `send` | `off` |

Valid `inputmode`: `none text tel url email numeric decimal search`. Valid `enterkeyhint`: `enter done go next previous search send`. Use `next` on every field but the last. Keep `<label>` for every field; a placeholder is not a label.

## Performance budget

Targets measured on a mobile profile against a production build (`vite preview`, `next start`), not a dev server.

| Metric | Budget |
|---|---|
| LCP | under 2.5 s on 4G |
| CLS | under 0.1 (no layout shift: set `width`/`height`, reserve space for embeds) |
| Total JS | under 300 KB gzip (transferred) |
| Images | served at most 2x their CSS size; LCP image preloaded or `fetchpriority="high"` |
| Fonts | `font-display: swap`; at most 2 families, preload the primary |

Measure with Lighthouse (defaults to the mobile form factor with simulated slow 4G and 4x CPU slowdown):
```bash
npx lighthouse http://localhost:4173 --only-categories=performance --form-factor=mobile \
  --output=json --output-path=lh.json --quiet --chrome-flags="--headless=new"
node -e "const a=require('./lh.json').audits;for(const k of ['largest-contentful-paint','cumulative-layout-shift','total-blocking-time','total-byte-weight'])console.log(k,a[k].displayValue)"
```
Script transfer size: `audits['resource-summary'].details.items` (row with `resourceType: 'script'`). Quick wins in order: smaller or `srcset` images, remove unused JS (dynamic `import()` for 3D and heavy libraries), `loading="lazy"` below the fold, `content-visibility: auto` on long off-screen sections.
