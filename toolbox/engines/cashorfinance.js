/* ==========================================================================
   toolbox/engines/cashorfinance.js, pay it now or take the payments (TB-006).
   --------------------------------------------------------------------------
   You have the price in cash. Two things you could do with it:
     cash      pay now, take any discount for paying cash, and what is left
               sits in your savings account earning the parked rate
     finance   keep the cash where it is, earning; pay the fee up front and
               a payment a month for the term, out of that same account
   After the last payment, whichever account holds more won. At 0% APR with
   the cash earning anything, financing wins by the interest earned; with a
   cash discount on the table, paying now usually wins. Deferred-interest
   plans ("no interest if paid in full by...") get a flag: the back interest
   that lands if a single payment slips is computed and shown.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../../shared/money.js'), Projection: require('../../engines/projection.js'), Loan: require('./loan.js') };
  } else {
    deps = { Money: root.SLAF.Money, Projection: root.SLAF.Projection, Loan: root.SLAF.TB.Loan };
  }
  var api = factory(deps.Money, deps.Projection, deps.Loan);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.CashOrFinance = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Projection, Loan) {
  'use strict';

  function compare(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ priceCents: o.priceCents, months: o.months });
    if (missing.length) return Money.incomplete('Add the price and how many months the payments run.', missing);
    if (o.priceCents <= 0) return Money.incomplete('The price has to be more than zero.', ['priceCents']);
    if (o.months <= 0) return Money.incomplete('The payments need at least a month.', ['months']);

    var apr = Money.isEntered(o.apr) ? o.apr : 0;
    var park = Money.isEntered(o.parkRate) ? o.parkRate : 0;
    var discount = Money.isEntered(o.cashDiscountRate) ? o.cashDiscountRate : 0;
    var fee = Money.isEntered(o.feeCents) ? o.feeCents : 0;

    var cashPrice = Math.round(o.priceCents * (1 - discount));
    var lp = Projection.levelPaymentCents({ principalCents: o.priceCents, annualRate: apr, months: o.months });
    if (!Money.isOk(lp)) return lp;
    var payment = lp.value;

    /* The cash path: pay now, the change compounds monthly. */
    var cashEnd = Projection.futureValueMonthlyCents({ startCents: o.priceCents - cashPrice, monthlyContributionCents: 0, annualRate: park, months: o.months });
    if (!Money.isOk(cashEnd)) return cashEnd;

    /* The finance path: the account earns, the fee leaves at once, a payment leaves each month. */
    var acct = o.priceCents - fee, earned = 0, m;
    for (m = 1; m <= o.months; m++) {
      var i = Math.round(acct * park / 12);
      earned += i;
      acct += i - payment;
    }
    var financeEnd = acct;

    var edge = financeEnd - cashEnd.value;   /* positive: financing leaves you richer */
    var financeInterest = lp.totalInterestCents;
    var deferred = !!o.deferredInterest;
    var backInterest = null;
    if (deferred && Money.isEntered(o.deferredApr) && o.deferredApr > 0) {
      var sim = Loan.simulate({ principalCents: o.priceCents, annualRate: o.deferredApr, paymentCents: payment });
      backInterest = Money.isOk(sim) && sim.cleared ? sim.interestCents : Math.round(o.priceCents * o.deferredApr / 12 * o.months);
    }

    return Money.ok(edge >= 0 ? 'finance' : 'cash', {
      cashPriceCents: cashPrice, discountCents: o.priceCents - cashPrice,
      paymentCents: payment, totalPaymentsCents: lp.totalPaidCents + fee, financeInterestCents: financeInterest, feeCents: fee,
      earnedWhileWaitingCents: earned,
      cashEndCents: cashEnd.value, financeEndCents: financeEnd, edgeCents: edge,
      accountRunsDry: financeEnd < 0,
      deferred: deferred, backInterestCents: backInterest,
      breakEvenParkRate: breakEvenParkRate(o.priceCents, cashPrice, payment, fee, o.months)
    });
  }

  /* The parked rate at which the two paths tie: below it, pay cash. Bisection. */
  function breakEvenParkRate(priceCents, cashPriceCents, paymentCents, feeCents, months) {
    function edgeAt(r) {
      var cash = (priceCents - cashPriceCents) * Math.pow(1 + r / 12, months);
      var acct = priceCents - feeCents;
      for (var m = 1; m <= months; m++) acct = acct * (1 + r / 12) - paymentCents;
      return acct - cash;
    }
    var lo = 0, hi = 1;
    if (edgeAt(lo) >= 0) return 0;
    if (edgeAt(hi) < 0) return null;
    for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (edgeAt(mid) >= 0) hi = mid; else lo = mid; }
    return hi;
  }

  return { compare: compare };
});
