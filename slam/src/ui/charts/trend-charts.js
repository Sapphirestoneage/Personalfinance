// Insights, Over time, Trends (S-092): a range picker (last 3, 6, 12 months, all) and a
// focus picker (a category, a line, or a merchant). Every number comes from
// src/calc/trends.js; each chart has a one-line, descriptive reading.

import { h, options } from '../dom.js';
import { money, pct, signedMoney, monthLabel, dayLabel, todayIso } from '../format.js';
import { lines, scatter, waterfall, heatGrid, columns } from './svg.js';
import { card, chartWidth } from './catalog.js';
import * as tr from '../../calc/trends.js';

const short = (m) => monthLabel(m).slice(0, 3) + " '" + m.slice(2, 4);
const RANGES = [['3', 'Last 3'], ['6', 'Last 6'], ['12', 'Last 12'], ['all', 'All']];

function pickers(ctx, s, months, focusKey) {
  const cats = s.rows.filter((r) => !r.savings && !r.isDebt);
  const merchants = tr.merchantsIn(ctx.doc, months).slice(0, 25);
  return h('div', { class: 'card', id: 'trend-pickers' }, h('div', { class: 'row' },
    h('div', { class: 'toggle', role: 'group', 'aria-label': 'Range' }, RANGES.map(([id, label]) => h('button', { 'aria-pressed': (ctx.ui.trendRange || '12') === id ? 'true' : 'false', 'data-key': 'trend-range-' + id, onclick: () => { ctx.ui.trendRange = id; ctx.rerender(); } }, label))),
    h('select', { 'aria-label': 'Focus', 'data-key': 'trend-focus', 'data-picker': 'focus', onchange: (e) => { ctx.ui.trendFocus = e.target.value; ctx.rerender(); } },
      h('optgroup', { label: 'Categories' }, options(cats.map((c) => ['cat:' + c.id, c.name]), focusKey)),
      h('optgroup', { label: 'Lines' }, options(cats.flatMap((c) => c.lines.map((l) => ['line:' + l.id, c.name + ' / ' + l.name])), focusKey)),
      merchants.length ? h('optgroup', { label: 'Merchants' }, options(merchants.map((m) => ['m:' + m, m]), focusKey)) : null)));
}

function seriesCard(ctx, ms, name) {
  const xs = ms.rows.map((r) => short(r.month));
  const series = [
    { name: 'Actual', color: 'var(--series-actual)', values: ms.rows.map((r) => r.actual) },
    { name: 'Estimate at close', color: 'var(--series-estimate)', values: ms.rows.map((r) => r.estimate) },
    { name: 'Plan', color: 'var(--series-dream)', dashed: true, values: ms.rows.map((r) => r.plan) },
    { name: '3-month average', color: 'var(--chart-7)', dashed: true, values: ms.rows.map((r) => r.rolling3) }
  ];
  const last = ms.rows.filter((r) => r.actual !== null).slice(-1)[0];
  const ly = ms.sameMonthLastYear;
  return card(ctx, {
    id: 'trend-series', title: name + ' by month',
    svg: lines({ series, xs, width: chartWidth(true), fmt: money, label: name + ' by month' }), legendItems: series.map((x) => [x.name, x.color]),
    reading: last ? monthLabel(last.month) + ': ' + money(last.actual) + ', against a 3-month average of ' + money(last.rolling3) + (last.plan !== null ? ' and a plan of ' + money(last.plan) : '') + '.' + (ly ? ' Same month last year: ' + money(ly.then) + ' (' + signedMoney(ly.change) + ').' : '') : 'No actuals in this range.'
  });
}

