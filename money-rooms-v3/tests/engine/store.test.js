import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, memoryStorage, migrate, MIGRATIONS, KEY_PREFIX } from '../../engine/store.js';
import { createRecord, createRow, addRow, setField, SCHEMA_VERSION, undo, findRow, defaultGoals } from '../../engine/record.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = n => JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', n), 'utf8'));

test('a record saves under mr3:client:<id> and loads back equal', () => {
  const mem = memoryStorage();
  const store = createStore(mem);
  const rec = createRecord({ id: 'abc', now: '2026-10-05T00:00:00.000Z' });
  setField(rec, 'sun', 'name', 'Jordan', 'verified', 'client', { now: '2026-10-05T00:00:01.000Z' });
  store.save(rec, '2026-10-05T00:00:02.000Z');
  assert.ok(mem.getItem(KEY_PREFIX + 'abc'));
  const back = store.load('abc');
  assert.deepEqual(back, rec);
  assert.equal(store.list()[0].name, 'Jordan');
});

test('export then import round-trips the whole record, journal included', () => {
  const store = createStore(memoryStorage());
  const rec = createRecord({ id: 'rt', now: '2026-10-05T00:00:00.000Z' });
  addRow(rec, createRow('debt', 'card', { id: 'd1', nickname: 'Freedom' }));
  setField(rec, 'd1', 'balance', 412300, 'known', 'client');
  const text = store.exportJson(rec);
  const { record: back } = store.importJson(text, '2026-10-05T01:00:00.000Z');
  assert.equal(findRow(back, 'd1').f.balance.v, 412300);
  assert.equal(back.journal.filter(l => l.kind === 'set').length, rec.journal.filter(l => l.kind === 'set').length);
  assert.equal(back.journal[back.journal.length - 1].kind, 'import');
  assert.ok(text.indexOf('"journal"') !== -1);
});

test('importing over an existing client snapshots it first, and the import can be undone', () => {
  const store = createStore(memoryStorage());
  const rec = createRecord({ id: 'same', now: '2026-10-05T00:00:00.000Z' });
  setField(rec, 'sun', 'name', 'Before', 'known', 'client');
  store.save(rec);
  const incoming = createRecord({ id: 'same', now: '2026-10-05T00:00:00.000Z' });
  setField(incoming, 'sun', 'name', 'After', 'known', 'client');
  const { record: after, snapshotKey } = store.importJson(store.exportJson(incoming), '2026-10-05T02:00:00.000Z');
  assert.equal(after.sun.f.name.v, 'After');
  assert.ok(snapshotKey);
  assert.equal(store.snapshots('same').length, 1);
  const restored = store.undoImport(snapshotKey);
  assert.equal(restored.sun.f.name.v, 'Before');
  assert.equal(store.load('same').sun.f.name.v, 'Before');
  assert.equal(store.snapshots('same').length, 0);
});

test('junk is refused with a plain message', () => {
  const store = createStore(memoryStorage());
  assert.throws(() => store.importJson('not json'), /not JSON/);
  assert.throws(() => store.importJson('{"hello":1}'), /not a Money Rooms v3 export/);
});

test('every schema version has a migration and each fixture lifts to the current schema', () => {
  for (let v = 0; v < SCHEMA_VERSION; v++) {
    assert.ok(MIGRATIONS.find(m => m.from === v && m.to === v + 1), 'migration from ' + v);
  }
  const zero = migrate(fixture('schema-0.json'));
  assert.equal(zero.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(zero.myPlate, { done: {}, snoozed: {} });
  assert.deepEqual(zero.sun.assumptions, {});
  assert.equal(zero.planets.income.rows[0].stress, null);
  assert.equal(zero.planets.income.rows[0].followUp, false);
  const one = migrate(fixture('schema-1.json'));
  assert.equal(one.schemaVersion, SCHEMA_VERSION);
  assert.equal(one.planets.spending.rows[0].f.amount.v, 210000);
  assert.deepEqual(one.sun.clientPicks, []);
  /* Level 8 (MR-046): a schema-2 record gains anchors backfilled from its first values, a household and a session mode */
  const two = migrate(fixture('schema-2.json'));
  assert.equal(two.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(two.household, { roommates: [], lease: 'none', unitSize: null, partner: null, partners: [], basis: 'together' });
  assert.deepEqual(two.goals, defaultGoals(), 'Level 11: the goal settings arrive with their defaults');
  assert.equal(two.sessionMode, 'standard');
  assert.ok(two.anchors && two.anchors.gut && two.anchors.dream && Array.isArray(two.anchors.history));
  assert.deepEqual(two.anchors.dream, {}, 'no dream backfill');
  Object.values(two.anchors.gut).forEach(a => assert.ok(a.backfilled && a.cents >= 0));
  /* MR-071: a schema-4 record's cash accounts become bank rows; the investing row is untouched */
  const four = migrate(fixture('schema-4.json'));
  assert.equal(four.schemaVersion, SCHEMA_VERSION);
  const hysa = four.planets.invest.rows.find(r => r.id === 'o4-hysa'); const chk = four.planets.invest.rows.find(r => r.id === 'o4-chk'); const roth = four.planets.invest.rows.find(r => r.id === 'o4-roth');
  assert.equal(hysa.type, 'bank'); assert.equal(hysa.f.bankType.v, 'hysa'); assert.equal(hysa.f.accountType, undefined); assert.equal(hysa.f.accountBalance.v, 500000); assert.equal(hysa.f.contribAmount.v, 20000);
  ['allocStocks', 'allocBonds', 'allocCash', 'allocOther', 'usShare', 'beneficiary'].forEach(k => assert.equal(hysa.f[k], undefined, k + ' dropped from a bank row'));
  assert.equal(chk.type, 'bank'); assert.equal(chk.f.bankType.v, 'checking');
  assert.equal(roth.type, 'account'); assert.equal(roth.f.accountType.v, 'rothIra'); assert.equal(roth.f.beneficiary.v, false);
});

test('a record from a newer app is refused, not mangled', () => {
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }), /newer app/);
});

test('a loaded record still undoes', () => {
  const store = createStore(memoryStorage());
  const rec = createRecord({ id: 'u' });
  setField(rec, 'sun', 'name', 'A', 'known', 'client');
  setField(rec, 'sun', 'name', 'B', 'known', 'client');
  store.save(rec);
  const back = store.load('u');
  undo(back);
  assert.equal(back.sun.f.name.v, 'A');
});
