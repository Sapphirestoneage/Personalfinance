// The monthly plan store (S-076): create, edit, carry forward, stop tracking,
// migration, and the rule that nothing in review ever changes an estimate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold, SCHEMA_VERSION } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findLine, findCategory } from '../src/store/edits.js';
import { switchMonth } from '../src/store/months.js';
import { startPlan, setPlanAmount, setPlanDecision, setPlanReviewed, setPlanStop, addPlanLine, addPlanCategory, planLineByLine, copyPlanForward, getPlan } from '../src/store/plans.js';
import { planStartValues, planView } from '../src/calc/plan.js';
import { buildSummary } from '../src/calc/summary.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { loadRefs, loadHousehold } from './helpers.js';

const refs = loadRefs();
const estimates = (d) => JSON.stringify(d.categories.map((c) => [c.id, c.estimate, c.lines.map((l) => [l.id, l.estimate])]));

function base() {
  const d = newHousehold('Plan');
  d.currentMonth = '2026-09';
  findLine(d, 'groceries').line.estimate = makeValue(300);
  findLine(d, 'groceries').line.actual = makeValue(380);
  findLine(d, 'eating-out').line.estimate = makeValue(200);
  findLine(d, 'eating-out').line.actual = makeValue(340);
  return d;
}

test('create from actuals, then keep, cut, change, and review', () => {
  const d = base();
  const s = buildSummary(d, refs);
  startPlan(d, '2026-10', 'actuals', planStartValues(d, s.history, 'actuals', '2026-09', '2026-10'));
  const p = getPlan(d, '2026-10');
  assert.deepEqual(Object.keys(p.lines).sort(), ['eating-out', 'groceries']);
  assert.equal(p.lines.groceries.amount.amount, 380);
  setPlanAmount(d, '2026-10', 'eating-out', makeValue(280));
  assert.equal(p.lines['eating-out'].decision, 'change', 'typing an amount is a change');
  setPlanDecision(d, '2026-10', 'groceries', 'cut');
  assert.equal(p.lines.groceries.amount.amount, 0);
  setPlanDecision(d, '2026-10', 'groceries', 'keep');
  assert.equal(p.lines.groceries.amount.amount, 380, 'keep goes back to the starting amount');
  setPlanReviewed(d, '2026-10', 'groceries', true);
  assert.equal(p.lines.groceries.reviewed, true);
  // October plan: food 380 + 280 = 660
  assert.equal(planView(d, '2026-10').cats.food.amount, 660);
  assert.throws(() => startPlan(d, '2026-10', 'actuals', {}), /already a plan/);
  assert.deepEqual(validateHousehold(d), []);
});

test('a line added in review is a real line, new, with a blank estimate, and not part of earlier months', () => {
  const d = base();
  startPlan(d, '2026-10', 'estimates', {});
  const line = addPlanLine(d, '2026-10', 'food', 'Cooking class');
  setPlanAmount(d, '2026-10', line.id, makeValue(60));
  assert.equal(getPlan(d, '2026-10').lines[line.id].decision, 'new', 'new stays new when its amount is typed');
  assert.equal(line.estimate.amount, null);
  assert.equal(line.addedFor, '2026-10');
  const sep = buildSummary(d, refs).rows.find((r) => r.id === 'food');
  assert.ok(!sep.lines.some((l) => l.id === line.id), 'September does not include it');
  assert.equal(planView(d, '2026-10').cats.food.amount, 60);
  const cat = addPlanCategory(d, 'Garden');
  assert.ok(findCategory(d, cat.id));
  assert.deepEqual(validateHousehold(d), []);
});

test('copy forward: same amounts, decisions back to keep, nothing reviewed, stopped lines left out', () => {
  const d = base();
  startPlan(d, '2026-10', 'actuals', { groceries: makeValue(380), 'eating-out': makeValue(340) });
  setPlanAmount(d, '2026-10', 'eating-out', makeValue(280));
  setPlanReviewed(d, '2026-10', 'eating-out', true);
  setPlanDecision(d, '2026-10', 'groceries', 'cut');
  setPlanStop(d, '2026-10', 'groceries', true);
  copyPlanForward(d, '2026-10');
  const nov = getPlan(d, '2026-11');
  assert.equal(nov.createdFrom, 'plan:2026-10');
  assert.deepEqual(Object.keys(nov.lines), ['eating-out']);
  assert.deepEqual([nov.lines['eating-out'].amount.amount, nov.lines['eating-out'].decision, nov.lines['eating-out'].reviewed], [280, 'keep', false]);
});

