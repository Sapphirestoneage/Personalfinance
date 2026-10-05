/* The orbit map (MR-010): one large centre circle, satellites on a ring with
   spokes, a dashed outer orbit, labels under the circles, counts inside, and
   a confidence ring on each satellite. Click or Enter steps inside. Pure
   SVG from data; no math beyond geometry. */
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  Object.keys(attrs || {}).forEach(k => { if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]); });
  children.forEach(c => { if (c === null || c === undefined) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}

const GEOM = {
  wide: { w: 760, h: 620, cx: 380, cy: 300, centerR: 104, ring: 218, satR: 46, outer: 282, label: 13, count: 18, title: 22, sub: 12 },
  compact: { w: 390, h: 456, cx: 195, cy: 212, centerR: 66, ring: 142, satR: 32, outer: 184, label: 12, count: 14, title: 16, sub: 11 },
};

function arc(cx, cy, r, fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return '';
  if (f >= 0.999) return 'M ' + (cx) + ' ' + (cy - r) + ' a ' + r + ' ' + r + ' 0 1 1 -0.01 0';
  const a = -Math.PI / 2 + f * 2 * Math.PI;
  const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
  return 'M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 ' + (f > 0.5 ? 1 : 0) + ' 1 ' + x.toFixed(2) + ' ' + y.toFixed(2);
}

function wrapLabel(text, max) {
  if (text.length <= max) return [text];
  const words = text.split(' ');
  const lines = [''];
  words.forEach(w => {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim();
  });
  return lines.slice(0, 2);
}

/* opts: { center: { title, sub, fill }, items: [{ id, label, count, fill, badge }], compact, onOpen(id), onFocus(id) } */
export function orbitMap(opts) {
  const g = opts.compact ? GEOM.compact : GEOM.wide;
  const svg = s('svg', { viewBox: '0 0 ' + g.w + ' ' + g.h, class: 'orbit', role: 'group', 'aria-label': opts.ariaLabel || 'Map' });
  svg.appendChild(s('circle', { cx: g.cx, cy: g.cy, r: g.outer, class: 'orbit-outer' }));
  svg.appendChild(s('circle', { cx: g.cx, cy: g.cy, r: g.ring, class: 'orbit-ring' }));
  const n = opts.items.length;
  const positions = opts.items.map((it, i) => {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    return { x: g.cx + g.ring * Math.cos(a), y: g.cy + g.ring * Math.sin(a) };
  });
  positions.forEach(p => svg.appendChild(s('line', { x1: g.cx, y1: g.cy, x2: p.x.toFixed(1), y2: p.y.toFixed(1), class: 'orbit-spoke' })));

  /* centre */
  const centre = s('g', { class: 'orbit-centre' });
  centre.appendChild(s('circle', { cx: g.cx, cy: g.cy, r: g.centerR, class: 'orbit-centre-disc' }));
  if (typeof opts.center.fill === 'number') {
    centre.appendChild(s('circle', { cx: g.cx, cy: g.cy, r: g.centerR + 5, class: 'orbit-track' }));
    centre.appendChild(s('path', { d: arc(g.cx, g.cy, g.centerR + 5, opts.center.fill), class: 'orbit-fill' }));
  }
  const titleLines = wrapLabel(opts.center.title, opts.compact ? 12 : 16);
  titleLines.forEach((line, i) => centre.appendChild(s('text', { x: g.cx, y: g.cy - (titleLines.length - 1) * (g.title * 0.6) + i * g.title * 1.2 - (opts.center.sub ? g.sub * 0.6 : 0) + g.title * 0.35, 'text-anchor': 'middle', class: 'orbit-title', style: 'font-size:' + g.title + 'px' }, line)));
  if (opts.center.sub) centre.appendChild(s('text', { x: g.cx, y: g.cy + g.title * 0.9 + g.sub * 0.8, 'text-anchor': 'middle', class: 'orbit-sub', style: 'font-size:' + g.sub + 'px' }, opts.center.sub));
  svg.appendChild(centre);

  /* satellites */
  opts.items.forEach((it, i) => {
    const p = positions[i];
    const grp = s('g', { class: 'orbit-sat' + (it.selected ? ' selected' : '') + (it.dashed ? ' dashed' : ''), role: 'button', tabindex: '0', 'aria-label': it.label + (it.count !== undefined && it.count !== null ? ', ' + it.count + (it.count === 1 ? ' row' : ' rows') : ''), 'data-id': it.id });
    grp.appendChild(s('circle', { cx: p.x, cy: p.y, r: g.satR, class: 'orbit-disc' }));
    if (typeof it.fill === 'number' && !it.dashed) {
      grp.appendChild(s('circle', { cx: p.x, cy: p.y, r: g.satR + 4, class: 'orbit-track' }));
      grp.appendChild(s('path', { d: arc(p.x, p.y, g.satR + 4, it.fill), class: 'orbit-fill' + (it.attention ? ' amber' : '') }));
    }
    const inner = it.count !== undefined && it.count !== null ? String(it.count) : (it.glyph || '');
    grp.appendChild(s('text', { x: p.x, y: p.y + g.count * 0.36, 'text-anchor': 'middle', class: 'orbit-count', style: 'font-size:' + g.count + 'px' }, inner));
    const lines = wrapLabel(it.label, opts.compact ? 13 : 18);
    lines.forEach((line, li) => grp.appendChild(s('text', { x: p.x, y: p.y + g.satR + 8 + g.label * (li + 1) + li * 2, 'text-anchor': 'middle', class: 'orbit-label', style: 'font-size:' + g.label + 'px' }, line)));
    if (it.badge) grp.appendChild(s('text', { x: p.x, y: p.y + g.satR + 8 + g.label * (lines.length + 1) + lines.length * 2, 'text-anchor': 'middle', class: 'orbit-badge', style: 'font-size:' + (g.label - 1) + 'px' }, it.badge));
    grp.addEventListener('click', () => opts.onOpen && opts.onOpen(it.id));
    grp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onOpen && opts.onOpen(it.id); } });
    grp.addEventListener('focus', () => opts.onFocus && opts.onFocus(it.id));
    grp.addEventListener('mouseenter', () => opts.onFocus && opts.onFocus(it.id));
    svg.appendChild(grp);
  });
  return svg;
}

/* The panel under the map: title, a status line, and actions. */
export function mapPanel(opts) {
  return h('div', { class: 'mapbar' },
    h('div', { class: 'mapbar-text' },
      h('h2', null, opts.title),
      h('p', { class: 'muted small' }, opts.status)),
    h('div', { class: 'mapbar-actions' }, opts.actions || []));
}
