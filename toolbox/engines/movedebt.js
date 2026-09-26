/* ==========================================================================
   toolbox/engines/movedebt.js, a balance transfer or a consolidation loan
   against staying put (TB-005).
   --------------------------------------------------------------------------
   One balance, one monthly payment you can make. Three places it could sit:
     stay       where it is, at today's APR
     transfer   a card with a promo rate for N months (a fee goes on top of the
                balance), then a higher rate for whatever is left
     loan       a fixed personal loan, its own payment, an origination fee
   Each is run to the last payment. The cost of a path is everything paid
   minus the balance itself: interest plus fees. The transfer path also says
   the payment that clears it inside the promo, which is the number that
   matters, and what is left when the promo ends if you pay less.
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
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.MoveDebt = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Projection, Loan) {
  'use strict';

  function compare(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ balanceCents: o.balanceCents, aprNow: o.aprNow, paymentCents: o.paymentCents });
    if (missing.length) return Money.incomplete('Add the balance, its APR and what you can pay a month.', missing);
    if (o.balanceCents <= 0) return Money.incomplete('The balance has to be more than zero.', ['balanceCents']);

    var options = [];
    var stay = Loan.simulate({ principalCents: o.balanceCents, annualRate: o.aprNow, paymentCents: o.paymentCents });
    if (!Money.isOk(stay)) return stay;
    options.push(pathOf('stay', stay, o.balanceCents, o.paymentCents, 0));

    var t = o.transfer || {};
    var transfer = null;
    if (Money.isEntered(t.promoMonths) && Money.isEntered(t.aprAfter)) {
      var feeRate = Money.isEntered(t.feeRate) ? t.feeRate : 0;
      var promoApr = Money.isEntered(t.promoApr) ? t.promoApr : 0;
      var principal = Math.round(o.balanceCents * (1 + feeRate));
      var fee = principal - o.balanceCents;
      var sim = Loan.simulate({ principalCents: principal, rateForMonth: function (m) { return m <= t.promoMonths ? promoApr : t.aprAfter; }, paymentCents: o.paymentCents });
      if (Money.isOk(sim)) {
        transfer = pathOf('transfer', sim, o.balanceCents, o.paymentCents, fee);
        transfer.feeCents = fee;
        transfer.promoMonths = t.promoMonths;
        transfer.toClearInPromoCents = Math.ceil(principal / t.promoMonths);
        transfer.leftAtPromoEndCents = sim.balances && sim.balances.length > t.promoMonths ? sim.balances[t.promoMonths] : 0;
        transfer.clearsInPromo = transfer.leftAtPromoEndCents === 0;
        options.push(transfer);
      }
    }

    var l = o.loan || {};
    var loan = null;
    if (Money.isEntered(l.apr) && Money.isEntered(l.months) && l.months > 0) {
      var lfee = Math.round(o.balanceCents * (Money.isEntered(l.feeRate) ? l.feeRate : 0));
      var lp = Projection.levelPaymentCents({ principalCents: o.balanceCents + lfee, annualRate: l.apr, months: l.months });
      if (Money.isOk(lp)) {
        var lsim = Loan.simulate({ principalCents: o.balanceCents + lfee, annualRate: l.apr, paymentCents: lp.value });
        loan = pathOf('loan', lsim, o.balanceCents, lp.value, lfee);
        loan.feeCents = lfee;
        loan.overBudget = lp.value > o.paymentCents;
        loan.budgetGapCents = lp.value - o.paymentCents;
        options.push(loan);
      }
    }

    var cleared = options.filter(function (p) { return p.cleared; });
    var best = cleared.length ? cleared.slice().sort(function (a, b) { return a.costCents - b.costCents; })[0] : null;
    var byKey = options.reduce(function (m, p) { m[p.key] = p; return m; }, {});
    return Money.ok(best ? best.key : null, {
      byKey: byKey, options: options,
      stayNever: !!stay.never,
      savesVsStayCents: best && byKey.stay.cleared ? byKey.stay.costCents - best.costCents : null
    });
  }

  function pathOf(key, sim, balanceCents, paymentCents, feeCents) {
    return {
      key: key, cleared: !!sim.cleared, never: !!sim.never,
      months: sim.value, paymentCents: paymentCents,
      totalPaidCents: sim.totalPaidCents,
      interestCents: sim.interestCents,
      costCents: sim.cleared ? sim.totalPaidCents - balanceCents : null,   /* interest plus fees */
      feeCents: feeCents, balances: sim.balances
    };
  }

  return { compare: compare };
});
