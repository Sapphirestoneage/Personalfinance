/* One chart module, eight charts, D3 v7 from the vendored build. Each takes a
   host element and the data its builder in engine/chartdata.js made. Coach
   and Client variants differ in density only (opts.client). Colours come
   from the tokens through CSS classes; no colour alone carries meaning. */
import * as F from '../engine/format.js';
import { ALL_CHARTS as CHARTS } from '../engine/charts-all.js';
import { MORE_RENDERERS } from './charts-more.js';
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
  if (!data || data.needs) { needsNote(host, (data && data.needs) || ['data']); if (data && data.waiting) host.lastChild.classList.add('waiting'); return; }
  const fn = Object.assign({ sankey, netWorth, balanceSheet, debtRace, runway, draftt, fiGauge, waterfall, paths, taxes, markers }, MORE_RENDERERS)[id];
  const o = Object.assign({}, opts || {}, { width: Math.max(320, host.clientWidth || 720) });
  if (fn) fn(host, data, o);
  const def = CHARTS.find(c => c.id === id);
  const name = (opts && opts.title) || (def ? (opts && opts.client ? def.client : def.name) : id);
  host.querySelectorAll('svg[role="img"]:not([aria-label])').forEach(el => el.setAttribute('aria-label', name + ' chart'));
}

function sankey(host, d, o) {
  const d3 = d3g(); const W = o.width, H = Math.max(360, d.nodes.length * 28);
  const svg = svgIn(host, W, H);
  const gen = d3.sankey().nodeWidth(12).nodePadding(14).extent([[1, 8], [W - 1, H - 8]]).nodeSort(null);
  const graph = gen({ nodes: d.nodes.map(n => ({ name: n.name })), links: d.links.map(l => ({ source: l.source, target: l.target, value: l.value, kind: l.kind })) });
  svg.append('g').selectAll('path').data(graph.links).join('path').attr('class', l => 'sankey-link kind-' + l.kind).attr('d', d3.sankeyLinkHorizontal()).attr('stroke-width', l => Math.max(1, l.width)).append('title').text(l => l.source.name + ' to ' + l.target.name + ': ' + F.dollarsWhole(l.value) + ' a month');
  const node = svg.append('g').selectAll('g').data(graph.nodes).join('g');
  node.append('rect').attr('x', n => n.x0).attr('y', n => n.y0).attr('height', n => Math.max(1, n.y1 - n.y0)).attr('width', n => n.x1 - n.x0).attr('class', 'sankey-node');
  node.append('text').attr('x', n => n.x0 < W / 2 ? n.x1 + 6 : n.x0 - 6).attr('y', n => (n.y0 + n.y1) / 2).attr('dy', '0.35em').attr('text-anchor', n => n.x0 < W / 2 ? 'start' : 'end').attr('class', 'chart-label').text(n => (n.y1 - n.y0) >= 12 ? n.name + ' ' + F.dollarsWhole(n.value) : '').append('title').text(n => n.name + ' ' + F.dollarsWhole(n.value));
}

function netWorth(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 320, m = { t: 16, r: 24, b: 32, l: 64 };
  const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, y => y.age)).range([m.l, W - m.r]);
  const lo = Math.min(0, d3.min(d.years, y => y.worst)); const hi = Math.max(d3.max(d.years, y => y.likely) * 1.25, (d.fiNumber || 0) * 1.1);
  const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(8).tickFormat(v => String(v)));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  svg.append('path').datum(d.years).attr('class', 'band').attr('d', d3.area().x(p => x(p.age)).y0(p => y(Math.max(lo, Math.min(hi, p.worst)))).y1(p => y(Math.max(lo, Math.min(hi, p.best)))));
  svg.append('path').datum(d.years).attr('class', 'line series-1').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.likely)));
  if (d.fiNumber) { svg.append('line').attr('class', 'marker').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(d.fiNumber)).attr('y2', y(d.fiNumber)); svg.append('text').attr('class', 'chart-label').attr('x', W - m.r).attr('y', y(d.fiNumber) - 4).attr('text-anchor', 'end').text(wordFor(o, 'FI number') + ' ' + F.dollarsCompact(d.fiNumber)); }
  if (d.fiAges.likely) { svg.append('line').attr('class', 'marker').attr('x1', x(d.fiAges.likely)).attr('x2', x(d.fiAges.likely)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(d.fiAges.likely) + 4).attr('y', m.t + 10).text(wordFor(o, 'FI at') + ' ' + d.fiAges.likely); }
  const asm = d.asm || {};
  const pct = v => F.percent(v, { places: 0 });
  svg.append('text').attr('class', 'chart-label muted').attr('x', m.l).attr('y', H - 4).text(o.client
    ? 'Age. In today\'s dollars, growing about ' + pct(asm.returnLikely) + ' a year after inflation.'
    : 'Age. Today\'s dollars. Line ' + pct(asm.returnLikely) + ' a year after inflation; band ' + pct(asm.returnWorst) + ' to ' + pct(asm.returnBest) + '.');
}

