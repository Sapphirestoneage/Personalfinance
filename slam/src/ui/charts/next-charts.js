// Analyze, Next stage: what the change would take, now vs next, stay vs
// change over time, and the other measures. Numbers from src/calc/next-stage.js.

import { h } from '../dom.js';
import { money, signedMoney } from '../format.js';
import { hbars, lines } from './svg.js';
import { card, chartWidth } from './catalog.js';

function yearsMonths(m) {
  if (m === null) return null;
  const y = Math.floor(m / 12);
  const r = m % 12;
  return (y ? y + (y === 1 ? ' year' : ' years') : '') + (y && r ? ' ' : '') + (r ? r + (r === 1 ? ' month' : ' months') : '');
}

export function nextStageCards(ctx, s) {
  const n = s.nextStage;
  if (!n) return [card(ctx, { id: 'next-none', title: 'Next stage', reading: 'Plan a big change in Fill in, pass 7, to see what it would take.' })];
  const need = card(ctx, {
    id: 'next-need', title: 'What you would need: ' + n.name,
    extra: h('ul', { class: 'plain' },
      h('li', {}, h('span', {}, 'One-time costs'), h('b', { class: 'num' }, money(n.oneOffs))),
      n.transitionMonths ? h('li', {}, h('span', {}, n.transitionMonths + ' months of lower pay (' + signedMoney(n.transitionGap) + ' a month)'), h('b', { class: 'num' }, money(n.transitionBurn))) : null,
      h('li', {}, h('b', {}, 'Cash to make the switch'), h('b', { class: 'num' }, money(n.cashNeeded))),
      h('li', {}, h('span', {}, 'Each month after the switch'), h('b', { class: 'num ' + (n.next.surplus < 0 ? 'bad' : 'good') }, signedMoney(n.next.surplus))),
      n.cutNeeded > 0 ? h('li', {}, h('span', {}, 'Cut needed to break even each month'), h('b', { class: 'num bad' }, money(n.cutNeeded))) : null),
    reading: (n.cashNeeded === null ? 'Fill in take-home after the change (and during the switch) to see the cash needed. '
      : n.monthsToSaveWhole !== null ? 'Saving today\'s surplus of ' + money(n.now.surplus) + ' a month, you would have it in ' + yearsMonths(n.monthsToSaveWhole) + '. '
        : 'There is no surplus today to save toward it, so the cash has to come from savings or cuts. ') +
      (n.cutNeeded > 0 ? (n.ownWordsCovers ? 'Getting back to your own estimates would free ' + money(n.ownWords) + ' a month, enough to cover it.' : 'Getting back to your own estimates frees ' + money(n.ownWords) + ' a month; the rest needs other cuts.') : '')
  });

  const rows = [['Take-home', 'takeHome'], ['Spending and savings', 'outflow'], ['Left over', 'surplus']];
  const compare = card(ctx, {
    id: 'next-compare', title: 'Now vs next',
    svg: hbars({ rows: rows.map(([label, k]) => ({ label, values: [
      { v: n.now[k], name: 'now', color: 'var(--chart-1)', tip: label + ' now: ' + money(n.now[k]) },
      { v: n.next[k], name: 'next', color: 'var(--chart-3)', tip: label + ' next: ' + money(n.next[k]) }] })), width: chartWidth(true), fmt: money }),
    legendItems: [['Now', 'var(--chart-1)'], ['After the change', 'var(--chart-3)']],
    reading: n.next.perHour !== null && n.now.perHour !== null
      ? 'Take-home per hour worked: ' + money(n.now.perHour, true) + ' now, ' + money(n.next.perHour, true) + ' after.'
      : 'Add hours worked now (Basics) and after the change to compare pay per hour.'
  });

  let path = null;
  if (n.path) {
    const horizon = n.path.breakEven ? Math.min(120, n.path.breakEven + 12) : 60;
    const step = horizon > 36 ? 12 : 6;
    const idx = [];
    for (let m = 0; m <= horizon; m += step) idx.push(m);
    if (n.path.breakEven && !idx.includes(n.path.breakEven)) { idx.push(n.path.breakEven); idx.sort((a, b) => a - b); }
    path = card(ctx, {
      id: 'next-path', title: 'Stay vs change, money only',
      svg: lines({ series: [
        { name: 'Stay', color: 'var(--chart-1)', values: idx.map((m) => n.path.stay[m]) },
        { name: 'Change', color: 'var(--chart-3)', values: idx.map((m) => n.path.change[m]) }], xs: idx.map((m, i) => (i % 2 && idx.length > 7 && m !== n.path.breakEven ? '' : m === 0 ? 'now' : m % 12 === 0 ? m / 12 + 'y' : m + 'mo')), width: chartWidth(true), fmt: money }),
      legendItems: [['Stay put', 'var(--chart-1)'], ['Make the change', 'var(--chart-3)']],
      reading: 'Total saved over time on each path (starting from today\'s numbers). ' + (n.path.breakEven
        ? 'The change catches up on money after ' + yearsMonths(n.path.breakEven) + '.'
        : 'On money alone it does not catch up within 10 years, so the other measures have to carry it.')
    });
  }

  const ms = n.metrics;
  const better = ms.filter((m) => m.better === true);
  const metrics = card(ctx, {
    id: 'next-metrics', title: 'The other measures',
    extra: ms.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
      h('thead', {}, h('tr', {}, ['', 'Now', 'Next', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, ms.map((m) => h('tr', {}, h('td', {}, m.label), h('td', { class: 'num' }, m.now === null ? '·' : String(m.now)),
        h('td', { class: 'num' }, m.next === null ? '·' : String(m.next)),
        h('td', { class: m.better === true ? 'good' : m.better === false ? 'bad' : 'muted' }, m.better === true ? 'Better' : m.better === false ? 'Worse' : m.change === 0 ? 'Same' : 'Not filled in')))))) : null,
    reading: ms.length ? better.length + ' of ' + ms.length + ' measures get better' + (better.length ? ': ' + better.map((m) => m.label.split(',')[0].toLowerCase()).join(', ') + '.' : '.') : 'Add the measures that make the change worth it.'
  });
  return [need, compare, path, metrics].filter(Boolean);
}

