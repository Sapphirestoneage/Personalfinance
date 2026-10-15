// The three-column table: Estimate | Dream | Actual per category, expandable to
// lines, with gaps, accuracy, share of take-home, and status chips. Sortable.
// Every number comes from the summary (or calc's inUnit for the lens toggle).

import { h } from '../dom.js';
import { money, pct, signedMoney, signedPct, times, inLens } from '../format.js';
import { statusChip } from './status.js';
import { inUnit } from '../../calc/lenses.js';
import { parseAmount } from './value-input.js';

const COLUMNS = [
  ['name', 'Category', ''],
  ['estimate', 'Estimate', ''],
  ['dream', 'Dream', 'wide'],
  ['actual', 'Actual', ''],
  ['gap', 'Gap $', ''],
  ['gapPct', 'Gap %', 'wide'],
  ['accuracy', 'Accuracy', 'wide'],
  ['share', '% take-home', 'wide'],
  ['status', 'Status', 'wide']
];

function sortValue(row, key) {
  if (key === 'name') return row.name;
  if (key === 'gap') return row.gaps.actualMinusEstimate;
  if (key === 'gapPct') return row.gaps.actualMinusEstimatePct;
  if (key === 'accuracy') return row.accuracy;
  if (key === 'share') return row.pctTakeHome.basis;
  if (key === 'status') return row.status.actual || '';
  return row[key];
}

// Over the estimate is red for spending, but for savings, falling short is red.
function gapClass(x, savings) {
  if (x === null || x === undefined || x === 0) return '';
  return (x > 0) !== !!savings ? 'bad' : 'good';
}

function cells(row, unit, summary, isLine, savings) {
  const L = (x) => inLens(inUnit(x, unit, summary.totals, summary.income), unit);
  const g = row.gaps;
  return [
    h('td', { class: 'num' }, L(row.estimate)),
    h('td', { class: 'num wide' }, L(row.dream)),
    h('td', { class: 'num' }, L(row.actual), !isLine && row.partial ? h('span', { class: 'muted xs' }, ' partial') : null),
    h('td', { class: 'num ' + gapClass(g.actualMinusEstimate, savings) }, unit === 'dollars' ? signedMoney(g.actualMinusEstimate) : L(g.actualMinusEstimate)),
    h('td', { class: 'num wide ' + gapClass(g.actualMinusEstimatePct, savings) }, signedPct(g.actualMinusEstimatePct)),
    h('td', { class: 'num wide' }, times(row.accuracy)),
    h('td', { class: 'num wide' }, pct(row.pctTakeHome.basis)),
    h('td', { class: 'wide', title: 'Estimate, dream, actual' }, statusChip(row.status.estimate), ' ', statusChip(row.status.dream), ' ', statusChip(row.status.actual))
  ];
}

