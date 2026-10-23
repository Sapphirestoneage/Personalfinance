/* The quick snapshot (Level 15, MR-109): every base number on one screen,
   grouped by DAITE where it fits. A base number is a field on the room's
   single snapshot row (the rough total row that already existed, grown), or,
   for debt, the rows themselves with the rough total as the no-debt answer.
   Each stores a value or a range, a confidence (the state), who supplied it
   (the source) and when (the journal line that set it). The planets resolve
   each one against its rows; this module only lists them, reads the
   resolved figures back from the slots, and writes a value through the
   record API. Pure. */
import { createRow, addRow, setField } from './record.js';
import { freshFacts } from './fields.js';
import { hasValue } from './states.js';
import { snapshotComplete, overallCoverage, rowStateOf } from './resolve.js';

export const GROUPS = Object.freeze([['debt', 'Debt'], ['assets', 'Assets'], ['income', 'Income'], ['expenses', 'Expenses']]);
/* period: how the figure is said; slot: the planet's resolved key; dive: the rows that itemize it */
export const BASE_NUMBERS = Object.freeze([
  { id: 'incomeRegular', group: 'income', label: 'Regular take-home a month', planet: 'income', field: 'takeHomeSnapshot', period: 'month', slot: 'incomeRegular', dive: { planet: 'income', types: ['w2', 'c1099', 'side', 'unemployment', 'rental', 'benefits'] }, ask: 'What lands in the bank each month from work, after tax?' },
  { id: 'incomeIrregular', group: 'income', label: 'Irregular income a year', planet: 'income', field: 'irregularAnnual', period: 'year', slot: 'incomeIrregular', dive: { planet: 'income', types: ['other'] }, ask: 'Bonus, gifts, side money that comes and goes, after tax, in a year?' },
  { id: 'expensesFixed', group: 'expenses', label: 'Fixed a month', planet: 'spending', field: 'fixedMonthly', period: 'month', slot: 'expensesFixed', dive: { planet: 'spending', types: ['line'] }, ask: 'Rent or mortgage, utilities, insurance, minimums: what does not move?' },
  { id: 'expensesVariable', group: 'expenses', label: 'Variable a month', planet: 'spending', field: 'variableMonthly', period: 'month', slot: 'expensesVariable', dive: { planet: 'spending', types: ['line'] }, ask: 'Food, fun, getting around, the rest: what moves?' },
  { id: 'expensesAnnual', group: 'expenses', label: 'Annual and irregular a year', planet: 'spending', field: 'annualIrregular', period: 'year', slot: 'expensesAnnual', dive: { planet: 'spending', types: ['line'] }, ask: 'Travel, gifts, car repairs, the once-a-year things, in a year?' },
  { id: 'assetsCash', group: 'assets', label: 'Cash', planet: 'invest', field: 'cashSnapshot', period: 'oneoff', slot: 'assetsCash', dive: { planet: 'invest', types: ['bank'] }, ask: 'Checking, savings, cash on hand, all together?' },
  { id: 'assetsRetirement', group: 'assets', label: 'Retirement and investments', planet: 'invest', field: 'retirementSnapshot', period: 'oneoff', slot: 'assetsRetirement', dive: { planet: 'invest', types: ['account'] }, ask: '401(k), IRAs, brokerage, all together?' },
  { id: 'assetsOther', group: 'assets', label: 'Everything else', planet: 'invest', field: 'otherAssetsSnapshot', period: 'oneoff', slot: 'assetsOther', dive: { planet: 'invest', types: ['other'] }, ask: 'Home equity, a car worth selling, anything else of value?' },
  { id: 'debt', group: 'debt', label: 'Debts', planet: 'debt', field: 'debtSummaryTotal', period: 'oneoff', slot: 'debt', itemized: true, dive: { planet: 'debt', types: ['card', 'student', 'auto', 'mortgage', 'personal', 'other'] }, ask: 'Each debt with its balance, rate and minimum; or no debt.' },
]);
export const EXPENSE_ALL_IN = Object.freeze({ id: 'expenses', group: 'expenses', label: 'All in, a month', planet: 'spending', field: 'summaryTotal', period: 'month', slot: 'expenses' });

