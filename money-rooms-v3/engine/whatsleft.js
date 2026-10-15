/* What's left (Level 15, MR-111): one live list of everything still unsure
   across every planet: every Not yet row (will email or does not know), every
   base number still on a guess or a rough figure, and every unitemized
   remainder. Sorted by leverage on the FI number (the sensitivity run's
   months when there is one, else the leverage engine's score) times the
   dollars still uncertain (the remainder, the range width, or the state's
   spread on the figure). Items under the materiality line (knowing it is
   worth less than the real hourly wage times the minutes to find it) go to
   Small wins instead. Pure; the ranked next-3 card and the one-pager read
   this list. */
import { rankLeverage } from './leverage.js';
import { rowStateOf, REMAINDER_LABEL } from './resolve.js';
import { belowMateriality } from './hours.js';
import { hasValue, numberOf, rangeOf, plateOf } from './states.js';
import { cadenceToMonthly } from './units.js';
import { PLANET_LABELS } from './sun.js';

const PAYCHECKS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const MINUTES = { client: 5, discovery: 5, estimated: 10, 'lookup-verify': 15, 'lookup-confirmed': 15, inferred: 10, computed: 10 };
const REASONS = { notYet: 'Not entered yet; the numbers carry a hole here', estimated: 'A rough figure; the band around it is wide', guess: 'A guess for the area, not the household\'s own number', remainder: 'What the snapshot says is still unitemized', rough: 'A rough snapshot; the rows would firm it up' };

function annualOf(row, fid, def) { const f = row.f[fid]; if (!f || !hasValue(f) || def.kind !== 'money') return null; const n = numberOf(f); if (n === null) return null; if (def.cadence) { const pf = row.f.payFrequency && hasValue(row.f.payFrequency) ? row.f.payFrequency.v : 'biweekly'; return cadenceToMonthly(n, f.cad || 'month', PAYCHECKS[pf] || 26) * 12; } return n; }
function widthOf(f, def, row, weights) { if (!f) return 0; const r = hasValue(f) ? rangeOf(f) : null; if (r) { const k = def && def.cadence ? 12 : 1; return (r.high - r.low) * k; } const a = row && def ? annualOf(row, def.id, def) : null; if (a === null) return 0; const u = (weights && weights.uncertainty) || {}; const s = f.source === 'estimated' ? (u.estimated || 0.35) : (u[f.state] || 0); return Math.round(Math.abs(a) * s * 2); }
function lastSession(record, rowId, fid) { for (let i = record.journal.length - 1; i >= 0; i--) { const l = record.journal[i]; if (l.rowId === rowId && (!fid || l.field === fid)) return l.session || null; } return null; }

