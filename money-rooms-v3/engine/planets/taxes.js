/* Taxes: federal brackets and FICA as the base; state and local stand-ins, credits,
   standard against itemized, and the ways to lower it (MR-094). Filing status, state,
   city and dependents are Sun facts; interest by debt kind and contribution room come
   from the Debt and Investments slots. The room's own rows are deductions and credits
   the household paid for. federalAnnual stays the plain bracket figure (what Income
   uses to infer take-home); breakdown carries the full picture. */
import { q, U, needs, isNeeds } from '../units.js';
import { federalTax, taxableIncome, fica, standardDeduction, selfEmploymentTax, stateTax, localTax, childTaxCredit, eitc, creditFor, studentLoanDeduction, itemized } from '../tax.js';
import { fieldQ, val } from './common.js';

const KINDS_D = ['charity', 'medical', 'propertyTax', 'stateTaxPaid', 'other'];

export function run(ctx) {
  const { reader, data, rows, asm } = ctx;
  const status = reader.fact('filingStatus');
  const gross = reader.slot('income.grossMonthly');
  const pretax = reader.slot('income.pretaxContribMonthly');
  const hsa = reader.slot('income.hsaPayrollMonthly');
  const other = reader.slot('income.pretaxOtherMonthly');
  const take = reader.slot('income.takeHomeMonthly');
  const byType = reader.slot('income.byType') || {};
  const need = [];
  if (!status || !status.v) need.push('filing status');
  if (!gross || isNeeds(gross)) need.push('gross pay');
  else if (gross.cents === 0) need.push('gross pay');
  if (need.length) {
    const n = needs(need);
    return { outputs: { federalAnnual: n, ficaAnnual: n, effectiveRate: n, marginalRate: n, savedPer1000Pretax: n, impliedRate: take && !isNeeds(take) && gross && !isNeeds(gross) ? impliedRate(gross, take, pretax, hsa, other, byType) : n, taxable: n, standardDeduction: null, ficaParts: null, selfEmployment: null, stateAnnual: n, localAnnual: n, creditsAnnual: n, deductionChoice: null, breakdown: null, totalRate: n, levers: [] }, enriched: [] };
  }
  const table = data.tax2026; const st = status.v;
  const grossAnnual = gross.cents * 12;
  const pretaxAnnual = ((pretax ? pretax.cents : 0) + (hsa ? hsa.cents : 0) + (other ? other.cents : 0)) * 12;
  const selfAnnual = ((byType.c1099 || 0) + (byType.side || 0)) * 12;
  const se = selfAnnual ? selfEmploymentTax(table, selfAnnual) : { tax: 0, deductibleHalf: 0 };
  const taxable = taxableIncome(table, grossAnnual - se.deductibleHalf, pretaxAnnual, st);
  const fed = federalTax(table, taxable, st);
  const wageAnnual = grossAnnual - selfAnnual - ((hsa ? hsa.cents : 0) + (other ? other.cents : 0)) * 12;
  const f = fica(table, Math.max(0, wageAnnual));
  const conf = gross.confidence;

  /* ---- MR-094: the full picture ---- */
  const stateF = reader.fact('state'); const cityF = reader.fact('city'); const depF = reader.fact('dependents');
  const stateCode = stateF && stateF.v ? String(stateF.v) : null; const city = cityF && cityF.v ? String(cityF.v) : null;
  const children = depF && typeof depF.v === 'number' ? depF.v : 0;
  const interestBy = reader.slot('debt.interestByType') || {};
  const roomLeft = reader.slot('invest.roomLeft') || [];
  const std = standardDeduction(table, st);
  const agi0 = Math.max(0, grossAnnual - pretaxAnnual - se.deductibleHalf);
  const slDed = studentLoanDeduction(table, interestBy.student || 0, agi0, st);
  const agi = Math.max(0, agi0 - slDed);
  /* the room's rows */
  const paid = {}; const typedCredits = [];
  rows.forEach(r => {
    if (r.type === 'deduction') { const k = val(r, 'deductionKind') || 'other'; const a = fieldQ(r, 'deductionAmount', U.annualNa, asm); if (a && KINDS_D.includes(k)) paid[k] = (paid[k] || 0) + a.cents; }
    if (r.type === 'credit') { const k = val(r, 'creditKind') || 'other'; const a = fieldQ(r, 'creditAmount', U.annualNa, asm); if (a) typedCredits.push({ rowId: r.id, kind: k, paid: a.cents, credit: creditFor(table, k, a.cents, children) }); }
  });
  const stateOnTaxable = stateTax(table, taxable, stateCode);
  const items = itemized(table, { charity: paid.charity || 0, medical: paid.medical || 0, mortgageInterest: interestBy.mortgage || 0, stateIncomeTax: stateOnTaxable.tax, propertyTax: paid.propertyTax || 0, stateTaxPaid: paid.stateTaxPaid || 0, other: paid.other || 0 }, agi);
  const usesItemized = items.total > std;
  const deduction = usesItemized ? items.total : std;
  const taxableFull = Math.max(0, agi - deduction);
  const fedFull = federalTax(table, taxableFull, st);
  const ctc = childTaxCredit(table, st, children, agi);
  const earned = Math.max(0, wageAnnual) + Math.max(0, selfAnnual - se.deductibleHalf);
  const eitcCents = eitc(table, st, children, earned, agi);
  const typedTotal = typedCredits.reduce((s2, x) => s2 + x.credit, 0);
  const nonRefundable = Math.min(fedFull.tax, Math.max(0, ctc.total - ctc.refundable) + typedTotal);
  const refundable = ctc.refundable + eitcCents;
  const credits = nonRefundable + refundable;
  const federalAfter = fedFull.tax - credits; /* can go below zero: a refund */
  const stateFull = stateTax(table, taxableFull, stateCode);
  const local = localTax(table, Math.max(0, wageAnnual), city);
  const total = federalAfter + stateFull.tax + local.tax + f.total + se.tax;
  const breakdown = { gross: grossAnnual, pretax: pretaxAnnual, deduction, usesItemized, federalBeforeCredits: fedFull.tax, credits, federal: federalAfter, state: stateFull.tax, stateRate: stateFull.rate, local: local.tax, localCity: local.city, socialSecurity: f.socialSecurity, medicare: f.medicare, selfEmployment: se.tax, total, takeHome: grossAnnual - pretaxAnnual - total, marginal: fedFull.marginal };
  const totalRate = grossAnnual ? total / grossAnnual : null;

  /* the ways to lower it: each a figure a year, or what it needs */
  const comboRate = fedFull.marginal + (stateFull.rate || 0); const payrollRate = comboRate + table.fica.socialSecurityRate + table.fica.medicareRate;
  const room = id => roomLeft.find(r => r.limitId === id);
  const levers = [];
  const k401 = room('401k');
  if (k401 && k401.left > 0) levers.push({ id: 'max401k', label: 'Fill the 401(k) room', savesAnnual: Math.round(k401.left * comboRate), how: 'Every dollar deferred skips federal and state tax now: ' + Math.round(k401.left / 100).toLocaleString('en-US') + ' of room left this year.', href: '#/ledger/invest/account', field: 'pretaxRetirement' });
  else if (!k401) levers.push({ id: 'max401k', label: 'A 401(k) or similar', savesAnnual: null, needs: 'a workplace plan on the W-2 row or an account', how: 'Pre-tax deferrals skip federal and state tax now.', href: '#/ledger/income/w2', field: 'pretaxRetirement' });
  const ira = room('ira'); const iraLo = table.deductions.iraDeductionPhaseOut[st] || table.deductions.iraDeductionPhaseOut.single; const covered = !!(k401 && k401.used > 0);
  const iraDeductible = !covered || agi <= iraLo[0] ? 1 : (agi >= iraLo[1] ? 0 : 1 - (agi - iraLo[0]) / (iraLo[1] - iraLo[0]));
  if (ira && ira.left > 0 && iraDeductible > 0) levers.push({ id: 'tradIra', label: 'A traditional IRA, deductible', savesAnnual: Math.round(ira.left * iraDeductible * comboRate), how: (iraDeductible < 1 ? 'Partly deductible at this income. ' : '') + Math.round(ira.left / 100).toLocaleString('en-US') + ' of IRA room left this year.', href: '#/ledger/invest/account', field: 'accountBalance' });
  else if (!ira) levers.push({ id: 'tradIra', label: 'A traditional IRA, deductible', savesAnnual: null, needs: 'an IRA account row', how: 'Up to the IRA limit a year, deductible when income allows.', href: '#/ledger/invest/account', field: 'accountBalance' });
  const hsaRoom = roomLeft.find(r => r.limitId === 'hsa-self' || r.limitId === 'hsa-family');
  if (hsaRoom && hsaRoom.left > 0) levers.push({ id: 'hsa', label: 'Fill the HSA', savesAnnual: Math.round(hsaRoom.left * payrollRate), how: 'Through payroll an HSA dollar skips federal, state and FICA.', href: '#/ledger/income/w2', field: 'hsaPayroll' });
  if (children > 0 && st === 'single') { const alt = federalTax(table, Math.max(0, agi - standardDeduction(table, 'hoh')), 'hoh').tax; if (alt < fedFull.tax) levers.push({ id: 'hoh', label: 'File as head of household', savesAnnual: fedFull.tax - alt, how: 'With a dependent at home, head of household has wider brackets and a larger standard deduction.', href: '#/ledger', field: 'filingStatus' }); }
  if (ctc.total > 0) levers.push({ id: 'ctc', label: 'The child tax credit', savesAnnual: ctc.total, counted: true, how: 'Counted: ' + children + (children === 1 ? ' child' : ' children') + ' at this income.', href: '#/ledger', field: 'dependents' });
  if (eitcCents > 0) levers.push({ id: 'eitc', label: 'The earned income credit', savesAnnual: eitcCents, counted: true, how: 'Counted: earned income and family size put the household in range. It is refundable.', href: '#/ledger', field: 'dependents' });
  else if (earned > 0 && earned < 7000000) levers.push({ id: 'eitc', label: 'The earned income credit', savesAnnual: 0, how: 'Out of range at this income and family size; it opens with a lower income or more dependents.', href: '#/ledger', field: 'dependents' });
  if (slDed > 0) levers.push({ id: 'studentLoan', label: 'Student loan interest', savesAnnual: Math.round(slDed * comboRate), counted: true, how: 'Counted: the interest on the student loan rows, up to the cap.', href: '#/ledger/debt/student', field: 'rate' });
  if (selfAnnual > 0) levers.push({ id: 'business', label: 'Track every business expense', savesAnnual: Math.round(100000 * (comboRate + table.fica.selfEmploymentNetFactor * 2 * (table.fica.socialSecurityRate + table.fica.medicareRate))), per1000: true, how: 'Each 1,000 of 1099 expenses saves this: income tax and both halves of self-employment tax.', href: '#/ledger/income/c1099', field: 'businessExpenses' });
  const gap = std - items.total;
  if (usesItemized) levers.push({ id: 'itemize', label: 'Itemizing', savesAnnual: Math.round((items.total - std) * fedFull.marginal), counted: true, how: 'Counted: charity, medical, mortgage interest and state and local taxes come to more than the standard deduction.', href: '#/ledger/taxes/deduction', field: 'deductionAmount' });
  else levers.push({ id: 'itemize', label: 'Itemizing', savesAnnual: 0, gapCents: gap, how: 'The standard deduction wins by ' + Math.round(gap / 100).toLocaleString('en-US') + '. Charity, medical bills, mortgage interest and property tax count toward itemizing; past the gap each 1,000 saves ' + Math.round(1000 * fedFull.marginal) + '.', href: '#/ledger/taxes/deduction', field: 'deductionAmount' });
  if (typedCredits.length) typedCredits.forEach(x => levers.push({ id: 'credit:' + x.rowId, label: (table.credits.rules[x.kind] || {}).label || 'A credit', savesAnnual: x.credit, counted: true, how: 'Counted from what was paid.', href: '#/ledger/taxes/credit', field: 'creditAmount' }));
  levers.sort((a, b) => (b.savesAnnual || 0) - (a.savesAnnual || 0));

  return {
    outputs: {
      federalAnnual: q(fed.tax, U.annualNa, { confidence: Math.min(conf, 0.85), rough: gross.rough }),
      ficaAnnual: q(f.total + se.tax, U.annualNa, { confidence: Math.min(conf, 0.85), rough: gross.rough }),
      effectiveRate: grossAnnual ? fed.tax / grossAnnual : null,
      marginalRate: fed.marginal,
      savedPer1000Pretax: q(Math.round(100000 * fed.marginal), U.oneoff),
      impliedRate: take && !isNeeds(take) ? impliedRate(gross, take, pretax, hsa, other, byType) : needs(['take-home pay']),
      taxable: q(taxable, U.annualPre), standardDeduction: std,
      ficaParts: f, selfEmployment: se,
      stateAnnual: stateCode ? q(stateFull.tax, U.annualNa, { confidence: Math.min(conf, 0.6), rough: true }) : needs(['a state']),
      localAnnual: q(local.tax, U.annualNa, { confidence: Math.min(conf, 0.6), rough: true }),
      creditsAnnual: q(credits, U.annualNa, { confidence: Math.min(conf, 0.7), rough: true }),
      deductionChoice: { standard: std, itemized: items, used: deduction, usesItemized, studentLoanInterest: slDed },
      breakdown, totalRate, levers,
    },
    enriched: [],
  };
}

function impliedRate(gross, take, pretax, hsa, other, byType) {
  const deductions = (pretax ? pretax.cents : 0) + (hsa ? hsa.cents : 0) + (other ? other.cents : 0);
  const base = byType && byType.paystub ? byType.paystub : gross.cents;
  if (!base) return needs(['gross pay']);
  return (base - take.cents - deductions) / base;
}
