/* ==========================================================================
   engines/goals.js — the Goal Costing Engine.
   --------------------------------------------------------------------------
   SPEC.md §9 item 6: built BEFORE Wedding, Dream or any other goal
   calculator, because they are the same shape and building them separately
   means building this three times. §13 says so outright — the Wedding calc is
   "structurally identical to Dream Calculator — one Goal Costing Engine both
   call into", and the Travel calc is "the entry-level tier of the full
   Vacation/Travel Calculator engine, not a separate codebase".

   A goal is a dated target, made of line items, funded monthly. Everything
   here follows from that:

       total      = sum of line items, or a single lump figure
       remaining  = total − saved
       required   = remaining / months until the date
       arrival    = months at the CURRENT contribution, which may be later

   The output that matters is not the total. It is whether the required
   monthly figure fits in the money you actually have spare — which is why
   this reads Cash Flow's surplus rather than asking again.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      CashFlow: require('./cashflow.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      CashFlow: root.SLAF && root.SLAF.CashFlow
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.CashFlow);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Goals = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, CashFlow) {
  'use strict';

  function templateById(table, id) {
    var list = (table && table.templates) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /* ---- What it costs ------------------------------------------------------
     Itemised wins when there are items with amounts; otherwise the lump
     figure. A goal with neither is incomplete, not zero.                  */

  function goalTotalCents(goal) {
    var items = (goal && goal.lineItems) || [];
    var summed = Money.sumCents(items.map(function (i) { return i.amountCents; }));
    if (summed.counted > 0) {
      return Money.ok(summed.total, {
        basis: 'itemised', itemsCounted: summed.counted, itemsTotal: items.length,
        itemsBlank: items.length - summed.counted
      });
    }
    if (Money.isEntered(goal && goal.lumpTargetCents)) {
      return Money.ok(goal.lumpTargetCents, { basis: 'lump' });
    }
    return Money.incomplete('Add what it costs — either a total or the pieces.',
      ['lineItems', 'lumpTarget']);
  }

  /* ---- Months between now and the target date ---------------------------- */

  function monthsUntil(isoDate, asOf) {
    if (!isoDate) return Money.incomplete('Add a date you want it by.', ['targetDate']);
    var target = new Date(isoDate + 'T00:00:00Z');
    if (isNaN(target.getTime())) return Money.incomplete('That date can’t be read.', ['targetDate']);
    var now = asOf ? new Date(asOf + 'T00:00:00Z') : new Date();
    var months = (target.getUTCFullYear() - now.getUTCFullYear()) * 12
      + (target.getUTCMonth() - now.getUTCMonth());
    /* Part of the current month still counts if the day hasn't passed. */
    if (target.getUTCDate() >= now.getUTCDate()) months += 0; else months -= 1;
    if (months <= 0) {
      return Money.incomplete('That date has passed, or is this month.', ['targetDate']);
    }
    return Money.ok(months);
  }

  /* ---- The plan ----------------------------------------------------------- */

  /**
   * plan(household, goal, tables, opts)
   * Returns a Result whose value is the REQUIRED monthly contribution.
   * Every part is independently incomplete-able: a goal with a total but no
   * date still reports its total and what is left to find.
   */
  function plan(household, goal, tables, opts) {
    var o = opts || {};
    var total = goalTotalCents(goal);
    if (!Money.isOk(total)) return total;

    var saved = Money.isEntered(goal.savedCents) ? goal.savedCents : 0;
    var remaining = Math.max(0, total.value - saved);
    var months = monthsUntil(goal.targetDate, o.asOf);

    var shared = {
      goalId: goal.id, name: goal.name,
      totalCents: total.value, basis: total.basis,
      itemsBlank: total.itemsBlank,
      savedCents: saved, remainingCents: remaining,
      alreadyThere: remaining === 0,
      monthsUntil: months
    };

    if (remaining === 0) {
      return Money.ok(0, Object.assign({ onTrack: true, fundedBy: 'already saved' }, shared));
    }
    if (!Money.isOk(months)) {
      return Money.incomplete(months.reason, months.missing);
    }

    var required = Math.ceil(remaining / months.value);
    var contributing = Money.isEntered(goal.monthlyContributionCents)
      ? goal.monthlyContributionCents : null;

    /* At the current contribution, when does it actually land? */
    var monthsAtCurrent = null, arrivesLate = null;
    if (Money.isEntered(contributing) && contributing > 0) {
      monthsAtCurrent = Math.ceil(remaining / contributing);
      arrivesLate = monthsAtCurrent > months.value;
    }

    /* Does the required figure fit in the money actually spare? Reads Cash
       Flow rather than asking for a surplus a second time. */
    var affordability = null;
    if (tables && tables.expenseCategories) {
      var flow = CashFlow.netCashFlow(household, tables.expenseCategories, tables);
      if (Money.isOk(flow)) {
        affordability = {
          surplusCents: flow.value,
          fitsInSurplus: required <= flow.value,
          shortPerMonthCents: Math.max(0, required - flow.value),
          shareOfSurplus: flow.value > 0 ? required / flow.value : null
        };
      }
    }

    return Money.ok(required, Object.assign({
      requiredMonthlyCents: required,
      contributingMonthlyCents: contributing,
      monthsAtCurrentContribution: monthsAtCurrent,
      arrivesLate: arrivesLate,
      monthsLate: arrivesLate ? monthsAtCurrent - months.value : null,
      onTrack: Money.isEntered(contributing) ? contributing >= required : null,
      shortfallPerMonthCents: Money.isEntered(contributing)
        ? Math.max(0, required - contributing) : null,
      affordability: affordability
    }, shared));
  }

  /**
   * Every goal at once, plus what they cost together. Two goals that each fit
   * the surplus can easily not fit it together, and that is exactly the thing
   * a per-goal view hides.
   */
  function planAll(household, tables, opts) {
    var goals = (household && household.goals) || [];
    if (!goals.length) {
      return Money.incomplete('Add something you’re saving for.', ['goals']);
    }
    var plans = goals.map(function (g) { return plan(household, g, tables, opts); });
    var requiredTotal = 0, counted = 0;
    plans.forEach(function (p) {
      if (Money.isOk(p) && Money.isEntered(p.requiredMonthlyCents)) {
        requiredTotal += p.requiredMonthlyCents; counted++;
      }
    });

    var affordability = null;
    if (tables && tables.expenseCategories) {
      var flow = CashFlow.netCashFlow(household, tables.expenseCategories, tables);
      if (Money.isOk(flow)) {
        affordability = {
          surplusCents: flow.value,
          fitsInSurplus: requiredTotal <= flow.value,
          shortPerMonthCents: Math.max(0, requiredTotal - flow.value)
        };
      }
    }

    return Money.ok(requiredTotal, {
      plans: plans, goalsCounted: counted, goalsTotal: goals.length,
      affordability: affordability
    });
  }

  /** Build a goal from a template — line-item labels, no amounts. */
  function fromTemplate(table, templateId, name) {
    var t = templateById(table, templateId);
    if (!t) return null;
    return Schema.createGoal({
      name: name || t.label,
      templateId: t.id,
      lineItems: (t.lineItems || []).map(function (label) {
        return Schema.createGoalLineItem({ label: label, amountCents: null });
      })
    });
  }

  return {
    templateById: templateById,
    goalTotalCents: goalTotalCents,
    monthsUntil: monthsUntil,
    plan: plan,
    planAll: planAll,
    fromTemplate: fromTemplate
  };
});
