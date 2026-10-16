// Federal income tax and FICA estimate, used only when a client gives gross pay
// but not take-home. The result is always a "guess". State tax is not included.

export function bracketTax(taxable, brackets) {
  let tax = 0;
  let lower = 0;
  for (const [upTo, rate] of brackets) {
    const top = upTo === null ? Infinity : upTo;
    if (taxable <= lower) break;
    tax += (Math.min(taxable, top) - lower) * rate;
    lower = top;
  }
  return tax;
}

// Annual figures in, annual figures out. stdDeduction is what is left of the
// household's standard deduction for this source (see income.js).
// deductions = everything taken out of the paycheck; incomeTaxFree = the part
// that lowers income tax; ficaFree = the part that also lowers FICA.
export function estimateAnnualTax({ gross, deductions = 0, incomeTaxFree = 0, ficaFree = 0, type, filingStatus, stdDeduction }, tax) {
  const brackets = tax.brackets[filingStatus] || tax.brackets.single;
  const out = { incomeTax: 0, fica: 0, seTax: 0, stdUsed: 0, withheld: type === 'w2' };
  // Family support is a gift to the client, not taxable income.
  if (type === 'not-taxable' || type === 'family') return finish(out, gross, deductions);

  let agi = gross - incomeTaxFree;
  if (type === 'w2') {
    const ficaBase = gross - ficaFree;
    out.fica = Math.min(ficaBase, tax.fica.socialSecurityWageBase) * tax.fica.socialSecurityRate + ficaBase * tax.fica.medicareRate;
  } else if (type === '1099' || type === 'side') {
    const se = gross * tax.selfEmployment.netEarningsFactor;
    out.seTax = Math.min(se, tax.fica.socialSecurityWageBase) * tax.selfEmployment.socialSecurityRate + se * tax.selfEmployment.medicareRate;
    agi -= out.seTax / 2;
  }
  out.stdUsed = Math.min(Math.max(agi, 0), stdDeduction);
  out.incomeTax = bracketTax(Math.max(0, agi - stdDeduction), brackets);
  return finish(out, gross, deductions);
}

function finish(out, gross, deductions) {
  out.totalTax = out.incomeTax + out.fica + out.seTax;
  out.takeHome = gross - deductions - out.totalTax;
  return out;
}
