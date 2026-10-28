#!/usr/bin/env node
/* phonefix adapters/sync.mjs — one template, every agent.
 *
 *   node adapters/sync.mjs                  render this repo's own adapter files (skill path skills/phonefix)
 *   node adapters/sync.mjs --check          fail (exit 1) if any adapter drifted from the template or is > 40 lines
 *   node adapters/sync.mjs --write-to <project> --skill-path .phonefix/skills/phonefix --agent cursor|codex|windsurf|copilot|gemini|all
 *                                           write/refresh adapter files inside a user's project (idempotent, between markers)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(Boolean));
const template = fs.readFileSync(path.join(here, 'pointer.md.tmpl'), 'utf8').trim();
const START = '<!-- phonefix:start -->', END = '<!-- phonefix:end -->';

export const AGENTS = {
  codex:    { file: 'AGENTS.md',                         kind: 'append' },
  gemini:   { file: 'GEMINI.md',                         kind: 'append', extra: (sp) => `\n@./${sp}/SKILL.md\n` },
  cursor:   { file: '.cursor/rules/phonefix.mdc',        kind: 'own', front: '---\ndescription: Make the app mobile-perfect on iPhone and Android. Audit on phone viewports, auto-fix layout, touch, forms, media, scroll animation and 3D, re-verify with screenshots. Use for mobile, responsive, overflow, touch, hover on mobile, 100vh, safe-area, GSAP or Three.js on phones.\nglobs:\nalwaysApply: false\n---\n' },
  windsurf: { file: '.windsurfrules',                    kind: 'append' },
  copilot:  { file: '.github/copilot-instructions.md',   kind: 'append' },
};

export function render(agent, skillPath) {
  const a = AGENTS[agent];
  const body = template.replaceAll('{{SKILL_PATH}}', skillPath) + (a.extra ? a.extra(skillPath) : '');
  return (a.front || '') + START + '\n' + body + '\n' + END + '\n';
}

export function writeAdapter(projectDir, agent, skillPath) {
  const a = AGENTS[agent];
  const file = path.join(projectDir, a.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const block = render(agent, skillPath);
  let next;
  if (a.kind === 'own' || !fs.existsSync(file)) next = block;
  else {
    const cur = fs.readFileSync(file, 'utf8');
    const i = cur.indexOf(START), j = cur.indexOf(END);
    next = (i >= 0 && j > i) ? cur.slice(0, i) + block.trimEnd() + cur.slice(j + END.length) : cur.trimEnd() + '\n\n' + block;
  }
  const changed = !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next;
  if (changed) fs.writeFileSync(file, next);
  return { file: a.file, changed };
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const isMain = process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url));
if (isMain) {
  const list = (args.agent && args.agent !== 'all') ? args.agent.split(',') : Object.keys(AGENTS);
  for (const ag of list) if (!AGENTS[ag]) { console.error(`phonefix: unknown agent "${ag}". Use: ${Object.keys(AGENTS).join(', ')}, all`); process.exit(2); }
  if (args['write-to']) {
    const sp = args['skill-path'] || '.phonefix/skills/phonefix';
    for (const ag of list) { const r = writeAdapter(path.resolve(args['write-to']), ag, sp); console.log(`${r.changed ? 'wrote ' : 'ok    '} ${r.file}`); }
    process.exit(0);
  }
  const sp = 'skills/phonefix';
  let bad = 0;
  for (const ag of list) {
    const a = AGENTS[ag]; const file = path.join(repoRoot, a.file);
    const want = render(ag, sp);
    const lines = want.split('\n').length;
    if (lines > 40) { console.error(`✗ ${a.file}: ${lines} lines (max 40, keep adapters thin)`); bad++; }
    if (args.check) {
      const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (have !== want) { console.error(`✗ ${a.file}: drifted from adapters/pointer.md.tmpl (run: node adapters/sync.mjs)`); bad++; }
      else console.log(`✓ ${a.file} (${lines} lines)`);
    } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, want); console.log(`wrote ${a.file} (${lines} lines)`); }
  }
  process.exit(bad ? 1 : 0);
}
