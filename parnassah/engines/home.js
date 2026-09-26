/* ==========================================================================
   parnassah/engines/home.js, a house within a walk of the shul. PN-008.
   --------------------------------------------------------------------------
   What the house costs a month (principal and interest, tax, insurance),
   what share of take-home that is on its own and together with tuition,
   and the price the guide would allow once tuition has had its share.

     Home.payment(loanCents, annualRate, years)       -> monthly cents
     Home.carry(h, T, opts) -> Result
       opts.tuitionAnnualCents: this year's tuition (from the tuition engine)
       value: { priceCents, downCents, loanCents, piMonthlyCents, taxMonthlyCents, insuranceMonthlyCents,
                totalMonthlyCents, takeHomeMonthlyCents, share, withTuitionShare, tuitionMonthlyCents,
                verdict, maxPriceCents, deltaMonthlyCents, source }
   The verdict bands come from data/communities_2026.json, not from here.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Home = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var ok = Money.ok, incomplete = Money.incomplete, entered = Money.isEntered;

  function payment(loanCents, annualRate, years) {
    var n = years * 12, r = annualRate / 12;
    if (r === 0) return Math.round(loanCents / n);
    return Math.round(loanCents * r / (1 - Math.pow(1 + r, -n)));
  }
  function community(h, T) { for (var i = 0; i < T.communities.communities.length; i++) if (T.communities.communities[i].id === h.household.community) return T.communities.communities[i]; return null; }

  function carry(h, T, opts) {
    var o = opts || {};
    var M = T.communities.mortgage, G = T.communities.guide;
    var c = community(h, T);
    var price = entered(h.home.priceCents) ? h.home.priceCents : (c && entered(c.homeDollars) ? c.homeDollars * 100 : null);
    var source = entered(h.home.priceCents) ? 'typed' : (c && entered(c.homeDollars) ? 'community' : null);
    if (!entered(price)) return incomplete('Type the price of the house, or pick a community to start from its typical price.', ['home.priceCents']);
    var down = entered(h.home.downShare) ? h.home.downShare : M.downShare;
    var rate = entered(h.home.ratePercent) ? h.home.ratePercent : M.ratePercent / 100;
    var years = entered(h.home.years) ? h.home.years : M.years;
    var taxRate = entered(h.home.taxRate) ? h.home.taxRate : (c && entered(c.taxRate) ? c.taxRate : null);
    if (!entered(taxRate)) return incomplete('Type the property tax rate; it differs town by town.', ['home.taxRate']);
    var insRate = entered(h.home.insuranceRate) ? h.home.insuranceRate : M.insuranceRate;
    var downCents = Math.round(price * down), loan = price - downCents;
    var pi = payment(loan, rate, years), tax = Math.round(price * taxRate / 12), ins = Math.round(price * insRate / 12);
    var total = pi + tax + ins;
    var take = h.household.takeHomeMonthlyCents;
    var tuitionMonthly = entered(o.tuitionAnnualCents) ? Math.round(o.tuitionAnnualCents / 12) : null;
    var share = entered(take) && take > 0 ? total / take : null;
    var withTuition = share !== null && tuitionMonthly !== null ? (total + tuitionMonthly) / take : null;
    var verdict = null;
    if (withTuition !== null) verdict = withTuition <= G.housingAndTuitionShareOfTakeHome ? 'fits' : withTuition <= G.housingAndTuitionShareOfTakeHome + 0.1 ? 'tight' : 'over';
    else if (share !== null) verdict = share <= G.housingShareOfTakeHome ? 'fits' : share <= G.housingShareOfTakeHome + 0.08 ? 'tight' : 'over';
    var maxPrice = null;
    if (entered(take) && take > 0) {
      var budget = Math.round(take * G.housingAndTuitionShareOfTakeHome) - (tuitionMonthly !== null ? tuitionMonthly : 0);
      var perDollar = (1 - down) * (payment(1e8, rate, years) / 1e8) + (taxRate + insRate) / 12;
      maxPrice = budget > 0 ? Math.round(budget / perDollar) : 0;
    }
    var current = h.home.currentHousingMonthlyCents;
    return ok({ priceCents: price, downCents: downCents, loanCents: loan, piMonthlyCents: pi, taxMonthlyCents: tax, insuranceMonthlyCents: ins, totalMonthlyCents: total,
      takeHomeMonthlyCents: entered(take) ? take : null, share: share, withTuitionShare: withTuition, tuitionMonthlyCents: tuitionMonthly, verdict: verdict, maxPriceCents: maxPrice,
      deltaMonthlyCents: entered(current) ? total - current : null, source: source, community: c, rate: rate, years: years, downShare: down, taxRate: taxRate, insuranceRate: insRate });
  }
  return { payment: payment, carry: carry, community: community };
});
