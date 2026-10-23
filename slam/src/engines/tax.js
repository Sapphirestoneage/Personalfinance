// Federal income tax and FICA estimate, used only when a client gives gross pay
// but not take-home. The result is always a "guess". State tax is not included.
// No imports: brackets, standard deductions and FICA rates arrive as the tax argument (src/data/tax-constants.json,
// which names its year and source). Dollars a year throughout, unrounded; a rate is a ratio like 0.22.

/**
 * The rate on the last dollar of taxable income (the bracket someone is "in").
 * @param {number} taxable dollars a year.
 * @param {Array<[?number, number]>} brackets [upTo, rate] pairs, lowest first; upTo is null for the top bracket.
 * @returns {?number} a ratio like 0.22; 0 with no taxable income; null only if the table has no top bracket.
 */
export function marginalRate(taxable, brackets) {
  if (taxable <= 0) return 0;
  for (const [upTo, rate] of brackets) if (upTo === null || taxable <= upTo) return rate;
  return null;
}

/**
 * Taxable income cut into its brackets: how much falls in each, and the tax on that part.
 * @param {number} taxable dollars a year.
 * @param {Array<[?number, number]>} brackets [upTo, rate] pairs, lowest first.
 * @returns {Array<{rate: number, from: number, to: ?number, amount: number, tax: number}>} dollars a year per slice; stops
 *   at the bracket the income runs out in.
 */
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

/**
 * Income tax on taxable income: the slices' tax added up.
 * @param {number} taxable dollars a year.
 * @param {Array<[?number, number]>} brackets [upTo, rate] pairs, lowest first.
 * @returns {number} dollars a year.
 */
export function bracketTax(taxable, brackets) {
  return bracketSlices(taxable, brackets).reduce((a, x) => a + x.tax, 0);
}

/**
 * Federal income tax, FICA or self-employment tax, and take-home for one income source. Annual figures in,
 * annual figures out. deductions = everything taken out of the paycheck; incomeTaxFree = the part that lowers
 * income tax; ficaFree = the part that also lowers FICA; stdDeduction = what is left of the household's standard
 * deduction for this source (see income.js).
 * @param {{gross: number, deductions?: number, incomeTaxFree?: number, ficaFree?: number, type: string, filingStatus: string,
 *   stdDeduction: number}} p dollars a year; type is 'w2', '1099', 'side', 'unemployment', 'not-taxable' or 'family'.
 * @param {object} tax tax-constants.json (brackets by filing status, fica, selfEmployment); rates are ratios like 0.062.
 * @returns {object} dollars a year: incomeTax, fica (socialSecurity + medicare), seTax, totalTax, takeHome, stdUsed, agi,
 *   taxable, ficaBase, bracket (the marginal rate), slices, and withheld (true for W-2 pay, where the employer withholds).
 */
export function estimateAnnualTax({ gross, deductions = 0, incomeTaxFree = 0, ficaFree = 0, type, filingStatus, stdDeduction }, tax) {
  // An unknown filing status is taxed as single.
  const brackets = tax.brackets[filingStatus] || tax.brackets.single;
  const out = { incomeTax: 0, fica: 0, socialSecurity: 0, medicare: 0, seTax: 0, stdUsed: 0, taxable: 0, bracket: null, slices: [], agi: 0, ficaBase: 0, withheld: type === 'w2' };
  // Family support is a gift to the client, not taxable income.
  if (type === 'not-taxable' || type === 'family') return finish(out, gross, deductions);

  // AGI starts at gross less the pre-tax deductions. W-2 pay owes FICA on wages; 1099 and side income owe both
  // halves as self-employment tax, half of which is deductible; unemployment owes income tax only (benefits are
  // not wages, so no FICA).
  let agi = gross - incomeTaxFree;
  if (type === 'w2') {
    const ficaBase = gross - ficaFree;
    out.ficaBase = ficaBase;
    // Social Security stops at the wage base; Medicare has no cap (the 0.9% additional Medicare tax is left out).
    out.socialSecurity = Math.min(ficaBase, tax.fica.socialSecurityWageBase) * tax.fica.socialSecurityRate;
    out.medicare = ficaBase * tax.fica.medicareRate;
    out.fica = out.socialSecurity + out.medicare;
  } else if (type === '1099' || type === 'side') {
    // Self-employment tax is on 92.35% of net earnings (the netEarningsFactor), as on Schedule SE; the employer half
    // (half the tax) comes off AGI.
    const se = gross * tax.selfEmployment.netEarningsFactor;
    out.seTax = Math.min(se, tax.fica.socialSecurityWageBase) * tax.selfEmployment.socialSecurityRate + se * tax.selfEmployment.medicareRate;
    agi -= out.seTax / 2;
  }
  // How much of the standard deduction this source used up, so income.js can hand the rest to the next source.
  out.stdUsed = Math.min(Math.max(agi, 0), stdDeduction);
  out.agi = agi;
  out.taxable = Math.max(0, agi - stdDeduction);
  out.slices = bracketSlices(out.taxable, brackets);
  out.incomeTax = out.slices.reduce((a, x) => a + x.tax, 0);
  out.bracket = marginalRate(out.taxable, brackets);
  return finish(out, gross, deductions);
}

// Take-home: gross less everything taken out of the paycheck less the tax estimate. deductions already holds the
// pre-tax parts, so they come off once.
function finish(out, gross, deductions) {
  out.totalTax = out.incomeTax + out.fica + out.seTax;
  out.takeHome = gross - deductions - out.totalTax;
  return out;
}
