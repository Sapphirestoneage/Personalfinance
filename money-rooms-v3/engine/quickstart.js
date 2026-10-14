/* The quick start (MR-080): four questions, rough answers, every number lit
   at once. Income, debt, expenses, assets: do you have any, which kinds, and
   about how much. Each answer lands as a real row in its room with state
   Rough and source Client, so the whole engine computes immediately; "no"
   marks each kind None, which the engine already treats as answered. A
   birth year gives the age the FI math needs. Pure: reads and writes the
   record through the record API; no money math of its own beyond the
   said-parser's cadence. The rooms, the Checklist and the unlock probes do
   the refining from here. */
import { createRow, addRow, setField, removeRow } from './record.js';
import { freshFacts, noneRow, isNoneRow, primaryFieldOf, typeDef } from './fields.js';
import { parseSaid, parseBirth, hourlyToMonthly } from './parse.js';
import { hasValue } from './states.js';
import { addMonths } from './debtsim.js';

export const QUICK_LIB = 'quick';

/* The intervals an amount can be said in (MR-089). The coach picks one beside the amount; the words typed can still name one. Hourly is for pay only and needs hours a week. */
export const INTERVALS = Object.freeze([['month', 'a month'], ['year', 'a year'], ['biweekly', 'every two weeks'], ['week', 'a week'], ['day', 'a day'], ['hour', 'an hour']]);
export const INCOME_INTERVALS = Object.freeze(['month', 'year', 'biweekly', 'week', 'day', 'hour']);
export const SPEND_INTERVALS = Object.freeze(['month', 'year', 'biweekly', 'week', 'day']);
export const DEFAULT_HOURS = 40;
export const BASES = Object.freeze([['gross', 'Before tax'], ['net', 'After tax']]); /* MR-095: a job's pay can be said either way; after tax lands in Take-home */
export function basisField(fields, planet, type, basis) { const t = typeDef(fields, planet, type); return basis === 'net' && t.fields.includes('takeHome') ? 'takeHome' : null; }
export function intervalLabel(id) { const x = INTERVALS.find(i => i[0] === id); return x ? x[1] : ''; }
/* the stored cadence and cents for an amount said in an interval: hourly becomes a month through hourlyToMonthly */
export function intervalToStored(cents, interval, hours) {
  if (interval === 'hour') { const hrs = typeof hours === 'number' && hours > 0 ? hours : DEFAULT_HOURS; return { cents: hourlyToMonthly(cents, hrs), cad: 'month', hours: hrs }; }
  return { cents, cad: interval || 'month', hours: null };
}

/* The four questions, in the order the coach asks them. kinds: [typeId, label, extra fields the row can take right here]. */
export const QUESTIONS = Object.freeze([
  { id: 'income', planet: 'income', label: 'Income', ask: 'Any income coming in?', kinds: [['w2', 'A job (W-2)'], ['c1099', '1099 or contract work'], ['side', 'Side income'], ['unemployment', 'Unemployment'], ['other', 'Something else']], noneTypes: ['w2', 'c1099', 'side', 'unemployment', 'benefits'], amountHint: 'about 3,600, then pick the interval', intervals: INCOME_INTERVALS },
  { id: 'debt', planet: 'debt', label: 'Debt', ask: 'Owe anything?', kinds: [['card', 'Credit cards'], ['student', 'Student loans'], ['auto', 'A car loan'], ['mortgage', 'A mortgage or HELOC'], ['personal', 'Personal, family, medical, BNPL']], noneTypes: ['card', 'student', 'auto', 'mortgage', 'personal'], amountHint: 'the balance, about', extras: { card: [['apr', 'Rate'], ['minimum', 'Minimum a month']], student: [['rate', 'Rate'], ['minimum', 'Minimum a month']], auto: [['rate', 'Rate'], ['payment', 'Payment a month']], mortgage: [['rate', 'Rate'], ['principalInterest', 'Payment a month']], personal: [['rate', 'Rate'], ['payment', 'Payment a month']] } },
  { id: 'expenses', planet: 'spending', label: 'Expenses', ask: 'About how much goes out a month, all in?', total: ['summary', 'summaryTotal'], kinds: [['accommodation', 'Housing'], ['food', 'Food'], ['transportation', 'Getting around'], ['utilities', 'Phone, internet, subscriptions'], ['wants', 'Fun and wants']], amountHint: 'about 4,000', intervals: SPEND_INTERVALS },
  { id: 'assets', planet: 'invest', label: 'Assets', ask: 'Anything saved or invested?', kinds: [['bank:checking', 'Checking'], ['bank:savings', 'Savings'], ['account:401k', '401(k) or 403(b)'], ['account:rothIra', 'Roth IRA'], ['account:tradIra', 'Traditional IRA'], ['account:taxable', 'Brokerage'], ['account:hsa', 'HSA']], noneTypes: ['account', 'bank'], amountHint: 'the balance, about' },
]);

