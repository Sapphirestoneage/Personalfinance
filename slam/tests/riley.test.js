// Part 10: Riley, a year of the monthly loop (made-up numbers). Built by
// tools/riley.mjs (fixed seed, committed output): October 2025 to September
// 2026 closed, October 2026 open, today October 17, 2026.
//
// Every expected number below is worked out by hand from the inputs (the
// events written out in tools/riley.mjs and the balances in
// src/data/households/riley.json), never by running the code.
//
// Uses the summary, bridge, calendar, pareto, trends, totals, plan, balances and log engines, the
// store (validate, edits, value, schema), and the helpers, which load the reference data in src/data
// and the Riley demo household (riley.json above, run through migrate).
//
// RILEY, as set up:
//   Pay: Northwind Labs, biweekly Fridays, 1,500 a paycheck (1,500 x 26 / 12 = 3,250 a month).
//        Dog walking (side income), 250 a month planned, logged as it comes.
//        Take-home 3,250 + 250 = 3,500 a month.
//   Accounts: Checking, Savings, Visa (linked to the Visa debt: minimum 35, due the 25th, pays the statement).
//   Bills: rent 1,750 due the 1st; car payment 340 due the 15th; phone 65 due the 18th (all from checking).
//          Car insurance 960 a year due March 14; car registration 180 a year due July 10 (yearly lines:
//          the budget holds 80 and 15 a month; the payment is in the log).
//   Paid on the Visa: groceries, eating out, gas, shopping, entertainment, gifts.
//   Savings lines: emergency fund 200 and car repair fund 50 (typed at month-end; they stay in
//   Riley's accounts), Roth IRA 400 (logged: it leaves for an outside broker).
//   Cushion: 100.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold, loadRefs, near } from './helpers.js';
import { validateHousehold } from '../src/store/validate.js';
import { setField } from '../src/store/edits.js';
import { makeValue } from '../src/store/value.js';
import { removeTransaction } from '../src/store/edits.js';
import { newNextStage } from '../src/store/schema.js';
import { buildSummary } from '../src/engines/summary.js';
import { bridgeFor } from '../src/engines/bridge.js';
import { cashCalendar, safeReading } from '../src/engines/calendar.js';
import { paretoLevels, paretoCut, entryItems, lineItems, merchantItems } from '../src/engines/pareto.js';
import { monthOverMonth, fixedFloor, volatility, categoryGrid } from '../src/engines/trends.js';
import { budgetTotals } from '../src/engines/totals.js';
import { modelForMonth } from '../src/engines/plan.js';
import { cashOnHand } from '../src/engines/balances.js';
import { counted } from '../src/engines/log.js';

const refs = loadRefs();
const riley = () => loadHousehold('riley');
const money = (a, e, l) => assert.ok(near(a, e, 2), l + ': got ' + a + ', expected ' + e);
const rec = (d, m) => d.months.find((x) => x.key === m);
const steps = (br) => Object.fromEntries(br.steps.map((s) => [s.key, s.amount]));

test('Riley loads, validates, and has the year as the loop ran it', () => {
  const d = riley();
  assert.deepEqual(validateHousehold(d), []);
  assert.deepEqual(
    d.months.map((m) => m.key),
    [
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09'
    ]
  );
  assert.equal(d.currentMonth, '2026-10');
  // Every closed month has a start and an end for all three accounts (start carried or typed).
  for (const m of d.months)
    for (const a of ['chk', 'sav', 'visa']) assert.ok(d.balances[m.key][a].end.amount !== null, m.key + ' ' + a);
  // Sources: manual, scheduled, and import all used
  const by = {};
  for (const t of d.transactions) by[t.source] = (by[t.source] || 0) + 1;
  assert.ok(by.manual > 0 && by.scheduled > 0 && by.import > 0);
});

