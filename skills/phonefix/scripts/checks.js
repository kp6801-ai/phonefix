/* phonefix checks.js — injected into a page by capture.mjs (or paste into DevTools).
 * Returns { issues:[{id,category,severity,selector,detail,fix}], metrics, coverage }.
 * Severity: 4 = breaks the page on a phone, 3 = clearly wrong, 2 = should fix, 1 = nice to have.
 * Pure DOM/CSSOM, no deps, runs in Chromium + WebKit. */
(function phonefixChecks() {
  const W = window.innerWidth, H = window.innerHeight, DPR = window.devicePixelRatio || 1;
  const issues = [];
  const coverage = { cssUnreadable: [] };
  const add = (id, category, severity, selector, detail, fix) =>
    issues.push({ id, category, severity, selector, detail, fix });

  const sel = (el) => {
    if (!el || el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    if (el.id) return `#${el.id}`;
    let s = el.tagName.toLowerCase();
    const cls = [...el.classList].slice(0, 2).join('.');
    if (cls) s += '.' + cls;
    const p = el.parentElement;
    if (p && p !== document.body) {
      const i = [...p.children].indexOf(el);
      return `${sel(p)} > ${s}:nth-child(${i + 1})`;
    }
    return s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };
  const px = (v) => parseFloat(v) || 0;

  // ---------- walk CSSOM once ----------
  const rules = []; // {rule, media:[...conditionTexts]}
  const walk = (list, media) => {
    for (const r of list) {
      try {
        if (r.type === 1) rules.push({ rule: r, media });
        else if (r.type === 4) walk(r.cssRules, media.concat(r.conditionText || r.media.mediaText));
        else if (r.cssRules) walk(r.cssRules, media);
      } catch (e) { /* ignore */ }
    }
  };
  let cssText = '';
  for (const ss of document.styleSheets) {
    try { walk(ss.cssRules, []); for (const r of ss.cssRules) cssText += r.cssText + '\n'; }
    catch (e) { if (!/fonts\.(googleapis|gstatic)\.com|\/fonts?\//.test(ss.href || '')) coverage.cssUnreadable.push(ss.href || 'inline'); }
  }
  for (const el of document.querySelectorAll('[style]')) cssText += el.getAttribute('style') + '\n';
  const hasBreakpoints = /\(\s*(max|min)-width/.test(cssText);
  const hasReducedMotion = /prefers-reduced-motion/.test(cssText);
  const hasSafeArea = /safe-area-inset/.test(cssText);
  const hasHoverMQ = /\(\s*hover\s*:\s*hover/.test(cssText);

  // ---------- 1. viewport meta ----------
  const vp = document.querySelector('meta[name="viewport"]');
  const vpContent = vp ? (vp.getAttribute('content') || '') : '';
  if (!vp) add('viewport-missing', 'viewport', 4, 'head', 'No <meta name="viewport"> — phones render the page at ~980px and zoom out.',
    'Add <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  else {
    if (!/width\s*=\s*device-width/.test(vpContent)) add('viewport-width', 'viewport', 4, 'meta[name=viewport]', `content="${vpContent}" lacks width=device-width`, 'Use width=device-width, initial-scale=1');
    if (/user-scalable\s*=\s*(no|0)/.test(vpContent) || /maximum-scale\s*=\s*1(\.0+)?\b/.test(vpContent))
      add('viewport-nozoom', 'viewport', 3, 'meta[name=viewport]', 'Zoom disabled (user-scalable=no / maximum-scale=1) — accessibility failure on iOS/Android.', 'Remove user-scalable and maximum-scale.');
    if (!/viewport-fit\s*=\s*cover/.test(vpContent) && document.querySelector('[style*="position:fixed"],[style*="position: fixed"]') === null && /position:\s*(fixed|sticky)/.test(cssText))
      add('viewport-fit', 'viewport', 1, 'meta[name=viewport]', 'Fixed/sticky elements present but viewport-fit=cover missing — env(safe-area-inset-*) stays 0 on notched iPhones.', 'Add viewport-fit=cover and pad fixed bars with env(safe-area-inset-bottom).');
  }

  // ---------- 2. horizontal overflow ----------
  const docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const offenders = [];
  if (docW > W + 1) {
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1) {
        // skip if an ancestor clips it
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break; } p = p.parentElement; }
        if (!clipped) offenders.push({ el, over: Math.max(r.right - W, -r.left), width: r.width });
      }
    }
    offenders.sort((a, b) => b.over - a.over);
    const top = offenders.slice(0, 5).map(o => `${sel(o.el)} (${Math.round(o.width)}px wide, +${Math.round(o.over)}px past edge)`);
    add('overflow-x', 'layout', 4, top[0] ? top[0].split(' (')[0] : 'html',
      `Page is ${docW}px wide on a ${W}px viewport — horizontal scroll. Widest offenders: ${top.join('; ') || 'none found (check pseudo-elements / transforms)'}`,
      'Fix the root cause: fixed px widths → min()/clamp()/%, grid columns → minmax(0,1fr), images max-width:100%, nowrap headings → wrap or clamp(). overflow-x:clip on html is the LAST resort.');
  }

  // ---------- 3. fixed px widths in CSS (source-level hint) ----------
  const fixedRules = [];
  for (const { rule, media } of rules) {
    const w = rule.style && (rule.style.width || rule.style.minWidth);
    if (w && /^\d+(\.\d+)?px$/.test(w) && px(w) > 430 && media.length === 0) fixedRules.push(`${rule.selectorText} { width:${w} }`);
  }
  if (fixedRules.length) add('fixed-width-rules', 'layout', 3, fixedRules[0].split(' {')[0], `${fixedRules.length} unconditional CSS rule(s) set width/min-width > 430px: ${fixedRules.slice(0, 5).join(', ')}`,
    'Replace with width:min(1200px,100%) or max-width + width:100%; use clamp() for fluid sizes.');
  if (!hasBreakpoints && coverage.cssUnreadable.length === 0)
    add('no-breakpoints', 'layout', 3, 'stylesheets', 'No @media (min/max-width) rules anywhere — layout cannot adapt.', 'Author mobile-first and add breakpoints where the content breaks (not device sizes).');

  // ---------- 4. inputs < 16px (iOS zooms on focus) ----------
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')) {
    if (!visible(el)) continue;
    const fs = px(getComputedStyle(el).fontSize);
    if (fs < 16) add('input-font', 'forms', 3, sel(el), `font-size ${fs}px — iOS Safari auto-zooms the page on focus.`, 'Set inputs to font-size:16px (or 1rem) and add inputmode/enterkeyhint/autocomplete.');
  }

  // ---------- 5. tap targets ----------
  const targets = document.querySelectorAll('a[href], button, [role=button], input[type=button], input[type=submit], input[type=checkbox], input[type=radio], select, summary, label[for], [onclick]');
  let tiny = 0, tinyEx = [], tinySel = '';
  for (const el of targets) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // inline text links inside running text are exempt (WCAG 2.5.8 exception)
    if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20) continue;
    const m = Math.min(r.width, r.height);
    if (m < 44) { tiny++; if (tinyEx.length < 6) tinyEx.push(`${sel(el)} ${Math.round(r.width)}×${Math.round(r.height)}`); if (!tinySel) tinySel = sel(el); }
  }
  if (tiny) add('tap-targets', 'touch', tinyEx.some(s => /\s(\d+)×(\d+)$/.test(s) && Math.min(...s.match(/(\d+)×(\d+)$/).slice(1, 3).map(Number)) < 32) ? 3 : 2,
    tinySel || 'body', `${tiny} interactive element(s) smaller than 44×44: ${tinyEx.join('; ')}`,
    'Give controls min-height:44px / min-width:44px via padding; for icon buttons keep the glyph small and enlarge the hit area with padding or a ::before pseudo-element.');

  // ---------- 6. small text ----------
  const bodyFs = px(getComputedStyle(document.body).fontSize);
  if (bodyFs < 14) add('body-font', 'type', 2, 'body', `body font-size ${bodyFs}px`, 'Use 16px base on phones (font-size:clamp(16px, 1rem + .2vw, 18px)).');
  else if (bodyFs < 16) add('body-font', 'type', 1, 'body', `body font-size ${bodyFs}px — readable but tight on phones`, 'Prefer 16px base below 768px.');
  let small = 0, smallEx = [], smallSel = '';
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (tw.nextNode()) {
    const t = tw.currentNode; if (!t.nodeValue.trim()) continue;
    const el = t.parentElement; if (!el || seen.has(el) || !visible(el)) continue; seen.add(el);
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    const fs = px(getComputedStyle(el).fontSize);
    if (fs < 12) { small++; if (smallEx.length < 5) smallEx.push(`${sel(el)} ${fs}px`); if (!smallSel) smallSel = sel(el); }
  }
  if (small) add('tiny-text', 'type', 2, smallSel, `${small} text element(s) under 12px: ${smallEx.join('; ')}`, 'Minimum 12px for labels/captions, 16px for body copy on phones.');

  // ---------- 7. hover-only interactions ----------
  const hoverRules = [];
  for (const { rule, media } of rules) {
    if (!rule.selectorText || !/:hover/.test(rule.selectorText)) continue;
    if (media.some(m => /hover\s*:\s*hover|pointer\s*:\s*fine/.test(m))) continue;
    const st = rule.style;
    const reveals = ['display', 'visibility', 'opacity', 'transform', 'pointer-events', 'max-height', 'height'].filter(p => st.getPropertyValue(p));
    if (reveals.length) hoverRules.push(`${rule.selectorText} → ${reveals.join(',')}`);
  }
  if (hoverRules.length) add('hover-only', 'touch', 3, hoverRules[0].split(' →')[0], `${hoverRules.length} :hover rule(s) reveal/hide content outside @media (hover:hover): ${hoverRules.slice(0, 5).join('; ')}. Touch devices have no hover — content is unreachable or sticks after tap.`,
    'Wrap decorative hover in @media (hover:hover) and (pointer:fine). Hover-revealed menus/tooltips need a tap toggle (aria-expanded) or must be visible by default on touch.');
  const jsHover = document.querySelectorAll('[data-phonefix-hover]').length;
  if (jsHover) add('hover-js', 'touch', 2, '[data-phonefix-hover]', `${jsHover} element(s) register mouseenter/mouseover listeners — check they have a touch/click equivalent.`, 'Add pointerdown/click handlers or use pointer events; never gate content behind mouseenter only.');

  // ---------- 8. 100vh ----------
  const vhRules = [];
  for (const { rule } of rules) {
    const st = rule.style; if (!st) continue;
    for (const p of ['height', 'min-height', 'max-height']) { const v = st.getPropertyValue(p); if (/\b100vh\b/.test(v)) vhRules.push(`${rule.selectorText} { ${p}:${v} }`); }
  }
  for (const el of document.querySelectorAll('[style*="100vh"]')) vhRules.push(`${sel(el)} inline`);
  if (vhRules.length) add('vh-units', 'layout', 2, vhRules[0].split(' {')[0], `${vhRules.length} rule(s) use 100vh: ${vhRules.slice(0, 4).join('; ')}. On mobile Safari/Chrome 100vh is taller than the visible area while the URL bar shows, so content hides behind the bar and layouts jump.`,
    'Use height:100svh (or 100dvh for pinned/full-screen) with a 100vh fallback line before it.');

  // ---------- 9. fixed / sticky bars ----------
  const fixedEls = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if ((cs.position === 'fixed' || cs.position === 'sticky') && visible(el)) {
      const r = el.getBoundingClientRect();
      fixedEls.push({ el, r, pos: cs.position });
      if (r.height > H * 0.2 && r.width > W * 0.5) add('fixed-tall', 'layout', 2, sel(el), `${cs.position} element is ${Math.round(r.height)}px tall = ${Math.round(r.height / H * 100)}% of a ${H}px viewport.`, 'Collapse/shrink fixed headers and bars on phones (max ~64px), or make them static.');
    }
  }
  const bottomBars = fixedEls.filter(f => f.pos === 'fixed' && f.r.bottom >= H - 2 && f.r.width > W * 0.5);
  if (bottomBars.length && !hasSafeArea) add('safe-area', 'layout', 2, sel(bottomBars[0].el), `${bottomBars.length} fixed bottom bar(s) and no env(safe-area-inset-*) anywhere in CSS — the home indicator overlaps them on iPhone.`,
    'padding-bottom: calc(12px + env(safe-area-inset-bottom)); plus viewport-fit=cover in the meta.');

  // ---------- 10. images ----------
  let noSrcset = 0, noDims = 0, bigEx = [], bigSel = '';
  for (const img of document.images) {
    if (!visible(img)) continue;
    const r = img.getBoundingClientRect();
    if (img.naturalWidth > 1200 && !img.srcset && !img.closest('picture')) { noSrcset++; if (bigEx.length < 4) bigEx.push(`${sel(img)} ${img.naturalWidth}px`); if (!bigSel) bigSel = sel(img); }
    if (!img.getAttribute('width') || !img.getAttribute('height')) { if (!img.closest('svg')) noDims++; }
  }
  if (noSrcset) add('img-srcset', 'media', 2, bigSel || 'img', `${noSrcset} large image(s) (>1200px) served without srcset: ${bigEx.join('; ')} — phones download desktop bytes.`, 'Add srcset + sizes (or <picture>), loading="lazy" below the fold, decoding="async".');
  if (noDims > 2) add('img-dims', 'media', 1, 'img', `${noDims} images lack width/height attributes — layout shift while loading.`, 'Add intrinsic width/height attributes (CSS can still set max-width:100%; height:auto).');

  // ---------- 11. video ----------
  for (const v of document.querySelectorAll('video')) {
    const probs = [];
    if (v.hasAttribute('autoplay') && !v.muted && !v.hasAttribute('muted')) probs.push('autoplay without muted (blocked on iOS/Android)');
    if (!v.hasAttribute('playsinline')) probs.push('no playsinline (iOS opens full-screen player)');
    if (!v.getAttribute('poster')) probs.push('no poster');
    if (probs.length) add('video-attrs', 'media', probs[0].startsWith('autoplay') || probs[0].startsWith('no playsinline') ? 3 : 1, sel(v), probs.join('; '), '<video autoplay muted playsinline loop poster="…" preload="metadata">');
  }

  // ---------- 12. canvas / WebGL / 3D ----------
  let canvasPixels = 0;
  const three = !!(window.__THREE__ || window.THREE);
  for (const c of document.querySelectorAll('canvas')) {
    if (!visible(c)) continue;
    const r = c.getBoundingClientRect();
    canvasPixels += c.width * c.height;
    const ratio = r.width ? c.width / r.width : 0;
    if (ratio > 2.05) add('canvas-dpr', '3d', 3, sel(c), `Canvas backing store is ${c.width}×${c.height} for a ${Math.round(r.width)}×${Math.round(r.height)} CSS box (ratio ${ratio.toFixed(2)}, device DPR ${DPR}) — ${three ? 'Three.js ' : ''}renders ${Math.round(ratio * ratio)}× the pixels a phone can show.`,
      'renderer.setPixelRatio(Math.min(devicePixelRatio, 2)) — 1.5 on pointer:coarse or hardwareConcurrency<=4; size the canvas from its container with ResizeObserver.');
    if (Math.abs(c.width / c.height - r.width / r.height) > 0.05 && r.width && r.height) add('canvas-stretch', '3d', 2, sel(c), `Canvas aspect ${(c.width / c.height).toFixed(2)} vs CSS box ${(r.width / r.height).toFixed(2)} — the scene is distorted or letterboxed.`, 'On resize: renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix().');
  }
  if (canvasPixels > 4e6) add('canvas-pixels', '3d', 3, 'canvas', `${(canvasPixels / 1e6).toFixed(1)} megapixels of canvas on screen — phone GPUs throttle, battery drains, scroll jank.`, 'Cap DPR, shrink canvases on phones, pause rendering off-screen (IntersectionObserver) and on visibilitychange.');
  const webgl = window.__phonefixWebGL || 0;
  if (webgl > 2) add('webgl-contexts', '3d', 2, 'canvas', `${webgl} WebGL contexts created — iOS Safari limits contexts and will drop the oldest.`, 'Share one renderer / one context; use scissor viewports for multiple views.');

  // ---------- 13. motion + reduced motion ----------
  const gsap = !!window.gsap, st = !!(window.ScrollTrigger || (window.gsap && window.gsap.plugins && window.gsap.plugins.scrollTrigger)), lenis = !!(window.Lenis || window.lenis);
  const cssAnims = /@keyframes/.test(cssText);
  if ((gsap || cssAnims || three) && !hasReducedMotion && !window.__phonefixReducedMotionJS) add('reduced-motion', 'motion', 2, 'stylesheets', `Animations present (${[gsap && 'GSAP', st && 'ScrollTrigger', three && 'Three.js', cssAnims && 'CSS keyframes', lenis && 'Lenis'].filter(Boolean).join(', ')}) but nothing honours prefers-reduced-motion.`,
    'gsap.matchMedia() with "(prefers-reduced-motion: reduce)" → duration 0 / static state; CSS: @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}.');
  if (st) {
    const pinSpacers = document.querySelectorAll('.pin-spacer').length;
    const pinned = [...document.querySelectorAll('.pin-spacer > *')].filter(visible);
    for (const p of pinned) { const r = p.getBoundingClientRect(); if (r.height > H + 2) add('pin-taller', 'motion', 3, sel(p), `Pinned element is ${Math.round(r.height)}px tall on a ${H}px viewport — bottom of the pinned content is never visible on this phone.`, 'Pinned sections must fit the smallest viewport: height:100svh, scale text with clamp(), or disable the pin under 768px via gsap.matchMedia.'); }
    if (pinSpacers && !/ignoreMobileResize|normalizeScroll/.test(window.__phonefixScriptText || '')) add('st-mobile-config', 'motion', 1, 'ScrollTrigger', `${pinSpacers} pinned section(s); ScrollTrigger mobile config not detected (ignoreMobileResize / normalizeScroll).`, 'ScrollTrigger.config({ ignoreMobileResize:true }); consider ScrollTrigger.normalizeScroll(true) for pinned scrub on iOS.');
  }
  // large horizontal GSAP x tweens that assume desktop width
  if (gsap) {
    const maxX = [...document.querySelectorAll('[style*="translate"]')].map(el => { const m = /translate(?:3d)?\(\s*(-?[\d.]+)px/.exec(el.style.transform || ''); return m ? Math.abs(+m[1]) : 0; }).reduce((a, b) => Math.max(a, b), 0);
    if (maxX > W * 1.5) add('tween-px', 'motion', 2, '[style*="translate"]', `An element is translated ${Math.round(maxX)}px on a ${W}px viewport — pixel-based tween tuned for desktop.`, 'Use xPercent, or compute distance from element.scrollWidth - innerWidth; wrap in gsap.matchMedia per breakpoint.');
  }

  // ---------- 14. touch scrolling ----------
  if (/overflow(-y)?\s*:\s*hidden/.test(getComputedStyle(document.body).overflow + getComputedStyle(document.documentElement).overflow) && docW <= W + 1 && document.documentElement.scrollHeight > H * 1.5 && !lenis)
    add('body-overflow-hidden', 'layout', 3, 'body', 'body/html has overflow:hidden with content taller than the viewport and no custom scroller — the page cannot scroll on touch.', 'Remove overflow:hidden from html/body on phones, or make the inner scroller the scroll container with -webkit-overflow-scrolling:touch.');

  // ---------- metrics ----------
  let secRoot = document.body;
  for (let d = 0; d < 4; d++) { const kids = [...secRoot.children].filter(visible); if (kids.length >= 3) break; const big = kids.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]; if (!big || big.getBoundingClientRect().height < document.documentElement.scrollHeight * 0.6) break; secRoot = big; }
  const sections = [...secRoot.children].filter(visible).slice(0, 40).map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.height)]; });
  const metrics = {
    viewport: { w: W, h: H, dpr: DPR }, docWidth: docW, docHeight: document.documentElement.scrollHeight,
    viewportMeta: vpContent || null, hasBreakpoints, hasReducedMotion, hasSafeArea, hasHoverMQ,
    libs: { gsap, scrollTrigger: st, three, lenis, framer: !!document.querySelector('[data-framer-name],[data-projection-id]'), webglContexts: webgl },
    counts: { tapTargets: targets.length, tiny, smallText: small, canvases: document.querySelectorAll('canvas').length, images: document.images.length, fixed: fixedEls.length },
    sections,
    cssUnreadable: coverage.cssUnreadable.length,
  };
  issues.sort((a, b) => b.severity - a.severity);
  return { issues, metrics, coverage };
})();
