/* ==========================================================================
   engines/swan.js — the SWAN Number. SPEC.md §13, Tier 1.5.
   --------------------------------------------------------------------------
   "SWAN" is sleep well at night: the amount of liquid cash that stops the
   3am arithmetic. It is a SELF-REPORT, and this file is careful about what
   that means:

     • It is stored standalone (household.swan) and is never written by any
       calculation. Emergency Fund Coverage — cash ÷ monthly expenses — is
       computed in engines/tier0.js and stays there. The two are shown side
       by side and neither overwrites the other. That separation is the
       whole point of the tool.

     • A person can name it either way: a flat cash figure, or a number of
       months of expenses. Only the one they named is stored; the other is
       DERIVED on read, so it moves when their expenses move instead of
       going quietly stale.

     • Nothing here grades the number. data/liquidity_benchmarks.json gives
       the conventional 3/6/12-month bands so the figure has context, but a
       band is context, never a verdict — see that file's note.

   Every output is a Money Result. Nothing here coerces a missing input to
   zero: with no expenses entered, a months-based target has no dollar value
   and says so.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Reference: require('../shared/reference.js'),
      Tier0: require('./tier0.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Reference: root.SLAF && root.SLAF.Reference,
      Tier0: root.SLAF && root.SLAF.Tier0
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Reference, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Swan = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Reference, Tier0) {
  'use strict';

  var NOT_SET = 'You haven’t named a number yet.';

  function swanOf(household) {
    return Schema.createSwanTarget((household && household.swan) || {});
  }

  /** Has a target been named at all? A months-basis target of zero counts —
   *  "I sleep fine with nothing set aside" is an answer, not a blank. */
  function isSet(household) {
    var s = swanOf(household);
    if (s.basis === 'amount') return Money.isEntered(s.targetCents);
    if (s.basis === 'months') return Money.isEntered(s.targetMonths);
    return false;
  }

  /**
   * The target in cents, whichever way it was named.
   * A months-based target needs monthly expenses to become a dollar figure;
   * without them it is incomplete, not zero.
   */
  function targetCents(household) {
    var s = swanOf(household);
    if (s.basis === 'amount') {
      if (!Money.isEntered(s.targetCents)) return Money.incomplete(NOT_SET, ['swanTarget']);
      return Money.ok(s.targetCents, { basis: 'amount', note: s.note, setAt: s.setAt });
    }
    if (s.basis === 'months') {
      if (!Money.isEntered(s.targetMonths)) return Money.incomplete(NOT_SET, ['swanTarget']);
      var expenses = Schema.monthlyExpensesCents(household);
      if (!Money.isOk(expenses)) {
        return Money.incomplete(
          'You’ve asked for ' + s.targetMonths + ' months of cover — add your monthly '
            + 'expenses and that becomes a dollar figure.',
          ['monthlyExpenses']);
      }
      return Money.ok(Math.round(s.targetMonths * expenses.value), {
        basis: 'months',
        statedMonths: s.targetMonths,
        monthlyExpensesCents: expenses.value,
        expenseSource: expenses.source,
        note: s.note,
        setAt: s.setAt
      });
    }
    return Money.incomplete(NOT_SET, ['swanTarget']);
  }

  /**
   * The target expressed in months of expenses, whichever way it was named.
   * The mirror of targetCents(): an amount-based target needs expenses to
   * become a number of months.
   */
  function targetMonths(household) {
    var s = swanOf(household);
    if (s.basis === 'months') {
      if (!Money.isEntered(s.targetMonths)) return Money.incomplete(NOT_SET, ['swanTarget']);
      return Money.ok(s.targetMonths, { basis: 'months' });
    }
    var cents = targetCents(household);
    if (!Money.isOk(cents)) return cents;
    var expenses = Schema.monthlyExpensesCents(household);
    return Money.safeDivide(cents.value, Money.isOk(expenses) ? expenses.value : null, {
      numeratorName: 'swanTarget',
      denominatorName: 'monthlyExpenses',
      missingReason: 'Add your monthly expenses to see how many months that buys.',
      zeroReason: 'With monthly expenses of zero, that covers an unlimited number of months.'
    });
  }

  /**
   * The side-by-side SPEC.md §13 asks for: the feeling, the arithmetic, and
   * the distance between where the cash is and where the person wants it.
   *
   * value is the share of the target the cash currently covers (1 === there).
   * `gapCents` is signed: positive means still to go, negative means past it.
   */
  function compare(household) {
    var target = targetCents(household);
    var cash = Schema.cashCents(household);
    var computed = Tier0.emergencyFundMonths(household);

    if (!Money.isOk(target)) {
      return Money.incomplete(target.reason, target.missing);
    }
    if (!Money.isOk(cash)) {
      return Money.incomplete('Add your cash balance to compare it against your number.',
        ['cashSavings']);
    }

    var shortfall = target.value - cash.value;
    var ratio = Money.safeDivide(cash.value, target.value, {
      numeratorName: 'cashSavings',
      denominatorName: 'swanTarget',
      zeroReason: 'Your number is zero, so there is nothing to cover.'
    });

    return Money.ok(Money.isOk(ratio) ? ratio.value : null, {
      targetCents: target.value,
      targetBasis: target.basis,
      cashCents: cash.value,
      gapCents: shortfall,
      metTarget: shortfall <= 0,
      /* Computed Emergency Fund Coverage, untouched — the other half of the
         side-by-side. Carried through as its own Result so an incomplete
         one still reads as incomplete rather than as zero months. */
      computedMonths: computed,
      coverageRatio: ratio
    });
  }

  /**
   * How long the gap takes to close at a given monthly saving rate.
   * Cash, so no growth is assumed — a HYSA rate would change this by less
   * than the honesty of the estimate is worth.
   */
  function timeToTarget(gapCents, monthlySavingCents) {
    if (!Money.isEntered(gapCents)) {
      return Money.incomplete('Name your number first.', ['swanTarget']);
    }
    if (gapCents <= 0) {
      return Money.ok(0, { alreadyThere: true });
    }
    if (!Money.isEntered(monthlySavingCents)) {
      return Money.incomplete('Needs what you’re able to put aside each month.',
        ['monthlySaving']);
    }
    if (monthlySavingCents <= 0) {
      return Money.incomplete(
        'With nothing left over each month, the gap doesn’t close on its own.',
        ['monthlySaving']);
    }
    var months = gapCents / monthlySavingCents;
    return Money.ok(months, {
      gapCents: gapCents,
      monthlySavingCents: monthlySavingCents,
      alreadyThere: false
    });
  }

  /**
   * The conventional coverage milestones in dollars, and whether the cash
   * on hand and the stated number each clear them. Context for a
   * self-reported figure — see data/liquidity_benchmarks.json.
   */
  function milestones(household, table) {
    if (!table) return Money.incomplete('Liquidity benchmark table is not loaded.',
      ['liquidityBenchmarks']);
    var expenses = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(expenses)) {
      return Money.incomplete('Add your monthly expenses to see the usual milestones.',
        ['monthlyExpenses']);
    }
    var cash = Schema.cashCents(household);
    var target = targetCents(household);

    var rows = (table.milestones || []).map(function (m) {
      var cents = Math.round(m.months * expenses.value);
      return {
        months: m.months,
        label: m.label,
        cents: cents,
        reachedByCash: Money.isOk(cash) ? cash.value >= cents : null,
        reachedByTarget: Money.isOk(target) ? target.value >= cents : null
      };
    });
    return Money.ok(rows, {
      monthlyExpensesCents: expenses.value,
      referenceVersion: table.version,
      referenceId: table.id
    });
  }

  /** Which band the stated number sits in — context, not a grade. */
  function band(household, table) {
    var months = targetMonths(household);
    if (!Money.isOk(months)) return months;
    return Reference.lookupLiquidityBand(table, months.value);
  }

  return {
    isSet: isSet,
    targetCents: targetCents,
    targetMonths: targetMonths,
    compare: compare,
    timeToTarget: timeToTarget,
    milestones: milestones,
    band: band
  };
});
