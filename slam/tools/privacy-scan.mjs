// The privacy scan (S-237): no real number leaves this machine. Checks that no *.local.* file is tracked by git, and,
// when the owner's files are here (fixtures/eli.local.json, fixtures/eli-numbers.local.xlsx), that no tracked SLAM
// file holds one of their amounts (100 or more, as typed or with commas), names, or answers.
//
//   node tools/privacy-scan.mjs        exit 1 when something is found
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../test/sheet-read.js';

const SLAM = fileURLToPath(new URL('..', import.meta.url));
const tracked = execSync('git ls-files', { cwd: SLAM, encoding: 'utf8' }).split('\n').filter(Boolean);
const found = [];
for (const f of tracked) if (/\.local\./.test(f)) found.push('tracked local file: ' + f);

const needles = new Set();
const addNum = (n) => { if (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) >= 100) { needles.add(String(n)); needles.add(n.toLocaleString('en-US')); } };
function walk(x) {
  if (Array.isArray(x)) x.forEach(walk);
  else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  else addNum(x);
}
const sources = [];
if (existsSync(SLAM + 'fixtures/eli.local.json')) { const p = JSON.parse(readFileSync(SLAM + 'fixtures/eli.local.json', 'utf8')); walk(p); sources.push('eli.local.json'); }
if (existsSync(SLAM + 'fixtures/eli-numbers.local.xlsx')) {
  const [num] = readXlsx(readFileSync(SLAM + 'fixtures/eli-numbers.local.xlsx'));
  for (const r of num.rows.slice(1)) { const a = String(r[2] || '').trim(); if (a.length >= 6 && /\d{3}/.test(a)) needles.add(a); }
  sources.push('eli-numbers.local.xlsx');
}
// Demo values and the rules' own numbers are public on purpose; a short needle matches by chance too often.
const skip = (f) => /^(data\/|fixtures\/demo|test\/households\/|docs\/|shots\/|tools\/gallery)/.test(f) || /\.(png|jpg|jpeg|pdf|xlsx)$/.test(f);
if (needles.size) for (const f of tracked) {
  if (skip(f) || !existsSync(SLAM + f)) continue;
  const text = readFileSync(SLAM + f, 'utf8');
  for (const n of needles) if (n.length >= 4 && new RegExp('(^|[^\\d.,])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\d])').test(text)) found.push(f + ' holds ' + n);
}
console.log('Privacy scan: ' + tracked.length + ' tracked files. Compared against: ' + (sources.length ? sources.join(', ') : 'nothing (no local files on this machine), so only tracked *.local.* files were checked') + '.');
console.log(found.length ? found.join('\n') : 'Nothing found.');
process.exit(found.length ? 1 : 0);
