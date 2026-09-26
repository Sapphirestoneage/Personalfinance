/* ==========================================================================
   toolbox/engines/stayormove.js, the rent went up: stay, or move (TB-012).
   --------------------------------------------------------------------------
   A renewal letter, a rise, and a cheaper place across town. Moving is not
   free: the movers, a deposit tied up, an overlap month, days off, a longer
   or shorter commute. Over the term you would sign for, which costs less?
   And the number to take back to the landlord: the rent at which staying
   costs exactly what moving does, which is the most staying is worth.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../../shared/money.js') : root.SLAF && root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.StayOrMove = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var DEFAULT_TERM = 12;

  function compare(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ rentStayCents: o.rentStayCents, rentMoveCents: o.rentMoveCents });
    if (missing.length) return Money.incomplete('Add the rent if you stay and the rent at the new place.', missing);
    var term = Money.isEntered(o.termMonths) && o.termMonths > 0 ? o.termMonths : DEFAULT_TERM;
    var oneOff = Money.isEntered(o.oneOffCents) ? o.oneOffCents : 0;
    var commute = Money.isEntered(o.commuteDeltaCents) ? o.commuteDeltaCents : 0;
    var other = Money.isEntered(o.otherDeltaCents) ? o.otherDeltaCents : 0;

    var monthlyMove = o.rentMoveCents + commute + other;
    var monthlySaving = o.rentStayCents - monthlyMove;
    var breakEven = monthlySaving > 0 ? oneOff / monthlySaving : null;
    var totalStay = o.rentStayCents * term;
    var totalMove = monthlyMove * term + oneOff;
    var counter = Math.round(totalMove / term);

    var stayCum = [0], moveCum = [oneOff];
    for (var m = 1; m <= term; m++) { stayCum.push(o.rentStayCents * m); moveCum.push(oneOff + monthlyMove * m); }

    var increase = Money.isEntered(o.rentNowCents) && o.rentNowCents > 0 ? (o.rentStayCents - o.rentNowCents) / o.rentNowCents : null;
    return Money.ok(totalMove < totalStay ? 'move' : 'stay', {
      termMonths: term, monthlyMoveCents: monthlyMove, monthlySavingCents: monthlySaving,
      breakEvenMonths: breakEven, breakEvenInsideTerm: breakEven !== null && breakEven <= term,
      totalStayCents: totalStay, totalMoveCents: totalMove, deltaCents: totalStay - totalMove,   /* positive: moving saves */
      counterRentCents: counter, oneOffCents: oneOff, increaseRate: increase,
      increaseCents: Money.isEntered(o.rentNowCents) ? o.rentStayCents - o.rentNowCents : null,
      stayCum: stayCum, moveCum: moveCum
    });
  }

  return { compare: compare, DEFAULT_TERM: DEFAULT_TERM };
});
