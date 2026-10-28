// Count first (owner's ask, 2026-10-28): a section opens with its types, each with a count stepper (- 0 +); a count
// makes that many items at once, each one slim row holding only the first-pass answers, with Duplicate, Delete and
// More detail (the item's full rows, closed by default) on every row. The same rows serve the onboarding steps and
// the normal section screens of My numbers, so the second pass happens right there. Every box saves on its own
// through the shell's change(), in words, so Undo takes it back; what is open stays open across the redraw.
// Formatting only: engine/count.js knows the types, engine/paycheck.js the paycheck arithmetic.

import { h, money, said, showValue } from './view.js';
import { change, refresh } from './shell.js';
import { pickBox, textBox, later } from './boxes.js';
import { answerField } from './answers.js';
import { countsOf, addToGroup, removeLastOf, countWords } from '../engine/count.js';
import { duplicateItem, removeItem, putFact, editExpense } from '../engine/edits.js';
import { valueOf as v, setAt, getAt } from '../engine/spine.js';
import { setIncomeFirstPass, takeHomeOf, hasBasisChoice } from '../engine/paycheck.js';

const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
// What stays as it was across a redraw: which rows have More detail open; which way a pay line is typed.
const detailOpen = new Set();
const basisOf = new Map();
export const basisFor = (x) => basisOf.get(x.id) || (x.type === 'w2' || x.type === 'tips' ? 'takeHome' : 'gross');
export const rid = (collection, id, field) => 'r-' + collection + '-' + id + '-' + field;
const nameOf = (collection, x) => (collection === 'income' || collection === 'expenses' ? x.label : v(x.name)) || x.id;
const cell = (label, control, extra = null) => h('div', { class: 'cell' }, h('label', { class: 'mini-label', for: control.id }, label), control, extra);
const seg = (label, options, value, onPick) => h('div', { class: 'cell' }, h('span', { class: 'mini-label' }, label),
  h('div', { class: 'segmented nw-seg', role: 'group', 'aria-label': label }, options.map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(value === k), onclick: () => { if (value !== k) onPick(k); } }, h('span', { class: 'seg-label' }, w)))));
const amountWords = (val, kind) => (val === null ? (kind === 'notForMe' ? 'not for me' : 'blank') : money(val) + (kind === 'rough' ? ' (rough)' : ''));

// ---------------------------------------------------------------- the header and the count list
// "Debt: 3 cards, 1 car loan, $14,200 total" (the total from the section's one result, engine/summary.js).
export function countHead(spine, collection, label, result, totalWords = ' total') {
  return h('p', { class: 'count-head', role: 'status' }, h('strong', {}, label + ': '), countWords(spine, collection), result && result.value !== null ? ', ' + money(result.value) + totalWords : '');
}
// The types with their count steppers. A plus on Other opens the add form (onAddOther(group)).
export function countList({ spine, collection, today = todayIso(), onAddOther = null }) {
  return h('ul', { class: 'count-list', 'aria-label': 'How many of each' }, countsOf(spine, collection).map((g) => {
    const plus = () => {
      if (!g.add) { if (onAddOther) onAddOther(g); return; }
      const made = addToGroup(spine, collection, g.key, today);
      if (change(made.spine, said.added(made.label))) later(() => document.getElementById(rid(collection, made.id, 'name'))?.select());
    };
    const minus = () => { const r = removeLastOf(spine, collection, g.key); if (!r) return; detailOpen.delete(r.id); change(r.spine, said.deleted(r.label)); };
    return h('li', { class: 'count-row' + (g.n ? ' has-some' : '') },
      h('span', { class: 'count-label' }, g.label, g.n ? null : h('span', { class: 'count-none' }, 'not for me')),
      h('span', { class: 'stepper', role: 'group', 'aria-label': g.label + ': how many' },
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'One fewer: ' + g.label, disabled: !g.n, title: g.n ? null : 'None to take away', onclick: minus }, '−'),
        h('span', { class: 'count-n' }, String(g.n)),
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'One more: ' + g.label, onclick: plus }, '+')));
  }));
}

