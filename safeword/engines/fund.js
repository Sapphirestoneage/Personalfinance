/* ==========================================================================
   safeword/engines/fund.js, the safeword: the money that lets you say no. SF-005.
   --------------------------------------------------------------------------
   target = months * (your lean month + the house's fixed costs)
          + a platform buffer, when one risky stream brings half of what you keep
          + one lean month more, when nothing you hold is beyond a freeze

   Fund.read(h, T, S, H, R) -> { monthCost: Result, base: Result, platformBuffer, freezeBuffer,
     target: Result, balance: Result, gap: Result, progress: Result (0..1),
     setAsideMonth: Result, monthsToFund: Result, noMonths: Result (how long the fund carries you) }
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Model: require('../shared/model.js'), Streams: require('./streams.js'), House: require('./house.js'), Rails: require('./rails.js') }
    : { Money: root.SLAF && root.SLAF.Money, Model: root.SLAF && root.SLAF.Model, Streams: root.SLAF && root.SLAF.Streams, House: root.SLAF && root.SLAF.House, Rails: root.SLAF && root.SLAF.Rails };
  var api = factory(deps.Money, deps.Model, deps.Streams, deps.House, deps.Rails);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Fund = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Model, Streams, House, Rails) {
  'use strict';
  function read(h, T, S, H, R) {
    S = S || Streams.read(h, T); H = H || House.read(h, T, S); R = R || Rails.read(h, T, S);
    var lean = h.personal.leanMonthCents;
    var monthCost = Money.isEntered(lean) && Money.isOk(H.fixedMonth) ? Money.ok(lean + H.fixedMonth.value, { leanCents: lean, fixedCents: H.fixedMonth.value }) : Money.incomplete('Add your lean month and the house’s fixed costs.', Money.isEntered(lean) ? ['costs'] : ['leanMonthCents']);
    var months = h.fund.targetMonths;
    var base = Money.isOk(monthCost) && Money.isEntered(months) ? Money.ok(monthCost.value * months, { months: months }) : Money.incomplete('Choose how many months the fund should carry you.', ['targetMonths']);
    var platformBuffer = Money.ok(S.concentration.flagged ? S.concentration.bufferCents : 0, { flagged: S.concentration.flagged, topLabel: S.concentration.topLabel, months: S.concentration.bufferMonths });
    var freezeFails = R.checklist.filter(function (c) { return c.id === 'cashMonth'; })[0];
    var freezeBuffer = Money.ok(freezeFails && freezeFails.pass === false && Money.isEntered(lean) ? lean : 0, { flagged: !!(freezeFails && freezeFails.pass === false) });
    var target = Money.isOk(base) ? Money.ok(base.value + platformBuffer.value + freezeBuffer.value) : base;
    var fundRails = Model.rows(h.rails).filter(function (r) { return r.isFund; });
    var balance;
    if (!fundRails.length) balance = Money.incomplete('On the Rails page, mark which account is the fund.', ['rails']);
    else { var b = 0, miss = []; fundRails.forEach(function (r) { if (Money.isEntered(r.balanceCents)) b += r.balanceCents; else miss.push(r.id); }); balance = miss.length ? Money.incomplete('The fund account has no balance yet.', miss) : Money.ok(b, { rails: fundRails.map(function (r) { return r.id; }) }); }
    var gap = Money.isOk(target) && Money.isOk(balance) ? Money.ok(Math.max(0, target.value - balance.value)) : Money.incomplete('Needs the target and the balance.', ['target', 'balance']);
    var progress = Money.isOk(target) && Money.isOk(balance) ? Money.ok(target.value > 0 ? Math.min(1, balance.value / target.value) : 1) : gap;
    var setAsideMonth = Money.isEntered(h.fund.setAsideRate) && Money.isOk(S.typicalNet) ? Money.ok(Math.round(h.fund.setAsideRate * S.typicalNet.value), { rate: h.fund.setAsideRate }) : Money.incomplete('Choose the share of each month that goes to the fund.', ['setAsideRate']);
    var monthsToFund = Money.isOk(gap) && Money.isOk(setAsideMonth) ? (gap.value === 0 ? Money.ok(0) : setAsideMonth.value > 0 ? Money.ok(Math.ceil(gap.value / setAsideMonth.value)) : Money.incomplete('Nothing is going into the fund each month.', ['setAsideRate'])) : Money.incomplete('Needs the gap and the monthly set-aside.', ['gap', 'setAsideRate']);
    var noMonths = Money.isOk(balance) && Money.isOk(monthCost) && monthCost.value > 0 ? Money.ok(balance.value / monthCost.value) : Money.incomplete('Needs the balance and a month’s cost.', ['balance', 'monthCost']);
    return { monthCost: monthCost, base: base, platformBuffer: platformBuffer, freezeBuffer: freezeBuffer, target: target, balance: balance, gap: gap, progress: progress,
      setAsideMonth: setAsideMonth, monthsToFund: monthsToFund, noMonths: noMonths, suggestedMonths: 6 };
  }
  return { read: read };
});
