// "How much to max it?" (S-211): the panel under a tax-advantaged account in
// the Ledger and the summary card on the Plan page. Both only show what
// engine/maxit.js returns: the room for each open tax year side by side, the
// deadline in words, a lump sum, a month and a paycheck with the main one first,
// the cash check, and Show the math on every number. Recording what went in is a
// small form that adds one entry to the account's contributions by year.

import { maxIt, maxItSim, maxItCash, longDay } from '../engine/maxit.js';
import { labelFor } from '../engine/labels.js';
import { parseInput } from '../engine/edits.js';
import { mathButton } from './math-panel.js';
import { h, chip, money, ledgerHref } from './view.js';

// One run and one result per household (the spine object), so a re-render costs nothing.
let memo = { spine: null, rules: null };
export function maxItFor(spine, rules) {
  if (memo.spine !== spine || memo.rules !== rules) { const sim = maxItSim(spine, rules); memo = { spine, rules, sim, mx: maxIt(spine, rules, { sim }), cash: new Map() }; }
  return memo;
}
const cashFor = (m, key) => { if (!m.cash.has(key)) m.cash.set(key, maxItCash(m.spine, m.rules, m.mx, { sim: m.sim, rows: key === 'all' ? null : m.mx.rows.filter((r) => r.id === key) })); return m.cash.get(key); };
const ctxFor = (m) => () => ({ spine: m.spine, rules: m.rules, maxit: m.mx, maxitCash: (key) => cashFor(m, key) });
// Whole dollars as whole dollars, anything else to the cent.
const cash = (x) => money(x, !Number.isInteger(x));
const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// The Ledger link that opens an account's panel (the hash the Ledger reads).
export const maxHref = (accountId) => 'ledger.html#' + encodeURIComponent('max:' + accountId);
const VERIFY = 'This date has not been checked against the IRS yet.';
// What a recorded amount can be, by account: rollovers and conversions never count against the limit.
const KIND_CHOICES = (type) => [['contribution', type === 'solo_k401' ? 'Employee deferral' : 'A contribution'], ...(type === 'solo_k401' ? [['employer', 'Employer part']] : []), ...(type === 'roth_ira' ? [['from529', 'Rolled in from a 529 (counts)']] : []), ['rollover', 'A rollover (does not count)'], ...(['traditional_ira', 'roth_ira', 'spousal_ira'].includes(type) ? [['conversion', 'A conversion (does not count)']] : [])];

// The main number first: a paycheck for payroll-only accounts, a month for the rest.
function mainOf(r) {
  const p = r.paychecks;
  if (!r.fillable) return { big: null, sub: 'Cannot be filled: no paycheck lands before ' + longDay(r.deadline.date) + ', and this account only takes money through payroll.' };
  if (r.main === 'paycheck') return p && p.perPaycheck !== null ? { big: cash(p.perPaycheck) + ' a paycheck', sub: plural(p.count, 'paycheck') + ' from ' + p.streams.join(' and ') + ', to ' + longDay(r.deadline.date) } : { big: null, sub: 'No paycheck lands before ' + longDay(r.deadline.date) + '.' };
  return r.perMonth !== null ? { big: cash(r.perMonth) + ' a month', sub: plural(r.months.count, 'month') + ', one a month from today to ' + longDay(r.deadline.date) } : { big: null, sub: '' };
}

