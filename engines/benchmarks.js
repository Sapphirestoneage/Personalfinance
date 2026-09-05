/* ==========================================================================
   engines/benchmarks.js — the numbers that place a household against a
   convention, rather than against itself. BRIEF §4.1, DECISIONS.md D-072.
   --------------------------------------------------------------------------
     wealthMultiplier   what a dollar at your age becomes by 65 on the
                        wealth_multiplier.json return path
     monthlyToReach     the level monthly contribution that lands on a target
                        by 65, existing investments growing alongside
     milestones         monthlyToReach at $1M and $2M
     pawRatio           net worth over Stanley & Danko's expected net worth
                        (age × income ÷ 10): prodigious ≥ 2, under ≤ 0.5
     levelsOfWealth     the five levels, each check a Result, the level the
                        highest run of met checks from the bottom
     onePercentMore     what one more point of savings rate does to the FI
                        date and to the balance at 65
     humanCapital       present value of the pay still to come before the
                        stop age, at a real discount (an assumption)
     netWorthInYears    net worth over a year of spending
     all                every one of the above

   Two growth models live here on purpose and are not the same thing:
   engines/projection.js is THE loop for "a balance at one rate with
   contributions" and this file calls it for the FI date and the at-65
   balance. The wealth multiplier is a different model — a return that
   falls with age, parameterised in data — so its curve is computed here
   and nowhere else. Neither re-implements the other.

   Money is integer cents. Every missing input is a Result that says what
   is missing, never a zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js'),
      Projection: require('./projection.js'),
      Foo: require('./foo.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0,
      Projection: root.SLAF && root.SLAF.Projection,
      Foo: root.SLAF && root.SLAF.Foo
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Projection, deps.Foo);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Benchmarks = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Projection, Foo) {
  'use strict';

  var MONTHS = 12;
  var MILESTONE_CENTS = [100000000, 200000000];   /* $1M, $2M */

  function val(r) { return Money.isOk(r) ? r.value : null; }

  function ageOf(household, opts) {
    return opts && Money.isEntered(opts.age) ? opts.age : Schema.primaryAge(household);
  }

  /* ---- 1. The wealth multiplier ------------------------------------------- */

  /** The annual return the convention assumes at a given age. */
  function returnAt(table, age) {
    return Math.max(table.floorRate, table.startRate - table.decayPerYear * (age - table.startAge));
  }

  /** Monthly growth factors from `ageFrom` to the table's end age. */
  function curve(table, ageFrom) {
    var per = table.compoundingPerYear || MONTHS;
    var months = Math.max(0, Math.round((table.endAge - ageFrom) * per));
    var factors = [];
    for (var m = 0; m < months; m++) {
      factors.push(1 + returnAt(table, ageFrom + m / per) / per);
    }
    return { factors: factors, months: months, perYear: per };
  }

  function wealthMultiplier(household, tables, opts) {
    var table = tables && tables.wealthMultiplier;
    if (!table) return Money.incomplete('The wealth multiplier table is not loaded.', ['wealthMultiplier']);
    var age = ageOf(household, opts);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to see what a dollar at your age becomes.', ['dob']);
    if (age < table.startAge) age = table.startAge;
    var c = curve(table, age);
    var product = 1;
    for (var i = 0; i < c.factors.length; i++) product *= c.factors[i];
    return Money.ok(product, {
      age: age,
      endAge: table.endAge,
      months: c.months,
      returnNow: returnAt(table, age),
      referenceVersion: table.version
    });
  }

  /* ---- 2. Monthly to a target by 65 --------------------------------------- */

  /**
   * The level contribution at the start of each month that, with what is
   * already invested growing alongside it, lands on `targetCents` at the
   * end age. A contribution in month m is multiplied by every factor from
   * m onward, so the answer is (target − existing × M) ÷ Σ suffix products.
   */
  function monthlyToReach(household, tables, targetCents, opts) {
    var mult = wealthMultiplier(household, tables, opts);
    if (!Money.isOk(mult)) return mult;
    var investments = Schema.investmentsCents(household);
    if (!Money.isOk(investments)) return Money.incomplete('Add your investment balance to see the monthly figure.', ['investments']);
    if (!Money.isEntered(targetCents) || targetCents <= 0) return Money.incomplete('A target above zero is needed.', ['targetCents']);
    var table = tables.wealthMultiplier;
    var c = curve(table, mult.age);
    var existingGrowsTo = Math.round(investments.value * mult.value);
    if (c.months === 0) {
      return investments.value >= targetCents
        ? Money.ok(0, { alreadyThere: true, existingGrowsToCents: investments.value, months: 0, targetCents: targetCents })
        : Money.incomplete('The end age is here; there are no months left to contribute in.', ['dob']);
    }
    if (existingGrowsTo >= targetCents) {
      return Money.ok(0, { alreadyThere: true, existingGrowsToCents: existingGrowsTo, months: c.months, targetCents: targetCents });
    }
    /* Σ over m of Π_{k ≥ m} f_k, walked from the end so it is one pass. */
    var suffix = 1, sum = 0;
    for (var m = c.factors.length - 1; m >= 0; m--) {
      suffix *= c.factors[m];
      sum += suffix;
    }
    var monthly = Math.round((targetCents - existingGrowsTo) / sum);
    return Money.ok(monthly, {
      alreadyThere: false,
      existingGrowsToCents: existingGrowsTo,
      months: c.months,
      targetCents: targetCents,
      multiplier: mult.value,
      referenceVersion: table.version
    });
  }

  function milestones(household, tables, opts) {
    return MILESTONE_CENTS.map(function (t) {
      return { targetCents: t, result: monthlyToReach(household, tables, t, opts) };
    });
  }

  /* ---- 3. PAW / AAW / UAW -------------------------------------------------- */

  function pawRatio(household, tables, opts) {
    var table = tables && tables.levelsOfWealth;
    if (!table) return Money.incomplete('The levels-of-wealth table is not loaded.', ['levelsOfWealth']);
    var age = ageOf(household, opts);
    var gross = Schema.grossAnnualIncomeCents(household);
    var nw = Tier0.netWorth(household);
    var missing = [];
    if (!Money.isEntered(age)) missing.push('dob');
    if (!Money.isOk(gross)) missing.push('grossAnnualIncome');
    if (!Money.isOk(nw)) missing = missing.concat(nw.missing);
    if (missing.length) return Money.incomplete('Needs your age, income and net worth.', missing);
    var expected = Math.round(age * gross.value / table.paw.divisor);
    var ratio = Money.safeDivide(nw.value, expected, {
      denominatorName: 'expectedNetWorth',
      zeroReason: 'An expected net worth of zero cannot be compared against.'
    });
    if (!Money.isOk(ratio)) return ratio;
    var cls = ratio.value >= table.paw.prodigious ? 'prodigious'
      : ratio.value <= table.paw.under ? 'under' : 'average';
    return Money.ok(ratio.value, {
      expectedNetWorthCents: expected,
      actualNetWorthCents: nw.value,
      classification: cls,
      thresholds: { prodigious: table.paw.prodigious, under: table.paw.under },
      referenceVersion: table.version
    });
  }

  /* ---- 4. The five levels -------------------------------------------------- */

  function levelsOfWealth(household, tables, opts) {
    var table = tables && tables.levelsOfWealth;
    if (!table) return Money.incomplete('The levels-of-wealth table is not loaded.', ['levelsOfWealth']);
    var checks = table.levels.map(function (level) {
      var r;
      if (level.selfDeclared) {
        r = Money.incomplete('Self-declared. Nothing here decides it for you.', []);
        r.selfDeclared = true;
      } else if (level.id === 1) {
        r = levelOne(household, tables);
      } else if (level.id === 2) {
        var rates = Tier0.savingsRate(household, tables);
        var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
        r = Money.isOk(basis)
          ? Money.ok(basis.value >= level.savingsRate, { savingsRate: basis.value, threshold: level.savingsRate, variant: basis.variant })
          : basis;
      } else if (level.id === 3) {
        var inv = Schema.investmentsCents(household);
        var take = Tier0.takeHomeMonthlyCents(household, tables);
        if (!Money.isOk(inv)) r = inv;
        else if (!Money.isOk(take)) r = take;
        else {
          var rate = Schema.resolveAssumptions(household).expectedReturnRate;
          var growth = Math.round(inv.value * rate);
          r = Money.ok(growth >= take.value * MONTHS, { expectedGrowthCents: growth, annualTakeHomeCents: take.value * MONTHS, expectedReturnRate: rate });
        }
      } else if (level.id === 4) {
        var paw = pawRatio(household, tables, opts);
        var fi = Tier0.fireProgress(household, tables);
        if (!Money.isOk(paw)) r = paw;
        else if (!Money.isOk(fi)) r = fi;
        else r = Money.ok(paw.value >= level.pawMultiple && fi.value >= level.fiRatio,
          { pawRatio: paw.value, fiRatio: fi.value, pawMultiple: level.pawMultiple, fiRatioNeeded: level.fiRatio });
      } else {
        r = Money.incomplete('No test for this level.', []);
      }
      return { id: level.id, label: level.label, test: level.test, result: r,
        met: Money.isOk(r) ? r.value === true : null };
    });
    /* The level is the run of met checks from the bottom; an unknown check
       stops the count and is reported, not assumed either way. */
    var level = 0, stoppedBy = null;
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].met === true) level = checks[i].id;
      else { stoppedBy = checks[i]; break; }
    }
    return Money.ok(level, {
      checks: checks,
      stoppedBy: stoppedBy ? { id: stoppedBy.id, label: stoppedBy.label, unknown: stoppedBy.met === null, reason: stoppedBy.result.reason } : null,
      referenceVersion: table.version
    });
  }

  /** Level 1: no high-interest debt (by the FOO rule) and a starter fund in cash. */
  function levelOne(household, tables) {
    var rules = tables && tables.fooRules;
    if (!rules) return Money.incomplete('The FOO rules table is not loaded.', ['fooRules']);
    var cash = Schema.cashCents(household);
    if (!Money.isOk(cash)) return cash;
    var starter = Foo.starterTargetCents(household, rules.thresholds);
    if (!Money.isOk(starter)) return starter;
    var hi = Foo.highInterestDebts(household, rules.thresholds);
    if (hi.unrated.length && !hi.above.length) {
      return Money.incomplete(hi.unrated.length + ' debt' + (hi.unrated.length === 1 ? ' has' : 's have') + ' no rate, so high-interest cannot be ruled out.', ['debts']);
    }
    return Money.ok(hi.above.length === 0 && cash.value >= starter.value, {
      highInterestDebtCount: hi.above.length,
      starterTargetCents: starter.value,
      cashCents: cash.value,
      thresholdRate: rules.thresholds.highInterestDebtRate
    });
  }

  /* ---- 5. What one more point does ----------------------------------------- */

  function onePercentMore(household, tables, opts) {
    var gross = Schema.grossAnnualIncomeCents(household);
    var target = Tier0.fireNumber(household);
    var investments = Schema.investmentsCents(household);
    var age = ageOf(household, opts);
    var rates = Tier0.savingsRate(household, tables);
    var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    var missing = [];
    if (!Money.isOk(gross)) missing.push('grossAnnualIncome');
    if (!Money.isOk(target)) missing = missing.concat(target.missing);
    if (!Money.isOk(investments)) missing.push('investments');
    if (!Money.isOk(basis)) missing = missing.concat(basis.missing);
    if (missing.length) return Money.incomplete('Needs your income, expenses, investments and filing status.', missing);
    var assumptions = Schema.resolveAssumptions(household);
    var step = Math.round(gross.value * 0.01);
    var now = basis.annualSavingsCents, more = now + step;
    var yearsNow = Projection.yearsToTargetCents({ startCents: investments.value, targetCents: target.value, annualRate: assumptions.expectedReturnRate, annualContributionCents: now });
    var yearsMore = Projection.yearsToTargetCents({ startCents: investments.value, targetCents: target.value, annualRate: assumptions.expectedReturnRate, annualContributionCents: more });
    var out = {
      extraAnnualCents: step,
      savingsRateNow: basis.value,
      savingsRateMore: basis.value + 0.01,
      yearsToFiNow: val(yearsNow),
      yearsToFiMore: val(yearsMore),
      deltaYears: (Money.isOk(yearsNow) && Money.isOk(yearsMore)) ? yearsMore.value - yearsNow.value : null,
      at65: null
    };
    var endAge = (tables && tables.wealthMultiplier && tables.wealthMultiplier.endAge) || 65;
    if (Money.isEntered(age) && age < endAge) {
      var years = endAge - age;
      var fvNow = Projection.futureValueCents({ startCents: investments.value, annualRate: assumptions.expectedReturnRate, years: years, annualContributionCents: now });
      var fvMore = Projection.futureValueCents({ startCents: investments.value, annualRate: assumptions.expectedReturnRate, years: years, annualContributionCents: more });
      if (Money.isOk(fvNow) && Money.isOk(fvMore)) {
        out.at65 = { years: years, nowCents: fvNow.value, moreCents: fvMore.value, deltaCents: fvMore.value - fvNow.value };
      }
    }
    return Money.ok(step, out);
  }

  /* ---- 6. Human capital ---------------------------------------------------- */

  function humanCapital(household, tables, opts) {
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return Money.incomplete('Add your income to value the pay still to come.', ['grossAnnualIncome']);
    var age = ageOf(household, opts);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to count the years.', ['dob']);
    var stop = household.targets && household.targets.retireAge;
    if (!Money.isEntered(stop)) return Money.incomplete('Set the age you intend to stop, in FIRE Number.', ['retireAge']);
    var years = Math.max(0, Math.round(stop - age));
    var d = Schema.resolveAssumptions(household).humanCapitalDiscountRate;
    var pv = 0;
    for (var t = 1; t <= years; t++) pv += gross.value / Math.pow(1 + d, t);
    return Money.ok(Math.round(pv), { years: years, discountRate: d, annualIncomeCents: gross.value, stopAge: stop, undiscountedCents: gross.value * years });
  }

  /* ---- 7. Net worth in years ----------------------------------------------- */

  function netWorthInYears(household) {
    var nw = Tier0.netWorth(household);
    var monthly = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(nw)) return nw;
    if (!Money.isOk(monthly)) return monthly;
    return Money.safeDivide(nw.value, monthly.value * MONTHS, {
      denominatorName: 'monthlyExpenses',
      zeroReason: 'With no spending, net worth in years has no meaning.'
    });
  }

  function all(household, tables, opts) {
    return {
      wealthMultiplier: wealthMultiplier(household, tables, opts),
      milestones: milestones(household, tables, opts),
      pawRatio: pawRatio(household, tables, opts),
      levelsOfWealth: levelsOfWealth(household, tables, opts),
      onePercentMore: onePercentMore(household, tables, opts),
      humanCapital: humanCapital(household, tables, opts),
      netWorthInYears: netWorthInYears(household)
    };
  }

  return {
    MILESTONE_CENTS: MILESTONE_CENTS,
    returnAt: returnAt,
    curve: curve,
    wealthMultiplier: wealthMultiplier,
    monthlyToReach: monthlyToReach,
    milestones: milestones,
    pawRatio: pawRatio,
    levelsOfWealth: levelsOfWealth,
    onePercentMore: onePercentMore,
    humanCapital: humanCapital,
    netWorthInYears: netWorthInYears,
    all: all
  };
});
