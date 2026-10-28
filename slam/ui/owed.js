// Owed to you (shared bills brief): My numbers, under Assets. One row per person, totaled across every bill they
// share and money lent to them; each person's screen lists what they owe, oldest first, with Mark paid per line and
// Settled up for all of it. Mark paid asks how much (the full amount filled in) and which account it lands in; the
// rest stays owed. Every change goes through change() in words, so Undo works. Formatting only: engine/owed.js.
// LIVE-FORM: the Mark paid and Add money I lent forms are built when opened; a saved change closes them.

import { change, refresh } from './shell.js';
import { owedToYou, owedTotal, owedLeft, markPaid, repayLent, settleUp, addLent, setLentKind, sharerNames, arrangementOf, personStatus, askMessage } from '../engine/owed.js';
import { parseInput, inputText } from '../engine/edits.js';
import { valueOf as v } from '../engine/spine.js';
import { h, money, shortDate, todayIso } from './view.js';
import { dateBox } from './understood.js';

let openPay = null, adding = false;
const cashAccounts = (spine) => (spine.accounts || []).filter((a) => a.family === 'cash');
export const personSlug = (key) => 'p-' + String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const since = (iso) => MONTHS[+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8, 10);

// The Assets group row's figure: the total owed, or "none".
export function owedFigure(spine) {
  const all = owedToYou(spine), total = owedTotal(spine, spine.meta.asOf);
  return total ? h('span', {}, h('span', { class: 'go-total' }, money(total)), ' from ' + all.length + (all.length === 1 ? ' person' : ' people')) : h('span', { class: 'muted' }, 'none');
}

// The list: a row per person, the page's Show the math (math), then Add money I lent.
export function owedScreen(spine, { href, math = null }) {
  const all = owedToYou(spine);
  return [
    all.length ? h('ul', { class: 'go-list', 'aria-label': 'People who owe you' }, all.map((p) => h('li', {}, h('a', { class: 'go-row plain', href: href(personSlug(p.key)) },
      h('span', { class: 'go-name' }, p.name),
      h('span', { class: 'go-sub' }, h('span', { class: 'go-total' }, money(p.total)), ' since ' + since(p.lines[0].since)))))) : h('p', { class: 'muted' }, 'Nobody owes you anything right now.'),
    h('p', { class: 'muted owed-note' }, 'Counted in net worth, never as cash, until it is paid and lands in an account.'),
    math,
    lentForm(spine)
  ];
}

// One person: what they owe in total, bill by bill and loan by loan, oldest first.
export function personScreen(spine, slug) {
  const p = owedToYou(spine).find((x) => personSlug(x.key) === slug);
  if (!p) return [h('p', { class: 'muted' }, 'Nothing owed here any more.'), h('a', { class: 'btn', href: '#/assets/owed-to-you' }, 'Back to Owed to you')];
  const today = todayIso();
  return [
    h('section', { class: 'card', 'aria-label': p.name + ' owes you' },
      h('p', { class: 'tile-label' }, 'Owes you'), h('p', { class: 'tile-value' }, money(p.total)),
      h('ul', { class: 'owed-lines' }, p.lines.map((l) => lineEl(spine, p, l, today))),
      openPay === 'all:' + p.key ? payForm(spine, p.total, (amount, into) => change((s) => settleUp(s, p.name, { today, into }), p.name + ' settled up: ' + money(amount) + (into ? ' into ' + accountName(spine, into) : ''))) : null,
      h('div', { class: 'edit-actions' }, openPay === 'all:' + p.key ? null : h('button', { type: 'button', class: 'btn primary', onclick: () => { openPay = 'all:' + p.key; refresh(); } }, 'Settled up')))
  ];
}
const accountName = (spine, id) => { const a = (spine.accounts || []).find((x) => x.id === id); return a ? v(a.name) || id : id; };

function lineEl(spine, p, l, today) {
  const key = l.kind + ':' + (l.expenseId || l.lentId) + ':' + (l.personId || '');
  const isOpen = openPay === key;
  const pay = (amount, into) => change((s) => (l.kind === 'bill' ? markPaid(s, l.expenseId, l.personId, amount, { today, into }) : repayLent(s, l.lentId, amount, { today, into })),
    p.name + ' paid ' + money(amount) + ' for ' + l.label + (owedLeft(l.amount, amount) ? '; ' + money(owedLeft(l.amount, amount)) + ' still owed' : '') + (into ? ', into ' + accountName(spine, into) : ''));
  // A bill line can copy the friendly ask; a loan can turn into a gift (Undo brings it back).
  let ask = null;
  if (l.kind === 'bill') {
    const e = spine.expenses.find((x) => x.id === l.expenseId), arr = arrangementOf(spine, e), who = arr.people.find((x) => x.id === l.personId);
    const msg = askMessage(e, who, personStatus(spine, e, arr, who, spine.meta.asOf));
    ask = h('button', { type: 'button', class: 'btn small', onclick: async (ev) => { try { await navigator.clipboard.writeText(msg); ev.target.textContent = 'Copied'; } catch { ev.target.textContent = 'Could not copy'; } } }, 'Copy message');
  }
  return h('li', { class: 'owed-line' },
    h('div', { class: 'owed-head' }, h('span', { class: 'owed-what' }, l.kind === 'loan' ? 'Loan' : l.label), h('span', { class: 'owed-amt' }, money(l.amount))),
    h('p', { class: 'owed-sub' }, l.kind === 'bill' ? (l.status || 'Since ' + shortDate(l.since)) + (l.askOn ? '. Ask on ' + shortDate(l.askOn) : '') : 'Lent ' + shortDate(l.since) + (l.due ? '. Said they would pay by ' + shortDate(l.due) : '')),
    isOpen ? payForm(spine, l.amount, pay) : h('div', { class: 'owed-actions' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { openPay = key; refresh(); } }, 'Mark paid'),
      ask,
      l.kind === 'loan' ? h('button', { type: 'button', class: 'btn small', onclick: () => change((s) => setLentKind(s, l.lentId, 'gift'), 'The ' + money(l.amount) + ' to ' + p.name + ' is now a gift, so nothing is owed') }, 'It was a gift') : null));
}

