// Journey tests (S-109): how easy SLAM is to use, measured in taps. Three
// journeys, each on a phone (390 x 844) and a desktop (1280 x 900):
//   a. First session (under 60 taps): new client, gut, basics, one income, rent,
//      rough estimates for every category, one account, then Today.
//   b. A month (under 120 taps, each quick entry 6 or fewer): make the plan, 20
//      quick entries, confirm 3 scheduled items, import a CSV that matches 5 of
//      them, enter balances, fill 2 gaps, open the checklist, close, read the review.
//   c. Six questions from Today, each with a tap limit (the sixth: FI net worth, in 2).
//   d. Month-end balances for 5 accounts (under 20 taps), on Riley.
// Each journey reports taps per step and fails if a number is wrong or a limit is passed.
//
// What counts as a tap: a click or touch on the screen (a link, button, chip, checkbox,
// or a text box to put the cursor in). A dropdown is 2 taps (open it, pick). Typing and
// the keyboard's own keys (Tab, Enter) are not taps; a phone keyboard has them too.
//
// Run from the repo root, with the slam folder served:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/journeys.mjs

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { money, signedMoney, pct } from '../src/ui/format.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const URL = process.env.SLAM_URL || 'http://localhost:8765/clients.html';
const VIEWS = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]];
let failures = 0;
const results = [];

function counter(page, phone) {
  const t = { n: 0, steps: [], at: 0 };
  t.tap = async (sel) => { await page.click(sel); t.n += 1; };
  t.type = async (sel, text) => { await t.tap(sel); await page.keyboard.type(text); await page.keyboard.press('Tab'); await page.waitForTimeout(60); };
  t.pick = async (sel, value) => { await page.selectOption(sel, value); t.n += 2; await page.waitForTimeout(60); };
  // A screen from the menu: one tap, or two on a phone for what sits under More.
  t.go = async (screen) => {
    const direct = phone ? '.bottom-bar > a[href="#' + screen + '"]' : 'header nav a[href="#' + screen + '"]';
    if (await page.locator(direct).count()) return t.tap(direct);
    await t.tap('[data-key="more"]');
    await t.tap('.more-menu a[data-nav="' + screen + '"]');
  };
  t.step = (name, limit) => { t.steps.push({ name, taps: t.n - t.at, limit: limit === undefined ? null : limit }); t.at = t.n; };
  return t;
}

function check(journey, label, shown, expected) {
  const ok = shown === expected;
  if (!ok) failures += 1;
  console.log((ok ? '  ok   ' : '  FAIL ') + journey + ', ' + label + ': shown "' + shown + '", expected "' + expected + '"');
}

// Quick entry puts the cursor in the amount by itself; wait for it before typing.
const amountReady = (page) => page.waitForFunction(() => document.activeElement && document.activeElement.getAttribute('data-key') === 'qe-amount');
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => 'missing');
async function settled(page, sel, want) {
  await page.waitForFunction(([q, w]) => { const e = document.querySelector(q); return e && e.textContent.trim() === w; }, [sel, want], { timeout: 3000 }).catch(() => null);
  return text(page, sel);
}

function report(journey, view, t, limit) {
  console.log('\n' + journey + ' (' + view + '): ' + t.n + ' taps' + (limit ? ' (limit ' + limit + ')' : ''));
  for (const s of t.steps) {
    const over = s.limit !== null && s.taps > s.limit;
    if (over) failures += 1;
    console.log('  ' + (over ? 'FAIL ' : '     ') + s.name.padEnd(46) + String(s.taps).padStart(4) + (s.limit !== null ? ' (limit ' + s.limit + ')' : ''));
  }
  if (limit && t.n >= limit) { failures += 1; console.log('  FAIL total ' + t.n + ' is not under ' + limit); }
  results.push({ journey, view, total: t.n, limit, steps: t.steps });
}