export function budgetTable(ctx, summary) {
  const { ui } = ctx;
  const unit = ui.lens;
  // "Doesn't apply" categories get no row (lesson 12); they are named once under the table.
  const rows = summary.rows.filter((r) => !r.notForMe);
  if (ui.sort.key) {
    rows.sort((a, b) => {
      const x = sortValue(a, ui.sort.key);
      const y = sortValue(b, ui.sort.key);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x < y ? -1 : 1) * ui.sort.dir;
    });
  }
  const head = h('tr', {}, COLUMNS.map(([key, label, cls]) => h('th', {
    class: cls, scope: 'col', 'aria-sort': ui.sort.key === key ? (ui.sort.dir > 0 ? 'ascending' : 'descending') : null,
    onclick: () => { ui.sort = { key, dir: ui.sort.key === key ? -ui.sort.dir : (key === 'name' ? 1 : -1) }; ctx.rerender(); }
  }, label, ui.sort.key === key ? (ui.sort.dir > 0 ? ' ▴' : ' ▾') : '')));

  const body = [];
  for (const r of rows) {
    const open = ui.expanded.has('cat:' + r.id);
    const canOpen = r.lines.length > 0;
    body.push(h('tr', { class: 'cat' },
      h('td', {}, canOpen ? h('button', { 'aria-expanded': open ? 'true' : 'false', onclick: () => {
        if (open) ui.expanded.delete('cat:' + r.id); else ui.expanded.add('cat:' + r.id);
        ctx.rerender();
      } }, (open ? '▾ ' : '▸ ') + r.name) : r.name,
      r.basisFrom === 'estimate' ? h('span', { class: 'muted xs' }, ' (no actual yet)') : null),
      cells(r, unit, summary, false, r.savings)));
    if (open) {
      for (const l of r.lines) {
        body.push(h('tr', { class: 'line' },
          h('td', {}, h('a', { href: '#fill', onclick: (e) => { e.preventDefault(); if (!l.computed) ctx.goToField(['line', l.id, 'actual']); } }, l.name),
            l.state === 'hidden' ? h('span', { class: 'xs' }, ' (hidden)') : null),
          cells(l, unit, summary, true, r.savings)));
      }
    }
  }
  const t = summary.totals;
  const L = (x) => inLens(inUnit(x, unit, t, summary.income), unit);
  body.push(h('tr', { class: 'total' }, h('td', {}, 'Spending'), h('td', { class: 'num' }, L(t.estimateTotal)), h('td', { class: 'num wide' }, L(t.dreamTotal)),
    h('td', { class: 'num' }, L(t.actualTotal)), h('td', {}), h('td', { class: 'wide' }), h('td', { class: 'wide' }), h('td', { class: 'num wide' }, pct(t.spendingShare)), h('td', { class: 'wide' })));

  const skipped = summary.rows.filter((r) => r.notForMe).map((r) => r.name);
  return h('div', {},
    h('div', { class: 'table-wrap' }, h('table', { class: 'budget' }, h('thead', {}, head), h('tbody', {}, body))),
    skipped.length ? h('p', { class: 'muted xs' }, "Doesn't apply: " + skipped.join(', ') + '.') : null);
}

// A closed month, read-only except late entries (stored as revisions).
export function closedMonthTable(ctx, rows, key) {
  const body = [];
  for (const r of rows) {
    body.push(h('tr', { class: 'cat' }, h('td', {}, r.name, r.revised ? h('span', { class: 'xs warn' }, ' revised') : null),
      h('td', { class: 'num' }, money(r.estimate)), h('td', { class: 'num' }, money(r.actual)),
      h('td', { class: 'num ' + gapClass(r.gap, r.savings) }, signedMoney(r.gap)), h('td', { class: 'num' }, times(r.accuracy)), h('td', {})));
    for (const l of r.lines) {
      body.push(h('tr', { class: 'line' }, h('td', {}, l.name), h('td', { class: 'num' }, money(l.estimate)),
        h('td', { class: 'num' }, money(l.actual), l.revised ? h('span', { class: 'xs warn' }, ' (was ' + money(l.original) + ')') : null),
        h('td', { class: 'num' }, signedMoney(l.gap)), h('td', { class: 'num' }, times(l.accuracy)),
        h('td', {}, h('button', { class: 'btn small ghost', onclick: () => {
          const v = prompt('Late entry for ' + l.name + ' in ' + key + ' (the original stays on record):', l.actual === null ? '' : String(l.actual));
          if (v === null) return;
          const n = parseAmount(v);
          if (n === null || n === undefined) return ctx.toast('That needs a number');
          try { ctx.store.reviseMonth(key, l.id, n); } catch (e) { ctx.toast(e.message); }
        } }, 'Late entry'))));
    }
  }
  return h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
    h('thead', {}, h('tr', {}, ['Category', 'Estimate', 'Actual', 'Gap $', 'Accuracy', ''].map((x) => h('th', {}, x)))),
    h('tbody', {}, body)));
}
