// Federal income tax and FICA estimate, used only when a client gives gross pay
// but not take-home. The result is always a "guess". State tax is not included.

// The rate on the last dollar of taxable income (the bracket someone is "in").
export function marginalRate(taxable, brackets) {
  if (taxable <= 0) return 0;
  for (const [upTo, rate] of brackets) if (upTo === null || taxable <= upTo) return rate;
  return null;
}

// Taxable income cut into its brackets: how much falls in each, and the tax on that part.
export function bracketSlices(taxable, brackets) {
  const out = [];
  let lower = 0;
  for (const [upTo, rate] of brackets) {
    const top = upTo === null ? Infinity : upTo;
    if (taxable <= lower) break;
    const amount = Math.min(taxable, top) - lower;
    out.push({ rate, from: lower, to: upTo, amount, tax: amount * rate });
    lower = top;
  }
  return out;
}

export function bracketTax(taxable, brackets) {
  return bracketSlices(taxable, brackets).reduce((a, x) => a + x.tax, 0);
}

// Annual figures in, annual figures out. stdDeduction is what is left of the
// household's standard deduction for this source (see income.js).
// deductions = everything taken out of the paycheck; incomeTaxFree = the part
// that lowers income tax; ficaFree = the part that also lowers FICA.
export function estimateAnnualTax({ gross, deductions = 0, incomeTaxFree = 0, ficaFree = 0, type, filingStatus, stdDeduction }, tax) {
  const brackets = tax.brackets[filingStatus] || tax.brackets.single;
  const out = { incomeTax: 0, fica: 0, socialSecurity: 0, medicare: 0, seTax: 0, stdUsed: 0, taxable: 0, bracket: null, slices: [], agi: 0, ficaBase: 0, withheld: type === 'w2' };
  // Family support is a gift to the client, not taxable income.
  if (type === 'not-taxable' || type === 'family') return finish(out, gross, deductions);

  let agi = gross - incomeTaxFree;
  if (type === 'w2') {
    const ficaBase = gross - ficaFree;
    out.ficaBase = ficaBase;
    out.socialSecurity = Math.min(ficaBase, tax.fica.socialSecurityWageBase) * tax.fica.socialSecurityRate;
    out.medicare = ficaBase * tax.fica.medicareRate;
    out.fica = out.socialSecurity + out.medicare;
  } else if (type === '1099' || type === 'side') {
    const se = gross * tax.selfEmployment.netEarningsFactor;
    out.seTax = Math.min(se, tax.fica.socialSecurityWageBase) * tax.selfEmployment.socialSecurityRate + se * tax.selfEmployment.medicareRate;
    agi -= out.seTax / 2;
  }
  out.stdUsed = Math.min(Math.max(agi, 0), stdDeduction);
  out.agi = agi;
  out.taxable = Math.max(0, agi - stdDeduction);
  out.slices = bracketSlices(out.taxable, brackets);
  out.incomeTax = out.slices.reduce((a, x) => a + x.tax, 0);
  out.bracket = marginalRate(out.taxable, brackets);
  return finish(out, gross, deductions);
}

function finish(out, gross, deductions) {
  out.totalTax = out.incomeTax + out.fica + out.seTax;
  out.takeHome = gross - deductions - out.totalTax;
  return out;
}
