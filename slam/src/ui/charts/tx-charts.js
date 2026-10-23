// Insights, Cash (S-106): top 5 merchants and their share, spending by
// weekday with the weekend split, small-and-frequent vs big-and-rare, the
// subscriptions list with yearly cost, and what the transactions show (moved
// from the Cash flow pass). Data is s.transactions, built by buildSummary from
// src/engines/tx-analysis.js. Depends on dom.js, format.js, the SVG primitives in
// svg.js, card() and chartWidth() from catalog.js, and emptyState() from components/jump.js.

import { h } from '../dom.js';
import { money, pct } from '../format.js';
import { hbars, heatRow, scatter } from './svg.js';
import { card, chartWidth } from './catalog.js';
import { emptyState } from '../components/jump.js';

export function transactionCards(ctx, s) {
  const tx = s.transactions;
  // buildSummary leaves transactions null when the log is empty; the card then points at import.
  if (!tx) return [h('div', { class: 'card', id: 'chart-tx-none' }, emptyState(ctx, 'Log a few entries or import a bank CSV to see merchants and habits.', 'import', 'Import a CSV'))];
  // Dollars or percent for the top-5 bars, the same ctx.ui.units slot the card's toggle writes.
  const u = ctx.ui.units['tx-top'] || 'dollars';
  const top = tx.top;
  const w = tx.weekdays;
  const sc = tx.sizeVsCount;
  const d = tx.detections;
  // sizeVsCount comes largest total first; "biggest" here is the most frequent merchant, which is what the reading names.
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
    // Only the six biggest merchants by total get a point label; every point still has a hover tip.
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
    }),
    findingsCard(ctx, s)
  ];
}

function findingsCard(ctx, s) {
  const d = s.transactions.detections;
  const li = (a, b) => h('li', { class: 'small' }, h('span', {}, a), h('b', { class: 'num' }, b));
  return card(ctx, {
    id: 'tx-findings', title: 'What the transactions show',
    extra: h('ul', { class: 'plain' },
      li('Subscriptions (' + d.subscriptions.length + ')', money(d.subscriptionsYearly) + ' a year'),
      d.priceCreep.map((p) => li('Price went up: ' + p.merchant + ' ' + money(p.from, true) + ' to ' + money(p.to, true), '+' + money(p.yearly, true) + ' a year')),
      d.trials.map((t) => li('Free trial turned paid: ' + t.merchant + ' on ' + t.paidDate, money(t.amount, true) + ' a month')),
      d.duplicates.map((x) => li('Likely duplicate: ' + x.merchant + ' on ' + x.date, money(x.amount, true))),
      d.fees.length ? li('Fees (' + d.fees.length + ')', money(d.feesTotal, true)) : null,
      d.bnpl.length ? li('Buy now, pay later payments (' + d.bnpl.length + ')', money(d.bnplTotal, true)) : null),
    reading: 'Likely duplicates are resolved in the log on Track.'
  });
}