function merchantCards(ctx, months, merchant) {
  const p = tr.merchantPrices(ctx.doc, merchant, months);
  const v = tr.merchantVisits(ctx.doc, merchant, months);
  const t0 = months.length ? Date.parse(months[0] + '-01') : 0;
  const day = (d) => (Date.parse(d) - t0) / 86400000;
  const visits = v.reduce((a, x) => a + x.visits, 0);
  const total = v.reduce((a, x) => a + x.total, 0);
  return [
    card(ctx, {
      id: 'trend-price', title: merchant + ': price over time',
      svg: p.charges.length ? scatter({ points: p.charges.map((c) => ({ x: day(c.date), y: c.amount, color: 'var(--series-actual)', tip: dayLabel(c.date) + ': ' + money(c.amount, true) })), width: chartWidth(true), xFmt: () => '', yFmt: money, xLabel: short(months[0]) + ' to ' + short(months[months.length - 1]), yLabel: 'Charge' }) : null,
      reading: p.creep ? 'The price went from ' + money(p.creep.from, true) + ' to ' + money(p.creep.to, true) + ' (' + money(p.creep.yearly, true) + ' more a year).' : p.charges.length + ' charge' + (p.charges.length === 1 ? '' : 's') + ' in this range; no price change flagged.'
    }),
    card(ctx, {
      id: 'trend-visits', title: merchant + ': visits per month',
      svg: columns({ values: v.map((x) => ({ label: short(x.month), v: x.visits })), width: chartWidth(true), fmt: (n) => String(Math.round(n)), every: Math.max(1, Math.ceil(v.length / 6)) }),
      reading: visits ? visits + ' visits, an average ticket of ' + money(total / visits, true) + '.' : 'No visits in this range.'
    })
  ];
}

function chargesCard(ctx, months, catId, name) {
  const pts = tr.categoryCharges(ctx.doc, catId, months);
  const t0 = months.length ? Date.parse(months[0] + '-01') : 0;
  const big = pts.slice().sort((a, b) => b.amount - a.amount)[0];
  return card(ctx, {
    id: 'trend-charges', title: 'Every ' + name + ' charge',
    svg: pts.length ? scatter({ points: pts.map((c) => ({ x: (Date.parse(c.date) - t0) / 86400000, y: c.amount, color: 'var(--series-actual)', tip: dayLabel(c.date) + ' ' + c.label + ': ' + money(c.amount, true) })), width: chartWidth(true), xFmt: () => '', yFmt: money, xLabel: short(months[0]) + ' to ' + short(months[months.length - 1]), yLabel: 'Charge' }) : null,
    reading: pts.length ? pts.length + ' charges; the biggest was ' + money(big.amount, true) + ' on ' + dayLabel(big.date) + '.' : 'No charges in the log for this category in this range.'
  });
}

// Categories by month, once (S-106: the sparkline copy of the same grid is gone).
function gridCards(ctx, s, months) {
  const g = tr.categoryGrid(ctx.doc, s.history, months);
  const top = g.rows.map((r) => ({ name: r.name, total: r.values.reduce((a, v) => a + (v || 0), 0) })).sort((a, b) => b.total - a.total)[0];
  return [
    card(ctx, {
      id: 'trend-heat', title: 'Categories by month',
      svg: g.rows.length ? heatGrid({ rows: g.rows.map((r) => ({ label: r.name, values: r.values })), cols: months.map(short), width: chartWidth(true), fmt: money, max: g.max }) : null,
      reading: top ? top.name + ' is the darkest row: ' + money(top.total) + ' over these months.' : 'No actuals in this range.'
    })
  ];
}

