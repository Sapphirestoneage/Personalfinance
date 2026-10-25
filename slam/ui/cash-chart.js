// Cash by day (S-209, the Budget calendar's chart, redrawn by DESIGN.md): checking every
// day as one line, recorded before the as-of date (from check-ins and the log) and the run
// after it; savings as its own thinner line, never added in; the floor; days under it as a
// wash; paydays and big bills as dots. Labels sit in the gutters, never on a mark. The chart
// is drawn at the width it is shown, so its text is 12px on a phone too. A legend names the
// colors and a list twin under it has every day.

import { h, money, shortDate } from './view.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) if (val !== null && val !== undefined) el.setAttribute(k, val);
  for (const k of kids.flat()) if (k !== null && k !== undefined) el.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = (d) => {
  const bits = [shortDate(d.date) + ': checking ' + money(d.checking)];
  if (d.savings !== null) bits.push('savings ' + money(d.savings) + ' (apart)');
  if (d.payday) bits.push('payday');
  if (d.big) bits.push(d.big.label + ' ' + money(d.big.amount));
  if (d.under) bits.push('under the floor');
  return bits.join('; ');
};

function chart(line, width) {
  const L = 64, R = 8, T = 22, B = 24, H = 220;
  const W = Math.max(300, Math.round(width));
  const n = line.days.length;
  const span = line.max - line.min || 1;
  const x = (i) => L + (n === 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((line.max - v) / span) * (H - T - B);
  const pts = (list) => list.map(([i, v]) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const idx = line.days.map((d, i) => [i, d]);
  const pastPts = idx.filter(([, d]) => d.past).map(([i, d]) => [i, d.checking]);
  const firstAhead = idx.find(([, d]) => !d.past);
  const aheadPts = idx.filter(([, d]) => !d.past).map(([i, d]) => [i, d.checking]);
  if (pastPts.length && firstAhead) aheadPts.unshift(pastPts[pastPts.length - 1]);
  const savePts = idx.filter(([, d]) => d.savings !== null).map(([i, d]) => [i, d.savings]);
  const svg = s('svg', { class: 'cl-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Checking every day from ' + shortDate(line.days[0].date) + ' to ' + shortDate(line.days[n - 1].date) + '; every day is also in the list below the chart' });
  // Days under the floor (or under zero when there is no floor): one wash per run of days.
  let run = null;
  const washes = [];
  idx.forEach(([i, d]) => { if (d.under) { if (!run) run = [i, i]; else run[1] = i; } else if (run) { washes.push(run); run = null; } });
  if (run) washes.push(run);
  const half = n > 1 ? (W - L - R) / (n - 1) / 2 : 4;
  for (const [a, b] of washes) svg.append(s('rect', { class: 'cl-under', x: (x(a) - half).toFixed(1), y: T, width: (x(b) - x(a) + 2 * half).toFixed(1), height: H - T - B }));
  if (line.min < 0) svg.append(s('line', { class: 'cl-zero', x1: L, x2: W - R, y1: y(0).toFixed(1), y2: y(0).toFixed(1) }));
  if (line.floor > 0) svg.append(s('line', { class: 'cl-floor', x1: L, x2: W - R, y1: y(line.floor).toFixed(1), y2: y(line.floor).toFixed(1) }));
  if (savePts.length > 1) svg.append(s('polyline', { class: 'cl-line cl-thin viz-5', points: pts(savePts) }));
  if (pastPts.length > 1) svg.append(s('polyline', { class: 'cl-line cl-past', points: pts(pastPts) }));
  if (aheadPts.length > 1) svg.append(s('polyline', { class: 'cl-line viz-3', points: pts(aheadPts) }));
  // The as-of day: a thin line, its label in the top gutter, kept inside the chart.
  if (firstAhead) {
    const ax = x(firstAhead[0]);
    svg.append(s('line', { class: 'cl-today', x1: ax.toFixed(1), x2: ax.toFixed(1), y1: T, y2: H - B }));
    const words = 'As of ' + shortDate(line.asOf).replace(/, \d{4}$/, '');
    svg.append(s('text', { class: 'cl-label', x: Math.min(Math.max(ax, L + 40), W - R - 40).toFixed(1), y: 14, 'text-anchor': 'middle' }, words));
  }
  // Dots: paydays and the biggest bill of a day, on the checking line.
  idx.forEach(([i, d]) => {
    if (d.payday) svg.append(s('circle', { class: 'cl-dot viz-3', cx: x(i).toFixed(1), cy: y(d.checking).toFixed(1), r: 3.5 }));
    else if (d.big) svg.append(s('circle', { class: 'cl-dot viz-1', cx: x(i).toFixed(1), cy: y(d.checking).toFixed(1), r: 3.5 }));
  });
  // Y labels in the left gutter: the top, zero and the bottom, never two closer than 14px.
  const ys = [];
  for (const v of [line.max, 0, line.min]) { const yy = y(v); if (ys.some((o) => Math.abs(o - yy) < 14)) continue; ys.push(yy); svg.append(s('text', { class: 'cl-label', x: L - 6, y: (yy + 4).toFixed(1), 'text-anchor': 'end' }, money(v))); }
  // X labels in the bottom gutter: the first of each month, never two closer than 36px.
  let lastX = -Infinity;
  idx.forEach(([i, d]) => { if (d.date.slice(8) !== '01' && i !== 0) return; const xx = x(i); if (xx - lastX < 36) return; lastX = xx; svg.append(s('text', { class: 'cl-label', x: Math.min(xx, W - R - 14).toFixed(1), y: H - 6, 'text-anchor': i === 0 ? 'start' : 'middle' }, MONTHS[+d.date.slice(5, 7) - 1])); });
  // A hover target per day with its words; the list twin carries the same words for touch and screen readers.
  idx.forEach(([i, d]) => svg.append(s('rect', { class: 'cl-hit', x: (x(i) - half).toFixed(1), y: T, width: Math.max(1, 2 * half).toFixed(1), height: H - T - B }, s('title', {}, dayWords(d)))));
  return svg;
}

export function cashChartCard(line, { back = false, onBack = null, width = 640, preCover = null } = {}) {
  if (!line) return null;
  const legend = [
    ['viz-3', 'Checking, expected'],
    ['cl-sw-past', 'Checking, recorded'],
    ['viz-5', 'Savings (not added in)'],
    ...(line.days.some((d) => d.under) ? [['cl-sw-under', line.floor > 0 ? 'Under the floor of ' + money(line.floor) : 'Below zero']] : [])
  ];
  return h('section', { class: 'card cash-chart', 'aria-labelledby': 'cashline-h' },
    h('h2', { id: 'cashline-h' }, 'Cash by day'),
    h('p', { class: 'tile-sub' }, 'Lowest point: ' + money(preCover && line.low.toppedFrom ? preCover.amount : line.low.amount) + ' on ' + shortDate(preCover && line.low.toppedFrom ? preCover.date : line.low.date) + (line.low.beforePayday ? ', the day before payday' : '') + '.' + (line.low.toppedFrom ? ' The cushion covers it from ' + shortDate(line.low.toppedFrom) + '.' : '')),
    line.backTo ? h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: back ? 'checked' : null, onchange: (e) => onBack && onBack(e.target.checked) }), ' Start at ' + MONTHS[+line.backTo.slice(5, 7) - 1] + ' ' + line.backTo.slice(0, 4)) : null,
    line.setAsideNote ? h('p', { class: 'tile-sub' }, line.setAsideNote + ' It is not in the line.') : null,
    h('div', { class: 'cl-wrap' }, chart(line, width)),
    h('ul', { class: 'cl-legend', 'aria-label': 'What the colors mean' }, legend.map(([c, words]) => h('li', {}, h('span', { class: 'sw ' + c, 'aria-hidden': 'true' }), words)), h('li', {}, h('span', { class: 'cl-sw-dot viz-3', 'aria-hidden': 'true' }), 'Payday'), h('li', {}, h('span', { class: 'cl-sw-dot viz-1', 'aria-hidden': 'true' }), 'A bill of $100 or more')),
    h('details', { class: 'flow-list' }, h('summary', {}, 'Every day as a list (' + line.days.length + ')'), h('ul', {}, line.days.map((d) => h('li', { class: d.under ? 'missing-row' : null }, dayWords(d))))));
}
