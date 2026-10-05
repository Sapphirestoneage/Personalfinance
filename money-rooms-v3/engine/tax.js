/* One tax function for everyone: federal brackets and FICA only (v1).
   Income uses it to infer take-home; Taxes uses it to publish. Cents in,
   cents out; rates as fractions. */

export function standardDeduction(table, status) {
  const d = table.standardDeduction[status];
  if (d === undefined) throw new Error('unknown filing status ' + status);
  return d;
}

/* Federal income tax on taxable income (cents). Returns { tax, marginal }. */
export function federalTax(table, taxableCents, status) {
  const brackets = table.brackets[status];
  if (!brackets) throw new Error('unknown filing status ' + status);
  let tax = 0, lower = 0, marginal = 0;
  for (const [rate, upper] of brackets) {
    if (taxableCents <= lower) break;
    const top = upper === null ? taxableCents : Math.min(taxableCents, upper);
    tax += (top - lower) * rate;
    marginal = rate;
    lower = upper;
    if (upper === null || taxableCents <= upper) break;
  }
  return { tax: Math.round(tax), marginal };
}

/* Taxable income from gross and pre-tax deductions, floored at zero. */
export function taxableIncome(table, grossAnnual, pretaxAnnual, status) {
  return Math.max(0, grossAnnual - pretaxAnnual - standardDeduction(table, status));
}

/* Employee FICA on wages (cents): Social Security up to the wage base, Medicare on all. */
export function fica(table, wagesAnnual) {
  const f = table.fica;
  const ss = Math.round(Math.min(wagesAnnual, f.socialSecurityWageBase) * f.socialSecurityRate);
  const med = Math.round(wagesAnnual * f.medicareRate);
  return { socialSecurity: ss, medicare: med, total: ss + med };
}

/* Self-employment tax: both halves on 92.35% of net earnings. Returns { tax, deductibleHalf }. */
export function selfEmploymentTax(table, netEarningsAnnual) {
  const f = table.fica;
  const base = Math.round(Math.max(0, netEarningsAnnual) * f.selfEmploymentNetFactor);
  const ss = Math.round(Math.min(base, f.socialSecurityWageBase) * f.socialSecurityRate * 2);
  const med = Math.round(base * f.medicareRate * 2);
  return { tax: ss + med, deductibleHalf: Math.round((ss + med) * f.selfEmploymentDeductionShare) };
}
