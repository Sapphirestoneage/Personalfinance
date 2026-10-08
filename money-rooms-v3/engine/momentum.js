/* Momentum (Level 12, MR-063): snapshots of every metric, trends since the
   last snapshot and since the start, why a number moved (learned, did,
   market, time), milestone ladders with one-time celebrations, personal
   bests and the next action per metric. Pure: reads the record, the result
   and the registry; writes only through the two append functions. The
   "why it moved" split rewinds the journal to the snapshot and re-runs the
   engine with each group of changes put back, so every share is the engine's
   own answer, never a guess. */
import { append } from './journal.js';
import { findRow } from './record.js';
import * as F from './format.js';

const okM = m => m && m.status === 'ok';
/* the registry entry: from the libraries when given, else from the metric itself (every metric carries its def) */
export function defOf(result, data, id) { return (data && data.metrics.metrics.find(x => x.id === id)) || (result && result.metrics && result.metrics[id] && result.metrics[id].def) || null; }
export function defsOf(result, data) { return data ? data.metrics.metrics : Object.values(result.metrics || {}).map(m => m.def).filter(Boolean); }
const RANK = { watch: 0, ok: 1, healthy: 2 };

/* ---- a metric as one number ---- */
export function numOf(m) {
  if (!okM(m)) return null; const v = m.value;
  if (typeof v.cents === 'number') return v.cents;
  if (v.kind === 'ratio' || v.kind === 'count') return typeof v.value === 'number' ? v.value : null;
  if (v.kind === 'date' && typeof v.value === 'string') { const [y, mo] = v.value.split('-').map(Number); return y * 12 + (mo || 1) - 1; }
  if (v.kind === 'list' && v.value && typeof v.value.full === 'number') return v.value.full; /* runway: the full-spending months */
  return null;
}
export function textOf(m) {
  if (!okM(m)) return ''; const v = m.value;
  if (typeof v.cents === 'number') return F.dollarsWhole(v.cents, { rough: v.rough });
  if (v.kind === 'list' && v.value && typeof v.value.full === 'number') return F.months(v.value.full);
  try { return F.value(v) || ''; } catch (e) { return ''; }
}
/* the unit a difference is read in */
export function unitOf(def) {
  const k = def.units && def.units.kind;
  if (k === 'money') return 'cents'; if (k === 'date') return 'months'; if (k === 'ratio') return 'ratio'; if (k === 'count') return def.units.unit || 'count'; if (def.id === 'runway') return 'months'; return 'value';
}
/* a change too small to show at the unit's precision reads as no change at all */
export function shown(def, delta) {
  if (delta === null || delta === undefined) return 0;
  const u = unitOf(def);
  if (u === 'cents') return Math.round(delta / 100) * 100;
  if (u === 'ratio') return Math.round(delta * 1000) / 1000;
  if (u === 'months') return Math.round(delta); /* read to the month */
  return Math.round(delta * 10) / 10;
}
export function deltaText(def, delta) {
  if (delta === null || delta === undefined) return '';
  delta = shown(def, delta);
  const u = unitOf(def); const a = Math.abs(delta); const sign = delta > 0 ? 'up ' : delta < 0 ? 'down ' : '';
  if (!delta) return 'the same';
  if (u === 'cents') return sign + F.dollarsWhole(a);
  if (u === 'months') return (def.units && def.units.kind === 'date' ? (delta > 0 ? 'later by ' : 'sooner by ') : sign) + F.months(a);
  if (u === 'ratio') return sign + (Math.round(a * 1000) / 10) + ' points';
  return sign + (Math.round(a * 10) / 10) + ' ' + u;
}
/* better, worse or the same, by the metric's direction */
export function betterness(def, delta) {
  if (!shown(def, delta)) return 'same';
  if (def.direction === 'neutral') return 'moved';
  return (def.direction === 'higher') === (delta > 0) ? 'better' : 'worse';
}

