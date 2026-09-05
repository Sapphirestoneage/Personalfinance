/* ==========================================================================
   engines/vpw.js — variable percentage withdrawal, year by year. D-088.
   --------------------------------------------------------------------------
     percentageAt(table, age, stockShare)   the VPW share at an age
     plan(opts)                              the retirement, run to the plan
                                             age: withdrawal each year, the
                                             portfolio after, whether the
                                             withdrawal covered the spend

   opts: { portfolioCents, retireAge, planAge?, stockShare, realReturn,
           annualSpendCents, spendDeclineAfterAge?, spendDeclinePerYear?,
           otherIncomeCents(age) — a function, e.g. Social Security from a
           claim age; table }

   One loop, one year at a time: withdraw the VPW share of the portfolio at
   the start of the year, grow the rest at the real return. Success is every
   year's withdrawal plus other income covering the (declining) spend.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.VPW = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  function column(table, stockShare) {
    var cols = Object.keys(table.columns);
    var best = cols[0], gap = Infinity;
    cols.forEach(function (c) { var g = Math.abs(table.columns[c] - stockShare); if (g < gap) { gap = g; best = c; } });
    return best;
  }

  /** The withdrawal share at an age, interpolated between the ages listed. */
  function percentageAt(table, age, stockShare) {
    var col = column(table, Money.isEntered(stockShare) ? stockShare : 0.6);
    var ages = Object.keys(table.percentages).map(Number).sort(function (a, b) { return a - b; });
    if (age <= ages[0]) return table.percentages[ages[0]][col];
    if (age >= ages[ages.length - 1]) return table.percentages[ages[ages.length - 1]][col];
    for (var i = 1; i < ages.length; i++) {
      if (age <= ages[i]) {
        var lo = ages[i - 1], hi = ages[i];
        var a = table.percentages[lo][col], b = table.percentages[hi][col];
        return a + (b - a) * (age - lo) / (hi - lo);
      }
    }
    return table.percentages[ages[ages.length - 1]][col];
  }

  function plan(opts) {
    var o = opts || {};
    var table = o.table;
    if (!table) return Money.incomplete('The VPW table is not loaded.', ['vpwTable']);
    var missing = Money.missingFrom({ portfolioCents: o.portfolioCents, retireAge: o.retireAge, realReturn: o.realReturn, annualSpendCents: o.annualSpendCents });
    if (missing.length) return Money.incomplete('Needs a portfolio, an age, a return and a spend.', missing);
    var planAge = Money.isEntered(o.planAge) ? o.planAge : table.planAge;
    var declineAfter = Money.isEntered(o.spendDeclineAfterAge) ? o.spendDeclineAfterAge : table.spendDeclineAfterAge;
    var decline = Money.isEntered(o.spendDeclinePerYear) ? o.spendDeclinePerYear : table.spendDeclinePerYear;
    var other = typeof o.otherIncomeCents === 'function' ? o.otherIncomeCents : function () { return 0; };
    var portfolio = o.portfolioCents, years = [], success = true, firstShortAge = null, peak = { age: o.retireAge, cents: o.portfolioCents };
    for (var age = o.retireAge; age <= planAge; age++) {
      var pct = percentageAt(table, age, o.stockShare);
      var withdrawal = Math.round(portfolio * pct);
      var yearsPast = Math.max(0, age - declineAfter);
      var need = Math.round(o.annualSpendCents * Math.pow(1 - decline, yearsPast));
      var income = other(age) || 0;
      var covered = withdrawal + income >= need;
      if (!covered && success) { success = false; firstShortAge = age; }
      var after = Math.round((portfolio - withdrawal) * (1 + o.realReturn));
      years.push({ age: age, percentage: pct, withdrawalCents: withdrawal, otherIncomeCents: income, needCents: need, covered: covered, portfolioAfterCents: after });
      if (after > peak.cents) peak = { age: age + 1, cents: after };
      portfolio = after;
    }
    return Money.ok(success ? 1 : 0, {
      success: success,
      firstShortAge: firstShortAge,
      years: years,
      firstWithdrawalCents: years.length ? years[0].withdrawalCents : 0,
      dieWithCents: portfolio,
      peakAge: peak.age,
      peakCents: peak.cents,
      planAge: planAge,
      referenceVersion: table.version
    });
  }

  return { percentageAt: percentageAt, plan: plan };
});
