/* Investments and accounts: account type infers the tax bucket and liquidity
   tier; balances by bucket and tier; contributions (payroll ones read from
   Income); room left under limits; allocation; weighted fees; match capture.
   MR-071: two row types. An investing account carries accountType; a bank
   account (checking, savings, high-yield savings, CD) carries bankType and
   is all cash. typeOf() reads either. */
import { q, U, needs, isNeeds, sum } from '../units.js';
import { fieldQ, monthlyCents, num, val } from './common.js';
import { ageAt } from '../format.js';

export const BUCKET = { '401k': 'pretax', '403b': 'pretax', '457b': 'pretax', tsp: 'pretax', tradIra: 'pretax', sep: 'pretax', solo401k: 'pretax', pension: 'pretax', roth401k: 'roth', rothIra: 'roth', hsa: 'hsa', '529': 'other', taxable: 'taxable', crypto: 'taxable', hysa: 'cash', checking: 'cash', savings: 'cash', cd: 'cash', ibonds: 'cash', realEstate: 'other', other: 'other' };
export const LIQUIDITY = { checking: 'liquid', hysa: 'liquid', savings: 'liquid', cd: 'liquid', ibonds: 'liquid', taxable: 'liquid', crypto: 'liquid', rothIra: 'semi', hsa: 'semi', '529': 'semi', realEstate: 'locked', pension: 'locked' };
export const BANK_TYPES = Object.freeze(['checking', 'savings', 'hysa', 'cd']);
export const isAccountRow = r => r.type === 'account' || r.type === 'bank';
export const typeOf = r => r.type === 'bank' ? (r.f.bankType && r.f.bankType.v) : (r.f.accountType && r.f.accountType.v);
export const INVESTED = new Set(['401k', 'roth401k', '403b', '457b', 'tsp', 'tradIra', 'rothIra', 'sep', 'solo401k', 'hsa', '529', 'taxable', 'crypto']);
export const ACCOUNT_LABELS = { '401k': '401(k)', roth401k: 'Roth 401(k)', '403b': '403(b)', '457b': '457(b)', tsp: 'TSP', tradIra: 'Traditional IRA', rothIra: 'Roth IRA', sep: 'SEP IRA', solo401k: 'Solo 401(k)', hsa: 'HSA', '529': '529', taxable: 'Taxable brokerage', hysa: 'High-yield savings', checking: 'Checking', savings: 'Savings', cd: 'CD', ibonds: 'I bonds', crypto: 'Crypto', realEstate: 'Real estate equity', pension: 'Pension', other: 'Other' };

