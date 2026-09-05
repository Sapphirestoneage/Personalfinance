/* ==========================================================================
   engines/runway.js — how long the money lasts when the income stops.
   --------------------------------------------------------------------------
   Three tools in SPEC.md §13 Tier 2 are the same arithmetic:

     • "Leave-Job calc — runway/risk of quitting: severance, COBRA,
        unemployment eligibility, emergency fund drawdown timeline. Shares
        math with Unemployment calc and Emergency Fund Coverage."
     • "Unemployment calc — benefit amount/duration by state; runway until
        benefits deplete."
     • "Start-Business calc — runway/breakeven for launching a business.
        Needs a revenue-ramp curve (linear vs. hockey-stick) as a togglable
        model."

   One pile of money, some outflow every month, some inflow for a while, and
   the month it reaches zero. §8 forbids writing that three times, and the
   spec says so itself — so this is one engine with three presets, the same
   shape as engines/credential.js (D-039).

   WHAT THIS DOES NOT KNOW, and says so instead of guessing:

     • Your unemployment benefit. It is set per state, by formula, with a
       weekly cap, and §10 already flags a 50-state table as a maintenance
       dependency this repo will not take on (D-036). So the benefit is a
       plain input, and the room tells you to look yours up rather than
       showing you a number it made up.
     • COBRA, or whatever health cover costs once the employer stops paying
       for it. Employer-specific. Same treatment: an input.

   Refusing to invent those is not a gap in the tool. A runway built on a
   benefit figure the app guessed at is worse than one where you had to
   look up the real number, because you would trust it.

   WHAT IT DELIBERATELY LEAVES OUT: interest on the cushion. Over the months
   a runway usually covers it is small, and leaving it out errs short. For a
   safety calculation that is the right direction to be wrong in — stated
   here and on the page rather than quietly assumed.

   Money is integer cents. Months are whole months.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema
    };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Runway = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  /* Five years. Past that the question stops being "how long does the
     cushion last" and starts being "what is your new life", which is a
     different tool. A runway that reaches the horizon is reported as
     lasting AT LEAST that long, never as a precise figure. */
  var HORIZON_MONTHS = 60;

  var PRESETS = {
    quit: {
      id: 'quit', label: 'Quitting',
      blurb: 'You hand in your notice. Usually no benefit, sometimes a payout.',
      benefit: false, ramp: false,
      cushionLabel: 'What you can actually spend',
      note: 'Resigning normally disqualifies you from unemployment. If yours is a '
        + 'constructive dismissal or a negotiated exit, check — it can change the answer '
        + 'by months.'
    },
    laid_off: {
      id: 'laid_off', label: 'Laid off',
      blurb: 'The job ends without you choosing it. Severance, then benefits, then nothing.',
      benefit: true, ramp: false,
      cushionLabel: 'What you can actually spend',
      note: 'The benefit figure is yours to look up — it is set by your state, from your '
        + 'own earnings history, with a weekly cap. This app will not guess at it.'
    },
    business: {
      id: 'business', label: 'Starting something',
      blurb: 'No wage for a while, then revenue that builds. The runway has to outlast the build.',
      benefit: false, ramp: true,
      cushionLabel: 'What you can put behind it',
      note: 'The ramp is a shape you choose, not a forecast. Nothing here knows what your '
        + 'revenue will do — pick the shape that matches how you think it goes and read '
        + 'the answer as "if it goes like this".'
    }
  };

  var RAMP_SHAPES = {
    none:   { id: 'none',   label: 'No revenue',
              blurb: 'Nothing coming in at all.' },
    linear: { id: 'linear', label: 'Straight line',
              blurb: 'Builds evenly from nothing to the target.' },
    hockey: { id: 'hockey', label: 'Slow then steep',
              blurb: 'Almost nothing for most of the ramp, then most of it at the end.' }
  };

  /**
   * Revenue in month `m`, as a share of the target.
   *   linear: m / rampMonths, capped at 1.
   *   hockey: that same fraction cubed — a third of the way through the
   *           ramp you are at 4% of target, not 33%. This is a SHAPE the
   *           user picks, not a model of anything; the cube is chosen
   *           because it is the plainest curve that is flat early and steep
   *           late, and the room says it is a choice.
   */
  function rampShare(shape, m, rampMonths) {
    if (shape === 'none' || !rampMonths || rampMonths <= 0) return 0;
    var t = Math.min(1, m / rampMonths);
    if (shape === 'hockey') return t * t * t;
    return t;
  }

  function num(v, fallback) { return Money.isEntered(v) ? v : fallback; }

  /**
   * project(household, tables, opts) — the whole drawdown, month by month.
   *
   * The Result's value is the runway in whole months: the number of months
   * you finish with the balance still at or above zero. When the money does
   * not run out inside the horizon, `sustainable` is true and the value is
   * the horizon — read as "at least this", never as a precise figure.
   *
   * opts, all optional except where the household cannot supply them:
   *   preset                   'quit' | 'laid_off' | 'business'
   *   cushionCents             defaults to the household's cash
   *   monthlyExpensesCents     defaults to the household's
   *   expenseCutCents          what you would trim, per month
   *   extraMonthlyCostCents    health cover you now pay yourself, per month
   *   otherMonthlyIncomeCents  a partner's income, rent, anything continuing
   *   severanceCents           a one-off, landing before month 1. NOT gated
   *                            by preset: money you start with is money you
   *                            start with, whether it is a redundancy
   *                            payment or the savings you set aside to
   *                            launch something.
   *   benefitMonthlyCents      unemployment, YOUR looked-up figure
   *   benefitMonths            how long it runs
   *   rampShape, rampTargetMonthlyCents, rampMonths
   */
  function project(household, tables, opts) {
    var o = opts || {};
    var preset = PRESETS[o.preset] || PRESETS.quit;

    var cushion = Money.isEntered(o.cushionCents)
      ? o.cushionCents : valueOf(Schema.cashCents(household));
    if (!Money.isEntered(cushion)) {
      return Money.incomplete('Add what you have saved to see how long it lasts.', ['cash']);
    }
    if (cushion < 0) {
      return Money.incomplete('A cushion cannot be less than nothing.', ['cash']);
    }

    var expenses = Money.isEntered(o.monthlyExpensesCents)
      ? o.monthlyExpensesCents : valueOf(Schema.monthlyExpensesCents(household));
    if (!Money.isEntered(expenses)) {
      return Money.incomplete('Add your monthly expenses to see how long the money lasts.',
        ['monthlyExpenses']);
    }

    var cut = num(o.expenseCutCents, 0);
    if (cut > expenses) {
      return Money.incomplete('You cannot cut more than you spend.', ['expenseCutCents']);
    }
    var extra = num(o.extraMonthlyCostCents, 0);
    var other = num(o.otherMonthlyIncomeCents, 0);
    var severance = num(o.severanceCents, 0);

    var benefitMonthly = preset.benefit ? num(o.benefitMonthlyCents, 0) : 0;
    var benefitMonths = preset.benefit ? Math.max(0, Math.round(num(o.benefitMonths, 0))) : 0;

    var shape = preset.ramp ? (RAMP_SHAPES[o.rampShape] ? o.rampShape : 'linear') : 'none';
    var rampTarget = preset.ramp ? num(o.rampTargetMonthlyCents, 0) : 0;
    var rampMonths = preset.ramp ? Math.max(0, Math.round(num(o.rampMonths, 0))) : 0;

    var outflow = (expenses - cut) + extra;

    var balance = cushion + severance;
    var rows = [];
    var runway = 0;
    var ranOutAt = null;
    var breakEvenMonth = null;

    for (var m = 1; m <= HORIZON_MONTHS; m++) {
      var benefit = m <= benefitMonths ? benefitMonthly : 0;
      var revenue = Math.round(rampTarget * rampShare(shape, m, rampMonths));
      var inflow = other + benefit + revenue;

      if (breakEvenMonth === null && inflow >= outflow) breakEvenMonth = m;

      balance += inflow - outflow;
      rows.push({
        month: m,
        balanceCents: Math.round(balance),
        inflowCents: inflow,
        outflowCents: outflow,
        benefitCents: benefit,
        revenueCents: revenue,
        netCents: inflow - outflow
      });

      if (balance >= 0) { if (ranOutAt === null) runway = m; }
      else if (ranOutAt === null) { ranOutAt = m; }
    }

    var sustainable = ranOutAt === null;

    /* The steady state: what happens once every temporary inflow has ended
       and every ramp has finished. This is the number that decides whether
       a runway is a bridge to something or just a slower ending. */
    var steadyInflow = other + Math.round(rampTarget * rampShare(shape, HORIZON_MONTHS, rampMonths));
    var steadyBurn = outflow - steadyInflow;

    return Money.ok(sustainable ? HORIZON_MONTHS : runway, {
      preset: preset,
      sustainable: sustainable,
      horizonMonths: HORIZON_MONTHS,
      runwayMonths: sustainable ? HORIZON_MONTHS : runway,
      ranOutInMonth: ranOutAt,
      cushionCents: cushion,
      severanceCents: severance,
      startingCents: cushion + severance,
      monthlyExpensesCents: expenses,
      /* 'current' unless the room passed the floor (D-075). */
      expenseBasis: o.expenseBasis || 'current',
      expenseCutCents: cut,
      extraMonthlyCostCents: extra,
      otherMonthlyIncomeCents: other,
      monthlyOutflowCents: outflow,
      /* The burn in the very first month, before anything changes. */
      firstMonthNetCents: rows[0].netCents,
      steadyMonthlyBurnCents: steadyBurn,
      steadyInflowCents: steadyInflow,
      benefitMonthlyCents: benefitMonthly,
      benefitMonths: benefitMonths,
      /* The month the benefit stops, which is where a runway usually falls
         off a cliff — worth naming rather than leaving in the chart. */
      benefitEndsAfterMonth: benefitMonths > 0 ? benefitMonths : null,
      rampShape: shape,
      rampTargetMonthlyCents: rampTarget,
      rampMonths: rampMonths,
      /* First month the money coming in covers the money going out. */
      breakEvenMonth: breakEvenMonth,
      endingBalanceCents: rows[rows.length - 1].balanceCents,
      rows: rows
    });
  }

  function valueOf(result) { return Money.isOk(result) ? result.value : null; }

  /**
   * What it would take to reach a target runway, given everything else
   * stays as it is. Two answers, because there are two levers and people
   * have different amounts of each.
   *
   * Returns nulls for a lever that cannot get there — a target you cannot
   * reach by cutting alone is a real answer, and printing a cut bigger than
   * the whole budget would not be.
   */
  function toReach(household, tables, opts, targetMonths) {
    var base = project(household, tables, opts);
    if (!Money.isOk(base)) return base;
    if (!Money.isEntered(targetMonths) || targetMonths <= 0) {
      return Money.incomplete('Pick a number of months to aim for.', ['targetMonths']);
    }
    if (base.runwayMonths >= targetMonths) {
      return Money.ok(0, { alreadyThere: true, targetMonths: targetMonths,
                           runwayMonths: base.runwayMonths });
    }

    /* Search rather than solve. The month-by-month path has a benefit
       cliff and a ramp in it, so there is no closed form that stays true
       when either changes — and a bisection over an integer month count is
       cheap. Both searches are monotone: more cushion never shortens the
       runway, and neither does a bigger cut. */
    function reaches(patch) {
      var r = project(household, tables, Object.assign({}, opts, patch));
      return Money.isOk(r) && r.runwayMonths >= targetMonths;
    }

    var extraCushion = search(function (cents) {
      return reaches({ cushionCents: base.cushionCents + cents });
    }, 0, Math.max(base.monthlyOutflowCents * (targetMonths + 12), 100));

    var maxCut = base.monthlyExpensesCents - base.expenseCutCents;
    var deeperCut = search(function (cents) {
      return reaches({ expenseCutCents: base.expenseCutCents + cents });
    }, 0, maxCut);

    return Money.ok(targetMonths, {
      alreadyThere: false,
      targetMonths: targetMonths,
      runwayMonths: base.runwayMonths,
      monthsShort: targetMonths - base.runwayMonths,
      extraCushionCents: extraCushion,
      deeperMonthlyCutCents: deeperCut,
      /* Cutting has a ceiling; saying so beats returning a number nobody
         could live on, and it is why both levers are reported. */
      cutCanReachIt: deeperCut !== null
    });
  }

  /** Smallest whole-cent amount in [0, high] for which `ok` is true, or null. */
  function search(ok, low, high) {
    if (ok(low)) return low;
    if (!ok(high)) return null;
    var lo = low, hi = high;
    while (hi - lo > 1) {
      var mid = Math.floor((lo + hi) / 2);
      if (ok(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  /** All three presets on the same numbers, for the room's comparison. */
  function acrossPresets(household, tables, opts) {
    return Object.keys(PRESETS).map(function (id) {
      return { preset: PRESETS[id],
               result: project(household, tables, Object.assign({}, opts, { preset: id })) };
    });
  }

  return {
    HORIZON_MONTHS: HORIZON_MONTHS,
    PRESETS: PRESETS,
    RAMP_SHAPES: RAMP_SHAPES,
    rampShare: rampShare,
    project: project,
    toReach: toReach,
    acrossPresets: acrossPresets
  };
});
