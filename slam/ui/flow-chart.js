// The money-flow diagram (S-192, redrawn by DESIGN.md): bands as wide as the
// dollars they carry, from income on the left, through accounts and cards, to
// where it goes on the right. Labels sit in gutters beside the chart, never on
// a band; text is ink, never a data color; a legend names the colors; guessed
// routes are lighter with a dashed edge. Below 600px the same flows show as a
// bar list, which reads on a phone. The list twin under both has every flow
// with a link to its Ledger field.

import { h, money } from './view.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) if (val !== null && val !== undefined) el.setAttribute(k, val);
  for (const k of kids.flat()) if (k !== null && k !== undefined) el.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};
// Categories (fixed order, validated in light and dark): one color per kind of destination.
const CAT = { spend: 'viz-1', debt: 'viz-2', save: 'viz-3', left: 'viz-3', tax: 'viz-4', short: 'viz-5' };
const LEGEND = [['viz-1', 'Spending'], ['viz-2', 'Debt payments'], ['viz-3', 'Saving and left over'], ['viz-4', 'Tax'], ['viz-5', 'Taken from what you have']];
const NARROW = 600;

// ---------------------------------------------------------------- wide: the Sankey
function layout(flow, width) {
  const nodes = flow.nodes.map((n) => ({ ...n }));
  const hasCards = nodes.some((n) => n.col === 2);
  const nw = 8, gutL = 170, gutR = 170, gap = 24;
  const inner = width - gutL - gutR;
  const xs = hasCards ? [gutL, gutL + inner * 0.38, gutL + inner * 0.7, width - gutR - nw] : [gutL, gutL + inner * 0.5, null, width - gutR - nw];
  const cols = [0, 1, 2, 3].map((c) => nodes.filter((n) => n.col === c));
  const room = Math.max(300, Math.max(...cols.map((c) => c.length)) * 46);
  const scale = Math.min(...cols.filter((c) => c.length).map((c) => (room - gap * (c.length - 1)) / c.reduce((x, n) => x + n.amount, 0)));
  // Middle columns keep a line of room above each place for its label.
  const top = (c) => (c === 1 || c === 2 ? 18 : 0);
  let height = 0;
  // Cards start two lines down, so their labels clear the account label above them.
  for (const c of cols) { let y = c.length && c[0].col === 2 ? 36 : 0; for (const n of c) { y += top(n.col); n.x = xs[n.col]; n.y = y; n.h = Math.max(3, n.amount * scale); y += n.h + gap; } height = Math.max(height, y - gap); }
  const at = new Map(nodes.map((n) => [n.id, n]));
  const outY = new Map(nodes.map((n) => [n.id, n.y])), inY = new Map(nodes.map((n) => [n.id, n.y]));
  const bands = [...flow.links].sort((a, b) => at.get(a.to).y - at.get(b.to).y || at.get(a.from).y - at.get(b.from).y).map((l) => {
    const a = at.get(l.from), b = at.get(l.to), w = Math.max(1, l.amount * scale);
    const y0 = outY.get(a.id); outY.set(a.id, y0 + w);
    return { ...l, a, b, w, y0 };
  });
  for (const band of [...bands].sort((p, q) => p.a.y - q.a.y || p.y0 - q.y0)) { band.y1 = inY.get(band.b.id); inY.set(band.b.id, band.y1 + band.w); }
  return { nodes, bands, height, nw };
}

function sankey(flow, width, onToggle) {
  const { nodes, bands, height, nw } = layout(flow, width);
  const svg = s('svg', { class: 'flow-svg', viewBox: '0 0 ' + width + ' ' + (height + 6), width: '100%', role: 'img', 'aria-label': 'Where the money goes this month; the same flows are listed below the chart' });
  // The destination's color carries each band; a lighter band with a dashed edge is a guessed route.
  for (const b of bands) {
    const x0 = b.a.x + nw, x1 = b.b.x, xm = (x0 + x1) / 2;
    const d = 'M' + x0 + ',' + b.y0 + ' C' + xm + ',' + b.y0 + ' ' + xm + ',' + b.y1 + ' ' + x1 + ',' + b.y1 + ' L' + x1 + ',' + (b.y1 + b.w) + ' C' + xm + ',' + (b.y1 + b.w) + ' ' + xm + ',' + (b.y0 + b.w) + ' ' + x0 + ',' + (b.y0 + b.w) + ' Z';
    const cat = CAT[b.b.kind] || CAT[b.a.kind] || 'viz-0';
    svg.append(s('path', { d, class: 'fl-band ' + cat + (b.rough ? ' fl-rough' : '') }, s('title', {}, b.a.label + ' to ' + b.b.label + ': ' + money(b.amount, true) + ' a month' + (b.rough ? ' (a guessed route)' : ''))));
  }
  for (const n of nodes) {
    const cat = CAT[n.kind];
    const g = s('g', { class: 'fl-node' }, s('rect', { x: n.x, y: n.y, width: nw, height: n.h, rx: 2, class: cat ? 'fl-bar ' + cat : 'fl-bar fl-pass' }));
    // Labels: left gutter for income, right gutter for destinations, above the bar in the middle.
    const name = n.label, amt = money(n.amount);
    const mid = n.y + Math.min(n.h / 2, 14);
    if (n.col === 0) g.append(s('text', { x: n.x - 8, y: mid - 2, 'text-anchor': 'end', class: 'fl-name' }, name), s('text', { x: n.x - 8, y: mid + 12, 'text-anchor': 'end', class: 'fl-amt' }, amt));
    else if (n.col === 3) {
      const tap = n.section && !n.path;
      g.append(s('text', { x: n.x + nw + 8, y: mid - 2, class: 'fl-name' }, name + (tap ? (n.open ? '  −' : '  +') : '')), s('text', { x: n.x + nw + 8, y: mid + 12, class: 'fl-amt' }, amt + ' a month'));
      if (tap) {
        g.classList.add('fl-tap');
        g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', (n.open ? 'Join ' : 'Split ') + name);
        g.prepend(s('rect', { x: n.x - 4, y: n.y - 4, width: 180, height: Math.max(n.h + 8, 44), class: 'fl-hit' }));
        g.addEventListener('click', () => onToggle(n.section));
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(n.section); } });
      }
    } else if (n.col === 2) g.append(s('text', { x: n.x + nw, y: n.y - 6, 'text-anchor': 'end', class: 'fl-name fl-small' }, name + '  ' + amt));
    else g.append(s('text', { x: n.x, y: n.y - 6, class: 'fl-name fl-small' }, name + '  ' + amt));
    svg.append(g);
  }
  return svg;
}

