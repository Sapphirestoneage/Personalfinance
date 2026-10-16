// Small inline-SVG chart primitives. Each takes chart-ready data (from
// src/calc/chart-data.js) and returns SVG markup. Colors are CSS variables
// from tokens.css, so light and dark mode both work. Hover a mark for its value.

import { esc } from '../dom.js';

const F = 12; // font size in px; charts are drawn at real pixel width so text stays readable

export function svgWrap(width, height, body, label) {
  return '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(label) + '">' + body + '</svg>';
}

function t(x, y, s, o = {}) {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') +
    (o.cls ? ' class="' + o.cls + '"' : '') + (o.weight ? ' font-weight="' + o.weight + '"' : '') + '>' + esc(s) + '</text>';
}

function rect(x, y, w, h, fill, o = {}) {
  const tip = o.tip ? '<title>' + esc(o.tip) + '</title>' : '';
  const style = o.outline
    ? 'fill:none;stroke:' + fill + ';stroke-width:2'
    : 'fill:' + fill + (o.opacity ? ';fill-opacity:' + o.opacity : '');
  return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" style="' + style + '">' + tip + '</rect>';
}

function line(x1, y1, x2, y2, cls, dash) {
  return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" class="' + cls + '"' + (dash ? ' stroke-dasharray="4 3"' : '') + ' stroke-width="1.5"/>';
}

// Horizontal bars, one row per item, label above the bars (fits a phone).
// rows: [{ label, values: [{ v, color, tip }] }]
// mode: 'grouped' | 'overlay' (first value is the outline, second the fill) | 'diverging'
// ref: a value to draw a dashed reference line at (e.g. 1.0x, or 35%).
export function hbars({ rows, width, fmt, mode = 'grouped', ref = null, refLabel = '', label = 'Bar chart' }) {
  const barH = mode === 'overlay' || mode === 'diverging' ? 14 : 11;
  // Leave room on the right for the longest value label so nothing is clipped.
  const labelOf = (r, v) => (mode === 'overlay' ? r.values.map((q) => (q.v === null || q.v === undefined ? 'none' : fmt(q.v))).join(' / ') : fmt(v.v));
  const longest = Math.max(4, ...rows.flatMap((r) => r.values.filter((v) => v.v !== null && v.v !== undefined).map((v) => labelOf(r, v).length)));
  const padR = Math.min(width * 0.45, longest * 7 + 10);
  const vals = rows.flatMap((r) => r.values.map((v) => v.v).filter((v) => v !== null && v !== undefined));
  let max = Math.max(0, ...vals.map(Math.abs), ref === null ? 0 : ref);
  if (max === 0) max = 1;
  const plotW = width - padR - 4 - (mode === 'diverging' ? padR : 0);
  const zeroX = mode === 'diverging' ? 4 + padR + plotW / 2 : 4;
  const scale = mode === 'diverging' ? (plotW / 2) / max : plotW / max;
  let y = 4;
  let body = '';
  for (const r of rows) {
    body += t(4, y + F, r.label, { cls: 'muted' });
    y += F + 6;
    const rowTop = y;
    r.values.forEach((v, i) => {
      if (v.v === null || v.v === undefined) {
        if (mode === 'grouped') { body += t(zeroX + 2, y + barH - 1, (v.name ? v.name + ': ' : '') + 'not given', { cls: 'muted tiny' }); y += barH + 2; }
        return;
      }
      const w = Math.abs(v.v) * scale;
      const x = mode === 'diverging' && v.v < 0 ? zeroX - w : zeroX;
      const by = mode === 'grouped' ? y : rowTop;
      body += rect(x, by, w, barH, v.color, { tip: v.tip, outline: mode === 'overlay' && i === 0 });
      if (mode === 'grouped' || mode === 'diverging') {
        const lx = mode === 'diverging' && v.v < 0 ? x - 4 : x + w + 4;
        body += t(lx, by + barH - 2, labelOf(r, v), { anchor: mode === 'diverging' && v.v < 0 ? 'end' : null });
      }
      if (mode === 'grouped') y += barH + 2;
    });
    if (mode === 'overlay') {
      // One label per row, after the longer of the outline and the fill.
      const ws = r.values.filter((q) => q.v !== null && q.v !== undefined).map((q) => Math.abs(q.v) * scale);
      if (ws.length) body += t(zeroX + Math.max(...ws) + 4, rowTop + barH - 2, labelOf(r, null));
    }
    if (mode !== 'grouped') y += barH + 2;
    y += 8;
  }
  const h = y + 4;
  let axes = '';
  if (mode === 'diverging') axes += line(zeroX, 0, zeroX, h - 4, 'axis');
  if (ref !== null) {
    const rx = zeroX + ref * scale;
    axes += line(rx, 0, rx, h - 4, 'axis', true);
    if (refLabel) axes += t(Math.min(rx + 3, width - 2), h + 10, refLabel, { cls: 'muted', anchor: rx > width - 60 ? 'end' : null });
  }
  return svgWrap(width, h + (refLabel ? 14 : 0), axes + body, label);
}

