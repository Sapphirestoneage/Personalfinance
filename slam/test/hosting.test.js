// Groundwork for a shared, hosted version (S-096): records with ids,
// timestamps, author, and version; no hard deletes; one async storage
// interface; one visibility map; merge (not replace) on import; and a guard
// that no real contact details reach the public repo.
//
// Every expected number is worked out by hand in the comments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHousehold, loadRefs, near } from './helpers.js';
import { createStore } from '../src/store/store.js';
import { createStorage, memoryBackend } from '../src/store/storage.js';
import { flatten, stripMeta, stampAll, META } from '../src/store/records.js';
import { mergeDocs, resolveMerge } from '../src/store/merge.js';
import { viewFor, canSee, COACH_ONLY, RECORDS, say } from '../src/store/visibility.js';
import { setRole } from '../src/store/session.js';
import { addEntry } from '../src/store/log.js';
import { exportHousehold } from '../src/store/transfer.js';
import { newHousehold } from '../src/store/schema.js';
import { migrate } from '../src/store/migrate.js';
import { findLine } from '../src/store/edits.js';
import { buildSummary } from '../src/calc/summary.js';
import { cashCalendar } from '../src/calc/calendar.js';
import { counted } from '../src/calc/log.js';

const refs = loadRefs();
const here = fileURLToPath(new URL('../', import.meta.url));

// A clock that moves one minute on every reading, so each edit has its own time.
function ticking(startIso) {
  let t = new Date(startIso).getTime();
  return () => { t += 60000; return new Date(t); };
}
const storeAt = (iso) => createStore(createStorage(memoryBackend()), ticking(iso));
const fileOf = (doc) => exportHousehold(doc, '2026-10-17T18:00:00.000Z');
const entry = (doc, id) => doc.transactions.find((t) => t.id === id);
const spentOn = (doc, lineId, month) => Math.round(counted(doc.transactions)
  .filter((t) => t.lineId === lineId && t.date.startsWith(month) && t.kind === 'spend').reduce((a, t) => a + t.amount, 0) * 100) / 100;

// ---------------------------------------------------------------- records

test('every record in every household carries id, timestamps, author, and version', () => {
  for (const name of ['maya', 'luis', 'tasha', 'sam', 'jordan', 'riley']) {
    const doc = loadHousehold(name);
    const recs = Object.entries(flatten(doc));
    assert.ok(recs.length > 0, name);
    for (const [key, x] of recs) {
      for (const k of ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'version']) assert.ok(x.rec[k] !== undefined, name + ' ' + key + ' has ' + k);
      assert.match(x.rec.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'UTC ISO');
      assert.ok(['coach', 'client'].includes(x.rec.createdBy));
      assert.ok(Number.isInteger(x.rec.version) && x.rec.version >= 1);
    }
  }
});

test('migration stamps older files from their last saved time, as the coach, version 1; ids are kept', () => {
  // riley.json is a schema 9 file saved 2026-10-17T18:00:00.000Z.
  const raw = JSON.parse(readFileSync(join(here, 'test/households/riley.json'), 'utf8'));
  assert.equal(raw.schemaVersion, 9);
  const doc = migrate(raw);
  const e = entry(doc, 'tx-0yb9sdc');
  assert.deepEqual([e.createdAt, e.updatedAt, e.createdBy, e.updatedBy, e.version], ['2026-10-17T18:00:00.000Z', '2026-10-17T18:00:00.000Z', 'coach', 'coach', 1]);
  assert.equal(findLine(doc, 'groceries').line.id, 'groceries', 'existing ids kept');
  assert.equal(doc.categories.find((c) => c.id === 'food').version, 1);
  // Calendar dates stay local "YYYY-MM-DD".
  assert.equal(e.date, '2026-10-04');
  // Loading the migrated file again changes nothing.
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(doc))), doc);
});

