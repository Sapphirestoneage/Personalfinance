/* Renderers for the 22 charts of Part C (MR-061). D3 v7 from the vendored
   build; one palette from ui/tokens.css through CSS classes; every svg
   carries a name; nothing here computes a number, the builders in
   engine/chartdata-more.js did. Coach and Client differ in words only. */
import * as F from '../engine/format.js';
import { h } from './dom.js';

const d3g = () => globalThis.d3;
function svgIn(host, w, hgt) { return d3g().select(host).append('svg').attr('viewBox', '0 0 ' + w + ' ' + hgt).attr('class', 'chart').attr('role', 'img'); }
function legend(host, items) {
  host.appendChild(h('div', { class: 'legend' }, items.slice(0, 8).map(i => h('span', { class: 'chip' }, h('span', { class: 'swatch ' + (i.cls || '') }), i.label + (i.text ? ' ' + i.text : ''))), items.length > 8 ? h('span', { class: 'small muted' }, 'and ' + (items.length - 8) + ' more') : null));
}
const cut = (t, n) => F.shorten(t, n || 26);
function axes(svg, x, y, W, H, m, o) {
  o = o || {};
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3g().axisBottom(x).ticks(o.xTicks || 8).tickFormat(o.xf || (v => String(v))));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3g().axisLeft(y).ticks(o.yTicks || 5).tickFormat(o.yf || (v => F.dollarsCompact(v))));
}
function note(svg, W, H, m, text) { svg.append('text').attr('class', 'chart-label muted').attr('x', m.l).attr('y', H - 4).text(text); }
/* horizontal bars: rows [{ label, value, text, cls }] */
function hbars(host, rows, o) {
  const d3 = d3g(); const W = o.width, rowH = o.rowH || 28;
  const labelChars = Math.max(...rows.map(r => cut(r.label, 24).length), 4), textChars = Math.max(...rows.map(r => String(r.text || '').length), 4);
  const m = { t: 8, r: Math.min(Math.round(W * 0.34), 12 + textChars * 6.6), b: 24, l: Math.min(Math.round(W * 0.4), 12 + labelChars * 6.6) };
  const H = m.t + rows.length * rowH + m.b; const svg = svgIn(host, W, H);
  const max = Math.max(d3.max(rows, r => r.max !== undefined ? r.max : r.value) || 1, 1e-9);
  const x = d3.scaleLinear().domain([0, max]).range([m.l, W - m.r]);
  rows.forEach((r, i) => {
    const y = m.t + i * rowH;
    svg.append('text').attr('class', 'chart-label').attr('x', m.l - 8).attr('y', y + rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text(cut(r.label, 24));
    if (r.max !== undefined) svg.append('rect').attr('class', 'bar room').attr('x', x(0)).attr('y', y + 6).attr('width', Math.max(0, x(r.max) - x(0))).attr('height', rowH - 12);
    svg.append('rect').attr('class', 'bar ' + (r.cls || 'shade-0')).attr('x', x(0)).attr('y', y + 6).attr('width', Math.max(1, x(Math.max(0, r.value)) - x(0))).attr('height', rowH - 12).append('title').text(r.label + ': ' + r.text);
    svg.append('text').attr('class', 'chart-label').attr('x', x(Math.max(0, r.max !== undefined ? r.max : r.value)) + 6).attr('y', y + rowH / 2).attr('dy', '0.35em').text(r.text);
  });
  return svg;
}
function donut(host, slices, o) {
  const d3 = d3g(); const W = o.width, size = Math.min(220, W), H = size; const svg = svgIn(host, W, H);
  const g = svg.append('g').attr('transform', 'translate(' + (size / 2) + ',' + (size / 2) + ')');
  const pie = d3.pie().value(s => s.cents).sort(null); const arc = d3.arc().innerRadius(size * 0.3).outerRadius(size * 0.46);
  g.selectAll('path').data(pie(slices)).join('path').attr('d', arc).attr('class', (s, i) => 'bar shade-' + (i % 4)).append('title').text(s => s.data.label + ': ' + F.dollarsWhole(s.data.cents) + ' (' + F.percent(s.data.share, { places: 0 }) + ')');
  if (o.centre) { g.append('text').attr('class', 'chart-label').attr('text-anchor', 'middle').attr('y', -4).text(o.centre[0]); if (o.centre[1]) g.append('text').attr('class', 'chart-label muted').attr('text-anchor', 'middle').attr('y', 12).text(o.centre[1]); }
  legend(host, slices.map((s, i) => ({ label: s.label, text: F.percent(s.share, { places: 0 }), cls: 'shade-' + (i % 4) })));
  return svg;
}
function stackedArea(host, years, series, o) {
  const d3 = d3g(); const W = o.width, H = o.height || 300, m = { t: 16, r: 24, b: 32, l: 64 }; const svg = svgIn(host, W, H);
  const keys = series.map(s => s.key);
  const stack = d3.stack().keys(keys)(years);
  const x = d3.scaleLinear().domain(d3.extent(years, y => y.age)).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(stack[stack.length - 1] || [[0, 0]], p => p[1]) || 1]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m);
  svg.selectAll('.area-layer').data(stack).join('path').attr('class', (s, i) => 'area-layer bar shade-' + (i % 4)).attr('d', d3.area().x(p => x(p.data.age)).y0(p => y(p[0])).y1(p => y(p[1])));
  if (o.fiAge) { svg.append('line').attr('class', 'marker').attr('x1', x(o.fiAge)).attr('x2', x(o.fiAge)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(o.fiAge) + 4).attr('y', m.t + 10).text('FI at ' + o.fiAge); }
  legend(host, series.map((s, i) => ({ label: s.label, text: '', cls: 'shade-' + (i % 4) })));
  return svg;
}

