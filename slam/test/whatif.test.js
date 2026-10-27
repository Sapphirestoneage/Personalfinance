// What if (overnight Track F): each slider moves the household in memory the way it says, and the dates move.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { valueOf as v } from '../engine/spine.js';
import { whatIf, movedSpine, outcome } from '../engine/whatif.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('nothing moved is nothing changed', () => {
  const s = demo(), r = whatIf(s, R, {});
  assert.deepEqual(r.now, r.then);
});

test('spending less raises the surplus by that much, from the everyday lines only', () => {
  const s = demo(), m = movedSpine(s, R, { spendLess: 100 });
  const a = summarize(s, R, { flags: false }), b = summarize(m, R, { flags: false });
  assert.ok(Math.abs(b.cashflow.surplus.value - a.cashflow.surplus.value - 100) < 1);
  assert.equal(v(m.expenses.find((e) => e.id === 'rent').amount), v(s.expenses.find((e) => e.id === 'rent').amount), 'rent is fixed, untouched');
  assert.equal(s.expenses.length, m.expenses.length);
});

test('earning more raises gross by that much; extra at the debt and a windfall bring debt-free sooner', () => {
  const s = demo();
  const a = summarize(s, R, { flags: false }), b = summarize(movedSpine(s, R, { earnMore: 500 }), R, { flags: false });
  assert.ok(Math.abs(b.cashflow.income.gross.value - a.cashflow.income.gross.value - 500) < 1);
  assert.ok(b.cashflow.surplus.value > a.cashflow.surplus.value && b.cashflow.surplus.value < a.cashflow.surplus.value + 500, 'taxed');
  const d = whatIf(s, R, { extraDebt: 500 });
  assert.ok(d.then.debtFreeYm < d.now.debtFreeYm);
  assert.ok(d.then.interest < d.now.interest);
  const w = whatIf(s, R, { windfall: 20000 });
  assert.ok(w.then.debtFreeYm <= w.now.debtFreeYm);
  const ws = movedSpine(s, R, { windfall: 20000 });
  assert.ok(v(ws.debts.find((x) => x.id === 'visa').balance) < v(s.debts.find((x) => x.id === 'visa').balance), 'the card is paid down first');
  assert.ok(outcome(ws, R).fiYear <= outcome(s, R).fiYear);
});
