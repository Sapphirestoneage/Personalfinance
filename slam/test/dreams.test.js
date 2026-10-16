// Short-term dream (this year, or the next step) and long-term dream (everything
// after) are two separate answers on every category and line (S-075).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold, newIncome } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findCategory, findLine } from '../src/store/edits.js';
import { buildSummary } from '../src/calc/summary.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

function plan() {
  const d = newHousehold('Dreams');
  const inc = newIncome({ id: 'job', type: 'w2', payFrequency: 'monthly' });
  inc.takeHome = makeValue(3000, { cadence: 'paycheck' });
  d.income.push(inc);
  d.noDebts = true;
  findCategory(d, 'housing').dream = makeValue(1200);
  findCategory(d, 'housing').dreamLong = makeValue(2000);
  findLine(d, 'groceries').line.dreamLong = makeValue(500);
  findLine(d, 'eating-out').line.dreamLong = makeValue(300);
  return d;
}

test('long-term dreams add up on their own, next to the short-term ones', () => {
  const s = buildSummary(plan(), refs);
  const food = s.rows.find((r) => r.id === 'food');
  // food long term from its lines: 500 + 300 = 800
  assert.deepEqual([food.dreamLong, food.dreamLongFrom], [800, 'lines']);
  assert.equal(food.dream, null, 'no short-term food dream given');
  // long-term spending: housing 2,000 + food 800 = 2,800 (debts none = 0); left 3,000 - 2,800 = 200
  assert.equal(s.totals.dreamLongTotal, 2800);
  assert.equal(s.totals.dreamLongOutflow, 2800);
  assert.equal(s.totals.dreamLongLeft, 200);
  // short term untouched: housing 1,200 only; left 3,000 - 1,200 = 1,800
  assert.equal(s.totals.dreamTotal, 1200);
  assert.equal(s.totals.dreamLeft, 1800);
});

test('no long-term dreams: the total is empty, not zero', () => {
  const d = plan();
  findCategory(d, 'housing').dreamLong = makeValue();
  findLine(d, 'groceries').line.dreamLong = makeValue();
  findLine(d, 'eating-out').line.dreamLong = makeValue();
  assert.equal(buildSummary(d, refs).totals.dreamLongTotal, null);
});

test('compat: files before long-term dreams load with them blank, short-term dreams unchanged', () => {
  const raw = JSON.parse(JSON.stringify(plan()));
  for (const c of raw.categories) { delete c.dreamLong; for (const l of c.lines) delete l.dreamLong; }
  const m = migrate(raw);
  assert.equal(findCategory(m, 'housing').dreamLong.amount, null);
  assert.equal(findLine(m, 'groceries').line.dreamLong.status, null);
  assert.equal(findCategory(m, 'housing').dream.amount, 1200);
  assert.deepEqual(validateHousehold(m), []);
});
