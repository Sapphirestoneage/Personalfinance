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
    costPerUse: costPerUse,
    usesToReach: usesToReach,
    carRule2038: carRule2038,
    ruleOfFive: ruleOfFive
  };
});
