/* ==========================================================================
   toolbox/engines/refinance.js, is a new loan worth its closing costs (TB-004).
   --------------------------------------------------------------------------
   Any loan: a mortgage, a car, a student loan. Three paths are costed to the
   last payment and the cheapest is named:
     old        keep paying what you pay now
     new        the new payment on the new term (closing costs paid up front,
                or rolled into the balance)
     samePay    take the new loan but keep paying the OLD amount, which is the
                only way a longer term does not cost more in the end
   The break-even is the month the monthly saving has repaid the closing
   costs. A lower payment on a longer term is the trap this tool exists to
   show: the payment falls and the lifetime cost rises.
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
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.Refinance = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Projection, Loan) {
  'use strict';

  function compare(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ balanceCents: o.balanceCents, currentRate: o.currentRate, newRate: o.newRate, newMonths: o.newMonths });
    if (!Money.isEntered(o.monthsLeft) && !Money.isEntered(o.currentPaymentCents)) missing.push('monthsLeft');
    if (missing.length) return Money.incomplete('Add the balance, both rates, and the months left or the payment you make now.', missing);
    if (o.balanceCents <= 0) return Money.incomplete('The balance has to be more than zero.', ['balanceCents']);
    if (o.newMonths <= 0) return Money.incomplete('The new term needs at least a month.', ['newMonths']);

    var closing = Money.isEntered(o.closingCents) ? o.closingCents : 0;
    var rollIn = !!o.rollIn;

    var oldPayment;
    if (Money.isEntered(o.currentPaymentCents)) oldPayment = o.currentPaymentCents;
    else {
      var lp = Projection.levelPaymentCents({ principalCents: o.balanceCents, annualRate: o.currentRate, months: o.monthsLeft });
      if (!Money.isOk(lp)) return lp;
      oldPayment = lp.value;
    }
    var oldSim = Loan.simulate({ principalCents: o.balanceCents, annualRate: o.currentRate, paymentCents: oldPayment });
    if (!Money.isOk(oldSim)) return oldSim;
    if (oldSim.never) return Money.incomplete('The payment you make now does not cover the interest, so the old loan never clears. Check the payment and the rate.', ['currentPaymentCents']);

    var newPrincipal = o.balanceCents + (rollIn ? closing : 0);
    var np = Projection.levelPaymentCents({ principalCents: newPrincipal, annualRate: o.newRate, months: o.newMonths });
    if (!Money.isOk(np)) return np;
    var newSim = Loan.simulate({ principalCents: newPrincipal, annualRate: o.newRate, paymentCents: np.value, upfrontCents: rollIn ? 0 : closing });

    var samePay = null;
    if (oldPayment > np.value) {
      var s = Loan.simulate({ principalCents: newPrincipal, annualRate: o.newRate, paymentCents: oldPayment, upfrontCents: rollIn ? 0 : closing });
      if (Money.isOk(s) && s.cleared) samePay = { key: 'samePay', paymentCents: oldPayment, months: s.value, totalPaidCents: s.totalPaidCents, interestCents: s.interestCents, balances: s.balances };
    }

    var monthlySaving = oldPayment - np.value;
    var breakEvenMonths = monthlySaving > 0 ? (closing > 0 ? closing / monthlySaving : 0) : null;

    var paths = [
      { key: 'old', paymentCents: oldPayment, months: oldSim.value, totalPaidCents: oldSim.totalPaidCents, interestCents: oldSim.interestCents, balances: oldSim.balances },
      { key: 'new', paymentCents: np.value, months: newSim.value, totalPaidCents: newSim.totalPaidCents, interestCents: newSim.interestCents + (rollIn ? 0 : closing), balances: newSim.balances }
    ];
    if (samePay) paths.push(samePay);
    var best = paths.slice().sort(function (a, b) { return a.totalPaidCents - b.totalPaidCents; })[0];

    return Money.ok(best.key, {
      byKey: paths.reduce(function (m, p) { m[p.key] = p; return m; }, {}),
      paths: paths,
      monthlySavingCents: monthlySaving,
      breakEvenMonths: breakEvenMonths,
      closingCents: closing, rollIn: rollIn,
      lifetimeDeltaCents: newSim.totalPaidCents - oldSim.totalPaidCents,      /* negative: the new loan is cheaper */
      samePayDeltaCents: samePay ? samePay.totalPaidCents - oldSim.totalPaidCents : null,
      longerTerm: o.newMonths > oldSim.value,
      paymentFallsCostRises: monthlySaving > 0 && newSim.totalPaidCents > oldSim.totalPaidCents
    });
  }

  return { compare: compare };
});
