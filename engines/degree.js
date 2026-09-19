/* ==========================================================================
   engines/degree.js — the Degree Decision.
   DECISIONS.md D-219 (K9).
   --------------------------------------------------------------------------
   A degree as a sum: tuition and fees less any employer help, the pay given
   up while studying (all of it, or the share a part-timer loses), and the
   interest on the loan (engines/projection.js levelPaymentCents over the
   standard ten years, never a second formula); against the yearly gain,
   the pay with the degree less the pay without, each a range so the
   answer is one. The break-even age is when the gain has paid the cost
   back; the lifetime difference runs to 65; the FI date with and without
   is engines/tier0.js on a copy of the household holding each pay.
   "Not sure" on a salary is a blank range, and the answer says so.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Projection: require('./projection.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Projection: S.Projection };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Degree = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Projection) {
  'use strict';

  var MONTHS = 12, END_AGE = 65, LOAN_YEARS = 10;

  function withPay(h, grossCents) {
    var copy = JSON.parse(JSON.stringify(h || {}));
    var p = (copy.people || []).filter(function (x) { return x.role === 'adult'; })[0];
    if (!p) return null;
    p.incomeSources = [Schema.createIncomeSource({ id: 'degree_income', personId: p.id, source: 'Pay', grossAnnualIncomeCents: grossCents, type: 'w2' })];
    return Schema.createHousehold(copy);
  }

  /**
   * decide(household, tables, opts) → Result
   *   opts.tuitionCents, years, partTimeShare (0 = full time, 1 = keeps all pay), loanCents, loanRate,
   *   opts.withLowCents, withHighCents, withoutLowCents, withoutHighCents (a blank pair = not sure),
   *   opts.employerHelpCents, opts.age (tests)
   *   value   the break-even age at the middle of the ranges, or null
   */
  function decide(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var age = Money.isEntered(o.age) ? o.age : Schema.primaryAge(h);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to count the years to 65.', ['dob']);
    if (!Money.isEntered(o.years) || o.years <= 0) return Money.incomplete('How many years in school?', ['years']);
    var years = o.years;
    var tuition = Money.isEntered(o.tuitionCents) ? o.tuitionCents : 0;
    var help = Money.isEntered(o.employerHelpCents) ? Math.min(o.employerHelpCents, tuition) : 0;
    var keep = Money.isEntered(o.partTimeShare) ? Math.max(0, Math.min(1, o.partTimeShare)) : 0;
    var withLow = o.withLowCents, withHigh = Money.isEntered(o.withHighCents) ? o.withHighCents : o.withLowCents;
    var woLow = o.withoutLowCents, woHigh = Money.isEntered(o.withoutHighCents) ? o.withoutHighCents : o.withoutLowCents;
    if (!Money.isEntered(withLow)) return Money.incomplete('What would you earn with the degree? A range is fine, or say not sure.', ['salaryWith']);
    if (!Money.isEntered(woLow)) {
      var g = Schema.grossAnnualIncomeCents(h);
      if (!Money.isOk(g)) return Money.incomplete('What would you earn without it? Your pay now is the usual answer.', ['salaryWithout']);
      woLow = g.value; woHigh = g.value;
    }
    var forgoneMid = Math.round((woLow + woHigh) / 2 * years * (1 - keep));
    var loan = Money.isEntered(o.loanCents) ? o.loanCents : 0;
    var interest = 0;
    if (loan > 0 && Money.isEntered(o.loanRate)) {
      var pay = Projection.levelPaymentCents({ principalCents: loan, annualRate: o.loanRate, months: LOAN_YEARS * MONTHS });
      if (Money.isOk(pay)) interest = pay.value * LOAN_YEARS * MONTHS - loan;
    }
    var cost = tuition - help + forgoneMid + interest;
    var gainLow = withLow - woHigh, gainHigh = withHigh - woLow, gainMid = Math.round((gainLow + gainHigh) / 2);
    var doneAt = age + years, yearsAfter = Math.max(0, END_AGE - doneAt);
    function breakEven(gain) { return gain > 0 ? Math.round((doneAt + cost / gain) * 10) / 10 : null; }
    var be = breakEven(gainMid), beLow = breakEven(gainHigh), beHigh = breakEven(gainLow);
    var lifetimeLow = gainLow * yearsAfter - cost, lifetimeHigh = gainHigh * yearsAfter - cost;
    var withH = withPay(h, Math.round((withLow + withHigh) / 2)), withoutH = withPay(h, Math.round((woLow + woHigh) / 2));
    var fiWith = withH ? Tier0.yearsToFire(withH, T, null, { fractional: true }) : null;
    var fiWithout = withoutH ? Tier0.yearsToFire(withoutH, T, null, { fractional: true }) : null;
    return Money.ok(be, {
      age: age, years: years, doneAt: doneAt, endAge: END_AGE, yearsAfter: yearsAfter,
      tuitionCents: tuition, employerHelpCents: help, forgoneCents: forgoneMid, keepShare: keep, loanCents: loan, interestCents: interest, costCents: cost,
      gainLowCents: gainLow, gainHighCents: gainHigh, gainMidCents: gainMid,
      breakEvenAge: be, breakEvenLowAge: beLow, breakEvenHighAge: beHigh, breaksEven: be !== null && be <= END_AGE,
      lifetimeLowCents: lifetimeLow, lifetimeHighCents: lifetimeHigh,
      fiWithYears: fiWith && Money.isOk(fiWith) ? Math.round((fiWith.value + years) * 10) / 10 : null, fiWithoutYears: fiWithout && Money.isOk(fiWithout) ? Math.round(fiWithout.value * 10) / 10 : null,
      fiReason: fiWith && !Money.isOk(fiWith) ? fiWith.reason : null
    });
  }

  return { END_AGE: END_AGE, LOAN_YEARS: LOAN_YEARS, decide: decide };
});