// ---------------------------------------------------------------------------
// MARCH 2026, start to finish.
//
// THE PLAN (February's plan copied forward, shopping cut to 60 at February's end):
//   rent 1,750; utilities 84; groceries 400; eating out 150; car payment 340; car insurance 960 a year (80);
//   gas 120; phone 65; shopping 60; entertainment 60; gifts 40; car registration 180 a year (15);
//   Debt payments: the Visa minimum, 35.
//   Spending: 1,750 + 84 + 400 + 150 + 340 + 80 + 120 + 65 + 60 + 60 + 40 + 15 + 35 = 3,199.
//   Savings: emergency fund 200 + Roth IRA 400 + car repair fund 50 = 650.
//
// THE LOG.
//   Checking, logged during the month (It happened on scheduled items, quick entry for the rest):
//     Mar 1 rent 1,750 (scheduled); Mar 9 dog walking +120 (manual); Mar 13 paycheck +1,500 (scheduled);
//     Mar 14 Geico 960 (manual, car insurance); Mar 15 car payment 340 (scheduled); Mar 18 phone 65 (scheduled);
//     Mar 23 dog walking +100 (manual); Mar 25 Visa payment 586.35, February's statement (scheduled);
//     Mar 27 paycheck +1,500 (scheduled); Mar 28 Vanguard Roth IRA 400 (manual).
//   Visa, by quick entry during the month: Trader Joe's 82.40 (Mar 2), Trader Joe's 74.25 (Mar 16),
//     Thai Basil 42.00 (Mar 20), and "coffee" 4.50 with no account (Mar 21).
//   The Visa CSV at month-end has 20 rows. Matching:
//     TRADER JOE S 82.40 Mar 2   <- the Mar 2 entry: same amount, same day, same shop: MERGED
//     TRADER JOE S 74.25 Mar 17  <- the Mar 16 entry: same amount, a day apart, same shop: MERGED
//     THAI BASIL 42.00 Mar 20    <- the Mar 20 entry: MERGED
//     CORNER COFFEE 4.75 Mar 19 and Mar 21: both within 3 days and $1 of the 4.50 coffee (no merchant to
//       compare), so neither is clear: 2 POSSIBLE matches. The coach says the Mar 21 one is the coffee:
//       MERGED (the bank's 4.75 counts, the note "coffee" stays); the Mar 19 one then stands on its own.
//     The other 15 rows are new: Chipotle 13.50, Corner Coffee 4.75 (Mar 5, 7, 12, 26), Shell 45.00 and 48.30,
//       Safeway 96.10, Sweetgreen 15.25, Target 38.99, AMC 28.00, Whole Foods 61.80, Amazon 24.50,
//       Walmart 54.00, and the payment received +586.35.
//   "Matched 3, new 15, possible matches 2 to confirm."
//   Typed at month-end: utilities 84.30, emergency fund 200, car repair fund 50, gifts none (0).
//
// PREFILLED ACTUALS:
//   rent 1,750 (log, 1)          groceries 82.40 + 96.10 + 74.25 + 61.80 = 314.55 (log, 4)
//   utilities 84.30 (typed)      eating out 13.50 + 15.25 + 42.00 + 6 x 4.75 = 99.25 (log, 9)
//   car payment 340 (log, 1)     car insurance 80 (its share)    gas 45.00 + 48.30 = 93.30 (log, 2)
//   phone 65 (log, 1)            shopping 38.99 + 24.50 + 54.00 = 117.49 (log, 3)
//   entertainment 28 (log, 1)    gifts 0 (typed)    car registration 15 (share)    Visa minimum 35
//   Spending: 1,750 + 84.30 + 314.55 + 99.25 + 340 + 80 + 93.30 + 65 + 117.49 + 28 + 0 + 15 + 35 = 3,021.89
//   Savings: 200 + 400 (log) + 50 = 650.
// INCOME (S-118): estimate 3,250 (1,500 a paycheck x 26 / 12) + dog walking 250 = 3,500.
//   Plan: paydays from the biweekly schedule (Fridays from October 10, 2025: ... Feb 27, Mar 13, Mar 27,
//   Apr 10): 2 paychecks this month, 2 x 1,500 = 3,000; dog walking 250 (its estimate): 3,250.
//   Actual from the log: paychecks 1,500 (Mar 13) + 1,500 (Mar 27) = 3,000 (2 entries); dog walking
//   120 (Mar 9) + 100 (Mar 23) = 220 (2 entries). 3,220.
//   Surplus: the actual income 3,220 - 3,021.89 - 650 = -451.89.
// ---------------------------------------------------------------------------