/* whatsLeft(record, result, data, { sensitivity, wage }) -> { items, small, groups } */
export function whatsLeft(record, result, data, opts) {
  const o = opts || {}; const fields = data.fields; const weights = data.weights; const S = result && result.sun && result.sun.outputs;
  const wage = o.wage !== undefined ? o.wage : (result && result.hours ? result.hours.wage : null);
  const materiality = materialityOf(record, result, data, wage);
  const ranked = rankLeverage({ record, fields, weights }); const byKey = {}; ranked.forEach(i => { byKey[i.rowId + '|' + i.field] = i; });
  const sens = o.sensitivity && o.sensitivity.hasFiDate ? o.sensitivity : null; const months = {}; if (sens) sens.items.forEach(it => { if (it.rowId && it.id && it.id.indexOf('|') !== -1 && !it.windfall) months[it.id] = it.askRange; }); /* the run keys a field item by rowId|field in its id */
  const items = []; const enriched = (result && result.enriched) || {}; const isEnriched = (p, rowId, fid) => (enriched[p] || []).some(e => e.rowId === rowId && e.field === fid);
  const push = x => { const lev = x.leverage === null || x.leverage === undefined ? 1 : x.leverage; const dollars = Math.max(0, x.dollars || 0); const score = lev * (dollars || 1); const minutes = MINUTES[x.supplier === 'coach' ? 'lookup-verify' : 'client'] || 5; items.push(Object.assign({}, x, { score, small: belowMateriality(dollars, wage, minutes, materiality.shareLine), minutes })); };
  /* every Not yet row, and every row still rough or guessed, in the words the leverage engine already uses */
  Object.keys(record.planets).forEach(p => record.planets[p].rows.forEach(r => {
    if (r.type === 'summary') return;
    const tdef = fields.planets[p].types[r.type]; if (!tdef) return;
    tdef.fields.forEach(fid => {
      const def = fields.fields[fid]; const f = r.f[fid]; if (!f || def.tag) return;
      const st = rowStateOf(f); if (st !== 'notYet' && st !== 'estimated') return;
      const mKey = months[r.id + '|' + fid]; /* a detail fact counts when it is promised by email or when the sensitivity run says it moves the FI date */
      if (!def.primary && f.state !== 'will-send' && (mKey === undefined || mKey === null)) return;
      if (st === 'notYet' && f.state === 'unknown' && (tdef.form || isEnriched(p, r.id, fid))) return; /* an untouched profile form is not a question yet; a figure the engine works out (hourly pay) is not missing */
      const lv = byKey[r.id + '|' + fid]; const m = months[r.id + '|' + fid];
      const dollars = st === 'notYet' ? (lv && lv.dollarsAnnual ? lv.dollarsAnnual : 0) : widthOf(f, def, r, weights);
      push({ id: r.id + '|' + fid, kind: 'row', planet: p, rowId: r.id, field: fid, label: def.label, where: (r.nickname || tdef.label), planetLabel: PLANET_LABELS[p], state: f.state, source: f.source, rowState: st, willEmail: f.state === 'will-send', supplier: plateOf(f) === 'mine' ? 'coach' : 'client', session: lastSession(record, r.id, fid), dollars, leverage: m !== undefined && m !== null ? Math.max(1, m) : (lv ? lv.leverage : 1), months: m === undefined ? null : m, reason: st === 'notYet' ? REASONS.notYet : (f.source === 'estimated' ? REASONS.guess : REASONS.estimated), question: lv ? lv.question : def.label + ' for ' + (r.nickname || tdef.label) + '?', href: '#/ledger/' + p + '/' + r.type, inline: def.kind === 'money' || def.kind === 'int' || def.kind === 'hours' || def.kind === 'percent' });
    });
  }));
  /* every base number still on a guess or a rough snapshot, and every unitemized remainder */
  const snap = result && result.snapshot; const periodK = b => b.period === 'year' ? 1 : b.period === 'month' ? 12 : 1;
  if (snap) snap.list.forEach(b => {
    const r = b.resolved;
    if (r && r.status === 'ok' && r.remainder > 0 && r.hasRows) push({ id: 'remainder|' + b.id, kind: 'remainder', planet: b.planet, rowId: b.rowId, field: b.field, label: REMAINDER_LABEL, where: b.label, planetLabel: PLANET_LABELS[b.planet], state: 'rough', source: b.supplier || 'client', rowState: 'estimated', willEmail: false, supplier: 'client', session: b.session, dollars: r.remainder * periodK(b), leverage: 1, months: null, reason: REASONS.remainder, question: 'What makes up the other ' + Math.round(r.remainder / 100).toLocaleString('en-US') + ' of ' + b.label.toLowerCase() + '?', href: '#/snapshot/' + b.id, inline: false, base: b.id });
    else if (b.field && (b.guess || b.rough || (r && r.status === 'ok' && r.remainder > 0)) && !(r && r.hasRows)) push({ id: 'base|' + b.id, kind: 'base', planet: b.planet, rowId: b.rowId, field: b.field, label: b.label, where: 'Snapshot', planetLabel: PLANET_LABELS[b.planet], state: b.field.state, source: b.field.source, rowState: 'estimated', willEmail: b.field.state === 'will-send', supplier: plateOf(b.field) === 'mine' ? 'coach' : 'client', session: b.session, dollars: r && r.status === 'ok' && r.remainder > 0 ? r.remainder * periodK(b) : widthOf(b.field, { kind: 'money', cadence: b.period !== 'oneoff', id: b.fieldId }, b.rowId ? record.planets[b.planet].rows.find(x => x.id === b.rowId) : null, weights), leverage: 1, months: null, reason: b.guess ? REASONS.guess : REASONS.rough, question: b.ask, href: '#/snapshot', inline: true, base: b.id });
  });
  /* with a sensitivity run the months of FI date rank first (the Session card's own order), then leverage times dollars; without one, leverage times dollars */
  items.sort((a, b) => (sens ? ((b.months === null || b.months === undefined ? -1 : b.months) - (a.months === null || a.months === undefined ? -1 : a.months)) : 0) || b.score - a.score);
  const big = items.filter(i => !i.small); const small = items.filter(i => i.small);
  return { items: big, small, all: items, next: big.slice(0, 3), willEmail: items.filter(i => i.willEmail), wage, materiality, groups: { planet: groupBy(big, i => i.planetLabel), supplier: groupBy(big, i => i.supplier === 'coach' ? 'Coach looks up' : 'Client supplies'), session: groupBy(big, i => i.session ? 'Session ' + String(i.session).replace(/^s/, '') : 'No session yet') } };
}
/* MR-117: the materiality line's second leg, a share of a year's spending (the resolved baseline), else of a year's take-home when no spending is known; the share is the assumption materialityShare. */
export function materialityOf(record, result, data, wage) {
  const asm = (result && result.sun && result.sun.assumptions) || (data && data.assumptions && data.assumptions.defaults) || {};
  const share = typeof asm.materialityShare === 'number' ? asm.materialityShare : 0;
  const S = result && result.sun && result.sun.outputs; const ok = x => x && typeof x.cents === 'number' && x.cents > 0 && !x.needs;
  const spend = S && S.spending && ok(S.spending.baselineMonthly) ? S.spending.baselineMonthly.cents * 12 : null;
  const take = S && S.income && ok(S.income.takeHomeMonthly) ? S.income.takeHomeMonthly.cents * 12 : null;
  const base = spend !== null ? 'spending' : take !== null ? 'income' : null; const annual = spend !== null ? spend : take;
  const shareLine = base ? Math.round(annual * share) : 0;
  const wageLine = typeof wage === 'number' && wage > 0 ? Math.round(wage * (MINUTES.client / 60)) : 0;
  return { share, base, annual: annual || null, shareLine, wageLine, line: Math.max(shareLine, wageLine) };
}
function groupBy(list, key) { const out = []; list.forEach(i => { const k = key(i); let g = out.find(x => x.key === k); if (!g) { g = { key: k, items: [] }; out.push(g); } g.items.push(i); }); return out; }
