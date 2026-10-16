// Pick the month being worked on (month + year). Actuals typed after that are
// saved under that month. Months that already have numbers show as chips.

import { h, options } from '../dom.js';
import { monthLabel } from '../format.js';
import { switchMonth, copyFixedFromLastMonth } from '../../store/months.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function go(ctx, key) {
  ctx.ui.monthView = 'current';
  ctx.update('Work on ' + monthLabel(key), (d) => switchMonth(d, key));
}

export function monthPicker(ctx, summary, opts = {}) {
  const doc = ctx.doc;
  const [y, m] = doc.currentMonth.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let yr = Math.min(y, thisYear) - 5; yr <= Math.max(y, thisYear) + 1; yr++) years.push(yr);
  const closed = new Set(summary.history.keys);
  const withData = [...new Set([...summary.history.allKeys, doc.currentMonth])].sort();
  const pick = (yy, mm) => {
    const key = yy + '-' + String(mm).padStart(2, '0');
    if (closed.has(key)) { ctx.ui.monthView = key; ctx.go('budget'); return; }
    go(ctx, key);
  };
  const isEmpty = summary.model.categories.every((c) => c.isDebt || c.lines.every((l) => l.status.actual === null));
  return h('div', { class: 'card' },
    h('div', { class: 'row' },
      h('b', {}, 'Month'),
      h('select', { 'aria-label': 'Month', 'data-key': 'pick-month', onchange: (e) => pick(y, Number(e.target.value)) },
        options(MONTHS.map((name, i) => [String(i + 1), name]), String(m))),
      h('select', { 'aria-label': 'Year', 'data-key': 'pick-year', onchange: (e) => pick(Number(e.target.value), m) },
        options(years.map((yr) => [String(yr), String(yr)]), String(y)))),
    h('p', { class: 'muted xs' }, 'Actuals you enter are saved under ' + monthLabel(doc.currentMonth) + '. Switch months any time; nothing is lost.'),
    withData.length > 1 ? h('div', { class: 'row' }, withData.map((k) => h('button', {
      class: 'btn small' + (k === doc.currentMonth ? ' primary' : ''),
      title: closed.has(k) ? 'Closed (view only)' : 'Has actuals',
      onclick: () => (k === doc.currentMonth ? null : closed.has(k) ? (ctx.ui.monthView = k, ctx.go('budget')) : go(ctx, k))
    }, monthLabel(k).replace(/ (\d{4})$/, " '$1").replace("'20", "'") + (closed.has(k) ? ' (closed)' : '')))) : null,
    opts.copyFixed && isEmpty ? h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => {
      let res;
      ctx.update('Copy fixed costs', (d) => { res = copyFixedFromLastMonth(d); });
      ctx.toast(res ? 'Copied ' + res.copied + ' fixed costs from ' + monthLabel(res.from) : 'No earlier month to copy from');
    } }, 'Copy fixed costs from last month') : null);
}
