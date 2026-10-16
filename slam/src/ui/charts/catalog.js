// Every chart in SLAM, as a card: title, optional dollars/percent toggle, the
// SVG, a legend, and a one-line plain-English reading. Data comes from
// src/calc/chart-data.js; this file only lays it out and words it.

import { h } from '../dom.js';
import { money, pct, times, signedMoney, signedPct, monthLabel, less } from '../format.js';
import * as cd from '../../calc/chart-data.js';
import { hbars, donut, sankey, gauge, ring, lines, scatter, stack } from './svg.js';

const SERIES = { gut: 'var(--series-gut)', estimate: 'var(--series-estimate)', dream: 'var(--series-dream)', actual: 'var(--series-actual)' };
const NWS = { needs: 'var(--need)', wants: 'var(--want)', savings: 'var(--save)', unassigned: 'var(--unassigned)' };

export function chartWidth(half) {
  const vw = Math.min(document.documentElement.clientWidth, 1180) - 32;
  const w = half && vw >= 728 ? (vw - 12) / 2 : vw;
  return Math.max(260, Math.floor(w - 34));
}

function slotColor(slots, id) {
  return id === 'other' ? 'var(--chart-other)' : 'var(--chart-' + (slots[id] || 8) + ')';
}

function legend(items) {
  return h('div', { class: 'legend' }, items.map(([label, color]) => h('span', {}, h('i', { style: 'background:' + color }), label)));
}

function unitOf(ctx, id) { return ctx.ui.units[id] || 'dollars'; }

function toggle(ctx, id) {
  const u = unitOf(ctx, id);
  return h('div', { class: 'toggle', role: 'group', 'aria-label': 'Units' }, [['dollars', '$'], ['percent', '%']].map(([k, label]) =>
    h('button', { 'aria-pressed': u === k ? 'true' : 'false', onclick: () => { ctx.ui.units[id] = k; ctx.rerender(); } }, label)));
}

export function card(ctx, { id, title, svg, reading, legendItems, unitToggle, extra }) {
  return h('div', { class: 'card', id: 'chart-' + id },
    h('div', { class: 'spread' }, h('h3', { style: 'margin:0' }, title), unitToggle ? toggle(ctx, id) : null),
    svg ? h('div', { class: 'chart', html: svg }) : null,
    legendItems ? legend(legendItems) : null,
    extra || null,
    h('p', { class: 'reading' }, reading));
}

// Where it goes
export function sankeyCard(ctx, s, half) {
  const data = cd.sankeyData(s);
  const slots = cd.colorSlots(s);
  if (!data) return card(ctx, { id: 'sankey', title: 'Where the money goes', reading: 'Needs take-home pay and some spending first.' });
  const right = data.right.map((n) => ({ ...n, color: n.surplus ? 'var(--good)' : n.savings ? 'var(--save)' : slotColor(slots, n.id) }));
  const top = data.right.filter((n) => !n.surplus && !n.savings)[0];
  const t = s.totals;
  const reading = 'Of ' + money(t.takeHome) + ' take-home, ' + (top ? top.name + ' takes the most (' + money(top.amount) + ', ' + pct(top.share) + '). ' : '') +
    (t.surplus < 0 ? 'Spending and saving run ' + money(-t.surplus) + ' a month past take-home.' : money(t.surplus) + ' a month is left over.');
  return card(ctx, { id: 'sankey', title: 'Where the money goes', svg: sankey({ left: data.left, right, width: chartWidth(half), fmt: money }), reading });
}

export function donutCard(ctx, s) {
  const d = cd.spendingDonut(s);
  const slots = cd.colorSlots(s);
  const u = unitOf(ctx, 'donut');
  const slices = d.slices.map((x) => ({ ...x, color: slotColor(slots, x.id) }));
  const f = (x) => (u === 'percent' ? pct(x.share) : money(x.amount));
  const top = slices[0];
  return card(ctx, {
    id: 'donut', title: 'Spending by category', unitToggle: true,
    svg: donut({ slices, size: 190, center: money(d.total), centerSub: 'a month', fmt: money, label: 'Spending by category' }),
    legendItems: slices.map((x) => [x.name + ' ' + f(x), x.color]),
    reading: top ? top.name + ' is ' + pct(top.share) + ' of spending.' : 'No spending entered yet.'
  });
}