test('March: the log after matching, and nothing counted twice', () => {
  const d = riley();
  const mar = counted(d.transactions).filter((t) => t.date.startsWith('2026-03'));
  // 10 checking entries + 20 Visa rows (3 merged into logged entries, the coffee confirmed) = 30,
  // + the Roth IRA side of the Mar 28 move (S-115) = 31
  assert.equal(mar.length, 31);
  const merged = mar
    .filter((t) => t.mergedFrom)
    .map((t) => [t.date, t.merchant, t.amount, t.mergedFrom.date, t.mergedFrom.amount])
    .sort();
  assert.deepEqual(merged, [
    ['2026-03-02', 'TRADER JOE S', 82.4, '2026-03-02', 82.4],
    ['2026-03-17', 'TRADER JOE S', 74.25, '2026-03-16', 74.25],
    ['2026-03-20', 'THAI BASIL', 42, '2026-03-20', 42],
    ['2026-03-21', 'CORNER COFFEE', 4.75, '2026-03-21', 4.5]
  ]);
  assert.equal(mar.find((t) => t.date === '2026-03-21' && t.merchant === 'CORNER COFFEE').note, 'coffee');
  // Two Trader Joe's purchases, two entries (not four)
  assert.equal(mar.filter((t) => t.merchant === 'TRADER JOE S').length, 2);
  assert.equal(d.transactions.filter((t) => t.possible).length, 0);
});

test('March: prefilled actuals, better / on plan / worse', () => {
  const d = riley();
  const r = rec(d, '2026-03').snapshot.review;
  const lines = rec(d, '2026-03').snapshot.lines;
  const want = {
    rent: 1750,
    utilities: 84.3,
    groceries: 314.55,
    'eating-out': 99.25,
    'car-payment': 340,
    'car-insurance': 80,
    gas: 93.3,
    subscriptions: 65,
    shopping: 117.49,
    entertainment: 28,
    gifts: 0,
    yearly: 15,
    'debt:debt-visa': 35,
    'emergency-fund': 200,
    retirement: 400,
    'other-goals': 50
  };
  for (const [id, v] of Object.entries(want)) money(lines[id].actual, v, id);
  money(r.totals.spent, 3021.89, 'spent');
  money(r.totals.plan, 3199, 'plan');
  money(r.totals.surplus, -451.89, 'surplus');
  assert.deepEqual(r.totals.income, { estimate: 3500, plan: 3250, actual: 3220, tracked: true, unassigned: 0 });
  assert.deepEqual(
    r.incomeRows.map((x) => [x.name, x.estimate, x.plan, x.planNote, x.actual, x.count]),
    [
      ['Northwind Labs', 3250, 3000, '2 paychecks this month', 3000, 2],
      ['Dog walking', 250, 250, '', 220, 2]
    ]
  );
  // Lines vs plan (more than 5% and $10 counts):
  //   better: groceries -85.45 (21%), eating out -50.75, gifts -40, entertainment -32 (53%), gas -26.70 (22%)
  //   on plan: rent, utilities (+0.30), car payment, car insurance, phone, car registration
  //   worse: shopping +57.49 (96%)
  const g = (x) => x.map((y) => y.name + ' ' + y.diff);
  assert.deepEqual(g(r.vsPlan.lines.better), [
    'Groceries -85.45',
    'Eating out -50.75',
    'Gifts -40',
    'Entertainment -32',
    'Gas -26.7'
  ]);
  assert.deepEqual(
    r.vsPlan.lines.onPlan.map((x) => x.name),
    ['Rent', 'Utilities', 'Car payment', 'Car insurance', 'Phone', 'Car registration']
  );
  assert.deepEqual(g(r.vsPlan.lines.worse), ['Shopping 57.49']);
  // Categories: Food 413.80 vs 550 = -136.20 better; Personal and fun 145.49 vs 160 = -14.51 (9%) better;
  // Transportation 513.30 vs 540 = -26.70 is 4.9%, so on plan.
  assert.deepEqual(g(r.vsPlan.categories.better), ['Food -136.2', 'Personal and fun -14.51']);
  // Income: 3,220 vs the plan's 3,250 (its real 2 paychecks): 30 less, under 5% (162.50), so on plan.
  assert.deepEqual([r.income.worse.length, r.income.onPlan.map((x) => x.diff)], [0, [-30]]);
  // Accuracy: estimates 3,239 a month (rent 1,750, utilities 84, groceries 400, eating out 150, car payment 340,
  // insurance 80, gas 120, phone 65, shopping 100, entertainment 60, gifts 40, registration 15, Visa 35).
  // March 3,021.89 / 3,239 = 0.93297, 1.07x off. February 2,959.45 / 3,239 = 0.91369, 1.09x off.
  assert.deepEqual([r.accuracy.now, r.accuracy.last], [1.07, 1.09]);
  assert.deepEqual(r.readings, [
    'Food came in $136 under plan.',
    'Shopping was $57 over.',
    '1.07x off this month, down from 1.09x.'
  ]);
  // Tracking: from the log 1,750 + 314.55 + 99.25 + 340 + 93.30 + 65 + 117.49 + 28 = 2,807.59;
  // typed: utilities 84.30 + gifts 0. Share 2,807.59 / 2,891.89 = 0.9708495 (2,891.89 x 0.97085 = 2,807.5914, a hair over).
  assert.deepEqual([r.tracking.fromLog, r.tracking.typed], [2807.59, 84.3]);
  assert.ok(near(r.tracking.share, 0.97085, 6));
});

