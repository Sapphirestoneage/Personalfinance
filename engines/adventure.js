/* ==========================================================================
   engines/adventure.js — five years, four ways, and what shocks them.
   --------------------------------------------------------------------------
   A sandbox over the household's real numbers: pick a strategy, walk five
   years one at a time, and see where the finish line moves. It WRITES NOTHING.
   Every figure it shows is derived from what the owning rooms already hold, so
   there is no field here for another room to fight over (D-017).

   Money is integer cents throughout. A missing baseline figure produces an
   incomplete result naming what is absent — never a zero, and never a silent
   `|| 0`, because a projection built on an assumed nought is a lie told
   confidently. DECISIONS.md D-167.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/money.js'), require('../shared/schema.js'));
  } else {
    root.SLAF = root.SLAF || {};
    root.SLAF.Adventure = factory(root.SLAF.Money, root.SLAF.Schema);
  }
}(typeof self !== 'undefined' ? self : this, function (Money, Schema) {
  'use strict';

  function table(tables) { return (tables && tables.adventurePaths) || null; }

  /** The four strategies, straight from data — never inlined here. */
  function paths(tables) { var t = table(tables); return t ? t.paths.slice() : []; }
  function pathById(tables, id) {
    return paths(tables).filter(function (p) { return p.id === id; })[0] || null;
  }
  function contingencies(tables) { var t = table(tables); return t ? t.contingencies.slice() : []; }

  /**
   * Where the household stands today, as the run's opening position.
   * Incomplete unless income, spending and a portfolio are all really known.
   */
  function baseline(household, tables) {
    /* Take-home, never gross: saving is what is left after tax AND
       spending, and the tax is estimated in one place (Schema, D-171). */
    var income = Schema.takeHomeAnnualCents(household, tables);
    var monthly = Schema.monthlyExpensesCents(household);
    var invested = Schema.investmentsCents(household);
    var cash = Schema.cashCents(household);

    var missing = [];
    if (!Money.isOk(income)) missing = missing.concat(income.missing && income.missing.length ? income.missing : ['grossAnnualIncome']);
    if (!Money.isOk(monthly)) missing.push('monthlyExpenses');
    if (!Money.isOk(invested) && !Money.isOk(cash)) missing.push('investments');
    if (missing.length) {
      return Money.incomplete('Five years needs what you earn, what you spend and what you have.', missing);
    }
    /* Cash counts towards the pot only when it is known; an unknown balance is
       not a zero balance, so it simply does not join in. */
    var pot = (Money.isOk(invested) ? invested.value : 0) + (Money.isOk(cash) ? cash.value : 0);
    return Money.ok({
      annualIncomeCents: income.value,
      grossAnnualIncomeCents: income.grossAnnualIncomeCents,
      estimatedTaxCents: income.estimatedTaxCents,
      annualSpendCents: monthly.value * 12,
      portfolioCents: pot
    });
  }

  /** Annual spending times 25 — the same arithmetic the FIRE room uses. */
  function targetCents(annualSpendCents, withdrawalRate) {
    return Math.round(annualSpendCents / withdrawalRate);
  }

  /**
   * Walk the years. Returns one row per year plus a summary.
   * `shockIds` is a list of contingency ids to apply on the way through.
   */
  function run(household, tables, opts) {
    var t = table(tables);
    if (!t) return Money.incomplete('The strategy table is not loaded.', ['adventurePaths']);
    var o = opts || {};
    var base = baseline(household, tables);
    if (!Money.isOk(base)) return base;

    var path = pathById(tables, o.pathId);
    if (!path) return Money.incomplete('Pick a way through first.', ['path']);

    var shocks = {};
    (o.shockIds || []).forEach(function (id) {
      var c = contingencies(tables).filter(function (x) { return x.id === id; })[0];
      if (c) shocks[c.id] = c;
    });

    var b = base.value;
    var income = b.annualIncomeCents;
    var spend = b.annualSpendCents;
    var pot = b.portfolioCents;
    /* The table's rate unless the caller asks for another - the three-way
       band line runs the same walk at the low and high returns. D-170. */
    var rate = Money.isEntered(o.returnRate) ? o.returnRate : t.returnRateReal;

    /* The house hack cuts housing, and housing is a stated share of spending -
       the share is an assumption and it is named on screen beside the result. */
    if (path.housingCutShare) {
      spend = Math.round(spend * (1 - (path.housingShareOfSpending * path.housingCutShare)));
    }

    var rows = [];
    for (var year = 1; year <= t.years; year++) {
      income = Math.round(income * (1 + path.annualRaiseReal));
      /* The hustle ramps: half in year one, full from year two, because a new
         side income rarely arrives at full size. */
      var extra = path.annualExtraIncomeCents * (year === 1 ? 0.5 : 1);

      if (shocks.inflation) spend = Math.round(spend * (1 + shocks.inflation.spendingDriftReal));
      if (shocks.raise && shocks.raise.shockYear === year) {
        income = Math.round(income * (1 + shocks.raise.incomeJumpShare));
      }

      var earned = income + extra;
      if (shocks.jobloss && shocks.jobloss.shockYear === year) {
        earned = Math.round(earned * (1 - shocks.jobloss.incomeLostShareOfYear));
      }

      var saved = earned - spend;
      pot = Math.round(pot * (1 + rate)) + saved;
      if (shocks.crash && shocks.crash.shockYear === year) {
        pot = Math.round(pot * (1 + shocks.crash.portfolioShockShare));
      }

      var target = targetCents(spend, t.withdrawalRate);
      rows.push({
        year: year,
        incomeCents: earned,
        spendCents: spend,
        savedCents: saved,
        portfolioCents: pot,
        targetCents: target,
        /* Negative saving is a real answer, not an error: it is what a job loss
           or runaway spending actually does, and hiding it would be the lie. */
        savingsRate: earned > 0 ? saved / earned : null,
        shareOfTarget: target > 0 ? pot / target : null
      });
    }

    var last = rows[rows.length - 1];
    return Money.ok({
      pathId: path.id,
      label: path.label,
      assumption: path.assumption,
      rows: rows,
      portfolioCents: last.portfolioCents,
      targetCents: last.targetCents,
      shareOfTarget: last.shareOfTarget,
      yearsAfter: yearsFrom(last.portfolioCents, last.targetCents, last.savedCents, rate)
    });
  }

  /**
   * Years from the end of the walk to the target, at the final year's saving.
   * Null when the target is already met, and null - never Infinity, and never
   * a cheerful large number - when nothing is being saved and it never arrives.
   */
  function yearsFrom(potCents, targetCents2, annualSavedCents, rate) {
    if (potCents >= targetCents2) return 0;
    if (annualSavedCents <= 0 && rate <= 0) return null;
    var pot = potCents, years = 0;
    while (pot < targetCents2 && years < 100) {
      pot = Math.round(pot * (1 + rate)) + annualSavedCents;
      years++;
      if (pot <= potCents && annualSavedCents <= 0) return null;   /* going nowhere */
    }
    return years >= 100 ? null : years;
  }

  /** Every path run on the same household, for the side-by-side. */
  function compare(household, tables, shockIds) {
    return paths(tables).map(function (p) {
      var r = run(household, tables, { pathId: p.id, shockIds: shockIds || [] });
      return { pathId: p.id, label: p.label, line: p.line, result: r };
    });
  }

  return {
    baseline: baseline,
    paths: paths,
    pathById: pathById,
    contingencies: contingencies,
    run: run,
    compare: compare,
    yearsFrom: yearsFrom,
    targetCents: targetCents
  };
}));
