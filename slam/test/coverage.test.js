// On a parent's health plan (S-073): premiums don't apply while the client is
// 25 or younger. Age = the working month's year minus the birth year.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findLine, findCategory, renameLine } from '../src/store/edits.js';
import { budgetModel } from '../src/calc/model.js';
import { buildSummary } from '../src/calc/summary.js';
import { parentsPlan } from '../src/calc/coverage.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

function client(birthYear, onPlan = true) {
  const d = newHousehold('Plan');
  d.currentMonth = '2026-09';
  d.profile.birthYear = birthYear;
  d.household.parentsPlan = onPlan;
  findLine(d, 'premiums').line.estimate = makeValue(300);
  findLine(d, 'out-of-pocket').line.estimate = makeValue(40);
  return d;
}
const health = (d) => budgetModel(d).categories.find((c) => c.id === 'health').estimate.amount;

test('24 and on a parent plan: premiums do not apply, Health = out of pocket 40', () => {
  const d = client(2002); // 2026 - 2002 = 24
  assert.deepEqual(parentsPlan(d), { age: 24, eligible: true, chosen: true, on: true, agedOut: false });
  assert.equal(health(d), 40); // premiums 0 + out of pocket 40
  const prem = buildSummary(d, refs).items.find((i) => i.key === 'act:premiums');
  assert.equal(prem.status, 'not-for-me', 'covered premiums count as answered');
  assert.deepEqual(validateHousehold(d), []);
});

test('25 is the last year it is offered; 26 ages off and premiums count again', () => {
  assert.equal(health(client(2001)), 40); // 2026 - 2001 = 25: still covered
  const d = client(2000); // 26
  assert.equal(parentsPlan(d).agedOut, true);
  assert.equal(health(d), 340); // 300 + 40
});

test('no birth year, or not chosen: nothing changes', () => {
  assert.equal(health(client(null)), 340);
  assert.equal(parentsPlan(client(null)).eligible, false);
  assert.equal(health(client(2002, false)), 340);
});

test('it follows the line type, not the name', () => {
  const d = client(2002);
  renameLine(d, 'premiums', "Mom's plan premium");
  assert.equal(findLine(d, 'premiums').line.type, 'health-insurance');
  assert.equal(health(d), 40);
});

test('compat: files before this load as not on a parent plan', () => {
  const raw = JSON.parse(JSON.stringify(client(2002)));
  delete raw.household.parentsPlan;
  const m = migrate(raw);
  assert.equal(m.household.parentsPlan, false);
  assert.equal(findCategory(m, 'health').lines.length, 3);
});
