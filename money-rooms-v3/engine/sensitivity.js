/* Sensitivity (Level 9, MR-042): which numbers move the FI date most, and
   which unsure numbers are most worth pinning down. For every root that
   reaches the FI date the record is copied, the one value is nudged, the
   whole engine runs again and the FI crossing is read to the month. Impact
   is the FI date change per standard shock ($100 a month, 10% of a balance,
   one point of a rate); ask priority is the change across the value's
   plausible range by answer state (data/weights.json "uncertainty").
   Pure and deterministic; memoise it per record version outside. */
import { compute } from './compute.js';
import { buildGraph, reachesFiDate, netSign } from './graph.js';
import { hasValue, numberOf, rangeOf } from './states.js';
import { cadenceToMonthly } from './units.js';
import { RUNGS } from './fiLadder.js';

const PAYCHECKS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

/* Months from today to the FI crossing, interpolated inside the crossing year; null when the projection never gets there. */
export function fiMonths(result) {
  const pj = result.projection; const inp = result.projectionInputs;
  if (!pj || !inp) return null;
  const target = inp.annualSpend / inp.asm.withdrawalRate;
  const debt0 = (result.debts || []).reduce((s, d) => s + (d.balance || 0), 0);
  let prev = inp.invested + inp.cash - debt0;
  if (prev >= target) return 0;
  const path = pj.likely.path;
  for (let i = 0; i < path.length; i++) {
    const nw = path[i].netWorth;
    if (nw >= target) { const frac = nw === prev ? 1 : Math.min(1, Math.max(0, (target - prev) / (nw - prev))); return Math.round((i + frac) * 12 * 10) / 10; }
    prev = nw;
  }
  return null;
}

function rungNumbers(result) { const out = {}; RUNGS.forEach(id => { const m = result.metrics[id]; out[id] = m && m.status === 'ok' ? m.value.cents : null; }); return out; }
function lightClone(record) { return Object.assign({}, record, { planets: structuredClone(record.planets), sun: structuredClone(record.sun), journal: [] }); }
function cadenceCents(row, f, monthlyCents) {
  const cad = f.cad || 'month'; const n = PAYCHECKS[row.f.payFrequency && hasValue(row.f.payFrequency) ? row.f.payFrequency.v : 'biweekly'] || 26;
  switch (cad) { case 'month': return monthlyCents; case 'week': return Math.round(monthlyCents * 12 / 52); case 'quarter': return monthlyCents * 3; case 'year': return monthlyCents * 12; case 'paycheck': return Math.round(monthlyCents * 12 / n); default: return monthlyCents; }
}
function setValue(f, v) { if (f.v && typeof f.v === 'object' && 'low' in f.v) { const mid = (f.v.low + f.v.high) / 2; const k = mid ? v / mid : 1; f.v = { low: Math.round(f.v.low * k), high: Math.round(f.v.high * k) }; } else f.v = v; if (f.state === 'unknown' || f.state === 'will-send') f.state = 'rough'; }

/* The shocks a root takes, by its kind. Each returns a new value for the field. */
function shocksFor(def, row, f, value) {
  const money = def.kind === 'money'; const monthly = money && def.cadence;
  const list = [];
  if (monthly) {
    const c100 = cadenceCents(row, f, 10000);
    list.push({ id: 'plus100', label: '+$100 a month', standard: true, value: value + c100 }, { id: 'minus100', label: '-$100 a month', standard: true, value: Math.max(0, value - c100) });
    list.push({ id: 'plus10pct', label: '+10%', value: Math.round(value * 1.1) }, { id: 'minus10pct', label: '-10%', value: Math.round(value * 0.9) });
  } else if (def.kind === 'int' && /age/i.test(def.label)) {
    list.push({ id: 'plus1yr', label: '+1 year', standard: true, value: value + 1 }, { id: 'minus1yr', label: '-1 year', standard: true, value: Math.max(0, value - 1) });
  } else if (money || def.kind === 'int') {
    list.push({ id: 'plus10pct', label: '+10%', standard: true, value: Math.round(value * 1.1) }, { id: 'minus10pct', label: '-10%', standard: true, value: Math.round(value * 0.9) });
  } else if (def.kind === 'percent') {
    list.push({ id: 'plus1pt', label: '+1 point', standard: true, value: value + 0.01 }, { id: 'minus1pt', label: '-1 point', standard: true, value: Math.max(0, value - 0.01) });
  }
  return list;
}
function standardLabel(def) { return def.kind === 'money' && def.cadence ? 'per $100 a month' : def.kind === 'percent' ? 'per point' : def.kind === 'int' && /age/i.test(def.label) ? 'per year' : 'per 10%'; }

