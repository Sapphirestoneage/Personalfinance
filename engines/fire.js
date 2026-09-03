/* ==========================================================================
   engines/fire.js — one calculateFIRE(), parameterised by variant.
   --------------------------------------------------------------------------
   SPEC.md §8 is explicit: "calculateFIRE() parameterized by variant instead
   of five copies". So there is exactly one formula here —

       target = annual expenses × expenseFactor / withdrawal rate

   — and the variants differ only in what they feed it and what they do with
   the answer:

     standard / lean / chubby / fat   change expenseFactor
     coast                            discounts the standard target back to
                                      today, so it answers "what would I need
                                      now to stop contributing and still
                                      arrive on time?"
     barista                          subtracts part-time income from the
                                      expenses the pot has to cover

   The factors live in data/fire_variants.json, so adding a flavour is a data
   edit. Projection uses engines/projection.js — the same loop Tier 0 uses.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js'),
      Projection: require('./projection.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0,
      Projection: root.SLAF && root.SLAF.Projection
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Fire = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Projection) {
  'use strict';

  var MONTHS_PER_YEAR = 12;

  function variantById(table, id) {
    var list = (table && table.variants) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /**
   * calculateFIRE(household, tables, opts)
   *   opts.variantId          which flavour (default 'standard')
   *   opts.localOverrides     preview a different swrRate / expectedReturnRate
   *                           WITHOUT writing it (SPEC.md §12.2, §6)
   *   opts.expenseFactor      preview a different factor for this view only
   *   opts.coastTargetAge     Coast only
   *   opts.baristaAnnualIncomeCents  Barista only
   *
   * Returns a Result whose value is the target, in cents.
   */
  function calculateFIRE(household, tables, opts) {
    var o = opts || {};
    var table = tables && tables.fireVariants;
    if (!table) return Money.incomplete('FIRE variant table is not loaded.', ['fireVariants']);

    var variant = variantById(table, o.variantId || 'standard');
    if (!variant) return Money.incomplete('No FIRE variant with that id.', ['variant']);

    var expenses = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(expenses)) {
      return Money.incomplete('Add your monthly expenses to see your FIRE number.',
        ['monthlyExpenses']);
    }
    var assumptions = Schema.resolveAssumptions(household, o.localOverrides);
    var factor = Money.isEntered(o.expenseFactor) ? o.expenseFactor : variant.expenseFactor;

    /* Barista: part-time income covers part of the bill, so the pot only has
       to cover what's left. Nothing else about the formula changes. */
    var annualExpenses = expenses.value * MONTHS_PER_YEAR * factor;
    var baristaIncome = null;
    if (variant.mode === 'barista') {
      if (!Money.isEntered(o.baristaAnnualIncomeCents)) {
        return Money.incomplete('Add what you’d earn part-time to see this.',
          ['baristaAnnualIncome']);
      }
      baristaIncome = o.baristaAnnualIncomeCents;
      annualExpenses = annualExpenses - baristaIncome;
      if (annualExpenses <= 0) {
        return Money.ok(0, {
          variant: variant, coversEverything: true,
          annualExpensesCents: 0, baristaAnnualIncomeCents: baristaIncome,
          swrRate: assumptions.swrRate, referenceVersion: table.version
        });
      }
    }

    var base = Money.safeDivide(Math.round(annualExpenses), assumptions.swrRate, {
      denominatorName: 'swrRate',
      zeroReason: 'A withdrawal rate of zero has no finite FIRE number.'
    });
    if (!Money.isOk(base)) return base;

    var meta = {
      variant: variant,
      expenseFactor: factor,
      annualExpensesCents: Math.round(annualExpenses),
      swrRate: assumptions.swrRate,
      expectedReturnRate: assumptions.expectedReturnRate,
      expenseSource: expenses.source,
      baristaAnnualIncomeCents: baristaIncome,
      referenceVersion: table.version
    };

    /* Coast: the standard target, discounted back to today. You still have to
       cover your own costs until the target age — this is not "retire now". */
    if (variant.mode === 'coast') {
      var age = Schema.primaryAge(household);
      if (!Money.isEntered(age)) {
        return Money.incomplete('Add your date of birth to work out Coast FIRE.', ['dob']);
      }
      var targetAge = Money.isEntered(o.coastTargetAge)
        ? o.coastTargetAge : table.defaults.coastTargetAge;
      var years = targetAge - age;
      if (years <= 0) {
        return Money.incomplete('Your coast target age is already behind you.', ['coastTargetAge']);
      }
      var discounted = Projection.presentValueNeededCents({
        targetCents: Math.round(base.value),
        annualRate: assumptions.expectedReturnRate,
        years: years
      });
      if (!Money.isOk(discounted)) return discounted;
      return Money.ok(discounted.value, Object.assign({
        fullTargetCents: Math.round(base.value),
        coastTargetAge: targetAge, currentAge: age, yearsOfGrowth: years
      }, meta));
    }

    return Money.ok(Math.round(base.value), meta);
  }

  /** Progress toward one variant, plus how long it takes to get there. */
  function progressToward(household, tables, opts) {
    var target = calculateFIRE(household, tables, opts);
    if (!Money.isOk(target)) return target;

    var investments = Schema.investmentsCents(household);
    if (!Money.isOk(investments)) {
      return Money.incomplete('Add your investment balance to see progress.', ['investments']);
    }
    if (target.value === 0) {
      return Money.ok(1, { targetCents: 0, investmentsCents: investments.value, coversEverything: true });
    }

    var rates = Tier0.savingsRate(household, tables);
    var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    var assumptions = Schema.resolveAssumptions(household, (opts || {}).localOverrides);

    var eta = Money.isOk(basis)
      ? Projection.yearsToTargetCents({
          startCents: investments.value,
          targetCents: target.value,
          annualRate: assumptions.expectedReturnRate,
          annualContributionCents: basis.annualSavingsCents
        })
      : Money.incomplete('Add your income and filing status to project this.', basis.missing);

    return Money.ok(investments.value / target.value, {
      targetCents: target.value,
      investmentsCents: investments.value,
      variant: target.variant,
      yearsAway: eta,
      contributionBasis: Money.isOk(basis) ? basis.variant : null
    });
  }

  /** Every variant at once — the comparison that makes the flavours mean
   *  something. Each carries its own Result, so one being incomplete (Barista
   *  without a part-time income) never blocks the others. */
  function allVariants(household, tables, opts) {
    var table = tables && tables.fireVariants;
    if (!table) return {};
    var out = {};
    (table.variants || []).forEach(function (v) {
      var withVariant = Object.assign({}, opts || {}, { variantId: v.id });
      out[v.id] = {
        variant: v,
        target: calculateFIRE(household, tables, withVariant),
        progress: progressToward(household, tables, withVariant)
      };
    });
    return out;
  }

  return {
    variantById: variantById,
    calculateFIRE: calculateFIRE,
    progressToward: progressToward,
    allVariants: allVariants
  };
});