/* The rows the quick start owns: one per kind, found by its nickname. */
function kindParts(q, kind) {
  if (q.id === 'assets') { const [type, sub] = kind.split(':'); return { planet: 'invest', type, sub, field: 'accountBalance', subField: type === 'bank' ? 'bankType' : 'accountType' }; }
  if (q.id === 'expenses') return { planet: 'spending', type: 'line', sub: kind, field: 'amount', subField: 'category' };
  return { planet: q.planet, type: kind, sub: null, field: null };
}
export function kindLabel(q, kind) { const k = q.kinds.find(x => x[0] === kind); return k ? k[1] : kind; }
/* a quick row carries lib 'quick' and a plain nickname; a kind with a sub-type (a Roth IRA, a savings account) is told apart by that field */
export function quickRow(record, q, kind, fields) {
  const p = kindParts(q, kind);
  return record.planets[p.planet].rows.find(r => r.type === p.type && r.lib === QUICK_LIB && (!p.sub || (r.f[p.subField] && r.f[p.subField].v === p.sub))) || null;
}
function stateOf(parsed) { if (!parsed) return 'unknown'; if (parsed.unknown) return 'unknown'; if (parsed.na) return 'not-applicable'; if (parsed.none) return 'none'; return 'rough'; }

/* answers: { birth: '1999', income: { has: true, kinds: { w2: { said: '3600 a paycheck', extras: {} } } }, debt: {...}, expenses: { said: '4000', kinds: {...} }, assets: {...} }
   Every call is a full re-apply: a kind that was picked and later unpicked loses its quick row; a "no" marks each kind None when the room has nothing else. */
