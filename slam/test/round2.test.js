// Overnight round 2 fixes that are money facts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { fooLadder } from '../engine/plan.js';
import { scenarioLines, fiPath } from '../engine/charts.js';
import { withScenario } from '../engine/scenarios.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('a promo card with a high rate after is in the high-interest step only, never also the low-interest step', () => {
  const s = demo(), f = fooLadder(s, R, summarize(s, R));
  const hi = f.rungs.find((r) => r.id === 'highInterest'), lo = f.rungs.find((r) => r.id === 'lowInterest');
  assert.ok(hi.ids.includes('store'));
  assert.ok(!lo.ids.includes('store'));
  assert.equal(lo.need, 20000, 'the student loan alone');
});

test('the scenario lines and the FI path read one projection: net worth is not below invested money', () => {
  const s = demo(), lines = scenarioLines(s, R, { years: 25 });
  const std = lines.find((l) => l.id === 'likely');
  const sp = withScenario(s, R, 'likely'), f = fiPath(sp, R, summarize(sp, R));
  for (const [y, inv] of f.invested.filter(([y]) => y >= +s.meta.asOf.slice(0, 4) + 5)) {
    const nw = (std.points.find((p) => p[0] === y) || [])[1];
    if (nw !== undefined) assert.ok(nw >= inv - 1, y + ': net worth ' + nw + ' against invested ' + inv);
  }
});
