// Cash by day (S-209, redrawn on the shared chart module in overnight Track C): checking every day as one line,
// recorded before the as-of date (from check-ins and the log) and expected after it; savings as its own thinner line,
// never added in; debt as a thin line; the floor as a band under it; paydays and big bills as dots. When maybe money
// changes the days, a pale band runs from none of it to all of it (engine/calendar-views.js cashRange). Every day is in
// the table ("Show as table"); tapping a day says its words.

import { h, money, shortDate } from './view.js';
import { chartCard, lines, axisMoney } from './chart.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = (d) => {
  const bits = [shortDate(d.date) + ': checking ' + money(d.checking)];
  if (d.savings !== null) bits.push('savings ' + money(d.savings) + ' (apart)');
  if (d.debt) bits.push('debt ' + money(d.debt));
  if (d.payday) bits.push('payday');
  if (d.big) bits.push(d.big.label + ' ' + money(d.big.amount));
  if (d.under) bits.push('under the floor');
  return bits.join('; ');
};

// Savings and debt are lines of their own scale; they show when asked (kept in this browser), so the cash line is
// not flattened by them.
const OTHERS_KEY = 'slam-cash-others:v1';
const othersOn = () => { try { return localStorage.getItem(OTHERS_KEY) === '1'; } catch { return false; } };

export function cashChartCard(line, opts = {}) {
  const { back = false, onBack = null, preCover = null, range = null } = opts;
  if (!line) return null;
  const others = othersOn();
  const idx = line.days.map((d, i) => [i, d]);
  const firstAhead = idx.find(([, d]) => !d.past);
  const past = idx.filter(([, d]) => d.past).map(([i, d]) => [i, d.checking]);
  const ahead = idx.filter(([, d]) => !d.past).map(([i, d]) => [i, d.checking]);
  if (past.length && ahead.length) ahead.unshift(past[past.length - 1]);
  const save = idx.filter(([, d]) => d.savings !== null).map(([i, d]) => [i, d.savings]);
  const debt = idx.filter(([, d]) => d.debt !== null && d.debt !== undefined && d.debt > 0).map(([i, d]) => [i, d.debt]);
  const series = [
    ...(others && save.length > 1 ? [{ label: 'Savings', c: 5, points: save, thin: true, endLabel: 'Savings, apart' }] : []),
    ...(others && debt.length > 1 ? [{ label: 'Debt', c: 2, points: debt, thin: true, endLabel: 'Debt' }] : []),
    ...(past.length > 1 ? [{ label: 'Recorded', c: 0, points: past }] : []),
    ...(ahead.length > 1 ? [{ label: 'Cash', c: 3, points: ahead, endLabel: 'Cash' }] : [])
  ];
  const byDate = new Map(line.days.map((d, i) => [d.date, i]));
  const rng = range ? { lo: range.low.filter((d) => byDate.has(d.date)).map((d) => [byDate.get(d.date), d.checking]), hi: range.high.filter((d) => byDate.has(d.date)).map((d) => [byDate.get(d.date), d.checking]), c: 3 } : null;
  const bands = line.floor > 0 ? [{ y0: Math.min(0, line.min), y1: line.floor, cls: 'ch-band-bad', label: 'Under the floor of ' + axisMoney(line.floor) }] : [];
  const dots = idx.filter(([, d]) => d.payday || d.big).map(([i, d]) => ({ x: i, y: d.checking, c: d.payday ? 3 : 1, tip: dayWords(d) }));
  // X ticks: the first of each month.
  const ticks = idx.filter(([i, d]) => i === 0 || d.date.slice(8) === '01').map(([i]) => i);
  const low = preCover && line.low.toppedFrom ? preCover : line.low;
  let card = null;
  const toggleOthers = (on) => { try { localStorage.setItem(OTHERS_KEY, on ? '1' : '0'); } catch { /* this visit only */ } const next = cashChartCard(line, opts); card.replaceWith(next); };
  const controls = h('div', { class: 'cl-controls' },
    line.backTo ? h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: back ? 'checked' : null, onchange: (e) => onBack && onBack(e.target.checked) }), ' Start at ' + MONTHS[+line.backTo.slice(5, 7) - 1] + ' ' + line.backTo.slice(0, 4)) : null,
    save.length > 1 || debt.length > 1 ? h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: others ? 'checked' : null, onchange: (e) => toggleOthers(e.target.checked) }), ' Show savings and debt') : null);
  card = h('section', { class: 'cash-chart', 'aria-label': 'Cash by day' },
    chartCard({ id: 'cash-line', level: 'h2', question: 'Will checking stay above your floor?',
      summary: 'Lowest point: ' + money(low.amount) + ' on ' + shortDate(low.date) + (line.low.beforePayday ? ', the day before payday' : '') + '.' + (line.low.toppedFrom ? ' The cushion covers it from ' + shortDate(line.low.toppedFrom) + ', so the line below already has that money moved in and stays at the floor.' : '') + (rng ? ' The pale band runs from none of the maybe money to all of it.' : ''),
      controls,
      draw: (w) => lines({ width: w, height: 240, series, bands, range: rng, dots, xTicks: ticks, xFmt: (i) => { const d = line.days[Math.round(i)]; return d ? MONTHS[+d.date.slice(5, 7) - 1] : ''; },
        vmarks: firstAhead ? [{ x: firstAhead[0], label: 'As of ' + shortDate(line.asOf).replace(/, \d{4}$/, '') }] : [],
        tips: (i) => dayWords(line.days[i]), label: 'Checking every day from ' + shortDate(line.days[0].date) + ' to ' + shortDate(line.days[line.days.length - 1].date) }),
      legend: [
        { c: 3, words: 'Cash (checking), expected', cls: 'sw-line' },
        { c: 0, words: 'Checking, recorded', cls: 'sw-line' },
        ...(others && save.length > 1 ? [{ c: 5, words: 'Savings, shown apart (not added in)', cls: 'sw-line' }] : []),
        ...(others && debt.length > 1 ? [{ c: 2, words: 'Debt, all cards and loans', cls: 'sw-line' }] : []),
        ...(rng ? [{ c: 3, words: 'None to all of the maybe money', cls: 'sw-band' }] : []),
        ...(bands.length ? [{ c: 0, words: 'Under the floor of ' + money(line.floor), cls: 'cl-sw-under' }] : []),
        { c: 3, words: 'Payday (dot)' }, { c: 1, words: 'A bill of $100 or more (dot)' }],
      note: line.setAsideNote ? line.setAsideNote + ' It is not in the line.' : null,
      table: { head: ['Day', 'Checking', 'Savings', 'Debt', ''], rows: line.days.map((d) => [shortDate(d.date), money(d.checking), d.savings === null ? '' : money(d.savings), d.debt ? money(d.debt) : '', [d.past ? 'recorded' : 'expected', d.payday ? 'payday' : null, d.big ? d.big.label + ' ' + money(d.big.amount) : null, d.under ? 'under the floor' : null].filter(Boolean).join(', ')]) } }));
  return card;
}
