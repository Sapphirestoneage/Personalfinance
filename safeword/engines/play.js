/* ==========================================================================
   safeword/engines/play.js, what the life costs to live. SF-008.
   --------------------------------------------------------------------------
   Play.read(h, T, S) -> { rows, yearTotal: Result, monthTotal: Result, shareOfTypical: Result (of your typical personal month),
     shareOfNet: Result (of what you keep), byKind: [{ kind, label, cents, share, low, high, where }], gearFundMonth: Result }
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Model: require('../shared/model.js'), Streams: require('./streams.js') }
    : { Money: root.SLAF && root.SLAF.Money, Model: root.SLAF && root.SLAF.Model, Streams: root.SLAF && root.SLAF.Streams };
  var api = factory(deps.Money, deps.Model, deps.Streams);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Play = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Model, Streams) {
  'use strict';
  function kindOf(T, id) { return (T.playKinds.kinds || []).filter(function (x) { return x.id === id; })[0] || T.playKinds.kinds[T.playKinds.kinds.length - 1]; }
  function read(h, T, S) {
    S = S || Streams.read(h, T);
    var rows = Model.rows(h.play).map(function (p) { var k = kindOf(T, p.kind); return { id: p.id, kind: k.id, kindLabel: k.label, label: p.label || k.label, yearCents: p.yearCents }; });
    var yearTotal;
    if (!rows.length) yearTotal = Money.ok(0, { none: true });
    else { var t = 0, miss = []; rows.forEach(function (r) { if (Money.isEntered(r.yearCents)) t += r.yearCents; else miss.push(r.id); }); yearTotal = miss.length ? Money.incomplete('Some lines have no amount yet.', miss) : Money.ok(t); }
    var monthTotal = Money.isOk(yearTotal) ? Money.ok(Math.round(yearTotal.value / 12), { none: yearTotal.none }) : yearTotal;
    var typical = h.personal.typicalMonthCents;
    var shareOfTypical = Money.isOk(monthTotal) && Money.isEntered(typical) && typical > 0 ? Money.ok(monthTotal.value / typical) : Money.incomplete('Add your typical month.', ['typicalMonthCents']);
    var shareOfNet = Money.isOk(monthTotal) && Money.isOk(S.typicalNet) && S.typicalNet.value > 0 ? Money.ok(monthTotal.value / S.typicalNet.value) : Money.incomplete('Needs the Streams page.', ['streams']);
    var byKind = [];
    if (Money.isOk(yearTotal)) {
      var map = {};
      rows.forEach(function (r) { map[r.kind] = map[r.kind] || { kind: r.kind, label: r.kindLabel, cents: 0 }; map[r.kind].cents += r.yearCents; });
      byKind = Object.keys(map).map(function (k) { var b = map[k], d = kindOf(T, k); b.share = yearTotal.value > 0 ? b.cents / yearTotal.value : 0; b.low = d.typicalYearLow * 100; b.high = d.typicalYearHigh * 100;
        b.where = b.high === 0 ? null : b.cents < b.low ? 'below the usual range' : b.cents > b.high ? 'above the usual range' : 'inside the usual range'; return b; }).sort(function (a, b) { return b.cents - a.cents; });
    }
    return { rows: rows, yearTotal: yearTotal, monthTotal: monthTotal, shareOfTypical: shareOfTypical, shareOfNet: shareOfNet, byKind: byKind, gearFundMonth: monthTotal, kinds: T.playKinds.kinds };
  }
  return { read: read, kindOf: kindOf };
});
