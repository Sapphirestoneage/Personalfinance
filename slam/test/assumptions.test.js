import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { applyDefaults } from '../engine/defaults.js';
import { editFact } from '../engine/edits.js';
import { GROUPS, ROWS, withClient, houseOf, setClientAssumption, resetClientAssumption, previewChange, formulasByRule } from '../engine/assumptions.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => loadHousehold(readJson('fixtures/demo.json'));
const T = '2026-10-27';

test('every assumption row is a house default, and the stage and scenario lines moved there (question 101)', () => {
  const house = new Set(readJson('data/house-defaults.json').rules.map((r) => r.id));
  const law = new Set(readJson('data/rules-2026.json').rules.map((r) => r.id));
  for (const r of ROWS.filter((x) => !x.reference)) assert.ok(house.has(r.id), r.id + ' is a house default');
  for (const id of house) assert.ok(!law.has(id), id + ' is not in the law file too');
  for (const id of ['STAGE_UTIL_RED', 'STAGE_CLIFF_MONTHS', 'SCENARIO_LIKELY_RETURN', 'SCENARIO_OPT_WR', 'APP_COAST_AGE']) assert.ok(house.has(id), id);
  assert.deepEqual(GROUPS.map((g) => g.label), ['Your method', 'When a stage turns red, yellow or green', 'Order and allocations', 'Future guesses', 'Typical amounts', 'Rules']);
});

test('for this client: an override every engine reads, Reset goes back to the default, nothing typed changes', () => {
  let s = demo();
  const typedApr = s.debts.find((d) => d.id === 'store').apr.value;
  s = setClientAssumption(s, 'DEFAULT_CARD_APR', 0.2, T);
  const C = withClient(R, s);
  assert.equal(C.get('DEFAULT_CARD_APR', 2026), 0.2);
  assert.equal(houseOf(C).get('DEFAULT_CARD_APR', 2026), 0.25, 'the house default is still there');
  assert.equal(C.meta('DEFAULT_CARD_APR', 2026).client, true);
  // A blank card rate is filled from the client's own default; a typed one is never touched.
  s = applyDefaults(editFact(s, 'debts.visa.apr', 'clear', { today: T }), C);
  assert.equal(s.debts.find((d) => d.id === 'visa').apr.value, 0.2);
  assert.equal(s.debts.find((d) => d.id === 'store').apr.value, typedApr);
  assert.ok(validate(s).ok);
  s = resetClientAssumption(s, 'DEFAULT_CARD_APR');
  assert.equal(s.assumptionOverrides, undefined);
  assert.equal(withClient(R, s), R, 'no overrides: the house rules as they are');
  assert.throws(() => setClientAssumption(s, 'K401_DEF', 1, T), /Not an assumption/);
});

test('before and after: a change shows the numbers it moves on this household; formulas name the rules they read', () => {
  const s = demo();
  const moved = previewChange(s, R, 'APP_RULE_OF_5', 6);
  assert.ok(moved.length >= 1 && moved.length <= 2);
  assert.ok(moved.every((m) => m.before !== m.after));
  const f = formulasByRule({ spine: s, rules: R });
  assert.ok((f.get('APP_RULE_OF_5') || []).length, 'the Rule of 5 is read by a formula');
});