export function run(ctx) {
  const { rows, reader, data, asm, today } = ctx;
  const buckets = { pretax: 0, roth: 0, taxable: 0, hsa: 0, cash: 0, other: 0 };
  const tiers = { liquid: 0, semi: 0, locked: 0 };
  const alloc = { stocks: 0, bonds: 0, cash: 0, other: 0 };
  let us = 0, total = 0, invested = 0, cash = 0, bankContribAnnual = 0, iraAnnual = 0;
  const qs = []; const investedQs = []; const cashQs = [];
  const accounts = {}; const missingBeneficiary = [];
  const enriched = [];
  rows.forEach(r => {
    if (!isAccountRow(r)) return;
    const t = typeOf(r); const bq = fieldQ(r, 'accountBalance', U.oneoff, asm);
    if (!t || !bq) return;
    const b = bq.cents; const bucket = BUCKET[t] || 'other'; const tier = LIQUIDITY[t] || 'locked';
    enriched.push({ rowId: r.id, field: 'taxBucket', value: bucket, note: 'Tax bucket from the account type', source: 'inferred' });
    enriched.push({ rowId: r.id, field: 'liquidity', value: tier, note: 'Liquidity tier from the account type', source: 'inferred' });
    buckets[bucket] += b; tiers[tier] += b; total += b; qs.push(bq);
    if (INVESTED.has(t)) { invested += b; investedQs.push(bq); }
    if (bucket === 'cash') { cash += b; cashQs.push(bq); }
    if (r.type === 'bank') alloc.cash += b; /* a bank account is all cash */
    else { [['stocks', 'allocStocks'], ['bonds', 'allocBonds'], ['cash', 'allocCash'], ['other', 'allocOther']].forEach(([k, fid]) => { alloc[k] += Math.round(b * (num(r, fid) || 0)); }); us += Math.round(b * (num(r, 'allocStocks') || 0) * (num(r, 'usShare') || 0)); }
    const ca = monthlyCents(r, 'contribAmount') || 0; bankContribAnnual += ca * 12;
    if (t === 'tradIra' || t === 'rothIra') iraAnnual += ca * 12;
    accounts[r.nickname] = { type: t, balance: b, er: null, erWeight: 0 };
    if (r.type === 'account' && val(r, 'beneficiary') === false) missingBeneficiary.push(r.id);
  });
  rows.forEach(r => {
    if (r.type !== 'holding') return;
    const acc = val(r, 'accountRef'); const er = num(r, 'expenseRatio'); const share = num(r, 'pctOfAccount');
    if (acc && accounts[acc] && er !== null) { accounts[acc].er = (accounts[acc].er || 0) + er * (share === null ? 1 : share); }
  });
  let erNum = 0, erDen = 0;
  Object.values(accounts).forEach(a => { if (a.er !== null) { erNum += a.balance * a.er; erDen += a.balance; } });
  const wer = erDen ? erNum / erDen : null;
  const pretaxPayroll = reader.slot('income.pretaxContribMonthly'); const rothPayroll = reader.slot('income.rothContribMonthly'); const hsaPayroll = reader.slot('income.hsaPayrollMonthly');
  const match = reader.slot('income.matchMonthly'); const formula = reader.slot('income.matchFormula');
  const payroll = ((pretaxPayroll ? pretaxPayroll.cents : 0) + (rothPayroll ? rothPayroll.cents : 0) + (hsaPayroll ? hsaPayroll.cents : 0)) * 12;
  const employee = payroll + bankContribAnnual; const employer = (match ? match.cents : 0) * 12;
  const birth = reader.fact('birthDate'); const age = birth && birth.v ? ageAt(birth.v, today) : null;
  const limits = data.limits2026.limits;
  const room = [];
  const K401 = ['401k', 'roth401k', '403b', '457b', 'tsp', 'solo401k'];
  const k401 = ((pretaxPayroll ? pretaxPayroll.cents : 0) + (rothPayroll ? rothPayroll.cents : 0)) * 12 + rows.filter(r => r.type === 'account' && K401.includes(val(r, 'accountType'))).reduce((s, r) => s + (monthlyCents(r, 'contribAmount') || 0) * 12, 0);
  const has = types => rows.some(r => r.type === 'account' && types.includes(val(r, 'accountType')));
  if (k401 > 0 || has(K401)) { const l = limits.find(x => x.id === '401k'); const lim = l.cents + (age !== null && age >= 50 ? l.catchUp50 : 0); room.push({ limitId: '401k', label: l.label, limit: lim, used: k401, left: lim - k401 }); }
  if (has(['tradIra', 'rothIra'])) { const l = limits.find(x => x.id === 'ira'); const lim = l.cents + (age !== null && age >= 50 ? l.catchUp50 : 0); room.push({ limitId: 'ira', label: l.label, limit: lim, used: iraAnnual, left: lim - iraAnnual }); }
  if ((hsaPayroll && hsaPayroll.cents > 0) || has(['hsa'])) { const l = limits.find(x => x.id === 'hsa-self'); const hsaUsed = (hsaPayroll ? hsaPayroll.cents : 0) * 12 + rows.filter(r => r.type === 'account' && val(r, 'accountType') === 'hsa').reduce((s, r) => s + (monthlyCents(r, 'contribAmount') || 0) * 12, 0); room.push({ limitId: 'hsa-self', label: l.label, limit: l.cents, used: hsaUsed, left: l.cents - hsaUsed }); }
  const matchMax = formula ? formula.maxMonthly : 0;
  const capture = matchMax ? (match ? match.cents : 0) / matchMax : null;
  const anyAccount = total > 0 || rows.some(r => r.type === 'account');
  const summaryRow = rows.find(r => r.type === 'summary');
  const summaryQ = summaryRow ? fieldQ(summaryRow, 'investSummaryTotal', U.oneoff, asm) : null;
  const totalQ = qs.length ? sum(qs, U.oneoff) : (summaryQ || needs(['account balances']));
  return {
    outputs: {
      balancesByBucket: buckets, balancesByLiquidity: tiers,
      cashBalances: qs.length ? (cashQs.length ? sum(cashQs, U.oneoff) : q(0, U.oneoff)) : needs(['cash accounts']),
      totalAssets: totalQ,
      investedAssets: qs.length ? (investedQs.length ? sum(investedQs, U.oneoff) : q(0, U.oneoff)) : needs(['account balances']),
      annualContributions: { employee, employer, total: employee + employer, payroll, bank: bankContribAnnual },
      roomLeft: room,
      allocation: total ? { stocks: alloc.stocks / total, bonds: alloc.bonds / total, cash: alloc.cash / total, other: alloc.other / total, usShare: alloc.stocks ? us / alloc.stocks : null, dollars: alloc } : null,
      weightedExpenseRatio: wer,
      feeDragAnnual: wer !== null ? q(Math.round(erNum), U.annualNa) : null,
      matchCapture: { ratio: capture, actualMonthly: match ? match.cents : 0, maxMonthly: matchMax, dollarsLeftAnnual: matchMax ? (matchMax - (match ? match.cents : 0)) * 12 : null },
      beneficiariesMissing: missingBeneficiary,
    },
    enriched,
  };
}