test('stop tracking archives the line when the plan month starts; history is untouched', () => {
  const d = base();
  startPlan(d, '2026-10', 'actuals', { groceries: makeValue(380) });
  assert.throws(() => setPlanStop(d, '2026-10', 'groceries', true), /Cut the line first/);
  setPlanDecision(d, '2026-10', 'groceries', 'cut');
  setPlanStop(d, '2026-10', 'groceries', true);
  assert.equal(findLine(d, 'groceries').line.state, 'active', 'still tracked in September');
  switchMonth(d, '2026-10');
  assert.equal(findLine(d, 'groceries').line.state, 'archived');
  assert.equal(d.monthActuals['2026-09'].groceries.amount, 380, "September's actual is kept");
});

test('a category planned as one number, then line by line', () => {
  const d = base();
  findCategory(d, 'housing').estimate = makeValue(1500);
  const s = buildSummary(d, refs);
  const values = planStartValues(d, s.history, 'estimates', '2026-09', '2026-10');
  assert.equal(values['cat:housing'].amount, 1500);
  startPlan(d, '2026-10', 'estimates', values);
  assert.equal(planView(d, '2026-10').cats.housing.amount, 1500);
  planLineByLine(d, '2026-10', 'housing');
  assert.equal(planView(d, '2026-10').cats.housing.amount, null, 'no line plans yet: blank, not 0');
});

test('nothing in review changes an estimate', () => {
  const d = loadHousehold('maya');
  const before = estimates(d);
  const s = buildSummary(d, refs);
  const values = planStartValues(d, s.history, 'estimates', '2026-10', '2026-11');
  startPlan(d, '2026-11', 'estimates', values);
  setPlanAmount(d, '2026-10', 'groceries', makeValue(999));
  setPlanDecision(d, '2026-10', 'shopping', 'cut');
  setPlanStop(d, '2026-10', 'shopping', true);
  setPlanDecision(d, '2026-10', 'shopping', 'keep');
  setPlanReviewed(d, '2026-10', 'giving-line', true);
  planLineByLine(d, '2026-10', 'food');
  addPlanLine(d, '2026-11', 'fun', 'Pottery');
  copyPlanForward(d, '2026-11');
  const after = JSON.parse(estimates(d));
  const was = JSON.parse(before);
  // every estimate that existed is identical; the only addition is the new line, whose estimate is blank
  for (const [id, est, lines] of was) {
    const now = after.find((x) => x[0] === id);
    assert.deepEqual(now[1], est, id + ' estimate');
    for (const [lid, le] of lines) assert.deepEqual(now[2].find((x) => x[0] === lid)[1], le, lid + ' estimate');
  }
  assert.deepEqual(validateHousehold(d), []);
});

test('migration to schema 4: older files load with no plans', () => {
  const v3 = JSON.parse(JSON.stringify(newHousehold('Old')));
  v3.schemaVersion = 3;
  delete v3.plans;
  for (const c of v3.categories) for (const l of c.lines) delete l.addedFor;
  const m = migrate(v3);
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(m.plans, {});
  assert.equal(findLine(m, 'rent').line.addedFor, null);
  assert.deepEqual(validateHousehold(m), []);
  const maya = loadHousehold('maya');
  assert.equal(Object.keys(maya.plans).length, 2, 'Maya keeps both plans through migration');
  assert.deepEqual(validateHousehold(maya), []);
});

test('joy or purpose counts savings lines too (the positives); stress is rated on its own', () => {
  const d = base();
  findLine(d, 'groceries').line.joy = 6;
  findLine(d, 'emergency-fund').line.joy = 9;
  findLine(d, 'emergency-fund').line.actual = makeValue(200);
  findLine(d, 'eating-out').line.joy = 5;
  findLine(d, 'eating-out').line.stress = 9;
  const s = buildSummary(d, refs);
  // points = 6 + 9 + 5 = 20; emergency fund 9 / 20 = 0.45 of happiness
  assert.equal(s.happinessPoints, 20);
  const ef = s.rows.find((r) => r.id === 'savings').lines.find((l) => l.id === 'emergency-fund');
  assert.equal(ef.happiness.share, 0.45);
  // eating out: 5 - 9 = -4, less of; drain (9 - 5) x (340 / 100) = 13.6
  assert.deepEqual([s.stress.byId['eating-out'].lean, s.stress.lookFirst[0].id], ['less', 'eating-out']);
  assert.ok(Math.abs(s.stress.lookFirst[0].drain - 13.6) < 1e-9);
});
