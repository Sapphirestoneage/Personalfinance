// One debt model (morning answer 1, S-243): the Plan is the source for every payoff date and interest total; "every
// extra dollar at debt" is only a comparison; the day-by-day run charges deferred interest when a promo ends unpaid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { monthKey } from '../engine/spine.js';
import { fooLadder, planPayoff } from '../engine/plan.js';
import { debtView } from '../engine/debtview.js';
import { outcome } from '../engine/whatif.js';
import { cashsim } from '../engine/cashsim.js';
import { debtLoss } from '../engine/debt.js';
import { targetBuys } from '../engine/target.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('the Plan\'s payoff dates are its debt steps\' months, and its run agrees', () => {
  const sp = demo(), s = summarize(sp, R, { flags: false });
  const f = fooLadder(sp, R, s), p = planPayoff(sp, R, s, { ladder: f });
  const step = (id) => f.rungs.find((r) => r.id === id);
  assert.equal(p.hiYm, monthKey(step('highInterest').completes));
  assert.equal(p.allYm, monthKey(step('lowInterest').completes));
  assert.equal(p.debts.map((d) => d.payoffYm).sort().pop(), p.allYm, 'the run clears the last debt the month the step says');
  assert.ok(p.every.debtFreeYm < p.allYm, 'every extra dollar at debt is sooner: it is the comparison');
  assert.ok(p.interest.value > p.every.interest.value);
});

test('Debt, What if and the target read the Plan\'s month and interest', () => {
  const sp = demo(), s = summarize(sp, R, { flags: false });
  const p = planPayoff(sp, R, s), sim = cashsim(sp, R, { months: 12 });
  const d = debtView(sp, R, sim, s);
  assert.equal(d.order.debtFreeYm, p.allYm);
  assert.equal(d.order.totalInterest.value, p.interest.value);
  assert.equal(d.clearDates.allYm, p.allYm);
  assert.equal(d.clearDates.hiYm, p.hiYm);
  assert.equal(d.clearDates.everyYm, p.every.debtFreeYm);
  for (const r of d.order.rows) assert.equal(r.planYm, p.debts.find((x) => x.id === r.id).payoffYm, r.name);
  const o = outcome(sp, R);
  assert.equal(o.debtFreeYm, p.allYm);
  assert.equal(o.interest, p.interest.value);
  assert.equal(targetBuys(sp, sp, R).freeNow, p.allYm);
});

test('a typed extra at the debt goes in every month, so the Plan\'s date moves sooner', () => {
  const sp = demo();
  const more = { ...sp, debtPlan: { ...(sp.debtPlan || {}), extra: { value: 300, kind: 'known', asOf: sp.meta.asOf, source: 'typed' } } };
  const a = planPayoff(sp, R, summarize(sp, R, { flags: false })), b = planPayoff(more, R, summarize(more, R, { flags: false }));
  assert.ok(b.allYm < a.allYm);
});

test('the day-by-day run charges deferred interest when the promo ends unpaid, the same amount as the warning', () => {
  const sp = demo(), sim = cashsim(sp, R, { months: 12 });
  const store = sp.debts.find((d) => d.id === 'store');
  const x = sim.deferred.find((y) => y.id === 'store');
  assert.ok(x, 'charged');
  assert.equal(x.date, '2027-03-01', 'the day after the promo ends');
  assert.equal(x.amount, debtLoss(sp, R, store, sp.meta.asOf).back);
  assert.ok(sim.model.extras.some((e) => e.id === 'deferred:store' && e.paidWith === 'store'), 'on the card, not from checking');
});

test('no charge when the promo is not deferred interest, or the balance is gone before it ends', () => {
  const plain = demo();
  plain.debts.find((d) => d.id === 'store').deferredInterest = { value: false, kind: 'known' };
  assert.equal(cashsim(plain, R, { months: 12 }).deferred.length, 0);
  const small = demo();
  small.debts.find((d) => d.id === 'store').balance = { value: 60, kind: 'known', asOf: small.meta.asOf };
  assert.equal(cashsim(small, R, { months: 12 }).deferred.length, 0);
});
