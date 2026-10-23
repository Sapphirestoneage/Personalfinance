// So far and expected by month end (S-128): the open month's two numbers, each labeled, on Review and
// under the budget table (Today has them as its tile). Numbers come from monthOutlook in engines/calendar.js;
// the line is built with dom.js and format.js.

import { h } from '../dom.js';
import { signedMoney, money, todayIso } from '../format.js';
import { monthOutlook } from '../../engines/calendar.js';

// opts.short: the two numbers alone (Review, where the page is already long).
export function outlookLine(ctx, summary, key, opts = {}) {
  const o = monthOutlook(ctx.doc, summary.income, todayIso());
  // monthOutlook is null for a closed month or a day outside the open month: nothing to show then.
  if (!o) return null;
  return h(
    'p',
    { class: 'small', 'data-key': key },
    'So far: ',
    h('b', { class: 'num', 'data-key': key + '-so-far' }, signedMoney(o.soFar)),
    opts.short
      ? '. '
      : h(
          'span',
          { class: 'muted' },
          ' (income logged ' + money(o.incomeSoFar, true) + ' less spending logged ' + money(o.spentSoFar, true) + '). '
        ),
    'Expected by month end: ',
    h('b', { class: 'num', 'data-key': key + '-expected' }, signedMoney(o.expected)),
    opts.short
      ? '.'
      : h('span', { class: 'muted' }, ' (with paychecks and bills still to come, and the rest of the plan).'),
    // An income with no pay date has no paychecks in the expected number; it is named here, never guessed (S-128).
    o.noPayDate.length ? h('span', { class: 'muted xs' }, ' No pay date yet for ' + o.noPayDate.join(', ') + '.') : null
  );
}