// ---------------------------------------------------------------- the rows
// detail(item): what More detail opens (the item's full rows), drawn by the page.
function rowButtons({ spine, collection, x, detail, today }) {
  const name = nameOf(collection, x);
  const dup = h('button', { type: 'button', class: 'btn small', onclick: () => {
    const r = duplicateItem(spine, collection, x.id, today, name + ' copy');
    if (change(r.spine, said.added(name + ' copy'))) later(() => document.getElementById(rid(collection, r.id, 'name'))?.select());
  } }, 'Duplicate');
  const del = h('button', { type: 'button', class: 'btn danger small', onclick: () => { detailOpen.delete(x.id); change((s) => removeItem(s, collection, x.id), said.deleted(name)); } }, 'Delete');
  let more = null;
  if (detail) {
    const open = detailOpen.has(x.id);
    more = h('details', { class: 'row-more detail', open: open || null },
      h('summary', { 'aria-label': 'More detail: ' + name }, open ? 'Less detail' : 'More detail'),
      h('div', { class: 'row-more-body detail-body' }, ...(open ? [].concat(detail(x)).filter(Boolean) : [])));
    more.addEventListener('toggle', () => { if (!more.isConnected || more.open === detailOpen.has(x.id)) return; if (more.open) detailOpen.add(x.id); else detailOpen.delete(x.id); refresh(); });
  }
  return h('div', { class: 'irow-btns' }, dup, del, more);
}

function debtCells(spine, x, today) {
  const p = 'debts.' + x.id, name = v(x.name) || x.id;
  const put = (path, value, kind, words) => change((s) => putFact(s, path, value, kind, today), words);
  return [
    cell('Name', textBox(rid('debts', x.id, 'name'), v(x.name), name + ': name', (t) => put(p + '.name', t, t === null ? 'missing' : 'known', said.changed('Name', t || 'blank')), 'e.g. Chase Freedom')),
    answerField({ id: rid('debts', x.id, 'balance'), label: 'Owed', path: p + '.balance', fact: x.balance, placeholder: 'owed', onSet: (val, kind) => put(p + '.balance', val, kind, said.changed(name + ' owed', amountWords(val, kind))) }),
    answerField({ id: rid('debts', x.id, 'apr'), label: 'Rate', type: 'rate', path: p + '.apr', fact: x.apr, onSet: (val, kind) => put(p + '.apr', val, kind, said.changed(name + ' rate', val === null ? (kind === 'notForMe' ? 'not for me' : 'blank') : showValue(val, 'rate') + (kind === 'rough' ? ' (rough)' : ''))) }),
    answerField({ id: rid('debts', x.id, 'minimum'), label: 'A month', path: p + '.minimum', fact: x.minimum, placeholder: 'a month', onSet: (val, kind) => put(p + '.minimum', val, kind, said.changed(name + ' payment', amountWords(val, kind))) })
  ];
}
function accountCells(spine, x, today) {
  const p = 'accounts.' + x.id, name = v(x.name) || x.id;
  const put = (path, value, kind, words) => change((s) => putFact(s, path, value, kind, today), words);
  return [
    cell('Name', textBox(rid('accounts', x.id, 'name'), v(x.name), name + ': name', (t) => put(p + '.name', t, t === null ? 'missing' : 'known', said.changed('Name', t || 'blank')), 'e.g. Chase checking')),
    answerField({ id: rid('accounts', x.id, 'balance'), label: 'In it', path: p + '.balance', fact: x.balance, onSet: (val, kind) => put(p + '.balance', val, kind, said.changed(name + ' balance', amountWords(val, kind))) })
  ];
}
const PAY_OFTEN = [['biweekly', 'Every 2 weeks'], ['weekly', 'Weekly'], ['semimonthly', 'Twice a month'], ['monthly', 'Monthly']];
const ANY_OFTEN = [['monthly', 'A month'], ['weekly', 'A week'], ['biweekly', 'Every 2 weeks'], ['semimonthly', 'Twice a month'], ['quarterly', 'A quarter'], ['yearly', 'A year']];
const OFTEN_WORDS = Object.fromEntries([...PAY_OFTEN, ...ANY_OFTEN]);
function incomeCells(spine, rules, x, today) {
  const p = 'income.' + x.id, name = x.label || x.id;
  const choice = hasBasisChoice(x);
  const basis = choice ? basisFor(x) : 'gross';
  const gross = v(x.amount), home = choice && gross !== null ? takeHomeOf(spine, rules, x.id) : null;
  const shown = basis === 'takeHome' ? home : gross;
  const set = (patch, words) => change((s) => setIncomeFirstPass(s, rules, x.id, patch, today), words);
  const often = x.type === 'w2' || x.type === 'tips' ? PAY_OFTEN : x.type === 'unemployment' ? [['weekly', 'A week'], ...ANY_OFTEN.filter(([k]) => k !== 'weekly')] : ANY_OFTEN;
  const options = often.some(([k]) => k === x.cadence) ? often : [[x.cadence, x.cadence], ...often];
  const hint = gross === null || !choice ? null : basis === 'takeHome' ? 'About ' + money(gross) + ' before tax' : home === null ? null : 'About ' + money(home) + ' take-home';
  return [
    cell('Name', textBox(rid('income', x.id, 'name'), x.label, name + ': name', (t) => change((s) => setAt(s, p, { ...getAt(s, p), label: t || 'Income' }), said.changed('Name', t || 'blank')), 'e.g. Acme Corp')),
    answerField({ id: rid('income', x.id, 'amount'), label: basis === 'takeHome' ? 'Take-home' : x.type === 'unemployment' ? 'Before tax' : 'Before tax', path: p + '.amount', fact: x.amount, value: shown, hint,
      onSet: (val, kind) => set({ amount: val, basis, kind }, said.changed(name + (basis === 'takeHome' ? ' take-home' : ' before tax'), amountWords(val, kind))) }),
    choice ? seg('Typed as', [['takeHome', 'Take-home'], ['gross', 'Before tax']], basis, (k) => { basisOf.set(x.id, k); refresh(); }) : null,
    cell('How often', pickBox(rid('income', x.id, 'often'), name + ': how often', options, x.cadence, (c) => set({ cadence: c }, said.changed(name + ' paid', (OFTEN_WORDS[c] || c).toLowerCase()))))
  ];
}
function expenseCells(spine, x, today) {
  const p = 'expenses.' + x.id, name = x.label || x.id;
  const kindNow = x.amount ? x.amount.kind : 'missing';
  const setAmount = (val, kind, cadence = x.cadence) => change((s) => {
    const n = editExpense(s, x.id, { amount: val, cadence, kind: kind === 'rough' ? 'rough' : 'known' }, today);
    return val === null && kind === 'notForMe' ? putFact(n, p + '.amount', null, 'notForMe', today) : n;
  }, said.changed(name, val === null ? (kind === 'notForMe' ? 'not for me' : 'blank') : money(val) + ' ' + (OFTEN_WORDS[cadence] || '').toLowerCase() + (kind === 'rough' ? ' (rough)' : '')));
  const need = v(x.need);
  return [
    cell('Name', textBox(rid('expenses', x.id, 'name'), x.label, name + ': name', (t) => change((s) => editExpense(s, x.id, { amount: v(x.amount), cadence: x.cadence, kind: kindNow === 'rough' ? 'rough' : 'known', label: t || x.label }, today), said.changed('Name', t || 'blank')), 'e.g. Rent')),
    answerField({ id: rid('expenses', x.id, 'amount'), label: 'Amount', path: p + '.amount', fact: x.amount, onSet: (val, kind) => setAmount(val, kind) }),
    cell('How often', pickBox(rid('expenses', x.id, 'often'), name + ': how often', ANY_OFTEN.some(([k]) => k === x.cadence) ? ANY_OFTEN : [[x.cadence, x.cadence], ...ANY_OFTEN], x.cadence, (c) => setAmount(v(x.amount), kindNow === 'rough' ? 'rough' : 'known', c))),
    seg('Need or want', [['need', 'Need'], ['want', 'Want']], need === true ? 'need' : need === false ? 'want' : null, (k) => change((s) => putFact(s, p + '.need', k === 'need', 'known', today), said.changed(name, k === 'need' ? 'a need' : 'a want')))
  ];
}

