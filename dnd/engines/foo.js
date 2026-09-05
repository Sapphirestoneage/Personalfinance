/* ==========================================================================
   engines/foo.js — Financial Order of Operations placement + flags.
   --------------------------------------------------------------------------
   SPEC.md §13, ninth Tier 0 output. Rules-based, not formula-based: a
   sequential boolean gate down the ladder, stopping at the first unmet
   condition. Every threshold comes from data/foo_rules.json — nothing here
   hardcodes a rate or a dollar figure.

   Three gate outcomes, not two. A step can be:
       'met'      — the condition is satisfied, keep walking
       'unmet'    — this is the user's placement, stop
       'unknown'  — the inputs needed to judge it were never entered, stop
                    and say which ones

   'unknown' exists because a missing input is not a failed step. Tier 0
   collects ten inputs; steps 5 and beyond need contribution details it does
   not ask for, so they come back unknown rather than pretending to a verdict.
   See DECISIONS.md D-008.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Foo = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';

  function met(key, detail) { return { key: key, status: 'met', detail: detail || null }; }
  function unmet(key, detail) { return { key: key, status: 'unmet', detail: detail || null }; }
  function unknown(key, detail, missing) {
    return { key: key, status: 'unknown', detail: detail || null, missing: missing || [] };
  }

  /** Debts carrying a rate above the high-interest threshold, with a balance
   *  still on them. A debt whose rate was never entered cannot be judged. */
  function highInterestDebts(household, thresholds) {
    var out = { above: [], unrated: [] };
    Schema.aggregatableDebts(household).forEach(function (d) {
      if (!Money.isEntered(d.balanceCents) || d.balanceCents <= 0) return;
      if (!Money.isEntered(d.rate)) { out.unrated.push(d); return; }
      if (d.rate > thresholds.highInterestDebtRate) out.above.push(d);
    });
    return out;
  }

  /** The starter emergency fund target: the greater of the flat dollar
   *  figure and one month of expenses. */
  function starterTargetCents(household, thresholds) {
    var flat = Math.round(thresholds.starterEmergencyFundDollars * 100);
    var expenses = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(expenses)) return Money.incomplete(
      'Add your monthly expenses to size the starter fund.', ['monthlyExpenses']);
    return Money.ok(Math.max(flat, expenses.value * thresholds.starterEmergencyFundMonths));
  }

  /* ---- The ladder ------------------------------------------------------- */

  function evaluateSteps(household, tables) {
    var rules = tables && tables.fooRules;
    if (!rules) {
      return { steps: [], error: 'FOO rules table is not loaded.' };
    }
    var t = rules.thresholds;
    var steps = [];

    var cash = Schema.cashCents(household);
    var expenses = Schema.monthlyExpensesCents(household);
    var payments = Schema.monthlyDebtPaymentsCents(household);
    var gross = Schema.grossAnnualIncomeCents(household);
    var match = Schema.employerMatchCents(household);
    var hi = highInterestDebts(household, t);

    /* --- Step 0: cover basic living expenses -----------------------------
       Net monthly income after estimated tax, against expenses plus debt
       minimums. Uses the same tax lookup as the savings rate, not a second
       one. */
    (function () {
      if (!Money.isOk(gross) || !Money.isOk(expenses)) {
        steps.push(unknown('cover_basics',
          'Add your income and monthly expenses to check this.',
          ['grossAnnualIncome', 'monthlyExpenses']));
        return;
      }
      var tax = Tier0.estimatedAnnualTaxCents(household, tables);
      if (!Money.isOk(tax)) {
        steps.push(unknown('cover_basics',
          'Choose a filing status so take-home pay can be estimated.', ['filingStatus']));
        return;
      }
      var netMonthly = (gross.value - tax.value) / 12;
      var outgoings = expenses.value + (Money.isOk(payments) ? payments.value : 0);
      steps.push(netMonthly >= outgoings
        ? met('cover_basics', { netMonthlyIncomeCents: Math.round(netMonthly), monthlyOutgoingsCents: outgoings })
        : unmet('cover_basics', { netMonthlyIncomeCents: Math.round(netMonthly), monthlyOutgoingsCents: outgoings }));
    })();
    if (steps[steps.length - 1].status !== 'met') return { steps: steps, rules: rules };

    /* --- Step 1: starter emergency fund ---------------------------------- */
    (function () {
      var target = starterTargetCents(household, t);
      if (!Money.isOk(cash) || !Money.isOk(target)) {
        steps.push(unknown('starter_ef', 'Add your cash balance and monthly expenses to check this.',
          ['cashSavings', 'monthlyExpenses']));
        return;
      }
      steps.push(cash.value >= target.value
        ? met('starter_ef', { targetCents: target.value, cashCents: cash.value })
        : unmet('starter_ef', { targetCents: target.value, cashCents: cash.value }));
    })();
    if (steps[steps.length - 1].status !== 'met') return { steps: steps, rules: rules };

    /* --- Step 2: capture the full employer match -------------------------
       Needs to know whether the user is CONTRIBUTING enough to receive it,
       which the ten Tier 0 inputs do not capture. household.capturingFullMatch
       is nullable on purpose — see DECISIONS.md D-008. */
    (function () {
      /* Derived from the contribution percentage and the match cap when
         both are known (D-061); the stored answer otherwise. */
      var capturingR = Schema.capturingFullMatchDerived(household);
      var capturing = Money.isOk(capturingR) ? capturingR.value : undefined;
      if (Money.isOk(match) && match.value === 0) {
        steps.push(met('match_available', { note: 'No employer match to capture.' }));
        return;
      }
      if (!Money.isOk(match)) {
        steps.push(unknown('employer_match',
          'Add your employer match — percentage and cap, or “none”.', ['employerMatch']));
        return;
      }
      if (capturing === null || capturing === undefined) {
        steps.push(unknown('employer_match',
          'Tell us whether you’re contributing enough to receive the full match.',
          ['capturingFullMatch']));
        return;
      }
      steps.push(capturing === true
        ? met('employer_match', { matchCents: match.value })
        : unmet('employer_match', { matchCents: match.value }));
    })();
    if (steps[steps.length - 1].status !== 'met') return { steps: steps, rules: rules };

    /* --- Step 3: pay off high-interest debt ------------------------------ */
    (function () {
      if (hi.unrated.length) {
        steps.push(unknown('high_interest_debt',
          'Add an interest rate to every debt so this can be judged.', ['debtRate']));
        return;
      }
      steps.push(hi.above.length === 0
        ? met('high_interest_debt', { thresholdRate: t.highInterestDebtRate })
        : unmet('high_interest_debt', {
            thresholdRate: t.highInterestDebtRate,
            debts: hi.above.map(function (d) {
              return { label: d.label, balanceCents: d.balanceCents, rate: d.rate };
            })
          }));
    })();
    if (steps[steps.length - 1].status !== 'met') return { steps: steps, rules: rules };

    /* --- Step 4: full emergency fund ------------------------------------- */
    (function () {
      if (!Money.isOk(cash) || !Money.isOk(expenses)) {
        steps.push(unknown('full_ef', 'Add your cash balance and monthly expenses to check this.',
          ['cashSavings', 'monthlyExpenses']));
        return;
      }
      var minTarget = expenses.value * t.fullEmergencyFundMonthsMin;
      steps.push(cash.value >= minTarget
        ? met('full_ef', {
            minTargetCents: minTarget,
            fullTargetCents: expenses.value * t.fullEmergencyFundMonthsTarget })
        : unmet('full_ef', {
            minTargetCents: minTarget,
            fullTargetCents: expenses.value * t.fullEmergencyFundMonthsTarget,
            cashCents: cash.value }));
    })();
    if (steps[steps.length - 1].status !== 'met') return { steps: steps, rules: rules };

    /* --- Steps 5+ --------------------------------------------------------
       HSA eligibility, Roth IRA contributions, remaining tax-advantaged
       space and taxable brokerage all need contribution figures Tier 0 does
       not collect. Saying so is the honest answer; guessing is not. */
    steps.push(unknown('max_hsa',
      'Steps 5 and up need your actual contributions — HSA, IRA, 401(k) — which this room doesn’t ask for yet.',
      ['contributions']));

    return { steps: steps, rules: rules };
  }

  /* ---- Out-of-bounds flags ---------------------------------------------
     A flag fires when a later step is being pursued while an earlier one is
     incomplete. Flags are evaluated INDEPENDENTLY of placement — a ladder
     that stops at step 2 still surfaces a step-3 problem. SPEC.md §13.   */

  function evaluateFlags(household, tables) {
    var rules = tables && tables.fooRules;
    if (!rules) return [];
    var t = rules.thresholds;
    var defs = {};
    rules.outOfBoundsFlags.forEach(function (f) { defs[f.key] = f; });

    var fired = [];
    function fire(key, detail) {
      var def = defs[key];
      if (!def) return;
      fired.push({
        key: key, label: def.label, severity: def.severity,
        guidance: def.guidance, detail: detail || null
      });
    }

    var cash = Schema.cashCents(household);
    var match = Schema.employerMatchCents(household);
    var hi = highInterestDebts(household, t);
    var starter = starterTargetCents(household, t);

    /* 1. Cash piled up beyond the starter fund while high-interest debt
          compounds. */
    if (Money.isOk(cash) && Money.isOk(starter) && hi.above.length > 0
        && cash.value > starter.value) {
      fire('ef_alongside_high_interest_debt', {
        excessCashCents: cash.value - starter.value,
        highInterestBalanceCents: hi.above.reduce(function (s, d) { return s + d.balanceCents; }, 0)
      });
    }

    /* 2. A real match going uncaptured. Only fires on an explicit "no" —
          an unanswered question is not a finding. */
    var capturingFlag = Schema.capturingFullMatchDerived(household);
    if (Money.isOk(match) && match.value > 0 && Money.isOk(capturingFlag) && capturingFlag.value === false) {
      fire('match_left_on_table', { annualMatchCents: match.value });
    }

    /* 3. DTI above the lending comfort ceiling. */
    var dti = Tier0.debtToIncome(household);
    if (Money.isOk(dti) && dti.value > t.dtiComfortCeiling) {
      fire('dti_above_ceiling', { ratio: dti.value, ceiling: t.dtiComfortCeiling });
    }

    /* 4. Savings rate under the benchmark floor. Uses the excluding-match
          variant, which is the conservative read. */
    var rates = Tier0.savingsRate(household, tables);
    if (Money.isOk(rates.excludingMatch) && rates.excludingMatch.value < t.savingsRateBenchmarkFloor) {
      fire('savings_rate_below_benchmark', {
        rate: rates.excludingMatch.value,
        floor: t.savingsRateBenchmarkFloor,
        low: t.savingsRateBenchmarkLow,
        variant: 'excludingMatch'
      });
    }

    /* 5. Revolving credit as an outsized share of total debt. SPEC.md calls
          this "high implied credit utilisation relative to debt load" —
          utilisation proper needs credit limits, which Tier 0 does not
          collect, so this is the share-of-debt proxy. */
    var debts = Schema.aggregatableDebts(household);
    var revolving = 0, total = 0, counted = 0;
    debts.forEach(function (d) {
      if (!Money.isEntered(d.balanceCents)) return;
      total += d.balanceCents; counted++;
      if (d.type === 'credit_card') revolving += d.balanceCents;
    });
    if (counted > 0 && total > 0 && (revolving / total) > t.revolvingShareCeiling) {
      fire('high_utilisation_vs_debt_load', {
        revolvingShare: revolving / total,
        ceiling: t.revolvingShareCeiling,
        revolvingBalanceCents: revolving,
        totalDebtCents: total,
        proxy: 'share-of-total-debt'
      });
    }

    return fired;
  }

  /** Placement + flags together — the shape a room renders. */
  function evaluate(household, tables) {
    var walked = evaluateSteps(household, tables);
    if (walked.error) {
      return { status: 'incomplete', reason: walked.error, steps: [], flags: [] };
    }
    var rules = walked.rules;
    var steps = walked.steps;
    var last = steps[steps.length - 1];

    var placement = null;
    /* Only an UNMET step is a placement. A step we couldn't judge is not
       "where you are" — reporting it as one would tell someone with an
       empty form that they're stuck on step 0. */
    if (last && last.status === 'unmet') {
      for (var i = 0; i < rules.ladder.length; i++) {
        if (rules.ladder[i].key === last.key) { placement = rules.ladder[i]; break; }
      }
    }

    return {
      status: last && last.status === 'unknown' ? 'unknown' : 'ok',
      placement: placement,
      stoppedAt: last || null,
      steps: steps,
      flags: evaluateFlags(household, tables),
      referenceVersion: rules.version
    };
  }

  return {
    evaluate: evaluate,
    evaluateSteps: evaluateSteps,
    evaluateFlags: evaluateFlags,
    highInterestDebts: highInterestDebts,
    starterTargetCents: starterTargetCents
  };
})
;
