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
import { parseSaid, parseBirth } from './parse.js';
import { hasValue } from './states.js';

export const QUICK_LIB = 'quick';

/* The four questions, in the order the coach asks them. kinds: [typeId, label, extra fields the row can take right here]. */
export const QUESTIONS = Object.freeze([
  { id: 'income', planet: 'income', label: 'Income', ask: 'Any income coming in?', kinds: [['w2', 'A job (W-2)'], ['c1099', '1099 or contract work'], ['side', 'Side income'], ['unemployment', 'Unemployment'], ['other', 'Something else']], noneTypes: ['w2', 'c1099', 'side', 'unemployment', 'benefits'], amountHint: 'about 3,600 a paycheck, or 68k a year' },
  { id: 'debt', planet: 'debt', label: 'Debt', ask: 'Owe anything?', kinds: [['card', 'Credit cards'], ['student', 'Student loans'], ['auto', 'A car loan'], ['mortgage', 'A mortgage or HELOC'], ['personal', 'Personal, family, medical, BNPL']], noneTypes: ['card', 'student', 'auto', 'mortgage', 'personal'], amountHint: 'the balance, about', extras: { card: [['apr', 'Rate'], ['minimum', 'Minimum a month']], student: [['rate', 'Rate'], ['minimum', 'Minimum a month']], auto: [['rate', 'Rate'], ['payment', 'Payment a month']], mortgage: [['rate', 'Rate'], ['principalInterest', 'Payment a month']], personal: [['rate', 'Rate'], ['payment', 'Payment a month']] } },
  { id: 'expenses', planet: 'spending', label: 'Expenses', ask: 'About how much goes out a month, all in?', total: ['summary', 'summaryTotal'], kinds: [['accommodation', 'Housing'], ['food', 'Food'], ['transportation', 'Getting around'], ['utilities', 'Phone, internet, subscriptions'], ['wants', 'Fun and wants']], amountHint: 'about 4,000 a month' },
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
      const p = parseSaid(ans.said || '', { kind: 'spending', defaultCadence: 'month' });
      if (p && p.cents !== null) { if (!sum) { sum = createRow(q.planet, type, { nickname: 'Rough total', f: freshFacts(fields, q.planet, type) }); addRow(record, sum, { session: m.session, now: m.now }); } set(sum.id, fid, p.cents, stateOf(p), p.cadence); }
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
      const prim = p.field || primaryFieldOf(fields, p.planet, p.type).id; const def = fields.fields[prim];
      const parsed = parseSaid(k.said || '', { kind: q.id === 'income' ? 'income' : 'money', defaultCadence: def.cadence ? (def.defaultCadence || 'month') : undefined });
      if (parsed && (parsed.cents !== null || parsed.unknown)) set(row.id, prim, parsed.unknown ? null : parsed.cents, stateOf(parsed), def.cadence ? parsed.cadence : undefined);
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
    if (q.total) { const sum = rows.find(r => r.type === q.total[0]); const f = sum && sum.f[q.total[1]]; if (f && hasValue(f)) ans.said = String(Math.round(f.v / 100)); }
    q.kinds.forEach(([kind]) => {
      const r = quickRow(record, q, kind, fields); if (!r) return;
      const p = kindParts(q, kind); const prim = p.field || primaryFieldOf(fields, p.planet, p.type).id; const f = r.f[prim];
      const said = f && hasValue(f) && f.state !== 'none' ? String(Math.round(f.v / 100)) : (f && f.state === 'none' ? 'none' : '');
      const extras = {}; ((q.extras || {})[kind] || []).forEach(([fid]) => { const ef = r.f[fid]; if (ef && hasValue(ef)) extras[fid] = fields.fields[fid].kind === 'percent' ? String(Math.round(ef.v * 10000) / 100) : String(Math.round(ef.v / 100)); });
      ans.kinds[kind] = { picked: true, said, extras };
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