// ---------------------------------------------------------------- narrow: a bar list
function barList(flow, onToggle) {
  const ins = flow.nodes.filter((n) => n.col === 0), outs = flow.nodes.filter((n) => n.col === 3);
  const max = Math.max(...flow.nodes.filter((n) => n.col === 0 || n.col === 3).map((n) => n.amount));
  const row = (n) => {
    const tap = n.section && !n.path;
    const head = h('div', { class: 'fb-head' }, h('span', { class: 'fb-name' }, n.label), h('span', { class: 'fb-amt' }, money(n.amount) + ' a month'));
    const bar = h('div', { class: 'fb-track' }, h('div', { class: 'fb-bar ' + (CAT[n.kind] || 'fl-pass'), style: 'width:' + Math.max(2, Math.round(n.amount / max * 100)) + '%' }));
    return tap ? h('li', {}, h('button', { type: 'button', class: 'fb-row fb-tap', 'aria-expanded': String(!!n.open), onclick: () => onToggle(n.section) }, head, bar, h('span', { class: 'fb-more' }, n.open ? 'Join' : 'Split into expenses')))
      : h('li', {}, h('div', { class: 'fb-row' }, head, bar));
  };
  const through = flow.nodes.filter((n) => n.col === 1 || n.col === 2);
  return h('div', { class: 'flow-bars' },
    h('h3', { class: 'fb-h' }, 'Comes in'), h('ul', { class: 'fb-list' }, ins.map(row)),
    through.length ? h('p', { class: 'muted fb-through' }, 'Through ' + through.map((n) => n.label + ' (' + money(n.amount) + ')').join(', ') + '.') : null,
    h('h3', { class: 'fb-h' }, 'Goes out'), h('ul', { class: 'fb-list' }, outs.map(row)));
}

// ---------------------------------------------------------------- the section
export function flowSection(flow, { open, onToggle, month }) {
  const wrap = h('section', { class: 'card flow', id: 'flow', 'aria-labelledby': 'flow-h' },
    h('h2', { id: 'flow-h' }, 'Where the money goes in ' + month));
  if (flow.problem) { wrap.append(h('p', { class: 'muted' }, flow.problem)); return wrap; }
  const secs = [...new Set(flow.nodes.filter((n) => n.section).map((n) => n.section))];
  const used = new Set(flow.nodes.map((n) => CAT[n.kind]).filter(Boolean));
  const name = (id) => flow.nodes.find((n) => n.id === id);
  wrap.append(
    h('p', { class: 'flow-total' }, flow.short > 0 ? money(flow.short, true) + ' a month more goes out than comes in.' : money(flow.left, true) + ' a month is left over.'),
    h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' },
      LEGEND.filter(([c]) => used.has(c)).map(([c, t]) => h('li', {}, h('span', { class: 'sw ' + c, 'aria-hidden': 'true' }), t)),
      flow.links.some((l) => l.rough) ? h('li', {}, h('span', { class: 'sw sw-rough', 'aria-hidden': 'true' }), 'Lighter: a guessed route (main checking until you link it)') : null),
    h('div', { class: 'flow-secs', role: 'group', 'aria-label': 'Split a section into its expenses' }, secs.map((sec) => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(open.includes(sec)), onclick: () => onToggle(sec) }, (open.includes(sec) ? 'Join ' : 'Split ') + flow.sections[sec]))),
    h('div', { class: 'flow-box' }),
    h('details', { class: 'flow-list' }, h('summary', {}, 'Every flow, with links to the Ledger'),
      h('ul', {}, flow.links.map((l) => { const a = name(l.from), b = name(l.to), p = b.path || a.path; return h('li', {}, p ? h('a', { href: 'ledger.html#' + encodeURIComponent(p) }, a.label + ' to ' + b.label) : a.label + ' to ' + b.label, ': ' + money(l.amount, true) + ' a month' + (l.rough ? ' (guessed route)' : '')); }))));
  // Drawn once the section is on the page, at its real width.
  requestAnimationFrame(() => {
    const box = wrap.querySelector('.flow-box');
    if (!box) return;
    const w = Math.round(box.clientWidth);
    // The phone form has its own split rows, so the buttons above would say it twice.
    if (w < NARROW) wrap.querySelector('.flow-secs')?.setAttribute('hidden', '');
    box.append(w < NARROW ? barList(flow, onToggle) : sankey(flow, w, onToggle));
  });
  return wrap;
}