test('March: the bridge ties, and the checklist closed with nothing open', () => {
  const d = riley();
  const br = bridgeFor(d, buildSummary(d, refs).income, '2026-03');
  // surplus -451.89 (the actual income 3,220, S-118)
  // yearly: share 80 + 15 = 95, paid 960 (Geico): 95 - 960 = -865
  // set aside: emergency fund 200 + car repair fund 50 (the Roth's 400 left with its entry): +250
  // Visa: 586.35 (February's end) to 652.59: +66.24. Card minimum in the budget: +35.
  // No income step: the surplus already uses the 3,220 that landed.
  assert.deepEqual(steps(br), { yearly: -865, 'set-aside': 250, cards: 66.24, 'card-min': 35 });
  // explained: -451.89 - 865 + 250 + 66.24 + 35 = -965.65
  money(br.explained, -965.65, 'explained');
  // cash: February's end 3,793.11 + 450 = 4,243.11; March's end 2,577.46 + 700 = 3,277.46: -965.65.
  // By the flows: +1,500 +1,500 +120 +100 -1,750 -960 -340 -65 -586.35 -400 -84.30 = -965.65 (the savings move is inside).
  assert.deepEqual(
    [br.cashStart, br.cashEnd, br.actual, br.unexplained, br.ties],
    [4243.11, 3277.46, -965.65, 0, true]
  );
  assert.equal(
    br.reading,
    'Your budget showed $452 over, but cash went down $966. The car insurance bill ($960) came due this month.'
  );
  // The checklist at close: every line filled, scheduled items confirmed, balances in, ties,
  // nothing unmapped or waiting, no duplicates, nothing owed, April's plan started.
  assert.equal(rec(d, '2026-03').snapshot.review.openItems.summary, 'Closed with nothing open');
});

test('March: the 80/20 at all three levels', () => {
  const d = riley();
  const p = paretoLevels(d, buildSummary(d, refs).history, ['2026-03']);
  // ENTRIES (purchases and fees; the Roth is savings, the card payment is not spending): 4 from checking,
  //   13 Visa purchases, and 6 coffees: 23.
  //   rent 1,750, Geico 960, car payment 340, Safeway 96.10, Trader Joe's 82.40 and 74.25, phone 65,
  //   Whole Foods 61.80, Walmart 54, Shell 48.30 and 45, Thai Basil 42, Target 38.99, AMC 28, Amazon 24.50,
  //   Sweetgreen 15.25, Chipotle 13.50, Corner Coffee 6 x 4.75.
  //   Total 1,750 + 960 + 340 + 65 + 652.59 (the Visa purchases) = 3,767.59; 80% is 3,014.07.
  //   1,750 + 960 = 2,710 is short; + 340 = 3,050 reaches it: 3 of 23 (13.04%), 3,050 / 3,767.59 = 0.809536.
  assert.deepEqual([p.entries.count, p.entries.of, p.entries.amount, p.entries.total], [3, 23, 3050, 3767.59]);
  assert.ok(near(p.entries.amountShare, 0.809536, 6));
  assert.equal(p.entries.reading, '13% of your entries (3 of 23) made up 80% of your spending.');
  // MERCHANTS: the scheduled rent, car payment, and phone have no merchant, so each is grouped by its line
  //   (S-095): Rent 1,750; GEICO 960; Car payment 340; TRADER JOE S 156.65; SAFEWAY 96.10; SHELL OIL 93.30;
  //   Phone 65; WHOLE FOODS MKT 61.80; WALMART 54; THAI BASIL 42; TARGET T- 38.99; CORNER COFFEE 28.50; AMC 28;
  //   AMAZON MKTPL 24.50; SWEETGREEN 15.25; CHIPOTLE 13.50: 16, total 3,767.59, 80% is 3,014.07.
  //   1,750 + 960 = 2,710 is short; + 340 = 3,050 reaches it: 3 of 16 (18.75%).
  assert.deepEqual(
    [p.merchants.items.map((i) => i.label), p.merchants.of],
    [['Rent (no merchant, by line)', 'GEICO', 'Car payment (no merchant, by line)'], 16]
  );
  assert.equal(p.merchants.amount, 3050);
  assert.equal(p.merchants.reading, '19% of your merchants (3 of 16) made up 80% of your spending.');
  // LINES (actuals; gifts at 0 takes no part): rent 1,750, car payment 340, groceries 314.55, shopping 117.49,
  //   eating out 99.25, gas 93.30, utilities 84.30, car insurance 80, phone 65, Visa 35, entertainment 28,
  //   registration 15: 12 lines, 3,021.89. 80% is 2,417.51.
  //   1,750 + 340 + 314.55 = 2,404.55 is short; + 117.49 = 2,522.04: 4 lines.
  assert.deepEqual([p.lines.count, p.lines.of, p.lines.amount], [4, 12, 2522.04]);
  assert.equal(p.lines.reading, '4 lines, Rent, Car payment, Groceries, and Shopping, made up 80%.');
});

