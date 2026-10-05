/* One client record and the only ways to change it. Every change goes
   through here, writes one journal line, and marks the record dirty so the
   store autosaves. Views never touch the record directly. */

import { createSun, PLANETS, SUN_FIELDS } from './sun.js';
import { append, undoTarget, redoTarget } from './journal.js';
import { field as mkField, isState, isSource } from './states.js';

export const SCHEMA_VERSION = 2;

export function newId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function createRecord(opts) {
  const o = opts || {};
  const planets = {};
  PLANETS.forEach(p => { planets[p] = { rows: [] }; });
  const now = o.now || new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: o.id || newId(),
    createdAt: now,
    updatedAt: now,
    sun: createSun(),
    planets,
    journal: [],
    scenarios: [],
    sessions: [],
    coachNotes: [],
    quickNotes: [],
    myPlate: { done: {}, snoozed: {} },
    theirPlate: { done: {}, snoozed: {} },
  };
}

/* A universal row. Type-specific facts live in `f`. */
export function createRow(planet, type, opts) {
  const o = opts || {};
  return {
    id: o.id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    planet,
    type,
    nickname: o.nickname || '',
    institution: o.institution || '',
    asOf: o.asOf || null,
    followUp: !!o.followUp,
    stress: o.stress === undefined ? null : o.stress,
    notesPrivate: o.notesPrivate || '',
    notesShared: o.notesShared || '',
    lib: o.lib || null,
    f: o.f || {},
  };
}

export function findRow(record, rowId) {
  for (const p of PLANETS) {
    const r = record.planets[p].rows.find(x => x.id === rowId);
    if (r) return r;
  }
  return null;
}

function touch(record, now) { record.updatedAt = now || new Date().toISOString(); }

/* Set one fact on a row (or on the Sun with rowId "sun"). */
export function setField(record, rowId, fieldId, value, state, source, meta) {
  const m = meta || {};
  if (!isState(state)) throw new Error('unknown state ' + state);
  if (!isSource(source)) throw new Error('unknown source ' + source);
  const target = rowId === 'sun' ? record.sun : findRow(record, rowId);
  if (!target) throw new Error('no row ' + rowId);
  if (rowId === 'sun' && SUN_FIELDS.indexOf(fieldId) === -1) throw new Error('the Sun has no field ' + fieldId);
  const old = target.f[fieldId] ? Object.assign({}, target.f[fieldId]) : null;
  const next = mkField(value, state, source);
  if (m.cad) next.cad = m.cad; else if (old && old.cad) next.cad = old.cad;
  if (old && old.state === next.state && old.source === next.source && old.cad === next.cad
      && JSON.stringify(old.v) === JSON.stringify(next.v)) return null;
  target.f[fieldId] = next;
  const line = append(record.journal, {
    kind: 'set', planet: rowId === 'sun' ? 'sun' : target.planet, rowId, field: fieldId,
    owner: rowId === 'sun' ? 'sun' : target.planet,
    old, new: Object.assign({}, next), source, state, session: m.session || null,
  }, m.now);
  touch(record, m.now);
  return line;
}

/* Set a row's own column (nickname, institution, asOf, followUp, stress, notes). */
export const ROW_COLUMNS = Object.freeze(['nickname', 'institution', 'asOf', 'followUp', 'stress', 'notesPrivate', 'notesShared', 'type', 'lib']);
export function setColumn(record, rowId, column, value, meta) {
  const m = meta || {};
  if (ROW_COLUMNS.indexOf(column) === -1) throw new Error('not a row column: ' + column);
  const row = findRow(record, rowId);
  if (!row) throw new Error('no row ' + rowId);
  const old = row[column];
  if (old === value) return null;
  row[column] = value;
  const line = append(record.journal, {
    kind: 'set', planet: row.planet, rowId, field: column, owner: row.planet,
    old, new: value, source: 'client', state: 'known', session: m.session || null, column: true,
  }, m.now);
  touch(record, m.now);
  return line;
}

