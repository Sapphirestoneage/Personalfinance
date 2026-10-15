// Phase 1 tests: schema, validation, migrations, save and load, client list,
// export and import (with the automatic pre-import backup), undo and redo, month close.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store/store.js';
import { createStorage, memoryBackend } from '../src/store/storage.js';
import { newHousehold, SCHEMA_VERSION, defaultCategories } from '../src/store/schema.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { makeValue, normalizeValue } from '../src/store/value.js';
import { nextMonthKey } from '../src/store/months.js';
import { useSingleTotal, findLine, setField, getField } from '../src/store/edits.js';

const fixedClock = () => new Date('2026-09-15T12:00:00Z');
const fresh = () => createStore(createStorage(memoryBackend()), fixedClock);

test('a new household is valid and carries the schema version', () => {
  const d = newHousehold('Test');
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(validateHousehold(d), []);
});

test('default tree has the 11 categories in order, with Fees tagged mistake', () => {
  const cats = defaultCategories();
  assert.deepEqual(cats.map((c) => c.name), ['Housing', 'Food', 'Transportation', 'Debt payments', 'Health',
    'Bills and subscriptions', 'Personal and fun', 'Annual and irregular', 'Fees', 'Giving', 'Savings']);
  const fees = cats.find((c) => c.id === 'fees');
  assert.ok(fees.lines.every((l) => l.tag === 'mistake'));
  assert.ok(cats.find((c) => c.id === 'savings').lines.every((l) => l.savings));
  assert.equal(cats.find((c) => c.id === 'debt').lines.length, 0, 'debt lines come from debts[]');
});

test('blank values are null with null status (empty is not zero)', () => {
  const v = makeValue();
  assert.equal(v.amount, null);
  assert.equal(v.status, null);
  assert.equal(makeValue(0).amount, 0);
  assert.equal(makeValue(0).status, 'known');
  assert.deepEqual(normalizeValue(25), makeValue(25));
});

test('validation catches bad enums, joy out of range, and duplicate ids', () => {
  const d = newHousehold('Bad');
  d.categories[0].lines[0].joy = 11;
  d.categories[0].lines[1].id = d.categories[0].lines[0].id;
  d.gut.status = 'sure';
  const errs = validateHousehold(d);
  assert.ok(errs.some((e) => e.includes('joy')));
  assert.ok(errs.some((e) => e.includes('duplicate id')));
  assert.ok(errs.some((e) => e.includes('unknown status')));
});

test('migration upgrades an unversioned document and fills defaults', () => {
  const old = { id: 'hh-old', profile: { name: 'Old' }, gut: { amount: 2000 }, categories: [{ id: 'food', name: 'Food', lines: [{ id: 'g', actual: 300 }] }] };
  const d = migrate(old);
  assert.equal(d.schemaVersion, 1);
  assert.equal(d.gut.cadence, 'month');
  assert.equal(d.categories[0].lines[0].actual.amount, 300);
  assert.equal(d.categories[0].lines[0].estimate.amount, null);
  assert.deepEqual(validateHousehold(d), []);
  assert.throws(() => migrate({ schemaVersion: 99 }), /newer version/);
});

test('client list: create, open, rename via update, remove', () => {
  const s = fresh();
  const a = s.create('Zed');
  const b = s.create('Amy');
  assert.deepEqual(s.list().map((e) => e.name), ['Amy', 'Zed']);
  s.open(a);
  s.update('Rename', (d) => { d.profile.name = 'Zara'; });
  assert.deepEqual(s.list().map((e) => e.name), ['Amy', 'Zara']);
  s.remove(b);
  assert.deepEqual(s.list().map((e) => e.name), ['Zara']);
});

test('save and load round trip through storage', () => {
  const backend = memoryBackend();
  const s1 = createStore(createStorage(backend), fixedClock);
  const id = s1.create('Round');
  s1.update('Gut', (d) => { d.gut = makeValue(3100); });
  const s2 = createStore(createStorage(backend), fixedClock);
  assert.equal(s2.open(id).gut.amount, 3100);
});

