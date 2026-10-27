import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { summarize } from '../engine/summary.js';
import { applyDefaults } from '../engine/defaults.js';
import { applyAnswer } from '../engine/profile.js';
import { rankSteps } from '../engine/next-step.js';
import { readJson, loadRules, SLAM } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const rank = (s) => rankSteps(s, R, summarize(s, R));

test('one ranking by dollars lost a month: the deferred-interest Store card leads the demo, then the Visa; a missing number is a question', () => {
  const r = rank(demo());
  // Krug pass: $1,200 at 29.99% charged back over 12 months ($360) spread over the 4 months left, plus a month of
  // interest after: about $120 a month, more than the Visa's $55.
  assert.equal(r.first.id, 'promo:store');
  assert.ok(r.first.loss > 55);
  assert.equal(r.steps[1].id, 'interest:visa');
  assert.equal(r.steps[1].loss, 55);
  assert.ok(r.steps.every((x) => !x.id.startsWith('ask:')));
  assert.deepEqual(r.questions.map((q) => q.question), ['What is your highest insurance deductible?']);
  assert.ok(!r.steps.some((x) => x.id === 'interest:sl'), 'debt under the high-rate line keeps its place in the order');
});

test('card use leads only when they plan to apply for credit within a year', () => {
  let s = demo();
  assert.notEqual(rank(s).first.id, 'utilization');
  s = applyAnswer(s, 'applyCredit', 'yes', { today: '2026-10-27', by: 'coach' });
  assert.equal(rank(s).first.id, 'utilization', 'cards at 35% of their limits come first before applying');
});

test('Today\'s Next step, Do first and the Plan\'s NEXT read the one ranking', () => {
  assert.match(readFileSync(SLAM + 'ui/dashboard.js', 'utf8'), /rankSteps\(spine, rules, s/);
  assert.match(readFileSync(SLAM + 'ui/plan.js', 'utf8'), /current: rank\.first && rank\.first\.rung \? rank\.first\.rung : foo\.current/);
});
