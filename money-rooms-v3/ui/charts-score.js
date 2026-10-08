/* Renderers for the seven Scoreboard charts (Level 12, MR-063). D3 v7 from
   the vendored build, the palette from ui/tokens.css through CSS classes,
   every svg named; nothing here computes a number, engine/chartdata-score.js
   did. Coach and Client differ in words only; the gentle wording never
   uses a warning colour. */
import * as F from '../engine/format.js';
import { h } from './dom.js';
import { svgIn, axes, legend, note } from './charts-more.js';

const d3g = () => globalThis.d3;
const ym = s => { const [y, m] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, 1); };

/* a. Crossover: asset income against spending, year by year, the crossing marked. */
function crossover(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 260, m = { t: 12, r: 16, b: 28, l: 56 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, y => y.year)).range([m.l, W - m.r]);
  const hi = d3.max(d.years, y => Math.max(y.assetIncome, y.spending)) || 1;
  const y = d3.scaleLinear().domain([0, hi * 1.08]).range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xTicks: 6, xf: v => String(v) });
  svg.append('path').datum(d.years).attr('class', 'line-spend').attr('fill', 'none').attr('d', d3.line().x(p => x(p.year)).y(p => y(p.spending)));
  svg.append('path').datum(d.years).attr('class', 'line-asset').attr('fill', 'none').attr('d', d3.line().x(p => x(p.year)).y(p => y(p.assetIncome)));
  if (d.crossYear) { svg.append('line').attr('class', 'marker').attr('x1', x(d.crossYear)).attr('x2', x(d.crossYear)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(d.crossYear) + 6).attr('y', m.t + 12).text((o.client ? 'Crosses at ' : 'Crossover at ') + d.crossAge); }
  legend(host, [{ label: o.client ? 'What the money earns a year' : 'Asset income (invested at ' + F.percent(d.rate, { places: 0 }) + ')', cls: 'sw-asset' }, { label: o.client ? 'What a year costs' : 'Spending a year', cls: 'sw-spend' }]);
  host.appendChild(h('div', { class: 'suggest' }, d.crossYear ? (o.client ? 'Around age ' + d.crossAge + ' the money earns more than life costs. After that, work is a choice.' : 'The crossover lands in ' + d.crossYear + ' at age ' + d.crossAge + '; the FI date reads ' + (d.fiAge !== null ? 'age ' + d.fiAge : 'not yet') + ' at the ' + F.percent(1 / 25, { places: 0 }) + ' rule.') : 'The lines have not crossed by 95 on the likely path; the savings rate and the spending floor move this most.'));
}

/* b. The waterfall: each part of the move since last time as a step, the total last. */
function fiDateWaterfall(host, d, o) {
  const d3 = d3g(); const W = o.width, rowH = 34, m = { t: 8, r: 16, b: 26, l: Math.min(150, Math.round(W * 0.3)) };
  const steps = d.steps.concat([{ key: 'total', label: o.client ? 'Your date moved' : 'Net move', months: d.total, total: true }]);
  const H = m.t + steps.length * rowH + m.b; const svg = svgIn(host, W, H);
  let run = 0; const spans = steps.map(s => { if (s.total) return { s, a: 0, b: s.months }; const a = run; run += s.months; return { s, a, b: run }; });
  const lo = Math.min(0, ...spans.map(p => Math.min(p.a, p.b))), hi = Math.max(0, ...spans.map(p => Math.max(p.a, p.b)));
  const x = d3.scaleLinear().domain([lo, hi || 1]).nice().range([m.l, W - m.r]);
  svg.append('line').attr('class', 'grid').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b);
  spans.forEach((p, i) => {
    const yy = m.t + i * rowH; const sooner = p.b < p.a;
    svg.append('text').attr('class', 'chart-label').attr('x', m.l - 8).attr('y', yy + rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text(F.shorten(p.s.label, 22));
    svg.append('rect').attr('class', 'bar ' + (p.s.total ? 'shade-0' : sooner ? 'wf-sooner' : 'wf-later')).attr('x', x(Math.min(p.a, p.b))).attr('y', yy + 7).attr('width', Math.max(2, Math.abs(x(p.b) - x(p.a)))).attr('height', rowH - 14).append('title').text(p.s.label + ': ' + (p.s.months > 0 ? 'later by ' : p.s.months < 0 ? 'sooner by ' : '') + F.months(Math.abs(p.s.months)));
    svg.append('text').attr('class', 'chart-label').attr('x', x(Math.max(p.a, p.b)) + 6).attr('y', yy + rowH / 2).attr('dy', '0.35em').text(p.s.months === 0 ? 'no change' : (p.s.months < 0 ? 'sooner ' : 'later ') + F.months(Math.abs(p.s.months)));
  });
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b + 4) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(5).tickFormat(v => (v < 0 ? '-' : v > 0 ? '+' : '') + Math.abs(Math.round(v * 10) / 10) + ' mo'));
  host.appendChild(h('div', { class: 'suggest' }, d.sentences.join(' ') + (d.marketNote ? ' ' + d.marketNote : '')));
}