test('every household computes the same numbers with or without the bookkeeping', () => {
  for (const name of ['maya', 'luis', 'tasha', 'sam', 'jordan', 'riley']) {
    const doc = loadHousehold(name);
    const a = buildSummary(doc, refs);
    const b = buildSummary(stripMeta(doc), refs);
    assert.deepEqual(a.totals, b.totals, name + ' totals');
    assert.deepEqual(a.income.takeHome, b.income.takeHome, name + ' take-home');
    assert.deepEqual(a.completion, b.completion, name + ' completion');
  }
});

test('an edit stamps who and when, and the version goes up by one', async () => {
  const s = storeAt('2026-10-17T12:00:00.000Z');
  s.create('Stamps');
  setRole('client');
  let id;
  s.update('Coffee', (d) => { id = addEntry(d, { date: '2026-10-17', amount: 4.5, lineId: 'eating-out', merchant: 'Corner Coffee' }).id; });
  setRole('coach');
  const made = entry(s.doc, id);
  assert.deepEqual([made.createdBy, made.updatedBy, made.version], ['client', 'client', 1]);
  s.update('Fix', (d) => { entry(d, id).amount = 5; });
  const fixed = entry(s.doc, id);
  assert.deepEqual([fixed.createdBy, fixed.updatedBy, fixed.version], ['client', 'coach', 2]);
  assert.ok(fixed.updatedAt > fixed.createdAt);
  // An edit somewhere else leaves this record's stamp alone.
  s.update('Gut', (d) => { d.gut.amount = 3000; d.gut.status = 'known'; });
  assert.equal(entry(s.doc, id).version, 2);
});

// ---------------------------------------------------------------- no hard deletes

test('deleting leaves a marker; the live view, calc, and screens never count it', async () => {
  const s = storeAt('2026-10-17T12:00:00.000Z');
  const id = s.create('Deletes');
  let a, b;
  s.update('Two', (d) => {
    a = addEntry(d, { date: '2026-09-03', amount: 100, lineId: 'groceries' }).id;
    b = addEntry(d, { date: '2026-09-04', amount: 40, lineId: 'groceries' }).id;
  });
  s.update('Remove', (d) => { d.transactions = d.transactions.filter((t) => t.id !== b); });
  assert.equal(entry(s.doc, b), undefined, 'gone from the live view');
  const tomb = entry(s.fullDoc, b);
  assert.deepEqual([tomb.deleted, tomb.deletedBy, tomb.version], [true, 'coach', 2]);
  assert.ok(tomb.deletedAt);
  // Groceries in September: 100 counts, the deleted 40 never does.
  assert.equal(spentOn(s.fullDoc, 'groceries', '2026-09'), 100);
  const live = buildSummary(s.doc, refs);
  const full = buildSummary(s.fullDoc, refs);
  assert.deepEqual(full.totals, live.totals);
  // The export keeps the marker, so the other copy learns about the delete.
  const out = JSON.parse(s.exportCurrent()).household;
  assert.equal(entry(out, b).deleted, true);
  assert.equal(entry(out, a).deleted, undefined);
  // Archive is separate from delete: an archived account is still a live record.
  s.update('Account', (d) => { d.accounts.push({ id: 'acct-x', name: 'Old savings', type: 'savings', state: 'archived' }); });
  assert.equal(s.doc.accounts.find((x) => x.id === 'acct-x').state, 'archived');
  assert.equal(s.doc.accounts.find((x) => x.id === 'acct-x').deleted, undefined);
  await s.remove(id);
});

