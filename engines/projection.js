/* ==========================================================================
   engines/projection.js — compound growth with contributions.
   --------------------------------------------------------------------------
   Extracted so there is ONE of these, per SPEC.md §8. Tier 0's time-to-FIRE
   and every FIRE variant now call the same loop; before this, Tier 0 had it
   inline and the FIRE variants would have grown a second copy.

   Deliberately a year-by-year loop rather than a closed form. It has to stay
   correct when the contribution is zero or negative — a closed form quietly
   returns a complex or negative number there — and it is the same shape the
   debt amortisation uses.

   Cents in, cents out. Rates are decimal fractions.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports)
    ? require('../shared/money.js')
    : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Projection = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var DEFAULT_MAX_YEARS = 100;

  /**
   * Balance after `years` of annual compounding with a contribution added at
   * the end of each year.
   */
  function futureValueCents(opts) {
    var o = opts || {};
    if (!Money.isEntered(o.startCents) || !Money.isEntered(o.annualRate)
        || !Money.isEntered(o.years)) {
      return Money.incomplete('Need a starting balance, a rate and a number of years.',
        ['startCents', 'annualRate', 'years']);
    }
    var contribution = Money.isEntered(o.annualContributionCents) ? o.annualContributionCents : 0;
    var balance = o.startCents;
    for (var y = 0; y < o.years; y++) {
      balance = balance * (1 + o.annualRate) + contribution;
    }
    return Money.ok(Math.round(balance));
  }

  /**
   * What you would need TODAY for it to reach `targetCents` in `years` with
   * NO further contributions. This is the whole of Coast FIRE.
   */
  function presentValueNeededCents(opts) {
    var o = opts || {};
    if (!Money.isEntered(o.targetCents) || !Money.isEntered(o.annualRate)
        || !Money.isEntered(o.years)) {
      return Money.incomplete('Need a target, a rate and a number of years.',
        ['targetCents', 'annualRate', 'years']);
    }
    if (o.years < 0) {
      return Money.incomplete('That date has already passed.', ['years']);
    }
    var growth = Math.pow(1 + o.annualRate, o.years);
    if (growth <= 0) {
      return Money.incomplete('That return assumption can’t be projected.', ['annualRate']);
    }
    return Money.ok(Math.round(o.targetCents / growth));
  }

  /**
   * Years until `startCents` reaches `targetCents`, contributing annually.
   * Returns an incomplete Result — never a number — when it never gets there.
   */
  function yearsToTargetCents(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      startCents: o.startCents, targetCents: o.targetCents, annualRate: o.annualRate
    });
    if (missing.length) {
      return Money.incomplete('Need a starting balance, a target and a return assumption.', missing);
    }
    var contribution = Money.isEntered(o.annualContributionCents) ? o.annualContributionCents : 0;
    var maxYears = o.maxYears || DEFAULT_MAX_YEARS;
    var rate = o.annualRate;

    if (o.startCents >= o.targetCents) {
      return Money.ok(0, { alreadyThere: true, annualRate: rate });
    }
    if (contribution <= 0 && rate <= 0) {
      return Money.incomplete(
        'At this savings rate and return assumption, the balance never reaches the target.',
        ['annualContributionCents']);
    }

    var balance = o.startCents;
    for (var year = 1; year <= maxYears; year++) {
      balance = balance * (1 + rate) + contribution;
      if (balance >= o.targetCents) {
        return Money.ok(year, {
          annualRate: rate,
          annualContributionCents: contribution,
          projectedBalanceCents: Math.round(balance)
        });
      }
      if (balance <= 0) {
        return Money.incomplete(
          'At this savings rate and return assumption, the balance never reaches the target.',
          ['annualContributionCents']);
      }
    }
    return Money.incomplete('More than ' + maxYears + ' years at these assumptions.',
      ['annualContributionCents']);
  }

  /* ---- Level-payment loans ----------------------------------------------
     A fixed payment over a fixed term with no extra payments HAS a closed
     form, and using it here is correct — unlike the payoff simulation in
     engines/debt.js, where a freed-up minimum rolls onto the next debt and
     no closed form exists. Both live in the codebase on purpose; this is the
     simple case and that is the general one.                              */

  /** The level monthly payment that clears `principalCents` over `months`. */
  function levelPaymentCents(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      principalCents: o.principalCents, annualRate: o.annualRate, months: o.months
    });
    if (missing.length) {
      return Money.incomplete('Need an amount, a rate and a term.', missing);
    }
    if (o.months <= 0) return Money.incomplete('A term needs to be at least a month.', ['months']);
    if (o.principalCents <= 0) return Money.ok(0, { interestFreeCents: 0 });

    var r = o.annualRate / 12;
    /* At 0% it is simply the amount split evenly. */
    var exact = r === 0
      ? o.principalCents / o.months
      : (o.principalCents * r) / (1 - Math.pow(1 + r, -o.months));
    /* Totals come from the payment you actually make, not the unrounded one.
       A cent of rounding times 36 months is a real difference, and the
       figure has to reconcile with the payment shown beside it. */
    var payment = Math.round(exact);
    return Money.ok(payment, {
      totalPaidCents: payment * o.months,
      totalInterestCents: payment * o.months - o.principalCents
    });
  }

  /** The most you could borrow at `paymentCents` a month over `months`. */
  function principalForPaymentCents(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      paymentCents: o.paymentCents, annualRate: o.annualRate, months: o.months
    });
    if (missing.length) {
      return Money.incomplete('Need a payment, a rate and a term.', missing);
    }
    if (o.months <= 0) return Money.incomplete('A term needs to be at least a month.', ['months']);
    var r = o.annualRate / 12;
    var principal = r === 0
      ? o.paymentCents * o.months
      : o.paymentCents * (1 - Math.pow(1 + r, -o.months)) / r;
    return Money.ok(Math.round(principal));
  }

  return {
    DEFAULT_MAX_YEARS: DEFAULT_MAX_YEARS,
    levelPaymentCents: levelPaymentCents,
    principalForPaymentCents: principalForPaymentCents,
    futureValueCents: futureValueCents,
    presentValueNeededCents: presentValueNeededCents,
    yearsToTargetCents: yearsToTargetCents
  };
});
