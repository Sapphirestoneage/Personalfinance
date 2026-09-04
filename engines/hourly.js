/* ==========================================================================
   engines/hourly.js — Real Hourly Wage / Life Energy.
   --------------------------------------------------------------------------
   SPEC.md §9 item 7: built BEFORE the Prospective Worth and Side Hustle
   calcs, both of which consume it. §13: "nets true income (after
   work-related costs) against true time cost (commute, prep, decompression)
   to get a real hourly rate."

   The headline rate counts only the hours you are paid for and only the
   money before anything is taken out. The real rate counts every hour the
   job takes and only the money you actually keep:

       nominal = gross / (contracted hours × weeks)
       real    = (gross − tax − work costs) / (all hours given × weeks)

   Tax comes from the same effective-rate lookup Tier 0 uses (SPEC.md §8) —
   there is no second tax calculation anywhere in this app.

   Cents per hour, as integers, like every other money figure here.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Hourly = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';

  var MONTHS_PER_YEAR = 12;

  /* The unpaid hours a job takes. Each is optional — someone who works from
     home has no commute, and that is a zero, not a missing answer — so an
     absent one contributes nothing rather than blocking the calculation. */
  var UNPAID_HOURS = [
    ['unpaidOvertimeHoursPerWeek', 'unpaid overtime'],
    ['commuteHoursPerWeek', 'commuting'],
    ['prepHoursPerWeek', 'getting ready'],
    ['decompressHoursPerWeek', 'decompressing']
  ];

  /**
   * hoursBreakdown(work) — paid, unpaid and total hours per week.
   * Incomplete only when the contracted hours are missing, since nothing can
   * be divided without them.
   */
  function hoursBreakdown(work) {
    if (!Money.isEntered(work.contractedHoursPerWeek)) {
      return Money.incomplete('Add the hours you’re paid for.', ['contractedHoursPerWeek']);
    }
    if (work.contractedHoursPerWeek <= 0) {
      return Money.incomplete('Paid hours need to be more than zero.', ['contractedHoursPerWeek']);
    }
    var unpaid = 0, parts = [];
    UNPAID_HOURS.forEach(function (spec) {
      var v = work[spec[0]];
      if (Money.isEntered(v) && v > 0) { unpaid += v; parts.push({ key: spec[0], label: spec[1], hours: v }); }
    });
    return Money.ok(work.contractedHoursPerWeek + unpaid, {
      paidHoursPerWeek: work.contractedHoursPerWeek,
      unpaidHoursPerWeek: unpaid,
      parts: parts
    });
  }

  /**
   * realHourlyWage(household, tables, opts)
   *   opts.personId  which adult (defaults to the primary)
   *   opts.work      preview a different work profile without storing it
   *
   * Returns a Result whose value is the REAL rate, in cents per hour.
   */
  function realHourlyWage(household, tables, opts) {
    var o = opts || {};
    var person = o.personId ? Schema.personById(household, o.personId) : Schema.primaryPerson(household);
    if (!person) return Money.incomplete('Answer the income question in Start Here to see this.',
      ['grossAnnualIncome']);

    var work = Object.assign(Schema.workProfile(person), o.work || {});
    var hours = hoursBreakdown(work);
    if (!Money.isOk(hours)) return hours;

    var weeks = Money.isEntered(work.weeksPerYear) ? work.weeksPerYear : Schema.WORK_DEFAULTS.weeksPerYear;
    if (weeks <= 0) return Money.incomplete('Weeks worked needs to be more than zero.', ['weeksPerYear']);

    /* This person's own income, not the household's — a real hourly wage is
       inherently per-person (SPEC.md §3, per-person views). */
    var gross = 0, counted = 0;
    (person.incomeSources || []).forEach(function (src) {
      if (Money.isEntered(src.grossAnnualIncomeCents)) { gross += src.grossAnnualIncomeCents; counted++; }
    });
    if (counted === 0) return Money.incomplete('Add your income to see this.', ['grossAnnualIncome']);

    /* Not earning. This is a real answer, not a missing one, so it must not
       be met with "add your income" — and a real hourly wage is not a
       concept that applies to it. There is no rate to divide, and dividing
       work costs by hours would produce a negative "wage" that reads as a
       finding when it is really just an absence. DECISIONS.md D-048. */
    if (gross === 0) {
      return Money.incomplete(
        'You have said you are not earning, so there is no hourly rate to work out. '
          + 'What your time is worth is a different question when nothing is coming in — '
          + 'how long the money lasts is the one to ask.',
        ['grossAnnualIncome']);
    }

    var nominalPerHour = Money.safeDivide(gross, hours.paidHoursPerWeek * weeks, {
      denominatorName: 'contractedHoursPerWeek'
    });
    if (!Money.isOk(nominalPerHour)) return nominalPerHour;

    /* One tax lookup for the whole app. */
    var tax = Tier0.estimatedAnnualTaxCents(household, tables);
    var taxCents = Money.isOk(tax) ? Math.round(gross * tax.effectiveRate) : null;

    var workCostsAnnual = Money.isEntered(work.workCostsMonthlyCents)
      ? work.workCostsMonthlyCents * MONTHS_PER_YEAR : 0;

    var keptCents = gross - (Money.isEntered(taxCents) ? taxCents : 0) - workCostsAnnual;
    var realPerHour = Money.safeDivide(keptCents, hours.value * weeks, {
      denominatorName: 'totalHours'
    });
    if (!Money.isOk(realPerHour)) return realPerHour;

    var nominal = Math.round(nominalPerHour.value);
    var real = Math.round(realPerHour.value);

    return Money.ok(real, {
      nominalHourlyCents: nominal,
      realHourlyCents: real,
      /* A job can cost more than it pays once tax and the costs of working
         come out. That is a real and important finding, but a bare minus
         sign is easy to misread as a bug, so it is flagged rather than left
         for the reader to notice. */
      costsMoreThanItPays: real < 0,
      /* Paid hours so low that the headline rate stops meaning anything —
         one paid hour a week makes any salary look like a fortune an hour.
         The arithmetic is right; the flag lets a room say so. */
      implausibleHours: hours.paidHoursPerWeek < 5,
      /* What share of the headline rate survives. */
      retained: nominal === 0 ? null : real / nominal,
      lostPerHourCents: nominal - real,
      grossAnnualIncomeCents: gross,
      estimatedTaxCents: taxCents,
      taxKnown: Money.isOk(tax),
      taxReason: Money.isOk(tax) ? null : tax.reason,
      annualWorkCostsCents: workCostsAnnual,
      keptAnnualCents: keptCents,
      paidHoursPerWeek: hours.paidHoursPerWeek,
      unpaidHoursPerWeek: hours.unpaidHoursPerWeek,
      totalHoursPerWeek: hours.value,
      unpaidParts: hours.parts,
      weeksPerYear: weeks,
      annualPaidHours: hours.paidHoursPerWeek * weeks,
      annualTotalHours: hours.value * weeks,
      referenceVersion: Money.isOk(tax) ? tax.referenceVersion : null
    });
  }

  /**
   * What something really costs, priced in the hours of your life it takes.
   * This is the "life energy" half of §13, and the engine the Side Hustle and
   * Prospective Worth calcs will call rather than re-deriving a rate.
   */
  function hoursToAfford(household, tables, priceCents, opts) {
    var wage = realHourlyWage(household, tables, opts);
    if (!Money.isOk(wage)) return wage;
    if (!Money.isEntered(priceCents)) {
      return Money.incomplete('Add a price to see what it costs in hours.', ['price']);
    }
    var result = Money.safeDivide(priceCents, wage.value, {
      denominatorName: 'realHourlyWage',
      zeroReason: 'A real hourly wage of zero can’t price anything in hours.'
    });
    if (!Money.isOk(result)) return result;
    return Money.ok(result.value, {
      priceCents: priceCents,
      realHourlyCents: wage.value,
      nominalHours: wage.nominalHourlyCents ? priceCents / wage.nominalHourlyCents : null
    });
  }

  return {
    UNPAID_HOURS: UNPAID_HOURS,
    hoursBreakdown: hoursBreakdown,
    realHourlyWage: realHourlyWage,
    hoursToAfford: hoursToAfford
  };
});