/* Scenario paths: today's path, each block alone, all together (one chart module, no private copies). */
function paths(host, d, o) {
  const d3 = d3g(); const W = o.width, H = W < 480 ? 200 : 240, m = { t: 16, r: 24, b: 32, l: 64 };
  const svg = svgIn(host, W, H);
  const series = [{ cls: 'path-today', path: d.baseline.path, name: 'Today\'s path' }]
    .concat(d.alone.map(a => ({ cls: 'path-alone', path: a.path, name: a.name + ' alone' })))
    .concat([{ cls: 'path-together', path: d.together.path, name: 'All together' }]);
  const all = series.flatMap(s => s.path.map(p => p.netWorth));
  const x = d3.scaleLinear().domain(d3.extent(d.baseline.path, p => p.age)).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(all)), d3.max(all)]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(8).tickFormat(v => String(v)));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  series.forEach(s => svg.append('path').datum(s.path).attr('class', 'line ' + s.cls).attr('d', d3.line().x(p => x(p.age)).y(p => y(p.netWorth))).append('title').text(s.name));
  svg.append('text').attr('class', 'chart-label muted').attr('x', m.l).attr('y', H - 4).text('Age. Net worth in today\'s dollars, growing ' + F.percent((d.asm || {}).returnLikely, { places: 0 }) + ' a year after inflation.');
  legend(host, [{ label: 'Today\'s path', text: '', cls: 'path-today' }, { label: 'Each alone', text: '', cls: 'path-alone' }, { label: 'All together', text: '', cls: 'path-together' }]);
}