test('Riley: a deleted log entry never reaches the calendar or the month totals', () => {
  const doc = loadHousehold('riley');
  // Mark the Oct 15 Chipotle 13.75 deleted by hand, as a file from another copy would.
  const full = JSON.parse(JSON.stringify(doc));
  Object.assign(entry(full, 'tx-mcjhuru'), { deleted: true, deletedAt: '2026-10-17T19:00:00.000Z', deletedBy: 'client', version: 2 });
  // Eating out in October: 4.75 + 4.75 + 13.75 = 23.25 before; 4.75 + 4.75 = 9.50 without it.
  assert.equal(spentOn(doc, 'eating-out', '2026-10'), 23.25);
  assert.equal(spentOn(full, 'eating-out', '2026-10'), 9.5);
  const trimmed = JSON.parse(JSON.stringify(doc));
  trimmed.transactions = trimmed.transactions.filter((t) => t.id !== 'tx-mcjhuru');
  assert.deepEqual(buildSummary(full, refs).totals, buildSummary(trimmed, refs).totals);
  const opts = { today: '2026-10-17', horizon: 30 };
  const income = buildSummary(trimmed, refs).income;
  assert.deepEqual(cashCalendar(full, income, opts).lowest, cashCalendar(trimmed, income, opts).lowest);
});

// ---------------------------------------------------------------- storage

function filesUnder(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p)); else out.push(p);
  }
  return out;
}

