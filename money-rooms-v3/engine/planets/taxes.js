/* Taxes (v1): federal brackets and FICA only. Filing status is a Sun fact. */
import { q, U, needs, isNeeds } from '../units.js';
import { federalTax, taxableIncome, fica, standardDeduction, selfEmploymentTax } from '../tax.js';

export function run(ctx) {
  const { reader, data } = ctx;
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
    return { outputs: { federalAnnual: n, ficaAnnual: n, effectiveRate: n, marginalRate: n, savedPer1000Pretax: n, impliedRate: take && !isNeeds(take) && gross && !isNeeds(gross) ? impliedRate(gross, take, pretax, hsa, other, byType) : n, taxable: n, standardDeduction: null, ficaParts: null, selfEmployment: null }, enriched: [] };
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
  return {
    outputs: {
      federalAnnual: q(fed.tax, U.annualNa, { confidence: Math.min(conf, 0.85), rough: gross.rough }),
      ficaAnnual: q(f.total + se.tax, U.annualNa, { confidence: Math.min(conf, 0.85), rough: gross.rough }),
      effectiveRate: grossAnnual ? fed.tax / grossAnnual : null,
      marginalRate: fed.marginal,
      savedPer1000Pretax: q(Math.round(100000 * fed.marginal), U.oneoff),
      impliedRate: take && !isNeeds(take) ? impliedRate(gross, take, pretax, hsa, other, byType) : needs(['take-home pay']),
      taxable: q(taxable, U.annualPre), standardDeduction: standardDeduction(table, st),
      ficaParts: f, selfEmployment: se,
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
