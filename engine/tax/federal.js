/* ==========================================================================
   engine/tax/federal.js, the federal income tax on one year. D-341.
   --------------------------------------------------------------------------
   AGI = wages after the pretax deferral + self-employment profit less half
         the SE tax + other ordinary income (pensions, rental, unemployment)
         + taxable interest + qualified dividends + long-term gains
         + pretax withdrawals + Roth conversions + the taxed part of any
         Roth earnings or HSA money + the taxable part of Social Security
         minus the HSA and IRA deductions.
   Taxable income = AGI minus the standard deduction (plus the extra for
         65 and over, plus the 2025 to 2028 senior deduction).
   Ordinary tax runs the bracket ladder on taxable income less the
   preferential part; qualified dividends and long-term gains stack on
   top at 0, 15 and 20 percent. NIIT is 3.8% of the lesser of investment
   income and AGI over its threshold. The 10% early-withdrawal penalty is
   on whatever withdrawals.js said was penalised.
   Every figure in cents. Thresholds from data/tax/2026.json, indexed.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Tables: require('../tables.js'), SST: require('./socialSecurityTax.js') };
  } else {
    var E = root.SLAF && root.SLAF.Engine;
    deps = { Tables: E && E.Tables, SST: E && E.SocialSecurityTax };
  }
  var api = factory(deps.Tables, deps.SST);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Federal = api; }
})(typeof self !== 'undefined' ? self : null, function (Tables, SST) {
  'use strict';

  function n(v) { return v ? Math.max(0, v) : 0; }
  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }
  function pct(r) { return (Math.round(r * 10000) / 100) + '%'; }

  /** The deductions for the year: standard, aged, senior. */
  function deductions(input, tax, factor, status, year) {
    var F = tax.federal;
    var std = Tables.byStatus(F.standardDeduction, status === 'married_joint' ? 'married_joint' : status, status, factor);
    var ages = input.ages || [];
    var aged = 0, seniors = 0;
    ages.forEach(function (a) { if (a !== null && a !== undefined && a >= 65) seniors++; });
    if (seniors) {
      var per = status === 'married_joint' || status === 'married_separate' ? F.additionalStandardDeductionAged.perPersonMarried : F.additionalStandardDeductionAged.perPersonUnmarried;
      aged = seniors * Tables.cents(Tables.indexDollars(per, factor, F.additionalStandardDeductionAged.indexed));
    }
    var senior = 0;
    var S = F.seniorDeduction;
    if (seniors && year >= S.firstYear && year <= S.lastYear) {
      var start = Tables.byStatus(S, 'phaseOutStart', status, factor);
      var full = seniors * Tables.cents(S.perPerson);
      var over = Math.max(0, (input.agiCents || 0) - start);
      senior = Math.max(0, Math.round(full - over * S.phaseOutRate));
    }
    return { standardCents: std, agedCents: aged, seniorCents: senior, totalCents: std + aged + senior, seniors: seniors };
  }

  /**
   * compute(input, ctx)
   *   ctx = { tax, year, factor, filingStatus }
   *   input (cents, household totals unless said):
   *     wagesCents, deferral401kCents, seProfitCents, halfSeDeductionCents,
   *     otherOrdinaryCents, interestCents, qualifiedDividendsCents,
   *     longTermGainsCents, rentalNetCents, pretaxWithdrawalsCents,
   *     conversionsCents, rothEarningsTaxableCents, hsaTaxableCents,
   *     socialSecurityBenefitsCents, hsaDeductionCents, iraDeductionCents,
   *     penaltyBaseCents, ages: [a1, a2]
   */
  function compute(input, ctx) {
    var tax = ctx.tax, F = tax.federal, factor = ctx.factor, status = ctx.filingStatus || 'single';
    var i = input || {};
    var explain = [];
    var wagesTaxable = Math.max(0, n(i.wagesCents) - n(i.deferral401kCents));
    var seIncome = Math.max(0, n(i.seProfitCents) - n(i.halfSeDeductionCents));
    var preferential = n(i.qualifiedDividendsCents) + n(i.longTermGainsCents);
    var otherAgi = wagesTaxable + seIncome + n(i.otherOrdinaryCents) + n(i.interestCents) + preferential
      + n(i.rentalNetCents) + n(i.pretaxWithdrawalsCents) + n(i.conversionsCents)
      + n(i.rothEarningsTaxableCents) + n(i.hsaTaxableCents) - n(i.hsaDeductionCents) - n(i.iraDeductionCents);
    otherAgi = Math.max(0, otherAgi);
    var ss = SST.taxable({ benefitsCents: n(i.socialSecurityBenefitsCents), otherAgiCents: otherAgi, taxExemptInterestCents: 0, filingStatus: status }, F.socialSecurityBenefitTaxation);
    var agi = otherAgi + ss.taxableCents;
    var ded = deductions({ ages: i.ages, agiCents: agi }, tax, factor, status, ctx.year);
    var taxable = Math.max(0, agi - ded.totalCents);
    var pref = Math.min(taxable, preferential);
    var ordinary = taxable - pref;
    var rows = Tables.brackets(F.ordinaryBrackets, status, factor);
    var lad = Tables.ladder(ordinary, rows);

    /* Gains stack on top of ordinary income. */
    var zeroTop = Tables.byStatus(F.capitalGains, 'zeroRateUpTo', status, factor);
    var fifteenTop = Tables.byStatus(F.capitalGains, 'fifteenRateUpTo', status, factor);
    var atZero = Math.max(0, Math.min(taxable, zeroTop) - ordinary);
    var atFifteen = Math.max(0, Math.min(taxable, fifteenTop) - Math.max(ordinary, zeroTop));
    var atTwenty = Math.max(0, taxable - Math.max(ordinary, fifteenTop));
    var cgTax = Math.round(atFifteen * F.capitalGains.rates[1] + atTwenty * F.capitalGains.rates[2]);

    var nii = n(i.interestCents) + preferential + n(i.rentalNetCents);
    var niitThreshold = Tables.byStatus(F.netInvestmentIncomeTax, 'threshold', status, factor);
    var niit = Math.round(F.netInvestmentIncomeTax.rate * Math.max(0, Math.min(nii, agi - niitThreshold)));
    var penalty = Math.round(n(i.penaltyBaseCents) * F.earlyWithdrawalPenalty.rate);

    if (wagesTaxable) explain.push('Wages of ' + dollars(n(i.wagesCents)) + (n(i.deferral401kCents) ? ', less ' + dollars(n(i.deferral401kCents)) + ' put in the workplace plan before tax' : '') + '.');
    if (seIncome) explain.push('Self-employment profit of ' + dollars(n(i.seProfitCents)) + ', less half the self-employment tax.');
    if (n(i.pretaxWithdrawalsCents)) explain.push(dollars(n(i.pretaxWithdrawalsCents)) + ' taken from pretax accounts counts as ordinary income.');
    if (n(i.conversionsCents)) explain.push(dollars(n(i.conversionsCents)) + ' converted to Roth counts as ordinary income this year.');
    if (n(i.socialSecurityBenefitsCents)) explain.push(dollars(ss.taxableCents) + ' of the ' + dollars(n(i.socialSecurityBenefitsCents)) + ' Social Security benefit is taxed. ' + ss.explain.join(' '));
    if (n(i.hsaDeductionCents)) explain.push(dollars(n(i.hsaDeductionCents)) + ' into the HSA comes off income.');
    if (n(i.iraDeductionCents)) explain.push(dollars(n(i.iraDeductionCents)) + ' into the traditional IRA comes off income.');
    explain.push('Adjusted gross income ' + dollars(agi) + '. Standard deduction ' + dollars(ded.standardCents)
      + (ded.agedCents ? ' plus ' + dollars(ded.agedCents) + ' for being 65 or over' : '')
      + (ded.seniorCents ? ' plus the ' + dollars(ded.seniorCents) + ' senior deduction (2025 to 2028)' : '') + '. Taxable income ' + dollars(taxable) + '.');
    lad.bands.forEach(function (b) { explain.push(dollars(b.amountCents) + ' taxed at ' + pct(b.rate) + ': ' + dollars(b.taxCents) + '.'); });
    if (pref) explain.push('Qualified dividends and long-term gains of ' + dollars(pref) + ' sit on top: ' + dollars(atZero) + ' at 0%, ' + dollars(atFifteen) + ' at 15%, ' + dollars(atTwenty) + ' at 20%.');
    if (niit) explain.push('Net investment income tax of ' + pct(F.netInvestmentIncomeTax.rate) + ' on ' + dollars(Math.min(nii, agi - niitThreshold)) + ' over the ' + dollars(niitThreshold) + ' threshold: ' + dollars(niit) + '.');
    if (penalty) explain.push('A 10% penalty on ' + dollars(n(i.penaltyBaseCents)) + ' taken from retirement accounts early: ' + dollars(penalty) + '.');

    return {
      agiCents: Math.round(agi),
      magiCents: Math.round(otherAgi + n(i.socialSecurityBenefitsCents)),   /* ACA: AGI plus the untaxed benefit */
      taxableIncomeCents: Math.round(taxable),
      ordinaryTaxableCents: Math.round(ordinary),
      preferentialCents: Math.round(pref),
      socialSecurityTaxableCents: ss.taxableCents,
      provisionalIncomeCents: ss.provisionalIncomeCents,
      deductions: ded,
      ordinaryTaxCents: lad.taxCents,
      capitalGainsTaxCents: cgTax,
      capitalGainsBands: { zeroCents: Math.round(atZero), fifteenCents: Math.round(atFifteen), twentyCents: Math.round(atTwenty) },
      niitCents: niit,
      penaltyCents: penalty,
      totalCents: lad.taxCents + cgTax + niit + penalty,
      marginalRate: lad.marginalRate,
      bands: lad.bands,
      brackets: rows,
      explain: explain
    };
  }

  return { compute: compute, deductions: deductions };
});
