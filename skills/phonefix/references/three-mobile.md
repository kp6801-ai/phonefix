# Three.js / WebGL on phones

Purpose: fix failing phonefix checks `canvas-dpr`, `canvas-stretch`, `canvas-pixels`, `webgl-contexts`, `hover-js` for Three.js r150+ (and notes for R3F, Spline, Babylon, Pixi); load only when one of them fails.

## Contents
1. Check to fix map
2. DPR cap and perf tiers
3. Sizing and resize
4. Render loop control
5. Context loss
6. Memory and geometry budgets
7. Reduced motion
8. Input
9. React Three Fiber
10. Spline / Babylon / Pixi
11. Fix for examples/laptop-only

## 1. Check to fix map
| check id | trips when | go to |
|---|---|---|
| canvas-dpr | backing store more than 2.05x the CSS width | 2 |
| canvas-stretch | canvas pixel aspect differs from CSS box aspect by more than 0.05 | 3 |
| canvas-pixels | visible canvases total more than 4 megapixels | 2, 3, 4 |
| webgl-contexts | more than 2 WebGL contexts created | 5 |
| hover-js | elements register mouseenter/mouseover without a touch path | 8 |

## 2. DPR cap and perf tiers
```js
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // minimum fix
```
Tiered version (pattern: capture input type once, read width live, same idea as a perf-lite class):
```js
const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches; // fixed for the session
const narrow = matchMedia('(max-width: 767px)');
const lowCores = (navigator.hardwareConcurrency || 8) <= 4;
const lowMem = navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4; // Chromium only; undefined on Safari/Firefox
const lite = () => coarse || narrow.matches || lowCores || lowMem;
const dprCap = () => (lite() ? 1.5 : 2);
renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap()));
```
Fps probe fallback: count `requestAnimationFrame` callbacks for 1 second; under ~45 fps, drop to DPR 1 (full code in section 11). iOS Low Power Mode caps rAF near 30 fps, so a low result is not always a weak GPU.
Check cost live: `renderer.info.render.triangles`, `renderer.info.render.calls`, `renderer.info.memory`.

## 3. Sizing and resize
Size from the container, never fixed px.
```css
#scene { width: 100%; height: auto; aspect-ratio: 1 / 1; max-width: 100%; display: block; touch-action: pan-y; }
```
`pan-y` keeps vertical page scroll working over the canvas. Use `touch-action: none` only if OrbitControls needs every gesture.
```js
const parent = canvas.parentElement;
function onResize() {
  const w = Math.max(1, parent.clientWidth), h = Math.max(1, Math.round(w / (camera.aspect || 1)));
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap()));
  renderer.setSize(w, h, false); // false: do not write inline CSS size, let CSS own the box
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderOnce();
}
new ResizeObserver(onResize).observe(parent); // fires once on observe, so initial size is covered
```
For a non-square canvas use the CSS box instead: `const { width: w, height: h } = canvas.getBoundingClientRect();`.

## 4. Render loop control
Run the loop only while the canvas is visible, the tab is foregrounded and nothing is lost or reduced.
```js
let inView = true, lost = false;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const shouldRun = () => inView && !document.hidden && !lost && !reduce.matches;
function sync() {
  renderer.setAnimationLoop(shouldRun() ? tick : null); // null stops the loop
}
new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { rootMargin: '100px' }).observe(canvas);
document.addEventListener('visibilitychange', sync);
```
On-demand rendering (nothing animates by itself): never start a loop; a coalescing `renderOnce()` (see section 11) runs on state changes, for example `controls.addEventListener('change', renderOnce)` (OrbitControls emits `change`).

## 5. Context loss
```js
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; sync(); });
canvas.addEventListener('webglcontextrestored', () => { lost = false; sync(); renderOnce(); });
// QA: renderer.getContext().getExtension('WEBGL_lose_context').loseContext(); ...restoreContext();
```
- WebGLRenderer reinitializes its own state on restore and re-uploads geometries/textures lazily, so usually you only restart the loop. Recreate manually only what you built outside three (raw GL calls, external render targets).
- iOS Safari allows a limited number of live contexts and drops the oldest. Keep exactly one `WebGLRenderer` per page; for several views use one renderer with `renderer.setScissorTest(true)`, `setViewport`, `setScissor`. Call `renderer.dispose()` when removing a canvas (SPA route change).

## 6. Memory and geometry budgets
| lever | desktop | phone / lite |
|---|---|---|
| TorusKnotGeometry(r, tube, tubular, radial) | 180, 24 | 96, 12 |
| antialias (constructor-only option) | true | `false` when DPR >= 2 |
| powerPreference | default | `'low-power'` for decorative scenes |
| shadows | on | `renderer.shadowMap.enabled = false` |
| texture size | up to 4096 | 2048 max; mipmaps on |
| material | MeshStandardMaterial | MeshLambertMaterial or MeshBasicMaterial if lighting is subtle |
```js
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite() && devicePixelRatio < 2, powerPreference: lite() ? 'low-power' : 'high-performance' });
```
- Dispose on unmount: `scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { Object.values(m).forEach(v => v?.isTexture && v.dispose()); m.dispose(); }); }); renderer.dispose();`
- Compressed textures: `KTX2Loader` (from `three/addons/loaders/KTX2Loader.js`) with `.setTranscoderPath(...)` and `.detectSupport(renderer)` cuts GPU memory several-fold.

## 7. Reduced motion
Render one static frame; keep user-driven interaction (drag rotates on demand).
```js
reduce.addEventListener('change', () => { sync(); renderOnce(); });
// in init: if (reduce.matches) renderOnce(); else sync();
```
Also keep a `@media (prefers-reduced-motion: reduce)` block in CSS (the `reduced-motion` check reads stylesheet text).

