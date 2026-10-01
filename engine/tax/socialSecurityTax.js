/* ==========================================================================
   engine/tax/socialSecurityTax.js, how much of a Social Security benefit
   is taxed (IRC 86, the provisional income tiers). D-341.
   --------------------------------------------------------------------------
   provisional income = AGI without the benefit + tax-exempt interest
                        + half the benefit
   below the first threshold          nothing is taxed
   between the thresholds             up to half: the lesser of half the
                                      benefit and half the excess over
                                      the first threshold
   above the second threshold         up to 85%: the lesser of 85% of the
                                      benefit, and 85% of the excess over
                                      the second threshold plus the
                                      tier-one amount (capped at half the
                                      gap between the thresholds)
   The thresholds are fixed by statute and never indexed.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.SocialSecurityTax = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  /**
   * taxable({ benefitsCents, otherAgiCents, taxExemptInterestCents, filingStatus }, rules)
   *   rules is tax.federal.socialSecurityBenefitTaxation from data/tax/2026.json
   * Returns { taxableCents, provisionalIncomeCents, tier: 0|1|2, explain }.
   */
  function taxable(input, rules) {
    var ss = Math.max(0, input.benefitsCents || 0);
    var status = input.filingStatus || 'single';
    var t1 = Math.round((rules.firstThreshold[status] !== undefined ? rules.firstThreshold[status] : rules.firstThreshold.single) * 100);
    var t2 = Math.round((rules.secondThreshold[status] !== undefined ? rules.secondThreshold[status] : rules.secondThreshold.single) * 100);
    var provisional = (input.otherAgiCents || 0) + (input.taxExemptInterestCents || 0) + ss / 2;
    var out = { taxableCents: 0, provisionalIncomeCents: Math.round(provisional), tier: 0, explain: [] };
    if (!ss) return out;
    if (provisional <= t1) {
      out.explain.push('Provisional income is under the first threshold, so none of the benefit is taxed.');
      return out;
    }
    var tierOne = Math.min(ss * rules.firstTierShare, (Math.min(provisional, t2) - t1) * rules.firstTierShare);
    if (provisional <= t2) {
      out.taxableCents = Math.round(tierOne);
      out.tier = 1;
      out.explain.push('Provisional income is between the thresholds, so up to half the benefit is taxed.');
      return out;
    }
    var tierTwo = Math.min(ss * rules.secondTierShare, (provisional - t2) * rules.secondTierShare + tierOne);
    out.taxableCents = Math.round(tierTwo);
    out.tier = 2;
    out.explain.push('Provisional income is over the second threshold, so up to 85% of the benefit is taxed.');
    return out;
  }

  return { taxable: taxable };
});
