#!/usr/bin/env node
/* Money Rooms v3: the Node side of the gate. Runs the engine tests with
   node --test, then the lint sweep over every shipped file. Exit 1 on any
   failure. Usage: node money-rooms-v3/tests/run.js */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const failures = [];
let passed = 0;
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ': ' + detail : '')); }

/* 1. Engine tests */
const files = fs.readdirSync(path.join(ROOT, 'tests/engine')).filter(f => f.endsWith('.test.js')).map(f => path.join('tests/engine', f));
const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, encoding: 'utf8' });
const summary = /# pass (\d+)\n# fail (\d+)/.exec(r.stdout) || [];
process.stdout.write(r.stdout.split('\n').filter(l => /^# (pass|fail|tests)|^not ok/.test(l)).join('\n') + '\n');
check('engine tests pass', r.status === 0, (r.stdout.match(/^not ok.*$/gm) || []).join('; ') + (r.stderr || '').slice(0, 800));
passed += parseInt(summary[1] || '0', 10);

/* 2. Lint sweep over shipped files */
function walk(dir, out) {
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(e => {
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) { if (['vendor', 'screenshots', 'node_modules', '.git'].includes(e.name)) return; walk(rel, out); }
    else out.push(rel);
  });
  return out;
}
const all = walk('', []);
const shipped = all.filter(f => /\.(js|html|css|json)$/.test(f) && !f.startsWith('tests/'));
const text = all.filter(f => /\.(js|html|css|json|md)$/.test(f));

const BANNED = [/\bTODO\b/, /\bFIXME\b/, /placeholder/i, /lorem/i, /coming soon/i, /not implemented/i, /console\.log\(/];
shipped.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  BANNED.forEach(re => check(f + ' has no ' + re.source, !re.test(src)));
});
text.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const EM = String.fromCharCode(0x2014);
  const i = src.indexOf(EM);
  check(f + ' has no em dash', i === -1 && src.indexOf('\\u' + '2014') === -1 && src.indexOf('&' + 'mdash;') === -1, i !== -1 ? JSON.stringify(src.slice(Math.max(0, i - 30), i + 30)) : '');
});

/* 3. Copy rules: no exclamation marks or marketing words in UI strings */
const MARKETING = /\b(unlock|empower|journey|supercharge|seamless|take control|financial freedom awaits|dive in)\b/i;
/* MR-059: "unlock" is the name of the unlock loop (Unlock Map, Next unlock, what you unlocked), so the UI files that draw it may say it; data copy still may not. */
const UNLOCK_FILES = ['ui/unlocks.js', 'ui/unlocks.css', 'ui/views/measure.js', 'ui/views/home.js', 'ui/app.js'];
const MARKETING_NO_UNLOCK = /\b(empower|journey|supercharge|seamless|take control|financial freedom awaits|dive in)\b/i;
shipped.filter(f => f.startsWith('ui/') || f === 'index.html' || f.startsWith('data/')).forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* a JSON file's copy is its string values; its keys are field names (MR-063) */
  const jsonStrings = []; const walk = v => { if (typeof v === 'string') jsonStrings.push('"' + v + '"'); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  if (f.endsWith('.json')) { try { walk(JSON.parse(src)); } catch (e) { /* the JSON validity check lives elsewhere */ } }
  const strings = f.endsWith('.json') ? jsonStrings : (src.match(/'[^'\n]*'|"[^"\n]*"/g) || []);
  const marketing = UNLOCK_FILES.includes(f) ? MARKETING_NO_UNLOCK : MARKETING;
  /* Card names are proper nouns from the issuers, not our copy. */
  const bad = strings.filter(s => (marketing.test(s) && f !== 'data/cards.json') || (/!/.test(s) && !/^['"][^a-zA-Z]*['"]$/.test(s) && !/!==|!=|!\[|!important|\\!/.test(s) && !/^["']!/.test(s) && !/<[^>]*>/.test(s) && /[a-zA-Z]{3,} ?!/.test(s)));
  check(f + ' copy has no marketing words or exclamation marks', bad.length === 0, bad.slice(0, 3).join(' | '));
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src);
  check(f + ' has no emoji', !emoji);
});

/* 4. Colours: only tokens; no red */
const tokens = fs.readFileSync(path.join(ROOT, 'ui/tokens.css'), 'utf8');
const tokenHexes = new Set((tokens.match(/#[0-9a-fA-F]{6}\b/g) || []).map(s => s.toUpperCase()));
shipped.filter(f => /\.(css|js|html)$/.test(f) && f !== 'ui/tokens.css').forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const hexes = (src.match(/#[0-9a-fA-F]{6}\b/g) || []).map(s => s.toUpperCase());
  const stray = hexes.filter(x => !tokenHexes.has(x) && x !== '#FFFFFF' && x !== '#FFF');
  check(f + ' uses only token colours', stray.length === 0, stray.slice(0, 5).join(','));
});
tokenHexes.forEach(hex => {
  const r0 = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const isRed = r0 > 150 && g < 100 && b < 100;
  check('token ' + hex + ' is not red', !isRed);
});

/* 5. Font weights: at most two in app.css */
const appCss = fs.readFileSync(path.join(ROOT, 'ui/app.css'), 'utf8');
const weights = new Set((appCss.match(/font-weight:\s*(\d{3}|bold|normal)/g) || []).map(s => s.replace(/font-weight:\s*/, '')));
check('at most two font weights in app.css', weights.size <= 2, Array.from(weights).join(','));

/* 6. data/ files carry asOf, source and verify */
fs.readdirSync(path.join(ROOT, 'data')).filter(f => f.endsWith('.json')).forEach(f => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
  check('data/' + f + ' carries asOf, source and verify', typeof j.asOf === 'string' && typeof j.source === 'string' && typeof j.verify === 'boolean');
});

/* 7. Optional extra checks per level (fields ownership, metrics names) live in tests/engine/*.test.js */

console.log('\n' + '-'.repeat(60));
if (!failures.length) { console.log('ok: ' + passed + ' checks passed'); process.exit(0); }
console.log('FAILED: ' + failures.length + ' (' + passed + ' passed)');
failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
process.exit(1);