// The record form: what went in for a year, and what kind of money it was. Built when asked, like Duplicate's.
function recordButton(r, onRecord) {
  const btn = h('button', { type: 'button', class: 'btn small' }, 'Record what went in for ' + r.year);
  btn.addEventListener('click', () => {
    const id = 'rec-' + r.accountId + '-' + r.year;
    const amount = h('input', { id: id + '-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '500' });
    const kind = h('select', { id: id + '-kind' }, KIND_CHOICES(r.type).map(([v, w]) => h('option', { value: v }, w)));
    const msg = h('p', { class: 'edit-msg', role: 'alert' });
    const form = h('form', { class: 'confirm rec-form', onsubmit: (ev) => {
      ev.preventDefault();
      const p = parseInput('money', amount.value);
      if (!p.ok || !(p.value > 0)) { msg.textContent = 'An amount above $0, like 500.'; amount.focus(); return; }
      onRecord(r.accountId, r.year, p.value, kind.value);
    } },
      h('label', { for: id + '-amount', class: 'edit-label' }, 'What went in for ' + r.year), amount,
      h('label', { for: id + '-kind', class: 'edit-label' }, 'What it was'), kind,
      h('p', { class: 'edit-hint' }, 'One deposit, or the total so far. It is added to the account\'s contributions by year; a rollover or a conversion is kept but never counts against the limit.'),
      msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'), h('button', { type: 'button', class: 'btn ghost', onclick: () => form.replaceWith(btn) }, 'Cancel')));
    btn.replaceWith(form);
    amount.focus();
  });
  return btn;
}

// One tax year of one account.
function yearBlock(m, r, { onRecord = null } = {}) {
  const key = 'maxit:' + r.accountId + ':' + r.year + ':';
  const head = h('h3', {}, 'For ' + r.year + ', by ' + longDay(r.deadline.date), ' ', kindChip(r.kind));
  if (!r.applies) return h('div', { class: 'max-year card-tile' }, head, h('p', { class: r.missingLabel ? 'missing-row' : 'muted' }, r.why), r.missingLabel && r.missing.length ? h('a', { class: 'tile-view', href: ledgerHref(r.missing[0]) }, 'Fill in ' + labelFor(m.spine, r.missing[0]) + ' ›') : null);
  const record = onRecord ? recordButton(r, onRecord) : h('a', { class: 'tile-view', href: maxHref(r.accountId) }, 'Record what went in, in the Ledger ›');
  if (r.room === null) {
    const fill = r.ei && r.ei.missing.length ? r.ei.missing[0] : (r.missing || [])[0];
    return h('div', { class: 'max-year card-tile' }, head,
      h('p', { class: 'missing-row' }, cap1(r.missingLabel) + '.'),
      h('p', { class: 'tile-sub' }, r.why),
      fill ? h('a', { class: 'tile-view', href: ledgerHref(fill) }, 'Fill in ' + labelFor(m.spine, fill) + ' ›') : null,
      mathButton([key + 'room'], ctxFor(m)));
  }
  const main = mainOf(r);
  const p = r.paychecks;
  const c = r.fillable && r.room > 0 && r.perMonth ? cashFor(m, r.id) : null;
  const L = r.limit;
  const kv = [
    ['Room left for ' + r.year, cash(r.room)],
    r.lump !== null ? ['Lump sum today', cash(r.lump)] : null,
    r.main === 'paycheck' ? (r.perMonth !== null ? ['A month', cash(r.perMonth) + ' (' + plural(r.months.count, 'month') + ' with a paycheck)'] : null) : ['A paycheck', p && p.perPaycheck !== null ? cash(p.perPaycheck) + ' (' + plural(p.count, 'paycheck') + ')' : 'no paycheck before the deadline'],
    ['The limit', cash(L.value) + (L.words.length ? ', ' + L.words.join(', ') : '')],
    ['In for ' + r.year, r.contributed.parts.map((x) => (r.contributed.parts.length > 1 ? x.name + ': ' : '') + x.words).join('; ')],
    // The cap shows only where it binds (earned income under the limit, or the 401(k) limit a SIMPLE shares).
    r.cap && r.cap.label && r.type !== 'solo_k401' && r.cap.value < L.value ? ['Capped at', r.cap.label + ', ' + cash(r.cap.value)] : null,
    r.sharedWith.length ? ['Shares its limit with', r.sharedWith.join(', ')] : null,
    ['The deadline', r.deadline.when + '. ' + r.deadline.words + ' ' + VERIFY]
  ].filter(Boolean);
  return h('div', { class: 'max-year card-tile' }, head,
    main.big ? h('p', { class: 'max-big' }, main.big) : h('p', { class: 'missing-row' }, main.sub),
    main.big ? h('p', { class: 'tile-sub' }, main.sub) : null,
    p && p.tooBig ? h('p', { class: 'tool-result bad' }, 'More than a paycheck holds: about ' + cash(p.holds) + ' lands from each one, so the room cannot all go in through payroll by ' + longDay(r.deadline.date) + '.') : null,
    p && p.blank && r.main === 'paycheck' ? h('p', { class: 'missing-row' }, 'Missing: ' + p.blank.label + ' amount, so whether it fits in a paycheck cannot be checked. ', h('a', { href: ledgerHref(p.blank.path) }, 'Fill it in')) : null,
    r.over ? h('p', { class: 'tool-result bad' }, 'Over the ' + r.year + ' limit by ' + cash(r.over) + ': an excess contribution. Take it out, with what it earned, by the deadline to avoid the 6% tax on it.') : null,
    h('dl', { class: 'kv' }, ...kv.flatMap(([k, val]) => [h('dt', {}, k), h('dd', { class: /^[$-]/.test(val) ? '' : 'words' }, val)])),
    h('div', { class: 'edit-actions' }, record),
    c ? h('p', { class: 'tool-result' + (c.breaks ? ' bad' : '') }, h('strong', {}, 'Against cash: '), c.words) : null,
    mathButton([key + 'room', ...(r.lump !== null ? [key + 'lump'] : []), ...(r.perMonth !== null ? [key + 'month'] : []), ...(p && p.perPaycheck !== null && r.fillable ? [key + 'paycheck'] : []), ...(c ? [key + 'low', ...(c.measurable ? [key + 'payoff'] : [])] : [])], ctxFor(m)));
}

// The panel under one account in the Ledger.
export function maxItPanel(spine, rules, accountId, opts = {}) {
  const m = maxItFor(spine, rules);
  const acc = m.mx.accounts.find((x) => x.id === accountId);
  if (!acc) return null;
  return h('section', { class: 'max-panel', id: 'max-' + accountId, 'aria-labelledby': 'max-h-' + accountId },
    h('h3', { id: 'max-h-' + accountId, class: 'max-title' }, 'How much to max ' + acc.name),
    acc.rows.length > 1 && m.mx.window.words ? h('p', { class: 'max-window' }, m.mx.window.words) : null,
    h('div', { class: 'max-years' + (acc.rows.length > 1 ? ' two' : '') }, acc.rows.map((r) => yearBlock(m, r, opts))));
}

// The Plan page's one card: every account and open year, the total a month, and the cash check for all of them together.
export function maxItCard(spine, rules) {
  const m = maxItFor(spine, rules);
  const rows = m.mx.rows;
  const T = m.mx.totals;
  const title = h('h2', { id: 'maxit-h' }, 'How much to max it ', h('span', { class: 'count' }, String(m.mx.accounts.length)));
  if (!rows.length) return h('section', { class: 'card', id: 'maxit', 'aria-labelledby': 'maxit-h' }, title, h('p', { class: 'muted' }, 'No 401(k), IRA, HSA, SEP or 529 in the Ledger yet. Add one under Assets to see how much room each has and by when.'), h('a', { class: 'tile-view', href: 'ledger.html' }, 'Open the Ledger ›'));
  const all = m.mx.pools.length && T.perMonth > 0 ? cashFor(m, 'all') : null;
  const firstMissing = rows.find((r) => r.applies && r.room === null);
  const line = (r) => {
    const main = r.applies && r.room !== null ? mainOf(r) : null;
    return h('li', { class: 'max-row' },
      h('a', { class: 'max-name', href: maxHref(r.accountId) }, r.name + ', ' + r.year + ' ›'),
      !r.applies ? h('span', { class: 'muted' }, r.why)
        : r.room === null ? h('span', { class: 'missing-row' }, cap1(r.missingLabel))
          : main.big ? h('span', { class: 'max-main' }, main.big) : h('span', { class: 'missing-row' }, main.sub),
      r.applies && r.room !== null ? h('span', { class: 'tile-sub' }, cash(r.room) + ' of room, by ' + longDay(r.deadline.date) + (r.sharedWith.length ? ', shared with ' + r.sharedWith.join(', ') : ''), ' ', kindChip(r.kind)) : null,
      r.paychecks && r.paychecks.tooBig ? h('span', { class: 'missing-row' }, 'More than a paycheck holds (about ' + cash(r.paychecks.holds) + ' lands)') : null,
      r.over ? h('span', { class: 'missing-row' }, 'Over the limit by ' + cash(r.over)) : null);
  };
  const leftOut = [T.missing.length ? plural(T.missing.length, 'account year') + ' missing' : null, T.unfillable.length ? plural(T.unfillable.length, 'account year') + ' that cannot be filled' : null].filter(Boolean);
  return h('section', { class: 'card', id: 'maxit', 'aria-labelledby': 'maxit-h' }, title,
    h('p', { class: 'muted' }, 'Each tax-advantaged account: the year\'s limit and catch-up, less what is in, is the room left, filled by its deadline. A 401(k) fills through pay, so it reads a paycheck; the rest read a month. Tap one to see it in the Ledger.'),
    m.mx.pools.length ? h('p', { class: 'max-big' }, money(T.perMonth) + ' a month')
      : h('p', { class: 'max-big missing-text' }, firstMissing ? cap1(firstMissing.missingLabel) : 'Nothing can go in before the deadlines'),
    m.mx.pools.length ? h('p', { class: 'tile-sub' }, 'each account to its own deadline (' + cash(T.lump) + ' of room in all; a limit two accounts share counts once)' + (leftOut.length ? '; not counted: ' + leftOut.join(' and ') : '') + '.') : null,
    m.mx.window.words ? h('p', { class: 'max-window' }, m.mx.window.words) : null,
    h('ul', { class: 'max-list' }, rows.map(line)),
    all ? h('p', { class: 'tool-result' + (all.breaks ? ' bad' : '') }, h('strong', {}, 'All of it against cash: '), all.words) : null,
    h('p', { class: 'tile-note' }, kindChip(m.mx.kind), ' The deadlines have not been checked against the IRS yet.'),
    mathButton([...(m.mx.pools.length ? ['maxit:all:month', 'maxit:all:lump'] : []), ...(all ? ['maxit:all:low', ...(all.measurable ? ['maxit:all:payoff'] : [])] : []), ...rows.filter((r) => r.applies).map((r) => 'maxit:' + r.accountId + ':' + r.year + ':room')], ctxFor(m)));
}
