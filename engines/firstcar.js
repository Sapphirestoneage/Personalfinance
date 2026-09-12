/* ==========================================================================
   engines/firstcar.js — the First Car Check.
   DECISIONS.md D-219 (K10).
   --------------------------------------------------------------------------
   The 20/3/8 rule (20% down, a loan of three years or less, the payment
   under 8% of gross monthly pay) as a lens on a car being weighed. The
   rule's test is engines/quickmath.js carRule2038, the same call Quick
   Math, Big Purchase and the Car room make; its words and the running-cost
   shares come from data/car_costs.json (the maintenance estimate is the
   AAA share, scaled from the insurance and fuel typed). Each part reads
   inside or outside, in neutral words. The gap between the price and the
   highest price that fits is priced in FI days through the lens. New
   against used at the same budget uses the depreciation curve.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), QuickMath: require('./quickmath.js'),
      Lens: (function () { try { return require('../shared/lens.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, QuickMath: S.QuickMath, Lens: S.Lens };
  }
  var api = factory(deps.Money, deps.Schema, deps.QuickMath, deps.Lens);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.FirstCar = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, QuickMath, Lens) {
  'use strict';

  var MONTHS = 12, DAYS_A_MONTH = 365.25 / 12, USED_AGE_YEARS = 3, HOLD_YEARS = 5;

  function share(table, id) { var r = ((table && table.runningCosts) || []).filter(function (x) { return x.id === id; })[0]; return r ? r.share : null; }
  function retained(table, years) {
    var rows = ((table && table.depreciation) || []).slice().sort(function (a, b) { return a.year - b.year; });
    if (!rows.length) return null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].year === years) return rows[i].retainedShare;
      if (rows[i].year > years) { var a = rows[i - 1], b = rows[i]; return a.retainedShare + (b.retainedShare - a.retainedShare) * (years - a.year) / (b.year - a.year); }
    }
    return rows[rows.length - 1].retainedShare;
  }

  /**
   * check(household, tables, opts) → Result
   *   opts.priceCents (REQUIRED), downCents, termMonths, loanRate, insuranceMonthlyCents, gasMonthlyCents, maintenanceMonthlyCents
   *   value   how many of the three parts sit inside
   */
  function check(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var C = T.carCosts;
    if (!C) return Money.incomplete('The car costs table is not loaded.', ['carCosts']);
    if (!Money.isEntered(o.priceCents) || o.priceCents <= 0) return Money.incomplete('Type the price of the car.', ['price']);
    var rule = QuickMath.carRule2038(h, { carPriceCents: o.priceCents, downPaymentCents: o.downCents, termMonths: o.termMonths, loanRate: o.loanRate });
    if (!Money.isOk(rule)) return rule;
    var ins = Money.isEntered(o.insuranceMonthlyCents) ? o.insuranceMonthlyCents : 0;
    var gas = Money.isEntered(o.gasMonthlyCents) ? o.gasMonthlyCents : 0;
    var sIns = share(C, 'insurance'), sFuel = share(C, 'fuel'), sMaint = share(C, 'maintenance');
    var maintEstimate = sIns !== null && sFuel !== null && sMaint !== null && (ins + gas) > 0 ? Math.round((ins + gas) / (sIns + sFuel) * sMaint) : null;
    var maint = Money.isEntered(o.maintenanceMonthlyCents) ? o.maintenanceMonthlyCents : (maintEstimate || 0);
    var payment = rule.monthlyPaymentCents || 0;
    var allIn = payment + ins + gas + maint;
    var gross = Schema.grossAnnualIncomeCents(h);
    var allInShare = Money.isOk(gross) && gross.value > 0 ? allIn / (gross.value / MONTHS) : null;
    var parts = rule.checks.map(function (c) { return { key: c.key, label: c.label, inside: !!c.pass, actual: c.actual, target: c.target, shortfallCents: c.shortfallCents || null, overByCents: c.overByCents || null }; });
    var gap = rule.maxAffordablePriceCents !== null ? Math.max(0, o.priceCents - rule.maxAffordablePriceCents) : null;
    var fi = gap && Lens ? Lens.apply(gap, 'pushed', h, T) : null;
    var fiDays = fi && Money.isOk(fi) ? Math.round(fi.value * DAYS_A_MONTH) : null;
    /* new against used at the same budget */
    var rNew = retained(C, HOLD_YEARS), rUsedAt = retained(C, USED_AGE_YEARS), rUsedLater = retained(C, USED_AGE_YEARS + HOLD_YEARS);
    var newLoss = rNew === null ? null : Math.round(o.priceCents * (1 - rNew));
    var usedListNew = rUsedAt ? Math.round(o.priceCents / rUsedAt) : null;
    var usedLoss = usedListNew !== null && rUsedLater !== null ? Math.round(usedListNew * (rUsedAt - rUsedLater)) : null;
    return Money.ok(parts.filter(function (p) { return p.inside; }).length, {
      priceCents: o.priceCents, parts: parts, insideAll: parts.every(function (p) { return p.inside; }),
      maxAffordablePriceCents: rule.maxAffordablePriceCents, paymentCents: payment, paymentCapCents: rule.paymentCapCents, loanCents: rule.loanCents, totalInterestCents: rule.totalInterestCents,
      insuranceCents: ins, gasCents: gas, maintenanceCents: maint, maintenanceEstimated: !Money.isEntered(o.maintenanceMonthlyCents), maintenanceEstimateCents: maintEstimate,
      allInMonthlyCents: allIn, allInShare: allInShare, allInInside: allInShare === null ? null : allInShare <= rule.rule.maxPaymentShareOfGross,
      gapCents: gap, gapFiDays: fiDays,
      newVsUsed: { holdYears: HOLD_YEARS, usedAgeYears: USED_AGE_YEARS, newLossCents: newLoss, usedListNewCents: usedListNew, usedLossCents: usedLoss },
      guidance: C.loanGuidance || null, rule: rule.rule
    });
  }

  return { HOLD_YEARS: HOLD_YEARS, USED_AGE_YEARS: USED_AGE_YEARS, check: check, retained: retained };
});
