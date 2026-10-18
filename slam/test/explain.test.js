// How a number was worked out (S-108): the inputs shown under a headline number.
// A small household by hand: one paycheck of 3,000 a month take-home, Housing 1,000
// and Food 500 (estimates, no actuals yet), savings 200, every other category "doesn't apply".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { migrate } from '../src/store/migrate.js';
import { makeValue } from '../src/store/value.js';
import { addIncome, findCategory } from '../src/store/edits.js';
import { buildSummary } from '../src/calc/summary.js';
import { explain } from '../src/calc/explain.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

function household() {
  const d = migrate(newHousehold('Explain'));
  const inc = addIncome(d, { type: 'w2', label: 'Job' });
  inc.payFrequency = 'monthly';
  inc.takeHome = makeValue(3000);
  for (const c of d.categories) if (c.id !== 'debt') c.estimate = makeValue(null, { status: 'not-for-me' });
  findCategory(d, 'housing').estimate = makeValue(1000);
  findCategory(d, 'food').estimate = makeValue(500);
  findCategory(d, 'savings').estimate = makeValue(200);
  d.noDebts = true;
  return d;
}

test('take-home, spending, surplus, and savings rate list their inputs', () => {
  const s = buildSummary(household(), refs);
  const take = explain(s, 'takeHome');
  assert.deepEqual(take.steps.map((x) => [x.label, x.amount]), [['Job', 3000]]);
  assert.equal(take.result.amount, 3000);
  assert.deepEqual(take.steps[0].path, ['income', s.income.sources[0].id, 'takeHome']);

  // Spending: Housing 1,000 + Food 500 = 1,500, both estimates (no actuals yet); debt payments 0 (no debts).
  const sp = explain(s, 'spending');
  assert.deepEqual(sp.steps.map((x) => [x.label, x.amount]), [['Housing (estimate)', 1000], ['Food (estimate)', 500], ['Debt payments', 0]]);
  assert.equal(sp.result.amount, 1500);

  // Surplus: 3,000 - 1,500 - 200 = 1,300.
  const su = explain(s, 'surplus');
  assert.deepEqual(su.steps.map((x) => x.amount), [3000, -1500, -200]);
  assert.equal(su.result.amount, 1300);
  assert.equal(su.result.label, 'Surplus');

  // Savings rate: (200 + 0) / (3,000 + 0) = 0.0666...
  const sr = explain(s, 'savingsRate');
  assert.deepEqual(sr.steps.map((x) => x.amount), [200, 0, 3000]);
  assert.ok(Math.abs(sr.result.amount - 200 / 3000) < 1e-9);
});

test('safe to spend shows today, the lowest point, and the cushion', () => {
  // A calendar shaped like Riley's on October 17 (S-095): 3,291.03 today, lowest 60 on Nov 5, cushion 100, so $0.
  const cal = { todayCash: 3291.03, lowest: { date: '2026-11-05', amount: 60 }, cushion: 100, safeToSpend: 0 };
  const ex = explain(buildSummary(household(), refs), 'safeToSpend', cal);
  assert.deepEqual(ex.steps.map((x) => x.amount), [3291.03, 60, -100]);
  assert.equal(ex.result.amount, 0);
  assert.equal(explain(buildSummary(household(), refs), 'nothing'), null);
});