/* ---- snapshots ---- */
export function snapshotsOf(record) { return record.snapshots || []; }
export function takeSnapshot(record, result, kind, meta) {
  const m = meta || {}; const ts = m.now || new Date().toISOString();
  const values = {}; const texts = {};
  Object.keys(result.metrics || {}).forEach(id => { const n = numOf(result.metrics[id]); if (n !== null) { values[id] = n; texts[id] = textOf(result.metrics[id]); } });
  const snap = { ts, kind, today: result.today, session: m.session || null, values, texts };
  record.snapshots = record.snapshots || []; record.snapshots.push(snap);
  append(record.journal, { kind: 'snapshot', planet: 'sun', rowId: 'sun', field: kind, owner: 'sun', old: null, new: kind, source: 'client', state: 'known', session: m.session || null }, ts);
  return snap;
}
export function lastSnapshot(record) { const s = snapshotsOf(record); return s.length ? s[s.length - 1] : null; }
export function firstSnapshot(record) { const s = snapshotsOf(record); return s.length ? s[0] : null; }

/* ---- trends ---- */
export function trend(record, result, data, id) {
  const def = defOf(result, data, id); if (!def) return null; const m = result.metrics[id]; const now = numOf(m);
  const last = lastSnapshot(record); const first = firstSnapshot(record);
  const leg = (snap, word) => { if (!snap || now === null || snap.values[id] === undefined) return null; const d = now - snap.values[id]; const sd = shown(def, d); return { from: snap.values[id], fromText: snap.texts[id], to: now, delta: sd, ts: snap.ts, kind: snap.kind, arrow: sd > 0 ? 'up' : sd < 0 ? 'down' : 'flat', verdict: betterness(def, d), text: deltaText(def, d) + ' since ' + word }; };
  return { id, now, nowText: textOf(m), sinceLast: leg(last, last && last.kind === 'session' ? 'last session' : 'last time'), sinceStart: leg(first && first !== last ? first : (first === last ? first : null), 'you started') };
}

/* ---- rewinding the journal ---- */
const DATA = ['set', 'add-row', 'remove-row'];
function applySide(record, line, side) {
  const v = line[side];
  if (line.kind === 'set') {
    const target = line.rowId === 'sun' ? record.sun : findRow(record, line.rowId); if (!target) return;
    if (line.column) { target[line.field] = v; return; }
    if (v === null || v === undefined) delete target.f[line.field]; else target.f[line.field] = Object.assign({}, v);
    return;
  }
  const rows = record.planets[line.planet] && record.planets[line.planet].rows; if (!rows) return;
  const want = line.kind === 'add-row' ? (side === 'new' ? 'present' : 'absent') : (side === 'new' ? 'absent' : 'present');
  const i = rows.findIndex(r => r.id === line.rowId);
  if (want === 'present' && i === -1) rows.push(JSON.parse(JSON.stringify(v)));
  if (want === 'absent' && i !== -1) rows.splice(i, 1);
}
/* a copy of the record as it stood at `ts`: every data line after it undone, newest first */
export function rewind(record, ts) {
  const rec = JSON.parse(JSON.stringify(record));
  const lines = rec.journal.filter(l => l.ts > ts && DATA.includes(l.kind)).slice().reverse();
  lines.forEach(l => applySide(rec, l, 'old'));
  return rec;
}
export function linesSince(record, ts) { return record.journal.filter(l => l.ts > ts && DATA.includes(l.kind)); }

