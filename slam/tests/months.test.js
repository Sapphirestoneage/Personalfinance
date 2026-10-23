// Per-month actuals: pick a month, enter actuals, switch, and come back (switchMonth and
// copyFixedFromLastMonth in the store's months.js). Trends use every month with actuals, not
// only closed ones: checked through buildSummary (engines/summary.js) and trendData
// (engines/chart-data.js). Uses the store's schema, value, edits and validate modules, and
// the reference data in src/data through helpers.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findCategory, findLine } from '../src/store/edits.js';
import { switchMonth, copyFixedFromLastMonth } from '../src/store/months.js';
import { validateHousehold } from '../src/store/validate.js';
import { buildSummary } from '../src/engines/summary.js';
import { trendData } from '../src/engines/chart-data.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();
const v = (a) => makeValue(a);

function household() {
  // Food estimate 500. Rent is a fixed line (1,200). Working on September 2026.
  const d = newHousehold('Months', new Date('2026-09-15T12:00:00Z'));
  findCategory(d, 'food').estimate = v(500);
  findLine(d, 'rent').line.actual = v(1200);
  findLine(d, 'groceries').line.actual = v(400);
  return d;
}

test('switching months saves the month you leave and loads the one you pick', () => {
  const d = household();
  switchMonth(d, '2026-08');
  assert.equal(d.currentMonth, '2026-08');
  assert.equal(findLine(d, 'groceries').line.actual.amount, null, 'a new month starts blank');
  assert.equal(d.monthActuals['2026-09'].groceries.amount, 400);
  findLine(d, 'groceries').line.actual = v(350);
  switchMonth(d, '2026-09');
  assert.equal(findLine(d, 'groceries').line.actual.amount, 400);
  assert.equal(findLine(d, 'rent').line.actual.amount, 1200);
  assert.equal(d.monthActuals['2026-08'].groceries.amount, 350);
  assert.equal(d.monthActuals['2026-09'], undefined, 'the month being worked on lives on the lines only');
  assert.deepEqual(validateHousehold(d), []);
});

test('copy fixed costs from the latest earlier month (variable lines stay blank)', () => {
  const d = household();
  switchMonth(d, '2026-10');
  const res = copyFixedFromLastMonth(d);
  assert.equal(res.from, '2026-09');
  assert.equal(findLine(d, 'rent').line.actual.amount, 1200);
  assert.equal(findLine(d, 'groceries').line.actual.amount, null);
});

test('trends include open months: August 350 and September 400 (being worked on)', () => {
  const d = household();
  switchMonth(d, '2026-08');
  findLine(d, 'groceries').line.actual = v(350);
  switchMonth(d, '2026-09');
  const s = buildSummary(d, refs);
  // August: food actual 350 vs estimate 500 -> variance (350 - 500) / 500 = -0.3
  const aug = s.history.byCategory.food[0];
  assert.deepEqual([aug.key, aug.estimate, aug.actual, aug.open], ['2026-08', 500, 350, true]);
  assert.equal(aug.variancePct, -0.3);
  assert.deepEqual(s.history.openKeys, ['2026-08']);
  const t = trendData(s, 'food');
  assert.deepEqual(t.points.map((p) => [p.key, p.actual]), [['2026-08', 350], ['2026-09', 400]]);
});

test('closed months cannot be switched to; they are viewed instead', () => {
  const d = household();
  d.months.push({ key: '2026-07', closedAt: 'x', snapshot: { categories: {}, lines: {} }, revised: { lines: {} } });
  assert.throws(() => switchMonth(d, '2026-07'), /closed/);
});
