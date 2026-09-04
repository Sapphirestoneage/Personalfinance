/* ==========================================================================
   engines/credential.js — one ROI engine for Career ROI and the Skills calc.
   --------------------------------------------------------------------------
   SPEC.md §13, Tier 2: "Career ROI calc — payback period and lifetime value
   of a career move. Overlaps with College Major ROI, Trade School vs. 4-Year
   ROI, Skills Calculator — could share one 'credential ROI' engine with
   different preset data per pathway. Discount future income delta to present
   value." And separately: "Skills Calculator — ROI of learning a single
   skill; shares ROI math with Career ROI calc, narrower scope."

   So: one function, parameterised. A four-year degree and a weekend course
   are the same arithmetic at different magnitudes — a cost, some time you
   are not earning, a raise afterwards, and a number of years it pays over.
   Building them separately would mean building this twice, which §8 forbids.

   Three things this gets right that back-of-envelope versions miss:

     • The raise is TAXED. A $10,000 raise is not $10,000. The marginal rate
       is an input, not a bracket lookup — the same call as D-027.
     • The time costs money. Months not earning are part of the price, and
       for a career move they usually dwarf the tuition.
     • Money later is worth less than money now. The lifetime value is
       discounted to present value, per the spec, and the discount rate is
       visible rather than buried.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports)
    ? require('../shared/money.js')
    : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Credential = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var MONTHS = 12;

  /* The two pathways this ships with. They differ only in defaults and
     wording — the arithmetic below never branches on which one is in use. */
  var PRESETS = {
    career: {
      id: 'career', label: 'A career move',
      blurb: 'A degree, a bootcamp, a qualification — something with a fee and time out.',
      costLabel: 'What it costs', timeLabel: 'Months not earning',
      deltaLabel: 'The raise it should bring', yearsLabel: 'Years you will work after',
      defaultYears: 25
    },
    skill: {
      id: 'skill', label: 'A single skill',
      blurb: 'A course, a certification, a thing you learn in evenings.',
      costLabel: 'What the course costs', timeLabel: 'Months not earning',
      deltaLabel: 'The raise it should bring', yearsLabel: 'Years it stays useful',
      defaultYears: 5
    }
  };

  /**
   * credentialROI(opts)
   *
   *   costCents            the fee — 0 is a real answer
   *   monthsOut            months earning nothing or less because of it
   *   forgoneMonthlyCents  what a month out costs you in income
   *   annualDeltaCents     the annual raise it should produce, gross
   *   marginalRate         decimal fraction, the rate that raise is taxed at
   *   yearsOfBenefit       how long it keeps paying
   *   discountRate         decimal fraction, for present value
   *
   * `value` is the payback period in months — the number people ask for
   * first — with everything else on the result.
   */
  function credentialROI(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      costCents: o.costCents,
      annualDeltaCents: o.annualDeltaCents,
      yearsOfBenefit: o.yearsOfBenefit,
      marginalRate: o.marginalRate
    });
    if (missing.length) {
      return Money.incomplete(
        'Add what it costs, the raise it should bring, how long that lasts, and your marginal rate.',
        missing);
    }
    if (o.yearsOfBenefit <= 0) {
      return Money.incomplete('It has to pay for more than zero years.', ['yearsOfBenefit']);
    }
    if (o.marginalRate < 0 || o.marginalRate >= 1) {
      return Money.incomplete('A marginal rate has to sit between 0% and 100%.', ['marginalRate']);
    }

    var monthsOut = Money.isEntered(o.monthsOut) ? o.monthsOut : 0;
    if (monthsOut < 0) return Money.incomplete('Months out cannot be negative.', ['monthsOut']);

    /* Time out is only a cost if you say what a month of it is worth. Blank
       is not zero: an unanswered question is not "it costs me nothing". */
    if (monthsOut > 0 && !Money.isEntered(o.forgoneMonthlyCents)) {
      return Money.incomplete(
        'You said you would be out for ' + monthsOut + ' months — add what a month '
          + 'of that costs you, or enter 0 if you keep earning throughout.',
        ['forgoneMonthlyCents']);
    }
    var forgone = monthsOut * (Money.isEntered(o.forgoneMonthlyCents) ? o.forgoneMonthlyCents : 0);
    var totalCost = o.costCents + forgone;

    /* The raise, after tax. This is the number that actually pays it back. */
    var netAnnual = Math.round(o.annualDeltaCents * (1 - o.marginalRate));
    var netMonthly = netAnnual / MONTHS;

    var discount = Money.isEntered(o.discountRate) ? o.discountRate : 0;
    if (discount < 0 || discount >= 1) {
      return Money.incomplete('A discount rate has to sit between 0% and 100%.', ['discountRate']);
    }

    /* Present value of the after-tax raise, one year at a time. A loop
       rather than the annuity formula so a zero discount rate needs no
       special case and the working is inspectable. */
    var pv = 0;
    var wholeYears = Math.floor(o.yearsOfBenefit);
    for (var y = 1; y <= wholeYears; y++) pv += netAnnual / Math.pow(1 + discount, y);
    var partial = o.yearsOfBenefit - wholeYears;
    if (partial > 0) pv += (netAnnual * partial) / Math.pow(1 + discount, wholeYears + 1);
    pv = Math.round(pv);

    var payback = netMonthly > 0 ? totalCost / netMonthly : null;
    var neverPaysBack = netAnnual <= 0;
    var paybackBeyondHorizon = payback !== null && payback > o.yearsOfBenefit * MONTHS;

    return Money.ok(payback, {
      costCents: o.costCents,
      monthsOut: monthsOut,
      forgoneCents: forgone,
      totalCostCents: totalCost,
      annualDeltaCents: o.annualDeltaCents,
      marginalRate: o.marginalRate,
      netAnnualDeltaCents: netAnnual,
      taxOnDeltaCents: o.annualDeltaCents - netAnnual,
      yearsOfBenefit: o.yearsOfBenefit,
      discountRate: discount,
      presentValueCents: pv,
      netPresentValueCents: pv - totalCost,
      worthIt: pv > totalCost,
      /* What the raise would have to be for this to break even over the
         horizon — the useful answer when the honest one is "not worth it". */
      breakEvenAnnualDeltaCents: pv > 0
        ? Math.round(o.annualDeltaCents * (totalCost / pv))
        : null,
      returnMultiple: totalCost > 0 ? pv / totalCost : null,
      neverPaysBack: neverPaysBack,
      paybackBeyondHorizon: paybackBeyondHorizon,
      /* The share of the headline raise that survives tax. */
      keptShare: o.annualDeltaCents === 0 ? null : netAnnual / o.annualDeltaCents
    });
  }

  /**
   * The same move priced in hours of your life, when a real hourly wage is
   * available. Not a second calculation — it divides the cost this engine
   * already worked out.
   */
  function costInHours(result, realHourlyCents) {
    if (!Money.isOk(result)) return result;
    return Money.safeDivide(result.totalCostCents, realHourlyCents, {
      denominatorName: 'realHourlyWage',
      zeroReason: 'A real hourly wage of zero cannot price anything in hours.'
    });
  }

  return {
    MONTHS: MONTHS,
    PRESETS: PRESETS,
    credentialROI: credentialROI,
    costInHours: costInHours
  };
});