export function addRow(record, row, meta) {
  const m = meta || {};
  if (!record.planets[row.planet]) throw new Error('no planet ' + row.planet);
  record.planets[row.planet].rows.push(row);
  const line = append(record.journal, {
    kind: 'add-row', planet: row.planet, rowId: row.id, field: null, owner: row.planet,
    old: null, new: JSON.parse(JSON.stringify(row)), source: 'client', state: 'known', session: m.session || null,
  }, m.now);
  touch(record, m.now);
  return line;
}

export function removeRow(record, rowId, meta) {
  const m = meta || {};
  const row = findRow(record, rowId);
  if (!row) throw new Error('no row ' + rowId);
  const rows = record.planets[row.planet].rows;
  rows.splice(rows.indexOf(row), 1);
  const line = append(record.journal, {
    kind: 'remove-row', planet: row.planet, rowId, field: null, owner: row.planet,
    old: JSON.parse(JSON.stringify(row)), new: null, source: 'client', state: 'known', session: m.session || null,
  }, m.now);
  touch(record, m.now);
  return line;
}

/* Apply a line's "old" or "new" side without journaling (used by undo/redo). */
function applySide(record, line, side) {
  const v = line[side];
  if (line.kind === 'set') {
    const target = line.rowId === 'sun' ? record.sun : findRow(record, line.rowId);
    if (!target) return;
    if (line.column) { target[line.field] = v; return; }
    if (v === null || v === undefined) delete target.f[line.field];
    else target.f[line.field] = Object.assign({}, v);
    return;
  }
  if (line.kind === 'add-row') {
    const rows = record.planets[line.planet].rows;
    if (side === 'new') { if (!rows.find(r => r.id === line.rowId)) rows.push(JSON.parse(JSON.stringify(v))); }
    else { const i = rows.findIndex(r => r.id === line.rowId); if (i !== -1) rows.splice(i, 1); }
    return;
  }
  if (line.kind === 'remove-row') {
    const rows = record.planets[line.planet].rows;
    if (side === 'old') { if (!rows.find(r => r.id === line.rowId)) rows.push(JSON.parse(JSON.stringify(v))); }
    else { const i = rows.findIndex(r => r.id === line.rowId); if (i !== -1) rows.splice(i, 1); }
  }
}

export function canUndo(record) { return !!undoTarget(record.journal); }
export function canRedo(record) { return !!redoTarget(record.journal); }

export function undo(record, meta) {
  const target = undoTarget(record.journal);
  if (!target) return null;
  applySide(record, target, 'old');
  const line = append(record.journal, {
    kind: 'undo', of: target.seq, planet: target.planet, rowId: target.rowId, field: target.field, owner: target.owner,
    old: target.new, new: target.old, source: target.source, state: target.state, session: (meta && meta.session) || null,
  }, meta && meta.now);
  touch(record, meta && meta.now);
  return line;
}

export function redo(record, meta) {
  const target = redoTarget(record.journal);
  if (!target) return null;
  applySide(record, target, 'new');
  const line = append(record.journal, {
    kind: 'redo', of: target.seq, planet: target.planet, rowId: target.rowId, field: target.field, owner: target.owner,
    old: target.old, new: target.new, source: target.source, state: target.state, session: (meta && meta.session) || null,
  }, meta && meta.now);
  touch(record, meta && meta.now);
  return line;
}

/* Quick notes: one shortcut from any screen; unfiled notes land on my plate. */
export function addQuickNote(record, text, meta) {
  const note = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: (meta && meta.now) || new Date().toISOString(), text, filed: false, screen: (meta && meta.screen) || null };
  record.quickNotes.push(note);
  append(record.journal, { kind: 'note', planet: 'sun', rowId: note.id, field: 'quickNote', owner: 'sun', old: null, new: text, source: 'client', state: 'known', session: (meta && meta.session) || null }, meta && meta.now);
  touch(record, meta && meta.now);
  return note;
}

export function fileQuickNote(record, noteId, meta) {
  const n = record.quickNotes.find(x => x.id === noteId);
  if (!n) return null;
  n.filed = true;
  touch(record, meta && meta.now);
  return n;
}
