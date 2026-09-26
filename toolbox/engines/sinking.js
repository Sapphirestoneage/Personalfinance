/* ==========================================================================
   toolbox/engines/sinking.js, the yearly bills, spread over the months (TB-011).
   --------------------------------------------------------------------------
   Car insurance twice a year, the tax bill, the holidays, tyres every three
   years: none of them is a surprise, and all of them arrive as one. Give
   each its amount, how often it comes and when it is next due. Out come
   the set-aside a month per item, the total a month, what the fund should
   already hold today (the part of each bill that has "accrued"), and the
   twelve months ahead: what lands when, and whether the fund ever runs short.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../../shared/money.js') : root.SLAF && root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.Sinking = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function monthIndex(iso) { var d = new Date(iso + 'T12:00:00Z'); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
  function monthsBetween(fromIso, toIso) {
    var a = new Date(fromIso + 'T12:00:00Z'), b = new Date(toIso + 'T12:00:00Z');
    return (b.getTime() - a.getTime()) / (86400000 * 30.4375);
  }

  function plan(items, todayIso) {
    var today = todayIso || new Date().toISOString().slice(0, 10);
    var good = (items || []).filter(function (it) { return it && Money.isEntered(it.amountCents) && it.amountCents > 0 && Money.isEntered(it.everyMonths) && it.everyMonths > 0 && it.nextDue; });
    if (!good.length) return Money.incomplete('Add at least one bill: what it costs, how often it comes, and when it is next due.', ['items']);

    var t0 = monthIndex(today);
    var landing = [];
    for (var i = 0; i < 12; i++) landing.push({ index: i, label: MONTHS[(t0 + i) % 12], cents: 0, items: [] });

    var out = good.map(function (it) {
      var monthly = Math.ceil(it.amountCents / it.everyMonths);
      var until = Math.max(0, monthsBetween(today, it.nextDue));
      var accrued = Math.max(0, Math.min(1, 1 - until / it.everyMonths));
      var hold = Math.round(it.amountCents * accrued);
      var dues = [];
      var di = monthIndex(it.nextDue);
      while (di < t0 + 12) {
        if (di >= t0) { dues.push(di - t0); landing[di - t0].cents += it.amountCents; landing[di - t0].items.push(it.name || 'a bill'); }
        di += it.everyMonths;
      }
      return {
        name: it.name || 'a bill', amountCents: it.amountCents, everyMonths: it.everyMonths, nextDue: it.nextDue,
        monthlyCents: monthly, shouldHoldCents: hold, monthsUntilDue: until, dueInWindow: dues,
        yearlyCents: Math.round(it.amountCents * 12 / it.everyMonths)
      };
    });

    var totalMonthly = out.reduce(function (t, x) { return t + x.monthlyCents; }, 0);
    var holdNow = out.reduce(function (t, x) { return t + x.shouldHoldCents; }, 0);
    var yearly = out.reduce(function (t, x) { return t + x.yearlyCents; }, 0);
    var balance = holdNow, path = [{ index: 0, label: 'now', cents: balance }], low = balance, lowAt = null;
    landing.forEach(function (m) {
      balance = balance + totalMonthly - m.cents;
      m.balanceAfterCents = balance;
      path.push({ index: m.index + 1, label: m.label, cents: balance });
      if (balance < low) { low = balance; lowAt = m.label; }
    });
    return Money.ok(totalMonthly, {
      items: out, landing: landing, path: path, holdNowCents: holdNow, yearlyCents: yearly,
      lowestCents: low, lowestIn: lowAt, shortfallCents: low < 0 ? -low : 0,
      biggestMonth: landing.slice().sort(function (a, b) { return b.cents - a.cents; })[0]
    });
  }

  return { plan: plan, MONTHS: MONTHS };
});
