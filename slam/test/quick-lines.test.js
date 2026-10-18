// Quick lines (S-122): several sub-categories typed at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickLines } from '../src/calc/quick-lines.js';
import { newHousehold } from '../src/store/schema.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { addLines, findCategory } from '../src/store/edits.js';

test('names and amounts, with or without commas, and "split"', () => {
  assert.deepEqual(parseQuickLines('claude 216 spotify 21 youtube 27'), [
    { name: 'Claude', amount: 216, shared: false }, { name: 'Spotify', amount: 21, shared: false }, { name: 'Youtube', amount: 27, shared: false }]);
  assert.deepEqual(parseQuickLines('Netflix $15.49, gym 40 split; Amazon Prime 1,200'), [
    { name: 'Netflix', amount: 15.49, shared: false }, { name: 'Gym', amount: 40, shared: true }, { name: 'Amazon Prime', amount: 1200, shared: false }]);
  // A name with no amount is kept, blank (empty is not zero).
  assert.deepEqual(parseQuickLines('hulu, max 10'), [{ name: 'Hulu', amount: null, shared: false }, { name: 'Max', amount: 10, shared: false }]);
  assert.deepEqual(parseQuickLines('   '), []);
});

test('they become lines, "roughly", with a type from the name, in one step', () => {
  const d = migrate(newHousehold('Quick'));
  const before = findCategory(d, 'bills').lines.length;
  addLines(d, 'bills', parseQuickLines('claude 216 spotify 21 split youtube 27'));
  const added = findCategory(d, 'bills').lines.slice(before);
  assert.deepEqual(added.map((l) => [l.name, l.estimate.amount, l.estimate.status, l.shared]), [['Claude', 216, 'roughly', false], ['Spotify', 21, 'roughly', true], ['Youtube', 27, 'roughly', false]]);
  assert.equal(added[1].type, 'subscriptions');
  assert.deepEqual(validateHousehold(d), []);
});
