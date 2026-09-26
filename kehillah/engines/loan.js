/* ==========================================================================
   kehillah/engines/loan.js, a gemach beside a card and a bank loan. KD-003.
   --------------------------------------------------------------------------
     Loan.payment(principalCents, apr, months) -> ok(monthlyCents) | incomplete
         the ordinary amortized payment; apr 0 is principal / months.
     Loan.compare({ amountCents, termMonths, cardApr, loanApr })
       -> {
            gemach: { monthlyCents, totalCents, interestCents } (apr 0)
            card, loan: the same at their rates, or null where the rate is blank
            savedVsCardCents, savedVsLoanCents        what the gemach saves
          }
     Loan.waitOrBorrow({ amountCents, monthlyCents }) -> months to save it first
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../shared/money.js') : root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Loan = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  function payment(principalCents, apr, months) {
    var missing = Money.missingFrom({ principalCents: principalCents, apr: apr, months: months });
    if (missing.length) return Money.incomplete('needs the amount, the rate and the months', missing);
    if (principalCents < 0 || apr < 0 || months <= 0) return Money.incomplete('a negative amount, a negative rate, or no months', []);
    if (apr === 0) return Money.ok(Math.ceil(principalCents / months));
    var r = apr / 12;
    var p = principalCents * r / (1 - Math.pow(1 + r, -months));
    return Money.ok(Math.round(p));
  }
  function line(principalCents, apr, months) {
    var p = payment(principalCents, apr, months);
    if (!Money.isOk(p)) return null;
    /* At no interest the total is the principal: the last payment is
       smaller, not the sum of twelve rounded-up ones. */
    var total = apr === 0 ? principalCents : p.value * months;
    return { monthlyCents: p.value, totalCents: total, interestCents: Math.max(0, total - principalCents), apr: apr };
  }
  function compare(o) {
    o = o || {};
    var missing = Money.missingFrom({ amountCents: o.amountCents, termMonths: o.termMonths });
    if (missing.length) return { status: 'incomplete', reason: 'needs the amount and the months', missing: missing, gemach: null, card: null, loan: null };
    var g = line(o.amountCents, 0, o.termMonths);
    var c = Money.isEntered(o.cardApr) ? line(o.amountCents, o.cardApr, o.termMonths) : null;
    var l = Money.isEntered(o.loanApr) ? line(o.amountCents, o.loanApr, o.termMonths) : null;
    return { status: 'ok', gemach: g, card: c, loan: l, savedVsCardCents: c ? c.interestCents : null, savedVsLoanCents: l ? l.interestCents : null };
  }
  function waitOrBorrow(o) {
    o = o || {};
    var missing = Money.missingFrom({ amountCents: o.amountCents, monthlyCents: o.monthlyCents });
    if (missing.length) return Money.incomplete('needs the amount and what you could put aside each month', missing);
    if (o.monthlyCents <= 0) return Money.incomplete('nothing put aside each month', ['monthlyCents']);
    return Money.ok(Math.ceil(o.amountCents / o.monthlyCents));
  }
  return { payment: payment, compare: compare, waitOrBorrow: waitOrBorrow };
});
