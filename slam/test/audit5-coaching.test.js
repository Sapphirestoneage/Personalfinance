// Audit 5 (coaching): Before our first call opens with why now; stress is kept with its date so a later session can
// show the change; long answers keep their words; Send my answers shares the file when the phone can, and Copy my
// answers is there too. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson } from './spine-helpers.js';
import { LEVEL1, applyAnswer, answersOf } from '../engine/profile.js';

test('Why now comes first, with stress 1 to 10 and how often pay comes', () => {
  assert.deepEqual(LEVEL1.slice(0, 5).map((q) => q.id), ['reachOut', 'worthIt', 'stress', 'payOften', 'takeHome']);
  assert.deepEqual(LEVEL1.find((q) => q.id === 'payOften').options.map(([k]) => k), ['weekly', 'biweekly', 'semimonthly', 'monthly', 'varies']);
});

test('stress keeps its date and its history; a long answer keeps more than 40 letters', () => {
  const raw = readJson('fixtures/demo.json'); delete raw.profile;
  let s = applyAnswer(raw, 'stress', '8', { today: '2026-10-01' });
  s = applyAnswer(s, 'stress', '5', { today: '2026-12-01' });
  assert.equal(s.profile.stress.asOf, '2026-12-01');
  assert.deepEqual(s.lifeChanges.filter((c) => c.question === 'stress').map((c) => [c.date, c.from, c.to]), [['2026-10-01', null, '8'], ['2026-12-01', '8', '5']]);
  const long = 'My card balances keep creeping up and I want a plan before they get worse.';
  assert.equal(answersOf(applyAnswer(raw, 'reachOut', long, { today: '2026-10-01' })).reachOut, long);
});

test('Send my answers uses the share sheet when it can; Copy my answers is beside it', () => {
  const src = readFileSync(SLAM + 'ui/before.js', 'utf8');
  assert.match(src, /navigator\.canShare && navigator\.canShare\(\{ files: \[f\] \}\)/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.match(src, /'Copy my answers'/);
});

test('the demo household has a whole Profile', () => {
  const a = answersOf(readJson('fixtures/demo.json'));
  for (const k of ['reachOut', 'stress', 'firstName', 'home', 'work', 'debts', 'accounts', 'health', 'goals']) assert.ok(a[k] !== undefined, k);
  assert.equal(a.work, 'both'); // stored on the household's situation row (mixed)
});