/* ---- why it moved ---- */
const num = f => (f && typeof f.v === 'number' ? f.v : (f && f.v && typeof f.v === 'object' && 'low' in f.v ? Math.round((f.v.low + f.v.high) / 2) : null));
const CASH_TYPES = ['hysa', 'checking', 'savings', 'cash', 'cd', 'moneyMarket'];
/* which bucket a journal line belongs to: learned (a correction), did (a move), market (the part of a balance change that contributions do not explain) */
export function bucketOf(line, record, snapTs) {
  if (line.kind === 'add-row') return (line.new && line.new.guess) ? 'learned' : 'did';
  if (line.kind === 'remove-row') return (line.old && line.old.guess) ? 'learned' : 'did';
  if (line.why === 'correction') return 'learned';
  if (line.why === 'move') {
    if (line.planet === 'invest' && line.field === 'accountBalance') {
      const row = findRow(record, line.rowId); const type = row && row.f.accountType && row.f.accountType.v;
      if (CASH_TYPES.includes(type)) return 'did'; /* cash moves by hand, never by the market */
      const sp = splitMove(line, record, snapTs);
      if (!sp) return 'market'; /* an investment with no contribution figure of its own moves with the market */
      /* contributions explain up to their expected amount; the rest is the market */
      return Math.abs(sp.delta) <= Math.abs(sp.expected) * 1.1 && Math.sign(sp.delta) === Math.sign(sp.expected) ? 'did' : 'market';
    }
    return 'did';
  }
  return null; /* paperwork: a state or source change */
}
/* the expected contributions between the snapshot and a balance move, read from the row's own contribution amount */
export function splitMove(line, record, snapTs) {
  const row = findRow(record, line.rowId); const contrib = row && num(row.f.contribAmount); if (!contrib) return null;
  const months = Math.max(0, (new Date(line.ts) - new Date(snapTs)) / (30.44 * 24 * 3600 * 1000));
  const delta = (num(line.new) || 0) - (num(line.old) || 0); const expected = Math.round(contrib * months);
  return { delta, expected, months };
}
/* a balance move with contributions behind it counts twice: the contributions as "did", the rest as "market".
   Two stand-in lines share the move's new value; undoing one leaves only the other's effect in place. */
function groupLines(lines, record, snapTs) {
  const groups = { learned: [], did: [], market: [] };
  lines.forEach(l => {
    const b = bucketOf(l, record, snapTs); if (!b) return;
    if (b === 'market' && l.kind === 'set') {
      const sp = splitMove(l, record, snapTs);
      if (sp && sp.expected && Math.sign(sp.expected) !== Math.sign(sp.delta || sp.expected) || (sp && Math.abs(sp.delta) > Math.abs(sp.expected) * 1.1)) {
        const newV = num(l.new) || 0; const oldV = num(l.old) || 0;
        groups.did.push(Object.assign({}, l, { old: Object.assign({}, l.new, { v: newV - sp.expected }) }));
        groups.market.push(Object.assign({}, l, { old: Object.assign({}, l.new, { v: oldV + sp.expected }) }));
        return;
      }
    }
    groups[b].push(l);
  });
  return groups;
}
/* opts.compute(record, today) runs the engine; the result is the engine's own split of the change */
export function whyMoved(record, result, data, id, opts) {
  const snap = lastSnapshot(record); const def = defOf(result, data, id);
  if (!snap || !def) return null;
  const compute = opts.compute;
  const nowVal = numOf(result.metrics[id]); const thenVal = snap.values[id] !== undefined ? snap.values[id] : null;
  if (nowVal === null || thenVal === null) return { id, total: null, parts: null, sentences: ['Not enough history for this one yet.'] };
  const total = nowVal - thenVal;
  const lines = linesSince(record, snap.ts);
  const groups = groupLines(lines, record, snap.ts);
  /* leave one group out: the after record with that group's lines undone, run today */
  const valueWithout = group => { if (!group.length) return nowVal; const rec = JSON.parse(JSON.stringify(record)); group.slice().reverse().forEach(l => applySide(rec, l, 'old')); const R = compute(rec, result.today); const v = numOf(R.metrics[id]); return v === null ? nowVal : v; };
  const parts = {};
  ['learned', 'did', 'market'].forEach(k => { parts[k] = Math.round((nowVal - valueWithout(groups[k])) * 1e6) / 1e6; });
  /* time: the calendar moving, read from the before record run then and now */
  let time = 0;
  try { const before = rewind(record, snap.ts); const thenR = compute(before, snap.today || snap.ts.slice(0, 10)); const nowR = compute(before, result.today); const a = numOf(thenR.metrics[id]), b = numOf(nowR.metrics[id]); if (a !== null && b !== null) time = Math.round((b - a) * 1e6) / 1e6; } catch (e) { time = 0; }
  parts.time = time;
  const explained = parts.learned + parts.did + parts.market + parts.time;
  parts.other = Math.round((total - explained) * 1e6) / 1e6;
  const better = d => betterness(def, d);
  const sentences = [];
  const say = (k, who) => { if (Math.abs(parts[k]) < 1e-9) return; sentences.push(who + ': ' + deltaText(def, parts[k]) + (better(parts[k]) === 'better' ? ', the right way.' : better(parts[k]) === 'worse' ? '.' : '.')); };
  say('learned', 'What you learned'); say('did', 'What you did'); say('market', 'The market'); say('time', 'Time passing');
  if (!sentences.length) sentences.push('Nothing moved it since ' + (snap.kind === 'session' ? 'the last session' : 'last time') + '.');
  return { id, since: snap.ts, sinceKind: snap.kind, total, totalText: deltaText(def, total), verdict: better(total), parts, sentences, marketNote: parts.market && better(parts.market) === 'worse' ? 'A down market is not your doing; what you did still counts for you.' : null };
}

