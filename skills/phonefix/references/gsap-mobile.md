# GSAP / ScrollTrigger on phones

Purpose: fix failing phonefix checks `reduced-motion`, `pin-taller`, `st-mobile-config`, `tween-px` for GSAP 3.12+ and ScrollTrigger 3.12+; load only when one of them fails.

## Contents
1. Check to fix map
2. gsap.matchMedia() backbone
3. prefers-reduced-motion
4. 100vh and the URL bar
5. Pinning on phones
6. Pixel-based tweens
7. Scrub on touch
8. Lenis / smooth scroll
9. Other libraries
10. Mobile QA checklist
11. Fix for examples/laptop-only

## 1. Check to fix map
| check id | what trips it | go to |
|---|---|---|
| reduced-motion | animations present, no `prefers-reduced-motion` text in any stylesheet | 2, 3 |
| pin-taller | `.pin-spacer > *` taller than the viewport | 5 |
| st-mobile-config | pin-spacer exists, script text lacks `ignoreMobileResize` / `normalizeScroll` | 4, 5 |
| tween-px | inline `translate(Npx)` greater than 1.5x viewport width | 6 |

Note: checks.js only detects reduced motion via CSS text (or `window.__phonefixReducedMotionJS`). JS-only `matchMedia` handling still needs the CSS block in section 3.

## 2. gsap.matchMedia() backbone
Everything created synchronously inside the handler (tweens, timelines, ScrollTriggers) is reverted automatically when the conditions stop matching.
```js
gsap.registerPlugin(ScrollTrigger);
const mm = gsap.matchMedia();

mm.add(
  {
    isDesktop: '(min-width: 768px)',
    isMobile: '(max-width: 767px)',
    reduceMotion: '(prefers-reduced-motion: reduce)',
  },
  (ctx) => {
    const { isDesktop, isMobile, reduceMotion } = ctx.conditions;
    if (reduceMotion) { /* static end state, see section 3 */ return; }
    gsap.to('.box', { rotation: isDesktop ? 360 : 180 });
    return () => { /* optional: undo non-GSAP side effects (listeners, classes) */ };
  }
);
```
- The handler runs when any listed condition matches and re-runs when the set of matching conditions changes. `isDesktop` and `reduceMotion` can both be true, so test `reduceMotion` first.
- The returned function runs on revert; use it only for things GSAP does not track.
- Scope selectors: `mm.add(conditions, fn, scopeElementOrRef)`.
- Teardown (unmount / SPA route change): `mm.revert()`.
- After a manual toggle (for example an in-page "reduce motion" switch), re-run matching handlers with `gsap.matchMediaRefresh()`.
- Never wrap `gsap.context()` inside `mm.add`; matchMedia already creates one. Do not create tweens in async callbacks inside the handler (they will not be reverted).

