/* The What matters renderers (MR-098): paired bars, the quadrant and the mind
   map. The sankey reuses the cash-flow sankey in charts.js. D3 from the
   vendored build; colours from the tokens through classes. */
import * as F from '../engine/format.js';

function d3g() { return window.d3; }
function svgIn(host, w, hgt) { const svg = d3g().select(host).append('svg').attr('viewBox', '0 0 ' + w + ' ' + hgt).attr('width', '100%').attr('role', 'img'); return svg; }
const cut = (t, n) => F.shorten(t, n || 22);

function priorityBars(host, d, o) {
  const d3 = d3g(); const W = o.width; const rowH = 26; const H = 30 + d.rows.length * rowH + 24; const mid = W / 2; const lab = Math.min(170, W * 0.26); const barW = (W - lab * 2 - 40) / 2;
  const svg = svgIn(host, W, H);
  svg.append('text').attr('x', mid - 20 - barW / 2).attr('y', 16).attr('text-anchor', 'middle').attr('class', 'chart-label').text(o.client ? 'What you rank first' : 'By rank');
  svg.append('text').attr('x', mid + 20 + barW / 2).attr('y', 16).attr('text-anchor', 'middle').attr('class', 'chart-label').text(o.client ? 'What the money ranks first' : 'By spending');
  const rows = d.rows.slice().sort((a, b) => a.rank - b.rank);
  rows.forEach((r, i) => {
    const y = 30 + i * rowH;
    svg.append('text').attr('x', mid - 20 - barW - 6).attr('y', y + 16).attr('text-anchor', 'end').attr('class', 'chart-label').text(r.rank + '. ' + cut(r.title, 20)).append('title').text(r.title);
    svg.append('rect').attr('x', mid - 20 - barW * r.importance).attr('y', y + 4).attr('width', barW * r.importance).attr('height', rowH - 8).attr('class', 'bar rank');
    svg.append('rect').attr('x', mid + 20).attr('y', y + 4).attr('width', barW * r.spendScore).attr('height', rowH - 8).attr('class', 'bar spend' + (r.gap !== null && r.gap < -2 ? ' mismatch' : ''));
    svg.append('text').attr('x', mid + 20 + barW * r.spendScore + 6).attr('y', y + 16).attr('class', 'chart-label small').text(r.spendRank === null ? 'nothing tied' : '#' + r.spendRank + ', ' + F.dollarsWhole(r.tied)).append('title').text(r.title + ': ' + F.dollarsWhole(r.tied) + ' a month');
  });
  svg.append('text').attr('x', mid).attr('y', H - 6).attr('text-anchor', 'middle').attr('class', 'chart-label small').text('Not tied to a priority: ' + F.dollarsWhole(d.untied) + ' of ' + F.dollarsWhole(d.total) + ' a month');
}

