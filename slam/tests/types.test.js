// Names are the client's own; types are what the math follows (S-068).
// Checks that renaming keeps a type, that a type decides what counts toward FAT and spending by
// type, how a new line's type is guessed from its name, and that files from before types get one.
// Depends on the store (schema, value, edits, validate, migrate, types), buildSummary from the
// summary engine, and tests/helpers.js for the reference data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { addCategory, addLine, findLine, findCategory, renameLine } from '../src/store/edits.js';
import { buildSummary } from '../src/engines/summary.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { guessLineType } from '../src/store/types.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

test('renaming a category or line keeps what it counts as', () => {
  const d = newHousehold('Names');
  d.income.push({ ...d.income[0], id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: makeValue(4000), gross: makeValue(), deductions: [], hoursPerWeek: null, state: 'active' });
  findCategory(d, 'food').name = 'Eats';
  findCategory(d, 'food').estimate = makeValue(500);
  renameLine(d, 'transit', 'MetroCard');
  findLine(d, 'transit').line.estimate = makeValue(132);
  findCategory(d, 'housing').estimate = makeValue(1500);
  const s = buildSummary(d, refs);
  assert.equal(findLine(d, 'transit').line.type, 'public-transit');
  // FAT = housing 1,500 + food ("Eats") 500 + transport (MetroCard) 132 = 2,132
  assert.equal(s.totals.fat, 2132);
});

test('a new category counts once it has a type: a second Housing category adds to housing and FAT', () => {
  const d = newHousehold('Two homes');
  findCategory(d, 'housing').estimate = makeValue(1200);
  const storage = addCategory(d, 'Storage unit');
  storage.estimate = makeValue(80);
  let s = buildSummary(d, refs);
  assert.equal(s.totals.fat, 1200, 'type Other: not in FAT yet');
  storage.type = 'housing';
  s = buildSummary(d, refs);
  // 1,200 + 80 = 1,280 for housing and FAT
  assert.deepEqual([s.totals.housing, s.totals.fat], [1280, 1280]);
  assert.deepEqual(validateHousehold(d), []);
});

test('new lines get a type from their name; renaming an Other line guesses one', () => {
  const d = newHousehold('Lines');
  assert.equal(addLine(d, 'transport', 'Coach bus ticket').type, 'public-transit');
  assert.equal(addLine(d, 'transport', 'Uber').type, 'rideshare');
  const l = addLine(d, 'fun', 'New line');
  assert.equal(l.type, 'other');
  renameLine(d, l.id, 'Climbing gym');
  assert.equal(l.type, 'fitness');
  renameLine(d, l.id, 'Bouldering');
  assert.equal(l.type, 'fitness', 'once typed, renaming never changes it');
  assert.equal(guessLineType('Travel fund', 'savings'), 'savings-goal');
});

test('spending by type adds lines of one type across categories', () => {
  const d = newHousehold('Types');
  findLine(d, 'gas').line.estimate = makeValue(100);
  const trip = addLine(d, 'fun', 'Road trip gas');
  assert.equal(trip.type, 'travel'); // "trip" wins the guess; the coach sets it
  trip.type = 'gas';
  trip.estimate = makeValue(40);
  findCategory(d, 'bills').estimate = makeValue(60);
  const rows = buildSummary(d, refs).totals.spendByType;
  const gas = rows.find((r) => r.type === 'gas');
  // Gas & Fuel: 100 + 40 = 140 from two categories; Bills as one number: 60
  assert.equal(gas.amount, 140);
  assert.equal(rows.find((r) => r.type === 'cat:bills').amount, 60);
});

test('compat: files before types get them from default ids, else from the name', () => {
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  for (const c of raw.categories) { delete c.type; for (const l of c.lines) delete l.type; }
  raw.categories[0].lines.push({ id: 'line-x', name: 'Electric bill' });
  raw.categories.push({ id: 'cat-x', name: 'Mine', lines: [] });
  const m = migrate(raw);
  assert.equal(findCategory(m, 'transport').type, 'transport');
  assert.equal(findCategory(m, 'cat-x').type, 'other');
  assert.equal(findLine(m, 'transit').line.type, 'public-transit');
  assert.equal(findLine(m, 'line-x').line.type, 'utilities');
  assert.deepEqual(validateHousehold(m), []);
});