export function applyQuick(record, answers, data, meta) {
  const fields = data.fields; const m = meta || {}; const today = m.today || new Date().toISOString().slice(0, 10);
  const a = answers || {};
  const set = (rowId, fid, v, state, cad) => setField(record, rowId, fid, v, state, 'client', { session: m.session || null, now: m.now, cad });
  if (a.birth !== undefined) {
    const b = parseBirth(a.birth, today); const cur = record.sun.f.birthDate;
    if (b) set('sun', 'birthDate', b.iso, b.state);
    else if (String(a.birth || '').trim() === '' && cur && cur.source === 'client' && cur.state === 'rough') set('sun', 'birthDate', null, 'unknown');
  }
  QUESTIONS.forEach(q => {
    const ans = a[q.id]; if (!ans) return;
    const rows = () => record.planets[q.planet].rows;
    /* the rough total for expenses */
    if (q.total) {
      const [type, fid] = q.total; let sum = rows().find(r => r.type === type);
      const p = parseSaid(ans.said || '', { kind: 'spending', defaultCadence: ans.cad || 'month' });
      if (p && p.cents !== null) { if (!sum) { sum = createRow(q.planet, type, { nickname: 'Rough total', f: freshFacts(fields, q.planet, type) }); addRow(record, sum, { session: m.session, now: m.now }); } const st = intervalToStored(p.cents, ans.cad || p.cadence, null); set(sum.id, fid, st.cents, stateOf(p), st.cad); }
      else if (p && p.unknown && sum) set(sum.id, fid, null, 'unknown');
    }
    /* "no": each kind None while the room has nothing of that type */
    if (ans.has === false && q.noneTypes) {
      q.noneTypes.forEach(type => { if (rows().some(r => r.type === type)) return; const n = noneRow(fields, q.planet, type); addRow(record, createRow(q.planet, type, { nickname: n.nickname, f: n.f }), { session: m.session, now: m.now }); });
      /* quick rows picked earlier go */
      q.kinds.forEach(([kind]) => { const r = quickRow(record, q, kind, fields); if (r) removeRow(record, r.id, { session: m.session, now: m.now }); });
      return;
    }
    if (ans.has === true && q.noneTypes) {
      /* a None row placed by an earlier "no" gives way */
      q.noneTypes.forEach(type => { rows().filter(r => r.type === type && isNoneRow(fields, r)).forEach(r => removeRow(record, r.id, { session: m.session, now: m.now })); });
    }
    const kinds = ans.kinds || {};
    q.kinds.forEach(([kind]) => {
      const k = kinds[kind]; const p = kindParts(q, kind); let row = quickRow(record, q, kind, fields);
      if (!k || !k.picked) { if (row) removeRow(record, row.id, { session: m.session, now: m.now }); return; }
      if (!row) {
        row = createRow(p.planet, p.type, { nickname: kindLabel(q, kind), lib: QUICK_LIB, f: freshFacts(fields, p.planet, p.type) });
        addRow(record, row, { session: m.session, now: m.now });
        if (p.sub && p.subField) set(row.id, p.subField, p.sub, 'known');
        if (q.id === 'expenses') { set(row.id, 'needWant', kind === 'wants' ? 'want' : 'need', 'known'); }
      }
      const prim0 = p.field || primaryFieldOf(fields, p.planet, p.type).id;
      const netField = q.id === 'income' ? basisField(fields, p.planet, p.type, k.basis) : null;
      const prim = netField || prim0; const def = fields.fields[prim];
      /* the other side of the pay goes back to unknown when it was the quick start's own rough figure */
      const otherSide = netField ? prim0 : (q.id === 'income' && basisField(fields, p.planet, p.type, 'net') ? 'takeHome' : null);
      if (otherSide && row.f[otherSide] && hasValue(row.f[otherSide]) && row.f[otherSide].state === 'rough' && row.f[otherSide].source === 'client') set(row.id, otherSide, null, 'unknown');
      const parsed = parseSaid(k.said || '', { kind: q.id === 'income' ? 'income' : 'money', defaultCadence: def.cadence ? (k.cad || 'month') : undefined });
      if (parsed && (parsed.cents !== null || parsed.unknown)) {
        if (def.cadence && parsed.cents !== null) {
          const st = intervalToStored(parsed.cents, k.cad || parsed.cadence, typeof k.hours === 'number' ? k.hours : parseFloat(k.hours));
          set(row.id, prim, st.cents, stateOf(parsed), st.cad);
          if (st.hours && typeDef(fields, p.planet, p.type).fields.includes('hoursPaid')) set(row.id, 'hoursPaid', st.hours, 'rough');
          if (st.hours && typeDef(fields, p.planet, p.type).fields.includes('hourlyRate')) set(row.id, 'hourlyRate', parsed.cents, stateOf(parsed)); /* MR-096: the wage itself sits on the row too */
          row.quick = { cad: k.cad || parsed.cadence, rateCents: st.hours ? parsed.cents : null, hours: st.hours, basis: netField ? 'net' : 'gross' }; /* so the screen can read the interval and the basis back */
        } else set(row.id, prim, parsed.unknown ? null : parsed.cents, stateOf(parsed), def.cadence ? parsed.cadence : undefined);
      }
      else if (!parsed && String(k.said || '').trim() === '' && row.f[prim] && hasValue(row.f[prim]) && row.f[prim].state === 'rough') set(row.id, prim, null, 'unknown');
      /* the optional extras (a rate, a minimum) land as typed; a rate typed as 24 means 24% */
      Object.keys(k.extras || {}).forEach(fid => {
        const edef = fields.fields[fid]; if (!edef || !typeDef(fields, p.planet, p.type).fields.includes(fid)) return;
        const t = String(k.extras[fid] || '').trim();
        if (!t) { if (row.f[fid] && hasValue(row.f[fid]) && row.f[fid].state === 'rough') set(row.id, fid, null, 'unknown'); return; }
        if (edef.kind === 'percent') { const n = parseFloat(t.replace(/[^0-9.]/g, '')); if (Number.isFinite(n)) set(row.id, fid, Math.round((n > 1 ? n / 100 : n) * 1e6) / 1e6, 'rough'); return; }
        const pe = parseSaid(t, { kind: 'money', defaultCadence: 'month' }); if (pe && pe.cents !== null) set(row.id, fid, pe.cents, stateOf(pe), edef.cadence ? pe.cadence : undefined);
      });
    });
  });
  return record;
}