/* c. The calendar: 31 days, money in above the line, bills below, the running balance as a line. */
function cashflowCalendar(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 240, m = { t: 12, r: 12, b: 26, l: 52 }; const svg = svgIn(host, W, H);
  const x = d3.scaleBand().domain(d.days.map(dd => dd.day)).range([m.l, W - m.r]).padding(0.2);
  const hi = Math.max(1, d3.max(d.days, dd => Math.max(dd.inCents, dd.outCents, Math.abs(dd.running))) || 1);
  const y = d3.scaleLinear().domain([-hi, hi]).range([H - m.b, m.t]);
  svg.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
  const g = svg.append('g');
  d.days.forEach(dd => {
    if (dd.inCents) g.append('rect').attr('class', 'bar shade-0').attr('x', x(dd.day)).attr('y', y(dd.inCents)).attr('width', x.bandwidth()).attr('height', y(0) - y(dd.inCents)).append('title').text('Day ' + dd.day + ': in ' + F.dollarsWhole(dd.inCents) + ' (' + dd.items.filter(i => i.kind === 'pay').map(i => i.label).join(', ') + ')');
    if (dd.outCents) g.append('rect').attr('class', 'bar shade-2').attr('x', x(dd.day)).attr('y', y(0)).attr('width', x.bandwidth()).attr('height', y(-dd.outCents) - y(0)).append('title').text('Day ' + dd.day + ': bills ' + F.dollarsWhole(dd.outCents) + ' (' + dd.items.filter(i => i.kind === 'bill').map(i => i.label).join(', ') + ')');
  });
  svg.append('path').datum(d.days).attr('class', 'line-running').attr('fill', 'none').attr('d', d3.line().x(dd => x(dd.day) + x.bandwidth() / 2).y(dd => y(dd.running)));
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickValues([1, 5, 10, 15, 20, 25, 31]).tickFormat(v => String(v)));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(v => F.dollarsCompact(v)));
  legend(host, [{ label: o.client ? 'Paydays' : 'Deposits that repeat', cls: 'shade-0' }, { label: 'Bills', cls: 'shade-2' }, { label: o.client ? 'Where the month stands' : 'Running balance from the 1st', cls: 'sw-running' }]);
  host.appendChild(h('div', { class: 'suggest' }, d.tight.length ? (o.client ? 'The month runs thin around day ' + d.tight[0] + '. Moving one bill to land after a payday would smooth it.' : 'Short from day ' + d.tight[0] + (d.tight.length > 1 ? ' to ' + d.tight[d.tight.length - 1] : '') + ' before the next deposit; lowest point ' + F.dollarsWhole(d.low.cents) + ' on day ' + d.low.day + '.') : (o.client ? 'The paydays land before the bills all month.' : 'The running balance never dips below zero; lowest ' + F.dollarsWhole(d.low.cents) + ' on day ' + d.low.day + '.')));
}

