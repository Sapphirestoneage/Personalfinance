/* ==========================================================================
   engines/race.js — the Race to $100K.
   DECISIONS.md D-217 (K4).
   --------------------------------------------------------------------------
   The old line: the first $100,000 is the hardest. This file dates the
   rung the household's net worth (or its invested money alone) reaches
   next, then every $100K rung after it to $1M, so the shrinking gaps are
   plain to see. At each rung it splits what got there into what was put
   in and what grew, and marks the first rung where growth did more of the
   work than contributions.

   Every date comes from engines/countdown.js goalCountdown(), the one
   countdown in the suite, with the return bands for its range. A household
   saving nothing whose money cannot grow to the next rung is told so, with
   the monthly saving (and the share of take-home it is) that would reach
   that rung in five years, never a far-off date pretending to mean
   something.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Countdown: require('./countdown.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Countdown: S.Countdown };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Countdown);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Race = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Countdown) {
  'use strict';

  var RUNG_CENTS = 10000000;        /* $100,000 */
  var TOP_CENTS = 100000000;        /* $1,000,000 */
  var HONEST_YEARS = 5;             /* "what would reach the next rung in five years" */

  /** What is saved a year, from the one savings-rate figure. */
  function annualSavings(household, tables) {
    var sr = Tier0.savingsRate(household, tables);
    var basis = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
    if (!Money.isOk(basis)) return basis;
    return Money.ok(basis.annualSavingsCents, { takeHomeAnnualCents: basis.takeHomeAnnualCents });
  }

  /**
   * rungs(household, tables, opts) → Result
   *   opts.investedOnly    race the invested money, not net worth
   *   opts.monthlyContributionCents   override the household's saving
   *   opts.from            'YYYY-MM' (tests)
   *   value       the first rung's date at the middle band, or null
   *   startCents, basis 'netWorth' | 'invested', monthlyCents, rate, bands
   *   rows        [{ rungCents, months, date, range, gapMonths, contributedCents, grownCents, growthLeads }]
   *   firstGrowthLeadsRungCents   the rung where growth first does more than contributions, or null
   *   pastTop     already at or past $1M
   *   neverAtThisPace, monthlyNeededCents, neededShareOfTakeHome   when the next rung is out of reach
   */
  function rungs(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var start = o.investedOnly ? Schema.investmentsCents(h) : Tier0.netWorth(h);
    if (!Money.isOk(start)) return start;
    var monthly, takeHome = null;
    if (Money.isEntered(o.monthlyContributionCents)) monthly = o.monthlyContributionCents;
    else {
      var s = annualSavings(h, T);
      if (!Money.isOk(s)) return Money.incomplete('Add income, spending and filing status to know what is being saved each month.', s.missing);
      monthly = Math.round(s.value / 12); takeHome = s.takeHomeAnnualCents;
    }
    var a = Schema.resolveAssumptions(h, null, T);
    var bands = T.returnBands && T.returnBands.percentiles ? T.returnBands.percentiles : null;
    var rate = a.returnReal;
    var from = o.from || Schema.localMonth();
    if (start.value >= TOP_CENTS) {
      return Money.ok(null, { pastTop: true, startCents: start.value, basis: o.investedOnly ? 'invested' : 'netWorth', monthlyCents: monthly, rate: rate, bands: bands, rows: [], firstGrowthLeadsRungCents: null, neverAtThisPace: false });
    }
    var first = (Math.floor(Math.max(0, start.value) / RUNG_CENTS) + 1) * RUNG_CENTS;
    var rows = [], prevMonths = 0, prevCents = start.value, firstLead = null, never = false;
    for (var rung = first; rung <= TOP_CENTS; rung += RUNG_CENTS) {
      var cd = Countdown.goalCountdown({ targetCents: rung, savedCents: start.value, monthlyContributionCents: monthly, annualRate: rate, bands: bands, from: from });
      if (!Money.isOk(cd) || cd.neverAtThisPace) { never = rows.length === 0; break; }
      var gap = cd.months - prevMonths;
      var contributed = Math.max(0, monthly) * gap;
      var grown = rung - prevCents - contributed;
      var leads = grown > contributed;
      if (leads && firstLead === null) firstLead = rung;
      rows.push({ rungCents: rung, months: cd.months, date: cd.date, range: cd.range, gapMonths: gap, contributedCents: contributed, grownCents: grown, growthLeads: leads });
      prevMonths = cd.months; prevCents = rung;
    }
    var needed = null, share = null;
    if (never) {
      needed = Countdown.monthlyNeededCents(first, start.value, rate, HONEST_YEARS * 12);
      if (takeHome !== null && takeHome > 0) share = needed * 12 / takeHome;
    }
    return Money.ok(rows.length ? rows[0].date : null, {
      pastTop: false, startCents: start.value, basis: o.investedOnly ? 'invested' : 'netWorth', monthlyCents: monthly, rate: rate, bands: bands,
      nextRungCents: first, rows: rows, firstGrowthLeadsRungCents: firstLead,
      neverAtThisPace: never, monthlyNeededCents: needed, neededShareOfTakeHome: share, honestYears: HONEST_YEARS,
      reachedAll: rows.length && rows[rows.length - 1].rungCents === TOP_CENTS
    });
  }

  return { RUNG_CENTS: RUNG_CENTS, TOP_CENTS: TOP_CENTS, HONEST_YEARS: HONEST_YEARS, rungs: rungs, annualSavings: annualSavings };
});
