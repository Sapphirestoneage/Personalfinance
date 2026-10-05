/* One chart module, eight charts, D3 v7 from the vendored build. Each takes a
   host element and the data its builder in engine/chartdata.js made. Coach
   and Client variants differ in density only (opts.client). Colours come
   from the tokens through CSS classes; no colour alone carries meaning. */
import * as F from '../engine/format.js';
import { h } from './dom.js';

const CLIENT_WORDS = { 'FAT floor': 'Lean month', 'Rule of 5': 'Cash target', 'FI number': 'Enough to live on', 'FI at': 'Could stop working at', 'Lean': 'Lean', 'Fat': 'Fat', 'FI': 'Enough', 'Coast FI': 'coast target', 'Accommodation': 'Housing', 'Needs only': 'Needs only' };
function wordFor(o, term) { return o.client && CLIENT_WORDS[term] ? CLIENT_WORDS[term] : term; }
function cut(t) { return F.shorten(t, 26); }

const d3g = () => globalThis.d3;

function svgIn(host, w, hgt) {
  const d3 = d3g();
  const svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + w + ' ' + hgt).attr('class', 'chart').attr('role', 'img');
  return svg;
}
function needsNote(host, needs) {
  host.appendChild(h('div', { class: 'chart-needs' }, 'Needs ' + needs.join(', ') + '.'));
}

export function render(id, host, data, opts) {
  host.innerHTML = '';
  if (!data || data.needs) { needsNote(host, (data && data.needs) || ['data']); return; }
  const fn = { sankey, netWorth, balanceSheet, debtRace, runway, draftt, fiGauge, waterfall }[id];
  const o = Object.assign({}, opts || {}, { width: Math.max(320, host.clientWidth || 720) });
  if (fn) fn(host, data, o);
}

function sankey(host, d, o) {
  const d3 = d3g(); const W = o.width, H = Math.max(360, d.nodes.length * 28);
  const svg = svgIn(host, W, H);
  const gen = d3.sankey().nodeWidth(12).nodePadding(12).extent([[1, 8], [W - 1, H - 8]]).nodeSort(null);
  const graph = gen({ nodes: d.nodes.map(n => ({ name: n.name })), links: d.links.map(l => ({ source: l.source, target: l.target, value: l.value, kind: l.kind })) });
  svg.append('g').selectAll('path').data(graph.links).join('path').attr('class', l => 'sankey-link kind-' + l.kind).attr('d', d3.sankeyLinkHorizontal()).attr('stroke-width', l => Math.max(1, l.width)).append('title').text(l => l.source.name + ' to ' + l.target.name + ': ' + F.dollarsWhole(l.value) + ' a month');
  const node = svg.append('g').selectAll('g').data(graph.nodes).join('g');
  node.append('rect').attr('x', n => n.x0).attr('y', n => n.y0).attr('height', n => Math.max(1, n.y1 - n.y0)).attr('width', n => n.x1 - n.x0).attr('class', 'sankey-node');
  node.append('text').attr('x', n => n.x0 < W / 2 ? n.x1 + 6 : n.x0 - 6).attr('y', n => (n.y0 + n.y1) / 2).attr('dy', '0.35em').attr('text-anchor', n => n.x0 < W / 2 ? 'start' : 'end').attr('class', 'chart-label').text(n => n.name + ' ' + F.dollarsWhole(n.value));
}

function netWorth(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 320, m = { t: 16, r: 24, b: 32, l: 64 };
  const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, y => y.age)).range([m.l, W - m.r]);
  const lo = Math.min(0, d3.min(d.years, y => y.worst)); const hi = Math.max(d3.max(d.years, y => y.best), d.fiNumber || 0);
  const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(8).tickFormat(v => String(v)));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  svg.append('path').datum(d.years).attr('class', 'band').attr('d', d3.area().x(p => x(p.age)).y0(p => y(p.worst)).y1(p => y(p.best)));
  svg.append('path').datum(d.years).attr('class', 'line series-1').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.likely)));
  if (d.fiNumber) { svg.append('line').attr('class', 'marker').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(d.fiNumber)).attr('y2', y(d.fiNumber)); svg.append('text').attr('class', 'chart-label').attr('x', W - m.r).attr('y', y(d.fiNumber) - 4).attr('text-anchor', 'end').text(wordFor(o, 'FI number') + ' ' + F.dollarsCompact(d.fiNumber)); }
  if (d.fiAges.likely) { svg.append('line').attr('class', 'marker').attr('x1', x(d.fiAges.likely)).attr('x2', x(d.fiAges.likely)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(d.fiAges.likely) + 4).attr('y', m.t + 10).text(wordFor(o, 'FI at') + ' ' + d.fiAges.likely); }
  svg.append('text').attr('class', 'chart-label muted').attr('x', m.l).attr('y', H - 4).text('Age. Band: worst to best real return; line: likely.');
}