export function nwsCard(ctx, s, asPie) {
  const d = cd.needsWantsSavings(s);
  const u = unitOf(ctx, 'nws');
  const parts = d.parts.map((p) => ({ ...p, color: NWS[p.id] }));
  const f = (p) => (u === 'percent' ? pct(p.share) : money(p.amount));
  const r = (id) => d.parts.find((p) => p.id === id) || {};
  const reading = d.takeHome === null ? 'Needs take-home pay first.'
    : 'Needs (as labeled) take ' + pct(r('needs').share) + ' of take-home (target 50%), wants ' + pct(r('wants').share) + ' (30%), savings ' + pct(r('savings').share) + ' (20%). FAT (food, accommodation, transportation) is ' + pct(s.totals.fatShare) + '.';
  return card(ctx, {
    id: 'nws', title: 'Needs, wants, savings', unitToggle: true,
    svg: asPie ? donut({ slices: parts, size: 170, inner: 0, fmt: money, label: 'Needs, wants, savings' })
      : stack({ parts, width: chartWidth(true), fmt: pct, label: 'Needs, wants, savings vs 50/30/20' }),
    legendItems: parts.map((p) => [p.name + ' ' + f(p), p.color]), reading
  });
}

export function fixedVariableCard(ctx, s) {
  const d = cd.fixedVariable(s);
  const u = unitOf(ctx, 'fv');
  const val = (x) => (u === 'percent' ? x.share : x.amount);
  const fmt = u === 'percent' ? pct : money;
  return card(ctx, {
    id: 'fv', title: 'Fixed vs variable', unitToggle: true,
    svg: hbars({ rows: d.map((x) => ({ label: x.name, values: [{ v: val(x), color: x.id === 'fixed' ? 'var(--chart-1)' : 'var(--chart-2)', tip: x.name + ': ' + money(x.amount) }] })), width: chartWidth(true), fmt }),
    reading: d[0].share === null ? 'No spending entered yet.' : pct(d[0].share) + ' of spending is fixed, so ' + pct(d[1].share) + ' can move month to month.'
  });
}

// Estimate vs actual
export function threeColumnCard(ctx, s, half) {
  const rows = cd.threeColumns(s);
  const u = unitOf(ctx, 'eda');
  const fmt = u === 'percent' ? (x) => pct(x, 0) : money;
  const pick = (r, k) => (u === 'percent' ? r[k + 'Share'] : r[k]);
  const t = s.totals;
  return card(ctx, {
    id: 'eda', title: 'Estimate, dream, actual', unitToggle: true,
    svg: hbars({ rows: rows.map((r) => ({ label: r.name, values: ['estimate', 'dream', 'actual'].map((k) => ({ v: pick(r, k), name: k, color: SERIES[k], tip: r.name + ' ' + k + ': ' + money(r[k]) })) })), width: chartWidth(half), fmt }),
    legendItems: [['Estimate', SERIES.estimate], ['Dream', SERIES.dream], ['Actual', SERIES.actual]],
    reading: 'Spending: ' + [[t.estimateTotal, 'estimated'], [t.dreamTotal, 'dreamed'], [t.actualTotal, 'actual so far']]
      .map(([v, w]) => (v === null ? 'nothing ' + w.replace(' so far', '') + ' yet' : money(v) + ' ' + w)).join(', ') + '.'
  });
}

export function overlapCard(ctx, s) {
  const rows = cd.threeColumns(s).filter((r) => r.estimate !== null || r.actual !== null);
  const c = s.culprits[0];
  return card(ctx, {
    id: 'overlap', title: 'Budget vs actual',
    svg: hbars({ mode: 'overlay', rows: rows.map((r) => ({ label: r.name, values: [
      { v: r.estimate, color: SERIES.estimate, tip: r.name + ' estimate: ' + money(r.estimate) },
      { v: r.actual, color: SERIES.actual, tip: r.name + ' actual: ' + money(r.actual) }] })), width: chartWidth(true), fmt: money }),
    legendItems: [['Estimate (outline)', SERIES.estimate], ['Actual (fill)', SERIES.actual]],
    reading: c ? c.name + ' came in ' + (c.ratio !== null ? times(c.ratio) + ' your estimate' : money(c.gap) + ' over an estimate of ' + money(c.estimate)) + '.' : 'Nothing came in over its estimate.'
  });
}

