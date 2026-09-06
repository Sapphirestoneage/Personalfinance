/* ==========================================================================
   shared/charts.js — the one way a number becomes a picture.
   --------------------------------------------------------------------------
   Every chart in the suite is drawn here, as an SVG string, from figures an
   engine already produced: an area chart for anything over time, a donut
   for anything that is a share of a whole, bars for anything compared.
   Nothing is computed here beyond scales and ticks; a room that wants a
   line hands over the points and gets markup back.

   The look is the one on Personal Finance Club's calculators, in this
   suite's palette: a dark panel with a hairline border, faint gridlines,
   axis labels in $48K / $1.2M, a filled area under the line that matters,
   thinner lines for the ones it is measured against, and a legend under
   the plot that says what each colour is. Dollars go in as integer cents,
   like everywhere else, and are formatted only here. DECISIONS.md D-091.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports)
    ? require('./money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Charts = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  /* The palette. Named for what a series usually IS, so a room reaches
     for "growth" rather than for a hex value. */
  var COLORS = {
    growth: '#F26D6D',      /* the line that compounds — the red PFC draws it in */
    contributed: '#5AA9FF', /* what you put in */
    target: '#4CC38A',      /* the line to cross: FI, the floor, the target */
    spend: '#E8B84B',       /* what goes out */
    debt: '#E5484D',
    cash: '#7FB0FF',
    muted: 'rgba(147, 197, 253, 0.45)',
    grid: 'rgba(96, 165, 250, 0.16)',
    axis: 'rgba(147, 197, 253, 0.55)',
    text: 'rgba(191, 219, 254, 0.85)',
    /* For donuts and grouped bars: eight steps that stay apart on a dark
       panel and read in order. */
    series: ['#5AA9FF', '#4CC38A', '#F26D6D', '#E8B84B', '#B085F5', '#3ECFCF', '#F79BD3', '#93C5FD']
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function num(v) { return typeof v === 'number' && Number.isFinite(v); }

  /* ---- Formatting ------------------------------------------------------------ */

  /** Cents to a short axis label: $950 · $4.8K · $48K · $1.2M · $29M. */
  function shortMoney(cents) {
    if (!num(cents)) return '';
    var d = cents / 100, a = Math.abs(d), s = d < 0 ? '-' : '';
    if (a >= 1e9) return s + '$' + trim(a / 1e9) + 'B';
    if (a >= 1e6) return s + '$' + trim(a / 1e6) + 'M';
    if (a >= 1e3) return s + '$' + trim(a / 1e3) + 'K';
    return s + '$' + Math.round(a);
  }
  function trim(x) {
    var r = x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100;
    return String(r);
  }
  function money(cents) { return Money ? Money.formatCents(cents) : shortMoney(cents); }
  function percent(x, decimals) { return num(x) ? (x * 100).toFixed(decimals === undefined ? 0 : decimals) + '%' : ''; }

  /* ---- Scales ----------------------------------------------------------------- */

  /** A round step near range ÷ count: 1, 2, 2.5, 5 × 10^n. */
  function niceStep(range, count) {
    if (!(range > 0)) return 1;
    var raw = range / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var r = raw / mag;
    var step = r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10;
    return step * mag;
  }
  function ticks(min, max, count) {
    var step = niceStep(max - min, count);
    var out = [];
    for (var t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) out.push(Math.round(t / step) * step);
    return out;
  }

  /* ---- 1. Area / line ----------------------------------------------------------- */

  /**
   * opts.series: [{ id, label, color, points: [[x, y], …], fill: bool,
   *                 dash: bool, width }]  — the first filled series is the
   *                 one the chart is about.
   * opts.x: { label, format }   opts.y: { format, min, max }
   * opts.hLines: [{ y, label, color }]   opts.vLines: [{ x, label }]
   * opts.width/height: the viewBox (default 360 × 220).
   * Returns HTML: a .slaf-chart with the svg and a legend.
   */
  function area(opts) {
    var o = opts || {};
    var W = o.width || 360, H = o.height || 220;
    /* The x-axis label used to be drawn at the same x as the last tick and
       only 3 units below it, so "80" and "age" ran together in the corner of
       every chart that passes x.label. Give the label its own band. D-144. */
    var PL = 46, PR = 12, PT = 14, PB = (o.x && o.x.label) ? 36 : 26;
    var series = (o.series || []).filter(function (s) { return s.points && s.points.length; });
    if (!series.length) return '<div class="slaf-chart is-empty"><p class="slaf-reason">' + esc(o.empty || 'Nothing to draw yet.') + '</p></div>';
    var xs = [], ys = [];
    series.forEach(function (s) { s.points.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    (o.hLines || []).forEach(function (l) { if (num(l.y)) ys.push(l.y); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var yLo = Math.min.apply(null, ys), yHi = Math.max.apply(null, ys);
    var y = o.y || {};
    var yMin = num(y.min) ? y.min : Math.min(0, yLo);
    var yMax = num(y.max) ? y.max : yHi;
    if (yMax <= yMin) yMax = yMin + 1;
    var yt = ticks(yMin, yMax, 5);
    yMin = Math.min(yMin, yt[0]); yMax = Math.max(yMax, yt[yt.length - 1]);
    var xt = ticks(x0, x1, 6);
    var sx = function (v) { return PL + (v - x0) / ((x1 - x0) || 1) * (W - PL - PR); };
    var sy = function (v) { return PT + (yMax - v) / ((yMax - yMin) || 1) * (H - PT - PB); };
    var yFormat = y.format || shortMoney, xFormat = (o.x && o.x.format) || function (v) { return String(v); };

    var parts = [];
    parts.push('<rect class="panel" x="0" y="0" width="' + W + '" height="' + H + '" rx="10"/>');
    yt.forEach(function (t) {
      var py = sy(t).toFixed(1);
      parts.push('<line class="grid" x1="' + PL + '" y1="' + py + '" x2="' + (W - PR) + '" y2="' + py + '"/>');
      parts.push('<text class="tick" x="' + (PL - 6) + '" y="' + py + '" text-anchor="end" dominant-baseline="middle">' + esc(yFormat(t)) + '</text>');
    });
    xt.forEach(function (t) {
      var px = sx(t).toFixed(1);
      parts.push('<line class="grid" x1="' + px + '" y1="' + PT + '" x2="' + px + '" y2="' + (H - PB) + '"/>');
      parts.push('<text class="tick" x="' + px + '" y="' + (H - PB + 12) + '" text-anchor="middle">' + esc(xFormat(t)) + '</text>');
    });
    var zero = yMin < 0 && yMax > 0 ? sy(0) : sy(yMin);
    parts.push('<line class="axis" x1="' + PL + '" y1="' + zero.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + zero.toFixed(1) + '"/>');
    if (o.x && o.x.label) parts.push('<text class="tick axis-label" x="' + (W - PR) + '" y="' + (H - 4) + '" text-anchor="end">' + esc(o.x.label) + '</text>');

    (o.vLines || []).forEach(function (l) {
      var px = sx(l.x).toFixed(1);
      parts.push('<line class="mark" x1="' + px + '" y1="' + PT + '" x2="' + px + '" y2="' + (H - PB) + '"/>');
      if (l.label) parts.push('<text class="tick mark-label" x="' + (+px + 3) + '" y="' + (PT + 9) + '">' + esc(l.label) + '</text>');
    });
    series.forEach(function (s) {
      var path = s.points.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join('');
      var color = s.color || COLORS.series[0];
      if (s.fill !== false && (s.fill === true || series.indexOf(s) === 0)) {
        var first = s.points[0], last = s.points[s.points.length - 1];
        parts.push('<path class="fill" d="' + path + 'L' + sx(last[0]).toFixed(1) + ',' + zero.toFixed(1) + 'L' + sx(first[0]).toFixed(1) + ',' + zero.toFixed(1) + 'Z" fill="' + color + '"/>');
      }
      parts.push('<path class="line' + (s.dash ? ' is-dash' : '') + '" d="' + path + '" stroke="' + color + '"' + (s.width ? ' stroke-width="' + s.width + '"' : '') + '/>');
    });
    (o.hLines || []).forEach(function (l) {
      if (!num(l.y)) return;
      var py = sy(l.y).toFixed(1);
      parts.push('<line class="hline" x1="' + PL + '" y1="' + py + '" x2="' + (W - PR) + '" y2="' + py + '" stroke="' + (l.color || COLORS.target) + '"/>');
      if (l.label) parts.push('<text class="tick hline-label" x="' + (W - PR - 3) + '" y="' + (+py - 4) + '" text-anchor="end" fill="' + (l.color || COLORS.target) + '">' + esc(l.label) + '</text>');
    });
    (o.dots || []).forEach(function (d) {
      parts.push('<circle class="dot" cx="' + sx(d.x).toFixed(1) + '" cy="' + sy(d.y).toFixed(1) + '" r="3.5" fill="' + (d.color || COLORS.target) + '"/>');
    });

    var legend = series.map(function (s) {
      return '<li><i style="background:' + (s.color || COLORS.series[0]) + '"></i>' + esc(s.label || s.id || '') + '</li>';
    }).concat((o.hLines || []).filter(function (l) { return l.label && num(l.y); }).map(function (l) {
      return '<li><i class="is-line" style="background:' + (l.color || COLORS.target) + '"></i>' + esc(l.label) + '</li>';
    })).join('');
    return '<div class="slaf-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title || 'chart') + '">' + parts.join('') + '</svg>'
      + (legend ? '<ul class="slaf-legend">' + legend + '</ul>' : '') + '</div>';
  }

  /* ---- 2. Donut ------------------------------------------------------------------- */

  /**
   * opts.slices: [{ label, value, color, note }] — values in any one unit;
   * zero and negative slices are listed, not drawn.
   * opts.center: { big, small }  opts.format: value → text (default money)
   */
  function donut(opts) {
    var o = opts || {};
    var slices = (o.slices || []).filter(function (s) { return num(s.value); });
    var total = slices.reduce(function (t, s) { return t + Math.max(0, s.value); }, 0);
    if (!slices.length || total <= 0) return '<div class="slaf-chart is-empty"><p class="slaf-reason">' + esc(o.empty || 'Nothing to draw yet.') + '</p></div>';
    var format = o.format || money;
    var R = 42, C = 50, TH = o.thickness || 16, circ = 2 * Math.PI * R;
    var acc = 0;
    var arcs = slices.map(function (s, i) {
      var v = Math.max(0, s.value);
      if (!v) return '';
      var len = v / total * circ;
      var color = s.color || COLORS.series[i % COLORS.series.length];
      var out = '<circle class="arc" r="' + R + '" cx="' + C + '" cy="' + C + '" stroke="' + color + '" stroke-width="' + TH + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (circ - len).toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '"/>';
      acc += len;
      return out;
    }).join('');
    var center = o.center || {};
    var big = center.big === undefined ? format(total) : center.big;
    var small = center.small === undefined ? '' : center.small;
    var svg = '<svg viewBox="0 0 100 100" role="img" aria-label="' + esc(o.title || 'share of the whole') + '">'
      + '<circle class="track" r="' + R + '" cx="' + C + '" cy="' + C + '" stroke-width="' + TH + '"/>'
      + '<g transform="rotate(-90 ' + C + ' ' + C + ')">' + arcs + '</g>'
      + '<text class="big" x="' + C + '" y="' + (small ? C - 1 : C + 1) + '" text-anchor="middle" dominant-baseline="middle">' + esc(big) + '</text>'
      + (small ? '<text class="small" x="' + C + '" y="' + (C + 11) + '" text-anchor="middle" dominant-baseline="middle">' + esc(small) + '</text>' : '')
      + '</svg>';
    var legend = slices.map(function (s, i) {
      var color = s.color || COLORS.series[i % COLORS.series.length];
      var share = total > 0 ? Math.max(0, s.value) / total : 0;
      return '<li><i style="background:' + color + '"></i><span class="lbl">' + esc(s.label) + (s.note ? '<small>' + esc(s.note) + '</small>' : '') + '</span>'
        + '<span class="val">' + esc(format(s.value)) + '</span><span class="pct">' + percent(share) + '</span></li>';
    }).join('');
    return '<div class="slaf-chart slaf-donut"><div class="ring">' + svg + '</div><ul class="slaf-legend is-table">' + legend + '</ul></div>';
  }

  /* ---- 3. Bars ---------------------------------------------------------------------- */

  /**
   * Horizontal bars, one per row, scaled to the largest (or opts.max).
   * rows: [{ label, value, color, note, marker: { at, label } , zones: [{from, to, color}] }]
   * A negative value draws leftward from a shared zero when any row is negative.
   */
  function bars(opts) {
    var o = opts || {};
    var rows = (o.rows || []).filter(function (r) { return num(r.value) || r.value === null; });
    if (!rows.length) return '<div class="slaf-chart is-empty"><p class="slaf-reason">' + esc(o.empty || 'Nothing to draw yet.') + '</p></div>';
    var format = o.format || money;
    var vals = rows.map(function (r) { return num(r.value) ? r.value : 0; });
    var maxAbs = Math.max.apply(null, vals.map(Math.abs).concat([num(o.max) ? Math.abs(o.max) : 0])) || 1;
    var anyNeg = vals.some(function (v) { return v < 0; });
    var html = rows.map(function (r, i) {
      var color = r.color || COLORS.series[i % COLORS.series.length];
      var v = num(r.value) ? r.value : null;
      var w = v === null ? 0 : Math.abs(v) / maxAbs * (anyNeg ? 50 : 100);
      var left = anyNeg ? (v < 0 ? 50 - w : 50) : 0;
      var zones = (r.zones || []).map(function (z) {
        var a = Math.max(0, Math.min(1, z.from / maxAbs)) * (anyNeg ? 50 : 100), b = Math.max(0, Math.min(1, z.to / maxAbs)) * (anyNeg ? 50 : 100);
        return '<u style="left:' + (anyNeg ? 50 + a : a) + '%;width:' + (b - a) + '%;background:' + z.color + '"></u>';
      }).join('');
      var marker = r.marker && num(r.marker.at)
        ? '<b style="left:' + ((anyNeg ? 50 : 0) + Math.max(0, Math.min(1, r.marker.at / maxAbs)) * (anyNeg ? 50 : 100)) + '%" title="' + esc(r.marker.label || '') + '"></b>' : '';
      return '<div class="row' + (v === null ? ' is-empty' : '') + '">'
        + '<span class="lbl">' + esc(r.label) + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</span>'
        + '<span class="track">' + zones + (v === null ? '' : '<i style="left:' + left + '%;width:' + w + '%;background:' + color + '"></i>') + marker + '</span>'
        + '<span class="val">' + (v === null ? esc(r.empty || '—') : esc(format(v))) + '</span></div>';
    }).join('');
    return '<div class="slaf-chart slaf-bars' + (anyNeg ? ' has-negative' : '') + '">' + html + '</div>';
  }

  /**
   * One stacked bar per row: parts side by side, as shares of the row's
   * total (or of opts.max when the rows should share a scale).
   * rows: [{ label, parts: [{ label, value, color }], note }]
   */
  function stacked(opts) {
    var o = opts || {};
    var rows = o.rows || [];
    if (!rows.length) return '<div class="slaf-chart is-empty"><p class="slaf-reason">' + esc(o.empty || 'Nothing to draw yet.') + '</p></div>';
    var format = o.format || money;
    var scale = num(o.max) ? o.max : Math.max.apply(null, rows.map(function (r) { return r.parts.reduce(function (t, p) { return t + Math.max(0, p.value || 0); }, 0); })) || 1;
    var seen = {};
    var html = rows.map(function (r) {
      var total = r.parts.reduce(function (t, p) { return t + Math.max(0, p.value || 0); }, 0);
      var segs = r.parts.map(function (p, i) {
        var color = p.color || COLORS.series[i % COLORS.series.length];
        seen[p.label] = color;
        var w = Math.max(0, p.value || 0) / scale * 100;
        return w > 0 ? '<i style="width:' + w + '%;background:' + color + '" title="' + esc(p.label + ' ' + format(p.value)) + '"></i>' : '';
      }).join('');
      return '<div class="row"><span class="lbl">' + esc(r.label) + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</span>'
        + '<span class="track is-stack">' + segs + '</span><span class="val">' + esc(format(total)) + '</span></div>';
    }).join('');
    var legend = Object.keys(seen).map(function (k) { return '<li><i style="background:' + seen[k] + '"></i>' + esc(k) + '</li>'; }).join('');
    return '<div class="slaf-chart slaf-bars">' + html + '<ul class="slaf-legend">' + legend + '</ul></div>';
  }

  /* ---- 4. Series helpers a room may need ------------------------------------------ */

  /** Yearly points from a monthly list: every 12th row, and the last. */
  function yearly(rows, pick, startX) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (i % 12 === 0 || i === rows.length - 1) out.push([(startX || 0) + i / 12, pick(rows[i], i)]);
    }
    return out;
  }

  /* ---- 5. Sankey ------------------------------------------------------------------
     Money as a flow: columns of nodes left to right, a band per link whose
     height is its value. nodes: [{ id, label, column, color }];
     links: [{ from, to, value }]. Node heights are the larger of what
     flows in and what flows out, so a pool that is not fully spent still
     shows its whole height; the unspent part is the gap. */
  function sankey(opts) {
    var o = opts || {};
    var nodes = (o.nodes || []).slice(), links = (o.links || []).filter(function (l) { return num(l.value) && l.value > 0; });
    if (!nodes.length || !links.length) return '<div class="slaf-chart is-empty"><p class="slaf-reason">' + esc(o.empty || 'Nothing flows yet.') + '</p></div>';
    var format = o.format || money;
    var W = o.width || 360, H = o.height || 240, PAD = 10, NW = 10, GAP = 6;
    var byId = {};
    nodes.forEach(function (n) { n.inV = 0; n.outV = 0; byId[n.id] = n; });
    links.forEach(function (l) { if (byId[l.from]) byId[l.from].outV += l.value; if (byId[l.to]) byId[l.to].inV += l.value; });
    nodes.forEach(function (n) { n.v = Math.max(n.inV, n.outV); });
    var cols = {};
    nodes.forEach(function (n) { (cols[n.column] = cols[n.column] || []).push(n); });
    var colIds = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; });
    var colTotal = Math.max.apply(null, colIds.map(function (c) { return cols[c].reduce(function (t, n) { return t + n.v; }, 0) + GAP * (cols[c].length - 1); })) || 1;
    var scale = (H - 2 * PAD) / colTotal;
    var xs = function (c) { return colIds.length === 1 ? PAD : PAD + (W - 2 * PAD - NW) * (colIds.indexOf(c) / (colIds.length - 1)); };
    colIds.forEach(function (c) {
      var y = PAD, list = cols[c].filter(function (n) { return n.v > 0; });
      var used = list.reduce(function (t, n) { return t + n.v * scale; }, 0) + GAP * (list.length - 1);
      y = PAD + Math.max(0, (H - 2 * PAD - used) / 2);
      list.forEach(function (n) { n.x = xs(c); n.y = y; n.h = Math.max(1.5, n.v * scale); n.outY = n.y; n.inY = n.y; y += n.h + GAP; });
    });
    var parts = ['<rect class="panel" x="0" y="0" width="' + W + '" height="' + H + '" rx="10"/>'];
    links.forEach(function (l) {
      var a = byId[l.from], b = byId[l.to];
      if (!a || !b || !(a.v > 0) || !(b.v > 0)) return;
      var h = l.value * scale;
      var y0 = a.outY, y1 = b.inY;
      a.outY += h; b.inY += h;
      var x0 = a.x + NW, x1 = b.x, cx = (x0 + x1) / 2;
      var d = 'M' + x0 + ',' + y0 + ' C' + cx + ',' + y0 + ' ' + cx + ',' + y1 + ' ' + x1 + ',' + y1
        + ' L' + x1 + ',' + (y1 + h) + ' C' + cx + ',' + (y1 + h) + ' ' + cx + ',' + (y0 + h) + ' ' + x0 + ',' + (y0 + h) + ' Z';
      parts.push('<path class="flow" d="' + d + '" fill="' + (l.color || b.color || a.color || COLORS.muted) + '"><title>' + esc(a.label + ' → ' + b.label + ': ' + format(l.value)) + '</title></path>');
    });
    nodes.forEach(function (n) {
      if (!(n.v > 0)) return;
      var last = n.column === colIds[colIds.length - 1];
      parts.push('<rect class="node" x="' + n.x + '" y="' + n.y + '" width="' + NW + '" height="' + n.h + '" rx="2" fill="' + (n.color || COLORS.contributed) + '"><title>' + esc(n.label + ': ' + format(n.v)) + '</title></rect>');
      var tx = last ? n.x - 4 : n.x + NW + 4, anchor = last ? 'end' : 'start';
      var ty = n.y + Math.min(n.h / 2, 8) + 3;
      var label = String(n.label || ''); if (label.length > 18) label = label.slice(0, 17) + '…';
      parts.push('<text class="tick" x="' + tx + '" y="' + ty + '" text-anchor="' + anchor + '">' + esc(label) + '</text>');
      if (n.h > 22) parts.push('<text class="tick small" x="' + tx + '" y="' + (ty + 11) + '" text-anchor="' + anchor + '">' + esc(shortMoney(n.v)) + '</text>');
    });
    return '<div class="slaf-chart slaf-sankey"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title || 'where the money flows') + '">' + parts.join('') + '</svg></div>';
  }

  return {
    COLORS: COLORS,
    sankey: sankey,
    shortMoney: shortMoney,
    percent: percent,
    niceStep: niceStep,
    ticks: ticks,
    area: area,
    donut: donut,
    bars: bars,
    stacked: stacked,
    yearly: yearly
  };
});
