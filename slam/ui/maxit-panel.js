// "How much to max it?" (S-211): the panel under a tax-advantaged account in
// the Ledger and the summary card on the Plan page. Both only show what
// engine/maxit.js returns: the room for each open tax year side by side, the
// deadline in words, a lump sum, a month and a paycheck with the main one first
// (new money on top of what already goes in), the cash check, and Show the math
// on every number. Recording what went in is a small form that adds one entry to
// the account's contributions by year.

import { maxIt, maxItSim, maxItCash, longDay, jobsOf, paidThroughOf, paidThroughGuess } from '../engine/maxit.js';
import { FROM_PAY } from '../engine/contrib.js';
import { throughPayroll } from '../engine/schema.js';
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
const KIND_CHOICES = (type) => [['contribution', type === 'solo_k401' ? 'Employee deferrals (the total)' : 'Contributions (the total)'], ...(type === 'solo_k401' ? [['employer', 'Employer part (the total)']] : []), ...(type === 'roth_ira' ? [['from529', 'Rolled in from a 529 (counts)']] : []), ['rollover', 'A rollover (does not count)'], ...(['traditional_ira', 'roth_ira', 'spousal_ira'].includes(type) ? [['conversion', 'A conversion (does not count)']] : [])];
// "; the last one $483.30" when the last payment is what is left.
const lastWords = (last, per) => (last !== null && per !== null && Math.abs(last - per) > 0.005 ? '; the last one ' + cash(last) : '');
// A blank the row waits on that the Ledger can fill (not a rule).
const canFill = (path) => path && !path.startsWith('rule:');

// More than a paycheck holds (answer 53): the contribution to raise to, and what still cannot go in through payroll.
const raiseWords = (r) => { const p = r.paychecks; return p.raiseTo !== null && p.raiseTo !== undefined ? 'More than a paycheck holds: raise your contribution to ' + Math.round(p.raiseTo * 100) + '% of pay (about ' + cash(p.holds) + ' of each ' + cash(p.gross) + ' paycheck, all it can hold). About ' + cash(p.gap) + ' of the room still cannot go in through payroll by ' + longDay(r.deadline.date) + '.' : 'More than a paycheck holds: about ' + cash(p.landed) + ' lands from each one, so the ' + cash(p.extra) + ' more a paycheck cannot all go in through payroll by ' + longDay(r.deadline.date) + '.'; };
// A Roth and a pre-tax account that share a limit (answer 64): which one the Plan counts, and why.
const pickWords = (r) => (r.pick.countedId === r.accountId ? 'The Plan counts this one. ' : 'The Plan counts ' + r.pick.counted + ' instead (one limit). ') + r.pick.words;
// The main number first: for a payroll-only account the deferral to set a paycheck, for the rest the new money a month.
function mainOf(r) {
  const p = r.paychecks;
  if (!r.fillable) return { big: null, sub: 'Cannot be filled: no paycheck lands before ' + longDay(r.deadline.date) + ', and this account only takes money through payroll.' };
  if (r.toFill === 0 && r.main === 'paycheck' && (!p || !p.count)) return { big: null, sub: r.room > 0 ? 'What is set up already fills it: nothing more goes in.' : 'The ' + r.year + ' room is full: nothing more goes in.' };
  if (r.main === 'paycheck') {
    if (p && p.blank) return { big: null, sub: 'Missing: ' + p.blank.label + ' ' + p.blank.what + ', so the paychecks before ' + longDay(r.deadline.date) + ' cannot be counted.', blank: p.blank };
    if (p && p.multi && p.perLine) return { big: cash(p.perLine[0].per) + ' more a ' + p.perLine[0].line + ' paycheck', sub: p.perLine.map((l) => cash(l.per) + ' more on each of ' + plural(l.count, l.line + ' paycheck')).join(' and ') + ', to ' + longDay(r.deadline.date) + (p.tooBig ? ': all that lands from each, and still not all of it fits' : ': each in proportion to what lands from it, so none takes more than it holds') };
    if (!p || p.perPaycheck === null) return { big: null, sub: 'No paycheck lands before ' + longDay(r.deadline.date) + '.' };
    if (p.multi) return { big: cash(p.perPaycheck) + ' more a paycheck', sub: plural(p.count, 'paycheck') + ' from ' + p.streams.join(' and ') + ', to ' + longDay(r.deadline.date) + ': this much more on each paycheck than comes out of it now' + lastWords(p.last, p.perPaycheck) };
    return { big: cash(p.perPaycheck) + ' a paycheck', sub: plural(p.count, 'paycheck') + ' from ' + p.streams.join(' and ') + ', to ' + longDay(r.deadline.date) + (p.current ? ': set the deferral to this, ' + cash(p.extra) + ' more than the ' + cash(p.current) + ' that comes out now' : '') + lastWords(p.last, p.perPaycheck) };
  }
  if (r.perMonth === null) return { big: null, sub: '' };
  return { big: cash(r.perMonth) + ' a month', sub: plural(r.months.count, 'month') + ', one a month from today to ' + longDay(r.deadline.date) + (r.still.value > 0 ? ', on top of what already goes in' : '') + lastWords(r.months.last, r.perMonth) };
}

