// The app's charts as cards (overnight Track C): each one asks its question, says its point, and opens as a table.
// Numbers come figured from engine/charts.js; this file only words them and hands them to ui/chart.js to draw.

import { h, money, monthWords, shortDate } from './view.js';
import { chartCard, lines, bars, columns, waterfall, treemap, heatmap, sparkline, rangeSwitch, axisMoney, exactMoney } from './chart.js';
import * as C from '../engine/charts.js';

const pct = (x) => Math.round(x * 1000) / 10 + '%';
const pct0 = (x) => Math.round(x * 100) + '%';
const yearOf = (t) => Math.floor(t + 1e-6);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tWords = (t) => { const y = yearOf(t), m = Math.min(11, Math.round((t - y) * 12)); return MON[m] + ' ' + y; };
const ymT = (ym) => +ym.slice(0, 4) + (+ym.slice(5, 7) - 1) / 12;
const stepsTable = (steps) => ({ head: ['Step', 'Amount'], rows: steps.map((st) => [st.label + (st.rough ? ' (rough)' : ''), (st.total || st.v < 0 ? '' : '+') + exactMoney(st.v)]) });
const ROUGH_NOTE = 'Hatched or dashed parts rest on a guess or a missing number.';

// ---------------------------------------------------------------- My numbers
export function netWorthWaterfallCard(sheet, spine) {
  const steps = C.netWorthSteps(sheet, spine), last = steps[steps.length - 1];
  const owns = steps.filter((x) => !x.total && x.v > 0).sort((a, b) => b.v - a.v)[0];
  return chartCard({ id: 'nw-waterfall', question: 'What makes up your net worth?',
    summary: last.v === null ? 'Net worth is missing a number.' : 'What you own, less what you owe, comes to ' + exactMoney(last.v) + (owns ? '; the biggest part is ' + owns.label.toLowerCase() + ' at ' + exactMoney(owns.v) : '') + '.',
    draw: (w) => waterfall({ width: w, steps, label: 'Net worth, step by step' }),
    legend: [{ c: 1, words: 'Adds' }, { c: 2, words: 'Takes away' }, { c: 0, words: 'Total' }],
    note: steps.some((x) => x.rough) ? ROUGH_NOTE : null, table: stepsTable(steps) });
}
// Points kept in this browser, one a day, per household (never written into the household's numbers).
const NW_KEY = 'slam-nw-points:v1';
const pointsKey = (spine) => (spine.meta && (spine.meta.name || spine.meta.from)) || 'household';
export function readPoints(spine) { try { const all = JSON.parse(localStorage.getItem(NW_KEY) || '{}'); return all[pointsKey(spine)] || []; } catch { return []; } }
export function keepPoint(spine, date, value) {
  try { const all = JSON.parse(localStorage.getItem(NW_KEY) || '{}'); all[pointsKey(spine)] = C.addNetWorthPoint(all[pointsKey(spine)] || [], date, value); localStorage.setItem(NW_KEY, JSON.stringify(all)); return all[pointsKey(spine)]; } catch { return readPoints(spine); }
}
export function netWorthTimeCard(spine, sheet, months, { range = '1y', onRange = () => {}, asOf }) {
  const points = keepPoint(spine, asOf, sheet.netWorth.value);
  const p = C.netWorthPath(points, months, { asOf, range });
  const controls = rangeSwitch([['1y', '1 year'], ['5y', '5 years'], ['all', 'All']], range, onRange, 'How far');
  const end = p.ahead[p.ahead.length - 1];
  const summary = (p.enough ? 'From ' + exactMoney(p.past[0][1]) + ' on ' + tWords(p.past[0][0]) + ' to ' + exactMoney(p.past[p.past.length - 1][1]) + ' now. ' : 'One point so far: ' + exactMoney(sheet.netWorth.value) + ' today. ') + (end ? 'At this pace, about ' + exactMoney(end[1]) + ' by ' + tWords(end[0]) + ' (a projection).' : '');
  if (!p.ahead.length && !p.enough) return chartCard({ id: 'nw-time', question: 'How is your net worth changing?', summary, controls, empty: 'A line starts once your net worth has been seen on two different days. Each visit adds today\'s.' });
  const series = [];
  if (p.past.length > 1) series.push({ label: 'Recorded', c: 1, points: p.past, endLabel: null });
  if (p.ahead.length > 1) series.push({ label: 'Projected', c: 3, points: p.past.length ? [p.past[p.past.length - 1], ...p.ahead] : p.ahead, dashed: true, endLabel: 'Projected' });
  const all = [...p.past, ...p.ahead];
  const byT = new Map(all.map(([t, x]) => [t, x]));
  return chartCard({ id: 'nw-time', question: 'How is your net worth changing?', summary, controls,
    draw: (w) => lines({ width: w, series, xFmt: (t) => (range === '1y' ? tWords(t) : String(yearOf(t))), vmarks: p.past.length ? [{ x: p.past[p.past.length - 1][0], label: 'Today' }] : [], tips: (t) => tWords(t) + ': ' + exactMoney(byT.get(t)) + (p.past.some((q) => q[0] === t) ? '' : ' (projected)'), label: 'Net worth over time' }),
    legend: [{ c: 1, words: 'Recorded on your visits' }, { c: 3, words: 'Projected (rough)', dash: true }],
    note: p.enough ? null : 'The recorded line starts once your net worth has been seen on two different days; each visit adds today\'s.',
    table: { head: ['When', 'Net worth', ''], rows: all.map(([t, x]) => [tWords(t), exactMoney(x), p.past.some((q) => q[0] === t) ? 'recorded' : 'projected']) } });
}

