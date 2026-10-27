// One emergency target (morning answer 4, S-246): a goal named or kinded as an emergency fund or cushion is the Plan's
// reserve step (its target is the step's target), never a goal of its own; an old file with one still loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize, sessionSteps } from '../engine/summary.js';
import { fooLadder, goalsView } from '../engine/plan.js';
import { isEmergencyGoal } from '../engine/emergency.js';
import { validate } from '../engine/schema.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const K = (value) => ({ value, kind: 'known', asOf: '2026-10-01', source: 'test' });
const withGoal = (g) => { const s = demo(); s.goals = [...s.goals, g]; return s; };

test('the demo has no cushion goal any more; its reserve step is the Rule of 5 target', () => {
  const s = demo();
  assert.ok(!s.goals.some(isEmergencyGoal));
  assert.equal(summarize(s, R, { flags: false }).emergency.fromGoal, null);
});

test('an old file\'s "Six-month cushion" goal sets the reserve step\'s target and is not counted again', () => {
  const s = withGoal({ id: 'cushion', type: 'savings', label: 'Six-month cushion', target: K(20000) });
  assert.deepEqual(validate(s).errors.filter((e) => /goals/.test(e.path)), []);
  const x = summarize(s, R, { flags: false });
  assert.equal(x.emergency.targetDollars.value, 20000);
  assert.equal(x.emergency.gap.value, Math.max(0, 20000 - x.sheet.cash.value));
  assert.equal(x.emergency.fromGoal.label, 'Six-month cushion');
  const f = fooLadder(s, R, x);
  assert.equal(f.rungs.find((r) => r.id === 'reserves').need, x.emergency.gap.value);
  assert.match(f.rungs.find((r) => r.id === 'reserves').why, /your goal "Six-month cushion"/);
  assert.equal(f.rungs.find((r) => r.id === 'prepaid').need, 0, 'not a big cost ahead too');
  assert.ok(!goalsView(s, R, x).rows.some((r) => r.id === 'cushion'));
  assert.equal(sessionSteps(s, x)[4].result.value, null, 'not in the goals total');
});

test('which goals merge: an emergency kind, or emergency fund, cushion or rainy day in the name', () => {
  assert.ok(isEmergencyGoal({ type: 'emergency', label: 'Safety net' }));
  assert.ok(isEmergencyGoal({ type: 'savings', label: 'Emergency fund' }));
  assert.ok(isEmergencyGoal({ type: 'other', label: 'Rainy-day money' }));
  assert.ok(!isEmergencyGoal({ type: 'savings', label: 'Trip to Japan' }));
  assert.ok(!isEmergencyGoal({ type: 'payoff', label: 'Cushion card payoff' }));
  assert.ok(!isEmergencyGoal({ type: 'fi', label: 'Financial independence' }));
});
