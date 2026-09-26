/* ==========================================================================
   coach/shared/charts.js, every picture the coach screens draw. CD-010.
   --------------------------------------------------------------------------
   A number set in, an SVG string out. Nothing is computed here beyond
   scales and ticks: the figures come from the engines, this only draws.

   THE KINDS (what a number set is) and the TYPES it may be drawn as:
     breakdown  parts of a whole            donut, pie, bar, hbar, stack
     compare    a few figures side by side  bar, hbar        (may be negative)
     series     values over time            line, area, bar, stacked, spark
     meter      one figure against bands    bar, gauge
     progress   saved against a target      bars, rings
     range      a good, likely and slow case band, bars

   THE COLOURS. Eight hues, and eight named orders of them (the themes),
   every one run through the colour-vision validator against this app's
   dark surface (#12151B): only passing orders are here. A series takes its
   hue from the theme's order, or the swatch the coach picked for it. Status
   (good, watch, needs care) uses the app's own tokens and is never a series
   colour. Text is never coloured by a series: the mark beside it is.

     Charts.HUES        { name: hex }         Charts.THEMES  [{ id, label, order }]
     Charts.TYPES       { kind: [{ id, label }] }
     Charts.colors(spec, prefs) -> [hex]      one per series or slice
     Charts.render(spec, opts)  -> { svg, legend, hint, tips }
     Charts.table(spec)         -> html       the WCAG twin of the picture
     Charts.fmt(value, unit, short)
   opts: { type, theme, colors: { seriesId: hueName }, width, height }.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('./money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Charts = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var HUES = { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', yellow: '#c98500', magenta: '#d55181', green: '#008300', violet: '#9085e9', red: '#e66767' };
  var THEMES = [
    { id: 'sapphire', label: 'Sapphire', order: ['blue', 'aqua', 'orange', 'violet', 'yellow', 'magenta', 'green', 'red'] },
    { id: 'sunset', label: 'Sunset', order: ['orange', 'aqua', 'blue', 'yellow', 'magenta', 'green', 'violet', 'red'] },
    { id: 'sea', label: 'Sea', order: ['aqua', 'orange', 'blue', 'yellow', 'magenta', 'green', 'violet', 'red'] },
    { id: 'honey', label: 'Honey', order: ['yellow', 'magenta', 'green', 'blue', 'aqua', 'orange', 'violet', 'red'] },
    { id: 'berry', label: 'Berry', order: ['magenta', 'green', 'red', 'blue', 'yellow', 'violet', 'orange', 'aqua'] },
    { id: 'forest', label: 'Forest', order: ['green', 'magenta', 'yellow', 'blue', 'aqua', 'orange', 'violet', 'red'] },
    { id: 'violet', label: 'Violet', order: ['violet', 'aqua', 'orange', 'blue', 'yellow', 'magenta', 'green', 'red'] },
    { id: 'ember', label: 'Ember', order: ['red', 'violet', 'yellow', 'magenta', 'green', 'blue', 'aqua', 'orange'] }
  ];
  var TYPES = {
    breakdown: [{ id: 'donut', label: 'Donut' }, { id: 'pie', label: 'Pie' }, { id: 'bar', label: 'Columns' }, { id: 'hbar', label: 'Bars' }, { id: 'stack', label: 'One bar' }],
    compare: [{ id: 'bar', label: 'Columns' }, { id: 'hbar', label: 'Bars' }],
    series: [{ id: 'line', label: 'Line' }, { id: 'area', label: 'Area' }, { id: 'bar', label: 'Columns' }, { id: 'stacked', label: 'Stacked' }],
    meter: [{ id: 'bar', label: 'Meter' }, { id: 'gauge', label: 'Dial' }],
    progress: [{ id: 'bars', label: 'Bars' }, { id: 'rings', label: 'Rings' }],
    range: [{ id: 'band', label: 'Band' }, { id: 'bars', label: 'Bars' }]
  };
  var STATUS = { good: 'var(--color-positive)', watch: 'var(--color-caution)', out: 'var(--color-critical-text)', none: 'var(--color-text-faint)' };
  var INK = { text: 'var(--color-text)', muted: 'var(--color-text-muted)', faint: 'var(--color-text-faint)', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.18)', surface: 'var(--chart-surface, #12151B)' };
  var FONT = 'font-family="var(--font-body, system-ui, sans-serif)"';

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function shortMoney(cents) {
    var d = Math.abs(cents) / 100, sign = cents < 0 ? '-' : '';
    if (d >= 1e6) return sign + '$' + (d / 1e6).toFixed(d >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (d >= 1e3) return sign + '$' + (d / 1e3).toFixed(d >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return sign + '$' + Math.round(d);
  }
  function fmt(v, unit, short) {
    if (!num(v)) return 'not yet';
    if (unit === 'cents') return short ? shortMoney(v) : (Money ? Money.formatCents(v) : shortMoney(v));
    if (unit === 'rate') return Math.round(v * 100) + '%';
    if (unit === 'months') return r1(v) + (short ? ' mo' : (r1(v) === 1 ? ' month' : ' months'));
    if (unit === 'years') return r1(v) + (short ? ' yr' : (r1(v) === 1 ? ' year' : ' years'));
    if (unit === 'score') return String(Math.round(v));
    return String(Math.round(v * 100) / 100);
  }
  function niceStep(range, count) {
    var rough = range / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(rough || 1)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= rough) return steps[i] * mag;
    return 10 * mag;
  }
  function ticks(min, max, count) {
    if (!(max > min)) max = min + 1;
    var step = niceStep(max - min, count), out = [];
    for (var v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
    /* the scale always reaches the tallest mark, so no label leaves the picture */
    if (out[out.length - 1] < max) out.push(Math.round((out[out.length - 1] + step) * 1e6) / 1e6);
    return out;
  }
  function tspan(x, y, text, opts) {
    var o = opts || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" ' + FONT + ' font-size="' + (o.size || 12) + '" fill="' + (o.fill || INK.muted) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.weight ? ' font-weight="' + o.weight + '"' : '') + (o.baseline ? ' dominant-baseline="' + o.baseline + '"' : '') + '>' + esc(text) + '</text>';
  }
  function textWidth(s, size) { return String(s).length * (size || 12) * 0.56; }
  function roundedTop(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) + ' v' + (-(h - r)).toFixed(1) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + ' h' + (w - 2 * r).toFixed(1) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + ' v' + (h - r).toFixed(1) + ' z';
  }
  function roundedRight(x, y, w, h, r) {
    if (w <= 0) return '';
    r = Math.min(r, h / 2, w);
    return 'M' + x.toFixed(1) + ',' + y.toFixed(1) + ' h' + (w - r).toFixed(1) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + ' v' + (h - 2 * r).toFixed(1) + ' a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + ' h' + (-(w - r)).toFixed(1) + ' z';
  }
  function mark(attrs, tip, label) {
    /* every mark is a hit target: hoverable, focusable, named */
    return ' class="ck-mark"' + (tip ? ' data-tip="' + esc(tip) + '"' : '') + ' tabindex="0" role="img" aria-label="' + esc(label || tip || '') + '"' + attrs;
  }
  function open(w, h, label) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(label || '') + '" class="ck-svg" style="max-width:100%;height:auto;display:block">'; }

  /* ---- Colours ------------------------------------------------------------- */
  function themeById(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }
  function idsOf(spec) {
    var list = spec.slices || spec.series || spec.items || [];
    return list.map(function (s, i) { return s.id || ('s' + i); });
  }
  function colors(spec, prefs) {
    var p = prefs || {};
    var order = themeById(p.theme).order;
    var picks = p.colors || {};
    var ids = idsOf(spec);
    if (!ids.length) ids = ['s0'];                    /* a meter or a range: one colour, the theme's lead */
    return ids.map(function (id, i) { var h = picks[id] && HUES[picks[id]] ? picks[id] : order[i % order.length]; return HUES[h]; });
  }
  function hueName(hex) { for (var k in HUES) if (HUES[k] === hex) return k; return null; }

  /* ---- Breakdown and compare ------------------------------------------------ */
  function slicesOf(spec) {
    var list = (spec.slices || []).filter(function (s) { return num(s.value); });
    if (list.length > 8 && spec.kind === 'breakdown') {
      var sorted = list.slice().sort(function (a, b) { return b.value - a.value; });
      var keep = sorted.slice(0, 7), rest = sorted.slice(7).reduce(function (s, x) { return s + x.value; }, 0);
      list = keep.concat([{ id: 'other', label: 'Other', value: rest }]);
    }
    return list;
  }
  function donut(spec, cols, o) {
    var list = slicesOf(spec), total = list.reduce(function (s, x) { return s + Math.max(0, x.value); }, 0);
    var W = o.width, H = Math.min(260, Math.max(200, W * 0.5)), cx = W / 2, cy = H / 2, R = Math.min(cx, cy) - 14, inner = o.type === 'pie' ? 0 : R * 0.62;
    var out = [open(W, H, spec.title)];
    if (!total) { out.push(tspan(cx, cy, 'nothing to draw yet', { anchor: 'middle' })); out.push('</svg>'); return out.join(''); }
    var a0 = -Math.PI / 2;
    list.forEach(function (s, i) {
      var v = Math.max(0, s.value), a1 = a0 + (v / total) * 2 * Math.PI;
      if (v === 0) return;
      var big = a1 - a0 > Math.PI ? 1 : 0;
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      var d;
      if (inner) {
        var ix0 = cx + inner * Math.cos(a1), iy0 = cy + inner * Math.sin(a1), ix1 = cx + inner * Math.cos(a0), iy1 = cy + inner * Math.sin(a0);
        d = 'M' + x0 + ',' + y0 + ' A' + R + ',' + R + ' 0 ' + big + ' 1 ' + x1 + ',' + y1 + ' L' + ix0 + ',' + iy0 + ' A' + inner + ',' + inner + ' 0 ' + big + ' 0 ' + ix1 + ',' + iy1 + ' z';
      } else d = 'M' + cx + ',' + cy + ' L' + x0 + ',' + y0 + ' A' + R + ',' + R + ' 0 ' + big + ' 1 ' + x1 + ',' + y1 + ' z';
      var pct = Math.round(v / total * 100);
      out.push('<path d="' + d + '" fill="' + cols[i] + '" stroke="' + INK.surface + '" stroke-width="2"' + mark('', s.label + ': ' + fmt(v, spec.unit) + ' (' + pct + '%)') + '/>');
      /* a direct label only where the slice is wide enough to carry it */
      if (a1 - a0 > 0.5) {
        var am = (a0 + a1) / 2, lr = inner ? (R + inner) / 2 : R * 0.65;
        out.push(tspan(cx + lr * Math.cos(am), cy + lr * Math.sin(am), pct + '%', { anchor: 'middle', baseline: 'middle', fill: '#fff', size: 11, weight: 600 }));
      }
      a0 = a1;
    });
    if (inner) {
      out.push(tspan(cx, cy - 4, fmt(total, spec.unit, true), { anchor: 'middle', baseline: 'middle', fill: INK.text, size: 22, weight: 600 }));
      out.push(tspan(cx, cy + 16, spec.totalLabel || 'total', { anchor: 'middle', baseline: 'middle', size: 11 }));
    }
    out.push('</svg>');
    return out.join('');
  }
  function columns(labels, values, cols, unit, o, opts) {
    var W = o.width, n = values.length, H = opts && opts.height ? opts.height : Math.max(180, Math.min(260, W * 0.45));
    var padL = 44, padR = 12, padT = 26, padB = 36, plotW = W - padL - padR, plotH = H - padT - padB;
    var vals = values.filter(num), max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
    var tk = ticks(min, max, 4), lo = tk[0], hi = tk[tk.length - 1];
    var y = function (v) { return padT + plotH - (v - lo) / (hi - lo || 1) * plotH; };
    var slot = plotW / Math.max(1, n), bw = Math.min(24, slot * 0.6);
    var out = [open(W, H, opts && opts.title)];
    tk.forEach(function (t) { out.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="' + (t === 0 ? INK.axis : INK.grid) + '" stroke-width="1"/>'); out.push(tspan(padL - 6, y(t) + 4, fmt(t, unit, true), { anchor: 'end', size: 11, fill: INK.faint })); });
    values.forEach(function (v, i) {
      var x = padL + slot * i + (slot - bw) / 2, label = labels[i];
      if (num(v)) {
        var top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0));
        out.push('<path d="' + (v >= 0 ? roundedTop(x, top, bw, h, 4) : roundedTop(x, top, bw, h, 0)) + '" fill="' + cols[i] + '"' + mark('', label + ': ' + fmt(v, unit)) + '/>');
        out.push(tspan(x + bw / 2, (v >= 0 ? top - 6 : top + h + 14), fmt(v, unit, true), { anchor: 'middle', size: 11, fill: INK.text }));
      } else out.push(tspan(x + bw / 2, y(0) - 6, 'not yet', { anchor: 'middle', size: 10, fill: INK.faint }));
      var lbl = String(label), maxChars = Math.max(4, Math.floor(slot / 6.5));
      if (lbl.length > maxChars) lbl = lbl.slice(0, maxChars - 1) + '…';
      out.push(tspan(x + bw / 2, H - padB + 18, lbl, { anchor: 'middle', size: 11 }));
    });
    out.push('</svg>');
    return out.join('');
  }
  function hbars(labels, values, cols, unit, o, opts) {
    var W = o.width, n = values.length, rowH = 30, padT = 8, padB = 8;
    var labelW = Math.min(W * 0.34, Math.max.apply(null, labels.map(function (l) { return textWidth(l, 12); }).concat([60])) + 10);
    var H = padT + padB + rowH * n;
    var vals = values.filter(num), max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
    var padL = labelW + 8, padR = 60, plotW = W - padL - padR;
    var x = function (v) { return padL + (v - min) / ((max - min) || 1) * plotW; };
    var out = [open(W, H, opts && opts.title)];
    out.push('<line x1="' + x(0).toFixed(1) + '" x2="' + x(0).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="' + INK.axis + '"/>');
    values.forEach(function (v, i) {
      var yy = padT + rowH * i + 5, bh = 20;
      var lbl = String(labels[i]), maxChars = Math.max(6, Math.floor(labelW / 6.5));
      if (lbl.length > maxChars) lbl = lbl.slice(0, maxChars - 1) + '…';
      out.push(tspan(padL - 8, yy + 14, lbl, { anchor: 'end', fill: INK.text, size: 12 }));
      if (!num(v)) { out.push(tspan(x(0) + 6, yy + 14, 'not yet', { size: 11, fill: INK.faint })); return; }
      var left = Math.min(x(v), x(0)), w = Math.abs(x(v) - x(0));
      out.push('<path d="' + (v >= 0 ? roundedRight(left, yy, w, bh, 4) : 'M' + left + ',' + yy + ' h' + w + ' v' + bh + ' h' + (-w) + ' z') + '" fill="' + cols[i] + '"' + mark('', labels[i] + ': ' + fmt(v, unit)) + '/>');
      out.push(tspan(v >= 0 ? x(v) + 6 : x(v) - 6, yy + 14, fmt(v, unit, true), { anchor: v >= 0 ? 'start' : 'end', size: 11, fill: INK.text }));
    });
    out.push('</svg>');
    return out.join('');
  }
  function stackBar(spec, cols, o) {
    var list = slicesOf(spec).filter(function (s) { return s.value > 0; }), total = list.reduce(function (s, x) { return s + x.value; }, 0);
    var W = o.width, H = 64, out = [open(W, H, spec.title)];
    if (!total) { out.push(tspan(W / 2, 36, 'nothing to draw yet', { anchor: 'middle' })); out.push('</svg>'); return out.join(''); }
    var x = 0;
    list.forEach(function (s, i) {
      var w = s.value / total * W;
      out.push('<rect x="' + x.toFixed(1) + '" y="14" width="' + Math.max(0, w - 2).toFixed(1) + '" height="28" rx="4" fill="' + cols[i] + '"' + mark('', s.label + ': ' + fmt(s.value, spec.unit) + ' (' + Math.round(s.value / total * 100) + '%)') + '/>');
      var pct = Math.round(s.value / total * 100) + '%';
      if (w > textWidth(pct, 11) + 12) out.push(tspan(x + w / 2, 33, pct, { anchor: 'middle', fill: '#fff', size: 11, weight: 600 }));
      x += w;
    });
    out.push(tspan(0, 58, 'together: ' + fmt(total, spec.unit), { size: 11 }));
    out.push('</svg>');
    return out.join('');
  }

  /* ---- Series over time -------------------------------------------------- */
  function lines(spec, cols, o) {
    var W = o.width, spark = o.type === 'spark', H = spark ? (o.height || 40) : (o.height || Math.max(200, Math.min(280, W * 0.45)));
    var xs = spec.x || [], ser = spec.series || [], n = xs.length;
    var padL = spark ? 2 : 48, padR = spark ? 2 : 16, padT = spark ? 4 : 18, padB = spark ? 4 : 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var all = [];
    ser.forEach(function (s) { s.values.forEach(function (v) { if (num(v)) all.push(v); }); });
    var stacked = o.type === 'stacked';
    if (stacked) { for (var k = 0; k < n; k++) { var sum = 0; ser.forEach(function (s) { if (num(s.values[k])) sum += s.values[k]; }); all.push(sum); } }
    var max = Math.max.apply(null, all.concat([num(spec.ymax) ? spec.ymax : 0])), min = Math.min.apply(null, all.concat([num(spec.ymin) ? spec.ymin : 0]));
    var tk = ticks(min, max, 4), lo = spark ? min : (num(spec.ymin) ? spec.ymin : tk[0]), hi = spark ? max : (num(spec.ymax) ? spec.ymax : tk[tk.length - 1]);
    if (num(spec.ymin) || num(spec.ymax)) tk = ticks(lo, hi, 4).filter(function (t) { return t >= lo && t <= hi; });
    var y = function (v) { return padT + plotH - (v - lo) / ((hi - lo) || 1) * plotH; };
    var x = function (i) { return n <= 1 ? padL + plotW / 2 : padL + i / (n - 1) * plotW; };
    var out = [open(W, H, spec.title)];
    if (!all.length) { out.push(tspan(W / 2, H / 2, 'nothing to draw yet', { anchor: 'middle' })); out.push('</svg>'); return { svg: out.join(''), tips: [] }; }
    if (!spark) {
      tk.forEach(function (t) { out.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="' + (t === 0 ? INK.axis : INK.grid) + '"/>'); out.push(tspan(padL - 6, y(t) + 4, fmt(t, spec.unit, true), { anchor: 'end', size: 11, fill: INK.faint })); });
      var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));
      xs.forEach(function (lbl, i) { if (i % every === 0 || i === n - 1) out.push(tspan(x(i), H - padB + 18, lbl, { anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', size: 11 })); });
    }
    if (o.type === 'bar' || stacked) {
      var slot = plotW / Math.max(1, n), groups = stacked ? 1 : ser.length, bw = Math.min(24, (slot * 0.7) / groups);
      for (var i = 0; i < n; i++) {
        var base = 0;
        ser.forEach(function (s, si) {
          var v = s.values[i]; if (!num(v)) return;
          var bx = stacked ? padL + slot * i + (slot - bw) / 2 : padL + slot * i + (slot - bw * groups) / 2 + bw * si;
          var top = stacked ? y(base + v) : Math.min(y(v), y(0)), h = stacked ? Math.abs(y(base) - y(base + v)) : Math.abs(y(v) - y(0));
          out.push('<path d="' + roundedTop(bx, top + (stacked && si ? 2 : 0), bw, Math.max(0, h - (stacked && si ? 2 : 0)), stacked && si < ser.length - 1 ? 0 : 4) + '" fill="' + cols[si] + '"' + mark('', s.label + ', ' + xs[i] + ': ' + fmt(v, spec.unit)) + '/>');
          if (stacked) base += v;
        });
      }
    } else {
      ser.forEach(function (s, si) {
        var d = '', started = false, last = null;
        s.values.forEach(function (v, i) { if (!num(v)) { started = false; return; } d += (started ? ' L' : ' M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); started = true; last = i; });
        if (o.type === 'area' || spark) {
          var first = s.values.findIndex(num);
          if (first !== -1 && last !== null) out.push('<path d="' + d + ' L' + x(last).toFixed(1) + ',' + y(lo).toFixed(1) + ' L' + x(first).toFixed(1) + ',' + y(lo).toFixed(1) + ' z" fill="' + cols[si] + '" fill-opacity="' + (spark ? 0.18 : 0.12) + '"/>');
        }
        out.push('<path d="' + d + '" fill="none" stroke="' + cols[si] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
        if (!spark && last !== null) {
          out.push('<circle cx="' + x(last).toFixed(1) + '" cy="' + y(s.values[last]).toFixed(1) + '" r="4" fill="' + cols[si] + '" stroke="' + INK.surface + '" stroke-width="2"/>');
          if (ser.length <= 2) out.push(tspan(Math.min(x(last) + 8, W - 4), y(s.values[last]) + 4, fmt(s.values[last], spec.unit, true), { size: 11, fill: INK.text, anchor: x(last) + 60 > W ? 'end' : 'start' }));
        }
      });
    }
    /* the crosshair layer: one tip per x, every series in it */
    var tips = xs.map(function (lbl, i) { return { x: x(i), label: lbl, rows: ser.map(function (s, si) { return { label: s.label, text: fmt(s.values[i], spec.unit), color: cols[si] }; }) }; });
    if (!spark) {
      out.push('<line class="ck-cross" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + plotH) + '" stroke="' + INK.axis + '" stroke-width="1" style="display:none"/>');
      out.push('<rect class="ck-hover" x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="transparent" data-left="' + padL + '" data-width="' + plotW + '" data-n="' + n + '"/>');
    }
    out.push('</svg>');
    return { svg: out.join(''), tips: tips };
  }

  /* ---- Meter, progress, range ------------------------------------------------ */
  function zoneOf(v, bands) {
    /* bands: [{ to, zone }] ascending, or a direction with good/warn */
    if (!num(v) || !bands || !bands.length) return 'none';
    for (var i = 0; i < bands.length; i++) if (v < bands[i].to) return bands[i].zone;
    return bands[bands.length - 1].zone;
  }
  function meter(spec, o, cols) {
    var W = o.width, v = spec.value, max = spec.max || 1, bands = spec.bands || [];
    var zone = spec.zone || zoneOf(v, bands);
    /* no bands: nothing to judge, so the fill is the theme's lead hue */
    var fillOf = function (z) { return bands.length ? (STATUS[z] || STATUS.none) : cols[0]; };
    if (o.type === 'gauge') {
      var H = Math.min(200, W * 0.55), cx = W / 2, cy = H - 24, R = Math.min(cx - 20, cy - 10), sw = 16;
      var out = [open(W, H, spec.title)];
      var arc = function (a0, a1, color, extra) { var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1); return '<path d="M' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' A' + R + ',' + R + ' 0 ' + (a1 - a0 > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(1) + ',' + y1.toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="butt"' + (extra || '') + '/>'; };
      var ang = function (val) { return Math.PI + Math.max(0, Math.min(1, val / max)) * Math.PI; };
      var from = 0;
      bands.forEach(function (b) { var to = Math.min(max, b.to); if (to > from) out.push(arc(ang(from), ang(to), STATUS[b.zone] || STATUS.none, ' stroke-opacity="0.28"')); from = to; });
      if (from < max) out.push(arc(ang(from), ang(max), STATUS[bands.length ? bands[bands.length - 1].zone : 'none'], ' stroke-opacity="0.28"'));
      if (!bands.length) out.push(arc(ang(0), ang(max), cols[0], ' stroke-opacity="0.22"'));
      if (num(v)) out.push(arc(ang(0), ang(Math.max(0.001, v)), fillOf(zone), mark('', spec.title + ': ' + fmt(v, spec.unit))));
      out.push(tspan(cx, cy - 8, num(v) ? fmt(v, spec.unit, true) : 'not yet', { anchor: 'middle', size: 24, weight: 600, fill: INK.text }));
      out.push(tspan(cx, cy + 12, (spec.zoneWords || {})[zone] || '', { anchor: 'middle', size: 12, fill: INK.muted }));
      out.push(tspan(cx - R, cy + 18, fmt(0, spec.unit, true), { anchor: 'middle', size: 10, fill: INK.faint }));
      out.push(tspan(cx + R, cy + 18, fmt(max, spec.unit, true) + (spec.maxNote ? spec.maxNote : ''), { anchor: 'middle', size: 10, fill: INK.faint }));
      out.push('</svg>');
      return out.join('');
    }
    var H2 = 62, padL = 0, plotW = W - 70, y0 = 22, bh = 14, out2 = [open(W, H2, spec.title)];
    var x = function (val) { return padL + Math.max(0, Math.min(1, val / max)) * plotW; };
    var f = 0;
    bands.forEach(function (b) { var to = Math.min(max, b.to); if (to > f) out2.push('<rect x="' + x(f).toFixed(1) + '" y="' + y0 + '" width="' + Math.max(0, x(to) - x(f) - 1).toFixed(1) + '" height="' + bh + '" rx="3" fill="' + (STATUS[b.zone] || STATUS.none) + '" fill-opacity="0.22"/>'); f = to; });
    if (f < max) out2.push('<rect x="' + x(f).toFixed(1) + '" y="' + y0 + '" width="' + Math.max(0, x(max) - x(f)).toFixed(1) + '" height="' + bh + '" rx="3" fill="' + (bands.length ? STATUS[bands[bands.length - 1].zone] : cols[0]) + '" fill-opacity="0.22"/>');
    if (num(v)) {
      out2.push('<rect x="' + padL + '" y="' + y0 + '" width="' + Math.max(3, x(v) - padL).toFixed(1) + '" height="' + bh + '" rx="3" fill="' + fillOf(zone) + '"' + mark('', spec.title + ': ' + fmt(v, spec.unit)) + '/>');
      out2.push(tspan(Math.min(x(v), plotW), y0 - 8, fmt(v, spec.unit, true), { anchor: x(v) < 30 ? 'start' : 'middle', size: 12, weight: 600, fill: INK.text }));
    } else out2.push(tspan(padL, y0 - 8, 'not yet', { size: 12, fill: INK.faint }));
    bands.forEach(function (b) { if (b.to < max && b.label) out2.push(tspan(x(b.to), y0 + bh + 16, b.label, { anchor: 'middle', size: 10, fill: INK.faint })); });
    out2.push(tspan(W - 66, y0 + bh - 2, (spec.zoneWords || {})[zone] || '', { size: 12, fill: INK.muted }));
    out2.push('</svg>');
    return out2.join('');
  }
  function progress(spec, cols, o) {
    var W = o.width, items = spec.items || [];
    if (o.type === 'rings') {
      var per = Math.max(120, Math.min(160, W / Math.max(1, items.length))), H = per + 34, out = [open(W, H, spec.title)];
      items.forEach(function (it, i) {
        var cx = per * i + per / 2, cy = per / 2 + 4, R = per / 2 - 18, share = num(it.value) && it.total > 0 ? Math.max(0, Math.min(1, it.value / it.total)) : 0;
        out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + cols[i] + '" stroke-opacity="0.22" stroke-width="12"/>');
        if (share > 0) { var a1 = -Math.PI / 2 + share * 2 * Math.PI, x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1); out.push('<path d="M' + cx + ',' + (cy - R) + ' A' + R + ',' + R + ' 0 ' + (share > 0.5 ? 1 : 0) + ' 1 ' + x1.toFixed(1) + ',' + y1.toFixed(1) + '" fill="none" stroke="' + cols[i] + '" stroke-width="12" stroke-linecap="round"' + mark('', it.label + ': ' + fmt(it.value, spec.unit) + ' of ' + fmt(it.total, spec.unit)) + '/>'); }
        out.push(tspan(cx, cy + 2, Math.round(share * 100) + '%', { anchor: 'middle', baseline: 'middle', size: 18, weight: 600, fill: INK.text }));
        var lbl = String(it.label); if (lbl.length > 16) lbl = lbl.slice(0, 15) + '…';
        out.push(tspan(cx, per + 14, lbl, { anchor: 'middle', size: 12, fill: INK.text }));
        out.push(tspan(cx, per + 28, fmt(it.value, spec.unit, true) + ' of ' + fmt(it.total, spec.unit, true), { anchor: 'middle', size: 10 }));
      });
      out.push('</svg>');
      return out.join('');
    }
    var rowH = 44, H2 = rowH * items.length + 6, out2 = [open(W, H2, spec.title)], plotW = W - 70;
    items.forEach(function (it, i) {
      var y = rowH * i, share = num(it.value) && it.total > 0 ? Math.max(0, Math.min(1, it.value / it.total)) : 0;
      out2.push(tspan(0, y + 14, it.label, { fill: INK.text, size: 12 }));
      out2.push(tspan(plotW, y + 14, fmt(it.value, spec.unit, true) + ' of ' + fmt(it.total, spec.unit, true), { anchor: 'end', size: 11 }));
      out2.push('<rect x="0" y="' + (y + 20) + '" width="' + plotW + '" height="12" rx="4" fill="' + cols[i] + '" fill-opacity="0.22"/>');
      if (share > 0) out2.push('<rect x="0" y="' + (y + 20) + '" width="' + Math.max(4, share * plotW).toFixed(1) + '" height="12" rx="4" fill="' + cols[i] + '"' + mark('', it.label + ': ' + fmt(it.value, spec.unit) + ' of ' + fmt(it.total, spec.unit) + ' (' + Math.round(share * 100) + '%)') + '/>');
      out2.push(tspan(W - 4, y + 31, Math.round(share * 100) + '%', { anchor: 'end', size: 12, weight: 600, fill: INK.text }));
    });
    out2.push('</svg>');
    return out2.join('');
  }
  function range(spec, cols, o) {
    var W = o.width, best = spec.best, likely = spec.likely, worst = spec.worst, unit = spec.unit;
    if (!num(best) || !num(likely) || !num(worst)) { return open(W, 60, spec.title) + tspan(W / 2, 34, spec.emptyText || 'no date yet: a few numbers are still to come', { anchor: 'middle' }) + '</svg>'; }
    if (o.type === 'bars') return hbars(['Good case', 'Likely', 'Slow case'], [best, likely, worst], [cols[0], cols[0], cols[0]], unit, o, { title: spec.title });
    var H = 84, max = Math.max(worst * 1.15, 1), padL = 8, padR = 8, plotW = W - padL - padR, y0 = 30;
    var x = function (v) { return padL + (v / max) * plotW; };
    var out = [open(W, H, spec.title)];
    out.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (y0 + 8) + '" y2="' + (y0 + 8) + '" stroke="' + INK.axis + '"/>');
    ticks(0, max, 5).forEach(function (t) { if (t <= max) { out.push('<line x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + (y0 + 8) + '" y2="' + (y0 + 12) + '" stroke="' + INK.axis + '"/>'); out.push(tspan(x(t), y0 + 26, fmt(t, unit, true), { anchor: 'middle', size: 10, fill: INK.faint })); } });
    out.push('<rect x="' + x(best).toFixed(1) + '" y="' + (y0 - 2) + '" width="' + Math.max(2, x(worst) - x(best)).toFixed(1) + '" height="16" rx="4" fill="' + cols[0] + '" fill-opacity="0.35"' + mark('', 'Good case ' + fmt(best, unit) + ', likely ' + fmt(likely, unit) + ', slow case ' + fmt(worst, unit)) + '/>');
    out.push('<rect x="' + (x(likely) - 2).toFixed(1) + '" y="' + (y0 - 6) + '" width="4" height="24" rx="2" fill="' + cols[0] + '"/>');
    out.push(tspan(x(likely), y0 - 12, 'likely ' + fmt(likely, unit, true), { anchor: 'middle', size: 12, weight: 600, fill: INK.text }));
    out.push(tspan(x(best), H - 6, 'good ' + fmt(best, unit, true), { anchor: x(best) < 50 ? 'start' : 'middle', size: 10 }));
    out.push(tspan(x(worst), H - 6, 'slow ' + fmt(worst, unit, true), { anchor: x(worst) > W - 50 ? 'end' : 'middle', size: 10 }));
    out.push('</svg>');
    return out.join('');
  }

  /* ---- Legend and table ------------------------------------------------------ */
  function legend(spec, cols, type) {
    var list = spec.slices || spec.series || spec.items || [];
    if (list.length < 2 || spec.kind === 'meter' || spec.kind === 'range' || spec.oneColor) return '';
    var isLine = spec.kind === 'series' && (type === 'line' || type === 'area');
    return '<ul class="ck-legend">' + list.map(function (s, i) {
      return '<li><span class="ck-key' + (isLine ? ' ck-key--line' : '') + '" style="background:' + cols[i] + '"></span>' + esc(s.label) + '</li>';
    }).join('') + '</ul>';
  }
  function table(spec) {
    var rows = [], head = [];
    if (spec.kind === 'series') {
      head = ['When'].concat((spec.series || []).map(function (s) { return s.label; }));
      (spec.x || []).forEach(function (lbl, i) { rows.push([lbl].concat((spec.series || []).map(function (s) { return fmt(s.values[i], spec.unit); }))); });
    } else if (spec.kind === 'meter') { head = ['Figure', 'Value']; rows.push([spec.title, fmt(spec.value, spec.unit)]); }
    else if (spec.kind === 'range') { head = ['Case', 'When']; rows.push(['Good case', fmt(spec.best, spec.unit)], ['Likely', fmt(spec.likely, spec.unit)], ['Slow case', fmt(spec.worst, spec.unit)]); }
    else if (spec.kind === 'progress') { head = ['Goal', 'Saved', 'Of']; (spec.items || []).forEach(function (it) { rows.push([it.label, fmt(it.value, spec.unit), fmt(it.total, spec.unit)]); }); }
    else { head = ['Part', 'Amount']; (spec.slices || []).forEach(function (s) { rows.push([s.label, fmt(s.value, spec.unit)]); }); }
    return '<table class="ck-table"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return (i ? '<td>' : '<th scope="row">') + esc(c) + (i ? '</td>' : '</th>'); }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  /* ---- The one entry point ------------------------------------------------- */
  function render(spec, opts) {
    var o = Object.assign({ width: 600 }, opts || {});
    o.width = Math.max(240, Math.round(o.width));
    var kinds = TYPES[spec.kind] || [];
    var first = kinds[0] ? kinds[0].id : null;
    if (spec.kind === 'breakdown' && slicesOf(spec).length <= 2) first = 'hbar';     /* a two-slice pie says less than two bars */
    if (spec.kind === 'compare' && (spec.slices || []).length > 3) first = 'hbar';
    if (spec.defaultType && kinds.some(function (t) { return t.id === spec.defaultType; })) first = spec.defaultType;
    var type = o.type && (kinds.some(function (t) { return t.id === o.type; }) || o.type === 'spark') ? o.type : first;
    var cols = colors(spec, o);
    var svg, tips = [];
    if (spec.kind === 'breakdown' || spec.kind === 'compare') {
      var list = slicesOf(spec), labels = list.map(function (s) { return s.label; }), values = list.map(function (s) { return s.value; });
      var negative = values.some(function (v) { return v < 0; });
      if ((type === 'donut' || type === 'pie') && !negative) svg = donut(spec, cols, Object.assign({}, o, { type: type }));
      else if (type === 'stack' && !negative) svg = stackBar(spec, cols, o);
      else if (type === 'hbar' || ((type === 'donut' || type === 'pie' || type === 'stack') && negative)) svg = hbars(labels, values, spec.oneColor ? values.map(function () { return cols[0]; }) : cols, spec.unit, o, { title: spec.title });
      else svg = columns(labels, values, spec.oneColor ? values.map(function () { return cols[0]; }) : cols, spec.unit, o, { title: spec.title, height: o.height });
    } else if (spec.kind === 'series') { var r = lines(spec, cols, Object.assign({}, o, { type: type })); svg = r.svg; tips = r.tips; }
    else if (spec.kind === 'meter') svg = meter(spec, Object.assign({}, o, { type: type }), cols);
    else if (spec.kind === 'progress') svg = progress(spec, cols, Object.assign({}, o, { type: type }));
    else if (spec.kind === 'range') svg = range(spec, cols, Object.assign({}, o, { type: type }));
    else svg = open(o.width, 40, '') + '</svg>';
    return { svg: svg, legend: legend(spec, cols, type), tips: tips, type: type, colors: cols };
  }
  function types(kind) { return (TYPES[kind] || []).slice(); }

  return { HUES: HUES, THEMES: THEMES, TYPES: TYPES, STATUS: STATUS, colors: colors, hueName: hueName, render: render, table: table, types: types, fmt: fmt, shortMoney: shortMoney, ticks: ticks, zoneOf: zoneOf };
});
