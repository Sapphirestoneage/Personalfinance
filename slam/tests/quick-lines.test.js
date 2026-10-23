// Quick lines (S-122): several sub-categories typed at once, how they become lines, archiving a removed
// line (S-123), and split lines (S-134, S-138). Uses parseQuickLines in engines/quick-lines.js, splitOf in
// engines/split.js, budgetModel and buildSummary, the store (schema, migrate, validate, edits, value), the
// October fixture (tests/fixtures/october.js), and the helpers, which load the reference data in src/data
// and the Luis demo household in src/data/households.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickLines } from '../src/engines/quick-lines.js';
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

test('Removing a sub-category archives it (S-123): out of the totals, kept for past months', async () => {
  const { october } = await import('./fixtures/october.js');
  const { addLines, removeLine, findLine } = await import('../src/store/edits.js');
  const { budgetModel } = await import('../src/engines/model.js');
  const d = october();
  const [extra] = addLines(d, 'bills', [{ name: 'New line', amount: 12, shared: false }]);
  const lineIds = () => budgetModel(d).categories.find((c) => c.id === 'bills').lines.map((l) => l.id);
  assert.ok(lineIds().includes(extra.id));
  removeLine(d, extra.id);
  // Gone from the budget, still in the file (state archived).
  assert.equal(lineIds().includes(extra.id), false);
  assert.equal(findLine(d, extra.id).line.state, 'archived');
});

test('a split line: with how many people, your share, and the whole bill (S-134)', async () => {
  const { splitOf } = await import('../src/engines/split.js');
  const { makeValue } = await import('../src/store/value.js');
  const one = (n) => makeValue(n, { cadence: 'one-off' });
  const line = { shared: true, splitPeople: one(3), splitShare: makeValue(null, { cadence: 'one-off' }) };
  // 21 a month with 3 others: an even share is 100 / 4 = 25%; the whole bill 21 / 0.25 = 84.
  assert.deepEqual(splitOf(line, 21), { pays: 'part', people: 3, share: 25, shareFrom: 'even', yours: 21, whole: 84, paidBack: null });
  // With 2 others: 100 / 3 = 33.333..., 33.33%; 21 / 0.3333 = 63.006..., 63.01.
  line.splitPeople = one(2);
  assert.deepEqual([splitOf(line, 21).share, splitOf(line, 21).whole], [33.33, 63.01]);
  // A typed share wins: 40% of a bill you pay 21 of: 21 / 0.4 = 52.50.
  line.splitShare = one(40);
  assert.deepEqual([splitOf(line, 21).share, splitOf(line, 21).shareFrom, splitOf(line, 21).whole], [40, 'typed', 52.5]);
  // Not split: nothing. No people and no share: blank, never 0.
  assert.equal(splitOf({ shared: false }, 21), null);
  assert.deepEqual(splitOf({ shared: true, splitPeople: makeValue(null), splitShare: makeValue(null) }, 21), { pays: 'part', people: null, share: null, shareFrom: null, yours: 21, whole: null, paidBack: null });
});

test('a split you pay in full: your part counts, the rest is paid back (S-138)', async () => {
  const { splitOf } = await import('../src/engines/split.js');
  const { makeValue } = await import('../src/store/value.js');
  const { loadHousehold, loadRefs } = await import('./helpers.js');
  const { buildSummary } = await import('../src/engines/summary.js');
  const one = (n) => makeValue(n, { cadence: 'one-off' });
  const line = { shared: true, splitPays: 'whole', splitPeople: one(3), splitShare: makeValue(null, { cadence: 'one-off' }) };
  // The whole 84 on your card, 3 others: share 25%, your part 84 x 0.25 = 21, paid back 84 - 21 = 63.
  assert.deepEqual(splitOf(line, 84), { pays: 'whole', people: 3, share: 25, shareFrom: 'even', yours: 21, whole: 84, paidBack: 63 });
  // 100 with 2 others: share 33.33%, your part 100 x 0.3333 = 33.33, paid back 100 - 33.33 = 66.67.
  line.splitPeople = one(2);
  assert.deepEqual([splitOf(line, 100).yours, splitOf(line, 100).paidBack], [33.33, 66.67]);
  // No people and no share yet: all of it is yours (you owe the whole bill); nothing paid back yet.
  line.splitPeople = one(null);
  assert.deepEqual([splitOf(line, 84).yours, splitOf(line, 84).paidBack], [84, null]);
  // In the budget (Luis): utilities 160 typed as the whole bill, split with 1 other: share 50%, your part
  // 160 x 0.5 = 80. Spending basis 3,828.46 - 160 + 80 = 3,748.46; surplus 571.54 + 80 = 651.54 (3,828.46
  // and 571.54 are Luis's spending and surplus, worked out in src/data/households/luis.expected.js).
  const d = loadHousehold('luis');
  const u = d.categories.find((c) => c.id === 'housing').lines.find((l) => l.id === 'utilities');
  Object.assign(u, { shared: true, splitPays: 'whole', splitPeople: one(1) });
  const t = buildSummary(d, loadRefs()).totals;
  assert.deepEqual([t.spending, t.surplus], [3748.46, 651.54]);
  // You pay only your part: the 160 is your part and counts in full, as before.
  u.splitPays = 'part';
  assert.deepEqual([buildSummary(d, loadRefs()).totals.spending], [3828.46]);
});
