// The agreement check (overnight kit): every key number on a client screen carries data-metric="<registry id>"
// (engine/math.js); this opens every client screen on the demo household (made up), in fresh browser storage, reads
// each tagged number, and fails when one metric shows two different values anywhere (charts included).
//   node tools/agree-check.mjs            prints each metric, where it shows and its value; exits 1 on a disagreement
// Two readings agree when they are the same number at the coarser of their two precisions ("3.4 months" and
// "3.38 months" agree; "$62,976" and "$63,000" do not).

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
// Every client screen where a key number shows (the tool also follows nothing; add a screen here when it shows one).
export const SCREENS = [
  'dashboard.html', 'dashboard.html#/networth', 'dashboard.html#/surplus', 'dashboard.html#/savings', 'dashboard.html#/runway',
  'ledger.html', 'ledger.html#/debt', 'ledger.html#/assets', 'ledger.html#/income', 'ledger.html#/needs', 'ledger.html#/goals',
  'session.html', 'plan.html', 'onepager.html', 'spending.html', 'calendar.html'
];

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
// "$62,976" -> { n: 62976, dp: 0 }; "15%" -> { n: 15, dp: 0 }; "3.4 months" -> { n: 3.4, dp: 1 }; "-$219" -> -219.
export function reading(text) {
  const t = String(text).replace(/−/g, '-').trim();
  const m = t.match(/(-)?\$?\s?(-)?([\d,]+(?:\.(\d+))?)/);
  if (!m) return null;
  const n = Number(m[3].replace(/,/g, '')) * (m[1] || m[2] ? -1 : 1);
  return Number.isFinite(n) ? { n, dp: m[4] ? m[4].length : 0, text: t } : null;
}
export function agree(a, b) {
  const dp = Math.min(a.dp, b.dp), f = 10 ** dp;
  return Math.round(a.n * f) === Math.round(b.n * f);
}

export async function agreeCheck() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const seen = new Map();
  const errors = [];
  try {
    for (const url of SCREENS) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(url + ': ' + e.message));
      try {
        await page.goto(base + url, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const found = await page.evaluate(() => [...document.querySelectorAll('[data-metric]')].filter((el) => el.getAttribute('data-metric')).map((el) => [el.getAttribute('data-metric'), (el.textContent || '').trim()]));
        for (const [id, text] of found) {
          const r = reading(text);
          if (!r) continue;
          if (!seen.has(id)) seen.set(id, []);
          seen.get(id).push({ url, ...r });
        }
      } catch (e) { errors.push(url + ': ' + e.message.split('\n')[0]); } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.close(); }
  const conflicts = [];
  for (const [id, list] of seen) for (const x of list) if (!agree(list[0], x)) { conflicts.push({ id, a: list[0], b: x }); break; }
  return { seen, conflicts, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { seen, conflicts, errors } = await agreeCheck();
  const lines = [];
  for (const [id, list] of [...seen].sort()) lines.push(id.padEnd(20) + list.map((x) => x.text + ' (' + x.url + ')').join('; '));
  console.log('Agreement check: ' + seen.size + ' metrics, ' + [...seen.values()].reduce((t, l) => t + l.length, 0) + ' readings on ' + SCREENS.length + ' screens.');
  console.log(lines.join('\n'));
  for (const e of errors) console.log('ERROR ' + e);
  for (const c of conflicts) console.log('DISAGREE ' + c.id + ': ' + c.a.text + ' on ' + c.a.url + ', ' + c.b.text + ' on ' + c.b.url);
  await writeFile(fileURLToPath(new URL('../test/agree-report.txt', import.meta.url)), lines.join('\n') + '\n' + conflicts.map((c) => 'DISAGREE ' + c.id + ': ' + c.a.text + ' / ' + c.b.text).join('\n') + '\n');
  if (conflicts.length || errors.length) { console.log('FAIL: ' + conflicts.length + ' disagreements, ' + errors.length + ' errors.'); process.exit(1); }
  console.log('PASS: every metric reads the same everywhere.');
}
