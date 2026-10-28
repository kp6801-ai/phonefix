<!-- phonefix:start -->
# phonefix: mobile-perfect on every phone

When the user asks for mobile, responsive, "breaks on my phone", iPhone, Android, horizontal scroll, overflow, tiny buttons, hover menus on touch, 100vh jump, safe-area or notch, GSAP or ScrollTrigger on mobile, Three.js or WebGL on phones, "test on iPhone", or "make it responsive":

1. Read `skills/phonefix/SKILL.md` and follow its five phases in order: Discover, Baseline, Audit, Fix, Verify.
2. Run the scripts in `skills/phonefix/scripts/` (`detect.mjs`, `capture.mjs`, `report.mjs`). They need Node 18+ and Playwright (`npx playwright install chromium webkit`).
3. Open `skills/phonefix/references/<topic>.md` only for the categories that fail (checklist, gsap-mobile, three-mobile, frameworks, devices).

Hard rules: never hide overflow to pass a check, find the element. Never disable zoom. Never remove an animation, adapt it. Never change the desktop design beyond making it fluid. Never skip Verify. Look at the smallest-device screenshots before and after, not only the numbers.

Report in this shape: category scores before and after, remaining issues with a reason each, desktop guard drift, path to `phonefix-report/report.html`.
@./skills/phonefix/SKILL.md

<!-- phonefix:end -->
