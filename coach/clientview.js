/* ==========================================================================
   coach/clientview.js, what the client sees (CD-007, coach/SPEC.md 3.3).
   --------------------------------------------------------------------------
   Pure: a household and the tables in, one HTML string out. It is handed
   the client's household and a short list of what may be shown; it is
   never handed the roster, another profile, or a coach note. Even so it
   takes the coach record apart itself and keeps only what a client may
   read (shared notes, homework, check-ins), so a caller that passes the
   whole record still cannot leak a private note.

     ClientView.render(h, T, opts) -> html
       opts: { record (the client's coach record), name, asOf, mapWidth
               (px the map is drawn at), since (a household, the start of
               the last session), sinceDate, nextSessionAt, readOnly, snapLabel }
       Decisions are drawn only when marked "show client".
     ClientView.visible(record)    the part of household.coach a client
                                   may see: { shared, homework, checkins }
     ClientView.lifeMapSvg(map, w) the timeline as an SVG string
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
      checkins: (r.checkins || []).map(function (c) { return { date: c.date, feeling: c.feeling }; })
    };
  }

  /* ---- The life map --------------------------------------------------------- */
  function lifeMapSvg(map, width) {
    /* Drawn at the width it is shown at, so a phone reads every label at
       its real size instead of a desktop picture shrunk to a third. */
    var W = Math.max(320, Math.min(1000, Math.round(width || 900))), H = 250, L = 30, R = 30, AXIS = 190;
    var hasAge = map.hasAge;
    /* From today to past the slow end of the FI band and the last goal. */
    var span = Math.ceil(Math.max(W < 600 ? 5 : 10, hasAge ? map.endAge - map.age : 0,
      map.band && map.band.hasDate ? map.band.worstYears + 3 : 0,
      map.goals.reduce(function (m, g) { return g.years !== null && g.years > m ? g.years : m; }, 0) + 2));
    function x(years) { return L + Math.max(0, Math.min(1, years / span)) * (W - L - R); }
    var out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Your life map, from today">');
    /* the FI band: best to worst, likely drawn through it */
    if (map.band && map.band.hasDate) {
      var b0 = x(map.band.bestYears), b1 = x(map.band.worstYears), bl = x(map.band.likelyYears);
      out.push('<rect x="' + b0.toFixed(1) + '" y="30" width="' + Math.max(2, b1 - b0).toFixed(1) + '" height="' + (AXIS - 30) + '" fill="rgba(90,160,255,.16)"/>');
      out.push('<line x1="' + bl.toFixed(1) + '" x2="' + bl.toFixed(1) + '" y1="30" y2="' + AXIS + '" stroke="rgba(120,180,255,.9)" stroke-width="2"/>');
      out.push('<text x="' + bl.toFixed(1) + '" y="22" text-anchor="' + (bl > W - 120 ? 'end' : 'middle') + '" font-size="13" fill="currentColor">FI, likely</text>');
    }
    /* the axis: today, then every five years */
    out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + AXIS + '" y2="' + AXIS + '" stroke="currentColor" stroke-opacity=".5"/>');
    var step = W < 600 ? 10 : 5;
    for (var y = 0; y <= span; y += step) {
      var tx = x(y);
      out.push('<line x1="' + tx.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y1="' + AXIS + '" y2="' + (AXIS + 6) + '" stroke="currentColor" stroke-opacity=".5"/>');
      out.push('<text x="' + tx.toFixed(1) + '" y="' + (AXIS + 22) + '" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".75">'
        + esc(y === 0 ? 'Today' + (hasAge ? ', ' + Math.floor(map.age) : '') : hasAge ? 'Age ' + Math.floor(map.age + y) : '+' + y + ' yrs') + '</text>');
    }
    /* milestones below the axis */
    var marks = (map.marks || []).filter(function (m) { return m.years !== null && m.years >= 0 && m.years <= span && (m.id === 'coast' || m.kind === 'benchmark'); });
    marks.forEach(function (m, i) {
      var mx = x(m.years);
      if (W < 600 && m.kind === 'benchmark') return;
      out.push('<circle cx="' + mx.toFixed(1) + '" cy="' + AXIS + '" r="4" fill="currentColor" fill-opacity=".6"/>');
      out.push('<text x="' + mx.toFixed(1) + '" y="' + (AXIS + 38 + (i % 2) * 14) + '" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".7">' + esc(m.label) + '</text>');
    });
    /* goals and shown decisions above it, staggered so labels do not collide */
    var COLORS = { 'on-track': '#4cc38a', short: '#f0b429', decide: '#9aa5b1' };
    var pins = map.goals.filter(function (g) { return g.years !== null && g.years >= 0; }).map(function (g) { return { years: g.years, label: g.name, color: COLORS[g.status] || '#9aa5b1', sub: g.statusText }; })
      .concat((map.blocks || []).filter(function (b) { return b.years !== null && b.years >= 0; }).map(function (b) { return { years: b.years, label: b.label, color: '#b794f4', sub: b.verdict ? 'decision: ' + b.verdict : 'a decision' }; }))
      .sort(function (a, b) { return a.years - b.years; });
    pins.forEach(function (p, i) {
      var px = x(p.years), py = 60 + (i % 3) * 42;
      out.push('<line x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + (py + 6) + '" y2="' + AXIS + '" stroke="' + p.color + '" stroke-opacity=".6"/>');
      out.push('<circle cx="' + px.toFixed(1) + '" cy="' + py + '" r="6" fill="' + p.color + '"/>');
      var right = px > W * 0.6, tx2 = right ? px - 10 : px + 10, anchor = right ? ' text-anchor="end"' : '';
      out.push('<text x="' + tx2.toFixed(1) + '" y="' + (py + 4) + '"' + anchor + ' font-size="13" fill="currentColor">' + esc(p.label) + '</text>');
      out.push('<text x="' + tx2.toFixed(1) + '" y="' + (py + 19) + '"' + anchor + ' font-size="11" fill="' + p.color + '">' + esc(p.sub) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ---- The four sections ------------------------------------------------------ */
  function render(h, T, opts) {
    var o = opts || {};
    var asOf = o.asOf;
    var rec = visible(o.record);
    var map = Session.lifeMap(h, T, { asOf: asOf, decisions: (o.record && o.record.decisions) || [] });
    var mapWidth = o.mapWidth || 900;
    var goals = Session.goals(h, T, { asOf: asOf });
    var band = map.band;
    var parts = [];

    parts.push('<header class="client-head"><span class="slaf-eyebrow">' + esc(o.readOnly ? 'The plan as of ' + (o.snapLabel || 'then') + ', read-only' : 'Your plan') + '</span>'
      + '<h1>' + esc(o.name || 'Your plan') + '</h1>'
      + '<p class="slaf-lede">' + (band.hasDate ? 'Financial independence in ' + esc(Session.monthsText(band.best)) + ' to ' + esc(Session.monthsText(band.worst)) + ', likely ' + esc(Session.monthsText(band.likely)) + (band.ageText ? ' (' + esc(band.ageText) + ')' : '') + '.'
        : band.alreadyThere ? 'You are financially independent on these numbers.' : 'No FI date yet: a few numbers are still to come.') + '</p></header>');

    /* 1. the life map */
    parts.push('<section class="slaf-card" id="cv-map"><h2>Your life map</h2><div class="lifemap">' + lifeMapSvg(map, mapWidth) + '</div>'
      + '<p class="coach-note">The shaded band is when you could stop needing a paycheck: the good case on its left, the slow case on its right. '
      + 'Green goals are on track, amber need more a month, grey need a decision.</p></section>');

    /* 2. how long each goal takes */
    parts.push('<section class="slaf-card" id="cv-goals"><h2>Your goals</h2>' + (goals.length ? '<div class="goal-cards">' + goals.map(function (g) {
      return '<div class="goal-card"><b>' + esc(g.name) + '</b>'
        + '<div class="fig">' + esc(g.totalCents !== null ? Money.formatCents(g.totalCents) : 'price not set') + '</div>'
        + '<div>' + esc(g.targetDate ? 'by ' + day(g.targetDate) : 'no date yet') + '</div>'
        + '<div>' + esc(g.monthlyCents !== null ? Money.formatCents(g.monthlyCents) + ' a month to get there' : 'a monthly figure once it has a price and a date') + '</div>'
        + '<div>' + esc(g.landsOn ? 'At your current pace: ' + day(g.landsOn) : 'At your current pace: nothing is going in yet') + '</div>'
        + '<div class="st ' + esc(g.status) + '">' + esc(g.statusText) + '</div></div>';
    }).join('') + '</div>' : '<p class="coach-note">No goals yet. We will name them together.</p>') + '</section>');

    /* 3. what changed since the last session */
    var changed = [];
    if (o.since) {
      var r = Session.recap(o.since, h, T, { stops: [], readings: o.readings || null });
      r.sections.filter(function (s) { return s.id === 'numbers' || s.id === 'fi'; }).forEach(function (s) { s.lines.forEach(function (l) { if (l !== 'No number changed.') changed.push(l); }); });
    }
    var doneSince = rec.homework.filter(function (x) { return x.doneAt && (!o.sinceDate || x.doneAt >= o.sinceDate); });
    doneSince.forEach(function (x) { changed.push('Homework done: ' + x.text); });
    var shared = rec.shared.slice(-5);
    parts.push('<section class="slaf-card" id="cv-changed"><h2>What changed' + (o.sinceDate ? ' since ' + esc(day(o.sinceDate)) : '') + '</h2>'
      + (changed.length ? '<ul class="changes">' + changed.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p class="coach-note">' + (o.since ? 'Nothing has moved yet.' : 'This is where changes will show after our first session.') + '</p>')
      + (shared.length ? '<h3 class="slaf-eyebrow" style="margin-top:var(--space-3)">From our sessions</h3><ul class="changes">' + shared.map(function (n) { return '<li>' + esc(n.text) + '</li>'; }).join('') + '</ul>' : '')
      + '</section>');

    /* 4. homework and the next session */
    var open = rec.homework.filter(function (x) { return !x.doneAt; });
    parts.push('<section class="slaf-card" id="cv-homework"><h2>Homework</h2>'
      + (open.length ? '<ul class="changes">' + open.map(function (x) { return '<li>' + esc(x.text) + (x.dueOn ? ' <span class="coach-note">by ' + esc(day(x.dueOn)) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="coach-note">Nothing open.</p>')
      + '<p><b>Next session:</b> ' + esc(o.nextSessionAt ? day(o.nextSessionAt) : 'to be set') + '</p></section>');

    return parts.join('');
  }

  return { render: render, visible: visible, lifeMapSvg: lifeMapSvg, day: day };
});
