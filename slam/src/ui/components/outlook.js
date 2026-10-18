// So far and expected by month end (S-128): the open month's two numbers, each labeled, on Review and
// under the budget table (Today has them as its tile). Numbers come from calc/calendar.js monthOutlook.

import { h } from '../dom.js';
import { signedMoney, money, todayIso } from '../format.js';
import { monthOutlook } from '../../calc/calendar.js';

// opts.short: the two numbers alone (Review, where the page is already long).
export function outlookLine(ctx, summary, key, opts = {}) {
  const o = monthOutlook(ctx.doc, summary.income, todayIso());
  if (!o) return null;
  return h('p', { class: 'small', 'data-key': key },
    'So far: ', h('b', { class: 'num', 'data-key': key + '-so-far' }, signedMoney(o.soFar)),
    opts.short ? '. ' : h('span', { class: 'muted' }, ' (income logged ' + money(o.incomeSoFar, true) + ' less spending logged ' + money(o.spentSoFar, true) + '). '),
    'Expected by month end: ', h('b', { class: 'num', 'data-key': key + '-expected' }, signedMoney(o.expected)),
    opts.short ? '.' : h('span', { class: 'muted' }, ' (with paychecks and bills still to come, and the rest of the plan).'),
    o.noPayDate.length ? h('span', { class: 'muted xs' }, ' No pay date yet for ' + o.noPayDate.join(', ') + '.') : null);
}