test('the 12-month 80/20: sorted largest first, reaches 80%, and the smallest item is needed', () => {
  const d = riley();
  const h = buildSummary(d, refs).history;
  const months = d.months.map((m) => m.key);
  for (const items of [entryItems(d, months), merchantItems(d, months), lineItems(d, h, months)]) {
    const c = paretoCut(items);
    for (let i = 1; i < c.cumulative.length; i++) assert.ok(c.cumulative[i - 1].amount >= c.cumulative[i].amount);
    assert.ok(c.amount >= 0.8 * c.total - 1e-6);
    // Without its smallest item the cut falls below 80%
    assert.ok(c.amount - c.items[c.items.length - 1].amount < 0.8 * c.total);
  }
});

// ---------------------------------------------------------------------------
// Two more bridges.
// ---------------------------------------------------------------------------

test('December 2025: a holiday month that ties', () => {
  const d = riley();
  // Spending: rent 1,750 + utilities 92.40 + groceries (91.30 + 104.20 + 87.65 + 118.90 = 402.05)
  //   + eating out (3 x 4.75 + 56 = 70.25) + car payment 340 + insurance 80 + gas (48.10 + 44.60 = 92.70)
  //   + phone 65 + shopping 32.40 + entertainment 31 + gifts (140 + 180 + 100 = 420) + registration 15 + Visa 35
  //   = 3,425.80. Savings 650. Income from the log (S-118): paychecks Dec 5 and Dec 19, 1,500 + 1,500, and
  //   dog walking 140 = 3,140. Surplus 3,140 - 3,425.80 - 650 = -935.80.
  // Visa purchases 402.05 + 70.25 + 92.70 + 32.40 + 31 + 420 = 1,048.40; November's statement 623.48 was paid.
  const br = bridgeFor(d, buildSummary(d, refs).income, '2025-12');
  money(br.surplus, -935.8, 'surplus');
  // yearly +95 (nothing paid), set aside +250, Visa 623.48 to 1,048.40 = +424.92, minimum +35; no income step.
  assert.deepEqual(steps(br), { yearly: 95, 'set-aside': 250, cards: 424.92, 'card-min': 35 });
  // explained -935.80 + 95 + 250 + 424.92 + 35 = -130.88
  // cash: November's end 2,240.04 + 1,200 = 3,440.04; December's end 1,859.16 + 1,450 = 3,309.16: -130.88
  // flows: +3,140 - 1,750 - 92.40 - 340 - 65 - 623.48 - 400 = -130.88
  assert.deepEqual([br.explained, br.actual, br.unexplained, br.ties], [-130.88, -130.88, 0, true]);
  assert.equal(br.reading, 'Your budget showed $936 over, but cash went down $131. Card balances went up $425.');
});