test('invalid changes are refused and leave the document untouched', () => {
  const s = fresh();
  s.create('Guard');
  assert.throws(() => s.update('Bad', (d) => { d.gut.cadence = 'fortnight'; }), /refused/);
  assert.equal(s.doc.gut.cadence, 'month');
  assert.equal(s.canUndo(), false);
});

test('undo and redo walk every change', () => {
  const s = fresh();
  s.create('Undo');
  s.update('Gut 1', (d) => { d.gut = makeValue(1000); });
  s.update('Gut 2', (d) => { d.gut = makeValue(2000); });
  assert.equal(s.undoLabel(), 'Gut 2');
  s.undo();
  assert.equal(s.doc.gut.amount, 1000);
  s.undo();
  assert.equal(s.doc.gut.amount, null);
  assert.equal(s.canUndo(), false);
  s.redo();
  assert.equal(s.doc.gut.amount, 1000);
  s.update('Gut 3', (d) => { d.gut = makeValue(3000); });
  assert.equal(s.canRedo(), false, 'a new change clears redo');
});

test('export then import restores the household, with a backup taken first', () => {
  const s = fresh();
  const id = s.create('Exported');
  s.update('Gut', (d) => { d.gut = makeValue(2500, { status: 'roughly' }); });
  const text = s.exportCurrent();
  const env = JSON.parse(text);
  assert.equal(env.format, 'slam-household');
  assert.equal(env.exportVersion, 1);
  s.update('Change after export', (d) => { d.gut = makeValue(9999); });
  const res = s.importText(text);
  assert.equal(res.id, id);
  assert.equal(s.doc.gut.amount, 2500);
  const backups = s.listBackups();
  assert.equal(backups.length, 1);
  assert.match(backups[0].reason, /Before import/);
  s.restoreBackup(backups[0].id);
  assert.equal(s.doc.gut.amount, 9999, 'the backup holds the pre-import state');
});

test('import rejects junk with a plain message', () => {
  const s = fresh();
  assert.throws(() => s.importText('not json'), /not valid JSON/);
  assert.throws(() => s.importText('{"format":"slam-household","exportVersion":5,"household":{}}'), /newer version/);
});

test('month close locks a snapshot, advances the month, and keeps revisions separate', () => {
  const s = fresh();
  s.create('Months');
  assert.equal(s.doc.currentMonth, '2026-09');
  const snap = { takeHome: 4000, categories: { food: { name: 'Food', estimate: 500, actual: 600 } }, lines: { groceries: { name: 'Groceries', categoryId: 'food', estimate: 400, actual: 450 } } };
  const key = s.closeMonth(snap);
  assert.equal(key, '2026-09');
  assert.equal(s.doc.currentMonth, '2026-10');
  snap.categories.food.actual = 1; // mutating the caller's object must not reach the store
  assert.equal(s.doc.months[0].snapshot.categories.food.actual, 600);
  s.reviseMonth('2026-09', 'groceries', 470);
  assert.equal(s.doc.months[0].revised.lines.groceries.amount, 470);
  assert.equal(s.doc.months[0].snapshot.lines.groceries.actual, 450, 'original snapshot untouched');
  assert.throws(() => s.reviseMonth('2026-09', 'nope', 1), /not in month/);
  s.undo(); s.undo();
  assert.equal(s.doc.months.length, 0, 'closing can be undone');
  assert.equal(nextMonthKey('2026-12'), '2027-01');
});

test('single total lives on an Everything else category', () => {
  const d = newHousehold('One total');
  const cat = useSingleTotal(d);
  cat.estimate = makeValue(2200);
  assert.equal(d.settings.singleTotal, true);
  assert.equal(d.categories.at(-1).id, 'everything');
  assert.deepEqual(validateHousehold(d), []);
});

test('field paths reach category, line, and income values', () => {
  const d = newHousehold('Paths');
  setField(d, ['categories', 'food', 'estimate'], makeValue(450));
  setField(d, ['line', 'groceries', 'actual'], makeValue(300));
  assert.equal(getField(d, ['categories', 'food', 'estimate']).amount, 450);
  assert.equal(findLine(d, 'groceries').line.actual.amount, 300);
});
