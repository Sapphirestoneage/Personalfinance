// One chart module (overnight Track C): every chart in the app is drawn here, in plain SVG, the same way.
// - A chart card answers one question, written as its title; a sentence under it says the main point (and is what a
//   screen reader hears); "Show as table" opens every value as a table; a legend in words names two or more colors.
// - Colors are the five data colors (--viz-1 to --viz-5, DESIGN.md 8) and a gray; text wears ink, never a data color.
// - Money axes read in whole dollars with k and M ($1.2k, $350k, $1.1M).
// - Tap (or hover, or focus) a mark: its exact words show in the line under the chart. The table has them all too.
// - A rough or missing part is hatched (a bar) or dashed (a line), never drawn as solid fact.
// - A chart is drawn at the width it is shown and redrawn when that changes, so its text stays 12px on a phone.
// Formatting only: every number comes figured from the engine (engine/charts.js); this file only places marks.

import { h } from './view.js';

const SVG = 'http://www.w3.org/2000/svg';
export const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) if (val !== null && val !== undefined && val !== false) el.setAttribute(k, typeof val === 'number' ? +val.toFixed(2) : val);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};
let uid = 0;

// "$1.2k", "$350k", "$1.1M", "-$800": whole dollars, short.
export function axisMoney(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '';
  const a = Math.abs(x), sign = x < 0 ? '-' : '';
  const t = (n, unit) => { const r = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10; return sign + '$' + String(r).replace(/\.0$/, '') + unit; };
  if (a >= 1e6) return t(a / 1e6, 'M');
  if (a >= 1e3) return t(a / 1e3, 'k');
  return sign + '$' + Math.round(a).toLocaleString('en-US');
}
// Exact words for a tip or a table cell: "$62,976".
export const exactMoney = (x) => (x === null || x === undefined ? 'missing' : (x < 0 ? '-$' : '$') + Math.round(Math.abs(x)).toLocaleString('en-US'));
const FMT = { money: axisMoney, pct: (x) => Math.round(x * 100) + '%', years: (x) => (Math.round(x * 10) / 10) + ' y', plain: (x) => String(Math.round(x * 10) / 10), year: (x) => String(Math.round(x)) };
const fmtOf = (f) => (typeof f === 'function' ? f : FMT[f || 'money']);

// Round tick values from lo to hi, about n of them, always including 0 when the range crosses it.
export function niceTicks(lo, hi, n = 4) {
  if (!(hi > lo)) { hi = lo + 1; }
  const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v / step) * step);
  if (out[0] > lo) out.unshift(out[0] - step);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}
// The hatch for rough marks, one per chart: thin diagonal lines in the mark's own color.
function hatch(svg) {
  const id = 'hatch-' + (++uid);
  svg.append(s('defs', {}, s('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, s('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'ch-hatch-line' }))));
  return 'url(#' + id + ')';
}
// A rough mark: the colored shape, then the same shape again in stripes laid over it.
const roughen = (el, fill) => { const over = el.cloneNode(false); over.removeAttribute('tabindex'); over.setAttribute('class', 'ch-hatch-over'); over.setAttribute('fill', fill); over.setAttribute('aria-hidden', 'true'); return [el, over]; };
const put = (svg, el, rough, fill) => { if (rough) svg.append(...roughen(el, fill)); else svg.append(el); };
// A mark that can be tapped for its exact words: a <title> for hover, data-tip for the readout.
const tip = (el, words) => { if (!words) return el; el.setAttribute('data-tip', words); el.setAttribute('tabindex', '0'); el.classList.add('ch-tap'); el.append(s('title', {}, words)); return el; };
const svgRoot = (W, H, label) => s('svg', { class: 'ch-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': label || 'Chart; every value is in the table' });
const label = (x, y, words, anchor = 'start', cls = '') => s('text', { class: 'ch-label ' + cls, x, y, 'text-anchor': anchor }, words);
const textWidth = (words, px = 12) => String(words).length * px * 0.56;

