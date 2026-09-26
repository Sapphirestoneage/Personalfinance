/* ==========================================================================
   safeword/shared/charts.js, every picture on a Safeword screen. SF-010.
   --------------------------------------------------------------------------
   SVG from an engine's figures, nothing computed here. Five hues on the
   warm dark surface (#14100F), validated for colour-blind separation and
   contrast; a sixth series folds into "Other". Text is never a series
   colour; the mark beside it is. Every picture has a table twin.

     Charts.bars({ rows: [{ label, cents }], unit })          horizontal bars
     Charts.share({ rows: [{ label, cents }] })              one 100% bar
     Charts.meter({ value, target, label })                  progress
     Charts.line({ series: [{ label, points: [{ x, y }] }], target, unit, xLabel })
     Charts.table(rows, unit)                                the twin
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('./money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Charts = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var HUES = ['#e0637f', '#c98500', '#3987e5', '#199e70', '#9085e9'];
  var OTHER = '#8a8078';
  var INK = { text: 'var(--color-text)', muted: 'var(--color-text-muted)', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.2)', surface: 'var(--chart-surface, #14100F)' };
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v, unit) {
    if (!Money.isEntered(v)) return '';
    if (unit === 'pct') return Math.round(v * 100) + '%';
    if (unit === 'num') return String(Math.round(v * 10) / 10);
    var abs = Math.abs(v) / 100, s = abs >= 1e6 ? (abs / 1e6).toFixed(1) + 'M' : abs >= 1e4 ? Math.round(abs / 1000) + 'k' : String(Math.round(abs)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−' : '') + '$' + s;
  }
  function color(i) { return i < HUES.length ? HUES[i] : OTHER; }
  function fold(rows, max) {
    var list = rows.slice().sort(function (a, b) { return b.cents - a.cents; });
    if (list.length <= max) return list;
    var head = list.slice(0, max - 1), rest = list.slice(max - 1);
    head.push({ label: 'Other (' + rest.length + ')', cents: rest.reduce(function (a, r) { return a + r.cents; }, 0), other: true });
    return head;
  }
  function legend(rows) {
    return '<ul class="sw-legend">' + rows.map(function (r, i) { return '<li><span class="sw-swatch" style="background:' + (r.other ? OTHER : color(i)) + '"></span>' + esc(r.label) + '</li>'; }).join('') + '</ul>';
  }
  function table(rows, unit) {
    return '<details class="sw-fold sw-fold--table"><summary>As a table</summary><table class="sw-table"><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r.label) + '</td><td>' + fmt(r.cents, unit) + (Money.isEntered(r.share) ? ' (' + Math.round(r.share * 100) + '%)' : '') + '</td></tr>'; }).join('') + '</tbody></table></details>';
  }

  function bars(spec) {
    var rows = (spec.rows || []).filter(function (r) { return Money.isEntered(r.cents); });
    if (!rows.length) return '<p class="sw-empty">Nothing to draw yet.</p>';
    var W = 560, rowH = 30, labelW = 170, pad = 8, H = rows.length * rowH + pad * 2;
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.cents); })) || 1;
    var barW = W - labelW - 70;
    var out = '<svg class="sw-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title || 'Bars') + '">';
    rows.forEach(function (r, i) {
      var y = pad + i * rowH, w = Math.max(2, Math.abs(r.cents) / max * barW), c = r.color || (spec.mono ? HUES[spec.hue || 0] : color(i));
      out += '<text x="' + (labelW - 8) + '" y="' + (y + 19) + '" text-anchor="end" fill="' + INK.text + '" font-size="13">' + esc(r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label) + '</text>';
      out += '<rect x="' + labelW + '" y="' + (y + 5) + '" width="' + w.toFixed(1) + '" height="18" rx="4" fill="' + c + '" stroke="' + INK.surface + '" stroke-width="2"><title>' + esc(r.label) + ': ' + fmt(r.cents, spec.unit) + '</title></rect>';
      out += '<text x="' + (labelW + w + 8).toFixed(1) + '" y="' + (y + 19) + '" fill="' + INK.muted + '" font-size="12">' + fmt(r.cents, spec.unit) + (Money.isEntered(r.share) ? ' · ' + Math.round(r.share * 100) + '%' : '') + '</text>';
    });
    out += '</svg>';
    return '<figure class="sw-figure">' + out + table(rows, spec.unit) + '</figure>';
  }

  function share(spec) {
    var rows = fold((spec.rows || []).filter(function (r) { return Money.isEntered(r.cents) && r.cents > 0; }), 6);
    var total = rows.reduce(function (a, r) { return a + r.cents; }, 0);
    if (!rows.length || total <= 0) return '<p class="sw-empty">Nothing to draw yet.</p>';
    var W = 560, H = 34, x = 0, out = '<svg class="sw-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title || 'Shares') + '">';
    rows.forEach(function (r, i) {
      var w = r.cents / total * W;
      out += '<rect x="' + x.toFixed(1) + '" y="4" width="' + w.toFixed(1) + '" height="26" rx="4" fill="' + (r.other ? OTHER : color(i)) + '" stroke="' + INK.surface + '" stroke-width="2"><title>' + esc(r.label) + ': ' + fmt(r.cents, spec.unit) + ' (' + Math.round(r.cents / total * 100) + '%)</title></rect>';
      if (w > 48) out += '<text x="' + (x + w / 2).toFixed(1) + '" y="21" text-anchor="middle" fill="#fff" font-size="12" font-weight="600">' + Math.round(r.cents / total * 100) + '%</text>';
      x += w;
    });
    out += '</svg>';
    rows.forEach(function (r) { r.share = r.cents / total; });
    return '<figure class="sw-figure">' + out + legend(rows) + table(rows, spec.unit) + '</figure>';
  }

  function meter(spec) {
    if (!Money.isEntered(spec.value) || !Money.isEntered(spec.target) || spec.target <= 0) return '<p class="sw-empty">Nothing to draw yet.</p>';
    var p = Math.max(0, Math.min(1, spec.value / spec.target)), W = 560, H = 30;
    var out = '<svg class="sw-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.label || 'Progress') + ': ' + Math.round(p * 100) + '%">';
    out += '<rect x="0" y="6" width="' + W + '" height="18" rx="4" fill="' + INK.grid + '"/>';
    out += '<rect x="0" y="6" width="' + Math.max(4, p * W).toFixed(1) + '" height="18" rx="4" fill="' + (spec.hue || HUES[3]) + '"><title>' + fmt(spec.value) + ' of ' + fmt(spec.target) + '</title></rect>';
    out += '<text x="' + (p * W > 60 ? (p * W - 8).toFixed(1) : (p * W + 8).toFixed(1)) + '" y="19" text-anchor="' + (p * W > 60 ? 'end' : 'start') + '" fill="' + (p * W > 60 ? '#fff' : INK.text) + '" font-size="12" font-weight="600">' + Math.round(p * 100) + '%</text>';
    out += '</svg>';
    return '<figure class="sw-figure">' + out + '<p class="sw-caption">' + fmt(spec.value) + ' of ' + fmt(spec.target) + '</p></figure>';
  }

  function line(spec) {
    var series = (spec.series || []).filter(function (s) { return s.points && s.points.length > 1; });
    if (!series.length) return '<p class="sw-empty">Nothing to draw yet.</p>';
    var W = 560, H = 240, L = 62, R = 16, Tp = 14, B = 34, pw = W - L - R, ph = H - Tp - B;
    var xs = [], ys = [];
    series.forEach(function (s) { s.points.forEach(function (p) { xs.push(p.x); ys.push(p.y); }); });
    if (Money.isEntered(spec.target)) ys.push(spec.target);
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min(0, Math.min.apply(null, ys)), y1 = Math.max.apply(null, ys) || 1;
    var X = function (x) { return L + (x - x0) / ((x1 - x0) || 1) * pw; }, Y = function (y) { return Tp + ph - (y - y0) / ((y1 - y0) || 1) * ph; };
    var out = '<svg class="sw-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title || 'Over time') + '">';
    for (var g = 0; g <= 4; g++) { var yv = y0 + (y1 - y0) * g / 4, yy = Y(yv); out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="' + INK.grid + '"/><text x="' + (L - 6) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" fill="' + INK.muted + '" font-size="11">' + fmt(yv, spec.unit) + '</text>'; }
    for (var t = 0; t <= 4; t++) { var xv = x0 + (x1 - x0) * t / 4; out += '<text x="' + X(xv).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" fill="' + INK.muted + '" font-size="11">' + (spec.xLabel ? spec.xLabel(xv) : Math.round(xv)) + '</text>'; }
    if (Money.isEntered(spec.target)) out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(spec.target).toFixed(1) + '" y2="' + Y(spec.target).toFixed(1) + '" stroke="' + INK.axis + '" stroke-dasharray="4 4"/><text x="' + (W - R) + '" y="' + (Y(spec.target) - 5).toFixed(1) + '" text-anchor="end" fill="' + INK.muted + '" font-size="11">' + esc(spec.targetLabel || 'target') + '</text>';
    series.forEach(function (s, i) {
      var d = s.points.map(function (p, j) { return (j ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
      out += '<path d="' + d + '" fill="none" stroke="' + color(i) + '" stroke-width="2" stroke-linejoin="round"/>';
      var last = s.points[s.points.length - 1];
      out += '<circle cx="' + X(last.x).toFixed(1) + '" cy="' + Y(last.y).toFixed(1) + '" r="4" fill="' + color(i) + '" stroke="' + INK.surface + '" stroke-width="2"><title>' + esc(s.label) + ': ' + fmt(last.y, spec.unit) + '</title></circle>';
      s.points.forEach(function (p) { out += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="7" fill="transparent"><title>' + esc(s.label) + ', ' + (spec.xLabel ? spec.xLabel(p.x) : p.x) + ': ' + fmt(p.y, spec.unit) + '</title></circle>'; });
    });
    out += '</svg>';
    var rows = series.map(function (s) { return { label: s.label, cents: s.points[s.points.length - 1].y }; });
    return '<figure class="sw-figure">' + out + (series.length > 1 ? legend(series) : '') + table(series[0].points.map(function (p) { return { label: (spec.xLabel ? spec.xLabel(p.x) : String(p.x)), cents: p.y }; }), spec.unit) + '</figure>';
  }
  return { HUES: HUES, bars: bars, share: share, meter: meter, line: line, table: table, fmt: fmt };
});