function balanceSheet(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 28, rows = [['Assets by bucket', d.buckets], ['Assets by reach', d.tiers], ['Debts', d.debts.map(x => ({ key: x.name, label: x.name, cents: x.cents }))]];
  const H = rows.length * (rowH + 44) + 8; const svg = svgIn(host, W, H);
  const max = Math.max(d.totalAssets, d.totalDebt, 1); const x = d3.scaleLinear().domain([0, max]).range([0, W - 32]);
  rows.forEach(([title, parts], i) => {
    const g = svg.append('g').attr('transform', 'translate(16,' + (i * (rowH + 44) + 8) + ')');
    g.append('text').attr('class', 'chart-label').attr('y', 12).text(title + ' ' + F.dollarsWhole(parts.reduce((s, p) => s + p.cents, 0)));
    let acc = 0;
    parts.filter(p => p.cents > 0).forEach((p, j) => {
      g.append('rect').attr('x', x(acc)).attr('y', 18).attr('width', Math.max(1, x(p.cents))).attr('height', rowH).attr('class', 'bar shade-' + (j % 4) + (title === 'Debts' ? ' debt' : '')).append('title').text(p.label + ' ' + F.dollarsWhole(p.cents));
      if (x(p.cents) > 70) g.append('text').attr('class', 'chart-label on-bar').attr('x', x(acc) + 6).attr('y', 18 + rowH / 2).attr('dy', '0.35em').text(cut(p.label));
      acc += p.cents;
    });
  });
  legend(host, rows.flatMap(([title, parts]) => parts.filter(p => p.cents > 0).map((p, j) => ({ label: (title === 'Debts' ? '' : '') + p.label, text: F.dollarsWhole(p.cents), cls: 'shade-' + (j % 4) }))));
}

function legend(host, items) {
  const shown = items.slice(0, 8);
  const row = h('div', { class: 'legend' }, shown.map(i => h('span', { class: 'chip' }, h('span', { class: 'swatch ' + (i.cls || '') }), cut(i.label) + ' ' + i.text)), items.length > 8 ? h('span', { class: 'small muted' }, 'and ' + (items.length - 8) + ' more') : null);
  host.appendChild(row);
}

function debtRace(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 300, m = { t: 16, r: 40, b: 32, l: 64 };
  const svg = svgIn(host, W, H);
  const x = d3.scalePoint().domain(d.months.map(mm => mm.month)).range([m.l, W - m.r]);
  const maxBal = d3.max(d.months, mm => d3.max(Object.values(mm.balances))) || 1;
  const y = d3.scaleLinear().domain([0, maxBal]).nice().range([H - m.b, m.t]);
  const ticks = d.months.filter((mm, i) => i % Math.max(1, Math.floor(d.months.length / 6)) === 0).map(mm => mm.month);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickValues(ticks).tickFormat(v => F.date(v)));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  d.debts.forEach((db, i) => {
    svg.append('path').datum(d.months).attr('class', 'line shade-' + (i % 4)).attr('d', d3.line().x(mm => x(mm.month)).y(mm => y(mm.balances[db.id] || 0)));
  });
  legend(host, d.debts.map((db, i) => ({ label: db.name, text: F.dollarsWhole(d.months[0].balances[db.id] || 0), cls: 'shade-' + (i % 4) })));
  if (d.debtFree) svg.append('text').attr('class', 'chart-label muted').attr('x', W - m.r).attr('y', m.t + 10).attr('text-anchor', 'end').text('Debt-free ' + F.date(d.debtFree));
}

function runway(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 28, H = d.rungs.length * (rowH + 20) + 40; const svg = svgIn(host, W, H);
  const maxMonths = Math.max(d3.max(d.rungs, r => r.months), d.targetMonths || 0, 1) * 1.05;
  const x = d3.scaleLinear().domain([0, maxMonths]).range([120, W - 190]);
  d.rungs.forEach((r, i) => {
    const g = svg.append('g').attr('transform', 'translate(0,' + (i * (rowH + 20) + 8) + ')');
    g.append('text').attr('class', 'chart-label').attr('x', 0).attr('y', rowH / 2 + 4).text(wordFor(o, r.label));
    g.append('rect').attr('x', x(0)).attr('y', 0).attr('width', Math.max(1, x(r.months) - x(0))).attr('height', rowH).attr('class', 'bar shade-' + i);
    g.append('text').attr('class', 'chart-label').attr('x', W - 182).attr('y', rowH / 2 + 4).text(F.months(r.months) + ' at ' + F.dollarsWhole(r.monthly));
  });
  if (d.targetMonths) { const yEnd = d.rungs.length * (rowH + 20); svg.append('line').attr('class', 'marker').attr('x1', x(d.targetMonths)).attr('x2', x(d.targetMonths)).attr('y1', 0).attr('y2', yEnd); svg.append('text').attr('class', 'chart-label').attr('x', Math.min(x(d.targetMonths), W - 260)).attr('y', yEnd + 16).text(wordFor(o, 'Rule of 5') + ': ' + F.months(d.targetMonths)); }
}

