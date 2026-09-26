/* ==========================================================================
   safeword/engines/house.js, what the practice costs to run. SF-003.
   --------------------------------------------------------------------------
   House.read(h, T, S) -> {
     rows, monthTotal: Result, fixedMonth: Result, variableMonth: Result, yearTotal: Result,
     deductible: { usually: Result, sometimes: Result, ask: Result }  (a month each),
     shareOfNet: Result (of a typical net month, S from Streams.read),
     perSession: Result (the house's cost per session), breakEven: Result (sessions a month to cover it),
     byKind: [{ kind, label, cents, share }] }
   An empty list is "no costs", which is a statement, so it reads as zero
   with `none: true`; a row with a blank amount is not.
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Model: require('../shared/model.js'), Streams: require('./streams.js') }
    : { Money: root.SLAF && root.SLAF.Money, Model: root.SLAF && root.SLAF.Model, Streams: root.SLAF && root.SLAF.Streams };
  var api = factory(deps.Money, deps.Model, deps.Streams);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.House = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Model, Streams) {
  'use strict';
  function kindOf(T, id) { return (T.costKinds.kinds || []).filter(function (x) { return x.id === id; })[0] || T.costKinds.kinds[T.costKinds.kinds.length - 1]; }
  function sumRows(rows, keep, noneNote) {
    var list = rows.filter(keep);
    if (!rows.length) return Money.ok(0, { none: true, note: noneNote });
    var total = 0, missing = [];
    list.forEach(function (r) { if (Money.isEntered(r.monthCents)) total += r.monthCents; else missing.push(r.id); });
    return missing.length ? Money.incomplete('Some costs have no amount yet.', missing) : Money.ok(total);
  }
  function read(h, T, S) {
    S = S || Streams.read(h, T);
    var rows = Model.rows(h.costs).map(function (c) { var k = kindOf(T, c.kind); return { id: c.id, kind: k.id, kindLabel: k.label, label: c.label || k.label, monthCents: c.monthCents,
      fixed: c.fixed === null ? !!k.fixed : c.fixed, deductible: c.deductible || k.deductible }; });
    var all = function () { return true; };
    var monthTotal = sumRows(rows, all, 'No costs entered.');
    var fixedMonth = sumRows(rows, function (r) { return r.fixed; });
    var variableMonth = sumRows(rows, function (r) { return !r.fixed; });
    var yearTotal = Money.isOk(monthTotal) ? Money.ok(monthTotal.value * 12, { none: monthTotal.none }) : monthTotal;
    var ded = {};
    ['usually', 'sometimes', 'ask'].forEach(function (d) { ded[d] = sumRows(rows, function (r) { return r.deductible === d; }); });
    var shareOfNet = Money.isOk(monthTotal) && Money.isOk(S.typicalNet) && S.typicalNet.value > 0 ? Money.ok(monthTotal.value / S.typicalNet.value) : Money.incomplete('Needs the costs and the streams.', ['costs', 'streams']);
    var perSession = Money.isOk(monthTotal) && Money.isEntered(h.you.sessionsMonth) && h.you.sessionsMonth > 0 ? Money.ok(Math.round(monthTotal.value / h.you.sessionsMonth)) : Money.incomplete('Add how many sessions a month.', ['sessionsMonth']);
    var breakEven = Money.incomplete('Add what one session brings.', ['sessionCents']);
    if (Money.isOk(monthTotal) && Money.isEntered(h.you.sessionCents) && h.you.sessionCents > 0) {
      var inperson = Model.rows(h.streams).filter(function (s) { return s.kind === 'inperson'; })[0];
      var kept = inperson ? Streams.keptCents(h.you.sessionCents, inperson) : Money.ok(h.you.sessionCents, { feeCents: 0 });
      if (Money.isOk(kept) && kept.value > 0) breakEven = Money.ok(monthTotal.value / kept.value, { keptPerSessionCents: kept.value });
      else breakEven = Money.incomplete('Fill in the in-person stream’s rates first.', ['streams']);
    }
    var byKind = [];
    if (Money.isOk(monthTotal) && monthTotal.value > 0) {
      var map = {};
      rows.forEach(function (r) { map[r.kind] = map[r.kind] || { kind: r.kind, label: r.kindLabel, cents: 0 }; map[r.kind].cents += r.monthCents; });
      byKind = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.cents - a.cents; });
      byKind.forEach(function (b) { b.share = b.cents / monthTotal.value; });
    }
    return { rows: rows, monthTotal: monthTotal, fixedMonth: fixedMonth, variableMonth: variableMonth, yearTotal: yearTotal, deductible: ded,
      shareOfNet: shareOfNet, perSession: perSession, breakEven: breakEven, byKind: byKind, kinds: T.costKinds.kinds };
  }
  return { read: read, kindOf: kindOf };
});