/* ctx: { record, data, today, maxRoots } */
export function sensitivity(ctx) {
  const { record, data } = ctx; const today = ctx.today || new Date().toISOString().slice(0, 10);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const base = compute(record, data, { today });
  const baseMonths = fiMonths(base);
  const baseRungs = rungNumbers(base);
  const out = { baseMonths, baseFiAge: base.projection && base.projection.likely ? base.projection.likely.fiAge : null, items: [], computes: 1, ms: 0, hasFiDate: baseMonths !== null };
  if (baseMonths === null) return out;
  const g = buildGraph(data); const fields = data.fields; const unc = data.weights.uncertainty || {};
  const run = mutate => { const c = lightClone(record); mutate(c); const R = compute(c, data, { today }); out.computes++; const m = fiMonths(R); return { months: m === null ? null : Math.round((m - baseMonths) * 10) / 10, rungs: (() => { const r = rungNumbers(R); const d = {}; RUNGS.forEach(id => { d[id] = r[id] === null || baseRungs[id] === null ? null : r[id] - baseRungs[id]; }); return d; })(), fiAge: R.projection && R.projection.likely ? R.projection.likely.fiAge : null };
  };
  const findRow = (c, id) => Object.values(c.planets).flatMap(p => p.rows).find(r => r.id === id);
  /* candidate roots: typed money, percent and count fields that reach the FI date */
  let roots = [];
  Object.keys(record.planets).forEach(p => record.planets[p].rows.forEach(r => Object.keys(r.f).forEach(fid => {
    if (r.type === 'summary' && record.planets[p].rows.some(x => x.type !== 'summary' && x.type !== 'score' && x.type !== 'holding')) return; /* a rough total superseded by detail */
    const def = fields.fields[fid]; const f = r.f[fid];
    if (!def || def.tag || !f || !hasValue(f)) return;
    if (!['money', 'percent', 'int'].includes(def.kind)) return;
    if (!reachesFiDate(g, fid)) return;
    const v = numberOf(f); if (v === null) return;
    const annual = def.kind === 'money' ? (def.cadence ? cadenceToMonthly(v, f.cad || 'month', PAYCHECKS[r.f.payFrequency && hasValue(r.f.payFrequency) ? r.f.payFrequency.v : 'biweekly'] || 26) * 12 : v) : 0;
    roots.push({ kind: 'field', rowId: r.id, field: fid, def, row: r, f, value: v, annual: Math.abs(annual), planet: p });
  })));
  roots.sort((a, b) => b.annual - a.annual);
  if (ctx.maxRoots) roots = roots.slice(0, ctx.maxRoots);
  const family = id => (g.nodes.get(id) || {}).family || 'assume';
  roots.forEach(rt => {
    const shocks = shocksFor(rt.def, rt.row, rt.f, rt.value).map(s => Object.assign({}, s, run(c => { const row = findRow(c, rt.rowId); setValue(row.f[rt.field], s.value); })));
    /* ask priority: the plausible range by state, or the typed range */
    const typed = rangeOf(rt.f); const u = rt.f.source === 'estimated' ? (unc.estimated || 0.35) : (unc[rt.f.state] !== undefined ? unc[rt.f.state] : 0.05);
    const lo = typed ? typed.low : Math.round(rt.value * (1 - u)); const hi = typed ? typed.high : Math.round(rt.value * (1 + u));
    const rLo = run(c => { setValue(findRow(c, rt.rowId).f[rt.field], lo); }); const rHi = run(c => { setValue(findRow(c, rt.rowId).f[rt.field], hi); });
    const askRange = rLo.months === null || rHi.months === null ? null : Math.round(Math.abs(rHi.months - rLo.months) * 10) / 10;
    const std = shocks.filter(s => s.standard && s.months !== null);
    const impact = std.length ? Math.round(std.reduce((s, x) => s + Math.abs(x.months), 0) / std.length * 10) / 10 : null;
    const up = std.find(s => /^plus/.test(s.id)); const signed = up ? Math.sign(up.months) : 0;
    out.items.push({ id: rt.rowId + '|' + rt.field, rootId: rt.field, rowId: rt.rowId, planet: rt.planet, label: rt.def.label, row: rt.row.nickname || rt.row.type, kind: rt.def.kind, cadence: rt.f.cad || null, state: rt.f.state, source: rt.f.source, value: rt.value, annual: rt.annual, family: family(rt.field), direction: signed, impact, impactLabel: standardLabel(rt.def), askRange, range: { low: lo, high: hi, typed: !!typed, spread: typed ? null : u }, shocks, sign: netSign(g, rt.field, 'm.fiDate') });
  });
  /* the whole of spending at once: the double lever */
  const lines = record.planets.spending.rows.filter(r => r.type === 'line' && r.f.amount && hasValue(r.f.amount));
  if (lines.length) {
    const total = lines.reduce((s, r) => s + cadenceToMonthly(numberOf(r.f.amount), r.f.amount.cad || 'month', 26), 0);
    const scaleAll = k => c => c.planets.spending.rows.filter(r => r.type === 'line' && r.f.amount && hasValue(r.f.amount)).forEach(r => setValue(r.f.amount, Math.round(numberOf(r.f.amount) * k)));
    const shift = d => c => { const rows = c.planets.spending.rows.filter(r => r.type === 'line' && r.f.amount && hasValue(r.f.amount)); const big = rows.sort((a, b) => numberOf(b.f.amount) - numberOf(a.f.amount))[0]; setValue(big.f.amount, Math.max(0, numberOf(big.f.amount) + cadenceCents(big, big.f.amount, d))); };
    const shocks = [
      Object.assign({ id: 'plus100', label: '+$100 a month', standard: true }, run(shift(10000))), Object.assign({ id: 'minus100', label: '-$100 a month', standard: true }, run(shift(-10000))),
      Object.assign({ id: 'plus10pct', label: '+10%' }, run(scaleAll(1.1))), Object.assign({ id: 'minus10pct', label: '-10%' }, run(scaleAll(0.9)))];
    const std = shocks.filter(s => s.standard && s.months !== null);
    out.items.push({ id: 'spending|all', rootId: 'amount', rowId: null, planet: 'spending', label: 'All spending lines', row: 'Spending', kind: 'money', cadence: 'month', state: 'known', source: 'client', value: total, annual: total * 12, family: 'spend', direction: 1, impact: std.length ? Math.round(std.reduce((s, x) => s + Math.abs(x.months), 0) / std.length * 10) / 10 : null, impactLabel: 'per $100 a month', askRange: null, range: null, shocks, sign: 1, aggregate: true });
  }
  /* assumptions and one-offs */
  const asmShock = (key, label, fn, extra) => { const r = run(c => { c.sun.assumptions = Object.assign({}, c.sun.assumptions || {}); fn(c.sun.assumptions); }); out.items.push(Object.assign({ id: 'asm|' + key, rootId: 'asm.' + key, rowId: null, planet: 'asm', label, row: 'Assumptions', kind: 'assumption', family: 'assume', impact: r.months === null ? null : Math.abs(r.months), impactLabel: extra && extra.unit ? extra.unit : 'per shock', askRange: null, direction: r.months === null ? 0 : Math.sign(r.months), shocks: [Object.assign({ id: key, label, standard: true }, r)], sign: null, assumption: true }, extra || {})); };
  const asm = base.asm;
  asmShock('returnLikely', 'Return +1 point', a => { a.returnLikely = asm.returnLikely + 0.01; }, { unit: 'per point' });
  asmShock('returnLikelyDown', 'Return -1 point', a => { a.returnLikely = Math.max(0, asm.returnLikely - 0.01); }, { unit: 'per point', rootId: 'asm.returnLikely' });
  asmShock('withdrawalRate', 'Withdrawal rate 4% to 3.5%', a => { a.withdrawalRate = 0.035; }, { unit: 'for the half point' });
  asmShock('inflation', 'Inflation +1 point (real return -1)', a => { a.returnLikely = Math.max(0, asm.returnLikely - 0.01); }, { unit: 'per point' });
  /* part-time income at FI: moves the Barista rungs, never the projected date */
  const ret = record.planets.life.rows.find(r => r.type === 'retirement');
  [[10000, '+$100 a month'], [50000, '+$500 a month']].forEach(([d, label]) => {
    const r = run(c => { let row = c.planets.life.rows.find(x => x.type === 'retirement'); if (!row) { row = { id: 'sens-ret', planet: 'life', type: 'retirement', nickname: 'Retirement', f: {} }; c.planets.life.rows.push(row); } const cur = row.f.baristaIncome && hasValue(row.f.baristaIncome) ? numberOf(row.f.baristaIncome) : Math.round(asm.baristaIncomeAnnualCents / 12); row.f.baristaIncome = { v: cur + d, state: 'rough', source: 'client', cad: 'month' }; });
    out.items.push({ id: 'barista|' + d, rootId: 'baristaIncome', rowId: ret ? ret.id : null, planet: 'life', label: 'Part-time income at FI ' + label, row: 'Life plan', kind: 'money', family: 'earn', impact: null, impactLabel: 'rungs only', askRange: null, direction: 0, shocks: [Object.assign({ id: 'barista', label, standard: true }, r)], sign: -1, barista: true });
  });
  /* a $1,000 windfall invested today */
  const inv = record.planets.invest.rows.filter(r => (r.type === 'account' || r.type === 'bank') && r.f.accountBalance && hasValue(r.f.accountBalance)).sort((a, b) => numberOf(b.f.accountBalance) - numberOf(a.f.accountBalance))[0];
  if (inv) { const r = run(c => { const row = findRow(c, inv.id); setValue(row.f.accountBalance, numberOf(row.f.accountBalance) + 100000); }); out.items.push({ id: 'windfall|1000', rootId: 'accountBalance', rowId: inv.id, planet: 'invest', label: 'A $1,000 windfall invested today', row: inv.nickname || 'Account', kind: 'money', family: 'grow', impact: r.months === null ? null : Math.abs(r.months), impactLabel: 'per $1,000', askRange: null, direction: r.months === null ? 0 : Math.sign(r.months), shocks: [Object.assign({ id: 'windfall', label: '+$1,000 today', standard: true }, r)], sign: -1, windfall: true }); }
  addRealistic(out, record, base);
  out.ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) * 10) / 10;
  out.ranked = rank(out);
  return out;
}

