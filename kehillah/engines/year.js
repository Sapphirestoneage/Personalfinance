/* ==========================================================================
   kehillah/engines/year.js, the Jewish year's costs. KD-003.
   --------------------------------------------------------------------------
     Year.read(table, lines, today)
       lines: { lineId: cents | null }   (what the person typed)
       -> {
            rows: [{ id, label, kind, cents, yearCents, entered, when, holidayId }],
            totalCents: ok(cents) | incomplete,   the sum of every ENTERED line, per year
            entered, blank,                         counts
            monthlyCents,                           totalCents / 12, or null
            byMonth: [{ ym, cents, names[] }],      twelve months from today
            next: { holiday, days } | null,         the next holiday from today
            passed: [holidayId]
          }
   A weekly line counts 52 times, a monthly one 12, a yearly one once.
   A blank line is left out of the total and counted as blank; it is never 0.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../shared/money.js') : root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Year = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var TIMES = { year: 1, month: 12, week: 52 };
  function dayOf(iso) { return new Date(iso + 'T12:00:00Z'); }
  function ym(d) { return d.toISOString().slice(0, 7); }
  function perYear(cents, kind) { return cents * (TIMES[kind] || 1); }

  function read(table, lines, today) {
    lines = lines || {};
    var now = today ? new Date(today) : new Date();
    /* The calendar day, at noon UTC, the same way the holidays are held; a
       half day is never rounded into 'tomorrow'. */
    var nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    var byId = {}; table.holidays.forEach(function (h) { byId[h.id] = h; });
    var rows = table.lines.map(function (l) {
      var v = lines[l.id];
      var entered = Money.isEntered(v);
      var h = l.holiday ? byId[l.holiday] : null;
      return { id: l.id, label: l.label, plain: l.plain, kind: l.kind, cents: entered ? v : null, yearCents: entered ? perYear(v, l.kind) : null,
        entered: entered, holidayId: l.holiday, when: h ? h.starts : null, holidayName: h ? h.name : null,
        lowCents: l.lowCents, highCents: l.highCents, startCents: l.startCents };
    });
    var passedIds = table.holidays.filter(function (h) { return dayOf(h.ends).getTime() < nowDay; }).map(function (h) { return h.id; });
    var passed = passedIds;
    var entered = rows.filter(function (r) { return r.entered; });
    var total = entered.length ? Money.ok(entered.reduce(function (s, r) { return s + r.yearCents; }, 0)) : Money.incomplete('nothing entered yet', rows.map(function (r) { return r.id; }));
    /* From this month to the month the year ends, twelve at least: a dated
       line lands in its holiday's month, a weekly or monthly line is spread
       evenly. Running to the year's end is what lets a holiday already
       behind us land in its real next month rather than a catch-all. */
    var end = dayOf(table.ends);
    var span = (end.getUTCFullYear() - now.getFullYear()) * 12 + (end.getUTCMonth() - now.getMonth()) + 1;
    var count = Math.max(12, Math.min(18, span));
    var months = [];
    for (var i = 0; i < count; i++) { var d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1)); months.push({ ym: ym(d), cents: 0, names: [] }); }
    var index = {}; months.forEach(function (m, i) { index[m.ym] = i; });
    entered.forEach(function (r) {
      if (r.kind === 'year' && r.when) {
        var when = dayOf(r.when);
        var gone = passedIds.indexOf(r.holidayId) !== -1;
        /* A holiday behind us is next paid for next year: its month a year
           on if that is in the window, else the window's last month. */
        var k = gone ? ym(new Date(Date.UTC(when.getUTCFullYear() + 1, when.getUTCMonth(), 1))) : ym(when);
        if (index[k] === undefined) k = months[months.length - 1].ym;
        months[index[k]].cents += r.yearCents; months[index[k]].names.push(r.label);
      } else {
        var each = Math.round(r.yearCents / 12);
        months.forEach(function (m) { m.cents += each; });   /* a year's worth a month, every month */
      }
    });
    var upcoming = table.holidays.filter(function (h) { return dayOf(h.ends).getTime() >= nowDay; });
    var next = null;
    if (upcoming.length) { var h = upcoming[0]; next = { holiday: h, days: Math.max(0, Math.round((dayOf(h.starts).getTime() - nowDay) / 86400000)) }; }
    return { rows: rows, totalCents: total, entered: entered.length, blank: rows.length - entered.length,
      monthlyCents: Money.isOk(total) ? Math.round(total.value / 12) : null, byMonth: months, next: next, passed: passed, upcoming: upcoming, weeklyMonthlyCents: entered.some(function (r) { return r.kind !== 'year'; }) ? entered.filter(function (r) { return r.kind !== 'year'; }).reduce(function (s, r) { return s + r.yearCents; }, 0) : null };
  }
  return { read: read, perYear: perYear, TIMES: TIMES };
});
