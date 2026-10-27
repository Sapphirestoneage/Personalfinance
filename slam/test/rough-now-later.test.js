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

test('check later hides a guess until its date; once the date passes it is check now and in homework', async () => {
  const E = await import('../engine/edits.js');
  const P = await import('../engine/profile.js');
  const path = 'expenses.rent.amount', base = setAt(demo(), path, rough(1950));
  const later = E.setCheck(base, path, 'later', '2099-01-01', '2026-10-27');
  assert.equal(itemOf(later, path).urgency, 'later');
  assert.equal(P.dueChecks(later, '2026-10-27').length, 0);
  const due = E.setCheck(base, path, 'later', '2020-01-01', '2019-10-01');
  assert.equal(itemOf(due, path).urgency, 'now');
  const hw = P.homeworkList(due, '2026-10-27').find((g) => g.where === 'Check again');
  assert.ok(hw && hw.items.length === 1);
  const now = E.setCheck(setAt(demo(), 'expenses.streaming.amount', rough(10)), 'expenses.streaming.amount', 'now', null, '2026-10-27');
  assert.equal(itemOf(now, 'expenses.streaming.amount').urgency, 'now');
});

test('an override survives a save and reload; old files without one load with the same numbers', () => {
  const path = 'expenses.rent.amount';
  const s = setAt(demo(), path, { ...rough(1950), check: { mode: 'later', until: '2099-01-01', set: '2026-10-27' } });
  const back = applyDefaults(loadHousehold(JSON.parse(JSON.stringify(s))), R);
  assert.deepEqual(back.expenses.find((e) => e.id === 'rent').amount.check, { mode: 'later', until: '2099-01-01', set: '2026-10-27' });
  assert.equal(itemOf(back, path).urgency, 'later');
  const old = demo();
  assert.deepEqual(stillGuessing(old, R).items.map((x) => x.path), stillGuessing(applyDefaults(loadHousehold(JSON.parse(JSON.stringify(old))), R), R).items.map((x) => x.path));
});
