// Needs in two passes (2026-10-28, engine/needs.js): seven categories; an estimate line counts until its category has
// a line with an amount, then the lines count; every engine that walks the expenses follows the one rule; the ledger
// tree groups Needs by category with the estimate first; the validator knows the two new expense fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { cashflow } from '../engine/cashflow.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { ledgerTree, numbersScreens, screenAt } from '../engine/ledger-tree.js';
import { addItem, editExpense } from '../engine/edits.js';
import { valueOf } from '../engine/spine.js';
import * as N from '../engine/needs.js';

const R = loadRules();
const T = '2026-10-28';
const blank = () => applyDefaults(readHousehold(readJson('test/clients/maya-start.json'), { today: T }).spine, R);
const demo = () => applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: T }).spine, R);
const total = (s) => cashflow(s, R, '2026-10').expenses.total;

test('seven categories; a line lands in one by its section, its words, or its own category', () => {
  assert.deepEqual(N.CATEGORY_IDS, ['housing', 'food', 'around', 'bills', 'health', 'fun', 'other']);
  assert.equal(N.categoryOf({ fat: 'accommodation', label: 'Rent' }), 'housing');
  assert.equal(N.categoryOf({ fat: 'food', label: 'Eating out', need: { value: false, kind: 'known' } }), 'food', 'a want in food stays food');
  assert.equal(N.categoryOf({ fat: 'transportation', label: 'Transit' }), 'around');
  assert.equal(N.categoryOf({ fat: null, label: 'Phone' }), 'bills');
  assert.equal(N.categoryOf({ fat: null, label: 'Streaming', subscription: { value: true, kind: 'known' } }), 'bills');
  assert.equal(N.categoryOf({ fat: null, label: 'Gym' }), 'health');
  assert.equal(N.categoryOf({ fat: null, label: 'Concerts' }), 'fun');
  assert.equal(N.categoryOf({ fat: null, label: 'Clothes', need: { value: false, kind: 'known' } }), 'fun', 'a want with no section is fun');
  assert.equal(N.categoryOf({ fat: null, label: 'Everything else' }), 'other');
  assert.equal(N.categoryOf({ fat: null, label: 'Gym', category: 'fun' }), 'fun', 'its own category wins');
  assert.equal(N.categoryOf({ fat: 'food', estimate: 'food' }), 'food');
});

test('an estimate counts until its category has a line with an amount; then the lines count', () => {
  let s = blank();
  assert.equal(total(s).value, 0);
  s = N.setEstimate(s, 'housing', 1650, 'rough', T);
  s = N.setEstimate(s, 'fun', 220, 'known', T);
  const est = N.estimateOf(s, 'housing');
  assert.equal(est.id, 'est-housing');
  assert.equal(est.label, 'Housing estimate');
  assert.equal(est.amount.kind, 'rough');
  assert.equal(valueOf(est.need), true);
  assert.equal(valueOf(N.estimateOf(s, 'fun').need), false, 'Fun is a want');
  assert.equal(total(s).value, 1870);
  assert.equal(cashflow(s, R, '2026-10').expenses.need.value, 1650);
  assert.equal(N.needsView(s).categories.find((c) => c.id === 'housing').inUse, 'estimate');
  // A rent line with no amount yet: the estimate still counts.
  const r = addItem(s, { collection: 'expenses', label: 'Rent', fat: 'accommodation' }, T);
  s = r.spine;
  assert.equal(N.hasLines(s, 'housing'), false);
  assert.equal(total(s).value, 1870);
  // The rent gets an amount: the lines count, the estimate is shadowed, and nothing counts twice.
  s = editExpense(s, r.id, { amount: 1500, cadence: 'monthly' }, T);
  assert.equal(N.shadowedEstimate(s, N.estimateOf(s, 'housing')), true);
  assert.equal(total(s).value, 1720);
  const v = N.needsView(s, cashflow(s, R, '2026-10')).categories.find((c) => c.id === 'housing');
  assert.deepEqual([v.inUse, v.estimate.value, v.linesTotal, v.gap, v.counted], ['lines', 1650, 1500, 150, 1500]);
  assert.equal(N.gapWords(v, (x) => '$' + x), '$150 not in lines yet');
  assert.equal(N.inUseWords(v), 'using the lines');
  // A second rough estimate for the same category changes the one line; the same number is no change at all.
  const again = N.setEstimate(s, 'housing', 1650, 'rough', T);
  assert.equal(again, s);
  s = N.setEstimate(s, 'housing', null, 'notForMe', T);
  assert.equal(N.estimateOf(s, 'housing').amount.kind, 'notForMe');
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
});

