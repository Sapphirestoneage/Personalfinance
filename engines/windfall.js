/* ==========================================================================
   engines/windfall.js — a lump sum, all at once or spread out.
   --------------------------------------------------------------------------
   SPEC.md §13, Tier 1: "Lump Sum vs. DCA — investing a lump sum vs.
   spreading over time. Showing the 'usually loses but reduces regret risk'
   nuance properly needs a Monte Carlo simulation, not a single
   deterministic projection."

   That warning is correct, and it is the reason this file does NOT do what
   a lump-sum-vs-DCA calculator normally does.

   A single projection at a 7% expected return has exactly one answer:
   invest it all now. It has to. Money in the market for longer, at a
   positive assumed rate, ends up ahead — the "comparison" is a restatement
   of the assumption, dressed up as a finding. Showing that number with a
   verdict attached would be false confidence about the one thing the person
   actually wants to know, which is what happens if they are unlucky.

   A Monte Carlo would answer that, and a Monte Carlo needs return
   distribution parameters — a mean, a volatility, and a defensible source
   for both. This repo does not have them and will not invent them (D-036).

   So this engine inverts the question. Instead of asserting an outcome, it
   solves for the THRESHOLD:

       how far would the market have to fall, over the months you spread
       the money in, for spreading it to have been the better call?

   That is deterministic, needs no distribution, and is strictly more
   informative than a point estimate: it names the exact scenario in which
   the cautious choice wins, and leaves the odds of that scenario to the
   person, who is allowed to have a view. The expected gap is reported too —
   as the price of the insurance, not as a verdict.

   The month-by-month simulation is deliberately a loop rather than a closed
   form, for the same reason engines/debt.js is: it is inspectable, it
   handles the cash side without a second formula, and nothing here is big
   enough for the loop to cost anything.

   Monthly rate is annualRate / 12, matching engines/projection.js. One
   convention for the whole app.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports)
    ? require('../shared/money.js')
    : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Windfall = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var MONTHS = 12;

  /* The windows people actually consider. Anything else is typed in. */
  var WINDOWS = [
    { months: 3,  label: 'Over 3 months' },
    { months: 6,  label: 'Over 6 months' },
    { months: 12, label: 'Over a year' },
    { months: 24, label: 'Over two years' }
  ];

  /* How far the search for the break-even return will look, as an annual
     rate. Below -95% a year there is no market left to have a view about. */
  var SEARCH_LOW = -0.95;
  var SEARCH_HIGH = 1.0;
  var SEARCH_STEPS = 60;          /* bisection: 2^-60 of the range, ample */

  /* Illustration rows, not forecasts. A bad year, a flat year, a normal
     year, a good one — the person can replace any of them. */
  var SCENARIO_RATES = [-0.30, -0.15, 0, 0.07, 0.20];

  /**
   * Both strategies, month by month, on the same assumed return.
   *   run(amountCents, months, annualRate, cashAnnualRate)
   *
   * Lump: everything invested at the start.
   * Spread: an equal slice invested at the start of each month; whatever is
   *         still waiting earns the cash rate, because it is not under a
   *         mattress. Ignoring that is the most common way this comparison
   *         is rigged in favour of the lump sum.
   *
   * Returns plain numbers (not a Result) — it is the inner loop, and every
   * caller has already checked its inputs.
   */
  function run(amountCents, months, annualRate, cashAnnualRate) {
    var rm = annualRate / MONTHS;
    var cm = cashAnnualRate / MONTHS;
    var slice = amountCents / months;

    var lump = amountCents;
    var invested = 0, waiting = amountCents;
    var path = [];

    for (var m = 1; m <= months; m++) {
      /* Buy at the start of the month, so the slice is exposed for the
         month it was bought in. The slice is a fixed share of the ORIGINAL
         amount — the interest the waiting cash earns stays in the account
         and goes in with the last purchase, which is what actually happens
         when somebody sets up a monthly transfer for a round number. */
      var buy = (m === months) ? waiting : slice;
      waiting -= buy;
      invested += buy;

      lump *= (1 + rm);
      invested *= (1 + rm);
      waiting *= (1 + cm);

      path.push({
        month: m,
        lumpCents: Math.round(lump),
        spreadCents: Math.round(invested + waiting),
        investedCents: Math.round(invested),
        waitingCents: Math.round(waiting)
      });
    }
    return {
      lump: lump,
      spread: invested + waiting,
      investedAtEnd: invested,
      waitingAtEnd: waiting,
      path: path
    };
  }

  /** lump − spread at a given annual return. Increasing in the return. */
  function edge(amountCents, months, annualRate, cashAnnualRate) {
    var r = run(amountCents, months, annualRate, cashAnnualRate);
    return r.lump - r.spread;
  }

  /**
   * The annual return at which the two strategies end level — below it,
   * spreading wins.
   *
   * There is an identity hiding here, and it is the most useful sentence
   * this engine produces: the break-even return IS the cash rate. Money
   * waiting to be invested is not idle, it is earning the cash rate, so
   * spreading a lump sum is a blend of the market and the savings account,
   * and a blend beats the pure thing exactly when the thing it is blended
   * with does better. Not "usually", not "on average" — exactly.
   *
   * This is still solved by bisection rather than by returning the cash
   * rate, on purpose. The identity holds for THIS timing convention (buy at
   * the start of each month, everything else in cash); change the
   * convention and it may not. A solver keeps telling the truth; an
   * asserted identity would quietly stop. test/run.js checks that the
   * solver and the identity agree, which is what makes the sentence above
   * safe to print in the room.
   *
   * Returns null when spreading never wins inside the search range, which
   * happens when the cash rate is at or above the search floor's return —
   * the room says so rather than printing a number nobody could act on.
   */
  function breakEvenAnnualRate(amountCents, months, cashAnnualRate) {
    if (months <= 1) return null;               /* one slice IS the lump sum */
    var low = SEARCH_LOW, high = SEARCH_HIGH;
    if (edge(amountCents, months, low, cashAnnualRate) > 0) return null;
    if (edge(amountCents, months, high, cashAnnualRate) < 0) return null;
    for (var i = 0; i < SEARCH_STEPS; i++) {
      var mid = (low + high) / 2;
      if (edge(amountCents, months, mid, cashAnnualRate) < 0) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  /**
   * The whole comparison.
   *   compare({ amountCents, months, annualRate, cashAnnualRate })
   *
   * The Result's value is the GAP in cents — what going all in is expected
   * to be worth over spreading it, at the assumed return. Positive means
   * the lump sum is ahead, which at any positive assumed return it will be;
   * that is why the break-even is the headline in the room and this is not.
   */
  function compare(opts) {
    var o = opts || {};
    var missing = Money.missingFrom({
      amountCents: o.amountCents, months: o.months, annualRate: o.annualRate
    });
    if (missing.length) {
      return Money.incomplete('Need an amount, a number of months and a return assumption.',
        missing);
    }
    if (o.amountCents <= 0) {
      return Money.incomplete('There is nothing to invest yet.', ['amountCents']);
    }
    if (o.months < 1) {
      return Money.incomplete('Spreading it over less than a month is investing it now.',
        ['months']);
    }
    if (Math.round(o.months) !== o.months) {
      return Money.incomplete('Use whole months.', ['months']);
    }

    /* Cash left waiting earns something unless you say it earns nothing.
       Absent is not zero here either — but a rate genuinely can be zero, so
       the default is stated rather than assumed silently. */
    var cashRate = Money.isEntered(o.cashAnnualRate) ? o.cashAnnualRate : 0;

    var r = run(o.amountCents, o.months, o.annualRate, cashRate);
    var gap = r.lump - r.spread;
    var breakEven = breakEvenAnnualRate(o.amountCents, o.months, cashRate);

    /* The same threshold said the way a person experiences it: the total
       fall over the window, not an annualised rate. */
    var totalDrop = breakEven === null ? null
      : Math.pow(1 + breakEven / MONTHS, o.months) - 1;

    return Money.ok(Math.round(gap), {
      amountCents: o.amountCents,
      months: o.months,
      annualRate: o.annualRate,
      cashAnnualRate: cashRate,
      lumpCents: Math.round(r.lump),
      spreadCents: Math.round(r.spread),
      gapCents: Math.round(gap),
      /* The gap as a share of the money itself — the comparable number
         across a $5,000 windfall and a $500,000 one. */
      gapShare: o.amountCents === 0 ? null : gap / o.amountCents,
      gapPerMonthCents: Math.round(gap / o.months),
      /* Below this annual return, spreading it wins. */
      breakEvenAnnualRate: breakEven,
      breakEvenTotalDrop: totalDrop,
      /* How much of the money is exposed to the market on average across
         the window — the plain reason the lump sum is ahead at all. */
      averageExposure: (o.months + 1) / (2 * o.months),
      averageWaitingCents: Math.round(o.amountCents * (o.months - 1) / (2 * o.months)),
      path: r.path,
      /* One slice is a lump sum; say so rather than printing a zero gap and
         letting it read as "they are the same strategy". */
      degenerate: o.months === 1
    });
  }

  /**
   * What each strategy ends at IF the market did a given thing.
   *
   * These are not forecasts and carry no probability — that is precisely
   * what this engine refuses to invent. They are "suppose it did this"
   * rows, and the person picks the this. The point of the table is the
   * shape: spreading loses a little in every good scenario and saves a lot
   * in the bad ones, which is what buying insurance looks like.
   */
  function scenarios(opts, rates) {
    var o = opts || {};
    var list = rates || SCENARIO_RATES;
    var missing = Money.missingFrom({ amountCents: o.amountCents, months: o.months });
    if (missing.length) {
      return Money.incomplete('Need an amount and a number of months.', missing);
    }
    var cashRate = Money.isEntered(o.cashAnnualRate) ? o.cashAnnualRate : 0;
    return Money.ok(list.map(function (rate) {
      var r = run(o.amountCents, o.months, rate, cashRate);
      return {
        annualRate: rate,
        lumpCents: Math.round(r.lump),
        spreadCents: Math.round(r.spread),
        gapCents: Math.round(r.lump - r.spread),
        spreadAhead: r.spread > r.lump
      };
    }));
  }

  /**
   * Every preset window at once, for the room's comparison table. The
   * assumed return is shared; only the window changes.
   */
  function acrossWindows(opts) {
    var o = opts || {};
    return WINDOWS.map(function (w) {
      return { months: w.months, label: w.label,
               result: compare(Object.assign({}, o, { months: w.months })) };
    });
  }

  return {
    WINDOWS: WINDOWS,
    SCENARIO_RATES: SCENARIO_RATES,
    run: run,
    edge: edge,
    breakEvenAnnualRate: breakEvenAnnualRate,
    compare: compare,
    scenarios: scenarios,
    acrossWindows: acrossWindows
  };
});
