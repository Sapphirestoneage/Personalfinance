/* ==========================================================================
   engines/studentloans.js — the Student Loan Decision.
   DECISIONS.md D-101 (the room), on the frozen template (D-097).
   --------------------------------------------------------------------------
   Three shapes of repayment for the student loans alone, side by side:

     standard        the minimums as listed — or, for a loan with no
                     minimum, the level payment over the standard term at
                     its rate (Projection.levelPaymentCents) — run through
                     Debt.simulate, exactly as Debt Payoff would run them
     aggressive      the standard plan plus a fixed extra a month, through
                     the same Debt.simulate with extraMonthlyCents
     income-driven   a payment of max(0, (gross − multiple × poverty line)
                     × share ÷ 12), held flat and applied month by month
                     with interest accruing at each loan's rate, stopping
                     at the forgiveness horizon with the rest written off

   The first two are not a second amortisation: they are the debt engine on
   a household copy holding only the loans. The third is the one shape
   debt.js does not have — a payment set by income rather than by the
   balance, that may sit below the interest (negative amortisation: the
   balance grows, and what is forgiven can exceed what was borrowed) — so
   it is the one loop here, incomeDriven(), documented beside the code.

   Every figure that is not the person's comes from
   data/student_loan_conventions.json (the term, the share, the poverty
   line and its multiple, the horizon) and data/debt_rules.json (the
   simulation's limits), and each is marked convention. Income does not
   grow; a forgiven balance may be taxed and that tax is not modelled.
   Integer cents throughout. Pure functions returning Money Results.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'),
             Debt: require('./debt.js'), Projection: require('./projection.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Debt: S.Debt, Projection: S.Projection };
  }
  var api = factory(deps.Money, deps.Schema, deps.Debt, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.StudentLoans = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Debt, Projection) {
  'use strict';

  var MONTHS = 12;
  var INTAKE_DEBT_ID = 'intake_debt';   /* the one-pager's lump, rooms/start.html */
  var PLAN_IDS = ['standard', 'income_driven', 'aggressive'];
  var PLAN_LABELS = { standard: 'Standard', income_driven: 'Income-driven', aggressive: 'Aggressive' };
  var DEFAULT_MAX_MONTHS = 600;

  /* ---- Which debts are the loans ---------------------------------------- */

  /**
   * The student loans this room reads: every aggregatable debt typed
   * student_loan. When none is typed but the one-pager's lump exists and
   * the person is a student, that lump is the loans — Start Here files a
   * student's "what you owe" as the loans, and a lump typed before the
   * situation was chosen may still carry type 'other'. `lump` says so, so
   * the room can tell the person what it is reading.
   */
  function loansOf(household) {
    var all = Schema.aggregatableDebts(household || {});
    var typed = all.filter(function (d) { return d.type === 'student_loan'; });
    if (typed.length) return { loans: typed, lump: false };
    var lump = all.filter(function (d) { return d.id === INTAKE_DEBT_ID; })[0];
    var you = Schema.primaryPerson(household || {});
    if (lump && you && you.employmentStatus === 'student') return { loans: [lump], lump: true };
    return { loans: [], lump: false };
  }

  /* A household copy holding only the loans, so Debt.simulate sees nothing
     else — the same filtered-view idea as Debt.creditCardsOnly. */
  function loansOnly(household, loans) {
    var copy = JSON.parse(JSON.stringify(household || {}));
    copy.debts = loans.map(function (d) { return Object.assign({}, d); });
    copy.meta = Object.assign({}, copy.meta || {}, { hasDebt: true });
    return copy;
  }

  /**
   * The standard plan's minimums: a listed minimum stands; a loan without
   * one gets the level payment over the standard term at its rate. Returns
   * the loans with minPaymentCents filled and the ids that were derived,
   * or incomplete when a loan lacks the rate the level payment needs.
   */
  function standardMinimums(loans, conventions) {
    var term = conventions.standardTermYears * MONTHS;
    var derived = [];
    var out = [];
    for (var i = 0; i < loans.length; i++) {
      var d = Object.assign({}, loans[i]);
      if (!Money.isEntered(d.minPaymentCents) && Money.isEntered(d.balanceCents) && d.balanceCents > 0) {
        if (!Money.isEntered(d.rate)) {
          return Money.incomplete('“' + (d.label || 'One loan') + '” needs its interest rate before a payment can be worked out.', [d.id]);
        }
        var level = Projection.levelPaymentCents({ principalCents: d.balanceCents, annualRate: d.rate, months: term });
        if (!Money.isOk(level)) return level;
        d.minPaymentCents = level.value;
        derived.push(d.id);
      }
      out.push(d);
    }
    return Money.ok(out, { derived: derived, termMonths: term });
  }

  /* ---- The income-driven payment ------------------------------------------ */

  /**
   * Discretionary income and the payment it sets:
   *   discretionary = max(0, gross − multiple × povertyLine)
   *   payment       = round(discretionary × share ÷ 12)
   * Gross missing → incomplete, and the caller shows the other two plans.
   */
  function incomeDrivenPayment(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({ grossAnnualCents: o.grossAnnualCents, share: o.share, povertyCents: o.povertyCents, multiple: o.multiple });
    if (missing.length) return Money.incomplete('Add your income to see the income-driven payment.', missing);
    var threshold = Math.round(o.povertyCents * o.multiple);
    var discretionary = Math.max(0, o.grossAnnualCents - threshold);
    var payment = Math.round(discretionary * o.share / MONTHS);
    return Money.ok(payment, { discretionaryCents: discretionary, thresholdCents: threshold, belowThreshold: o.grossAnnualCents <= threshold });
  }

  /**
   * incomeDriven({ loans, paymentCents, forgivenessMonths, maxMonths })
   *
   * THE LOOP. One month at a time, for as long as anything is owed and the
   * horizon has not arrived:
   *   1. interest accrues on every live loan: round(balance × rate ÷ 12)
   *   2. the flat payment goes at the loans, highest rate first, never
   *      more than a loan owes
   * When the payment is below the month's interest the balance grows —
   * negative amortisation — and the loop still runs to the horizon, so a
   * forgiven amount can exceed what was borrowed. That is the finding,
   * not an error. With no horizon (forgivenessMonths null) the loop runs
   * to maxMonths and a plan that never clears says so instead of a number.
   * Income is held flat: the payment is the same in month 240 as month 1.
   */
  function incomeDriven(opts) {
    var o = opts || {};
    var loans = (o.loans || []).filter(function (d) { return Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
    if (!loans.length) return Money.incomplete('Add a loan with a balance to see this.', ['debts']);
    for (var i = 0; i < loans.length; i++) {
      if (!Money.isEntered(loans[i].rate)) return Money.incomplete('“' + (loans[i].label || 'One loan') + '” needs its interest rate.', [loans[i].id]);
    }
    if (!Money.isEntered(o.paymentCents)) return Money.incomplete('Add your income to see the income-driven payment.', ['grossAnnualIncome']);

    var horizon = Money.isEntered(o.forgivenessMonths) && o.forgivenessMonths > 0 ? o.forgivenessMonths : null;
    var maxMonths = Money.isEntered(o.maxMonths) ? o.maxMonths : DEFAULT_MAX_MONTHS;
    var limit = horizon === null ? maxMonths : Math.min(horizon, maxMonths);
    var payment = Math.max(0, o.paymentCents);

    var live = loans.map(function (d) { return { id: d.id, label: d.label, balanceCents: d.balanceCents, rate: d.rate }; })
      .sort(function (a, b) { return b.rate - a.rate || a.balanceCents - b.balanceCents; });
    var startingBalance = live.reduce(function (s, d) { return s + d.balanceCents; }, 0);
    var firstInterest = live.reduce(function (s, d) { return s + Math.round(d.balanceCents * d.rate / MONTHS); }, 0);
    var negativeAmortisation = payment < firstInterest;

    var month = 0, totalPaid = 0, totalInterest = 0, schedule = [];
    function outstanding() { return live.reduce(function (s, d) { return s + Math.max(0, d.balanceCents); }, 0); }

    while (outstanding() > 0 && month < limit) {
      month++;
      var interestThisMonth = 0;
      for (var j = 0; j < live.length; j++) {
        if (live[j].balanceCents <= 0) continue;
        var interest = Math.round(live[j].balanceCents * live[j].rate / MONTHS);
        live[j].balanceCents += interest;
        interestThisMonth += interest;
      }
      var pot = payment, paidThisMonth = 0;
      for (var k = 0; k < live.length && pot > 0; k++) {
        if (live[k].balanceCents <= 0) continue;
        var pay = Math.min(pot, live[k].balanceCents);
        live[k].balanceCents -= pay; pot -= pay; paidThisMonth += pay;
      }
      totalInterest += interestThisMonth; totalPaid += paidThisMonth;
      schedule.push({ month: month, interestCents: interestThisMonth, paidCents: paidThisMonth, remainingCents: outstanding() });
    }

    var left = outstanding();
    if (left > 0 && horizon === null) {
      return Money.incomplete('At ' + Money.formatCents(payment) + ' a month the loans never clear within ' + Math.round(maxMonths / MONTHS) + ' years, and with no forgiveness nothing is written off.', ['forgivenessYears']);
    }
    return Money.ok(month, {
      months: month,
      monthlyPaymentCents: payment,
      totalPaidCents: totalPaid,
      totalInterestCents: totalInterest,
      forgivenCents: left,
      clears: left === 0,
      startingBalanceCents: startingBalance,
      firstMonthInterestCents: firstInterest,
      negativeAmortisation: negativeAmortisation,
      horizonMonths: horizon,
      schedule: schedule
    });
  }

  /* ---- The comparison ------------------------------------------------------- */

  function yearAfter(now, months) {
    var d = new Date(now === undefined || now === null ? Date.now() : now);
    return d.getFullYear() + Math.floor((d.getMonth() + months) / MONTHS);
  }

  function plan(id, extra) {
    return Object.assign({ id: id, label: PLAN_LABELS[id], ok: false, reason: null, monthlyPaymentCents: null, months: null, clears: false,
      clearYear: null, totalPaidCents: null, totalInterestCents: null, forgivenCents: 0, forgivenAtYears: null, negativeAmortisation: false }, extra || {});
  }

  /* The standard and aggressive plans are the debt engine on the loans. */
  function simulated(id, household, loans, rules, extraCents, now) {
    var sim = Debt.simulate(loansOnly(household, loans), rules, { strategyId: 'avalanche', extraMonthlyCents: extraCents });
    if (!Money.isOk(sim)) return plan(id, { reason: sim.reason });
    return plan(id, {
      ok: true, monthlyPaymentCents: sim.monthlyBudgetCents, months: sim.months, clears: true, clearYear: yearAfter(now, sim.months),
      totalPaidCents: sim.totalPaidCents, totalInterestCents: sim.totalInterestCents, forgivenCents: 0, extraMonthlyCents: extraCents, simulation: sim
    });
  }

  /**
   * compare(household, tables, { now }) → Result
   *   value          the recommended plan's total paid (the cheapest plan
   *                  that clears the loans), or null when none clears
   *   plans          { standard, income_driven, aggressive }, each a plan
   *                  record with ok/reason so one plan can be incomplete
   *                  (income not entered) while the others compute
   *   recommendedId  the cheapest plan that clears; chosenId the one picked
   */
  function compare(household, tables, opts) {
    var o = opts || {};
    var h = household || {};
    var T = tables || {};
    var conv = T.studentLoanConventions, rules = T.debtRules;
    if (!conv || !Money.isEntered(conv.standardTermYears)) return Money.incomplete('The student loan conventions table did not load.', ['studentLoanConventions']);
    if (!rules) return Money.incomplete('The debt rules table did not load.', ['debtRules']);

    var found = loansOf(h);
    var loans = found.loans.filter(function (d) { return Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
    if (!loans.length) {
      return Money.incomplete(found.loans.length ? 'The loans listed have no balance yet.' : 'No student loans listed yet.', ['debts']);
    }

    var settings = Schema.createStudentLoanPlan(h.studentLoans);
    var extra = Money.isEntered(settings.extraMonthlyCents) ? Math.max(0, settings.extraMonthlyCents) : 0;
    var share = Money.isEntered(settings.idrShare) ? settings.idrShare : conv.idrShareOfDiscretionary;
    var forgivenessYears = Money.isEntered(settings.forgivenessYears) ? settings.forgivenessYears : conv.forgivenessYears;
    var forgivenessNone = !(forgivenessYears > 0);
    var povertyCents = Math.round(conv.povertyLineDollars * 100);
    var maxMonths = (rules.limits && rules.limits.maxMonths) || DEFAULT_MAX_MONTHS;

    var mins = standardMinimums(loans, conv);
    var plans = {};
    if (Money.isOk(mins)) {
      plans.standard = simulated('standard', h, mins.value, rules, 0, o.now);
      plans.aggressive = simulated('aggressive', h, mins.value, rules, extra, o.now);
    } else {
      plans.standard = plan('standard', { reason: mins.reason });
      plans.aggressive = plan('aggressive', { reason: mins.reason });
    }

    var gross = Schema.grossAnnualIncomeCents(h);
    var payment = incomeDrivenPayment({ grossAnnualCents: Money.isOk(gross) ? gross.value : null, share: share, povertyCents: povertyCents, multiple: conv.discretionaryPovertyMultiple });
    if (!Money.isOk(payment)) {
      plans.income_driven = plan('income_driven', { reason: payment.reason, incomeMissing: true });
    } else {
      var idr = incomeDriven({ loans: loans, paymentCents: payment.value, forgivenessMonths: forgivenessNone ? null : forgivenessYears * MONTHS, maxMonths: maxMonths });
      plans.income_driven = Money.isOk(idr)
        ? plan('income_driven', { ok: true, monthlyPaymentCents: idr.monthlyPaymentCents, months: idr.months, clears: idr.clears,
            clearYear: idr.clears ? yearAfter(o.now, idr.months) : null, totalPaidCents: idr.totalPaidCents, totalInterestCents: idr.totalInterestCents,
            forgivenCents: idr.forgivenCents, forgivenAtYears: idr.clears ? null : forgivenessYears, negativeAmortisation: idr.negativeAmortisation,
            firstMonthInterestCents: idr.firstMonthInterestCents, discretionaryCents: payment.discretionaryCents, belowThreshold: payment.belowThreshold, schedule: idr.schedule })
        : plan('income_driven', { reason: idr.reason, monthlyPaymentCents: payment.value, negativeAmortisation: true, discretionaryCents: payment.discretionaryCents, belowThreshold: payment.belowThreshold });
    }

    var okPlans = PLAN_IDS.map(function (id) { return plans[id]; }).filter(function (p) { return p.ok; });
    if (!okPlans.length) return Money.incomplete(plans.standard.reason || plans.income_driven.reason || 'Nothing to compare yet.', ['debts']);

    var recommended = null, cheapest = null;
    okPlans.forEach(function (p) {
      if (!cheapest || p.totalPaidCents < cheapest.totalPaidCents) cheapest = p;
      if (p.clears && (!recommended || p.totalPaidCents < recommended.totalPaidCents)) recommended = p;
    });
    var chosenId = settings.plan;
    var chosen = chosenId ? plans[chosenId] : null;

    return Money.ok(recommended ? recommended.totalPaidCents : null, {
      plans: plans,
      order: PLAN_IDS.slice(),
      loans: loans,
      lump: found.lump,
      startingBalanceCents: loans.reduce(function (s, d) { return s + d.balanceCents; }, 0),
      derivedMinimumIds: Money.isOk(mins) ? mins.derived : [],
      recommendedId: recommended ? recommended.id : null,
      recommended: recommended,
      cheapestId: cheapest.id,
      chosenId: chosenId,
      chosen: chosen,
      chosenIsRecommended: !!(chosen && recommended && chosen.id === recommended.id),
      extraMonthlyCents: extra,
      extraEntered: Money.isEntered(settings.extraMonthlyCents),
      share: share,
      shareSource: Money.isEntered(settings.idrShare) ? 'yours' : 'convention',
      forgivenessYears: forgivenessYears,
      forgivenessNone: forgivenessNone,
      forgivenessSource: Money.isEntered(settings.forgivenessYears) ? 'yours' : 'convention',
      grossAnnualCents: Money.isOk(gross) ? gross.value : null,
      incomeKnown: Money.isOk(gross),
      povertyCents: povertyCents,
      thresholdCents: Math.round(povertyCents * conv.discretionaryPovertyMultiple),
      conventions: conv,
      referenceVersion: conv.version
    });
  }

  return {
    PLAN_IDS: PLAN_IDS,
    PLAN_LABELS: PLAN_LABELS,
    INTAKE_DEBT_ID: INTAKE_DEBT_ID,
    loansOf: loansOf,
    loansOnly: loansOnly,
    standardMinimums: standardMinimums,
    incomeDrivenPayment: incomeDrivenPayment,
    incomeDriven: incomeDriven,
    yearAfter: yearAfter,
    compare: compare
  };
});
