/* ==========================================================================
   engines/tier0.js — the nine Tier 0 outputs.
   --------------------------------------------------------------------------
   SPEC.md §9 item 3: pure functions off the registry. Every one takes the
   household (plus the reference tables it needs) and returns a Result. None
   of them read the DOM, none of them store anything, and none of them fall
   back to zero when an input is missing.

   One formula, one function (SPEC.md §8): DTI and Debt-to-Asset both go
   through the same total-debt roll-up in schema.js rather than recomputing
   it; the two savings-rate variants share one numerator.

   Money in, money out, in integer cents. Rates as decimal fractions.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Reference: require('../shared/reference.js'),
      Projection: require('./projection.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Reference: root.SLAF && root.SLAF.Reference,
      Projection: root.SLAF && root.SLAF.Projection
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Reference, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tier0 = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Reference, Projection) {
  'use strict';

  var MONTHS_PER_YEAR = 12;

  /* ---------------------------------------------------------------- 1. Net worth
     (cash + investments) − debt. Component parts come back alongside the
     total so the room can draw the asset/liability bars SPEC.md §13 asks
     for without recomputing anything.                                     */

  function netWorth(household) {
    var assets = Schema.totalAssetsCents(household);
    var debt = Schema.totalDebtCents(household);

    if (!Money.isOk(assets) && !Money.isOk(debt)) {
      return Money.incomplete('Add what you own and what you owe to see this.',
        ['assets', 'debts']);
    }
    if (!Money.isOk(assets)) {
      return Money.incomplete('Add your cash and investment balances to see this.', ['assets']);
    }
    if (!Money.isOk(debt)) {
      return Money.incomplete('Add your total debt to see this. Enter 0 if you have none.', ['debts']);
    }
    return Money.ok(assets.value - debt.value, {
      totalAssetsCents: assets.value,
      totalDebtCents: debt.value,
      cash: Schema.cashCents(household),
      investments: Schema.investmentsCents(household)
    });
  }

  /* ------------------------------------------------------- Estimated taxes
     Flat effective-rate lookup, never inline math. SPEC.md §10.           */

  function estimatedAnnualTaxCents(household, tables) {
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return gross;

    var rate = Reference.lookupEffectiveTaxRate(
      tables && tables.effectiveTaxRates,
      gross.value / 100,
      household && household.filingStatus
    );
    if (!Money.isOk(rate)) return rate;

    return Money.ok(Math.round(gross.value * rate.value), {
      effectiveRate: rate.value,
      referenceVersion: rate.referenceVersion,
      precision: rate.precision
    });
  }

  /* ------------------------------------------------------ Take-home pay
     Gross minus the estimated tax, as a month. This is the money that can
     actually be pointed at anything — the FOO ladder's waterfall pours it,
     and for a long time poured the pre-tax figure instead, which put every
     step date about a third too early. BRIEF §1.1 item 1.
     One formula: the tax comes from estimatedAnnualTaxCents(), never a
     second lookup.                                                        */

  function takeHomeMonthlyCents(household, tables) {
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return gross;
    var tax = estimatedAnnualTaxCents(household, tables);
    if (!Money.isOk(tax)) return tax;
    return Money.ok(Math.round((gross.value - tax.value) / MONTHS_PER_YEAR), {
      grossAnnualIncomeCents: gross.value,
      estimatedTaxCents: tax.value,
      effectiveRate: tax.effectiveRate,
      referenceVersion: tax.referenceVersion
    });
  }

  /* ------------------------------------------------------- 2. Savings rate
     (gross − annual expenses − estimated taxes) / gross.

     SPEC.md §12.1 (RESOLVED: build both). One numerator, two variants — the
     including-match figure is the same numerator plus employer match
     dollars. They are never two separately maintained calculations, and
     every caller must say which one it is showing.

     If no employer match has been entered, the including-match variant is
     incomplete rather than silently equal to the excluding-match one: an
     unanswered match is not a match of zero.                              */

  function savingsRate(household, tables) {
    var gross = Schema.grossAnnualIncomeCents(household);
    var monthlyExpenses = Schema.monthlyExpensesCents(household);

    if (!Money.isOk(gross)) {
      return { excludingMatch: gross, includingMatch: gross };
    }
    if (!Money.isOk(monthlyExpenses)) {
      return { excludingMatch: monthlyExpenses, includingMatch: monthlyExpenses };
    }
    var tax = estimatedAnnualTaxCents(household, tables);
    if (!Money.isOk(tax)) {
      return { excludingMatch: tax, includingMatch: tax };
    }

    var annualExpenses = monthlyExpenses.value * MONTHS_PER_YEAR;
    var savedExcludingMatch = gross.value - annualExpenses - tax.value;

    var shared = {
      grossAnnualIncomeCents: gross.value,
      annualExpensesCents: annualExpenses,
      estimatedTaxCents: tax.value,
      effectiveRate: tax.effectiveRate,
      referenceVersion: tax.referenceVersion,
      expenseSource: monthlyExpenses.source
    };

    var excluding = Money.safeDivide(savedExcludingMatch, gross.value, {
      denominatorName: 'grossAnnualIncome',
      zeroReason: 'A gross income of zero can’t produce a savings rate.'
    });
    if (Money.isOk(excluding)) {
      excluding = Money.ok(excluding.value,
        Object.assign({ annualSavingsCents: savedExcludingMatch, variant: 'excludingMatch' }, shared));
    }

    var match = Schema.employerMatchCents(household);
    var including;
    if (!Money.isOk(match)) {
      including = Money.incomplete(
        'Add your employer match to see the rate including those dollars.',
        ['employerMatch']);
    } else {
      var savedIncludingMatch = savedExcludingMatch + match.value;
      including = Money.safeDivide(savedIncludingMatch, gross.value, {
        denominatorName: 'grossAnnualIncome',
        zeroReason: 'A gross income of zero can’t produce a savings rate.'
      });
      if (Money.isOk(including)) {
        including = Money.ok(including.value, Object.assign({
          annualSavingsCents: savedIncludingMatch,
          employerMatchCents: match.value,
          variant: 'includingMatch'
        }, shared));
      }
    }

    return { excludingMatch: excluding, includingMatch: including };
  }

  /* --------------------------------------------- 3. Emergency fund coverage
     cash / monthly expenses, in months. Cash ALONE — not cash plus
     investments. SPEC.md §13 input spec.                                  */

  function emergencyFundMonths(household) {
    var cash = Schema.cashCents(household);
    var expenses = Schema.monthlyExpensesCents(household);
    var result = Money.safeDivide(
      Money.isOk(cash) ? cash.value : null,
      Money.isOk(expenses) ? expenses.value : null,
      {
        numeratorName: 'cashSavings',
        denominatorName: 'monthlyExpenses',
        missingReason: 'Add your cash balance and monthly expenses to see this.',
        zeroReason: 'With monthly expenses of zero, your cash covers an unlimited number of months.'
      }
    );
    if (Money.isOk(result)) {
      return Money.ok(result.value, {
        cashCents: cash.value,
        monthlyExpensesCents: expenses.value,
        expenseSource: expenses.source
      });
    }
    return result;
  }

  /* ------------------------------------------------- 4. Debt-to-income ratio
     monthly debt payments / monthly GROSS income. Gross, not net — the
     28%/36% thresholds are calibrated to gross. SPEC.md §13.             */

  function debtToIncome(household) {
    var payments = Schema.monthlyDebtPaymentsCents(household);
    var gross = Schema.grossAnnualIncomeCents(household);
    var monthlyGross = Money.isOk(gross) ? gross.value / MONTHS_PER_YEAR : null;

    var result = Money.safeDivide(
      Money.isOk(payments) ? payments.value : null,
      monthlyGross,
      {
        numeratorName: 'monthlyDebtPayments',
        denominatorName: 'grossAnnualIncome',
        missingReason: 'Add your income and monthly debt payments to see this.',
        zeroReason: 'A gross income of zero can’t produce a debt-to-income ratio.'
      }
    );
    if (Money.isOk(result)) {
      return Money.ok(result.value, {
        monthlyDebtPaymentsCents: payments.value,
        monthlyGrossIncomeCents: monthlyGross
      });
    }
    return result;
  }

  /* ------------------------------------------------------ 5. FIRE number
     annual expenses / SWR. At the default 4% SWR this is expenses × 25;
     the division is the real formula so a different SWR just works.
     SPEC.md §12.2 — the rate is an Assumption-class field, never inlined.
     `localOverrides` lets a room preview a different SWR without writing
     it to storage (SPEC.md §6).                                          */

  function fireNumber(household, localOverrides) {
    var expenses = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(expenses)) {
      return Money.incomplete('Add your monthly expenses to see your FIRE number.',
        ['monthlyExpenses']);
    }
    var assumptions = Schema.resolveAssumptions(household, localOverrides);
    var annualExpenses = expenses.value * MONTHS_PER_YEAR;

    var result = Money.safeDivide(annualExpenses, assumptions.swrRate, {
      denominatorName: 'swrRate',
      zeroReason: 'A withdrawal rate of zero has no finite FIRE number.'
    });
    if (!Money.isOk(result)) return result;

    return Money.ok(Math.round(result.value), {
      annualExpensesCents: annualExpenses,
      swrRate: assumptions.swrRate,
      expenseSource: expenses.source
    });
  }

  /* ------------------------------------------------- 6. FIRE progress + ETA
     investments / FIRE number, plus a years-to-FI projection that needs the
     expected-return assumption.                                           */

  function fireProgress(household, tables, localOverrides) {
    var target = fireNumber(household, localOverrides);
    var investments = Schema.investmentsCents(household);

    var result = Money.safeDivide(
      Money.isOk(investments) ? investments.value : null,
      Money.isOk(target) ? target.value : null,
      {
        numeratorName: 'investments',
        denominatorName: 'monthlyExpenses',
        missingReason: 'Add your investment balance and monthly expenses to see this.',
        zeroReason: 'A FIRE number of zero means you are already there.'
      }
    );
    if (!Money.isOk(result)) return result;

    var assumptions = Schema.resolveAssumptions(household, localOverrides);
    return Money.ok(result.value, {
      investmentsCents: investments.value,
      fireNumberCents: target.value,
      swrRate: assumptions.swrRate,
      timeToFire: yearsToFire(household, tables, localOverrides)
    });
  }

  /**
   * Years until investments reach the FIRE number, compounding annually at
   * the expected-return assumption and adding this year's savings each year.
   *
   * Deliberately a year-by-year loop, not a closed form: it stays correct
   * when the contribution is zero or negative, and it is the same shape the
   * Debt Calculator's amortisation loop will need (SPEC.md §10).
   */
  function yearsToFire(household, tables, localOverrides) {
    var target = fireNumber(household, localOverrides);
    var investments = Schema.investmentsCents(household);
    if (!Money.isOk(target) || !Money.isOk(investments)) {
      return Money.incomplete('Add your expenses and investment balance to project this.',
        ['monthlyExpenses', 'investments']);
    }

    var rates = savingsRate(household, tables);
    /* Contribute the including-match figure when it is available — those
       dollars really do land in the account — and fall back to the
       excluding-match figure otherwise. Which basis was used is reported
       back so the room can say so. */
    var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    if (!Money.isOk(basis)) {
      return Money.incomplete('Add your income, expenses and filing status to project this.',
        basis.missing);
    }

    var assumptions = Schema.resolveAssumptions(household, localOverrides);

    /* One projection loop for the whole app — engines/projection.js. */
    var projected = Projection.yearsToTargetCents({
      startCents: investments.value,
      targetCents: target.value,
      annualRate: assumptions.expectedReturnRate,
      annualContributionCents: basis.annualSavingsCents
    });
    if (!Money.isOk(projected)) return projected;
    return Money.ok(projected.value, {
      expectedReturnRate: projected.annualRate,
      annualContributionCents: projected.annualContributionCents,
      contributionBasis: basis.variant,
      alreadyThere: projected.alreadyThere === true,
      projectedBalanceCents: projected.projectedBalanceCents
    });
  }

  /* --------------------------------------------- 7. Net worth percentile
     Straight to the reference table. A negative net worth comes back as
     'below_chart', never an extrapolated percentile. SPEC.md §6.        */

  function netWorthPercentile(household, tables) {
    var nw = netWorth(household);
    if (!Money.isOk(nw)) {
      return Money.incomplete('Add your balances to see where this ranks.', nw.missing);
    }
    var age = Schema.primaryAge(household);
    return Reference.lookupNetWorthPercentile(
      tables && tables.netWorthPercentiles, nw.value / 100, age);
  }

  /* --------------------------------------- 8. Retirement benchmark check
     investments / gross income, against the age-bucketed milestone table. */

  function retirementBenchmark(household, tables) {
    var investments = Schema.investmentsCents(household);
    var gross = Schema.grossAnnualIncomeCents(household);

    var actual = Money.safeDivide(
      Money.isOk(investments) ? investments.value : null,
      Money.isOk(gross) ? gross.value : null,
      {
        numeratorName: 'investments',
        denominatorName: 'grossAnnualIncome',
        missingReason: 'Add your income and investment balance to see this.',
        zeroReason: 'A gross income of zero can’t produce a savings multiple.'
      }
    );
    if (!Money.isOk(actual)) return actual;

    var age = Schema.primaryAge(household);
    var target = Reference.lookupRetirementMultiple(tables && tables.retirementMilestones, age);

    if (!Money.isOk(target)) {
      /* The multiple itself is still a real, useful number even when the
         table cannot supply a target for this age. */
      return Money.ok(actual.value, {
        targetMultiple: null,
        targetStatus: target.status,
        targetReason: target.reason,
        age: age
      });
    }
    return Money.ok(actual.value, {
      targetMultiple: target.value,
      onTrack: actual.value >= target.value,
      shortfallCents: actual.value >= target.value
        ? 0
        : Math.round((target.value - actual.value) * gross.value),
      age: age,
      referenceVersion: target.referenceVersion
    });
  }

  /* --------------------------------------------------------- All nine ----
     One call, everything a Tier 0 surface needs. FOO placement (output 9)
     lives in engines/foo.js and is folded in here.                       */

  function computeAll(household, tables, localOverrides) {
    var Foo = (typeof module === 'object' && module.exports)
      ? require('./foo.js')
      : (typeof self !== 'undefined' && self.SLAF && self.SLAF.Foo);

    var rates = savingsRate(household, tables);
    var foo = Foo ? Foo.evaluate(household, tables) : null;

    return {
      netWorth: netWorth(household),
      savingsRateExcludingMatch: rates.excludingMatch,
      savingsRateIncludingMatch: rates.includingMatch,
      emergencyFundMonths: emergencyFundMonths(household),
      debtToIncome: debtToIncome(household),
      fireNumber: fireNumber(household, localOverrides),
      fireProgress: fireProgress(household, tables, localOverrides),
      netWorthPercentile: netWorthPercentile(household, tables),
      retirementBenchmark: retirementBenchmark(household, tables),
      foo: foo
    };
  }

  return {
    netWorth: netWorth,
    estimatedAnnualTaxCents: estimatedAnnualTaxCents,
    takeHomeMonthlyCents: takeHomeMonthlyCents,
    savingsRate: savingsRate,
    emergencyFundMonths: emergencyFundMonths,
    debtToIncome: debtToIncome,
    fireNumber: fireNumber,
    fireProgress: fireProgress,
    yearsToFire: yearsToFire,
    netWorthPercentile: netWorthPercentile,
    retirementBenchmark: retirementBenchmark,
    computeAll: computeAll
  };
});
