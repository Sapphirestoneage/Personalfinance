// Card interest a month, by card (S-133): one bar per card, redrawn on every keystroke while an APR or a
// balance is typed (the app's preview), so the change shows before the field is left.
// Numbers come from summary.cardInterest (src/engines/debts.js interestHandoff, built on cardInterest)
// and the total from cardInterestTotal there; this file only draws them. Builds on dom and format.

import { h } from '../dom.js';
import { money } from '../format.js';
import { cardInterestTotal } from '../../engines/debts.js';

function bars(rows) {
  const max = Math.max(0, ...rows.map((r) => r.amount || 0));
  const total = cardInterestTotal(rows);
  return h(
    'div',
    {},
    rows.map((r) =>
      h(
        'div',
        { class: 'ibar-row', 'data-key': 'ibar:' + r.id },
        h('span', { class: 'ibar-name small' }, r.name),
        // Any interest at all gets a bar at least 2% wide, so a small card still shows next to a big one.
        h(
          'span',
          { class: 'ibar-track' },
          h('span', {
            class: 'ibar-fill',
            style: 'width:' + (max > 0 && r.amount ? Math.max(2, (r.amount / max) * 100) : 0) + '%'
          })
        ),
        // A null amount means an input is missing (empty is not zero); the row says which one.
        h(
          'b',
          { class: 'num small ibar-amt' },
          r.amount === null ? 'needs ' + (r.apr === null ? 'APR' : 'balance') : money(r.amount, true)
        )
      )
    ),
    h(
      'p',
      { class: 'xs muted', 'data-key': 'ibar-total' },
      'Together ' + money(total, true) + ' a month. It is in Debt payments, never typed.'
    )
  );
}

export function interestChart(ctx, summary) {
  const rows = summary.cardInterest || [];
  if (!rows.length) return null;
  const box = h('div', { 'data-key': 'interest-bars' }, bars(rows));
  // Live while typing: the preview hands a summary of the draft; only this chart is redrawn.
  // app.js clears previewHandler on every full render, so only a screen that draws this chart gets the preview.
  ctx.ui.previewHandler = (s) => {
    if (s && s.cardInterest) box.replaceChildren(bars(s.cardInterest));
  };
  return h('div', { class: 'card', id: 'chart-interest' }, h('h3', {}, 'Card interest a month'), box);
}
