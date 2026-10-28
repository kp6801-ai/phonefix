# phonefix frameworks

Where each phone fix lives per framework or library, and how to get from a `checks.json` selector to the source file.

## Contents

- [Static HTML](#static-html)
- [Vite](#vite)
- [Next.js](#nextjs)
- [Nuxt](#nuxt)
- [SvelteKit](#sveltekit)
- [Astro](#astro)
- [Remix](#remix)
- [Tailwind](#tailwind)
- [CSS-in-JS](#css-in-js)
- [Framer Motion](#framer-motion)
- [React Three Fiber](#react-three-fiber)
- [Lenis](#lenis)
- [Selector → source mapping](#selector--source-mapping)

The target viewport tag everywhere (see `checklist.md#viewport-missing`):
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

## Static HTML

Edit each page `<head>` (or the shared include/partial). CSS is usually one file; fix there. Run the capture without a server: `node capture.mjs --dir ./site`.

## Vite

React, Vue, Svelte (without SvelteKit) all share the root `index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#0b0b0b">
```
Global CSS is imported from `src/main.(ts|js)` (`index.css`, `App.css`). Check `index.css` for `body { display: flex; place-items: center }` and `#root { max-width: 1280px; padding: 2rem }` from the starter templates; they commonly cause phone overflow and cramped layouts. Capture a production build: `vite build && vite preview`.

## Next.js

App router, `app/layout.tsx` (Next 14+; a default `width=device-width, initial-scale=1` is already injected, add `viewportFit`):
```tsx
import type { Viewport } from 'next';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
```
Pages router: Next warns against viewport meta in `_document`. Put it in `pages/_app.tsx`:
```tsx
import Head from 'next/head';
// inside App component
<Head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
```
Client-only Three.js and GSAP code (touches `window`, `document`, `WebGLRenderingContext`). In the app router `ssr: false` is only allowed in a Client Component:
```tsx
'use client';
import dynamic from 'next/dynamic';
const Scene = dynamic(() => import('./Scene'), { ssr: false, loading: () => <div className="scene-skeleton" /> });
```
GSAP in React: register plugins once, scope selectors, and let `useGSAP` revert on unmount:
```tsx
'use client';
import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
gsap.registerPlugin(useGSAP, ScrollTrigger);

export function Hero() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.from('.title', { yPercent: 20, opacity: 0, scrollTrigger: { trigger: '.title', start: 'top 80%' } });
    });
    return () => mm.revert();
  }, { scope: root });
  return <section ref={root}><h1 className="title">...</h1></section>;
}
```
Hydration-safe `matchMedia`: never read it during render (the server has no `window`, and the first client render must equal the server HTML). Read it after mount; prefer CSS media queries when the difference is only styling:
```tsx
const [phone, setPhone] = useState(false);
useEffect(() => {
  const mq = window.matchMedia('(max-width: 767px)');
  const on = () => setPhone(mq.matches);
  on(); mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}, []);
```
A hydration mismatch shows up as a `console-error` ([checklist](checklist.md#console-error)); phone-only branches rendered on the first pass are the usual cause. Images: `next/image` with a `sizes` prop produces the `srcset` that `img-srcset` wants.

## Nuxt

`nuxt.config.ts` (Nuxt 3 sets `width=device-width, initial-scale=1` by default; override to add `viewport-fit`):
```ts
export default defineNuxtConfig({
  app: { head: { viewport: 'width=device-width, initial-scale=1, viewport-fit=cover' } },
});
```
Per page or layout: `useHead({ meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }] })`. Browser-only widgets: wrap in `<ClientOnly>` or name the component `Scene.client.vue`. Read `window` only in `onMounted`.

## SvelteKit

Edit `src/app.html` (the template already has a viewport tag; add `viewport-fit`):
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
%sveltekit.head%
```
Browser-only code: `import { browser } from '$app/environment'` or use `onMount`. Global CSS is imported from `src/routes/+layout.svelte`.

## Astro

The viewport tag lives in the layout component used by pages, typically `src/layouts/Layout.astro`:
```astro
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</head>
```
Scoped `<style>` in `.astro` files is rewritten with `[data-astro-cid-xxxx]` attributes, so selectors in `checks.json` still carry the class names. Interactive islands (`client:load`, `client:visible`) need the hydration notes from the Next.js section.

## Remix

`app/root.tsx` (also React Router v7 framework mode):
```tsx
<head>
  <meta charSet="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <Meta /><Links />
</head>
```
Route-level CSS comes from `links()` exports; fix the stylesheet that route imports. Browser-only code goes in `useEffect`, or behind `ClientOnly` from `remix-utils`.

## Tailwind

Mobile-first: unprefixed utilities are the phone styles; prefixes add at and above a width. Defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 (both v3 and v4). Add arbitrary breakpoints with `min-[481px]:` and use `max-sm:` only for phone-only overrides.

| Failing check | Replace | With |
|---|---|---|
| `fixed-width-rules`, `overflow-x` | `w-[1200px]` | `w-full max-w-[1200px]` |
| `overflow-x` in flex/grid | child without constraint | add `min-w-0` to the child |
| `overflow-x` in grid | `grid-cols-3` at base | `grid-cols-1 md:grid-cols-3` |
| `vh-units` | `h-screen`, `min-h-screen` | `min-h-svh` (sections) or `h-dvh` (overlays); fallback: `min-h-screen min-h-svh` |
| `vh-units` with older browsers | `h-dvh` alone | `supports-[height:100dvh]:h-dvh` over a `h-screen` base |
| `input-font` | `text-sm` on inputs | `text-base md:text-sm` |
| `tap-targets` | `h-8 w-8` icon button | `h-11 w-11` (44px) plus `touch-manipulation` |
| `safe-area` | `pb-4` on fixed bar | `pb-[max(1rem,env(safe-area-inset-bottom))]` |
| `reduced-motion` (see `gsap-mobile.md`) | animation classes | add `motion-reduce:animate-none motion-reduce:transition-none` |

Hover: Tailwind v4 applies `hover:` only when the primary input supports hover. In v3, opt in with `future: { hoverOnlyWhenSupported: true }` in `tailwind.config.js`; without it `hover:` compiles to plain `:hover` and `hover-only` fires. `group-hover:` follows the same rule. Reveals that must work on touch need a click toggle, not only `group-hover:block`.

Class strings live in markup, not CSS, so the check's `fixed-width-rules` (CSSOM) will see generated rules like `.w-\[1200px\]` with their class name. Grep the arbitrary value: `rg -n "w-\[[0-9]{3,}px\]|min-w-\[[0-9]{3,}px\]"`.

## CSS-in-JS

styled-components and emotion share the template-literal syntax; use media helpers and gate hover:
```ts
const bp = { sm: '(min-width: 481px)', md: '(min-width: 768px)', hover: '(hover: hover) and (pointer: fine)' };

const Card = styled.div`
  padding: 12px;
  min-width: 0;
  @media ${bp.md} { padding: 24px; }
  @media ${bp.hover} { &:hover { transform: translateY(-2px); } }
`;
```
Rules are injected at runtime into generated `<style>` tags (styled-components in production uses `insertRule`, so the DOM `<style>` may look empty). `checks.js` reads the CSSOM, so `fixed-width-rules`, `hover-only`, and `vh-units` still see them. The class name is a hash (`sc-a1b2c`, `css-1x2y3z`): enable `babel-plugin-styled-components` / SWC `styledComponents: true` (adds readable `displayName`) or `@emotion/babel-plugin` (adds `label`) to make selectors greppable. Global rules go in `createGlobalStyle` or `<Global>`; the root `body` font-size and input font-size fixes belong there.

## Framer Motion

Package is `framer-motion`, now also published as `motion` (import from `motion/react`).
```tsx
import { MotionConfig, motion, useReducedMotion } from 'framer-motion';

<MotionConfig reducedMotion="user">          {/* honours prefers-reduced-motion for transform/layout animations */}
  <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}>Buy</motion.button>
</MotionConfig>

const reduce = useReducedMotion();           // null | boolean; skip parallax or large movement when true
```
Treat `whileHover` as decoration; give touch users `whileTap` or a click state, and never make content reachable only through a hover variant (`checklist.md#hover-js`). Use `viewport={{ once: true }}` on `whileInView` so reveals do not replay while scrolling a phone.

## React Three Fiber

Canvas sizes itself to its parent, so the parent needs an explicit height (for example `h-svh` or `height: 100svh`). Resize and aspect updates are handled by R3F; do not call `renderer.setSize` yourself. Details for the failing ids are in `three-mobile.md`.
```tsx
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';

const [dpr, setDpr] = useState(1.5);
const [visible, setVisible] = useState(true);       // set from an IntersectionObserver on the wrapper

<div ref={wrap} style={{ height: '100svh' }}>
  <Canvas
    dpr={dpr}                                       // or dpr={[1, 2]} to clamp devicePixelRatio
    frameloop={visible ? 'always' : 'never'}        // 'demand' renders only on invalidate()
    gl={{ powerPreference: 'low-power', antialias: false }}
  >
    <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)} />
    <Scene />
  </Canvas>
</div>
```
Guard heavy per-frame work: `useFrame((state, dt) => { if (!visible) return; ... })`. Create the `<Canvas>` once per page: each canvas is a separate WebGL context (`webgl-contexts`).

## Lenis

Lenis smooths wheel scrolling on desktop. Its `syncTouch` option (default off) also takes over touch scrolling; leave it off, because native touch scroll is more reliable on iOS, and if you enable it, tune `touchMultiplier` and test on a device. With GSAP ScrollTrigger, feed ScrollTrigger from Lenis, and let one system own scroll (do not stack `ScrollTrigger.normalizeScroll(true)` on top without testing):
```js
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis();                       // syncTouch stays false
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
```
Destroy it on unmount (`lenis.destroy()`, and `gsap.ticker.remove` the callback). A page using Lenis is excluded from `body-overflow-hidden`; if `html` has `overflow: hidden` for another reason, fix that. Pin and scrub details: `gsap-mobile.md`.

## Selector → source mapping

`checks.json` selectors are built by `sel()` in `checks.js`: `#id` if the element has one, otherwise `tag.class1.class2` (first two classes only, in attribute order) joined with ` > ` and `:nth-child(n)` up to `body`, for example `div.wrap > img.shot:nth-child(5)`. `html`, `body`, `head` mean global files.

Procedure (stop at the first confident match):
1. Take the last segment (`img.shot`). Grep the class name as a whole word: `rg -n "\bshot\b" src`. Search markup (`class="..."`, `className="..."`, `:class`, `class:`) and stylesheets.
2. Tailwind or utility classes: the listed classes are the first two in the attribute, not a unique name. Grep the combination: `rg -n "className=.*\bw-full\b.*\bmax-w-" src`. Then use the parent segment (`div.wrap`) and `:nth-child` position to pick between hits.
3. CSS Modules: the DOM class is hashed (`Hero_title__x7Ab2`). Grep the readable part `title` in `*.module.css`, then find its use with `rg -n "styles\.title|styles\[.title.\]"`.
4. CSS-in-JS: hashed classes (`sc-…`, `css-…`). Search the component name or the text content of the element; enable the babel plugin from [CSS-in-JS](#css-in-js).
5. `#id`: `rg -n "id=[\"']name[\"']|id: ?[\"']name[\"']"`.
6. Detail text with a CSS selector (`fixed-width-rules`, `hover-only`, `vh-units` print `.sel { ... }`): grep that selector string directly; it names the exact rule.
7. Component libraries: the node may come from `node_modules`. Override from the app's stylesheet or the library's documented prop; do not edit `node_modules`.

If more than one file matches, or the element is generated at runtime (CMS, markdown, third-party embed), do not guess. Ask the user, in this form: "`div.wrap > img.shot:nth-child(5)` matches `src/Hero.tsx:42` and `src/Gallery.tsx:17`. Which one is the page you are fixing?" Re-run `capture.mjs --label after` after each edit to confirm the selector disappears.
