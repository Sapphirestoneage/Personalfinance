/* ==========================================================================
   safeword/engines/taxplan.js, the tax jar and the four dates. SF-004.
   --------------------------------------------------------------------------
   Nothing here re-derives a tax. Self-employment tax is SPARKS'
   engines/selfemployed.js, the brackets are engines/tax.js, both carried as
   byte-identical copies. This file only decides what goes into them:

     profit  = the self-employed part of a year's kept income
               minus the costs a return usually carries
               (minus the "sometimes" costs too, when you say so)
     wages   = the vanilla job's gross, which stacks under the profit

   and reads out what a person can act on: the share of every dollar from
   the work to put in the jar, and the four estimated payments.

   TaxPlan.read(h, T, S, H) -> { profit, se, federal, state, total, onWagesAlone,
     onTheWork, setAsideRate, jarPer100: Result, current: { rate, gapRate },
     quarterly, remaining, stateIncluded, ifSometimes: { profit, setAsideRate } }
   Every table it reads is marked as SPARKS marks it; the page prints that.
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), SelfEmployed: require('./selfemployed.js'), Tax: require('./tax.js'), Streams: require('./streams.js'), House: require('./house.js') }
    : { Money: root.SLAF && root.SLAF.Money, SelfEmployed: root.SLAF && root.SLAF.SelfEmployed, Tax: root.SLAF && root.SLAF.Tax, Streams: root.SLAF && root.SLAF.Streams, House: root.SLAF && root.SLAF.House };
  var api = factory(deps.Money, deps.SelfEmployed, deps.Tax, deps.Streams, deps.House);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TaxPlan = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, SelfEmployed, Tax, Streams, House) {
  'use strict';

  function profitCents(S, H, countSometimes) {
    if (!Money.isOk(S.seNetAnnual)) return S.seNetAnnual;
    if (!Money.isOk(H.deductible.usually)) return H.deductible.usually;
    var costs = H.deductible.usually.value;
    if (countSometimes) { if (!Money.isOk(H.deductible.sometimes)) return H.deductible.sometimes; costs += H.deductible.sometimes.value; }
    return Money.ok(Math.max(0, S.seNetAnnual.value - costs * 12), { grossCents: S.seNetAnnual.value, costsYearCents: costs * 12, countSometimes: !!countSometimes });
  }

  /* The whole computation for one profit figure, so the "if sometimes" reading is the same function again. */
  function estimate(h, T, S, profit) {
    var filing = h.you.filingStatus;
    if (!filing) return { total: Money.incomplete('Choose how you file.', ['filingStatus']) };
    if (!Money.isOk(profit)) return { total: profit, profit: profit };
    var wages = Money.isOk(S.wagesAnnual) ? S.wagesAnnual.value : null;
    if (wages === null) return { total: S.wagesAnnual, profit: profit };
    var se = SelfEmployed.selfEmploymentTax(profit.value, filing, T.seTax, { priorWagesCents: wages });
    var federal = Tax.ordinaryTax(T.federalBrackets, profit.value + wages, filing, { aboveTheLineCents: se.deductibleHalfCents });
    var state = h.you.state ? Tax.stateTax(T.stateBrackets, h.you.state, federal.taxableIncomeCents, filing) : Money.incomplete('Choose a state, or say it has no income tax.', ['state']);
    var stateIncluded = Money.isOk(state);
    var total = Money.ok(se.value + federal.value + (stateIncluded ? state.value : 0), { stateIncluded: stateIncluded });
    /* What the job's withholding already covers: the tax on the wages alone. */
    var onWagesAlone = Money.ok(0);
    if (wages > 0) {
      var fw = Tax.ordinaryTax(T.federalBrackets, wages, filing, {});
      var sw = stateIncluded ? Tax.stateTax(T.stateBrackets, h.you.state, fw.taxableIncomeCents, filing) : Money.ok(0);
      onWagesAlone = Money.ok(fw.value + (Money.isOk(sw) ? sw.value : 0));
    }
    var onTheWork = Money.ok(Math.max(0, total.value - onWagesAlone.value));
    var setAsideRate = profit.grossCents > 0 ? Money.ok(onTheWork.value / profit.grossCents) : Money.ok(0, { none: true });
    return { profit: profit, wages: wages, se: se, federal: federal, state: state, stateIncluded: stateIncluded, total: total,
      onWagesAlone: onWagesAlone, onTheWork: onTheWork, setAsideRate: setAsideRate,
      jarPer100: Money.isOk(setAsideRate) ? Money.ok(Math.round(setAsideRate.value * 10000)) : setAsideRate };
  }

  function read(h, T, S, H) {
    S = S || Streams.read(h, T); H = H || House.read(h, T, S);
    var t = h.taxes || {};
    var base = estimate(h, T, S, profitCents(S, H, t.countSometimes));
    var alt = estimate(h, T, S, profitCents(S, H, !t.countSometimes));
    var out = base;
    out.ifOtherWay = { countSometimes: !t.countSometimes, setAsideRate: alt.setAsideRate || alt.total, total: alt.total, profit: alt.profit };
    out.current = { rate: t.setAsideRate, gapRate: Money.isEntered(t.setAsideRate) && Money.isOk(base.setAsideRate) ? base.setAsideRate.value - t.setAsideRate : null };
    if (Money.isOk(base.total) && Money.isOk(base.profit)) {
      out.quarterly = SelfEmployed.quarterlyEstimated(h.you, { seTax: T.seTax, effectiveTaxRates: T.effectiveTaxRates },
        { expectedNetProfitCents: base.profit.value, priorYearLiabilityCents: t.priorYearLiabilityCents, priorYearAgiCents: t.priorYearAgiCents, taxAlreadyWithheldCents: base.onWagesAlone.value });
      var paid = Money.isEntered(t.paidThisYearCents) ? t.paidThisYearCents : null;
      out.remaining = Money.isOk(out.quarterly) && paid !== null ? Money.ok(Math.max(0, out.quarterly.payableAcrossQuartersCents - paid), { paidCents: paid }) : Money.incomplete('Add what you have paid in so far this year.', ['paidThisYearCents']);
    } else { out.quarterly = base.total; out.remaining = base.total; }
    out.tables = { se: T.seTax, federal: T.federalBrackets, state: T.stateBrackets };
    return out;
  }
  return { read: read, profitCents: profitCents, estimate: estimate };
});
