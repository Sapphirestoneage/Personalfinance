/* ==========================================================================
   engines/hassle.js — Return on Hassle. SPEC.md §13, Tier 1.
   --------------------------------------------------------------------------
   "Dollars saved vs. time/effort. Defaultable hassle-score-by-activity-type
   is a small reference table worth building early." The table is
   data/hassle_defaults.json; this file is the arithmetic.

   Three readings, in order of how much they assume:

     1. Plain rate — dollars saved ÷ hours spent. Assumes nothing.
     2. Against your real hourly wage — the rate from engines/hourly.js, so
        the comparison is against what an hour of your life actually earns
        after work costs and unpaid time, not against your salary ÷ 2080.
     3. Hassle-adjusted rate — the plain rate divided by a weight derived
        from the 1-10 rating. That weight is a CONVENTION and the data file
        says so: a 10-out-of-10 hour counts as two hours, linearly. It
        exists so the rating can enter the arithmetic rather than sit beside
        it, and the plain rate is always returned alongside so nobody has to
        take the convention on trust.

   A saving that REPEATS is the interesting case, and it is handled here
   rather than left to the reader: an hour spent once against a saving that
   lands every month is a different proposition from a one-off, and the
   annualised rate says by how much.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Rating: require('../shared/rating.js'),
      Hourly: require('./hourly.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Rating: root.SLAF && root.SLAF.Rating,
      Hourly: root.SLAF && root.SLAF.Hourly
    };
  }
  var api = factory(deps.Money, deps.Rating, deps.Hourly);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Hassle = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Rating, Hourly) {
  'use strict';

  var SCOPE = 'hassle';
  var MONTHS_PER_YEAR = 12;

  function activityById(table, id) {
    var list = (table && table.activities) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /**
   * The hassle weight for a rating, per the convention in the data file.
   * Unrated returns 1 — no rating means no adjustment, never an assumed one.
   */
  function weightFor(table, score) {
    var w = (table && table.weighting) || { minWeight: 1, maxWeight: 2 };
    if (!Rating.isValid(score)) return { weight: 1, rated: false, convention: w.id || null };
    var span = w.maxWeight - w.minWeight;
    var t = (score - Rating.MIN) / (Rating.MAX - Rating.MIN);
    return { weight: w.minWeight + t * span, rated: true, convention: w.id || null };
  }

  /**
   * One chore, priced.
   *
   *   savingCents      what it puts back in your pocket, per occurrence
   *   hours            what it takes, per occurrence
   *   repeatsPerYear   1 for a one-off; 12 for a monthly saving that took
   *                    one afternoon to set up (see `hoursRepeat`)
   *   hoursRepeat      true if the HOURS recur too. A subscription you
   *                    cancel once saves every month for one hour of work;
   *                    doing your own taxes costs the hours every year.
   *   hassleScore      1-10, or null
   *
   * `value` is the plain dollars-per-hour, in cents.
   */
  function returnOnHassle(opts, table) {
    var o = opts || {};
    var missing = Money.missingFrom({ saving: o.savingCents, hours: o.hours });
    if (missing.length) {
      return Money.incomplete('Add what it saves and how long it takes.',
        missing.map(function (m) { return m === 'saving' ? 'savingCents' : 'hours'; }));
    }
    if (o.hours <= 0) {
      return Money.incomplete('Hours need to be more than zero — a saving that '
        + 'costs no time has no rate to work out.', ['hours']);
    }

    var repeats = Money.isEntered(o.repeatsPerYear) ? o.repeatsPerYear : 1;
    if (repeats <= 0) {
      return Money.incomplete('This needs to happen at least once a year.', ['repeatsPerYear']);
    }
    var hoursRepeat = o.hoursRepeat === true;

    var annualSavingCents = o.savingCents * repeats;
    var annualHours = hoursRepeat ? o.hours * repeats : o.hours;

    var perHour = o.savingCents / o.hours;
    var annualPerHour = annualSavingCents / annualHours;

    var w = weightFor(table, o.hassleScore);

    return Money.ok(Math.round(perHour), {
      savingCents: o.savingCents,
      hours: o.hours,
      repeatsPerYear: repeats,
      hoursRepeat: hoursRepeat,
      annualSavingCents: annualSavingCents,
      annualHours: annualHours,
      /* The number that matters when a one-off hour buys a repeating saving. */
      annualPerHourCents: Math.round(annualPerHour),
      hassleScore: Rating.isValid(o.hassleScore) ? o.hassleScore : null,
      hassleWeight: w.weight,
      hassleRated: w.rated,
      weightingConvention: w.convention,
      /* Adjusted rate. With no rating the weight is 1, so this equals the
         plain rate — an unrated chore is not silently penalised. */
      adjustedPerHourCents: Math.round(annualPerHour / w.weight)
    });
  }

  /**
   * The same chore against what an hour of your life actually earns.
   * Uses engines/hourly.js — SPEC.md §8: there is one real-hourly-wage
   * calculation in this codebase and this is not a second one.
   */
  function versusWage(household, tables, opts) {
    var r = returnOnHassle(opts, tables && tables.hassleDefaults);
    if (!Money.isOk(r)) return r;

    var wage = Hourly.realHourlyWage(household, tables);
    if (!Money.isOk(wage)) {
      return Money.incomplete(
        'Fill in the Real Hourly Wage room to compare this against what an hour '
          + 'of your life actually earns.',
        wage.missing);
    }

    var ratio = Money.safeDivide(r.adjustedPerHourCents, wage.value, {
      denominatorName: 'realHourlyWage',
      zeroReason: 'A real hourly wage of zero can’t be compared against.'
    });

    return Money.ok(Money.isOk(ratio) ? ratio.value : null, {
      hassle: r,
      realHourlyCents: wage.value,
      beatsWage: r.adjustedPerHourCents > wage.value,
      differenceCents: r.adjustedPerHourCents - wage.value,
      /* How long the chore has to save for before it matches an hour of
         work. Useful when the answer is "not worth it" — it says by how far. */
      breakEvenSavingCents: Math.round(wage.value * r.annualHours * r.hassleWeight)
    });
  }

  /** Every activity in the table, with its defaults and any stored rating. */
  function presets(household, table) {
    if (!table) return Money.incomplete('Hassle reference table is not loaded.',
      ['hassleDefaults']);
    return Money.ok((table.activities || []).map(function (a) {
      var stored = Rating.get(household, SCOPE, a.id);
      return {
        id: a.id,
        label: a.label,
        note: a.note,
        hours: a.hours,
        defaultHassle: a.hassle,
        hassle: stored === null ? a.hassle : stored,
        rated: stored !== null
      };
    }), { referenceVersion: table.version });
  }

  return {
    SCOPE: SCOPE,
    MONTHS_PER_YEAR: MONTHS_PER_YEAR,
    activityById: activityById,
    weightFor: weightFor,
    returnOnHassle: returnOnHassle,
    versusWage: versusWage,
    presets: presets
  };
});
