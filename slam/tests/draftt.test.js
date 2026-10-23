// DRAFTT is descriptive (S-072): proportions, no bands. The base is take-home plus pre-tax retirement
// when there is any, so the parts add to 100%. Checked on a made-up household: take-home 3,000 a month,
// housing 1,200, food 400, no debts. Uses the store (schema, value, edits), the summary engine (the
// draftt lens), and the helpers, which load the reference data in src/data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold, newIncome, newDeduction } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findCategory } from '../src/store/edits.js';
import { buildSummary } from '../src/engines/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

function household(pretax) {
  const d = newHousehold('Base');
  const inc = newIncome({ id: 'job', type: 'w2', payFrequency: 'monthly' });
  inc.takeHome = makeValue(3000, { cadence: 'paycheck' });
  if (pretax)
    inc.deductions.push({
      ...newDeduction({ id: 'ret', kind: 'retirement', mode: 'amount' }),
      amount: makeValue(pretax, { cadence: 'month' })
    });
  d.income.push(inc);
  d.noDebts = true;
  findCategory(d, 'housing').estimate = makeValue(1200);
  findCategory(d, 'food').estimate = makeValue(400);
  return d;
}

test('with pre-tax retirement, the base is take-home plus pre-tax retirement', () => {
  const d = buildSummary(household(300), refs).lenses.draftt;
  // 3,000 + 300 = 3,300; retirement letter = 0 after-tax + 300 pre-tax
  assert.equal(d.base.amount, 3300);
  assert.equal(d.base.label, 'take-home plus pre-tax retirement');
  assert.equal(d.rows.find((r) => r.key === 'retirement').amount, 300);
  // D 0 + R 300 + A 1,200 + F 400 + T 0 = 1,900; 1,900 / 3,300 = 0.575758
  assert.equal(d.total, 1900);
  assert.ok(Math.abs(d.totalShare - 0.575758) < 5e-7);
});

test('without pre-tax retirement, the base is take-home', () => {
  const d = buildSummary(household(0), refs).lenses.draftt;
  assert.equal(d.base.amount, 3000);
  assert.equal(d.base.label, 'take-home');
  // housing 1,200 + food 400 = 1,600; 1,600 / 3,000 = 0.533333; everything else 0; left over 1,400 / 3,000 = 0.466667
  assert.ok(Math.abs(d.totalShare - 0.533333) < 5e-7);
  assert.ok(Math.abs(d.totalShare + d.everythingElseShare + d.leftOverShare - 1) < 1e-9);
  assert.equal(d.taxes, null, 'no gross, so no taxes line');
});