/* a */
function savingsRateCurve(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 300, m = { t: 16, r: 24, b: 36, l: 48 }; const svg = svgIn(host, W, H);
  const pts = d.points.filter(p => p.years !== null).map(p => ({ rate: p.rate, years: Math.min(d.maxYears, p.years) }));
  const x = d3.scaleLinear().domain([0.05, 0.9]).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d.maxYears]).range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xf: v => Math.round(v * 100) + '%', yf: v => v + ' yrs', xTicks: 6 });
  svg.append('path').datum(pts).attr('class', 'line series-1').attr('d', d3.line().x(p => x(p.rate)).y(p => y(p.years)).curve(d3.curveMonotoneX));
  if (d.own.rate !== null && d.own.years !== null) { const cx = x(Math.max(0.05, Math.min(0.9, d.own.rate))), cy = y(Math.min(d.maxYears, d.own.years)); svg.append('circle').attr('class', 'dot you').attr('cx', cx).attr('cy', cy).attr('r', 7).append('title').text('You: ' + F.percent(d.own.rate, { places: 0 }) + ' saved, ' + d.own.years + ' years'); svg.append('text').attr('class', 'chart-label').attr('x', cx + 10).attr('y', cy - 8).text((o.client ? 'You: ' : 'Today: ') + F.percent(d.own.rate, { places: 0 }) + ', ' + d.own.years + ' yrs'); }
  note(svg, W, H, m, 'Share of take-home saved against years to FI at the likely return; the curve starts from what is there today.');
}
/* b */
function fiLadderLines(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 340, m = { t: 16, r: 110, b: 32, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, y => y.age)).range([m.l, W - m.r]);
  const top = Math.max(d3.max(d.years, y => y.likely), d3.max(d.rungs, r => r.number)) * 1.08;
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(d.years, yy => yy.worst)), top]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m);
  svg.append('path').datum(d.years).attr('class', 'band').attr('d', d3.area().x(p => x(p.age)).y0(p => y(Math.max(y.domain()[0], p.worst))).y1(p => y(Math.min(top, p.best))));
  svg.append('path').datum(d.years).attr('class', 'line series-1').attr('d', d3.line().x(p => x(p.age)).y(p => y(Math.min(top, p.likely))));
  const sorted = d.rungs.slice().sort((a, b) => y(a.number) - y(b.number)); let lastY = -Infinity;
  sorted.forEach(r => { let ly = y(r.number); if (ly < lastY + 12) ly = lastY + 12; r._ly = ly; lastY = ly; });
  d.rungs.forEach((r, i) => {
    svg.append('line').attr('class', 'marker' + (r.dashed ? ' gold' : '')).attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(r.number)).attr('y2', y(r.number));
    svg.append('text').attr('class', 'chart-label').attr('x', W - m.r + 6).attr('y', r._ly).attr('dy', '0.35em').text(cut(r.label, 14) + (r.reachedAge !== null ? ' at ' + Math.round(r.reachedAge) : ''));
    if (r.reachedAge !== null && r.reachedAge <= x.domain()[1]) svg.append('circle').attr('class', 'dot').attr('cx', x(r.reachedAge)).attr('cy', y(r.number)).attr('r', 4);
  });
  note(svg, W, H, m, 'Net worth, likely path with the band from worst to best; each rung is a line, the dot where the path crosses it.');
}
/* c */
function netWorthStacked(host, d, o) { stackedArea(host, d.years, d.series, Object.assign({}, o, { fiAge: d.fiAge })); host.appendChild(h('div', { class: 'suggest' }, d.note)); }
/* d */
function milestones(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 170, m = { t: 60, r: 16, b: 50, l: 16 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([d.age, Math.max(d.endAge, 70)]).range([m.l + 8, W - m.r - 8]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(8).tickFormat(v => String(v)));
  svg.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', H - m.b - 20).attr('y2', H - m.b - 20);
  /* labels take the first lane (two above, two below) where they do not touch the previous label in that lane */
  const lanes = [cy => cy - 14, cy => cy - 28, cy => cy + 24, cy => cy + 38].map(fn => ({ fn, right: -Infinity }));
  d.items.forEach(it => {
    const cx = x(Math.min(x.domain()[1], Math.max(d.age, it.age))); const cy = H - m.b - 20;
    svg.append('circle').attr('class', 'dot' + (it.big ? ' you' : it.reached ? ' done' : it.fixed ? ' fixed' : '')).attr('cx', cx).attr('cy', cy).attr('r', it.big ? 8 : 5).append('title').text(it.label + ' at ' + it.age);
    const text = /\d$/.test(it.label) ? it.label : it.label + ' ' + Math.round(it.age); const w = text.length * 6.2;
    let tx = cx, anchor = 'middle'; if (cx - w / 2 < m.l) { tx = m.l; anchor = 'start'; } else if (cx + w / 2 > W - m.r) { tx = W - m.r; anchor = 'end'; }
    const left = anchor === 'middle' ? tx - w / 2 : anchor === 'start' ? tx : tx - w;
    let lane = lanes.find(l => left > l.right + 6) || lanes.reduce((a, b) => (a.right < b.right ? a : b)); lane.right = left + w;
    svg.append('text').attr('class', 'chart-label' + (it.big ? '' : ' muted')).attr('x', tx).attr('y', lane.fn(cy)).attr('text-anchor', anchor).text(text);
  });
  svg.append('text').attr('class', 'chart-label').attr('x', x(d.age)).attr('y', 14).attr('text-anchor', 'start').text((o.client ? 'You today, ' : 'Today, ') + d.age);
}
/* e */
function tornado(host, d, o) {
  hbars(host, d.items.map((it, i) => ({ label: it.label, value: it.months, text: F.months ? F.months(it.months) : Math.round(it.months) + ' mo', cls: it.assumption ? 'shade-3' : 'shade-' + (i % 2) })), o);
  host.appendChild(h('div', { class: 'suggest' }, 'Months the FI date moves per standard shock ($100 a month, 10% of a balance, one point of a rate, one year of an age). FI today at ' + d.fiAge + '.'));
}
/* f */
function paycheckWaterfall(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 340, m = { t: 16, r: 16, b: 76, l: 64 }; const svg = svgIn(host, W, H);
  let run = 0; const bars = d.steps.map(s => { const start = s.kind === 'total' ? 0 : run; const end = s.kind === 'total' ? s.cents : run + s.cents; run = s.kind === 'total' ? s.cents : end; return Object.assign({}, s, { y0: Math.min(start, end), y1: Math.max(start, end) }); });
  const x = d3.scaleBand().domain(bars.map(b => b.key)).range([m.l, W - m.r]).padding(0.25);
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(bars, b => b.y0)), d3.max(bars, b => b.y1)]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  svg.selectAll('.wf').data(bars).join('rect').attr('class', b => 'bar wf ' + (b.kind === 'total' ? 'shade-0' : b.kind === 'tax' ? 'shade-3' : b.kind === 'saving' ? 'shade-1' : 'shade-2')).attr('x', b => x(b.key)).attr('width', x.bandwidth()).attr('y', b => y(b.y1)).attr('height', b => Math.max(1, y(b.y0) - y(b.y1))).append('title').text(b => b.label + ': ' + F.dollarsWhole(Math.abs(b.cents)) + ' a year');
  const SHORT = { gross: 'Gross', federal: 'Federal', fica: 'FICA', se: 'SE tax', pretax: 'Pre-tax', take: 'Take-home', spend: 'Spending', left: 'Left' };
  const narrow = x.bandwidth() < 64;
  svg.selectAll('.wfl').data(bars).join('text').attr('class', 'chart-label wfl').attr('x', b => x(b.key) + x.bandwidth() / 2).attr('y', (b, i) => H - m.b + 14 + (narrow && i % 2 ? 24 : 0)).attr('text-anchor', 'middle').text(b => narrow ? (SHORT[b.key] || cut(b.label, 10)) : cut(b.label, 16));
  svg.selectAll('.wfv').data(bars).join('text').attr('class', 'chart-label muted wfv').attr('x', b => x(b.key) + x.bandwidth() / 2).attr('y', (b, i) => H - m.b + 26 + (narrow && i % 2 ? 24 : 0)).attr('text-anchor', 'middle').text(b => F.dollarsCompact(Math.abs(b.cents)));
  note(svg, W, H, m, 'A year of pay' + (d.rough ? ', rough' : '') + '.');
}
/* g */
function spendingTreemap(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 300; const svg = svgIn(host, W, H);
  const root = d3.hierarchy({ children: d.cells }).sum(c => c.cents).sort((a, b) => b.value - a.value);
  d3.treemap().size([W, H]).paddingInner(3)(root);
  const g = svg.selectAll('g').data(root.leaves()).join('g').attr('transform', l => 'translate(' + l.x0 + ',' + l.y0 + ')');
  g.append('rect').attr('class', l => 'bar ' + (l.data.kind === 'want' ? 'shade-1' : 'shade-0')).attr('width', l => Math.max(0, l.x1 - l.x0)).attr('height', l => Math.max(0, l.y1 - l.y0)).attr('rx', 3).append('title').text(l => l.data.label + (l.data.kind === 'want' ? ' (wants)' : ' (needs)') + ': ' + F.dollarsWhole(l.data.cents) + ' a month');
  g.filter(l => l.x1 - l.x0 > 56 && l.y1 - l.y0 > 28).append('text').attr('class', 'chart-label on-bar').attr('x', 6).attr('y', 14).text(l => cut(l.data.label, Math.floor((l.x1 - l.x0) / 7)));
  g.filter(l => l.x1 - l.x0 > 56 && l.y1 - l.y0 > 40).append('text').attr('class', 'chart-label on-bar').attr('x', 6).attr('y', 28).text(l => F.dollarsCompact(l.data.cents));
  legend(host, [{ label: 'Needs', text: F.dollarsWhole(d.needs_), cls: 'shade-0' }, { label: 'Wants', text: F.dollarsWhole(d.wants), cls: 'shade-1' }].concat(d.fatFloor ? [{ label: (o.client ? 'Lean month' : 'FAT floor'), text: F.dollarsWhole(d.fatFloor), cls: 'none' }] : []));
}
/* h */
function drafttBullets(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 34, m = { t: 8, r: 72, b: 8, l: Math.min(150, Math.round(W * 0.3)) }; const H = m.t + d.lines.length * rowH + m.b; const svg = svgIn(host, W, H);
  d.lines.forEach((l, i) => {
    const y = m.t + i * rowH; const x = d3.scaleLinear().domain([0, l.max]).range([m.l, W - m.r]);
    svg.append('text').attr('class', 'chart-label').attr('x', m.l - 8).attr('y', y + rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text(l.label);
    svg.append('rect').attr('class', 'band-rect').attr('x', x(l.low)).attr('y', y + 6).attr('width', Math.max(1, x(l.high) - x(l.low))).attr('height', rowH - 12);
    const inBand = l.share >= l.low && l.share <= l.high;
    svg.append('rect').attr('class', 'bar ' + (inBand ? 'shade-0' : 'shade-3')).attr('x', x(0)).attr('y', y + 12).attr('width', Math.max(1, x(l.share) - x(0))).attr('height', rowH - 24).append('title').text(l.label + ' ' + F.percent(l.share, { places: 1 }) + ', healthy ' + F.percent(l.low, { places: 0 }) + ' to ' + F.percent(l.high, { places: 0 }));
    svg.append('text').attr('class', 'chart-label').attr('x', W - m.r + 6).attr('y', y + rowH / 2).attr('dy', '0.35em').text(F.percent(l.share, { places: 1 }));
  });
  legend(host, [{ label: 'Healthy range', text: '', cls: 'band' }, { label: 'In range', text: '', cls: 'shade-0' }, { label: 'Outside', text: '', cls: 'shade-3' }]);
}
/* i */
function debtCompared(host, d, o) {
  const rows = d.orders.filter(x => x.months !== null).map(x => ({ label: x.label, value: x.months, text: x.months + ' months, ' + F.dollarsWhole(x.interest) + ' interest', cls: x.key === d.best ? 'shade-0' : 'shade-2' }));
  if (!rows.length) { host.appendChild(h('div', { class: 'chart-needs' }, 'No order clears the debts within fifty years at the minimums.')); return; }
  hbars(host, rows, Object.assign({}, o, { rowH: 36 }));
  const best = d.orders.find(x => x.key === d.best);
  if (best) host.appendChild(h('div', { class: 'suggest' }, 'Least interest: ' + best.label.toLowerCase() + ' (' + best.order.join(', then ') + ').'));
}
/* j */
function taxBucketMix(host, d, o) {
  donut(host, d.today, Object.assign({}, o, { centre: [F.dollarsCompact(d.total), 'today'] }));
  if (d.years && d.series) { const sub = h('div', { class: 'chart-sub' }); host.appendChild(sub); stackedArea(sub, d.years, d.series.filter(s => s.key !== 'cash').concat(d.series.filter(s => s.key === 'cash')), Object.assign({}, o, { height: 220 })); }
}
/* k */
function allocationDonut(host, d, o) { donut(host, d.slices, Object.assign({}, o, { centre: [F.percent(d.slices.find(s => s.key === 'stocks') ? d.slices.find(s => s.key === 'stocks').share : 0, { places: 0 }), 'stocks'] })); if (d.usShare !== null && d.usShare !== undefined) host.appendChild(h('div', { class: 'suggest' }, 'US share of stocks ' + F.percent(d.usShare, { places: 0 }) + '.')); }
/* l */
function runwayStaircase(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 240, m = { t: 24, r: 16, b: 44, l: 48 }; const svg = svgIn(host, W, H);
  const steps = d.steps.slice().sort((a, b) => a.months - b.months);
  const x = d3.scaleBand().domain(steps.map(s => s.key)).range([m.l, W - m.r]).padding(0.3);
  const y = d3.scaleLinear().domain([0, Math.max(d3.max(steps, s => s.months), d.targetMonths || 0) * 1.1 || 1]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => v + ' mo'));
  svg.selectAll('.st').data(steps).join('rect').attr('class', (s, i) => 'bar st shade-' + (i % 4)).attr('x', s => x(s.key)).attr('width', x.bandwidth()).attr('y', s => y(s.months)).attr('height', s => Math.max(1, y(0) - y(s.months))).append('title').text(s => s.label + ': ' + F.months(s.months) + ' at ' + F.dollarsWhole(s.monthly) + ' a month');
  svg.selectAll('.stl').data(steps).join('text').attr('class', 'chart-label stl').attr('x', s => x(s.key) + x.bandwidth() / 2).attr('y', H - m.b + 14).attr('text-anchor', 'middle').text(s => cut(o.client && s.key === 'fat' ? 'Lean month' : s.label, 18));
  svg.selectAll('.stv').data(steps).join('text').attr('class', 'chart-label stv').attr('x', s => x(s.key) + x.bandwidth() / 2).attr('y', s => y(s.months) - 4).attr('text-anchor', 'middle').text(s => F.months(s.months));
  if (d.targetMonths) { svg.append('line').attr('class', 'marker gold').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(d.targetMonths)).attr('y2', y(d.targetMonths)); svg.append('text').attr('class', 'chart-label muted').attr('x', W - m.r).attr('y', y(d.targetMonths) - 4).attr('text-anchor', 'end').text((o.client ? 'Cash target ' : 'Rule of 5 ') + F.months(d.targetMonths)); }
  note(svg, W, H, m, 'Cash ' + F.dollarsWhole(d.cash) + ' divided by a month of spending at each level.');
}
/* m */
function ruleOf5Gauge(host, d, o) {
  const d3 = d3g(); const W = o.width, size = Math.min(260, W), H = size * 0.62 + 24; const svg = svgIn(host, W, H);
  const g = svg.append('g').attr('transform', 'translate(' + (W / 2) + ',' + (size * 0.56) + ')');
  const arc = d3.arc().innerRadius(size * 0.34).outerRadius(size * 0.48).startAngle(-Math.PI / 2);
  g.append('path').attr('class', 'gauge-track').attr('d', arc({ endAngle: Math.PI / 2 }));
  g.append('path').attr('class', 'gauge-fill').attr('d', arc({ endAngle: -Math.PI / 2 + Math.PI * Math.min(1, d.pct || 0) }));
  g.append('text').attr('class', 'chart-label big').attr('text-anchor', 'middle').attr('y', -8).text(F.percent(Math.min(1, d.pct || 0), { places: 0 }) + ' of target');
  g.append('text').attr('class', 'chart-label muted').attr('text-anchor', 'middle').attr('y', 12).text(F.dollarsWhole(d.cash) + ' of ' + F.dollarsWhole(d.target));
  host.appendChild(h('div', { class: 'suggest' }, (d.gap > 0 ? 'Gap ' + F.dollarsWhole(d.gap) + (d.monthlyToClose ? '; ' + F.dollarsWhole(d.monthlyToClose) + ' a month closes it in a year.' : '.') : 'Target reached.') + (d.roommateGap ? ' Includes ' + F.dollarsWhole(d.roommateGap) + ' for a roommate leaving.' : '') + ' Target: ' + F.months(d.months) + ' of spending (age over five).'));
}
/* n */
function contributionRoom(host, d, o) { hbars(host, d.rows.map(r => ({ label: r.label, value: r.used, max: r.limit, text: F.dollarsWhole(r.left) + ' left', cls: 'shade-0' })), o); host.appendChild(h('div', { class: 'suggest' }, 'Used this year against the 2026 limits.')); }
/* o */
function incomeByType(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 64; const svg = svgIn(host, W, H); const x = d3.scaleLinear().domain([0, d.total || 1]).range([0, W]);
  let run = 0; d.parts.forEach((p, i) => { svg.append('rect').attr('class', 'bar shade-' + (i % 4)).attr('x', x(run)).attr('y', 8).attr('width', Math.max(1, x(p.cents))).attr('height', 32).attr('rx', 3).append('title').text(p.label + ': ' + F.dollarsWhole(p.cents) + ' a month (' + F.percent(p.share, { places: 0 }) + ')'); if (x(p.cents) > 60) svg.append('text').attr('class', 'chart-label on-bar').attr('x', x(run) + 6).attr('y', 28).text(cut(p.label, Math.floor(x(p.cents) / 7))); run += p.cents; });
  svg.append('text').attr('class', 'chart-label muted').attr('x', 0).attr('y', 58).text(F.dollarsWhole(d.total) + ' a month before tax' + (d.rough ? ', rough' : ''));
  legend(host, d.parts.map((p, i) => ({ label: p.label, text: F.percent(p.share, { places: 0 }), cls: 'shade-' + (i % 4) })));
}
/* p */
function feeDrag(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 300, m = { t: 16, r: 24, b: 32, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, y => y.age)).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d3.max(d.years, yy => yy.without) || 1]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m);
  svg.append('path').datum(d.years).attr('class', 'band').attr('d', d3.area().x(p => x(p.age)).y0(p => y(p.withFees)).y1(p => y(p.without)));
  svg.append('path').datum(d.years).attr('class', 'line shade-3').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.without)));
  svg.append('path').datum(d.years).attr('class', 'line series-1').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.withFees)));
  legend(host, [{ label: 'With today\'s fees (' + F.percent(d.er, { places: 2 }) + ')', text: '', cls: 'line-1' }, { label: 'Without fees', text: '', cls: 'line-3' }]);
  host.appendChild(h('div', { class: 'suggest' }, 'Gap at 95: ' + F.dollarsWhole(d.costAt95 || 0) + (d.lifetime ? '; fee drag over a lifetime ' + F.dollarsWhole(d.lifetime) : '') + '.'));
}
/* q */
function guardrails(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 300, m = { t: 16, r: 24, b: 32, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, y => y.age)).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d3.max(d.years, yy => Math.max(yy.upper, yy.spend)) || 1]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m);
  svg.append('path').datum(d.years).attr('class', 'band').attr('d', d3.area().x(p => x(p.age)).y0(p => y(p.lower)).y1(p => y(p.upper)));
  svg.append('path').datum(d.years).attr('class', 'line shade-3').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.carry)));
  svg.append('path').datum(d.years).attr('class', 'line series-1').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.spend)));
  legend(host, [{ label: 'Spending after Social Security', text: '', cls: 'line-1' }, { label: 'What the portfolio carries at ' + F.percent(d.wr, { places: 1 }), text: '', cls: 'line-3' }, { label: 'Guardrails ' + F.percent(d.band, { places: 0 }) + ' either side', text: '', cls: 'band' }]);
}
/* r */
function coastCurve(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 300, m = { t: 16, r: 24, b: 32, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([d.points[0].age, d.retirementAge]).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d.fiNumber * 1.05]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m);
  svg.append('path').datum(d.points).attr('class', 'line series-1').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.needed)).curve(d3.curveMonotoneX));
  if (d.basis !== null && d.basis !== undefined) { svg.append('line').attr('class', 'marker').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(Math.min(d.fiNumber, d.basis))).attr('y2', y(Math.min(d.fiNumber, d.basis))); svg.append('text').attr('class', 'chart-label').attr('x', m.l + 4).attr('y', y(Math.min(d.fiNumber, d.basis)) - 4).text((o.client ? 'You have ' : 'Today ') + F.dollarsCompact(d.basis)); }
  if (d.coastAge !== null) svg.append('circle').attr('class', 'dot you').attr('cx', x(d.coastAge)).attr('cy', y(d.points.find(p => p.age === d.coastAge).needed)).attr('r', 6).append('title').text('Coast from ' + d.coastAge);
  note(svg, W, H, m, 'The amount that grows to the FI number by ' + d.retirementAge + ' with nothing added; ' + F.percent(d.pct || 0, { places: 0 }) + ' of today\'s coast number is there.');
}
/* s */
function healthcareBridge(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 200, m = { t: 20, r: 16, b: 32, l: 56 }; const svg = svgIn(host, W, H);
  if (!d.years.length) { host.innerHTML = ''; host.appendChild(h('div', { class: 'chart-needs' }, 'FI lands at or after 65: no bridge years to cover.')); return; }
  const x = d3.scaleBand().domain(d.years.map(y => String(y.age))).range([m.l, W - m.r]).padding(0.2); const y = d3.scaleLinear().domain([0, d.monthly * 12 * 1.2]).range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickValues(x.domain().filter((v, i) => i % Math.ceil(x.domain().length / 8) === 0)));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(v => F.dollarsCompact(v)));
  svg.selectAll('.hb').data(d.years).join('rect').attr('class', 'bar hb shade-2').attr('x', yy => x(String(yy.age))).attr('width', x.bandwidth()).attr('y', yy => y(yy.cents)).attr('height', yy => y(0) - y(yy.cents)).append('title').text(yy => 'Age ' + yy.age + ': ' + F.dollarsWhole(yy.cents));
  svg.append('text').attr('class', 'chart-label').attr('x', m.l).attr('y', 12).text(d.count + ' years from ' + d.fiAge + ' to 65 at ' + F.dollarsWhole(d.monthly) + ' a month: ' + F.dollarsWhole(d.total) + ' (assumption)');
}
/* t */
function hoursOfWork(host, d, o) { hbars(host, d.rows.map((r, i) => ({ label: r.label, value: r.hours, text: r.hours + ' hrs', cls: 'shade-' + (i % 2) })), o); host.appendChild(h('div', { class: 'suggest' }, 'Hours of work a month at the real hourly wage of ' + F.dollarsWhole(d.hourly) + (d.stated ? ' (stated ' + F.dollarsWhole(d.stated) + ')' : '') + '.')); }
/* u */
function gutDreamActual(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 30, m = { t: 8, r: 24, b: 28, l: Math.min(140, Math.round(W * 0.28)) }; const H = m.t + d.rows.length * rowH + m.b; const svg = svgIn(host, W, H);
  const hi = d3.max(d.rows.flatMap(r => [r.gut, r.dream, r.actual].filter(v => v !== null && v !== undefined))) || 1;
  const x = d3.scaleLinear().domain([0, hi * 1.08]).range([m.l, W - m.r]);
  const kinds = [['gut', o.client ? 'What you said' : 'Gut', 'mark-gut'], ['actual', o.client ? 'What it really is' : 'Actual', 'mark-actual'], ['dream', o.client ? 'What you would want' : 'Dream', 'mark-dream']];
  d.rows.forEach((r, i) => {
    const y = m.t + i * rowH + rowH / 2; const g = svg.append('g');
    g.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y);
    const vals = [r.gut, r.dream, r.actual].filter(v => v !== null && v !== undefined); if (vals.length > 1) g.append('line').attr('class', 'mark-span').attr('x1', x(Math.min(...vals))).attr('x2', x(Math.max(...vals))).attr('y1', y).attr('y2', y);
    g.append('text').attr('class', 'chart-label').attr('x', m.l - 8).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(cut(r.label));
    kinds.forEach(([k, name, cls]) => { if (r[k] === null || r[k] === undefined) return; g.append('circle').attr('class', cls).attr('cx', x(r[k])).attr('cy', y).attr('r', k === 'actual' ? 7 : 5).append('title').text(r.label + ', ' + name + ': ' + F.dollarsWhole(r[k])); });
  });
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b + 4) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  legend(host, kinds.map(([k, name, cls]) => ({ label: name, text: '', cls })));
}
/* v */
function benchmarks(host, d, o) {
  const rows = []; d.bars.forEach(b => { rows.push({ label: b.label + ': expected', value: b.expect || 0, text: b.expect ? F.dollarsWhole(b.expect) : 'needs income', cls: 'shade-3' }); rows.push({ label: 'Net worth today', value: b.have, text: F.dollarsWhole(b.have) + (b.ratio !== null ? ' (' + F.percent(b.ratio, { places: 0 }) + ')' : ''), cls: 'shade-0' }); });
  hbars(host, rows, Object.assign({}, o, { rowH: 26 }));
  host.appendChild(h('div', { class: 'suggest' }, 'Rules of thumb, not targets; the salary multiple is a looked-up table to verify.'));
}

export const MORE_RENDERERS = { savingsRateCurve, fiLadderLines, netWorthStacked, milestones, tornado, paycheckWaterfall, spendingTreemap, drafttBullets, debtCompared, taxBucketMix, allocationDonut, runwayStaircase, ruleOf5Gauge, contributionRoom, incomeByType, feeDrag, guardrails, coastCurve, healthcareBridge, hoursOfWork, gutDreamActual, benchmarks };

/* a tiny line for a tile: values in order, no axes */
export function sparkline(values, o) {
  o = o || {}; const W = o.width || 96, H = o.height || 24; const vals = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1;
  const pts = vals.map((v, i) => (i / (vals.length - 1) * (W - 2) + 1).toFixed(1) + ',' + (H - 2 - (v - min) / span * (H - 4)).toFixed(1)).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'sparkline'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<polyline points="' + pts + '"/>' + (o.markX !== undefined && o.markX !== null ? '<circle cx="' + (o.markX / (vals.length - 1) * (W - 2) + 1).toFixed(1) + '" cy="' + (H - 2 - (vals[Math.min(vals.length - 1, Math.max(0, Math.round(o.markX)))] - min) / span * (H - 4)).toFixed(1) + '" r="2.5"/>' : '');
  return svg;
}
