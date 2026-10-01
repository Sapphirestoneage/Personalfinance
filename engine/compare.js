/* ==========================================================================
   engine/compare.js, two runs side by side. D-341.
   --------------------------------------------------------------------------
   compare(runA, runB, opts) -> {
     fiMonths, fiYears              how far the FI year moves (B minus A)
     coastFIMonths                  the same for Coast FI
     netWorthAt: [{ age, year, aCents, bCents, deltaCents }]
     lifetimeTaxDeltaCents
     monthlyCashFlowDeltaCents      the first year's after-tax, after-spending
                                    surplus, B minus A, a month
     newWarningYears: [year...]     years where B warns and A does not
     firstDivergenceYear            the first year any row differs
     headline                       "This moves your FI date by X months and
                                     changes monthly cash flow by $Y."
   }
   Every lever room and every scenario block reads this; the sentence
   shape is the same everywhere. Months are whole years times twelve:
   the engine's grain is a year, and the room says so.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Compare = api; root.SLAF.Engine.compare = api.compare; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  function dollars(c) { var v = Math.round(Math.abs(c) / 100); return (c < 0 ? '-$' : '$') + v.toLocaleString('en-US'); }
  function rowAt(run, year) { return (run.years || []).filter(function (r) { return r.year === year; })[0] || null; }
  function monthsBetween(a, b) { return a === null || b === null || a === undefined || b === undefined ? null : (b - a) * 12; }

  /** The first year's surplus a month: income less spending less taxes, in today's dollars. */
  function monthlyCashFlow(run) {
    var r = run.years && run.years[0];
    if (!r) return null;
    return Math.round((r.income.totalCents - r.spending.totalCents - r.taxes.totalCents) / 12 / r.deflator);
  }

  function rowsDiffer(a, b) {
    return a.netWorthCents !== b.netWorthCents || a.taxes.totalCents !== b.taxes.totalCents || a.spending.totalCents !== b.spending.totalCents
      || a.income.totalCents !== b.income.totalCents || a.contributions.employeeCents !== b.contributions.employeeCents;
  }

  function headline(fiMonths, cashDelta) {
    var fiPart = fiMonths === null ? 'This does not change your FI date'
      : fiMonths === 0 ? 'This leaves your FI date where it is'
      : 'This moves your FI date by ' + Math.abs(fiMonths) + ' months ' + (fiMonths < 0 ? 'earlier' : 'later');
    var cashPart = cashDelta === null ? '' : ' and changes monthly cash flow by ' + dollars(cashDelta);
    return fiPart + cashPart + '.';
  }

  function compare(runA, runB, opts) {
    var o = opts || {};
    var mA = runA.milestones || {}, mB = runB.milestones || {};
    var fiMonths = monthsBetween(mA.fi, mB.fi);
    var coastMonths = monthsBetween(mA.coastFI, mB.coastFI);
    var ages = o.ages || [50, 60, 65, 70, 80, 90];
    var born = runA.facts && runA.facts.people[0] ? runA.facts.people[0].birthYear : null;
    var netWorthAt = ages.map(function (age) {
      var year = born === null ? null : born + age;
      var a = year === null ? null : rowAt(runA, year), b = year === null ? null : rowAt(runB, year);
      return { age: age, year: year, aCents: a ? a.netWorthCents : null, bCents: b ? b.netWorthCents : null,
        deltaCents: a && b ? b.netWorthCents - a.netWorthCents : null,
        aTodayCents: a ? Math.round(a.netWorthCents / a.deflator) : null, bTodayCents: b ? Math.round(b.netWorthCents / b.deflator) : null };
    });
    var taxA = runA.summary ? runA.summary.lifetimeTaxCents : 0, taxB = runB.summary ? runB.summary.lifetimeTaxCents : 0;
    var taxTodayA = runA.summary ? runA.summary.lifetimeTaxTodayCents : 0, taxTodayB = runB.summary ? runB.summary.lifetimeTaxTodayCents : 0;
    var cfA = monthlyCashFlow(runA), cfB = monthlyCashFlow(runB);
    var cashDelta = cfA === null || cfB === null ? null : cfB - cfA;
    var newWarningYears = [];
    (runB.years || []).forEach(function (rb) {
      var ra = rowAt(runA, rb.year);
      var fresh = rb.warnings.filter(function (w) { return !ra || ra.warnings.indexOf(w) < 0; });
      if (fresh.length) newWarningYears.push({ year: rb.year, warnings: fresh });
    });
    var first = null;
    (runA.years || []).some(function (ra) { var rb = rowAt(runB, ra.year); if (!rb || rowsDiffer(ra, rb)) { first = ra.year; return true; } return false; });
    return {
      fiMonths: fiMonths, fiYears: fiMonths === null ? null : fiMonths / 12, fiA: mA.fi === undefined ? null : mA.fi, fiB: mB.fi === undefined ? null : mB.fi,
      coastFIMonths: coastMonths, coastFIA: mA.coastFI === undefined ? null : mA.coastFI, coastFIB: mB.coastFI === undefined ? null : mB.coastFI,
      netWorthAt: netWorthAt,
      lifetimeTaxDeltaCents: taxB - taxA, lifetimeTaxACents: taxA, lifetimeTaxBCents: taxB,
      lifetimeTaxDeltaTodayCents: taxTodayB - taxTodayA,
      monthlyCashFlowDeltaCents: cashDelta, monthlyCashFlowACents: cfA, monthlyCashFlowBCents: cfB,
      newWarningYears: newWarningYears,
      firstDivergenceYear: first,
      ranOutA: runA.summary ? runA.summary.ranOutYear : null, ranOutB: runB.summary ? runB.summary.ranOutYear : null,
      headline: headline(fiMonths, cashDelta)
    };
  }

  return { compare: compare, headline: headline, monthlyCashFlow: monthlyCashFlow };
});
