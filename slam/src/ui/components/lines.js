// Editors for categories, lines, tags, and debts (S-106): set up once in Setup,
// Categories and lines / Tags / Debts. Moved from the Actual pass, unchanged.

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { question } from './value-input.js';
import { findLine, findCategory, addTag, toggleLineTag, renameTag, removeTag, setDebtLine, setPromoEnds } from '../../store/edits.js';
import { linkedLine, linkCandidates, splitPayment, cardInterest } from '../../calc/debts.js';
import { PREMIUM_LINE_TYPES } from '../../calc/coverage.js';
import { coverageNote } from './coverage.js';
import { nameEdit } from './name-edit.js';
import { lineTypeSelect } from './type-select.js';
import { DEBT_TYPE_OPTIONS } from './debt-quick.js';
import { linkedCardBalance, observations } from '../../calc/balances.js';

export const STATES = [['active', 'Counts, shown'], ['hidden', 'Counts, hidden'], ['archived', 'Archived (stops counting)']];
const TAG_IDEAS = ['Subscription', 'Travel', 'Gifts', 'Work', 'Self-care', 'Kids', 'Pets', 'Date night'];

// The client's own tags on one line: chips that toggle, plus a box to make a new one.
export function tagRow(ctx, line) {
  const doc = ctx.doc;
  const open = ctx.ui.expanded.has('tags:' + line.id);
  const mine = doc.tags.filter((t) => line.tags.includes(t.id));
  const toggle = () => { if (open) ctx.ui.expanded.delete('tags:' + line.id); else ctx.ui.expanded.add('tags:' + line.id); ctx.rerender(); };
  if (!open) {
    return h('div', { class: 'tags' }, mine.map((t) => h('span', { class: 'tag-chip', 'aria-pressed': 'true' }, '#' + t.name)),
      h('button', { class: 'tag-chip', 'data-key': 'tags:' + line.id + ':open', onclick: toggle }, mine.length ? 'Edit tags' : '+ Tag'));
  }
  const ideas = TAG_IDEAS.filter((n) => !doc.tags.some((t) => t.name.toLowerCase() === n.toLowerCase())).slice(0, 4);
  const make = (name) => ctx.update('Add tag', (d) => { toggleLineTag(d, line.id, addTag(d, name).id); });
  return h('div', { class: 'tags' },
    doc.tags.map((t) => h('button', { class: 'tag-chip', 'aria-pressed': line.tags.includes(t.id) ? 'true' : 'false', 'data-key': 'tags:' + line.id + ':' + t.id,
      onclick: () => ctx.update('Tag', (d) => toggleLineTag(d, line.id, t.id)) }, '#' + t.name)),
    ideas.map((n) => h('button', { class: 'tag-chip', onclick: () => make(n) }, '+ ' + n)),
    h('input', { type: 'text', placeholder: 'New tag', 'aria-label': 'New tag for ' + line.name, 'data-key': 'tags:' + line.id + ':new', style: 'width:9em;min-height:28px',
      onchange: (e) => { if (e.target.value.trim()) make(e.target.value); } }),
    h('button', { class: 'tag-chip', onclick: toggle }, 'Done'));
}

