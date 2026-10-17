// Part 9 of the monthly loop: trends (S-092), small cases by hand. Riley's
// year (test/riley.test.js) checks the month-over-month bridge, fixed floor,
// and volatility on a real pair of months.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { addEntry } from '../src/store/log.js';
import * as tr from '../src/calc/trends.js';
import { buildSummary } from '../src/calc/summary.js';
import { october } from './fixtures/october.js';
import { loadRefs, near } from './helpers.js';

const refs = loadRefs();

test('fixed floor and volatility', () => {
  assert.deepEqual(tr.fixedFloor({ fixed: 1640, takeHome: 4000 }), { amount: 1640, share: 0.41 });
  const v = tr.volatility({ rows: [
    { id: 'a', name: 'A', values: [100, 300] },      // mean 200, sd 100: 0.5
    { id: 'b', name: 'B', values: [50, 50] },        // no swing: left out
    { id: 'c', name: 'C', values: [10, 30, 20] },    // mean 20, sd sqrt((100 + 100 + 0) / 3) = 8.165: 0.408
    { id: 'd', name: 'D', values: [null, 80] }       // one month only: left out
  ] });
  assert.deepEqual(v.map((x) => [x.name, x.mean, x.sd]), [['A', 200, 100], ['C', 20, 8.16]]);
  assert.ok(near(v[1].swing, 0.408248, 6));
});

test('annualized habits, day of month, and pacing', () => {
  const d = newHousehold('Habits');
  d.currentMonth = '2026-10';
  // Coffee: five charges of 4.00 in October; a 60 dinner once
  for (const day of ['02', '06', '09', '13', '20']) addEntry(d, { date: '2026-10-' + day, amount: 4, lineId: 'eating-out', merchant: 'Corner Coffee' });
  addEntry(d, { date: '2026-10-20', amount: 60, lineId: 'eating-out', merchant: 'Bistro' });
  // 5 x 4 = 20 a month, 240 a year; the dinner is not small or frequent
  assert.deepEqual(tr.annualizedHabits(d, ['2026-10']).map((x) => [x.merchant, x.count, x.average, x.yearly]), [['CORNER COFFEE', 5, 4, 240]]);
  // Day 20: 4 + 60 = 64; day 2: 4
  const dom = tr.dayOfMonth(d, ['2026-10']);
  assert.deepEqual([dom[1].average, dom[19].average, dom[0].average], [4, 64, 0]);
  // Cumulative: day 6 = 8, day 20 = 4 x 5 + 60 = 80; a 310 plan spread over 31 days is 10 a day
  const p = tr.pacing(d, '2026-10', 310);
  assert.deepEqual([p.now[5], p.now[19], p.now[30], p.plan[0], p.plan[19]], [8, 80, 80, 10, 200]);
});

test('card float and cash not explained, October', () => {
  const d = october({ atm: true });
  // Charged on the Visa: groceries 300. Paid to cards from checking: 450.
  assert.deepEqual(tr.cardFloat(d, ['2026-10']), [{ month: '2026-10', charged: 300, paid: 450, gap: -150 }]);
  const ne = tr.notExplained(d, buildSummary(d, refs).income, ['2026-10']);
  assert.deepEqual(ne, { bridge: -60, months: 1, atm: 60, p2p: 0 });
});
