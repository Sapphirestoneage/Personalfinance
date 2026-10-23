// Phase 1 tests for the store: schema, validation, migrations, save and load, client list,
// export and import (with the automatic pre-import backup), undo and redo, month close, the
// single-total category, and field paths. Uses the store alone (store, storage with the in-memory
// backend, records, schema, validate, migrate, value, months, edits): no engines and no data files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store/store.js';
import { stripMeta } from '../src/store/records.js';
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

test('default tree has the 10 categories in order (no Fees, S-123); nothing is a mistake until the client says so (S-069)', () => {
  const cats = defaultCategories();
  assert.deepEqual(cats.map((c) => c.name), ['Housing', 'Food', 'Transportation', 'Debt payments', 'Health',
    'Bills and subscriptions', 'Personal and fun', 'Annual and irregular', 'Giving', 'Savings']);
  assert.ok(cats.flatMap((c) => c.lines).every((l) => l.tag === 'planned'));
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
  assert.equal(d.schemaVersion, SCHEMA_VERSION); // was 2 when S-070 bumped the schema; the constant has moved on since
  assert.equal(d.gut.cadence, 'month');
  assert.equal(d.categories[0].lines[0].actual.amount, 300);
  assert.equal(d.categories[0].lines[0].estimate.amount, null);
  assert.deepEqual(validateHousehold(d), []);
  assert.throws(() => migrate({ schemaVersion: 99 }), /newer version/);
});

test('client list: create, open, rename via update, remove', async () => {
  const s = fresh();
  const a = s.create('Zed');
  const b = s.create('Amy');
  assert.deepEqual(s.list().map((e) => e.name), ['Amy', 'Zed']);
  await s.open(a);
  s.update('Rename', (d) => { d.profile.name = 'Zara'; });
  assert.deepEqual(s.list().map((e) => e.name), ['Amy', 'Zara']);
  await s.remove(b);
  assert.deepEqual(s.list().map((e) => e.name), ['Zara']);
});

test('save and load round trip through the async storage interface', async () => {
  const backend = memoryBackend();
  const s1 = createStore(createStorage(backend), fixedClock);
  const id = s1.create('Round');
  s1.update('Gut', (d) => { d.gut = makeValue(3100); });
  await s1.flush();
  const s2 = createStore(createStorage(backend), fixedClock);
  assert.deepEqual((await s2.load()).map((e) => e.name), ['Round']);
  assert.equal((await s2.open(id)).gut.amount, 3100);
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

test('export, then import of the same client merges by record (S-096), with a backup taken first', async () => {
  const s = fresh();
  const id = s.create('Exported');
  s.update('Rent', (d) => { d.categories[0].lines[0].estimate = makeValue(1500); });
  const text = s.exportCurrent();
  const env = JSON.parse(text);
  assert.equal(env.format, 'slam-household');
  assert.equal(env.exportVersion, 1);
  s.update('Change after export', (d) => { d.categories[0].lines[0].estimate = makeValue(1600); });
  // The file is older than this copy: the change made here is kept, nothing is lost.
  const res = await s.importText(text);
  assert.deepEqual([res.id, res.merged, res.conflicts.length], [id, true, 0]);
  assert.equal(s.doc.categories[0].lines[0].estimate.amount, 1600);
  // A new client from a file is added whole
  await s.remove(id);
  await s.importText(text);
  assert.equal(s.doc.categories[0].lines[0].estimate.amount, 1500);
  const backups = s.listBackups();
  // One backup per import, and the test imported twice.
  assert.equal(backups.length, 2);
  assert.match(backups[0].reason, /Before import/);
});

test('import rejects junk with a plain message', async () => {
  const s = fresh();
  await assert.rejects(() => s.importText('not json'), /not valid JSON/);
  await assert.rejects(() => s.importText('{"format":"slam-household","exportVersion":5,"household":{}}'), /newer version/);
});

test('month close locks a snapshot, advances the month, and keeps revisions separate', () => {
  const s = fresh();
  s.create('Months');
  assert.equal(s.doc.currentMonth, '2026-09'); // the month of fixedClock
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

test('migration to schema 2 removes ZIP and the cost-of-living tier, and changes nothing else (S-070)', () => {
  const v1 = JSON.parse(JSON.stringify(newHousehold('Old file')));
  v1.schemaVersion = 1;
  v1.profile = { name: 'Old file', birthYear: 1990, state: 'NY', zip: '10001', colTier: 'HCOL', colTierSetBy: 'coach' };
  const m = migrate(v1);
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(m.profile, { name: 'Old file', birthYear: 1990, state: 'NY' });
  for (const k of ['zip', 'colTier', 'colTierSetBy']) assert.ok(!(k in m.profile), k + ' is gone');
  // everything outside the profile is untouched
  // Bookkeeping added by schema 10 (S-096) is left out of the comparison
  const rest = (d) => { const { profile, schemaVersion, sync, ...x } = stripMeta(d); return x; };
  assert.deepEqual(rest(m), rest(migrate({ ...v1, profile: { name: 'Old file', birthYear: 1990, state: 'NY' } })));
  assert.deepEqual(rest(m), rest(v1));
  assert.deepEqual(validateHousehold(m), []);
  // and it exports and loads again the same
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(m))), m);
});

test('migration to schema 3 removes the DRAFTT benchmark source and changes nothing else (S-072)', () => {
  const v2 = JSON.parse(JSON.stringify(newHousehold('Bands')));
  v2.schemaVersion = 2;
  v2.settings = { singleTotal: true, benchmarkSource: 'money-guy', lens: 'dollars' };
  const m = migrate(v2);
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.ok(!('benchmarkSource' in m.settings));
  assert.deepEqual(m.settings, { singleTotal: true, lens: 'dollars', materiality: 25 }); // materiality is added by schema 10 (S-096)
  const rest = (d) => { const { settings, schemaVersion, sync, ...x } = stripMeta(d); return x; };
  assert.deepEqual(rest(m), rest(v2));
  assert.deepEqual(validateHousehold(m), []);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(m))), m);
});
