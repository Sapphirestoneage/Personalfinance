// Debt types and a by-type totals list (S-106: the Rough pass no longer asks debts a second time).
// DEBT_TYPE_OPTIONS pairs each id in DEBT_TYPES (store/schema.js) with its label; lines.js uses it for the debt
// editor's Type select. debtTypeTotals lays out summary.debtsByType (debtsByType in engines/breakdown.js), though no
// screen calls it at the moment. Builds on dom and format.

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
  // One type only: the totals would repeat the debt list, so nothing is shown.
  if (rows.length < 2) return null;
  // A null balance means no debt of the type has one (debtsByType leaves missing numbers out rather than calling them 0).
  return h('ul', { class: 'plain small' }, rows.map((g) => h('li', {},
    h('span', {}, debtTypeLabel(g.type) + (g.count > 1 ? ' (' + g.count + ')' : '')),
    h('span', { class: 'num' }, money(g.monthly) + ' a month' + (g.balance !== null ? ', ' + money(g.balance) + ' left' : '')))));
}