function priorityQuadrant(host, d, o) {
  const d3 = d3g(); const W = o.width; const H = Math.max(300, Math.min(420, W * 0.6)); const m = { t: 20, r: 20, b: 36, l: 44 };
  const svg = svgIn(host, W, H);
  const maxShare = Math.max(0.2, ...d.points.map(p => p.costShare)) * 1.1;
  const x = d3.scaleLinear().domain([0, maxShare]).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
  const cheapX = x(Math.min(maxShare, d.cheapShare)); const topY = y(d.topShare);
  svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(0, cheapX - m.l)).attr('height', Math.max(0, topY - m.t)).attr('class', 'quad cheap');
  svg.append('line').attr('x1', cheapX).attr('x2', cheapX).attr('y1', m.t).attr('y2', H - m.b).attr('class', 'grid-line');
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', topY).attr('y2', topY).attr('class', 'grid-line');
  svg.append('text').attr('x', m.l + 4).attr('y', m.t + 12).attr('class', 'chart-label small').text('Cheap wins');
  svg.append('text').attr('x', W - m.r - 4).attr('y', H - m.b - 6).attr('text-anchor', 'end').attr('class', 'chart-label small').text('Expensive, low on the list');
  svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 8).attr('text-anchor', 'middle').attr('class', 'chart-label').text('Cost a month, ' + d.scaleLabel);
  svg.append('text').attr('transform', 'translate(12,' + (H / 2) + ') rotate(-90)').attr('text-anchor', 'middle').attr('class', 'chart-label').text('Importance');
  [0, 0.1, 0.2, 0.3, 0.5].filter(v => v <= maxShare).forEach(v => svg.append('text').attr('x', x(v)).attr('y', H - m.b + 14).attr('text-anchor', 'middle').attr('class', 'chart-label small').text(Math.round(v * 100) + '%'));
  const pt = svg.append('g').selectAll('g').data(d.points).join('g').attr('transform', p => 'translate(' + x(Math.min(maxShare, p.costShare)) + ',' + y(p.importance) + ')');
  pt.append('circle').attr('r', p => 6 + Math.min(10, Math.sqrt(Math.max(0, p.tied) / 10000))).attr('class', p => 'dot' + (p.cheapWin ? ' cheap' : '') + (p.mismatch ? ' mismatch' : '') + (p.priced ? '' : ' rough'));
  pt.append('text').attr('x', 10).attr('y', 4).attr('class', 'chart-label small').text(p => p.rank + '. ' + cut(p.title, 18));
  pt.append('title').text(p => p.title + ': ' + F.dollarsWhole(p.cost) + ' a month' + (p.priced ? '' : ' (what is tied; no price given)') + ', rank ' + p.rank);
}

function priorityMap(host, d, o) {
  const d3 = d3g(); const W = o.width; const H = Math.max(320, Math.min(460, W * 0.62)); const cx = W / 2, cy = H / 2; const r = Math.min(W, H) / 2 - 70;
  const svg = svgIn(host, W, H);
  const n = d.nodes.length; const pos = {};
  d.nodes.forEach((nd, i) => { const a = -Math.PI / 2 + (i / n) * 2 * Math.PI; pos[nd.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });
  svg.append('g').selectAll('line').data(d.links).join('line').attr('x1', l => pos[l.source].x).attr('y1', l => pos[l.source].y).attr('x2', l => pos[l.target].x).attr('y2', l => pos[l.target].y).attr('class', l => 'map-link ' + (l.conflict ? 'conflict' : l.type)).append('title').text(l => l.type + (l.kind ? ' (' + l.kind + ')' : '') + ', ' + l.origin);
  const g = svg.append('g').selectAll('g').data(d.nodes).join('g').attr('transform', nd => 'translate(' + pos[nd.id].x + ',' + pos[nd.id].y + ')');
  g.append('circle').attr('r', nd => 14 + Math.min(14, Math.sqrt(Math.max(0, nd.tied) / 10000))).attr('class', nd => 'map-node ' + nd.polarity + (nd.rank <= 5 ? ' top' : ''));
  g.append('text').attr('y', 4).attr('text-anchor', 'middle').attr('class', 'map-rank').text(nd => String(nd.rank));
  g.append('text').attr('y', nd => 20 + Math.min(14, Math.sqrt(Math.max(0, nd.tied) / 10000)) + 10).attr('text-anchor', 'middle').attr('class', 'chart-label small').text(nd => cut(nd.title, 18));
  g.append('title').text(nd => nd.title + (nd.tied ? ': ' + F.dollarsWhole(nd.tied) + ' a month tied' : ''));
  if (!d.links.length) svg.append('text').attr('x', cx).attr('y', H - 10).attr('text-anchor', 'middle').attr('class', 'chart-label small').text(o.client ? 'No lines between them yet' : 'Draw the lines on the Connect step');
}

export const MATTERS_RENDERERS = { priorityBars, priorityQuadrant, priorityMap };
