/* ==========================================================================
   binders/shared/charts.js, every picture the Binders draw. PB-001.
   --------------------------------------------------------------------------
   A chart spec in (from engines/reads.js), an SVG string and its table
   twin out. Nothing is computed here beyond scales and ticks.

   Types: bars, funnel, meter, line, stackbars, grid4, progress, multiples.
   Colours: the four system hues (blue, aqua, orange, violet) were run
   through the colour-vision validator against this app's dark surface
   (#12151B) on 26 Sept 2026 and pass every check. Status (good, watch,
   needs care) uses the app's own tokens with a word beside it, never a
   series hue. Text wears the text tokens, never a series colour.

     Charts.render(spec, opts) -> { svg, table }   opts: { hue, width }
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.BINDERS = root.BINDERS || {}; root.BINDERS.Charts = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var HUES = { blue: '#3987e5', aqua: '#199e70', orange: '#d95926', violet: '#9085e9' };
  var ORDER = ['blue', 'aqua', 'orange', 'violet'];
  var STATUS = { good: 'var(--color-positive)', watch: 'var(--color-caution)', out: 'var(--color-critical-text)', none: 'var(--color-border-strong)' };
  var INK = { text: 'var(--color-text)', muted: 'var(--color-text-muted)', faint: 'var(--color-text-faint)', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.18)', surface: 'var(--color-panel, #12151B)' };
  var FONT = 'font-family="var(--font-body, system-ui, sans-serif)"';

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmt(v, unit, short) {
    if (v === null || v === undefined || !isFinite(v)) return 'not yet';
    if (unit === 'money') {
      var d = Math.abs(v) / 100, s;
      if (short && d >= 1000000) s = (d / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      else if (short && d >= 10000) s = Math.round(d / 1000) + 'k';
      else s = Math.round(d).toLocaleString('en-US');
      return (v < 0 ? '-$' : '$') + s;
    }
    if (unit === 'pct') return (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '%';
    if (unit === 'min') return Math.round(v) + ' min';
    if (unit === 'hours') return (Math.round(v * 10) / 10) + ' h';
    if (unit === 'ratio') return (Math.round(v * 10) / 10) + 'x';
    if (unit === 'months') return (Math.round(v * 10) / 10) + ' mo';
    return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-US');
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return n * p;
  }
  function ticks(max, n) { var out = []; for (var i = 0; i <= n; i++) out.push(max * i / n); return out; }
  function text(x, y, s, opts) {
    opts = opts || {};
    return '<text x="' + x + '" y="' + y + '" ' + FONT + ' font-size="' + (opts.size || 11) + '" fill="' + (opts.fill || INK.muted) + '"' + (opts.anchor ? ' text-anchor="' + opts.anchor + '"' : '') + (opts.weight ? ' font-weight="' + opts.weight + '"' : '') + (opts.baseline ? ' dominant-baseline="' + opts.baseline + '"' : '') + '>' + esc(s) + '</text>';
  }
  function open(w, h, title) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + esc(title || '') + '" style="max-width:' + w + 'px;display:block">'; }

  /* ---- bars: one series, horizontal, direct labels ------------------------- */
  function bars(spec, hue, W) {
    var items = spec.items || [], n = items.length;
    var rowH = 30, left = 150, right = 72, top = 8, H = top + n * rowH + 8;
    var max = niceMax(Math.max.apply(null, items.map(function (i) { return Math.abs(i.value || 0); }).concat([0])));
    var plotW = W - left - right;
    var s = open(W, H, spec.title);
    items.forEach(function (it, i) {
      var y = top + i * rowH;
      var w = Math.max(0, Math.round((it.value || 0) / max * plotW));
      var fill = it.status ? STATUS[it.status] : HUES[hue];
      s += text(left - 10, y + rowH / 2, it.label, { anchor: 'end', baseline: 'middle', fill: INK.text });
      s += '<rect x="' + left + '" y="' + (y + 7) + '" width="' + w + '" height="' + (rowH - 14) + '" rx="4" fill="' + fill + '"><title>' + esc(it.label + ': ' + fmt(it.value, spec.unit) + (it.note ? ' (' + it.note + ')' : '')) + '</title></rect>';
      s += text(left + w + 8, y + rowH / 2, fmt(it.value, spec.unit, true), { baseline: 'middle', fill: INK.text, weight: 600 });
    });
    s += '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (H - 8) + '" stroke="' + INK.axis + '"/>';
    return s + '</svg>';
  }
  /* ---- progress: value against a target ---------------------------------- */
  function progress(spec, hue, W) {
    var items = spec.items || [], rowH = 30, left = 150, right = 80, top = 8, H = top + items.length * rowH + 8, plotW = W - left - right;
    var s = open(W, H, spec.title);
    items.forEach(function (it, i) {
      var y = top + i * rowH, w = Math.min(plotW, Math.round((it.value || 0) / (it.target || 1) * plotW));
      s += text(left - 10, y + rowH / 2, it.label, { anchor: 'end', baseline: 'middle', fill: INK.text });
      s += '<rect x="' + left + '" y="' + (y + 7) + '" width="' + plotW + '" height="' + (rowH - 14) + '" rx="4" fill="' + INK.grid + '"/>';
      s += '<rect x="' + left + '" y="' + (y + 7) + '" width="' + w + '" height="' + (rowH - 14) + '" rx="4" fill="' + HUES[hue] + '"><title>' + esc(it.label + ': ' + it.value + ' of ' + it.target) + '</title></rect>';
      s += text(left + plotW + 8, y + rowH / 2, it.value + ' of ' + it.target, { baseline: 'middle', fill: INK.text, weight: 600 });
    });
    return s + '</svg>';
  }
  /* ---- funnel: steps shrinking, the rate between them written ------------- */
  function funnel(spec, hue, W) {
    var steps = spec.steps || [], rowH = 34, left = 110, right = 120, top = 6, H = top + steps.length * rowH + 6, plotW = W - left - right;
    var max = Math.max.apply(null, steps.map(function (x) { return x.value || 0; }).concat([1]));
    var s = open(W, H, spec.title);
    steps.forEach(function (st, i) {
      var y = top + i * rowH, w = Math.max(2, Math.round((st.value || 0) / max * plotW)), x = left + Math.round((plotW - w) / 2);
      var rate = i > 0 && steps[i - 1].value ? Math.round(st.value / steps[i - 1].value * 100) : null;
      s += text(left - 10, y + rowH / 2, st.label, { anchor: 'end', baseline: 'middle', fill: INK.text });
      s += '<rect x="' + x + '" y="' + (y + 6) + '" width="' + w + '" height="' + (rowH - 12) + '" rx="4" fill="' + HUES[hue] + '" opacity="' + (1 - i * 0.12) + '"><title>' + esc(st.label + ': ' + fmt(st.value, spec.unit)) + '</title></rect>';
      s += text(left + plotW + 10, y + rowH / 2, fmt(st.value, spec.unit, true) + (rate !== null ? '  (' + rate + '% of the step above)' : ''), { baseline: 'middle', fill: INK.text, weight: 600, size: 11 });
    });
    return s + '</svg>';
  }
  /* ---- meter: one figure against bands, a word beside the colour --------- */
  function meter(spec, hue, W) {
    var H = 64, left = 12, right = 12, plotW = W - left - right, y = 20, h = 16;
    var min = spec.min || 0, max = spec.max || 100, range = max - min || 1;
    var s = open(W, H, spec.title);
    var prev = min;
    (spec.bands || []).forEach(function (b) {
      var x0 = left + (prev - min) / range * plotW, x1 = left + (Math.min(b.to, max) - min) / range * plotW;
      s += '<rect x="' + x0 + '" y="' + y + '" width="' + Math.max(0, x1 - x0 - 2) + '" height="' + h + '" rx="3" fill="' + STATUS[b.status || 'none'] + '" opacity="0.28"/>';
      prev = b.to;
    });
    var v = Math.max(min, Math.min(max, spec.value)), vx = left + (v - min) / range * plotW;
    s += '<rect x="' + (vx - 3) + '" y="' + (y - 5) + '" width="6" height="' + (h + 10) + '" rx="2" fill="' + INK.text + '"><title>' + esc(spec.title + ': ' + fmt(spec.value, spec.unit)) + '</title></rect>';
    if (spec.marker !== undefined && spec.marker !== null) {
      var mx = left + (spec.marker - min) / range * plotW;
      s += '<line x1="' + mx + '" y1="' + (y - 8) + '" x2="' + mx + '" y2="' + (y + h + 8) + '" stroke="' + INK.muted + '" stroke-dasharray="3 3"/>';
      s += text(mx, y + h + 22, fmt(spec.marker, spec.unit) + ' rule of thumb', { anchor: 'middle', size: 10, fill: INK.faint });
    }
    var zone = 'none';
    (spec.bands || []).some(function (b) { if (v <= b.to) { zone = b.status; return true; } return false; });
    var word = { good: 'good', watch: 'watch', out: 'needs care', none: '' }[zone] || '';
    s += text(left, 12, fmt(min, spec.unit), { size: 10, fill: INK.faint });
    s += text(left + plotW, 12, fmt(max, spec.unit), { size: 10, fill: INK.faint, anchor: 'end' });
    s += text(left + plotW / 2, 12, fmt(spec.value, spec.unit) + (word ? ', ' + word : ''), { size: 12, fill: INK.text, anchor: 'middle', weight: 600 });
    return s + '</svg>';
  }
  /* ---- line: values over an ordered x, up to four series, a legend -------- */
  function line(spec, hue, W, opts) {
    opts = opts || {};
    var H = opts.small ? 150 : 210, left = 58, right = 14, top = 16, bottom = 34, plotW = W - left - right, plotH = H - top - bottom;
    var x = spec.x || [], series = spec.series || [];
    var all = [];
    series.forEach(function (sr) { sr.values.forEach(function (v) { if (v !== null && isFinite(v)) all.push(v); }); });
    var max = niceMax(Math.max.apply(null, all.concat([0]))), min = 0;
    var s = open(W, H, spec.title);
    ticks(max, 4).forEach(function (t) {
      var y = top + plotH - (t - min) / (max - min || 1) * plotH;
      s += '<line x1="' + left + '" y1="' + y + '" x2="' + (left + plotW) + '" y2="' + y + '" stroke="' + INK.grid + '"/>';
      s += text(left - 8, y, fmt(t, spec.unit, true), { anchor: 'end', baseline: 'middle', size: 10, fill: INK.faint });
    });
    var stepX = x.length > 1 ? plotW / (x.length - 1) : 0;
    var every = Math.max(1, Math.ceil(x.length / 8));
    x.forEach(function (lab, i) { if (i % every === 0 || i === x.length - 1) s += text(left + i * stepX, H - bottom + 16, lab, { anchor: 'middle', size: 10, fill: INK.faint }); });
    if (spec.xLabel) s += text(left + plotW / 2, H - 4, spec.xLabel, { anchor: 'middle', size: 10, fill: INK.faint });
    if (spec.marker !== undefined && spec.marker !== null) {
      var mi = x.indexOf(String(spec.marker));
      if (mi >= 0) s += '<line x1="' + (left + mi * stepX) + '" y1="' + top + '" x2="' + (left + mi * stepX) + '" y2="' + (top + plotH) + '" stroke="' + INK.muted + '" stroke-dasharray="3 3"/>';
    }
    series.forEach(function (sr, si) {
      var color = HUES[si === 0 ? hue : ORDER[(ORDER.indexOf(hue) + si) % ORDER.length]];
      var d = '', last = null;
      sr.values.forEach(function (v, i) {
        if (v === null || !isFinite(v)) { last = null; return; }
        var px = left + i * stepX, py = top + plotH - (v - min) / (max - min || 1) * plotH;
        d += (last === null ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
        last = v;
      });
      s += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      sr.values.forEach(function (v, i) {
        if (v === null || !isFinite(v)) return;
        var px = left + i * stepX, py = top + plotH - (v - min) / (max - min || 1) * plotH;
        s += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4" fill="' + color + '" stroke="' + INK.surface + '" stroke-width="2"><title>' + esc(sr.label + ', ' + x[i] + ': ' + fmt(v, spec.unit)) + '</title></circle>';
      });
      var lastIdx = -1; sr.values.forEach(function (v, i) { if (v !== null && isFinite(v)) lastIdx = i; });
      if (lastIdx >= 0) s += text(left + lastIdx * stepX - 4, top + plotH - (sr.values[lastIdx] - min) / (max - min || 1) * plotH - 8, fmt(sr.values[lastIdx], spec.unit, true), { anchor: 'end', size: 10, fill: INK.text, weight: 600 });
    });
    s += '<line x1="' + left + '" y1="' + (top + plotH) + '" x2="' + (left + plotW) + '" y2="' + (top + plotH) + '" stroke="' + INK.axis + '"/>';
    s += '</svg>';
    var legend = '';
    if (series.length > 1) {
      legend = '<ul class="chart-legend">' + series.map(function (sr, si) {
        var color = HUES[si === 0 ? hue : ORDER[(ORDER.indexOf(hue) + si) % ORDER.length]];
        return '<li><span class="chart-swatch" style="background:' + color + '"></span>' + esc(sr.label) + '</li>';
      }).join('') + '</ul>';
    }
    return s + legend;
  }
  /* ---- stackbars: a few bars each made of segments ------------------------- */
  function stackbars(spec, hue, W) {
    var bs = spec.bars || [], rowH = 40, left = 130, right = 80, top = 8, H = top + bs.length * rowH + 30, plotW = W - left - right;
    var totals = bs.map(function (b) { return b.segments.reduce(function (a, g) { return a + (g.value || 0); }, 0); });
    var max = niceMax(Math.max.apply(null, totals.concat([0])));
    var s = open(W, H, spec.title), legend = {};
    bs.forEach(function (b, i) {
      var y = top + i * rowH, x = left;
      s += text(left - 10, y + rowH / 2, b.label, { anchor: 'end', baseline: 'middle', fill: INK.text });
      b.segments.forEach(function (g, gi) {
        var w = Math.max(0, Math.round((g.value || 0) / max * plotW) - 2);
        var color = HUES[ORDER[(ORDER.indexOf(hue) + gi) % ORDER.length]];
        legend[g.label] = color;
        s += '<rect x="' + x + '" y="' + (y + 9) + '" width="' + w + '" height="' + (rowH - 18) + '" rx="3" fill="' + color + '"><title>' + esc(g.label + ': ' + fmt(g.value, spec.unit)) + '</title></rect>';
        x += w + 2;
      });
      s += text(x + 6, y + rowH / 2, fmt(totals[i], spec.unit, true), { baseline: 'middle', fill: INK.text, weight: 600 });
    });
    s += '</svg>';
    var leg = '<ul class="chart-legend">' + Object.keys(legend).map(function (k) { return '<li><span class="chart-swatch" style="background:' + legend[k] + '"></span>' + esc(k) + '</li>'; }).join('') + '</ul>';
    return s + leg;
  }
  /* ---- grid4: the four ways, as four tiles with a bar each ----------------- */
  function grid4(spec, hue) {
    var cells = spec.cells || [];
    var max = Math.max.apply(null, cells.filter(function (c) { return c.unit !== 'money'; }).map(function (c) { return c.value || 0; }).concat([1]));
    return '<div class="grid4" role="img" aria-label="' + esc(spec.title) + '">' + cells.map(function (c) {
      var w = c.unit === 'money' || c.value === null ? 0 : Math.round((c.value || 0) / max * 100);
      return '<div class="grid4-cell"><span class="grid4-label">' + esc(c.label) + '</span><span class="grid4-value">' + esc(fmt(c.value, c.unit, true)) + '</span><span class="grid4-sub">' + esc(c.sub || '') + '</span><span class="grid4-bar"><span style="width:' + w + '%;background:' + HUES[hue] + '"></span></span></div>';
    }).join('') + '</div>';
  }

  function table(spec) {
    var rows = [], head = ['', ''];
    if (spec.type === 'bars' || spec.type === 'progress') { head = ['Item', 'Value']; (spec.items || []).forEach(function (i) { rows.push([i.label, spec.type === 'progress' ? i.value + ' of ' + i.target : fmt(i.value, spec.unit)]); }); }
    else if (spec.type === 'funnel') { head = ['Step', 'Count']; (spec.steps || []).forEach(function (i) { rows.push([i.label, fmt(i.value, spec.unit)]); }); }
    else if (spec.type === 'meter') { head = ['Figure', 'Value']; rows.push([spec.title, fmt(spec.value, spec.unit)]); }
    else if (spec.type === 'line') { head = [spec.xLabel || 'x'].concat((spec.series || []).map(function (s) { return s.label; })); (spec.x || []).forEach(function (lab, i) { rows.push([lab].concat((spec.series || []).map(function (s) { return fmt(s.values[i], spec.unit); }))); }); }
    else if (spec.type === 'stackbars') { head = ['Bar', 'Part', 'Value']; (spec.bars || []).forEach(function (b) { b.segments.forEach(function (g) { rows.push([b.label, g.label, fmt(g.value, spec.unit)]); }); }); }
    else if (spec.type === 'grid4') { head = ['Way', 'Per week']; (spec.cells || []).forEach(function (c) { rows.push([c.label, fmt(c.value, c.unit)]); }); }
    else if (spec.type === 'multiples') { return (spec.charts || []).map(table).join(''); }
    return '<table class="chart-table"><caption>' + esc(spec.title || '') + '</caption><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  function render(spec, opts) {
    opts = opts || {};
    var hue = HUES[opts.hue] ? opts.hue : 'blue', W = opts.width || 560;
    var svg = '';
    switch (spec.type) {
      case 'bars': svg = bars(spec, hue, W); break;
      case 'progress': svg = progress(spec, hue, W); break;
      case 'funnel': svg = funnel(spec, hue, W); break;
      case 'meter': svg = meter(spec, hue, W); break;
      case 'line': svg = line(spec, hue, W, opts); break;
      case 'stackbars': svg = stackbars(spec, hue, W); break;
      case 'grid4': svg = grid4(spec, hue); break;
      case 'multiples': svg = '<div class="multiples">' + (spec.charts || []).map(function (c) { return '<figure><figcaption>' + esc(c.title) + '</figcaption>' + line(c, hue, 270, { small: true }) + '</figure>'; }).join('') + '</div>'; break;
      default: svg = '';
    }
    return { svg: svg, table: table(spec) };
  }
  return { HUES: HUES, ORDER: ORDER, STATUS: STATUS, render: render, table: table, fmt: fmt, niceMax: niceMax };
});
