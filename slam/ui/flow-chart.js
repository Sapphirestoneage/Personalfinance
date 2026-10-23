// The money-flow diagram (S-192), drawn from engine/flow.js: bands as wide as
// the dollars they carry, from income on the left, through accounts and cards,
// to where it goes on the right. Drawn at the page's own width so the words
// stay readable on a phone. A dashed band rests on a guessed link. Section
// buttons above split a section into its expenses; every place links to its
// Ledger field; the same flows are listed below for reading without the chart.

import { h, money } from './view.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) if (val !== null && val !== undefined) el.setAttribute(k, val);
  for (const k of kids.flat()) if (k !== null && k !== undefined) el.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};
const KIND_CLASS = { spend: 'fl-spend', debt: 'fl-debt', save: 'fl-save', tax: 'fl-tax', left: 'fl-left', short: 'fl-short', account: 'fl-acct', card: 'fl-card', income: 'fl-income' };

// Positions: each column stacks its places top to bottom, sized by dollars.
function layout(flow, width) {
  const nodes = flow.nodes.map((n) => ({ ...n, size: n.amount }));
  const hasCards = nodes.some((n) => n.col === 2);
  const nw = 10, gap = 14;
  const xs = hasCards ? [0, width * 0.26, width * 0.47, width - nw] : [0, width * 0.38, null, width - nw];
  const cols = [0, 1, 2, 3].map((c) => nodes.filter((n) => n.col === c));
  // Dollars to pixels: the fullest column fills the space its places leave free.
  const room = Math.max(320, Math.max(...cols.map((c) => c.length)) * 44);
  const scale = Math.min(...cols.filter((c) => c.length).map((c) => (room - gap * (c.length - 1) - 16 * c.filter((n) => n.size === 0).length) / c.reduce((x, n) => x + n.size, 0)));
  // Each place takes at least a line of text, so small ones do not crowd their labels.
  let height = 0;
  for (const c of cols) { let y = 0; for (const n of c) { n.x = xs[n.col]; n.y = y; n.h = Math.max(2, n.size * scale); y += Math.max(n.h, 16) + gap; } height = Math.max(height, y - gap); }
  // Bands leave and arrive in order of where they go and come from, to cross less.
  const at = new Map(nodes.map((n) => [n.id, n]));
  const outY = new Map(nodes.map((n) => [n.id, n.y])), inY = new Map(nodes.map((n) => [n.id, n.y]));
  const bands = [...flow.links].sort((a, b) => at.get(a.to).y - at.get(b.to).y || at.get(a.from).y - at.get(b.from).y).map((l) => {
    const a = at.get(l.from), b = at.get(l.to), w = Math.max(1, l.amount * scale);
    const y0 = outY.get(a.id); outY.set(a.id, y0 + w);
    return { ...l, a, b, w, y0 };
  });
  for (const band of [...bands].sort((p, q) => p.a.y - q.a.y)) { band.y1 = inY.get(band.b.id); inY.set(band.b.id, band.y1 + band.w); }
  return { nodes, bands, height, nw };
}

function chart(flow, width, onToggle) {
  const { nodes, bands, height, nw } = layout(flow, width);
  const svg = s('svg', { class: 'flow-svg', viewBox: '0 0 ' + width + ' ' + (height + 4), width: '100%', role: 'img', 'aria-label': 'Where the money goes this month' });
  for (const b of bands) {
    const x0 = b.a.x + nw, x1 = b.b.x, xm = (x0 + x1) / 2;
    const d = 'M' + x0 + ',' + b.y0 + ' C' + xm + ',' + b.y0 + ' ' + xm + ',' + b.y1 + ' ' + x1 + ',' + b.y1 + ' L' + x1 + ',' + (b.y1 + b.w) + ' C' + xm + ',' + (b.y1 + b.w) + ' ' + xm + ',' + (b.y0 + b.w) + ' ' + x0 + ',' + (b.y0 + b.w) + ' Z';
    svg.append(s('path', { d, class: 'fl-band ' + (KIND_CLASS[b.b.kind] || '') + (b.rough ? ' fl-rough' : '') }, s('title', {}, b.a.label + ' to ' + b.b.label + ': ' + money(b.amount, true) + ' a month' + (b.rough ? ' (a guessed route)' : ''))));
  }
  for (const n of nodes) {
    const right = n.col === 3;
    // A place that opens something says so: › for a Ledger field, + or - for a section.
    const label = n.label + ' ' + money(n.amount) + (n.path ? ' ›' : n.section ? (n.open ? ' -' : ' +') : '');
    const g = s('g', { class: 'fl-node ' + (KIND_CLASS[n.kind] || '') },
      s('rect', { x: n.x, y: n.y, width: nw, height: n.h, rx: 2 }),
      s('text', { x: right ? n.x - 6 : n.x + nw + 6, y: n.y + Math.min(n.h / 2, 18) + 4, 'text-anchor': right ? 'end' : 'start' }, label));
    if (n.section && !n.path) { g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', 'Split ' + n.label + ' into its expenses'); g.classList.add('fl-tap'); g.addEventListener('click', () => onToggle(n.section)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(n.section); } }); }
    svg.append(n.path ? s('a', { href: 'ledger.html#' + encodeURIComponent(n.path) }, g) : g);
  }
  return svg;
}

// The section: buttons that split or join each section, the chart, a legend, the list.
export function flowSection(flow, { open, onToggle, month }) {
  const wrap = h('section', { class: 'card flow', id: 'flow', 'aria-labelledby': 'flow-h' },
    h('h2', { id: 'flow-h' }, 'Where the money goes in ' + month));
  if (flow.problem) { wrap.append(h('p', { class: 'muted' }, flow.problem)); return wrap; }
  const secs = [...new Set(flow.nodes.filter((n) => n.section).map((n) => n.section))];
  wrap.append(
    h('p', { class: 'muted' }, 'Bands are as wide as the dollars. Dashed bands go through your main checking as a guess until you link where a bill is paid from in the Ledger.'),
    h('div', { class: 'flow-secs', role: 'group', 'aria-label': 'Split a section into its expenses' }, secs.map((sec) => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(open.includes(sec)), onclick: () => onToggle(sec) }, (open.includes(sec) ? 'Join ' : 'Split ') + flow.sections[sec]))),
    h('div', { class: 'flow-box' }),
    h('p', { class: 'flow-total muted' }, flow.short > 0 ? money(flow.short, true) + ' a month more goes out than comes in; it comes from what is in your accounts.' : money(flow.left, true) + ' a month is left over.'),
    h('details', { class: 'flow-list' }, h('summary', {}, 'See it as a list'),
      h('ul', {}, flow.links.map((l) => { const a = flow.nodes.find((n) => n.id === l.from), b = flow.nodes.find((n) => n.id === l.to); return h('li', {}, a.label + ' to ' + b.label + ': ' + money(l.amount, true) + ' a month' + (l.rough ? ' (guessed route)' : '')); }))));
  // Drawn once the section is on the page, at its real width.
  requestAnimationFrame(() => { const box = wrap.querySelector('.flow-box'); if (box) box.append(chart(flow, Math.max(300, Math.round(box.clientWidth)), onToggle)); });
  return wrap;
}