/* ---- milestones ---- */
export function ladderOf(def) { return Array.isArray(def.milestones) && def.milestones.length ? def.milestones.slice() : null; }
function passed(def, value, rung) { return def.direction === 'lower' ? value <= rung : value >= rung; }
/* dollars that a step of the ladder means, where the metric has a plain dollar meaning */
export function stepDollars(def, result, distance) {
  const M = result.metrics; const S = result.sun && result.sun.outputs;
  if (distance === null || distance === undefined) return null;
  if (def.id === 'savingsRateTakeHome' && okM(M.takeHome)) return { cents: Math.round(distance * M.takeHome.value.cents), per: 'month' };
  if (def.id === 'savingsRateGross' && okM(M.gross)) return { cents: Math.round(distance * M.gross.value.cents), per: 'month' };
  if (def.id === 'pctToFi' && okM(M.fiNumber)) return { cents: Math.round(distance * M.fiNumber.value.cents), per: 'oneoff' };
  if (def.id === 'runway' && okM(M.spending)) return { cents: Math.round(distance * M.spending.value.cents), per: 'oneoff' };
  if (def.id === 'completeness' && M.completeness && M.completeness.totalCents) return { cents: Math.round(distance * M.completeness.totalCents / 12), per: 'month' };
  if (def.id === 'utilization' && S && S.debt && okM(S.debt.utilization) && S.debt.utilization.limit) return { cents: Math.round(distance * S.debt.utilization.limit), per: 'oneoff' };
  if (unitOf(def) === 'cents') return { cents: Math.round(distance), per: def.units.period === 'monthly' ? 'month' : 'oneoff' };
  return null;
}
export function milestone(record, result, data, id) {
  const def = defOf(result, data, id); if (!def) return null;
  const ladder = ladderOf(def); const value = numOf(result.metrics[id]);
  if (!ladder || value === null) return null;
  const done = ladder.filter(r => passed(def, value, r)); const next = ladder.find(r => !passed(def, value, r));
  const current = done.length ? (def.direction === 'lower' ? Math.min(...done) : Math.max(...done)) : null;
  const distance = next === undefined ? 0 : Math.abs(next - value);
  const dollars = next === undefined ? null : stepDollars(def, result, distance);
  /* the earliest month at the current pace: the slope of the last two snapshots */
  const snaps = snapshotsOf(record).filter(s => s.values[id] !== undefined); let earliest = null;
  if (next !== undefined && snaps.length >= 1) {
    const last = snaps[snaps.length - 1]; const months = Math.max(0.5, (new Date(result.today) - new Date(last.ts)) / (30.44 * 24 * 3600 * 1000));
    const pace = (value - last.values[id]) / months; const towards = def.direction === 'lower' ? -pace : pace;
    if (towards > 0) { const n = Math.ceil(distance / towards); const d = new Date(result.today); d.setMonth(d.getMonth() + n); earliest = d.toISOString().slice(0, 7); }
  }
  const fmt = r => unitOf(def) === 'cents' ? F.dollarsWhole(r) : unitOf(def) === 'ratio' ? F.percent(r, { places: 0 }) : unitOf(def) === 'months' ? F.months(r) : String(r) + (def.units && def.units.unit ? ' ' + def.units.unit : '');
  return { id, ladder, current, next: next === undefined ? null : next, done: next === undefined, distance, distanceText: next === undefined ? 'reached the top of the ladder' : deltaText(def, def.direction === 'lower' ? -distance : distance).replace(/^(up|down) /, '') + ' to ' + fmt(next), dollars, dollarsText: dollars ? F.dollarsWhole(dollars.cents) + (dollars.per === 'month' ? ' a month' : '') : null, earliest, currentText: current === null ? null : fmt(current), nextText: next === undefined ? null : fmt(next), rungIndex: done.length, of: ladder.length };
}
/* every ladder with a next rung, nearest first */
export function milestones(record, result, data) {
  return defsOf(result, data).map(d => milestone(record, result, data, d.id)).filter(Boolean);
}
/* crossings since the last celebration, logged once each */
export function celebrate(record, result, data, meta) {
  const m = meta || {}; record.celebrations = record.celebrations || [];
  const seen = new Set(record.celebrations.map(c => c.metric + ':' + c.rung));
  const fresh = [];
  milestones(record, result, data).forEach(ms => { ms.ladder.forEach(r => { const def = defOf(result, data, ms.id); const value = numOf(result.metrics[ms.id]); if (value === null || !passed(def, value, r)) return; const key = ms.id + ':' + r; if (seen.has(key)) return; seen.add(key); const c = { ts: m.now || new Date().toISOString(), metric: ms.id, rung: r, text: (def.clientLabel || def.name) + ' reached ' + (unitOf(def) === 'cents' ? F.dollarsWhole(r) : unitOf(def) === 'ratio' ? F.percent(r, { places: 0 }) : unitOf(def) === 'months' ? F.months(r) : String(r)) }; record.celebrations.push(c); fresh.push(c); }); });
  if (fresh.length) append(record.journal, { kind: 'celebration', planet: 'sun', rowId: 'sun', field: null, owner: 'sun', old: null, new: fresh.map(c => c.metric + ':' + c.rung).join(','), source: 'client', state: 'known', session: m.session || null }, m.now);
  return fresh;
}
/* the first run marks what is already passed as celebrated, so nothing old is cheered as new */
export function seedCelebrations(record, result, data, meta) { if (record.celebrations && record.celebrations.length) return []; record.celebrations = []; return celebrate(record, result, data, meta).map(c => Object.assign(c, { seeded: true })); }