// Rename or delete tags (deleting takes it off every line).
export function tagManager(ctx) {
  const doc = ctx.doc;
  if (!doc.tags.length) return null;
  return h('div', { class: 'card', id: 'tag-list' }, h('p', { class: 'small muted' }, doc.tags.length + ' tag' + (doc.tags.length === 1 ? '' : 's') + '. Rename one, or delete it from every line.'),
    doc.tags.map((t) => h('div', { class: 'spread', style: 'margin-top:8px' },
      nameEdit(ctx, t.name, 'tag:' + t.id + ':name', (d, v) => renameTag(d, t.id, v), 'Tag name'),
      h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Delete tag', (d) => removeTag(d, t.id)) }, 'Delete'))));
}

export function catName(ctx, cat) {
  return nameEdit(ctx, cat.name, 'cat:' + cat.id + ':name', (d, v) => { findCategory(d, cat.id).name = v; }, 'Category name');
}

function lineSelect(ctx, line, field, list, label) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('select', { 'data-key': 'line:' + line.id + ':' + field, onchange: (e) => ctx.update(label, (d) => {
      let v = e.target.value;
      if (field === 'joy' || field === 'stress') v = v === '' ? null : Number(v);
      findLine(d, line.id).line[field] = v;
    }) }, options(list, line[field] === null ? '' : String(line[field]))));
}

export function lineDetail(ctx, cat, line, catHasAnswer) {
  const doc = ctx.doc;
  return h('div', { class: 'line-detail' },
    lineTypeSelect(ctx, line),
    lineSelect(ctx, line, 'kind', [['fixed', 'Fixed'], ['variable', 'Variable']], 'Fixed or variable'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: line.need, 'data-key': 'line:' + line.id + ':need',
      onchange: (e) => ctx.update('Need or want', (d) => { findLine(d, line.id).line.need = e.target.checked; }) }), 'Need (your call; FAT is counted by category)'),
    lineSelect(ctx, line, 'path', [['personal', 'Personal'], ['linked', 'Linked to an income source'], ['reimbursable', 'Someone pays me back']], 'Path'),
    line.path === 'linked' ? lineSelect(ctx, line, 'linkedIncomeId', [['', 'Pick income'], ...doc.income.map((i) => [i.id, i.label])], 'Linked income') : null,
    line.path === 'reimbursable' ? h('div', {}, question(ctx, 'Owed back to you', null, ['line', line.id, 'owedBack'], line.owedBack),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: line.owedBackReceived, 'data-key': 'line:' + line.id + ':recv',
        onchange: (e) => ctx.update('Owed back received', (d) => { findLine(d, line.id).line.owedBackReceived = e.target.checked; }) }), 'Received')) : null,
    lineSelect(ctx, line, 'joy', [['', 'Not rated'], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])], 'Joy or purpose, 1 to 10: how much does this add to your life?'),
    lineSelect(ctx, line, 'stress', [['', 'Not rated'], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])], 'Stress, 1 to 10: how much does this drain you?'),
    lineSelect(ctx, line, 'state', STATES, 'State'),
    // Dreams are typed in Eras, Your dream life (S-097).
    // A premium line is owned by health coverage (S-117): never asked here.
    PREMIUM_LINE_TYPES.includes(line.type) ? coverageNote(ctx, 'coverage-summary-line')
      : catHasAnswer ? h('p', { class: 'muted xs' }, 'The estimate for this category was given as one number in Your estimates (Plan).')
      : question(ctx, 'Line estimate', null, ['line', line.id, 'estimate'], line.estimate, { parts: true }));
}

// S-116: the line that pays a loan, the payment split into interest and principal, and a card's interest.
function payingLine(ctx, debt, summary) {
  if (debt.type === 'credit-card') return null;
  const line = linkedLine(ctx.doc, debt);
  const cands = linkCandidates(ctx.doc, debt);
  const pick = h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Paid by a budget line'),
    h('select', { 'data-key': 'debt-line:' + debt.id, onchange: (e) => ctx.update('Paid by', (d) => setDebtLine(d, debt.id, e.target.value || null)) },
      options([['', 'No: its own minimum, in Debt payments'], ...cands.map((c) => [c.id, c.name + ' (' + c.category + ')'])], line ? line.id : '')));
  if (!line) return h('div', {}, pick, h('p', { class: 'muted xs' }, 'Pick the line if the payment is already in the budget (a Car payment line, say), so it is counted once.'));
  const row = summary ? summary.rows.flatMap((r) => r.lines).find((l) => l.id === line.id) : null;
  const payment = row ? (row.actual !== null ? row.actual : row.estimate) : null;
  const sp = splitPayment(ctx.doc, debt, ctx.doc.currentMonth, payment);
  return h('div', {}, pick,
    h('p', { class: 'small', 'data-key': 'debt-min-from:' + debt.id }, 'Minimum: ' + money(row ? row.estimate : null) + ' a month, the estimate on the ' + line.name + ' line. Asked once, on the line.'),
    h('p', { class: 'small', 'data-key': 'debt-split:' + debt.id }, sp.interest === null || payment === null
      ? 'Interest and principal this month need the APR and the balance going into the month.'
      : 'This month: ' + money(payment, true) + ' paid, ' + money(sp.interest, true) + ' interest (spent) and ' + money(sp.principal, true) + ' principal (pays down the balance).'));
}

