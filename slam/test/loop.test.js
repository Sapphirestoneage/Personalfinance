// Part 6 of the monthly loop: the Plan, Track, Review strip, the month-end
// checklist, and the month in review saved at close (S-089). By hand, on the
// October household from fixtures/october.js (see test/bridge.test.js), with
// $60 of ATM cash unmapped and a plan for October:
//   rent 1,500, groceries 350, shopping 200, car insurance 100 (a month).
// Actuals: rent 1,500 (typed), groceries 400 (log), shopping 60 (log: the 120
// concert less 60 owed back; the couch is a one-off), car insurance 100 (its share).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValue } from '../src/store/value.js';
import { startPlan } from '../src/store/plans.js';
import { closeMonth, reviseMonth } from '../src/store/months.js';
import { loopStrip, monthEndChecklist, monthReview, sortByPlan } from '../src/calc/loop.js';
import { buildSummary, closeMonthSnapshot } from '../src/calc/summary.js';
import { october } from './fixtures/october.js';
import { loadRefs, near } from './helpers.js';

const refs = loadRefs();
const TODAY = '2026-10-31';

function planned() {
  const d = october({ atm: true });
  startPlan(d, '2026-10', 'manual', { rent: makeValue(1500), groceries: makeValue(350), shopping: makeValue(200), 'car-insurance': makeValue(100) });
  return d;
}

test('better, on plan, worse: more than 5% and more than $10', () => {
  const g = sortByPlan([{ name: 'a', plan: 100, actual: 89 }, { name: 'b', plan: 100, actual: 94 }, { name: 'c', plan: 1000, actual: 1040 }, { name: 'd', plan: 300, actual: 340 }, { name: 'e', plan: null, actual: 5 }]);
  // a: -11 is 11% and over $10: better. b: -6 is under $10: on plan. c: +40 is 4%: on plan. d: +40 is 13%: worse.
  assert.deepEqual([g.better.map((x) => x.name), g.onPlan.map((x) => x.name), g.worse.map((x) => x.name), g.notCompared.map((x) => x.name)], [['a'], ['b', 'c'], ['d'], ['e']]);
});

test('the loop strip for October', () => {
  const d = planned();
  const s = loopStrip(d, buildSummary(d, refs), TODAY);
  assert.equal(s.plan.state, 'started');
  // 13 entries: 3 income, 2 groceries, Geico, 2 transfers, concert, couch, 2 card payments, ATM; last Oct 28.
  // Scheduled: the yearly car insurance on Oct 14, confirmed by the Geico entry (same line, same day, 1,200).
  assert.deepEqual(s.track, { entries: 13, last: '2026-10-28', confirmed: 1, scheduled: 1 });
  assert.deepEqual(s.review, { empty: 0, balancesMissing: 0, balancesTotal: 6, ties: false, unexplained: -60 });
  assert.equal(s.nextPlan, 'not started');
});

test('the month-end checklist: three open items', () => {
  const d = planned();
  const c = monthEndChecklist(d, buildSummary(d, refs), TODAY);
  const by = Object.fromEntries(c.items.map((i) => [i.key, [i.count, i.open]]));
  assert.deepEqual(by, {
    gaps: [0, false], waiting: [0, false], balances: [0, false], bridge: [1, true], unmapped: [0, false], duplicates: [0, false],
    owed: [1, true],          // the friend's 60 for the concert
    'next-plan': [1, true]    // no November plan yet
  });
  assert.equal(c.items.find((i) => i.key === 'bridge').state, 'off by $60');
  assert.equal(c.summary, 'Closed with 3 open items: off by $60, 1 reimbursement owed, next month\'s plan not started');
});

test('the month in review, saved at close, never changes after', () => {
  const d = planned();
  const s = buildSummary(d, refs);
  const r = monthReview(d, s, TODAY);
  const names = (g) => g.map((x) => x.name + ' ' + x.diff);
  // Lines vs plan: shopping 60 vs 200 = -140 better; groceries 400 vs 350 = +50 worse (14%); rent and car insurance on plan
  assert.deepEqual([names(r.vsPlan.lines.better), names(r.vsPlan.lines.onPlan), names(r.vsPlan.lines.worse)],
    [['Shopping -140'], ['Rent or mortgage 0', 'Car insurance 0'], ['Groceries 50']]);
  assert.deepEqual([names(r.vsPlan.categories.better), names(r.vsPlan.categories.worse)], [['Personal and fun -140'], ['Food 50']]);
  // Income: 4,300 landed vs 4,000 planned, more is better
  assert.deepEqual(r.income.better.map((x) => x.diff), [300]);
  // Plan spending: 1,500 + 350 + 200 + 100 = 2,150, plus Debt payments, which a plan takes as the minimums (40): 2,190.
  // Estimate: car insurance 1,200 a year = 100, plus the Visa minimum 40: 140.
  assert.deepEqual(r.totals, { spent: 2100, plan: 2190, estimate: 140, surplus: 1700, savingsRate: r.totals.savingsRate, takeHome: 4000 });
  assert.deepEqual([r.bridge.ties, r.bridge.unexplained], [false, -60]);
  // From the log: groceries 400 + shopping 60 = 460; typed: rent 1,500. 460 / 1,960 = 0.234694
  assert.deepEqual([r.tracking.fromLog, r.tracking.typed], [460, 1500]);
  assert.ok(near(r.tracking.share, 0.234694, 6));
  assert.deepEqual(r.topMerchants.map((m) => m.merchant + ' ' + m.amount), ['GEICO 1200', 'COUCH 250', 'TICKETMASTER 120', 'ATM WITHDRAWAL 60']);
  assert.equal(r.readings[0], 'Personal and fun came in $140 under plan.');
  assert.equal(r.readings[1], 'Groceries was $50 over.');
  assert.equal(r.readings[2], 'Income came in $300 more than planned.');
  // The 80/20 saved with the review (worked out in test/pareto.test.js)
  assert.equal(r.pareto.reading, '50% of your entries (3 of 6) made up 80% of your spending.');
  assert.equal(r.openItems.summary, 'Closed with 3 open items: off by $60, 1 reimbursement owed, next month\'s plan not started');

  const estimates = JSON.stringify(d.categories.map((c) => [c.estimate, c.lines.map((l) => l.estimate)]));
  closeMonth(d, { ...closeMonthSnapshot(s), review: r }, '2026-11-01T09:00:00Z');
  // Closing never changes an estimate
  assert.equal(JSON.stringify(d.categories.map((c) => [c.estimate, c.lines.map((l) => l.estimate)])), estimates);
  const saved = JSON.stringify(d.months[0].snapshot.review);
  // A late revision sits next to the review, never inside it
  reviseMonth(d, '2026-10', 'groceries', 420, '2026-11-03T10:00:00Z');
  assert.equal(JSON.stringify(d.months[0].snapshot.review), saved);
  assert.deepEqual(d.months[0].revised.lines.groceries, { amount: 420, at: '2026-11-03T10:00:00Z' });
});
