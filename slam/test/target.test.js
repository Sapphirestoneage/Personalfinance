// A target column on the Budget view (engine/target.js). The target is a saved scenario, read in memory beside
// today's plan; only Step toward target changes My numbers. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { editExpense, editIncome } from '../engine/edits.js';
import { valueOf } from '../engine/spine.js';
import { changeWords } from '../engine/profile.js';
import * as G from '../engine/target.js';

const R = loadRules();
const T = '2026-10-27';
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
// "Target: FI sooner": eating out down to $100, a $500 raise.
const target = (s) => editIncome(editExpense(s, 'dining', { amount: 100, kind: 'known' }, T), 'salary', { amount: 6500, kind: 'known' }, T);

test('the Target and To target columns: a changed line says how far, an unchanged one says same', () => {
  const s = demo(), t = target(s);
  const c = G.targetColumns(s, t, R, { ym: '2026-09' });
  assert.equal(c.lines.get('dining').target, 100);
  assert.equal(c.lines.get('dining').words, '$100 above target');
  assert.equal(c.lines.get('rent').words, 'same');
  assert.equal(c.cats.get('food').words, '$100 above target');
  assert.match(c.income.words, /below target$/, 'income can have a target too');
});

test('what the target buys, read in memory; My numbers never change by setting it', () => {
  const s = demo(), t = target(s);
  const before = JSON.stringify(s);
  const b = G.targetBuys(s, t, R);
  assert.ok(b.more > 0, 'more a month: ' + b.more);
  assert.match(b.words, /^At target: \$[\d,]+ more a month/);
  assert.ok(b.fiTarget <= b.fiNow, 'FI no later');
  assert.deepEqual(b.changes.map((x) => x.path).sort(), ['expenses.dining.amount', 'income.salary.amount']);
  assert.equal(JSON.stringify(s), before, 'the household is untouched');
});

test('step toward target: all the way, halfway, or an amount; a dated life change; the target stays', () => {
  const s = demo(), t = target(s), tt = JSON.stringify(t);
  const half = G.stepToward(s, t, 'expenses.dining.amount', 'half', T);
  assert.equal(valueOf(half.expenses.find((e) => e.id === 'dining').amount), 150);
  const lc = half.lifeChanges.at(-1);
  assert.equal(changeWords(lc), 'Eating out $200 to $150, toward a target of $100');
  assert.equal(valueOf(G.stepToward(s, t, 'expenses.dining.amount', 30, T).expenses.find((e) => e.id === 'dining').amount), 170);
  assert.equal(valueOf(G.stepToward(s, t, 'expenses.dining.amount', 'all', T).expenses.find((e) => e.id === 'dining').amount), 100);
  assert.equal(JSON.stringify(t), tt, 'the target stays as set');
});