## 8. Input
- Replace `mousemove` / `mouseenter` with pointer events and ignore mouse hover on touch: `canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; ... }, { passive: true });`. Give every hover reveal a `pointerdown` / `click` equivalent (clears `hover-js`).
- OrbitControls on phones: `controls.enableZoom = false; controls.enablePan = false;` so a pinch or drag does not trap the page. OrbitControls sets `touch-action: none` on its element; override it after construction to keep vertical scroll: `canvas.style.touchAction = 'pan-y';` (horizontal drag rotates, vertical drag scrolls the page).

## 9. React Three Fiber
```jsx
<Canvas dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: false, powerPreference: 'low-power' }} performance={{ min: 0.5 }}>
  <AdaptiveDpr pixelated /> {/* from @react-three/drei; lowers dpr while performance regresses */}
  <Knot />
</Canvas>
```
```jsx
function Knot() {
  const ref = useRef();
  useFrame((state, delta) => {
    if (document.hidden) return;                 // guard
    ref.current.rotation.y += delta * 0.5;
    state.invalidate();                          // needed to keep animating under frameloop="demand"
  });
  return <mesh ref={ref}>...</mesh>;
}
```
Canvas measures its parent, so give the parent a CSS size. For reduced motion skip `invalidate()` inside `useFrame` (the scene renders once per prop change).

## 10. Spline / Babylon / Pixi
- Spline: React `<Spline scene="..." renderOnDemand />` keeps rendering on demand; mount it only after an IntersectionObserver fires (conditional render). Spline controls its own DPR, so verify with `canvas-dpr`.
- Babylon: `engine.setHardwareScalingLevel(Math.max(1, devicePixelRatio / 1.5))` (higher level = fewer pixels); `engine.stopRenderLoop()` / `engine.runRenderLoop(fn)` to pause; `engine.resize()` on container resize.
- Pixi: set `resolution: Math.min(devicePixelRatio, 2)` with `autoDensity: true` (v7 `new Application({...})`, v8 `await app.init({...})`); pause with `app.ticker.stop()` / `app.ticker.start()`.

## 11. Fix for examples/laptop-only
HTML and CSS patch (wrap the canvas, drop fixed size):
```html
<div id="scene-wrap"><canvas id="scene" width="560" height="560"></canvas></div>
```
```css
#scene-wrap { width: 100%; max-width: 560px; }
#scene { width: 100%; height: auto; aspect-ratio: 1 / 1; max-width: 100%; display: block; border-radius: 22px; background: var(--ink); touch-action: pan-y; }
```
Replace the `<script type="module">` block:
```html
<script type="module">
  import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
  window.__THREE__ = THREE.REVISION; // phonefix reads this

  const canvas = document.getElementById('scene');
  const parent = canvas.parentElement;
  const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const narrow = matchMedia('(max-width: 767px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const lite = () => coarse || narrow.matches || (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4); // deviceMemory: Chromium only
  let dprCap = lite() ? 1.5 : 2;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !lite() && devicePixelRatio < 2,
    powerPreference: lite() ? 'low-power' : 'high-performance',
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 4;
  const geo = lite() ? new THREE.TorusKnotGeometry(1, 0.32, 96, 12) : new THREE.TorusKnotGeometry(1, 0.32, 180, 24);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd95a, metalness: 0.4, roughness: 0.3 });
  const knot = new THREE.Mesh(geo, mat);
  scene.add(knot, new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xc8f25c, 2); light.position.set(3, 4, 5); scene.add(light);

  let queued = false;
  const renderOnce = () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; renderer.render(scene, camera); });
  };
  function onResize() {
    const w = Math.max(1, parent.clientWidth);
    renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
    renderer.setSize(w, w, false); // square canvas; CSS owns the box
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    renderOnce();
  }
  new ResizeObserver(onResize).observe(parent);

  let last = 0;
  function tick(t) {
    const dt = last ? (t - last) / 1000 : 0; last = t; // frame-rate independent
    knot.rotation.x += 0.36 * dt;
    knot.rotation.y += 0.54 * dt;
    renderer.render(scene, camera);
  }
  let inView = true, lost = false;
  const shouldRun = () => inView && !document.hidden && !lost && !reduce.matches;
  function sync() {
    last = 0;
    renderer.setAnimationLoop(shouldRun() ? tick : null);
    if (!shouldRun()) renderOnce(); // reduced motion / paused: keep one static frame on screen
  }
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { rootMargin: '100px' }).observe(canvas);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; sync(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; sync(); renderOnce(); });

  // fps probe: if the device cannot hold ~45 fps in the first second, drop to DPR 1
  let frames = 0, t0 = 0;
  const probe = (t) => {
    if (!t0) t0 = t; frames++;
    if (document.hidden) return; // a background tab would read as slow
    if (t - t0 < 1000) return requestAnimationFrame(probe);
    if ((frames * 1000) / (t - t0) < 45 && dprCap > 1) { dprCap = 1; onResize(); }
  };
  if (!reduce.matches) requestAnimationFrame(probe);

  addEventListener('pagehide', () => { renderer.setAnimationLoop(null); geo.dispose(); mat.dispose(); renderer.dispose(); });
  sync();
</script>
```
Result: backing store at most 1.5x (phones) or 2x (desktop) the CSS width, canvas follows its container, no GPU work off-screen or in a background tab, one static frame under reduced motion. The fps probe can only lower DPR after the first second, so the first frames still use the heuristic cap.
