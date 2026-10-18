// Phase 5 screen tie-out. Loads each test household in a real browser and
// checks that the numbers Today, Plan, Track, Review, Insights, and Setup SHOW
// match the hand-computed expected files (the menu follows the loop, S-106). Not part of `node --test` (it needs a browser).
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

// Open a screen at any width: the top links on wide screens, the bottom bar (or More) on phones.
async function go(page, screen) {
  await page.waitForSelector('a[href="#' + screen + '"]', { state: 'attached', timeout: 3000 }).catch(() => null);
  const top = page.locator('header nav a[href="#' + screen + '"]');
  if (await top.count() && await top.isVisible()) return top.click();
  const bottom = page.locator('.bottom-bar > a[href="#' + screen + '"]');
  if (await bottom.count()) return bottom.click();
  await page.click('[data-key="more"]');
  await page.click('.more-menu a[data-nav="' + screen + '"]');
}
async function insights(page, tab) { await go(page, 'insights'); await page.click('[data-key="tab-' + tab + '"]'); await page.waitForSelector('#tab-' + tab); }
async function setup(page, section) { await go(page, 'setup'); await page.click('[data-key="setup-' + section + '"]'); await page.waitForSelector('#setup-' + section); }
async function plan(page, view) { await go(page, 'plan'); await page.click('[data-key="plan-view-' + view + '"]'); await page.waitForTimeout(100); }
const tilesOf = (page, sel) => page.$$eval(sel + ' .tile', (ts) => Object.fromEntries(ts.map((t) => [t.querySelector('.label').textContent.trim(), t.querySelector('.value').textContent.trim()])));

