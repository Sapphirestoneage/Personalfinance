// Income on screen (S-118): rows before expenses, everywhere a month's budget shows. Estimate (Setup,
// Income), plan (scheduled pay from the real paydays; side income changeable for the month), and actual
// from the log. Numbers come from calc/income-month.js.

import { h, options } from '../dom.js';
import { money, signedMoney, monthLabel } from '../format.js';
import { valueInput } from './value-input.js';
import { statusChip } from './status.js';
import { openQuickEntry } from './quick-entry.js';
import { incomeMonth } from '../../calc/income-month.js';
import { setIncomeActual } from '../../store/edits.js';
import { setPlanIncome } from '../../store/plans.js';
import { editEntry } from '../../store/log.js';
import { makeValue } from '../../store/value.js';

const actualText = (x) => (x.from === 'log' ? 'from your log, ' + x.count + (x.count === 1 ? ' entry' : ' entries') : x.from === 'typed' ? 'typed' : x.from === 'none' ? 'none this month' : 'still empty');

// Read-only rows, one line each: source, estimate, plan, actual, actual vs plan.
// rows: [{ id, name, estimate, plan, planNote, actual, from, count }].
export function incomeRowsList(rows, total, key = 'income-rows') {
  const vs = (r) => (r.actual === null || r.plan === null ? '' : signedMoney(r.actual - r.plan));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'budget tight', 'data-key': key },
    h('thead', {}, h('tr', {}, ['Income', 'Estimate', 'Plan', 'Actual', 'Vs plan'].map((x) => h('th', {}, x)))),
    h('tbody', {},
      rows.map((r) => h('tr', { class: 'income-row', 'data-key': key + ':' + r.id, title: (r.planNote ? r.planNote + '; ' : '') + actualText(r) },
        h('td', {}, r.name), h('td', { class: 'num' }, money(r.estimate)), h('td', { class: 'num' }, money(r.plan)), h('td', { class: 'num' }, money(r.actual)), h('td', { class: 'num' }, vs(r)))),
      total ? h('tr', { class: 'income-total' }, h('td', {}, total.tracked ? 'Income' : 'Income (not tracked)'), h('td', { class: 'num' }, money(total.estimate)), h('td', { class: 'num' }, money(total.plan)),
        h('td', { class: 'num', 'data-key': key + '-total' }, money(total.actual)), h('td', { class: 'num' }, vs(total))) : null)));
}

// Plan: each source for the plan month. Side and variable income can be changed for that month.
export function incomePlanCard(ctx, summary, month, editable) {
  const im = incomeMonth(ctx.doc, summary.income, month);
  return h('div', { class: 'card', id: 'plan-income', style: 'grid-column:1 / -1' },
    h('h3', {}, 'Income, ' + monthLabel(month)),
    h('ul', { class: 'plain' }, im.sources.map((x) => h('li', { class: 'small', 'data-key': 'plan-income:' + x.id },
      h('span', { style: 'flex:1 1 180px' }, x.label, h('div', { class: 'xs muted' }, 'estimate ' + money(x.estimate) + ' a month' + (x.planNote ? ', ' + x.planNote : ''))),
      x.scheduled || !editable ? h('b', { class: 'num', 'data-key': 'plan-income-amt:' + x.id }, money(x.plan))
        : valueInput({ ...ctx, preview: null, commit: (path, value) => ctx.update('Plan ' + x.label, (d) => setPlanIncome(d, month, x.id, value.amount === null ? null : value)) },
          ['plans', month, 'income', x.id], ((((ctx.doc.plans || {})[month] || {}).income || {})[x.id]) || makeValue(x.plan), { label: x.label + ' plan', cadence: false }))),
      h('li', { class: 'small' }, h('b', {}, 'Planned income'), h('b', { class: 'num', 'data-key': 'plan-income-total' }, money(im.plan)))));
}

