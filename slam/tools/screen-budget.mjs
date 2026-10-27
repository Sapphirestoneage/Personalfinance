// The screen budget (overnight kit): words, height, buttons and chips on every client screen, with nothing opened,
// at 390px and 1024px, on the demo household (made up) in fresh browser storage. It reports; it never fails a run.
//   node tools/screen-budget.mjs                      every screen, prints a table, writes test/screen-budget.json
//   node tools/screen-budget.mjs --root ../other/slam  measure another copy (an older commit) the same way
//   node tools/screen-budget.mjs --out file.json      write the numbers somewhere else
// Words are the visible words in <main> (the header and tab bar are the same on every screen and not counted).

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const ROOT = arg('--root') ? resolve(arg('--root')) : fileURLToPath(new URL('..', import.meta.url));
const OUT = arg('--out') || fileURLToPath(new URL('../test/screen-budget.json', import.meta.url));

// The screens, with the Krug pass's targets (words at 390px) where it set one.
export const SCREENS = [
  ['Today', 'dashboard.html', 150], ['Session', 'session.html', 60], ['My numbers', 'ledger.html', null], ['Still guessing', 'ledger.html#/still-guessing', 100],
  ['A card (Visa)', 'ledger.html#/debt/credit-cards/visa', 80], ['Needs', 'ledger.html#/needs', null], ['Calendar', 'calendar.html', 150],
  ['Spending', 'spending.html', 90], ['Plan', 'plan.html', 150], ['Profile', 'profile.html', 60], ['Assumptions', 'assumptions.html', null],
  ['One-pager', 'onepager.html', null], ['Before our first call', 'before.html', null], ['Got extra money?', 'windfall.html', null]
];
const LOOKS = [{ id: '390', width: 390, height: 844 }, { id: '1024', width: 1024, height: 800 }];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
// Runs in the page: what one person sees with nothing opened.
function measure() {
  const main = document.querySelector('main') || document.body;
  const shown = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const count = (t) => (t || '').split(/\s+/).filter((w) => /[A-Za-z0-9$]/.test(w)).length;
  // A closed list shows only its picked option, so the others are not counted.
  const hiddenOptions = [...main.querySelectorAll('select')].filter(shown).reduce((n, sel) => n + count(sel.innerText) - count(sel.selectedOptions[0] ? sel.selectedOptions[0].text : ''), 0);
  const words = count(main.innerText) - hiddenOptions;
  const buttons = [...main.querySelectorAll('button, a.btn, [role="button"]')].filter(shown).length;
  const chips = [...main.querySelectorAll('.chip')].filter(shown).length;
  const primary = [...main.querySelectorAll('.btn.primary')].filter(shown).length;
  return { words, height: Math.round(document.documentElement.scrollHeight), buttons, chips, primary };
}

export async function budget() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const out = {};
  try {
    for (const look of LOOKS) {
      for (const [name, url] of SCREENS) {
        const ctx = await browser.newContext({ viewport: { width: look.width, height: look.height } });
        const page = await ctx.newPage();
        try {
          const r = await page.goto(base + url, { waitUntil: 'load' });
          if (!r || !r.ok()) { (out[name] ||= {})[look.id] = null; continue; }
          await page.waitForTimeout(/still-guessing/.test(url) ? 4000 : 1800);
          (out[name] ||= {})[look.id] = await page.evaluate(measure);
        } catch { (out[name] ||= {})[look.id] = null; } finally { await ctx.close(); }
      }
    }
  } finally { await browser.close(); server.close(); }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const res = await budget();
  await writeFile(OUT, JSON.stringify(res, null, 1) + '\n');
  const pad = (x, n) => String(x ?? '-').padStart(n);
  console.log('Screen budget (' + ROOT + ')\n' + 'screen'.padEnd(24) + ' words390 target  height390  buttons chips | words1024 height1024');
  for (const [name, , target] of SCREENS) {
    const a = res[name]['390'] || {}, b = res[name]['1024'] || {};
    const over = target && a.words > target ? ' over' : '';
    console.log(name.padEnd(24) + pad(a.words, 9) + pad(target, 7) + pad(a.height, 11) + pad(a.buttons, 9) + pad(a.chips, 6) + ' |' + pad(b.words, 10) + pad(b.height, 11) + over);
  }
}
