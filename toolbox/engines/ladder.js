/* ==========================================================================
   toolbox/engines/ladder.js, a ladder of CDs or Treasury bills against one
   savings account (TB-008).
   --------------------------------------------------------------------------
   Cash you will not need for a while, split across rungs that mature at
   different months. Each rung: its amount, the day it matures, the interest
   it pays by then. The whole: the blended rate, the dollars a year against
   leaving it all in the savings account, and when the first rung unlocks.
   Treasuries are exempt from state income tax; with a state rate given, each
   rung's tax-equivalent rate is what a taxable CD or savings account would
   have to pay to match it, and the comparison uses that.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../../shared/money.js') : root.SLAF && root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.Ladder = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  function addMonths(iso, months) {
    var d = new Date(iso + 'T12:00:00Z');
    var day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString().slice(0, 10);
  }

  function build(opts) {
    var o = opts || {};
    if (!Money.isEntered(o.cashCents)) return Money.incomplete('Add the cash you want to place.', ['cashCents']);
    if (o.cashCents <= 0) return Money.incomplete('The cash has to be more than zero.', ['cashCents']);
    var rungs = (o.rungs || []).filter(function (r) { return Money.isEntered(r.months) && r.months > 0 && Money.isEntered(r.rate); });
    if (!rungs.length) return Money.incomplete('Add at least one rung: a term in months and its rate.', ['rungs']);
    if (!Money.isEntered(o.hysaRate)) return Money.incomplete('Add the savings account rate to compare against.', ['hysaRate']);
    var treasury = !!o.treasury;
    var stateRate = treasury && Money.isEntered(o.stateRate) ? o.stateRate : 0;
    if (stateRate >= 1) return Money.incomplete('A state tax rate of 100% or more makes no sense here.', ['stateRate']);
    var start = o.startDate || new Date().toISOString().slice(0, 10);

    var weights = rungs.map(function (r) { return Money.isEntered(r.share) && r.share > 0 ? r.share : 1; });
    var wsum = weights.reduce(function (t, w) { return t + w; }, 0);
    var placed = 0, out = [];
    rungs.forEach(function (r, i) {
      var amount = i === rungs.length - 1 ? o.cashCents - placed : Math.round(o.cashCents * weights[i] / wsum);
      placed += amount;
      var tey = stateRate > 0 ? r.rate / (1 - stateRate) : r.rate;
      out.push({
        months: r.months, rate: r.rate, taxEquivalentRate: tey, amountCents: amount, share: amount / o.cashCents,
        maturesOn: addMonths(start, r.months),
        interestCents: Math.round(amount * r.rate * r.months / 12),
        hysaInterestCents: Math.round(amount * o.hysaRate * r.months / 12)
      });
    });
    out.sort(function (a, b) { return a.months - b.months; });

    var blended = out.reduce(function (t, r) { return t + r.share * r.rate; }, 0);
    var blendedTey = out.reduce(function (t, r) { return t + r.share * r.taxEquivalentRate; }, 0);
    var avgMonths = out.reduce(function (t, r) { return t + r.share * r.months; }, 0);
    var yearEdge = Math.round(o.cashCents * (blendedTey - o.hysaRate));

    return Money.ok(yearEdge, {
      rungs: out, blendedRate: blended, blendedTaxEquivalentRate: blendedTey, averageMonths: avgMonths,
      firstUnlockMonths: out[0].months, firstUnlockOn: out[0].maturesOn, lastUnlockOn: out[out.length - 1].maturesOn,
      hysaRate: o.hysaRate, treasury: treasury, stateRate: stateRate, startDate: start,
      ladderWins: yearEdge > 0,
      interestToMaturityCents: out.reduce(function (t, r) { return t + r.interestCents; }, 0),
      hysaToMaturityCents: out.reduce(function (t, r) { return t + r.hysaInterestCents; }, 0)
    });
  }

  return { build: build, addMonths: addMonths };
});
