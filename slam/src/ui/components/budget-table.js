// The budget table: Estimate | Plan | Actual per category (the dream life is in Eras, S-097), expandable to
// lines, with gaps, accuracy, share of take-home, and status chips. Sortable.
// Every number comes from the summary (or calc's inUnit for the lens toggle).

import { h } from '../dom.js';
import { money, pct, signedMoney, signedPct, times, inLens } from '../format.js';
import { statusChip } from './status.js';
import { inUnit } from '../../calc/lenses.js';
import { parseAmount } from './value-input.js';
import { sourceLink } from './how.js';
import { incomeTableRows } from './income-month.js';

// Columns: amounts, then % of income (take-home) and % of spending for the
// basis (actual, else estimate), then happiness. 'wide' columns hide on phones;
// the expanded row repeats them there.
function columns(summary) {
  const plan = !!summary.plan;
  return [
    ['name', 'Category', ''],
    ['estimate', 'Estimate', 'wide'],
    plan ? ['plan', 'Plan', 'wide'] : null,
    ['actual', 'Actual', ''],
    ['pctIncome', '% of income', ''],
    ['pctSpending', '% of spending', 'wide'],
    ['happy', 'Happiness', ''],
    ['gap', 'Gap $', 'wide'],
    ['gapPct', 'Gap %', 'wide'],
    plan ? ['planGap', 'Vs plan $', 'wide'] : null,
    plan ? ['planGapPct', 'Vs plan %', 'wide'] : null,
    ['accuracy', 'Accuracy', 'wide'],
    ['status', 'Status', 'wide']
  ].filter(Boolean);
}

function sortValue(row, key) {
  if (key === 'name') return row.name;
  if (key === 'gap') return row.gaps.actualMinusEstimate;
  if (key === 'gapPct') return row.gaps.actualMinusEstimatePct;
  if (key === 'planGap') return row.gaps.actualMinusPlan;
  if (key === 'planGapPct') return row.gaps.actualMinusPlanPct;
  if (key === 'accuracy') return row.accuracy;
  if (key === 'pctIncome') return row.pct.income.basis;
  if (key === 'pctSpending') return row.pct.spending.basis;
  if (key === 'happy') return row.happiness ? row.happiness.share : null;
  if (key === 'status') return row.status.actual || '';
  return row[key];
}

// Over the estimate is red for spending, but for savings, falling short is red.
function gapClass(x, savings) {
  if (x === null || x === undefined || x === 0) return '';
  return (x > 0) !== !!savings ? 'bad' : 'good';
}

function joyText(hp, isLine) {
  if (!hp) return h('span', { class: 'muted xs' }, 'not rated');
  const per = hp.per100 === null || hp.per100 === undefined ? (hp.noCost ? 'no cost' : '\u00b7') : hp.per100.toFixed(2) + ' per $100';
  const rating = hp.rating === null || hp.rating === undefined ? '' : (isLine ? hp.rating + '/10' : hp.rating.toFixed(1) + ' avg');
  const st = isLine && hp.stressRating ? ', stress ' + hp.stressRating + '/10' : '';
  return h('span', { title: rating + ', ' + per + st }, pct(hp.share), isLine ? h('div', { class: 'xs muted' }, rating + ', ' + per + st) : null);
}

// Jump to source (S-108): an estimate opens Your estimates, a plan the plan, an actual its row on Review.
function sources(row, isLine, catId, isDebt) {
  if (isDebt) return { estimate: { where: 'setup:debts' }, plan: { where: 'plan', open: 'plan-cat:debt' }, actual: { where: 'setup:debts' } };
  if (isLine) return { estimate: { path: ['line', row.id, 'estimate'] }, plan: { where: 'plan', open: 'plan-cat:' + catId }, actual: { path: ['line', row.id, 'actual'] } };
  return { estimate: { path: ['categories', row.id, 'estimate'] }, plan: { where: 'plan', open: 'plan-cat:' + row.id }, actual: { where: 'actual', open: 'rv-cat:' + row.id } };
}

