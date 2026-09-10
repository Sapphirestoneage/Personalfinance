/* ==========================================================================
   shared/horizon.js — today's money, declared once per screen (15.2).
   --------------------------------------------------------------------------
   Every engine output is real: today's money, a real return from
   data/return_bands.json, inflation and real wage growth declared once in
   household.assumptions and edited in Settings only. A projection room
   says so in ONE line at the top, not beside every number. The feature
   switch `showNominal` (Settings, Horizon group; default off) turns that
   line into "future dollars" and converts at DISPLAY time only: nothing an
   engine returns changes, nothing is stored.

     Horizon.on(h)                  the switch, for this household
     Horizon.inflation(h)           the declared rate
     Horizon.factor(h, years)       (1 + inflation) ^ years, or 1 when off
     Horizon.display(h, cents, years)   cents to show for a figure `years`
                                    out: converted when on, unchanged when off
     Horizon.lineHtml(h)            the one line, with the toggle button
     Horizon.mount(host)            paints the line into `host`, repaints on
                                    change, flips the switch on tap and
                                    tells the room through the callback
   DECISIONS.md D-181.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Features: (function () { try { return require('./features.js'); } catch (e) { return null; } })() };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Features: root.SLAF && root.SLAF.Features };
  }
  var api = factory(deps.Money, deps.Schema, deps.Features);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Horizon = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Features) {
  'use strict';
  var FEATURE = 'showNominal';
  function features() {
    if (Features) return Features;
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF.Features ? g.SLAF.Features : null;
  }
  function on(household) {
    var F = features();
    return !!(F && F.on(FEATURE, household));
  }
  function inflation(household) {
    var a = Schema.resolveAssumptions(household || {});
    return Money.isEntered(a.inflation) ? a.inflation : 0;
  }
  function factor(household, years) {
    if (!on(household) || !Money.isEntered(years) || years <= 0) return 1;
    return Math.pow(1 + inflation(household), years);
  }
  /** The figure to SHOW for cents `years` out. Never stored, never fed back. */
  function display(household, cents, years) {
    if (!Money.isEntered(cents)) return cents;
    var f = factor(household, years);
    return f === 1 ? cents : Math.round(cents * f);
  }
  function pct(rate) { return (Math.round(rate * 1000) / 10) + '%'; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lineHtml(household) {
    var isOn = on(household);
    var a = Schema.resolveAssumptions(household || {});
    var text = isOn
      ? 'Every projected figure below is in future dollars, at ' + pct(a.inflation) + ' inflation a year, and every raise in a lever is real (' + pct(a.realWageGrowth) + ' over inflation).'
      : 'Every projected figure below is in today’s money: returns are real, and a raise in a lever is real (' + pct(a.realWageGrowth) + ' a year over inflation).';
    var F = features();
    var button = F ? '<button type="button" class="slaf-seed-btn slaf-horizon-toggle" role="switch" aria-checked="' + isOn + '" data-horizon-toggle>' + (isOn ? 'Show today’s money' : 'Show future dollars') + '</button>' : '';
    return '<span class="slaf-horizon-text">' + esc(text) + '</span> ' + button;
  }
  /**
   * mount(host, opts): paint the line into `host`, and when the toggle is
   * tapped flip the switch (a user preference, never a household fact) and
   * call opts.onChange so the room repaints its figures.
   */
  function mount(host, opts) {
    if (!host) return null;
    var o = opts || {};
    var read = typeof o.household === 'function' ? o.household : function () { return o.household || {}; };
    function paint() { host.className = 'slaf-horizon' + (on(read()) ? ' is-nominal' : ''); host.innerHTML = lineHtml(read()); }
    host.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-horizon-toggle]') : null;
      if (!b) return;
      var F = features();
      if (F) F.set(FEATURE, !on(read()));
      paint();
      if (typeof o.onChange === 'function') o.onChange(on(read()));
    });
    paint();
    var F0 = features();
    if (F0 && typeof F0.ready === 'function') F0.ready().then(function () { paint(); });
    return { paint: paint };
  }
  return { FEATURE: FEATURE, on: on, inflation: inflation, factor: factor, display: display, lineHtml: lineHtml, mount: mount };
});
