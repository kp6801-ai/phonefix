# Contributing to phonefix

Thanks for helping make the web work on phones.

## Ground rules

- One source of truth: `skills/phonefix/`. Agent adapter files are generated. Edit `adapters/pointer.md.tmpl`, then run `node adapters/sync.mjs`. CI-style check: `node adapters/sync.mjs --check`.
- `SKILL.md` stays under 300 lines. Deep material goes in `references/`.
- No new npm dependencies. The scripts use Node built-ins and Playwright only.
- Every check must have: a stable `id`, a severity with a reason, a `selector`, a `detail` a human can act on, and a `fix` one line long.

## Add a check

1. Add it to `skills/phonefix/scripts/checks.js` under the right numbered block. Use `add(id, category, severity, selector, detail, fix)`. Categories: viewport, layout, touch, forms, type, media, motion, 3d, runtime.
2. Document it in `skills/phonefix/references/checklist.md` (or gsap-mobile / three-mobile) with Why, Detect, Fix, Don't.
3. Make the broken demo trigger it: `examples/laptop-only/index.html`. Make the fixed demo pass it: `examples/fixed/index.html`.
4. Run the dogfood loop and commit the regenerated report:

```bash
npm install
npx playwright install chromium webkit
npm run capture:before && npm run capture:after && npm run report -- --title "Nimbus demo"
```

Expected: before has your new issue, after has zero severity-3/4 issues.

## Add a device

Edit `DEVICES` in `skills/phonefix/scripts/capture.mjs` and the table in `references/devices.md`. Keep ids kebab-case and stable.

## Landing page

`landing/index.html` is a single file and must pass phonefix itself:

```bash
node skills/phonefix/scripts/capture.mjs --dir landing --label after --out /tmp/phonefix-landing
```

Zero severity-3/4 issues or the change does not ship.

## Pull requests

Small, one topic each. Describe the phone behaviour you saw and the device. Screenshots welcome.
