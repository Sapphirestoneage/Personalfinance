/* ==========================================================================
   shared/bands.js — Triple D: every projected number three ways.
   --------------------------------------------------------------------------
   A single expected return is a guess dressed as a fact. Wherever a room
   projects a number forward it shows it three ways — low, likely, high —
   from the one table (data/return_bands.json, real returns at the 25th, 50th
   and 75th percentile of ten-year outcomes), so every room disagrees with
   itself by the same amount. The likely line is the headline; the other two
   say how wide "about" is. DECISIONS.md D-170.

     rates(tables)              → { low, likely, high } as decimal real returns
     threeWays(tables, fn)      → { low, likely, high } of fn(rate)
     lineHtml(tables, fn, fmt)  → one <p class="slaf-bands"> with the three

   `fn(rate)` returns a Result or a plain value; `fmt` turns a Result's
   value into text. An incomplete Result shows as the em dash, never a zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money };
  }
  var api = factory(deps.Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Bands = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var ORDER = [
    { id: 'low',    key: 'p25', label: 'if returns run low' },
    { id: 'likely', key: 'p50', label: 'likely' },
    { id: 'high',   key: 'p75', label: 'if they run high' }
  ];

  function rates(tables) {
    var t = tables && tables.returnBands;
    var p = t && t.percentiles;
    if (!p || !Money.isEntered(p.p25) || !Money.isEntered(p.p50) || !Money.isEntered(p.p75)) return null;
    return { low: p.p25, likely: p.p50, high: p.p75, version: t.version, source: t.source };
  }

  function threeWays(tables, fn) {
    var r = rates(tables);
    if (!r) return null;
    return { low: fn(r.low), likely: fn(r.likely), high: fn(r.high), rates: r };
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pct(rate) { return (Math.round(rate * 1000) / 10) + '%'; }
  function shown(res, fmt) {
    if (res === null || res === undefined) return Money.EM_DASH;
    if (typeof res === 'object' && res.status) return Money.isOk(res) ? fmt(res.value, res) : Money.EM_DASH;
    return fmt(res, null);
  }

  /**
   * The one line. `opts.lead` replaces "Three ways"; `opts.note` is appended
   * small. Nothing renders when the band table is not loaded.
   */
  function lineHtml(tables, fn, fmt, opts) {
    var o = opts || {};
    var w = threeWays(tables, fn);
    if (!w) return '';
    var f = fmt || function (v) { return String(v); };
    return '<p class="slaf-bands" data-bands>'
      + '<span class="slaf-bands-lead">' + esc(o.lead || 'Three ways, after inflation') + ':</span> '
      + ORDER.map(function (b) {
          return '<span class="slaf-band slaf-band--' + b.id + '"><b>' + esc(shown(w[b.id], f)) + '</b> '
            + '<small>' + esc(b.label) + ' (' + pct(w.rates[b.id]) + ')</small></span>';
        }).join('<span class="slaf-bands-sep"> · </span>')
      + (o.note ? ' <small class="slaf-bands-note">' + esc(o.note) + '</small>' : '')
      + '</p>';
  }

  return { ORDER: ORDER, rates: rates, threeWays: threeWays, lineHtml: lineHtml };
});
