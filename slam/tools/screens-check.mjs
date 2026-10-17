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

  // Columns are found by their header, since Plan and long-term dream columns come and go.
  const heads = await page.$$eval('table.budget thead th', (ths) => ths.map((th) => th.textContent.replace(/[▴▾]/g, '').trim()));
  const col = (label) => heads.findIndex((x) => x === label);
  const total = await page.$$eval('tr.total td', (tds) => tds.map((td) => td.textContent.trim()));
  check(name, 'Table estimate total', total[col('Estimate')], money(exp.estimateTotal));
  check(name, 'Table dream total', total[col('Dream')], money(exp.dreamTotal));
  check(name, 'Table actual total', total[col('Actual')], money(exp.actualTotal));
  check(name, 'Table % of income total', total[col('% of income')], pct(exp.spending / exp.takeHome));
  check(name, 'Plan column shown', String(col('Plan') >= 0), String(!!exp.plan));
  if (exp.plan) check(name, 'Table plan total', total[col('Plan')], money(exp.plan.spending));

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
    check(name, id + ' estimate', row[idx][col('Estimate')], money(e));
    check(name, id + ' actual', row[idx][col('Actual')].replace(' partial', ''), money(a));
    if (exp.shares && exp.shares.categories[id]) {
      check(name, id + ' % of income', row[idx][col('% of income')], pct(exp.shares.categories[id][0]));
      if (exp.shares.categories[id][1] !== null) check(name, id + ' % of spending', row[idx][col('% of spending')], pct(exp.shares.categories[id][1]));
    }
    if (exp.plan && exp.plan.categories[id]) check(name, id + ' plan', row[idx][col('Plan')], money(exp.plan.categories[id][0]));
    if (id === 'food' && exp.happiness) check(name, 'food happiness', row[idx][col('Happiness')], pct(exp.happiness.foodShare));
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
  if (exp.stress) check(name, 'Stress reading', await page.$eval('#chart-stress .reading', (p) => p.textContent), exp.stress.reading);
  if (exp.review) {
    // Review and plan: the live totals and the reading for the month reviewed.
    const rv = await page.$$eval('.review-top .tile', (ts) => ts.map((t) => t.querySelector('.value').textContent.trim()));
    check(name, 'Review plan total', rv[0], money(exp.review.plan));
    check(name, 'Review plan vs take-home', rv[1], signedMoney(exp.review.planLeft));
    check(name, 'Review frees up', rv[2], signedMoney(exp.review.frees));
    check(name, 'Review plan % of income', rv[3], pct(exp.review.planPctIncome));
    check(name, 'Review checklist', await page.$eval('.review-count', (b) => b.textContent), exp.review.checklist[0] + ' of ' + exp.review.checklist[1] + ' lines reviewed');
    check(name, 'Review reading', await page.$eval('[data-key="review-reading"]', (p) => p.textContent), exp.review.reading);
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
// The monthly loop (S-084 on): accounts, balances, and the screens built on them.
// Dates are in this month (a new client works on the month it was made).
const YM = (() => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); })();
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '#clients');
  console.log('loop (phone width)');
  await page.fill('[data-key="new-client"]', 'Loop check');
  await page.press('[data-key="new-client"]', 'Enter');
  await page.waitForSelector('.passes');
  await page.getByRole('button', { name: '6 Cash flow' }).click();
  await page.click('[data-key="add-acct-checking"]');
  const startBox = page.locator('#accounts-card input.amount').first();
  await startBox.fill('2500');
  await startBox.press('Tab');
  await page.waitForTimeout(100);
  check('loop', 'Cash start shown', await page.$eval('#accounts-card p.small b', (b) => b.textContent), money(2500));
  await page.getByRole('button', { name: '7 Next stage' }).click();
  await page.waitForTimeout(100);
  const startNs = page.getByRole('button', { name: 'Plan a next stage' });
  if (await startNs.count()) await startNs.click();
  await page.waitForSelector('[data-key="cash-on-hand"]', { timeout: 3000 }).catch(() => null);
  const note = await page.$eval('[data-key="cash-on-hand"]', (p) => p.textContent).catch(() => 'missing');
  check('loop', 'Next stage reads cash from balances', note.includes(money(2500)) ? 'reads ' + money(2500) : note, 'reads ' + money(2500));
  await page.getByRole('button', { name: '8 Eras' }).click();
  await page.waitForSelector('[data-key="cash-on-hand"]', { timeout: 3000 }).catch(() => null);
  const eraNote = await page.$eval('[data-key="cash-on-hand"]', (p) => p.textContent).catch(() => 'missing');
  check('loop', 'Eras reads cash from balances', eraNote.includes(money(2500)) ? 'reads ' + money(2500) : eraNote, 'reads ' + money(2500));

  // Quick entry from the Budget screen, then a bank file that matches it (S-085).
  await page.click('nav a[href="#budget"]');
  await page.click('[data-key="open-quick-entry"]');
  await page.fill('[data-key="qe-amount"]', '54.20');
  await page.fill('[data-key="qe-search"]', 'groc');
  await page.click('[data-key="qe-line:groceries"]');
  await page.fill('[data-key="qe-merchant"]', "Trader Joe's");
  await page.fill('[data-key="qe-date"]', YM + '-03');
  await page.click('[data-key="qe-save"]');
  await page.waitForSelector('.toast');
  check('loop', 'Quick entry saved', await page.$eval('.toast', (t) => t.textContent), 'Logged $54.20 to Groceries');
  await page.click('nav a[href="#fill"]');
  await page.getByRole('button', { name: '6 Cash flow' }).click();
  const mdy = (d) => YM.slice(5) + '/' + d + '/' + YM.slice(0, 4);
  await page.setInputFiles('#tx-file', { name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n' + mdy('04') + ',TRADER JOE S #552,-54.20\n' + mdy('05') + ',WHOLE FOODS MKT,-80.10\n') });
  await page.waitForSelector('[data-key="match-summary"]');
  check('loop', 'Import match summary', (await page.$eval('[data-key="match-summary"] b', (b) => b.textContent)), 'Matched 1, new 1, possible matches 0 to confirm.');
  await page.click('[data-key="tx-add"]');
  await page.waitForTimeout(150);
  const srcs = await page.$$eval('.src-chip', (cs) => cs.map((c) => c.textContent));
  check('loop', 'Log sources after merge', srcs.join(', '), 'Bank, merged, Bank');
  // Cash by day (S-086). By hand: checking starts at 2,500; Trader Joe's 54.20 and Whole Foods 80.10
  // are in the log; no income or plan yet. Today 2,500 - 54.20 - 80.10 = 2,365.70, also the lowest
  // point and safe to spend (no payday ahead).
  await page.click('nav a[href="#budget"]');
  await page.waitForSelector('#cash-strip');
  check('loop', 'Cash today', await page.$eval('[data-key="cash-today"]', (b) => b.textContent), money(2365.7));
  check('loop', 'Lowest point', await page.$eval('[data-key="cash-lowest"]', (b) => b.textContent), money(2365.7));
  check('loop', 'Safe to spend', await page.$eval('[data-key="safe-to-spend"]', (b) => b.textContent), money(2365.7));
  await page.click('nav a[href="#analyze"]');
  await page.waitForSelector('#chart-cf-chart svg');
  check('loop', 'Calendar chart drawn', String(await page.$$eval('#chart-cf-chart svg path', (p) => p.length > 0)), 'true');
  check('loop', 'Month grid drawn', String(await page.$$eval('#chart-cf-grid td', (t) => t.length >= 28)), 'true');
  // Actuals from the log (S-087): groceries = 54.20 + 80.10 = 134.30, from 2 entries, not typed over.
  await page.click('nav a[href="#fill"]');
  await page.getByRole('button', { name: '5 Actual' }).click();
  await page.waitForSelector('[data-key="from-log:groceries"]');
  check('loop', 'Groceries from the log', await page.$eval('[data-key="from-log:groceries"]', (b) => b.textContent), money(134.3, true));
  await page.click('[data-key="from-log:groceries"]');
  await page.waitForFunction(() => { const t = document.querySelector('.toast'); return t && t.textContent.startsWith('This comes'); }, null, { timeout: 3000 }).catch(() => null);
  check('loop', 'Typing over a logged line', await page.$eval('.toast', (t) => t.textContent), 'This comes from 2 entries. Add one, or edit an entry.');
  check('loop', 'Console errors', String(errors.length), '0');
  await page.close();
}
await browser.close();
console.log(failures ? failures + ' FAILED' : 'All screen numbers match the expected files.');
process.exit(failures ? 1 : 0);
