// A paycheck in the first pass (2026-10-28, engine/paycheck.js): typed as take-home, the gross is solved to the cent
// and the withholding estimated from the tax tables, both rough; typed before tax, the withholding is estimated the
// same way; nothing is taken out of self-employed pay or a benefit; without a filing status only FICA comes off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { cashflow } from '../engine/cashflow.js';
import { valueOf } from '../engine/spine.js';
import { putFact } from '../engine/edits.js';
import { addToGroup } from '../engine/count.js';
import * as O from '../engine/paycheck.js';

const R = loadRules();
const T = '2026-10-28';
const blank = () => applyDefaults(readHousehold(readJson('test/clients/maya-start.json'), { today: T }).spine, R);
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b);

test('a paycheck typed as take-home: the gross is solved to the cent, the withholding is a guess, and the cash flow agrees', () => {
  // A New Yorker (the start file has no state yet), so state tax is withheld too.
  const s0 = putFact(blank(), 'household.state', 'NY', 'known', T);
  const r = addToGroup(s0, 'income', 'w2', T);
  let s;
  s = O.setIncomeFirstPass(r.spine, R, r.id, { amount: 2150, basis: 'takeHome', cadence: 'biweekly' }, T);
  const x = s.income[0];
  assert.equal(x.amount.kind, 'rough');
  assert.match(x.amount.note, /figured from take-home of \$2,150 every 2 weeks/);
  assert.ok(valueOf(x.amount) > 2150 && valueOf(x.amount) < 3200, 'a gross in range: ' + valueOf(x.amount));
  assert.equal(x.withholding.federal.kind, 'rough');
  assert.equal(O.takeHomeOf(s, R, r.id), 2150, 'reads back exactly what was typed');
  // The month's take-home is 26 paychecks over 12 months.
  const cf = cashflow(s, R, '2026-10');
  near(cf.income.takeHome.value, 2150 * 26 / 12, 0.05);
  assert.equal(cf.income.takeHome.kind, 'rough');
  // Typed before tax instead: known gross, estimated withholding, a take-home under the gross.
  s = O.setIncomeFirstPass(s, R, r.id, { amount: 2800, basis: 'gross' }, T);
  assert.deepEqual([valueOf(s.income[0].amount), s.income[0].amount.kind], [2800, 'known']);
  assert.ok(O.takeHomeOf(s, R, r.id) < 2800 - 2800 * 0.0765);
  const w = O.withholdingFor(s, R, r.id, 2800);
  assert.ok(w.estimated && w.federal > 0 && w.state > 0, 'NY withholds state tax too');
  // Rough keeps the number and flags it; not for me clears it; a new schedule keeps the amount.
  s = O.setIncomeFirstPass(s, R, r.id, { amount: 2800, basis: 'gross', kind: 'rough' }, T);
  assert.equal(s.income[0].amount.kind, 'rough');
  s = O.setIncomeFirstPass(s, R, r.id, { cadence: 'weekly' }, T);
  assert.deepEqual([s.income[0].cadence, valueOf(s.income[0].amount)], ['weekly', 2800]);
  s = O.setIncomeFirstPass(s, R, r.id, { amount: null, kind: 'notForMe' }, T);
  assert.equal(s.income[0].amount.kind, 'notForMe');
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  // Nothing is taken out of self-employed pay or a benefit.
  const se = addToGroup(s, 'income', 'self', T);
  const t = O.setIncomeFirstPass(se.spine, R, se.id, { amount: 4300, basis: 'gross' }, T);
  assert.deepEqual([valueOf(t.income[1].withholding.federal), O.hasBasisChoice(t.income[1])], [0, false]);
  const ui = addToGroup(t, 'income', 'benefits', T);
  const u = O.setIncomeFirstPass(ui.spine, R, ui.id, { amount: 400, basis: 'gross' }, T);
  assert.deepEqual([u.income[2].cadence, valueOf(u.income[2].withholding.federal), u.income[2].withholding.federal.kind], ['weekly', 0, 'known']);
});

test('without a filing status the withholding cannot be guessed, so take-home is typed back as gross plus FICA', () => {
  let s = blank();
  s = { ...s, household: { ...s.household, filingStatus: { value: null, kind: 'missing', asOf: T, source: 'test' } } };
  const r = addToGroup(s, 'income', 'w2', T);
  assert.equal(O.withholdingFor(r.spine, R, r.id, 2000), null);
  s = O.setIncomeFirstPass(r.spine, R, r.id, { amount: 2000, basis: 'takeHome' }, T);
  near(valueOf(s.income[0].amount), 2000 / (1 - 0.0765), 0.02);
  assert.equal(O.takeHomeOf(s, R, r.id), 2000);
});