// ---------------------------------------------------------------- Income
export function paycheckCard(flow, stream) {
  const steps = C.paycheckSteps(flow, stream.id);
  if (steps.length < 3) return null;
  const last = steps[steps.length - 1];
  return chartCard({ id: 'paycheck-' + stream.id, question: 'Where does ' + stream.label + ' go before it reaches you?',
    summary: 'Of ' + exactMoney(steps[0].v) + ' a month, ' + exactMoney(last.v) + ' lands in your account' + (last.share === null ? '.' : ' (' + pct0(last.share) + ')') + ', after taxes and what comes out of pay for saving.',
    draw: (w) => waterfall({ width: w, steps, label: 'A paycheck, step by step' }),
    legend: [{ c: 2, words: 'Taken out' }, { c: 0, words: 'Pay and take-home' }], note: steps.some((x) => x.rough) ? ROUGH_NOTE : null, table: stepsTable(steps) });
}
export function monthWaterfallCard(table) {
  const steps = C.monthSteps(table), last = steps[steps.length - 1];
  return chartCard({ id: 'month-waterfall', question: 'Where does a month\'s money go?',
    summary: exactMoney(steps[0].v) + ' comes in; ' + exactMoney(last.v) + ' is left after everything.',
    draw: (w) => waterfall({ width: w, steps, label: 'A month, step by step' }), legend: [{ c: 2, words: 'Goes out' }, { c: 0, words: 'In and left' }], note: steps.some((x) => x.rough) ? ROUGH_NOTE : null, table: stepsTable(steps) });
}

