/* ==========================================================================
   parnassah/engines/tzedakah.js, maaser: owed, given, and what is left. PN-006.
   --------------------------------------------------------------------------
   The arithmetic under each common approach, never the ruling. The base is
   gross income or income after tax; the share is a tenth, a fifth, or the
   family's own. What was given is a list, each gift with a kind, so the
   picture shows where the giving went.

     Tzedakah.owed(h, T, opts) -> Result
       value: { baseId, baseCents, rate, owedCents, givenCents, remainingCents,
                monthsLeft, paceMonthlyCents, byKind: [{ id, label, cents, share }], gifts }
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tzedakah = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var ok = Money.ok, incomplete = Money.incomplete, entered = Money.isEntered;

  function rate(h, T) {
    var r = null;
    T.tzedakah.rates.forEach(function (x) { if (x.id === h.tzedakah.rateId) r = x; });
    if (!r) return null;
    if (r.id === 'custom') return entered(h.tzedakah.customRate) ? h.tzedakah.customRate : null;
    return r.rate;
  }

  /* Months until the year rolls over at yearStart (Elul), counting the current month. */
  function monthsLeft(today, T) {
    var d = today ? new Date(today) : new Date();
    var startMonth = Number(T.year.yearStart.split('-')[1]);
    var m = d.getMonth() + 1;
    var left = (startMonth - m + 12) % 12;
    return left === 0 ? 12 : left;
  }

  function owed(h, T, opts) {
    var o = opts || {};
    var gross = h.household.grossAnnualCents;
    if (!entered(gross)) return incomplete('Type the household\'s gross income on the home page first.', ['household.grossAnnualCents']);
    var base;
    if (h.tzedakah.baseId === 'gross') base = gross;
    else {
      if (!entered(h.tzedakah.taxAnnualCents)) return incomplete('Type the year\'s income tax to work from income after tax.', ['tzedakah.taxAnnualCents']);
      base = gross - h.tzedakah.taxAnnualCents;
    }
    var r = rate(h, T);
    if (r === null) return incomplete('Choose a share, or type your own.', ['tzedakah.customRate']);
    var owedCents = Math.round(base * r);
    var byKind = {}, given = 0;
    h.tzedakah.gifts.forEach(function (g) { if (!entered(g.cents)) return; given += g.cents; byKind[g.kind] = (byKind[g.kind] || 0) + g.cents; });
    var kinds = T.tzedakah.kinds.filter(function (k) { return byKind[k.id] !== undefined; }).map(function (k) { return { id: k.id, label: k.label, cents: byKind[k.id], share: given > 0 ? byKind[k.id] / given : 0 }; });
    var left = monthsLeft(o.today, T);
    var remaining = owedCents - given;
    return ok({ baseId: h.tzedakah.baseId, baseCents: base, rate: r, owedCents: owedCents, givenCents: given, remainingCents: remaining, monthsLeft: left,
      paceMonthlyCents: remaining > 0 ? Math.round(remaining / left) : 0, byKind: kinds, gifts: h.tzedakah.gifts.filter(function (g) { return entered(g.cents); }), shareGiven: owedCents > 0 ? given / owedCents : null });
  }
  return { owed: owed, rate: rate, monthsLeft: monthsLeft };
});