/* d. Picture against progress: one dot per snapshot, joined in time order. */
function pictureVsProgress(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 260, m = { t: 16, r: 24, b: 30, l: 52 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
  const yMax = Math.max(0.1, d3.max(d.points, p => p.y) * 1.15); const y = d3.scaleLinear().domain([0, Math.min(1, yMax)]).range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(5).tickFormat(v => F.percent(v, { places: 0 })));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.percent(v, { places: 0 })));
  svg.append('path').datum(d.points).attr('class', 'line-path').attr('fill', 'none').attr('d', d3.line().x(p => x(p.x)).y(p => y(p.y)));
  const g = svg.append('g').selectAll('g').data(d.points).join('g');
  g.append('circle').attr('class', (p, i) => 'dot ' + (i === d.points.length - 1 ? 'dot-now' : 'dot-then')).attr('cx', p => x(p.x)).attr('cy', p => y(p.y)).attr('r', (p, i) => i === d.points.length - 1 ? 6 : 4).append('title').text(p => p.label + ': ' + F.percent(p.x, { places: 0 }) + ' of the picture in, ' + F.percent(p.y, { places: 0 }) + ' ' + d.yLabel.toLowerCase());
  g.append('text').attr('class', 'chart-label').attr('x', p => x(p.x) + 8).attr('y', p => y(p.y) - 6).text(p => F.shorten(p.label, 14));
  note(svg, W, H, m, (o.client ? 'Across: how much of your picture is in. Up: ' : 'x: picture completeness. y: ') + d.yLabel.toLowerCase());
  const a = d.points[0], b = d.points[d.points.length - 1];
  host.appendChild(h('div', { class: 'suggest' }, (b.x - a.x >= 0.05 && b.y - a.y >= 0.005) ? (o.client ? 'Both moved: more of the picture is in, and you are further along.' : 'Learning and doing both moved: completeness up ' + Math.round((b.x - a.x) * 100) + ' points, progress up ' + (Math.round((b.y - a.y) * 1000) / 10) + ' points.') : (b.x - a.x >= 0.05) ? (o.client ? 'The picture got clearer first. Progress follows once the moves start.' : 'Mostly learning so far: the picture filled in, the progress line is about where it was.') : (b.y - a.y >= 0.005) ? (o.client ? 'You are moving even with parts of the picture still to fill in.' : 'Progress without much new in the picture: the moves are doing the work.') : (o.client ? 'Steady so far. The next session adds a dot.' : 'Little change on either axis since the first snapshot.')));
}

/* e. Effort against the market: contributions and growth, stacked by year. */
function effortVsMarket(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 260, m = { t: 12, r: 16, b: 28, l: 56 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, p => p.year)).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, (d3.max(d.years, p => p.cumContrib + p.cumGrowth) || 1) * 1.05]).range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xTicks: 6, xf: v => String(v) });
  svg.append('path').datum(d.years).attr('class', 'area-contrib').attr('d', d3.area().x(p => x(p.year)).y0(y(0)).y1(p => y(p.cumContrib)));
  svg.append('path').datum(d.years).attr('class', 'area-growth').attr('d', d3.area().x(p => x(p.year)).y0(p => y(p.cumContrib)).y1(p => y(p.cumContrib + p.cumGrowth)));
  if (d.flipYear) { svg.append('line').attr('class', 'marker').attr('x1', x(d.flipYear)).attr('x2', x(d.flipYear)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(d.flipYear) + 6).attr('y', m.t + 12).text((o.client ? 'Growth takes over at ' : 'Growth outpaces contributions at ') + d.flipAge); }
  legend(host, [{ label: o.client ? 'What you put in' : 'Contributions, cumulative', cls: 'sw-contrib' }, { label: o.client ? 'What the market added' : 'Growth at ' + F.percent(d.rate, { places: 0 }) + ', cumulative', cls: 'sw-growth' }]);
  host.appendChild(h('div', { class: 'suggest' }, (d.flipYear ? (o.client ? 'From about age ' + d.flipAge + ' the market adds more each year than you do. Until then, what you add is the engine.' : 'Contributions of ' + F.dollarsWhole(d.contribAnnual) + ' a year carry the early years; growth takes the lead in ' + d.flipYear + '.') : (o.client ? 'What you put in does most of the work across the whole path.' : 'Contributions outpace growth every working year on the likely path.')) + ' Projected at the likely return; the real split shows on the scoreboard as snapshots build up.'));
}