/* What the record already says, in the quick start's own shape, so the screen can reopen half-done. */
export function readQuick(record, data) {
  const fields = data.fields; const out = { birth: '' };
  const b = record.sun.f.birthDate; if (b && b.v) out.birth = b.state === 'rough' ? String(b.v).slice(0, 4) : String(b.v);
  QUESTIONS.forEach(q => {
    const rows = record.planets[q.planet].rows; const ans = { has: null, said: '', kinds: {} };
    if (q.total) { const sum = rows.find(r => r.type === q.total[0]); const f = sum && sum.f[q.total[1]]; if (f && hasValue(f)) { ans.said = String(Math.round(f.v / 100)); ans.cad = f.cad || 'month'; } }
    q.kinds.forEach(([kind]) => {
      const r = quickRow(record, q, kind, fields); if (!r) return;
      const p = kindParts(q, kind); const qk = r.quick || null;
      const netF = q.id === 'income' ? basisField(fields, p.planet, p.type, 'net') : null; const basis = qk && qk.basis ? qk.basis : (netF && r.f[netF] && hasValue(r.f[netF]) && !(r.f[p.field || primaryFieldOf(fields, p.planet, p.type).id] && hasValue(r.f[p.field || primaryFieldOf(fields, p.planet, p.type).id])) ? 'net' : 'gross');
      const prim = basis === 'net' && netF ? netF : (p.field || primaryFieldOf(fields, p.planet, p.type).id); const f = r.f[prim];
      const hourly = qk && qk.cad === 'hour' && qk.rateCents !== null;
      const said = f && hasValue(f) && f.state !== 'none' ? String(Math.round((hourly ? qk.rateCents : f.v) / 100)) : (f && f.state === 'none' ? 'none' : '');
      const extras = {}; ((q.extras || {})[kind] || []).forEach(([fid]) => { const ef = r.f[fid]; if (ef && hasValue(ef)) extras[fid] = fields.fields[fid].kind === 'percent' ? String(Math.round(ef.v * 10000) / 100) : String(Math.round(ef.v / 100)); });
      ans.kinds[kind] = { picked: true, said, extras, cad: q.intervals ? (hourly ? 'hour' : (f && f.cad) || (qk && qk.cad) || 'month') : undefined, hours: hourly ? qk.hours : undefined, basis: netF ? basis : undefined };
    });
    if (q.noneTypes) {
      const anyKind = Object.keys(ans.kinds).length > 0;
      const allNone = q.noneTypes.length > 0 && q.noneTypes.every(t => rows.some(r => r.type === t && isNoneRow(fields, r))) && !rows.some(r => q.noneTypes.includes(r.type) && !isNoneRow(fields, r));
      ans.has = anyKind || rows.some(r => q.noneTypes.includes(r.type) && !isNoneRow(fields, r)) ? true : (allNone ? false : null);
    } else ans.has = ans.said ? true : null;
    out[q.id] = ans;
  });
  return out;
}

/* The numbers a quick start lights, in order, each with what it still waits on. Reads the result; no math. */
export const HEADLINE = Object.freeze(['takeHome', 'spending', 'surplus', 'fiNumber', 'totalDebt', 'netWorth']);

/* The picture (MR-085): the short-term read a first sitting gives. Take-home, spending and what is left over from the metrics; cash on hand; the runway now; a buffer of N months of spending as the target; and the month the buffer is full at the current pace, which is the earliest the job could be left. One division and one addition; null for whatever is not known yet, with the words for what it waits on. */
export function picture(result, bufferMonths) {
  const S = result && result.sun && result.sun.outputs; const M = (result && result.metrics) || {};
  const okq = q => q && q.status === 'ok' ? q.cents : null; const mv = id => M[id] && M[id].status === 'ok' ? M[id].value.cents : null;
  const takeHome = mv('takeHome'), spending = mv('spending'), surplus = mv('surplus'); const cash = S ? okq(S.invest.cashBalances) : null;
  const months = typeof bufferMonths === 'number' && bufferMonths > 0 ? bufferMonths : 3;
  const runway = cash !== null && spending ? Math.round(cash / spending * 10) / 10 : null;
  const target = spending !== null ? Math.round(spending * months) : null;
  const shortBy = target !== null && cash !== null ? Math.max(0, target - cash) : null;
  const from = String((result && result.today) || '').slice(0, 7);
  const monthsTo = shortBy === null ? null : shortBy === 0 ? 0 : surplus !== null && surplus > 0 ? Math.ceil(shortBy / surplus) : null;
  const by = monthsTo === null || !from ? null : addMonths(from, monthsTo);
  const needs = [];
  if (takeHome === null) needs.push('income'); if (spending === null) needs.push('monthly expenses'); if (cash === null) needs.push('cash on hand');
  if (surplus === null && takeHome !== null && spending !== null) needs.push(M.surplus && M.surplus.needs && M.surplus.needs.length ? M.surplus.needs[0] : 'what is left over');
  return { takeHome, spending, surplus, cash, runway, months, target, shortBy, monthsTo, by, there: shortBy === 0, stuck: shortBy !== null && shortBy > 0 && surplus !== null && surplus <= 0, needs };
}
