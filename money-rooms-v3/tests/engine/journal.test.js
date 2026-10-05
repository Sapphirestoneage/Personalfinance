import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecord, createRow, addRow, setField, setColumn, removeRow, undo, redo, canUndo, canRedo, findRow, addQuickNote } from '../../engine/record.js';
import { since, collapse } from '../../engine/journal.js';

function fresh() {
  const rec = createRecord({ id: 'test', now: '2026-10-05T10:00:00.000Z' });
  const row = createRow('income', 'w2', { id: 'r1', nickname: 'Day job' });
  addRow(rec, row, { now: '2026-10-05T10:00:01.000Z' });
  return rec;
}

test('every change is one append-only line with old and new', () => {
  const rec = fresh();
  setField(rec, 'r1', 'gross', 650000, 'known', 'client', { now: '2026-10-05T10:00:02.000Z' });
  setField(rec, 'r1', 'gross', 660000, 'verified', 'client', { now: '2026-10-05T10:00:03.000Z' });
  assert.equal(rec.journal.length, 3);
  const l = rec.journal[2];
  assert.equal(l.kind, 'set');
  assert.equal(l.field, 'gross');
  assert.equal(l.old.v, 650000);
  assert.equal(l.new.v, 660000);
  assert.equal(l.state, 'verified');
  assert.equal(l.source, 'client');
  assert.equal(l.owner, 'income');
  assert.ok(l.ts);
  assert.equal(l.seq, 3);
});

test('an identical set writes nothing', () => {
  const rec = fresh();
  setField(rec, 'r1', 'gross', 650000, 'known', 'client');
  assert.equal(setField(rec, 'r1', 'gross', 650000, 'known', 'client'), null);
  assert.equal(rec.journal.length, 2);
});

test('undo and redo walk the journal and append lines, never delete', () => {
  const rec = fresh();
  setField(rec, 'r1', 'gross', 650000, 'known', 'client');
  setField(rec, 'r1', 'gross', 660000, 'known', 'client');
  assert.equal(canUndo(rec), true);
  assert.equal(canRedo(rec), false);
  undo(rec);
  assert.equal(findRow(rec, 'r1').f.gross.v, 650000);
  assert.equal(canRedo(rec), true);
  undo(rec);
  assert.equal(findRow(rec, 'r1').f.gross, undefined);
  redo(rec);
  assert.equal(findRow(rec, 'r1').f.gross.v, 650000);
  redo(rec);
  assert.equal(findRow(rec, 'r1').f.gross.v, 660000);
  assert.equal(redo(rec), null);
  assert.equal(rec.journal.length, 7);
  assert.equal(rec.journal.filter(l => l.kind === 'undo').length, 2);
  assert.equal(rec.journal.filter(l => l.kind === 'redo').length, 2);
});

test('a new change after an undo clears the redo path', () => {
  const rec = fresh();
  setField(rec, 'r1', 'gross', 650000, 'known', 'client');
  undo(rec);
  setField(rec, 'r1', 'gross', 700000, 'known', 'client');
  assert.equal(canRedo(rec), false);
  undo(rec);
  assert.equal(findRow(rec, 'r1').f.gross, undefined);
});

test('row deletes are undoable', () => {
  const rec = fresh();
  setField(rec, 'r1', 'gross', 650000, 'known', 'client');
  removeRow(rec, 'r1');
  assert.equal(findRow(rec, 'r1'), null);
  undo(rec);
  assert.equal(findRow(rec, 'r1').f.gross.v, 650000);
  undo(rec);
  undo(rec);
  assert.equal(findRow(rec, 'r1'), null);
  redo(rec);
  assert.equal(findRow(rec, 'r1').nickname, 'Day job');
});

test('column edits journal too', () => {
  const rec = fresh();
  setColumn(rec, 'r1', 'institution', 'Acme');
  assert.equal(rec.journal[rec.journal.length - 1].field, 'institution');
  undo(rec);
  assert.equal(findRow(rec, 'r1').institution, '');
});

test('since and collapse give "since last time" one line per fact', () => {
  const rec = fresh();
  setField(rec, 'r1', 'gross', 640000, 'known', 'client', { now: '2026-10-05T10:00:05.000Z' });
  setField(rec, 'r1', 'gross', 650000, 'known', 'client', { now: '2026-10-05T11:00:00.000Z' });
  setField(rec, 'r1', 'gross', 660000, 'known', 'client', { now: '2026-10-05T11:00:01.000Z' });
  setField(rec, 'r1', 'gross', 670000, 'known', 'client', { now: '2026-10-05T11:00:02.000Z' });
  const lines = since(rec.journal, '2026-10-05T10:30:00.000Z');
  assert.equal(lines.length, 3);
  const c = collapse(lines);
  assert.equal(c.length, 1);
  assert.equal(c[0].old.v, 640000);
  assert.equal(c[0].new.v, 670000);
});

test('the Sun takes its own fields only', () => {
  const rec = fresh();
  setField(rec, 'sun', 'name', 'Jordan', 'verified', 'client');
  assert.equal(rec.sun.f.name.v, 'Jordan');
  assert.throws(() => setField(rec, 'sun', 'rent', 1, 'known', 'client'));
});

test('quick notes land in the record and the journal', () => {
  const rec = fresh();
  const n = addQuickNote(rec, 'ask about the bonus');
  assert.equal(rec.quickNotes.length, 1);
  assert.equal(n.filed, false);
  assert.equal(rec.journal[rec.journal.length - 1].kind, 'note');
});
