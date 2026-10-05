#!/usr/bin/env node
/* Builds the synthetic households from compact specs through the real
   record API, so each fixture carries a believable journal. Run:
   node money-rooms-v3/tests/households/build.mjs   (writes <name>.json) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecord, createRow, addRow, setField, setColumn } from '../../engine/record.js';
import { freshFacts, fieldDef } from '../../engine/fields.js';
import { specs } from './specs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fields = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'data', 'fields.json'), 'utf8'));

let clock;
function tick(seconds) { clock = new Date(clock.getTime() + (seconds || 7) * 1000); return clock.toISOString(); }

export function buildHousehold(spec) {
  clock = new Date(spec.start || '2026-09-10T15:00:00.000Z');
  const rec = createRecord({ id: spec.id, now: clock.toISOString() });
  const sessionsSpec = spec.sessions || [{ facts: spec.sun, rows: spec.rows, label: 'Session 1' }];
  sessionsSpec.forEach((sess, si) => {
    if (si > 0) clock = new Date(sess.start || (clock.getTime() + 14 * 86400 * 1000));
    const sessionId = 's' + (si + 1);
    Object.keys(sess.facts || {}).forEach(id => {
      const [v, state, source] = sess.facts[id];
      setField(rec, 'sun', id, v, state || 'known', source || 'client', { now: tick(), session: sessionId });
    });
    (sess.rows || []).forEach(r => {
      const row = createRow(r.planet, r.type, { id: r.id, nickname: r.nickname || '', institution: r.institution || '', asOf: r.asOf || null, stress: r.stress === undefined ? null : r.stress, followUp: !!r.followUp, notesPrivate: r.notesPrivate || '', notesShared: r.notesShared || '', lib: r.lib || null, f: freshFacts(fields, r.planet, r.type) });
      Object.keys(row.f).forEach(fid => { const d = fieldDef(fields, fid); if (d.cadence) row.f[fid].cad = d.defaultCadence; });
      addRow(rec, row, { now: tick(), session: sessionId });
      Object.keys(r.f || {}).forEach(fid => {
        const spec2 = r.f[fid];
        const [v, state, source, cad] = Array.isArray(spec2) ? spec2 : [spec2, 'known', 'client'];
        setField(rec, row.id, fid, v, state || 'known', source || fieldDef(fields, fid).defaultSource || 'client', { now: tick(), session: sessionId, cad: cad || undefined });
      });
    });
    (sess.edits || []).forEach(e => {
      if (e.column) setColumn(rec, e.rowId, e.column, e.value, { now: tick(), session: sessionId });
      else setField(rec, e.rowId, e.field, e.value, e.state || 'known', e.source || 'client', { now: tick(), session: sessionId, cad: e.cad });
    });
    if (sess.snapshot) {
      rec.sessions.push({ id: sessionId, label: sess.label || ('Session ' + (si + 1)), at: tick(), note: sess.note || '' });
      rec.journal.push({ seq: rec.journal.length ? rec.journal[rec.journal.length - 1].seq + 1 : 1, ts: clock.toISOString(), kind: 'session', planet: 'sun', rowId: 'sun', field: null, owner: 'sun', old: null, new: sessionId, source: 'client', state: 'known', session: sessionId });
    }
  });
  (spec.scenarios || []).forEach(s => rec.scenarios.push(s));
  (spec.quickNotes || []).forEach(n => rec.quickNotes.push(n));
  (spec.coachNotes || []).forEach(n => rec.coachNotes.push(n));
  if (spec.clientPicks) rec.sun.clientPicks = spec.clientPicks;
  if (spec.onepager) rec.sun.onepager = spec.onepager;
  if (spec.assumptions) rec.sun.assumptions = spec.assumptions;
  rec.updatedAt = clock.toISOString();
  return rec;
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  Object.keys(specs).forEach(name => {
    const rec = buildHousehold(specs[name]);
    fs.writeFileSync(path.join(here, name + '.json'), JSON.stringify({ app: 'money-rooms-v3', exportedAt: rec.updatedAt, record: rec }, null, 1));
    console.log(name + ': ' + Object.values(rec.planets).reduce((s, p) => s + p.rows.length, 0) + ' rows, ' + rec.journal.length + ' journal lines');
  });
}