// ---------------------------------------------------------------- Budget
export function budgetCharts(spine, rules, view, { weekStart = 0, months = [] } = {}) {
  const { rows } = C.budgetRows(view);
  const over = rows.filter((r) => r.over).sort((a, b) => b.diff - a.diff);
  const out = [];
  out.push(chartCard({ id: 'budget-bullets', question: 'Is each part on plan this ' + (view.range === 'month' ? 'month' : 'stretch') + '?',
    summary: over.length ? over.map((r) => r.label + ' is ' + exactMoney(r.diff) + ' over').join('; ') + '.' : 'Every part is at or under plan.',
    draw: (w) => bars({ width: w, rows: rows.map((r) => ({ label: r.label, range: { v0: 0, v1: r.plan }, segs: [{ v: r.actual, c: r.over ? 2 : 1, tip: r.label + ': ' + exactMoney(r.actual) + ' spent of ' + exactMoney(r.plan) + ' planned' }], target: r.plan, targetTip: r.label + ': plan ' + exactMoney(r.plan), value: axisMoney(r.actual) + ' of ' + axisMoney(r.plan) })), label: 'Spent against plan' }),
    legend: [{ c: 1, words: 'Spent, at or under plan' }, { c: 2, words: 'Spent, over plan' }, { c: 0, words: 'Plan (the tick and pale bar)', cls: 'sw-band' }],
    table: { head: ['Part', 'Plan', 'Spent', 'Difference'], rows: rows.map((r) => [r.label, exactMoney(r.plan), exactMoney(r.actual), (r.diff > 0 ? exactMoney(r.diff) + ' over' : r.diff < 0 ? exactMoney(-r.diff) + ' under' : 'on plan')]) } }));
  out.push(chartCard({ id: 'budget-diverge', question: 'Where are you over and under?',
    summary: 'Right of the line is over plan, left is under.',
    draw: (w) => bars({ width: w, diverging: true, rows: rows.map((r) => ({ label: r.label, segs: [{ v: r.diff, c: r.diff > 0 ? 2 : 1, tip: r.label + ': ' + (r.diff > 0 ? exactMoney(r.diff) + ' over' : exactMoney(-r.diff) + ' under') }], value: (r.diff > 0 ? '+' : '') + axisMoney(r.diff) })), label: 'Over and under plan' }),
    legend: [{ c: 1, words: 'Under plan' }, { c: 2, words: 'Over plan' }],
    table: { head: ['Part', 'Over (+) or under (-)'], rows: rows.map((r) => [r.label, (r.diff > 0 ? '+' : '') + exactMoney(r.diff)]) } }));
  const shares = C.planShares(view), cats = [...new Set(shares.map((x) => x.cat))];
  const top = shares[0];
  out.push(chartCard({ id: 'budget-treemap', question: 'What takes the biggest share of the plan?',
    summary: top ? top.label + ' is the biggest line at ' + exactMoney(top.v) + '.' : 'No planned lines yet.',
    draw: (w) => treemap({ width: w, height: w < 420 ? 300 : 260, items: shares.map((x) => ({ label: x.label, v: x.v, c: 1 + (cats.indexOf(x.cat) % 5), tip: x.label + ' (' + x.catLabel + '): ' + exactMoney(x.v) + ' planned' })), label: 'The plan by line' }),
    legend: cats.map((k, i) => ({ c: 1 + (i % 5), words: shares.find((x) => x.cat === k).catLabel })),
    table: { head: ['Line', 'Part', 'Planned'], rows: shares.map((x) => [x.label, x.catLabel, exactMoney(x.v)]) } }));
  const days = C.spendByDay(spine, view.ym), big = [...days].sort((a, b) => b.v - a.v)[0];
  out.push(chartCard({ id: 'budget-heatmap', question: 'Which days did the money go out in ' + monthWords(view.ym) + '?',
    summary: big ? 'The biggest day was ' + shortDate(big.date) + ' at ' + exactMoney(big.v) + '. Darker days spent more (shaded by rank, in four steps).' : 'Nothing logged as spent this month yet.',
    empty: days.length ? null : 'Log or import spending and each day fills in here.',
    draw: (w) => heatmap({ width: w, ym: view.ym, weekStart, days: days.map((d) => ({ date: d.date, v: d.v, tip: shortDate(d.date) + ': ' + exactMoney(d.v) + ' spent, ' + d.n + (d.n === 1 ? ' entry' : ' entries') })), label: 'Spending by day' }),
    table: { head: ['Day', 'Spent', 'Entries'], rows: days.map((d) => [shortDate(d.date), exactMoney(d.v), String(d.n)]) } }));
  if (months.length > 1) {
    const all = C.monthlySpent(spine, rules, months), ms = all.filter((m, i) => m.logged || i === all.length - 1), keys = ms[ms.length - 1].cats.map((c) => c.key);
    out.push(chartCard({ id: 'budget-months', question: 'How has spending moved month to month?',
      summary: ms.filter((m) => m.logged).length < 2 ? 'Only one month logged so far.' : monthWords(ms[0].ym) + ' to ' + monthWords(ms[ms.length - 1].ym) + ', each part stacked; the gray line is the plan.',
      draw: (w) => columns({ width: w, cols: ms.map((m) => ({ label: MON[+m.ym.slice(5, 7) - 1], segs: m.cats.map((c) => ({ v: c.v, c: 1 + (keys.indexOf(c.key) % 5), tip: monthWords(m.ym) + ', ' + c.label + ': ' + exactMoney(c.v) })) })), line: ms.map((m) => m.plan), label: 'Spending by month' }),
      legend: [...ms[ms.length - 1].cats.map((c, i) => ({ c: 1 + (i % 5), words: c.label })), { c: 0, words: 'Plan', cls: 'sw-line' }],
      table: { head: ['Month', ...ms[ms.length - 1].cats.map((c) => c.label), 'Plan'], rows: ms.map((m) => [monthWords(m.ym), ...keys.map((k) => exactMoney((m.cats.find((c) => c.key === k) || { v: 0 }).v)), exactMoney(m.plan)]) } }));
  }
  return out;
}

