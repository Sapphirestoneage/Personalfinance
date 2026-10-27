// Rough now and rough later: whether a guess matters now, beside how sure it is. One rule (engine/ledger.js checkNow,
// Show the math "checkNow:<path>"); an override on the Fact wins until its date. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { stillGuessing } from '../engine/ledger.js';
import { explainMetric } from '../engine/math.js';
import { setAt } from '../engine/spine.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const rough = (v) => ({ value: v, kind: 'rough', asOf: '2026-10-22', source: 'test' });
const itemOf = (s, path) => stillGuessing(s, R).items.find((x) => x.path === path);

test('a $10 guess is fine for now; a $1,950 rent guess is worth checking now', () => {
  let s = setAt(demo(), 'expenses.rent.amount', rough(1950));
  s = setAt(s, 'expenses.streaming.amount', rough(10));
  assert.equal(itemOf(s, 'expenses.rent.amount').urgency, 'now');
  assert.equal(itemOf(s, 'expenses.streaming.amount').urgency, 'fine');
});

test('a missing number nothing reads yet is fine for now, never first', () => {
  const g = stillGuessing(demo(), R);
  const fineMissing = g.items.filter((x) => x.kind === 'missing' && !x.blocks.length);
  assert.ok(fineMissing.every((x) => x.urgency === 'fine'));
});

test('Show the math explains the rule for a guess', () => {
  const s = setAt(demo(), 'expenses.rent.amount', rough(1950));
  const guess = stillGuessing(s, R);
  const e = explainMetric('checkNow:expenses.rent.amount', { spine: s, rules: R, guess });
  assert.ok(e.value >= 100);
  assert.deepEqual(e.rules.sort(), ['APP_GUESS_SWING', 'APP_MATERIALITY']);
});
