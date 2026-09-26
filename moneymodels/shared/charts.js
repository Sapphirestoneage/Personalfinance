/* ==========================================================================
   moneymodels/shared/charts.js, every picture in the app. MM-004.
   --------------------------------------------------------------------------
   A reading in, an SVG string out. Nothing is computed here beyond scales.
   Six hues, in a fixed order, validated for colour vision against this
   app's dark surface (#12151B); a series keeps its hue whatever else is
   shown. Status (good, watch, out) uses the theme's own tokens and is
   never a series colour. Text wears text tokens, never a series colour.
   Every picture carries a title for screen readers, and Charts.table
   gives the same numbers as a table.

     Charts.HUES                          { id: hex }
     Charts.sky(planets, sun)             six planets on five orbits
     Charts.ring(done, total, hue)        one small progress ring
     Charts.waterfall(spec)               the 30-day cash offer by offer
     Charts.stack(spec)                   one bar in parts
     Charts.funnel(spec)                  rows narrowing down
     Charts.line(spec)                    one series, a line and a mark
     Charts.lines(spec)                   two series and a cap
     Charts.bars(spec)                    a few bars and a line
     Charts.radar(spec)                   six axes against targets
     Charts.meter(value, bands, fmt)      one figure against thresholds
     Charts.table(spec, fmt)              the numbers as a table
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.MM = root.MM || {}; root.MM.Charts = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var HUES = { blue: '#3987e5', aqua: '#199e70', orange: '#d95926', violet: '#9085e9', yellow: '#c98500', magenta: '#d55181' };
  var ORDER = ['blue', 'aqua', 'orange', 'violet', 'yellow', 'magenta'];
  var INK = { text: 'var(--color-text)', muted: 'var(--color-text-muted)', faint: 'var(--color-text-faint)', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.18)', surface: 'var(--chart-surface, #12151B)' };
  var STATUS = { good: 'var(--color-positive)', watch: 'var(--color-caution)', out: 'var(--color-critical-text)' };
  var FONT = 'font-family="system-ui, sans-serif"';
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hue(i) { return HUES[ORDER[i % ORDER.length]]; }
  function svg(w, h, title, body, cls) { return '<svg class="mm-chart ' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(title) + '" ' + FONT + '><title>' + esc(title) + '</title>' + body + '</svg>'; }
  function text(x, y, s, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" fill="' + (o.fill || INK.muted) + '" font-size="' + (o.size || 11) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.weight ? ' font-weight="' + o.weight + '"' : '') + (o.tabular ? ' style="font-variant-numeric:tabular-nums"' : '') + '>' + esc(s) + '</text>'; }
  function nice(max) { if (max <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function short(v, unit, fmt) { return fmt ? fmt(v, unit, true) : String(Math.round(v)); }

  /* ---- The Sky: six planets riding five orbits; the sun in the middle ---------
     A planet's orbit is the number of bands it has finished, so it moves
     outward as it levels. sun: 0 dark, 1 partly lit, 2 lit. */
  function sky(planets, sun) {
    var W = 720, H = 560, cx = W / 2, cy = H / 2, r0 = 40, step = 36, body = '';
    body += '<defs><radialGradient id="mm-sun"><stop offset="0" stop-color="#ffd27a" stop-opacity="1"/><stop offset="1" stop-color="#d95926" stop-opacity="0"/></radialGradient></defs>';
    for (var b = 1; b <= 5; b++) body += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 + b * step) + '" fill="none" stroke="' + INK.grid + '" stroke-width="1"/>';
    [1, 3, 5].forEach(function (k) { body += text(cx - (r0 + k * step) + 5, cy - 4, 'band ' + k, { fill: INK.faint, size: 9 }); });
    var glow = sun === 2 ? 0.9 : sun === 1 ? 0.45 : 0.12;
    body += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 6) + '" fill="url(#mm-sun)" opacity="' + glow + '"/>';
    body += '<circle cx="' + cx + '" cy="' + cy + '" r="14" fill="' + (sun ? '#ffd27a' : 'rgba(255,210,122,0.25)') + '" stroke="rgba(255,255,255,0.3)"><title>' + esc(sun === 2 ? 'The sun: the model pays a customer back twice over inside 30 days' : sun === 1 ? 'The sun: the model pays a customer back inside 30 days' : 'The sun: not lit yet') + '</title></circle>';
    body += text(cx, cy + 4, sun === 2 ? '2x' : sun === 1 ? '1x' : '', { anchor: 'middle', fill: '#12151B', size: 10, weight: 700 });
    var lr = r0 + 5 * step + 22;
    planets.forEach(function (p, i) {
      var a = -Math.PI / 2 + i * (Math.PI * 2 / planets.length), r = r0 + p.orbit * step;
      var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a), size = 8 + p.orbit * 1.6;
      var lx = cx + lr * Math.cos(a), ly = cy + lr * Math.sin(a);
      body += '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + lx.toFixed(1) + '" y2="' + ly.toFixed(1) + '" stroke="' + INK.grid + '" stroke-dasharray="2 3"/>';
      body += '<a href="#planet/' + esc(p.id) + '" aria-label="' + esc(p.label + ', ' + p.done + ' of ' + p.total + ' levels') + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + size.toFixed(1) + '" fill="' + HUES[p.hue] + '" stroke="' + INK.surface + '" stroke-width="2"><title>' + esc(p.label + ': ' + p.done + ' of ' + p.total + ' levels, band ' + p.orbit + ' of 5 cleared') + '</title></circle></a>';
      var horiz = Math.abs(Math.cos(a)) < 0.2, anchor = horiz ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
      var tx = lx + (anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0), ty = horiz ? (Math.sin(a) > 0 ? ly + 16 : ly - 18) : ly - 2;
      body += text(tx, ty, p.label, { anchor: anchor, fill: INK.text, size: 12, weight: 600 });
      body += text(tx, ty + 13, p.done + ' of ' + p.total, { anchor: anchor, fill: INK.faint, size: 10, tabular: true });
    });
    return svg(W, H, 'The six planets on their orbits', body, 'mm-sky');
  }
  function ring(done, total, hueId) {
    var r = 15, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return '<svg class="mm-ring" viewBox="0 0 40 40" role="img" aria-label="' + esc(done + ' of ' + total) + '"><circle cx="20" cy="20" r="' + r + '" fill="none" stroke="' + INK.grid + '" stroke-width="5"/><circle cx="20" cy="20" r="' + r + '" fill="none" stroke="' + (HUES[hueId] || hue(0)) + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 20 20)"/></svg>';
  }

  /* ---- Waterfall: the 30-day cash offer by offer against the cost of a customer */
  function waterfall(spec, fmt) {
    var W = 560, H = 260, L = 56, R = 16, T = 18, B = 44, pw = W - L - R, ph = H - T - B;
    var cum = 0, tops = [], max = spec.cac * 2.2;
    spec.steps.forEach(function (s) { var from = cum; cum += s.value; tops.push({ from: from, to: cum, s: s }); max = Math.max(max, cum, from); });
    max = nice(max); var y = function (v) { return T + ph - Math.max(0, v) / max * ph; };
    var n = spec.steps.length + 1, bw = Math.min(64, pw / n - 12), body = '';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="' + INK.grid + '"/>' + text(L - 6, y(gv) + 4, short(gv, 'cents', fmt), { anchor: 'end', size: 10, fill: INK.faint, tabular: true }); }
    tops.forEach(function (t, i) {
      var x = L + (i + 0.5) * pw / n - bw / 2, top = y(Math.max(t.from, t.to)), h = Math.max(2, Math.abs(y(t.to) - y(t.from)));
      body += '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + hue(i) + '"><title>' + esc(t.s.label + ': ' + (fmt ? fmt(t.s.value, 'cents') : t.s.value)) + '</title></rect>';
      body += text(x + bw / 2, H - B + 14, t.s.label.replace(', month 1', ''), { anchor: 'middle', size: 10, fill: INK.muted });
      body += text(x + bw / 2, top - 4, short(t.s.value, 'cents', fmt), { anchor: 'middle', size: 10, fill: INK.text, tabular: true });
      if (i < tops.length - 1) body += '<line x1="' + (x + bw).toFixed(1) + '" x2="' + (x + pw / n).toFixed(1) + '" y1="' + y(t.to).toFixed(1) + '" y2="' + y(t.to).toFixed(1) + '" stroke="' + INK.axis + '" stroke-dasharray="3 3"/>';
    });
    var xt = L + (n - 0.5) * pw / n - bw / 2;
    body += '<rect x="' + xt.toFixed(1) + '" y="' + y(cum).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(2, ph - (y(cum) - T)).toFixed(1) + '" rx="3" fill="' + INK.axis + '"><title>' + esc('30-day cash: ' + (fmt ? fmt(cum, 'cents') : cum)) + '</title></rect>';
    body += text(xt + bw / 2, H - B + 14, 'Total', { anchor: 'middle', size: 10, fill: INK.muted }) + text(xt + bw / 2, y(cum) - 4, short(cum, 'cents', fmt), { anchor: 'middle', size: 10, fill: INK.text, weight: 600, tabular: true });
    [[spec.cac, '1x: break even', STATUS.watch], [spec.cac * 2, '2x: self-funding', STATUS.good]].forEach(function (ln) {
      body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(ln[0]).toFixed(1) + '" y2="' + y(ln[0]).toFixed(1) + '" stroke="' + ln[2] + '" stroke-width="1.5" stroke-dasharray="6 4"/>' + text(W - R, y(ln[0]) - 4, ln[1], { anchor: 'end', size: 10, fill: ln[2] });
    });
    body += text(L, H - 6, 'Gross profit per customer in the first 30 days, offer by offer.', { size: 10, fill: INK.faint });
    return svg(W, H, 'The 30-day cash, offer by offer', body);
  }

  /* ---- One bar in parts */
  function stack(spec, fmt) {
    var W = 560, H = 96, L = 8, R = 8, w = W - L - R, body = '', x = L, total = spec.parts.reduce(function (s, p) { return s + Math.abs(p.value); }, 0) || 1;
    spec.parts.forEach(function (p, i) {
      var bw = Math.abs(p.value) / total * w, fill = p.id === 'left' ? (p.value >= 0 ? STATUS.good : STATUS.out) : hue(i);
      body += '<rect x="' + x.toFixed(1) + '" y="20" width="' + Math.max(0, bw - 2).toFixed(1) + '" height="28" rx="3" fill="' + fill + '"><title>' + esc(p.label + ': ' + (fmt ? fmt(p.value, 'cents') : p.value)) + '</title></rect>';
      var lbl = p.label + ' ' + short(p.value, 'cents', fmt); if (bw > lbl.length * 6.5 + 12) body += text(x + 6, 38, lbl, { size: 10, fill: '#0A0C10', weight: 600 });
      x += bw;
    });
    body += text(L, 70, 'Collected from one customer in the first month: ' + (fmt ? fmt(spec.total, 'cents') : spec.total) + '. The table below has each part.', { size: 10, fill: INK.muted });
    return svg(W, H, 'Where a customer\'s first-month cash goes', body);
  }

  /* ---- Funnel: rows narrowing from 100 leads */
  function funnel(spec) {
    var W = 560, rowH = 34, H = spec.rows.length * rowH + 16, L = 170, w = W - L - 60, body = '', max = spec.rows[0].value || 1;
    spec.rows.forEach(function (r, i) {
      var y = 8 + i * rowH, bw = Math.max(2, r.value / max * w);
      body += text(L - 8, y + 20, r.label, { anchor: 'end', size: 11, fill: INK.text });
      body += '<rect x="' + L + '" y="' + (y + 6) + '" width="' + bw.toFixed(1) + '" height="20" rx="3" fill="' + hue(i) + '"><title>' + esc(r.label + ': ' + Math.round(r.value * 10) / 10 + ' of 100 leads') + '</title></rect>';
      body += text(L + bw + 6, y + 20, Math.round(r.value * 10) / 10 + '', { size: 11, fill: INK.text, tabular: true });
    });
    return svg(W, H, 'The sequence as a funnel, from 100 leads', body);
  }

  /* ---- One series over time, with an optional level line and a vertical mark */
  function line(spec, fmt) {
    var W = 560, H = 220, L = 56, R = 16, T = 14, B = 34, pw = W - L - R, ph = H - T - B, pts = spec.points, n = pts.length;
    var max = nice(Math.max.apply(null, pts.concat([typeof spec.line === 'number' ? spec.line : 0, 1]))), min = Math.min(0, Math.min.apply(null, pts));
    var y = function (v) { return T + ph - (v - min) / (max - min) * ph; }, x = function (i) { return L + i / (n - 1) * pw; }, body = '';
    for (var g = 0; g <= 4; g++) { var gv = min + (max - min) * g / 4; body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '" stroke="' + INK.grid + '"/>' + text(L - 6, y(gv) + 4, short(gv, spec.unit, fmt), { anchor: 'end', size: 10, fill: INK.faint, tabular: true }); }
    var d = pts.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    body += '<path d="' + d + '" fill="none" stroke="' + hue(0) + '" stroke-width="2" stroke-linejoin="round"/>';
    if (typeof spec.line === 'number') body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(spec.line).toFixed(1) + '" y2="' + y(spec.line).toFixed(1) + '" stroke="' + STATUS.watch + '" stroke-width="1.5" stroke-dasharray="6 4"/>' + text(W - R, y(spec.line) - 4, spec.lineLabel || '', { anchor: 'end', size: 10, fill: STATUS.watch });
    if (typeof spec.mark === 'number' && spec.mark < n) body += '<line x1="' + x(spec.mark).toFixed(1) + '" x2="' + x(spec.mark).toFixed(1) + '" y1="' + T + '" y2="' + (T + ph) + '" stroke="' + INK.axis + '" stroke-dasharray="3 3"/>' + text(x(spec.mark) + 4, T + 10, spec.markLabel || '', { size: 10, fill: INK.muted });
    var step = Math.max(1, Math.round((n - 1) / 6));
    for (var i = 0; i < n; i += step) body += text(x(i), H - B + 14, String(i), { anchor: 'middle', size: 10, fill: INK.faint, tabular: true });
    body += text(W - R, H - 6, spec.x || '', { anchor: 'end', size: 10, fill: INK.faint });
    pts.forEach(function (v, i) { body += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="6" fill="transparent"><title>' + esc((spec.x || '') + ' ' + i + ': ' + (fmt ? fmt(v, spec.unit) : v)) + '</title></circle>'; });
    return svg(W, H, spec.title || 'Over time', body);
  }

  /* ---- Two series and a cap */
  function lines(spec, fmt) {
    var W = 560, H = 240, L = 48, R = 16, T = 14, B = 50, pw = W - L - R, ph = H - T - B, n = spec.series[0].points.length;
    var all = []; spec.series.forEach(function (s) { all = all.concat(s.points); });
    var max = nice(Math.max.apply(null, all.concat([typeof spec.cap === 'number' ? spec.cap : 0, 1])));
    var y = function (v) { return T + ph - v / max * ph; }, x = function (i) { return L + i / (n - 1) * pw; }, body = '';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '" stroke="' + INK.grid + '"/>' + text(L - 6, y(gv) + 4, short(gv, spec.unit, fmt), { anchor: 'end', size: 10, fill: INK.faint, tabular: true }); }
    if (typeof spec.cap === 'number') body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(spec.cap).toFixed(1) + '" y2="' + y(spec.cap).toFixed(1) + '" stroke="' + INK.axis + '" stroke-dasharray="6 4"/>' + text(W - R, y(spec.cap) - 4, 'Capacity', { anchor: 'end', size: 10, fill: INK.muted });
    spec.series.forEach(function (s, si) {
      var d = s.points.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      body += '<path d="' + d + '" fill="none" stroke="' + hue(si) + '" stroke-width="2" stroke-linejoin="round"' + (si ? ' stroke-dasharray="5 4"' : '') + '/>';
      s.points.forEach(function (v, i) { body += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="6" fill="transparent"><title>' + esc(s.label + ', month ' + (i + 1) + ': ' + (fmt ? fmt(v, spec.unit) : v)) + '</title></circle>'; });
    });
    for (var i = 0; i < n; i += 1) body += text(x(i), H - B + 14, String(i + 1), { anchor: 'middle', size: 10, fill: INK.faint, tabular: true });
    spec.series.forEach(function (s, si) { body += '<rect x="' + (L + si * 190) + '" y="' + (H - 16) + '" width="14" height="4" rx="2" fill="' + hue(si) + '"/>' + text(L + si * 190 + 20, H - 11, s.label, { size: 10, fill: INK.muted }); });
    return svg(W, H, 'Customers per month, reinvesting against a flat budget', body);
  }

  /* ---- A few bars and a line */
  function bars(spec, fmt) {
    var W = 560, H = 200, L = 56, R = 16, T = 14, B = 34, pw = W - L - R, ph = H - T - B, n = spec.bars.length;
    var max = nice(Math.max.apply(null, spec.bars.map(function (b) { return b.value; }).concat([typeof spec.line === 'number' ? spec.line : 0, 1])));
    var y = function (v) { return T + ph - Math.max(0, v) / max * ph; }, bw = Math.min(90, pw / n - 24), body = '';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '" stroke="' + INK.grid + '"/>' + text(L - 6, y(gv) + 4, short(gv, spec.unit, fmt), { anchor: 'end', size: 10, fill: INK.faint, tabular: true }); }
    spec.bars.forEach(function (b, i) {
      var x = L + (i + 0.5) * pw / n - bw / 2;
      body += '<rect x="' + x.toFixed(1) + '" y="' + y(b.value).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(2, T + ph - y(b.value)).toFixed(1) + '" rx="3" fill="' + hue(i) + '"><title>' + esc(b.label + ': ' + (fmt ? fmt(b.value, spec.unit) : b.value)) + '</title></rect>';
      body += text(x + bw / 2, H - B + 14, b.label, { anchor: 'middle', size: 11, fill: INK.muted }) + text(x + bw / 2, y(b.value) - 4, short(b.value, spec.unit, fmt), { anchor: 'middle', size: 10, fill: INK.text, tabular: true });
    });
    if (typeof spec.line === 'number') body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(spec.line).toFixed(1) + '" y2="' + y(spec.line).toFixed(1) + '" stroke="' + STATUS.watch + '" stroke-width="1.5" stroke-dasharray="6 4"/>' + text(W - R, y(spec.line) - 4, spec.lineLabel || '', { anchor: 'end', size: 10, fill: STATUS.watch });
    return svg(W, H, spec.title || 'Compared', body);
  }

  /* ---- Radar: six axes, each as a share of its target (capped at 1) */
  function radar(spec, fmt) {
    var W = 560, H = 300, cx = 280, cy = 150, r = 100, n = spec.axes.length, body = '';
    function pt(i, f) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * f * Math.cos(a), cy + r * f * Math.sin(a)]; }
    [0.25, 0.5, 0.75, 1].forEach(function (f) { body += '<polygon points="' + spec.axes.map(function (a, i) { return pt(i, f).map(function (v) { return v.toFixed(1); }).join(','); }).join(' ') + '" fill="none" stroke="' + (f === 1 ? INK.axis : INK.grid) + '"/>'; });
    var poly = spec.axes.map(function (a, i) { var f = a.value === null ? 0 : Math.max(0, Math.min(1, a.value / a.target)); return pt(i, f); });
    body += '<polygon points="' + poly.map(function (p) { return p.map(function (v) { return v.toFixed(1); }).join(','); }).join(' ') + '" fill="' + hue(0) + '" fill-opacity="0.25" stroke="' + hue(0) + '" stroke-width="2"/>';
    spec.axes.forEach(function (a, i) {
      var p = pt(i, 1.28), q = poly[i];
      body += '<line x1="' + cx + '" y1="' + cy + '" x2="' + pt(i, 1)[0].toFixed(1) + '" y2="' + pt(i, 1)[1].toFixed(1) + '" stroke="' + INK.grid + '"/>';
      body += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="4" fill="' + hue(0) + '" stroke="' + INK.surface + '" stroke-width="2"><title>' + esc(a.label + ': ' + (a.value === null ? 'not yet' : fmt ? fmt(a.value, a.unit) : a.value) + ' (target ' + (fmt ? fmt(a.target, a.unit) : a.target) + ')') + '</title></circle>';
      var anchor = Math.abs(p[0] - cx) < 10 ? 'middle' : p[0] > cx ? 'start' : 'end';
      body += text(p[0], p[1] + 4, a.label, { anchor: anchor, size: 11, fill: INK.text }) + text(p[0], p[1] + 17, (a.value === null ? 'not yet' : (fmt ? fmt(a.value, a.unit) : a.value)) + ' of ' + (fmt ? fmt(a.target, a.unit) : a.target), { anchor: anchor, size: 10, fill: INK.faint, tabular: true });
    });
    return svg(W, H, 'The model\'s health, six ways', body);
  }

  /* ---- Meter: one figure against thresholds. bands: [{ to, label, status }] */
  function meter(value, bands, unit, fmt) {
    var W = 560, H = 58, L = 8, w = W - 16, max = bands[bands.length - 1].to, body = '', x = L;
    bands.forEach(function (b, i) { var from = i ? bands[i - 1].to : 0, bw = (b.to - from) / max * w; body += '<rect x="' + x.toFixed(1) + '" y="18" width="' + Math.max(0, bw - 2).toFixed(1) + '" height="12" rx="3" fill="' + STATUS[b.status] + '" fill-opacity="0.35"/>' + text(x + 2, 46, b.label, { size: 10, fill: INK.faint }); x += bw; });
    if (typeof value === 'number') { var vx = L + Math.min(1, Math.max(0, value / max)) * w; body += '<line x1="' + vx.toFixed(1) + '" x2="' + vx.toFixed(1) + '" y1="10" y2="36" stroke="' + INK.text + '" stroke-width="3" stroke-linecap="round"/>' + text(Math.min(W - 40, Math.max(L + 20, vx)), 9, fmt ? fmt(value, unit) : value, { anchor: 'middle', size: 11, fill: INK.text, weight: 600, tabular: true }); }
    return svg(W, H, 'Against the thresholds', body, 'mm-meter');
  }

  /* ---- The table twin of any chart */
  function table(spec, fmt) {
    var rows = [];
    if (spec.chart === 'waterfall') { rows = spec.steps.map(function (s) { return [s.label, fmt(s.value, 'cents')]; }); rows.push(['Cost of a customer', fmt(spec.cac, 'cents')]); }
    else if (spec.chart === 'stack') rows = spec.parts.map(function (p) { return [p.label, fmt(p.value, 'cents')]; });
    else if (spec.chart === 'funnel') rows = spec.rows.map(function (r) { return [r.label, String(Math.round(r.value * 10) / 10)]; });
    else if (spec.chart === 'line') { rows = spec.points.map(function (v, i) { return [(spec.x || '') + ' ' + i, fmt(v, spec.unit)]; }); if (typeof spec.line === 'number') rows.push([spec.lineLabel, fmt(spec.line, spec.unit)]); }
    else if (spec.chart === 'lines') rows = spec.series[0].points.map(function (v, i) { return ['Month ' + (i + 1), spec.series.map(function (s) { return fmt(s.points[i], spec.unit); }).join(' / ')]; });
    else if (spec.chart === 'bars') { rows = spec.bars.map(function (b) { return [b.label, fmt(b.value, spec.unit)]; }); if (typeof spec.line === 'number') rows.push([spec.lineLabel, fmt(spec.line, spec.unit)]); }
    else if (spec.chart === 'radar') rows = spec.axes.map(function (a) { return [a.label, (a.value === null ? 'not yet' : fmt(a.value, a.unit)) + ' (target ' + fmt(a.target, a.unit) + ')']; });
    return '<table class="mm-table"><tbody>' + rows.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function draw(spec, fmt) {
    if (!spec || !spec.chart) return '';
    return ({ waterfall: waterfall, stack: stack, funnel: funnel, line: line, lines: lines, bars: bars, radar: radar })[spec.chart](spec, fmt);
  }
  return { HUES: HUES, ORDER: ORDER, sky: sky, ring: ring, waterfall: waterfall, stack: stack, funnel: funnel, line: line, lines: lines, bars: bars, radar: radar, meter: meter, table: table, draw: draw };
});