export function varianceCard(ctx, s) {
  const d = cd.variance(s);
  const u = unitOf(ctx, 'variance');
  const fmt = u === 'percent' ? signedPct : signedMoney;
  const over = d.filter((x) => x.amount > 0 && !x.savings);
  return card(ctx, {
    id: 'variance', title: 'Over and under the estimate', unitToggle: true,
    svg: d.length ? hbars({ mode: 'diverging', rows: d.map((x) => ({ label: x.name, values: [{ v: u === 'percent' ? x.share : x.amount, color: (x.amount > 0) !== x.savings ? 'var(--bad)' : 'var(--good)', tip: x.name + ': ' + signedMoney(x.amount) }] })), width: chartWidth(true), fmt }) : null,
    reading: over.length ? 'Biggest overage: ' + over[0].name + ', ' + signedMoney(over[0].amount) + ' a month over the estimate.' : 'No category came in over its estimate yet.'
  });
}

export function accuracyCard(ctx, s) {
  const d = cd.accuracyData(s);
  const hi = d[0];
  const lo = d[d.length - 1];
  return card(ctx, {
    id: 'accuracy', title: 'Accuracy (actual / estimate)',
    svg: d.length ? hbars({ rows: d.map((x) => ({ label: x.name, values: [{ v: x.ratio, color: x.ratio > 1 ? 'var(--bad)' : 'var(--series-actual)', tip: x.name + ': ' + times(x.ratio) }] })), width: chartWidth(true), fmt: times, ref: 1, refLabel: '1.0x = spot on' }) : null,
    reading: hi ? hi.name + ' came in ' + times(hi.ratio) + ' your estimate' + (lo && lo !== hi ? '; ' + lo.name + ' ' + times(lo.ratio) + '.' : '.') : 'Needs estimates and actuals for the same categories.'
  });
}

export function gutCard(ctx, s) {
  const d = cd.gutBars(s);
  const u = unitOf(ctx, 'gut');
  const colors = [SERIES.gut, SERIES.estimate, SERIES.dream, SERIES.actual];
  const g = s.gutCheck;
  return card(ctx, {
    id: 'gut', title: 'Gut check', unitToggle: true,
    svg: hbars({ rows: d.map((x, i) => ({ label: x.name, values: [{ v: u === 'percent' ? x.share : x.amount, color: colors[i], tip: x.name + ': ' + money(x.amount) }] })), width: chartWidth(true), fmt: u === 'percent' ? pct : money }),
    reading: g.actualVsGutRatio !== null ? 'Actual spending is ' + times(g.actualVsGutRatio) + ' the gut number of ' + money(g.gut) + '.' : 'Needs a gut number and some spending.'
  });
}

// Over time
export function trendCard(ctx, s) {
  const cats = cd.trendCategories(s);
  if (!cats.length) return card(ctx, { id: 'trend', title: 'Estimate vs actual over time', reading: 'Shows up once a second month has actuals (pick another month in Fill in, Actual).' });
  const pick = ctx.ui.trendCat && cats.some((c) => c.id === ctx.ui.trendCat) ? ctx.ui.trendCat : (s.culprits[0] && cats.some((c) => c.id === s.culprits[0].id) ? s.culprits[0].id : cats[0].id);
  const d = cd.trendData(s, pick);
  const xs = d.points.map((p) => monthLabel(p.key).slice(0, 3) + (p.current ? ' (now)' : ''));
  const trend = s.history.trends[pick];
  return card(ctx, {
    id: 'trend', title: 'Estimate vs actual over time',
    extra: h('select', { 'aria-label': 'Category', 'data-key': 'trend-cat', onchange: (e) => { ctx.ui.trendCat = e.target.value; ctx.rerender(); } },
      cats.map((c) => h('option', { value: c.id, selected: c.id === pick }, c.name))),
    svg: lines({ series: [
      { name: 'Estimate', color: SERIES.estimate, values: d.points.map((p) => p.estimate), dashed: true },
      { name: 'Actual', color: SERIES.actual, values: d.points.map((p) => p.actual) }], xs, width: chartWidth(true), fmt: money }),
    legendItems: [['Estimate', SERIES.estimate], ['Actual', SERIES.actual]],
    reading: d.name + ' actuals across the months entered: trend is ' + trend + '.'
  });
}