// The record form: the total that went in for a year so far (prefilled with what is counted now, the monthly guess
// included), or one rollover or conversion. Built when asked, like Duplicate's.
const TOTALS = ['contribution', 'employer'];
function recordButton(r, onRecord) {
  const btn = h('button', { type: 'button', class: 'btn small' }, 'Record what went in for ' + r.year);
  btn.addEventListener('click', () => {
    const id = 'rec-' + r.accountId + '-' + r.year;
    // The contribution total, without a 529 rolled in (that is counted on its own), and the employer part on its own.
    const now = r.record.total, events = r.record.events;
    const emp = r.record.employer;
    const amount = h('input', { id: id + '-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '500' });
    const kind = h('select', { id: id + '-kind' }, KIND_CHOICES(r.type).map(([v, w]) => h('option', { value: v }, w)));
    const label = h('label', { for: id + '-amount', class: 'edit-label' });
    const hint = h('p', { class: 'edit-hint' });
    const msg = h('p', { class: 'edit-msg', role: 'alert' });
    // A total replaces the year's figure; a rollover or a conversion is one more entry.
    const sync = () => {
      const total = TOTALS.includes(kind.value);
      label.textContent = total ? (kind.value === 'employer' ? 'Employer part in for ' + r.year + ' so far, in all' : 'Total in for ' + r.year + ' so far') : 'Amount of this ' + (kind.value === 'from529' ? '529 rollover' : kind.value);
      const start = kind.value === 'employer' ? emp : now;
      hint.textContent = total ? 'Everything that went in for ' + r.year + ', not just the last deposit. ' + (start ? 'It starts at what is counted now (' + cash(start) + (kind.value === 'contribution' && r.record.estimated ? ', a guess from the monthly amount' : '') + ').' : '') + (kind.value === 'contribution' && events ? ' The ' + cash(events) + ' rolled in from a 529 is counted on its own, not in this total.' : '') : (kind.value === 'from529' ? 'It counts against the limit.' : 'It is kept but never counts against the limit.');
      if (total && !amount.value) amount.value = start ? String(start) : '';
      amount.dataset.start = amount.value;
    };
    kind.addEventListener('change', () => { amount.value = ''; sync(); });
    const form = h('form', { class: 'confirm rec-form', onsubmit: (ev) => {
      ev.preventDefault();
      const p = parseInput('money', amount.value);
      const total = TOTALS.includes(kind.value);
      if (!p.ok || p.value === null || (total ? p.value < 0 : !(p.value > 0))) { msg.textContent = total ? 'The total so far, $0 or more, like 3000.' : 'An amount above $0, like 500.'; amount.focus(); return; }
      onRecord(r.accountId, r.year, p.value, kind.value);
    } }, label, amount, h('label', { for: id + '-kind', class: 'edit-label' }, 'What it was'), kind, hint, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'), h('button', { type: 'button', class: 'btn ghost', onclick: () => form.replaceWith(btn) }, 'Cancel')));
    sync();
    btn.replaceWith(form);
    amount.focus();
  });
  return btn;
}

// One tax year of one account.
function yearBlock(m, r, { onRecord = null } = {}) {
  const key = 'maxit:' + r.accountId + ':' + r.year + ':';
  const head = h('h3', {}, 'For ' + r.year + ', by ' + longDay(r.deadline.date), ' ', kindChip(r.kind));
  if (!r.applies) return h('div', { class: 'max-year card-tile' }, head, h('p', { class: 'muted' }, r.why));
  const record = onRecord ? recordButton(r, onRecord) : h('a', { class: 'tile-view', href: maxHref(r.accountId) }, 'Record what went in, in the Ledger ›');
  if (r.room === null) {
    const fill = [...(r.ei && r.ei.missing.length ? r.ei.missing : []), ...(r.missing || [])].find(canFill);
    return h('div', { class: 'max-year card-tile' }, head,
      h('p', { class: 'missing-row' }, cap1(r.missingLabel) + '.'),
      h('p', { class: 'tile-sub' }, r.why),
      fill ? h('a', { class: 'tile-view', href: ledgerHref(fill) }, 'Fill in ' + labelFor(m.spine, fill) + ' ›') : null,
      mathButton([key + 'room'], ctxFor(m)));
  }
  const main = mainOf(r);
  const p = r.paychecks;
  const c = r.fillable && r.lump > 0 && (r.perMonth || (p && p.extra)) ? cashFor(m, r.id) : null;
  const L = r.limit;
  const stillNames = [...new Map(r.still.parts.map((x) => [x.id, x])).values()];
  // A spouse's IRA shares the couple's pay, not a limit: it gets its own line, and the Plan's count when that is less.
  const ownShared = r.sharedWith.filter((n) => !(r.couple && r.couple.names.includes(n)));
  const kv = [
    ['Room left for ' + r.year, cash(r.room)],
    // All that is set to go in, when it is more than the room (the part past it is an excess, here or a spouse's).
    r.still.value > 0 || r.overSoon || r.still.soon > r.room ? ['Already set to go in', cash(r.overSoon || r.still.soon > r.room ? r.still.soon : r.still.value) + ' (' + stillNames.map((x) => (stillNames.length > 1 ? x.name + ' ' : '') + x.words).join('; ') + ')'] : null,
    r.lump !== null ? ['Lump sum today', cash(r.lump) + (r.still.value > 0 ? ' (new money)' : '')] : null,
    r.main === 'paycheck' ? (r.perMonth !== null ? ['A month', cash(r.perMonth) + ' more (' + plural(r.months.count, 'month') + ' with a paycheck' + lastWords(r.months.last, r.perMonth) + ')'] : null) : ['A paycheck', p && p.blank ? 'missing: ' + p.blank.label + ' ' + p.blank.what : p && p.perPaycheck !== null ? cash(p.perPaycheck) + ' (' + plural(p.count, 'paycheck') + lastWords(p.last, p.perPaycheck) + ')' : 'no paycheck before the deadline'],
    ['The limit', cash(L.value) + (L.words.length ? ', ' + L.words.join(', ') : '')],
    ['In for ' + r.year, r.contributed.parts.map((x) => (r.contributed.parts.length > 1 ? x.name + ': ' : '') + x.words).join('; ')],
    // A Solo 401(k)'s employer part is its own pool: it shows here too, so the room's drop is explained.
    r.type === 'solo_k401' && r.record.employer > 0 ? ['Employer part in for ' + r.year, cash(r.record.employer) + ' recorded (it counts against the employer share and the total)'] : null,
    // The cap shows only where it binds (earned income under the limit).
    r.cap && r.cap.label && r.type !== 'solo_k401' && r.type !== 'simple_ira' && r.cap.value < L.value ? ['Capped at', r.cap.label + ', ' + cash(r.cap.value)] : null,
    // The Roth limit line only inside or past the phase-out (under it, the cap is pay, shown above).
    r.phase && r.phase.lo != null && r.phase.magi > r.phase.lo ? ['Roth limit', cash(r.phase.limit) + ' at modified AGI of ' + cash(r.phase.magi)] : null,
    ownShared.length ? ['Shares its limit with', ownShared.join(', ')] : null,
    r.couple ? ['Shares the couple\'s pay', r.couple.words] : null,
    r.counted ? ['Counted in the Plan', cash(r.counted.fill) + ' (' + r.counted.words + ')'] : null,
    ['The deadline', r.deadline.when + '. ' + r.deadline.words + ' ' + VERIFY]
  ].filter(Boolean);
  return h('div', { class: 'max-year card-tile' }, head,
    main.big ? h('p', { class: 'max-big' }, main.big) : h('p', { class: 'missing-row' }, main.sub, main.blank ? [' ', h('a', { href: ledgerHref(main.blank.path) }, 'Fill it in')] : null),
    main.big ? h('p', { class: 'tile-sub' }, main.sub) : null,
    p && p.tooBig ? h('p', { class: 'tool-result bad' }, p.multi ? 'More than some paychecks hold: the ' + p.shortLines.join(' and ') + ' paychecks hold as little as about ' + cash(p.landed) + (p.holdsTotal !== null ? '; together the paychecks to ' + longDay(r.deadline.date) + ' hold about ' + cash(p.holdsTotal) : '') + ', so the ' + cash(p.extra) + ' more a paycheck cannot all go in through payroll.' : raiseWords(r)) : null,
    r.safe ? h('p', { class: 'tile-sub' }, r.safe) : null,
    r.employerOnly ? h('p', { class: 'tile-sub' }, r.employerOnly) : null,
    r.pick ? h('p', { class: 'tile-sub' }, pickWords(r)) : null,
    r.overWords ? h('p', { class: 'tool-result bad' }, r.overWords) : null,
    r.overSoonWords ? h('p', { class: 'tool-result bad' }, r.overSoonWords) : null,
    r.aboveCap ? h('p', { class: 'tile-sub' }, cash(r.aboveCap) + ' is above the New York deduction cap: that part is not deductible (it can stay in the 529).') : null,
    h('dl', { class: 'kv' }, ...kv.flatMap(([k, val]) => [h('dt', {}, k), h('dd', { class: /^[$-]/.test(val) ? '' : 'words' }, val)])),
    h('div', { class: 'edit-actions' }, record),
    c ? h('p', { class: 'tool-result' + (c.breaks ? ' bad' : '') }, h('strong', {}, 'Against cash: '), c.words) : null,
    mathButton([key + 'room', ...(r.lump !== null ? [key + 'lump'] : []), ...(r.perMonth !== null ? [key + 'month'] : []), ...(p && (p.perPaycheck !== null || p.perLine) && r.fillable ? [key + 'paycheck'] : []), ...(p && p.raiseTo !== null && p.raiseTo !== undefined ? [key + 'raise'] : []), ...(c ? [key + 'low', ...(c.measurable ? [key + 'payoff'] : [])] : [])], ctxFor(m)));
}

// How the account is filled (S-227): an HSA's small "through payroll" switch, off by default (answer 47: from take-home),
// and a 401(k)-style plan's "paid through" job, the sponsoring one by default (answer 60). Each saves at once.
function howFilled(spine, a, { onPayroll = null, onPaidThrough = null } = {}) {
  if (a.type === 'hsa' && onPayroll) {
    const on = throughPayroll(a);
    const sw = h('button', { type: 'button', class: 'switch', role: 'switch', id: 'payroll-' + a.id, 'aria-checked': String(on), 'aria-labelledby': 'payroll-l-' + a.id, onclick: () => onPayroll(a.id, !on) },
      h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-knob' })), h('span', { class: 'switch-state' }, on ? 'Yes' : 'No'));
    return h('div', {}, h('div', { class: 'switch-row' }, h('span', { id: 'payroll-l-' + a.id, class: 'edit-label' }, 'Through payroll'), sw),
      h('p', { class: 'edit-hint' }, on ? 'It comes out of the paycheck before tax, so it lowers the pay that is taxed and its Social Security and Medicare.' : 'Off: money goes in from take-home (the default) and is deducted on the return. Turn it on if it comes out of your paycheck.'));
  }
  const jobs = FROM_PAY.includes(a.type) && a.family === 'employerRetirement' && onPaidThrough ? jobsOf(spine, a) : [];
  if (jobs.length < 2) return null;
  const cur = paidThroughOf(spine, a), guess = paidThroughGuess(spine, a);
  const sel = h('select', { id: 'paid-through-' + a.id, onchange: (e) => onPaidThrough(a.id, e.target.value) }, jobs.map((s) => h('option', { value: s.id, selected: !!cur && cur.id === s.id }, s.label)));
  return h('div', { class: 'tool-form' }, h('label', { for: 'paid-through-' + a.id, class: 'edit-label' }, 'Paid through'), sel,
    h('p', { class: 'edit-hint' }, guess ? 'A guess: the job that pays the most. Choose the job whose employer offers this plan; only its paychecks fill it.' : 'Only this job\'s paychecks fill it.'));
}

// The panel under one account in the Ledger.
export function maxItPanel(spine, rules, accountId, opts = {}) {
  const m = maxItFor(spine, rules);
  const acc = m.mx.accounts.find((x) => x.id === accountId);
  if (!acc) return null;
  const a = (spine.accounts || []).find((x) => x.id === accountId);
  return h('section', { class: 'max-panel', id: 'max-' + accountId, 'aria-labelledby': 'max-h-' + accountId },
    h('h3', { id: 'max-h-' + accountId, class: 'max-title' }, 'How much to max ' + acc.name),
    a ? howFilled(spine, a, opts) : null,
    acc.rows.length > 1 && m.mx.window.words ? h('p', { class: 'max-window' }, m.mx.window.words) : null,
    h('div', { class: 'max-years' + (acc.rows.length > 1 ? ' two' : '') }, acc.rows.map((r) => yearBlock(m, r, opts))));
}

// The Plan page's one card: every account and open year, the new money a month as deadlines pass, and the cash check
// for all of it together.
export function maxItCard(spine, rules) {
  const m = maxItFor(spine, rules);
  const rows = m.mx.rows;
  const T = m.mx.totals;
  const title = h('h2', { id: 'maxit-h' }, 'How much to max it ', h('span', { class: 'count' }, String(m.mx.accounts.length)));
  if (!rows.length) return h('section', { class: 'card', id: 'maxit', 'aria-labelledby': 'maxit-h' }, title, h('p', { class: 'muted' }, 'No 401(k), IRA, HSA, SEP or 529 in the Ledger yet. Add one under Assets to see how much room each has and by when.'), h('a', { class: 'tile-view', href: 'ledger.html' }, 'Open the Ledger ›'));
  const all = m.mx.pools.length && T.lump > 0 ? cashFor(m, 'all') : null;
  const firstMissing = rows.find((r) => r.applies && !r.passed && (r.room === null || r.blankLabel));
  const line = (r) => {
    const main = r.applies && r.room !== null ? mainOf(r) : null;
    const last = !main || !main.big ? '' : r.main === 'paycheck' ? lastWords(r.paychecks.last, r.paychecks.perPaycheck) : lastWords(r.months.last, r.perMonth);
    // A spouse's IRA: the couple's pay they share; any account: what the Plan counts when that is less than it alone.
    return h('li', { class: 'max-row' },
      h('a', { class: 'max-name', href: maxHref(r.accountId) }, r.name + ', ' + r.year + ' ›'),
      !r.applies ? h('span', { class: 'muted' }, r.why)
        : r.room === null ? h('span', { class: 'missing-row' }, cap1(r.missingLabel))
          : main.big ? h('span', { class: 'max-main' }, main.big + last) : h('span', { class: 'missing-row' }, main.sub),
      r.couple || r.counted ? h('span', { class: 'tile-sub' }, [r.couple ? r.couple.words : null, r.counted ? 'Counted in the Plan: ' + cash(r.counted.fill) + ' (' + r.counted.words + ').' : null].filter(Boolean).join(' ')) : null,
      r.applies && r.room !== null ? h('span', { class: 'tile-sub' }, cash(r.room) + ' of room, by ' + longDay(r.deadline.date) + (r.still.value > 0 ? ', ' + cash(r.still.value) + ' of it already set to go in' : '') + (r.sharedWith.length ? ', shared with ' + r.sharedWith.join(', ') : ''), ' ', kindChip(r.kind)) : null,
      r.paychecks && r.paychecks.tooBig ? h('span', { class: 'missing-row' }, r.paychecks.multi && r.paychecks.holdsTotal !== null ? 'More than the paychecks hold (about ' + cash(r.paychecks.holdsTotal) + ' lands from them together)' : r.paychecks.raiseTo !== null && r.paychecks.raiseTo !== undefined ? 'More than a paycheck holds: raise your contribution to ' + Math.round(r.paychecks.raiseTo * 100) + '% of pay' : 'More than a paycheck holds (about ' + cash(r.paychecks.landed) + ' lands)') : null,
      r.safe || r.employerOnly || r.pick ? h('span', { class: 'tile-sub' }, [r.safe ? 'Safe amount, could be higher.' : null, r.employerOnly, r.pick ? pickWords(r) : null].filter(Boolean).join(' ')) : null,
      r.over ? h('span', { class: 'missing-row' }, 'Over the limit by ' + cash(r.over) + (r.overByYearEnd ? ', ' + cash(r.overByYearEnd) + ' by December 31 if nothing changes' : '')) : r.overSoon ? h('span', { class: 'missing-row' }, 'Set to go over the limit by ' + cash(r.overSoon)) : null);
  };
  const leftOut = [T.missing.length ? plural(T.missing.length, 'account year') + ' missing' : null, T.unfillable.length ? plural(T.unfillable.length, 'account year') + ' that cannot be filled' : null, T.short.length ? 'the part of ' + plural(T.short.length, 'payroll account') + ' more than a paycheck holds' : null, (T.noMonth || []).length ? plural(T.noMonth.length, 'account year') + ' with no dates to put it in' : null].filter(Boolean);
  const steps = T.steps || [];
  return h('section', { class: 'card', id: 'maxit', 'aria-labelledby': 'maxit-h' }, title,
    h('p', { class: 'muted' }, 'Each tax-advantaged account: the year\'s limit and catch-up, less what is in, is the room left, filled by its deadline with new money on top of what already goes in. A 401(k) fills through pay, so it reads a paycheck; the rest read a month. Tap one to see it in the Ledger.'),
    m.mx.pools.length && steps.length ? h('p', { class: 'max-big' }, cash(steps[0].perMonth) + ' a month')
      : h('p', { class: 'max-big missing-text' }, firstMissing ? cap1(firstMissing.missingLabel || firstMissing.blankLabel) : m.mx.pools.length && T.lump === 0 && !leftOut.length ? 'What already goes in fills it' : 'Nothing more can go in before the deadlines'),
    m.mx.pools.length && steps.length ? h('p', { class: 'tile-sub' }, 'to ' + longDay(steps[0].until) + steps.slice(1).map((s) => ', then ' + cash(s.perMonth) + ' a month to ' + longDay(s.until)).join('') + ' (' + cash(T.lump) + ' of new money in all; a limit two accounts share counts once)' + (leftOut.length ? '; not counted: ' + leftOut.join(' and ') : '') + '.')
      : leftOut.length && !firstMissing ? h('p', { class: 'tile-sub' }, 'Not counted: ' + leftOut.join(' and ') + '.') : null,
    m.mx.window.words ? h('p', { class: 'max-window' }, m.mx.window.words) : null,
    h('ul', { class: 'max-list' }, rows.map(line)),
    all ? h('p', { class: 'tool-result' + (all.breaks ? ' bad' : '') }, h('strong', {}, 'All of it against cash: '), all.words) : null,
    h('p', { class: 'tile-note' }, kindChip(m.mx.kind), ' The deadlines have not been checked against the IRS yet.'),
    mathButton([...(m.mx.pools.length ? ['maxit:all:month', 'maxit:all:lump'] : []), ...(all ? ['maxit:all:low', ...(all.measurable ? ['maxit:all:payoff'] : [])] : []), ...rows.filter((r) => r.applies).map((r) => 'maxit:' + r.accountId + ':' + r.year + ':room')], ctxFor(m)));
}
