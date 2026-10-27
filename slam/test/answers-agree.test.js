// Answers that agree (owner's ask, 2026-10-27: "if I'm unemployed how do I have employer health insurance... make sure
// everything is logically consistent"). Work and health are stored once, on the household's "now" rows; choices that
// contradict the other answers are not offered; what still disagrees is listed on Profile. Every household is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { getAt, valueOf as v } from '../engine/spine.js';
import * as P from '../engine/profile.js';

const T = '2026-10-27';
const demo = () => loadHousehold(readJson('fixtures/demo.json'));

test('work and health are one stored answer: Profile and My numbers can never disagree', () => {
  let s = P.applyAnswer(demo(), 'work', 'between', { today: T });
  assert.equal(v(getAt(s, 'household.situation.now.value')), 'between_jobs');
  assert.equal(s.profile.work, undefined, 'never kept twice');
  s = P.applyAnswer(s, 'health', 'marketplace', { today: T });
  assert.equal(v(getAt(s, 'household.healthCoverage.now.value')), 'marketplace');
  assert.equal(P.answersOf(s).health, 'marketplace');
  assert.ok(P.HOUSEHOLD_ANSWERS.work(s) === 'household.situation.now.value', 'My numbers shows the row read-only, from Profile');
});

test('an older file with both copies loads with the client answer on the household', () => {
  const raw = readJson('fixtures/demo.json');
  raw.household.situation[0].value.value = 'employed';
  raw.profile.work = { value: 'between', asOf: '2026-10-01', source: 'demo (made up)', kind: 'known', by: 'client' };
  const s = loadHousehold(raw);
  assert.equal(v(getAt(s, 'household.situation.now.value')), 'between_jobs');
  assert.equal(s.profile.work, undefined);
});

test('not working: health "Work" reads as a past job, and cover "Through work" is not offered', () => {
  const a = { work: 'between' };
  const health = P.choicesFor(P.questionById('health'), a);
  assert.match(health.options.find(([k]) => k === 'work')[1], /past job/);
  assert.ok(!P.choicesFor(P.questionById('disability'), a).options.some(([k]) => k === 'work'));
  assert.ok(P.choicesFor(P.questionById('disability'), { work: 'w2' }).options.some(([k]) => k === 'work'));
  assert.ok(P.choicesFor(P.questionById('lifeInsurance'), { work: 'retired', lifeInsurance: 'work' }).options.some(([k]) => k === 'work'), 'a picked answer stays visible');
});

test('the demo agrees with itself; a job that ended still paying is listed on Profile', () => {
  assert.deepEqual(P.disagreements(demo(), T), []);
  const s = P.applyAnswer(demo(), 'work', 'between', { today: T });
  const odd = P.disagreements(s, T).map((x) => x.words).join(' | ');
  assert.match(odd, /Disability insurance is through work/);
  assert.match(odd, /still coming in/);
});
