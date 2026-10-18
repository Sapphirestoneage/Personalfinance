// Phase 4: chart data comes from calc. Checked by hand against Maya.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../src/calc/summary.js';
import { spendingDonut, sankeyData, gutBars, variance } from '../src/calc/chart-data.js';
import { loadRefs, loadHousehold } from './helpers.js';

const s = buildSummary(loadHousehold('maya'), loadRefs());

test('donut keeps the 7 biggest categories and folds the rest into Other', () => {
  // housing 1750, food 840, fun 370, debt 300, health 145, transport 132, annual 120 | bills 107 (68 + the late fee 39,
  // moved from Fees in S-123) + giving 50 = 157
  const d = spendingDonut(s);
  assert.equal(d.slices.length, 8);
  assert.deepEqual(d.slices.slice(0, 3).map((x) => x.id), ['housing', 'food', 'fun']);
  assert.equal(d.slices[7].name, 'Other (2)');
  assert.equal(d.slices[7].amount, 157);
});

test('sankey: a shortfall becomes a second source on the left', () => {
  // right: 6 biggest + Other(annual 120 + bills 107 + giving 50 = 277) + Savings 150; left: take-home 3,900 + shortfall 64
  const k = sankeyData(s);
  assert.deepEqual(k.left.map((x) => [x.id, x.amount]), [['take-home', 3900], ['shortfall', 64]]);
  assert.equal(k.right.find((x) => x.other).amount, 277);
  assert.equal(k.right.at(-1).id, 'savings');
  assert.equal(k.total, 3964);
});

test('gut bars and variance order', () => {
  // Gut 2,800 vs sum of estimates 3,157 vs actual 3,814 (S-097: no dreams in the gut check).
  assert.deepEqual(gutBars(s).map((x) => x.amount), [2800, 3157, 3814]);
  assert.deepEqual(variance(s).slice(0, 2).map((x) => [x.id, x.amount]), [['food', 290], ['fun', 270]]);
});