test('June 2026: $60 of ATM cash is not explained, and the month closed with open items', () => {
  const d = riley();
  // Spending: rent 1,750 + utilities 79.60 (from the bank file) + groceries (93.40 + 88.75 + 81.20 + 77.35 = 340.70)
  //   + eating out (4 x 4.75 + 14.25 = 33.25) + car payment 340 + insurance 80 + gas (49.90 + 46.10 = 96)
  //   + phone 65 + shopping 41.80 + entertainment 0 + gifts 0 + registration 15 + Visa 35 = 2,876.35.
  //   Income from the log (S-118): paychecks Jun 5 and Jun 19, 1,500 + 1,500, and dog walking 150 = 3,150.
  //   Surplus 3,150 - 2,876.35 - 650 = -376.35.
  const br = bridgeFor(d, buildSummary(d, refs).income, '2026-06');
  money(br.surplus, -376.35, 'surplus');
  // yearly +95, set aside +250, Visa 707.62 to 511.75 = -195.87, minimum +35,
  // Sam paid back his half of May's concert: +60; no income step.
  assert.deepEqual(steps(br), { yearly: 95, 'set-aside': 250, cards: -195.87, 'card-min': 35, received: 60 });
  // explained -376.35 + 95 + 250 - 195.87 + 35 + 60 = -132.22
  // cash: May's end 2,822.03 + 200 = 3,022.03; June's end 2,379.81 + 450 = 2,829.81: -192.22
  // flows: +1,500 + 1,500 + 150 + 60 - 1,750 - 79.60 - 340 - 65 - 707.62 - 400 - 60 (ATM) = -192.22
  // not explained yet: -192.22 - (-132.22) = -60, the ATM withdrawal with no line
  assert.deepEqual([br.explained, br.actual, br.unexplained, br.ties], [-132.22, -192.22, -60, false]);
  // The biggest step is now the set-aside, 250.
  assert.equal(
    br.reading,
    'Your budget showed $376 over, but cash went down $192. $250 was set aside and is still in your accounts. $60 is not explained yet.'
  );
  assert.equal(
    rec(d, '2026-06').snapshot.review.openItems.summary,
    'Closed with 2 open items: off by $60, 1 unmapped, 0 possible matches'
  );
  // May closed with the concert money still owed
  assert.equal(rec(d, '2026-05').snapshot.review.openItems.summary, 'Closed with 1 open item: 1 reimbursement owed');
});

test('explained + not explained yet = the actual change in cash, every month', () => {
  const d = riley();
  const inc = buildSummary(d, refs).income;
  for (const m of d.months) {
    const br = bridgeFor(d, inc, m.key);
    money(br.explained + br.unexplained, br.actual, m.key);
  }
});

// ---------------------------------------------------------------------------
// February to March: month over month, fixed floor, volatility.
// February (by hand): rent 1,750; utilities 88.10; groceries 84.60 + 99.40 + 79.80 + 72.15 = 335.95;
// eating out 4 x 4.75 + 64 = 83; car payment 340; insurance 80; gas 47.20 + 50.30 = 97.50; phone 65;
// shopping 45.90; entertainment 24; gifts 0; registration 15; Visa 35. Spending 2,959.45.
// ---------------------------------------------------------------------------

test('February to March: month over month, fixed floor, volatility', () => {
  const d = riley();
  const s = buildSummary(d, refs);
  const mom = monthOverMonth(d, s.history, '2026-03');
  // Housing 1,838.10 -> 1,834.30 (-3.80); Food 418.95 -> 413.80 (-5.15); Transportation 517.50 -> 513.30 (-4.20);
  // Personal and fun 69.90 -> 145.49 (+75.59); Debt 35, Bills 65, Annual 15 unchanged.
  assert.deepEqual([mom.before, mom.after, mom.change], [2959.45, 3021.89, 62.44]);
  assert.deepEqual(
    mom.steps.map((x) => [x.name, x.change]),
    [
      ['Personal and fun', 75.59],
      ['Food', -5.15],
      ['Transportation', -4.2],
      ['Housing', -3.8]
    ]
  );
  // Fixed floor, both months: rent 1,750 + car payment 340 + car insurance 80 + phone 65 + Visa minimum 35 = 2,270,
  // 2,270 / 3,500 = 0.648571 of take-home.
  for (const m of ['2026-02', '2026-03']) {
    const f = fixedFloor(budgetTotals(modelForMonth(d, m), s.income, d));
    money(f.amount, 2270, m + ' fixed');
    assert.ok(near(f.share, 0.648571, 6));
  }
  // Volatility over the two months (standard deviation of two numbers = half the gap):
  //   Personal and fun 69.90 and 145.49: mean 107.695, sd 37.795, 0.350945
  //   Food 418.95 and 413.80: mean 416.375, sd 2.575, 0.006184
  //   Transportation 517.50 and 513.30: mean 515.40, sd 2.10, 0.004075
  //   Housing 1,838.10 and 1,834.30: mean 1,836.20, sd 1.90, 0.001035. Debt, Bills, Annual do not move.
  const v = volatility(categoryGrid(d, s.history, ['2026-02', '2026-03']));
  assert.deepEqual(
    v.map((x) => x.name),
    ['Personal and fun', 'Food', 'Transportation']
  );
  assert.ok(near(v[0].swing, 0.350945, 6));
  assert.ok(near(v[1].swing, 0.006184, 6));
  assert.ok(near(v[2].swing, 0.004075, 6));
});

