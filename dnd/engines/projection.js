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
   * Whole years by default (the first year-end at or past the target);
   * `fractional: true` interpolates inside the crossing year so a small
   * change in the start moves the answer by a small amount instead of not
   * at all — the lens's "months bought / pushed" needs that resolution.
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
      var before = balance;
      balance = balance * (1 + rate) + contribution;
      if (balance >= o.targetCents) {
        var years = year;
        if (o.fractional && balance > before) {
          years = (year - 1) + (o.targetCents - before) / (balance - before);
        }
        return Money.ok(years, {
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

  /**
   * Years until `startCents`, growing at `annualRate` and drawn down by
   * `annualDrawCents` at the end of each year, is gone. The retiree's date:
   * the one drawdown loop the dashboard and the Decumulation room share.
   * Nothing drawn, or growth covering the draw, never empties — an ok
   * Result with `never: true` rather than a number. D-096.
   */
  function yearsUntilEmptyCents(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ startCents: o.startCents, annualDrawCents: o.annualDrawCents, annualRate: o.annualRate });
    if (missing.length) return Money.incomplete('Need a starting balance, a yearly draw and a return assumption.', missing);
    var maxYears = o.maxYears || DEFAULT_MAX_YEARS;
    if (o.annualDrawCents <= 0) return Money.ok(maxYears, { never: true, annualRate: o.annualRate });
    if (o.startCents <= 0) return Money.ok(0, { never: false, annualRate: o.annualRate });
    var balance = o.startCents;
    for (var year = 1; year <= maxYears; year++) {
      var before = balance;
      balance = balance * (1 + o.annualRate) - o.annualDrawCents;
      if (balance <= 0) {
        var frac = before > 0 ? Math.min(1, before * (1 + o.annualRate) / o.annualDrawCents) : 0;
        return Money.ok((year - 1) + frac, { never: false, annualRate: o.annualRate });
      }
      /* Growth outrunning the draw: it never empties. */
      if (balance >= before && year > 1) return Money.ok(maxYears, { never: true, annualRate: o.annualRate });
    }
    return Money.ok(maxYears, { never: true, annualRate: o.annualRate });
  }

  /**
   * Balance after `months` of MONTHLY compounding with a contribution added
   * at the end of each month. The annual version above is right for a yearly
   * savings figure; this is right for a habit — a subscription, a coffee, a
   * payment — which is monthly by nature and compounds monthly too.
   */
  function futureValueMonthlyCents(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      monthlyContributionCents: o.monthlyContributionCents,
      annualRate: o.annualRate, months: o.months
    });
    if (missing.length) {
      return Money.incomplete('Need an amount, a rate and a number of months.', missing);
    }
    if (o.months <= 0) return Money.incomplete('Need at least a month.', ['months']);
    var start = Money.isEntered(o.startCents) ? o.startCents : 0;
    var r = o.annualRate / 12;
    var grown = r === 0
      ? start + o.monthlyContributionCents * o.months
      : start * Math.pow(1 + r, o.months)
        + o.monthlyContributionCents * ((Math.pow(1 + r, o.months) - 1) / r);
    return Money.ok(Math.round(grown), {
      contributedCents: o.monthlyContributionCents * o.months,
      growthCents: Math.round(grown) - start - o.monthlyContributionCents * o.months,
      months: o.months, annualRate: o.annualRate
    });
  }

  /**
   * The path, not just the end: a balance and its contributions year by
   * year, growing at `annualRate` with `monthlyContributionCents` added each
   * month until `contributeYears`, then `withdrawAnnualCents` a year taken
   * out (a twelfth a month) until `years`. This is the compound loop every
   * growth chart draws — the FIRE room's line to retirement and past it —
   * so it lives here with the other one, rather than once per room.
   * Returns { years: [{ year, ageOrYear, balanceCents, contributedCents }] }.
   */
  function pathCents(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ annualRate: o.annualRate, years: o.years });
    if (missing.length) return Money.incomplete('Need a rate and a number of years.', missing);
    if (o.years <= 0) return Money.incomplete('Need at least a year.', ['years']);
    var start = Money.isEntered(o.startCents) ? o.startCents : 0;
    var monthly = Money.isEntered(o.monthlyContributionCents) ? o.monthlyContributionCents : 0;
    var stopAt = Money.isEntered(o.contributeYears) ? o.contributeYears : o.years;
    var draw = Money.isEntered(o.withdrawAnnualCents) ? o.withdrawAnnualCents / 12 : 0;
    var r = o.annualRate / 12;
    var balance = start, contributed = start;
    var rows = [{ year: 0, balanceCents: Math.round(balance), contributedCents: Math.round(contributed) }];
    var wentBroke = null;
    for (var m = 1; m <= Math.round(o.years * 12); m++) {
      balance *= (1 + r);
      if (m <= stopAt * 12) { balance += monthly; contributed += monthly; }
      else { balance -= draw; contributed -= draw; }
      if (balance < 0 && wentBroke === null) wentBroke = m / 12;
      if (m % 12 === 0) rows.push({ year: m / 12, balanceCents: Math.round(balance), contributedCents: Math.round(contributed) });
    }
    return Money.ok(Math.round(balance), { years: rows, contributeYears: stopAt, brokeAtYear: wentBroke, annualRate: o.annualRate });
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
    futureValueMonthlyCents: futureValueMonthlyCents,
    pathCents: pathCents,
    presentValueNeededCents: presentValueNeededCents,
    yearsToTargetCents: yearsToTargetCents,
    yearsUntilEmptyCents: yearsUntilEmptyCents
  };
});
