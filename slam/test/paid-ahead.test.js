// Paid ahead (S-119), by hand: a yearly bill paid for months still to come is an asset that runs down
// by its monthly share. Riley pays his car insurance (960, March 14) and car registration (180, July 10)
// once a year.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValue } from '../src/store/value.js';
import { addEntry, editEntry } from '../src/store/log.js';
import { findLine } from '../src/store/edits.js';
import { paidAheadSchedules, paidAheadTotal, scheduleAt } from '../src/calc/paid-ahead.js';
import { netWorthAt } from '../src/calc/networth.js';
import { buildSummary } from '../src/calc/summary.js';
import { bridgeFor } from '../src/calc/bridge.js';
import { october } from './fixtures/october.js';
import { loadRefs, loadHousehold } from './helpers.js';

const refs = loadRefs();

test('Riley: one schedule per yearly bill paid, each ending at $0', () => {
  const d = loadHousehold('riley');
  const s = paidAheadSchedules(d);
  // Car insurance: 960 / 12 = 80 a month, March 2026 through February 2027. Registration: 180 / 12 = 15,
  // July 2026 through June 2027.
  assert.deepEqual(s.map((x) => [x.name, x.paid, x.date, x.months, x.share, x.from, x.through]),
    [['Car insurance', 960, '2026-03-14', 12, 80, '2026-03', '2027-02'], ['Car registration', 180, '2026-07-10', 12, 15, '2026-07', '2027-06']]);
  // Month ends: 960 - 80 = 880 (March), 800 (April), ... 80 (January 2027), 0 (February 2027).
  assert.deepEqual(s[0].ends.map((e) => e.amount), [880, 800, 720, 640, 560, 480, 400, 320, 240, 160, 80, 0]);
  // On the day it was paid: all 960; the 1st of April: March's end, 880; today (October 17): September's end,
  // 960 - 7 x 80 = 400. Registration today: 180 - 3 x 15 = 135. Together 535.
  assert.deepEqual([scheduleAt(s[0], '2026-03-14'), scheduleAt(s[0], '2026-03-13'), scheduleAt(s[0], '2026-04-01'), scheduleAt(s[0], '2026-10-17')], [960, 0, 880, 400]);
  assert.equal(paidAheadTotal(d, '2026-10-17'), 535);
});

test('Riley: net worth for February, March, and April, before and after Paid ahead', () => {
  const d = loadHousehold('riley');
  // February 28. Before: checking 3,793.11 + savings 450 + 401(k) 13,465 + Roth 7,910 + car 9,100 = 34,718.11,
  // less Visa 586.35 and the loan 5,459.67 = 28,672.09. Nothing paid ahead yet: after, the same.
  // March 31. Before: 2,577.46 + 700 + 14,065 + 8,450 + 9,000 = 34,792.46, less 652.59 and 5,146.97 = 28,992.90.
  //   After: + the insurance paid ahead, 880 = 29,872.90 (no drop beyond March's 80 share).
  // April 30. Before: 2,169.87 + 950 + 14,780 + 9,045 + 8,900 = 35,844.87, less 658.17 and 4,832.70 = 30,354.00.
  //   After: + 800 = 31,154.00.
  const at = (date) => [netWorthAt(d, date).total, paidAheadTotal(d, date)];
  assert.deepEqual(at('2026-02-28'), [28672.09, 0]);
  assert.deepEqual(at('2026-03-31'), [29872.9, 880]);
  assert.deepEqual(at('2026-04-30'), [31154, 800]);
  // FI net worth does not count it: March's FI stays 25,139.87.
  assert.equal(netWorthAt(d, '2026-03-31').fi, 25139.87);
  // The cash bridge still shows the 960 going out in March: yearly 95 - 960 = -865.
  assert.equal(bridgeFor(d, buildSummary(d, refs).income, '2026-03').steps.find((x) => x.key === 'yearly').amount, -865);
});

test('Paid ahead always reaches $0 at the end of its period, even when the share does not divide evenly', () => {
  const d = october();
  // The October household pays 1,200 of car insurance (a yearly line) on October 14: 100 a month.
  // A 1,000 bill on a line that is not yearly, marked as covering 12 months: 1,000 / 12 = 83.33 a month;
  // after 11 months 1,000 - 11 x 83.33 = 83.37 left, and the 12th month takes it to 0.
  const gym = findLine(d, 'entertainment').line;
  gym.estimate = makeValue(80);
  const e = addEntry(d, { date: '2026-10-02', amount: 1000, lineId: 'entertainment', account: 'chk', merchant: 'Gym, a year' });
  editEntry(d, e.id, { coverMonths: 12 });
  // And a 6-month bill: 300 / 6 = 50.
  const half = addEntry(d, { date: '2026-10-20', amount: 300, lineId: 'shopping', account: 'chk', merchant: 'Six months of a service' });
  editEntry(d, half.id, { coverMonths: 6 });
  const s = paidAheadSchedules(d);
  for (const x of s) {
    assert.equal(x.ends[x.ends.length - 1].amount, 0, x.name + ' ends at 0');
    assert.equal(x.ends.length, x.months);
    assert.ok(x.ends.every((m, i) => m.amount >= 0 && (i === 0 || m.amount <= x.ends[i - 1].amount)), x.name + ' runs down');
  }
  const gymS = s.find((x) => x.id === e.id);
  assert.deepEqual([gymS.share, gymS.ends[10].amount, gymS.ends[11].amount, gymS.through], [83.33, 83.37, 0, '2027-09']);
  assert.deepEqual(s.find((x) => x.id === half.id).ends.map((m) => m.amount), [250, 200, 150, 100, 50, 0]);
  // Not a period of its own: an ordinary purchase has no schedule.
  assert.equal(s.length, 3);
});
