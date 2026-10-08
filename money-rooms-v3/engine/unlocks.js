/* The unlock loop (MR-059): what a save opened up. No new math here. The
   engine's own result says which metrics, lenses and charts are locked (their
   inputs are missing), rough (they compute from rough inputs) or solid; this
   module reads two results, lists what moved up, and finds the single missing
   input that would open the most by trying stand-in values and recomputing. */
import { compute } from './compute.js';
import { ALL_CHARTS as CHARTS, chartMeta } from './charts-all.js';
import { createRow, setField, addRow } from './record.js';
import { freshFacts, typeDef, fieldDef } from './fields.js';
import { SUN_ASKED, PLANETS, PLANET_LABELS } from './sun.js';
import * as F from './format.js';

export const RANK = Object.freeze({ locked: 0, quiet: 1, rough: 2, solid: 3 });

/* ---- states ---- */
export function metricState(m) { if (!m || m.status !== 'ok') return 'locked'; return m.value && m.value.rough ? 'rough' : 'solid'; }
/* A lens is locked while the metric it reads is locked; quiet when that metric computes but the lens does not fire; rough or solid when it fires. */
export function lensState(def, result) {
  const fired = (result.lenses || []).find(l => l.id === def.id);
  if (fired) return fired.rough ? 'rough' : 'solid';
  const m = result.metrics && def.metric ? result.metrics[def.metric] : null;
  return metricState(m) === 'locked' ? 'locked' : 'quiet';
}
export function chartState(def, result, data) {
  const built = def.build(result, {});
  if (!built || built.needs) return built && built.waiting ? 'rough' : 'locked'; /* a chart waiting on the sensitivity run is open, just not drawn yet */
  const meta = chartMeta(def.id, data);
  const rough = meta && meta.metrics.some(id => metricState(result.metrics && result.metrics[id]) === 'rough');
  return rough ? 'rough' : 'solid';
}
export function stateOf(result, data) {
  const out = { metrics: {}, lenses: {}, charts: {} };
  if (!result || !data) return out;
  data.metrics.metrics.forEach(d => { out.metrics[d.id] = metricState(result.metrics && result.metrics[d.id]); });
  data.lenses.lenses.forEach(d => { out.lenses[d.id] = result.metrics ? lensState(d, result) : 'locked'; });
  CHARTS.forEach(d => { out.charts[d.id] = result.metrics ? chartState(d, result, data) : 'locked'; });
  return out;
}
export function totals(state) {
  const count = (o, pred) => Object.keys(o).filter(k => pred(o[k])).length;
  const open = s => s === 'rough' || s === 'solid' || s === 'quiet';
  return {
    metrics: { total: Object.keys(state.metrics).length, open: count(state.metrics, open), solid: count(state.metrics, s => s === 'solid') },
    lenses: { total: Object.keys(state.lenses).length, open: count(state.lenses, open), firing: count(state.lenses, s => s === 'rough' || s === 'solid') },
    charts: { total: Object.keys(state.charts).length, open: count(state.charts, open), solid: count(state.charts, s => s === 'solid') },
  };
}

/* ---- what moved up between two results ---- */
export function diffStates(before, after) {
  const up = (a, b) => Object.keys(b).filter(k => RANK[b[k]] > RANK[(a && a[k]) || 'locked']).map(k => ({ id: k, from: (a && a[k]) || 'locked', to: b[k] }));
  return { metrics: up(before.metrics, after.metrics), lenses: up(before.lenses, after.lenses).filter(x => x.to !== 'quiet'), charts: up(before.charts, after.charts) };
}
export function valueText(m) {
  if (!m || m.status !== 'ok') return '';
  const v = m.value;
  if (typeof v.cents === 'number') return F.dollarsWhole(v.cents, { rough: v.rough });
  if (v.kind === 'list' || v.kind === 'shares') return '';
  try { return F.value(v) || ''; } catch (e) { return ''; }
}
function firstSentence(t) { const clean = (t || '').replace(/\s*\((MR|D|DD)-\d+\)/g, ''); const i = clean.indexOf('. '); return i === -1 ? clean : clean.slice(0, i + 1); }
/* a metric that is an alias of another explains itself through its plain label */
function takeawayOf(def) { const t = firstSentence(def.definition); return /^Alias/i.test(t) ? def.clientLabel + '.' : t; }
/* The reveal list: every item with its value, one plain takeaway and where it lives. */
export function unlocksBetween(before, after, result, data) {
  const d = diffStates(before, after);
  const defs = data.metrics.metrics;
  const metrics = d.metrics.map(x => { const def = defs.find(m => m.id === x.id); const m = result.metrics[x.id]; return { kind: 'metric', id: x.id, from: x.from, to: x.to, name: def.name, clientName: def.clientLabel, value: valueText(m), takeaway: takeawayOf(def), stage: def.stage, href: '#/measure/numbers/' + x.id }; });
  const lenses = d.lenses.map(x => { const def = data.lenses.lenses.find(l => l.id === x.id); const fired = (result.lenses || []).find(l => l.id === x.id); return { kind: 'lens', id: x.id, from: x.from, to: x.to, name: def.name, clientName: def.name, value: fired && fired.impactAnnual !== null && fired.impactAnnual !== undefined ? F.dollarsWhole(fired.impactAnnual) + ' a year' : (fired && fired.figure) || '', takeaway: fired ? fired.text : def.trigger, stage: stageOfLens(def, data), href: '#/measure/lenses/' + x.id }; });
  const charts = d.charts.map(x => { const def = CHARTS.find(c => c.id === x.id); const meta = chartMeta(x.id, data); return { kind: 'chart', id: x.id, from: x.from, to: x.to, name: def.name, clientName: def.client, value: '', takeaway: def.client, stage: meta.stage, href: '#/measure/charts/' + x.id }; });
  return { metrics, lenses, charts, count: metrics.length + lenses.length + charts.length };
}
export function stageOfLens(def, data) { const m = data.metrics.metrics.find(x => x.id === def.metric); return m ? m.stage : 5; }

