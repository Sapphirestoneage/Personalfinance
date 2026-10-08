/* The ten calculator charts (Level 13, MR-067), drawn from the plain numbers
   engine/chartdata-calc.js makes. Same marks as the rest of Measure: faint
   grid, labelled endpoints, token colours through CSS classes, a title on
   every mark for hover and tap, and a caption under the drawing that reads
   the chart aloud. Client and coach differ in words only. */
import * as F from '../engine/format.js';
import { h } from './dom.js';
import { svgIn, axes, legend, note } from './charts-more.js';

const d3g = () => globalThis.d3;
const money = c => F.dollarsWhole(c);
const short = iso => { const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
const dayWord = iso => { const n = parseInt(iso.slice(8, 10), 10); const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return 'the ' + n + (s[(v - 20) % 10] || s[v] || s[0]); };

function calendarBalance(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 240, m = { t: 16, r: 24, b: 30, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([0, d.days.length - 1]).range([m.l, W - m.r]);
  const lo = Math.min(0, d.floor, d3.min(d.days, p => p.cents)); const hi = Math.max(d3.max(d.days, p => p.cents), d.floor) * 1.1 || 1;
  const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xTicks: 6, xf: i => d.days[Math.round(i)] ? short(d.days[Math.round(i)].date) : '' });
  if (d.band && d.band.length === d.days.length) svg.append('path').datum(d.band).attr('class', 'band').attr('d', d3.area().x((p, i) => x(i)).y0(p => y(Math.max(lo, p.lo))).y1(p => y(Math.min(hi, p.hi))));
  svg.append('path').datum(d.days).attr('class', 'area-cash').attr('d', d3.area().x((p, i) => x(i)).y0(y(Math.max(lo, 0))).y1(p => y(p.cents)));
  svg.append('path').datum(d.days).attr('class', 'line-asset').attr('fill', 'none').attr('d', d3.line().x((p, i) => x(i)).y(p => y(p.cents)));
  svg.append('line').attr('class', 'marker').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(d.floor)).attr('y2', y(d.floor));
  svg.append('text').attr('class', 'chart-label').attr('x', m.l + 4).attr('y', y(d.floor) - 4).text(d.floor ? (o.client ? 'Your floor ' : 'Floor ') + money(d.floor) : 'Zero');
  svg.append('circle').attr('class', 'dot dot-low').attr('cx', x(d.low.index)).attr('cy', y(d.low.cents)).attr('r', 6).append('title').text('Lowest: ' + money(d.low.cents) + ' on ' + short(d.low.date));
  svg.append('text').attr('class', 'chart-label').attr('x', x(d.low.index)).attr('y', y(d.low.cents) + 16).attr('text-anchor', d.low.index > d.days.length * 0.8 ? 'end' : 'middle').text(short(d.low.date) + ' ' + F.dollarsCompact(d.low.cents));
  svg.append('g').selectAll('rect').data(d.days).join('rect').attr('x', (p, i) => x(i) - (W - m.l - m.r) / d.days.length / 2).attr('y', m.t).attr('width', (W - m.l - m.r) / d.days.length).attr('height', H - m.t - m.b).attr('fill', 'transparent').append('title').text(p => short(p.date) + ': ' + money(p.cents));
  note(svg, W, H, m, (o.client ? 'Your checking balance each day for the next two months. The tightest day is ' : 'Checking balance by day over 60 days. The low point is ') + dayWord(d.low.date) + ' at ' + money(d.low.cents) + (d.shortfalls ? '; ' + d.shortfalls + (d.shortfalls === 1 ? ' bill could not be paid' : ' bills could not be paid') + ' without going under the floor' : '') + '.' + (d.estimated ? ' Some dates are estimated until the calendar has them.' : ''));
}
function paycheckMap(host, d, o) {
  const d3 = d3g(); const W = o.width; const rowH = 44; const H = d.paychecks.length * rowH + 40; const m = { t: 8, r: 24, b: 30, l: 88 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([0, d3.max(d.paychecks, p => Math.max(p.cents, p.bills.reduce((s, b) => s + b.cents, 0))) || 1]).range([m.l, W - m.r]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  d.paychecks.forEach((p, i) => {
    const y0 = m.t + i * rowH; let acc = 0;
    svg.append('text').attr('class', 'chart-label').attr('x', m.l - 6).attr('y', y0 + 14).attr('text-anchor', 'end').text(short(p.date));
    svg.append('text').attr('class', 'chart-label small').attr('x', m.l - 6).attr('y', y0 + 28).attr('text-anchor', 'end').text(F.dollarsCompact(p.cents));
    svg.append('rect').attr('class', 'pay-outline').attr('x', x(0)).attr('y', y0 + 4).attr('width', x(p.cents) - x(0)).attr('height', rowH - 14).attr('rx', 3);
    p.bills.forEach((b, k) => { const w = x(b.cents) - x(0); svg.append('rect').attr('class', 'stk stk-' + (k % 6)).attr('x', x(acc)).attr('y', y0 + 6).attr('width', Math.max(0, w)).attr('height', rowH - 18).append('title').text(b.label + ': ' + money(b.cents)); if (w > 60) svg.append('text').attr('class', 'chart-label on-bar').attr('x', x(acc) + 4).attr('y', y0 + 24).text(F.shorten(b.label, Math.floor(w / 7))); acc += b.cents; });
    svg.append('text').attr('class', 'chart-label').attr('x', Math.min(W - m.r, x(Math.max(acc, p.cents)) + 4)).attr('y', y0 + 24).attr('text-anchor', x(Math.max(acc, p.cents)) + 60 > W - m.r ? 'end' : 'start').text((p.left >= 0 ? 'left ' : 'short ') + F.dollarsCompact(Math.abs(p.left)));
  });
  note(svg, W, H, m, (o.client ? 'Each bar is a paycheck; the blocks are the bills it pays until the next one, and the number at the end is what is left.' : 'One bar per paycheck, split into the cash outflows it funds until the next paycheck; the outline is the paycheck itself.'));
}
function yearStrip(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 200, m = { t: 16, r: 16, b: 30, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleBand().domain(d.months.map(mm => mm.ym)).range([m.l, W - m.r]).padding(0.2);
  const lo = Math.min(0, d3.min(d.months, mm => mm.low)); const hi = Math.max(1, d3.max(d.months, mm => mm.low)) * 1.1;
  const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickFormat(ym => new Date(ym + '-15T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(v => F.dollarsCompact(v)));
  svg.append('g').selectAll('rect').data(d.months).join('rect').attr('class', mm => 'stk ' + (mm.tight ? 'bar-tight' : 'bar-ok')).attr('x', mm => x(mm.ym)).attr('y', mm => y(Math.max(0, mm.low))).attr('width', x.bandwidth()).attr('height', mm => Math.abs(y(mm.low) - y(0))).append('title').text(mm => mm.ym + ': lowest ' + money(mm.low) + (mm.tight ? ' (tight)' : ''));
  svg.append('line').attr('class', 'marker').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(d.floor)).attr('y2', y(d.floor));
  const tight = d.months.filter(mm => mm.tight);
  note(svg, W, H, m, (o.client ? 'Each bar is the lowest your checking gets that month. ' : 'Lowest checking balance per month over twelve months. ') + (tight.length ? (tight.length === 1 ? 'One month runs tight: ' : tight.length + ' months run tight: ') + tight.map(mm => new Date(mm.ym + '-15T00:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })).join(', ') + '.' : 'No month dips within a week of everyday spending of the floor.'));
  legend(host, [{ label: 'Comfortable month', cls: 'sw-ok' }, { label: 'Tight month', cls: 'sw-tight' }]);
}
function homeAnswers(host, d, o) {
  const d3 = d3g(); const W = o.width; const rowH = 56; const H = d.bars.length * rowH + 36; const m = { t: 8, r: 24, b: 28, l: Math.min(230, Math.round(W * 0.3)) }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([0, d3.max(d.bars, b => b.price) * 1.15 || 1]).range([m.l, W - m.r]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  d.bars.forEach((b, i) => { const y0 = m.t + i * rowH; svg.append('text').attr('class', 'chart-label').attr('x', m.l - 8).attr('y', y0 + 22).attr('text-anchor', 'end').text(F.shorten(b.label, 22)); svg.append('text').attr('class', 'chart-label small').attr('x', m.l - 8).attr('y', y0 + 38).attr('text-anchor', 'end').text(F.shorten(b.note, Math.floor(m.l / 6))); svg.append('rect').attr('class', 'stk ' + (b.id === 'comfortable' ? 'bar-pick' : 'bar-ok')).attr('x', x(0)).attr('y', y0 + 8).attr('width', Math.max(0, x(b.price) - x(0))).attr('height', rowH - 22).attr('rx', 3).append('title').text(b.label + ': ' + money(b.price) + ', ' + money(b.monthly) + ' a month'); svg.append('text').attr('class', 'chart-label').attr('x', x(b.price) + 6).attr('y', y0 + 30).text(F.dollarsCompact(b.price) + ' · ' + F.dollarsCompact(b.monthly) + '/mo'); });
  const c = d.bars.find(b => b.id === 'comfortable'); const l = d.bars.find(b => b.id === 'lender');
  note(svg, W, H, m, 'A lender might approve about ' + F.dollarsCompact(l.price) + '. Comfortable is about ' + F.dollarsCompact(c.price) + ', where the full cost of owning stays at ' + Math.round(d.share * 100) + '% of take-home' + (d.rentNow ? ', against rent of ' + money(d.rentNow) + ' today' : '') + '.');
}
function downPaymentLadder(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 240, m = { t: 20, r: 24, b: 44, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleBand().domain(d.rungs.map(r => r.downPct)).range([m.l, W - m.r]).padding(0.25);
  const y = d3.scaleLinear().domain([0, d3.max(d.rungs, r => r.price) * 1.15 || 1]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickFormat(v => F.percent(v, { places: v < 0.04 ? 1 : 0 }) + ' down'));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(v => F.dollarsCompact(v)));
  const g = svg.append('g').selectAll('g').data(d.rungs).join('g');
  g.append('rect').attr('class', r => 'stk ' + (r.months === 0 ? 'bar-pick' : 'bar-ok')).attr('x', r => x(r.downPct)).attr('y', r => y(r.price)).attr('width', x.bandwidth()).attr('height', r => y(0) - y(r.price)).attr('rx', 3).append('title').text(r => F.percent(r.downPct, { places: 1 }) + ' down: price ' + money(r.price) + ', cash to close ' + money(r.cashToClose) + (r.months === 0 ? ', reachable now' : r.months === null ? ', no savings pace' : ', about ' + r.months + ' months away'));
  g.append('text').attr('class', 'chart-label').attr('x', r => x(r.downPct) + x.bandwidth() / 2).attr('y', r => y(r.price) - 6).attr('text-anchor', 'middle').text(r => F.dollarsCompact(r.price));
  g.append('text').attr('class', 'chart-label small').attr('x', r => x(r.downPct) + x.bandwidth() / 2).attr('y', H - m.b + 30).attr('text-anchor', 'middle').text(r => r.months === 0 ? 'now' : r.months === null ? 'no pace' : r.months < 12 ? r.months + ' mo' : (Math.round(r.months / 12 * 10) / 10) + ' yr');
  note(svg, W, H, m, (o.client ? 'Each bar is the price each down payment reaches; under it, how long until that much cash is saved at your pace' : 'Price by down payment (the lower of the lender and comfortable answers), with the months to the cash to close at the savings pace') + (d.pace ? ' of ' + money(d.pace) + ' a month.' : '.'));
}
function rentVsBuy(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 280, m = { t: 16, r: 24, b: 30, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([1, d.years.length]).range([m.l, W - m.r]);
  const lo = Math.min(0, d3.min(d.years, y => Math.min(y.buyerLow, y.renter))); const hi = d3.max(d.years, y => Math.max(y.buyerHigh, y.renter)) * 1.05 || 1;
  const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xTicks: 6, xf: v => 'yr ' + v });
  svg.append('path').datum(d.years).attr('class', 'band').attr('d', d3.area().x(p => x(p.year)).y0(p => y(p.buyerLow)).y1(p => y(p.buyerHigh)));
  svg.append('path').datum(d.years).attr('class', 'line-asset').attr('fill', 'none').attr('d', d3.line().x(p => x(p.year)).y(p => y(p.buyer)));
  svg.append('path').datum(d.years).attr('class', 'line-spend').attr('fill', 'none').attr('d', d3.line().x(p => x(p.year)).y(p => y(p.renter)));
  if (d.breakEven) { svg.append('line').attr('class', 'marker').attr('x1', x(d.breakEven)).attr('x2', x(d.breakEven)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(d.breakEven) + 4).attr('y', m.t + 12).text('Buying pulls ahead, year ' + d.breakEven); }
  if (d.stay) { svg.append('line').attr('class', 'marker gold').attr('x1', x(d.stay)).attr('x2', x(d.stay)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(d.stay) + 4).attr('y', m.t + 28).text('You plan to stay ' + d.stay + ' years'); }
  svg.append('g').selectAll('circle').data(d.years.filter((p, i) => i % 5 === 4 || i === 0)).join('circle').attr('class', 'dot dot-now').attr('cx', p => x(p.year)).attr('cy', p => y(p.buyer)).attr('r', 3).append('title').text(p => 'Year ' + p.year + ': buying ' + money(p.buyer) + ', renting ' + money(p.renter));
  legend(host, [{ label: o.client ? 'Buying: home after selling costs, minus the loan' : 'Buyer net worth', cls: 'sw-asset' }, { label: o.client ? 'Renting: the difference invested, after tax' : 'Renter net worth', cls: 'sw-spend' }, { label: 'Low to high appreciation', cls: 'band' }]);
  const at = d.years[Math.min(d.years.length, d.stay || 7) - 1];
  note(svg, W, H, m, (d.breakEven ? 'Buying pulls ahead in year ' + d.breakEven + '. ' : 'Renting stays ahead across the whole span at these assumptions. ') + 'At year ' + at.year + ', buying is worth ' + money(at.buyer) + ' and renting ' + money(at.renter) + ', so ' + (at.buyer >= at.renter ? 'buying' : 'renting') + ' is ahead by ' + money(Math.abs(at.buyer - at.renter)) + '.');
}
function equityVsLoan(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 260, m = { t: 16, r: 24, b: 30, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain([1, d.years.length]).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d3.max(d.years, p => p.value) * 1.05 || 1]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xTicks: 6, xf: v => 'yr ' + v });
  svg.append('path').datum(d.years).attr('class', 'area-equity').attr('d', d3.area().x(p => x(p.year)).y0(p => y(p.balance)).y1(p => y(p.value)));
  svg.append('path').datum(d.years).attr('class', 'line-asset').attr('fill', 'none').attr('d', d3.line().x(p => x(p.year)).y(p => y(p.value)));
  svg.append('path').datum(d.years).attr('class', 'line-spend').attr('fill', 'none').attr('d', d3.line().x(p => x(p.year)).y(p => y(p.balance)));
  if (d.miEndsMonth) { const yr = d.miEndsMonth / 12; svg.append('line').attr('class', 'marker').attr('x1', x(yr)).attr('x2', x(yr)).attr('y1', m.t).attr('y2', H - m.b); svg.append('text').attr('class', 'chart-label').attr('x', x(yr) + 4).attr('y', m.t + 12).text('Mortgage insurance ends'); }
  svg.append('g').selectAll('circle').data(d.years.filter((p, i) => i % 5 === 4 || i === 0)).join('circle').attr('class', 'dot dot-now').attr('cx', p => x(p.year)).attr('cy', p => y(p.value)).attr('r', 3).append('title').text(p => 'Year ' + p.year + ': value ' + money(p.value) + ', loan ' + money(p.balance) + ', equity ' + money(p.equity));
  legend(host, [{ label: 'Home value', cls: 'sw-asset' }, { label: 'Loan balance', cls: 'sw-spend' }, { label: 'Equity', cls: 'sw-equity' }]);
  const last = d.years[d.years.length - 1]; const ten = d.years[Math.min(9, d.years.length - 1)];
  note(svg, W, H, m, 'The shaded part is equity: value above the loan. After ten years about ' + money(ten.equity) + '; by year ' + last.year + ' about ' + money(last.equity) + '.' + (d.miEndsMonth ? ' Mortgage insurance stops after ' + Math.round(d.miEndsMonth / 12 * 10) / 10 + ' years at 20% equity.' : ''));
}
function carTco(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 260, m = { t: 20, r: 24, b: 36, l: 64 }; const svg = svgIn(host, W, H);
  const x = d3.scaleBand().domain(d.options.map(p => p.kind)).range([m.l, W - m.r]).padding(0.3); const y = d3.scaleLinear().domain([0, d3.max(d.options, p => p.total) * 1.12 || 1]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').attr('class', 'axis').call(d3.axisBottom(x).tickFormat(k => (d.options.find(p => p.kind === k) || {}).label || k));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => F.dollarsCompact(v)));
  const cats = []; d.options.forEach(p => p.stack.forEach(s => { if (!cats.includes(s[0])) cats.push(s[0]); }));
  d.options.forEach(p => { let acc = 0; p.stack.forEach(s => { const k = cats.indexOf(s[0]); svg.append('rect').attr('class', 'stk stk-' + (k % 8)).attr('x', x(p.kind)).attr('y', y(acc + s[1])).attr('width', x.bandwidth()).attr('height', Math.max(0, y(acc) - y(acc + s[1]))).append('title').text(p.label + ', ' + s[0] + ': ' + money(s[1])); acc += s[1]; }); svg.append('text').attr('class', 'chart-label').attr('x', x(p.kind) + x.bandwidth() / 2).attr('y', y(p.total) - 6).attr('text-anchor', 'middle').text(F.dollarsCompact(p.perMonth) + '/mo'); });
  host.appendChild(h('div', { class: 'legend' }, cats.map((c, k) => h('span', { class: 'chip' }, h('span', { class: 'swatch sw-stk-' + (k % 8) }), c))));
  const best = d.options.find(p => p.kind === d.cheapest);
  note(svg, W, H, m, 'Total cost over ' + d.years + ' years, by what the money goes to; the label is the true cost a month. ' + (best ? best.label + ' costs least at ' + money(best.perMonth) + ' a month' + (d.nowMonthly ? ', against ' + money(d.nowMonthly) + ' spent on getting around today' : '') + '.' : ''));
}
function carValueVsLoan(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 240, m = { t: 16, r: 24, b: 30, l: 64 }; const svg = svgIn(host, W, H);
  const months = d.years * 12; const x = d3.scaleLinear().domain([0, months]).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d3.max(d.options, p => p.values[0]) * 1.05 || 1]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xTicks: 6, xf: v => 'yr ' + Math.round(v / 12) });
  d.options.forEach((p, i) => { const vals = Array.from({ length: months + 1 }, (_, mm) => { const yr = Math.floor(mm / 12); const a = p.values[Math.min(yr, p.values.length - 1)], b = p.values[Math.min(yr + 1, p.values.length - 1)]; return { m: mm, v: a + (b - a) * ((mm % 12) / 12) }; }); svg.append('path').datum(vals).attr('class', 'line-asset shade-' + i).attr('fill', 'none').attr('d', d3.line().x(q => x(q.m)).y(q => y(q.v))); svg.append('path').datum(p.balances.slice(0, months).map((b, mm) => ({ m: mm + 1, b }))).attr('class', 'line-spend shade-' + i).attr('fill', 'none').attr('stroke-dasharray', '4 3').attr('d', d3.line().x(q => x(q.m)).y(q => y(q.b))); svg.append('text').attr('class', 'chart-label').attr('x', x(0) + 4).attr('y', y(p.values[0]) - 4 - i * 14).text(p.label + ': value solid, loan dashed'); });
  const under = d.options.filter(p => p.underwater);
  note(svg, W, H, m, under.length ? under.map(p => p.label + ' is underwater for ' + p.underwater + ' months, by up to ' + money(p.worstGap)).join('; ') + '. Underwater means the loan is more than the car would sell for.' : 'The loan stays under the car\'s value the whole way for every option.');
}
function retireGrowth(host, d, o) {
  const d3 = d3g(); const W = o.width, H = 300, m = { t: 16, r: 24, b: 30, l: 72 }; const svg = svgIn(host, W, H);
  const x = d3.scaleLinear().domain(d3.extent(d.years, p => p.age)).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d3.max(d.years, p => Math.max(p.potential, p.balance)) * 1.05 || 1]).nice().range([H - m.b, m.t]);
  axes(svg, x, y, W, H, m, { xTicks: 8, xf: v => 'age ' + v });
  svg.append('path').datum(d.years).attr('class', 'area-contrib').attr('d', d3.area().x(p => x(p.age)).y0(y(0)).y1(p => y(p.contributed)));
  svg.append('path').datum(d.years).attr('class', 'area-growth').attr('d', d3.area().x(p => x(p.age)).y0(p => y(p.contributed)).y1(p => y(p.balance)));
  svg.append('path').datum(d.years).attr('class', 'line-potential').attr('fill', 'none').attr('d', d3.line().x(p => x(p.age)).y(p => y(p.potential)));
  if (d.fiNumber && d.fiNumber <= y.domain()[1]) { svg.append('line').attr('class', 'marker gold').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(d.fiNumber)).attr('y2', y(d.fiNumber)); svg.append('text').attr('class', 'chart-label').attr('x', m.l + 4).attr('y', y(d.fiNumber) - 4).text((o.client ? 'Enough: ' : 'FI number: ') + F.dollarsCompact(d.fiNumber)); }
  const last = d.years[d.years.length - 1];
  svg.append('text').attr('class', 'chart-label').attr('x', x(last.age)).attr('y', y(last.balance) - 6).attr('text-anchor', 'end').text(F.dollarsCompact(last.balance));
  svg.append('text').attr('class', 'chart-label').attr('x', x(last.age)).attr('y', y(last.potential) - 6).attr('text-anchor', 'end').text(F.dollarsCompact(last.potential) + ' with more');
  svg.append('g').selectAll('circle').data(d.years.filter((p, i) => i % 5 === 0)).join('circle').attr('class', 'dot dot-now').attr('cx', p => x(p.age)).attr('cy', p => y(p.balance)).attr('r', 3).append('title').text(p => 'Age ' + p.age + ': ' + money(p.balance) + ' (' + money(p.contributed) + ' put in, ' + money(p.growth) + ' growth); with more, ' + money(p.potential));
  legend(host, [{ label: o.client ? 'What you put in' : 'Contributions', cls: 'sw-contrib' }, { label: o.client ? 'What growth added' : 'Growth', cls: 'sw-growth' }, { label: (o.client ? 'With ' : 'Potential: ') + money(d.extraMonthly) + ' more a month', cls: 'sw-potential' }]);
  note(svg, W, H, m, 'By age ' + d.horizonAge + ', about ' + money(d.atRetirement) + (d.incomeMonthly ? ', or ' + money(d.incomeMonthly) + ' a month at the withdrawal rate' : '') + '. ' + (d.extraMonthly ? 'Investing ' + money(d.extraMonthly) + ' more a month would make it about ' + money(d.potential) + ', ' + money(d.gain) + ' more.' : ''));
}
export const CALC_RENDERERS = { calendarBalance, paycheckMap, yearStrip, homeAnswers, downPaymentLadder, rentVsBuy, equityVsLoan, carTco, carValueVsLoan, retireGrowth };
