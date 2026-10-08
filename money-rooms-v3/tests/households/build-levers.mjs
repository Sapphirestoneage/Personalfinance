/* Builds a lever household (tests/households/levers-specs.mjs) through the record API. Shared by the
   sensitivity and momentum tests (Level 12, MR-063); the same numbers are typed into the two workpapers. */
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';

export function buildLevers(spec, id, data, opts) {
  const o = opts || {}; const now = o.now || '2026-10-01T00:00:00.000Z';
  const rec = createRecord({ id, now });
  const set = (rowId, fid, v, st, src, cad) => setField(rec, rowId, fid, v, st || 'known', src || 'client', { cad, now });
  set('sun', 'birthDate', spec.birthDate); set('sun', 'filingStatus', 'single'); set('sun', 'workSituation', 'employed'); set('sun', 'state', 'NY');
  const add = (planet, type, nick, f) => { const row = createRow(planet, type, { nickname: nick, f: freshFacts(data.fields, planet, type) }); addRow(rec, row, { now }); Object.keys(f).forEach(fid => { const [v, st, src, cad] = f[fid]; set(row.id, fid, v, st, src, cad); }); return row; };
  add('income', 'w2', 'Job', { grossPay: [spec.grossMonthly, 'known', 'client', 'month'], takeHome: [spec.takeHomeMonthly, 'known', 'client', 'month'] });
  spec.lines.forEach(([nick, cat, cents, floor]) => add('spending', 'line', nick, { category: [cat], amount: [cents, 'known', 'client', 'month'], fatFloor: [floor], needWant: [floor ? 'need' : 'want'], mistake: ['unavoidable'] }));
  const spend = spec.lines.reduce((s, l) => s + l[2], 0); const surplus = spec.takeHomeMonthly - spend;
  add('spending', 'savings', 'To brokerage', { savingsLanding: [surplus, 'known', 'client', 'month'] });
  add('debt', 'summary', 'No debt', { debtSummaryTotal: [0, 'none'] });
  const brokerage = add('invest', 'account', 'Brokerage', { accountType: ['taxable'], accountBalance: [spec.invested, 'known'], contribAmount: [surplus, 'known', 'client', 'month'] });
  if (spec.cash) add('invest', 'bank', 'Checking', { bankType: ['checking'], accountBalance: [spec.cash, 'known'], contribAmount: [0, 'none', 'client', 'month'] });
  if (spec.baristaIncome) add('life', 'retirement', 'Retirement', { baristaIncome: [spec.baristaIncome, 'known', 'client', 'month'] });
  rec.brokerageId = brokerage.id;
  return rec;
}