// ---------------------------------------------------------------------------
// OCTOBER 2026, the open month, today the 17th.
// September ended with checking 4,001.03, savings 150, and the Visa at 2,818.03 (the car repair).
// The calendar's cash is checking only (S-094).
// October so far: rent 1,750 (Oct 1), 250 moved to savings (Oct 3), paycheck +1,500 (Oct 9), dog walking +130
// (Oct 12), car payment 340 (Oct 15), all logged; on the Visa: Trader Joe's 88.20, Corner Coffee 4.75 (twice), Shell 46, Safeway 121.80,
// Chipotle 13.75. Utilities (84 planned) is not in yet, so it is spread: 84 over Oct 18 to 31 (14 days) = 6 a day;
// November 84 / 30 = 2.80 a day. Every other line with no due day is paid on the Visa, so its spread moves
// the card, not cash.
// ---------------------------------------------------------------------------

test('October: every scheduled item, five days, the lowest point, safe to spend, the pay-later flag', () => {
  const d = riley();
  const cal = cashCalendar(d, buildSummary(d, refs).income, { today: '2026-10-17', horizon: 30 });
  const oct = cal.scheduled
    .filter((i) => i.planned.startsWith('2026-10'))
    .map((i) => [i.date, i.kind, i.name, i.amount, !!i.confirmed]);
  assert.deepEqual(oct, [
    ['2026-10-01', 'bill', 'Rent', 1750, true],
    ['2026-10-09', 'paycheck', 'Northwind Labs', 1500, true],
    ['2026-10-15', 'bill', 'Car payment', 340, true],
    ['2026-10-18', 'bill', 'Phone', 65, false],
    ['2026-10-23', 'paycheck', 'Northwind Labs', 1500, false],
    ['2026-10-25', 'debt', 'Visa', 2818.03, false]
  ]);
  const at = (date) => cal.days.find((x) => x.date === date).cash;
  // Today: checking at September's end 4,001.03 - 1,750 - 250 + 1,500 + 130 - 340 = 3,291.03
  money(at('2026-10-17'), 3291.03, 'Oct 17');
  // Oct 22: - phone 65 - 5 days x 6 = 3,196.03
  money(at('2026-10-22'), 3196.03, 'Oct 22');
  // Oct 25: 3,291.03 - 65 - 8 x 6 + 1,500 (Oct 23) - 2,818.03 (Visa) = 1,860.00
  money(at('2026-10-25'), 1860, 'Oct 25');
  // Nov 1: 1,860 - 6 x 6 (Oct 26 to 31) - 1,750 rent - 2.80 = 71.20
  money(at('2026-11-01'), 71.2, 'Nov 1');
  // Nov 5: 71.20 - 4 x 2.80 = 60.00, the day before the Nov 6 paycheck
  money(at('2026-11-05'), 60, 'Nov 5');
  assert.deepEqual(cal.lowest, { date: '2026-11-05', amount: 60 });
  // Safe to spend (S-095), checking only: the lowest point anywhere ahead is Nov 5, 60.00; less the 100 cushion
  // = -40.00, below 0, so safe to spend is 0 and the shortfall is $40 on Nov 5. Until payday (Oct 23) the lowest
  // is Oct 22, 3,196.03 - 100 = 3,096.03: higher than 0, so it is not shown.
  assert.equal(cal.safeToSpend, 0);
  assert.deepEqual(cal.shortfall, { amount: 40, date: '2026-11-05' });
  assert.equal(safeReading(cal), "Nothing safe to spend right now. You'll be $40 under your cushion on Nov 5.");
  assert.ok(cal.safeToSpend <= cal.todayCash);
  // Rent on Nov 1 leaves 71.20, under the cushion; the paycheck that covers it is Nov 6.
  assert.deepEqual(
    cal.payLater.map((f) => [f.name, f.due, f.paidBy, f.gap]),
    [['Rent', '2026-11-01', '2026-11-06', 5]]
  );
  // Under the cushion: Nov 1 to Nov 5 (71.20, 68.40, 65.60, 62.80, 60.00). Never under zero.
  assert.deepEqual([cal.belowCushion, cal.belowZero], [5, 0]);
});

