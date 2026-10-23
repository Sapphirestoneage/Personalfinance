// So far and expected by month end (S-128), by hand, on Riley's October 17, 2026.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRefs, loadHousehold } from './helpers.js';
import { buildSummary } from '../src/engines/summary.js';
import { monthOutlook } from '../src/engines/calendar.js';

const refs = loadRefs();

test('Riley, October 17: so far and expected by month end', () => {
  const d = loadHousehold('riley');
  const o = monthOutlook(d, buildSummary(d, refs).income, '2026-10-17');
  // SO FAR (the log, up to today). Income: the October 9 paycheck 1,500 + dog walking on the 12th 130 = 1,630.
  // Spending: rent 1,750 + groceries 88.20 + 121.80 = 210 + eating out 4.75 + 4.75 + 13.75 = 23.25 + gas 46 +
  // the car payment 340 = 2,369.25. (The 250 moved to savings is a transfer, not spending.)
  // So far 1,630 - 2,369.25 = -739.25.
  assert.deepEqual([o.incomeSoFar, o.spentSoFar, o.soFar], [1630, 2369.25, -739.25]);
  // STILL TO COME (the calendar). The next paycheck, October 23: 1,500 (November 6 is next month). Dog walking
  // has no pay date, so nothing is scheduled for it. The phone bill, due the 18th: 65. The Visa on the 25th is a
  // card payment (its charges were already spending), so it is left out; the car loan is the car payment line,
  // already paid on the 15th.
  assert.deepEqual(o.items.map((i) => [i.date, i.kind, i.amount]), [['2026-10-18', 'bill', -65], ['2026-10-23', 'paycheck', 1500]]);
  // The rest of the plan for the lines with no due day (plan - logged, never below 0):
  //   utilities 84 - 0 = 84; groceries 420 - 210 = 210; eating out 150 - 23.25 = 126.75; gas 120 - 46 = 74;
  //   shopping 100; entertainment 60; gifts 40. Together 694.75. Savings lines are not spending: left out.
  assert.deepEqual(o.rest.map((u) => [u.name, u.left]), [['Utilities', 84], ['Groceries', 210], ['Eating out', 126.75], ['Gas', 74], ['Shopping', 100], ['Entertainment', 60], ['Gifts', 40]]);
  // EXPECTED BY MONTH END: -739.25 + 1,500 = 760.75; - 65 = 695.75; - 694.75 = 1.00.
  assert.deepEqual([o.paychecks, o.bills, o.planLeft, o.expected], [1500, 65, 694.75, 1]);
});

test('a closed month has one number: no outlook', () => {
  const d = loadHousehold('riley');
  assert.equal(monthOutlook(d, buildSummary(d, refs).income, '2026-09-30'), null);
});
