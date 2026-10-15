// Analyze, Transactions: top 5 merchants and their share, spending by
// weekday with the weekend split, small-and-frequent vs big-and-rare, and
// the subscriptions list with yearly cost. Data from src/calc/tx-analysis.js.

import { h } from '../dom.js';
import { money, pct } from '../format.js';
import { hbars, heatRow, scatter } from './svg.js';
import { card, chartWidth } from './catalog.js';

export function transactionCards(ctx, s) {
  const tx = s.transactions;
  if (!tx) return [card(ctx, { id: 'tx-none', title: 'Transactions', reading: 'Import a bank or card CSV in Fill in, pass 6, to see these.' })];
  const u = ctx.ui.units['tx-top'] || 'dollars';
  const top = tx.top;
  const w = tx.weekdays;
  const sc = tx.sizeVsCount;
  const d = tx.detections;
  const biggest = sc.slice().sort((a, b) => b.count - a.count)[0];
  return [
    card(ctx, {
      id: 'tx-top', title: 'Top 5 merchants', unitToggle: true,
      svg: hbars({ rows: top.top.map((m) => ({ label: m.merchant, values: [{ v: u === 'percent' ? m.share : m.amount, color: 'var(--series-actual)', tip: m.merchant + ': ' + money(m.amount, true) }] })), width: chartWidth(true), fmt: u === 'percent' ? pct : money }),
      reading: 'These five are ' + pct(top.topShare) + ' of everything spent in the imported months (' + money(top.total) + ').'
    }),
    card(ctx, {
      id: 'tx-week', title: 'Spending by weekday',
      svg: heatRow({ cells: w.days, width: chartWidth(true), fmt: money }),
      reading: 'Weekends are ' + pct(w.weekendShare) + ' of spending: ' + money(w.perWeekendDay) + ' per weekend day vs ' + money(w.perWeekday) + ' per weekday.'
    }),
    card(ctx, {
      id: 'tx-size', title: 'Small and frequent vs big and rare',
      svg: scatter({ points: sc.map((m, i) => ({ x: m.count, y: m.average, label: i < 6 ? m.merchant : null, color: 'var(--series-actual)', tip: m.merchant + ': ' + m.count + ' charges, average ' + money(m.average, true) })),
        width: chartWidth(true), xFmt: (v) => String(Math.round(v)), yFmt: money, xLabel: 'Number of charges', yLabel: 'Average size' }),
      reading: biggest ? 'Most frequent: ' + biggest.merchant + ', ' + biggest.count + ' charges averaging ' + money(biggest.average, true) + '. Bottom right (many small charges) adds up quietly; top left is the big, rare stuff.' : 'No purchases yet.'
    }),
    card(ctx, {
      id: 'tx-subs', title: 'Subscriptions',
      extra: d.subscriptions.length ? h('ul', { class: 'plain' }, d.subscriptions.map((x) => h('li', { class: 'small' },
        h('span', {}, x.merchant, x.fromTrial ? h('span', { class: 'xs warn' }, ' (started as a free trial)') : null),
        h('b', { class: 'num' }, money(x.amount, true) + ' / mo, ' + money(x.yearly, true) + ' / yr')))) : null,
      reading: d.subscriptions.length ? d.subscriptions.length + ' subscriptions cost ' + money(d.subscriptionsYearly) + ' a year.' : 'No monthly subscriptions found yet (needs two months of data).'
    })
  ];
}