test('no screen or calc file touches localStorage; storage goes through src/store/storage.js', () => {
  const bad = filesUnder(join(here, 'src')).filter((p) => p.endsWith('.js') && !p.endsWith(join('store', 'storage.js')))
    .filter((p) => /\b(localStorage|sessionStorage|indexedDB)\b/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(bad, []);
});

test('the storage interface is async: list, load, save, and a change subscription', async () => {
  const backend = memoryBackend();
  const st = createStorage(backend);
  const seen = [];
  st.subscribe((id) => seen.push(id));
  const doc = newHousehold('Async');
  const p = st.saveClient(doc);
  assert.ok(p instanceof Promise);
  await p;
  assert.deepEqual((await st.listClients()).map((e) => e.name), ['Async']);
  assert.equal((await st.loadClient(doc.id)).profile.name, 'Async');
  // Another device saves this client: the app hears which one.
  backend.changedElsewhere('slam:hh:' + doc.id);
  assert.deepEqual(seen, [doc.id]);
});

// ---------------------------------------------------------------- visibility

test('every record type is in the visibility map, and the coach-only list is the agreed one', () => {
  const kinds = [...new Set(Object.keys(flatten(loadHousehold('riley'))).map((k) => k.split(':')[0]))];
  for (const k of kinds) assert.ok(RECORDS[k], k + ' is in the map');
  assert.deepEqual(Object.keys(COACH_ONLY), ['coachNotes', 'plans.*.lines.*.note', 'line.tag=mistake', 'cashflow.cushion', 'settings.materiality']);
  for (const f of Object.keys(COACH_ONLY)) { assert.equal(canSee(f, 'client'), false, f); assert.equal(canSee(f, 'coach'), true, f); }
  assert.equal(canSee('transactions', 'client'), true);
});

test('View as client hides every coach-only field and keeps everything else', () => {
  const doc = loadHousehold('riley');
  doc.coachNotes = 'Talk about the Visa habit.';
  const month = Object.keys(doc.plans)[0];
  const key = Object.keys(doc.plans[month].lines)[0];
  doc.plans[month].lines[key].note = 'Cut this if rent goes up.';
  findLine(doc, 'gifts').line.tag = 'mistake';
  const shop = findLine(doc, 'shopping').line;
  shop.tag = 'mistake'; shop.mistakeShared = true;
  const v = viewFor(doc, 'client');
  assert.equal(v.coachNotes, '');
  assert.equal(v.plans[month].lines[key].note, '');
  assert.equal(findLine(v, 'gifts').line.tag, 'planned', 'an unshared mistake tag is hidden');
  assert.equal(findLine(v, 'shopping').line.tag, 'mistake', 'a shared one shows');
  // Nothing else differs, and the coach's view is the document itself.
  const strip = (d) => { const x = JSON.parse(JSON.stringify(d)); x.coachNotes = ''; x.plans[month].lines[key].note = ''; findLine(x, 'gifts').line.tag = 'planned'; return x; };
  assert.deepEqual(v, strip(doc));
  assert.equal(viewFor(doc, 'coach'), doc);
  // Coach wording is swapped for client wording where they differ.
  assert.equal(say('owed-label', 'coach'), 'Reimbursements still owed to the client');
  assert.equal(say('owed-label', 'client'), 'Reimbursements still owed to you');
  assert.equal(say('completion-note', 'client'), 'This is about the data, not how you are doing.');
});

// ---------------------------------------------------------------- merge

// Two copies of one small client: the coach's, and a copy that went out in a file.
async function twoCopies() {
  const coach = storeAt('2026-10-01T09:00:00.000Z');
  coach.create('Merge test');
  let x, y;
  coach.update('Start', (d) => {
    x = addEntry(d, { date: '2026-10-02', amount: 50, lineId: 'groceries', merchant: 'Safeway' }).id;
    y = addEntry(d, { date: '2026-10-03', amount: 12, lineId: 'eating-out', merchant: 'Corner Coffee' }).id;
  });
  const file = coach.exportCurrent();
  const client = storeAt('2026-10-05T09:00:00.000Z');
  await client.importText(file);
  return { coach, client, x, y };
}

test('merge: entries added on the other copy are added', async () => {
  const { coach, client } = await twoCopies();
  setRole('client');
  let z;
  client.update('Add', (d) => { z = addEntry(d, { date: '2026-10-06', amount: 30, lineId: 'gas', merchant: 'Shell' }).id; });
  setRole('coach');
  const res = await coach.importText(client.exportCurrent());
  assert.deepEqual([res.added, res.fromIncoming, res.conflicts.length], [1, 0, 0]);
  assert.equal(entry(coach.doc, z).createdBy, 'client');
  // Groceries 50, eating out 12, gas 30.
  assert.equal(spentOn(coach.doc, 'gas', '2026-10'), 30);
});

test('merge: an edit on one side takes that side', async () => {
  const { coach, client, x, y } = await twoCopies();
  client.update('Edit', (d) => { entry(d, x).amount = 55; });
  coach.update('Edit here', (d) => { entry(d, y).amount = 13; });
  const res = await coach.importText(client.exportCurrent());
  assert.deepEqual([res.added, res.fromIncoming, res.conflicts.length], [0, 1, 0]);
  assert.equal(entry(coach.doc, x).amount, 55, 'their edit');
  assert.equal(entry(coach.doc, y).amount, 13, 'our edit stays');
});

test('merge: an edit on both sides is a conflict the coach picks, seeing both values, who, and when', async () => {
  const { coach, client, x } = await twoCopies();
  setRole('client');
  client.update('Edit', (d) => { entry(d, x).amount = 52; });
  setRole('coach');
  coach.update('Edit here', (d) => { entry(d, x).amount = 51; });
  const res = await coach.importText(client.exportCurrent());
  assert.equal(res.conflicts.length, 1);
  const c = res.conflicts[0];
  assert.deepEqual([c.local.rec.amount, c.local.by, c.incoming.rec.amount, c.incoming.by], [51, 'coach', 52, 'client']);
  assert.ok(c.local.at && c.incoming.at);
  assert.equal(entry(coach.doc, x).amount, 51, 'nothing changes until the coach picks');
  await coach.resolveImport({ [c.key]: 'incoming' });
  assert.equal(entry(coach.doc, x).amount, 52);
  // Both copies were at version 2; the pick is version 3, past both.
  assert.equal(entry(coach.doc, x).version, 3);
});

test('merge: a delete on one side and an edit on the other is a conflict; a delete alone applies', async () => {
  const { coach, client, x, y } = await twoCopies();
  client.update('Delete x', (d) => { d.transactions = d.transactions.filter((t) => t.id !== x); });
  client.update('Delete y', (d) => { d.transactions = d.transactions.filter((t) => t.id !== y); });
  coach.update('Edit x', (d) => { entry(d, x).amount = 49; });
  const res = await coach.importText(client.exportCurrent());
  assert.equal(res.conflicts.length, 1);
  assert.deepEqual([res.conflicts[0].incoming.deleted, res.conflicts[0].local.deleted], [true, false]);
  await coach.resolveImport({ [res.conflicts[0].key]: 'local' });
  assert.equal(entry(coach.doc, x).amount, 49, 'the coach kept the edit');
  assert.equal(entry(coach.doc, y), undefined, 'the delete applied');
  assert.equal(entry(coach.fullDoc, y).deleted, true, 'and the marker is kept');
});

test('merge: the same file imported twice changes nothing; a backup is taken before each import', async () => {
  const { coach, client, x } = await twoCopies();
  client.update('Edit', (d) => { entry(d, x).amount = 60; });
  const file = client.exportCurrent();
  await coach.importText(file);
  const once = JSON.stringify(coach.fullDoc);
  const res = await coach.importText(file);
  assert.equal(res.unchanged, true);
  assert.equal(JSON.stringify(coach.fullDoc), once);
  assert.equal(coach.listBackups().length, 2);
});

test('merge: pure function, no shared history yet and the same version on both sides is a conflict', () => {
  const L = stampAll(newHousehold('Pure'), '2026-10-01T00:00:00.000Z');
  const I = JSON.parse(JSON.stringify(L));
  L.gut.amount = 1;
  L.categories[0].lines[0].note = 'here';
  I.categories[0].lines[0].note = 'there';
  const r = mergeDocs(L, I);
  assert.equal(r.conflicts.length, 1);
  const done = resolveMerge(r, { [r.conflicts[0].key]: 'incoming' }, '2026-10-17T00:00:00.000Z');
  assert.equal(done.categories[0].lines[0].note, 'there');
  assert.equal(done.gut.amount, 1, 'non-record fields stay as they are here');
  assert.ok(META.every((k) => !(k in done.gut)));
});

// ---------------------------------------------------------------- Riley's second copy, hand-checked

// The coach sends Riley's file on Oct 17. Riley's copy, then:
//   added   Oct 16 groceries Safeway 52.40 (visa); Oct 17 eating out Corner Coffee 6.50 (visa)
//   edited  Oct 15 Chipotle 13.75 to 15.25 (only Riley)
//   deleted Oct 6 Corner Coffee 4.75 (only Riley)
//   edited  Oct 4 Trader Joe's 88.20 to 92.10 (Riley) and to 90.00 (coach): the conflict
// The coach's copy, meanwhile: Oct 7 Shell 46.00 to 48.00 (only the coach), and the Oct 4 edit above.
test('Riley: merging the second copy, by hand', async () => {
  const coach = storeAt('2026-10-17T18:00:00.000Z');
  const raw = readFileSync(join(here, 'test/households/riley.json'), 'utf8');
  const { id } = await coach.importText(raw);
  const file = coach.exportCurrent();
  const riley = storeAt('2026-10-17T19:00:00.000Z');
  await riley.importText(file);

  setRole('client');
  let n1, n2;
  riley.update('Groceries', (d) => { n1 = addEntry(d, { date: '2026-10-16', amount: 52.4, lineId: 'groceries', merchant: 'Safeway', account: 'visa' }).id; });
  riley.update('Coffee', (d) => { n2 = addEntry(d, { date: '2026-10-17', amount: 6.5, lineId: 'eating-out', merchant: 'Corner Coffee', account: 'visa' }).id; });
  riley.update('Chipotle', (d) => { entry(d, 'tx-mcjhuru').amount = 15.25; });
  riley.update('Not mine', (d) => { d.transactions = d.transactions.filter((t) => t.id !== 'tx-t0lfvsd'); });
  riley.update('Trader Joe', (d) => { entry(d, 'tx-0yb9sdc').amount = 92.1; });
  const back = riley.exportCurrent();
  setRole('coach');
  coach.update('Shell', (d) => { entry(d, 'tx-qtbp5mx').amount = 48; });
  coach.update('Trader Joe', (d) => { entry(d, 'tx-0yb9sdc').amount = 90; });

  const res = await coach.importText(back);
  assert.equal(res.id, id);
  assert.equal(res.added, 2, 'the two new entries');
  assert.equal(res.fromIncoming, 2, 'the Chipotle edit and the coffee delete');
  assert.equal(res.conflicts.length, 1);
  const c = res.conflicts[0];
  assert.equal(c.key, 'entry:tx-0yb9sdc');
  assert.deepEqual([c.local.rec.amount, c.local.by, c.incoming.rec.amount, c.incoming.by], [90, 'coach', 92.1, 'client']);
  // Riley typed the receipt, so the coach takes Riley's 92.10.
  await coach.resolveImport({ [c.key]: 'incoming' });
  const d = coach.doc;
  assert.deepEqual([entry(d, n1).amount, entry(d, n1).createdBy], [52.4, 'client']);
  assert.equal(entry(d, n2).amount, 6.5);
  assert.deepEqual([entry(d, 'tx-mcjhuru').amount, entry(d, 'tx-mcjhuru').updatedBy], [15.25, 'client']);
  assert.equal(entry(d, 'tx-t0lfvsd'), undefined);
  assert.deepEqual([entry(coach.fullDoc, 'tx-t0lfvsd').deleted, entry(coach.fullDoc, 'tx-t0lfvsd').deletedBy], [true, 'client']);
  assert.equal(entry(d, 'tx-qtbp5mx').amount, 48, 'the coach\'s own edit stays');
  assert.equal(entry(d, 'tx-0yb9sdc').amount, 92.1);
  // October by line, by hand:
  //   Groceries: 92.10 (Oct 4) + 121.80 (Oct 11) + 52.40 (Oct 16) = 266.30   (was 88.20 + 121.80 = 210.00)
  //   Eating out: 4.75 (Oct 13) + 15.25 (Oct 15) + 6.50 (Oct 17) = 26.50     (was 4.75 + 4.75 + 13.75 = 23.25)
  //   Gas: 48.00                                                           (was 46.00)
  assert.ok(near(spentOn(d, 'groceries', '2026-10'), 266.3));
  assert.ok(near(spentOn(d, 'eating-out', '2026-10'), 26.5));
  assert.ok(near(spentOn(d, 'gas', '2026-10'), 48));
  // October has 12 entries; +2 added, -1 deleted = 13 live, 14 in the file.
  assert.equal(d.transactions.filter((t) => t.date.startsWith('2026-10')).length, 13);
  assert.equal(coach.fullDoc.transactions.filter((t) => t.date.startsWith('2026-10')).length, 14);
  // Importing Riley's file again changes nothing.
  const after = JSON.stringify(coach.fullDoc);
  assert.equal((await coach.importText(back)).unchanged, true);
  assert.equal(JSON.stringify(coach.fullDoc), after);
});

// ---------------------------------------------------------------- data safety

test('no file under test/ or data/ holds an email address or a phone number', () => {
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
  const phone = /(?<![\d.])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\d.])/;
  const hits = [];
  for (const dir of ['test', 'data']) {
    for (const p of filesUnder(join(here, dir))) {
      if (p.endsWith('hosting.test.js')) continue; // this file holds the patterns themselves
      const text = readFileSync(p, 'utf8');
      if (email.test(text)) hits.push(p + ': email');
      if (phone.test(text)) hits.push(p + ': phone');
    }
  }
  assert.deepEqual(hits, []);
  // The patterns catch what they should.
  assert.ok(email.test('someone@example.com'));
  assert.ok(phone.test('call 555-123-4567'));
  assert.ok(phone.test('(555) 123-4567'));
  assert.ok(!phone.test('3,250.00 1500 2026-10-17'));
});