// a. First session. By hand: take-home 1,200 a paycheck, every two weeks = 1,200 x 26 / 12 = 2,600 a month,
// typed in Your estimates (S-123). Estimates a month: Housing (the rent) 1,000, Food 400, Transportation 150,
// Health 100, Bills 80, Personal and fun 200, Annual 50, Giving 20 = spending 2,000. No Fees (S-123).
// Surplus first, then allocate (S-132): surplus 2,600 - 2,000 = 600, none of it allocated yet, so the
// savings rate (what is put into savings) is 0 / 2,600 = 0%. October is open, so Today shows so far and expected by month end (S-128) instead of one
// surplus: nothing is logged, so so far is 0 - 0 = 0. The paycheck has no pay date yet, so none is
// scheduled, and no bill has a due day; the rest of the plan is every estimate, 2,000 (the month's plan is
// not started, so the estimates stand in). Expected 0 + 0 - 0 - 2,000 = -2,000. Checking starts at 2,500.
async function firstSession(browser, view, size) {
  const page = await browser.newPage({ viewport: size });
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
  await page.goto(URL + '#clients');
  const t = counter(page, view === 'phone');
  const J = 'a. First session, ' + view;
  await t.type('[data-key="new-client"]', 'Journey');
  await page.keyboard.press('Enter').catch(() => null);
  await page.waitForSelector('#first-session');
  t.step('New client');
  await t.tap('[data-key="first-go-gut"]');
  await t.type('[data-path=\'["gut"]\']', '3000');
  t.step('Gut number');
  await t.go('today');
  await t.tap('[data-key="first-go-basics"]');
  await t.type('[data-path=\'["profile","birthYear"]\']', '1996');
  await t.pick('[data-key="profile-state"]', 'OH');
  await t.pick('[data-key="living-with"]', 'alone');
  await t.tap('[data-key="sit-employed"]');
  t.step('Basics');
  await t.go('today');
  await t.tap('[data-key="first-go-income"]');
  await t.tap('[data-key="est-add-income"]');
  await page.waitForSelector('#sec-income input.amount');
  await t.type('#sec-income input.amount', '1200');
  t.step('One income (take-home a paycheck, in Your estimates)');
  await t.go('today');
  await t.tap('[data-key="first-go-rough"]');
  await t.type('[data-path=\'["categories","housing","estimate"]\']', '1000');
  t.step('Rent (the Housing estimate)');
  for (const [id, a] of [['food', 400], ['transport', 150], ['health', 100], ['bills', 80], ['fun', 200], ['annual', 50], ['giving', 20]]) {
    await t.type('[data-path=\'["categories","' + id + '","estimate"]\']', String(a));
  }
  t.step('Rough estimates, the other 7 categories');
  await t.go('today');
  await t.tap('[data-key="first-go-accounts"]');
  await t.tap('[data-key="add-acct-checking"]');
  await page.waitForSelector('#cash-card input.amount');
  await t.type('#cash-card input.amount', '2500');
  t.step('One account (checking and its balance)');
  await t.go('today');
  await page.waitForSelector('#headline');
  t.step('See Today');
  check(J, 'First session done', String(await page.$$eval('#first-session', (x) => x.length)), '0');
  check(J, 'Take-home', await text(page, '[data-key="how:takeHome"]'), money(2600));
  check(J, 'Spending', await text(page, '[data-key="how:spending"]'), money(2000));
  // So far and expected by month end moved to SLAM's Spending page with the Budget calendar (S-209).
  check(J, 'Surplus tile', String(await page.$$eval('[data-key="how:surplus"]', (x) => x.length)), '1');
  check(J, 'Savings rate', await text(page, '[data-key="how:savingsRate"]'), pct(0));
  // Cash today moved to SLAM with the calendar (S-209): Today links there.
  check(J, 'Calendar link', await page.$eval('[data-key="slam-calendar"]', (a) => a.getAttribute('href')), 'calendar.html');
  report('a. First session', view, t, 60);
  await page.close();
}