export function summaryRowOf(record, planet) { return record.planets[planet].rows.find(r => r.type === 'summary') || null; }
/* The snapshot row of a room, made on first use through the record API. */
export function ensureSummaryRow(record, fields, planet, meta) {
  const have = summaryRowOf(record, planet); if (have) return have;
  const f = freshFacts(fields, planet, 'summary'); const tdef = fields.planets[planet].types.summary;
  tdef.fields.forEach(id => { const d = fields.fields[id]; if (d.cadence) f[id].cad = d.defaultCadence; });
  const row = createRow(planet, 'summary', { nickname: 'Snapshot', f }); addRow(record, row, meta || {}); return row;
}
/* Write a base number: a number, a range { low, high }, or null with a state (unknown for does not know, not-for-me). Returns the journal line. */
export function setBase(record, fields, def, value, state, source, meta) {
  const row = ensureSummaryRow(record, fields, def.planet, meta); const fid = def.fieldId || (typeof def.field === 'string' ? def.field : null); if (!fid) throw new Error('no field for base number ' + def.id);
  const m = Object.assign({}, meta || {}); if (fields.fields[fid].cadence && !m.cad) m.cad = fields.fields[fid].defaultCadence;
  return setField(record, row.id, fid, value, state, source || 'client', m);
}
/* When a field was last set and by whom: the newest journal line on it. */
export function fieldAsOf(record, rowId, fieldId) { for (let i = record.journal.length - 1; i >= 0; i--) { const l = record.journal[i]; if (l.rowId === rowId && l.field === fieldId && (l.kind === 'set' || l.kind === 'undo' || l.kind === 'redo')) return { at: l.ts, session: l.session || null, source: l.source || null }; } return null; }

/* The snapshot: every base number with its stored field, whether it is complete, who and when, and the planet's resolved figure. */
export function snapshotOf(record, result, data) {
  const S = result && result.sun && result.sun.outputs;
  const list = BASE_NUMBERS.map(def => {
    const row = summaryRowOf(record, def.planet); const f = row ? row.f[def.field] : null;
    const resolved = S && S[def.planet] && S[def.planet].resolved ? S[def.planet].resolved[def.slot] : null;
    const rows = record.planets[def.dive.planet].rows.filter(r => def.dive.types.includes(r.type));
    const complete = def.itemized ? (rows.length > 0 || snapshotComplete(f)) : snapshotComplete(f);
    const when = row && f ? fieldAsOf(record, row.id, def.field) : null;
    const states = { known: 0, estimated: 0, na: 0, notYet: 0 }; (resolved && resolved.counts ? Object.keys(states) : []).forEach(k => { states[k] = resolved.counts[k] || 0; });
    return Object.assign({}, def, { rowId: row ? row.id : null, fieldId: def.field, field: f || null, complete, asOf: when ? when.at : null, session: when ? when.session : null, supplier: f ? f.source : null, resolved, rowCount: rows.length, states, guess: !!(f && f.source === 'estimated'), rough: !!(f && f.state === 'rough') });
  });
  const allIn = (() => { const row = summaryRowOf(record, 'spending'); const f = row ? row.f.summaryTotal : null; return Object.assign({}, EXPENSE_ALL_IN, { rowId: row ? row.id : null, field: f || null, complete: snapshotComplete(f), resolved: S && S.spending && S.spending.resolved ? S.spending.resolved.expenses : null }); })();
  const complete = list.filter(b => b.complete).length;
  return { list, allIn, coverage: overallCoverage(list), complete, total: list.length, done: complete === list.length, hours: result ? result.hours || null : null };
}
/* The guess the screen shows beside a blank base number (MR-109): the discovery or guess rows already in the rooms, summed into the base number's split. Null when the rooms hold nothing. */
export function guessFor(def, result, record) {
  const S = result && result.sun && result.sun.outputs; if (!S) return null;
  if (def.planet === 'spending' && S.spending.resolved) { const r = S.spending.resolved[def.slot]; if (r && r.status === 'ok' && r.itemized > 0 && r.counts.estimated > 0 && !r.hasSnapshot) { const gut = record && record.anchors && record.anchors.gut ? Object.keys(record.anchors.gut).some(k => k.indexOf('spending:') === 0) : false; return { cents: r.itemized, label: gut ? 'What you said' : 'Guess' }; } }
  return null;
}
/* The four-state read of every row in a base number's deep dive, for the screen: the primary field's state mapped to Known, Estimated, N/A or Not yet. */
export function diveRows(record, fields, def) {
  return record.planets[def.dive.planet].rows.filter(r => def.dive.types.includes(r.type)).map(r => {
    const tdef = fields.planets[def.dive.planet].types[r.type]; const prim = tdef.fields.find(id => fields.fields[id].primary) || tdef.fields.find(id => fields.fields[id].kind === 'money') || tdef.fields[0];
    const f = r.f[prim]; return { rowId: r.id, type: r.type, typeLabel: tdef.label, name: r.nickname || tdef.label, field: prim, fieldLabel: fields.fields[prim].label, f, rowState: rowStateOf(f), cad: f && f.cad ? f.cad : null, hasValue: !!(f && hasValue(f)) };
  });
}
