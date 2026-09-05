/* ==========================================================================
   engines/purchase.js — one thing you are eyeing, priced in life.
   DECISIONS.md D-099 (the Big Purchase room).
   --------------------------------------------------------------------------
   The room does not judge whether you should. It prices the choice four
   ways and stops:

     hours     hours of your life at the real hourly wage — the lens's
               'hours' mode (shared/lens.js), absent without a wage
     pushed    months FI moves later if the price is spent — the lens's
               'pushed' mode, the same FI arithmetic the dashboard uses
     cash      today's cash less the price, against the 3-month floor and
               the 6-month cushion (spending × 3 and × 6), and what a month
               of saving it takes to have it in N months without dipping
               under the floor
     financed  the level payment over a stated term (36 months; 60 for a
               car) and the interest it adds — engines/projection.js's
               levelPaymentCents, not a second amortisation

   Nothing here is a new formula: hours and FI come from the lens, the
   payment from the projection engine, the car rule and cost-per-use from
   engines/quickmath.js. This file only puts them side by side.

   Empty ≠ zero: a blank price is incomplete; a blank rate is "paid in
   cash", a rate of 0 is a 0% loan; blank months means "no date yet" and
   is priced as if today, said in the result (monthsKnown: false).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Projection: require('./projection.js'),
      QuickMath: require('./quickmath.js'),
      /* The lens loads after the engines in a room page, so it is looked up
         at call time rather than captured at load. */
      lens: function () { return require('../shared/lens.js'); }
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Projection: root.SLAF && root.SLAF.Projection,
      QuickMath: root.SLAF && root.SLAF.QuickMath,
      lens: function () { return root.SLAF && root.SLAF.Lens; }
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Projection, deps.QuickMath, deps.lens);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Purchase = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Projection, QuickMath, lens) {
  'use strict';

  /* The cushion convention: three months of spending is the floor most
     guidance starts from, six the full fund (data/liquidity_benchmarks.json
     draws the same bands). Convention, not law. */
  var CUSHION = { floorMonths: 3, fullMonths: 6 };

  /* The finance term is an assumption, not an input: a personal loan or
     store credit runs about three years, a car loan five. Stated in the
     drawer. The 20/3/8 rule (engines/quickmath.js) caps a car loan at 36
     months, and the car result says which leg the term fails. */
  var TERMS = { default: 36, car: 60 };

  /* The kinds the room's select offers. Stored in purchase.label. */
  var KINDS = [
    ['car', 'A car'],
    ['trip', 'A trip'],
    ['furniture', 'Furniture'],
    ['tech', 'Tech'],
    ['other', 'Something else']
  ];

  /** The term in months for a kind of purchase. */
  function termFor(kind) { return kind === 'car' ? TERMS.car : TERMS.default; }

  /** The purchase as stored, every field entered-or-null. */
  function plan(household) {
    return Schema.createPurchasePlan((household && household.purchase) || {});
  }

  /**
   * weigh(h, T, opts) → Result. `value` is the price in cents; the rest is
   * the four readings. opts.uses (optional) runs Quick Math's cost per use.
   */
  function weigh(household, tables, opts) {
    var o = opts || {};
    var p = plan(household);
    if (!Money.isEntered(p.priceCents)) return Money.incomplete('Add a price to see what it costs in life.', ['priceCents']);
    if (p.priceCents < 0) return Money.incomplete('A price cannot be negative.', ['priceCents']);
    var price = p.priceCents;
    var Lens = lens();

    var monthsKnown = Money.isEntered(p.monthsAway);
    var months = monthsKnown ? Math.max(0, p.monthsAway) : 0;
    var financed = Money.isEntered(p.financeRate);
    var kind = p.label || null;

    /* ---- Hours and FI, through the lens ---------------------------------- */
    var hours = Lens ? Lens.apply(price, 'hours', household, tables) : Money.incomplete('The lens is not loaded.', ['realHourlyWage']);
    var pushed = Lens ? Lens.apply(price, 'pushed', household, tables) : Money.incomplete('The lens is not loaded.', ['savingsRate']);

    /* ---- Cash against the cushion ---------------------------------------- */
    var cash = Schema.cashCents(household);
    var spend = Schema.monthlyExpensesCents(household);
    var floor = Money.isOk(spend) ? spend.value * CUSHION.floorMonths : null;
    var full = Money.isOk(spend) ? spend.value * CUSHION.fullMonths : null;
    var monthsOfSpending = Money.isOk(spend) && spend.value > 0 ? price / spend.value : null;

    var cashAfter = null, above = null, need = null, monthly = null, affordToday = null, cashShortOfFloor = null;
    if (Money.isOk(cash)) {
      /* Paid in cash it leaves today; financed, nothing leaves up front. */
      cashAfter = financed ? cash.value : cash.value - price;
      if (floor !== null) {
        above = Math.max(0, cash.value - floor);
        need = Math.max(0, price - above);
        affordToday = need === 0;
        cashShortOfFloor = cash.value - price < floor;
        monthly = need > 0 && months > 0 ? Math.ceil(need / months) : null;
      }
    }

    /* ---- Financing ----------------------------------------------------------- */
    var term = termFor(kind);
    var loan = null, carRule = null;
    if (financed) {
      loan = Projection.levelPaymentCents({ principalCents: price, annualRate: p.financeRate, months: term });
      if (kind === 'car' && QuickMath) {
        /* Quick Math's 20/3/8 rule, run as if the whole price were borrowed
           (this room has no down-payment box). Only the rule's own figures
           are carried — never a nested Result's status. */
        var cr = QuickMath.carRule2038(household, { carPriceCents: price, downPaymentCents: 0, termMonths: term, loanRate: p.financeRate });
        if (Money.isOk(cr)) carRule = { rule: cr.rule, checks: cr.checks, passesAll: cr.passesAll, paymentCapCents: cr.paymentCapCents, monthlyGrossCents: cr.monthlyGrossCents };
      }
    }

    /* ---- Cost per use, when asked ----------------------------------------- */
    var perUse = Money.isEntered(o.uses) && QuickMath ? QuickMath.costPerUse({ priceCents: price, uses: o.uses }) : null;

    /* ---- The zone ------------------------------------------------------------- */
    var zone, verdict;
    if (cashShortOfFloor === null) {
      zone = null; verdict = 'Add your cash and spending in Start Here to see the cash after.';
    } else if (!financed && months === 0 && cashShortOfFloor) {
      zone = 'out'; verdict = 'Paid today, the cash after is under the three-month floor.';
    } else if (need > 0) {
      zone = 'watch';
      verdict = financed ? 'Financed, the cash stays put and the interest is the price of that.'
        : months > 0 ? 'It needs saving first to stay above the floor.' : 'It needs saving first to stay above the floor.';
    } else {
      zone = 'good'; verdict = 'You can afford it today and stay above the floor.';
    }

    return Money.ok(price, {
      priceCents: price,
      kind: kind,
      monthsAway: months,
      monthsKnown: monthsKnown,
      paidNow: months === 0,
      financed: financed,
      financeRate: financed ? p.financeRate : null,
      /* in life */
      hours: Money.isOk(hours) ? hours.value : null,
      hoursDisplay: Money.isOk(hours) ? hours.display : null,
      hoursReason: Money.isOk(hours) ? null : hours.reason,
      wageCents: Money.isOk(hours) ? hours.wageCents : null,
      fiMonthsPushed: Money.isOk(pushed) ? pushed.value : null,
      fiDisplay: Money.isOk(pushed) ? pushed.display : null,
      fiReason: Money.isOk(pushed) ? null : pushed.reason,
      monthsOfSpending: monthsOfSpending,
      /* in cash */
      cashCents: Money.isOk(cash) ? cash.value : null,
      cashReason: Money.isOk(cash) ? null : 'Add your cash in Start Here to see the cash after.',
      spendCents: Money.isOk(spend) ? spend.value : null,
      spendReason: Money.isOk(spend) ? null : spend.reason,
      floorCents: floor,
      fullCents: full,
      cashAfterCents: cashAfter,
      aboveFloorCents: above,
      needCents: need,
      monthlySavingCents: monthly,
      affordToday: affordToday,
      cashShortOfFloor: cashShortOfFloor,
      cushion: CUSHION,
      /* financed */
      termMonths: term,
      paymentCents: loan && Money.isOk(loan) ? loan.value : null,
      /* A 0% loan has no interest by definition; the cent of rounding in
         the level payment lands in the last instalment, not in "interest". */
      totalInterestCents: loan && Money.isOk(loan) ? (p.financeRate === 0 ? 0 : loan.totalInterestCents) : null,
      totalPaidCents: loan && Money.isOk(loan) ? (p.financeRate === 0 ? price : loan.totalPaidCents) : null,
      carRule: carRule,
      perUseCents: perUse && Money.isOk(perUse) ? perUse.value : null,
      zone: zone,
      verdict: verdict
    });
  }

  return {
    CUSHION: CUSHION,
    TERMS: TERMS,
    KINDS: KINDS,
    termFor: termFor,
    plan: plan,
    weigh: weigh
  };
});