// Donut (inner > 0) or pie (inner = 0). slices: [{ name, amount, share, color }]
export function donut({ slices, size = 200, inner = 0.6, center = '', centerSub = '', label = 'Donut chart', fmt }) {
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = slices.reduce((a, s) => a + s.amount, 0);
  if (!total) return svgWrap(size, size, '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" style="fill:var(--surface-2)"/>' + t(cx, cy + 4, 'No data yet', { anchor: 'middle', cls: 'muted' }), label);
  let a0 = -Math.PI / 2;
  let body = '';
  for (const s of slices) {
    const a1 = a0 + (s.amount / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, rad) => (cx + rad * Math.cos(a)).toFixed(2) + ' ' + (cy + rad * Math.sin(a)).toFixed(2);
    const ri = r * inner;
    const d = slices.length === 1
      ? 'M ' + (cx - r) + ' ' + cy + ' a ' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0 a ' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0'
      : 'M ' + p(a0, r) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p(a1, r) +
        (ri > 0 ? ' L ' + p(a1, ri) + ' A ' + ri + ' ' + ri + ' 0 ' + large + ' 0 ' + p(a0, ri) : ' L ' + cx + ' ' + cy) + ' Z';
    body += '<path d="' + d + '" style="fill:' + s.color + ';stroke:var(--surface);stroke-width:2"><title>' + esc(s.name + ': ' + fmt(s.amount)) + '</title></path>';
    a0 = a1;
  }
  if (inner > 0 && center) {
    body += t(cx, cy + 2, center, { anchor: 'middle', weight: 700 });
    if (centerSub) body += t(cx, cy + 18, centerSub, { anchor: 'middle', cls: 'muted' });
  }
  return svgWrap(size, size, body, label);
}

