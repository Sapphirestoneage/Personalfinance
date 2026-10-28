// The copy check (Phase 2.5, Batch 2): every client screen, every fold opened, read for the words a client should
// never see (an engine's name, a code word, an S-number) and counted. Run from the repo root with slam served:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/copy-check.mjs
// Prints the word count per page and every banned word found, with its sentence; exits 1 when one is found.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const URL = process.env.SLAM_URL || 'http://localhost:8765/';
export const PAGES = ['dashboard', 'session', 'ledger', 'calendar', 'spending', 'plan', 'onepager', 'windfall'];
// My numbers' own screens are client screens too.
const DEEP = ['session.html#/needs', 'session.html#/debt', 'session.html#/income', 'session.html#/assets', 'session.html#/goals', 'ledger.html#/debt', 'ledger.html#/assets', 'ledger.html#/taxes', 'ledger.html#/income', 'ledger.html#/needs', 'ledger.html#/goals', 'ledger.html#/onboard', 'ledger.html#/onboard/income', 'ledger.html#/onboard/debt', 'ledger.html#/onboard/assets', 'ledger.html#/onboard/needs', 'ledger.html#/onboard/goals', 'ledger.html#/onboard/finish'];
export const BANNED = [/\bengines?\b/i, /\bregistry\b/i, /\brules?\b/i, /\bspine\b/i, /\bkinds?\b/i, /\bpaths?\b/i, /\bfields?\b/i,
  /\bstored\b/i, /\bsimulations?\b/i, /\btemplates?\b/i, /\bschema\b/i, /\bS-\d+/, /\bthe Ledger\b/i, /\bcomputed\b/i, /\bderived\b/i, /\u2014/, /\bPhase\b/, /\bBatch\b/, /\bStage\b/i, /\bversion\b/i];
// Proper names that carry a banned word and are not the app talking: the Rule of 5 (a named target).
const ALLOWED = [/Rule of 5/gi, /Rule of 55/gi];

async function read(page, href) {
  await page.goto(URL + href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  // Open every fold, so what is behind it is read too.
  await page.evaluate(() => { for (const d of document.querySelectorAll('#app details')) d.open = true; });
  // And every Show the math.
  for (let i = 0; i < 60; i++) {
    const n = await page.evaluate(() => { const b = document.querySelector('#app .math-btn[aria-expanded="false"]'); if (!b) return 0; b.click(); return 1; });
    if (!n) break;
  }
  await page.waitForTimeout(100);
  return page.evaluate(() => document.getElementById('app').innerText);
}

const b = await playwright.chromium.launch();
const page = await (await b.newContext({ viewport: { width: 375, height: 812 } })).newPage();
let found = 0;
const counts = {};
for (const href of [...PAGES.map((p) => p + '.html'), ...DEEP]) {
  const text = await read(page, href);
  let clean = text;
  for (const a of ALLOWED) clean = clean.replace(a, '');
  counts[href] = text.split(/\s+/).filter(Boolean).length;
  for (const line of clean.split('\n')) for (const re of BANNED) if (re.test(line)) { found++; console.log('  ' + href + ': ' + re + ': ' + line.trim().slice(0, 160)); }
}
console.log(JSON.stringify(counts));
await b.close();
console.log(found ? found + ' banned words found' : 'No banned words');
process.exit(found ? 1 : 0);
