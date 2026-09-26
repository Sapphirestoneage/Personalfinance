/* ==========================================================================
   coach/clientview.js, what the client sees (CD-007, CD-010, coach/SPEC.md 3.3).
   --------------------------------------------------------------------------
   Pure: a household and the tables in, one HTML string out. It is handed
   the client's household and coach record; it takes the record apart
   itself and keeps only what a client may read (shared notes, homework,
   check-ins, decisions marked "show client"), so a caller that passes the
   whole record still cannot leak a private note.

   The pictures are placeholders (<div data-chart="id">) the page mounts
   with coach/common.js from Session.pictures; the words on the page never
   say "FI": to a client it is the work-optional date.

     ClientView.render(h, T, opts) -> html
       opts: { record, readings, name, asOf, mapWidth, since (a household),
               sinceDate, nextSessionAt, readOnly, snapLabel, pictures }
     ClientView.visible(record)    the part of the record a client may see
     ClientView.lifeMapSvg(map, width)   the timeline as an SVG string
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node ? { Money: require('./shared/money.js'), Session: require('./engines/session.js') }
    : { Money: root.SLAF && root.SLAF.Money, Session: root.SLAF && root.SLAF.Session };
  var api = factory(deps.Money, deps.Session);
  if (node) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.ClientView = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Session) {
  'use strict';

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(iso) {
    if (!iso) return '';
    var d = new Date(iso.length <= 7 ? iso + '-01T12:00:00Z' : iso.length <= 10 ? iso + 'T12:00:00Z' : iso);
    if (isNaN(d.getTime())) return String(iso);
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (iso.length <= 7 ? '' : d.getUTCDate() + ' ') + M[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /* The only door from the coach record into this view. */
  function visible(record) {
    var r = record || {};
    return {
      shared: (r.notes || []).filter(function (n) { return n && n.kind === 'shared' && n.text; }).map(function (n) { return { text: n.text, at: n.at, sessionId: n.sessionId || null }; }),
      homework: (r.homework || []).map(function (x) { return { id: x.id, text: x.text, dueOn: x.dueOn, doneAt: x.doneAt }; }),
      checkins: (r.checkins || []).map(function (c) { return { date: c.date, feeling: c.feeling }; }),
      decisions: (r.decisions || []).filter(function (d) { return d && d.showClient; }).map(function (d) { return { id: d.id, label: d.label, startsOn: d.startsOn, verdict: d.verdict, showClient: true }; })
    };
  }

  /* ---- The life map --------------------------------------------------------- */
  function lifeMapSvg(map, width) {
    /* Drawn at the width it is shown at, so a phone reads every label at
       its real size instead of a desktop picture shrunk to a third. */
    var W = Math.max(320, Math.min(1000, Math.round(width || 900))), H = 250, L = 30, R = 30, AXIS = 190;
    var hasAge = map.hasAge;
    var span = Math.ceil(Math.max(W < 600 ? 5 : 10, hasAge ? map.endAge - map.age : 0,
      map.band && map.band.hasDate ? map.band.worstYears + 3 : 0,
      map.goals.reduce(function (m, g) { return g.years !== null && g.years > m ? g.years : m; }, 0) + 2));
    function x(years) { return L + Math.max(0, Math.min(1, years / span)) * (W - L - R); }
    var out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Your life map, from today">');
    if (map.band && map.band.hasDate) {
      var b0 = x(map.band.bestYears), b1 = x(map.band.worstYears), bl = x(map.band.likelyYears);
      out.push('<rect x="' + b0.toFixed(1) + '" y="30" width="' + Math.max(2, b1 - b0).toFixed(1) + '" height="' + (AXIS - 30) + '" fill="rgba(90,160,255,.16)"/>');
      out.push('<line x1="' + bl.toFixed(1) + '" x2="' + bl.toFixed(1) + '" y1="30" y2="' + AXIS + '" stroke="rgba(120,180,255,.9)" stroke-width="2"/>');
      out.push('<text x="' + bl.toFixed(1) + '" y="22" text-anchor="' + (bl > W - 120 ? 'end' : 'middle') + '" font-size="13" fill="currentColor">work optional, likely</text>');
    }
    out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + AXIS + '" y2="' + AXIS + '" stroke="currentColor" stroke-opacity=".5"/>');
    var step = W < 600 ? 10 : 5;
    for (var y = 0; y <= span; y += step) {
      var tx = x(y);
      out.push('<line x1="' + tx.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y1="' + AXIS + '" y2="' + (AXIS + 6) + '" stroke="currentColor" stroke-opacity=".5"/>');
      out.push('<text x="' + tx.toFixed(1) + '" y="' + (AXIS + 22) + '" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".75">'
        + esc(y === 0 ? 'Today' + (hasAge ? ', ' + Math.floor(map.age) : '') : hasAge ? 'Age ' + Math.floor(map.age + y) : '+' + y + ' yrs') + '</text>');
    }
    var marks = (map.marks || []).filter(function (m) { return m.years !== null && m.years >= 0 && m.years <= span && (m.id === 'coast' || m.kind === 'benchmark'); });
    marks.forEach(function (m, i) {
      var mx = x(m.years);
      if (W < 600 && m.kind === 'benchmark') return;
      out.push('<circle cx="' + mx.toFixed(1) + '" cy="' + AXIS + '" r="4" fill="currentColor" fill-opacity=".6"/>');
      out.push('<text x="' + mx.toFixed(1) + '" y="' + (AXIS + 38 + (i % 2) * 14) + '" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".7">' + esc(m.id === 'coast' ? 'could stop adding' : m.label) + '</text>');
    });
    /* goals and shown decisions above the line, in rows so labels never
       collide: a pin takes the first row whose last label ends before it */
    var COLORS = { 'on-track': '#4cc38a', short: '#f0b429', decide: '#9aa5b1' };
    var pins = map.goals.filter(function (g) { return g.years !== null && g.years >= 0; }).map(function (g) { return { years: g.years, label: g.name, color: COLORS[g.status] || '#9aa5b1', sub: g.statusText }; })
      .concat((map.blocks || []).filter(function (b) { return b.years !== null && b.years >= 0; }).map(function (b) { return { years: b.years, label: b.label, color: '#b794f4', sub: b.verdict ? 'decision: ' + b.verdict : 'a decision' }; }))
      .sort(function (a, b) { return a.years - b.years; });
    var rowEnd = [-1e9, -1e9, -1e9, -1e9];
    pins.forEach(function (p) {
      var px = x(p.years), right = px > W * 0.6, w = Math.max(p.label.length, p.sub.length) * 6.4 + 16;
      var start = right ? px - w : px, end = right ? px : px + w;
      var row = -1;
      for (var r = 0; r < rowEnd.length; r++) if (rowEnd[r] <= start) { row = r; break; }
      if (row === -1) { row = 0; for (var r2 = 1; r2 < rowEnd.length; r2++) if (rowEnd[r2] < rowEnd[row]) row = r2; }
      rowEnd[row] = end + 8;
      var py = 50 + row * 36, tx2 = right ? px - 10 : px + 10, anchor = right ? ' text-anchor="end"' : '';
      out.push('<line x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + (py + 6) + '" y2="' + AXIS + '" stroke="' + p.color + '" stroke-opacity=".6"/>');
      out.push('<circle cx="' + px.toFixed(1) + '" cy="' + py + '" r="6" fill="' + p.color + '"/>');
      out.push('<text x="' + tx2.toFixed(1) + '" y="' + (py + 4) + '"' + anchor + ' font-size="13" fill="currentColor">' + esc(p.label) + '</text>');
      out.push('<text x="' + tx2.toFixed(1) + '" y="' + (py + 19) + '"' + anchor + ' font-size="11" fill="' + p.color + '">' + esc(p.sub) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ---- The page --------------------------------------------------------------- */
  function chartHost(id, pics) { return pics && pics[id] ? '<div class="ck-host" data-chart="' + esc(id) + '"></div>' : ''; }
  function render(h, T, opts) {
    var o = opts || {};
    var asOf = o.asOf;
    var rec = visible(o.record);
    var map = Session.lifeMap(h, T, { asOf: asOf, decisions: rec.decisions });
    var mapWidth = o.mapWidth || 900;
    var goals = Session.goals(h, T, { asOf: asOf });
    var band = map.band, pics = o.pictures || null;
    var parts = [];

    /* the hero: one number, in words a client uses */
    var heroBig, heroLine;
    if (band.hasDate && Money.isEntered(band.likelyAge)) { heroBig = 'Work could be optional around age ' + Math.floor(band.likelyAge); heroLine = 'Good case: age ' + Math.floor(band.bestAge) + '. Slow case: age ' + Math.floor(band.worstAge) + '. It moves when you save more or spend less.'; }
    else if (band.hasDate) { heroBig = 'Work could be optional in about ' + Session.monthsText(band.likely); heroLine = 'Good case ' + Session.monthsText(band.best) + ', slow case ' + Session.monthsText(band.worst) + '.'; }
    else if (band.alreadyThere) { heroBig = 'On these numbers, work is already a choice.'; heroLine = 'What you have saved could pay for life without a paycheck.'; }
    else { heroBig = 'Your plan is taking shape.'; heroLine = 'A few numbers are still to come before the work-optional date shows.'; }
    parts.push('<section class="slaf-card" id="cv-hero"><span class="slaf-eyebrow">' + esc(o.readOnly ? 'The plan as of ' + (o.snapLabel || 'then') + ', read-only' : (o.name || 'Your plan')) + '</span>'
      + '<div class="hero"><div class="big">' + esc(heroBig) + '</div><p class="line">' + esc(heroLine) + '</p></div>' + chartHost('fiBand', pics) + '</section>');

    /* 1. the life map */
    parts.push('<section class="slaf-card" id="cv-map"><h2>Your life map</h2><div class="lifemap">' + lifeMapSvg(map, mapWidth) + '</div>'
      + '<p class="coach-note">The shaded band is when work could become optional: the good case on its left, the slow case on its right. Green goals are on track, amber need more a month, grey need a decision.</p></section>');

    /* 2. the whole picture, and a month */
    parts.push('<section class="slaf-card" id="cv-picture"><h2>The whole picture</h2><p class="coach-note">Everything you own, everything you owe, and what is left.</p><div class="pics">' + chartHost('ownOwe', pics) + chartHost('netWorthOverTime', pics) + '</div></section>');
    parts.push('<section class="slaf-card" id="cv-month"><h2>A normal month</h2><p class="coach-note">Where the money goes, and how many months your cash would cover if pay stopped.</p><div class="pics">' + chartHost('month', pics) + chartHost('cushion', pics) + '</div></section>');
    if (pics && (pics.debts || pics.payoff)) parts.push('<section class="slaf-card" id="cv-debt"><h2>What you owe, and when it is gone</h2><p class="coach-note">Paying only the minimums. An extra payment moves the date closer.</p><div class="pics">' + chartHost('debts', pics) + chartHost('payoff', pics) + chartHost('debtPace', pics) + '</div></section>');

    /* 3. how long each goal takes */
    parts.push('<section class="slaf-card" id="cv-goals"><h2>Your goals</h2>' + (goals.length ? '<div class="goal-cards">' + goals.map(function (g) {
      return '<div class="goal-card"><b>' + esc(g.name) + '</b>'
        + '<div class="fig">' + esc(g.totalCents !== null ? Money.formatCents(g.totalCents) : 'price not set') + '</div>'
        + '<div>' + esc(g.targetDate ? 'by ' + day(g.targetDate) : 'no date yet') + '</div>'
        + '<div>' + esc(g.monthlyCents !== null ? Money.formatCents(g.monthlyCents) + ' a month gets there on time' : 'a monthly figure once it has a price and a date') + '</div>'
        + '<div>' + esc(g.landsOn ? 'At today\'s pace: ' + day(g.landsOn) : 'At today\'s pace: nothing is going in yet') + '</div>'
        + '<div class="st ' + esc(g.status) + '">' + esc(g.statusText) + '</div></div>';
    }).join('') + '</div><div class="pics">' + chartHost('goals', pics) + chartHost('goalsMonthly', pics) + '</div>' : '<p class="coach-note">No goals yet. We will name them together.</p>') + '</section>');
    if (pics && pics.path) parts.push('<section class="slaf-card" id="cv-path"><h2>Your path</h2><p class="coach-note">What is invested, growing over the years, against the amount that makes work optional.</p><div class="pics">' + chartHost('path', pics) + '</div></section>');

    /* 4. what changed since the last session */
    var changed = [];
    if (o.since) {
      var r = Session.recap(o.since, h, T, { stops: [], readings: o.readings || null });
      r.sections.filter(function (s) { return s.id === 'numbers' || s.id === 'fi'; }).forEach(function (s) { s.lines.forEach(function (l) { if (l !== 'No number changed.') changed.push(l); }); });
    }
    rec.homework.filter(function (x) { return x.doneAt && (!o.sinceDate || x.doneAt >= o.sinceDate); }).forEach(function (x) { changed.push('Homework done: ' + x.text); });
    var shared = rec.shared.slice(-5);
    parts.push('<section class="slaf-card" id="cv-changed"><h2>What changed' + (o.sinceDate ? ' since ' + esc(day(o.sinceDate)) : '') + '</h2>'
      + (changed.length ? '<ul class="changes">' + changed.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p class="coach-note">' + (o.since ? 'Nothing has moved yet.' : 'This is where changes will show after our first session.') + '</p>')
      + (shared.length ? '<h3 style="margin-top:var(--space-3)">From our sessions</h3><ul class="changes">' + shared.map(function (n) { return '<li>' + esc(n.text) + '</li>'; }).join('') + '</ul>' : '')
      + '</section>');

    /* 5. homework and the next session; how you have felt */
    var open = rec.homework.filter(function (x) { return !x.doneAt; });
    parts.push('<section class="slaf-card" id="cv-homework"><h2>Homework</h2>'
      + (open.length ? '<ul class="changes">' + open.map(function (x) { return '<li>' + esc(x.text) + (x.dueOn ? ' <span class="coach-note">by ' + esc(day(x.dueOn)) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="coach-note">Nothing open.</p>')
      + '<p><b>Next session:</b> ' + esc(o.nextSessionAt ? day(o.nextSessionAt) : 'to be set') + '</p></section>');
    if (pics && pics.mood) parts.push('<section class="slaf-card" id="cv-mood"><h2>How you have felt about money</h2><div class="pics">' + chartHost('mood', pics) + '</div></section>');
    return parts.join('');
  }

  return { render: render, visible: visible, lifeMapSvg: lifeMapSvg, day: day };
});