// ---------------------------------------------------------------- Calendar: the cash line with its floor and range
// line: the calendar's cash line (days with checking); range: { low: [], high: [] } the good-to-bad run, or null.
export function cashLineCard(line, range = null) {
  const T = (iso) => +iso.slice(0, 4) + (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+iso.slice(0, 4), 0, 1)) / 86400000 / 365;
  const days = line.days.filter((d) => d.checking !== null && d.checking !== undefined);
  const pts = days.map((d) => [T(d.date), d.checking]);
  const today = days.find((d) => !d.past);
  const byT = new Map(days.map((d) => [T(d.date), d]));
  const bands = line.floor > 0 ? [{ y0: Math.min(0, line.min), y1: line.floor, cls: 'ch-band-bad', label: 'Under the floor of ' + axisMoney(line.floor) }] : [];
  return chartCard({ id: 'cash-line', question: 'Will checking stay above your floor?',
    summary: 'Lowest point: ' + exactMoney(line.low.amount) + ' on ' + shortDate(line.low.date) + (line.floor > 0 ? (line.low.amount < line.floor ? ', under the floor.' : ', above the floor.') : '.') + (range ? ' The shaded band runs from a bad month to a good one.' : ''),
    draw: (w) => lines({ width: w, series: [{ label: 'Checking', c: 1, points: pts, dashFrom: today ? T(today.date) : null }], bands, range: range ? { lo: range.low.map((d) => [T(d.date), d.checking]), hi: range.high.map((d) => [T(d.date), d.checking]), c: 1 } : null,
      xFmt: (t) => { const d = new Date(Date.UTC(yearOf(t), 0, 1) + (t - yearOf(t)) * 365 * 86400000); return MON[d.getUTCMonth()] + ' ' + d.getUTCDate(); },
      vmarks: today ? [{ x: T(today.date), label: 'Today' }] : [], tips: (t) => { const d = byT.get(t); return d ? shortDate(d.date) + ': checking ' + exactMoney(d.checking) + (d.under ? ', under the floor' : '') : null; }, label: 'Checking every day' }),
    legend: [{ c: 1, words: 'Checking (dashed ahead: expected)' }, ...(range ? [{ c: 1, words: 'Bad month to good month', cls: 'sw-band' }] : []), ...(bands.length ? [{ c: 0, words: 'Under the floor', cls: 'cl-sw-under' }] : [])],
    table: { head: ['Day', 'Checking', ''], rows: days.map((d) => [shortDate(d.date), exactMoney(d.checking), d.under ? 'under the floor' : d.past ? 'recorded' : 'expected']) } });
}

