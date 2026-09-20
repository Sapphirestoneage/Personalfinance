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

  /* ---- The calendar (D-308) ---------------------------------------------
     A cell a day, the way a phone calendar is read: the day number, up to
     two pills for what lands (green in, red out) and "+n" for the rest, the
     balance underneath while the window covers the day, today ringed, the
     low point marked, a day under zero tinted. Every cell is a button: the
     room opens a day sheet for the one tapped. With opts.month the grid is
     that whole calendar month, leading blanks and all; days before the
     window are the past and show what the log says went out (opts.past);
     without opts.month it is the window's own days, as before. */
  var KIND_WORD = { payday: 'Payday', bill: 'Bill', payLater: 'Pay-later', log: 'Logged', annual: 'Yearly', income: 'Income' };
  function kindWord(x) { return KIND_WORD[x.kind] || (x.direction === 'in' ? 'Income' : 'Bill'); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function dim(y, m) { return new Date(y, m, 0).getDate(); }
  function longMonth(ym) { return new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function dayName(date) { return new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function byDate(r) { var m = {}; if (Money.isOk(r)) r.days.forEach(function (d) { m[d.date] = d; }); return m; }
  /* What one calendar day holds: the engine's events inside the window,
     the log's rows before it. */
  function eventsFor(r, date, opts) {
    var d = Money.isOk(r) ? byDate(r)[date] : null;
    if (d) { var ev = Cal.eventsOn(r, d); return { day: d, ins: ev.ins, outs: ev.bills, past: false }; }
    var past = ((opts && opts.past) || []).filter(function (x) { return x.date === date; });
    return { day: null, ins: past.filter(function (x) { return x.cents < 0; }).map(function (x) { return { label: x.label, cents: -x.cents, kind: 'log' }; }), outs: past.filter(function (x) { return x.cents > 0; }).map(function (x) { return { label: x.label, cents: x.cents, kind: 'log' }; }), past: true };
  }
  function pill(x, dir) {
    return '<i class="' + (dir === 'in' ? 'cal-in' : 'cal-out') + (x.kind === 'payLater' ? ' is-pl' : x.kind === 'annual' ? ' is-annual' : '') + (x.potential ? ' is-potential' : x.dateKind === 'estimated' ? ' is-estimated' : '') + '" title="' + esc(x.label) + mark(x) + '">' + (dir === 'in' ? '+' : '−') + short(x.cents) + '</i>';
  }
  function cell(r, date, opts, dom) {
    var ev = eventsFor(r, date, opts);
    var d = ev.day, today = Money.isOk(r) && r.startDate === date;
    var cls = 'cal-cell' + (today ? ' is-today' : '') + (ev.past ? ' is-past' : '') + (d && d.index === r.lowIndex ? ' is-low' : '') + (d && d.balanceCents < 0 ? ' is-under' : '')
      + (d && r.tight && d.index >= r.tight.fromIndex && d.index <= r.tight.toIndex ? ' is-tight' : '') + (opts && opts.selected === date ? ' is-selected' : '') + (!ev.ins.length && !ev.outs.length ? ' is-quiet' : '');
    var all = ev.ins.map(function (x) { return pill(x, 'in'); }).concat(ev.outs.map(function (x) { return pill(x, 'out'); }));
    var marks = all.slice(0, 2).join('') + (all.length > 2 ? '<i class="cal-more">+' + (all.length - 2) + '</i>' : '');
    return '<button type="button" class="' + cls + '" data-cal-day="' + date + '" aria-pressed="' + (opts && opts.selected === date ? 'true' : 'false') + '" aria-label="' + esc(dayName(date)) + (all.length ? ', ' + all.length + (all.length === 1 ? ' item' : ' items') : ', nothing lands') + '">'
      + '<b>' + (dom === 1 && !(opts && opts.month) ? esc(new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'short' })) + ' ' : '') + dom + '</b>'
      + '<span class="cal-marks">' + marks + '</span>'
      + (d ? '<small>' + short(d.balanceCents) + '</small>' : '<small class="is-none"></small>') + '</button>';
  }
  function grid(r, opts) {
    var o = opts || {};
    if (!o.month && !Money.isOk(r)) return '';
    var cells = [], y, mo, first, count, start;
    if (o.month) { y = +o.month.slice(0, 4); mo = +o.month.slice(5, 7); first = new Date(y, mo - 1, 1).getDay(); count = dim(y, mo); start = 1; }
    else { var s0 = r.startDate; y = +s0.slice(0, 4); mo = +s0.slice(5, 7); first = new Date(y, mo - 1, +s0.slice(8, 10)).getDay(); }
    var i;
    for (i = 0; i < first; i++) cells.push('<span class="cal-cell is-blank" aria-hidden="true"></span>');
    if (o.month) { for (i = start; i <= count; i++) cells.push(cell(r, isoOf(y, mo, i), o, i)); }
    else { r.days.forEach(function (d) { cells.push(cell(r, d.date, o, d.dom)); }); }
    while (cells.length % 7) cells.push('<span class="cal-cell is-blank" aria-hidden="true"></span>');
    var rows = [];
    for (i = 0; i < cells.length; i += 7) rows.push('<div class="cal-row">' + cells.slice(i, i + 7).join('') + '</div>');
    return '<div class="cal-grid" role="grid" aria-label="' + (o.month ? esc(longMonth(o.month)) : 'The next ' + r.days.length + ' days') + ' as a calendar">'
      + '<div class="cal-head">' + Cal.WEEKDAYS.map(function (w) { return '<span>' + w.slice(0, 1) + '<i>' + w.slice(1) + '</i></span>'; }).join('') + '</div>' + rows.join('') + '</div>';
  }
  function key() {
    return '<p class="cal-key"><i class="cal-in">+$</i> in <i class="cal-out">−$</i> out <i class="cal-out is-pl">−$</i> pay-later <i class="cal-out is-annual">−$</i> yearly <i class="cal-out is-estimated">−$</i> date estimated <span class="k-low">low point</span> <span class="k-under">under zero</span></p>';
  }
  /* The day sheet: what the tapped day holds, and the balance after. */
  function daySheet(r, date, opts) {
    var ev = eventsFor(r, date, opts);
    var head = '<div class="cal-sheet-head"><b>' + esc(dayName(date)) + '</b>' + (ev.past ? '<span>already happened</span>' : ev.day && ev.day.index === r.lowIndex ? '<span class="is-low">the low point</span>' : '') + '</div>';
    var items = ev.ins.map(function (x) { return { x: x, dir: 'in' }; }).concat(ev.outs.map(function (x) { return { x: x, dir: 'out' }; }));
    if (!items.length) return '<div class="cal-sheet">' + head + '<p class="cal-sheet-empty">' + (ev.past ? 'Nothing logged on this day.' : 'Nothing lands on this day' + (ev.day ? '; the balance runs ' + Money.formatCents(ev.day.balanceCents) : '') + '.') + '</p></div>';
    return '<div class="cal-sheet">' + head + '<ul class="cal-sheet-list">' + items.map(function (it) {
      return '<li' + (it.x.potential ? ' class="is-potential"' : '') + '><span class="ds-kind">' + esc(ev.past ? 'Logged' : kindWord(it.x)) + '</span><span class="ds-what">' + esc(it.x.label) + esc(mark(it.x)) + '</span><span class="ds-amt ' + (it.dir === 'in' ? 'is-in' : 'is-out') + '">' + (it.dir === 'in' ? '+' : '−') + esc(Money.formatCents(it.x.cents)) + '</span></li>';
    }).join('') + '</ul>'
      + (ev.day ? '<p class="cal-sheet-bal">Balance after this day <b' + (ev.day.balanceCents < 0 ? ' class="is-under"' : '') + '>' + esc(Money.formatCents(ev.day.balanceCents)) + '</b></p>' : '') + '</div>';
  }
  /* Coming up: the next n days' turns, grouped as they land. */
  function upcoming(r, n) {
    if (!Money.isOk(r)) return '';
    var days = n || 14;
    var list = Cal.turns(r).filter(function (t) { return t.index < days && !t.potential; });
    if (!list.length) return '<p class="cal-sheet-empty">Nothing lands in the next ' + days + ' days.</p>';
    var ins = list.filter(function (t) { return t.direction === 'in'; }).reduce(function (s, t) { return s + t.cents; }, 0);
    var outs = list.filter(function (t) { return t.direction === 'out'; }).reduce(function (s, t) { return s - t.cents; }, 0);
    return '<p class="cal-up-sum"><span class="is-in">+' + esc(Money.formatCents(ins)) + ' in</span><span class="is-out">−' + esc(Money.formatCents(outs)) + ' out</span></p>'
      + '<ol class="turns cal-upcoming">' + list.map(function (t) {
        return '<li' + (t.index === r.lowIndex ? ' class="is-low"' : '') + '><span class="tn-when">' + esc(t.weekday) + ' ' + t.dom + '</span><span class="tn-what">' + esc(t.label) + esc(mark(t)) + '</span><span class="tn-amt ' + (t.direction === 'in' ? 'is-in' : 'is-out') + '">' + signed(t.cents) + '</span><span class="tn-bal' + (t.balanceCents < 0 ? ' is-under' : '') + '">' + esc(Money.formatCents(t.balanceCents)) + ' after</span></li>';
      }).join('') + '</ol>';
  }
  /* The month, the way a phone calendar is used: a header with the month
     and arrows, a summary strip, the grid, the tapped day's sheet, and
     what is coming up. The room owns the two states (the month shown and
     the day tapped) and re-renders through this. */
  function monthView(r, opts) {
    var o = opts || {};
    var ym = o.month, y = +ym.slice(0, 4), mo = +ym.slice(5, 7), count = dim(y, mo);
    var inC = 0, outC = 0, i;
    for (i = 1; i <= count; i++) { var ev = eventsFor(r, isoOf(y, mo, i), o); ev.ins.forEach(function (x) { if (!x.potential) inC += x.cents; }); ev.outs.forEach(function (x) { if (!x.potential) outC += x.cents; }); }
    var cur = Money.isOk(r) && r.startDate.slice(0, 7) === ym;
    var why = Money.isOk(r) ? '' : '<p class="cal-why">' + esc(r.reason || 'The month cannot be drawn yet.') + ' The days still show what the log says went out.</p>';
    /* The low point, named only when it falls inside the month on screen:
       "on the 4th" under September, when the 4th is October's, misleads. */
    var lowDate = Money.isOk(r) && r.days[r.lowIndex] ? r.days[r.lowIndex].date : null;
    var low = lowDate && lowDate.slice(0, 7) === ym ? '<span class="cal-sum-low' + (r.belowZero ? ' is-under' : '') + '">low ' + esc(Money.formatCents(r.lowCents)) + ' on ' + esc(dayName(lowDate).replace(/^\w+, /, '')) + '</span>' : '';
    var selected = o.selected && o.selected.slice(0, 7) === ym ? o.selected : null;
    return '<div class="cal-month">'
      + '<div class="cal-nav"><button type="button" class="cal-nav-btn" data-cal-nav="-1" aria-label="Earlier month"' + (o.canBack === false ? ' disabled' : '') + '>‹</button>'
      + '<h3>' + esc(longMonth(ym)) + (cur ? '<small>this month</small>' : '') + '</h3>'
      + '<button type="button" class="cal-nav-btn" data-cal-nav="1" aria-label="Later month"' + (o.canForward === false ? ' disabled' : '') + '>›</button></div>'
      + why
      + '<p class="cal-sum"><span class="is-in">+' + esc(Money.formatCents(inC)) + ' in</span><span class="is-out">−' + esc(Money.formatCents(outC)) + ' out</span><span class="cal-sum-net">net ' + (inC - outC < 0 ? '−' : '+') + esc(Money.formatCents(Math.abs(inC - outC))) + '</span>' + low + '</p>'
      + grid(r, o)
      + (selected ? daySheet(r, selected, o) : '<p class="cal-sheet-empty">Tap a day to see what lands on it.</p>')
      + (cur ? '<details class="cal-up" open><summary>Coming up in the next 14 days</summary>' + upcoming(r, 14) + '</details>' : '')
      + key()
      + (!cur && !Money.isOk(r) ? '' : (!cur ? '<p class="cal-note">Balances run from today for the days the window covers; earlier days show what the log says went out.</p>' : ''))
      + '</div>';
  }

  /* The turns, listed: what hits the account, when, and what is left. */
  function turnsHtml(r) {
    if (!Money.isOk(r)) return '';
    var list = Cal.turns(r);
    if (!list.length) return '<p class="slaf-reason">Nothing lands in the next 31 days: no payday, no bill, no receipt with a date.</p>';
    var li = function (t) {
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
    return chart(r) + grid(r) + key() + turnsHtml(r);
  }

  return { chart: chart, grid: grid, key: key, daySheet: daySheet, upcoming: upcoming, monthView: monthView, turnsHtml: turnsHtml, html: html, turns: function (r) { return Cal.turns(r); }, SHOW: SHOW, KIND_WORD: KIND_WORD };
});
