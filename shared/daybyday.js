/* ==========================================================================
   shared/daybyday.js — the month, day by day (D-253)

   One picture in three parts, drawn from the one month engines/calendar.js
   runs: the balance line with every turn marked (in green, out red), the
   same days as a calendar grid, and the turns listed in the order they
   land, each with what caused it and the balance after. The Calendar room
   and Cash Flow both show it; neither holds a copy. Nothing is stored.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node
    ? { Money: require('./money.js'), Charts: require('./charts.js'), Calendar: require('../engines/calendar.js') }
    : { Money: root.SLAF && root.SLAF.Money, Charts: root.SLAF && root.SLAF.Charts, Calendar: root.SLAF && root.SLAF.Calendar };
  var api = factory(deps.Money, deps.Charts, deps.Calendar);
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.DayByDay = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Charts, Cal) {
  'use strict';
  var SHOW = 12; /* turns listed before the fold */

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function short(c) { var k = Math.abs(c) >= 100000; return (c < 0 ? '−' : '') + '$' + (k ? (Math.round(Math.abs(c) / 10000) / 10) + 'k' : Math.round(Math.abs(c) / 100)); }
  function signed(c) { return (c < 0 ? '−' : '+') + Money.formatCents(Math.abs(c)); }
  function mark(x) { return x.potential ? ' (potential, not counted)' : x.dateKind === 'estimated' ? ' (date estimated)' : ''; }

  /* The balance line: one dot per turn, where the day's balance ends. */
  function chart(r) {
    if (!Money.isOk(r)) return Charts.area({ series: [], empty: r.reason });
    return Charts.area({
      title: 'Cash, day by day, for 31 days',
      series: [{ label: 'Cash', color: Charts.COLORS.cash, fill: true, points: Cal.balancePoints(r) }],
      hLines: [{ y: 0, label: 'zero', color: Charts.COLORS.debt }, { y: r.weekCents, label: 'a week of spending', color: Charts.COLORS.target }],
      dots: Cal.turns(r).map(function (t) { return { x: t.index, y: t.balanceCents, color: t.potential ? Charts.COLORS.muted : t.direction === 'in' ? Charts.COLORS.target : Charts.COLORS.debt }; }),
      x: { label: 'day', format: function (v) { return 'd' + Math.round(v + 1); } }
    });
  }

  /* The same days as a calendar: a cell a day, what lands on it, the
     balance underneath, the low point and any day under zero marked. */
  function grid(r) {
    if (!Money.isOk(r)) return '';
    return '<div class="cal-grid" role="table" aria-label="The next 31 days as a calendar">'
      + '<div class="cal-head">' + Cal.WEEKDAYS.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>'
      + Cal.weeks(r).map(function (row) {
        return '<div class="cal-row">' + row.map(function (d) {
          if (!d) return '<span class="cal-cell is-blank"></span>';
          var cls = 'cal-cell' + (d.today ? ' is-today' : '') + (d.isLow ? ' is-low' : '') + (d.belowZero ? ' is-under' : '') + (d.tight ? ' is-tight' : '');
          var marks = '';
          (d.ins || []).forEach(function (x) { marks += '<i class="cal-in' + (x.potential ? ' is-potential' : x.dateKind === 'estimated' ? ' is-estimated' : '') + '" title="' + esc(x.label) + mark(x) + '">+' + short(x.cents) + '</i>'; });
          d.bills.forEach(function (b) { marks += '<i class="cal-out' + (b.kind === 'payLater' ? ' is-pl' : b.kind === 'annual' ? ' is-annual' : '') + (b.potential ? ' is-potential' : b.dateKind === 'estimated' ? ' is-estimated' : '') + '" title="' + esc(b.label) + mark(b) + '">−' + short(b.cents) + '</i>'; });
          (d.notes || []).forEach(function (n) { marks += '<i class="cal-own' + (n.done ? ' is-done' : '') + (n.sub === 'deadline' ? ' is-deadline' : '') + '" title="' + esc(n.label) + '">' + esc(n.label) + '</i>'; });
          return '<span class="' + cls + '"><b>' + (d.firstOfMonth || d.today ? d.month + ' ' : '') + d.dom + '</b>' + marks + '<small>' + short(d.balanceCents) + '</small></span>';
        }).join('') + '</div>';
      }).join('')
      + '</div><p class="cal-key"><i class="cal-in">+$</i> money in · <i class="cal-out">−$</i> a bill or a logged expense · <i class="cal-own">a date of yours</i> · <i class="cal-out is-pl">−$</i> pay-later · <i class="cal-out is-estimated">−$</i> date estimated · <i class="cal-out is-potential">−$</i> potential, not counted · the figure is the cash at the end of the day · <span class="k-low">the low point</span> · <span class="k-under">under zero</span></p>';
  }

  /* The turns, listed: what hits the account, when, and what is left. */
  function turnsHtml(r) {
    if (!Money.isOk(r)) return '';
    var list = Cal.turns(r);
    if (!list.length) return '<p class="slaf-reason">Nothing lands in the next 31 days: no payday, no bill, no receipt with a date, no date of yours.</p>';
    var li = function (t) {
      if (t.direction === 'note') {
        /* Your own date (D-306): what it is, no amount, no balance. */
        return '<li class="is-note' + (t.done ? ' is-done' : '') + '"><span class="tn-when">' + esc(t.month) + ' ' + t.dom + '</span>'
          + '<span class="tn-what">' + esc(t.label) + '</span>'
          + '<span class="tn-amt is-note">' + esc((Cal.EVENT_LABELS && Cal.EVENT_LABELS[t.sub]) || t.sub) + '</span><span class="tn-bal">' + (t.done ? 'done' : '') + '</span></li>';
      }
      return '<li class="' + (t.potential ? 'is-potential ' : '') + (t.index === r.lowIndex ? 'is-low' : '') + '">'
        + '<span class="tn-when">' + esc(t.month) + ' ' + t.dom + '</span>'
        + '<span class="tn-what">' + esc(t.label) + esc(mark(t)) + '</span>'
        + '<span class="tn-amt ' + (t.direction === 'in' ? 'is-in' : 'is-out') + '">' + signed(t.cents) + '</span>'
        + '<span class="tn-bal' + (t.balanceCents < 0 ? ' is-under' : '') + '">' + Money.formatCents(t.balanceCents) + ' after</span></li>';
    };
    var head = list.slice(0, SHOW).map(li).join(''), rest = list.slice(SHOW);
    return '<ol class="turns">' + head + '</ol>'
      + (rest.length ? '<details class="turns-more"><summary>' + rest.length + ' more, to day 31</summary><ol class="turns">' + rest.map(li).join('') + '</ol></details>' : '');
  }

  function html(r) {
    if (!Money.isOk(r)) return chart(r);
    return chart(r) + grid(r) + turnsHtml(r);
  }

  return { chart: chart, grid: grid, turnsHtml: turnsHtml, html: html, turns: function (r) { return Cal.turns(r); }, SHOW: SHOW };
});