function cells(ctx, row, unit, summary, isLine, savings, catId, isDebt) {
  const L = (x) => inLens(inUnit(x, unit, summary.totals, summary.income), unit);
  const g = row.gaps;
  const plan = !!summary.plan;
  const src = sources(row, isLine, catId, isDebt);
  const link = (x, col) => (x === null || x === undefined ? L(x) : sourceLink(ctx, L(x), src[col]));
  return [
    h('td', { class: 'num wide' }, isLine && row.estimate === null && row.addedInReview ? h('span', { class: 'xs muted' }, 'added in review') : link(row.estimate, 'estimate')),
    plan ? h('td', { class: 'num wide' }, link(row.plan, 'plan')) : null,
    h('td', { class: 'num' }, link(row.actual, 'actual'), !isLine && row.partial ? h('span', { class: 'muted xs' }, ' partial') : null),
    h('td', { class: 'num' }, pct(row.pct.income.basis)),
    h('td', { class: 'num wide' }, pct(row.pct.spending.basis)),
    h('td', { class: 'num' }, joyText(row.happiness && row.stressInfo ? { ...row.happiness, stressRating: row.stressInfo.stress } : row.happiness, isLine)),
    h('td', { class: 'num wide ' + gapClass(g.actualMinusEstimate, savings) }, unit === 'dollars' ? signedMoney(g.actualMinusEstimate) : L(g.actualMinusEstimate)),
    h('td', { class: 'num wide ' + gapClass(g.actualMinusEstimatePct, savings) }, signedPct(g.actualMinusEstimatePct)),
    plan ? h('td', { class: 'num wide' }, unit === 'dollars' ? signedMoney(g.actualMinusPlan) : L(g.actualMinusPlan)) : null,
    plan ? h('td', { class: 'num wide' }, signedPct(g.actualMinusPlanPct)) : null,
    h('td', { class: 'num wide' }, times(row.accuracy)),
    h('td', { class: 'wide', title: 'Estimate, actual' }, statusChip(row.status.estimate), ' ', statusChip(row.status.actual))
  ];
}

// On phones the wide columns hide; an open row shows them as one line instead.
function narrowDetail(row, summary, span) {
  const bits = [['Estimate', money(row.estimate)], summary.plan ? ['Plan', money(row.plan)] : null,
    ['% of spending', pct(row.pct.spending.basis)], ['Gap', signedMoney(row.gaps.actualMinusEstimate)], summary.plan ? ['Vs plan', signedMoney(row.gaps.actualMinusPlan)] : null].filter(Boolean);
  return h('tr', { class: 'narrow-only detail' }, h('td', { colspan: String(span) }, h('span', { class: 'xs muted' }, bits.map(([k, v]) => k + ' ' + v).join(' \u00b7 '))));
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
  const COLUMNS = columns(summary);
  const cols = COLUMNS;
  const head = h('tr', {}, cols.map(([key, label, cls]) => h('th', {
    class: cls, scope: 'col', 'aria-sort': ui.sort.key === key ? (ui.sort.dir > 0 ? 'ascending' : 'descending') : null,
    onclick: () => { ui.sort = { key, dir: ui.sort.key === key ? -ui.sort.dir : (key === 'name' ? 1 : -1) }; ctx.rerender(); }
  }, label, ui.sort.key === key ? (ui.sort.dir > 0 ? ' ▴' : ' ▾') : '')));

  // Income before expenses (S-118).
  const body = [...incomeTableRows(summary, COLUMNS)];
  for (const r of rows) {
    const open = ui.expanded.has('cat:' + r.id);
    const canOpen = r.lines.length > 0;
    body.push(h('tr', { class: 'cat' },
      h('td', {}, canOpen ? h('button', { 'aria-expanded': open ? 'true' : 'false', onclick: () => {
        if (open) ui.expanded.delete('cat:' + r.id); else ui.expanded.add('cat:' + r.id);
        ctx.rerender();
      } }, (open ? '▾ ' : '▸ ') + r.name) : r.name,
      r.basisFrom === 'estimate' ? h('span', { class: 'muted xs' }, ' (no actual yet)') : null),
      cells(ctx, r, unit, summary, false, r.savings, r.id, r.isDebt)));
    if (open) body.push(narrowDetail(r, summary, COLUMNS.length));
    if (open) {
      for (const l of r.lines) {
        body.push(h('tr', { class: 'line' },
          h('td', {}, h('a', { href: '#fill', onclick: (e) => { e.preventDefault(); if (!l.computed) ctx.goToField(['line', l.id, 'actual']); } }, l.name),
            l.state === 'hidden' ? h('span', { class: 'xs' }, ' (hidden)') : null),
          cells(ctx, l, unit, summary, true, r.savings, r.id, r.isDebt)));
        body.push(narrowDetail(l, summary, COLUMNS.length));
      }
    }
  }
  const t = summary.totals;
  const L = (x) => inLens(inUnit(x, unit, t, summary.income), unit);
  const tot = { estimate: L(t.estimateTotal), plan: L(t.planSpending), actual: L(t.actualTotal),
    pctIncome: pct(t.spendingShare), pctSpending: t.spending ? '100%' : pct(null) };
  body.push(h('tr', { class: 'total' }, COLUMNS.map(([key, , cls]) => (key === 'name' ? h('td', {}, 'Spending') : h('td', { class: ('num ' + cls).trim() }, tot[key] || '')))));

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