export function varianceByMonthCard(ctx, s) {
  const d = cd.varianceByMonth(s);
  if (!d.length) return card(ctx, { id: 'vbm', title: 'Variance by month', reading: 'Shows up once a second month has actuals (pick another month in Fill in, Actual).' });
  const last = d[d.length - 1];
  return card(ctx, {
    id: 'vbm', title: 'Variance by month',
    svg: hbars({ mode: 'diverging', rows: d.map((m) => ({ label: monthLabel(m.key), values: [{ v: m.share, color: m.share > 0 ? 'var(--bad)' : 'var(--good)', tip: monthLabel(m.key) + ': ' + signedPct(m.share) + ' (' + signedMoney(m.amount) + ')' }] })), width: chartWidth(true), fmt: signedPct }),
    reading: monthLabel(last.key) + ' came in ' + signedPct(last.share) + ' against the estimates.'
  });
}

// Lenses
export function draftCard(ctx, s) {
  const d = s.lenses.draftt;
  const rows = d.rows.filter((r) => !r.optional || r.share !== null);
  const off = rows.filter((r) => r.verdict === 'high' || r.verdict === 'low');
  const sources = Object.entries(ctx.refs.benchmarks.sources);
  return card(ctx, {
    id: 'draftt', title: 'DRAFTT',
    extra: h('div', {}, h('select', { 'aria-label': 'Benchmark source', 'data-key': 'draftt-source', onchange: (e) => ctx.update('Benchmark source', (doc) => { doc.settings.benchmarkSource = e.target.value; }) },
      sources.map(([id, src]) => h('option', { value: id, selected: id === d.source }, src.label))),
      d.placeholder ? h('div', { class: 'placeholder-note' }, 'Placeholder bands until Eli confirms the numbers for this source.') : null),
    svg: hbars({ rows: rows.map((r) => ({ label: r.label + (r.verdict ? ' (' + r.verdict + ')' : ''), band: r.band, values: [{ v: r.share, color: r.verdict === 'healthy' ? 'var(--series-actual)' : 'var(--bad)', tip: r.label + ': ' + pct(r.share) }] })), width: chartWidth(true), fmt: (x) => pct(x) }),
    legendItems: [['Healthy band', 'var(--good)']],
    reading: off.length ? off.map((r) => r.label).join(' and ') + (off.length > 1 ? ' are' : ' is') + ' outside the healthy band (' + d.sourceLabel + ').' : 'Everything measured sits inside the healthy bands (' + d.sourceLabel + ').'
  });
}

export function gaugesCard(ctx, s) {
  const g = cd.gauges(s, ctx.refs);
  return card(ctx, {
    id: 'gauges', title: 'Housing and savings rate',
    extra: h('div', { class: 'row', style: 'justify-content:space-around' },
      h('div', { class: 'chart', style: 'width:auto', html: gauge({ value: g.housing.value, band: g.housing.band, fmt: pct, caption: 'Housing, band ' + pct(g.housing.band), label: 'Housing share' }) }),
      h('div', { class: 'chart', style: 'width:auto', html: gauge({ value: g.savings.value, band: g.savings.target, good: 'over', fmt: pct, caption: 'Savings rate, target ' + pct(g.savings.target), label: 'Savings rate' }) })),
    reading: 'Housing is ' + pct(g.housing.value) + ' of take-home' + (g.housing.over ? ', above' : ', within') + ' the ' + pct(g.housing.band) + ' band. Saving ' + pct(g.savings.value) + ' including pre-tax' + (g.savings.under ? ', under' : ', at or above') + ' the ' + pct(g.savings.target) + ' target.'
  });
}

