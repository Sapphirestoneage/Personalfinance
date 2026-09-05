/* ==========================================================================
   engines/decumulation.js — how a retiree draws, and how long it lasts.
   DECISIONS.md D-098 (the Decumulation room).
   --------------------------------------------------------------------------
     plan(household, tables, opts) → one Result with everything the room
                                     shows: the draw, the withdrawal rate
                                     and its verdict, what the VPW table
                                     allows at this age, the years until
                                     the investments are gone and the age
                                     that points to, and the two balance
                                     paths the chart draws.

   Nothing here is a second copy of a formula that exists elsewhere:
     • the withdrawal rate is engines/ratios.js's `withdrawalRate` row —
       (spending × 12 − income) ÷ investments, `covered` when income
       covers spending — read through Ratios.all, never re-derived;
     • the verdict is Ratios.verdict against the 4%/5% band in
       data/ratio_benchmarks.json;
     • years until empty is Projection.yearsUntilEmptyCents, the loop the
       dashboard's "age the money lasts to" already uses, so this room's
       headline equals the dashboard's;
     • the VPW percentage is Vpw.percentageAt on data/vpw_table.json, and
       the VPW path is Vpw.plan, the same loop the VPW calculator runs.

   The one loop that is new is the planned-draw path for the chart, and it
   is a replay of yearsUntilEmptyCents's arithmetic — balance × (1 + r) −
   draw, once a year — so the dot where the line hits zero is the same
   year the headline says.

   A planned draw, when entered, replaces the computed one; the rate is
   then planned ÷ investments. The stock share is clamped to 0–1 and the
   Result says so (`stockShareClamped`) rather than refusing the number.
   No Social Security amount is invented: engines/ss.js estimates from a
   working salary and a retiree's income here is already the pension or
   benefit, so the room only notes that the draw runs until that age.
   No tax on withdrawals is modelled — every figure is pre-tax.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'),
             Ratios: require('./ratios.js'), Projection: require('./projection.js'), Vpw: require('./vpw.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ratios: S.Ratios, Projection: S.Projection, Vpw: S.VPW };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ratios, deps.Projection, deps.Vpw);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Decumulation = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ratios, Projection, Vpw) {
  'use strict';

  var RATIO_ID = 'withdrawalRate';
  /* The chart runs to this age, or this many years when the age is unknown
     or the age is young enough that forty years comes first. */
  var PLAN_TO_AGE = 100;
  var MAX_HORIZON_YEARS = 40;
  /* The VPW table's middle column; what the engine and the room propose
     when no share has been entered. */
  var DEFAULT_STOCK_SHARE = 0.6;

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /** The withdrawal-rate row from the ratio registry — the ONE place the
   *  rate is computed. Returns the row ({ ok, result, value, verdict }). */
  function withdrawalRow(household, tables, opts) {
    var all = Ratios.all(household, tables, { now: opts && Money.isEntered(opts.now) ? opts.now : undefined });
    return all.rows.filter(function (r) { return r.id === RATIO_ID; })[0] || null;
  }

  /** The stock share as the plan uses it: entered and clamped, or the
   *  table's middle column. */
  function stockShareOf(decumulation) {
    var raw = decumulation && decumulation.stockShare;
    if (!Money.isEntered(raw)) return { value: DEFAULT_STOCK_SHARE, entered: false, clamped: false };
    var v = clamp01(raw);
    return { value: v, entered: true, clamped: v !== raw };
  }

  /** The planned-draw path: the balance at the start of each year, drawing
   *  `drawCents` at the end of every year and growing at `rate` — the same
   *  arithmetic as Projection.yearsUntilEmptyCents. Stops at the first zero. */
  function drawPath(startCents, drawCents, rate, years) {
    var rows = [{ year: 0, balanceCents: Math.round(startCents) }];
    var balance = startCents;
    for (var y = 1; y <= years; y++) {
      balance = balance * (1 + rate) - drawCents;
      if (balance <= 0) { rows.push({ year: y, balanceCents: 0 }); break; }
      rows.push({ year: y, balanceCents: Math.round(balance) });
    }
    return rows;
  }

  /**
   * The plan. opts.asOf: 'YYYY-MM-DD' for a deterministic age (tests);
   * opts.now: ms, passed through to the ratio registry.
   */
  function plan(household, tables, opts) {
    var h = household || {};
    var o = opts || {};
    var d = h.decumulation || {};
    var T = tables || {};

    var inv = Schema.investmentsCents(h);
    if (!Money.isOk(inv)) return Money.incomplete('Add your investments to see this.', ['investments']);
    if (inv.value <= 0) return Money.incomplete('Nothing invested to draw from.', ['investments']);

    var age = Schema.primaryAge(h, o.asOf);
    var assumptions = Schema.resolveAssumptions(h);
    var rate = assumptions.returnReal;
    if (!Money.isEntered(rate)) return Money.incomplete('No real-return assumption to project with.', ['returnReal']);

    var row = withdrawalRow(h, T, o);
    var ratio = row ? row.result : Money.incomplete('The withdrawal rate is not available.', []);
    var planned = Money.isEntered(d.plannedAnnualDrawCents) ? Math.max(0, Math.round(d.plannedAnnualDrawCents)) : null;
    var computedDraw = Money.isOk(ratio) ? ratio.annualDrawCents : null;

    var drawCents;
    if (planned !== null) drawCents = planned;
    else if (Money.isOk(ratio)) drawCents = computedDraw;
    else return Money.incomplete(ratio.reason, ratio.missing);

    var covered = planned === null ? ratio.covered === true : drawCents === 0;
    /* Not planned: the ratio's own value, so the two can never disagree.
       Planned: the same formula on the planned figure. */
    var withdrawalRate = planned === null ? ratio.value : drawCents / inv.value;
    var verdict = Ratios.verdict(RATIO_ID, withdrawalRate, T.ratioBenchmarks);

    var years = Projection.yearsUntilEmptyCents({ startCents: inv.value, annualDrawCents: drawCents, annualRate: rate });
    if (!Money.isOk(years)) return Money.incomplete(years.reason, years.missing);
    var never = years.never === true;
    var lastsToAge = !never && Money.isEntered(age) ? Math.round(age + years.value) : null;

    /* What the VPW table allows this year, at this age and share. */
    var share = stockShareOf(d);
    var vpw = null;
    if (T.vpwTable && Money.isEntered(age)) {
      var pct = Vpw.percentageAt(T.vpwTable, age, share.value);
      vpw = { percentage: pct, allowedCents: Math.round(inv.value * pct), age: age, stockShare: share.value, referenceVersion: T.vpwTable.version };
    }

    /* Social Security: a note about timing, never an amount. */
    var ssAt = Money.isEntered(d.socialSecurityAt) ? d.socialSecurityAt : null;
    var ssInYears = ssAt !== null && Money.isEntered(age) && ssAt > age ? ssAt - age : null;

    /* The two paths the chart draws. */
    var horizon = Money.isEntered(age) ? Math.max(1, Math.min(MAX_HORIZON_YEARS, PLAN_TO_AGE - age)) : MAX_HORIZON_YEARS;
    var path = drawPath(inv.value, drawCents, rate, horizon);
    var vpwPath = null;
    if (vpw) {
      var run = Vpw.plan({ portfolioCents: inv.value, retireAge: age, planAge: age + horizon - 1, stockShare: share.value, realReturn: rate, annualSpendCents: drawCents, table: T.vpwTable });
      if (Money.isOk(run)) {
        vpwPath = [{ year: 0, balanceCents: inv.value, withdrawalCents: run.years[0].withdrawalCents }];
        run.years.forEach(function (yr, i) { vpwPath.push({ year: i + 1, balanceCents: yr.portfolioAfterCents, withdrawalCents: yr.withdrawalCents }); });
      }
    }

    return Money.ok(never ? Projection.DEFAULT_MAX_YEARS : years.value, {
      never: never,
      yearsUntilEmpty: never ? null : years.value,
      lastsToAge: lastsToAge,
      age: Money.isEntered(age) ? age : null,
      investmentsCents: inv.value,
      drawCents: drawCents,
      planned: planned !== null,
      computedDrawCents: computedDraw,
      covered: covered,
      withdrawalRate: withdrawalRate,
      zone: verdict.zone,
      band: verdict.band,
      returnReal: rate,
      stockShare: share.value,
      stockShareEntered: share.entered,
      stockShareClamped: share.clamped,
      vpw: vpw,
      socialSecurityAt: ssAt,
      socialSecurityInYears: ssInYears,
      horizonYears: horizon,
      path: path,
      vpwPath: vpwPath,
      ratioReason: Money.isOk(ratio) ? null : ratio.reason,
      referenceVersion: T.ratioBenchmarks ? T.ratioBenchmarks.version : null
    });
  }

  return {
    RATIO_ID: RATIO_ID,
    PLAN_TO_AGE: PLAN_TO_AGE,
    MAX_HORIZON_YEARS: MAX_HORIZON_YEARS,
    DEFAULT_STOCK_SHARE: DEFAULT_STOCK_SHARE,
    clamp01: clamp01,
    withdrawalRow: withdrawalRow,
    stockShareOf: stockShareOf,
    drawPath: drawPath,
    plan: plan
  };
});