/* Tax ladder: gross pay at the top, each deduction and each bracket a rung, what is left at the bottom. */
function taxes(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 22, gap = 10, labelW = Math.min(220, Math.max(140, W * 0.3)), valueW = 120;
  const pct = r => F.percent(r, { places: 0 });
  const rows = [
    { label: o.client ? 'Pay for the year' : 'Gross pay, a year', value: d.gross, cls: 'shade-0', kind: 'total' },
    d.pretax ? { label: o.client ? 'Saved before tax (401k, HSA, benefits)' : 'Pre-tax deductions', value: -d.pretax, cls: 'room', kind: 'minus' } : null,
    { label: 'Standard deduction', value: -Math.min(d.standardDeduction, Math.max(0, d.gross - d.pretax)), cls: 'room', kind: 'minus' },
    { label: 'Taxable income', value: d.taxable, cls: 'shade-1', kind: 'total' },
  ].filter(Boolean);
  d.brackets.forEach(b => rows.push({ label: pct(b.rate) + ' on ' + F.dollarsCompact(b.amount) + (o.client ? '' : ' (' + F.dollarsCompact(b.from) + ' to ' + F.dollarsCompact(b.to) + ')'), value: b.tax, cls: 'shade-2', kind: 'tax', share: b.amount / Math.max(1, d.taxable) }));
  rows.push({ label: o.client ? 'Federal income tax' : 'Federal tax (' + pct(d.effective) + ' of gross, ' + pct(d.marginal) + ' on the next dollar)', value: d.federal, cls: 'shade-3', kind: 'total' });
  rows.push({ label: 'Social Security and Medicare' + (d.selfEmployment ? ', both halves on self-employment' : ''), value: d.fica.total + d.selfEmployment, cls: 'shade-3', kind: 'tax' });
  rows.push({ label: o.client ? 'What reaches you (before state tax)' : 'Left after federal tax and FICA (before state tax)', value: d.takeHome, cls: 'shade-1', kind: 'total' });
  const H = rows.length * (rowH + gap) + 12; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([0, Math.max(1, d.gross)]).range([labelW, W - valueW]);
  let cursor = d.gross;
  rows.forEach((r, i) => {
    const g = svg.append('g').attr('transform', 'translate(0,' + (i * (rowH + gap) + 6) + ')');
    g.append('text').attr('class', 'chart-label' + (r.kind === 'total' ? '' : ' muted')).attr('x', 0).attr('y', rowH / 2 + 4).text(F.shorten(r.label, Math.round(labelW / 6)));
    let x0, x1;
    if (r.kind === 'total') { x0 = x(0); x1 = x(Math.max(0, r.value)); cursor = Math.max(0, r.value); }
    else if (r.kind === 'minus') { x1 = x(cursor); cursor = Math.max(0, cursor + r.value); x0 = x(cursor); }
    else { x0 = x(0); x1 = x(Math.max(0, r.value)); }
    g.append('rect').attr('x', Math.min(x0, x1)).attr('y', 2).attr('width', Math.max(1, Math.abs(x1 - x0))).attr('height', rowH - 4).attr('class', 'bar ' + r.cls).append('title').text(r.label + ': ' + F.dollarsWhole(Math.abs(r.value)));
    g.append('text').attr('class', 'chart-label').attr('x', W - valueW + 8).attr('y', rowH / 2 + 4).text((r.kind === 'minus' ? '-' : '') + F.dollarsWhole(Math.abs(r.value), { rough: d.rough && r.kind === 'total' }));
  });
  svg.append('text').attr('class', 'chart-label muted').attr('x', 0).attr('y', H - 2).text(o.client ? 'Federal only, a year. Bars run against your pay for the year.' : 'Federal brackets and FICA for the year; no state tax. Bars run against gross pay.');
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

/* Three markers on one line per area: what they said, what it really is, what they'd want (Level 8, MR-049). */
function markers(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 30, m = { t: 8, r: 24, b: 28, l: Math.min(140, Math.round(W * 0.28)) };
  const rows = d.rows.filter(r => r.gut !== null || r.dream !== null || r.actual !== null);
  const H = m.t + rows.length * rowH + m.b;
  const svg = svgIn(host, W, H);
  const hi = d3.max(rows.flatMap(r => [r.gut, r.dream, r.actual].filter(v => v !== null && v !== undefined))) || 1;
  const x = d3.scaleLinear().domain([0, hi * 1.08]).range([m.l, W - m.r]);
  const kinds = [['gut', 'What you said', 'mark-gut'], ['actual', 'What it really is', 'mark-actual'], ['dream', "What you'd want", 'mark-dream']];
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + rowH / 2;
    const g = svg.append('g');
    g.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y);
    if (r.gut !== null && r.actual !== null) g.append('line').attr('class', 'mark-span').attr('x1', x(Math.min(r.gut, r.actual))).attr('x2', x(Math.max(r.gut, r.actual))).attr('y1', y).attr('y2', y);
    g.append('text').attr('class', 'chart-label').attr('x', m.l - 8).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(cut(r.label));
    kinds.forEach(([k, name, cls]) => { if (r[k] === null || r[k] === undefined) return; g.append('circle').attr('class', cls).attr('cx', x(r[k])).attr('cy', y).attr('r', k === 'actual' ? 7 : 5).append('title').text(r.label + ', ' + name + ': ' + F.dollarsWhole(r[k]) + ' a month'); });
  });
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b + 4) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  legend(host, kinds.map(([k, name, cls]) => ({ label: name, text: '', cls })));
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
