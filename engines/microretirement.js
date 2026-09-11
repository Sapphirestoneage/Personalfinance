/* ==========================================================================
   engines/microretirement.js — the Micro-Retirement Planner.
   DECISIONS.md D-219 (K5).
   --------------------------------------------------------------------------
   A planned break from work of 1 to 12 months, both sides on one screen:
   what it costs and what it buys. The fund is the break's spending, the
   health cover for it, less any income during it, plus a re-entry cushion
   for the gap until the first paycheque after coming back
   (data/reentry_gap.json, the median spell). The ready date comes from
   engines/countdown.js goalCountdown(), the one countdown, from the cash
   on hand at what is saved a month. How far the FI date moves comes
   through the lens (shared/lens.js, the 'pushed' mode). The
   career-momentum cost is a pause in pay growth from
   data/career_momentum.json, user-editable, always a range.

   Nothing is written: "Add this as a block" in the room saves a
   sabbatical block through shared/blocks.js.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Countdown: require('./countdown.js'),
      Lens: (function () { try { return require('../shared/lens.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Countdown: S.Countdown, Lens: S.Lens };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Countdown, deps.Lens);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.MicroRetirement = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Countdown, Lens) {
  'use strict';

  var MONTHS = 12, WEEKS_A_MONTH = 52 / 12, MIN_MONTHS = 1, MAX_MONTHS = 12;
  var DEFAULT_END_AGE = 65;

  function cashCents(household) {
    var total = 0, counted = 0;
    ((household && household.assets) || []).forEach(function (a) {
      if (!Money.isEntered(a.valueCents)) return;
      if (a.taxCharacter === 'cash' || (!a.taxCharacter && a.category === 'cash')) { total += a.valueCents; counted++; }
    });
    return counted ? total : null;
  }

  /**
   * plan(household, tables, opts) → Result
   *   opts.months              1 to 12 (REQUIRED)
   *   opts.start               'YYYY-MM' (optional)
   *   opts.spendMonthlyCents   during the break (absent: the household month)
   *   opts.incomeMonthlyCents  during the break (absent: none)
   *   opts.coverMonthlyCents   health cover (absent: COBRA from the table)
   *   opts.momentumRate        the pay penalty per year of break (absent: the table's middle band)
   *   opts.from                'YYYY-MM' (tests)
   *   value     the fund in cents
   */
  function plan(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    if (!Money.isEntered(o.months)) return Money.incomplete('How long a break? One to twelve months.', ['months']);
    var months = Math.max(MIN_MONTHS, Math.min(MAX_MONTHS, Math.round(o.months)));
    var spend;
    if (Money.isEntered(o.spendMonthlyCents)) spend = { cents: o.spendMonthlyCents, source: 'typed' };
    else { var m = Schema.monthlyExpensesCents(h); if (!Money.isOk(m)) return Money.incomplete('Add your monthly spending, or type what the break would cost a month.', ['monthlyExpenses']); spend = { cents: m.value, source: 'household' }; }
    var income = Money.isEntered(o.incomeMonthlyCents) ? Math.max(0, o.incomeMonthlyCents) : 0;
    var cobra = T.cobraAca && T.cobraAca.monthly;
    var family = (h.people || []).length > 1;
    var cover = Money.isEntered(o.coverMonthlyCents) ? o.coverMonthlyCents : (cobra ? (family ? cobra.cobraFamilyCents : cobra.cobraSingleCents) : 0);
    var coverSource = Money.isEntered(o.coverMonthlyCents) ? 'typed' : cobra ? 'cobra' : 'none';
    var gap = T.reentryGap && Money.isEntered(T.reentryGap.medianMonths) ? T.reentryGap.medianMonths : null;
    var cushion = gap === null ? 0 : Math.round(gap * spend.cents);
    var breakCents = months * Math.max(0, spend.cents + cover - income);
    var fund = breakCents + cushion;
    /* ready when: cash on hand at what is saved a month */
    var cash = cashCents(h);
    var sr = Tier0.savingsRate(h, T);
    var basis = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
    var monthly = Money.isOk(basis) ? Math.max(0, Math.round(basis.annualSavingsCents / MONTHS)) : 0;
    var cd = Countdown.goalCountdown({ targetCents: fund, savedCents: cash === null ? 0 : cash, monthlyContributionCents: monthly, annualRate: 0, from: o.from });
    /* how far FI moves */
    var fi = Lens ? Lens.apply(fund, 'pushed', h, T) : null;
    var fiMonths = fi && Money.isOk(fi) ? fi.value : null;
    /* the momentum cost, a range */
    var CM = T.careerMomentum;
    var gross = Schema.grossAnnualIncomeCents(h);
    var age = Schema.primaryAge(h);
    var endAge = h.targets && Money.isEntered(h.targets.retireAge) ? h.targets.retireAge : DEFAULT_END_AGE;
    var yearsLeft = Money.isEntered(age) ? Math.max(0, endAge - age) : null;
    var momentum = null;
    if (CM && Money.isOk(gross) && yearsLeft !== null) {
      var bands = CM.penaltyPerYearOfBreak;
      var mid = Money.isEntered(o.momentumRate) ? o.momentumRate : bands[CM.defaultBand || 'mid'];
      var breakYears = months / MONTHS;
      var cost = function (rate) { return Math.round(gross.value * rate * breakYears * yearsLeft); };
      momentum = { rate: mid, lowRate: Money.isEntered(o.momentumRate) ? mid : bands.low, highRate: Money.isEntered(o.momentumRate) ? mid : bands.high,
        cents: cost(mid), lowCents: cost(Money.isEntered(o.momentumRate) ? mid : bands.low), highCents: cost(Money.isEntered(o.momentumRate) ? mid : bands.high), yearsLeft: yearsLeft, source: Money.isEntered(o.momentumRate) ? 'typed' : 'table' };
    }
    return Money.ok(fund, {
      months: months, start: o.start || null, weeksBought: Math.round(months * WEEKS_A_MONTH),
      spendMonthlyCents: spend.cents, spendSource: spend.source, incomeMonthlyCents: income, coverMonthlyCents: cover, coverSource: coverSource, family: family,
      breakCents: breakCents, cushionCents: cushion, cushionMonths: gap, fundCents: fund,
      cashCents: cash, monthlyCents: monthly, savingsKnown: Money.isOk(basis),
      readyMonths: cd.months, readyDate: cd.date, reachedNow: cd.reachedNow, neverAtThisPace: cd.neverAtThisPace, monthlyNeededCents: cd.neverAtThisPace ? Countdown.monthlyNeededCents(fund, cash === null ? 0 : cash, 0, 5 * MONTHS) : null,
      fiMovesMonths: fiMonths, fiReason: fi && !Money.isOk(fi) ? fi.reason : null,
      momentum: momentum, endAge: endAge
    });
  }

  return { MIN_MONTHS: MIN_MONTHS, MAX_MONTHS: MAX_MONTHS, plan: plan, cashCents: cashCents };
});
