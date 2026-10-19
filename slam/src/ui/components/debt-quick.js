// Debt types and the by-type totals shown with the debts (S-106: the Rough pass
// no longer asks debts a second time).

import { h, options } from '../dom.js';
import { money } from '../format.js';

export const DEBT_TYPE_OPTIONS = [['credit-card', 'Credit card'], ['line-of-credit', 'Line of credit'], ['student-loan', 'Student loan'], ['car-loan', 'Car loan'],
  ['personal-loan', 'Personal loan'], ['medical', 'Medical'], ['bnpl', 'Buy now, pay later'], ['mortgage', 'Mortgage'], ['family-friend', 'Family or friend'], ['other', 'Other']];

export function debtTypeLabel(type) {
  const t = DEBT_TYPE_OPTIONS.find(([k]) => k === type);
  return t ? t[1] : type;
}

export function debtTypeTotals(summary) {
  const rows = summary.debtsByType;
  if (rows.length < 2) return null;
  return h('ul', { class: 'plain small' }, rows.map((g) => h('li', {},
    h('span', {}, debtTypeLabel(g.type) + (g.count > 1 ? ' (' + g.count + ')' : '')),
    h('span', { class: 'num' }, money(g.monthly) + ' a month' + (g.balance !== null ? ', ' + money(g.balance) + ' left' : '')))));
}
