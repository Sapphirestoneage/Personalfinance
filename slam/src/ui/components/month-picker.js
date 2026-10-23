// Start of month (Plan, S-106): pick the month being worked on (month + year). Actuals typed after that are
// saved under that month. Months that already have numbers show as chips.
// Writes go through switchMonth and copyFixedFromLastMonth (store/months.js). Reads summary.history (monthHistory,
// engines/history.js) for which months are closed or hold numbers, and summary.model for whether anything is typed
// yet. Builds on dom and format.

import { h, options } from '../dom.js';
import { monthLabel } from '../format.js';
import { switchMonth, copyFixedFromLastMonth } from '../../store/months.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function go(ctx, key) {
  ctx.update('Work on ' + monthLabel(key), (d) => switchMonth(d, key));
}

export function monthPicker(ctx, summary, opts = {}) {
  const doc = ctx.doc;
  const [y, m] = doc.currentMonth.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  const years = [];
  // Five years back and one ahead of both the month being worked on and today, so an old month stays pickable.
  for (let yr = Math.min(y, thisYear) - 5; yr <= Math.max(y, thisYear) + 1; yr++) years.push(yr);
  // history.keys are the closed months; allKeys is every month with numbers except the current one, which monthHistory never
  // includes (openMonthRecords in store/months.js skips it), so it is added here.
  const closed = new Set(summary.history.keys);
  const withData = [...new Set([...summary.history.allKeys, doc.currentMonth])].sort();
  // A closed month cannot be reopened (switchMonth throws), so picking one views it in Past months on Review instead.
  const pick = (yy, mm) => {
    const key = yy + '-' + String(mm).padStart(2, '0');
    if (closed.has(key)) { ctx.jump('months', { ui: { monthsPick: key } }); return; }
    go(ctx, key);
  };
  // Nothing typed this month yet (debt rows are computed, so they do not count): only then is copying fixed costs offered.
  const isEmpty = summary.model.categories.every((c) => c.isDebt || c.lines.every((l) => l.status.actual === null));
  return h('div', { class: 'card', id: 'start-month' },
    h('h2', { style: 'margin-top:0' }, 'Start of month'),
    h('div', { class: 'row' },
      h('b', {}, 'Month'),
      h('select', { 'aria-label': 'Month', 'data-key': 'pick-month', onchange: (e) => pick(y, Number(e.target.value)) },
        options(MONTHS.map((name, i) => [String(i + 1), name]), String(m))),
      h('select', { 'aria-label': 'Year', 'data-key': 'pick-year', onchange: (e) => pick(Number(e.target.value), m) },
        options(years.map((yr) => [String(yr), String(yr)]), String(y)))),
    h('p', { class: 'muted xs' }, 'Actuals you enter are saved under ' + monthLabel(doc.currentMonth) + '. Switch months any time; nothing is lost.'),
    // Chips only when there is more than one month. The year is shortened: October 2026 reads as October '26.
    withData.length > 1 ? h('div', { class: 'row' }, withData.map((k) => h('button', {
      class: 'btn small' + (k === doc.currentMonth ? ' primary' : ''),
      title: closed.has(k) ? 'Closed (view only)' : 'Has actuals',
      onclick: () => (k === doc.currentMonth ? null : closed.has(k) ? ctx.jump('months', { ui: { monthsPick: k } }) : go(ctx, k))
    }, monthLabel(k).replace(/ (\d{4})$/, " '$1").replace("'20", "'") + (closed.has(k) ? ' (closed)' : '')))) : null,
    // ctx.update turns a thrown message into a toast, so the result comes out through res; null means no earlier month.
    opts.copyFixed && isEmpty ? h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => {
      let res;
      ctx.update('Copy fixed costs', (d) => { res = copyFixedFromLastMonth(d); });
      ctx.toast(res ? 'Copied ' + res.copied + ' fixed costs from ' + monthLabel(res.from) : 'No earlier month to copy from');
    } }, 'Copy fixed costs from last month') : null);
}