/* ---- the exact input behind a locked item ---- */
function fieldLabel(data, planet, type, field) {
  if (planet === 'sun') return { birthDate: 'Birth date', state: 'State', workSituation: 'Work situation', filingStatus: 'Filing status' }[field] || field;
  return fieldDef(data.fields, field).label;
}
function typeLabel(data, planet, type) { return typeDef(data.fields, planet, type).label; }
/* Picks the first target of a needs phrase that the record does not have yet; falls back to the first. */
export function targetFor(needText, record, data) {
  const map = data.unlocks.needsMap[needText];
  if (!map) return null;
  const has = ([planet, type, field]) => {
    if (planet === 'call') return !!(record.anchors && record.anchors[field] && Object.keys(record.anchors[field]).length);
    if (planet === 'transactions' || planet === 'discovery') return false;
    if (planet === 'session') { const P = record.program || {}; return field === 'satisfaction' ? !!(P.satisfaction && P.satisfaction.length) : field === 'worthIt' ? !!(P.worthIt && P.worthIt.length) : !!(record.snapshots && record.snapshots.length); }
    if (field === 'stress' && !data.fields.fields.stress) return record.planets[planet].rows.some(r => r.type === type && typeof r.stress === 'number');
    if (planet === 'sun') { const f = record.sun.f[field]; return !!(f && f.v !== null && f.v !== undefined && f.state !== 'unknown'); }
    return record.planets[planet].rows.some(r => r.type === type && r.f[field] && r.f[field].v !== null && r.f[field].v !== undefined && r.f[field].state !== 'unknown' && r.f[field].state !== 'will-send');
  };
  const pick = map.find(t => !has(t)) || map[0];
  return describeTarget(pick[0], pick[1], pick[2], record, data);
}
function describeTarget(planet, type, field, record, data) {
  if (planet === 'call') return { planet: 'call', type: null, field, rowId: null, label: field === 'gut' ? 'Her gut guess per area' : 'Her dream spending per area', where: 'Call path', href: '#/callpath', addRow: false };
  if (planet === 'transactions') return { planet: 'transactions', type: null, field, rowId: null, label: 'A transactions import', where: 'Transactions', href: '#/transactions', addRow: false };
  if (planet === 'discovery') return { planet: 'discovery', type: null, field, rowId: null, label: 'The stress score', where: 'Discovery form or a session', href: '#/discovery', addRow: false };
  if (planet === 'session') return { planet: 'session', type: null, field, rowId: null, label: field === 'snapshot' ? 'A closed session or a money date' : field === 'satisfaction' ? 'A satisfaction score' : field === 'worthIt' ? 'Worth-it scores per area' : 'A session close', where: 'Session or money date', href: '#/money-date', addRow: false };
  if (field === 'stress' && !data.fields.fields.stress) { const row = record.planets[planet].rows.find(r => r.type === type && (r.stress === null || r.stress === undefined)) || record.planets[planet].rows.find(r => r.type === type) || null; return { planet, type, field, rowId: row ? row.id : null, label: 'Stress rating (1 to 5)', where: PLANET_LABELS[planet] + ': ' + typeLabel(data, planet, type), href: '#/ledger/' + planet + '/' + type, addRow: !row }; }
  if (planet === 'sun') return { planet: 'sun', type: null, field, rowId: 'sun', label: fieldLabel(data, 'sun', null, field), where: 'Household facts', href: '#/home', addRow: false };
  const row = record.planets[planet].rows.find(r => r.type === type && !(r.f[field] && r.f[field].v !== null && r.f[field].v !== undefined && r.f[field].state !== 'unknown' && r.f[field].state !== 'will-send')) || null;
  return { planet, type, field, rowId: row ? row.id : null, label: fieldLabel(data, planet, type, field), where: PLANET_LABELS[planet] + ': ' + typeLabel(data, planet, type), href: '#/ledger/' + planet + '/' + type, addRow: !row };
}
/* The first needs phrase that maps to a Ledger input wins; "an input" and other unmapped phrases are skipped. */
function firstTarget(needsList, record, data) {
  for (const n of needsList || []) { const t = targetFor(n, record, data); if (t) return t; }
  return null;
}
export function inputFor(item, result, record, data) {
  if (item.kind === 'metric') { const m = result.metrics[item.id]; return firstTarget(m && m.needs, record, data); }
  if (item.kind === 'lens') { const def = data.lenses.lenses.find(l => l.id === item.id); const m = def && result.metrics[def.metric]; return firstTarget(m && m.needs, record, data); }
  if (item.kind === 'chart') { const def = CHARTS.find(c => c.id === item.id); const b = def.build(result, {}); return firstTarget(b && b.needs, record, data); }
  return null;
}