// Lines over x (a year, a month index, a number). series: [{ label, c (1-5 or 0 gray), points: [[x, y]], dashFrom
// (x where it turns rough), dashed, area, stack, thin, endLabel }]. bands: [{ y0, y1, cls, label }] (a wash between two
// y values); range: { lo: [[x, y]], hi: [[x, y]], c } (a shaded band between two lines); hlines: [{ y, label, c, dash }];
// vmarks: [{ x, label }]; dots: [{ x, y, c, label, tip }]. tips(x) gives the words for a tap at x.
export function lines({ width = 600, height = 240, series = [], bands = [], range = null, hlines = [], vmarks = [], dots = [], xFmt = 'year', yFmt = 'money', yMin = null, yMax = null, tips = null, xTicks = null, label: aria } = {}) {
  const W = Math.max(280, Math.round(width)), H = height, L = 52, R = 12, T = 18, B = 26;
  const pts = series.flatMap((x) => x.points);
  const xs = pts.map((p) => p[0]), ys = [...pts.map((p) => p[1]), ...hlines.map((l) => l.y), ...bands.flatMap((b) => [b.y0, b.y1]), ...(range ? [...range.lo, ...range.hi].map((p) => p[1]) : [])].filter(Number.isFinite);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ticks = niceTicks(yMin ?? Math.min(0, ...ys), yMax ?? Math.max(...ys, 1));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const X = (v) => L + (x1 === x0 ? 0 : ((v - x0) / (x1 - x0)) * (W - L - R));
  const Y = (v) => T + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo || 1)) * (H - T - B);
  const svg = svgRoot(W, H, aria), fill = hatch(svg);
  const fy = fmtOf(yFmt), fx = fmtOf(xFmt);
  for (const t of ticks) { svg.append(s('line', { class: 'ch-grid' + (t === 0 ? ' ch-zero' : ''), x1: L, x2: W - R, y1: Y(t), y2: Y(t) })); svg.append(label(L - 6, Y(t) + 4, fy(t), 'end')); }
  for (const b of bands) { const a = Y(Math.max(b.y0, b.y1)), z = Y(Math.min(b.y0, b.y1)); svg.append(s('rect', { class: 'ch-band ' + (b.cls || ''), x: L, y: a, width: W - L - R, height: Math.max(1, z - a) })); if (b.label) svg.append(label(W - R - 4, a + 13, b.label, 'end', 'ch-band-label')); }
  const path = (list) => list.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('');
  if (range && range.lo.length > 1) svg.append(s('path', { class: 'ch-range viz-' + (range.c ?? 1), d: path(range.hi) + [...range.lo].reverse().map((p) => 'L' + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('') + 'Z' }));
  // Stacked areas: each series sits on the ones before it (values are already stacked by the engine).
  let floor = null;
  for (const sr of series.filter((x) => x.stack)) {
    const base = floor || sr.points.map((p) => [p[0], 0]);
    put(svg, s('path', { class: 'ch-area viz-' + (sr.c ?? 1) + (sr.rough ? ' ch-rough' : ''), d: path(sr.points) + [...base].reverse().map((p) => 'L' + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('') + 'Z' }), sr.rough, fill);
    floor = sr.points;
  }
  const taken = [];
  for (const l of [...hlines].sort((a, b) => b.y - a.y)) {
    svg.append(s('line', { class: 'ch-hline viz-' + (l.c ?? 0) + (l.dash ? ' ch-dash' : ''), x1: L, x2: W - R, y1: Y(l.y), y2: Y(l.y) }));
    // Each line's name at its left end, above it; one too close to another is left to the legend.
    if (l.label && !taken.some((t) => Math.abs(t - Y(l.y)) < 15)) { taken.push(Y(l.y)); svg.append(label(L + 4, Y(l.y) - 4, l.label, 'start', 'ch-hline-label')); }
  }
  for (const sr of series) {
    if (sr.points.length < 2) continue;
    const cls = 'ch-line viz-' + (sr.c ?? 1) + (sr.thin ? ' ch-thin' : '') + (sr.pattern ? ' ch-pat-' + sr.pattern : '');
    if (sr.dashed) svg.append(s('path', { class: cls + ' ch-dash', d: path(sr.points) }));
    else if (sr.dashFrom !== undefined && sr.dashFrom !== null) {
      const solid = sr.points.filter((p) => p[0] <= sr.dashFrom), rough = sr.points.filter((p) => p[0] >= sr.dashFrom);
      if (solid.length > 1) svg.append(s('path', { class: cls, d: path(solid) }));
      if (rough.length > 1) svg.append(s('path', { class: cls + ' ch-dash', d: path(rough) }));
    } else svg.append(s('path', { class: cls, d: path(sr.points) }));
    if (sr.endLabel) { const p = sr.points[sr.points.length - 1]; svg.append(label(Math.min(X(p[0]), W - R) - 2, Y(p[1]) - 6, sr.endLabel, 'end', 'ch-end')); }
  }
  for (const m of vmarks) { const x = X(m.x); svg.append(s('line', { class: 'ch-vmark', x1: x, x2: x, y1: T, y2: H - B })); if (m.label) svg.append(label(Math.min(Math.max(x, L + textWidth(m.label) / 2), W - R - textWidth(m.label) / 2), 12, m.label, 'middle', 'ch-vmark-label')); }
  for (const d of dots) svg.append(tip(s('circle', { class: 'ch-dot viz-' + (d.c ?? 1), cx: X(d.x), cy: Y(d.y), r: 5 }), d.tip || d.label));
  // X labels: from xTicks, else first, last and a few between, never closer than their own width.
  // Across two or more whole units (years), ticks land on whole numbers, never "2027" twice.
  const xt = xTicks || (() => {
    const n = Math.max(2, Math.min(6, Math.floor((W - L - R) / 70)));
    if (x1 - x0 >= 2) { const step = Math.max(1, Math.ceil((x1 - x0) / n)); const out = []; for (let v = Math.ceil(x0); v <= x1 + 1e-9; v += step) out.push(v); return out; }
    const out = []; for (let i = 0; i <= n; i++) out.push(x0 + ((x1 - x0) * i) / n); return out;
  })();
  let last = -Infinity;
  for (const v of xt) { const x = X(v), words = fx(v), w = textWidth(words); if (x - w / 2 < last + 6) continue; last = x + w / 2; svg.append(label(Math.min(Math.max(x, L + w / 2), W - R - w / 2), H - 8, words, 'middle')); }
  // Tap columns: one hit strip per x step with the words for that x.
  if (tips) { const steps = [...new Set(xs)].sort((a, b) => a - b); const half = steps.length > 1 ? (X(steps[1]) - X(steps[0])) / 2 : 8; for (const v of steps) { const words = tips(v); if (words) svg.append(tip(s('rect', { class: 'ch-hit', x: X(v) - half, y: T, width: Math.max(2, half * 2), height: H - T - B }), words)); } }
  return svg;
}

// Horizontal bars, one row each: { label, sub, segs: [{ v, c, rough, tip }] (stacked from 0, or from `from`), target
// (a tick), marker: { v, label }, range: { v0, v1 } (a pale bar behind, for a bullet), }. diverging: bars go left
// (negative) and right (positive) of a center line. max: the axis end (default the biggest value).
export function bars({ width = 600, rows = [], fmt = 'money', max = null, min = null, diverging = false, rowH = 30, label: aria, valueWords = null } = {}) {
  const W = Math.max(280, Math.round(width));
  const valW = Math.max(56, ...rows.map((r) => textWidth(r.value !== undefined ? r.value : '', 12) + 10));
  const labW = Math.min(Math.round(W * 0.42), Math.max(...rows.map((r) => textWidth(r.label, 13)), 40) + 12);
  // A label longer than its gutter is cut with an ellipsis; the whole words are in the tip and the table.
  const fit = (words) => { const n = Math.floor((labW - 8) / (13 * 0.56)); return words.length > n ? words.slice(0, Math.max(1, n - 1)).trimEnd() + '\u2026' : words; };
  const T = 4, H = T + rows.length * (rowH + (rows.some((r) => r.sub) ? 14 : 0)) + 4;
  const ends = rows.flatMap((r) => { let t = r.from || 0; const out = [t]; for (const g of r.segs || []) { t += g.v; out.push(t); } if (r.target !== undefined && r.target !== null) out.push(r.target); if (r.marker) out.push(r.marker.v); if (r.range) out.push(r.range.v0, r.range.v1); return out; }).filter(Number.isFinite);
  const hi = max ?? Math.max(...ends, 1), lo = min ?? (diverging ? -Math.max(Math.abs(Math.min(...ends)), Math.abs(hi)) : Math.min(0, ...ends));
  const top = diverging ? Math.max(Math.abs(lo), Math.abs(hi)) : hi, bot = diverging ? -top : lo;
  const X = (v) => labW + ((v - bot) / (top - bot || 1)) * (W - labW - valW);
  const svg = svgRoot(W, H, aria), fill = hatch(svg), f = fmtOf(fmt);
  let y = T;
  if (diverging || bot < 0) svg.append(s('line', { class: 'ch-zero', x1: X(0), x2: X(0), y1: 0, y2: H }));
  for (const r of rows) {
    const mid = y + rowH / 2;
    svg.append(label(labW - 8, mid + 4, fit(r.label), 'end', 'ch-row-label'));
    if (r.range) svg.append(s('rect', { class: 'ch-range-bar', x: X(Math.min(r.range.v0, r.range.v1)), y: mid - 9, width: Math.abs(X(r.range.v1) - X(r.range.v0)), height: 18, rx: 3 }));
    let t = r.from || 0;
    for (const g of r.segs || []) {
      const a = X(Math.min(t, t + g.v)), b = X(Math.max(t, t + g.v));
      put(svg, tip(s('rect', { class: 'ch-bar viz-' + (g.c ?? 1) + (g.rough ? ' ch-rough' : ''), x: a, y: mid - 6, width: Math.max(1, b - a - ((r.segs || []).length > 1 ? 1 : 0)), height: 12, rx: 3 }), g.tip || r.label + ': ' + exactMoney(g.v)), g.rough, fill);
      t += g.v;
    }
    if (r.target !== undefined && r.target !== null) svg.append(tip(s('line', { class: 'ch-target', x1: X(r.target), x2: X(r.target), y1: mid - 10, y2: mid + 10 }), r.targetTip || 'Plan: ' + exactMoney(r.target)));
    if (r.marker) { svg.append(tip(s('path', { class: 'ch-marker', d: 'M' + X(r.marker.v).toFixed(1) + ',' + (mid - 9) + 'l-5,-7h10z' }), r.marker.label)); }
    const words = r.value !== undefined ? r.value : valueWords ? valueWords(r) : f(t);
    svg.append(label(W - 4, mid + 4, words, 'end', 'ch-row-value'));
    if (r.sub) svg.append(label(labW, mid + rowH / 2 + 8, r.sub, 'start', 'ch-row-sub'));
    y += rowH + (rows.some((x) => x.sub) ? 14 : 0);
  }
  return svg;
}

// Columns over time, stacked: cols: [{ label, segs: [{ v, c, rough, tip }] }]. Negative segments stack below zero.
export function columns({ width = 600, height = 220, cols = [], fmt = 'money', label: aria, line = null } = {}) {
  const W = Math.max(280, Math.round(width)), H = height, L = 52, R = 8, T = 12, B = 26;
  const tops = cols.map((c) => c.segs.filter((g) => g.v > 0).reduce((a, g) => a + g.v, 0)), bots = cols.map((c) => c.segs.filter((g) => g.v < 0).reduce((a, g) => a + g.v, 0));
  const ticks = niceTicks(Math.min(0, ...bots), Math.max(1, ...tops, ...(line ? line.map((p) => p) : [])));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const Y = (v) => T + ((hi - v) / (hi - lo || 1)) * (H - T - B);
  const bw = (W - L - R) / Math.max(1, cols.length), gap = Math.min(8, bw * 0.25);
  const svg = svgRoot(W, H, aria), fill = hatch(svg), f = fmtOf(fmt);
  for (const t of ticks) { svg.append(s('line', { class: 'ch-grid' + (t === 0 ? ' ch-zero' : ''), x1: L, x2: W - R, y1: Y(t), y2: Y(t) })); svg.append(label(L - 6, Y(t) + 4, f(t), 'end')); }
  let last = -Infinity;
  cols.forEach((c, i) => {
    const x = L + i * bw + gap / 2, w = bw - gap;
    let up = 0, down = 0;
    for (const g of c.segs) {
      if (!g.v) continue;
      const a = g.v > 0 ? up : down, b = a + g.v;
      if (g.v > 0) up = b; else down = b;
      const y1 = Y(Math.max(a, b)), y2 = Y(Math.min(a, b));
      put(svg, tip(s('rect', { class: 'ch-bar viz-' + (g.c ?? 1) + (g.rough ? ' ch-rough' : ''), x, y: y1, width: Math.max(1, w), height: Math.max(1, y2 - y1 - 1), rx: Math.min(3, w / 3) }), g.tip || c.label + ': ' + exactMoney(g.v)), g.rough, fill);
    }
    const lx = x + w / 2, lw = textWidth(c.label);
    if (lx - lw / 2 > last + 4) { svg.append(label(lx, H - 8, c.label, 'middle')); last = lx + lw / 2; }
  });
  if (line) { const d = line.map((v, i) => (i ? 'L' : 'M') + (L + i * bw + bw / 2).toFixed(1) + ',' + Y(v).toFixed(1)).join(''); svg.append(s('path', { class: 'ch-line viz-0 ch-thin', d })); }
  return svg;
}

// A waterfall as rows (it reads at phone width): each step floats from where the last one ended; a total starts at 0.
// steps: [{ label, v, total, rough, tip }]. Up steps take color 1, down steps 2, totals ink gray.
export function waterfall({ width = 600, steps = [], label: aria } = {}) {
  let run = 0;
  const rows = steps.map((st) => {
    if (st.total) { run = st.v; return { label: st.label, from: 0, segs: [{ v: st.v, c: 0, rough: st.rough, tip: st.tip || st.label + ': ' + exactMoney(st.v) }], value: exactMoney(st.v) }; }
    const from = run; run += st.v;
    return { label: st.label, from, segs: [{ v: st.v, c: st.v >= 0 ? 1 : 2, rough: st.rough, tip: st.tip || st.label + ': ' + (st.v >= 0 ? '+' : '') + exactMoney(st.v) }], value: (st.v >= 0 ? '+' : '') + exactMoney(st.v) };
  });
  return bars({ width, rows, label: aria });
}

// A treemap (squarified): items [{ label, v, c, rough, tip }], biggest first. Labels go inside only where they fit.
export function treemap({ width = 600, height = 260, items = [], label: aria } = {}) {
  const W = Math.max(280, Math.round(width)), H = height;
  const list = items.filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const total = list.reduce((a, x) => a + x.v, 0) || 1;
  const svg = svgRoot(W, H, aria), fill = hatch(svg);
  const place = (nodes, x, y, w, hgt) => {
    if (!nodes.length) return;
    const sum = nodes.reduce((a, n) => a + n.v, 0), wide = w >= hgt, side = wide ? hgt : w;
    let row = [], best = Infinity;
    const worst = (r) => { const rs = r.reduce((a, n) => a + n.v, 0), len = (rs / sum) * (wide ? w : hgt); return Math.max(...r.map((n) => { const k = (n.v / rs) * side; return Math.max(len / k, k / len); })); };
    let i = 0;
    for (; i < nodes.length; i++) { const next = [...row, nodes[i]], wv = worst(next); if (wv > best && row.length) break; row = next; best = wv; }
    const rs = row.reduce((a, n) => a + n.v, 0), len = (rs / sum) * (wide ? w : hgt);
    let off = 0;
    for (const n of row) {
      const k = (n.v / rs) * side;
      const r = wide ? { x, y: y + off, w: len, h: k } : { x: x + off, y, w: k, h: len };
      off += k;
      put(svg, tip(s('rect', { class: 'ch-cell viz-' + (n.c ?? 1) + (n.rough ? ' ch-rough' : ''), x: r.x + 1, y: r.y + 1, width: Math.max(1, r.w - 2), height: Math.max(1, r.h - 2), rx: 3 }), n.tip || n.label + ': ' + exactMoney(n.v)), n.rough, fill);
      if (r.w > textWidth(n.label, 12) + 12 && r.h > 34) { svg.append(label(r.x + 7, r.y + 18, n.label, 'start', 'ch-cell-label')); svg.append(label(r.x + 7, r.y + 32, axisMoney(n.v) + ' · ' + Math.round((n.v / total) * 100) + '%', 'start', 'ch-cell-sub')); }
    }
    const rest = nodes.slice(i);
    if (wide) place(rest, x + len, y, w - len, hgt); else place(rest, x, y + len, w, hgt - len);
  };
  place(list, 0, 0, W, H);
  return svg;
}

// A month as a calendar of days, each shaded by its amount (one hue, light to dark). days: [{ date, v, tip }]; the
// first weekday column is Sunday or Monday (weekStart 0 or 1).
export function heatmap({ width = 600, ym, days = [], weekStart = 0, label: aria } = {}) {
  const W = Math.max(280, Math.round(width));
  const [y, m] = ym.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first - weekStart + 7) % 7, rowsN = Math.ceil((lead + n) / 7);
  const cw = Math.min(64, (W - 8) / 7), ch = Math.min(44, cw * 0.8), H = 20 + rowsN * ch + 4, x0 = (W - cw * 7) / 2;
  const svg = svgRoot(W, H, aria);
  // Shade by rank (quarters of the days that spent anything), so one big day (rent) does not wash out the rest.
  const sorted = days.map((d) => d.v || 0).filter((x) => x > 0).sort((a, b) => a - b);
  const stepOf = (v) => (v <= 0 || !sorted.length ? 0 : 1 + Math.min(3, Math.floor((sorted.filter((x) => x < v).length / sorted.length) * 4)));
  const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < 7; i++) svg.append(label(x0 + i * cw + cw / 2, 13, NAMES[(i + weekStart) % 7], 'middle'));
  const byDay = new Map(days.map((d) => [d.date, d]));
  for (let d = 1; d <= n; d++) {
    const k = lead + d - 1, cx = x0 + (k % 7) * cw, cy = 20 + Math.floor(k / 7) * ch;
    const iso = ym + '-' + String(d).padStart(2, '0'), x = byDay.get(iso), v = x ? x.v || 0 : 0;
    const step = stepOf(v);
    svg.append(tip(s('rect', { class: 'ch-heat ch-heat-' + step, x: cx + 1, y: cy + 1, width: cw - 2, height: ch - 2, rx: 4 }), x && x.tip ? x.tip : iso + ': nothing spent'));
    svg.append(label(cx + 5, cy + 14, String(d), 'start', 'ch-heat-day' + (step >= 3 ? ' ch-on-dark' : '')));
  }
  return svg;
}

