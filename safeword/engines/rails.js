/* ==========================================================================
   safeword/engines/rails.js, where the money sits and how it can fail. SF-005.
   --------------------------------------------------------------------------
   Rails.read(h, T, S) -> { rows: [{ id, label, kind, kindLabel, closeRisk, balanceCents, flowCents, flowShare, forWork, isFund }],
     balances: Result, flow: Result, topFlow: { id, label, share, flagged }, platformHeld: Result,
     beyondFreeze: Result (cash, crypto, prepaid), checklist: [{ id, label, why, pass: true|false|null, detail }], score: Result }
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Model: require('../shared/model.js'), Streams: require('./streams.js') }
    : { Money: root.SLAF && root.SLAF.Money, Model: root.SLAF && root.SLAF.Model, Streams: root.SLAF && root.SLAF.Streams };
  var api = factory(deps.Money, deps.Model, deps.Streams);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Rails = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Model, Streams) {
  'use strict';
  function kindOf(T, id) { return (T.railKinds.kinds || []).filter(function (x) { return x.id === id; })[0] || T.railKinds.kinds[0]; }
  function read(h, T, S) {
    S = S || Streams.read(h, T);
    var rails = Model.rows(h.rails);
    var flowBy = {};
    S.rows.forEach(function (r) { if (r.railId && Money.isOk(r.netTypical)) flowBy[r.railId] = (flowBy[r.railId] || 0) + r.netTypical.value; });
    var flowTotal = Money.isOk(S.typicalNet) ? S.typicalNet.value : null;
    var rows = rails.map(function (r) { var k = kindOf(T, r.kind); return { id: r.id, label: r.label || k.label, kind: k.id, kindLabel: k.label, closeRisk: r.closeRisk || k.closeRisk, balanceCents: r.balanceCents,
      flowCents: flowBy[r.id] || 0, flowShare: flowTotal ? (flowBy[r.id] || 0) / flowTotal : null, forWork: r.forWork, isFund: r.isFund }; });
    var balances;
    if (!rows.length) balances = Money.incomplete('Add where your money sits.', ['rails']);
    else { var b = 0, miss = []; rows.forEach(function (r) { if (Money.isEntered(r.balanceCents)) b += r.balanceCents; else miss.push(r.id); }); balances = miss.length ? Money.incomplete('Some places have no balance yet.', miss) : Money.ok(b); }
    var flow = flowTotal === null ? S.typicalNet : Money.ok(flowTotal);
    var top = rows.slice().sort(function (a, b) { return b.flowCents - a.flowCents; })[0];
    var topFlow = top && flowTotal ? { id: top.id, label: top.label, share: top.flowShare, flagged: top.flowShare >= T.railKinds.rules.oneRailShare && top.closeRisk !== 'low' } : { id: null, label: null, share: null, flagged: false };
    var unrouted = S.rows.filter(function (r) { return !r.railId || !rails.some(function (x) { return x.id === r.railId; }); }).map(function (r) { return r.id; });
    var platformHeld = Money.ok(rows.filter(function (r) { return r.kind === 'platform' && Money.isEntered(r.balanceCents); }).reduce(function (a, r) { return a + r.balanceCents; }, 0));
    var beyondFreeze = Money.ok(rows.filter(function (r) { return (r.kind === 'cash' || r.kind === 'crypto' || r.kind === 'prepaid') && Money.isEntered(r.balanceCents); }).reduce(function (a, r) { return a + r.balanceCents; }, 0));
    var lean = h.personal.leanMonthCents;
    var banks = rows.filter(function (r) { return r.kind === 'bank'; }).length;
    var cardWays = rows.filter(function (r) { return r.kind === 'processor' || r.kind === 'app'; }).length;
    var tests = {
      twoBanks: { pass: rows.length ? banks >= 2 : null, detail: banks + (banks === 1 ? ' bank' : ' banks') },
      twoProcessors: { pass: rows.length ? cardWays >= 2 : null, detail: cardWays + (cardWays === 1 ? ' way' : ' ways') + ' to take a card or a transfer' },
      cashMonth: { pass: Money.isEntered(lean) && rows.length ? beyondFreeze.value >= lean : null, detail: Money.isEntered(lean) ? null : 'needs your lean month' },
      separate: { pass: rows.length ? rows.some(function (r) { return r.forWork === true; }) && rows.some(function (r) { return r.forWork === false; }) : null, detail: null },
      platformLow: { pass: rows.length && flowTotal ? platformHeld.value <= flowTotal * 0.25 : (rows.length ? (platformHeld.value === 0 ? true : null) : null), detail: null }
    };
    var checklist = T.railKinds.rules.checklist.map(function (c) { return { id: c.id, label: c.label, why: c.why, pass: tests[c.id].pass, detail: tests[c.id].detail }; });
    var known = checklist.filter(function (c) { return c.pass !== null; });
    var score = known.length ? Money.ok(known.filter(function (c) { return c.pass; }).length / checklist.length, { passed: known.filter(function (c) { return c.pass; }).length, of: checklist.length, unknown: checklist.length - known.length }) : Money.incomplete('Add where your money sits.', ['rails']);
    return { rows: rows, balances: balances, flow: flow, topFlow: topFlow, unrouted: unrouted, platformHeld: platformHeld, beyondFreeze: beyondFreeze, checklist: checklist, score: score, kinds: T.railKinds.kinds };
  }
  return { read: read, kindOf: kindOf };
});
