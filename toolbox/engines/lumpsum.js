/* ==========================================================================
   toolbox/engines/lumpsum.js, a lump sum today or a payment for life (TB-007).
   --------------------------------------------------------------------------
   A pension buyout, a severance, a settlement, a prize: one amount now, or so
   much a month from some age until you die. Two readings, both honest:
     impliedRate   the return the payments are quietly promising: the rate at
                   which the lump sum, invested today, would fund exactly
                   those payments to the age you name. Higher than what you
                   would get on your own and the payments are the better deal.
     runsOutAge    take the lump, invest it at YOUR rate, draw the same
                   payment from the start age. The age it hits zero. Live past
                   that age and the payments would have paid more.
   Payments can carry a yearly cost-of-living rise. Nothing here knows how
   long you will live; the age you name is the whole of that assumption.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../../shared/money.js') : root.SLAF && root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.LumpSum = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var DEFAULT_TO_AGE = 90;

  function paymentIn(monthlyCents, k, cola) { return monthlyCents * Math.pow(1 + cola, Math.floor(k / 12)); }

  function presentValue(monthlyCents, monthsUntilStart, monthsPaying, cola, annualRate) {
    var r = annualRate / 12, pv = 0;
    for (var k = 0; k < monthsPaying; k++) pv += paymentIn(monthlyCents, k, cola) / Math.pow(1 + r, monthsUntilStart + k);
    return pv;
  }

  function compare(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ lumpCents: o.lumpCents, monthlyCents: o.monthlyCents, ageNow: o.ageNow, returnRate: o.returnRate });
    if (missing.length) return Money.incomplete('Add the lump sum, the monthly payment, your age and the return you expect.', missing);
    if (o.lumpCents <= 0 || o.monthlyCents <= 0) return Money.incomplete('Both amounts have to be more than zero.', ['lumpCents', 'monthlyCents']);
    var startAge = Money.isEntered(o.startAge) ? o.startAge : o.ageNow;
    var toAge = Money.isEntered(o.toAge) ? o.toAge : DEFAULT_TO_AGE;
    if (startAge < o.ageNow) return Money.incomplete('The payments cannot start before today.', ['startAge']);
    if (toAge <= startAge) return Money.incomplete('The age to plan to has to be after the payments start.', ['toAge']);
    var cola = Money.isEntered(o.colaRate) ? o.colaRate : 0;

    var monthsUntilStart = Math.round((startAge - o.ageNow) * 12);
    var monthsPaying = Math.round((toAge - startAge) * 12);

    /* The implied rate, by bisection on a monotone PV. */
    var pv0 = presentValue(o.monthlyCents, monthsUntilStart, monthsPaying, cola, 0);
    var implied = null, impliedBelowZero = false;
    if (pv0 < o.lumpCents) impliedBelowZero = true;
    else {
      var lo = 0, hi = 1;
      while (presentValue(o.monthlyCents, monthsUntilStart, monthsPaying, cola, hi) > o.lumpCents && hi < 10) hi *= 2;
      for (var i = 0; i < 80; i++) { var mid = (lo + hi) / 2; if (presentValue(o.monthlyCents, monthsUntilStart, monthsPaying, cola, mid) > o.lumpCents) lo = mid; else hi = mid; }
      implied = (lo + hi) / 2;
    }

    /* The lump, invested at your rate, drawn from the start age. */
    var r = o.returnRate / 12, balance = o.lumpCents, path = [{ age: o.ageNow, balanceCents: balance }], runsOutAge = null, drawn = 0;
    var total = monthsUntilStart + monthsPaying;
    for (var m = 1; m <= total; m++) {
      balance = balance * (1 + r);
      if (m > monthsUntilStart) { var pay = paymentIn(o.monthlyCents, m - monthsUntilStart - 1, cola); balance -= pay; drawn += pay; }
      if (balance <= 0 && runsOutAge === null) { runsOutAge = o.ageNow + m / 12; }
      if (m % 12 === 0 || m === total) path.push({ age: o.ageNow + m / 12, balanceCents: Math.round(Math.max(0, balance)) });
      if (balance <= 0) balance = 0;
    }
    var totalPayments = 0;
    for (var k = 0; k < monthsPaying; k++) totalPayments += paymentIn(o.monthlyCents, k, cola);

    var lumpWins = runsOutAge === null;
    return Money.ok(lumpWins ? 'lump' : 'payments', {
      impliedRate: implied, impliedBelowZero: impliedBelowZero,
      runsOutAge: runsOutAge, leftoverAtToAgeCents: lumpWins ? Math.round(balance) : 0,
      totalPaymentsCents: Math.round(totalPayments), toAge: toAge, startAge: startAge,
      monthsUntilStart: monthsUntilStart, monthsPaying: monthsPaying,
      yearsOfPaymentsToMatchLump: o.monthlyCents > 0 ? o.lumpCents / (o.monthlyCents * 12) : null,
      path: path,
      yourRateBeatsImplied: implied !== null ? o.returnRate > implied : true
    });
  }

  return { compare: compare, DEFAULT_TO_AGE: DEFAULT_TO_AGE, presentValue: presentValue };
});