test('the day-by-day run and the summary skip a shadowed estimate the same way the cash flow does', () => {
  let s = demo();
  const before = summarize(s, R, { flags: false });
  // The demo already has housing lines, so a housing estimate changes nothing anywhere.
  s = N.setEstimate(s, 'housing', 2500, 'rough', T);
  const after = summarize(s, R, { flags: false });
  assert.equal(after.cashflow.expenses.total.value, before.cashflow.expenses.total.value);
  assert.equal(after.sheet.netWorth.value, before.sheet.netWorth.value);
  const simBefore = cashsim(demo(), R, { months: 2 }), simAfter = cashsim(s, R, { months: 2 });
  assert.equal(JSON.stringify(simAfter.safeToSpend), JSON.stringify(simBefore.safeToSpend), 'the day-by-day run is the same');
  assert.ok(!simAfter.model.bills.some((b) => b.id === 'est-housing'), 'the shadowed estimate is not a bill in the run');
  // No fun lines in the demo: a fun estimate counts there, as a want.
  s = N.setEstimate(s, 'fun', 150, 'rough', T);
  const cf = cashflow(s, R, '2026-10');
  assert.equal(cf.expenses.total.value, before.cashflow.expenses.total.value + 150);
  assert.equal(cf.expenses.need.value, before.cashflow.expenses.need.value, 'a want: not a need');
  assert.ok(cf.expenses.items.some((i) => i.id === 'est-fun' && i.estimate === 'fun'));
  assert.ok(!cf.expenses.items.some((i) => i.id === 'est-housing'), 'the shadowed one is not an item');
  assert.ok(cashsim(s, R, { months: 2 }).model.bills.some((b) => b.id === 'est-fun'), 'the counted estimate is a bill in the run');
});

test('My numbers groups Needs by the seven categories, the estimate first; every category is there', () => {
  let s = demo();
  s = N.setEstimate(s, 'food', 800, 'rough', T);
  const needs = ledgerTree(s, { names: [], aliases: {} }).find((n) => n.key === 'N');
  assert.deepEqual(needs.children.slice(0, 7).map((c) => c.label), ['Housing', 'Food', 'Getting around', 'Bills and subscriptions', 'Health', 'Fun', 'Other']);
  const food = needs.children.find((c) => c.key === 'N:food');
  assert.equal(food.children[0].id, 'est-food');
  assert.match(food.children[0].note, /Not counted/);
  assert.deepEqual(food.children.map((c) => c.id), ['est-food', 'groceries', 'dining']);
  assert.deepEqual(food.add, { collection: 'expenses', fat: 'food', category: 'food' });
  const sc = numbersScreens(ledgerTree(s, { names: [], aliases: {} }));
  assert.ok(screenAt(sc, ['needs', 'housing', 'rent']).item, 'a rent link still opens');
  assert.ok(screenAt(sc, ['needs', 'bills-and-subscriptions', 'phone']).item, 'the phone is a bill');
  assert.ok(screenAt(sc, ['needs', 'health', 'gym']).item);
  assert.ok(screenAt(sc, ['needs', 'fun']).group, 'an empty category is a screen too');
});

test('a line added from a category keeps it; the validator refuses a category it does not know', () => {
  let s = blank();
  const r = addItem(s, { collection: 'expenses', label: 'Haircuts', fat: null }, T);
  s = N.setCategory(r.spine, r.id, 'health');
  assert.equal(N.categoryOf(s.expenses.find((e) => e.id === r.id)), 'health');
  assert.ok(validate(s).ok);
  const bad = { ...s, expenses: s.expenses.map((e) => ({ ...e, category: 'pets' })) };
  assert.ok(validate(bad).errors.some((e) => e.path.endsWith('.category')));
  const badEst = { ...s, expenses: [{ ...s.expenses[0], estimate: 'housing', cadence: 'yearly' }] };
  assert.ok(validate(badEst).errors.some((e) => e.path.endsWith('.cadence')), 'an estimate is a month');
  s = N.setCategory(s, r.id, null);
  assert.equal(s.expenses[0].category, undefined);
});