// ---------------------------------------------------------------- Debt
const ymWords = (ym) => (ym ? monthWords(ym) : 'not in sight');
export function debtCharts(spine, rules, { extra = 0, strategy = 'avalanche', asOf = spine.meta.asOf } = {}) {
  const p = C.debtPath(spine, rules, { strategy, extra, asOf });
  if (!p.debts.length) return [];
  const T = p.months.map(ymT);
  const series = p.debts.map((d, i) => ({ label: d.name, c: 1 + (i % 5), stack: true, points: T.map((t, j) => [t, d.stacked[j]]) }));
  const tips = (t) => { const j = T.indexOf(t); return j < 0 ? null : monthWords(p.months[j]) + ': ' + p.debts.map((d) => d.name + ' ' + exactMoney(d.points[j])).join(', '); };
  const every = Math.max(1, Math.ceil(p.months.length / 24));
  const area = chartCard({ id: 'debt-area', question: 'When is your debt gone?',
    summary: p.neverPaysOff ? 'At this pace the debt is never paid off.' : 'Debt free ' + ymWords(p.debtFreeYm) + ', with ' + exactMoney(p.totalInterest) + ' of interest on the way, paying ' + exactMoney(extra) + ' a month extra.',
    draw: (w) => lines({ width: w, series, xFmt: (t) => String(yearOf(t)), tips, label: 'Debt, stacked, to zero' }),
    legend: p.debts.map((d, i) => ({ c: 1 + (i % 5), words: d.name })), note: p.rough ? ROUGH_NOTE : null,
    table: { head: ['Month', ...p.debts.map((d) => d.name)], rows: p.months.filter((_, j) => j % every === 0 || j === p.months.length - 1).map((ym) => { const j = p.months.indexOf(ym); return [monthWords(ym), ...p.debts.map((d) => exactMoney(d.points[j]))]; }) } });
  const yrs = p.byYear;
  const split = chartCard({ id: 'debt-split', question: 'How much of each year\'s payments is interest?',
    summary: yrs.length ? 'In ' + yrs[0].year + ', ' + exactMoney(yrs[0].interest) + ' of ' + exactMoney(yrs[0].paid) + ' paid goes to interest.' : '',
    draw: (w) => columns({ width: w, cols: yrs.map((y) => ({ label: String(y.year), segs: [{ v: y.principal, c: 1, tip: y.year + ': ' + exactMoney(y.principal) + ' paid down' }, { v: y.interest, c: 2, tip: y.year + ': ' + exactMoney(y.interest) + ' of interest' }] })), label: 'Interest and paid down, by year' }),
    legend: [{ c: 1, words: 'Paid down (principal)' }, { c: 2, words: 'Interest' }],
    table: { head: ['Year', 'Paid down', 'Interest'], rows: yrs.map((y) => [String(y.year), exactMoney(y.principal), exactMoney(y.interest)]) } });
  const m = C.methodPaths(spine, rules, { extra, asOf });
  const best = [...m].filter((x) => !x.neverPaysOff).sort((a, b) => a.interest - b.interest)[0];
  const methods = chartCard({ id: 'debt-methods', question: 'Which order clears it fastest and cheapest?',
    summary: !best ? '' : new Set(m.map((x) => x.debtFreeYm)).size === 1 && new Set(m.map((x) => Math.round(x.interest))).size === 1 ? 'All three orders end debt free ' + ymWords(best.debtFreeYm) + ' with the same interest (' + exactMoney(best.interest) + '); the lines lie on top of each other. They differ in which debt clears first (the table).' : best.words + ' costs the least interest (' + exactMoney(best.interest) + '); ' + m.map((x) => x.words.toLowerCase() + ' is debt free ' + ymWords(x.debtFreeYm)).join(', ') + '.',
    draw: (w) => lines({ width: w, series: m.map((x, i) => ({ label: x.words, c: [1, 2, 4][i], points: x.months.map((ym, j) => [ymT(ym), x.totals[j]]), pattern: i || null })), xFmt: (t) => String(yearOf(t)),
      tips: (t) => tWords(t) + ': ' + m.map((x) => { const j = x.months.findIndex((ym) => Math.abs(ymT(ym) - t) < 0.01); return x.words + ' ' + (j < 0 ? '$0' : exactMoney(x.totals[j])); }).join(', '), xTicks: null, label: 'Total owed under each order' }),
    legend: m.map((x, i) => ({ c: [1, 2, 4][i], words: x.words, cls: ['sw-line', 'sw-pat-1', 'sw-pat-2'][i] })),
    table: { head: ['Order', 'Debt free', 'Interest', 'First cleared'], rows: m.map((x) => [x.words, ymWords(x.debtFreeYm), exactMoney(x.interest), x.first ? x.first.name + ', ' + monthWords(x.first.ym) : 'none']) } });
  // Every order the same (round 1): the lines would lie on top of each other, so the chart is left out; Which order?
  // says so in one sentence.
  const tie = new Set(m.map((x) => [x.debtFreeYm, Math.round(x.interest ?? -1), x.first ? x.first.name + x.first.ym : ''].join('|'))).size === 1;
  return tie ? [area, split] : [area, split, methods];
}