// Two-column flow: sources on the left, uses on the right, bands between.
export function sankey({ left, right, width, fmt, label = 'Where the money goes' }) {
  const gap = 6;
  const labelW = Math.min(150, width * 0.42);
  const nodeW = 12;
  const total = Math.max(left.reduce((a, x) => a + x.amount, 0), right.reduce((a, x) => a + x.amount, 0));
  const minRow = 26;
  const h = Math.max(220, right.length * minRow + 10);
  const usable = h - gap * (right.length - 1);
  const k = usable / total;
  const lx = 4;
  const rx = width - labelW - nodeW;
  let body = '';
  // left nodes
  let y = 0;
  const lefts = left.map((n) => { const node = { ...n, y, h: n.amount * k }; y += node.h + gap; return node; });
  // right nodes with a minimum label slot
  y = 0;
  const rights = right.map((n) => { const node = { ...n, y, h: Math.max(2, n.amount * k) }; y += Math.max(node.h, minRow - gap) + gap; return node; });
  const scaleY = h / Math.max(h, y);
  rights.forEach((n) => { n.y *= scaleY; });
  // bands: fill right nodes in order from the stacked left sources
  let srcIdx = 0;
  let srcUsed = 0;
  for (const n of rights) {
    let need = n.amount;
    let ry = n.y;
    while (need > 0.0001 && srcIdx < lefts.length) {
      const src = lefts[srcIdx];
      const take = Math.min(need, src.amount - srcUsed);
      const th = take * k;
      const sy = src.y + srcUsed * k;
      const x0 = lx + nodeW;
      const x1 = rx;
      const mx = (x0 + x1) / 2;
      body += '<path d="M ' + x0 + ' ' + sy.toFixed(1) + ' C ' + mx + ' ' + sy.toFixed(1) + ' ' + mx + ' ' + ry.toFixed(1) + ' ' + x1 + ' ' + ry.toFixed(1) +
        ' L ' + x1 + ' ' + (ry + th).toFixed(1) + ' C ' + mx + ' ' + (ry + th).toFixed(1) + ' ' + mx + ' ' + (sy + th).toFixed(1) + ' ' + x0 + ' ' + (sy + th).toFixed(1) +
        ' Z" style="fill:' + n.color + ';fill-opacity:0.28"><title>' + esc(src.name + ' to ' + n.name + ': ' + fmt(take)) + '</title></path>';
      need -= take;
      ry += th;
      srcUsed += take;
      if (src.amount - srcUsed < 0.0001) { srcIdx += 1; srcUsed = 0; }
    }
  }
  for (const n of lefts) {
    body += rect(lx, n.y, nodeW, n.h, n.shortfall ? 'var(--bad)' : 'var(--series-actual)', { tip: n.name + ': ' + fmt(n.amount) });
  }
  const maxChars = Math.floor((labelW - 8) / 6.6);
  for (const n of rights) {
    body += rect(rx, n.y, nodeW, n.h, n.color, { tip: n.name + ': ' + fmt(n.amount) });
    const amt = ' ' + fmt(n.amount);
    const room = Math.max(4, maxChars - amt.length);
    const name = n.name.length > room ? n.name.slice(0, room - 1) + '…' : n.name;
    body += t(rx + nodeW + 6, n.y + Math.min(n.h, 20) / 2 + 4, name + amt, { weight: n.surplus ? 700 : null });
  }
  const first = lefts[0];
  body += t(lx + nodeW + 6, first.y + 14, first.name, { weight: 700 });
  body += t(lx + nodeW + 6, first.y + 30, fmt(first.amount), { cls: 'muted' });
  if (lefts[1]) body += t(lx + nodeW + 6, lefts[1].y + Math.max(12, lefts[1].h / 2 + 4), lefts[1].name + ' ' + fmt(lefts[1].amount), { cls: 'muted' });
  return svgWrap(width, h + 2, body, label);
}

// Half-circle gauge with a marked band edge. value and band are 0..1 shares.
export function gauge({ value, band, size = 180, good = 'under', fmt, caption, label = 'Gauge' }) {
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = r + 8;
  const max = Math.max(1, value || 0);
  const ang = (v) => Math.PI + (Math.min(v, max) / max) * Math.PI;
  const p = (a, rad) => (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1);
  const arc = (v0, v1, color, w) => '<path d="M ' + p(ang(v0), r) + ' A ' + r + ' ' + r + ' 0 0 1 ' + p(ang(v1), r) + '" style="fill:none;stroke:' + color + ';stroke-width:' + w + ';stroke-linecap:butt"/>';
  let body = arc(0, max, 'var(--surface-2)', 14);
  body += good === 'under' ? arc(0, band, 'var(--good)', 4) : arc(band, max, 'var(--good)', 4);
  if (value !== null && value !== undefined) {
    const ok = good === 'under' ? value <= band : value >= band;
    body += arc(0, Math.max(0.0001, value), ok ? 'var(--series-actual)' : 'var(--bad)', 14);
    body += t(cx, cy - 6, fmt(value), { anchor: 'middle', weight: 700 });
  } else {
    body += t(cx, cy - 6, 'not enough data', { anchor: 'middle', cls: 'muted' });
  }
  const ba = ang(band);
  body += '<line x1="' + p(ba, r - 12).split(' ')[0] + '" y1="' + p(ba, r - 12).split(' ')[1] + '" x2="' + p(ba, r + 9).split(' ')[0] + '" y2="' + p(ba, r + 9).split(' ')[1] + '" class="axis" stroke-width="2"><title>Band: ' + esc(fmt(band)) + '</title></line>';
  body += t(cx, cy + 16, caption, { anchor: 'middle', cls: 'muted' });
  return svgWrap(size, cy + 22, body, label);
}

