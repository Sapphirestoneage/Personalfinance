// Paid ahead (S-119), by hand: a yearly bill paid for months still to come is an asset that runs down
// by its monthly share. Riley pays his car insurance (960, March 14) and car registration (180, July 10)
// once a year.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValue } from '../src/store/value.js';
import { addEntry, editEntry } from '../src/store/log.js';
import { findLine } from '../src/store/edits.js';
import { paidAheadSchedules, paidAheadTotal, scheduleAt } from '../src/engines/paid-ahead.js';
import { netWorthAt } from '../src/engines/networth.js';
import { buildSummary } from '../src/engines/summary.js';
import { bridgeFor } from '../src/engines/bridge.js';
import { october } from './fixtures/october.js';
import { loadRefs, loadHousehold } from './helpers.js';

const refs = loadRefs();

test('Riley: one schedule per yearly bill paid, each ending at $0', () => {
  const d = loadHousehold('riley');
  const s = paidAheadSchedules(d);
  // The opening amount (S-130): 400 left of the car insurance paid before October 2025, 5 months left:
  // 400 / 5 = 80 a month, October 2025 through February 2026, all of it on September 30, 2025.
  // Car insurance: 960 / 12 = 80 a month, March 2026 through February 2027. Registration: 180 / 12 = 15,
  // July 2026 through June 2027.
  assert.deepEqual(s.map((x) => [x.name, x.paid, x.date, x.months, x.share, x.from, x.through]),
    [['Car insurance', 400, '2025-09-30', 5, 80, '2025-10', '2026-02'], ['Car insurance', 960, '2026-03-14', 12, 80, '2026-03', '2027-02'], ['Car registration', 180, '2026-07-10', 12, 15, '2026-07', '2027-06']]);
  // Opening month ends: 400 - 80 = 320 (October), 240, 160, 80, 0 (February 2026).
  assert.deepEqual(s[0].ends.map((e) => e.amount), [320, 240, 160, 80, 0]);
  assert.deepEqual([scheduleAt(s[0], '2025-09-29'), scheduleAt(s[0], '2025-09-30'), scheduleAt(s[0], '2025-10-01'), scheduleAt(s[0], '2025-10-31'), scheduleAt(s[0], '2026-02-28'), scheduleAt(s[0], '2026-03-01')], [0, 400, 400, 320, 0, 0]);
  // Month ends: 960 - 80 = 880 (March), 800 (April), ... 80 (January 2027), 0 (February 2027).
  assert.deepEqual(s[1].ends.map((e) => e.amount), [880, 800, 720, 640, 560, 480, 400, 320, 240, 160, 80, 0]);
  // On the day it was paid: all 960; the 1st of April: March's end, 880; today (October 17): September's end,
  // 960 - 7 x 80 = 400. Registration today: 180 - 3 x 15 = 135. Together 535 (the opening is used up).
  assert.deepEqual([scheduleAt(s[1], '2026-03-14'), scheduleAt(s[1], '2026-03-13'), scheduleAt(s[1], '2026-04-01'), scheduleAt(s[1], '2026-10-17')], [960, 0, 880, 400]);
  assert.equal(paidAheadTotal(d, '2026-10-17'), 535);
});

test('Riley: net worth October 2025 to February 2026, before and after the opening Paid ahead (S-130)', () => {
  const d = loadHousehold('riley');
  // Before, by hand from the month ends (checking + savings + 401(k) + Roth + car, less the Visa and the loan):
  //   October 31:  2,668.79 + 950 + 12,505 + 6,490 + 9,500 = 32,113.79 - 618.52 - 6,695 = 24,800.27
  //   November 30: 2,240.04 + 1,200 + 13,070 + 7,010 + 9,400 = 32,920.04 - 623.48 - 6,388.48 = 25,908.08
  //   December 31: 1,859.16 + 1,450 + 13,085 + 7,250 + 9,300 = 32,944.16 - 1,048.40 - 6,080.42 = 25,815.34
  //   January 31:  2,692.02 + 1,700 + 13,560 + 7,720 + 9,200 = 34,872.02 - 615.81 - 5,770.82 = 28,485.39
  //   February 28: 3,793.11 + 450 + 13,465 + 7,910 + 9,100 = 34,718.11 - 586.35 - 5,459.67 = 28,672.09
  // After: + the opening amount at each month end, 320, 240, 160, 80, 0:
  //   25,120.27; 26,148.08; 25,975.34; 28,565.39; 28,672.09. FI net worth does not count it (unchanged).
  const ends = ['2025-10-31', '2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28'];
  assert.deepEqual(ends.map((x) => paidAheadTotal(d, x)), [320, 240, 160, 80, 0]);
  assert.deepEqual(ends.map((x) => netWorthAt(d, x).total), [25120.27, 26148.08, 25975.34, 28565.39, 28672.09]);
  assert.deepEqual(ends.map((x) => r2(netWorthAt(d, x).total - paidAheadTotal(d, x))), [24800.27, 25908.08, 25815.34, 28485.39, 28672.09]);
});

const r2 = (x) => Math.round(x * 100) / 100;

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
