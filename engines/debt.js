/* ==========================================================================
   engines/debt.js — the Debt Calculator engine.
   --------------------------------------------------------------------------
   SPEC.md §9 item 5. This is the engine, not a room: the Credit Card calc is
   a FILTERED VIEW of it (see creditCardsOnly), the Convenience Method is one
   of its four orderings, and the Student Loan payoff question is a
   single-debt run through the same loop. None of those is a second build.

   SPEC.md §10: amortisation with extra payments is a month-by-month
   simulation, not a closed form. It has to be — the snowball effect means a
   freed-up minimum rolls onto the next debt the month after a payoff, which
   no closed-form formula expresses.

   Everything is integer cents. Interest accrues monthly at rate/12. Rules,
   strategies and the emotional-priority ranking all come from
   data/debt_rules.json, so adding a strategy is a data edit.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Debt = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  /* ---- Minimum payments -------------------------------------------------
     SPEC.md §13: issuer formulas vary, so don't hardcode one. A minimum the
     user actually read off a statement always wins over anything derived. */

  function minimumRuleFor(debtType, rules) {
    var list = (rules && rules.minimumPayment && rules.minimumPayment.rules) || [];
    for (var i = 0; i < list.length; i++) {
      if ((list[i].appliesToTypes || []).indexOf(debtType) !== -1) return list[i];
    }
    return null;
  }

  function minimumPaymentCents(debt, rules) {
    if (Money.isEntered(debt.minPaymentCents)) {
      return Money.ok(debt.minPaymentCents, { derived: false });
    }
    if (!Money.isEntered(debt.balanceCents)) {
      return Money.incomplete('Add this balance to work out a minimum.', ['balanceCents']);
    }
    var rule = minimumRuleFor(debt.type, rules);
    if (!rule || rule.method === 'not_derivable') {
      return Money.incomplete(
        'Enter the minimum payment for this one — an instalment loan’s payment depends on its original term.',
        ['minPaymentCents']);
    }
    if (rule.method === 'percent_of_balance_or_floor') {
      var pct = Math.round(debt.balanceCents * rule.percentOfBalance);
      var floor = Math.round(rule.floorDollars * 100);
      /* Never demand more than the balance itself. */
      return Money.ok(Math.min(debt.balanceCents, Math.max(pct, floor)),
        { derived: true, ruleId: rule.id });
    }
    return Money.incomplete('No minimum-payment rule for this debt type.', ['minPaymentCents']);
  }

  /* ---- Ordering ---------------------------------------------------------- */

  function emotionalPriority(debt, rules) {
    var tags = (rules && rules.emotionalPriority && rules.emotionalPriority.tags) || [];
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].id === debt.emotionalTag) return tags[i].priority;
    }
    return 0;
  }

  function strategyById(rules, id) {
    var list = (rules && rules.strategies) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /**
   * Order the debts for a strategy. Returns a new array; never mutates.
   * Ordering is recomputed each month, because a hybrid's "small enough to
   * finish quickly" test depends on the balance as it stands now.
   */
  function orderDebts(debts, strategy, rules) {
    var live = debts.filter(function (d) { return d.balanceCents > 0; });
    var sorted = live.slice();

    if (strategy.orderBy === 'rate') {
      sorted.sort(function (a, b) { return b.rate - a.rate || a.balanceCents - b.balanceCents; });
    } else if (strategy.orderBy === 'balance') {
      sorted.sort(function (a, b) { return a.balanceCents - b.balanceCents || b.rate - a.rate; });
    } else if (strategy.orderBy === 'emotionalPriority') {
      sorted.sort(function (a, b) {
        var pa = emotionalPriority(a, rules), pb = emotionalPriority(b, rules);
        return pb - pa || b.rate - a.rate;
      });
    } else if (strategy.orderBy === 'hybrid') {
      var threshold = Math.round((strategy.quickWinBelowDollars || 0) * 100);
      sorted.sort(function (a, b) {
        var qa = a.balanceCents <= threshold ? 1 : 0;
        var qb = b.balanceCents <= threshold ? 1 : 0;
        /* Quick wins first, smallest of those first; then highest rate. */
        if (qa !== qb) return qb - qa;
        if (qa === 1) return a.balanceCents - b.balanceCents;
        return b.rate - a.rate;
      });
    }
    if (strategy.direction === 'asc' && strategy.orderBy === 'rate') sorted.reverse();
    return sorted;
  }

  /* ---- The simulation ----------------------------------------------------
     One month at a time:
       1. interest accrues on every live balance
       2. every debt gets its minimum
       3. everything left over — the user's extra, plus the minimums freed up
          by debts already cleared — goes at the strategy's target
     Step 3 is why this cannot be a closed form.                            */

  function prepare(household, rules) {
    var debts = Schema.aggregatableDebts(household).filter(function (d) {
      return Money.isEntered(d.balanceCents) && d.balanceCents > 0;
    });
    if (debts.length === 0) {
      return Money.incomplete('Add a debt with a balance to see a payoff plan.', ['debts']);
    }

    var prepared = [], missing = [];
    debts.forEach(function (d) {
      var min = minimumPaymentCents(d, rules);
      if (!Money.isEntered(d.rate)) {
        missing.push({ id: d.id, label: d.label, needs: 'an interest rate' });
        return;
      }
      if (!Money.isOk(min)) {
        missing.push({ id: d.id, label: d.label, needs: 'a minimum payment' });
        return;
      }
      prepared.push({
        id: d.id, label: d.label || 'Debt', type: d.type,
        balanceCents: d.balanceCents, rate: d.rate,
        minPaymentCents: min.value, minimumDerived: min.derived,
        emotionalTag: d.emotionalTag
      });
    });

    if (missing.length) {
      return Money.incomplete(
        missing.length === 1
          ? '“' + (missing[0].label || 'One debt') + '” still needs ' + missing[0].needs + '.'
          : missing.length + ' debts still need a rate or a minimum payment.',
        missing.map(function (m) { return m.id; }));
    }
    return Money.ok(prepared, { missing: [] });
  }

  /**
   * simulate(household, rules, { strategyId, extraMonthlyCents })
   * Returns a Result whose value is the number of months to clear everything.
   */
  function simulate(household, rules, opts) {
    var o = opts || {};
    var strategy = strategyById(rules, o.strategyId || 'avalanche');
    if (!strategy) return Money.incomplete('No payoff strategy with that id.', ['strategy']);

    var ready = prepare(household, rules);
    if (!Money.isOk(ready)) return ready;

    var debts = ready.value.map(function (d) { return Object.assign({}, d); });
    var extra = Money.isEntered(o.extraMonthlyCents) ? o.extraMonthlyCents : 0;
    var maxMonths = (rules.limits && rules.limits.maxMonths) || 600;

    /* The total the household puts at debt each month stays constant: every
       minimum plus the extra. A cleared debt frees its minimum for the next
       one — that is the snowball, and it applies to every strategy. */
    var monthlyBudget = debts.reduce(function (s, d) { return s + d.minPaymentCents; }, 0) + extra;

    var totalInterest = 0, totalPaid = 0, month = 0;
    var payoffs = [], schedule = [];
    var startingBalance = debts.reduce(function (s, d) { return s + d.balanceCents; }, 0);
    var perDebtInterest = {};
    debts.forEach(function (d) { perDebtInterest[d.id] = 0; });

    while (month < maxMonths) {
      var live = debts.filter(function (d) { return d.balanceCents > 0; });
      if (live.length === 0) break;
      month++;

      /* 1. Interest. */
      var interestThisMonth = 0;
      live.forEach(function (d) {
        var interest = Math.round(d.balanceCents * (d.rate / 12));
        d.balanceCents += interest;
        interestThisMonth += interest;
        perDebtInterest[d.id] += interest;
      });
      totalInterest += interestThisMonth;

      /* 2. Minimums, capped at what is actually owed. */
      var pot = monthlyBudget;
      var paidThisMonth = 0;
      live.forEach(function (d) {
        var pay = Math.min(d.minPaymentCents, d.balanceCents, pot);
        d.balanceCents -= pay; pot -= pay; paidThisMonth += pay;
      });

      /* If the minimums alone cannot cover the interest, this never ends. */
      if (pot <= 0 && paidThisMonth <= interestThisMonth && month > 1) {
        var stalled = debts.reduce(function (s, d) { return s + d.balanceCents; }, 0);
        if (stalled >= startingBalance) {
          return Money.incomplete(
            'At this payment the balance grows faster than it shrinks — the interest alone outruns it.',
            ['extraMonthlyCents']);
        }
      }

      /* 3. Everything left goes at the target, in strategy order. */
      var ordered = orderDebts(debts, strategy, rules);
      for (var i = 0; i < ordered.length && pot > 0; i++) {
        var target = ordered[i];
        if (target.balanceCents <= 0) continue;
        var extraPay = Math.min(pot, target.balanceCents);
        target.balanceCents -= extraPay; pot -= extraPay; paidThisMonth += extraPay;
      }

      totalPaid += paidThisMonth;

      debts.forEach(function (d) {
        if (d.balanceCents <= 0 && !payoffs.some(function (p) { return p.debtId === d.id; })) {
          payoffs.push({
            debtId: d.id, label: d.label, month: month,
            interestPaidCents: perDebtInterest[d.id]
          });
        }
      });

      schedule.push({
        month: month,
        interestCents: interestThisMonth,
        paidCents: paidThisMonth,
        remainingCents: debts.reduce(function (s, d) { return s + Math.max(0, d.balanceCents); }, 0)
      });
    }

    var outstanding = debts.reduce(function (s, d) { return s + Math.max(0, d.balanceCents); }, 0);
    if (outstanding > 0) {
      return Money.incomplete(
        'Still not clear after ' + maxMonths + ' months at this payment.',
        ['extraMonthlyCents']);
    }

    return Money.ok(month, {
      strategy: strategy,
      months: month,
      totalInterestCents: totalInterest,
      totalPaidCents: totalPaid,
      startingBalanceCents: startingBalance,
      monthlyBudgetCents: monthlyBudget,
      extraMonthlyCents: extra,
      payoffs: payoffs.sort(function (a, b) { return a.month - b.month; }),
      schedule: schedule,
      referenceVersion: rules.version
    });
  }

  /**
   * Run every strategy at the same payment and report the trade-off.
   * This is the whole point of having four: avalanche always wins on total
   * interest, and it is not always the one someone will stick to.
   */
  function compareStrategies(household, rules, opts) {
    var o = opts || {};
    var results = {}, ok = [];
    (rules.strategies || []).forEach(function (s) {
      var r = simulate(household, rules, {
        strategyId: s.id, extraMonthlyCents: o.extraMonthlyCents
      });
      results[s.id] = r;
      if (Money.isOk(r)) ok.push(r);
    });
    if (!ok.length) {
      var first = results[(rules.strategies || [{}])[0].id];
      return first || Money.incomplete('Nothing to compare yet.', ['debts']);
    }
    var cheapest = ok.reduce(function (best, r) {
      return r.totalInterestCents < best.totalInterestCents ? r : best;
    });
    var fastestFirstWin = ok.reduce(function (best, r) {
      var a = r.payoffs.length ? r.payoffs[0].month : Infinity;
      var b = best.payoffs.length ? best.payoffs[0].month : Infinity;
      return a < b ? r : best;
    });
    return Money.ok(cheapest.totalInterestCents, {
      results: results,
      cheapestStrategyId: cheapest.strategy.id,
      firstWinStrategyId: fastestFirstWin.strategy.id,
      /* What sticking with the cheapest plan is worth against the dearest. */
      spreadCents: ok.reduce(function (m, r) { return Math.max(m, r.totalInterestCents); }, 0)
                 - cheapest.totalInterestCents
    });
  }

  /* ---- The Credit Card calc, as a filtered view --------------------------
     SPEC.md §13 asks whether the Credit Card calc is a specialised view or a
     filtered display of the general calculator. It is a filtered display:
     this returns a household containing only the revolving debts, which then
     goes through the exact same simulate().                               */

  function creditCardsOnly(household) {
    var filtered = JSON.parse(JSON.stringify(household));
    filtered.debts = (filtered.debts || []).filter(function (d) { return d.type === 'credit_card'; });
    return filtered;
  }

  /** What the current minimums alone would cost — the do-nothing baseline. */
  function minimumsOnly(household, rules) {
    return simulate(household, rules, { strategyId: 'avalanche', extraMonthlyCents: 0 });
  }

  return {
    minimumRuleFor: minimumRuleFor,
    minimumPaymentCents: minimumPaymentCents,
    emotionalPriority: emotionalPriority,
    strategyById: strategyById,
    orderDebts: orderDebts,
    prepare: prepare,
    simulate: simulate,
    compareStrategies: compareStrategies,
    creditCardsOnly: creditCardsOnly,
    minimumsOnly: minimumsOnly
  };
});