// Completion ring. value 0..1.
export function ring({ value, size = 120, label = 'Completion' }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  const body = '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" style="fill:none;stroke:var(--surface-2);stroke-width:12"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" style="fill:none;stroke:var(--accent);stroke-width:12;stroke-linecap:round" stroke-dasharray="' + (c * v).toFixed(1) + ' ' + c.toFixed(1) + '"><title>' + Math.round(v * 100) + '% filled in</title></circle>' +
    t(size / 2, size / 2 + 5, Math.round(v * 100) + '%', { anchor: 'middle', weight: 700 });
  return svgWrap(size, size, body, label);
}

// Lines over months. series: [{ name, color, values: [number|null] }], xs: labels.
export function lines({ series, xs, width, fmt, zero = true, label = 'Line chart' }) {
  const h = 180;
  const padL = 56;
  const padB = 22;
  const vals = series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined));
  let lo = zero ? Math.min(0, ...vals) : Math.min(...vals);
  let hi = Math.max(...vals, zero ? 0 : -Infinity);
  if (!vals.length) { lo = 0; hi = 1; }
  if (hi === lo) hi = lo + 1;
  const padR = 30;
  const x = (i) => padL + (xs.length === 1 ? (width - padL - padR) / 2 : (i * (width - padL - padR)) / (xs.length - 1));
  const y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (h - padB - 8);
  let body = '';
  for (const g of [lo, (lo + hi) / 2, hi]) {
    body += line(padL, y(g), width - 4, y(g), 'grid-line');
    body += t(padL - 6, y(g) + 4, fmt(g), { anchor: 'end', cls: 'muted' });
  }
  if (lo < 0 && hi > 0) body += line(padL, y(0), width - 4, y(0), 'axis');
  xs.forEach((lab, i) => { body += t(x(i), h - 4, lab, { anchor: 'middle', cls: 'muted' }); });
  for (const s of series) {
    let d = '';
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) return;
      d += (d ? ' L ' : 'M ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    });
    if (d) body += '<path d="' + d + '" style="fill:none;stroke:' + s.color + ';stroke-width:2"' + (s.dashed ? ' stroke-dasharray="5 4"' : '') + '/>';
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) return;
      body += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="4.5" style="fill:' + s.color + ';stroke:var(--surface);stroke-width:2"><title>' + esc(s.name + ', ' + xs[i] + ': ' + fmt(v)) + '</title></circle>';
    });
  }
  return svgWrap(width, h, body, label);
}

// Scatter with optional quadrant split lines. points: [{ x, y, label, color, tip }]
export function scatter({ points, width, xFmt, yFmt, xLabel, yLabel, splitX = null, splitY = null, yMax = null, label = 'Scatter chart' }) {
  const h = 220;
  const padL = 40;
  const padB = 34;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMax = Math.max(1, ...xs) * 1.08;
  const yTop = yMax !== null ? yMax : Math.max(1, ...ys) * 1.1;
  const X = (v) => padL + (v / xMax) * (width - padL - 10);
  const Y = (v) => 8 + (1 - v / yTop) * (h - padB - 8);
  let body = line(padL, Y(0), width - 4, Y(0), 'axis') + line(padL, 8, padL, Y(0), 'axis');
  if (splitX !== null) body += line(X(splitX), 8, X(splitX), Y(0), 'grid-line', true);
  if (splitY !== null) body += line(padL, Y(splitY), width - 4, Y(splitY), 'grid-line', true);
  body += t(padL - 6, Y(yTop) + 12, yFmt(yTop), { anchor: 'end', cls: 'muted' });
  body += t(padL - 6, Y(0), yFmt(0), { anchor: 'end', cls: 'muted' });
  body += t(width - 4, Y(0) + 14, xFmt(xMax), { anchor: 'end', cls: 'muted' });
  body += t((padL + width) / 2, h - 4, xLabel, { anchor: 'middle', cls: 'muted' });
  body += '<text transform="translate(12 ' + (h / 2) + ') rotate(-90)" text-anchor="middle" class="muted">' + esc(yLabel) + '</text>';
  const placed = [];
  for (const p of points) {
    const lx = X(p.x);
    const ly = Y(p.y);
    // Skip a label that would sit on top of one already drawn; the tooltip still names the point.
    const clash = placed.some((q) => Math.abs(q.y - ly) < 14 && Math.abs(q.x - lx) < 90);
    if (p.label && !clash) placed.push({ x: lx, y: ly });
    p.showLabel = p.label && !clash;
  }
  for (const p of points) {
    body += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="6" style="fill:' + p.color + ';fill-opacity:0.85;stroke:var(--surface);stroke-width:2"><title>' + esc(p.tip) + '</title></circle>';
    if (p.showLabel) {
      const right = X(p.x) > width - 110;
      body += t(right ? X(p.x) - 9 : X(p.x) + 9, Y(p.y) + 4, p.label, { anchor: right ? 'end' : null });
    }
  }
  return svgWrap(width, h, body, label);
}

