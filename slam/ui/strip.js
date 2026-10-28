// The headline strip (practical run Batch 3, S-270): pinned at the top of Home and Numbers, one slim row of four
// numbers (S-283: no more than four to hold at once): net worth, the monthly surplus, the savings rate and the years to
// FI. Reachable after debts is on Home's full numbers. It is drawn again on every
// change, and the number that just moved flashes once, so the client sees an answer land. Formatting only: every value
// comes from the summary (engine/summary.js), tagged with its formula's id for tools/agree-check.mjs.

import { h, metric, summaryMoney, pct, money, asTime, daysFor } from './view.js';
import { keepPref } from './prefs.js';
import { summarize } from '../engine/summary.js';
import { isCouple, peopleOf, personView } from '../engine/couple.js';
import { refresh } from './shell.js';
import { nothingEntered } from '../engine/blank.js';

// A couple (Batch 7, S-277): a small toggle, Together (the household, as always) or one person's own numbers: their
// share of what is owned and owed (half of anything joint), their take-home, their share of the bills and what is
// left. The household's numbers never change; this only divides them.
export let stripWho = 0;
const first = (p) => String(p.name || '').trim().split(/\s+/)[0] || p.id;
function whoToggle(spine) {
  const opts = [[0, 'Together'], ...peopleOf(spine).slice(0, 2).map((p, i) => [i + 1, first(p)])];
  return h('div', { class: 'segmented strip-who', role: 'group', 'aria-label': 'Whose numbers' }, opts.map(([k, t]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(stripWho === k), onclick: () => { stripWho = k; last = null; refresh(); } }, t)));
}
function personStrip(spine, s) {
  const p = personView(spine, s, stripWho - 1);
  const cells = [['Net worth (their share)', p.netWorth], ['Take-home a month', p.takeHome], ['Their share of bills', p.spending + p.minimums], ['Left a month', p.left]];
  return h('section', { class: 'headline-strip', 'aria-label': p.name + '\'s own numbers' }, whoToggle(spine),
    h('dl', {}, cells.map(([label, x]) => h('div', { class: 'strip-cell' }, h('dt', {}, label), h('dd', {}, summaryMoney(x))))));
}

let last = null;
export function headlineStrip(spine, rules, { timeSwitch: withSwitch = false } = {}) {
  const s = summarize(spine, rules, { flags: false }), sh = s.sheet, cf = s.cashflow, years = s.fi.yearsToFi.value;
  const two = isCouple(spine);
  if (!two) stripWho = 0;
  if (two && stripWho) return personStrip(spine, s);
  const year = years === null ? null : +spine.meta.asOf.slice(0, 4) + Math.round(years);
  // Empty is not zero: with nothing entered yet, every cell says so instead of $0.
  const known = (x) => (nothingEntered(spine) ? null : x);
  const nw = known(sh.netWorth.value), left = known(cf.monthlySurplus.value), rate = known(cf.savingsRate.net.value);
  const cells = [
    ['netWorth', 'Net worth', nw === null ? 'Not yet' : metric('netWorth', summaryMoney(nw, true)), nw],
    ['surplus', 'Left a month', left === null ? 'Not yet' : metric('surplus', summaryMoney(left, true)), left],
    ['savingsRateNet', 'Savings rate', rate === null ? 'Not yet' : metric('savingsRateNet', pct(rate, 1)), rate],
    ['yearsToFi', 'FI', years === null ? 'Not at this pace' : [metric('yearsToFi', Math.round(years) + ' years'), h('span', { class: 'strip-sub' }, ' (about ' + year + ')')], years]
  ];
  const before = last;
  last = Object.fromEntries(cells.map(([id, , , v]) => [id, v]));
  return h('section', { class: 'headline-strip', 'aria-label': 'Your headline numbers' }, two ? whoToggle(spine) : null,
    h('dl', {}, cells.map(([id, label, shown, v]) => h('div', { class: 'strip-cell' + (before && id in before && before[id] !== v ? ' is-moved' : '') },
      h('dt', {}, label), h('dd', {}, shown)))),
    withSwitch ? timeSwitch() : null);
}
// Money as time (S-286): one switch; on, every amount on every screen also says how much later it makes freedom.
function timeSwitch() {
  const on = asTime(), n = daysFor(100);
  return h('div', { class: 'time-switch' },
    h('button', { type: 'button', class: 'btn small switch-btn', role: 'switch', 'aria-checked': String(on), onclick: () => { keepPref('moneyAs', on ? 'dollars' : 'fiDays'); refresh(); } }, h('span', { class: 'switch-knob', 'aria-hidden': 'true' }), 'Money as time'),
    on ? h('span', { class: 'time-example' }, n === null ? 'Needs what is saved each month first.' : 'For example, ' + money(100)) : null);
}
