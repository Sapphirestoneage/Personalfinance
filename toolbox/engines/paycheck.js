/* ==========================================================================
   toolbox/engines/paycheck.js, is the withholding on this paystub right (TB-013).
   --------------------------------------------------------------------------
   One paystub, read as a year. The gross per check times the checks in a
   year is the wage; pre-tax deductions come off before federal tax (and the
   section 125 ones, health premiums, HSA, FSA, off before payroll tax too).
   The federal tax the year owes is the SPARKS tax engine's figure on those
   wages (engines/tax.js, one formula); the tax the year will have withheld
   is this check's withholding times the checks. The gap is April: a refund
   if too much came out, a bill if too little, and the change per remaining
   check that lands it near zero. Payroll tax is checked the same way.
   Federal and, where a schedule exists, state. An estimate, not a return.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../../shared/money.js'), Tax: require('../../engines/tax.js') };
  } else {
    deps = { Money: root.SLAF.Money, Tax: root.SLAF.Tax };
  }
  var api = factory(deps.Money, deps.Tax);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.Paycheck = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Tax) {
  'use strict';

  var PERIODS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

  function check(opts, tables) {
    var o = opts || {}, t = tables || {};
    var missing = Money.missingFrom({ grossCents: o.grossCents, fedWithheldCents: o.fedWithheldCents });
    if (!o.frequency || !PERIODS[o.frequency]) missing.push('frequency');
    if (!o.filingStatus) missing.push('filingStatus');
    if (missing.length) return Money.incomplete('Add the gross pay, the federal tax withheld, how often you are paid and your filing status.', missing);
    if (!t.federalBrackets) return Money.incomplete('The federal bracket table is not loaded.', ['federalBrackets']);

    var n = PERIODS[o.frequency];
    var pretax = Money.isEntered(o.pretaxCents) ? o.pretaxCents : 0;
    var s125 = Money.isEntered(o.section125Cents) ? o.section125Cents : 0;
    var other = Money.isEntered(o.otherIncomeCents) ? o.otherIncomeCents : 0;
    var stateWithheld = Money.isEntered(o.stateWithheldCents) ? o.stateWithheldCents : null;

    var annualGross = o.grossCents * n;
    var ficaWages = (o.grossCents - s125) * n;
    var fedWages = (o.grossCents - pretax - s125) * n;
    if (fedWages < 0) return Money.incomplete('The deductions are more than the gross pay. Check the boxes.', ['pretaxCents']);

    var fed = Tax.ordinaryTax(t.federalBrackets, fedWages + other, o.filingStatus, {});
    if (!Money.isOk(fed)) return fed;
    var withheld = o.fedWithheldCents * n;
    var gap = fed.value - withheld;                       /* positive: you will owe */
    var soFar = Money.isEntered(o.checksSoFar) ? Math.max(0, Math.min(n, o.checksSoFar)) : 0;
    var left = n - soFar;

    var fica = t.seTax ? Tax.fica(t.seTax, ficaWages, o.filingStatus) : null;
    var ficaPerCheck = fica && Money.isOk(fica) ? Math.round(fica.value / n) : null;
    var ficaGapPerCheck = ficaPerCheck !== null && Money.isEntered(o.ficaWithheldCents) ? o.ficaWithheldCents - ficaPerCheck : null;

    var state = null;
    if (o.state && t.stateBrackets) {
      var st = Tax.stateTax(t.stateBrackets, o.state, fed.taxableIncomeCents, o.filingStatus);
      if (Money.isOk(st)) {
        state = { taxCents: st.value, marginalRate: st.marginalRate, withheldCents: stateWithheld === null ? null : stateWithheld * n };
        state.gapCents = stateWithheld === null ? null : st.value - state.withheldCents;
        state.perCheckAdjustCents = state.gapCents === null || left === 0 ? null : Math.round(state.gapCents / left);
      } else state = { unavailable: true, reason: st.reason };
    }

    var takeHome = o.grossCents - pretax - s125 - o.fedWithheldCents - (stateWithheld || 0) - (Money.isEntered(o.ficaWithheldCents) ? o.ficaWithheldCents : (ficaPerCheck || 0));
    return Money.ok(gap, {
      checksPerYear: n, checksLeft: left,
      annualGrossCents: annualGross, federalWagesCents: fedWages, ficaWagesCents: ficaWages,
      taxableIncomeCents: fed.taxableIncomeCents, marginalRate: fed.marginalRate,
      federalTaxCents: fed.value, federalWithheldCents: withheld, gapCents: gap,
      perCheckAdjustCents: left > 0 ? Math.round(gap / left) : null,
      refund: gap < 0, owes: gap > 0,
      bigRefund: gap < 0 && -gap > Math.max(100000, annualGross * 0.03),
      underpaid: gap > 0 && gap > Math.max(100000, fed.value * 0.10),
      ficaPerCheckCents: ficaPerCheck, ficaGapPerCheckCents: ficaGapPerCheck, ficaAnnualCents: fica && Money.isOk(fica) ? fica.value : null,
      state: state,
      takeHomePerCheckCents: takeHome,
      effectiveFederalRate: annualGross > 0 ? fed.value / annualGross : null
    });
  }

  return { check: check, PERIODS: PERIODS };
});
