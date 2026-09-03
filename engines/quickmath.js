/* ==========================================================================
   engines/quickmath.js — the one-line calculators.
   --------------------------------------------------------------------------
   SPEC.md §13 groups several tools whose maths is trivial and whose value is
   in the framing: the HYSA Switch calc, Girl Math / Lifetime Value
   (cost-per-use), and the car-buying rules. They share a room rather than
   each getting one, because a page holding a single division is not a tool.

   Trivial maths still gets the same treatment as everything else here: a
   missing input produces an incomplete Result, never a zero, and every
   ratio goes through safeDivide.

   NOT built: the "$30k–$90k Rule" named in §13. I could not establish what
   it actually states, and inventing a threshold that people would then plan a
   car purchase around is worse than leaving it out. See DECISIONS.md D-022.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Projection: require('./projection.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Projection: root.SLAF && root.SLAF.Projection
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.QuickMath = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Projection) {
  'use strict';

  var DAYS_PER_YEAR = 365;
  var MONTHS_PER_YEAR = 12;

  /* ---- HYSA switch -------------------------------------------------------
     §13: "value of moving cash from lower-APY to higher-APY account, net of
     switching friction." The gross figure is one multiplication; the honest
     figure subtracts the days the money earns nothing in transit and any
     one-off cost, and says how long it takes to pay those back.          */

  function hysaSwitch(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      balanceCents: o.balanceCents, currentApy: o.currentApy, newApy: o.newApy
    });
    if (missing.length) {
      return Money.incomplete('Add your balance and both rates to see this.', missing);
    }
    var spread = o.newApy - o.currentApy;
    var annualGain = Math.round(o.balanceCents * spread);

    var daysInTransit = Money.isEntered(o.daysInTransit) ? o.daysInTransit : 0;
    var friction = Money.isEntered(o.frictionCostCents) ? o.frictionCostCents : 0;
    /* Money in transit earns the OLD rate's worth of nothing. */
    var transitCost = Math.round(o.balanceCents * o.currentApy * (daysInTransit / DAYS_PER_YEAR));
    var oneOffCost = friction + transitCost;
    var firstYearNet = annualGain - oneOffCost;

    var breakEven = annualGain <= 0
      ? Money.incomplete('The new rate isn’t higher, so there’s nothing to pay back.', ['newApy'])
      : Money.ok(oneOffCost / (annualGain / DAYS_PER_YEAR));

    return Money.ok(firstYearNet, {
      spread: spread,
      annualGainCents: annualGain,
      transitCostCents: transitCost,
      frictionCostCents: friction,
      oneOffCostCents: oneOffCost,
      firstYearNetCents: firstYearNet,
      ongoingAnnualCents: annualGain,
      breakEvenDays: breakEven,
      worthIt: firstYearNet > 0
    });
  }

  /* ---- Cost per use ------------------------------------------------------
     §13's Girl Math / Lifetime Value: "cost-per-use math, playful framing.
     Trivial math — entire value is in tone/copy."                        */

  function costPerUse(opts) {
    var o = opts || {};
    var result = Money.safeDivide(o.priceCents, o.uses, {
      numeratorName: 'price', denominatorName: 'uses',
      missingReason: 'Add the price and how many times you’ll use it.',
      zeroReason: 'Something used zero times has no cost per use — it just cost you the money.'
    });
    if (!Money.isOk(result)) return result;
    return Money.ok(Math.round(result.value), {
      priceCents: o.priceCents, uses: o.uses,
      /* If it lasts a while, what it works out to per month. */
      perMonthCents: Money.isEntered(o.overMonths) && o.overMonths > 0
        ? Math.round(o.priceCents / o.overMonths) : null,
      overMonths: Money.isEntered(o.overMonths) ? o.overMonths : null
    });
  }

  /** How many uses it takes to get the cost per use down to a target. */
  function usesToReach(priceCents, targetPerUseCents) {
    var result = Money.safeDivide(priceCents, targetPerUseCents, {
      numeratorName: 'price', denominatorName: 'targetPerUse',
      missingReason: 'Add a price and a per-use figure you’d be happy with.',
      zeroReason: 'A target of zero can never be reached.'
    });
    if (!Money.isOk(result)) return result;
    return Money.ok(Math.ceil(result.value));
  }

  /* ---- 20/3/8 car rule ---------------------------------------------------
     20% down, no more than 3 years, payment no more than 8% of gross monthly
     income. Each leg is reported separately, because failing one is a very
     different situation from failing all three.                          */

  var CAR_RULE = { downPaymentShare: 0.20, maxTermMonths: 36, maxPaymentShareOfGross: 0.08 };

  function carRule2038(household, opts) {
    var o = opts || {};
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) {
      return Money.incomplete('Add your income in Start Here to check this.', ['grossAnnualIncome']);
    }
    var monthlyGross = gross.value / MONTHS_PER_YEAR;
    var paymentCap = Math.round(monthlyGross * CAR_RULE.maxPaymentShareOfGross);

    /* What the rule says you could afford, working backwards from the cap. */
    var maxLoan = Projection.principalForPaymentCents({
      paymentCents: paymentCap,
      annualRate: Money.isEntered(o.loanRate) ? o.loanRate : 0.06,
      months: CAR_RULE.maxTermMonths
    });
    var maxPrice = Money.isOk(maxLoan)
      ? Math.round(maxLoan.value / (1 - CAR_RULE.downPaymentShare)) : null;

    if (!Money.isEntered(o.carPriceCents)) {
      return Money.ok(maxPrice, {
        rule: CAR_RULE, checks: [], maxAffordablePriceCents: maxPrice,
        paymentCapCents: paymentCap, monthlyGrossCents: Math.round(monthlyGross),
        priceEntered: false
      });
    }

    var down = Money.isEntered(o.downPaymentCents) ? o.downPaymentCents : 0;
    var term = Money.isEntered(o.termMonths) ? o.termMonths : CAR_RULE.maxTermMonths;
    var rate = Money.isEntered(o.loanRate) ? o.loanRate : 0.06;
    var loan = Math.max(0, o.carPriceCents - down);
    var payment = Projection.levelPaymentCents({
      principalCents: loan, annualRate: rate, months: term
    });

    var downShare = o.carPriceCents > 0 ? down / o.carPriceCents : 0;
    var checks = [
      { key: 'down', label: 'At least 20% down',
        pass: downShare >= CAR_RULE.downPaymentShare,
        actual: downShare, target: CAR_RULE.downPaymentShare,
        shortfallCents: Math.max(0, Math.round(o.carPriceCents * CAR_RULE.downPaymentShare) - down) },
      { key: 'term', label: 'Paid off within 3 years',
        pass: term <= CAR_RULE.maxTermMonths,
        actual: term, target: CAR_RULE.maxTermMonths },
      { key: 'payment', label: 'Payment under 8% of gross pay',
        pass: Money.isOk(payment) && payment.value <= paymentCap,
        actual: Money.isOk(payment) ? payment.value : null, target: paymentCap,
        overByCents: Money.isOk(payment) ? Math.max(0, payment.value - paymentCap) : null }
    ];

    return Money.ok(checks.filter(function (c) { return c.pass; }).length, {
      rule: CAR_RULE, checks: checks, priceEntered: true,
      passesAll: checks.every(function (c) { return c.pass; }),
      loanCents: loan,
      monthlyPaymentCents: Money.isOk(payment) ? payment.value : null,
      totalInterestCents: Money.isOk(payment) ? payment.totalInterestCents : null,
      paymentCapCents: paymentCap,
      monthlyGrossCents: Math.round(monthlyGross),
      maxAffordablePriceCents: maxPrice
    });
  }

  /* ---- The $30k–$90k rule -------------------------------------------------
     Named in SPEC.md §13 and defined by Eli (DECISIONS.md D-022, now closed):

       $100 a month is $1,200 a year of SPENDING. At a 4% withdrawal rate
       your pot has to be $1,200 / 0.04 = $30,000 bigger to fund it forever.
       Invest that same $100 a month instead and it compounds to about
       $90,000.

     The same $100, counted from both ends: what the habit adds to the
     mountain, and what it would have been if it had gone the other way.

     The $30,000 half is exact and independent of any return assumption —
     it falls straight out of the withdrawal rate. The $90,000 half does NOT:
     it is roughly 26 years at 7%, or 30 years at 5.5%. So the headline pair
     is the illustration, and this computes both from the household's own
     assumptions and horizon instead of asserting the round numbers.       */

  function recurringHabit(household, tables, opts) {
    var o = opts || {};
    if (!Money.isEntered(o.monthlyAmountCents)) {
      return Money.incomplete('Add what it costs a month.', ['monthlyAmount']);
    }
    var assumptions = Schema.resolveAssumptions(household, o.localOverrides);
    var annualCost = o.monthlyAmountCents * 12;

    /* Side one: what it adds to the number you have to reach. */
    var addition = Money.safeDivide(annualCost, assumptions.swrRate, {
      denominatorName: 'swrRate',
      zeroReason: 'A withdrawal rate of zero has no finite figure.'
    });
    if (!Money.isOk(addition)) return addition;
    var additionCents = Math.round(addition.value);

    /* Side two: what it would have become instead. The horizon defaults to
       the years between now and a normal retirement age, because that is the
       span the comparison is actually about — but it is stated, not hidden. */
    var years = o.years;
    var horizonBasis = 'given';
    if (!Money.isEntered(years)) {
      var age = Schema.primaryAge(household);
      if (Money.isEntered(age)) {
        years = Math.max(1, DEFAULT_RETIREMENT_AGE - age);
        horizonBasis = 'to age ' + DEFAULT_RETIREMENT_AGE;
      } else {
        years = DEFAULT_HABIT_YEARS;
        horizonBasis = 'default ' + DEFAULT_HABIT_YEARS + ' years';
      }
    }
    var invested = Projection.futureValueMonthlyCents({
      monthlyContributionCents: o.monthlyAmountCents,
      annualRate: assumptions.expectedReturnRate,
      months: Math.round(years * 12)
    });
    if (!Money.isOk(invested)) return invested;

    return Money.ok(additionCents, {
      monthlyAmountCents: o.monthlyAmountCents,
      annualCostCents: annualCost,
      swrRate: assumptions.swrRate,
      expectedReturnRate: assumptions.expectedReturnRate,
      /* What the habit adds to the mountain. */
      fireNumberAdditionCents: additionCents,
      /* What the same money would have become. */
      investedInsteadCents: invested.value,
      contributedCents: invested.contributedCents,
      growthCents: invested.growthCents,
      years: years,
      horizonBasis: horizonBasis,
      /* How many times bigger the road-not-taken is than the extra mountain. */
      ratio: additionCents > 0 ? invested.value / additionCents : null,
      /* And the two sides added together — the full swing of one decision. */
      totalSwingCents: additionCents + invested.value
    });
  }

  var DEFAULT_RETIREMENT_AGE = 65;
  var DEFAULT_HABIT_YEARS = 25;

  /* ---- Rule of Five ------------------------------------------------------
     Stated in the UI wherever it is shown, because it is a heuristic rather
     than a formula and the reader deserves to see the rule they are being
     measured against: if you could not comfortably buy five of the thing,
     you cannot afford one.                                               */

  var RULE_OF_FIVE = { multiple: 5, statement: 'If you couldn’t comfortably buy five of it, you can’t afford one.' };

  function ruleOfFive(household, priceCents) {
    if (!Money.isEntered(priceCents)) {
      return Money.incomplete('Add a price to check this.', ['price']);
    }
    var cash = Schema.cashCents(household);
    if (!Money.isOk(cash)) {
      return Money.incomplete('Add your cash in Start Here to check this.', ['cashSavings']);
    }
    var needed = priceCents * RULE_OF_FIVE.multiple;
    var result = Money.safeDivide(cash.value, priceCents, {
      denominatorName: 'price',
      zeroReason: 'A free thing passes every rule.'
    });
    return Money.ok(Money.isOk(result) ? result.value : null, {
      rule: RULE_OF_FIVE,
      cashCents: cash.value,
      priceCents: priceCents,
      neededCents: needed,
      shortfallCents: Math.max(0, needed - cash.value),
      passes: cash.value >= needed,
      howManyYouCouldBuy: Money.isOk(result) ? Math.floor(result.value) : null
    });
  }

  return {
    CAR_RULE: CAR_RULE,
    RULE_OF_FIVE: RULE_OF_FIVE,
    hysaSwitch: hysaSwitch,
    recurringHabit: recurringHabit,
    DEFAULT_RETIREMENT_AGE: DEFAULT_RETIREMENT_AGE,
    DEFAULT_HABIT_YEARS: DEFAULT_HABIT_YEARS,
    costPerUse: costPerUse,
    usesToReach: usesToReach,
    carRule2038: carRule2038,
    ruleOfFive: ruleOfFive
  };
});
