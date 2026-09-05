/* ==========================================================================
   engines/ss.js — a Social Security estimate from what is entered. D-088.
   --------------------------------------------------------------------------
     estimate(household, tables, opts) → monthly benefit at the claim age
       opts.retireAge   the age earning stops (default: now, i.e. the
                        current age)
       opts.claimAge    62..70 (default: full retirement age)
       opts.grossAnnualCents  overrides the household's income

   Assumes the current income every year from the career start age to the
   stop age, capped at the wage base, with no indexing; averages the best
   35 years (zeros fill the rest); runs the bend-point formula; adjusts for
   claiming early or late. An approximation that says so in its table.
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Schema: require('../shared/schema.js') }
    : { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.SocialSecurity = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  function pia(table, aimeDollars) {
    var b = table.bendPoints, r = table.rates;
    var amount = r[0] * Math.min(aimeDollars, b[0]);
    if (aimeDollars > b[0]) amount += r[1] * (Math.min(aimeDollars, b[1]) - b[0]);
    if (aimeDollars > b[1]) amount += r[2] * (aimeDollars - b[1]);
    return amount;
  }

  function claimFactor(table, claimAge) {
    var fra = table.fullRetirementAge;
    if (claimAge >= fra) return 1 + table.delayedCreditPerYear * Math.min(claimAge - fra, table.latestAge - fra);
    var months = Math.round((fra - claimAge) * 12);
    var first = Math.min(months, 36), beyond = Math.max(0, months - 36);
    return 1 - first * table.earlyReductionFirst36 - beyond * table.earlyReductionBeyond;
  }

  function estimate(household, tables, opts) {
    var o = opts || {};
    var table = tables && tables.ssBendPoints;
    if (!table) return Money.incomplete('The Social Security table is not loaded.', ['ssBendPoints']);
    var gross = Money.isEntered(o.grossAnnualCents) ? Money.ok(o.grossAnnualCents) : Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return Money.incomplete('Add your income to estimate a benefit.', ['grossAnnualIncome']);
    var age = Money.isEntered(o.age) ? o.age : Schema.primaryAge(household);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to count the working years.', ['dob']);
    var stopAge = Money.isEntered(o.retireAge) ? o.retireAge : age;
    var claimAge = Money.isEntered(o.claimAge) ? o.claimAge : table.fullRetirementAge;
    claimAge = Math.max(table.earliestAge, Math.min(table.latestAge, claimAge));
    var yearsWorked = Math.max(0, Math.round(stopAge - table.careerStartAge));
    var counted = Math.min(yearsWorked, table.computationYears);
    var annualDollars = Math.min(gross.value / 100, table.wageBaseAnnual);
    var aime = (annualDollars * counted) / table.computationYears / 12;
    var full = pia(table, aime);
    var factor = claimFactor(table, claimAge);
    return Money.ok(Math.round(full * factor * 100), {
      aimeDollars: Math.round(aime),
      piaDollars: Math.round(full),
      claimAge: claimAge,
      claimFactor: factor,
      yearsWorked: yearsWorked,
      yearsCounted: counted,
      fullRetirementAge: table.fullRetirementAge,
      referenceVersion: table.version
    });
  }

  return { pia: pia, claimFactor: claimFactor, estimate: estimate };
});
