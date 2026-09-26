/* ==========================================================================
   parnassah/engines/jewishyear.js, the year's calendar of costs. PN-005.
   --------------------------------------------------------------------------
   The dues, the holidays, the Shabbat table and the summer, laid on the
   twelve months from Elul to Av, so a family sees the spikes (Tishrei,
   Nisan, June) and the level monthly set-aside that covers them.

     JewishYear.calendar(h, T, opts) -> Result
       value: { months: [{ month, label, cents, items }] (twelve, from yearStart),
                annualCents, monthlyCents, weeklyCents, campCents,
                byKind: [{ id, label, cents }], answered, unanswered: [{ id, label }],
                balance: [cents] (the fund after each month at the level set-aside),
                cushionCents (what to start with so the fund never dips below zero) }
   Empty is not zero: a line the family has not answered is listed, not
   counted. The total is "so far" until every line is answered.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.JewishYear = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var ok = Money.ok, incomplete = Money.incomplete, entered = Money.isEntered;
  var LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var KINDS = [{ id: 'dues', label: 'Dues and memberships' }, { id: 'holiday', label: 'The holidays' }, { id: 'shabbat', label: 'The Shabbat table' }, { id: 'camp', label: 'Summer camp' }, { id: 'travel', label: 'Travel' }];

  function calendar(h, T, opts) {
    var o = opts || {};
    var Y = T.year;
    var startMonth = Number(Y.yearStart.split('-')[1]);
    var startYear = Number(Y.yearStart.split('-')[0]);
    var months = [];
    for (var i = 0; i < 12; i++) {
      var m = ((startMonth - 1 + i) % 12) + 1;
      months.push({ month: m, label: LABELS[m - 1] + (m < startMonth ? ' ' + (startYear + 1) : ' ' + startYear), cents: 0, items: [] });
    }
    function slot(m) { return months[(m - startMonth + 12) % 12]; }
    var answered = 0, unanswered = [], byKind = {}, annual = 0;
    function add(month, id, label, kind, cents) { var s = slot(month); s.cents += cents; s.items.push({ id: id, label: label, cents: cents, kind: kind }); byKind[kind] = (byKind[kind] || 0) + cents; annual += cents; }

    Y.events.forEach(function (e) {
      var v = h.year.events[e.id];
      if (!entered(v)) { unanswered.push({ id: e.id, label: e.label }); return; }
      answered++;
      add(e.month, e.id, e.label, e.kind, v);
    });
    var weekly = h.year.shabbatWeeklyCents;
    if (entered(weekly)) {
      answered++;
      var perMonth = Math.round(weekly * Y.weekly.weeks / 12);
      months.forEach(function (s) { s.cents += perMonth; s.items.push({ id: 'shabbat', label: Y.weekly.label, cents: perMonth, kind: 'shabbat' }); });
      byKind.shabbat = perMonth * 12; annual += perMonth * 12;
    } else unanswered.push({ id: 'shabbat', label: Y.weekly.label });

    var camp = 0, campKids = [];
    h.kids.forEach(function (k) {
      if (k.camp !== 'sleepaway' && k.camp !== 'day') return;
      var row = Y.camp[k.camp];
      var v = k.camp === 'sleepaway' ? h.year.campSleepawayCents : h.year.campDayCents;
      if (!entered(v)) { if (!unanswered.some(function (u) { return u.id === 'camp:' + k.camp; })) unanswered.push({ id: 'camp:' + k.camp, label: row.label }); return; }
      camp += v;
      campKids.push({ kidId: k.id, name: k.name, kind: k.camp, cents: v });
      add(row.month, 'camp:' + k.id, row.label + (k.name ? ' (' + k.name + ')' : ''), 'camp', v);
    });
    if (campKids.length) answered++;

    if (!answered) return incomplete('Answer a line or two and the year takes shape.', unanswered.map(function (u) { return u.id; }));

    var monthly = Math.round(annual / 12);
    var balance = [], bal = 0, min = 0;
    months.forEach(function (s) { bal += monthly - s.cents; balance.push(bal); if (bal < min) min = bal; });
    var kinds = KINDS.filter(function (k) { return byKind[k.id] !== undefined; }).map(function (k) { return { id: k.id, label: k.label, cents: byKind[k.id] }; });
    return ok({ months: months, annualCents: annual, monthlyCents: monthly, weeklyCents: entered(weekly) ? weekly : null, campCents: camp, campKids: campKids,
      byKind: kinds, answered: answered, unanswered: unanswered, balance: balance, cushionCents: -min, complete: unanswered.length === 0 }, { missing: unanswered.map(function (u) { return u.id; }) });
  }
  return { calendar: calendar, KINDS: KINDS, LABELS: LABELS };
});
