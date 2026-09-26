/* ==========================================================================
   safeword/engines/dynamic.js, the house and the money inside the dynamic. SF-007.
   --------------------------------------------------------------------------
   Two things live here. The split: how a shared month is divided among the
   people in the house (equal, in proportion to income, or agreed shares).
   The protocol: money that moves from one person to another inside the
   dynamic, an allowance, a tribute, a drain, checked against five
   guardrails from data/protocol_rules.json. A failed check is a
   conversation, never a verdict; the page says so.

   The person marked "me" never carries a private copy of a number: their
   income is the Streams page's typical month and their lean month is the
   Fund page's. Everyone else's is typed on this page.

   Dynamic.read(h, T, S) -> { people: [{ id, name, role, incomeCents: Result, leanCents, share: Result, shareCents: Result, leftCents: Result, aboveFloor: true|false|null }],
     shared: Result, splitRule, sharesSumOk, protocol: { from, to, monthCents, checks: [{ id, label, why, pass, detail }], passed, of, unknown } }
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Model: require('../shared/model.js'), Streams: require('./streams.js') }
    : { Money: root.SLAF && root.SLAF.Money, Model: root.SLAF && root.SLAF.Model, Streams: root.SLAF && root.SLAF.Streams };
  var api = factory(deps.Money, deps.Model, deps.Streams);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Dynamic = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Model, Streams) {
  'use strict';
  function read(h, T, S) {
    S = S || Streams.read(h, T);
    var house = h.house, rule = house.splitRule || 'proportional';
    var people = Model.rows(house.people).map(function (p) {
      var me = p.role === 'me';
      var income = me ? (Money.isOk(S.typicalNet) ? Money.ok(S.typicalNet.value, { from: 'streams' }) : Money.incomplete('Your income comes from the Streams page.', ['streams']))
        : (Money.isEntered(p.incomeMonthCents) ? Money.ok(p.incomeMonthCents) : Money.incomplete('Add what ' + (p.name || 'this person') + ' brings in a month.', [p.id]));
      var lean = me ? h.personal.leanMonthCents : p.leanMonthCents;
      return { id: p.id, name: p.name || (me ? 'Me' : 'Someone'), role: p.role, me: me, incomeCents: income, leanCents: lean, typedShare: p.share };
    });
    var shared = Money.isEntered(house.sharedMonthCents) ? Money.ok(house.sharedMonthCents) : Money.incomplete('Add what the house costs a month, all in.', ['sharedMonthCents']);
    var n = people.length, sharesSumOk = null;
    var incomesOk = people.every(function (p) { return Money.isOk(p.incomeCents); });
    var incomeTotal = incomesOk ? people.reduce(function (a, p) { return a + p.incomeCents.value; }, 0) : null;
    if (rule === 'custom') { var s = people.reduce(function (a, p) { return a + (Money.isEntered(p.typedShare) ? p.typedShare : 0); }, 0); sharesSumOk = people.every(function (p) { return Money.isEntered(p.typedShare); }) && Math.abs(s - 1) < 0.005; }
    people.forEach(function (p) {
      if (!n) return;
      if (rule === 'equal') p.share = Money.ok(1 / n);
      else if (rule === 'proportional') p.share = incomesOk ? (incomeTotal > 0 ? Money.ok(p.incomeCents.value / incomeTotal) : Money.ok(1 / n)) : Money.incomplete('Every income is needed to split in proportion.', ['incomes']);
      else p.share = sharesSumOk ? Money.ok(p.typedShare) : Money.incomplete('The agreed shares have to add up to 100%.', ['shares']);
      p.shareCents = Money.isOk(p.share) && Money.isOk(shared) ? Money.ok(Math.round(shared.value * p.share.value)) : Money.incomplete('Needs the shared month and the split.', ['shared']);
      p.leftCents = Money.isOk(p.incomeCents) && Money.isOk(p.shareCents) ? Money.ok(p.incomeCents.value - p.shareCents.value) : Money.incomplete('Needs the income and the share.', ['income']);
      p.aboveFloor = Money.isOk(p.leftCents) && Money.isEntered(p.leanCents) ? p.leftCents.value >= p.leanCents : null;
    });
    /* The protocol. */
    var pr = house.protocol || {};
    var from = people.filter(function (p) { return p.id === pr.fromId; })[0] || null;
    var to = people.filter(function (p) { return p.id === pr.toId; })[0] || null;
    var amount = pr.monthCents;
    var active = !!(from && to && Money.isEntered(amount));
    var tests = {};
    if (active) {
      var afterHouse = Money.isOk(from.leftCents) ? from.leftCents.value : null;
      var fundCut = from.me && Money.isEntered(h.fund.setAsideRate) && Money.isOk(from.incomeCents) ? Math.round(from.incomeCents.value * h.fund.setAsideRate) : (from.me ? null : 0);
      tests.floor = afterHouse === null || !Money.isEntered(from.leanCents) ? { pass: null, detail: 'needs ' + from.name + '’s income and lean month' }
        : { pass: afterHouse - amount >= from.leanCents, detail: 'left after the house and the tribute: ' + (afterHouse - amount) };
      tests.cap = { pass: Money.isEntered(pr.capCents) ? amount <= pr.capCents : false, detail: Money.isEntered(pr.capCents) ? null : 'no cap set' };
      var review = pr.reviewDate ? new Date(pr.reviewDate + 'T00:00:00') : null;
      var soon = review && !isNaN(review) && (review - new Date()) < 366 * 24 * 3600 * 1000 && (review - new Date()) > -1;
      tests.review = { pass: !!(review && !isNaN(review)) && soon, detail: !review ? 'no date set' : soon ? null : 'the date is past, or more than a year away' };
      tests.safeword = { pass: pr.safeword === true, detail: pr.safeword === true ? null : 'not agreed yet' };
      tests.fundFirst = fundCut === null ? { pass: null, detail: 'needs the fund set-aside' } : afterHouse === null || !Money.isEntered(from.leanCents) ? { pass: null, detail: 'needs the income' }
        : { pass: afterHouse - fundCut - amount >= from.leanCents, detail: from.me ? null : 'assumed: their fund is theirs to judge' };
    }
    var checks = T.protocolRules.checks.map(function (c) { var t = tests[c.id] || { pass: null, detail: active ? null : 'no protocol set' }; return { id: c.id, label: c.label, why: c.why, pass: t.pass, detail: t.detail }; });
    var known = checks.filter(function (c) { return c.pass !== null; });
    return { people: people, shared: shared, splitRule: rule, sharesSumOk: sharesSumOk, rules: T.protocolRules.splitRules,
      protocol: { active: active, from: from, to: to, monthCents: amount, capCents: pr.capCents, reviewDate: pr.reviewDate, safeword: pr.safeword,
        checks: checks, passed: known.filter(function (c) { return c.pass; }).length, of: checks.length, unknown: checks.length - known.length } };
  }
  return { read: read };
});