/* ---- the map: every item by stage with its state and, when locked, its input ---- */
export function unlockMap(record, result, data) {
  const st = stateOf(result, data);
  const items = [];
  data.metrics.metrics.forEach(def => items.push({ kind: 'metric', id: def.id, name: def.name, clientName: def.clientLabel, stage: def.stage, state: st.metrics[def.id], coachOnly: !!def.coachOnly, value: valueText(result.metrics && result.metrics[def.id]), href: '#/measure/numbers/' + def.id }));
  data.lenses.lenses.forEach(def => { const fired = (result.lenses || []).find(l => l.id === def.id); items.push({ kind: 'lens', id: def.id, name: def.name, clientName: def.name, stage: stageOfLens(def, data), state: st.lenses[def.id], value: fired && fired.impactAnnual !== null && fired.impactAnnual !== undefined ? F.dollarsWhole(fired.impactAnnual) + ' a year' : '', trigger: def.trigger, href: '#/measure/lenses/' + def.id }); });
  CHARTS.forEach(def => { const meta = chartMeta(def.id, data); items.push({ kind: 'chart', id: def.id, name: def.name, clientName: def.client, stage: meta.stage, state: st.charts[def.id], value: '', coachOnly: !!def.coachOnly, href: '#/measure/charts/' + def.id }); });
  items.forEach(it => { if (it.state === 'locked') it.input = inputFor(it, result, record, data); });
  const stages = Object.keys(data.unlocks.stages).map(s => ({ stage: +s, label: data.unlocks.stages[s], items: items.filter(it => it.stage === +s) }));
  return { items, stages, totals: totals(st), state: st };
}

