/* ==========================================================================
   engines/sidehustle.js — Side Hustle calc. SPEC.md §13, Tier 2.
   --------------------------------------------------------------------------
   "Net profitability of side income after taxes, time cost, expenses. Shares
   the Real Hourly Wage engine. Use marginal (not effective) tax rate, since
   side income stacks on primary income."

   Every clause of that is load-bearing:

     • MARGINAL, not effective. The first dollar of side income is taxed at
       the rate on your LAST dollar of salary, not at your average rate.
       Using the effective rate here understates the tax on a side hustle,
       often by a lot. The rate is an input rather than a bracket lookup —
       the same call as capital gains in D-027: inventing 2026 brackets
       would be worse than asking.

     • STACKS. Self-employment tax is computed through
       engines/selfemployed.js with the salary passed as prior wages, so the
       Social Security wage base is already partly used and the additional
       Medicare threshold is measured on combined earnings. Treating side
       income as if it were someone's only earnings gets both caps wrong.

     • SHARES THE REAL HOURLY WAGE ENGINE. The comparison calls
       engines/hourly.js. There is one real-hourly-wage calculation in this
       codebase and this is not a second one.

   Nothing here nets a loss into zero: a side hustle that costs more than it
   makes reports a negative profit, no tax, and says so.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      SelfEmployed: require('./selfemployed.js'),
      Hourly: require('./hourly.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      SelfEmployed: root.SLAF && root.SLAF.SelfEmployed,
      Hourly: root.SLAF && root.SLAF.Hourly
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.SelfEmployed, deps.Hourly);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.SideHustle = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, SelfEmployed, Hourly) {
  'use strict';

  var MONTHS_PER_YEAR = 12;

  /**
   * What a side hustle actually pays.
   *
   *   annualRevenueCents   what comes in, before anything
   *   annualExpensesCents  what it costs to run — 0 is a real answer
   *   annualHours          what it takes
   *   marginalRate         decimal fraction, YOUR top bracket, federal +
   *                        state, on the last dollar of your salary
   *   priorWagesCents      the salary it stacks on, for the SE tax caps
   *   selfEmployment       true for 1099/self-employed work (SE tax
   *                        applies); false for work already taxed as wages
   *
   * `value` is take-home per hour, in cents.
   */
  function sideHustle(opts, tables) {
    var o = opts || {};
    var seTable = tables && tables.seTax;

    var missing = Money.missingFrom({
      annualRevenue: o.annualRevenueCents,
      annualHours: o.annualHours,
      marginalRate: o.marginalRate
    });
    if (missing.length) {
      return Money.incomplete(
        'Add what it brings in, the hours it takes, and your marginal tax rate.',
        missing);
    }
    if (o.annualHours <= 0) {
      return Money.incomplete('Hours need to be more than zero.', ['annualHours']);
    }
    if (o.marginalRate < 0 || o.marginalRate >= 1) {
      return Money.incomplete('A marginal rate has to sit between 0% and 100%.',
        ['marginalRate']);
    }

    /* Expenses left blank are NOT assumed to be zero — a hustle with no
       costs is a claim, and typing 0 is how you make it. */
    if (!Money.isEntered(o.annualExpensesCents)) {
      return Money.incomplete(
        'Add what it costs to run — enter 0 if it genuinely costs nothing.',
        ['annualExpensesCents']);
    }

    var profit = o.annualRevenueCents - o.annualExpensesCents;

    if (profit <= 0) {
      return Money.ok(Math.round(profit / o.annualHours), {
        annualRevenueCents: o.annualRevenueCents,
        annualExpensesCents: o.annualExpensesCents,
        profitCents: profit,
        seTaxCents: 0,
        incomeTaxCents: 0,
        totalTaxCents: 0,
        netCents: profit,
        annualHours: o.annualHours,
        atALoss: true,
        selfEmployment: o.selfEmployment !== false,
        reasonNoTax: profit === 0
          ? 'It breaks even, so there is no profit to tax.'
          : 'It runs at a loss, so there is no profit to tax. What a loss does to '
            + 'the rest of your return is a question for someone who has seen it.'
      });
    }

    var seTax = 0, seDeductibleHalf = 0, seDetail = null;
    if (o.selfEmployment !== false) {
      var se = SelfEmployed.selfEmploymentTax(profit, o.filingStatus, seTable, {
        priorWagesCents: o.priorWagesCents
      });
      if (!Money.isOk(se)) return se;
      seTax = se.value;
      seDeductibleHalf = se.deductibleHalfCents;
      seDetail = se;
    }

    /* Half the SE tax comes off before the marginal rate is applied. */
    var taxable = profit - seDeductibleHalf;
    var incomeTax = Math.round(taxable * o.marginalRate);
    var totalTax = seTax + incomeTax;
    var net = profit - totalTax;

    return Money.ok(Math.round(net / o.annualHours), {
      annualRevenueCents: o.annualRevenueCents,
      annualExpensesCents: o.annualExpensesCents,
      profitCents: profit,
      seTaxCents: seTax,
      seDeductibleHalfCents: seDeductibleHalf,
      seDetail: seDetail,
      taxableCents: taxable,
      incomeTaxCents: incomeTax,
      marginalRate: o.marginalRate,
      totalTaxCents: totalTax,
      netCents: net,
      annualHours: o.annualHours,
      grossPerHourCents: Math.round(o.annualRevenueCents / o.annualHours),
      /* What share of the revenue survives to your pocket. */
      keptShare: o.annualRevenueCents === 0 ? null : net / o.annualRevenueCents,
      taxShareOfProfit: profit === 0 ? null : totalTax / profit,
      atALoss: false,
      selfEmployment: o.selfEmployment !== false,
      priorWagesCents: Money.isEntered(o.priorWagesCents) ? o.priorWagesCents : 0
    });
  }

  /**
   * The side hustle against an hour of the job it sits beside.
   * Reads the salary off the household for the SE tax caps, so the caller
   * does not have to remember to stack it.
   */
  function versusJob(household, tables, opts) {
    var o = opts || {};
    var gross = Schema.grossAnnualIncomeCents(household);

    var r = sideHustle({
      annualRevenueCents: o.annualRevenueCents,
      annualExpensesCents: o.annualExpensesCents,
      annualHours: o.annualHours,
      marginalRate: o.marginalRate,
      selfEmployment: o.selfEmployment,
      filingStatus: household && household.filingStatus,
      priorWagesCents: Money.isOk(gross) ? gross.value : null
    }, tables);
    if (!Money.isOk(r)) return r;

    var wage = Hourly.realHourlyWage(household, tables);
    if (!Money.isOk(wage)) {
      return Money.incomplete(
        'Fill in the Real Hourly Wage room to compare this against an hour of the '
          + 'job it sits beside.',
        wage.missing);
    }

    return Money.ok(r.value - wage.value, {
      hustle: r,
      realHourlyCents: wage.value,
      beatsJob: r.value > wage.value,
      ratio: wage.value === 0 ? null : r.value / wage.value,
      /* The hours are ADDITIONAL. The job's own unpaid hours are already
         counted in the real hourly wage, so this is what a week actually
         becomes. */
      addedWeeklyHours: r.annualHours / (wage.weeksPerYear || 52),
      jobWeeklyHours: wage.totalHoursPerWeek,
      combinedWeeklyHours: wage.totalHoursPerWeek + r.annualHours / (wage.weeksPerYear || 52)
    });
  }

  return {
    MONTHS_PER_YEAR: MONTHS_PER_YEAR,
    sideHustle: sideHustle,
    versusJob: versusJob
  };
});