/* f. The stress trend: a dot per ask, joined. */
function stressTrend(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 200, m = { t: 16, r: 24, b: 30, l: 40 }; const svg = svgIn(host, W, H);
  const x = d3.scalePoint().domain(d.points.map((p, i) => i)).range([m.l, W - m.r]).padding(0.5);
  const y = d3.scaleLinear().domain([0, 10]).range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => String(v)));
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickFormat(i => F.shorten(d.points[i].label, 12)));
  svg.append('path').datum(d.points).attr('class', 'line-path').attr('fill', 'none').attr('d', d3.line().x((p, i) => x(i)).y(p => y(p.score)));
  svg.append('g').selectAll('circle').data(d.points).join('circle').attr('class', 'dot dot-now').attr('cx', (p, i) => x(i)).attr('cy', p => y(p.score)).attr('r', 5).append('title').text(p => p.label + ': ' + p.score + ' of 10');
  svg.append('g').selectAll('text').data(d.points).join('text').attr('class', 'chart-label').attr('x', (p, i) => x(i)).attr('y', p => y(p.score) - 9).attr('text-anchor', 'middle').text(p => String(p.score));
  host.appendChild(h('div', { class: 'suggest' }, d.points.length === 1 ? (o.client ? 'One score so far: ' + d.first + ' of 10. The next session adds a dot.' : 'Asked once so far (' + d.first + ' of 10); the curriculum asks again at sessions 4, 9 and 12.') : d.change < 0 ? (o.client ? 'From ' + d.first + ' to ' + d.last + ' of 10. Lower is lighter.' : 'Down ' + Math.abs(d.change) + ' points from the first ask: ' + d.first + ' to ' + d.last + '.') : d.change > 0 ? (o.client ? 'From ' + d.first + ' to ' + d.last + ' of 10. Worth a word about what changed.' : 'Up ' + d.change + ' points since the first ask; worth asking what changed.') : 'Unchanged at ' + d.last + ' of 10.'));
}

/* g. Two payoff orders as curves of total balance. */
function debtCurves(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 260, m = { t: 12, r: 16, b: 28, l: 56 }; const svg = svgIn(host, W, H);
  const all = d.curves.flatMap(c => c.series); if (!all.length) { host.appendChild(h('div', { class: 'chart-needs' }, 'Nothing to draw yet.')); return; }
  const x = d3.scaleTime().domain(d3.extent(all, s => ym(s.month))).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, (d3.max(all, s => s.total) || 1) * 1.05]).range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%Y')));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  const cls = { avalanche: 'line-asset', stress: 'line-spend' };
  d.curves.forEach(c => { svg.append('path').datum(c.series).attr('class', cls[c.key]).attr('fill', 'none').attr('d', d3.line().x(s => x(ym(s.month))).y(s => y(s.total))); if (c.reliefMonth) { svg.append('circle').attr('class', 'dot dot-now').attr('cx', x(ym(c.reliefMonth))).attr('cy', y(c.series.find(s => s.month === c.reliefMonth) ? c.series.find(s => s.month === c.reliefMonth).total : 0)).attr('r', 5).append('title').text(c.label + ': ' + c.stressfulName + ' gone ' + F.date(c.reliefMonth)); } });
  legend(host, d.curves.map(c => ({ label: c.label + (c.debtFree ? ', free ' + F.date(c.debtFree) : ', stalls'), text: c.interest !== null ? F.dollarsWhole(c.interest) + ' interest' : '', cls: c.key === 'avalanche' ? 'sw-asset' : 'sw-spend' })));
  const st = d.curves[1];
  host.appendChild(h('div', { class: 'suggest' }, d.reliefMonthsSooner !== null && d.reliefMonthsSooner > 0 ? (o.client ? 'Paying the most stressful one first clears ' + st.stressfulName + ' ' + F.months(d.reliefMonthsSooner) + ' sooner and costs about ' + F.dollarsWhole(Math.max(0, d.reliefCostCents)) + ' more in interest. Relief has a price; it is a fair one to choose.' : 'Most stressful first clears ' + st.stressfulName + ' ' + F.months(d.reliefMonthsSooner) + ' sooner for ' + F.dollarsWhole(Math.max(0, d.reliefCostCents)) + ' more interest.') : (o.client ? 'Here the two orders land close together; the highest rate first costs the least.' : 'The two orders differ by ' + F.dollarsWhole(Math.abs(d.reliefCostCents)) + ' of interest; the stressful debt is not reached sooner by going for it first.')));
}

export const SCORE_RENDERERS = { crossover, fiDateWaterfall, cashflowCalendar, pictureVsProgress, effortVsMarket, stressTrend, debtCurves };