// The household for a month, as an export file: October 2026, the 31st. Job pays 4,000 a month
// on the 1st; rent 1,500 due the 1st; Bills and subscriptions 60 due the 10th; groceries 400,
// eating out 100, gas 200, utilities 120, internet 70 a month; checking starts at 3,000.
// Everything else does not apply; no debts.
async function monthDoc() {
  const { newHousehold, makeDate } = await import('../src/store/schema.js');
  const { makeValue } = await import('../src/store/value.js');
  const { addAccount, setBalance } = await import('../src/store/accounts.js');
  const { findLine } = await import('../src/store/edits.js');
  const { migrate } = await import('../src/store/migrate.js');
  const { exportHousehold } = await import('../src/store/transfer.js');
  const raw = newHousehold('Month journey');
  raw.currentMonth = '2026-10';
  raw.income.push({ id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: makeValue(4000), gross: makeValue(), deductions: [], state: 'active' });
  const d = migrate(raw);
  d.income[0].nextPayDate = makeDate('2026-10-01');
  d.gut = makeValue(2500);
  Object.assign(d.profile, { birthYear: 1994, state: 'OH' });
  d.situation = ['employed'];
  d.household.livingWith = 'alone';
  d.noDebts = true;
  for (const c of d.categories) if (!['housing', 'food', 'transport', 'bills', 'debt'].includes(c.id)) c.estimate = makeValue(null, { status: 'not-for-me' });
  const one = (a) => makeValue(a, { cadence: 'one-off' });
  for (const [id, a, due] of [['rent', 1500, 1], ['subscriptions', 60, 10], ['groceries', 400], ['eating-out', 100], ['gas', 200], ['utilities', 120], ['internet', 70]]) {
    const l = findLine(d, id).line;
    l.estimate = makeValue(a);
    if (due) l.dueDay = one(due);
  }
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  setBalance(d, '2026-10', 'chk', 'start', one(3000));
  return exportHousehold(d, '2026-10-31T00:00:00Z');
}

// b. A month, by hand. 20 quick entries: groceries 52.10 + 47.35 + 61.80 + 44.20 + 39.90 + 55.15 + 48.60 + 50.40 = 399.50;
// eating out 14.60 + 12.25 + 18.40 + 9.75 + 16.30 + 21.10 = 92.40; gas 38.25 + 41.50 + 35.80 + 33.45 + 29.90 + 22.10 = 201.00.
// Three more quick entries (the Budget's "It happened" retired with its calendar, S-209): paycheck 4,000, rent 1,500, bills 60. The bank file has 5 of the entries (52.10, 47.35, 61.80, 38.25, 14.60)
// a day earlier: matched 5, new 0. Utilities and internet: none this month.
// Spent: 399.50 + 92.40 + 201.00 + 1,500 + 60 = 2,252.90. Surplus: 4,000 - 2,252.90 = +1,747.10.
// Checking: 3,000 + 4,000 - 1,500 - 60 - (399.50 + 92.40 + 201.00) = 4,747.10, typed as the end balance, so the bridge ties.
// All of it came from the log: 100% ($2,253 logged, $0 typed). November's plan is started, so nothing is open.
const ENTRIES = [
  ['groceries', '52.10'], ['groceries', '47.35'], ['groceries', '61.80'], ['groceries', '44.20'], ['groceries', '39.90'], ['groceries', '55.15'], ['groceries', '48.60'], ['groceries', '50.40'],
  ['eating-out', '14.60'], ['eating-out', '12.25'], ['eating-out', '18.40'], ['eating-out', '9.75'], ['eating-out', '16.30'], ['eating-out', '21.10'],
  ['gas', '38.25'], ['gas', '41.50'], ['gas', '35.80'], ['gas', '33.45'], ['gas', '29.90'], ['gas', '22.10']
];
const CSV = 'Date,Description,Amount\n10/30/2026,TRADER JOE S #552,-52.10\n10/30/2026,SAFEWAY 0412,-47.35\n10/30/2026,WHOLE FOODS MKT,-61.80\n10/30/2026,SHELL OIL 5744,-38.25\n10/30/2026,CHIPOTLE 1234,-14.60\n';

