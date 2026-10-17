// Part 8 of the monthly loop: 80/20 (S-091), by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paretoCut, paretoReading, paretoLevels } from '../src/calc/pareto.js';
import { buildSummary } from '../src/calc/summary.js';
import { october } from './fixtures/october.js';
import { loadRefs, near } from './helpers.js';

const refs = loadRefs();
const items = (xs) => xs.map(([label, amount]) => ({ key: label, label, amount }));

test('the smallest set of the biggest items that reaches 80%', () => {
  // 50 + 30 = 80 of 100: exactly 80%, 2 of 4
  const a = paretoCut(items([['c', 15], ['a', 50], ['d', 5], ['b', 30]]));
  assert.deepEqual([a.items.map((i) => i.label), a.count, a.of, a.amount, a.amountShare, a.countShare], [['a', 'b'], 2, 4, 80, 0.8, 0.5]);
  // 40 + 30 = 70 is short of 80; 40 + 30 + 20 = 90: 3 of 4, 90%
  const b = paretoCut(items([['w', 40], ['x', 30], ['y', 20], ['z', 10]]));
  assert.deepEqual([b.count, b.amount, b.amountShare], [3, 90, 0.9]);
  // Zero and refunds (negative) take no part; ties go by name
  const c = paretoCut(items([['b', 10], ['a', 10], ['r', -5], ['z', 0]]));
  assert.deepEqual([c.of, c.items.map((i) => i.label)], [2, ['a', 'b']]);
  assert.equal(paretoCut([]).count, 0);
});

test('readings', () => {
  const cut = { count: 11, of: 140, countShare: 11 / 140, share: 0.8, items: [] };
  assert.equal(paretoReading(cut, 'entries'), '8% of your entries (11 of 140) made up 80% of your spending.');
  const lines = { count: 3, of: 20, countShare: 0.15, share: 0.8, items: [{ label: 'Rent' }, { label: 'Car payment' }, { label: 'Groceries' }] };
  assert.equal(paretoReading(lines, 'lines'), '3 lines, Rent, Car payment, and Groceries, made up 80%.');
});

test('three levels for October', () => {
  const d = october({ atm: true });
  const s = buildSummary(d, refs);
  const p = paretoLevels(d, s.history, ['2026-10']);
  // Entries (purchases and fees): Geico 1,200, groceries 300, couch 250, groceries 100, concert 60 (120 less 60 owed), ATM 60.
  // Total 1,970; 80% is 1,576. 1,200 + 300 = 1,500 is short; + 250 = 1,750: 3 of 6.
  assert.deepEqual([p.entries.count, p.entries.of, p.entries.amount, p.entries.total], [3, 6, 1750, 1970]);
  assert.ok(near(p.entries.amountShare, 0.888325, 6));
  assert.equal(p.entries.reading, '50% of your entries (3 of 6) made up 80% of your spending.');
  // Merchants: GEICO 1,200, No merchant (both groceries) 400, COUCH 250, TICKETMASTER 60, ATM WITHDRAWAL 60.
  // 1,200 + 400 = 1,600 reaches 1,576: 2 of 5.
  assert.deepEqual([p.merchants.items.map((i) => i.label), p.merchants.of], [['GEICO', 'No merchant'], 5]);
  assert.equal(p.merchants.reading, '40% of your merchants (2 of 5) made up 80% of your spending.');
  // Lines: rent 1,500, groceries 400, car insurance 100 (its share), shopping 60, Visa minimum 40. Total 2,100; 80% is 1,680.
  // 1,500 is short; + 400 = 1,900: 2 lines.
  assert.deepEqual([p.lines.count, p.lines.of, p.lines.total], [2, 5, 2100]);
  assert.equal(p.lines.reading, '2 lines, Rent or mortgage and Groceries, made up 80%.');
});
