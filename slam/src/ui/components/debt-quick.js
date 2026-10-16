// A debt in a few words for the Rough pass: who or where it is owed, the type,
// about how much a month, and (optional) about how much is left. Same debt as
// the Actual pass, which holds the details (APR, due day).

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { question } from './value-input.js';
import { nameEdit } from './name-edit.js';

export const DEBT_TYPE_OPTIONS = [['credit-card', 'Credit card'], ['line-of-credit', 'Line of credit'], ['student-loan', 'Student loan'], ['car-loan', 'Car loan'],
  ['personal-loan', 'Personal loan'], ['medical', 'Medical'], ['bnpl', 'Buy now, pay later'], ['mortgage', 'Mortgage'], ['family-friend', 'Family or friend'], ['other', 'Other']];

export function debtTypeLabel(type) {
  const t = DEBT_TYPE_OPTIONS.find(([k]) => k === type);
  return t ? t[1] : type;
}

export function debtQuick(ctx, debt) {
  const p = (k) => ['debts', debt.id, k];
  const find = (d) => d.debts.find((x) => x.id === debt.id);
  return h('div', { class: 'sub-lines' },
    h('div', { class: 'row' },
      nameEdit(ctx, debt.label, 'debt:' + debt.id + ':label', (d, v) => { find(d).label = v; }, 'Owed to (bank, card, person)'),
      h('select', { 'aria-label': 'Type of debt', 'data-key': JSON.stringify(p('type')), onchange: (e) => ctx.update('Debt type', (d) => { find(d).type = e.target.value; }) },
        options(DEBT_TYPE_OPTIONS, debt.type))),
    question(ctx, 'About a month', 'The usual payment, or the minimum', p('minimum'), debt.minimum),
    question(ctx, 'About how much is left (optional)', null, p('balance'), debt.balance, { cadence: false }));
}

export function debtTypeTotals(summary) {
  const rows = summary.debtsByType;
  if (rows.length < 2) return null;
  return h('ul', { class: 'plain small' }, rows.map((g) => h('li', {},
    h('span', {}, debtTypeLabel(g.type) + (g.count > 1 ? ' (' + g.count + ')' : '')),
    h('span', { class: 'num' }, money(g.monthly) + ' a month' + (g.balance !== null ? ', ' + money(g.balance) + ' left' : '')))));
}