async function month(browser, view, size) {
  const page = await browser.newPage({ viewport: size });
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00'));
  page.on('dialog', (dl) => dl.accept());
  await page.goto(URL + '#clients');
  await page.setInputFiles('#import-file', { name: 'month.json', mimeType: 'application/json', buffer: Buffer.from(await monthDoc()) });
  await page.waitForSelector('#headline');
  const t = counter(page, view === 'phone');
  const J = 'b. A month, ' + view;
  await t.go('plan');
  await t.tap('[data-key="plan-view-plan"]');
  await t.tap('[data-key="plan-start:estimates"]');
  await page.waitForSelector('.review-count');
  t.step('Make the plan (November, from the estimates)');
  await t.go('track');
  let most = 0;
  for (const [line, amount] of ENTRIES) {
    const before = t.n;
    await t.tap('[data-key="open-quick-entry"]');
    await amountReady(page);
    await page.keyboard.type(amount);
    if (!(await page.locator('[data-key="qe-line:' + line + '"]').count())) {
      await t.tap('[data-key="qe-search"]');
      await page.keyboard.type(line === 'eating-out' ? 'eating' : line);
    }
    await t.tap('[data-key="qe-line:' + line + '"]');
    await t.tap('[data-key="qe-save"]');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    most = Math.max(most, t.n - before);
  }
  t.step('20 quick entries (most taps for one: ' + most + ')');
  if (most > 6) { failures += 1; console.log('  FAIL a quick entry took ' + most + ' taps (limit 6)'); }
  // The scheduled items' "It happened" went with the Budget calendar (S-209): the paycheck, rent and the
  // phone bill are three quick entries here (in SLAM they are "It happened" on the calendar).
  for (const [kind, line, amount] of [['income', 'job', '4000'], ['spend', 'rent', '1500'], ['spend', 'subscriptions', '60']]) {
    await t.tap('[data-key="open-quick-entry"]');
    await amountReady(page);
    // The sheet redraws on the next frame: wait for it before typing, so the amount and the income chips are the redrawn ones.
    if (kind === 'income') { await t.tap('[data-key="qe-kind:income"]'); await page.waitForSelector('[data-key="qe-kind:income"][aria-pressed="true"]'); }
    await page.locator('[data-key="qe-amount"]').fill(amount); t.n += 1;
    if (!(await page.locator('[data-key="qe-line:' + line + '"]').count())) { await t.tap('[data-key="qe-search"]'); await page.keyboard.type(line === 'subscriptions' ? 'bills' : line); }
    await t.tap('[data-key="qe-line:' + line + '"]');
    await t.tap('[data-key="qe-save"]');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
  }
  t.step('Log the paycheck, rent and the phone bill (3 quick entries)');
  await page.setInputFiles('#tx-file', { name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  t.n += 2; // tap "Choose CSV file", pick the file
  await page.waitForSelector('[data-key="match-summary"]');
  check(J, 'Import', await text(page, '[data-key="match-summary"] b'), 'Matched 5, new 0, possible matches 0 to confirm.');
  await t.tap('[data-key="tx-add"]');
  t.step('Import a CSV that matches 5 entries');
  await t.go('accounts');
  await page.waitForSelector('#cash-card');
  // The Accounts step folds once every cash balance is up to date (S-136): Review opens it.
  if (await page.locator('[data-key="accounts-review"]').count()) await t.tap('[data-key="accounts-review"]');
  await t.type('[data-path=\'["balances","2026-10","chk","end"]\']', '4747.10');
  t.step('Enter balances (checking at month end)');
  await t.go('review');
  await t.tap('[data-key="none:utilities"]');
  await page.waitForSelector('[data-key="none:internet"]');
  await t.tap('[data-key="none:internet"]');
  t.step('Fill 2 gaps (none this month)');
  await t.tap('[data-key="open-checklist"]');
  await page.waitForSelector('#checklist');
  check(J, 'Checklist', await text(page, '[data-key="close-summary"]'), 'Closed with nothing open.');
  t.step('Open the checklist');
  await t.tap('[data-key="close-month"]');
  t.n += 1; // the "Close October 2026?" confirm
  await page.waitForSelector('#just-closed');
  t.step('Close the month');
  const tiles = await page.$$eval('#just-closed .tile', (ts) => ts.map((x) => x.querySelector('.value').textContent.trim()));
  check(J, 'Spent', tiles[0], money(2252.9));
  check(J, 'Surplus', tiles[1], signedMoney(1747.1));
  check(J, 'Bridge', tiles[2], 'Ties');
  // The headline numbers first (S-129); "See the full review" opens the rest.
  await t.tap('#just-closed [data-key="review-full"]');
  await page.waitForSelector('#just-closed [data-key="review-tracking"]');
  check(J, 'Tracking', await text(page, '#just-closed [data-key="review-tracking"]'), '100% (' + money(2252.9) + ' logged, ' + money(0) + ' typed)');
  check(J, 'Open at close', await text(page, '#just-closed [data-key="review-open"]'), 'Closed with nothing open');
  t.step('Read the review');
  report('b. A month', view, t, 120);
  await page.close();
}

// c. Six questions from Today, on Riley (October 17, 2026; numbers by hand in test/riley.test.js).
async function questions(browser, view, size) {
  const page = await browser.newPage({ viewport: size });
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
  await page.goto(URL + '#clients');
  await page.getByText('Riley, 31').click();
  await page.waitForSelector('#headline');
  const t = counter(page, view === 'phone');
  const J = 'c. Six questions, ' + view;
  const home = async () => { await page.evaluate(() => { location.hash = 'today'; }); await page.waitForSelector('#headline'); t.at = t.n; };

  // 1. Log a $12 lunch.
  await t.tap('[data-key="open-quick-entry"]');
  await amountReady(page);
  await page.keyboard.type('12');
  if (!(await page.locator('[data-key="qe-line:eating-out"]').count())) { await t.tap('[data-key="qe-search"]'); await page.keyboard.type('eating'); }
  await t.tap('[data-key="qe-line:eating-out"]');
  await t.tap('[data-key="qe-save"]');
  check(J, 'Lunch logged', await settled(page, '.toast', 'Logged $12.00 to Eating out'), 'Logged $12.00 to Eating out');
  t.step('Log a $12 lunch', 6);
  await home();

  // 2. Safe to spend moved to SLAM with the calendar (S-209): Today links to the Spending page, one tap.
  check(J, 'Spending link', await page.$eval('[data-key="slam-spending"]', (a) => a.getAttribute('href')), 'spending.html');
  t.step('Safe to spend (a link to SLAM)', 0);

  // 3. Why cash dropped last month: September's bridge. September ended with checking 4,001.03 and
  // savings 150 = 4,151.03 (test/riley.test.js); explained + not explained = the actual change.
  await t.go('insights');
  await t.tap('[data-key="tab-cash"]');
  await page.waitForSelector('#chart-bridge');
  check(J, 'Bridge month', await text(page, '#chart-bridge h3'), 'Budget to cash, September 2026');
  const cashLine = await page.$eval('#chart-bridge [data-key="bridge-steps"]', (u) => u.textContent);
  check(J, 'September ends at', String(/to \$4,151/.test(cashLine)), 'true');
  const num = async (k) => Number((await text(page, '[data-key="' + k + '"]')).replace(/[$,+]/g, ''));
  const [ex, un, ac] = [await num('bridge-explained'), await num('bridge-unexplained'), await num('bridge-actual')];
  check(J, 'Explained + not explained = actual', String(Math.abs(ex + un - ac) <= 1), 'true');
  t.step('Why cash dropped last month (the bridge)', 3);
  await home();

  // 4. What went over plan last month: September's saved review, its "Worse than planned" list.
  await t.go('review');
  await page.waitForSelector('#months-review');
  check(J, 'Review month', await text(page, '#months-review h2'), 'September 2026 in review');
  await t.tap('#months-review [data-key="review-full"]');
  await page.waitForSelector('#months-review [data-key="review-vs-plan"]');
  const worse = await page.$$eval('#months-review [data-key="review-vs-plan"] > div:last-child h4', (x) => x.map((e) => e.textContent));
  check(J, 'Worse than planned shown', String(/^Worse than planned \(\d+\)$/.test(worse[0] || '')), 'true');
  t.step('What went over plan last month', 3);
  await home();

  // 5. Close the month: open the checklist.
  await t.go('review');
  await t.tap('[data-key="open-checklist"]');
  await page.waitForSelector('#checklist');
  check(J, 'Checklist open', String(await page.$$eval('#checklist', (x) => x.length)), '1');
  t.step('Close the month (open the checklist)', 3);
  await home();

  // 6. What's my FI net worth (S-115): Insights, Net worth (under More on a phone). Today it is
  // September's ends: 4,001.03 + 150 + 16,765 + 11,225 - 2,818.03 = 29,323 (test/networth-households.test.js).
  if (view === 'phone') { await t.tap('[data-key="more"]'); await t.tap('.more-menu a[data-nav="insights:networth"]'); }
  else { await t.go('insights'); await t.tap('[data-key="tab-networth"]'); }
  check(J, 'FI net worth', await settled(page, '[data-key="nw-fi"] .value', money(29323)), money(29323));
  t.step('What\'s my FI net worth', 2);
  report('c. Six questions', view, t, null);
  await page.close();
}

// d. Month-end balances for 5 accounts, on Riley: October's ends for checking, savings, the Visa, the
// 401(k), and the Roth IRA, in Setup, Accounts (the Visa in Setup, Credit and debt). Then (not counted) October's net worth bridge shows them:
// 3,000 + 400 + 17,100 + 11,300 + the car 8,400 (September's value) + paid ahead at October's end (S-119:
// insurance 960 - 8 x 80 = 320, registration 180 - 4 x 15 = 120) - 300 - the loan 3,237.64 = 37,102.36;
// FI 3,000 + 400 + 17,100 + 11,300 - 300 = 31,500.
async function balances(browser, view, size) {
  const page = await browser.newPage({ viewport: size });
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00'));
  await page.goto(URL + '#clients');
  await page.getByText('Riley, 31').click();
  await page.waitForSelector('#headline');
  const t = counter(page, view === 'phone');
  const J = 'd. Month-end balances, ' + view;
  // Cash on the Accounts tab (S-136): September's readings are 31 days old on October 31, so the step is open.
  await t.go('accounts');
  await page.waitForSelector('#cash-card');
  if (await page.locator('[data-key="accounts-review"]').count()) await t.tap('[data-key="accounts-review"]');
  for (const [id, v] of [['chk', '3000'], ['sav', '400']]) await t.type('[data-path=\'["balances","2026-10","' + id + '","end"]\']', v);
  // Investments sit below, folded until their step.
  await t.tap('#other-accounts > summary');
  for (const [id, v] of [['k401', '17100'], ['roth', '11300']]) await t.type('[data-path=\'["balances","2026-10","' + id + '","end"]\']', v);
  // The Visa's balance is what is owed, in Credit and debt on the same tab (S-137); it folds when up to date.
  if (await page.locator('[data-key="credit-review"]').count()) await t.tap('[data-key="credit-review"]');
  await t.type('[data-path=\'["balances","2026-10","visa","end"]\']', '300');
  t.step('Month-end balances for 5 accounts');
  report('d. Month-end balances', view, t, 20);
  await page.evaluate(() => { location.hash = 'insights'; });
  await page.click('[data-key="tab-networth"]');
  await page.selectOption('[data-key="nw-month"]', '2026-10');
  check(J, 'October net worth', await settled(page, '#chart-nw-bridge [data-key="nwb-actual"]', money(37102.36)), money(37102.36));
  await page.click('[data-key="nw-which-fi"]');
  check(J, 'October FI net worth', await settled(page, '#chart-nw-bridge [data-key="nwb-actual"]', money(31500)), money(31500));
  await page.close();
}

const browser = await playwright.chromium.launch();
for (const [view, size] of VIEWS) {
  await firstSession(browser, view, size);
  await month(browser, view, size);
  await questions(browser, view, size);
  await balances(browser, view, size);
}
await browser.close();
// The table for AUDIT.md.
console.log('\n| Journey | Step | Phone taps | Desktop taps | Limit |\n| --- | --- | --- | --- | --- |');
for (const r of results.filter((x) => x.view === 'phone')) {
  const d = results.find((x) => x.journey === r.journey && x.view === 'desktop');
  r.steps.forEach((s, i) => console.log('| ' + (i ? '' : r.journey) + ' | ' + s.name + ' | ' + s.taps + ' | ' + (d ? d.steps[i].taps : '') + ' | ' + (s.limit !== null ? s.limit : '') + ' |'));
  console.log('| ' + r.journey + ' | **Total** | **' + r.total + '** | **' + (d ? d.total : '') + '** | ' + (r.limit ? 'under ' + r.limit : '') + ' |');
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nEvery journey within its limits, every number as worked out by hand.');
process.exit(failures ? 1 : 0);