// ---------------------------------------------------------------- Plan and FI
export function fiPathCard(f) {
  if (!f.invested.length || !f.lines.standard) return null;
  const hl = [['lean', 'Lean FI', 3], ['standard', 'FI number', 1], ['fat', 'Fat FI', 5]].filter(([k]) => f.lines[k]).map(([k, words, c]) => ({ y: f.lines[k], label: words + ' ' + axisMoney(f.lines[k]), c, dash: k !== 'standard' }));
  const byY = new Map(f.invested);
  return chartCard({ id: 'fi-path', question: 'When do your investments reach your FI number?',
    summary: f.crossYear ? 'Invested money passes the FI number of ' + exactMoney(f.lines.standard) + ' around ' + f.crossYear + ' at this pace (a projection).' : 'At this pace, invested money does not reach the FI number in the years shown.',
    draw: (w) => lines({ width: w, height: 260, series: [{ label: 'Invested', c: 2, points: f.invested, dashed: true, endLabel: 'Invested' }, ...(f.coast.length > 1 ? [{ label: 'Coast FI', c: 4, points: f.coast, thin: true }] : [])], hlines: hl,
      dots: f.crossYear ? [{ x: f.crossYear, y: byY.get(f.crossYear), c: 2, label: 'Reaches the FI number in ' + f.crossYear }] : [],
      tips: (y) => y + ': invested ' + exactMoney(byY.get(y)), label: 'Invested money against the FI numbers' }),
    legend: [{ c: 2, words: 'Invested, projected', dash: true }, { c: 1, words: 'FI number', cls: 'sw-line' }, { c: 3, words: 'Lean FI', dash: true }, { c: 5, words: 'Fat FI', dash: true }, ...(f.coast.length > 1 ? [{ c: 4, words: 'Coast FI: enough today to coast to ' + f.coastAge, cls: 'sw-line' }] : [])],
    note: 'The invested line is a projection, so it is dashed.',
    table: { head: ['Year', 'Invested', 'Coast FI'], rows: f.invested.map(([y, x]) => [String(y), exactMoney(x), (f.coast.find((c) => c[0] === y) || [null, null])[1] === null ? '' : exactMoney(f.coast.find((c) => c[0] === y)[1])]) } });
}
export function savingsCurveCard(c, { yearsToFi = null } = {}) {
  if (!c || c.points.length < 2) return null;
  const dots = [];
  if (c.here.rate !== null && c.here.years !== null) dots.push({ x: c.here.rate, y: c.here.years, c: 1, label: 'You are here: ' + pct(c.here.rate) + ' saved, about ' + c.here.years + ' years' });
  if (c.target) dots.push({ x: c.target.rate, y: c.target.years, c: 2, label: 'Target: ' + pct(c.target.rate) + ' saved reaches FI by age ' + c.target.age });
  const byR = new Map(c.points);
  return chartCard({ id: 'savings-curve', question: 'How much sooner does saving more get you there?',
    // The projection's FI year leads (the one every screen shows); the curve's own point is named as the simple math.
    summary: (yearsToFi !== null ? 'About ' + yearsToFi + ' years to FI on the full projection. ' : '') + (c.here.rate !== null ? 'The curve is the simple math (steady saving of gross pay, one return): at your ' + pct(c.here.rate) + ' (what is left after spending counts too) it says about ' + c.here.years + ' years. ' : '') + (c.target ? 'Saving ' + pct(c.target.rate) + ' gets there by age ' + c.target.age + '.' : ''),
    draw: (w) => lines({ width: w, series: [{ label: 'Years to FI', c: 1, points: c.points }], dots, xFmt: pct0, xTicks: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7], yFmt: (x) => Math.round(x) + ' y', yMin: 0, tips: (r) => pct(r) + ' saved: about ' + byR.get(r) + ' years', label: 'Savings rate against years to FI' }),
    legend: [{ c: 1, words: 'Years to FI at each savings rate; the dot is you' }, ...(c.target ? [{ c: 2, words: 'The rate your target age needs' }] : [])],
    note: 'Steady saving of gross pay and the real return assumed, as on What it takes to get there; the full projection (with pay changes and debt ending) can land a little earlier or later.',
    table: { head: ['Saved of gross', 'Years to FI'], rows: c.points.map(([r, y]) => [pct(r), String(y)]) } });
}

