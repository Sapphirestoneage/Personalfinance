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

   FIVE OUTPUTS ON EVERY BLOCK (D-253). The Decision Room asks the same five
   questions of anything you are weighing, and `plan` answers all five:

       what it costs      totalCents
       what it costs you  hours of your life at your real hourly wage, and
                          the months of FI it pushes back — both through
                          shared/lens.js, never a second conversion here
       when it lands      monthsUntil, and monthsAtCurrentContribution when
                          the two differ
       whether it fits    affordability, against Cash Flow's surplus
       can it be undone   undo: the cost and the months to reverse it, and
                          the verdict those two make — engines/reversibility
                          .js verdict(), which was a room and is a field

   None of the five is a new formula. That is the point of the shell: a
   block type adds a way to FILL these, never a sixth answer.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      CashFlow: require('./cashflow.js'),
      Lens: require('../shared/lens.js'),
      Reversibility: require('./reversibility.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      CashFlow: root.SLAF && root.SLAF.CashFlow,
      Lens: root.SLAF && root.SLAF.Lens,
      Reversibility: root.SLAF && root.SLAF.Reversibility
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.CashFlow, deps.Lens, deps.Reversibility);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Goals = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, CashFlow, Lens, Reversibility) {
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

  /* The calendar arithmetic lives in shared/schema.js, because a 0% promo's
     end date needs exactly the same sum and two copies would drift. §8. */
  function monthsUntil(isoDate, asOf) {
    return Schema.monthsUntil(isoDate, asOf, {
      field: 'targetDate',
      missingReason: 'Add a date you want it by.'
    });
  }

  /* ---- The plan ----------------------------------------------------------- */

  /**
   * plan(household, goal, tables, opts)
   * Returns a Result whose value is the REQUIRED monthly contribution.
   * Every part is independently incomplete-able: a goal with a total but no
   * date still reports its total and what is left to find.
   */
  /**
   * Can it be undone — the fifth output, on every block (D-253).
   *
   * Reversibility was a room that priced ONE named decision from a table of
   * questions. The table is still how a block can be STARTED, but the two
   * figures live on the block, so this is the pure part: two numbers and the
   * verdict they make. `verdict()` is the room's own, not a second rule.
   */
  function undoOf(goal, spendingCents, tables) {
    var cost = Money.isEntered(goal.undoCostCents) ? goal.undoCostCents : null;
    var months = Money.isEntered(goal.undoMonths) ? goal.undoMonths : null;
    /* A block started from a named decision keeps what the table knows that
       two figures cannot say: that some things do not come undone at any
       price. "Have a child" has no honest cost and is still answered. */
    var reversible = null, unpriced = false;
    if (goal.decisionId && Reversibility && tables) {
      var d = Reversibility.byId(tables, goal.decisionId);
      if (d) {
        reversible = d.reversible;
        /* The room's own rule: a decision the table gives no figure for is
           answered, and the answer is that it does not come undone. The
           child, the marriage. Not "not asked". */
        unpriced = d.undoCents === null;
      }
    }
    var asked = cost !== null || months !== null || reversible === false || unpriced;
    if (unpriced && cost === null) {
      return { asked: true, reversible: reversible, unpriced: true, costCents: null, months: months,
        fromDecisionId: goal.decisionId, monthsOfSpending: null,
        verdict: Reversibility ? Reversibility.VERDICTS.oneWay : null };
    }
    return {
      asked: asked,
      reversible: reversible,
      unpriced: unpriced,
      costCents: cost,
      months: months,
      fromDecisionId: goal.decisionId || null,
      monthsOfSpending: cost !== null && Money.isEntered(spendingCents) && spendingCents > 0
        ? cost / spendingCents : null,
      /* No answer is an open question, not an easy door. */
      verdict: asked && Reversibility ? Reversibility.verdict(cost, months, spendingCents, reversible) : null
    };
  }

  function plan(household, goal, tables, opts) {
    var o = opts || {};
    var spendNow = Schema.monthlyExpensesCents(household);
    var undoNow = undoOf(goal, Money.isOk(spendNow) ? spendNow.value : null, tables);
    var total = goalTotalCents(goal);
    /* A block with no price is not a block with no answers. A decision —
       change jobs, have a child — may never carry a figure, and the undo
       question is answered for it either way, so the incomplete result
       carries what IS known rather than nothing (D-253). */
    if (!Money.isOk(total)) {
      return Object.assign(Money.incomplete(total.reason, total.missing),
        { goalId: goal.id, name: goal.name, undo: undoNow, priced: false });
    }

    var saved = Money.isEntered(goal.savedCents) ? goal.savedCents : 0;
    var remaining = Math.max(0, total.value - saved);
    var months = monthsUntil(goal.targetDate, o.asOf);

    /* ---- The two outputs that are about you rather than the money ------
       Both ride on every return path below, including the already-there and
       the incomplete ones: what a thing costs in hours of your life does
       not depend on whether you have saved for it yet. */
    var lensHours = Lens ? Lens.apply(total.value, 'hours', household, tables) : null;
    var lensFi = Lens ? Lens.apply(total.value, 'pushed', household, tables) : null;
    var shared = {
      goalId: goal.id, name: goal.name,
      totalCents: total.value, basis: total.basis,
      itemsBlank: total.itemsBlank,
      savedCents: saved, remainingCents: remaining,
      alreadyThere: remaining === 0,
      monthsUntil: months,
      /* what it costs you, not what it costs */
      inLife: {
        hours: lensHours && Money.isOk(lensHours) ? lensHours.value : null,
        hoursDisplay: lensHours && Money.isOk(lensHours) ? lensHours.display : null,
        fiPushedDisplay: lensFi && Money.isOk(lensFi) ? lensFi.display : null,
        fiPushedMonths: lensFi && Money.isOk(lensFi) ? lensFi.value : null,
        /* One reason, not two: they fail for the same missing wage. */
        reason: lensHours && !Money.isOk(lensHours) ? lensHours.reason : null
      },
      /* can it be undone: the two figures the block carries, and what they
         make of each other. Not asked is not the same as reversible, so a
         block with neither figure gets a null verdict and says so. */
      undo: undoNow,
      priced: true
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
    var affordability = null, affordabilityReason = null;
    if (tables && tables.expenseCategories) {
      var flow = CashFlow.netCashFlow(household, tables.expenseCategories, tables);
      /* When there is no surplus to compare against, say what Cash Flow
         says — it names the thing to go and do. A room guessing its own
         reason here would send people to the wrong place (D-253). */
      if (!Money.isOk(flow)) affordabilityReason = flow.reason;
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
      affordability: affordability,
      affordabilityReason: affordabilityReason
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

    var affordability = null, affordabilityReason = null;
    if (tables && tables.expenseCategories) {
      var flow = CashFlow.netCashFlow(household, tables.expenseCategories, tables);
      /* When there is no surplus to compare against, say what Cash Flow
         says — it names the thing to go and do. A room guessing its own
         reason here would send people to the wrong place (D-253). */
      if (!Money.isOk(flow)) affordabilityReason = flow.reason;
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
