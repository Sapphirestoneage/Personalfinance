/* ==========================================================================
   shared/journeymap.js — draws the map engines/journey.js reads. D-235.
   --------------------------------------------------------------------------
   One renderer, so the FIRE room and the dashboard's flight plan show the
   same road the same way: the ten ladder steps, the tier rungs, the back
   half, "you are here" on each, and the routes from here with the years
   to the finish, the monthly figure each asks you to live on, and how
   much sooner or later than the road as it is. Every figure comes from
   the engine's result; nothing is computed here. Every element that
   stands for a room links to it through Ownership.linkTo.

     JourneyMap.html(map, { from, fmt })   the markup, as a string
     JourneyMap.mount(node, map, opts)     sets node.innerHTML
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Ownership: require('./ownership.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Ownership: S.Ownership };
  }
  var api = factory(deps.Money, deps.Ownership);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.JourneyMap = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Ownership) {
  'use strict';

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function link(room, anchor, from) { return esc(Ownership.linkTo(room, anchor, from)); }
  function yrs(n) { return n === 0 ? 'now' : n === 1 ? '1 year' : n + ' years'; }
  function money(c, fmt) { return esc(fmt ? fmt(c) : Money.formatCents(c)); }

  function ladderHtml(lad, from) {
    var steps = lad.steps.map(function (s) {
      return '<a class="jm-step is-' + s.state + '" href="' + link('foo-ladder', 'view-ladder', from) + '" title="' + esc(s.label) + '">'
        + '<i>' + s.step + '</i><span>' + esc(s.label) + '</span></a>';
    }).join('');
    var say = lad.here !== null
      ? 'You are on <strong>step ' + lad.here + '</strong>: ' + esc(lad.steps[lad.here] ? lad.steps[lad.here].label : '') + '.'
      : esc(lad.reason || '');
    return '<div class="jm-stage jm-ladder"><span class="jm-cap">The ladder · what the next dollar does</span>'
      + '<div class="jm-steps">' + steps + '</div><p class="jm-say">' + say + ' <a href="' + link('foo-ladder', 'view-ladder', from) + '">The ladder →</a></p></div>';
  }

  function tiersHtml(tiers, from, fmt) {
    var rungs = tiers.rungs || [];
    if (!rungs.length) {
      return '<div class="jm-stage jm-tiers"><span class="jm-cap">The tiers · when work becomes optional</span>'
        + '<p class="jm-say">' + esc(tiers.reason || '') + '</p></div>';
    }
    var chips = rungs.map(function (r) {
      /* The rung reached is where you are; the one after it is next, and
         says so, because "you are here" on a rung not yet reached lies. */
      var state = r.reached === true ? (tiers.current && tiers.current.id === r.id ? 'here' : 'done') : (tiers.next && tiers.next.id === r.id) ? 'next' : r.reached === null ? 'unknown' : 'ahead';
      return '<a class="jm-step is-' + state + '" href="' + link('fire', 'variants', from) + '" title="' + esc(r.blurb || r.label) + '">'
        + '<i>' + esc(r.label.replace(/ FIRE$/, '')) + '</i><span>' + money(r.targetCents, fmt) + '</span></a>';
    }).join('');
    var say;
    if (!Money.isOk(tiers)) say = esc(tiers.reason || '');
    else if (!tiers.next) say = '<strong>' + esc(tiers.current.label) + '</strong> reached, and every rung behind you.';
    else say = (tiers.current ? '<strong>' + esc(tiers.current.label) + '</strong> reached. ' : 'Below the first rung. ')
      + 'Next: <strong>' + esc(tiers.next.label) + '</strong>, ' + money(tiers.next.gapCents, fmt) + ' to go.';
    return '<div class="jm-stage jm-tiers"><span class="jm-cap">The tiers · when work becomes optional</span>'
      + '<div class="jm-steps">' + chips + '</div><p class="jm-say">' + say + '</p></div>';
  }

  function backHalfHtml(bh, from) {
    return '<div class="jm-stage jm-back"><span class="jm-cap">The back half · coming down</span>'
      + '<div class="jm-steps"><a class="jm-step is-' + bh.state + '" href="' + link('decumulation', 'number', from) + '"><i>↓</i><span>Drawing it down: how the pot pays you, and for how long</span></a></div></div>';
  }

  function routeHtml(r, fmt) {
    var when;
    if (r.never) when = '<span class="jm-never">' + esc(r.reason || 'Never arrives at this pace.') + '</span>';
    else if (r.pace === 'coast') when = 'FIRE at age <strong>' + esc(r.arriveAge) + '</strong> · stop adding in ' + esc(yrs(r.stopSavingIn));
    else when = 'FIRE in <strong>' + esc(yrs(r.yearsToFire)) + '</strong>';
    var delta = r.deltaYears === null || r.deltaYears === 0 ? '' : ' · ' + Math.abs(r.deltaYears) + (Math.abs(r.deltaYears) === 1 ? ' year ' : ' years ') + (r.deltaYears > 0 ? 'sooner' : 'later');
    var asks = 'Live on ' + money(r.monthlyLivingCents, fmt) + ' a month, put in ' + money(Math.round(r.annualSavingCents / 12), fmt) + ' a month' + (r.rough ? ' (rough)' : '');
    return '<li class="jm-route jm-route-' + esc(r.id) + '"><div class="jm-route-head"><strong>' + esc(r.label) + '</strong><span class="jm-when">' + when + esc(delta) + '</span></div>'
      + '<p class="jm-line">' + esc(r.line) + '</p><p class="jm-asks">' + asks + (r.note ? ' · ' + esc(r.note) : '') + '</p></li>';
  }

  function routesHtml(routes, from, fmt) {
    if (!Money.isOk(routes)) {
      return '<div class="jm-stage jm-routes"><span class="jm-cap">The routes from here</span><p class="jm-say">' + esc(routes.reason || '') + '</p></div>';
    }
    return '<div class="jm-stage jm-routes"><span class="jm-cap">The routes from here · same road, four paces</span>'
      + '<ul class="jm-route-list">' + routes.routes.map(function (r) { return routeHtml(r, fmt); }).join('') + '</ul>'
      + '<p class="jm-say">At a ' + esc(Money.formatRate(routes.annualRate, { decimals: 0 })) + ' real return. Other ways to change the pace, side work, a cheaper roof, a better job: '
      + '<a href="' + link('adventure', 's-ways', from) + '">The Long Way Round →</a></p></div>';
  }

  function html(map, opts) {
    var o = opts || {};
    return '<div class="jm">' + ladderHtml(map.ladder, o.from) + tiersHtml(map.tiers, o.from, o.fmt) + backHalfHtml(map.backHalf, o.from) + routesHtml(map.routes, o.from, o.fmt) + '</div>';
  }
  function mount(node, map, opts) { if (node) node.innerHTML = html(map, opts); }

  /* One stylesheet for the two pages, injected once so the shapes cannot drift. */
  var CSS = '.jm{display:grid;gap:var(--space-4);min-width:0;max-width:100%}'
    + '.jm-stage,.jm-steps{min-width:0;max-width:100%}'
    + '.jm-cap{font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-faint)}'
    + '.jm-steps{display:flex;flex-wrap:wrap;gap:6px;margin-top:var(--space-2)}'
    + '.jm-step{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-width:0;min-height:32px;padding:4px 10px 4px 6px;border:1px solid var(--color-border-strong);border-radius:var(--radius-pill);text-decoration:none;color:var(--color-text-muted);font-size:var(--text-xs);background:var(--color-surface-raised)}'
    + '.jm-step i{font-style:normal;min-width:20px;height:20px;padding:0 6px;border-radius:var(--radius-pill);display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--color-border-strong);color:var(--color-text-faint);font-variant-numeric:tabular-nums}'
    + '.jm-step span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.jm-ladder .jm-step span{max-width:0;opacity:0;transition:max-width 150ms ease}'
    + '.jm-ladder .jm-step.is-here span,.jm-ladder .jm-step:hover span,.jm-ladder .jm-step:focus span{max-width:100%;opacity:1;flex:1 1 auto;min-width:0}'
    /* The rung you are on takes its own full line and wraps, so the name
       and "you are here" never run past the card on a phone (D-246). */
    + '.jm-ladder .jm-step.is-here{flex:1 1 100%;flex-wrap:wrap;width:100%;box-sizing:border-box}'
    + '.jm-ladder .jm-step.is-here span{white-space:normal}'
    + '.jm-step{box-sizing:border-box}'
    + '.jm-step.is-done{border-color:var(--sapphire-300)}.jm-step.is-done i{background:var(--sapphire-300);border-color:var(--sapphire-300);color:var(--color-accent-contrast);font-weight:600}'
    + '.jm-step.is-here{border-color:var(--color-accent-hover);color:var(--color-text);background:var(--color-surface-active)}.jm-step.is-here i{border-color:var(--color-accent-hover);color:var(--color-accent-hover);font-weight:600}'
    + '.jm-step.is-here::after{content:"you are here";font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--color-accent-hover);margin-left:4px;white-space:nowrap}'
    + '.jm-step.is-next{border-color:var(--color-accent-hover);color:var(--color-text)}.jm-step.is-next i{border-color:var(--color-accent-hover);color:var(--color-accent-hover)}'
    + '.jm-step.is-next::after{content:"next";font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--color-accent-hover);margin-left:4px}'
    + '.jm-step.is-unknown{border-style:dashed}'
    + '.jm-say{font-size:var(--text-sm);color:var(--color-text-muted);margin:var(--space-2) 0 0}.jm-say strong{color:var(--color-text)}.jm-say a{color:var(--color-accent-hover)}'
    + '.jm-route-list{list-style:none;margin:var(--space-2) 0 0;padding:0;display:grid;gap:var(--space-2)}'
    + '.jm-route{border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-3);background:var(--color-surface-raised)}'
    + '.jm-route-head{display:flex;justify-content:space-between;gap:var(--space-3);align-items:baseline;flex-wrap:wrap}'
    + '.jm-when{font-size:var(--text-sm);font-variant-numeric:tabular-nums;color:var(--color-text-muted)}.jm-when strong{color:var(--color-text)}'
    + '.jm-never{color:var(--color-text-faint)}'
    + '.jm-line{font-size:var(--text-sm);color:var(--color-text-muted);margin:var(--space-1) 0 0}'
    + '.jm-asks{font-size:var(--text-xs);color:var(--color-text-faint);margin:var(--space-1) 0 0;font-variant-numeric:tabular-nums}';
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('jm-css')) return;
    var st = document.createElement('style'); st.id = 'jm-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  return { html: html, mount: function (node, map, opts) { ensureCss(); mount(node, map, opts); }, CSS: CSS };
});