// The text of an element once it settles on what is expected (or what it is after 3 seconds).
async function settled(page, sel, want) {
  await page.waitForFunction(([q, w]) => { const e = document.querySelector(q); return e && e.textContent === w; }, [sel, want], { timeout: 3000 }).catch(() => null);
  return page.$eval(sel, (e) => e.textContent).catch(() => 'missing');
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
  await page.waitForSelector('#headline');
  console.log(name);

  // The menu follows the monthly loop (S-106); Clients opens from the client name.
  check(name, 'Menu', (await page.$$eval('header nav a', (as) => as.map((a) => a.textContent))).join(', '), 'Today, Plan, Track, Review, Insights, Setup');
  // Today: at most four headline tiles.
  const tiles = await tilesOf(page, '#headline');
  check(name, 'Headline tiles', Object.keys(tiles).join(', '), 'Take-home, Spending, ' + (exp.surplus < 0 ? 'Shortfall' : 'Surplus') + ', Savings rate');
  check(name, 'Take-home tile', tiles['Take-home'], money(exp.takeHome));
  check(name, 'Spending tile', tiles.Spending, money(exp.spending));
  check(name, 'Surplus tile', tiles[exp.surplus < 0 ? 'Shortfall' : 'Surplus'], signedMoney(exp.surplus));
  check(name, 'Savings rate tile', tiles['Savings rate'], pct(exp.savingsRate));
  // Lesson 7 (S-116): Today shows numbers, not charts.
  check(name, 'No charts on Today', String(await page.$$eval('#main .chart svg', (x) => x.length)), '0');
  await insights(page, 'where');
  check(name, 'Housing share (gauges)', String((await page.$eval('#chart-gauges .reading', (p) => p.textContent)).startsWith('Housing is ' + pct(exp.housingShare) + ' of take-home')), 'true');
  await insights(page, 'compared');
  check(name, 'Blind spot tile', (await tilesOf(page, '#tab-compared'))['Blind spot'], pct(exp.blindSpot));

  // Columns are found by their header, since the Plan column comes and goes. No dream column (S-097).
  const heads = await page.$$eval('table.budget thead th', (ths) => ths.map((th) => th.textContent.replace(/[▴▾]/g, '').trim()));
  const col = (label) => heads.findIndex((x) => x === label);
  const total = await page.$$eval('tr.total td', (tds) => tds.map((td) => td.textContent.trim()));
  check(name, 'Table estimate total', total[col('Estimate')], money(exp.estimateTotal));
  check(name, 'No dream column', String(heads.some((x) => /dream/i.test(x))), 'false');
  check(name, 'Table actual total', total[col('Actual')], money(exp.actualTotal));
  check(name, 'Table % of income total', total[col('% of income')], pct(exp.spending / exp.takeHome));
  check(name, 'Plan column shown', String(col('Plan') >= 0), String(!!exp.plan));
  if (exp.plan) check(name, 'Table plan total', total[col('Plan')], money(exp.plan.spending));

  for (const [id, [e, a]] of Object.entries(exp.categories)) {
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

  check(name, 'Completion', await page.$eval('#chart-completion b', (b) => b.textContent), pct(exp.completion));

  const proof = await page.$$eval('.card.flag h3', (hs) => hs.length > 0);
  check(name, 'Proof of cash flag shown', String(proof), String(exp.proofOfCash.flagged));

  const gutReading = await page.$eval('#chart-gut .reading', (p) => p.textContent);
  check(name, 'Gut check reading', gutReading.includes(times(exp.gut.ratio)) ? 'mentions ' + times(exp.gut.ratio) : gutReading, 'mentions ' + times(exp.gut.ratio));
  if (exp.incomeStatement) {
    await insights(page, 'you');
    const net = await page.$$eval('#chart-statement tr.total td', (tds) => tds.map((td) => td.textContent.trim()));
    check(name, 'Income statement net', net[net.length - 2], signedMoney(exp.incomeStatement.net));
  }
  if (exp.review) {
    // Next month's plan lives on Plan (S-106), not in Insights.
    await plan(page, 'plan');
    await page.waitForSelector('#sec-plan');
    // Review and plan: the live totals and the reading for the month reviewed.
    const rv = await page.$$eval('.review-top .tile', (ts) => ts.map((t) => t.querySelector('.value').textContent.trim()));
    check(name, 'Review plan total', rv[0], money(exp.review.plan));
    check(name, 'Review plan vs take-home', rv[1], signedMoney(exp.review.planLeft));
    check(name, 'Review frees up', rv[2], signedMoney(exp.review.frees));
    check(name, 'Review plan % of income', rv[3], pct(exp.review.planPctIncome));
    check(name, 'Review checklist', await page.$eval('.review-count', (b) => b.textContent), exp.review.checklist[0] + ' of ' + exp.review.checklist[1] + ' lines reviewed');
    check(name, 'Review reading', await page.$eval('[data-key="review-reading"]', (p) => p.textContent), exp.review.reading);
  }
  await insights(page, 'you');
  if (exp.stress) check(name, 'Stress reading', await page.$eval('#chart-stress .reading', (p) => p.textContent), exp.stress.reading);
  if (exp.draftt) {
    // DRAFTT is descriptive (S-072): the reading names proportions, never a verdict.
    const dr = await page.$eval('#chart-draftt .reading', (p) => p.textContent);
    check(name, 'DRAFTT reading', dr, exp.draftt.reading);
    const words = await page.$eval('#chart-draftt', (c) => c.textContent.toLowerCase());
    check(name, 'DRAFTT has no grades', /healthy|outside the|band|\(high\)|\(low\)/.test(words) ? 'graded' : 'none', 'none');
    const totalRow = await page.$$eval('#chart-draftt tr.cat td', (tds) => tds.map((td) => td.textContent.trim()));
    check(name, 'DRAFTT total % of base', totalRow[2], pct(exp.draftt.totalShare));
  }
  // Next stage and Eras are parked (S-105): no Future screen until the switch in Setup is on.
  check(name, 'No Future screen while parked', String(await page.$$eval('a[href="#future"]', (x) => x.length)), '0');
  await setup(page, 'future');
  await page.check('[data-key="future-tools"]');
  await go(page, 'future');
  await page.waitForSelector('#dream-entry');
  if (name === 'maya') {
    // Maya by hand (test/dreams.test.js): short-term dream spending 3,052, today 3,814, so 762 less; biggest
    // decreases Food (-410) and Personal and fun (-290). No long-term dreams, so long follows short (3,052)
    // and only the short-term sentence is said.
    // The pay this dream needs: 3,052 / (1 - 150 / 3,900) = 3,052 x 1.04 = 3,174.08; she brings home 3,900, 725.92 more.
    check(name, 'Pay this dream needs', await page.$eval('#dream-compare [data-key="dream-takes"]', (x) => x.textContent),
      'The pay this dream needs' +
      'Your short-term dream spends ' + money(3052) + ' a month. Today you save 4% of what you bring home. To spend ' + money(3052) + ' and still save 4%, you would need to bring home about ' + money(3174.08) + ' a month.' +
      'You bring home ' + money(3900) + ' now, ' + money(725.92) + ' more than it needs.');
  } else if (exp.dreamNone) check(name, 'No dream life yet', String(await page.$$eval('[data-key="dream-none"]', (x) => x.length)), '1');
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
  await page.waitForSelector('#first-session');
  await setup(page, 'accounts');
  await page.click('[data-key="add-acct-checking"]');
  const startBox = page.locator('#accounts-card input.amount').first();
  await startBox.fill('2500');
  await startBox.press('Tab');
  await page.waitForTimeout(100);
  check('loop', 'Cash start shown', await page.$eval('#accounts-card p.small b', (b) => b.textContent), money(2500));
  // Net worth (S-111): with only a checking start of 2,500 typed, both net worths are 2,500 and nothing is locked in.
  // Setup shows the one-line summary; the tiles live in Insights, Net worth (S-114).
  check('loop', 'Setup net worth line', await settled(page, '[data-key="nw-line-total"]', money(2500)), money(2500));
  await insights(page, 'networth');
  check('loop', 'Net worth (everything)', await settled(page, '[data-key="nw-total"] .value', money(2500)), money(2500));
  check('loop', 'FI net worth', await settled(page, '[data-key="nw-fi"] .value', money(2500)), money(2500));
  check('loop', 'Locked in', await settled(page, '[data-key="nw-locked"] .value', money(0)), money(0));
  // Next stage and Eras are parked (S-105): checked with Future tools on.
  await setup(page, 'future');
  await page.check('[data-key="future-tools"]');
  await go(page, 'future');
  await page.click('[data-key="future-tab-next"]');
  await page.waitForTimeout(100);
  const startNs = page.getByRole('button', { name: 'Plan a next stage' });
  if (await startNs.count()) await startNs.click();
  await page.waitForSelector('[data-key="cash-on-hand"]', { timeout: 3000 }).catch(() => null);
  const note = await page.$eval('[data-key="cash-on-hand"]', (p) => p.textContent).catch(() => 'missing');
  check('loop', 'Next stage reads cash from balances', note.includes(money(2500)) ? 'reads ' + money(2500) : note, 'reads ' + money(2500));
  // The third lens is Best case (S-097), in the order Disaster, Likely, Best case.
  check('loop', 'Next stage lenses', (await page.$$eval('table.lenses thead th', (ths) => ths.map((t) => t.textContent).filter(Boolean))).join(', '), 'Disaster, Likely, Best case');
  check('loop', 'No Dream on Next stage', String(await page.$eval('#main', (m) => [...m.children[0].children].filter((c) => !c.matches('.passes, p, h1')).some((c) => /dream/i.test(c.textContent)))), 'false');
  await page.click('[data-key="future-tab-eras"]');
  await page.waitForSelector('[data-key="cash-on-hand"]', { timeout: 3000 }).catch(() => null);
  const eraNote = await page.$eval('[data-key="cash-on-hand"]', (p) => p.textContent).catch(() => 'missing');
  check('loop', 'Eras reads cash from balances', eraNote.includes(money(2500)) ? 'reads ' + money(2500) : eraNote, 'reads ' + money(2500));

  // Quick entry from Today, then a bank file on Track that matches it (S-085).
  await go(page, 'today');
  await page.click('[data-key="open-quick-entry"]');
  await page.fill('[data-key="qe-amount"]', '54.20');
  await page.fill('[data-key="qe-search"]', 'groc');
  await page.click('[data-key="qe-line:groceries"]');
  await page.fill('[data-key="qe-merchant"]', "Trader Joe's");
  await page.fill('[data-key="qe-date"]', YM + '-03');
  await page.click('[data-key="qe-save"]');
  check('loop', 'Quick entry saved', await settled(page, '.toast', 'Logged $54.20 to Groceries'), 'Logged $54.20 to Groceries');
  await go(page, 'track');
  const mdy = (d) => YM.slice(5) + '/' + d + '/' + YM.slice(0, 4);
  await page.setInputFiles('#tx-file', { name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n' + mdy('04') + ',TRADER JOE S #552,-54.20\n' + mdy('05') + ',WHOLE FOODS MKT,-80.10\n') });
  await page.waitForSelector('[data-key="match-summary"]');
  check('loop', 'Import match summary', (await page.$eval('[data-key="match-summary"] b', (b) => b.textContent)), 'Matched 1, new 1, possible matches 0 to confirm.');
  await page.click('[data-key="tx-add"]');
  await page.waitForTimeout(150);
  // Latest first (S-109): Whole Foods on the 5th from the bank, then Trader Joe's (the bank's date, the 4th) merged with the quick entry.
  const srcs = await page.$$eval('#log-card li', (ls) => ls.map((l) => l.querySelector('b').textContent + ' (' + l.querySelector('.src-chip').textContent + ')'));
  check('loop', 'Log sources after merge', srcs.join('; '), 'WHOLE FOODS MKT (Bank); TRADER JOE S #552 (Bank, merged)');
  // Cash by day (S-086). By hand: checking starts at 2,500; Trader Joe's 54.20 and Whole Foods 80.10
  // are in the log; no income or plan yet. Today 2,500 - 54.20 - 80.10 = 2,365.70, also the lowest
  // point and safe to spend (no payday ahead).
  await go(page, 'today');
  await page.waitForSelector('#cash-strip');
  check('loop', 'Cash today', await page.$eval('[data-key="cash-today"]', (b) => b.textContent), money(2365.7));
  check('loop', 'Lowest point', await page.$eval('[data-key="cash-lowest"]', (b) => b.textContent), money(2365.7));
  check('loop', 'Safe to spend', await page.$eval('[data-key="safe-to-spend"]', (b) => b.textContent), money(2365.7));
  await go(page, 'track');
  await page.waitForSelector('#chart-cf-chart svg');
  check('loop', 'Calendar chart drawn', String(await page.$$eval('#chart-cf-chart svg path', (p) => p.length > 0)), 'true');
  check('loop', 'Month grid drawn', String(await page.$$eval('#chart-cf-grid td', (t) => t.length >= 28)), 'true');
  // Actuals from the log (S-087): groceries = 54.20 + 80.10 = 134.30, from 2 entries, not typed over.
  await go(page, 'review');
  // Filled categories are one row each until tapped (S-106).
  check('loop', 'Food summary row', await settled(page, '[data-key="rv-cat:food"]', '\u25b8 Food: ' + money(134.3) + ' from 2 entries'), '\u25b8 Food: ' + money(134.3) + ' from 2 entries');
  await page.click('[data-key="rv-cat:food"]');
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
  await insights(page, 'cash');
  await page.waitForSelector('#chart-bridge');
  check('bridge', 'Explained', await settled(page, '[data-key="bridge-explained"]', signedMoney(680)), signedMoney(680));
  check('bridge', 'Actual change', await settled(page, '[data-key="bridge-actual"]', signedMoney(620)), signedMoney(620));
  check('bridge', 'Not explained yet', await settled(page, '[data-key="bridge-unexplained"]', signedMoney(-60)), signedMoney(-60));
  check('bridge', 'Waterfall drawn', String(await page.$$eval('#chart-bridge svg rect', (r) => r.length >= 8)), 'true');
  // The loop (S-089). By hand: 10 entries (3 paychecks, 2 groceries, Geico, the card payment, ATM, the concert, the couch),
  // the yearly car insurance confirmed by its entry, every balance in (3 accounts x start and end), the bridge off by 60.
  await go(page, 'today');
  await page.waitForSelector('#loop-strip');
  check('loop strip', 'Review step', await settled(page, '[data-key="loop-review"] .small', '0 lines still empty, 6 of 6 balances in, bridge off by $60'), '0 lines still empty, 6 of 6 balances in, bridge off by $60');
  check('loop strip', 'Track step', await settled(page, '[data-key="loop-track"] .small', '10 entries, last Oct 28, scheduled 1 of 1 confirmed'), '10 entries, last Oct 28, scheduled 1 of 1 confirmed');
  page.on('dialog', (dl) => dl.accept());
  await go(page, 'review');
  await page.click('[data-key="open-checklist"]');
  await page.waitForSelector('#checklist');
  const want = "Closed with 3 open items: off by $60, 1 reimbursement owed, next month's plan not started";
  check('checklist', 'Summary', await settled(page, '[data-key="close-summary"]', want + '.'), want + '.');
  check('checklist', 'Close button', await settled(page, '[data-key="close-month"]', 'Close with 3 open items'), 'Close with 3 open items');
  await page.click('[data-key="close-month"]');
  await page.waitForSelector('#just-closed');
  check('review', 'Open at close', await settled(page, '#just-closed [data-key="review-open"]', want), want);
  check('review', 'Bridge tile', await settled(page, '#just-closed [data-key="review-bridge"]', 'Off by $60'), 'Off by $60');
  // 460 logged (groceries 400 + shopping 60) of 1,960 (+ rent 1,500 typed) = 23%
  check('review', 'Tracking', await settled(page, '#just-closed [data-key="review-tracking"]', '23% ($460 logged, $1,500 typed)'), '23% ($460 logged, $1,500 typed)');
  await insights(page, 'time');
  check('months', 'Estimate, plan, actual by month drawn', String(await page.$$eval('#chart-trend-series svg path', (p) => p.length > 0)), 'true');
  check('months', '80/20 reading', await settled(page, '#chart-pareto .reading', '50% of your entries (3 of 6) made up 80% of your spending.'), '50% of your entries (3 of 6) made up 80% of your spending.');
  check('months', '80/20 chart', String(await page.$$eval('#chart-pareto svg rect', (r) => r.length === 6)), 'true');
  // Trends (S-092): every card drawn, and two of the one-line stats by hand.
  await page.waitForSelector('#chart-trend-heat');
  for (const id of ['trend-series', 'trend-charges', 'trend-heat', 'trend-mom', 'trend-pacing', 'trend-dom']) check('trends', id + ' drawn', String(await page.$$eval('#chart-' + id + ' svg', (x) => x.length === 1)), 'true');
  check('trends', 'Card float', await page.$eval('#stat-float .reading', (p) => p.textContent), "Oct '26 charged $300, paid $450.");
  check('trends', 'Not explained yet', await page.$eval('#stat-unexplained .reading', (p) => p.textContent), '-$60 over 1 bridged month; ATM cash $60; Venmo or Zelle with no line $0.');
  await go(page, 'review');
  await page.waitForSelector('#months-review');
  check('months', 'Saved review shown', await settled(page, '#months-review [data-key="review-open"]', want), want);
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
  check('riley', 'Cash today', await settled(page, '[data-key="cash-today"]', money(3291.03)), money(3291.03));
  check('riley', 'Lowest point', await settled(page, '[data-key="cash-lowest"]', money(60)), money(60));
  // Safe to spend (S-095): the lowest point ahead is 60.00 on Nov 5, 40 under the 100 cushion, so $0 and a message.
  check('riley', 'Safe to spend', await settled(page, '[data-key="safe-to-spend"]', money(0)), money(0));
  check('riley', 'Shortfall message', await settled(page, '[data-key="safe-short"]', "Nothing safe to spend right now. You'll be $40 under your cushion on Nov 5."), "Nothing safe to spend right now. You'll be $40 under your cushion on Nov 5.");
  check('riley', 'Calendar reading', await page.$eval('[data-key="cash-reading"]', (p) => p.childNodes[0].textContent), 'Your lowest point is $60 on the 5th, the day before payday. Rent lands 5 days before the paycheck that covers it.');
  check('riley', 'Track step', await settled(page, '[data-key="loop-track"] .small', '12 entries, last Oct 15, scheduled 3 of 6 confirmed'), '12 entries, last Oct 15, scheduled 3 of 6 confirmed');
  // Past months are on Review; the bridge history and the 80/20 are in Insights (S-106).
  await go(page, 'review');
  await page.waitForSelector('#months-review');
  await page.selectOption('[data-key="months-pick"]', '2026-03');
  await page.waitForTimeout(150);
  check('riley', 'March review readings', await settled(page, '#months-review [data-key="review-readings"]', 'Food came in $136 under plan. Shopping was $57 over. Income came in $280 less than planned. 1.07x off this month, down from 1.09x.'), 'Food came in $136 under plan. Shopping was $57 over. Income came in $280 less than planned. 1.07x off this month, down from 1.09x.');
  check('riley', 'March bridge ties', await settled(page, '#months-review [data-key="review-bridge"]', 'Ties'), 'Ties');
  await insights(page, 'cash');
  await page.selectOption('[data-key="bridge-month"]', '2026-03');
  await page.waitForTimeout(150);
  check('riley', 'March bridge reading', await settled(page, '#chart-bridge .reading', 'Your budget showed $172 over, but cash went down $966. The car insurance bill ($960) came due this month.'), 'Your budget showed $172 over, but cash went down $966. The car insurance bill ($960) came due this month.');
  await insights(page, 'time');
  check('riley', 'March 80/20', await settled(page, '#chart-pareto .reading', '13% of your entries (3 of 23) made up 80% of your spending.'), '13% of your entries (3 of 23) made up 80% of your spending.');
  await page.click('[data-key="pareto-level-lines"]');
  await page.waitForTimeout(100);
  check('riley', 'March 80/20 lines', await settled(page, '#chart-pareto .reading', '4 lines, Rent, Car payment, Groceries, and Shopping, made up 80%.'), '4 lines, Rent, Car payment, Groceries, and Shopping, made up 80%.');
  await go(page, 'review');
  await page.selectOption('[data-key="months-pick"]', '2026-06');
  await page.waitForTimeout(150);
  check('riley', 'June open items', await settled(page, '#months-review [data-key="review-open"]', 'Closed with 2 open items: off by $60, 1 unmapped, 0 possible matches'), 'Closed with 2 open items: off by $60, 1 unmapped, 0 possible matches');
  await insights(page, 'cash');
  await page.selectOption('[data-key="bridge-month"]', '2026-06');
  await page.waitForTimeout(150);
  check('riley', 'June not explained', await settled(page, '#chart-bridge [data-key="bridge-unexplained"]', signedMoney(-60)), signedMoney(-60));
  // Net worth (S-115, by hand in test/networth-households.test.js). Today every balance is September's end:
  // FI 4,001.03 + 150 + 16,765 + 11,225 - 2,818.03 = 29,323; the car 8,400 - its loan 3,237.64 = 5,162.36
  // locked in; net worth 34,485.36.
  await insights(page, 'networth');
  check('riley', 'Net worth tile', await settled(page, '[data-key="nw-total"] .value', money(34485.36)), money(34485.36));
  check('riley', 'FI net worth tile', await settled(page, '[data-key="nw-fi"] .value', money(29323)), money(29323));
  check('riley', 'Locked in tile', await settled(page, '[data-key="nw-locked"] .value', money(5162.36)), money(5162.36));
  await page.selectOption('[data-key="nw-month"]', '2026-03');
  const marNW = 'Net worth rose $321. $342 more went out than came in, $415 the market added, $348 of debt paid down, $100 of value lost on things you own.';
  check('riley', 'March net worth bridge', await settled(page, '#chart-nw-bridge .reading', marNW), marNW);
  const carRead = 'The car costs about $316 a month you\'ll never get back (not counting maintenance, parking and tolls). Your trips by Uber, transit and a rental would be about $350.';
  check('riley', 'Car next to its alternative', await settled(page, '#owning-car .reading', carRead), carRead);
  // The auto loan is paid by the Car payment line (S-116, by hand in test/debts.test.js): October's 340,
  // on the loan going into October (September's end, 3,237.64): 16.19 interest, 323.81 principal.
  await setup(page, 'debts');
  check('riley', 'Loan minimum from its line', await settled(page, '[data-key="debt-min-from:debt-car"]', 'Minimum: $340 a month, the estimate on the Car payment line. Asked once, on the line.'), 'Minimum: $340 a month, the estimate on the Car payment line. Asked once, on the line.');
  check('riley', 'Loan payment split', await settled(page, '[data-key="debt-split:debt-car"]', 'This month: $340.00 paid, $16.19 interest (spent) and $323.81 principal (pays down the balance).'), 'This month: $340.00 paid, $16.19 interest (spent) and $323.81 principal (pays down the balance).');
  check('riley', 'Visa interest', await settled(page, '[data-key="debt-interest:debt-visa"]', 'Interest (computed) this month: $0.00. Paid in full each month: no interest. It is in Debt payments, never typed.'), 'Interest (computed) this month: $0.00. Paid in full each month: no interest. It is in Debt payments, never typed.');
  await insights(page, 'networth');
  check('riley', 'Net worth charts drawn', String(await page.$$eval('#chart-nw-time svg, #chart-nw-assets-debts svg, #chart-nw-mix svg, #chart-nw-bridge svg', (x) => x.length)), '4');
  await go(page, 'track');
  await page.waitForSelector('#chart-cf-paylater');
  check('riley', 'Pay-later flag', await page.$eval('#chart-cf-paylater li', (li) => li.querySelector('span').textContent + ' (' + li.querySelector('b').textContent + ')'), 'Rent is due Nov 1, paid Nov 6 (5 days)');
  check('riley', 'cf-chart drawn', String(await page.$$eval('#chart-cf-chart svg', (x) => x.length >= 1)), 'true');
  await insights(page, 'cash');
  check('riley', 'bridge drawn', String(await page.$$eval('#chart-bridge svg', (x) => x.length >= 1)), 'true');
  await insights(page, 'time');
  for (const id of ['trend-series', 'trend-heat', 'trend-mom', 'trend-pacing', 'trend-dom']) check('riley', id + ' drawn', String(await page.$$eval('#chart-' + id + ' svg', (x) => x.length >= 1)), 'true');
  check('riley', 'Console errors', String(errors.length), '0');
  await page.close();
}
// Health coverage in one place (S-117): answered once in Setup; Review shows the one-line summary.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '#clients');
  console.log('coverage (phone width)');
  await page.fill('[data-key="new-client"]', 'Coverage check');
  await page.press('[data-key="new-client"]', 'Enter');
  await page.waitForSelector('#first-session');
  await setup(page, 'coverage');
  await page.selectOption('[data-key="coverage-how"]', 'marketplace');
  await page.selectOption('[data-key="coverage-premium-from"]', 'direct');
  const box = page.locator('[data-path=\'["coverage","premium"]\']');
  await box.fill('320');
  await box.press('Tab');
  const want = 'Marketplace or ACA. Premium $320 a month, paid directly.';
  check('coverage', 'Summary in Setup', await settled(page, '[data-key="coverage-line"]', want), want);
  // Review, Health: the premium line is the summary, not a question.
  await go(page, 'review');
  await page.click('[data-key="rv-cat:health"]');
  check('coverage', 'Summary in Review', await settled(page, '[data-key="coverage-summary-rv:premiums-text"]', want), want);
  check('coverage', 'No premium question in Review', String(await page.$$eval('[data-path=\'["line","premiums","actual"]\']', (x) => x.length)), '0');
  check('coverage', 'Console errors', String(errors.length), '0');
  await page.close();
}
// Dana (S-115): a condo with a mortgage, at phone width on October 17, 2026. By hand in test/networth-households.test.js.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '#clients');
  console.log('dana (phone width, October 17, 2026)');
  await page.getByText('Dana, 34').click();
  await page.waitForSelector('#headline');
  // Today: September's ends. FI 2,315 + 4,800 + 11,170 - 10,720 = 7,565; net worth 74,332.79.
  await insights(page, 'networth');
  check('dana', 'Net worth tile', await settled(page, '[data-key="nw-total"] .value', money(74332.79)), money(74332.79));
  check('dana', 'FI net worth tile', await settled(page, '[data-key="nw-fi"] .value', money(7565)), money(7565));
  check('dana', 'Milestones', await settled(page, '[data-key="nw-milestone-list"]', 'FI net worth crossed $0March 2026'), 'FI net worth crossed $0March 2026');
  const condoRead = 'Owning costs you about $1,950 a month you\'ll never get back. Renting a similar place would be about $1,900.';
  check('dana', 'Condo next to renting', await settled(page, '#owning-condo .reading', condoRead), condoRead);
  await page.selectOption('[data-key="nw-month"]', '2026-02');
  check('dana', 'February not explained', await settled(page, '#chart-nw-bridge [data-key="nwb-unexplained"]', signedMoney(-85)), signedMoney(-85));
  // March's review: both net worths and the card for FI net worth crossing $0.
  await go(page, 'review');
  await page.waitForSelector('#months-review');
  await page.selectOption('[data-key="months-pick"]', '2026-03');
  check('dana', 'March celebrate card', await settled(page, '[data-key="celebrate-fi-zero"] b', 'FI net worth crossed $0 in March 2026.'), 'FI net worth crossed $0 in March 2026.');
  check('dana', 'March FI net worth', await settled(page, '[data-key="review-nw-fi"]', money(425)), money(425));
  check('dana', 'March net worth', await settled(page, '[data-key="review-nw-total"]', money(64262.76)), money(64262.76));
  check('dana', 'Console errors', String(errors.length), '0');
  await page.close();
}
// Jump to source, search, and the breadcrumb (S-108), on Riley at phone width.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '#clients');
  console.log('search and sources (phone width)');
  await page.getByText('Riley, 31').click();
  await page.waitForSelector('#headline');
  // "/" opens search; "groceries" finds the line; Enter opens it on Review with Food open.
  await page.keyboard.press('/');
  await page.keyboard.type('groceries');
  check('search', 'First result', await settled(page, '.search-hit', 'GroceriesFood'), 'GroceriesFood');
  await page.keyboard.press('Enter');
  check('search', 'Breadcrumb', await settled(page, '[data-key="crumbs"]', 'Riley > Review > October 2026 > Groceries'), 'Riley > Review > October 2026 > Groceries');
  check('search', 'Food opened', await page.$eval('[data-key="rv-cat:food"]', (b) => b.getAttribute('aria-expanded')), 'true');
  // Parked tools stay out of search while Future tools are off.
  await page.fill('[data-key="search"]', 'eras');
  await page.waitForTimeout(150);
  check('search', 'No parked results', String(await page.$$eval('.search-head', (hs) => hs.some((x) => x.textContent === 'Future'))), 'false');
  // A net worth number (S-114): "fi net" finds FI net worth; Enter opens how it was worked out.
  await page.fill('[data-key="search"]', 'fi net');
  check('search', 'FI net worth found', await settled(page, '.search-head', 'Net worth'), 'Net worth');
  await page.press('[data-key="search"]', 'Enter');
  await page.waitForSelector('#nw-tiles #how-panel', { timeout: 3000 }).catch(() => null);
  check('search', 'FI net worth panel matches the tile', await page.$eval('[data-key="how-result"]', (b) => b.textContent.replace(/\.\d\d$/, '')).catch(() => 'missing'), await page.$eval('[data-key="nw-fi"] .value button', (b) => b.textContent).catch(() => 'missing tile'));
  // How a computed number was worked out: the panel ends on the same number as the tile.
  await go(page, 'today');
  await page.waitForSelector('[data-key="how:surplus"]');
  const surplusTile = await page.$eval('[data-key="how:surplus"]', (b) => b.textContent);
  await page.click('[data-key="how:surplus"]');
  await page.waitForSelector('#how-panel');
  check('sources', 'Surplus panel matches the tile', (await page.$eval('[data-key="how-result"]', (b) => b.textContent)).replace(/\.\d\d$/, ''), surplusTile.replace(/\.\d\d$/, ''));
  // Safe to spend (S-095 by hand): 0, because the lowest point (60) is 40 under the 100 cushion.
  await page.click('[data-key="how:safeToSpend"]');
  check('sources', 'Safe to spend panel', await settled(page, '[data-key="how-result"]', money(0, true)), money(0, true));
  // A number in the Insights table opens its source: Food's actual opens its row on Review.
  await insights(page, 'compared');
  await page.locator('tr.cat', { hasText: 'Food' }).locator('td:not(.wide) a.src-link').first().click();
  await page.waitForSelector('[data-key="rv-cat:food"][aria-expanded="true"]', { timeout: 3000 }).catch(() => null);
  check('sources', 'Food actual opens Review', String(await page.$$eval('[data-key="rv-cat:food"][aria-expanded="true"]', (x) => x.length)), '1');
  check('search', 'Console errors', String(errors.length), '0');
  await page.close();
}
// View as client and the merge conflict screen (S-096), on Riley at phone width.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '#clients');
  console.log('view as client and merge (phone width)');
  await page.getByText('Riley, 31').click();
  await page.waitForSelector('#cash-strip');
  // The coach writes a note, tags Shopping as a mistake (not shared), and sees the coach-only settings.
  await setup(page, 'notes');
  await page.fill('[data-key="coach-notes"]', 'Ask about the Visa.');
  await page.press('[data-key="coach-notes"]', 'Tab');
  await page.waitForTimeout(150);
  await setup(page, 'coach');
  check('client view', 'Coach sees the cushion', String(await page.$$eval('[data-key="cushion-row"]', (x) => x.length)), '1');
  check('client view', 'Coach sees materiality', String(await page.$$eval('[data-key="materiality"]', (x) => x.length)), '1');
  await go(page, 'review');
  await page.waitForSelector('#mistakes');
  await page.check('[data-key="mistake:shopping"]');
  await page.waitForSelector('[data-key="mistake-share:shopping"]');
  check('client view', 'Coach sees the mistake tag', String(await page.isChecked('[data-key="mistake:shopping"]')), 'true');
  // View as client: every coach-only thing is hidden, coach wording swapped.
  await page.click('[data-key="view-as-client"]');
  await page.waitForTimeout(150);
  check('client view', 'Toggle wording', (await page.$eval('[data-key="view-as-client"]', (b) => b.textContent)), 'Back to the coach view');
  check('client view', 'No Clients link', String(await page.$$eval('a[href="#clients"], [data-key="client-name"]', (x) => x.length)), '0');
  await page.click('[data-key="more"]');
  check('client view', 'No Clients in More', String(await page.$$eval('.more-menu a[href="#clients"]', (x) => x.length)), '0');
  await page.click('[data-key="more"]');
  check('client view', 'Mistake tag hidden', String(await page.isChecked('[data-key="mistake:shopping"]')), 'false');
  check('client view', 'No share box', String(await page.$$eval('[data-key="mistake-share:shopping"]', (x) => x.length)), '0');
  await insights(page, 'compared');
  check('client view', 'Completion wording', String((await page.$eval('#chart-completion .reading', (p) => p.textContent)).endsWith('not how you are doing.')), 'true');
  await setup(page, 'notes');
  check('client view', 'No coach notes', String(await page.$$eval('[data-key="coach-notes"]', (x) => x.length)), '0');
  await setup(page, 'coach');
  check('client view', 'No cushion input', String(await page.$$eval('[data-key="cushion-row"]', (x) => x.length)), '0');
  check('client view', 'No materiality', String(await page.$$eval('[data-key="materiality"]', (x) => x.length)), '0');
  await go(page, 'today');
  await page.waitForSelector('#cash-strip');
  // The calendar still uses the cushion: the same $0 and message as the coach sees.
  check('client view', 'Safe to spend', await page.$eval('[data-key="safe-to-spend"]', (b) => b.textContent), money(0));
  await page.click('[data-key="view-as-client"]');
  await page.waitForTimeout(150);
  check('client view', 'Back to coach', (await page.$eval('[data-key="view-as-client"]', (b) => b.textContent)), 'View as client');
  // A file from Riley's copy, shared before the coach's edit, where Riley set the Shopping estimate to 80:
  // Shopping was changed on both copies, so the coach picks.
  const { migrate } = await import('../src/store/migrate.js');
  const { versionsOf } = await import('../src/store/merge.js');
  const { exportHousehold } = await import('../src/store/transfer.js');
  const { readFileSync } = await import('node:fs');
  const theirs = migrate(JSON.parse(readFileSync(new globalThis.URL('../test/households/riley.json', import.meta.url), 'utf8')));
  theirs.sync = { versions: versionsOf(theirs), at: '2026-10-17T18:00:00.000Z' };
  const shop = theirs.categories.flatMap((c) => c.lines).find((l) => l.id === 'shopping');
  Object.assign(shop, { estimate: { ...shop.estimate, amount: 80, status: 'known' }, updatedAt: '2026-10-17T19:00:00.000Z', updatedBy: 'client', version: (shop.version || 1) + 1 });
  await page.click('[data-key="client-name"]');
  await page.click('[data-key="menu-clients"]');
  await page.setInputFiles('#import-file', { name: 'riley.json', mimeType: 'application/json', buffer: Buffer.from(exportHousehold(theirs, '2026-10-17T19:00:00.000Z')) });
  await page.waitForSelector('#merge-conflicts');
  check('merge', 'Conflict heading', await page.$eval('#merge-conflicts h2', (x) => x.textContent), 'Merging Riley (demo, a year of the loop): 1 to pick');
  const mine = await page.$eval('[data-key="side:local:line:shopping"]', (x) => x.textContent);
  const file = await page.$eval('[data-key="side:incoming:line:shopping"]', (x) => x.textContent);
  check('merge', 'This copy', String(/^This copy: Shopping, .*tag mistake.* \(coach, /.test(mine)), 'true');
  check('merge', 'The file', String(/^The file: Shopping, .*estimate \$80.* \(client, /.test(file)), 'true');
  await page.check('[data-key="pick:incoming:line:shopping"]');
  await page.click('[data-key="finish-merge"]');
  await page.waitForSelector('#cash-strip');
  await go(page, 'review');
  await page.waitForSelector('#mistakes');
  check('merge', 'Picked the file', String(await page.isChecked('[data-key="mistake:shopping"]')), 'false');
  check('merge', 'Console errors', String(errors.length), '0');
  await page.close();
}
// The layout check runs with the screen check (S-109): heights, one copy of each heading, read-only Insights, no setup on Track.
console.log('layout (phone width)');
const { layoutCheck } = await import('./layout-check.mjs');
failures += (await layoutCheck(browser, URL)).failures;
await browser.close();
console.log(failures ? failures + ' FAILED' : 'All screen numbers match the expected files.');
process.exit(failures ? 1 : 0);
