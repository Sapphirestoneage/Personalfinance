/* ==========================================================================
   toolbox/engines/paydays.js, the months with an extra paycheck (TB-009).
   --------------------------------------------------------------------------
   Paid every two weeks means 26 checks a year and a budget built on 24: two
   months hold three. Paid weekly, 52 against 48: four months hold five.
   Given the next payday, this lays out the next twelve months, names the
   extra months, and says what a month's budget is if it is built on the
   normal count, so the extra check is already spoken for before it lands.
   Semi-monthly and monthly pay have no extra month; the tool says so rather
   than drawing a calendar of nothing.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../../shared/money.js') : root.SLAF && root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.Paydays = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var FREQ = {
    weekly:      { stepDays: 7,  perYear: 52, base: 4, label: 'every week' },
    biweekly:    { stepDays: 14, perYear: 26, base: 2, label: 'every two weeks' },
    semimonthly: { stepDays: 0,  perYear: 24, base: 2, label: 'twice a month' },
    monthly:     { stepDays: 0,  perYear: 12, base: 1, label: 'once a month' }
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = 86400000;

  function iso(d) { return d.toISOString().slice(0, 10); }

  function calendar(opts) {
    var o = opts || {};
    if (!o.frequency || !FREQ[o.frequency]) return Money.incomplete('Say how often you are paid.', ['frequency']);
    var f = FREQ[o.frequency];
    if (!f.stepDays) {
      return Money.ok(0, { frequency: o.frequency, hasExtra: false, perYear: f.perYear, base: f.base, extraChecksPerYear: 0, months: [], extraMonths: [],
        budgetBaseCents: Money.isEntered(o.netCents) ? o.netCents * f.base : null, extraCents: 0 });
    }
    if (!o.nextPayday) return Money.incomplete('Add your next payday.', ['nextPayday']);
    var next = new Date(o.nextPayday + 'T12:00:00Z');
    if (isNaN(next.getTime())) return Money.incomplete('That date did not read.', ['nextPayday']);

    /* Walk back to the first payday of the month the next one is in, then forward twelve months. */
    var first = new Date(next.getTime());
    while (true) {
      var back = new Date(first.getTime() - f.stepDays * DAY);
      if (back.getUTCMonth() !== next.getUTCMonth() || back.getUTCFullYear() !== next.getUTCFullYear()) break;
      first = back;
    }
    var startMonth = Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 1);
    var endMonth = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 12, 1);
    var months = {}, order = [];
    for (var i = 0; i < 12; i++) {
      var d = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + i, 1));
      var key = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
      months[key] = { key: key, label: MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(), short: MONTHS[d.getUTCMonth()], dates: [], count: 0, extra: false };
      order.push(key);
    }
    for (var t = first.getTime(); t < endMonth; t += f.stepDays * DAY) {
      if (t < startMonth) continue;
      var pd = new Date(t);
      var k = pd.getUTCFullYear() + '-' + ('0' + (pd.getUTCMonth() + 1)).slice(-2);
      if (months[k]) { months[k].dates.push(iso(pd)); months[k].count += 1; }
    }
    var list = order.map(function (k) { var m = months[k]; m.extra = m.count > f.base; m.extraCount = Math.max(0, m.count - f.base); return m; });
    var extraMonths = list.filter(function (m) { return m.extra; });
    var extraChecks = f.perYear - f.base * 12;
    var net = Money.isEntered(o.netCents) ? o.netCents : null;
    return Money.ok(extraChecks, {
      frequency: o.frequency, hasExtra: true, perYear: f.perYear, base: f.base, extraChecksPerYear: extraChecks,
      months: list, extraMonths: extraMonths, nextPayday: iso(next), firstInMonth: iso(first),
      budgetBaseCents: net === null ? null : net * f.base,
      extraCents: net === null ? null : net * extraChecks,
      extraPerMonthCents: net === null ? null : Math.round(net * extraChecks / 12),
      annualNetCents: net === null ? null : net * f.perYear
    });
  }

  return { calendar: calendar, FREQ: FREQ };
});