## 3. prefers-reduced-motion
Set the final state; do not tween to it.
```js
mm.add('(prefers-reduced-motion: reduce)', () => {
  gsap.set('.card, .reveal', { opacity: 1, y: 0, x: 0, scale: 1 }); // end state
  gsap.set('.marquee', { x: 0, xPercent: 0 });
});
```
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
```
Pinned storytelling with reduced motion: skip the pin entirely and let sections stack in normal flow.

## 4. 100vh and the URL bar
`100vh` is the largest viewport (URL bar hidden). While the bar is showing, content is cut off; when it collapses, `innerHeight` changes, a resize fires, ScrollTrigger recalculates `start`/`end`, and the page visibly jumps.
```css
.pin { height: 100vh; height: 100svh; } /* svh = smallest viewport, never changes mid-scroll */
```
Avoid `100dvh` on pinned or measured elements: it tracks the bar and re-triggers layout while scrolling.
```js
ScrollTrigger.config({ ignoreMobileResize: true }); // skip refresh on bar-driven vertical resizes (touch devices)
document.fonts.ready.then(() => ScrollTrigger.refresh()); // font swap changes heights
window.addEventListener('load', () => ScrollTrigger.refresh()); // late images
// function-based values need this to be recomputed on every refresh:
gsap.to(el, { x: () => -(el.scrollWidth - innerWidth), scrollTrigger: { trigger: el, scrub: true, invalidateOnRefresh: true } });
```
ScrollTrigger already refreshes on `visibilitychange`, `DOMContentLoaded`, `load` and `resize` by default (`autoRefreshEvents`).

## 5. Pinning on phones
- The pinned element must fit the smallest phone viewport (about 320x568 css px): `height: 100svh`, type in `clamp()`, no fixed-px content stacks. This clears `pin-taller`.
- If content cannot fit, pin only on desktop:
```js
mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
  ScrollTrigger.create({ trigger: '.pin', pin: true, start: 'top top', end: '+=100%', anticipatePin: 1 });
});
```
- `anticipatePin: 1` pre-pins just before the start to avoid a one-frame flash on fast flicks. `pinSpacing: false` removes the added scroll length (use only when siblings already account for it).
- Pin spacers can widen the page. Contain it on the section that owns the pin, never on `body`/`html` (that breaks `position: sticky` and can lock touch scroll):
```css
.story { overflow-x: clip; } /* clip does not create a scroll container, unlike hidden */
```
- `pinType`: for a window scroller ScrollTrigger uses `position: fixed`; `'transform'` is the alternative (default with a custom scroller). A fixed pin breaks under any transformed ancestor, so remove the transform or set `pinType: 'transform'`.
- `ScrollTrigger.normalizeScroll(true)` takes over touch scrolling on the JS thread to stop iOS pinned-scrub jitter and URL-bar-driven jumps. Cost: native momentum and overscroll feel, more main-thread work, and nested scrollers need `ScrollTrigger.normalizeScroll({ allowNestedScroll: true })`. Enable it only after `ignoreMobileResize` and `svh` were not enough, and test on a real iPhone.
```js
if (ScrollTrigger.isTouch) ScrollTrigger.normalizeScroll(true);
```

## 6. Pixel-based tweens
`x: -1400` assumes a 1440px laptop. Make distance a function of the element and viewport.
```js
// percent of the element's own width
gsap.to('.marquee', { xPercent: -50, ease: 'none', scrollTrigger: { trigger: '.story', scrub: true } });

