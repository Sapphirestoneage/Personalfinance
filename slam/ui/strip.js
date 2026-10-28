// The headline strip (practical run Batch 3, S-270): pinned at the top of the Session and My numbers, one slim row of
// net worth (total and liquid), the monthly surplus, the savings rate and the years to FI. It is drawn again on every
// change, and the number that just moved flashes once, so the client sees an answer land. Formatting only: every value
// comes from the summary (engine/summary.js), tagged with its formula's id for tools/agree-check.mjs.

import { h, metric, summaryMoney, pct } from './view.js';
import { summarize } from '../engine/summary.js';

let last = null;
export function headlineStrip(spine, rules) {
  const s = summarize(spine, rules, { flags: false }), sh = s.sheet, cf = s.cashflow, years = s.fi.yearsToFi.value;
  const year = years === null ? null : +spine.meta.asOf.slice(0, 4) + Math.round(years);
  const cells = [
    ['netWorth', 'Net worth', sh.netWorth.value === null ? 'Not yet' : metric('netWorth', summaryMoney(sh.netWorth.value)), sh.netWorth.value],
    ['liquidNetWorth', 'Reachable', sh.liquidNetWorth.value === null ? 'Not yet' : metric('liquidNetWorth', summaryMoney(sh.liquidNetWorth.value)), sh.liquidNetWorth.value],
    ['surplus', 'Left a month', cf.monthlySurplus.value === null ? 'Not yet' : metric('surplus', summaryMoney(cf.monthlySurplus.value)), cf.monthlySurplus.value],
    ['savingsRateNet', 'Savings rate', cf.savingsRate.net.value === null ? 'Not yet' : metric('savingsRateNet', pct(cf.savingsRate.net.value, 1)), cf.savingsRate.net.value],
    ['yearsToFi', 'FI', years === null ? 'Not at this pace' : [metric('yearsToFi', years + ' years'), h('span', { class: 'strip-sub' }, ' (about ' + year + ')')], years]
  ];
  const before = last;
  last = Object.fromEntries(cells.map(([id, , , v]) => [id, v]));
  return h('section', { class: 'headline-strip', 'aria-label': 'Your headline numbers' },
    h('dl', {}, cells.map(([id, label, shown, v]) => h('div', { class: 'strip-cell' + (before && id in before && before[id] !== v ? ' is-moved' : '') },
      h('dt', {}, label), h('dd', {}, shown)))));
}
