/* ==========================================================================
   engines/accounts.js — where the money should go, and how much fits.
   --------------------------------------------------------------------------
   Two tools from SPEC.md §13 Tier 2 that share their tax machinery:

     Roth vs Traditional vs Brokerage — "after-tax outcomes given current vs
       assumed future tax rates. Surface the tax-rate assumption prominently
       — the whole comparison hinges on it."
     Solo 401k (SEP / S-corp) — "contribution limits and tax treatment across
       self-employed retirement structures. Store limits as versioned /
       year-tagged config."

   THE COMPARISON IS DONE ON EQUAL PRE-TAX COST, which is the only honest way
   to do it. Putting $7,000 into a Roth and $7,000 into a Traditional is not
   the same decision: the Roth one costs more take-home. Given the same
   pre-tax dollars P:

       Traditional   P grows, then all of it is taxed at the future rate
                     -> P(1+r)^n (1 − t_future)
       Roth          only P(1 − t_now) goes in, and nothing is taxed later
                     -> P(1 − t_now)(1+r)^n
       Brokerage     P(1 − t_now) goes in, and the GROWTH is taxed at the
                     capital-gains rate

   Which means Traditional beats Roth exactly when your future rate is lower
   than your rate today — and the room says that out loud, because it is the
   entire answer and everything else is arithmetic around it.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      SelfEmployed: require('./selfemployed.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      SelfEmployed: root.SLAF && root.SLAF.SelfEmployed
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.SelfEmployed);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Accounts = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, SelfEmployed) {
  'use strict';

  /* A middle long-term capital-gains rate. Deliberately an input with a
     default rather than a bracket table: the 0/15/20 thresholds are indexed
     annually and inventing 2026 ones would be worse than asking. */
  var DEFAULT_CAPITAL_GAINS_RATE = 0.15;

  /**
   * compareAccounts({ pretaxCents, currentTaxRate, futureTaxRate,
   *                   annualReturn, years, capitalGainsRate })
   * Every result is the AFTER-TAX amount in hand at the end.
   */
  function compareAccounts(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      pretaxCents: o.pretaxCents, currentTaxRate: o.currentTaxRate,
      futureTaxRate: o.futureTaxRate, annualReturn: o.annualReturn, years: o.years
    });
    if (missing.length) {
      return Money.incomplete(
        'Add the amount, both tax rates, a return assumption and a timeframe.', missing);
    }
    if (o.years < 0) return Money.incomplete('A timeframe can’t be negative.', ['years']);

    var capGains = Money.isEntered(o.capitalGainsRate)
      ? o.capitalGainsRate : DEFAULT_CAPITAL_GAINS_RATE;
    var growth = Math.pow(1 + o.annualReturn, o.years);
    var P = o.pretaxCents;

    /* Traditional: the whole pre-tax amount goes in and grows; the lot is
       taxed on the way out. */
    var tradGross = P * growth;
    var tradTax = tradGross * o.futureTaxRate;
    var traditional = Math.round(tradGross - tradTax);

    /* Roth: tax is paid now, so less goes in — but nothing is taxed later. */
    var rothIn = P * (1 - o.currentTaxRate);
    var roth = Math.round(rothIn * growth);

    /* Brokerage: same amount goes in as the Roth, but the growth is taxed. */
    var brokerageGross = rothIn * growth;
    var brokerageGain = brokerageGross - rothIn;
    var brokerageTax = brokerageGain * capGains;
    var brokerage = Math.round(brokerageGross - brokerageTax);

    var options = [
      { key: 'traditional', label: 'Traditional', afterTaxCents: traditional,
        goesInCents: Math.round(P), taxedLaterCents: Math.round(tradTax), taxedNowCents: 0 },
      { key: 'roth', label: 'Roth', afterTaxCents: roth,
        goesInCents: Math.round(rothIn), taxedLaterCents: 0,
        taxedNowCents: Math.round(P - rothIn) },
      { key: 'brokerage', label: 'Taxable brokerage', afterTaxCents: brokerage,
        goesInCents: Math.round(rothIn), taxedLaterCents: Math.round(brokerageTax),
        taxedNowCents: Math.round(P - rothIn) }
    ].sort(function (a, b) { return b.afterTaxCents - a.afterTaxCents; });

    var best = options[0];
    var runnerUp = options[1];

    return Money.ok(best.afterTaxCents, {
      options: options,
      byKey: options.reduce(function (m, x) { m[x.key] = x; return m; }, {}),
      bestKey: best.key,
      marginOverNextCents: best.afterTaxCents - runnerUp.afterTaxCents,
      /* The whole Roth-vs-Traditional question in one line. */
      ratesEqual: o.futureTaxRate === o.currentTaxRate,
      futureRateLower: o.futureTaxRate < o.currentTaxRate,
      currentTaxRate: o.currentTaxRate,
      futureTaxRate: o.futureTaxRate,
      capitalGainsRate: capGains,
      annualReturn: o.annualReturn,
      years: o.years,
      pretaxCents: P,
      growthMultiple: growth
    });
  }

  /* ---- Solo 401k ----------------------------------------------------------
     The classic error here is using 25%. That is the figure for a
     corporation contributing on W2 wages. A sole proprietor's base is net
     earnings AFTER the employer contribution itself, and 25/(1+0.25) = 20%.
     The rate lives in data/irs_limits_2026.json so it is stated, not buried. */

  function solo401k(opts) {
    var o = opts || {};
    var limits = o.limits;
    var seTable = o.seTaxTable;
    if (!limits || !seTable) {
      return Money.incomplete('Contribution limit tables are not loaded.', ['irsLimits']);
    }
    if (!Money.isEntered(o.netProfitCents)) {
      return Money.incomplete('Add your self-employment profit to see this.', ['netProfit']);
    }
    if (o.netProfitCents <= 0) {
      return Money.ok(0, {
        employeeCents: 0, employerCents: 0, totalCents: 0,
        noRoomBecause: 'There is no self-employment profit to contribute from.'
      });
    }

    var age = o.age;
    var overFifty = Money.isEntered(age) && age >= 50;

    /* The employee half: a straight deferral up to the elective limit. */
    var electiveLimit = Math.round(
      (limits.limits.elective401k + (overFifty ? limits.limits.elective401kCatchup50Plus : 0)) * 100);

    /* The employer half: 20% of net profit less half the SE tax. */
    var se = SelfEmployed.selfEmploymentTax(o.netProfitCents, o.filingStatus || 'single', seTable);
    if (!Money.isOk(se)) return se;
    var employerBase = Math.max(0, o.netProfitCents - se.deductibleHalfCents);
    var employerShare = limits.limits.soloEmployerShareSoleProprietor;
    var employerMax = Math.round(employerBase * employerShare);

    /* Both together are capped by the overall annual-additions limit, which
       the catch-up sits OUTSIDE of. */
    var additionsCap = Math.round(limits.limits.annualAdditions * 100);
    var catchUp = overFifty ? Math.round(limits.limits.elective401kCatchup50Plus * 100) : 0;

    var employee = Money.isEntered(o.plannedEmployeeCents)
      ? Math.min(o.plannedEmployeeCents, electiveLimit) : electiveLimit;
    var employer = employerMax;

    var cappedTotal = Math.min(employee + employer, additionsCap + catchUp);
    var hitCap = (employee + employer) > (additionsCap + catchUp);
    if (hitCap) employer = Math.max(0, cappedTotal - employee);

    return Money.ok(employee + employer, {
      employeeCents: employee,
      employeeLimitCents: electiveLimit,
      employerCents: employer,
      employerMaxCents: employerMax,
      employerBaseCents: employerBase,
      employerShare: employerShare,
      seTaxCents: se.value,
      seDeductibleHalfCents: se.deductibleHalfCents,
      totalCents: employee + employer,
      annualAdditionsCapCents: additionsCap,
      catchUpCents: catchUp,
      overFifty: overFifty,
      hitCap: hitCap,
      shareOfProfit: o.netProfitCents > 0 ? (employee + employer) / o.netProfitCents : null,
      referenceVersion: limits.version
    });
  }

  return {
    DEFAULT_CAPITAL_GAINS_RATE: DEFAULT_CAPITAL_GAINS_RATE,
    compareAccounts: compareAccounts,
    solo401k: solo401k
  };
});