function draftt(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 24, H = d.lines.length * (rowH + 16) + 40; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([0, 0.6]).range([150, W - 150]);
  svg.append('g').attr('transform', 'translate(0,' + (d.lines.length * (rowH + 16) + 12) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickValues([0, 0.2, 0.4, 0.6]).tickFormat(v => Math.round(v * 100) + '%'));
  d.lines.forEach((l, i) => {
    const g = svg.append('g').attr('transform', 'translate(0,' + (i * (rowH + 16) + 8) + ')');
    g.append('text').attr('class', 'chart-label').attr('x', 0).attr('y', rowH / 2 + 4).text(wordFor(o, l.label));
    g.append('rect').attr('x', x(l.band[0])).attr('y', 4).attr('width', x(l.band[1]) - x(l.band[0])).attr('height', rowH - 8).attr('class', 'band-rect');
    if (l.share !== null && l.share !== undefined) {
      const sx = x(Math.min(l.share, 0.6));
      g.append('line').attr('class', 'marker-thick' + (l.share > l.band[1] ? ' amber' : '')).attr('x1', sx).attr('x2', sx).attr('y1', 0).attr('y2', rowH);
      const over = l.share > l.band[1], under = l.share < l.band[0];
      g.append('text').attr('class', 'chart-label').attr('x', W - 142).attr('y', rowH / 2 + 4).text(F.percent(l.share, { rough: d.rough }) + (over ? ', above ' : under ? ', below ' : ', in ') + Math.round(l.band[0] * 100) + '-' + Math.round(l.band[1] * 100) + '%');
    } else g.append('text').attr('class', 'chart-label muted').attr('x', W - 142).attr('y', rowH / 2 + 4).text('needs');
  });
}

function fiGauge(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 96; const svg = svgIn(host, W, H);
  const max = d.levels ? Math.max(d.levels.fat, d.netWorth) : Math.max(d.fiNumber, d.netWorth);
  const x = d3.scaleLinear().domain([0, max]).range([16, W - 16]);
  svg.append('rect').attr('x', x(0)).attr('y', 32).attr('width', x(max) - x(0)).attr('height', 20).attr('class', 'track-rect');
  svg.append('rect').attr('x', x(0)).attr('y', 32).attr('width', Math.max(1, x(Math.max(0, d.netWorth)) - x(0))).attr('height', 20).attr('class', 'bar shade-0');
  const marks = (d.levels ? [['Lean', d.levels.lean], ['FI', d.levels.fi], ['Fat', d.levels.fat]] : [['FI', d.fiNumber]]).map(mk => [wordFor(o, mk[0]), mk[1]]);
  marks.filter(m => m[1]).forEach((mk, i, arr) => { svg.append('line').attr('class', 'marker').attr('x1', x(mk[1])).attr('x2', x(mk[1])).attr('y1', 26).attr('y2', 58); svg.append('text').attr('class', 'chart-label').attr('x', x(mk[1])).attr('y', 20).attr('text-anchor', i === arr.length - 1 ? 'end' : i === 0 && x(mk[1]) < 60 ? 'start' : 'middle').text(mk[0] + ' ' + F.dollarsCompact(mk[1])); });
  svg.append('text').attr('class', 'chart-label').attr('x', 16).attr('y', 78).text(F.percent(d.pct, { rough: d.rough }) + ' of ' + (o.client ? 'enough to live on' : 'the FI number') + (d.coastPct !== null ? '; ' + F.percent(d.coastPct, { rough: d.rough }) + ' of ' + wordFor(o, 'Coast FI') : ''));
}

function waterfall(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 24, H = d.steps.length * (rowH + 16) + 16; const svg = svgIn(host, W, H);
  const max = Math.max(1, d3.max(d.steps, s => s.done + (s.room || 0)));
  const x = d3.scaleLinear().domain([0, max]).range([150, W - 170]);
  d.steps.forEach((s, i) => {
    const g = svg.append('g').attr('transform', 'translate(0,' + (i * (rowH + 16) + 8) + ')');
    g.append('text').attr('class', 'chart-label').attr('x', 0).attr('y', rowH / 2 + 4).text(s.label);
    g.append('rect').attr('x', x(0)).attr('y', 2).attr('width', Math.max(0, x(s.done) - x(0))).attr('height', rowH - 4).attr('class', 'bar shade-0');
    if (s.room) g.append('rect').attr('x', x(s.done)).attr('y', 2).attr('width', Math.max(0, x(s.done + s.room) - x(s.done))).attr('height', rowH - 4).attr('class', 'bar room');
    g.append('text').attr('class', 'chart-label').attr('x', W - 162).attr('y', rowH / 2 + 4).text(F.dollarsWhole(s.done) + (s.room ? ' of ' + F.dollarsWhole(s.done + s.room) : '')).append('title').text(s.taxSaved ? 'Saves about ' + F.dollarsWhole(s.taxSaved) + ' in tax' : '');
  });
}