export function joyCard(ctx, s) {
  const d = cd.joyPoints(s);
  const low = s.lenses.joy.lowest;
  const slots = cd.colorSlots(s);
  const catId = (name) => (s.rows.find((r) => r.name === name) || {}).id;
  return card(ctx, {
    id: 'joy', title: 'Joy vs spend',
    svg: d.points.length ? scatter({ points: d.points.map((p) => ({ x: p.spend, y: p.joy, label: p.name, color: slotColor(slots, catId(p.category)), tip: p.name + ': ' + money(p.spend) + ', joy ' + p.joy })), width: chartWidth(true), xFmt: money, yFmt: (v) => String(Math.round(v)), xLabel: 'Monthly spend', yLabel: 'Joy', splitX: d.splitSpend, splitY: d.splitJoy, yMax: 10 }) : null,
    reading: low.length ? 'Lowest joy per dollar: ' + low.map((x) => x.name).join(', ') + '. Bottom right (high spend, low joy) is where to cut first.' : 'Rate joy on a few lines (Fill in, Actual, Details) to see this.'
  });
}

export function mistakeCard(ctx, s) {
  const m = cd.mistakeData(s);
  return card(ctx, {
    id: 'mistake', title: 'Mistake cost',
    svg: hbars({ rows: [{ label: 'A month', values: [{ v: m.monthly, color: 'var(--bad)', tip: money(m.monthly) }] }, { label: 'A year', values: [{ v: m.yearly, color: 'var(--bad)', tip: money(m.yearly) }] }], width: chartWidth(true), fmt: money }),
    reading: m.monthly > 0 ? 'Mistakes (fees, tickets, anything tagged) cost ' + money(m.monthly) + ' a month, ' + money(m.yearly) + ' a year.' : 'Nothing tagged as a mistake.'
  });
}

export function completionCard(ctx, s) {
  return card(ctx, {
    id: 'completion', title: 'How filled in is the picture',
    extra: h('div', { class: 'chart', style: 'width:auto', html: ring({ value: s.completion.pct }) }),
    reading: s.completion.answered + ' of ' + s.completion.count + ' questions answered. This measures the data, not how the client is doing.'
  });
}

export function incomeStatementCard(ctx, s) {
  const st = s.lenses.incomeStatement;
  const row = (label, m, a, cls, fmt = money) => h('tr', { class: cls || '' }, h('td', {}, label), h('td', { class: 'num' }, fmt(m)), h('td', { class: 'num' }, fmt(a)));
  const typeNames = { w2: 'W-2 pay', '1099': '1099 pay', side: 'Side income', unemployment: 'Unemployment', family: 'Family support', 'not-taxable': 'Not taxable' };
  return card(ctx, {
    id: 'statement', title: 'Personal income statement',
    extra: h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Month'), h('th', {}, 'Year'))),
      h('tbody', {},
        Object.entries(st.monthly.revenueByType).map(([k, v]) => row(typeNames[k] || k, v, st.annual.revenueByType[k])),
        st.hasGross ? row('Less taxes', st.monthly.taxes, st.annual.taxes, '', less) : null,
        st.hasGross ? row('Less pre-tax deductions', st.monthly.deductions, st.annual.deductions, '', less) : null,
        row('Take-home', st.monthly.takeHome, st.annual.takeHome, 'total'),
        st.monthly.expenses.map((e, i) => row('Less ' + e.label.toLowerCase(), e.amount, st.annual.expenses[i].amount, '', less)),
        row('Net (surplus)', st.monthly.net, st.annual.net, 'total', signedMoney)))),
    reading: (st.revenueIncludesTakeHomeOnly ? 'Some income has no gross, so it shows at take-home. ' : '') + 'Net is ' + signedMoney(st.monthly.net) + ' a month, ' + signedMoney(st.annual.net) + ' a year.'
  });
}