function periodCards(ctx, s, months) {
  const doc = ctx.doc;
  const withData = months.filter((m) => s.history.allKeys.includes(m) || m === doc.currentMonth);
  const to = withData[withData.length - 1];
  const mom = tr.monthOverMonth(doc, s.history, to);
  const rows = [{ label: short(mom.from), from: 0, to: mom.before || 0, kind: 'total' }];
  let run = mom.before || 0;
  for (const x of mom.steps.slice(0, 8)) { rows.push({ label: x.name, from: run, to: run + x.change, kind: 'step' }); run += x.change; }
  if (mom.steps.length > 8) { const rest = mom.steps.slice(8).reduce((a, x) => a + x.change, 0); rows.push({ label: 'Everything else', from: run, to: run + rest, kind: 'step' }); run += rest; }
  rows.push({ label: short(mom.to), from: 0, to: mom.after || 0, kind: 'total' });
  const pace = tr.pacing(doc, doc.currentMonth, s.totals.planSpending);
  const now = todayIso();
  const today = now.slice(0, 7) === pace.month ? Number(now.slice(8)) : now.slice(0, 7) > pace.month ? pace.days : 0;
  const dom = tr.dayOfMonth(doc, months);
  const peak = dom.slice().sort((a, b) => b.average - a.average)[0];
  return [
    card(ctx, {
      id: 'trend-mom', title: 'Month over month',
      svg: waterfall({ rows, width: chartWidth(true), fmt: money, label: 'Spending from last month to this month' }),
      reading: mom.before === null || mom.after === null ? 'Needs two months with actuals.' : 'Spending went from ' + money(mom.before) + ' in ' + monthLabel(mom.from) + ' to ' + money(mom.after) + ' in ' + monthLabel(mom.to) + (mom.steps[0] ? '; the biggest change was ' + mom.steps[0].name + ' (' + signedMoney(mom.steps[0].change) + ').' : '.')
    }),
    card(ctx, {
      id: 'trend-pacing', title: 'Pacing, ' + monthLabel(pace.month),
      svg: lines({ series: [{ name: 'This month', color: 'var(--series-actual)', values: pace.now }, { name: 'Last month', color: 'var(--chart-other)', values: pace.last.slice(0, pace.days) }, ...(pace.plan ? [{ name: 'Plan, spread evenly', color: 'var(--series-dream)', dashed: true, values: pace.plan }] : [])],
        xs: Array.from({ length: pace.days }, (_, i) => (i % 5 === 0 ? String(i + 1) : '')), width: chartWidth(true), fmt: money, label: 'Cumulative spending by day' }),
      legendItems: [['This month', 'var(--series-actual)'], ['Last month', 'var(--chart-other)'], ...(pace.plan ? [['Plan, spread evenly', 'var(--series-dream)']] : [])],
      reading: today ? 'Through day ' + today + ': ' + money(pace.now[today - 1]) + ' logged, against ' + money(pace.last[Math.min(today, pace.last.length) - 1]) + ' by the same day last month' + (pace.plan ? ' and ' + money(pace.plan[today - 1]) + ' of the plan spread evenly' : '') + '.' : 'This month has not started yet.'
    }),
    card(ctx, {
      id: 'trend-dom', title: 'Spending by day of the month',
      svg: columns({ values: dom.map((d) => ({ label: String(d.day), v: d.average })), width: chartWidth(true), fmt: money }),
      reading: peak && peak.average ? 'Day ' + peak.day + ' averages the most, ' + money(peak.average) + ' a month.' : 'No entries in this range.'
    })
  ];
}

// The one-line stats share one card (S-106); each keeps its own id.
function statCard(ctx, id, title, text) {
  return h('div', { class: 'stat', id: 'stat-' + id }, h('b', {}, title), h('p', { class: 'reading', style: 'margin:2px 0 8px' }, text));
}

