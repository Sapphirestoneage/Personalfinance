// The Windfall room (S-201): a lump sum assigned step by step in the house order,
// each step reading the engines, nothing counted twice, missing never $0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { windfall } from '../engine/windfall.js';
import { editFact, putFact } from '../engine/edits.js';
import { explainMetric } from '../engine/math.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const near = (a, b, msg = '', eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b + (msg ? ': ' + msg : ''));
const step = (w, id) => w.steps.find((x) => x.id === id);

test('the order comes from the WINDFALL_ORDER rule and every step is run once', () => {
  const s = demo();
  const w = windfall(s, R, summarize(s, R), { amount: 5000 });
  assert.deepEqual(w.steps.map((x) => x.id), R.get('WINDFALL_ORDER', 2026));
  assert.ok(w.rules.includes('WINDFALL_ORDER'));
  for (const x of w.steps) { assert.ok(x.label && x.why, x.id); assert.ok(['computed', 'rough', 'incomplete', 'missing'].includes(x.kind)); }
});

test('demo, $5,000 already taxed: the tax bill, then the promo card the surplus cannot clear, then cards charging interest', () => {
  const s = demo();
  const sum = summarize(s, R);
  const w = windfall(s, R, sum, { amount: 5000, taxed: true });
  assert.equal(step(w, 'taxOnIt').amount, 0);
  // The 2026 balance due (1,072.63) with nothing set aside yet.
  near(step(w, 'taxBill').need, sum.tax.balanceDue.value);
  near(step(w, 'taxBill').amount, sum.tax.balanceDue.value);
  // Cash of 12,000 is well over one month of spending (3,572): nothing here.
  assert.equal(step(w, 'cashFloor').need, 0);
  // The promo: 300 a month fits the surplus (about 686), so the surplus clears it; nothing here.
  assert.equal(step(w, 'promos').need, 0);
  assert.match(step(w, 'promos').why, /clears them in time/);
  // The Visa at 22% is charging interest: its whole 3,000 balance.
  const cards = step(w, 'cards');
  assert.deepEqual(cards.items.map((x) => [x.id, x.pay]), [['visa', 3000]]);
  near(cards.amount, 3000);
  // What is left after tax and the Visa goes toward the Rule of 5 target (22,861 less 12,000).
  const cushion = step(w, 'cushion');
  near(cushion.need, 22695 - 12000);
  near(cushion.amount, 5000 - sum.tax.balanceDue.value - 3000);
  assert.ok(cushion.short > 0, 'the windfall does not reach the target');
  assert.equal(step(w, 'roth').amount, 0, 'nothing is left for the Roth');
  assert.equal(step(w, 'left').amount, 0);
  near(w.assigned, 5000);
  assert.equal(w.left, 0);
  // Every step's before is the last step's before less what it took.
  for (let i = 1; i < w.steps.length; i++) near(w.steps[i].before, w.steps[i - 1].before - (w.steps[i - 1].amount || 0));
});

test('demo, $40,000 not yet taxed: tax on it first at the marginal rate, the Roth room, and what is left over', () => {
  const s = demo();
  const sum = summarize(s, R);
  const w = windfall(s, R, sum, { amount: 40000, taxed: false });
  const tax = step(w, 'taxOnIt');
  near(tax.rate, 0.22 + 0.054, 'federal 22% plus NY 5.4%');
  near(tax.amount, 40000 * 0.274);
  // Roth: 7,500 limit less 300 a month for 10 months so far (a guess), under the phase-out, less the $300 a month
  // still set to go in for November and December (S-211): $3,900 of new money.
  const roth = step(w, 'roth');
  near(roth.need, 7500 - 3000 - 600);
  assert.equal(roth.kind, 'rough', 'the contributions so far are a guess from the monthly amount');
  assert.ok(roth.rough.includes('accounts.roth.contributions'));
  assert.ok(roth.rules.includes('IRA_LIMIT') && roth.rules.includes('ROTH_PO_S_LO'));
  near(step(w, 'cushion').amount, 22695 - 12000, 'the cushion is filled in full');
  const left = step(w, 'left');
  near(left.amount, 40000 - tax.amount - sum.tax.balanceDue.value - 3000 - (22695 - 12000) - 3900);
  near(w.assigned + w.left, 40000, 'nothing is lost');
  assert.match(left.why, /no job yet/);
});

test('promos the surplus cannot clear: pay enough now that the rest fits, deferred interest first', () => {
  let s = demo();
  // A surplus of about 686 against 300 a month fits; shrink the surplus with a big new bill.
  s = editFact(s, 'expenses.other.amount', 'set', { value: 900, kind: 'known', today: '2026-10-23' });
  const sum = summarize(s, R);
  const w = windfall(s, R, sum, { amount: 2000 });
  const p = step(w, 'promos');
  assert.ok(sum.cashflow.surplus.value < 300, 'the surplus no longer covers the 300 a month');
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].id, 'store');
  // Paying x now over 4 payments left: 300 - x / 4 = surplus, so x = (300 - surplus) * 4.
  near(p.items[0].pay, (300 - Math.max(0, sum.cashflow.surplus.value)) * 4);
  near(p.amount, p.items[0].pay);
  assert.match(p.why, /which the surplus covers/);
});

test('a missing input makes a step missing, never $0, and the windfall says so', () => {
  let s = demo();
  s = editFact(s, 'income.salary.amount', 'clear', { today: '2026-10-23' });
  const sum = summarize(s, R);
  const w = windfall(s, R, sum, { amount: 5000, taxed: true });
  const t = step(w, 'taxBill');
  assert.equal(t.need, null);
  assert.equal(t.amount, null);
  assert.equal(t.kind, 'missing');
  assert.ok(t.missing.includes('income.salary.amount'));
  assert.match(t.why, /cannot be figured yet/);
  assert.equal(w.kind, 'incomplete');
  // The money still flows to the later steps, and nothing is lost.
  near(w.assigned + w.left, 5000);
  // The tax year's set-aside counts against the bill once entered.
  let s2 = demo();
  s2 = putFact(s2, 'taxYears.2026.setAside', 1000, 'known', '2026-10-23');
  const w2 = windfall(s2, R, summarize(s2, R), { amount: 5000 });
  near(step(w2, 'taxBill').need, summarize(s2, R).tax.balanceDue.value - 1000);
});

test('show the math: every step explains itself and recomputes to the cent', () => {
  const s = demo();
  const sum = summarize(s, R);
  for (const [amount, taxed] of [[5000, true], [40000, false]]) {
    const w = windfall(s, R, sum, { amount, taxed });
    const ctx = { spine: s, rules: R, s: sum, windfall: w };
    for (const x of w.steps) {
      const e = explainMetric('windfall:' + x.id, ctx);
      assert.ok(e, x.id + ' explains');
      assert.equal(e.value, x.amount);
      if (e.value !== null) near(e.recomputed, e.value, x.id + ' recomputes');
      assert.ok(e.terms.length >= 2, x.id + ' names its inputs');
      assert.ok(e.formula.includes('='));
    }
  }
});
