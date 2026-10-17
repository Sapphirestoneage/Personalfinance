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

// The October household from test/bridge.test.js, plus 60 of ATM cash, as an export file.
async function buildBridgeDoc() {
  const { newHousehold } = await import('../src/store/schema.js');
  const { makeValue } = await import('../src/store/value.js');
  const { addAccount, setBalance } = await import('../src/store/accounts.js');
  const { addDebt, findLine } = await import('../src/store/edits.js');
  const { addEntry, editEntry } = await import('../src/store/log.js');
  const { migrate } = await import('../src/store/migrate.js');
  const { exportHousehold } = await import('../src/store/transfer.js');
  const one = (a) => makeValue(a, { cadence: 'one-off' });
  const raw = newHousehold('Bridge check');
  raw.currentMonth = '2026-10';
  raw.income.push({ id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: makeValue(4000), gross: makeValue(), deductions: [], state: 'active' });
  const d = migrate(raw);
  addDebt(d, { label: 'Visa', type: 'credit-card' }).minimum = makeValue(40);
  for (const [id, name, type, start, end] of [['chk', 'Checking', 'checking', 2000, 2420], ['sav', 'Savings', 'savings', 5000, 5200], ['visa', 'Visa', 'credit-card', 500, 350]]) {
    addAccount(d, { id, name, type });
    setBalance(d, '2026-10', id, 'start', one(start));
    setBalance(d, '2026-10', id, 'end', one(end));
  }
  findLine(d, 'rent').line.actual = makeValue(1500);
  findLine(d, 'emergency-fund').line.actual = makeValue(200);
  Object.assign(findLine(d, 'car-insurance').line, { estimate: makeValue(1200, { cadence: 'year' }), dueMonth: one(10), dueDay: one(14) });
  for (const [date, amount, more] of [['2026-10-01', -2000, { kind: 'income' }], ['2026-10-15', -2000, { kind: 'income' }], ['2026-10-20', -300, { kind: 'income' }],
    ['2026-10-05', 300, { lineId: 'groceries', account: 'visa' }], ['2026-10-06', 100, { lineId: 'groceries' }], ['2026-10-14', 1200, { lineId: 'car-insurance' }],
    ['2026-10-25', 450, { kind: 'card-payment' }], ['2026-10-28', 60, { merchant: 'ATM withdrawal' }]]) addEntry(d, { date, amount, account: 'chk', ...more });
  editEntry(d, addEntry(d, { date: '2026-10-10', amount: 120, lineId: 'shopping', account: 'chk', merchant: 'Ticketmaster' }).id, { owed: 60 });
  editEntry(d, addEntry(d, { date: '2026-10-12', amount: 250, lineId: 'shopping', account: 'chk', merchant: 'Couch' }).id, { oneOff: true });
  return exportHousehold(d, '2026-11-01T00:00:00Z');
}

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
// The budget-to-cash bridge (S-088): the October household from test/bridge.test.js
// with $60 of ATM cash unmapped. By hand: explained +680, cash 7,000 -> 7,620 = +620, not explained -60.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL + '#clients');
  console.log('bridge (phone width)');
  const doc = await buildBridgeDoc();
  await page.setInputFiles('#import-file', { name: 'bridge.json', mimeType: 'application/json', buffer: Buffer.from(doc) });
  await page.waitForTimeout(300);
  await page.click('nav a[href="#analyze"]');
  await page.waitForSelector('#chart-bridge');
  check('bridge', 'Explained', await page.$eval('[data-key="bridge-explained"]', (b) => b.textContent), signedMoney(680));
  check('bridge', 'Actual change', await page.$eval('[data-key="bridge-actual"]', (b) => b.textContent), signedMoney(620));
  check('bridge', 'Not explained yet', await page.$eval('[data-key="bridge-unexplained"]', (b) => b.textContent), signedMoney(-60));
  check('bridge', 'Waterfall drawn', String(await page.$$eval('#chart-bridge svg rect', (r) => r.length >= 8)), 'true');
  // The loop (S-089). By hand: 10 entries (3 paychecks, 2 groceries, Geico, the card payment, ATM, the concert, the couch),
  // the yearly car insurance confirmed by its entry, every balance in (3 accounts x start and end), the bridge off by 60.
  await page.click('nav a[href="#budget"]');
  await page.waitForSelector('#loop-strip');
  check('loop strip', 'Review step', await page.$eval('[data-key="loop-review"] .small', (d) => d.textContent), '0 lines still empty, 6 of 6 balances in, bridge off by $60');
  check('loop strip', 'Track step', await page.$eval('[data-key="loop-track"] .small', (d) => d.textContent), '10 entries, last Oct 28, scheduled 1 of 1 confirmed');
  page.on('dialog', (dl) => dl.accept());
  await page.click('[data-key="open-checklist"]');
  await page.waitForSelector('#checklist');
  const want = "Closed with 3 open items: off by $60, 1 reimbursement owed, next month's plan not started";
  check('checklist', 'Summary', await page.$eval('[data-key="close-summary"]', (p) => p.textContent), want + '.');
  check('checklist', 'Close button', await page.$eval('[data-key="close-month"]', (b) => b.textContent), 'Close with 3 open items');
  await page.click('[data-key="close-month"]');
  await page.waitForSelector('#just-closed');
  check('review', 'Open at close', await page.$eval('#just-closed [data-key="review-open"]', (b) => b.textContent), want);
  check('review', 'Bridge tile', await page.$eval('#just-closed [data-key="review-bridge"]', (b) => b.textContent), 'Off by $60');
  // 460 logged (groceries 400 + shopping 60) of 1,960 (+ rent 1,500 typed) = 23%
  check('review', 'Tracking', await page.$eval('#just-closed [data-key="review-tracking"]', (b) => b.textContent), '23% ($460 logged, $1,500 typed)');
  await page.click('nav a[href="#analyze"]');
  await page.waitForSelector('#months-review');
  check('months', 'Estimate history chart', String(await page.$$eval('#chart-estimate-history svg path', (p) => p.length > 0)), 'true');
  check('months', '80/20 reading', await page.$eval('#chart-pareto .reading', (p) => p.textContent), '50% of your entries (3 of 6) made up 80% of your spending.');
  check('months', '80/20 chart', String(await page.$$eval('#chart-pareto svg rect', (r) => r.length === 6)), 'true');
  // Trends (S-092): every card drawn, and two of the one-line stats by hand.
  await page.waitForSelector('#chart-trend-heat');
  for (const id of ['trend-series', 'trend-charges', 'trend-heat', 'trend-mom', 'trend-pacing', 'trend-dom']) check('trends', id + ' drawn', String(await page.$$eval('#chart-' + id + ' svg', (x) => x.length === 1)), 'true');
  check('trends', 'Card float', await page.$eval('#stat-float .reading', (p) => p.textContent), "Oct '26 charged $300, paid $450.");
  check('trends', 'Not explained yet', await page.$eval('#stat-unexplained .reading', (p) => p.textContent), '-$60 over 1 bridged month; ATM cash $60; Venmo or Zelle with no line $0.');
  check('months', 'Saved review shown', await page.$eval('#months-review [data-key="review-open"]', (b) => b.textContent), want);
  check('bridge', 'Console errors', String(errors.length), '0');
  await page.close();
}
// Riley, a year of the loop (Part 10), with the clock on October 17, 2026. Numbers by hand in test/riley.test.js.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '#clients');
  console.log('riley (phone width, October 17, 2026)');
  // October by hand: 6 checking and savings entries (rent, the move to savings both sides, paycheck, dog walking,
  // car payment) and 6 on the Visa = 12;
  // scheduled in October: rent, two paychecks, car payment, phone, Visa = 6, of which 3 are done so far.
  await page.getByText('Riley, 31').click();
  await page.waitForSelector('#cash-strip');
  check('riley', 'Cash today', await page.$eval('[data-key="cash-today"]', (b) => b.textContent), money(3291.03));
  check('riley', 'Lowest point', await page.$eval('[data-key="cash-lowest"]', (b) => b.textContent), money(60));
  check('riley', 'Safe to spend', await page.$eval('[data-key="safe-to-spend"]', (b) => b.textContent), money(3096.03));
  check('riley', 'Calendar reading', await page.$eval('[data-key="cash-reading"]', (p) => p.childNodes[0].textContent), 'Your lowest point is $60 on the 5th, the day before payday. Rent lands 5 days before the paycheck that covers it.');
  check('riley', 'Track step', await page.$eval('[data-key="loop-track"] .small', (d) => d.textContent), '12 entries, last Oct 15, scheduled 3 of 6 confirmed');
  await page.click('nav a[href="#analyze"]');
  await page.waitForSelector('#months-review');
  await page.selectOption('[data-key="months-pick"]', '2026-03');
  await page.waitForTimeout(150);
  check('riley', 'March review readings', await page.$eval('#months-review [data-key="review-readings"]', (p) => p.textContent), 'Food came in $136 under plan. Shopping was $57 over. Income came in $280 less than planned. 1.07x off this month, down from 1.09x.');
  check('riley', 'March bridge ties', await page.$eval('#months-review [data-key="review-bridge"]', (b) => b.textContent), 'Ties');
  check('riley', 'March bridge reading', await page.$eval('#chart-months-bridge .reading', (p) => p.textContent), 'Your budget showed $172 over, but cash went down $966. The car insurance bill ($960) came due this month.');
  check('riley', 'March 80/20', await page.$eval('#chart-pareto .reading', (p) => p.textContent), '13% of your entries (3 of 23) made up 80% of your spending.');
  await page.click('[data-key="pareto-level-lines"]');
  await page.waitForTimeout(100);
  check('riley', 'March 80/20 lines', await page.$eval('#chart-pareto .reading', (p) => p.textContent), '4 lines, Rent, Car payment, Groceries, and Shopping, made up 80%.');
  await page.selectOption('[data-key="months-pick"]', '2026-06');
  await page.waitForTimeout(150);
  check('riley', 'June open items', await page.$eval('#months-review [data-key="review-open"]', (b) => b.textContent), 'Closed with 2 open items: off by $60, 1 unmapped, 0 possible matches');
  check('riley', 'June not explained', await page.$eval('#chart-months-bridge [data-key="bridge-unexplained"]', (b) => b.textContent), signedMoney(-60));
  check('riley', 'Pay-later flag', await page.$eval('#chart-cf-paylater li', (li) => li.querySelector('span').textContent + ' (' + li.querySelector('b').textContent + ')'), 'Rent is due Nov 1, paid Nov 6 (5 days)');
  for (const id of ['trend-series', 'trend-heat', 'trend-mom', 'trend-pacing', 'trend-dom', 'estimate-history', 'cf-chart', 'bridge']) check('riley', id + ' drawn', String(await page.$$eval('#chart-' + id + ' svg', (x) => x.length >= 1)), 'true');
  check('riley', 'Console errors', String(errors.length), '0');
  await page.close();
}
await browser.close();
console.log(failures ? failures + ' FAILED' : 'All screen numbers match the expected files.');
process.exit(failures ? 1 : 0);
