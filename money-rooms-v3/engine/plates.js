/* Tasks from unsure facts. Source client -> their plate; coach lookups,
   estimates and unfiled quick notes -> my plate. Level 3 ranks them by
   leverage; here they are listed and grouped. */
import { needsFollowUp, plateOf } from './states.js';
import * as F from './format.js';

export function plateItems(record, fields) {
  const items = [];
  const planets = fields.planets;
  Object.keys(record.planets).forEach(p => record.planets[p].rows.forEach(r => {
    /* a rough total is superseded once detail rows exist */
    if (r.type === 'summary' && record.planets[p].rows.some(x => x.type !== 'summary' && x.type !== 'score' && x.type !== 'holding')) return;
    Object.keys(r.f).forEach(fid => {
      const f = r.f[fid];
      if (!needsFollowUp(f)) return;
      const def = fields.fields[fid]; if (!def) return;
      items.push({ planet: p, rowId: r.id, field: fid, label: def.label, row: r.nickname || (planets[p].types[r.type] || {}).label || r.type, institution: r.institution || '', state: f.state, source: f.source, plate: plateOf(f), weight: def.weight });
    });
  }));
  ['name', 'birthDate', 'state', 'city', 'workSituation', 'dependents', 'filingStatus', 'bigGoal'].forEach(id => {
    const f = record.sun.f[id];
    if (f && needsFollowUp(f)) items.push({ planet: 'sun', rowId: 'sun', field: id, label: id, row: 'Household', institution: '', state: f.state, source: f.source, plate: plateOf(f), weight: 5 });
  });
  (record.quickNotes || []).filter(n => !n.filed).forEach(n => items.push({ planet: 'sun', rowId: n.id, field: 'quickNote', label: n.text, row: 'Quick note', institution: '', state: 'unknown', source: 'client', plate: 'mine', weight: 3, note: true }));
  return items;
}

export function theirPlate(record, fields) { return plateItems(record, fields).filter(i => i.plate === 'theirs'); }
export function myPlate(record, fields) { return plateItems(record, fields).filter(i => i.plate === 'mine'); }

/* Their plate grouped by institution, for the one-pager and the follow-up email. */
export function byInstitution(items) {
  const groups = {};
  items.forEach(i => { const k = i.institution || 'From memory or a statement'; (groups[k] = groups[k] || []).push(i); });
  return Object.keys(groups).sort().map(k => ({ institution: k, items: groups[k] }));
}

/* Changes since the last session snapshot: one line per fact, newest first, biggest money moves first. */
export function sinceLastSession(record, fields, formatValue) {
  const sessions = record.sessions || [];
  const last = sessions.length ? sessions[sessions.length - 1].at : null;
  if (!last) return { since: null, changes: [] };
  const lines = record.journal.filter(l => l.ts > last && (l.kind === 'set' || l.kind === 'add-row' || l.kind === 'remove-row'));
  const byKey = new Map();
  lines.forEach(l => { const key = l.rowId + '|' + (l.field || ''); if (!byKey.has(key)) byKey.set(key, { l, old: l.old, new: l.new }); else byKey.get(key).new = l.new; });
  const out = [];
  byKey.forEach(({ l, old, new: nw }) => {
    const row = l.rowId === 'sun' ? null : Object.values(record.planets).flatMap(p => p.rows).find(r => r.id === l.rowId);
    const def = l.field && fields.fields[l.field];
    const oldV = old && typeof old === 'object' && 'v' in old ? old.v : null;
    const newV = nw && typeof nw === 'object' && 'v' in nw ? nw.v : null;
    const num = x => typeof x === 'number' ? x : (x && typeof x === 'object' && 'low' in x ? Math.round((x.low + x.high) / 2) : null);
    const delta = def && def.kind === 'money' && num(oldV) !== null && num(newV) !== null ? num(newV) - num(oldV) : null;
    out.push({ rowId: l.rowId, planet: l.planet, field: l.field, kind: l.kind, label: def ? def.label : (l.field || 'row'), row: row ? row.nickname : 'Household', old: oldV, new: newV, delta, text: formatValue ? formatValue(def, oldV, newV, l) : '' });
  });
  return { since: last, changes: out.sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0)) };
}

/* One wording for a change, shared by the one-pager and the session screen: "was X, now Y". */
export function changeText(def, o, n, l) {
  if (l.kind === 'add-row') return 'added';
  if (l.kind === 'remove-row') return 'removed';
  const fmt = v => { if (v === null || v === undefined) return 'not entered'; if (def && def.kind === 'money') return typeof v === 'object' ? F.dollarsWhole(v.low) + ' to ' + F.dollarsWhole(v.high) : F.dollarsWhole(v); if (def && def.kind === 'percent') return F.percent(v); if (def && def.kind === 'month') return F.date(v); return String(v); };
  return 'was ' + fmt(o) + ', now ' + fmt(n);
}