/* Realistic movement (Level 14, MR-072): every $100 a month of spending is worth about the same months, so the
   list ranks by what could actually move. A spending line: the gap between the area's actual and her own target
   (the saved target, else the dream, else the gut), carried by the line's share of the area; with no target, a
   tenth of the line. Income: the side income entered, else three percent of pay. Balances and rates keep the
   standard shock. months = the per-shock impact scaled to that amount (linear, which the shocks are near). */
function addRealistic(out, record, base) {
  const S = base.sun && base.sun.outputs; const cents = c => '$' + Math.round(Math.abs(c) / 100).toLocaleString('en-US');
  const areaOf = row => { const c = row.f.category && hasValue(row.f.category) ? row.f.category.v : 'other'; return c; };
  const byArea = {}; record.planets.spending.rows.filter(r => r.type === 'line' && r.f.amount && hasValue(r.f.amount)).forEach(r => { const a = areaOf(r); byArea[a] = (byArea[a] || 0) + cadenceToMonthly(numberOf(r.f.amount), r.f.amount.cad || 'month', 26); });
  const targets = record.targets || {}; const anchors = record.anchors || {}; const dream = anchors.dream || {}; const gut = anchors.gut || {};
  const side = record.planets.income.rows.filter(r => r.type === 'side' && r.f.amount && hasValue(r.f.amount)).reduce((s2, r) => s2 + cadenceToMonthly(numberOf(r.f.amount), r.f.amount.cad || 'month', 26), 0);
  out.items.forEach(i => {
    if (i.impact === null || i.impact === undefined || i.assumption || i.windfall || i.barista) return;
    if (!(i.kind === 'money' && i.cadence)) return; /* balances and rates keep the standard shock */
    const monthly = cadenceToMonthly(i.value, i.cadence, 26);
    let amount = null, why = null;
    if (i.planet === 'spending') {
      const row = record.planets.spending.rows.find(r => r.id === i.rowId);
      if (i.aggregate) { amount = Math.round(monthly * 0.1); why = 'A tenth of all spending, ' + cents(amount) + ' a month, is a realistic first move.'; }
      else if (row) {
        const area = areaOf(row); const actual = byArea[area] || monthly;
        const t = targets[area] && typeof targets[area].cents === 'number' ? { cents: targets[area].cents, word: 'target' } : (dream['spending:' + area] && typeof dream['spending:' + area].cents === 'number' ? { cents: dream['spending:' + area].cents, word: 'what she would want' } : (gut['spending:' + area] && typeof gut['spending:' + area].cents === 'number' && !gut['spending:' + area].backfilled ? { cents: gut['spending:' + area].cents, word: 'what she said' } : null));
        const share = actual > 0 ? monthly / actual : 1;
        if (t && Math.abs(actual - t.cents) >= 500) { amount = Math.round(Math.abs(actual - t.cents) * share); why = 'The gap between ' + cents(actual) + ' and her ' + t.word + ' of ' + cents(t.cents) + ' a month' + (share < 0.999 ? ', this line\u2019s share of it ' + cents(amount) : '') + '.'; }
        else { amount = Math.round(monthly * 0.1); why = 'No target for this area yet; a tenth of the line, ' + cents(amount) + ' a month.'; }
      }
    } else if (i.planet === 'income') {
      if (side > 0 && i.rootId !== 'amount') { amount = side; why = 'The side income entered, ' + cents(side) + ' a month, on top of this pay.'; }
      else { amount = Math.round(monthly * 0.03); why = 'A three percent raise, ' + cents(amount) + ' a month.'; }
    }
    if (amount === null || amount <= 0) return;
    const months = Math.round(i.impact * (amount / 10000) * 10) / 10;
    i.realistic = { cents: amount, months, label: 'for ' + cents(amount) + ' a month', why };
  });
}