// How much was paid (the full amount filled in) and the account it lands in.
function payForm(spine, full, onSave) {
  const amt = h('input', { id: 'pay-amt', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  amt.value = inputText('money', full);
  const into = h('select', { id: 'pay-into' }, h('option', { value: '' }, 'Not in an account yet'), cashAccounts(spine).map((a, i) => h('option', { value: a.id, selected: i === 0 }, v(a.name) || a.id)));
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  return h('form', { class: 'editor pay-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const p = parseInput('money', amt.value);
    if (!p.ok || !(p.value > 0)) { msg.textContent = 'How much was paid: an amount above $0'; amt.focus(); return; }
    if (p.value > full + 0.004) { msg.textContent = 'That is more than is owed (' + money(full) + ')'; amt.focus(); return; }
    openPay = null; onSave(p.value, into.value || null);
  } },
    h('div', { class: 'share-pair' },
      h('div', { class: 'share-field' }, h('label', { for: 'pay-amt', class: 'edit-label' }, 'How much'), amt),
      h('div', { class: 'share-field' }, h('label', { for: 'pay-into', class: 'edit-label' }, 'Landed in'), into)),
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'), h('button', { type: 'button', class: 'btn', onclick: () => { openPay = null; refresh(); } }, 'Cancel')));
}

// "+ Add money I lent": person, amount, date, when they said they would pay, loan or gift.
function lentForm(spine) {
  if (!adding) return h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn add', onclick: () => { adding = true; refresh(); requestAnimationFrame(() => document.getElementById('lent-who')?.focus({ preventScroll: true })); } }, '+ Add money I lent'));
  const who = h('input', { id: 'lent-who', type: 'text', list: 'lent-names', autocomplete: 'off', maxlength: '40', placeholder: 'e.g. Jordan' });
  const amt = h('input', { id: 'lent-amt', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 150' });
  let dateIso = todayIso(), dueIso = '';
  const date = dateBox('lent-date', dateIso, (v) => { dateIso = v; }, {}, { past: true });
  const due = dateBox('lent-due', '', (v) => { dueIso = v; }, { placeholder: 'e.g. Dec 6' });
  const gift = h('input', { type: 'checkbox', id: 'lent-gift' });
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const field = (label, input, hint) => h('div', { class: 'share-field' }, h('label', { for: input.id, class: 'edit-label' }, label), input, hint ? h('p', { class: 'edit-hint' }, hint) : null);
  return h('form', { class: 'card editor lent-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const name = who.value.trim();
    if (!name) { msg.textContent = 'Who did you lend it to?'; who.focus(); return; }
    const p = parseInput('money', amt.value);
    if (!p.ok || !(p.value > 0)) { msg.textContent = 'How much: an amount above $0'; amt.focus(); return; }
    if (!dateIso) { msg.textContent = date.value.trim() ? 'When: type a date like Dec 6' : 'When: pick the day'; date.focus(); return; }
    if (due.value.trim() && !dueIso) { msg.textContent = 'When they said they would pay: type a date like Dec 6'; due.focus(); return; }
    adding = false;
    change((s) => addLent(s, { person: name, amount: p.value, date: dateIso, due: dueIso || null, kind: gift.checked ? 'gift' : 'loan' }, todayIso()), money(p.value) + (gift.checked ? ' given to ' : ' lent to ') + name);
  } },
    h('h2', {}, 'Money I lent'),
    h('datalist', { id: 'lent-names' }, sharerNames(spine).map((n) => h('option', { value: n }))),
    h('div', { class: 'share-pair' }, field('Who', who), field('How much', amt)),
    h('div', { class: 'share-pair' }, field('When', date), field('When they said they would pay', due, 'Optional')),
    h('label', { class: 'tick-chip', for: 'lent-gift' }, gift, h('span', {}, 'It is a gift, not a loan')),
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add'), h('button', { type: 'button', class: 'btn', onclick: () => { adding = false; refresh(); } }, 'Cancel')));
}
export const resetOwedForms = () => { openPay = null; adding = false; };