// ---------------------------------------------------------------- Taxes
export function bracketCard(b) {
  if (!b) return null;
  const segs = b.bands.map((x, i) => ({ v: x.to - x.from, c: x.filled > 0 ? 1 + (i % 5) : 0, rough: b.rough && x.filled > 0, tip: pct0(x.rate) + ' on ' + exactMoney(x.from) + ' to ' + exactMoney(x.to) + (x.filled > 0 ? ': ' + exactMoney(x.filled) + ' of your income here' : ': none of your income') }));
  return chartCard({ id: 'tax-brackets', question: 'Which tax bracket is your last dollar in?',
    summary: 'Taxable income of ' + exactMoney(b.taxable) + ' reaches the ' + pct0(b.marginal) + ' bracket: each extra dollar pays ' + pct0(b.marginal) + ' federal; the dollars below pay less.',
    draw: (w) => bars({ width: w, rows: [{ label: 'Federal', segs, marker: { v: b.taxable, label: 'Your taxable income: ' + exactMoney(b.taxable) }, value: pct0(b.marginal) }], max: b.top, label: 'Federal brackets with your taxable income marked' }),
    legend: b.bands.filter((x) => x.filled > 0).map((x, i) => ({ c: 1 + (i % 5), words: pct0(x.rate) + ' bracket' })).concat([{ c: 0, words: 'Brackets above yours' }]),
    note: 'The triangle marks your taxable income.' + (b.rough ? ' ' + ROUGH_NOTE : ''),
    table: { head: ['Bracket', 'From', 'To', 'Your income in it'], rows: b.bands.map((x) => [pct0(x.rate), exactMoney(x.from), exactMoney(x.to), exactMoney(x.filled)]) } });
}

// ---------------------------------------------------------------- Scenarios
export function scenarioCard(list) {
  if (!list.length) return null;
  const years = [...new Set(list.flatMap((l) => l.points.map((p) => p[0])))].sort((a, b) => a - b);
  const end = years[years.length - 1];
  const at = (l, y) => (l.points.find((p) => p[0] === y) || [null, null])[1];
  return chartCard({ id: 'scenario-lines', question: 'How far apart do the futures land?',
    summary: 'By ' + end + ': ' + list.map((l) => l.words.toLowerCase() + ' ' + axisMoney(at(l, end))).join(', ') + ' of net worth. All are projections, so all are dashed.',
    draw: (w) => lines({ width: w, series: list.map((l, i) => ({ label: l.words, c: 1 + (i % 5), points: l.points, dashed: true, thin: i > 2 })), tips: (y) => y + ': ' + list.map((l) => l.words + ' ' + exactMoney(at(l, y))).join(', '), label: 'Net worth under each scenario' }),
    legend: list.map((l, i) => ({ c: 1 + (i % 5), words: l.words, dash: true })),
    table: { head: ['Year', ...list.map((l) => l.words)], rows: years.filter((y, i) => i % 5 === 0 || y === end).map((y) => [String(y), ...list.map((l) => exactMoney(at(l, y)))]) } });
}

// ---------------------------------------------------------------- Goals
export function goalsCard(rows) {
  if (!rows.length) return null;
  const late = rows.filter((g) => g.onTime === false);
  return chartCard({ id: 'goal-bars', question: 'How close is each goal?',
    summary: late.length ? late.map((g) => g.label).join(', ') + (late.length === 1 ? ' is' : ' are') + ' set to land after the date you picked.' : 'Each bar is what is set aside so far against the goal.',
    draw: (w) => bars({ width: w, rows: rows.map((g) => ({ label: g.label, range: { v0: 0, v1: g.target }, segs: [{ v: g.held, c: g.onTime === false ? 2 : 1, rough: g.rough, tip: g.label + ': ' + exactMoney(g.held) + ' of ' + exactMoney(g.target) }], target: g.target, value: pct0(g.share), sub: (g.reached ? 'reached about ' + monthWords(g.reached.slice(0, 7)) : 'no pace set yet') + (g.by ? ', wanted by ' + monthWords(g.by.slice(0, 7)) : '') })), label: 'Goals, how far along' }),
    legend: [{ c: 1, words: 'Set aside, on time' }, { c: 2, words: 'Set aside, landing late' }],
    table: { head: ['Goal', 'Set aside', 'Target', 'Reached at this pace', 'Wanted by'], rows: rows.map((g) => [g.label, exactMoney(g.held), exactMoney(g.target), g.reached ? monthWords(g.reached.slice(0, 7)) : 'no pace set', g.by ? monthWords(g.by.slice(0, 7)) : '']) } });
}

// ---------------------------------------------------------------- Today: one sparkline
export function netWorthSpark(months) {
  const pts = (months || []).slice(0, 12).map((m) => m.netWorth).filter((x) => typeof x === 'number');
  if (pts.length < 2) return null;
  return h('span', { class: 'tile-spark', title: 'Net worth over the next 12 months, projected: ' + money(pts[pts.length - 1]) + ' in a year' }, sparkline({ width: 120, height: 32, points: pts, rough: true, label: 'Net worth over the next 12 months, projected: about ' + money(pts[pts.length - 1]) + ' in a year' }));
}
