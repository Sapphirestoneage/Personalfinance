// Phase 5 screen tie-out. Loads each test household in a real browser and
// checks that the numbers the Budget and Analyze screens SHOW match the
// hand-computed expected files. Not part of `node --test` (it needs a browser).
//
// Run from the slam folder:
//   python3 -m http.server 8765 &
//   node tools/screens-check.mjs
// Needs Playwright (npm i -g playwright) and a Chromium it can find.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { money, pct, signedMoney, times } from '../src/ui/format.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const URL = process.env.SLAM_URL || 'http://localhost:8765/';
const DEMOS = { maya: 'Maya, 26', luis: 'Luis, 33', tasha: 'Tasha, 29', sam: 'Sam, 24' };
let failures = 0;

function check(name, label, shown, expected) {
  const ok = shown === expected;
  if (!ok) failures += 1;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + ': shown "' + shown + '", expected "' + expected + '"');
}

const browser = await playwright.chromium.launch();
for (const [name, button] of Object.entries(DEMOS)) {
  const { default: exp } = await import('../test/households/' + name + '.expected.js');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '#clients');
  await page.getByText(button).click();
  await page.waitForSelector('.strip');
  console.log(name);

  const tiles = await page.$$eval('.tile', (ts) => Object.fromEntries(ts.map((t) => [t.querySelector('.label').textContent.trim(), t.querySelector('.value').textContent.trim()])));
  check(name, 'Take-home tile', tiles['Take-home'], money(exp.takeHome));
  check(name, 'Spending tile', tiles.Spending, money(exp.spending));
  check(name, 'Surplus tile', tiles[exp.surplus < 0 ? 'Shortfall' : 'Surplus'], signedMoney(exp.surplus));
  check(name, 'Savings rate tile', tiles['Savings rate'], pct(exp.savingsRate));
  check(name, 'Housing tile', tiles.Housing, pct(exp.housingShare));
  check(name, 'Blind spot tile', tiles['Blind spot'], pct(exp.blindSpot));

  const total = await page.$$eval('tr.total td', (tds) => tds.map((td) => td.textContent.trim()));
  check(name, 'Table estimate total', total[1], money(exp.estimateTotal));
  check(name, 'Table dream total', total[2], money(exp.dreamTotal));
  check(name, 'Table actual total', total[3], money(exp.actualTotal));

  for (const [id, [e, d, a]] of Object.entries(exp.categories)) {
    const row = await page.$$eval('tr.cat', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));
    const name2 = (await page.$$eval('tr.cat td:first-child', (tds) => tds.map((td) => td.textContent)));
    const idx = name2.findIndex((n) => n.replace(/[▸▾]/g, '').trim().toLowerCase().startsWith(id === 'debt' ? 'debt' : id === 'fun' ? 'personal' : id === 'transport' ? 'transport' : id === 'bills' ? 'bills' : id === 'annual' ? 'annual' : id === 'everything' ? 'everything' : id));
    if (idx < 0) {
      // "Doesn't apply" categories have no row; they must be named under the table instead.
      const na = await page.$$eval('p.muted.xs', (ps) => (ps.find((p) => p.textContent.startsWith("Doesn't apply")) || { textContent: '' }).textContent.toLowerCase());
      const word = { fun: 'personal', transport: 'transport', bills: 'bills', annual: 'annual', debt: 'debt' }[id] || id;
      check(name, id + ' listed as doesn\'t apply', na.includes(word) && e === 0 && a === 0 ? 'listed' : 'missing', 'listed');
      continue;
    }
    check(name, id + ' estimate', row[idx][1], money(e));
    check(name, id + ' actual', row[idx][3].replace(' partial', ''), money(a));
  }

  const culprits = await page.$$eval('.card', (cards) => {
    const c = cards.find((x) => x.querySelector('h3') && x.querySelector('h3').textContent === 'Biggest culprits');
    return c ? [...c.querySelectorAll('li')].map((li) => li.querySelector('b').textContent + '|' + li.querySelectorAll('b')[1].textContent) : [];
  });
  check(name, 'Culprits', culprits.join(', '), exp.culprits.map(([n, gap]) => n + '|' + money(gap)).join(', '));

  const comp = await page.$$eval('.card', (cards) => {
    const c = cards.find((x) => x.querySelector('h3') && x.querySelector('h3').textContent === 'How filled in is the picture');
    return c ? c.querySelector('b').textContent : null;
  });
  check(name, 'Completion', comp, pct(exp.completion));

  const proof = await page.$$eval('.card.flag h3', (hs) => hs.length > 0);
  check(name, 'Proof of cash flag shown', String(proof), String(exp.proofOfCash.flagged));

  await page.click('nav a[href="#analyze"]');
  await page.waitForSelector('#chart-gut');
  const gutReading = await page.$eval('#chart-gut .reading', (p) => p.textContent);
  check(name, 'Gut check reading', gutReading.includes(times(exp.gut.ratio)) ? 'mentions ' + times(exp.gut.ratio) : gutReading, 'mentions ' + times(exp.gut.ratio));
  if (exp.incomeStatement) {
    const net = await page.$$eval('#chart-statement tr.total td', (tds) => tds.map((td) => td.textContent.trim()));
    check(name, 'Income statement net', net[net.length - 2], signedMoney(exp.incomeStatement.net));
  }
  if (exp.draftt) {
    // DRAFTT is descriptive (S-072): the reading names proportions, never a verdict.
    const dr = await page.$eval('#chart-draftt .reading', (p) => p.textContent);
    check(name, 'DRAFTT reading', dr, exp.draftt.reading);
    const words = await page.$eval('#chart-draftt', (c) => c.textContent.toLowerCase());
    check(name, 'DRAFTT has no grades', /healthy|outside the|band|\(high\)|\(low\)/.test(words) ? 'graded' : 'none', 'none');
    const totalRow = await page.$$eval('#chart-draftt tr.cat td', (tds) => tds.map((td) => td.textContent.trim()));
    check(name, 'DRAFTT total % of base', totalRow[2], pct(exp.draftt.totalShare));
  }
  check(name, 'Console errors', String(errors.length), '0');
  await page.close();
}
await browser.close();
console.log(failures ? failures + ' FAILED' : 'All screen numbers match the expected files.');
process.exit(failures ? 1 : 0);
