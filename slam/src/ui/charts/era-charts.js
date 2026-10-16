// Analyze, Eras: the blocks, cash month by month through every era next to
// staying in regular life, and each era's money. Numbers from src/calc/eras.js.

import { h } from '../dom.js';
import { money, signedMoney, monthLabel } from '../format.js';
import { lines } from './svg.js';
import { card, chartWidth } from './catalog.js';
import { eraStrip, eraColor } from '../screens/fill-eras.js';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (key) => SHORT[Number(key.slice(5)) - 1] + ' ' + key.slice(2, 4);

export function eraCards(ctx, s) {
  const t = s.eras;
  if (!t.eras.length) return [card(ctx, { id: 'eras-none', title: 'Eras', reading: 'Add eras (school abroad, a sabbatical, nomading...) in Fill in, pass 8, to see life in chapters.' })];
  const every = Math.max(1, Math.ceil(t.path.length / 6));
  const n = t.path.length;
  // A label every few months, and the last month unless it would crowd the one before.
  const xs = t.path.map((p, i) => (i % every === 0 && n - 1 - i >= every / 2 ? short(p.key) : i === n - 1 ? short(p.key) : ''));
  const cashLabel = t.cashKnown ? 'Cash' : 'Change in cash';
  const chart = card(ctx, {
    id: 'eras-cash', title: cashLabel + ' through the eras',
    svg: lines({ series: [
      { name: 'With the eras', color: 'var(--series-actual)', values: t.path.map((p) => p.cash) },
      { name: 'Regular life', color: 'var(--chart-axis)', dashed: true, values: t.path.map((p) => p.regular) }
    ], xs, width: chartWidth(false), fmt: money, label: cashLabel + ' by month' }),
    legendItems: [['With the eras', 'var(--series-actual)'], ['Regular life (dashed)', 'var(--chart-axis)']],
    extra: eraStrip(ctx, s),
    reading: t.costVsRegular === null ? 'Fill in take-home and spending to follow the cash.'
      : 'By ' + monthLabel(t.endKey) + ', ' + (t.cashKnown ? 'cash is ' + money(t.cashEnd) : 'cash has changed by ' + signedMoney(t.cashEnd)) + ', against ' + money(t.regularEnd) + ' in regular life: ' +
        (t.costVsRegular > 0 ? 'the eras cost ' + money(t.costVsRegular) + '.' : 'the eras come out ' + money(-t.costVsRegular) + ' ahead.') +
        (t.eras.some((e) => e.runsOut) ? ' Cash runs out in ' + t.eras.filter((e) => e.runsOut).map((e) => e.name).join(' and ') + '.' : '')
  });
  const table = card(ctx, {
    id: 'eras-table', title: 'Each era',
    extra: h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
      h('thead', {}, h('tr', {}, ['Era', 'When', 'A month', 'Whole era'].map((x) => h('th', {}, x)))),
      h('tbody', {}, t.eras.map((e, i) => h('tr', {},
        h('td', {}, h('span', { class: 'swatch', style: 'background:' + eraColor(i) }), ' ' + e.name, e.incomeGuess || e.spendGuess ? h('span', { class: 'xs st-guess' }, ' (guess)') : null),
        h('td', { class: 'small' }, short(e.start) + ' to ' + short(e.end)),
        h('td', { class: 'num' + (e.net < 0 ? ' bad' : '') }, signedMoney(e.net)),
        h('td', { class: 'num' + (e.total < 0 ? ' bad' : '') }, signedMoney(e.total) + (e.oneTimeBlank ? '*' : ''))))))),
    reading: t.eras.some((e) => e.oneTimeBlank) ? '* One-time costs not entered yet.' : 'Whole era includes its one-time costs.'
  });
  return [chart, table];
}
