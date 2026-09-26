/* ==========================================================================
   safeword/engines/streams.js, what each way of earning brings home. SF-003.
   --------------------------------------------------------------------------
   One formula for every stream: what lands is the cash part in full plus
   the traceable part after the platform's cut and the processor's cut.

     kept = gross * (cashShare + (1 - cashShare) * (1 - platformFee - processorFee))

   Streams.read(h, T) -> {
     rows: [{ id, label, kind, w2, risk, railId, grossTypicalCents, grossLowCents,
              netTypical: Result, netLow: Result, feeTypicalCents, annualNetCents|null }],
     typicalNet: Result (a month, every stream), floorNet: Result (every low end),
     annualNet: Result, seNetAnnual: Result (the self-employed part, a year),
     wagesAnnual: Result (the vanilla part, a year, gross), feesYear: Result,
     traceableShare: Result, byKind: [{ kind, label, cents, share }],
     concentration: { topId, topShare, flagged, bufferMonths, bufferCents } }
   Money is integer cents. A blank input makes its Result incomplete.
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Model: require('../shared/model.js') }
    : { Money: root.SLAF && root.SLAF.Money, Model: root.SLAF && root.SLAF.Model };
  var api = factory(deps.Money, deps.Model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Streams = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Model) {
  'use strict';

  function kindOf(T, id) { var k = (T.streamKinds.kinds || []).filter(function (x) { return x.id === id; })[0]; return k || T.streamKinds.kinds[T.streamKinds.kinds.length - 1]; }

  /* The one formula. Every rate must be entered; a blank is not a zero. */
  function keptCents(grossCents, s) {
    var missing = Money.missingFrom({ gross: grossCents, platformFeeRate: s.platformFeeRate, processorFeeRate: s.processorFeeRate, cashShare: s.cashShare });
    if (missing.length) return Money.incomplete('Fill in the amount and the three rates.', missing);
    var fee = Math.min(1, s.platformFeeRate + s.processorFeeRate);
    var factor = s.cashShare + (1 - s.cashShare) * (1 - fee);
    return Money.ok(Math.round(grossCents * factor), { feeCents: Math.round(grossCents * (1 - factor)), factor: factor });
  }

  function read(h, T) {
    var rows = Model.rows(h.streams).map(function (s) {
      var k = kindOf(T, s.kind);
      var netT = keptCents(s.typicalMonthCents, s);
      var netL = Money.isEntered(s.lowMonthCents) ? keptCents(s.lowMonthCents, s) : Money.incomplete('Add the low month.', ['lowMonthCents']);
      var annual = Money.isOk(netT) && Money.isEntered(s.monthsActive) ? netT.value * s.monthsActive : null;
      return { id: s.id, label: s.label || k.label, kind: k.id, kindLabel: k.label, w2: !!k.w2, risk: k.platformRisk, railId: s.railId,
        grossTypicalCents: s.typicalMonthCents, grossLowCents: s.lowMonthCents, monthsActive: s.monthsActive,
        netTypical: netT, netLow: netL, feeTypicalCents: Money.isOk(netT) ? netT.feeCents : null, annualNetCents: annual };
    });
    function sum(list, pick) {
      if (!list.length) return Money.incomplete('Add a way you earn.', ['streams']);
      var total = 0, missing = [];
      list.forEach(function (r) { var v = pick(r); if (Money.isEntered(v)) total += v; else missing.push(r.id); });
      return missing.length ? Money.incomplete('Some streams are not filled in yet.', missing) : Money.ok(total);
    }
    var typicalNet = sum(rows, function (r) { return Money.isOk(r.netTypical) ? r.netTypical.value : null; });
    var floorNet = sum(rows, function (r) { return Money.isOk(r.netLow) ? r.netLow.value : null; });
    var annualNet = sum(rows, function (r) { return r.annualNetCents; });
    var se = rows.filter(function (r) { return !r.w2; }), w2 = rows.filter(function (r) { return r.w2; });
    var seNetAnnual = se.length ? sum(se, function (r) { return r.annualNetCents; }) : Money.ok(0, { none: true });
    var wagesAnnual = w2.length ? sum(w2, function (r) { return Money.isEntered(r.grossTypicalCents) && Money.isEntered(r.monthsActive) ? r.grossTypicalCents * r.monthsActive : null; }) : Money.ok(0, { none: true });
    var feesYear = sum(rows, function (r) { return Money.isEntered(r.feeTypicalCents) && Money.isEntered(r.monthsActive) ? r.feeTypicalCents * r.monthsActive : null; });
    var traceable = Money.incomplete('Fill in every stream first.', ['streams']);
    if (Money.isOk(typicalNet) && typicalNet.value > 0) {
      var cash = 0;
      rows.forEach(function (r) { var s = h.streams.filter(function (x) { return x.id === r.id; })[0]; cash += Math.round(r.netTypical.value * s.cashShare); });
      traceable = Money.ok(1 - cash / typicalNet.value, { cashCents: cash });
    }
    var byKind = [];
    if (Money.isOk(typicalNet)) {
      var map = {};
      rows.forEach(function (r) { map[r.kind] = map[r.kind] || { kind: r.kind, label: r.kindLabel, cents: 0 }; map[r.kind].cents += r.netTypical.value; });
      byKind = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.cents - a.cents; });
      byKind.forEach(function (b) { b.share = typicalNet.value > 0 ? b.cents / typicalNet.value : 0; });
    }
    var conc = { topId: null, topShare: null, flagged: false, bufferMonths: T.streamKinds.concentration.bufferMonths, bufferCents: 0, risk: null };
    if (Money.isOk(typicalNet) && typicalNet.value > 0) {
      var top = rows.slice().sort(function (a, b) { return b.netTypical.value - a.netTypical.value; })[0];
      conc.topId = top.id; conc.topShare = top.netTypical.value / typicalNet.value; conc.risk = top.risk; conc.topLabel = top.label;
      conc.flagged = conc.topShare >= T.streamKinds.concentration.oneStreamShare && top.risk !== 'low';
      conc.bufferCents = conc.flagged ? top.netTypical.value * conc.bufferMonths : 0;
    }
    return { rows: rows, typicalNet: typicalNet, floorNet: floorNet, annualNet: annualNet, seNetAnnual: seNetAnnual, wagesAnnual: wagesAnnual,
      feesYear: feesYear, traceableShare: traceable, byKind: byKind, concentration: conc, kinds: T.streamKinds.kinds };
  }
  return { read: read, keptCents: keptCents, kindOf: kindOf };
});
