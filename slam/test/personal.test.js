// Making the budget personal: items inside one amount, "12+30+8" sums,
// renaming, added categories, and the client's own tags.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue, sumParts, valueErrors } from '../src/store/value.js';
import { editValue, parseAmounts } from '../src/ui/components/value-input.js';
import { addCategory, addLine, addTag, toggleLineTag, removeTag, findLine } from '../src/store/edits.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { buildSummary } from '../src/calc/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

test('12+30+8.50 adds up to 50.50; a bad piece is refused', () => {
  assert.deepEqual(parseAmounts('12+30+8.50'), { amount: 50.5, pieces: [12, 30, 8.5] });
  assert.equal(parseAmounts('$1,200').amount, 1200);
  assert.equal(parseAmounts('12+').amount, undefined);
  assert.equal(parseAmounts('').amount, null);
});

test('items inside one amount: the amount is their sum, blanks are not zero', () => {
  const v = editValue(makeValue(), { parts: [{ name: 'Uber', amount: 42 }, { name: 'Coach bus', amount: 35 }, { name: 'Subway', amount: null }] });
  assert.equal(v.amount, 77); // 42 + 35; the blank subway is left out, not counted as 0
  assert.equal(v.status, 'known');
  assert.deepEqual(valueErrors(v, 'v'), []);
  assert.equal(sumParts([{ name: '', amount: null }]), null);
  assert.ok(valueErrors({ ...v, amount: 80 }, 'v').length, 'amount that disagrees with its items is refused');
  const cleared = editValue(v, { status: 'not-for-me' });
  assert.equal(cleared.amount, null);
  assert.equal(cleared.parts, undefined);
  const back = editValue(v, { parts: [] });
  assert.equal(back.parts, undefined);
  assert.equal(back.amount, 77);
});

test('items flow into the budget like any amount (Transit 42 + 35 = 77)', () => {
  const d = newHousehold('Items');
  const { line } = findLine(d, 'transit');
  line.actual = editValue(line.actual, { parts: [{ name: 'Uber', amount: 42 }, { name: 'Coach bus', amount: 35 }] });
  assert.deepEqual(validateHousehold(d), []);
  const s = buildSummary(d, refs);
  assert.equal(s.model.categories.find((c) => c.id === 'transport').lines.find((l) => l.id === 'transit').actual, 77);
  const m = migrate(JSON.parse(JSON.stringify(d)));
  assert.equal(findLine(m, 'transit').line.actual.parts.length, 2, 'items survive save and load');
});

test('a new category goes before Savings and is renamed in place', () => {
  const d = newHousehold('Cats');
  const cat = addCategory(d, 'New category');
  cat.name = 'Concerts';
  const ids = d.categories.map((c) => c.id);
  assert.equal(ids.indexOf(cat.id), ids.indexOf('savings') - 1);
  assert.deepEqual(validateHousehold(d), []);
});

test('tags: made once, on several lines, totals by tag, deleting takes it off every line', () => {
  const d = newHousehold('Tags');
  const sub = addTag(d, 'Subscription');
  assert.equal(addTag(d, 'subscription').id, sub.id, 'same name in any case is the same tag');
  const gym = addLine(d, 'fun', 'Gym');
  gym.actual = makeValue(40);
  gym.estimate = makeValue(35);
  const music = addLine(d, 'fun', 'Music app');
  music.actual = makeValue(12);
  toggleLineTag(d, gym.id, sub.id);
  toggleLineTag(d, music.id, sub.id);
  assert.deepEqual(validateHousehold(d), []);
  const t = buildSummary(d, refs).tags[0];
  // actual 40 + 12 = 52; estimate only the gym has one: 35; one actual is never missing here
  assert.deepEqual([t.count, t.actual, t.estimate, t.actualMissing], [2, 52, 35, 0]);
  removeTag(d, sub.id);
  assert.deepEqual(gym.tags, []);
  assert.deepEqual(validateHousehold(d), []);
  gym.tags = ['tag-gone'];
  assert.ok(validateHousehold(d).some((e) => e.includes('unknown tag')));
});

test('compat: files before tags load with none, and lines with no tags', () => {
  const d = JSON.parse(JSON.stringify(newHousehold('Old')));
  delete d.tags;
  for (const c of d.categories) for (const l of c.lines) delete l.tags;
  const m = migrate(d);
  assert.deepEqual(m.tags, []);
  assert.deepEqual(findLine(m, 'transit').line.tags, []);
});

test('Rough break down: the first guess is kept as a note, sub-categories carry the estimate', async () => {
  const { breakDown, useOneNumber } = await import('../src/store/edits.js');
  const d = newHousehold('Split');
  const t = d.categories.find((c) => c.id === 'transport');
  t.estimate = makeValue(300);
  breakDown(d, 'transport');
  assert.equal(t.split, true);
  assert.equal(t.estimate.amount, null);
  assert.equal(t.estimate.note, 'First guess 300 / month');
  findLine(d, 'gas').line.estimate = makeValue(120);
  const ins = addLine(d, 'transport', 'Car insurance');
  ins.estimate = makeValue(1200, { cadence: 'year' });
  let s = buildSummary(d, refs);
  // 120 + 1,200 / 12 = 220 a month, from the lines
  const row = s.rows.find((r) => r.id === 'transport');
  assert.equal(row.estimate, 220);
  assert.ok(!s.lineIdeas.transport.includes('Car insurance'), 'an idea already used is not offered again');
  assert.ok(s.lineIdeas.transport.includes('Tolls'));
  useOneNumber(d, 'transport', row.estimate);
  assert.deepEqual([t.split, t.estimate.amount, t.estimate.status], [false, 220, 'roughly']);
  assert.deepEqual(validateHousehold(d), []);
});

test('Rough debts: per card, bank, or person, totals by type', async () => {
  const { addDebt } = await import('../src/store/edits.js');
  const d = newHousehold('Debts');
  const a = addDebt(d, { label: 'Chase card', type: 'credit-card' });
  a.minimum = makeValue(60, { status: 'roughly' });
  a.balance = makeValue(2400, { cadence: 'month' });
  const b = addDebt(d, { label: 'Amex', type: 'credit-card' });
  b.minimum = makeValue(40);
  const c = addDebt(d, { label: 'Mom', type: 'family-friend' });
  c.minimum = makeValue(100);
  const s = buildSummary(d, refs);
  const cards = s.debtsByType.find((g) => g.type === 'credit-card');
  // cards: 60 + 40 = 100 a month; balance known only for Chase: 2,400 (one missing)
  assert.deepEqual([cards.count, cards.monthly, cards.balance, cards.balanceMissing], [2, 100, 2400, 1]);
  assert.equal(s.rows.find((r) => r.id === 'debt').estimate, 200); // 100 + 100
  assert.deepEqual(validateHousehold(d), []);
});