// One stacked bar with target ticks (50/30/20). parts: [{ name, share, color, target }]
export function stack({ parts, width, fmt, label = 'Stacked bar' }) {
  const barY = 18;
  const barH = 26;
  const w = width - 8;
  let x = 4;
  let body = '';
  const total = Math.max(1, parts.reduce((a, p) => a + (p.share || 0), 0));
  for (const p of parts) {
    const pw = ((p.share || 0) / total) * w;
    body += rect(x, barY, Math.max(0, pw - 2), barH, p.color, { tip: p.name + ': ' + fmt(p.share) });
    if (pw > 44) body += t(x + 6, barY + 17, fmt(p.share), { weight: 700 });
    x += pw;
  }
  let tx = 4;
  let ty = barY + barH + 16;
  for (const p of parts) {
    if (p.target === null || p.target === undefined) continue;
    tx += (p.target / total) * w;
    body += line(tx, barY - 6, tx, barY + barH + 4, 'axis', true);
  }
  body += t(4, 12, 'Dashed ticks: 50 / 30 / 20 targets', { cls: 'muted' });
  return svgWrap(width, ty, body, label);
}

// Weekday heatmap (Phase 6). cells: [{ label, amount, share }]
export function heatRow({ cells, width, fmt, label = 'Heatmap' }) {
  const n = cells.length;
  const cw = (width - 8) / n;
  const max = Math.max(1, ...cells.map((c) => c.amount));
  let body = '';
  cells.forEach((c, i) => {
    const x = 4 + i * cw;
    body += '<rect x="' + x.toFixed(1) + '" y="4" width="' + (cw - 3).toFixed(1) + '" height="48" rx="4" style="fill:var(--series-actual);fill-opacity:' + (0.08 + 0.85 * (c.amount / max)).toFixed(2) + '"><title>' + esc(c.label + ': ' + fmt(c.amount)) + '</title></rect>';
    body += t(x + (cw - 3) / 2, 66, c.label, { anchor: 'middle', cls: 'muted' });
    body += t(x + (cw - 3) / 2, 82, fmt(c.amount), { anchor: 'middle' });
  });
  return svgWrap(width, 90, body, label);
}

// One 100% bar: parts as shares of a base, each labeled with its % when it fits.
// A shortfall (spending past the base) shows as a dashed segment past the 100% mark.
export function shareBar({ parts, shortfall = 0, width, label = '100% bar' }) {
  const barY = 20;
  const barH = 30;
  const w = width - 8;
  const span = 1 + Math.max(0, shortfall);
  const at = (share) => 4 + (share / span) * w;
  let x = 0;
  let body = '';
  for (const p of parts) {
    const s = Math.max(0, p.share || 0);
    const x0 = at(x);
    const pw = at(x + s) - x0;
    body += rect(x0, barY, Math.max(0, pw - 1.5), barH, p.color, { tip: p.name + ': ' + Math.round(s * 100) + '%' });
    if (pw > 34) body += t(x0 + pw / 2, barY + 19, p.short || p.name, { anchor: 'middle', weight: 700, cls: 'on-fill' });
    x += s;
  }
  const end = at(1);
  if (shortfall > 0) {
    body += rect(end, barY, at(span) - end - 1.5, barH, 'var(--chart-axis)', { outline: true, tip: 'Shortfall: ' + Math.round(shortfall * 100) + '%' });
    body += t(Math.min(end + 4, width - 4), barY + barH + 14, 'Short ' + Math.round(shortfall * 100) + '%', { anchor: end > width - 60 ? 'end' : 'start', cls: 'muted' });
  }
  body += line(end, barY - 6, end, barY + barH + 4, 'axis');
  body += t(Math.min(end, width - 4), 12, '100%', { anchor: 'end', cls: 'muted' });
  return svgWrap(width, barY + barH + 20, body, label);
}