/* ---- personal bests ---- */
export function personalBests(record, result, data) {
  const snaps = snapshotsOf(record); const M = result.metrics;
  const best = (id, pick) => { const vals = snaps.map(s => s.values[id]).filter(v => typeof v === 'number'); const now = numOf(M[id]); const prev = vals.length ? vals.reduce(pick) : null; const isNew = now !== null && (prev === null || pick(now, prev) === now && now !== prev); return { id, now, prev, isNew }; };
  const out = [];
  const sr = best('savingsRateTakeHome', (a, b) => (a >= b ? a : b)); if (sr.now !== null) out.push({ key: 'savingsRate', label: 'Best savings rate', value: F.percent(sr.now, { places: 1 }), isNew: sr.isNew && snaps.length > 0 });
  const sp = best('spending', (a, b) => (a <= b ? a : b)); if (sp.now !== null) out.push({ key: 'lowestSpending', label: 'Lowest month of spending', value: F.dollarsWhole(sp.now), isNew: sp.isNew && snaps.length > 0 });
  /* the largest single debt payoff, read from the journal */
  let payoff = null; record.journal.forEach(l => { if (l.kind === 'set' && l.planet === 'debt' && l.field === 'balance' && l.why === 'move') { const d = (num(l.old) || 0) - (num(l.new) || 0); if (d > 0 && (!payoff || d > payoff.cents)) payoff = { cents: d, ts: l.ts }; } });
  if (payoff) out.push({ key: 'payoff', label: 'Largest debt payment', value: F.dollarsWhole(payoff.cents), isNew: snaps.length > 0 && payoff.ts > (lastSnapshot(record) || { ts: '' }).ts });
  /* months without a fee: snapshots where the mistakes line is zero */
  const streak = snaps.reduce((acc, s) => { const v = s.values.leak; return v === 0 ? acc + 1 : 0; }, 0);
  if (snaps.length) out.push({ key: 'noFee', label: 'Snapshots in a row with no leak', value: String(streak), isNew: false });
  return out;
}

