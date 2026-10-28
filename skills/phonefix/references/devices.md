# phonefix devices

The capture matrix in `scripts/capture.mjs` (`DEVICES`), what each profile represents, where emulation stops, and how to choose breakpoints.

## Contents

- [Capture matrix](#capture-matrix)
- [Dynamic toolbars: svh, lvh, dvh](#dynamic-toolbars-svh-lvh-dvh)
- [What emulation does NOT cover](#what-emulation-does-not-cover)
- [Real-device spot check](#real-device-spot-check)
- [Breakpoints: content, not devices](#breakpoints-content-not-devices)

## Capture matrix

Use the ids with `capture.mjs --devices iphone-se,pixel-7`. Engine = Playwright browser the profile runs in.

| id | Profile | CSS size (w x h) | DPR | Engine | Real-device safe-area (portrait) | Browser UI |
|---|---|---|---|---|---|---|
| `iphone-se` | iPhone SE 2nd/3rd gen | 375 x 667 | 2 | WebKit | 0 (home button) | iOS Safari bars; height here is the full screen, real Safari area is shorter |
| `iphone-15` | iPhone 15 | 393 x 659 | 3 | WebKit | top 59 / bottom 34 | Safari URL bar shown; collapses on scroll |
| `iphone-15-pro-max` | iPhone 15 Pro Max | 430 x 739 | 3 | WebKit | top 59 / bottom 34 | same as above |
| `pixel-7` | Pixel 7 | 412 x 839 | 2.625 | Chromium | 0 in a Chrome tab; gesture bar can add a bottom inset in fullscreen/PWA | Chrome URL bar hides on scroll |
| `galaxy-s23` | Galaxy S23 | 360 x 780 | 3 | Chromium | 0 in a Chrome tab | Chrome profile only; not Samsung Internet |
| `ipad` | iPad portrait | 768 x 1024 | 2 | WebKit | small or 0; read on device | Safari toolbar; real iPads often send a desktop user agent |
| `iphone-15-landscape` | iPhone 15 landscape | 734 x 343 | 3 | WebKit | left/right about 59, bottom about 21 (approximate) | bars shrink; very little height |
| `desktop` | Desktop guard | 1440 x 900 | 1 | Chromium | 0 | none; only `overflow-x` and `console-error` are kept |

Notes:
- All phone profiles set `isMobile: true` and `hasTouch: true`, so `@media (hover: none)` and `(pointer: coarse)` evaluate as on a phone and the viewport meta is honored.
- Playwright WebKit is not iOS Safari: it has no dynamic toolbar, no keyboard, and does not apply device safe-area insets, so `env(safe-area-inset-*)` resolves to 0 in the capture. Check safe areas numerically on a device.
- The `iphone-15` height (659) is the visible area with the toolbar shown, roughly the `svh` value. Full-screen heights differ.
- 320px is not in the matrix. Test it by hand when overflow is borderline: `--devices` cannot set it, so use DevTools or a custom Playwright viewport.

Extra widths seen in the wild (CSS px), for hand tests:

| Device | Width |
|---|---|
| Smallest supported target | 320 |
| iPhone SE | 375 |
| iPhone 14 | 390 |
| iPhone 14 Pro Max | 430 |
| iPad Mini | 768 |
| iPad Pro 11" | 834 |
| MacBook Air 13" | 1280 |
| 24" desktop | 1920 |

## Dynamic toolbars: svh, lvh, dvh

iOS Safari and Android Chrome collapse the URL/toolbar while scrolling, so the visible height changes during use. Three viewport-height units describe the cases:

```
lvh  toolbar hidden : tallest   100vh equals this on mobile
svh  toolbar shown  : shortest  always fully visible
dvh  follows the bar: live      resizes while scrolling (can cause relayout jank)
```
On desktop all three are equal. Support: Safari 15.4+, Chrome 108+, Firefox 101+. Pattern with fallback:
```css
.hero { min-height: 100vh; min-height: 100svh; }   /* sections: never hidden behind the bar */
.overlay { height: 100vh; height: 100dvh; }        /* full-screen layers: fill whatever is visible */
```
`window.innerHeight` changes as the bar collapses on iOS and Android; do not cache it in JS for layout. Fixes: `checklist.md#vh-units`.

## What emulation does NOT cover

| Gap | Consequence | Verify by |
|---|---|---|
| Real iOS keyboard | Layout viewport does not resize on iOS; fixed footers get covered | Device; `checklist.md#forms--keyboard` |
| Samsung Internet | Own Chromium-based UI, toolbar behavior, optional forced dark mode | Device with Samsung Internet |
| 120 Hz displays | `requestAnimationFrame` cadence and scroll smoothness differ | Device; Chrome DevTools FPS meter |
| Memory limits | Mobile browsers kill tabs under memory pressure; large canvases and textures are the usual cause | Device with Safari/Chrome remote inspector |
| WebGL context limit | The cap is browser-specific and lower on iOS; the oldest context is dropped (`webgl-contexts` flags more than 2) | Device |
| Safe-area insets | Resolve to 0 in the capture | Device, or read `getComputedStyle` of a probe using `env()` |
| Real network and CPU | Local machine is far faster than a mid-range phone | Lighthouse mobile preset, `checklist.md#performance-budget` |
| iOS Low Power Mode | Can block video autoplay and throttle animation | Device with Low Power Mode on |

## Real-device spot check

Run after the matrix is clean, on the highest-risk page.

1. Serve to the phone. Bind the dev server to all interfaces (for example `vite --host`, `next dev -H 0.0.0.0`) and open `http://<LAN-IP>:<port>` on the phone. On Android with USB debugging, `adb reverse tcp:3000 tcp:3000` lets the phone open `http://localhost:3000`.
2. Attach the inspector. iOS: enable Settings > Safari > Advanced > Web Inspector on the phone, Safari > Settings > Advanced > "Show features for web developers" on the Mac, connect by cable, then Develop > [device name] > [page]. Android: enable Developer options and USB debugging, open `chrome://inspect#devices` on desktop Chrome, click Inspect on the tab.
3. Exercise the failure modes: scroll to collapse the toolbar, rotate, focus every input (page must not zoom), open the keyboard with a fixed footer visible, tap each menu and card without a mouse, check the bottom bar against the home indicator.
4. Read the console in the inspector for errors the emulator missed, and confirm videos autoplay (with Low Power Mode off, then on) and 3D scenes hold frame rate for 30 seconds.

## Breakpoints: content, not devices

Write the base styles for the smallest phone, then widen the window until the layout looks wrong and add a breakpoint there. Device widths change yearly; content limits do not.

Fluid first, so most values need no breakpoint:
```css
:root { --gutter: clamp(16px, 4vw, 48px); }
h1 { font-size: clamp(2rem, 1.2rem + 4vw, 4.5rem); }
.section { padding-block: clamp(32px, 8vw, 96px); padding-inline: var(--gutter); }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); }
```
Component-level adaptation with container queries (Chrome 105+, Safari 16+, Firefox 110+):
```css
.card-wrap { container-type: inline-size; }
.card { display: grid; gap: 12px; }
@container (min-width: 420px) { .card { grid-template-columns: 160px 1fr; } }
```
If breakpoints are needed, use at most these three, mobile-first (`min-width`):

| Range (CSS px) | Meaning | Rule |
|---|---|---|
| 0 - 480 | phones, portrait | base styles, no query |
| 481 - 767 | large phones, landscape phones | `@media (min-width: 481px)` |
| 768 - 1023 | tablets | `@media (min-width: 768px)` |
| 1024 and up | laptops and desktops | `@media (min-width: 1024px)` |

Do not branch on user agent or on `ontouchstart`. For input differences use `@media (hover: hover) and (pointer: fine)` and `(pointer: coarse)`; screen width does not tell you the input method.
