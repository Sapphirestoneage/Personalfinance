/* ==========================================================================
   engines/wedding.js — the Wedding Countdown.
   DECISIONS.md D-217 (K11).
   --------------------------------------------------------------------------
   A wedding as a target: typed as one total, or built up from guests × a
   per-guest cost plus the fixed costs and the ring, with the national
   defaults from data/wedding_defaults.json (confidence-tagged, every one
   editable). What is set aside and what goes in a month give the date it
   is affordable with no debt, from engines/countdown.js goalCountdown(),
   the one countdown in the suite, at 0% because the fund is cash. Family
   contributions are typed, never assumed. The guest slider prices each
   extra table in dollars and in days of FI, through the lens the rest of
   the app uses (shared/lens.js, the 'pushed' mode), never a second
   formula.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Countdown: require('./countdown.js'),
      Lens: (function () { try { return require('../shared/lens.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Countdown: S.Countdown, Lens: S.Lens };
  }
  var api = factory(deps.Money, deps.Schema, deps.Countdown, deps.Lens);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Wedding = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Countdown, Lens) {
  'use strict';

  var DAYS_A_MONTH = 365.25 / 12;
  var HONEST_YEARS = 5;

  function monthsBetween(fromYm, toYm) {
    return (Number(toYm.slice(0, 4)) - Number(fromYm.slice(0, 4))) * 12 + (Number(toYm.slice(5, 7)) - Number(fromYm.slice(5, 7)));
  }

  /** Days of FI one amount costs, through the lens; null when the lens cannot say. */
  function fiDays(cents, household, tables) {
    if (!Lens || !cents) return null;
    var r = Lens.apply(cents, 'pushed', household, tables);
    return Money.isOk(r) ? Math.round(r.value * DAYS_A_MONTH) : null;
  }

  /**
   * plan(household, tables, opts) → Result
   *   opts.totalCents        typed total (else the build-up)
   *   opts.guests, perGuestCents, fixedCents, ringCents   the build-up (defaults from the table)
   *   opts.savedCents, monthlyCents, familyCents          the fund
   *   opts.targetDate        'YYYY-MM' the day they want
   *   opts.from              'YYYY-MM' (tests)
   *   value       the affordable date, or null
   *   totalCents, source 'typed' | 'built', guests, perGuestCents, fixedCents, ringCents, tableSize
   *   neededCents (total less family), months, date, range, reachedNow, neverAtThisPace, monthlyNeededCents
   *   onTime (against the target date), monthlyForTargetCents
   *   perTableCents, perTableFiDays, totalAt(guests)
   */
  function plan(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var W = T.weddingDefaults;
    if (!W) return Money.incomplete('The wedding defaults table is not loaded.', ['weddingDefaults']);
    var guests = Money.isEntered(o.guests) ? Math.max(0, Math.round(o.guests)) : W.guests;
    var perGuest = Money.isEntered(o.perGuestCents) ? o.perGuestCents : W.perGuestCents;
    var fixed = Money.isEntered(o.fixedCents) ? o.fixedCents : W.fixedCents;
    var ring = Money.isEntered(o.ringCents) ? o.ringCents : W.ringCents;
    var tableSize = W.tableSize || 8;
    function totalAt(n) { return n * perGuest + fixed + ring; }
    var total = Money.isEntered(o.totalCents) ? o.totalCents : totalAt(guests);
    if (total < 0) return Money.incomplete('A total below zero is not a wedding.', ['total']);
    var saved = Money.isEntered(o.savedCents) ? o.savedCents : 0;
    var monthly = Money.isEntered(o.monthlyCents) ? o.monthlyCents : 0;
    var family = Money.isEntered(o.familyCents) ? o.familyCents : 0;
    var needed = Math.max(0, total - family);
    var from = o.from || Schema.localMonth();
    var cd = Countdown.goalCountdown({ targetCents: needed, savedCents: saved, monthlyContributionCents: monthly, annualRate: 0, from: from });
    var onTime = null, forTarget = null, monthsToTarget = null;
    if (o.targetDate && /^\d{4}-\d{2}$/.test(o.targetDate)) {
      monthsToTarget = monthsBetween(from, o.targetDate);
      onTime = cd.months !== null && cd.months <= monthsToTarget;
      forTarget = monthsToTarget > 0 ? Countdown.monthlyNeededCents(needed, saved, 0, monthsToTarget) : (saved >= needed ? 0 : null);
    }
    var perTable = tableSize * perGuest;
    return Money.ok(cd.date, {
      totalCents: total, source: Money.isEntered(o.totalCents) ? 'typed' : 'built',
      guests: guests, perGuestCents: perGuest, fixedCents: fixed, ringCents: ring, tableSize: tableSize,
      savedCents: saved, monthlyCents: monthly, familyCents: family, neededCents: needed,
      months: cd.months, date: cd.date, range: cd.range, reachedNow: cd.reachedNow, neverAtThisPace: cd.neverAtThisPace,
      monthlyNeededCents: cd.neverAtThisPace ? Countdown.monthlyNeededCents(needed, saved, 0, HONEST_YEARS * 12) : null,
      targetDate: o.targetDate || null, monthsToTarget: monthsToTarget, onTime: onTime, monthlyForTargetCents: forTarget,
      perTableCents: perTable, perTableFiDays: fiDays(perTable, h, T), totalAt: totalAt,
      defaults: { version: W.version, confidence: W.confidence }
    });
  }

  return { HONEST_YEARS: HONEST_YEARS, plan: plan, fiDays: fiDays };
});