function cardPromo(ctx, debt) {
  if (debt.type !== 'credit-card') return null;
  const ci = cardInterest(ctx.doc, debt, ctx.doc.currentMonth);
  return h('div', {},
    question(ctx, 'Promo APR (%), if any', 'A 0% balance transfer, say', ['debts', debt.id, 'promoApr'], debt.promoApr, { cadence: false, placeholder: '%' }),
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Promo ends'),
      h('input', { type: 'date', value: debt.promoEnds || '', 'data-key': 'debt-promo-ends:' + debt.id, onchange: (e) => ctx.update('Promo ends', (d) => setPromoEnds(d, debt.id, e.target.value || null)) })),
    ci ? h('p', { class: 'small', 'data-key': 'debt-interest:' + debt.id }, 'Interest (computed) this month: ' + (ci.amount === null ? 'not yet. ' + ci.why : money(ci.amount, true) + '. ' + ci.why + '.') + ' It is in Debt payments, never typed.') : null);
}

export function debtCard(ctx, debt, summary) {
  const linked = linkedCardBalance(ctx.doc, debt.id);
  const obs = observations(ctx.doc, debt.id);
  const dated = obs.length ? obs[obs.length - 1] : null;
  const p = (k) => ['debts', debt.id, k];
  const set = (k) => (e) => ctx.update('Debt ' + k, (d) => { d.debts.find((x) => x.id === debt.id)[k] = e.target.value; });
  return h('div', { class: 'card' },
    h('div', { class: 'grid two' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Name'), h('input', { type: 'text', value: debt.label, 'data-key': JSON.stringify(p('label')), onchange: set('label') })),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Type'), h('select', { 'data-key': JSON.stringify(p('type')), onchange: set('type') }, options(DEBT_TYPE_OPTIONS, debt.type))),
      h('div', { class: 'field' }, debt.state === 'archived'
        ? h('p', { class: 'small warn' }, 'Not counting (paid off or set aside). ', h('button', { class: 'btn small', onclick: () => ctx.update('Count debt again', (d) => { d.debts.find((x) => x.id === debt.id).state = 'active'; }) }, 'Count it again'))
        : h('button', { class: 'btn small ghost', 'data-key': 'stop-debt:' + debt.id, onclick: () => ctx.update('Stop counting debt', (d) => { d.debts.find((x) => x.id === debt.id).state = 'archived'; }) }, 'Paid off, stop counting'))),
    payingLine(ctx, debt, summary),
    linkedLine(ctx.doc, debt) ? null : question(ctx, 'Minimum payment', 'Flows into Debt payments automatically', p('minimum'), debt.minimum),
    linked ? h('p', { class: 'small', 'data-key': 'debt-linked:' + debt.id }, 'Balance: ' + money(linked.amount) + ', from the account "' + linked.name + '" (Setup, Accounts).')
      // Dated balances (S-110) own the balance once there is one; it is never asked twice.
      : dated ? h('p', { class: 'small', 'data-key': 'debt-dated:' + debt.id }, 'Balance: ' + money(dated.amount) + ' on ' + dated.date + ', from the month balances (Setup, Accounts).')
        : question(ctx, 'Balance', null, p('balance'), debt.balance, { cadence: false }),
    question(ctx, 'APR (%)', null, p('apr'), debt.apr, { cadence: false, placeholder: '%' }),
    cardPromo(ctx, debt),
    linkedLine(ctx.doc, debt) ? null : question(ctx, 'Due day of the month', null, p('dueDay'), debt.dueDay, { cadence: false, placeholder: 'day' }));
}