function statCards(ctx, s, months) {
  const doc = ctx.doc;
  const ff = tr.fixedFloor(s.totals);
  const vol = tr.volatility(tr.categoryGrid(doc, s.history, months));
  const lc = tr.lifestyleCreep(doc, s.history, months);
  const learn = tr.learningCurve(doc, months);
  const hit = tr.planHitRate(doc, s, months).filter((x) => x.rate !== null);
  const ne = tr.notExplained(doc, s.income, months);
  const fl = tr.cardFloat(doc, months);
  const inc = tr.incomeStability(doc, months);
  const hab = tr.annualizedHabits(doc, months);
  const tk = tr.trackingByMonth(doc, months);
  const lastOf = (xs) => xs[xs.length - 1];
  return [
    statCard(ctx, 'floor', 'Fixed floor', money(ff.amount) + ' a month in fixed lines and debt minimums, ' + pct(ff.share) + ' of take-home.'),
    statCard(ctx, 'volatility', 'Volatility', vol.length ? vol.map((v) => v.name).join(', ') + ' swing the most (' + vol.map((v) => money(v.sd) + ' on ' + money(v.mean)).join(', ') + '). These may need a buffer or a sinking fund.' : 'Needs two months with actuals.'),
    statCard(ctx, 'creep', 'Lifestyle creep', lc ? 'From ' + monthLabel(lc.from) + ' to ' + monthLabel(lc.to) + ', spending moved ' + signedMoney(lc.spendingPerMonth) + ' a month on average, take-home ' + signedMoney(lc.takeHomePerMonth) + '.' : 'Needs two closed months.'),
    statCard(ctx, 'learning', 'Estimate learning curve', learn.length ? learn.map((x) => short(x.month) + ' ' + (x.offBy === null ? '·' : x.offBy.toFixed(1) + 'x')).join(', ') + '.' : 'Needs closed months.'),
    statCard(ctx, 'hit', 'Plan hit rate', hit.length ? hit.map((x) => short(x.month) + ' ' + x.hits + ' of ' + x.of).join(', ') + ' lines on plan or better.' : 'Needs a plan and actuals.'),
    statCard(ctx, 'unexplained', 'Not explained yet', signedMoney(ne.bridge) + ' over ' + ne.months + ' bridged month' + (ne.months === 1 ? '' : 's') + '; ATM cash ' + money(ne.atm) + '; Venmo or Zelle with no line ' + money(ne.p2p) + '.'),
    statCard(ctx, 'float', 'Card float', fl.some((x) => x.charged || x.paid) ? fl.filter((x) => x.charged || x.paid).slice(-4).map((x) => short(x.month) + ' charged ' + money(x.charged) + ', paid ' + money(x.paid)).join('; ') + '.' : 'No card charges in the log.'),
    statCard(ctx, 'income', 'Income stability', inc ? '1099 and side income: low ' + money(inc.low) + ', average ' + money(inc.average) + ', high ' + money(inc.high) + ' a month.' : 'No 1099 or side income in the log.'),
    statCard(ctx, 'habits', 'Annualized habits', hab.length ? hab.map((x) => x.merchant + ' ' + money(x.yearly) + ' a year (' + x.count + ' charges of about ' + money(x.average, true) + ')').join('; ') + '.' : 'No small, frequent charges.'),
    statCard(ctx, 'tracking', 'Tracking completeness', tk.length ? tk.slice(-6).map((x) => short(x.month) + ' ' + pct(x.share)).join(', ') + ' of spending from the log.' + (lastOf(tk) ? '' : '') : 'Needs closed months with a review.')
  ];
}

export function trendCards(ctx, s) {
  const months = tr.trendMonths(ctx.doc, s.history, ctx.ui.trendRange || '12');
  const cats = s.rows.filter((r) => !r.savings && !r.isDebt);
  const fallback = 'cat:' + ((cats.find((c) => c.id === 'food') || cats[0] || { id: 'food' }).id);
  const focusKey = ctx.ui.trendFocus || fallback;
  const [kind, ...rest] = focusKey.split(':');
  const id = rest.join(':');
  const out = [pickers(ctx, s, months, focusKey)];
  if (kind === 'm') out.push(...merchantCards(ctx, months, id));
  else {
    const name = kind === 'cat' ? (cats.find((c) => c.id === id) || { name: id }).name : (cats.flatMap((c) => c.lines).find((l) => l.id === id) || { name: id }).name;
    out.push(seriesCard(ctx, tr.monthlySeries(ctx.doc, s.history, { kind: kind === 'cat' ? 'category' : 'line', id }, months), name));
    if (kind === 'cat') out.push(chargesCard(ctx, months, id, name));
  }
  out.push(...gridCards(ctx, s, months), ...periodCards(ctx, s, months), h('div', { class: 'card', id: 'trend-stats', style: 'grid-column:1 / -1' }, h('h3', {}, 'In one line each'), statCards(ctx, s, months)));
  return out;
}
