import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { applyAnswer } from '../engine/profile.js';
import { readJson, SLAM } from './spine-helpers.js';

const demo = () => loadHousehold(readJson('fixtures/demo.json'));
const T = '2026-10-27';

test('living with family asks whose family, and the cover names them (question 96)', () => {
  let s = demo();
  s = applyAnswer(s, 'home', 'family', { today: T, by: 'coach' });
  s = applyAnswer(s, 'familyPay', 'nothing', { today: T, by: 'coach' });
  const by = (x) => { const e = x.expenses.find((e) => e.id === 'utilities'); return e.coveredBy ? e.coveredBy.value : null; };
  assert.equal(by(s), 'Family', 'unsaid reads Family');
  s = applyAnswer(s, 'whoseFamily', 'partner', { today: T, by: 'coach' });
  assert.equal(by(s), 'Partner\'s family');
  s = applyAnswer(s, 'whoseFamily', 'parents', { today: T, by: 'coach' });
  assert.equal(by(s), 'Parents');
  s = applyAnswer(s, 'home', 'rent', { today: T, by: 'coach' });
  assert.equal(by(s), null, 'moving out takes the cover the profile set away');
});

test('Profile (under Home, from the client menu) has five groups that open their own screens', () => {
  const src = readFileSync(SLAM + 'ui/profile.js', 'utf8');
  for (const [href, name] of [['#/life', 'Your life'], ['#/homework', 'Homework'], ['assumptions.html', 'Your assumptions'], ['#/goals', 'FI assumptions'], ['#/prefs', 'Preferences']]) assert.ok(src.includes("goRow('" + href + "'") && src.includes("'" + name + "'"), name);
  assert.match(src, /tab: null, title: 'Profile'/);
});