/* ---- the next unlock: try each missing input with a stand-in and count what opens ---- */
function probeValue(data, field) {
  const pv = data.unlocks.probeValues; const def = fieldDef(data.fields, field);
  if (pv.byField[field] !== undefined) return pv.byField[field];
  if (def.kind === 'choice') return def.options && def.options.length ? def.options[0][0] : 'x';
  if (def.kind === 'month') return '2027-06';
  if (def.kind === 'credits') return {};
  return pv[def.kind] !== undefined ? pv[def.kind] : 1;
}
function clone(record) { return JSON.parse(JSON.stringify(Object.assign({}, record, { journal: [] }))); }
function empty(f) { return !f || f.v === null || f.v === undefined || f.state === 'unknown' || f.state === 'will-send'; }
export function probes(record, data, cap) {
  const list = [];
  SUN_ASKED.forEach(id => { if (empty(record.sun.f[id])) list.push({ id: 'sun:' + id, kind: 'sun', planet: 'sun', type: null, field: id, rowId: 'sun', addRow: false, label: fieldLabel(data, 'sun', null, id), where: 'Household facts', href: '#/home' }); });
  /* fields still empty on rows that exist, the primary one first */
  PLANETS.forEach(p => record.planets[p].rows.forEach(r => {
    let t; try { t = typeDef(data.fields, p, r.type); } catch (e) { return; }
    t.fields.forEach(fid => { const d = fieldDef(data.fields, fid); if (d.tag) return; if (!empty(r.f[fid])) return; list.push({ id: 'row:' + r.id + ':' + fid, kind: 'field', planet: p, type: r.type, field: fid, rowId: r.id, addRow: false, primary: !!d.primary, label: (r.nickname ? r.nickname + ': ' : typeLabel(data, p, r.type) + ': ') + d.label, where: PLANET_LABELS[p] + ': ' + t.label, href: '#/ledger/' + p + '/' + r.type }); });
  }));
  /* rough figures that a confirmation would make solid */
  PLANETS.forEach(p => record.planets[p].rows.forEach(r => {
    let t; try { t = typeDef(data.fields, p, r.type); } catch (e) { return; }
    t.fields.forEach(fid => { const d = fieldDef(data.fields, fid); const f = r.f[fid]; if (d.tag || empty(f)) return; if (f.state !== 'rough' && f.source !== 'estimated') return; list.push({ id: 'confirm:' + r.id + ':' + fid, kind: 'confirm', planet: p, type: r.type, field: fid, rowId: r.id, addRow: false, label: 'Confirm ' + (r.nickname ? r.nickname + ': ' : '') + d.label.toLowerCase(), where: PLANET_LABELS[p] + ': ' + t.label, href: '#/ledger/' + p + '/' + r.type }); });
  }));
  /* a first row of each type that has none */
  data.unlocks.probeTypes.forEach(([p, type]) => {
    if (record.planets[p].rows.some(r => r.type === type)) return;
    const t = typeDef(data.fields, p, type); const prim = t.fields.find(fid => fieldDef(data.fields, fid).primary) || t.fields[0];
    list.push({ id: 'type:' + p + ':' + type, kind: 'type', planet: p, type, field: prim, firstField: t.nameField || null, rowId: null, addRow: true, label: t.label + ': ' + (t.nameField ? fieldDef(data.fields, t.nameField).label.toLowerCase() + ' and ' : '') + fieldDef(data.fields, prim).label.toLowerCase(), where: PLANET_LABELS[p] + ': ' + t.label, href: '#/ledger/' + p + '/' + type });
  });
  /* primaries first, then new rows, then the rest; the cap keeps the probing under a quarter second */
  const w = x => x.primary ? 0 : x.kind === 'confirm' ? 1 : x.kind === 'type' || x.kind === 'sun' ? 2 : 3;
  list.sort((a, b) => w(a) - w(b));
  return list.slice(0, cap || 48);
}
export function applyProbe(record, probe, data) {
  const rec = clone(record);
  if (probe.kind === 'sun') { setField(rec, 'sun', probe.field, data.unlocks.probeValues.sun[probe.field], 'known', 'client'); return rec; }
  if (probe.kind === 'confirm') { const f = rec.planets[probe.planet].rows.find(r => r.id === probe.rowId).f[probe.field]; const v = f.v && typeof f.v === 'object' && 'low' in f.v ? Math.round((f.v.low + f.v.high) / 2) : f.v; setField(rec, probe.rowId, probe.field, v, 'verified', 'client', { cad: f.cad }); return rec; }
  if (probe.kind === 'field') { const d = fieldDef(data.fields, probe.field); setField(rec, probe.rowId, probe.field, probeValue(data, probe.field), 'known', 'client', { cad: d.cadence ? d.defaultCadence : undefined }); return rec; }
  const t = typeDef(data.fields, probe.planet, probe.type);
  const row = createRow(probe.planet, probe.type, { nickname: t.label, f: freshFacts(data.fields, probe.planet, probe.type) });
  addRow(rec, row);
  t.fields.forEach(fid => { const d = fieldDef(data.fields, fid); if (d.tag || (d.optional && !d.primary) || (!d.primary && ['money', 'percent', 'int', 'hours', 'month'].includes(d.kind) && fid !== t.nameField)) return; setField(rec, row.id, fid, probeValue(data, fid), 'known', 'client', { cad: d.cadence ? d.defaultCadence : undefined }); });
  return rec;
}
/* Ranked: the inputs that open the most, with what each opens. opts.top (default 3), opts.cap probes. */
export function nextUnlocks(record, result, data, opts) {
  const o = opts || {}; const today = result.today;
  const base = stateOf(result, data);
  const out = probes(record, data, o.cap).map(probe => {
    let R; try { R = compute(applyProbe(record, probe, data), data, { today, light: true }); } catch (e) { return null; }
    const u = unlocksBetween(base, stateOf(R, data), R, data);
    const score = u.charts.length * 2 + u.metrics.reduce((s, m) => s + (m.to === 'solid' ? 1 : 0.6), 0) + u.lenses.length;
    return { probe, unlocks: u, score };
  }).filter(x => x && x.unlocks.count > 0).sort((a, b) => b.score - a.score || b.unlocks.count - a.unlocks.count || a.probe.label.localeCompare(b.probe.label));
  return out.slice(0, o.top || 3);
}
