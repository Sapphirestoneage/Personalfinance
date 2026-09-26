/* ==========================================================================
   kehillah/engines/tzedakah.js, the giving plan. KD-003.
   --------------------------------------------------------------------------
     Tzedakah.read(table, plan, today)
       plan: { incomeCents, base, rate, gifts: [{ cents, level, cause, date }] }
       -> {
            targetCents: ok | incomplete     income * rate
            givenCents                       the sum of every gift with a number
            gapCents | null                  target - given, never below 0
            share | null                     given / target, clamped
            monthlyCents | null              what is left / months left in the Jewish year
            monthsLeft                       to the year's end
            byCause: [{ id, label, cents, count }]
            ladder: { level: count }         how many gifts at each rung
            highestLevel | null              the best rung reached (1 is best)
          }
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../shared/money.js') : root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tzedakah = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  function target(incomeCents, rate) {
    var missing = Money.missingFrom({ incomeCents: incomeCents, rate: rate });
    if (missing.length) return Money.incomplete('needs your income and a rate', missing);
    if (incomeCents < 0 || rate < 0) return Money.incomplete('a negative amount', []);
    return Money.ok(Math.round(incomeCents * rate));
  }
  function monthsLeft(yearEndIso, today) {
    var end = new Date(yearEndIso + 'T12:00:00Z'), now = today ? new Date(today) : new Date();
    var m = (end.getUTCFullYear() - now.getUTCFullYear()) * 12 + (end.getUTCMonth() - now.getUTCMonth());
    return Math.max(1, m);
  }
  function read(table, plan, today, yearEndIso) {
    plan = plan || {};
    var gifts = (plan.gifts || []).filter(function (g) { return g && Money.isEntered(g.cents); });
    var t = target(plan.incomeCents, plan.rate);
    var given = gifts.reduce(function (s, g) { return s + g.cents; }, 0);
    var gap = Money.isOk(t) ? Math.max(0, t.value - given) : null;
    var share = Money.isOk(t) ? (t.value > 0 ? Math.min(1, given / t.value) : 1) : null;
    var left = monthsLeft(yearEndIso || '2027-10-01', today);
    var byCause = table.causes.map(function (c) {
      var mine = gifts.filter(function (g) { return g.cause === c.id; });
      return { id: c.id, label: c.label, cents: mine.reduce(function (s, g) { return s + g.cents; }, 0), count: mine.length };
    }).filter(function (c) { return c.count > 0; });
    var ladder = {}; var best = null;
    gifts.forEach(function (g) { if (Money.isEntered(g.level)) { ladder[g.level] = ladder[g.level] === undefined ? 1 : ladder[g.level] + 1; if (best === null || g.level < best) best = g.level; } });
    return { targetCents: t, givenCents: given, gapCents: gap, share: share, monthsLeft: left,
      monthlyCents: gap === null ? null : Math.ceil(gap / left), byCause: byCause, ladder: ladder, highestLevel: best, count: gifts.length };
  }
  return { read: read, target: target, monthsLeft: monthsLeft };
});
