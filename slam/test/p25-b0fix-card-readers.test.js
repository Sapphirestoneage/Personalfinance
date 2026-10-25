// Phase 2.5, Batch 0 fixes (adapted from the second build's p25-card-in-full-readers test).
// Answer 38 on the demo household (made up): every reader treats a card set to
// pay the full statement as never carrying a balance and never charged interest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { putFact, editPayment } from '../engine/edits.js';
import { summarize } from '../engine/summary.js';
import { cashflow } from '../engine/cashflow.js';
import { promoDeadlines, order } from '../engine/debt.js';
import { moneyFlow } from '../engine/flow.js';
import { calendar } from '../engine/calendar.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const put = (s, path, value) => putFact(s, path, value, 'known', '2026-10-23');
const near = (a, b, msg = '', eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b + (msg ? ': ' + msg : ''));

test('the household setting: every card paid in full leaves only the loan as a payment on top of spending', () => {
  const s = demo();
  const before = cashflow(s, R, '2026-10');
  const all = put(s, 'household.cardPayPolicy', 'statement');
  const cf = cashflow(all, R, '2026-10');
  assert.deepEqual(cf.debtMinimums.items.map((i) => i.id), ['sl'], 'the student loan still pays its minimum');
  const cardMins = before.debtMinimums.items.filter((i) => i.id !== 'sl').reduce((a, i) => a + i.amount, 0);
  near(cf.surplus.value, before.surplus.value + cardMins, 'the surplus gains exactly the card minimums');
  assert.deepEqual(order(all, 'avalanche', all.meta.asOf), ['sl'], 'only the loan is a debt to pay down');
});

test('a 0% promo card paid in full has no promo balance to clear before the intro rate ends', () => {
  const s = demo();
  assert.ok(promoDeadlines(s, s.meta.asOf).items.some((x) => x.id === 'store'), 'paid by the minimum, the store card has a promo deadline');
  const full = put(s, 'debts.store.payPolicy', 'statement');
  assert.deepEqual(promoDeadlines(full, full.meta.asOf).items, []);
  const sm = summarize(full, R);
  const flag = sm.flags.find((f) => f.id === 'promo-deadlines');
  assert.ok(!flag || flag.stage === 'green', 'no promo balance left to clear');
});

test('the money flow: a card paid in full is paid from checking for its charges only', () => {
  let s = put(demo(), 'debts.visa.payPolicy', 'statement');
  s = editPayment(s, 'groceries', { from: 'visa', day: null }, '2026-10-23');
  const cf = cashflow(s, R, '2026-10');
  const f = moneyFlow(s, R, cf);
  const card = f.nodes.find((n) => n.id === 'card:visa');
  assert.match(card.label, /\(paid in full\)$/);
  const charges = cf.expenses.items.find((i) => i.id === 'groceries').amount;
  const into = f.links.filter((l) => l.to === 'card:visa').reduce((a, l) => a + l.amount, 0);
  near(into, charges, 'checking pays the card what was charged on it, nothing more');
  assert.ok(!f.links.some((l) => l.from === 'card:visa' && l.to === 'debt:paid'), 'no debt payment on top');
  near(f.left - f.short, cf.surplus.value, 'still adds up to the surplus');
});

test('the calendar lists no minimum for a card paid in full; the day-by-day run still pays the statement from checking', () => {
  const s = put(demo(), 'debts.visa.payPolicy', 'statement');
  const c = calendar(s, R, { months: 2 });
  for (const m of c.months) assert.ok(!m.events.some((e) => e.id === 'debt:visa'), m.ym + ': no Visa minimum event');
  assert.ok(c.months[0].events.some((e) => e.id === 'debt:store'), 'the store card still pays its minimum');
  const paid = c.sim.daily.flatMap((d) => d.events).filter((e) => e.kind === 'card-payment' && /Visa/.test(e.label));
  assert.ok(paid.length >= 1, 'the run pays the Visa statement on its due day');
  assert.equal(c.sim.cards.visa.interest, 0);
  assert.ok(!c.months.some((m) => m.events.some((e) => e.kind === 'interest' && e.card === 'visa')), 'no interest event for the Visa');
});
