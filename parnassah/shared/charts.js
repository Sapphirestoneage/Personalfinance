/* ==========================================================================
   parnassah/shared/charts.js, every picture on the site. PN-010.
   --------------------------------------------------------------------------
   A number set in, an SVG string out. Nothing is computed here beyond
   scales and ticks; the figures come from the engines.

   THE KINDS
     columns   values by category, one or more series, stacked or beside
     line      a value over categories (the fund balance), with a zero line
     stackbar  parts of one whole, as one horizontal bar
     hbars     a few figures side by side, horizontal, direct-labelled

   THE COLOURS. Six hues in a fixed order, validated for colour vision on
   this app's dark surface (#12151B) with the dataviz validator: adjacent
   pairs at CVD delta E 9.4 or better, normal-vision 19 or better, contrast
   3:1 or better. A series takes the hue at its index, never a cycled one.
   Status (good, watch, over) is drawn from the theme's own tokens and is
   never a series colour. Text is never coloured by a series.

     Charts.HUES                        the six, in order
     Charts.columns(spec) / line(spec) / stackbar(spec) / hbars(spec)
       -> { svg, legend: [{ label, color }], table: html }
   Every mark carries data-tip; common.js turns that into a hover tooltip.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('./money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Charts = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var HUES = ['#3987e5', '#199e70', '#d95926', '#9085e9', '#c98500', '#d55181'];
  var STATUS = { good: 'var(--color-positive)', watch: 'var(--color-warning)', over: 'var(--color-critical)', neutral: 'var(--color-neutral)' };
  var W = 640;

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v, unit) {
    if (!Money.isEntered(v)) return Money.NOT_YET;
    if (unit === 'percent') return Money.formatRate(v, { decimals: 0 });
    if (unit === 'number') return String(Math.round(v));
    return Money.formatCents(v, { roundTo: 1 });
  }
  function short(v) {
    if (!Money.isEntered(v)) return '';
    var d = v / 100, a = Math.abs(d), s = d < 0 ? '-' : '';
    if (a >= 1e6) return s + '$' + (Math.round(a / 1e5) / 10) + 'M';
    if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'k';
    return s + '$' + Math.round(a);
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return n * p;
  }
  /* A bar with rounded top corners only, anchored to its baseline. */
  function topRounded(x, y, w, h, r) {
    if (h <= 0 || w <= 0) return '';
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + ' v' + (-(h - r)) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + ' h' + (w - 2 * r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + ' v' + (h - r) + ' z';
  }
  function legend(series) { return series.map(function (s, i) { return { label: s.label, color: s.color || HUES[i % HUES.length] }; }); }

  /* ---- columns ------------------------------------------------------------ */
  function columns(spec) {
    var cats = spec.categories, series = spec.series, stacked = spec.stacked !== false, unit = spec.unit || 'cents';
    var H = spec.height || 260, padL = 52, padR = 12, padT = 16, padB = 34;
    var pw = W - padL - padR, ph = H - padT - padB;
    var max = 0;
    cats.forEach(function (c, i) {
      var sum = 0, top = 0;
      series.forEach(function (s) { var v = s.values[i]; if (Money.isEntered(v)) { sum += Math.max(0, v); top = Math.max(top, v); } });
      max = Math.max(max, stacked ? sum : top);
    });
    max = niceMax(max);
    var y = function (v) { return padT + ph - (v / max) * ph; };
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title || '') + '">'];
    out.push('<rect class="panel" x="0" y="0" width="' + W + '" height="' + H + '" rx="8"/>');
    for (var t = 0; t <= 4; t++) {
      var gv = max * t / 4, gy = y(gv);
      out.push('<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '"/>');
      out.push('<text class="tick" x="' + (padL - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + esc(unit === 'cents' ? short(gv) : Math.round(gv)) + '</text>');
    }
    out.push('<line class="axis" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + ph) + '" y2="' + (padT + ph) + '"/>');
    var n = cats.length, slot = pw / Math.max(n, 1), bw = Math.min(36, slot * 0.62);
    var every = n > 16 ? Math.ceil(n / 12) : 1;
    cats.forEach(function (c, i) {
      var cx = padL + slot * i + slot / 2;
      if (i % every === 0) out.push('<text class="tick" x="' + cx + '" y="' + (H - padB + 16) + '" text-anchor="middle">' + esc(c) + '</text>');
      var base = 0;
      if (stacked) {
        series.forEach(function (s, si) {
          var v = s.values[i]; if (!Money.isEntered(v) || v <= 0) return;
          var y1 = y(base + v), y2 = y(base), h = y2 - y1;
          var isTop = true;
          for (var k = si + 1; k < series.length; k++) { var nv = series[k].values[i]; if (Money.isEntered(nv) && nv > 0) { isTop = false; break; } }
          var shape = isTop ? '<path d="' + topRounded(cx - bw / 2, y1, bw, Math.max(0, h - 2), 4) + '"' : '<rect x="' + (cx - bw / 2) + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(0, h - 2) + '"';
          out.push(shape + ' fill="' + (s.color || HUES[si % HUES.length]) + '" data-tip="' + esc(c + ', ' + s.label + ': ' + fmt(v, unit)) + '" tabindex="0"><title>' + esc(c + ', ' + s.label + ': ' + fmt(v, unit)) + '</title></' + (isTop ? 'path' : 'rect') + '>');
          base += v;
        });
      } else {
        var m = series.length, gw = bw / m;
        series.forEach(function (s, si) {
          var v = s.values[i]; if (!Money.isEntered(v) || v <= 0) return;
          var x0 = cx - bw / 2 + gw * si + 1;
          out.push('<path d="' + topRounded(x0, y(v), gw - 2, y(0) - y(v), 3) + '" fill="' + (s.color || HUES[si % HUES.length]) + '" data-tip="' + esc(c + ', ' + s.label + ': ' + fmt(v, unit)) + '" tabindex="0"><title>' + esc(c + ', ' + s.label + ': ' + fmt(v, unit)) + '</title></path>');
        });
      }
      if (spec.highlight === i) out.push('<text class="tick mark-label" x="' + cx + '" y="' + (padT - 4) + '" text-anchor="middle">' + esc(spec.highlightLabel || '') + '</text>');
    });
    if (spec.marker && Money.isEntered(spec.marker.value)) {
      var my = y(spec.marker.value);
      out.push('<line class="hline" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + my + '" y2="' + my + '" stroke="' + STATUS.neutral + '"/>');
      var lw = spec.marker.label.length * 5.6 + 8;
      out.push('<rect class="panel" x="' + (W - padR - lw) + '" y="' + (my - 15) + '" width="' + lw + '" height="14" rx="3" opacity="0.9"/>');
      out.push('<text class="tick hline-label" x="' + (W - padR - 4) + '" y="' + (my - 4) + '" text-anchor="end">' + esc(spec.marker.label) + '</text>');
    }
    out.push('</svg>');
    return { svg: out.join(''), legend: series.length > 1 ? legend(series) : [], table: table(cats, series, unit, spec.rowLabel || '') };
  }

  /* ---- line ---------------------------------------------------------------- */
  function line(spec) {
    var cats = spec.categories, series = spec.series, unit = spec.unit || 'cents';
    var H = spec.height || 220, padL = 52, padR = 12, padT = 16, padB = 34, pw = W - padL - padR, ph = H - padT - padB;
    var lo = 0, hi = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (Money.isEntered(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    hi = niceMax(hi); lo = lo < 0 ? -niceMax(-lo) : 0;
    var y = function (v) { return padT + ph - ((v - lo) / (hi - lo)) * ph; };
    var x = function (i) { return padL + (cats.length > 1 ? pw * i / (cats.length - 1) : pw / 2); };
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title || '') + '">', '<rect class="panel" x="0" y="0" width="' + W + '" height="' + H + '" rx="8"/>'];
    for (var t = 0; t <= 4; t++) { var gv = lo + (hi - lo) * t / 4, gy = y(gv); out.push('<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '"/><text class="tick" x="' + (padL - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + esc(short(gv)) + '</text>'); }
    out.push('<line class="axis" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>');
    cats.forEach(function (c, i) { out.push('<text class="tick" x="' + x(i) + '" y="' + (H - padB + 16) + '" text-anchor="middle">' + esc(c) + '</text>'); });
    series.forEach(function (s, si) {
      var color = s.color || HUES[si % HUES.length], d = '', area = '';
      s.values.forEach(function (v, i) { if (!Money.isEntered(v)) return; d += (d ? ' L' : 'M') + x(i) + ',' + y(v); });
      if (spec.area && d) area = d + ' L' + x(s.values.length - 1) + ',' + y(0) + ' L' + x(0) + ',' + y(0) + ' z';
      if (area) out.push('<path class="fill" d="' + area + '" fill="' + color + '"/>');
      out.push('<path class="line" d="' + d + '" stroke="' + color + '"/>');
      s.values.forEach(function (v, i) { if (!Money.isEntered(v)) return; out.push('<circle class="dot" cx="' + x(i) + '" cy="' + y(v) + '" r="4" fill="' + color + '" data-tip="' + esc(cats[i] + ', ' + s.label + ': ' + fmt(v, unit)) + '" tabindex="0"><title>' + esc(cats[i] + ', ' + s.label + ': ' + fmt(v, unit)) + '</title></circle>'); });
    });
    out.push('</svg>');
    return { svg: out.join(''), legend: series.length > 1 ? legend(series) : [], table: table(cats, series, unit, spec.rowLabel || '') };
  }

  /* ---- stackbar: parts of one whole ------------------------------------------ */
  function stackbar(spec) {
    var items = spec.items.filter(function (it) { return Money.isEntered(it.value) && it.value > 0; }), unit = spec.unit || 'cents';
    var total = spec.total || items.reduce(function (a, it) { return a + it.value; }, 0);
    var H = 64, padL = 8, padR = 8, pw = W - padL - padR, x = padL;
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title || '') + '">', '<rect class="panel" x="0" y="0" width="' + W + '" height="' + H + '" rx="8"/>'];
    out.push('<rect x="' + padL + '" y="20" width="' + pw + '" height="24" rx="4" fill="var(--ink-800)"/>');
    items.forEach(function (it, i) {
      var w = total > 0 ? pw * it.value / total : 0;
      out.push('<rect x="' + (x + 1) + '" y="20" width="' + Math.max(0, w - 2) + '" height="24" rx="3" fill="' + (it.color || HUES[i % HUES.length]) + '" data-tip="' + esc(it.label + ': ' + fmt(it.value, unit) + (total > 0 ? ' (' + Math.round(100 * it.value / total) + '%)' : '')) + '" tabindex="0"><title>' + esc(it.label + ': ' + fmt(it.value, unit)) + '</title></rect>');
      if (w > 56) out.push('<text class="tick" x="' + (x + w / 2) + '" y="' + 35 + '" text-anchor="middle" fill="#ffffff" font-weight="600">' + esc(Math.round(100 * it.value / total) + '%') + '</text>');
      x += w;
    });
    out.push('</svg>');
    return { svg: out.join(''), legend: items.map(function (it, i) { return { label: it.label, color: it.color || HUES[i % HUES.length] }; }), table: table(items.map(function (it) { return it.label; }), [{ label: spec.rowLabel || 'Amount', values: items.map(function (it) { return it.value; }) }], unit, '') };
  }

  /* ---- hbars: a few figures side by side ------------------------------------- */
  function hbars(spec) {
    var items = spec.items, unit = spec.unit || 'cents', rowH = 30, padL = 170, padR = 84, H = 12 + rowH * items.length, pw = W - padL - padR;
    var max = niceMax(items.reduce(function (a, it) { return Math.max(a, Money.isEntered(it.value) ? Math.abs(it.value) : 0); }, 0));
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title || '') + '">', '<rect class="panel" x="0" y="0" width="' + W + '" height="' + H + '" rx="8"/>'];
    items.forEach(function (it, i) {
      var y0 = 6 + rowH * i, w = Money.isEntered(it.value) ? pw * Math.abs(it.value) / max : 0;
      out.push('<text class="tick" x="' + (padL - 8) + '" y="' + (y0 + 18) + '" text-anchor="end">' + esc(it.label) + '</text>');
      if (w > 0) out.push('<rect x="' + padL + '" y="' + (y0 + 6) + '" width="' + w + '" height="16" rx="4" fill="' + (it.color || STATUS[it.status] || HUES[0]) + '" data-tip="' + esc(it.label + ': ' + fmt(it.value, unit)) + '" tabindex="0"><title>' + esc(it.label + ': ' + fmt(it.value, unit)) + '</title></rect>');
      out.push('<text class="tick" x="' + (padL + w + 8) + '" y="' + (y0 + 18) + '">' + esc(fmt(it.value, unit)) + '</text>');
    });
    out.push('</svg>');
    return { svg: out.join(''), legend: [], table: table(items.map(function (it) { return it.label; }), [{ label: spec.rowLabel || 'Amount', values: items.map(function (it) { return it.value; }) }], unit, '') };
  }

  function table(cats, series, unit, rowLabel) {
    var h = '<table class="pn-table"><thead><tr><th>' + esc(rowLabel) + '</th>' + series.map(function (s) { return '<th>' + esc(s.label) + '</th>'; }).join('') + '</tr></thead><tbody>';
    cats.forEach(function (c, i) { h += '<tr><th>' + esc(c) + '</th>' + series.map(function (s) { return '<td>' + esc(fmt(s.values[i], unit)) + '</td>'; }).join('') + '</tr>'; });
    return h + '</tbody></table>';
  }
  return { HUES: HUES, STATUS: STATUS, columns: columns, line: line, stackbar: stackbar, hbars: hbars, fmt: fmt, short: short, niceMax: niceMax };
});
