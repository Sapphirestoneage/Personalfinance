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
  if (!n) return [card(ctx, { id: 'next-none', title: 'Next stage', reading: 'Plan a big change in Fill in, pass 6, to see what it would take.' })];
  const C = n.cases;
  // The best case is stored as cases.dream, the old name kept so files load unchanged (S-097).
  const LENSES = [['disaster', 'Disaster'], ['likely', 'Likely'], ['dream', 'Best case']];
  const row = (label, f, cls) => h('tr', {}, h('td', {}, label), LENSES.map(([k]) => {
    const [text, tone] = f(C[k]);
    return h('td', { class: 'num ' + (tone || '') + (cls ? ' ' + cls : '') }, text);
  }));
  const hasCash = C.likely.cash !== null;
  const need = card(ctx, {
    id: 'next-need', title: 'What you would need: ' + n.name,
    extra: h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), LENSES.map(([, l]) => h('th', {}, l)))),
      h('tbody', {},
        row('One-time costs', (x) => [money(x.oneOffs)]),
        row('Lower-pay months', (x) => [x.transitionMonths ? x.transitionMonths + ' x ' + money(Math.max(0, -(x.transitionGap || 0))) : 'none']),
        row('Cash to make the switch', (x) => [money(x.cashNeeded)]),
        hasCash ? row('Cash on hand covers it?', (x) => (x.cash.gap === null ? ['\u00b7'] : x.cash.covers ? ['yes, ' + money(x.cash.gap) + ' spare', 'good'] : ['short ' + money(-x.cash.gap), 'bad'])) : null,
        hasCash ? row('Runway on that cash', (x) => (x.cash.runwayMonths === null ? ['no lean months'] : [x.cash.runwayMonths.toFixed(1) + ' of ' + x.transitionMonths + (x.transitionMonths === 1 ? ' month' : ' months'), x.cash.runwayMonths >= x.transitionMonths ? 'good' : 'bad'])) : null,
        row('Saving today\'s surplus', (x) => [x.monthsToSaveWhole === null ? 'no surplus' : yearsMonths(x.monthsToSaveWhole)]),
        row('Each month after', (x) => [signedMoney(x.next.surplus), x.next.surplus < 0 ? 'bad' : 'good']),
        row('Catches up on money', (x) => [x.path ? (x.path.breakEven ? yearsMonths(x.path.breakEven) : 'not in 10 years') : '\u00b7'])))),
    reading: (C.disaster.cashNeeded === null || C.likely.cashNeeded === null)
      ? 'Fill in take-home after the change (and during the switch) to see the cash needed.'
      : 'Likely needs ' + money(C.likely.cashNeeded) + '; plan for the disaster case of ' + money(C.disaster.cashNeeded) +
        (hasCash ? (C.disaster.cash.covers ? ', which the cash on hand covers.' : ', ' + money(-C.disaster.cash.gap) + ' more than the cash on hand.') : '.') +
        (n.cutNeeded > 0 ? ' Likely runs ' + money(n.cutNeeded) + ' short a month' + (n.ownWordsCovers ? '; getting back to your own estimates covers it.' : '.') : '')
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
  if (C.likely.path) {
    const be = [C.disaster, C.likely, C.dream].map((x) => (x.path ? x.path.breakEven : null)).filter((x) => x !== null);
    const horizon = be.length ? Math.min(120, Math.max(...be) + 12) : 60;
    const step = horizon > 36 ? 12 : 6;
    const idx = [];
    for (let m = 0; m <= horizon; m += step) idx.push(m);
    const series = [{ name: 'Stay', color: 'var(--chart-1)', values: idx.map((m) => C.likely.path.stay[m]) }];
    for (const [k, label, color, dashed] of [['disaster', 'Disaster', 'var(--chart-8)', true], ['likely', 'Likely', 'var(--chart-3)', false], ['dream', 'Best case', 'var(--chart-7)', true]]) {
      if (C[k].path) series.push({ name: label, color, dashed, values: idx.map((m) => C[k].path.change[m]) });
    }
    path = card(ctx, {
      id: 'next-path', title: 'Stay vs change, money only',
      svg: lines({ series, xs: idx.map((m, i) => (i % 2 && idx.length > 7 ? '' : m === 0 ? 'now' : m % 12 === 0 ? m / 12 + 'y' : m + 'mo')), width: chartWidth(true), fmt: money }),
      legendItems: [['Stay put', 'var(--chart-1)'], ['Disaster', 'var(--chart-8)'], ['Likely', 'var(--chart-3)'], ['Best case', 'var(--chart-7)']],
      reading: 'Total saved over time on each path, from today\'s numbers. ' + (C.likely.path.breakEven
        ? 'Likely catches up after ' + yearsMonths(C.likely.path.breakEven) + (C.dream.path && C.dream.path.breakEven ? ', the best case after ' + yearsMonths(C.dream.path.breakEven) : '') + (C.disaster.path && !C.disaster.path.breakEven ? '; disaster does not within 10 years.' : '.')
        : 'Likely does not catch up on money within 10 years, so the other measures have to carry it.')
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