// exact horizontal scroll distance
const track = document.querySelector('.track');
const dist = () => track.scrollWidth - document.documentElement.clientWidth;
gsap.to(track, {
  x: () => -dist(), ease: 'none',
  scrollTrigger: { trigger: '.h-scroll', pin: true, scrub: 0.5, end: () => '+=' + dist(), invalidateOnRefresh: true },
});
```
Rule of thumb: on phones prefer vertical stacking over horizontal pinned scroll unless the track is the hero of the page.

## 7. Scrub on touch
```js
scrollTrigger: { scrub: true }   // locked to the finger, no lag (best for pinned content)
scrollTrigger: { scrub: 0.5 }    // 0.5s catch-up; smoother but lags on flicks
scrollTrigger: { fastScrollEnd: true, preventOverlaps: true } // snap to end on fast flicks; stop overlapping triggers
```
- Add `will-change: transform` only to elements that scrub continuously, and not to dozens at once (each becomes a GPU layer).
- `force3D: true` pins a tween to a GPU layer for its duration; the default (`"auto"`) already promotes during the tween and demotes after. Leave it alone unless you see a one-frame blur at the end.
- Animate `x`, `y`, `scale`, `rotation`, `opacity`; never `top`, `left`, `width`, `height`.

## 8. Lenis / smooth scroll
```js
const lenis = new Lenis(); // syncTouch defaults to false: keep native touch scrolling
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
```
- `new Lenis({ syncTouch: true })` smooths touch input too; it feels artificial on phones and fights iOS momentum. Leave it off.
- Disable Lenis under reduced motion: `if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { /* init */ }`.
- `ScrollTrigger.scrollerProxy` is only for other smooth-scroll libraries that move a container with transforms; Lenis does not need it.

## 9. Other libraries
| Library | Phone-safe setup |
|---|---|
| AOS | `AOS.init({ disable: 'phone' })` or keep it and add `disable: () => matchMedia('(prefers-reduced-motion: reduce)').matches` |
| Locomotive Scroll v5 | wraps Lenis; pass `lenisOptions`, leave `syncTouch` off, same reduced-motion gate |
| Framer Motion | `useReducedMotion()` or `<MotionConfig reducedMotion="user">`; `useInView(ref, { once: true, amount: 0.3 })` / `whileInView` with `viewport={{ once: true, amount: 0.2 }}` |
| CSS scroll-driven | `@supports (animation-timeline: view()) { .el { animation: rise linear both; animation-timeline: view(); animation-range: entry 0% cover 35%; } }` plus a reduced-motion override |

## 10. Mobile QA checklist
- [ ] Scroll slowly while the URL bar expands and collapses: no jump, no gap under pinned sections.
- [ ] Rotate portrait to landscape and back: pins recompute, no stuck offsets.
- [ ] Flick fast, then stop: scrubbed content settles, no overshoot snap.
- [ ] Switch tabs or lock the screen, return: animations resume, `ScrollTrigger.refresh()` not needed manually.
- [ ] Enable reduced motion (OS setting or DevTools Rendering panel): everything visible in its end state, no pin.
- [ ] Horizontal overflow: `document.documentElement.scrollWidth <= innerWidth` at 320, 375, 430.
- [ ] Chrome DevTools Performance, 4x CPU throttle: scrolling holds ~60 fps, no long tasks over 50 ms.
- [ ] Re-run phonefix: `pin-taller`, `tween-px`, `st-mobile-config`, `reduced-motion` all gone.

## 11. Fix for examples/laptop-only
CSS to add or replace (scroll section only):
```css
.story { height: auto; overflow-x: clip; }
.story .pin { height: 100vh; height: 100svh; justify-content: flex-start; }
.story .pin h2 { font-size: clamp(40px, 9vw, 120px); white-space: nowrap; flex: none; }
@media (max-width: 767px) {
  .story .pin { height: auto; min-height: 100svh; justify-content: center; padding: 0 24px; }
  .story .pin h2 { white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```
Replace the first `<script>` block (the GSAP one):
```html
<script>
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const mm = gsap.matchMedia();
  mm.add(
    {
      isDesktop: '(min-width: 768px)',
      isMobile: '(max-width: 767px)',
      reduceMotion: '(prefers-reduced-motion: reduce)',
    },
    (ctx) => {
      const { isDesktop, reduceMotion } = ctx.conditions;
      const marquee = document.querySelector('.marquee');
      const pin = document.querySelector('.story .pin');

      if (reduceMotion) {
        gsap.set('.card', { opacity: 1, y: 0 });
        gsap.set(marquee, { x: 0 });
        return;
      }

      if (isDesktop) {
        const dist = () => Math.max(0, marquee.scrollWidth - pin.clientWidth);
        gsap.to(marquee, {
          x: () => -dist(),
          ease: 'none',
          scrollTrigger: {
            trigger: pin, pin: true, start: 'top top', end: () => '+=' + dist(),
            scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
          },
        });
      }

      gsap.from('.card', {
        y: isDesktop ? 80 : 40, opacity: 0, stagger: 0.15,
        scrollTrigger: { trigger: '.features', start: 'top 80%', once: true },
      });
    }
  );

  document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
</script>
```
Result: phones get no pin, wrapped headline, small card reveal; desktop gets the pinned marquee whose distance follows the text width; reduced motion gets the static end state. Other defects on that page (fixed `.wrap`, viewport meta, etc.) belong to the layout references.