// Review: the month's income on top of fill gaps. From the log when there are entries; otherwise an
// amount can be typed, or none this month. Entries with no source are listed to give one.
export function incomeFillCard(ctx, summary) {
  const month = ctx.doc.currentMonth;
  const im = summary.totals.income;
  const typedOf = (id) => ((ctx.doc.incomeActuals || {})[month] || {})[id] || makeValue();
  const sub = (x) => ({ ...ctx, preview: null, commit: (path, value) => ctx.update('Income ' + x.label, (d) => setIncomeActual(d, month, x.id, value.amount === null ? null : value)) });
  const row = (x) => h('div', { class: 'qa', 'data-key': 'income-row:' + x.id },
    h('div', { class: 'q' }, h('div', {}, x.label), h('div', { class: 'hint' }, 'plan ' + money(x.plan) + (x.planNote ? ' (' + x.planNote + ')' : ''))),
    x.from === 'log' ? h('div', { class: 'value-input' }, h('b', { class: 'num', 'data-key': 'income-actual:' + x.id }, money(x.actual, true)), statusChip('computed'), h('span', { class: 'xs muted' }, actualText(x)))
      : h('div', { class: 'value-input' },
        valueInput(sub(x), ['incomeActuals', month, x.id], typedOf(x.id), { label: x.label + ' actual', cadence: false }),
        x.from === null ? h('button', { class: 'btn small ghost', 'data-key': 'income-none:' + x.id, onclick: () => ctx.update('None this month', (d) => setIncomeActual(d, month, x.id, 'none')) }, 'None this month') : null,
        h('button', { class: 'btn small ghost', 'data-key': 'income-entry:' + x.id, onclick: () => openQuickEntry(ctx, { kind: 'income', incomeId: x.id }) }, '+ Add entry')));
  const empty = im.sources.filter((x) => x.actual === null);
  const loose = (ctx.doc.transactions || []).filter((t) => im.unassigned.ids.includes(t.id));
  // Sources with an actual take one line each; the ones still empty get the full row.
  const done = im.sources.filter((x) => x.actual !== null);
  return h('div', { class: 'card' + (empty.length || loose.length ? ' flag' : ''), id: 'income-card' },
    h('h3', {}, 'Income this month'),
    done.length ? h('ul', { class: 'plain' }, done.map((x) => x.from === 'log'
      ? h('li', { class: 'small', 'data-key': 'income-row:' + x.id }, h('span', {}, x.label, h('span', { class: 'xs muted' }, ' ' + actualText(x) + ', plan ' + money(x.plan))), h('b', { class: 'num', 'data-key': 'income-actual:' + x.id }, money(x.actual, true)))
      : h('li', { class: 'small' }, row(x)))) : null,
    empty.length ? h('div', { 'data-key': 'income-empty' }, h('p', { class: 'small' }, h('b', {}, 'Still empty (' + empty.length + ')'), ' Add an entry, type an amount, or none this month.'), empty.map(row)) : null,
    loose.length ? h('div', { 'data-key': 'income-loose' }, h('p', { class: 'small' }, h('b', {}, loose.length + ' income entr' + (loose.length === 1 ? 'y' : 'ies') + ' with no source'), ' (counted; say whose it is)'),
      loose.map((t) => h('div', { class: 'qa' }, h('div', { class: 'q' }, (t.description || t.note || 'Deposit') + ', ' + t.date + ', ' + money(-t.amount, true)),
        h('select', { 'aria-label': 'Which income', 'data-key': 'income-source:' + t.id, onchange: (e) => ctx.update('Income source', (d) => editEntry(d, t.id, { incomeId: e.target.value || null })) },
          options([['', 'Pick the income'], ...ctx.doc.income.filter((i) => i.state !== 'archived').map((i) => [i.id, i.label])], ''))))) : null,
    h('p', { class: 'small', 'data-key': 'income-surplus' }, 'Surplus: ' + signedMoney(summary.totals.surplus) + (summary.totals.incomeTracked ? ' (income from your log: ' + money(im.actual) + ')' : ' (income not tracked this month: take-home ' + money(summary.totals.takeHome) + ')')));
}

// The budget table (Insights): income rows before expenses. cols: the table's columns.
export function incomeTableRows(summary, cols) {
  const im = summary.totals.income;
  const cell = (key, x) => {
    if (key === 'name') return h('td', {}, x.label || 'Income');
    const val = { estimate: money(x.estimate), plan: summary.plan ? money(x.plan) : null, actual: money(x.actual), gap: x.actual === null || x.estimate === null ? '' : signedMoney(x.actual - x.estimate), planGap: x.actual === null || x.plan === null ? '' : signedMoney(x.actual - x.plan) }[key];
    return h('td', { class: 'num ' + (cols.find((c) => c[0] === key) || [, , ''])[2] }, val === undefined || val === null ? '' : val);
  };
  return [
    ...im.sources.map((x) => h('tr', { class: 'income-row', 'data-key': 'tbl-income:' + x.id }, cols.map(([key]) => cell(key, x)))),
    h('tr', { class: 'income-total' }, cols.map(([key]) => cell(key, { label: 'Income' + (im.tracked ? '' : ' (not tracked this month)'), estimate: im.estimate, plan: im.plan, actual: im.actual })))
  ];
}