/* IMPACT: absolute months per standard shock, grouped by family. ASK: months across the plausible range, with the sentence that says why. */
export function rank(sens) {
  const items = sens.items;
  const realOf = i => i.realistic && i.realistic.months !== null && i.realistic.months !== undefined ? i.realistic.months : i.impact;
  const impact = items.filter(i => i.impact !== null && !i.barista).slice().sort((a, b) => realOf(b) - realOf(a));
  const ask = items.filter(i => i.askRange !== null && i.askRange > 0 && i.state !== 'verified').slice().sort((a, b) => b.askRange - a.askRange);
  const byFamily = {}; impact.forEach(i => { (byFamily[i.family] = byFamily[i.family] || []).push(i); });
  const top = impact.find(i => i.kind === 'money' && i.cadence && !i.assumption) || impact[0] || null;
  return { impact, ask, byFamily, top, headline: top ? headlineFor(top) : null };
}
export function headlineFor(i) {
  const real = i.realistic && i.realistic.months !== null && i.realistic.months !== undefined ? i.realistic : null;
  const unit = real ? ' ' + real.label : i.impactLabel === 'per $100 a month' ? ' for every $100 a month' : i.impactLabel === 'per point' ? ' for every point' : i.impactLabel === 'per 10%' ? ' for every 10%' : i.impactLabel === 'per year' ? ' for every year' : '';
  const m = real ? real.months : i.impact; const months = m >= 12 ? (Math.round(m / 12 * 10) / 10) + ' years' : (Math.round(m * 10) / 10) + (m === 1 ? ' month' : ' months');
  return 'Your biggest lever is ' + (i.aggregate ? 'spending' : (i.row && i.row !== i.label ? i.row + ' ' + i.label.toLowerCase() : i.label.toLowerCase())) + ': ' + months + unit + '.';
}
/* "Why it ranks here": one sentence per item. */
export function whyFor(i) {
  if (i.askRange !== null && i.askRange !== undefined) {
    const stateWord = { rough: 'rough', 'will-send': 'still to be sent', known: 'known but unverified', verified: 'verified', estimated: 'a national average' }[i.source === 'estimated' ? 'estimated' : i.state] || i.state;
    const span = i.range && i.range.typed ? 'the typed range' : 'a ' + Math.round((i.range ? i.range.spread : 0) * 100) + '% band';
    return 'This figure is ' + stateWord + '; across ' + span + ' the FI date moves about ' + fmtMonths(i.askRange) + '.';
  }
  if (i.impact !== null && i.impact !== undefined) return 'Each ' + i.impactLabel.replace(/^per /, '') + ' moves the FI date about ' + fmtMonths(i.impact) + '.';
  return 'This changes the FI rungs, not the projected date.';
}
export function fmtMonths(m) { if (m === null || m === undefined) return 'nothing'; const a = Math.abs(m); return a >= 12 ? (Math.round(a / 12 * 10) / 10) + ' years' : (Math.round(a * 10) / 10) + (a === 1 ? ' month' : ' months'); }

/* A version key for memoising: the journal position plus the per-client assumptions. */
export function versionKey(record, today) {
  const j = record.journal || []; const last = j.length ? j[j.length - 1] : null;
  return [record.id, j.length, last ? last.seq : 0, JSON.stringify(record.sun.assumptions || {}), today].join('|');
}
