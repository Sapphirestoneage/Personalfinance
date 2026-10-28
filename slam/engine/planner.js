// Planner views (Batch 5, S-274): tax buckets, the household's allocation and where each part sits, fees in dollars,
// room left in the federal bracket, and where each headline number came from. Pure: spine, rules and the summary in,
// numbers and words out. Missing is missing, never a guess made silently.

import { valueOf as v, getAt, round2 } from './spine.js';
import { PRESETS, INVESTED_FAMILIES } from './schema.js';
import { statusRuleId } from './rules.js';
import { yearTax } from './tax.js';
import { labelFor } from './labels.js';

const BUCKET_OF = { pretax: 'pretax', roth: 'roth', taxable: 'taxable', tripleTaxFree: 'hsa' };
export const BUCKET_WORDS = { pretax: 'Pre-tax (taxed when it comes out)', roth: 'Roth (tax-free when it comes out)', taxable: 'Taxable (taxed on gains as you go)', hsa: 'HSA (tax-free for health costs)' };
const invested = (a) => INVESTED_FAMILIES.includes(a.family) && !['health_fsa', 'lp_fsa', 'dc_fsa'].includes(a.type);

// Every invested dollar by how it is taxed: { total, buckets: [{ id, words, amount, share }], items, missing }.
export function taxBuckets(spine) {
  const sums = { pretax: 0, roth: 0, taxable: 0, hsa: 0 }, items = [], missing = [];
  for (const a of spine.accounts || []) {
    if (!invested(a)) continue;
    const b = v(a.balance), id = BUCKET_OF[(PRESETS[a.type] || {}).taxTreatment] || 'taxable';
    if (b === null) { missing.push('accounts.' + a.id + '.balance'); continue; }
    sums[id] += b; items.push({ id: a.id, name: v(a.name) || a.id, bucket: id, amount: b, path: 'accounts.' + a.id + '.balance' });
  }
  const total = round2(Object.values(sums).reduce((x, y) => x + y, 0));
  return { total, buckets: Object.keys(sums).map((id) => ({ id, words: BUCKET_WORDS[id], amount: round2(sums[id]), share: total > 0 ? sums[id] / total : null })), items, missing };
}

// Stocks, bonds and cash across the household, then each account: { stocks, bonds, cash, unknown, total, rows, missing }.
// An invested account with no mix typed is "mix not given", never split by a guess.
export function allocation(spine) {
  let stocks = 0, bonds = 0, cash = 0, unknown = 0;
  const rows = [], missing = [];
  for (const a of spine.accounts || []) {
    const b = v(a.balance);
    if (a.family === 'cash') { if (b !== null) { cash += b; rows.push({ id: a.id, name: v(a.name) || a.id, amount: b, stocks: 0, bonds: 0, cash: b, mix: 'cash' }); } continue; }
    if (!invested(a) || b === null) continue;
    const s = a.stockShare ? v(a.stockShare) : null;
    if (s === null) { unknown += b; missing.push('accounts.' + a.id + '.stockShare'); rows.push({ id: a.id, name: v(a.name) || a.id, amount: b, stocks: null, bonds: null, cash: 0, mix: null, path: 'accounts.' + a.id + '.stockShare' }); continue; }
    stocks += b * s; bonds += b * (1 - s);
    rows.push({ id: a.id, name: v(a.name) || a.id, amount: b, stocks: round2(b * s), bonds: round2(b * (1 - s)), cash: 0, mix: s, bucket: BUCKET_OF[(PRESETS[a.type] || {}).taxTreatment] || 'taxable' });
  }
  return { stocks: round2(stocks), bonds: round2(bonds), cash: round2(cash), unknown: round2(unknown), total: round2(stocks + bonds + cash + unknown), rows, missing };
}

