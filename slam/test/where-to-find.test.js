// Where to find a number, and sorting and grouping Still guessing by urgency and effort (Rough now and later, step 5).
// Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { stillGuessing } from '../engine/ledger.js';
import { whereKind, withWhere, sortGuesses, groupGuesses } from '../engine/where.js';
import { addLookups, homeworkList } from '../engine/profile.js';
import { editFact } from '../engine/edits.js';

const R = loadRules();
const TABLE = JSON.parse(readFileSync(new URL('../data/where-to-find.json', import.meta.url), 'utf8'));
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('the table: every kind has words and minutes, and the last one fits anything', () => {
  for (const k of TABLE.kinds) { assert.ok(k.where && k.short, k.id); assert.ok(k.minutes >= 1 && k.minutes <= 120, k.id); }
  assert.deepEqual(TABLE.kinds.at(-1).match, [{}]);
  const s = demo();
  assert.equal(whereKind(s, 'income.salary.amount', TABLE).id, 'pay');
  assert.equal(whereKind(s, 'debts.visa.apr', TABLE).id, 'cardRate');
  assert.equal(whereKind(s, 'debts.sl.balance', TABLE).id, 'loan');
  assert.equal(whereKind(s, 'accounts.chk.balance', TABLE).id, 'balance');
  assert.equal(whereKind(s, 'expenses.rent.amount', TABLE).id, 'housing');
  assert.equal(whereKind(s, 'expenses.groceries.amount', TABLE).id, 'spending');
  assert.equal(whereKind(s, 'assumptions.realReturn', TABLE).id, 'other');
});

test('Quick wins puts a 1-minute number above a 15-minute one of equal impact', () => {
  const a = { path: 'x.slow', kind: 'rough', score: 2, blocks: [], minutes: 15 }, b = { path: 'x.fast', kind: 'rough', score: 2, blocks: [], minutes: 1 };
  assert.deepEqual(sortGuesses({}, [a, b], 'quick').map((x) => x.path), ['x.fast', 'x.slow']);
  assert.deepEqual(sortGuesses({}, [a, { ...b, score: 40 }], 'easiest').map((x) => x.path), ['x.fast', 'x.slow']);
  assert.deepEqual(sortGuesses({}, [b, { ...a, score: 9 }], 'urgent').map((x) => x.path), ['x.slow', 'x.fast']);
});

test('grouped by where: "A paystub: 2 numbers, about 5 min", and a group goes to the homework at once', () => {
  const s = demo(), items = withWhere(s, stillGuessing(s, R).items, TABLE);
  const pay = groupGuesses(items, 'where').find((g) => g.key === 'pay');
  assert.match(pay.title, /^A paystub: \d+ numbers?, about 5 min$/);
  const s2 = addLookups(s, pay.items.map((it) => ({ path: it.path, label: it.label, where: it.where })), { today: '2026-10-27' });
  const hw = homeworkList(s2, '2026-10-27').find((g) => g.where === 'A paystub');
  assert.equal(hw.items.length, pay.items.length);
  // Adding twice keeps one each; filling one in takes it off the list.
  const s3 = addLookups(s2, pay.items.slice(0, 1).map((it) => ({ path: it.path, label: it.label, where: it.where })), { today: '2026-10-27' });
  assert.equal(homeworkList(s3, '2026-10-27').find((g) => g.where === 'A paystub').items.length, pay.items.length);
  const first = pay.items.find((it) => it.path === 'income.tutoring.amount');
  const s4 = editFact(s3, first.path, 'set', { value: 500, kind: 'known', today: '2026-10-27' });
  assert.equal(homeworkList(s4, '2026-10-27').find((g) => g.where === 'A paystub').items.length, pay.items.length - 1);
});

test('the sort and group choices are kept per browser, and the Builder can change the words', () => {
  const src = readFileSync(new URL('../ui/ledger.js', import.meta.url), 'utf8');
  assert.match(src, /localStorage\.setItem\(GUESS_VIEW_KEY/);
  assert.match(readFileSync(new URL('../ui/builder.js', import.meta.url), 'utf8'), /'where\.html'/);
});
