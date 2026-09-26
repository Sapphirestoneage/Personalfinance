/* ==========================================================================
   offers/shared/charts.js, every picture the Offer Builder draws. OD-001.
   --------------------------------------------------------------------------
   A spec from engines/offer.js in, an SVG string out. Nothing is computed
   here beyond scales; the figures come from the engine.

   KINDS
     bars         a few figures side by side (horizontal, direct labels)
     scale        one position on a short ordered scale
     ladder       price against specificity, rung by rung (columns)
     loop         the two price cycles, the one you ride lit
     curve        clients needed against price (a line with markers)
     equation     the value equation: two tiles over two, and the score
     beforeAfter  the four parts rated twice, side by side
     timeline     the first win and the full result on one line
     stack        pieces of the offer on one bar, the price as a mark
     matrix       the trim and stack grid: value against cost
     tiles        the four enhancers, lit or dark
     count        one hero number
     steps        the client's path as numbered stops
     sky          six planets on four orbits, the offer at the centre

   COLOUR. Series hues are the eight coach hues, validated against this
   surface (#12151B) for colour vision and contrast; text is never coloured
   by a series, the mark beside it is. Status uses the theme tokens.
     Charts.render(spec, opts) -> svg string     Charts.table(spec) -> html
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('./money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.OFFERS = root.OFFERS || {}; root.OFFERS.Charts = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var HUE = ['#3987e5', '#d95926', '#199e70', '#9085e9', '#c98500', '#d55181', '#008300', '#e66767'];
  var INK = { text: 'var(--color-text)', muted: 'var(--color-text-muted)', faint: 'var(--color-text-faint)', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.18)', surface: 'var(--color-panel, #12151B)', accent: 'var(--color-accent)', good: 'var(--color-positive)', warn: 'var(--color-caution)' };
  var FONT = 'font-family="var(--font-body, system-ui, sans-serif)"';

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v, unit) {
    if (v === null || v === undefined) return Money.NOT_YET;
    if (unit === 'cents') return Money.formatCents(v);
    if (unit === 'pct') return Money.formatRate(v, { decimals: 0 });
    if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : (Math.round(v * 10) / 10).toString();
    return String(v);
  }
  function svgOpen(w, h, label) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + esc(label) + '" ' + FONT + ' style="display:block;max-width:' + w + 'px">';
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" fill="' + (o.fill || INK.muted) + '" font-size="' + (o.size || 12) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.weight ? ' font-weight="' + o.weight + '"' : '') + (o.mono ? ' font-variant-numeric="tabular-nums"' : '') + '>' + esc(s) + '</text>';
  }
  function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function tip(s) { return '<title>' + esc(s) + '</title>'; }

  /* ---- bars: horizontal, one hue, a direct label at the end ---------------- */
  function bars(spec) {
    var items = spec.items || [], W = 520, rowH = 30, left = 150, right = 90, H = items.length * rowH + 12;
    var max = spec.max || Math.max.apply(null, items.map(function (i) { return i.value || 0; }).concat([1]));
    var plotW = W - left - right;
    var s = svgOpen(W, H, spec.label || 'Bars');
    items.forEach(function (it, i) {
      var y = i * rowH + 6, w = Math.max(0, (it.value || 0) / max * plotW);
      s += text(left - 10, y + 15, trunc(it.label, 22), { anchor: 'end', fill: INK.text });
      s += '<rect x="' + left + '" y="' + y + '" width="' + plotW + '" height="20" fill="' + INK.grid + '" rx="4"/>';
      s += '<g>' + tip(it.label + ': ' + fmt(it.value, spec.unit)) + '<rect x="' + left + '" y="' + y + '" width="' + w.toFixed(1) + '" height="20" fill="' + (it.color || HUE[0]) + '" rx="4"/></g>';
      s += text(left + w + 8, y + 15, fmt(it.value, spec.unit) + (spec.max && spec.unit === 'n' ? ' of ' + spec.max : ''), { fill: INK.text, mono: true });
    });
    return s + '</svg>';
  }

  /* ---- scale: one dot on a short ordered scale ----------------------------- */
  function scale(spec) {
    var steps = spec.steps || [], W = 520, H = 64, left = 30, right = 30, n = steps.length;
    var s = svgOpen(W, H, 'Where you sit');
    var gap = (W - left - right) / Math.max(1, n - 1);
    s += '<line x1="' + left + '" y1="24" x2="' + (W - right) + '" y2="24" stroke="' + INK.axis + '" stroke-width="2"/>';
    steps.forEach(function (st, i) {
      var x = left + i * gap, on = i === spec.at;
      s += '<circle cx="' + x + '" cy="24" r="' + (on ? 9 : 5) + '" fill="' + (on ? HUE[0] : INK.surface) + '" stroke="' + (on ? HUE[0] : INK.axis) + '" stroke-width="2">' + tip(st) + '</circle>';
      s += text(x, 52, st, { anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', fill: on ? INK.text : INK.faint, weight: on ? 600 : 400, size: 11 });
    });
    return s + '</svg>';
  }

  /* ---- ladder: columns rising with specificity ----------------------------- */
  function ladder(spec) {
    var rows = spec.rows || [], W = 520, H = 220, left = 70, bottom = 60, top = 20, n = rows.length;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var plotH = H - bottom - top, colW = Math.min(90, (W - left - 20) / n - 12);
    var s = svgOpen(W, H, 'The niche ladder');
    [0, 0.5, 1].forEach(function (f) { var y = top + plotH - f * plotH; s += '<line x1="' + left + '" y1="' + y + '" x2="' + (W - 10) + '" y2="' + y + '" stroke="' + INK.grid + '"/>'; s += text(left - 8, y + 4, fmt(Math.round(max * f), 'cents'), { anchor: 'end', size: 10, fill: INK.faint, mono: true }); });
    rows.forEach(function (r, i) {
      var x = left + 10 + i * ((W - left - 20) / n), h = r.value / max * plotH, y = top + plotH - h;
      s += '<g>' + tip('Rung ' + r.n + ', ' + r.label + ': ' + fmt(r.value, 'cents')) + '<rect x="' + x + '" y="' + y + '" width="' + colW + '" height="' + Math.max(0, h) + '" fill="' + HUE[0] + '" rx="4"/></g>';
      s += text(x + colW / 2, y - 6, fmt(r.value, 'cents'), { anchor: 'middle', fill: INK.text, size: 11, mono: true });
      s += text(x + colW / 2, H - bottom + 18, 'Rung ' + r.n, { anchor: 'middle', size: 11, fill: INK.text });
      s += text(x + colW / 2, H - bottom + 34, trunc(r.label, Math.max(8, Math.floor(colW / 5.5))), { anchor: 'middle', size: 10, fill: INK.faint });
    });
    s += text(left, H - 6, 'Broad on the left, narrow on the right', { size: 10, fill: INK.faint });
    return s + '</svg>';
  }

  /* ---- loop: the two cycles ----------------------------------------------- */
  function loop(spec) {
    var W = 520, H = 230;
    var s = svgOpen(W, H, 'The two price cycles');
    function ring(cx, label, nodes, lit, hue, count) {
      var r = 64, cy = 110;
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (lit ? hue : INK.grid) + '" stroke-width="' + (lit ? 3 : 2) + '"' + (lit ? '' : ' stroke-dasharray="4 4"') + '/>';
      nodes.forEach(function (nd, i) {
        var ang = -Math.PI / 2 + i * (2 * Math.PI / nodes.length), x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
        s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="' + (lit ? hue : INK.surface) + '" stroke="' + (lit ? hue : INK.axis) + '" stroke-width="2"/>';
        var lx = cx + (r + 16) * Math.cos(ang), ly = cy + (r + 16) * Math.sin(ang);
        s += text(lx.toFixed(1), (ly + 4).toFixed(1), nd, { anchor: Math.cos(ang) > 0.3 ? 'start' : Math.cos(ang) < -0.3 ? 'end' : 'middle', size: 10, fill: lit ? INK.text : INK.faint });
      });
      s += text(cx, 214, label + ': ' + count + ' of 6 signs', { anchor: 'middle', size: 12, fill: lit ? INK.text : INK.faint, weight: lit ? 600 : 400 });
    }
    var downLit = spec.which === 'down' || spec.which === 'mixed', upLit = spec.which === 'up' || spec.which === 'mixed';
    ring(135, 'Downward', ['Lower price', 'Less margin', 'Less service', 'Worse results', 'Less proof', 'Lower still'], downLit, HUE[1], spec.down || 0);
    ring(385, 'Upward', ['Higher price', 'More margin', 'More service', 'Better results', 'More proof', 'Higher still'], upLit, HUE[2], spec.up || 0);
    return s + '</svg>';
  }

  /* ---- curve: clients needed against price --------------------------------- */
  function curve(spec) {
    var pts = spec.points || [], W = 520, H = 220, left = 60, right = 20, top = 20, bottom = 46;
    if (!pts.length) return '';
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs), ymax = Math.max.apply(null, ys.concat([1]));
    var pw = W - left - right, ph = H - top - bottom;
    function X(x) { return left + (x - xmin) / Math.max(1, xmax - xmin) * pw; }
    function Y(y) { return top + ph - y / ymax * ph; }
    var s = svgOpen(W, H, 'Clients needed at each price');
    [0, 0.5, 1].forEach(function (f) { var y = top + ph - f * ph; s += '<line x1="' + left + '" y1="' + y + '" x2="' + (W - right) + '" y2="' + y + '" stroke="' + INK.grid + '"/>'; s += text(left - 8, y + 4, fmt(Math.round(ymax * f), 'n'), { anchor: 'end', size: 10, fill: INK.faint, mono: true }); });
    s += '<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ') + '" fill="none" stroke="' + HUE[0] + '" stroke-width="2" stroke-linejoin="round"/>';
    pts.forEach(function (p) { s += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="6" fill="transparent">' + tip(fmt(p.x, 'cents') + ': ' + p.y + ' clients') + '</circle>'; });
    (spec.marks || []).forEach(function (m, i) {
      var near = pts.slice().sort(function (a, b) { return Math.abs(a.x - m.x) - Math.abs(b.x - m.x); })[0];
      var x = X(m.x), y = Y(near ? near.y : 0);
      s += '<line x1="' + x.toFixed(1) + '" y1="' + top + '" x2="' + x.toFixed(1) + '" y2="' + (top + ph) + '" stroke="' + HUE[i === 0 ? 1 : 2] + '" stroke-dasharray="3 3"/>';
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="' + HUE[i === 0 ? 1 : 2] + '" stroke="' + INK.surface + '" stroke-width="2">' + tip(m.label + ' ' + fmt(m.x, 'cents')) + '</circle>';
      s += text(x.toFixed(1), top + ph + 16, m.label + ' ' + fmt(m.x, 'cents'), { anchor: i === 0 ? 'end' : 'start', size: 10, fill: INK.text });
    });
    s += text(left, H - 6, 'Price', { size: 10, fill: INK.faint });
    s += text(left, 12, spec.yLabel || '', { size: 10, fill: INK.faint });
    return s + '</svg>';
  }

  /* ---- equation: two tiles over two, a line, the score --------------------- */
  function tile(x, y, w, h, label, value, max, hue) {
    var fillH = (value || 0) / max * (h - 26);
    return '<g>' + tip(label + ': ' + value + ' of ' + max) + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + INK.grid + '" rx="6"/>'
      + '<rect x="' + x + '" y="' + (y + h - fillH) + '" width="' + w + '" height="' + fillH.toFixed(1) + '" fill="' + hue + '" rx="6" opacity="0.85"/>'
      + text(x + 8, y + 16, label, { size: 11, fill: INK.text }) + text(x + w - 8, y + 16, String(value), { anchor: 'end', size: 12, fill: INK.text, weight: 600, mono: true }) + '</g>';
  }
  function equation(spec) {
    var W = 520, H = 200, tw = 150, th = 72, gapX = 12, x0 = 40;
    var s = svgOpen(W, H, 'The value equation');
    s += tile(x0, 16, tw, th, spec.top[0].label, spec.top[0].value, spec.max, HUE[0]);
    s += text(x0 + tw + gapX / 2 + 2, 60, '×', { anchor: 'middle', size: 16, fill: INK.faint });
    s += tile(x0 + tw + gapX + 8, 16, tw, th, spec.top[1].label, spec.top[1].value, spec.max, HUE[0]);
    s += '<line x1="' + x0 + '" y1="100" x2="' + (x0 + 2 * tw + gapX + 8) + '" y2="100" stroke="' + INK.axis + '" stroke-width="2"/>';
    s += tile(x0, 112, tw, th, spec.bottom[0].label, spec.bottom[0].value, spec.max, HUE[1]);
    s += text(x0 + tw + gapX / 2 + 2, 156, '×', { anchor: 'middle', size: 16, fill: INK.faint });
    s += tile(x0 + tw + gapX + 8, 112, tw, th, spec.bottom[1].label, spec.bottom[1].value, spec.max, HUE[1]);
    var sx = x0 + 2 * tw + gapX + 8 + 24;
    s += text(sx, 96, '=', { size: 22, fill: INK.faint });
    s += text(sx + 28, 104, (Math.round(spec.score * 10) / 10).toString(), { size: 30, fill: INK.text, weight: 700, mono: true });
    s += text(sx + 28, 124, 'value score', { size: 11, fill: INK.faint });
    return s + '</svg>';
  }

  /* ---- beforeAfter: paired bars, four groups ------------------------------- */
  function beforeAfter(spec) {
    var groups = spec.groups || [], W = 520, rowH = 44, left = 130, right = 60, H = groups.length * rowH + 40;
    var pw = W - left - right, max = spec.max || 10;
    var s = svgOpen(W, H, 'Before and after');
    s += '<rect x="' + left + '" y="4" width="10" height="10" rx="2" fill="' + INK.faint + '"/>' + text(left + 16, 13, 'Before', { size: 11 });
    s += '<rect x="' + (left + 80) + '" y="4" width="10" height="10" rx="2" fill="' + HUE[0] + '"/>' + text(left + 96, 13, 'After', { size: 11 });
    groups.forEach(function (g, i) {
      var y = 24 + i * rowH;
      s += text(left - 10, y + 22, g.label, { anchor: 'end', fill: INK.text });
      var wb = (g.before || 0) / max * pw, wa = (g.after || 0) / max * pw;
      s += '<g>' + tip(g.label + ' before: ' + g.before) + '<rect x="' + left + '" y="' + y + '" width="' + wb.toFixed(1) + '" height="14" rx="4" fill="' + INK.faint + '"/></g>' + text(left + wb + 6, y + 11, String(g.before), { size: 11, mono: true });
      s += '<g>' + tip(g.label + ' after: ' + g.after) + '<rect x="' + left + '" y="' + (y + 16) + '" width="' + wa.toFixed(1) + '" height="14" rx="4" fill="' + HUE[0] + '"/></g>' + text(left + wa + 6, y + 27, String(g.after), { size: 11, fill: INK.text, mono: true });
    });
    if (spec.scores) s += text(W - right - 4, H - 8, 'Score ' + (Math.round(spec.scores.before * 10) / 10) + ' → ' + (Math.round(spec.scores.after * 10) / 10), { anchor: 'end', size: 12, fill: INK.text, weight: 600, mono: true });
    return s + '</svg>';
  }

  /* ---- timeline ------------------------------------------------------------ */
  function timeline(spec) {
    var W = 520, H = 90, left = 30, right = 30, max = Math.max(spec.full.days, spec.first.days, 1);
    var s = svgOpen(W, H, 'First win and full result');
    s += '<line x1="' + left + '" y1="40" x2="' + (W - right) + '" y2="40" stroke="' + INK.axis + '" stroke-width="2"/>';
    s += '<circle cx="' + left + '" cy="40" r="5" fill="' + INK.surface + '" stroke="' + INK.axis + '" stroke-width="2"/>' + text(left, 66, 'Day 0', { anchor: 'start', size: 11 });
    [[spec.first, HUE[2], 'first'], [spec.full, HUE[0], 'full']].forEach(function (m) {
      var x = left + m[0].days / max * (W - left - right);
      s += '<circle cx="' + x.toFixed(1) + '" cy="40" r="8" fill="' + m[1] + '" stroke="' + INK.surface + '" stroke-width="2">' + tip(m[0].label + ': day ' + m[0].days) + '</circle>';
      s += text(x.toFixed(1), m[2] === 'first' ? 20 : 66, 'Day ' + m[0].days + ': ' + trunc(m[0].label, 28), { anchor: x > W * 0.6 ? 'end' : 'middle', size: 11, fill: INK.text });
    });
    return s + '</svg>';
  }

  /* ---- stack: one bar of pieces, the price as a mark ----------------------- */
  function stack(spec) {
    var segs = (spec.segments || []).filter(function (x) { return x.value > 0; }), W = 520, left = 10, right = 10, barY = 18, barH = 26;
    var total = segs.reduce(function (t, x) { return t + x.value; }, 0);
    var max = Math.max(total, spec.line ? spec.line.value : 0, 1), pw = W - left - right;
    var H = 70 + segs.length * 18;
    var s = svgOpen(W, H, 'The stack against the price');
    var x = left;
    segs.forEach(function (sg, i) {
      var w = sg.value / max * pw;
      s += '<g>' + tip(sg.label + ': ' + fmt(sg.value, spec.unit)) + '<rect x="' + x.toFixed(1) + '" y="' + barY + '" width="' + Math.max(0, w - 2).toFixed(1) + '" height="' + barH + '" rx="4" fill="' + HUE[i % HUE.length] + '"/></g>';
      x += w;
    });
    s += text(left, 12, 'Adds up to ' + fmt(total, spec.unit), { size: 12, fill: INK.text, weight: 600 });
    if (spec.line) {
      var lx = left + spec.line.value / max * pw;
      s += '<line x1="' + lx.toFixed(1) + '" y1="' + (barY - 6) + '" x2="' + lx.toFixed(1) + '" y2="' + (barY + barH + 6) + '" stroke="' + INK.text + '" stroke-width="2"/>';
      s += text(Math.min(lx + 6, W - 120).toFixed(1), barY + barH + 18, spec.line.label + ' ' + fmt(spec.line.value, spec.unit), { size: 11, fill: INK.text });
    }
    segs.forEach(function (sg, i) {
      var y = barY + barH + 36 + i * 18;
      s += '<rect x="' + left + '" y="' + (y - 9) + '" width="10" height="10" rx="2" fill="' + HUE[i % HUE.length] + '"/>' + text(left + 16, y, trunc(sg.label, 40), { size: 11, fill: INK.text }) + text(W - right, y, fmt(sg.value, spec.unit), { anchor: 'end', size: 11, mono: true });
    });
    return s + '</svg>';
  }

  /* ---- matrix: value against cost, four cells ------------------------------ */
  function matrix(spec) {
    var W = 520, left = 90, top = 20, cw = 200, ch = 100, n = (spec.points || []).length, H = 260 + Math.ceil(n / 2) * 16;
    var s = svgOpen(W, H, 'Trim and stack');
    var cells = [
      { vx: 'high', cx: 'low', x: left, y: top, label: 'Keep', hue: HUE[2] },
      { vx: 'high', cx: 'high', x: left + cw, y: top, label: 'Keep if you can afford it', hue: HUE[4] },
      { vx: 'low', cx: 'low', x: left, y: top + ch, label: 'Cut', hue: HUE[1] },
      { vx: 'low', cx: 'high', x: left + cw, y: top + ch, label: 'Cut', hue: HUE[1] }
    ];
    cells.forEach(function (c) {
      s += '<rect x="' + c.x + '" y="' + c.y + '" width="' + (cw - 3) + '" height="' + (ch - 3) + '" rx="6" fill="' + INK.grid + '"/>';
      s += text(c.x + 8, c.y + 16, c.label, { size: 11, fill: INK.faint });
      var pts = (spec.points || []).filter(function (p) { return p.value === c.vx && p.cost === c.cx; });
      pts.forEach(function (p, i) {
        var px = c.x + 22 + (i % 6) * 30, py = c.y + 46 + Math.floor(i / 6) * 28;
        s += '<g>' + tip(p.n + '. ' + p.label) + '<circle cx="' + px + '" cy="' + py + '" r="11" fill="' + c.hue + '"/>' + text(px, py + 4, String(p.n), { anchor: 'middle', size: 11, fill: '#0A0C10', weight: 700 }) + '</g>';
      });
    });
    s += text(left - 8, top + ch / 2, 'High value', { anchor: 'end', size: 11, fill: INK.text }) + text(left - 8, top + ch + ch / 2, 'Low value', { anchor: 'end', size: 11, fill: INK.text });
    s += text(left + cw / 2, top + 2 * ch + 16, 'Low cost to you', { anchor: 'middle', size: 11, fill: INK.text }) + text(left + cw + cw / 2, top + 2 * ch + 16, 'High cost to you', { anchor: 'middle', size: 11, fill: INK.text });
    (spec.points || []).forEach(function (p, i) {
      var col = i % 2, row = Math.floor(i / 2), y = top + 2 * ch + 40 + row * 16, x = 20 + col * 250;
      s += text(x, y, p.n + '. ' + trunc(p.label, 34), { size: 11, fill: INK.muted });
    });
    return s + '</svg>';
  }

  /* ---- tiles: four enhancers ----------------------------------------------- */
  function tiles(spec) {
    var ts = spec.tiles || [], W = 520, H = 76, tw = 120, gap = 12;
    var s = svgOpen(W, H, 'The four enhancers');
    ts.forEach(function (t, i) {
      var x = 4 + i * (tw + gap);
      s += '<g>' + tip(t.label + (t.on ? ': in play' : ': not yet')) + '<rect x="' + x + '" y="8" width="' + tw + '" height="56" rx="8" fill="' + (t.on ? HUE[0] : INK.grid) + '" opacity="' + (t.on ? 0.9 : 1) + '"/>'
        + text(x + 12, 32, t.label, { size: 13, fill: t.on ? '#FFFFFF' : INK.faint, weight: 600 }) + text(x + 12, 50, t.on ? (t.built ? 'written here' : 'in play') : 'not yet', { size: 11, fill: t.on ? '#E8F0FF' : INK.faint }) + '</g>';
    });
    return s + '</svg>';
  }

  /* ---- count: a hero number ------------------------------------------------ */
  function count(spec) {
    var W = 520, H = 80;
    var s = svgOpen(W, H, spec.value + ' ' + spec.label);
    s += text(10, 52, String(spec.value), { size: 44, fill: INK.text, weight: 700, mono: true });
    s += text(String(spec.value).length * 26 + 22, 52, spec.label, { size: 14, fill: INK.muted });
    return s + '</svg>';
  }

  /* ---- steps: the client's path -------------------------------------------- */
  function steps(spec) {
    var st = spec.steps || [], W = 520, n = st.length, H = 40 + n * 26;
    var s = svgOpen(W, H, 'The path');
    s += '<line x1="20" y1="20" x2="20" y2="' + (20 + (n - 1) * 26) + '" stroke="' + INK.axis + '" stroke-width="2"/>';
    st.forEach(function (t, i) {
      var y = 20 + i * 26;
      s += '<circle cx="20" cy="' + y + '" r="9" fill="' + (i === n - 1 ? HUE[2] : HUE[0]) + '"/>' + text(20, y + 4, String(i + 1), { anchor: 'middle', size: 10, fill: '#0A0C10', weight: 700 });
      s += text(40, y + 4, trunc(t, 70), { size: 12, fill: INK.text });
    });
    return s + '</svg>';
  }

  /* ---- sky: six planets on four orbits ------------------------------------- */
  function sky(spec) {
    var W = 560, H = 456, cx = 280, cy = 228, rings = spec.rings || 4, r0 = 44, step = 34;
    var s = svgOpen(W, H, 'The Sky: six planets on four orbits');
    for (var k = 1; k <= rings; k++) {
      var rr = r0 + k * step, cleared = k <= (spec.ringsCleared || 0);
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="none" stroke="' + (cleared ? INK.accent : INK.grid) + '" stroke-width="' + (cleared ? 2 : 1) + '"/>';
      s += text(cx + 4, cy - rr + 12, 'Band ' + k, { size: 10, fill: cleared ? INK.text : INK.faint });
    }
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 8) + '" fill="' + (spec.sunOn ? HUE[4] : INK.grid) + '" opacity="' + (spec.sunOn ? 0.9 : 1) + '">' + tip(spec.sunOn ? 'The offer sheet' : 'The offer sheet fills as the rings clear') + '</circle>';
    s += text(cx, cy + 4, 'Offer', { anchor: 'middle', size: 12, fill: spec.sunOn ? '#0A0C10' : INK.faint, weight: 600 });
    (spec.planets || []).forEach(function (p, i) {
      var ang = -Math.PI / 2 + i * (2 * Math.PI / 6);
      var rad = r0 + Math.max(0.15, p.pct) * rings * step;
      var x = cx + rad * Math.cos(ang), y = cy + rad * Math.sin(ang);
      var pr = 12 + Math.round(p.pct * 8);
      s += '<line x1="' + (cx + r0 * Math.cos(ang)).toFixed(1) + '" y1="' + (cy + r0 * Math.sin(ang)).toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + INK.grid + '"/>';
      s += '<a href="planet.html?p=' + esc(p.id) + '"><g>' + tip(p.label + ': ' + p.done + ' of ' + p.of + ' levels') + '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + pr + '" fill="' + HUE[i] + '" stroke="' + INK.surface + '" stroke-width="2"/>'
        + text(x.toFixed(1), (y + 4).toFixed(1), p.letter, { anchor: 'middle', size: 11, fill: '#0A0C10', weight: 700 }) + '</g></a>';
      var lx = cx + (r0 + rings * step + 22) * Math.cos(ang), ly = cy + (r0 + rings * step + 22) * Math.sin(ang);
      s += text(lx.toFixed(1), (ly + 4).toFixed(1), p.label + ' ' + p.done + '/' + p.of, { anchor: Math.cos(ang) > 0.3 ? 'start' : Math.cos(ang) < -0.3 ? 'end' : 'middle', size: 11, fill: INK.text });
    });
    return s + '</svg>';
  }

  var KINDS = { bars: bars, scale: scale, ladder: ladder, loop: loop, curve: curve, equation: equation, beforeAfter: beforeAfter, timeline: timeline, stack: stack, matrix: matrix, tiles: tiles, count: count, steps: steps, sky: sky };

  function render(spec) {
    if (!spec || !KINDS[spec.kind]) return '';
    try { return KINDS[spec.kind](spec); } catch (e) { return ''; }
  }
  /* The table twin: the same numbers as text, for a screen reader or a print. */
  function tableHtml(spec) {
    var t = spec && spec.table; if (!t) return '';
    return '<table class="chart-table"><thead><tr>' + t.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + t.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  return { HUE: HUE, KINDS: Object.keys(KINDS), render: render, table: tableHtml, fmt: fmt };
});