test('October: the spread for groceries shrinks as entries come in', () => {
  // Plan 420. Spread over Oct 18 to 31 (14 days):
  //   no entries: 420 / 14 = 30 a day
  //   after Trader Joe's 88.20: 331.80 / 14 = 23.70 a day
  //   after Safeway 121.80 too: 210 / 14 = 15 a day
  const perDay = (d) =>
    cashCalendar(d, buildSummary(d, refs).income, { today: '2026-10-17', horizon: 30 }).spreads['2026-10'].units.find(
      (u) => u.name === 'Groceries'
    );
  const d = riley();
  const groc = d.transactions.filter((t) => t.lineId === 'groceries' && t.date.startsWith('2026-10'));
  const both = perDay(d);
  assert.deepEqual([both.plan, both.logged, both.left, both.perDay], [420, 210, 210, 15]);
  removeTransaction(d, groc.find((t) => t.amount === 121.8).id);
  money(perDay(d).perDay, 23.7, 'one entry');
  removeTransaction(d, groc.find((t) => t.amount === 88.2).id);
  money(perDay(d).perDay, 30, 'none');
});

test('October: the projected balance on any day is the start plus every item up to that day', () => {
  const d = riley();
  const cal = cashCalendar(d, buildSummary(d, refs).income, { today: '2026-10-17', horizon: 90 });
  // From the first month with balances (October 2025: checking 2,900), real month
  // starts and ends reset it; between resets it is the last real number plus every item since.
  let cash = null;
  for (const day of cal.days) {
    const flow = day.items.filter((i) => i.cash && !i.mirror).reduce((a, i) => a + i.flow, 0);
    if (cash === null) cash = 2900 + flow;
    else cash += flow;
    const m = day.date.slice(0, 7);
    const end =
      d.balances[m] &&
      day.date <= '2026-10-17' &&
      day.date ===
        m +
          '-' +
          String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0)).getUTCDate()).padStart(2, '0');
    if (end && d.balances[m].chk.end.amount !== null) cash = d.balances[m].chk.end.amount;
    assert.ok(Math.abs(day.cash - cash) <= 0.011, day.date + ': ' + day.cash + ' vs ' + cash);
  }
});

// ---------------------------------------------------------------------------
// The rules the loop stands on.
// ---------------------------------------------------------------------------

test('a line with entries cannot be typed over', () => {
  const d = riley();
  assert.throws(() => setField(d, ['line', 'groceries', 'actual'], makeValue(500)), /This comes from 2 entries/);
});

test("closing never changed an estimate: the log holds only the client's changes", () => {
  const d = riley();
  // 15 estimates typed at setup, eating out 100 -> 150 (Dec 1), groceries 350 -> 400 (Jan 2) and 400 -> 420 (May 1)
  assert.equal(d.estimateLog.length, 18);
  const groc = d.estimateLog
    .filter((e) => e.lineId === 'groceries')
    .map((e) => [e.from ? e.from.amount : null, e.to.amount, e.at.slice(0, 10)]);
  assert.deepEqual(groc, [
    [null, 350, '2025-10-01'],
    [350, 400, '2026-01-02'],
    [400, 420, '2026-05-01']
  ]);
  // Nothing was written at a close (closes happen on the 1st at 08:00)
  assert.ok(d.estimateLog.every((e) => !e.at.endsWith('T08:00:00.000Z')));
  // Each close kept the estimate as it stood: food at March's close was 400 + 150 = 550
  assert.equal(rec(d, '2026-03').snapshot.categories.food.estimate, 550);
});

test('the saved review never changes after close, even with a revision', () => {
  const d = riley();
  const apr = rec(d, '2026-04');
  // Utilities came in late: 91.20, recorded as a revision on May 3, beside the snapshot
  assert.equal(apr.revised.lines.utilities.amount, 91.2);
  const typed = apr.snapshot.lines.utilities.actual;
  assert.notEqual(typed, 91.2);
  // The review saved at close still has the spending it had then
  const spentAtClose = Object.values(apr.snapshot.categories)
    .filter((c) => !c.savings)
    .reduce((a, c) => a + (c.actual || 0), 0);
  money(apr.snapshot.review.totals.spent, spentAtClose, 'April at close');
  // History shows the revision (91.20 - typed) on Housing, the saved review does not
  const housing = buildSummary(d, refs).history.byCategory.housing.find((p) => p.key === '2026-04');
  money(housing.actual - apr.snapshot.categories.housing.actual, 91.2 - typed, 'revision');
});

test('Next stage and Eras read cash from the balances', () => {
  const d = riley();
  // September's end: checking 4,001.03 + savings 150 = 4,151.03 (October has no end yet)
  money(cashOnHand(d).amount, 4151.03, 'cash on hand');
  d.nextStage = newNextStage([]);
  const s = buildSummary(d, refs);
  money(s.nextStage.cash.onHand, 4151.03, 'next stage');
  assert.equal(s.eras.cashKnown, true);
});
