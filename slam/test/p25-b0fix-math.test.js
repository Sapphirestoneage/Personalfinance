// Phase 2.5, Batch 0 fixes: Show the math on the Spending page. A debt minimum in the
// bill autopsy ("spend:autopsy:min:sl") was read as the key "min", so every minimum row
// opened as missing. A bill someone else covers with no amount recomputed to missing
// while it shows $0 to you. Adapted from the second build's p25-safety-math test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashsim, burnTiers } from '../engine/cashsim.js';
import { spendingView } from '../engine/spending.js';
import { explainMetric } from '../engine/math.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const F = (value, kind = 'known') => ({ value, asOf: '2026-10-01', source: 'test (made up)', kind: value === null ? 'missing' : kind });
const bill = (id, label, amount, covered) => ({ id, label, amount: F(amount), cadence: 'monthly', start: null, end: null, fixed: null, need: F(true), fat: null, covered: F(covered), coveredBy: F(covered ? 'Parents' : null) });

// The demo, after its house defaults, plus two covered bills: one with no amount, one with an amount.
function household() {
  const d = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  return { ...d, expenses: [...d.expenses, bill('cable', 'Cable', null, true), bill('water', 'Water', 45, true)] };
}
// The context the Spending page hands Show the math (ui/spending.js render).
function spendingCtx(spine) {
  const s = summarize(spine, R, { flags: false });
  const sim = cashsim(spine, R, { start: spine.meta.asOf });
  const spend = spendingView(spine, R, sim, s, { today: spine.meta.asOf });
  const tiers = burnTiers(spine, R, s.cashflow, { extra: 0 });
  return { spine, rules: R, s, sim, spend, tiers };
}

test('the household with covered bills is valid', () => {
  const h = household();
  assert.equal(validate(h).ok, true, JSON.stringify(validate(h).errors));
});

test('every bill autopsy row, the debt minimums included, shows its year and recomputes to it', () => {
  const ctx = spendingCtx(household());
  const rows = ctx.spend.autopsy.rows;
  const mins = rows.filter((r) => r.id.startsWith('min:'));
  assert.ok(mins.length >= 1, 'a debt minimum is in the autopsy');
  assert.ok(rows.slice(0, 5).some((r) => r.id.startsWith('min:')), 'the "top five" button includes a debt minimum');
  for (const r of rows) {
    const e = explainMetric('spend:autopsy:' + r.id, ctx);
    assert.equal(e.value, r.yearly, r.id + ' shows its year');
    assert.equal(e.recomputed, e.value, r.id + ' recomputes from its terms');
    assert.ok(!e.plugged.endsWith('= missing'), r.id + ' never reads missing');
  }
  const sl = rows.find((r) => r.id === 'min:sl');
  assert.ok(sl, 'the federal student loan minimum is a row');
  assert.equal(explainMetric('spend:autopsy:min:sl', ctx).value, sl.yearly);
});

test('a key with a colon in it reaches the debt and compare readers too', () => {
  const ctx = spendingCtx(household());
  for (const id of ['spend:autopsy:min:nope', 'debt:idr:nope', 'compare:line:nope']) {
    let e;
    assert.doesNotThrow(() => { e = explainMetric(id, ctx); }, id);
    assert.equal(e.recomputed, null, id + ' has nothing to recompute');
  }
});

test('a covered bill costs you $0 with or without an amount, and recomputes to $0', () => {
  const ctx = spendingCtx(household());
  for (const id of ['cable', 'water']) {
    const e = explainMetric('expenseCost:' + id, ctx);
    assert.equal(e.value, 0, id + ': covered by someone else is $0 to you');
    assert.equal(e.recomputed, 0, id + ': recomputes to $0, not missing');
  }
  // A bill nobody covers with no amount still reads missing both ways (empty is not zero).
  const h = household();
  const blank = { ...h, expenses: [...h.expenses, bill('gym2', 'Gym', null, false)] };
  const e = explainMetric('expenseCost:gym2', spendingCtx(blank));
  assert.equal(e.value, null);
  assert.equal(e.recomputed, null);
});