// Fees in dollars a year: each account's fund fees (its expense ratio, or its holdings' own) and advisory fees, and
// what they cost by the FI date: today's invested money growing with and without them for the years to FI.
// { yearly, rows: [{ id, name, amount, yearly, rate }], missing, byFi: { years, cost } | null }.
export function feesInDollars(spine, s, rules) {
  const rows = [], missing = [];
  for (const a of spine.accounts || []) {
    if (!invested(a)) continue;
    const b = v(a.balance);
    if (b === null) continue;
    const holdings = a.holdings ? v(a.holdings) || [] : [];
    let rate = a.expenseRatio ? v(a.expenseRatio) : null;
    if (rate === null && holdings.length) rate = holdings.reduce((x, hh) => x + (hh.share || 0) * ((hh.expenseRatio || 0) + (hh.advisoryFee || 0)), 0);
    if (rate === null) { missing.push('accounts.' + a.id + '.expenseRatio'); continue; }
    rows.push({ id: a.id, name: v(a.name) || a.id, amount: b, rate, yearly: round2(b * rate) });
  }
  const yearly = round2(rows.reduce((x, r) => x + r.yearly, 0));
  const years = s.fi.yearsToFi.value, r = v(spine.assumptions.realReturn), base = rows.reduce((x, q) => x + q.amount, 0);
  const f = base > 0 ? yearly / base : 0;
  const byFi = years === null || r === null || !rows.length ? null : { years, cost: round2(base * (Math.pow(1 + r, years) - Math.pow(1 + r - f, years))) };
  return { yearly, rows, missing, byFi };
}

// Room left in this year's federal bracket: { taxable, rate, room, nextRate, top } | null when the tax is not known.
export function bracketRoom(spine, rules, year = +spine.meta.asOf.slice(0, 4)) {
  const status = v(spine.household.filingStatus);
  const tx = yearTax(spine, rules, year);
  const taxable = tx.lines && tx.lines.taxable ? tx.lines.taxable.value : null;
  if (!status || taxable === null) return null;
  const brk = rules.get(statusRuleId('FED_BRK', status), year);
  let i = brk.findIndex(([top]) => top === null || taxable < top);
  if (i < 0) i = brk.length - 1;
  const [top, rate] = brk[i], next = brk[i + 1];
  return { taxable, rate, top, room: top === null ? null : round2(top - taxable), nextRate: next ? next[1] : null, rule: statusRuleId('FED_BRK', status) };
}

// Where each headline number came from: every fact the headline numbers read, once, with its kind (known, rough or
// a guess from a default), its source and its as-of date. Coach notes are never in it.
export function sources(spine, s) {
  const heads = [['Net worth', s.sheet.netWorth], ['Reachable after debts', s.sheet.liquidNetWorth], ['Left a month', s.cashflow.monthlySurplus], ['Savings rate', s.cashflow.savingsRate.net], ['FI number', s.fi.fiNumber], ['Years to FI', s.fi.yearsToFi], ['Cash runway', s.emergency.tiers.full.runway], ['Tax due at tax time', s.tax.balanceDue]];
  const by = new Map();
  for (const [head, r] of heads) for (const p of [...(r.from || []), ...(r.rough || []), ...(r.missing || [])]) {
    if (typeof p !== 'string' || p.startsWith('rule:') || /\.coachNote$/.test(p)) continue;
    const e = by.get(p) || { path: p, uses: [] };
    if (!e.uses.includes(head)) e.uses.push(head);
    by.set(p, e);
  }
  return [...by.values()].map((e) => {
    const f = getAt(spine, e.path);
    const kind = !f || f.kind === 'missing' ? 'missing' : f.kind === 'rough' && /default|guess|typical|house/i.test(String(f.source || '')) ? 'guess' : f.kind;
    return { ...e, label: labelFor(spine, e.path), value: f ? f.value : null, kind, source: f ? f.source || null : null, asOf: f ? f.asOf || null : null };
  });
}
export const SOURCE_KINDS = ['known', 'rough', 'guess', 'missing', 'computed', 'notForMe'];