const CELLS = { debts: (spine, rules, x, today) => debtCells(spine, x, today), accounts: (spine, rules, x, today) => accountCells(spine, x, today), income: incomeCells, expenses: (spine, rules, x, today) => expenseCells(spine, x, today) };
export function itemRow({ spine, rules, collection, x, detail = null, today = todayIso(), tag = null }) {
  return h('li', { class: 'irow irow-' + collection, id: 'irow-' + x.id },
    h('div', { class: 'irow-cells' }, ...CELLS[collection](spine, rules, x, today).filter(Boolean), tag),
    rowButtons({ spine, collection, x, detail, today }));
}
// The rows of a collection, by type, each type with its count on its heading. only: just these group keys.
export function itemList({ spine, rules, collection, detail = null, today = todayIso(), only = null }) {
  return countsOf(spine, collection).filter((g) => g.n && (!only || only.includes(g.key))).map((g) => [
    h('h3', { class: 'part-h' }, g.label + ' · ' + g.n),
    h('ul', { class: 'irows' }, g.items.map((x) => itemRow({ spine, rules, collection, x, detail, today, tag: g.key === 'other' && x.type ? h('span', { class: 'pill' }, String(x.type).replace(/_/g, ' ')) : null })))
  ]);
}
// Expense rows for the lines given (a category's second pass).
export const expenseRows = ({ spine, rules, lines, detail = null, today = todayIso() }) => h('ul', { class: 'irows' }, lines.map((x) => itemRow({ spine, rules, collection: 'expenses', x, detail, today })));
