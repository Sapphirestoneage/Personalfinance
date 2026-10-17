// Part 7 of the monthly loop: estimate history (S-090).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store/store.js';
import { createStorage, memoryBackend } from '../src/store/storage.js';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { findCategory, findLine } from '../src/store/edits.js';
import { startPlan } from '../src/store/plans.js';
import { estimateHistory } from '../src/calc/estimates.js';
import { buildSummary, closeMonthSnapshot } from '../src/calc/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

function store(start = '2026-01-15T12:00:00Z') {
  let now = new Date(start);
  const s = createStore(createStorage(memoryBackend()), () => now);
  s.create('History');
  s.setNow = (iso) => { now = new Date(iso); };
  return s;
}

test('every estimate change is written down by the store, from and to', () => {
  const s = store();
  s.update('Food estimate', (d) => { findCategory(d, 'food').estimate = makeValue(400); });
  s.setNow('2026-02-20T12:00:00Z');
  s.update('Food estimate', (d) => { findCategory(d, 'food').estimate = makeValue(520); });
  s.update('Rent estimate', (d) => { findLine(d, 'rent').line.estimate = makeValue(1400); });
  // A change to something else writes nothing
  s.update('Rename', (d) => { findLine(d, 'rent').line.name = 'Rent'; });
  const log = s.doc.estimateLog.map((e) => [e.categoryId || e.lineId, e.from ? e.from.amount : null, e.to.amount, e.at.slice(0, 10), e.month]);
  assert.deepEqual(log, [
    ['food', null, 400, '2026-01-15', '2026-01'],
    ['food', 400, 520, '2026-02-20', '2026-01'],
    ['rent', null, 1400, '2026-02-20', '2026-01']
  ]);
});

test('the log is never edited or deleted', () => {
  const s = store();
  s.update('Food estimate', (d) => { findCategory(d, 'food').estimate = makeValue(400); });
  assert.throws(() => s.update('Tamper', (d) => { d.estimateLog[0].to.amount = 1; }), /never edited or deleted/);
  assert.throws(() => s.update('Tamper', (d) => { d.estimateLog = []; }), /never edited or deleted/);
  assert.equal(s.doc.estimateLog.length, 1);
});

test('closing a month never changes an estimate (or the log)', () => {
  const s = store();
  s.update('Food estimate', (d) => { findCategory(d, 'food').estimate = makeValue(400); });
  const before = JSON.stringify([s.doc.categories.map((c) => c.estimate), s.doc.estimateLog]);
  s.closeMonth(closeMonthSnapshot(buildSummary(s.doc, refs)));
  assert.equal(JSON.stringify([s.doc.categories.map((c) => c.estimate), s.doc.estimateLog]), before);
});

test('per category: the estimate at each close, the plan each month, and the actual', () => {
  const s = store();
  s.update('Food estimate', (d) => { findCategory(d, 'food').estimate = makeValue(400); findLine(d, 'groceries').line.actual = makeValue(480); });
  s.update('Plan', (d) => { startPlan(d, '2026-01', 'estimates', { 'cat:food': makeValue(420) }); });
  s.closeMonth(closeMonthSnapshot(buildSummary(s.doc, refs)));
  s.update('Food estimate', (d) => { findCategory(d, 'food').estimate = makeValue(470); findLine(d, 'groceries').line.actual = makeValue(460); });
  s.update('Plan', (d) => { startPlan(d, '2026-02', 'estimates', { 'cat:food': makeValue(465) }); });
  s.closeMonth(closeMonthSnapshot(buildSummary(s.doc, refs)));
  const h = estimateHistory(s.doc, buildSummary(s.doc, refs).history, 'food');
  // January: estimate 400 at close, plan 420, actual 480. February: estimate 470, plan 465, actual 460.
  assert.deepEqual(h.rows.map((r) => [r.key, r.estimate, r.plan, r.actual]), [['2026-01', 400, 420, 480], ['2026-02', 470, 465, 460]]);
  assert.deepEqual(h.changes.map((c) => [c.from, c.to]), [[null, 400], [400, 470]]);
});

test('a version 8 file loads with an empty log', () => {
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  raw.schemaVersion = 8;
  delete raw.estimateLog;
  assert.deepEqual(migrate(raw).estimateLog, []);
});