/* ---- next action ---- */
export function nextActionFor(def, sens, result) {
  const items = sens && sens.items ? sens.items : [];
  const levers = (def.levers || []).map(l => { const hit = items.filter(i => i.rootId === l.root && i.impact !== null && !i.windfall).sort((a, b) => b.impact - a.impact)[0] || null; return { lever: l, hit }; });
  const picked = levers.sort((a, b) => ((b.hit && b.hit.impact) || 0) - ((a.hit && a.hit.impact) || 0))[0];
  if (!picked) return null;
  const hit = picked.hit;
  return { text: picked.lever.text, root: picked.lever.root, sign: picked.lever.sign, months: hit ? hit.impact : null, impactLabel: hit ? hit.impactLabel : null, planet: hit ? hit.planet : null, rowId: hit ? hit.rowId : null, label: hit ? hit.label : null, sentence: picked.lever.text + (hit && hit.impact ? ' About ' + F.months(hit.impact) + ' on the FI date ' + (hit.impactLabel || '').replace(/^per /, 'for every ') + '.' : '') };
}
export function overallNextAction(sens) { if (!sens || !sens.ranked || !sens.ranked.top) return null; const t = sens.ranked.top; return { label: t.label, row: t.row, planet: t.planet, rowId: t.rowId, months: t.impact, impactLabel: t.impactLabel, sentence: sens.ranked.headline, family: t.family }; }

/* ---- the headline six ---- */
export function headlineIds(record, result, data) {
  const base = (record.scoreboard && Array.isArray(record.scoreboard.headline) && record.scoreboard.headline.length ? record.scoreboard.headline : data.metrics.headlineDefault || []).slice();
  /* no debt: net worth takes the debt-free tile */
  const i = base.indexOf('debtFree'); if (i !== -1 && !(result.debts && result.debts.length)) base[i] = 'netWorth';
  return base;
}

/* ---- bands ---- */
export function bandOf(def, value, sourceId) {
  if (!def.bands || value === null || value === undefined) return null;
  const src = (def.bands.sources || []).find(s => s.id === (sourceId || 'default')) || (def.bands.sources || [])[0]; if (!src) return null;
  const inside = r => r && value >= r[0] && value <= r[1];
  const zone = inside(src.healthy) ? 'healthy' : inside(src.ok) ? 'ok' : 'watch';
  return { zone, rank: RANK[zone], source: src.label, verify: !!def.bands.verify, healthy: src.healthy, ok: src.ok, alternatives: (def.bands.sources || []).filter(s => s.id !== src.id).map(s => ({ id: s.id, label: s.label, zone: inside(s.healthy) ? 'healthy' : inside(s.ok) ? 'ok' : 'watch' })) };
}
