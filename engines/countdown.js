/* ==========================================================================
   engines/countdown.js — one countdown, many skins.
   DECISIONS.md D-217 (Phase K).
   --------------------------------------------------------------------------
   Every "when can I afford it" in the suite is the same question: a target,
   what is set aside, what goes in each month, what the money earns while
   it waits. This is the ONE function that answers it. The Down Payment
   Countdown, the Quit Fund, the Wedding Countdown and the Race to $100K
   are skins on goalCountdown(); test/run.js fails the build if any of them
   walks its own months.

     goalCountdown(opts) → Result
       opts.targetCents               the amount to reach
       opts.savedCents                set aside already (absent: 0)
       opts.monthlyContributionCents  added each month (absent: 0)
       opts.annualRate                what it earns a year (absent: 0; a cash
                                      goal earns nothing real)
       opts.bands                     { p25, p50, p75 } annual rates for the
                                      range; absent: the range collapses
       opts.maxMonths                 the horizon (default 50 years)
       opts.from                      'YYYY-MM' the count starts (default now)
       value        months at the middle rate, or null when never
       date         'YYYY-MM' at the middle rate, or null
       range        { fastMonths, slowMonths, fastDate, slowDate } across the
                    bands (fast = the high band, slow = the low band)
       reachedNow   already there
       neverAtThisPace   not within the horizon at the middle rate
       monthlyNeededCents(months)  what a month would have to be to land in
                    `months` at the middle rate (the honest alternative to a
                    far-off date)

     monthsTo(target, saved, monthly, annualRate, maxMonths) → months | null
     monthlyNeededCents(target, saved, annualRate, months) → cents

   Money is integer cents; the walk is monthly compounding at the annual
   rate's twelfth root, the same as engines/coast.js. Nothing here reads
   the household: the skins do, and pass what they read.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Countdown = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var DEFAULT_MAX_MONTHS = 50 * 12;

  function monthlyFactor(annualRate) { return Math.pow(1 + (annualRate || 0), 1 / 12); }

  /** The first month the pot is at or past the target, or null within the horizon. */
  function monthsTo(targetCents, savedCents, monthlyCents, annualRate, maxMonths) {
    var pot = savedCents || 0, add = monthlyCents || 0, f = monthlyFactor(annualRate);
    var max = maxMonths || DEFAULT_MAX_MONTHS;
    if (pot >= targetCents) return 0;
    if (add <= 0 && (annualRate || 0) <= 0) return null;
    for (var m = 1; m <= max; m++) {
      pot = pot * f + add;
      if (pot >= targetCents - 0.5) return m;
    }
    return null;
  }

  /** The level monthly amount that lands on the target in `months`. */
  function monthlyNeededCents(targetCents, savedCents, annualRate, months) {
    if (!months || months <= 0) return null;
    var f = monthlyFactor(annualRate), pot = savedCents || 0;
    var grown = pot * Math.pow(f, months);
    if (grown >= targetCents) return 0;
    var r = f - 1;
    var annuity = r === 0 ? months : (Math.pow(f, months) - 1) / r;
    return Math.ceil((targetCents - grown) / annuity);
  }

  function addMonths(ym, n) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
    return (y + Math.floor(m / 12)) + '-' + ('0' + ((m % 12) + 1)).slice(-2);
  }

  function goalCountdown(opts) {
    var o = opts || {};
    if (!Money.isEntered(o.targetCents)) return Money.incomplete('Need a target amount.', ['targetCents']);
    if (o.targetCents < 0) return Money.incomplete('A target below zero is not a goal.', ['targetCents']);
    var saved = Money.isEntered(o.savedCents) ? o.savedCents : 0;
    var monthly = Money.isEntered(o.monthlyContributionCents) ? o.monthlyContributionCents : 0;
    var rate = Money.isEntered(o.annualRate) ? o.annualRate : 0;
    var max = o.maxMonths || DEFAULT_MAX_MONTHS;
    var from = o.from || Schema.localMonth();
    var mid = monthsTo(o.targetCents, saved, monthly, rate, max);
    var b = o.bands && Money.isEntered(o.bands.p25) && Money.isEntered(o.bands.p75) ? o.bands : null;
    var fast = b ? monthsTo(o.targetCents, saved, monthly, b.p75, max) : mid;
    var slow = b ? monthsTo(o.targetCents, saved, monthly, b.p25, max) : mid;
    var never = mid === null;
    return Money.ok(mid, {
      months: mid,
      date: mid === null ? null : addMonths(from, mid),
      range: { fastMonths: fast, slowMonths: slow, fastDate: fast === null ? null : addMonths(from, fast), slowDate: slow === null ? null : addMonths(from, slow) },
      reachedNow: mid === 0,
      neverAtThisPace: never,
      targetCents: o.targetCents, savedCents: saved, monthlyContributionCents: monthly, annualRate: rate, from: from,
      monthlyNeededCents: function (months) { return monthlyNeededCents(o.targetCents, saved, rate, months); }
    });
  }

  return { DEFAULT_MAX_MONTHS: DEFAULT_MAX_MONTHS, goalCountdown: goalCountdown, monthsTo: monthsTo, monthlyNeededCents: monthlyNeededCents, addMonths: addMonths };
});
