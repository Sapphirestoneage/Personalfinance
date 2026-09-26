/* ==========================================================================
   toolbox/engines/loan.js, the one amortization loop the Toolbox uses (TB-003).
   --------------------------------------------------------------------------
   Refinance, Move the Debt, Pay Cash or Finance and Borrow From Yourself all
   need "pay this much a month against this balance at this rate: when is it
   gone and what did it cost". That is one loop, written once. The payment
   itself comes from engines/projection.js levelPaymentCents; this never
   recomputes it.

   simulate({ principalCents, annualRate | rateForMonth(m), paymentCents,
              upfrontCents, maxMonths })
     -> ok(months, { cleared, never, totalPaidCents, interestCents,
                     balances[] (index 0 is the start), lastPaymentCents })
   Integer cents throughout; interest is rounded to the cent each month.
   A payment that does not cover the first month's interest never clears:
   the Result is still ok, with months null and never true, because "never"
   is an answer, not a missing input.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../../shared/money.js') : root.SLAF && root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.Loan = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var DEFAULT_MAX_MONTHS = 600;

  function simulate(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ principalCents: o.principalCents, paymentCents: o.paymentCents });
    if (!Money.isEntered(o.annualRate) && typeof o.rateForMonth !== 'function') missing.push('annualRate');
    if (missing.length) return Money.incomplete('Need a balance, a rate and a monthly payment.', missing);
    if (o.principalCents < 0) return Money.incomplete('A balance cannot be negative.', ['principalCents']);
    if (o.paymentCents <= 0 && o.principalCents > 0) return Money.incomplete('The payment has to be more than zero.', ['paymentCents']);

    var rateFor = typeof o.rateForMonth === 'function' ? o.rateForMonth : function () { return o.annualRate; };
    var cap = Money.isEntered(o.maxMonths) ? o.maxMonths : DEFAULT_MAX_MONTHS;
    var upfront = Money.isEntered(o.upfrontCents) ? o.upfrontCents : 0;
    var balance = o.principalCents, balances = [balance], paid = 0, interest = 0, months = 0, last = 0;

    if (balance === 0) return Money.ok(0, { cleared: true, never: false, totalPaidCents: upfront, interestCents: 0, balances: balances, lastPaymentCents: 0 });

    var firstInterest = Math.round(balance * rateFor(1) / 12);
    if (o.paymentCents <= firstInterest && rateFor(1) > 0) {
      return Money.ok(null, { cleared: false, never: true, totalPaidCents: null, interestCents: null, balances: balances, lastPaymentCents: null, firstInterestCents: firstInterest });
    }
    while (balance > 0 && months < cap) {
      months += 1;
      var i = Math.round(balance * rateFor(months) / 12);
      interest += i;
      var due = balance + i;
      var pay = Math.min(o.paymentCents, due);
      paid += pay;
      balance = due - pay;
      balances.push(balance);
      last = pay;
    }
    var cleared = balance <= 0;
    return Money.ok(cleared ? months : null, {
      cleared: cleared, never: false, totalPaidCents: paid + upfront, interestCents: interest,
      balances: balances, lastPaymentCents: last, balanceLeftCents: balance
    });
  }

  /* The balance still owed after `afterMonths` of a level schedule. */
  function balanceAfter(sim, afterMonths) {
    if (!Money.isOk(sim) || !sim.balances) return null;
    var i = Math.max(0, Math.min(sim.balances.length - 1, Math.round(afterMonths)));
    return sim.balances[i];
  }

  return { simulate: simulate, balanceAfter: balanceAfter, DEFAULT_MAX_MONTHS: DEFAULT_MAX_MONTHS };
});
