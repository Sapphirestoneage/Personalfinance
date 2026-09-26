/* ==========================================================================
   kehillah/engines/timeline.js, the one savings timeline. KD-003.
   --------------------------------------------------------------------------
   Every page that saves toward a number (family building, care, the cushion,
   the papers) reads this function and no other. One formula, one function.

     Timeline.monthsTo({ targetCents, savedCents, monthlyCents, from })
       -> ok({ months, date, gapCents, share })  or  incomplete(reason, missing)
     share is saved / target, clamped to 1. months is 0 when saved covers it.
     `from` is an ISO date or a Date; the default is today.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../shared/money.js') : root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Timeline = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  function addMonths(d, n) { var x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function monthsTo(o) {
    o = o || {};
    var missing = Money.missingFrom({ targetCents: o.targetCents, savedCents: o.savedCents });
    if (missing.length) return Money.incomplete('needs the target and what is saved so far', missing);
    var target = o.targetCents, saved = o.savedCents;
    if (target < 0 || saved < 0) return Money.incomplete('a negative amount', []);
    var from = o.from ? new Date(o.from) : new Date();
    var gap = Math.max(0, target - saved);
    var share = target > 0 ? Math.min(1, saved / target) : 1;
    if (gap === 0) return Money.ok({ months: 0, date: iso(from), gapCents: 0, share: share, monthlyCents: Money.isEntered(o.monthlyCents) ? o.monthlyCents : null });
    if (!Money.isEntered(o.monthlyCents)) return Money.ok({ months: null, date: null, gapCents: gap, share: share, monthlyCents: null }, { partial: true, reason: 'says the gap; needs a monthly amount for a date' });
    if (o.monthlyCents <= 0) return Money.ok({ months: null, date: null, gapCents: gap, share: share, monthlyCents: o.monthlyCents }, { partial: true, reason: 'nothing set aside each month, so no date' });
    var months = Math.ceil(gap / o.monthlyCents);
    return Money.ok({ months: months, date: iso(addMonths(from, months)), gapCents: gap, share: share, monthlyCents: o.monthlyCents });
  }
  /** The monthly amount that lands on a date: gap / months, in cents, rounded up. */
  function monthlyFor(o) {
    o = o || {};
    var missing = Money.missingFrom({ targetCents: o.targetCents, savedCents: o.savedCents, months: o.months });
    if (missing.length) return Money.incomplete('needs the target, what is saved, and the months', missing);
    if (o.months <= 0) return Money.incomplete('needs at least one month', ['months']);
    var gap = Math.max(0, o.targetCents - o.savedCents);
    return Money.ok(Math.ceil(gap / o.months));
  }
  return { monthsTo: monthsTo, monthlyFor: monthlyFor, addMonths: addMonths };
});
