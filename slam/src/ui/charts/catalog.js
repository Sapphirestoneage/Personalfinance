// Every chart in SLAM, as a card: title, optional dollars/percent toggle, the
// SVG, a legend, and a one-line plain-English reading. Data comes from
// src/calc/chart-data.js; this file only lays it out and words it.

import { h } from '../dom.js';
import { money, pct, times, signedMoney, signedPct, monthLabel, less } from '../format.js';
import * as cd from '../../calc/chart-data.js';
import { categoryTypeLabel, lineTypeLabel } from '../../store/types.js';
import { findLine } from '../../store/edits.js';
import { hbars, donut, sankey, gauge, ring, lines, scatter, stack, shareBar } from './svg.js';
import { drafttReading } from '../../calc/lenses.js';
import { stressReading } from '../../calc/happiness.js';
import { changeIn } from '../components/jump.js';

// --series-dream is the third series color; it draws the plan here (the dream life has its own card in Eras).
const SERIES = { gut: 'var(--series-gut)', estimate: 'var(--series-estimate)', plan: 'var(--series-dream)', actual: 'var(--series-actual)' };
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
  const cols = s.plan ? ['estimate', 'plan', 'actual'] : ['estimate', 'actual'];
  const NAME = { estimate: 'Estimate', plan: 'Plan', actual: 'Actual' };
  return card(ctx, {
    id: 'eda', title: s.plan ? 'Estimate, plan, actual' : 'Estimate vs actual', unitToggle: true,
    svg: hbars({ rows: rows.map((r) => ({ label: r.name, values: cols.map((k) => ({ v: pick(r, k), name: k, color: SERIES[k], tip: r.name + ' ' + k + ': ' + money(r[k]) })) })), width: chartWidth(half), fmt }),
    legendItems: cols.map((k) => [NAME[k], SERIES[k]]),
    reading: 'Spending: ' + [[t.estimateTotal, 'estimated'], ...(s.plan ? [[s.plan.spending, 'planned']] : []), [t.actualTotal, 'actual so far']]
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
  const colors = [SERIES.gut, SERIES.estimate, SERIES.actual];
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
  if (!cats.length) return card(ctx, { id: 'trend', title: 'Estimate vs actual over time', reading: 'Shows up once a second month has actuals (pick another month in Plan, Start of month).' });
  const pick = ctx.ui.trendCat && cats.some((c) => c.id === ctx.ui.trendCat) ? ctx.ui.trendCat : (s.culprits[0] && cats.some((c) => c.id === s.culprits[0].id) ? s.culprits[0].id : cats[0].id);
  const d = cd.trendData(s, pick);
  const xs = d.points.map((p) => monthLabel(p.key).slice(0, 3) + (p.current ? ' (now)' : ''));
  const trend = s.history.trends[pick];
  return card(ctx, {
    id: 'trend', title: 'Estimate vs actual over time',
    extra: h('select', { 'aria-label': 'Category', 'data-key': 'trend-cat', 'data-picker': 'focus', onchange: (e) => { ctx.ui.trendCat = e.target.value; ctx.rerender(); } },
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
  if (!d.length) return card(ctx, { id: 'vbm', title: 'Variance by month', reading: 'Shows up once a second month has actuals (pick another month in Plan, Start of month).' });
  const last = d[d.length - 1];
  return card(ctx, {
    id: 'vbm', title: 'Variance by month',
    svg: hbars({ mode: 'diverging', rows: d.map((m) => ({ label: monthLabel(m.key), values: [{ v: m.share, color: m.share > 0 ? 'var(--bad)' : 'var(--good)', tip: monthLabel(m.key) + ': ' + signedPct(m.share) + ' (' + signedMoney(m.amount) + ')' }] })), width: chartWidth(true), fmt: signedPct }),
    reading: monthLabel(last.key) + ' came in ' + signedPct(last.share) + ' against the estimates.'
  });
}

// Lenses
// DRAFTT, descriptive (S-072): proportions only. Neutral categorical colors,
// never good or bad colors, no bands, no verdicts.
const LETTER_COLORS = { debt: 'var(--chart-1)', retirement: 'var(--chart-2)', accommodation: 'var(--chart-3)', food: 'var(--chart-4)', transportation: 'var(--chart-5)', therapy: 'var(--chart-7)' };
const DRAFTT_COLS = [['label', 'Letter'], ['amount', 'Amount'], ['share', '% of base'], ['shareOfDraftt', '% of DRAFTT'], ['estimateShare', 'Estimate %'], ['actualShare', 'Actual %'], ['change', 'Change']];
const pts = (x) => (x === null || x === undefined ? '\u00b7' : (x > 0 ? '+' : '') + (x * 100).toFixed(1) + ' pts');

export function draftCard(ctx, s) {
  const d = s.lenses.draftt;
  const rows = d.rows.filter((r) => r.amount !== null);
  const pct0 = (x) => pct(x);
  const parts = [
    ...rows.map((r) => ({ name: r.label, short: r.letter + ' ' + pct0(r.share), share: r.share, color: LETTER_COLORS[r.key] })),
    { name: 'Everything else', short: 'Else ' + pct0(d.everythingElseShare), share: d.everythingElseShare, color: 'var(--chart-other)' },
    d.leftOverShare !== null && d.leftOverShare > 0 ? { name: 'Left over', short: 'Left ' + pct0(d.leftOverShare), share: d.leftOverShare, color: 'var(--unassigned)' } : null
  ].filter(Boolean);
  const shortfall = d.leftOverShare !== null && d.leftOverShare < 0 ? -d.leftOverShare : 0;
  const bar = d.base.amount === null ? null : h('div', {},
    h('div', { class: 'field-label' }, 'Where ' + d.base.label + ' goes'),
    h('div', { class: 'chart', html: shareBar({ parts, shortfall, width: chartWidth(false), label: 'Where ' + d.base.label + ' goes' }) }),
    h('div', { class: 'legend' }, [...parts.map((x) => [x.name + ' ' + pct(x.share), x.color]), ...(shortfall ? [['Shortfall ' + pct(shortfall), 'transparent']] : [])]
      .map(([l, c]) => h('span', {}, h('i', { style: 'background:' + c + (c === 'transparent' ? ';outline:1.5px dashed var(--chart-axis)' : '') }), l))));
  const letters = h('div', {},
    h('div', { class: 'field-label' }, 'DRAFTT letters'),
    h('div', { class: 'draftt-letters' },
      h('div', { class: 'chart', style: 'width:auto', html: donut({ slices: rows.map((r) => ({ name: r.label, amount: Math.max(0, r.amount), color: LETTER_COLORS[r.key] })), size: 160, center: money(d.total), centerSub: 'a month', fmt: money, label: 'DRAFTT letters' }) }),
      h('ul', { class: 'plain small' }, rows.map((r) => h('li', {}, h('span', {}, h('i', { class: 'swatch', style: 'background:' + LETTER_COLORS[r.key] }), ' ' + r.label),
        h('span', { class: 'num' }, pct(r.shareOfDraftt) + ', ' + money(r.amount)))))));
  const sort = ctx.ui.drafttSort || { key: null, dir: -1 };
  const sorted = rows.slice();
  if (sort.key) sorted.sort((a, b) => { const x = a[sort.key]; const y = b[sort.key]; if (x === y) return 0; if (x === null) return 1; if (y === null) return -1; return (x < y ? -1 : 1) * sort.dir; });
  const cell = (r, k) => (k === 'label' ? r.label + (r.usesEstimate ? ' (estimate)' : '') : k === 'amount' ? money(r.amount) : k === 'change' ? pts(r.change) : pct(r[k]));
  const table = h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
    h('thead', {}, h('tr', {}, DRAFTT_COLS.map(([k, l]) => h('th', { scope: 'col', 'aria-sort': sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : null,
      onclick: () => { ctx.ui.drafttSort = { key: k, dir: sort.key === k ? -sort.dir : (k === 'label' ? 1 : -1) }; ctx.rerender(); } }, l)))),
    h('tbody', {},
      sorted.map((r) => h('tr', {}, DRAFTT_COLS.map(([k]) => h('td', { class: k === 'label' ? '' : 'num' }, cell(r, k))))),
      h('tr', { class: 'cat' }, h('td', {}, 'DRAFTT total'), h('td', { class: 'num' }, money(d.total)), h('td', { class: 'num' }, pct(d.totalShare)), h('td', { class: 'num' }, rows.length ? '100%' : '\u00b7'), h('td', {}), h('td', {}), h('td', {})),
      h('tr', { class: 'line' }, h('td', {}, 'Everything else'), h('td', { class: 'num' }, money(d.everythingElse)), h('td', { class: 'num' }, pct(d.everythingElseShare)), h('td', {}), h('td', {}), h('td', {}), h('td', {})),
      h('tr', { class: 'line' }, h('td', {}, d.leftOver !== null && d.leftOver < 0 ? 'Shortfall' : 'Left over'), h('td', { class: 'num' }, money(d.leftOver)), h('td', { class: 'num' }, pct(d.leftOverShare)), h('td', {}), h('td', {}), h('td', {}), h('td', {})),
      h('tr', { class: 'cat' }, h('td', {}, 'Base: ' + d.base.label), h('td', { class: 'num' }, money(d.base.amount)), h('td', { class: 'num' }, d.base.amount === null ? '\u00b7' : '100%'), h('td', {}), h('td', {}), h('td', {}), h('td', {})))));
  return card(ctx, {
    id: 'draftt', title: 'DRAFTT',
    extra: h('div', { class: 'draftt' }, bar, letters, table,
      d.taxes ? h('p', { class: 'small' }, 'Taxes: ' + money(d.taxes.amount) + ' a month, ' + pct(d.taxes.shareOfGross) + ' of gross (not part of the base).') : null),
    reading: drafttReading(d)
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

// Satisfaction and stress (S-082): what to keep more of, what drains, and what to look at first.
const LEAN = { more: 'More of', less: 'Less of', even: 'About even' };
export function stressCard(ctx, s) {
  const st = s.stress;
  const lines = s.rows.flatMap((r) => r.lines).filter((l) => st.byId[l.id]);
  const rows = lines.map((l) => ({ l, x: st.byId[l.id] })).sort((a, b) => (b.x.drain || 0) - (a.x.drain || 0) || b.x.stress - a.x.stress);
  const first = st.lookFirst.slice(0, 3);
  return card(ctx, {
    id: 'stress', title: 'Satisfaction and stress',
    extra: st.ratedCount ? h('div', {},
      first.length ? h('div', {}, h('div', { class: 'field-label' }, 'Look at first'),
        h('ol', { class: 'small' }, first.map((x) => h('li', {}, h('b', {}, x.name), ' ', money(x.amount) + ' a month, stress ' + x.stress + ', joy or purpose ' + x.joy)))) : null,
      st.moreOf.length ? h('div', {}, h('div', { class: 'field-label' }, 'Worth more of'),
        h('ul', { class: 'plain small' }, st.moreOf.slice(0, 5).map((x) => h('li', {}, h('span', {}, x.name), h('span', { class: 'num' }, x.joyPer100 === null ? 'no cost' : x.joyPer100.toFixed(2) + ' joy per $100'))))) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
        h('thead', {}, h('tr', {}, ['Line', 'Joy or purpose', 'Stress', 'Lean', 'A month', '% of stress', 'Stress per $100'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map(({ l, x }) => h('tr', {},
          h('td', {}, l.name), h('td', { class: 'num' }, l.joy === null ? h('span', { class: 'xs muted' }, 'not rated') : String(l.joy)),
          h('td', { class: 'num' }, String(x.stress)), h('td', {}, x.lean ? LEAN[x.lean] : h('span', { class: 'xs muted' }, 'rate joy too')),
          h('td', { class: 'num' }, money(l.basis)), h('td', { class: 'num' }, pct(x.share)),
          h('td', { class: 'num' }, x.per100 === null ? (l.basis === 0 ? 'no cost' : '\u00b7') : x.per100.toFixed(2)))))))) : null,
    reading: stressReading(st)
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
    reading: low.length ? 'Lowest joy per dollar: ' + low.map((x) => x.name).join(', ') + '. Bottom right (high spend, low joy) is where to cut first.' : 'Rate joy on a few lines (Setup, Categories and lines, Details) to see this.'
  });
}

// Mistakes are self-selected on Review (S-069, S-106): tick what was a mistake (a late fee,
// a ticket, an impulse buy). Nothing is a mistake until the client says so.
// A mistake the coach tags stays coach-only until the coach shares it (S-096);
// one the client ticks is theirs, so it is shared from the start.
export function mistakePicker(ctx, s) {
  const asClient = ctx.role === 'client';
  const shared = (id) => { const f = findLine(ctx.doc, id); return !!(f && f.line.mistakeShared); };
  const lines = s.rows.filter((r) => !r.savings && !r.isDebt).flatMap((r) => r.lines.filter((l) => !l.computed && l.basis !== null && l.basis > 0).map((l) => ({ ...l, category: r.name })))
    .sort((a, b) => (b.tag === 'mistake') - (a.tag === 'mistake'));
  return h('div', { class: 'mistake-pick' },
    h('div', { class: 'field-label' }, 'Which of these were mistakes?'),
    lines.length ? lines.map((l) => h('label', { class: 'check spread' },
      h('span', {}, h('input', { type: 'checkbox', checked: l.tag === 'mistake', 'data-key': 'mistake:' + l.id,
        onchange: (e) => ctx.update(e.target.checked ? 'Mark as a mistake' : 'Not a mistake', (d) => {
          const line = findLine(d, l.id).line;
          line.tag = e.target.checked ? 'mistake' : 'planned';
          line.mistakeShared = e.target.checked && (asClient || line.mistakeShared);
        }) }),
        ' ' + l.name, h('span', { class: 'xs muted' }, ' ' + l.category),
        !asClient && l.tag === 'mistake' ? h('label', { class: 'xs check-inline' }, h('input', { type: 'checkbox', checked: shared(l.id), 'data-key': 'mistake-share:' + l.id,
          onchange: (e) => ctx.update(e.target.checked ? 'Share the mistake tag' : 'Keep the mistake tag to the coach', (d) => { findLine(d, l.id).line.mistakeShared = e.target.checked; }) }), ' Shared with client') : null),
      h('span', { class: 'num small' }, money(l.basis)))) : h('p', { class: 'small muted' }, 'No spending lines with amounts yet.'));
}

// The cost, read-only (Insights, S-106); which lines were mistakes is ticked on Review.
export function mistakeCard(ctx, s) {
  const m = cd.mistakeData(s);
  return card(ctx, {
    id: 'mistake', title: 'Mistake cost',
    svg: m.monthly > 0 ? hbars({ rows: [{ label: 'A month', values: [{ v: m.monthly, color: 'var(--bad)', tip: money(m.monthly) }] }, { label: 'A year', values: [{ v: m.yearly, color: 'var(--bad)', tip: money(m.yearly) }] }], width: chartWidth(true), fmt: money }) : null,
    extra: changeIn(ctx, 'mistakes', 'Review'),
    reading: m.monthly > 0 ? 'What you marked as mistakes costs ' + money(m.monthly) + ' a month, ' + money(m.yearly) + ' a year.' : 'Nothing marked as a mistake. Tick the lines that were mistakes on Review.'
  });
}

// Spending by standard type (like Rocket Money's categories), whatever the lines are called.
export function typesCard(ctx, s) {
  const rows = s.totals.spendByType;
  const label = (t) => (t.startsWith('cat:') ? categoryTypeLabel(t.slice(4)) + ' (one number)' : lineTypeLabel(t));
  const top = rows[0];
  return card(ctx, {
    id: 'types', title: 'Spending by type',
    extra: rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
      h('thead', {}, h('tr', {}, ['Type', 'A month', 'Share'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((t) => h('tr', {},
        h('td', {}, label(t.type), h('div', { class: 'xs muted' }, [...new Set(t.names)].join(', '))),
        h('td', { class: 'num' }, money(t.amount)), h('td', { class: 'num' }, pct(t.share))))))) : null,
    reading: top ? label(top.type) + ' is the biggest type at ' + money(top.amount) + ' a month (' + pct(top.share) + ' of spending). Names are yours; types stay the same so months and clients compare.'
      : 'Nothing spent yet.'
  });
}

// The client's own tags: what each tag adds up to this month.
export function tagsCard(ctx, s) {
  const rows = s.tags.filter((t) => t.count);
  const exact = (x) => (x === null ? 'Blank' : money(x));
  const top = rows.filter((t) => t.actual !== null).sort((a, b) => b.actual - a.actual)[0];
  return card(ctx, {
    id: 'tags', title: 'By tag',
    extra: rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
      h('thead', {}, h('tr', {}, ['Tag', 'Lines', 'Estimate', 'Actual'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((t) => h('tr', {}, h('td', {}, '#' + t.name, h('div', { class: 'xs muted' }, t.lines.join(', '))),
        h('td', { class: 'num' }, String(t.count)), h('td', { class: 'num' }, exact(t.estimate)),
        h('td', { class: 'num' }, exact(t.actual) + (t.actualMissing && t.actual !== null ? ' (partial)' : ''))))))) : null,
    reading: !s.tags.length ? 'No tags yet. Add them on any line in Setup, Categories and lines (Subscription, Travel, anything you like).'
      : !rows.length ? 'Tags are made but not on any line yet.'
        : top ? '#' + top.name + ' is the biggest tag this month at ' + money(top.actual) + '. A line can carry more than one tag, so tags can overlap.' : 'No actuals on tagged lines yet.'
  });
}

export function completionCard(ctx, s) {
  return card(ctx, {
    id: 'completion', title: 'How filled in is the picture',
    extra: h('div', { class: 'row' }, h('div', { class: 'chart', style: 'width:auto', html: ring({ value: s.completion.pct }) }),
      h('span', { class: 'small' }, h('b', { class: 'num' }, pct(s.completion.pct)), ' filled in, heavy numbers weighted more')),
    reading: s.completion.answered + ' of ' + s.completion.count + ' questions answered. ' + ctx.say('completion-note')
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
