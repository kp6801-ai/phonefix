#!/usr/bin/env node
/* phonefix report.mjs — turn <out>/before and <out>/after captures into report.html + report.md
 *   node report.mjs --out ./phonefix-report [--inline] [--title "My app"]
 * --inline embeds screenshots as base64 (single-file report you can send). Default links them relatively. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(Boolean));
const out = path.resolve(args.out || 'phonefix-report');
const load = (l) => { const p = path.join(out, l, 'summary.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const before = load('before'), after = load('after');
if (!before && !after) { console.error(`phonefix: no before/ or after/ summary.json in ${out}. Run capture.mjs first.`); process.exit(2); }
const primary = after || before;
const title = args.title || `phonefix · ${primary.origin}`;

const CATS = [['viewport', 'Viewport'], ['layout', 'Layout & overflow'], ['touch', 'Touch & hover'], ['forms', 'Forms'], ['type', 'Typography'], ['media', 'Images & video'], ['motion', 'Scroll animation'], ['3d', '3D / canvas'], ['runtime', 'Runtime errors']];
const SEVNAME = { 4: 'breaks', 3: 'wrong', 2: 'should fix', 1: 'nice to have' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const scores = (sum) => { const m = {}; for (const [c] of CATS) m[c] = 4; for (const i of sum ? sum.uniqueIssues : []) m[i.category] = Math.min(m[i.category] ?? 4, 4 - i.severity); return m; };
const sB = scores(before), sA = scores(after);
const phones = (sum) => (sum ? sum.devices : []).filter(d => !d.guard);
const sev4After = after ? after.uniqueIssues.filter(i => i.severity === 4) : [];
const sev3After = after ? after.uniqueIssues.filter(i => i.severity === 3) : [];

// desktop guard: compare section layout on the desktop capture
let guard = null;
if (before && after) {
  const gb = before.devices.find(d => d.guard && d.metrics), ga = after.devices.find(d => d.guard && d.metrics);
  if (gb && ga) {
    const a = gb.metrics.sections, b = ga.metrics.sections, n = Math.max(a.length, b.length);
    let diff = 0; for (let i = 0; i < n; i++) { const x = a[i] || [0, 0], y = b[i] || [0, 0]; diff += Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]); }
    const total = a.reduce((s, r) => s + r[1], 0) || 1;
    guard = { pct: +(diff / total * 100).toFixed(1), sectionsBefore: a.length, sectionsAfter: b.length, widthBefore: gb.metrics.docWidth, widthAfter: ga.metrics.docWidth };
  }
}

const verdict = !after ? { cls: 'warn', text: 'Baseline captured', sub: `${before.uniqueIssues.length} issue(s) found. Fix, then capture --label after.` }
  : sev4After.length ? { cls: 'fail', text: 'Still broken on phones', sub: `${sev4After.length} severity-4 issue(s) remain.` }
  : sev3After.length ? { cls: 'warn', text: 'Usable, not perfect', sub: `0 page-breaking issues; ${sev3After.length} severity-3 issue(s) to justify or fix.` }
  : { cls: 'pass', text: 'Mobile-perfect', sub: 'No severity-3/4 issues on any device.' };
if (guard && guard.pct > 2) verdict.sub += ` Desktop guard: layout moved ${guard.pct}% — check for desktop regressions.`;

const img = (sum, dev, file) => {
  const p = path.join(out, dev.dir, file);
  if (!fs.existsSync(p)) return '';
  const src = args.inline ? `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}` : path.posix.join(dev.dir.split(path.sep).join('/'), file);
  return `<figure><img loading="lazy" src="${src}" alt="${esc(dev.name)} ${sum.label}"><figcaption>${sum.label}</figcaption></figure>`;
};
const devCard = (dev) => {
  const b = before && before.devices.find(d => d.id === dev.id && d.route === dev.route), a = after && after.devices.find(d => d.id === dev.id && d.route === dev.route);
  const shots = [b && img(before, b, '00.jpg'), a && img(after, a, '00.jpg')].filter(Boolean);
  const cur = a || b; const c = cur.counts || {};
  return `<div class="dev"><div class="name">${esc(dev.name)}</div><div class="meta">${dev.viewport.width}×${dev.viewport.height} · DPR ${dev.dpr} · ${dev.browser}${dev.route !== '/' ? ' · ' + esc(dev.route) : ''}</div>
  <div class="pair${shots.length === 1 ? ' single' : ''}">${shots.join('')}</div>
  <div class="counts">${cur.error ? `<span class="pill s4">${esc(cur.error)}</span>` : [4, 3, 2, 1].filter(s => c[s]).map(s => `<span class="pill s${s}">sev${s} ×${c[s]}</span>`).join('') || '<span class="pill">clean</span>'}</div>
  ${cur.dir ? `<div class="label" style="margin-top:8px"><a href="${cur.dir.split(path.sep).join('/')}/full.jpg">full page</a> · <a href="${cur.dir.split(path.sep).join('/')}/checks.json">checks.json</a></div>` : ''}</div>`;
};
const issueRows = (list) => list.map(i => `<tr class="issue"><td><span class="pill s${i.severity}">${i.severity} · ${SEVNAME[i.severity]}</span></td><td class="num">${esc(i.id)}</td><td class="sel">${esc(i.selector)}</td><td>${esc(i.detail)}<div class="fix">→ ${esc(i.fix)}</div></td><td class="num">${i.devices.length}</td></tr>`).join('');

const content = `
<header><div><div class="label">phonefix report</div><h1>${esc(title.replace(/^phonefix · /, ''))}</h1></div><div class="label">${esc(primary.origin)} · ${phones(primary).length} phone/tablet viewports${primary.devices.some(d => d.guard) ? ' + desktop guard' : ''}</div></header>
<div class="verdict ${verdict.cls}"><strong>${esc(verdict.text)}</strong><span>${esc(verdict.sub)}</span>${after ? `<span class="pill">before ${before ? before.uniqueIssues.length : '–'} → after ${after.uniqueIssues.length} issues</span>` : ''}</div>

<h2>Scores by category <span class="label">(0 = broken · 4 = clean)</span></h2>
<table><thead><tr><th>Category</th>${before ? '<th>Before</th>' : ''}${after ? '<th>After</th>' : ''}<th>Δ</th><th>Worst remaining</th></tr></thead><tbody>
${CATS.map(([c, name]) => { const b = before ? sB[c] : null, a = after ? sA[c] : null; const d = (b !== null && a !== null) ? a - b : 0; const worst = (after || before).uniqueIssues.filter(i => i.category === c).sort((x, y) => y.severity - x.severity)[0];
    return `<tr><td>${name}</td>${before ? `<td class="num">${b}</td>` : ''}${after ? `<td class="num">${a}</td>` : ''}<td class="num ${d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : ''}">${d > 0 ? '+' : ''}${d || '–'}</td><td>${worst ? esc(worst.id + ' — ' + worst.detail.slice(0, 120)) : '<span class="label">clean</span>'}</td></tr>`; }).join('')}
</tbody></table>

<h2>Devices</h2>
<div class="grid">${primary.devices.map(devCard).join('')}</div>
${guard ? `<p class="label" style="margin-top:14px">Desktop guard · section layout moved ${guard.pct}% (${guard.sectionsBefore}→${guard.sectionsAfter} sections, page width ${guard.widthBefore}→${guard.widthAfter}px). ${guard.pct > 2 ? '⚠ above 2% — open the desktop screenshots.' : 'within tolerance.'}</p>` : ''}

<h2>${after ? 'Remaining issues' : 'Issues found'} <span class="label">(${(after || before).uniqueIssues.length})</span></h2>
${(after || before).uniqueIssues.length ? `<table><thead><tr><th>Severity</th><th>Check</th><th>Element</th><th>Detail · fix</th><th>Devices</th></tr></thead><tbody>${issueRows((after || before).uniqueIssues)}</tbody></table>` : '<p>None. Ship it.</p>'}
${before && after ? `<details><summary>Fixed since baseline (${before.uniqueIssues.filter(i => !after.uniqueIssues.some(j => j.id === i.id && j.selector === i.selector)).length})</summary><table><thead><tr><th>Severity</th><th>Check</th><th>Element</th><th>Was</th><th>Devices</th></tr></thead><tbody>${issueRows(before.uniqueIssues.filter(i => !after.uniqueIssues.some(j => j.id === i.id && j.selector === i.selector)))}</tbody></table></details>` : ''}
${(after || before).devices.some(d => d.cssUnreadable && d.cssUnreadable.length) ? `<p class="label" style="margin-top:14px">Coverage gap: ${[...new Set((after || before).devices.flatMap(d => d.cssUnreadable || []))].map(esc).join(', ')} could not be read (cross-origin CSS) — hover/100vh/breakpoint checks are partial for those sheets.</p>` : ''}
<p class="label" style="margin-top:24px">Emulated WebKit/Chromium via Playwright — not real iOS Safari or Samsung Internet. Spot-check the worst device on a real phone before shipping.</p>
`;
const tpl = fs.readFileSync(path.join(__dirname, '..', 'assets', 'report-template.html'), 'utf8');
const html = tpl.replace('{{TITLE}}', esc(title)).replace('{{DATE}}', new Date().toISOString().slice(0, 16).replace('T', ' ')).replace('<!--PHONEFIX:CONTENT-->', content);
fs.writeFileSync(path.join(out, 'report.html'), html);

// markdown twin (for PR comments / agent transcripts)
const md = [`# phonefix report — ${title.replace(/^phonefix · /, '')}`, '', `**${verdict.text}.** ${verdict.sub}`, '', '| Category | ' + (before ? 'Before | ' : '') + (after ? 'After | ' : '') + 'Worst remaining |', '|---|' + (before ? '---|' : '') + (after ? '---|' : '') + '---|',
  ...CATS.map(([c, n]) => { const w = (after || before).uniqueIssues.filter(i => i.category === c).sort((x, y) => y.severity - x.severity)[0]; return `| ${n} | ${before ? sB[c] + ' | ' : ''}${after ? sA[c] + ' | ' : ''}${w ? w.id : 'clean'} |`; }),
  '', `## ${after ? 'Remaining' : 'Found'} (${(after || before).uniqueIssues.length})`, ...(after || before).uniqueIssues.map(i => `- **[${i.severity}] ${i.id}** \`${i.selector}\` — ${i.detail}\n  - fix: ${i.fix}`),
  ...(guard ? ['', `Desktop guard: layout moved ${guard.pct}% (${guard.pct > 2 ? 'CHECK' : 'ok'}).`] : []), '', `_${new Date().toISOString().slice(0, 10)} · phonefix by SPIKE Studio_`].join('\n');
fs.writeFileSync(path.join(out, 'report.md'), md);
console.log(`${verdict.text} — ${verdict.sub}\nwrote ${path.join(out, 'report.html')} and report.md`);
process.exit(sev4After.length ? 1 : 0);
