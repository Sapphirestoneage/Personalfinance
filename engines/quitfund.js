/* ==========================================================================
   engines/quitfund.js — the Quit Fund.
   DECISIONS.md D-217 (K7).
   --------------------------------------------------------------------------
   Months of freedom: the money a person could reach at no cost (the free
   tiers of engines/reachable.js: cash, Roth contributions, Roth earnings
   once past the access age) divided by the floor month with health cover
   added. The floor is engines/cashflow.js minimumViableMonthCents when the
   lines are marked, else the household month; cover is the COBRA figure
   from data/cobra_aca_2024.json (the cautious one; the marketplace figure
   is shown beside it).

   "Laid off" counts unemployment benefit for the state's weeks, at the
   replacement rate up to the state cap from data/ui_benefits.json. "Quit"
   counts none: quitting usually disqualifies a claim, and the note says so.
   Nothing else differs between the two.

   The dates to 3, 6 and 12 months come from engines/countdown.js
   goalCountdown(), the one countdown in the suite, at 0% because the fund
   is cash.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), CashFlow: require('./cashflow.js'), Reachable: require('./reachable.js'), Countdown: require('./countdown.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, CashFlow: S.CashFlow, Reachable: S.Reachable, Countdown: S.Countdown };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.CashFlow, deps.Reachable, deps.Countdown);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.QuitFund = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, CashFlow, Reachable, Countdown) {
  'use strict';

  var MONTHS = 12, WEEKS_A_YEAR = 52, WEEKS_A_MONTH = 52 / 12;
  var MODES = ['quit', 'laidOff'];
  var TARGETS = [3, 6, 12];

  /** The unemployment benefit for a lay-off: weekly at the replacement rate up to the state cap, for the state's weeks. */
  function benefit(household, tables) {
    var ui = tables && tables.uiBenefits;
    var state = household && household.state;
    if (!ui || !state || !ui.states || !ui.states[state]) return { weeklyCents: 0, weeks: 0, totalCents: 0, monthlyCents: 0, state: state || null, reason: !state ? 'No state chosen, so no benefit is counted.' : 'No benefit table for ' + state + '.' };
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return { weeklyCents: 0, weeks: 0, totalCents: 0, monthlyCents: 0, state: state, reason: 'No pay entered, so no benefit is estimated.' };
    var row = ui.states[state];
    var weekly = Math.min(row.maxWeeklyDollars * 100, Math.round(gross.value / WEEKS_A_YEAR * (ui.replacementRate || 0.5)));
    return { weeklyCents: weekly, weeks: row.weeks, totalCents: weekly * row.weeks, monthlyCents: Math.round(weekly * WEEKS_A_MONTH), state: state, reason: null, maxWeeklyCents: row.maxWeeklyDollars * 100 };
  }

  /**
   * plan(household, tables, opts) → Result
   *   opts.mode   'quit' (default) | 'laidOff'
   *   opts.from   'YYYY-MM' (tests)
   *   value       months of freedom
   *   freeCents, freeTiers, floorCents, floorSource, coverCents, coverKind, marketplaceCents,
   *   monthCents (floor + cover), benefit, monthlyCents (what is saved a month),
   *   targets [{ months, targetCents, date, range, reachedNow, neverAtThisPace, monthlyNeededCents }]
   */
  function plan(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var mode = MODES.indexOf(o.mode) > -1 ? o.mode : 'quit';
    var wf = Reachable.waterfall(h, T);
    var freeTiers = (wf.tiers || []).filter(function (t) { return t.free; });
    var free = freeTiers.reduce(function (s, t) { return s + t.availableCents; }, 0);
    if (!(wf.tiers || []).length && !Money.isOk(Schema.monthlyExpensesCents(h))) return Money.incomplete('Add your cash and your monthly spending to see how long you could step away.', ['cashSavings', 'monthlyExpenses']);
    var floorSource = 'floor';
    var floor = T.expenseCategories ? CashFlow.minimumViableMonthCents(h, T.expenseCategories) : Money.incomplete('no catalog', []);
    if (!Money.isOk(floor)) { floor = Schema.monthlyExpensesCents(h); floorSource = 'month'; }
    if (!Money.isOk(floor)) return Money.incomplete('Add your monthly spending to see how long you could step away.', ['monthlyExpenses']);
    var cobra = T.cobraAca && T.cobraAca.monthly;
    var family = (h.people || []).length > 1;
    var cover = cobra ? (family ? cobra.cobraFamilyCents : cobra.cobraSingleCents) : 0;
    var market = cobra ? cobra.acaSilver40Cents : null;
    var month = floor.value + cover;
    if (month <= 0) return Money.incomplete('A month of nothing needs no fund.', ['monthlyExpenses']);
    var ben = mode === 'laidOff' ? benefit(h, T) : { weeklyCents: 0, weeks: 0, totalCents: 0, monthlyCents: 0, state: h.state || null, reason: 'Quitting usually disqualifies an unemployment claim, so none is counted.' };
    var months = (free + ben.totalCents) / month;
    var sr = Tier0.savingsRate(h, T);
    var basis = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
    var monthly = Money.isOk(basis) ? Math.round(basis.annualSavingsCents / MONTHS) : 0;
    var targets = TARGETS.map(function (n) {
      var target = Math.max(0, n * month - ben.totalCents);
      var cd = Countdown.goalCountdown({ targetCents: target, savedCents: free, monthlyContributionCents: monthly, annualRate: 0, from: o.from });
      return { months: n, targetCents: target, date: cd.date, countdownMonths: cd.months, range: cd.range, reachedNow: cd.reachedNow, neverAtThisPace: cd.neverAtThisPace,
        monthlyNeededCents: cd.neverAtThisPace ? Countdown.monthlyNeededCents(target, free, 0, 5 * MONTHS) : null };
    });
    return Money.ok(Math.round(months * 10) / 10, {
      mode: mode, freeCents: free, freeTiers: freeTiers.map(function (t) { return { id: t.id, label: t.label, cents: t.availableCents }; }),
      floorCents: floor.value, floorSource: floorSource, coverCents: cover, coverKind: family ? 'family' : 'single', marketplaceCents: market,
      monthCents: month, benefit: ben, monthlyCents: monthly, savingsKnown: Money.isOk(basis), targets: targets,
      rough: wf.rough, assumed: wf.assumed || []
    });
  }

  return { MODES: MODES, TARGETS: TARGETS, plan: plan, benefit: benefit };
});