// A small line with no axes (Today): points [y], the last one dotted.
export function sparkline({ width = 160, height = 36, points = [], rough = false, label: aria } = {}) {
  const W = width, H = height, lo = Math.min(...points), hi = Math.max(...points);
  const X = (i) => 2 + (i * (W - 6)) / Math.max(1, points.length - 1), Y = (v) => 3 + ((hi - v) / (hi - lo || 1)) * (H - 6);
  const svg = s('svg', { class: 'ch-spark', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': aria || '' });
  svg.append(s('path', { class: 'ch-line viz-1 ch-thin' + (rough ? ' ch-dash' : ''), d: points.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('') }));
  if (points.length) svg.append(s('circle', { class: 'ch-dot viz-1', cx: X(points.length - 1), cy: Y(points[points.length - 1]), r: 3 }));
  return svg;
}

// The card every chart sits in. draw(width) returns the SVG; it is redrawn when the card's width changes.
// legend: [{ c, words, rough, dash }]; table: { head: [...], rows: [[...]] } (cells are strings or nodes); controls: a
// node above the chart (a range switch); empty: words for a calm empty state (no chart, no table) when there is nothing
// to draw yet; note: a line under the legend.
export function chartCard({ id, question, summary, draw, legend = [], table = null, controls = null, empty = null, note = null, level = 'h3' }) {
  const readout = h('p', { class: 'ch-readout', 'aria-live': 'polite' }, empty ? '' : 'Tap a mark for its exact value.');
  const wrap = h('div', { class: 'ch-wrap' });
  const card = h('figure', { class: 'chart-card', 'data-chart': id },
    h(level, { class: 'ch-q' }, question),
    summary ? h('p', { class: 'ch-summary' }, summary) : null,
    controls);
  if (empty) { card.append(h('div', { class: 'ch-empty' }, h('span', { class: 'ch-empty-icon', 'aria-hidden': 'true' }, emptyIcon()), h('p', {}, empty))); if (note) card.append(h('p', { class: 'ch-note' }, note)); return card; }
  let drawn = 0;
  const paint = (w) => { const width = Math.round(w); if (!width || Math.abs(width - drawn) < 8) return; drawn = width; wrap.replaceChildren(draw(width)); };
  paint(600);
  // Redrawn a frame later, never inside the observer's own callback (that loops).
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver((es) => { const w = es[es.length - 1].contentRect.width; requestAnimationFrame(() => paint(w)); }).observe(wrap);
  const pick = (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) return; wrap.querySelectorAll('.ch-picked').forEach((x) => x.classList.remove('ch-picked')); t.classList.add('ch-picked'); readout.textContent = t.getAttribute('data-tip'); };
  wrap.addEventListener('click', pick); wrap.addEventListener('focusin', pick); wrap.addEventListener('mouseover', pick);
  card.append(wrap, readout);
  if (legend.length > 1) card.append(h('ul', { class: 'ch-legend', 'aria-label': 'What the colors mean' }, legend.map((l) => h('li', {}, h('span', { class: 'sw viz-' + (l.c ?? 1) + (l.rough ? ' sw-hatch' : '') + (l.dash ? ' sw-dash' : '') + (l.cls ? ' ' + l.cls : ''), 'aria-hidden': 'true' }), l.words))));
  if (note) card.append(h('p', { class: 'ch-note' }, note));
  if (table) {
    const t = h('table', { class: 'ch-table', hidden: true }, h('thead', {}, h('tr', {}, table.head.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, table.rows.map((r) => h('tr', {}, r.map((x, i) => (i ? h('td', {}, x) : h('th', { scope: 'row' }, x)))))));
    const btn = h('button', { type: 'button', class: 'btn small ghost ch-table-btn', 'aria-expanded': 'false', onclick: () => { t.hidden = !t.hidden; btn.setAttribute('aria-expanded', String(!t.hidden)); btn.textContent = t.hidden ? 'Show as table' : 'Show as chart'; wrap.hidden = !t.hidden; readout.hidden = !t.hidden; } }, 'Show as table');
    card.append(btn, h('div', { class: 'ch-table-wrap' }, t));
  }
  return card;
}
function emptyIcon() {
  const svg = s('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75 });
  svg.append(s('path', { d: 'M4 19h16M6 15l4-4 3 3 5-6' }));
  return svg;
}
// A row of buttons that pick one (a range switch): options [[key, words]].
export function rangeSwitch(options, current, onPick, aria = 'Range') {
  return h('div', { class: 'segmented ch-range-switch', role: 'group', 'aria-label': aria }, options.map(([k, words]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(k === current), onclick: () => onPick(k) }, h('span', { class: 'seg-label' }, words))));
}
