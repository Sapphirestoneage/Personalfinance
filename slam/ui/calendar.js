// The cash flow calendar (S-200, S-203, S-204, S-209), on the shell (S-230): every view is a reading of the
// household's own dates and the day-by-day run. The shell draws the tabs, the header with Undo and Redo, Back and
// the trail, and the bar; every change goes through its change() with words ("Rent moved to Nov 3, 2026").
// Screen by screen: calendar.html is the month (one time picker shared with Spending; views for the month grid, the
// weeks, the next 14 days, each paycheck, the year and the debts; "Sometime this month"; maybe money; milestones;
// search). #/<day> is one day, #/<day>/<item> one item with its actions (it happened, move, skip, a different amount
// this time, lock); an item that cannot move says why. An item also moves by dragging its grip onto a day: one
// change, so one Undo. What the month screen has open (the month, the view, the time picker, search, folds) is kept
// with its history entry, so Back, the trail and coming back from another page land where it was.
// Formatting only: engine/calendar.js, engine/calendar-views.js, engine/cashsim.js.

import { startPage, change, said, go, keep, kept, refresh, say } from './shell.js';
import { calendar, weekdayOf } from '../engine/calendar.js';
import { yearStrip, paychecks, milestones, searchEvents, payLaterFlags, billTiming, cashLine, waiting, itemId, itemDay } from '../engine/calendar-views.js';
import { cashChartCard } from './cash-chart.js';
import { safeToSpend } from '../engine/spending.js';
import { summarize } from '../engine/summary.js';
import { putFact, confirmOccurrence, unconfirmOccurrence, moveOccurrence, skipOccurrence, repriceOccurrence, lockOccurrence, addMaybe, setMaybeDate, removeMaybe, parseInput } from '../engine/edits.js';
import { gapsCard } from './page.js';
import { mathButton } from './math-panel.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { h, chip, money, shortDate, monthWords, ledgerHref, ordinal, sentence, itemNote as noteOf, keyHint } from './view.js';
import { maxHref, maxItFor } from './maxit-panel.js';
import { pref } from './prefs.js';
import { forecast, fixButton } from './forecast.js';
import { foldRow, isOpen } from './rows.js';
import { fooGhosts } from '../engine/plan.js';

const app = document.getElementById('app');
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const longMonth = (ym) => MONTH_NAMES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
const addMonths = (ym, n) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; return (y + Math.floor(m / 12)) + '-' + String(((m % 12) + 12) % 12 + 1).padStart(2, '0'); };
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const longDay = (iso) => DOW[weekdayOf(iso)] + ', ' + shortDate(iso);
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);


// Data colors by what moves (DESIGN.md 8): one per category, named in a legend.
const CAT = { foo: 'viz-0', pay: 'viz-3', bill: 'viz-1', subscription: 'viz-1', debt: 'viz-2', interest: 'viz-2', saving: 'viz-3', setAside: 'viz-4', taxReturn: 'viz-4', estimatedTax: 'viz-4', maxDeadline: 'viz-4', promoEnds: 'viz-2', incomeStarts: 'viz-0', incomeEnds: 'viz-0', expenseStarts: 'viz-0', expenseEnds: 'viz-0', coverage: 'viz-0', situation: 'viz-0', maybe: 'viz-5' };
const PILL_WORDS = { sub: 'sub', plan: 'plan', repeat: 'repeat', locked: 'locked', done: 'done', logged: 'happened', waiting: 'not marked yet', maybe: 'maybe', yearly: 'yearly' };
// The view toggles (Batch 6): filters on the one list of events. A rough or missing item is a guess or has no amount.
const FILTERS = [['all', 'All'], ['in', 'Money in'], ['bills', 'Bills'], ['debt', 'Debt'], ['rough', 'Rough or missing']];
const DEBT_KINDS = ['debt', 'interest', 'promoEnds'];
const BILL_KINDS = ['bill', 'subscription', 'estimatedTax'];
// Dates that carry no amount by design (a start, an end, a deadline): never read as missing.
const MARKER_KINDS = ['incomeStarts', 'incomeEnds', 'expenseStarts', 'expenseEnds', 'promoEnds', 'bonusBy', 'maxDeadline', 'coverage', 'situation', 'foo'];
const FILTER_OF = {
  all: () => true,
  in: (e) => e.direction === 'in',
  bills: (e) => BILL_KINDS.includes(e.kind),
  debt: (e) => DEBT_KINDS.includes(e.kind),
  rough: (e) => !!e.rough || e.kind === 'missing' || (e.amount === null && !MARKER_KINDS.includes(e.kind))
};
const filtered = (m, f) => (f === 'all' ? m : { ...m, events: m.events.filter(FILTER_OF[f]), undated: m.undated.filter(FILTER_OF[f]), days: m.days.map((d) => ({ ...d, events: d.events.filter(FILTER_OF[f]) })) });
const VIEWS = [['list', 'List'], ['month', 'Month'], ['year', 'Year']];

// Why an item that cannot move stays on its day, in words (tapping it opens its screen, which says this).
const FIXED = {
  debt: 'Set by the lender\'s due date. Change it in My numbers.',
  interest: 'Set by the card\'s statement date. It goes on the card, not out of checking.',
  estimatedTax: 'Set by the tax calendar.',
  taxReturn: 'Set by the tax calendar.',
  maxDeadline: 'Set by the account\'s deadline for the year.',
  promoEnds: 'Set by the date the card\'s intro rate ends.',
  bonusBy: 'Set by the card\'s signup bonus deadline.',
  foo: 'A suggestion from your plan for the end of the month. It is not counted, and it follows the plan.'
};
const fixedWords = (e) => FIXED[e.kind] || 'Change its date in My numbers.';

// ---------------------------------------------------------------- what the month screen keeps
// Kept in this browser as well (the month last looked at, the chart's reach back), so a fresh visit opens on them.
const KEY = 'slam-calendar:v1';
const BACK_KEY = 'slam-cal-back:v1';
const read = (k, ok, dflt) => { try { const v = localStorage.getItem(k); return ok(v) ? v : dflt; } catch { return dflt; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: lasts until the page closes */ } };
// An old link to a month (calendar.html#2026-11, from Today and Spending) still opens that month; a link to a day or an
// item (calendar.html#/2026-11-14/...) opens that day's month when Back reaches the month screen.
const startHash = location.hash;
const YM = /^\d{4}-\d{2}$/;

// The month screen's state: what its history entry kept (keep), else this browser's, else the as-of month.
function rootState(s, asOfYm) {
  const linked = /^#\d{4}-\d{2}$/.test(startHash) ? startHash.slice(1) : /^#\/\d{4}-\d{2}-\d{2}/.test(startHash) ? startHash.slice(2, 9) : null;
  return {
    // Always opens on the current month (or a month a link names); the month picked lasts with this screen only.
    ym: YM.test(s.ym || '') ? s.ym : linked || asOfYm,
    view: VIEWS.some(([id]) => id === s.view) ? s.view : 'list',
    q: typeof s.q === 'string' ? s.q : '',
    byPay: s.byPay === true,
    day: typeof s.day === 'string' ? s.day : null,
    back: typeof s.back === 'boolean' ? s.back : read(BACK_KEY, (v) => v === '1' || v === '0', '0') === '1',
    open: Array.isArray(s.open) ? s.open : [],
    filter: FILTERS.some(([id]) => id === s.filter) ? s.filter : 'all'
  };
}
const setRoot = (patch) => { keep(patch); refresh(); };

// A fold on the month screen that stays open when the screen is come back to.
function fold(st, id, cls, summary, ...body) {
  const d = h('details', { class: cls, open: st.open.includes(id) || null }, h('summary', {}, summary), ...body);
  d.addEventListener('toggle', () => { const was = kept().open || []; const next = d.open ? [...new Set([...was, id])] : was.filter((x) => x !== id); if (next.length !== was.length) keep({ open: next }); });
  return d;
}

// ---------------------------------------------------------------- the months, figured once per household
// The engines run once for a household, a scenario and a span; the trail's names and the screen read the same result.
let memo = null;
function viewOf(base, rules) {
  const scen = pickedScenario();
  if (!memo || memo.base !== base || memo.rules !== rules || memo.scen !== scen) memo = { base, rules, scen, spine: withScenario(base, rules, scen), cals: new Map(), s: null };
  return memo;
}
const sumOf = (v) => v.s || (v.s = summarize(v.spine, v.rules, { flags: false }));
function monthsOf(v, from, n) {
  const k = from + ':' + n;
  if (v.cals.has(k)) return v.cals.get(k);
  const c = calendar(v.spine, v.rules, { from, months: n, maybeMode: 'weighted' });
  // FOO ghost chips (S-208): the plan's allocation for the month, dashed, tagged Plan, never counted.
  for (const g of fooGhosts(v.spine, v.rules, sumOf(v), c.months.map((m) => m.ym), { sim: maxItFor(v.spine, v.rules).sim })) {
    const m = c.months.find((x) => x.ym === g.date.slice(0, 7));
    if (!m) continue;
    let d = m.days.find((x) => x.date === g.date);
    if (!d) { d = { date: g.date, day: +g.date.slice(8, 10), events: [], in: 0, out: 0 }; m.days.push(d); m.days.sort((a, b) => (a.date < b.date ? -1 : 1)); }
    d.events.push(g); m.events.push(g);
  }
  v.cals.set(k, c);
  return c;
}

// ---------------------------------------------------------------- screens: a day, an item
const isDay = (d, spine) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d && Math.abs(+d.slice(0, 4) - +spine.meta.asOf.slice(0, 4)) <= 10;
};
const dayHref = (date) => '#/' + date;
// Where an item's name leads: its own screen when it has a day, else (no day yet) its numbers, to enter the day.
const itemHref = (e) => (e.date ? '#/' + e.date + '/' + encodeURIComponent(itemId(e)) : e.path ? ledgerHref(e.path) : null);
// The item an address names, found on the day it is on now (a moved one on its new day).
function findItem(base, rules, date, id) {
  const day = itemDay(base, id, date);
  if (!day) return null;
  const v = viewOf(base, rules);
  const e = monthsOf(v, day.slice(0, 7), 1).months[0].events.find((x) => itemId(x) === id && x.date === day);
  return e || null;
}
const dayName = (date, spine) => (date.slice(0, 4) === spine.meta.asOf.slice(0, 4) ? shortDate(date).replace(/, \d{4}$/, '') : shortDate(date));
function nameOf(levels, { spine, rules }) {
  if (levels.length === 1 && levels[0] === 'confirm') return 'Did these happen?';
  if (levels.length > 2 || !isDay(levels[0], spine)) return null;
  if (levels.length === 1) return dayName(levels[0], spine);
  const e = findItem(spine, rules, levels[0], levels[1]);
  return e ? e.label : null;
}

// ---------------------------------------------------------------- pieces
const SMALL_PILLS = ['sub', 'plan', 'locked', 'logged', 'waiting', 'maybe'];
const pills = (e, small = false) => (e.pills || []).filter((p) => !small || SMALL_PILLS.includes(p)).map((p) => h('span', { class: 'pill pill-' + p }, PILL_WORDS[p] || p));
const amt = (e) => (e.amount === null ? null : (e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : '') + money(e.amount));
// Whole dollars on the Calendar (audit 3): cents only in Show the math and the log.
const exact = (n) => money(n);
const chev = () => h('span', { class: 'chev', 'aria-hidden': 'true' }, '›');

// A milestone or a deadline's own place: an account's deadline opens its "How much to max it?" panel (S-211), the rest
// their numbers.
const evHref = (e) => (e.kind === 'maxDeadline' && e.accountId ? maxHref(e.accountId) : e.path ? ledgerHref(e.path) : null);
// The milestones that fall on a day (a debt cleared, a deadline), each a link to where it lives.
const msOn = (ms, date) => ms.filter((x) => x.date === date).map((x) => h('span', { class: 'ms' }, evHref(x) ? h('a', { href: evHref(x) }, x.label) : x.label));


// One day as its own screen: what checking ends at, what comes in and goes out, and its items, each opening its own.
function dayScreen(v, date) {
  const spine = v.spine, asOf = spine.meta.asOf;
  const c = monthsOf(v, date.slice(0, 7), 1);
  const m = c.months[0];
  const d = m.days.find((x) => x.date === date);
  const bal = m.line.find((x) => x.date === date);
  const ms = c.sim ? msOn(milestones(spine, v.rules, c.sim, c.months), date) : [];
  return h('section', { class: 'card', 'aria-labelledby': 'day-h' },
    h('h2', { id: 'day-h' }, longDay(date), ' ', date === todayIso() ? h('span', { class: 'stage-chip stage-green' }, 'Today') : null),
    bal ? h('p', { class: 'tile-sub' }, 'Checking ends the day at ' + money(bal.primary) + (bal.debt ? '; debt ' + money(bal.debt) : '') + '.')
      : date < asOf ? h('p', { class: 'muted' }, 'Before your numbers start, so no balance.') : null,
    d && (d.in || d.out) ? h('p', { class: 'tile-sub' }, [d.in ? money(d.in) + ' comes in' : null, d.out ? money(d.out) + ' goes out' : null].filter(Boolean).join('; ') + '.') : null,
    ms.length ? h('p', { class: 'tile-sub' }, ...ms) : null,
    d && d.events.length ? h('ul', { class: 'cal-items' }, d.events.map(itemRow)) : h('p', { class: 'muted' }, 'Nothing lands on this day.'));
}

let following = null; // the item the screen is on its way to, on its new day
// One item as its own screen (S-204, S-209): what it is, did it happen, and the changes to this one occurrence.
// An item that cannot move says why. Its usual amount and day live in My numbers, one tap away.
function itemScreen(v, date, id) {
  const e = findItem(v.base, v.rules, date, id);
  if (!e) return null;
  // Moved (or moved back by Undo): the screen follows it to its day, so the trail names the day it is on. Once: a
  // second draw before the move lands must not walk history twice.
  if (e.date === date) following = null;
  else if (following !== id + '@' + e.date) { following = id + '@' + e.date; queueMicrotask(() => go([e.date, id])); }
  // A plan suggestion has no usual amount or day of its own: it opens the plan it comes from.
  const where = e.kind === 'foo' ? ['plan.html', 'See it in your plan', 'The steps your surplus goes to, one at a time.']
    : e.kind === 'maxDeadline' && e.accountId ? [maxHref(e.accountId), 'How much to max it?', 'The room left and how to fill it by this deadline.'] : e.path ? [ledgerHref(e.path), 'See it in My numbers', 'Change the usual amount or day.'] : null;
  const note = noteOf(e, { moved: false });
  return [
    h('section', { class: 'card', 'aria-labelledby': 'item-h' },
      h('h2', { id: 'item-h' }, longDay(e.date)),
      h('p', { class: 'item-amt' }, amt(e) ? [e.direction === 'in' ? 'Comes in ' : e.direction === 'out' ? 'Goes out ' : 'Amount ', h('span', { class: 'num' }, exact(e.amount))] : 'No amount entered'),
      (e.pills || []).length || e.rough || (!e.counted && e.amount !== null && e.kind !== 'maybe') ? h('p', { class: 'ev-name' }, ...pills(e), e.rough ? h('span', { class: 'ev-tag' }, 'rough') : null, !e.counted && e.amount !== null && e.kind !== 'maybe' ? h('span', { class: 'ev-tag' }, 'not added to the total') : null) : null,
      note ? h('p', { class: 'tile-sub' }, sentence(cap(note))) : null,
      e.moved ? h('p', { class: 'tile-sub' }, 'Moved from ' + shortDate(e.origDate) + '. Other months stay put.') : null,
      e.movable ? null : h('p', { class: 'tile-sub why-fixed' }, h('strong', {}, 'Cannot move here. '), fixedWords(e)),
      e.confirmable ? happenedRow(e) : null,
      e.kind === 'pay' ? payFold(e) : null),
    e.movable ? changeCard(e) : null,
    where ? h('a', { class: 'go-row plain', href: where[0] }, h('span', { class: 'go-name' }, where[1]), h('span', { class: 'go-sub' }, where[2])) : null
  ];
}

// Did it happen (S-209): at the planned amount, a different amount, or not (skipped once). Happening writes one entry to
// the log, so estimated vs actual sees it; Undo, or "Not yet", takes it back.
function happenedRow(e) {
  const day = shortDate(e.date);
  if (e.logged) return h('div', { class: 'happened' }, h('p', { class: 'tile-sub' }, h('span', { class: 'pill pill-logged' }, 'happened'), ' Logged ' + exact(e.logged.amount) + ' on ' + shortDate(e.logged.date) + '.'), h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => change((s) => unconfirmOccurrence(s, e.key), e.label + ' on ' + day + ': not happened yet') }, 'Not yet')));
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const other = h('input', { id: 'hap-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: e.amount === null ? '' : String(e.amount) });
  return h('div', { class: 'happened', role: 'group', 'aria-label': 'Did it happen?' },
    h('p', { class: 'edit-label' }, 'Did it happen?'),
    h('div', { class: 'edit-actions' },
      e.amount === null ? null : h('button', { type: 'button', class: 'btn primary', onclick: () => change((s) => confirmOccurrence(s, e.key, { amount: e.amount }), said.happened(e.label + ' on ' + day) + ': ' + exact(e.amount)) }, 'It happened'),
      h('button', { type: 'button', class: 'btn', onclick: () => change((s) => skipOccurrence(s, e.key, true), e.label + ' did not happen on ' + day) }, 'It did not happen')),
    h('label', { for: 'hap-amount', class: 'edit-label' }, 'Or a different amount'), other, msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => { const p = parseInput('money', other.value); if (!p.ok) { msg.textContent = p.message; other.focus(); return; } change((s) => confirmOccurrence(s, e.key, { amount: p.value }), said.happened(e.label + ' on ' + day) + ': ' + exact(p.value)); } }, 'Log this amount')));
}

// Changes to this one occurrence (S-204): move it (a date and a Move button, the path that needs no drag), a different
// amount this time, skip it, lock it on its day; a maybe item goes back to the tray or is removed. Delete never asks:
// the bar offers Undo.
function changeCard(e) {
  const isMaybe = e.kind === 'maybe';
  const day = shortDate(e.date);
  if (e.locked) return h('section', { class: 'card', 'aria-labelledby': 'mv-h' }, h('h2', { id: 'mv-h' }, 'Locked on this day'),
    h('p', { class: 'tile-sub' }, 'Unlock it to move or change it.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', 'aria-pressed': 'true', onclick: () => change((s) => lockOccurrence(s, e.key, false), e.label + ' on ' + day + ' unlocked') }, 'Unlock')));
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const date = h('input', { id: 'mv-date', type: 'date' });
  date.value = e.date || '';
  const doMove = () => {
    if (!date.value) { msg.textContent = 'Pick a day'; return; }
    if (date.value === e.date) { msg.textContent = 'It is already on ' + day; return; }
    change((s) => (isMaybe ? setMaybeDate(s, e.maybeId, date.value) : moveOccurrence(s, e.key, date.value)), said.moved(e.label, date.value));
  };
  const priceMsg = h('p', { class: 'edit-msg', role: 'alert' });
  const price = h('input', { id: 'mv-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  price.value = e.amount === null ? '' : String(e.amount);
  const doPrice = () => {
    const p = price.value.trim() === '' ? { ok: true, value: null } : parseInput('money', price.value);
    if (!p.ok) { priceMsg.textContent = p.message; price.focus(); return; }
    change((s) => repriceOccurrence(s, e.key, p.value), p.value === null ? e.label + ' on ' + day + ' back to its usual amount' : said.changed(e.label + ' on ' + day, exact(p.value)));
  };
  return h('section', { class: 'card', 'aria-labelledby': 'mv-h' },
    h('h2', { id: 'mv-h' }, 'Change this one'),
    h('form', { class: 'editor', novalidate: true, onsubmit: (ev) => { ev.preventDefault(); doMove(); } },
      h('label', { for: 'mv-date', class: 'edit-label' }, 'Move it to'), date,
      h('p', { class: 'edit-hint' }, (isMaybe ? '' : 'Only this one moves. ') + 'Or drag it on the calendar.'),
      msg,
      h('div', { class: 'edit-actions' },
        h('button', { type: 'submit', class: e.confirmable ? 'btn' : 'btn primary' }, 'Move'),
        e.moved && !isMaybe ? h('button', { type: 'button', class: 'btn', onclick: () => change((s) => moveOccurrence(s, e.key, e.origDate), said.moved(e.label, e.origDate)) }, 'Put it back on ' + shortDate(e.origDate)) : null)),
    isMaybe ? null : h('form', { class: 'editor', novalidate: true, onsubmit: (ev) => { ev.preventDefault(); doPrice(); } },
      h('label', { for: 'mv-amount', class: 'edit-label' }, 'Amount this time'), price,
      h('p', { class: 'edit-hint' }, 'Leave it blank for the usual amount.'),
      priceMsg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Save the amount'))),
    h('div', { class: 'edit-actions' },
      isMaybe ? null : h('button', { type: 'button', class: 'btn', onclick: () => change((s) => skipOccurrence(s, e.key, true), e.label + ' skipped on ' + day) }, 'Skip this one'),
      isMaybe ? null : h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => change((s) => lockOccurrence(s, e.key, true), e.label + ' locked on ' + day) }, 'Lock it on this day'),
      isMaybe ? h('button', { type: 'button', class: 'btn', onclick: () => change((s) => setMaybeDate(s, e.maybeId, null), e.label + ' back in maybe money, with no day') }, 'Take it off the calendar') : null,
      isMaybe ? h('button', { type: 'button', class: 'btn danger', onclick: () => change((s) => removeMaybe(s, e.maybeId), said.deleted(e.label)) }, 'Remove') : null));
}

// A paycheck's fold-out (answer 28): the gross and what came off it.
function payFold(e) {
  if (e.gross === null || e.gross === undefined) return null;
  return h('details', { class: 'pay-fold' }, h('summary', {}, 'Gross ' + money(e.gross) + ' and what came off'),
    h('ul', {}, h('li', {}, 'Gross pay: ' + money(e.gross)), e.withheld !== null ? h('li', {}, 'Tax withheld: ' + money(e.withheld)) : null, e.fica !== null ? h('li', {}, 'Social Security and Medicare: ' + money(e.fica)) : null, e.saved ? h('li', {}, 'Saved from pay (payroll contributions): ' + money(e.saved)) : null, h('li', {}, h('strong', {}, 'Lands: ' + money(e.amount)))));
}

// Skipped this month, each with a button to put it back on its day.
function skippedList(m, spine) {
  const cal = spine.calendar || {};
  const keys = Object.entries(cal.overrides || {}).filter(([k, o]) => o.skip && k.split('|')[1].slice(0, 7) === m.ym);
  if (!keys.length) return null;
  const nameOfKey = (k) => { const id = k.split('|')[0]; const src = (spine.income || []).find((x) => x.id === id) || (spine.expenses || []).find((x) => x.id === id); return src ? src.label : id; };
  return h('div', { class: 'skipped' }, h('p', { class: 'muted' }, 'Skipped this month:'),
    h('div', { class: 'edit-actions' }, keys.map(([k]) => h('button', { type: 'button', class: 'btn small', onclick: () => change((s) => skipOccurrence(s, k, false), nameOfKey(k) + ' put back on ' + shortDate(k.split('|')[1])) }, 'Put back ' + nameOfKey(k) + ', ' + shortDate(k.split('|')[1]).replace(/, \d{4}$/, '')))));
}

// The actual amount typed on a line, kept while the page is open so a redraw never drops it (D-034).
const typedActual = new Map();
function actualBox(e) {
  const id = 'act-' + e.key.replace(/[^a-z0-9]+/gi, '-');
  const box = h('input', { id, class: 'wait-actual', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: e.amount === null ? '$' : exact(e.amount), 'aria-label': e.label + ', actual amount (blank uses the estimate)' });
  box.value = typedActual.get(e.key) || '';
  box.addEventListener('input', () => typedActual.set(e.key, box.value));
  return h('label', { class: 'wait-act', for: id }, h('span', { class: 'wait-act-l' }, 'Actual'), box);
}

// ---------------------------------------------------------------- maybe money: the list; the form opens from + Add only
let trayAdding = false;
function trayCard(c, st) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const label = h('input', { id: 'tray-label', type: 'text', autocomplete: 'off', placeholder: 'A tax refund, a gift, a side job' });
  const amount = h('input', { id: 'tray-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 45' });
  const likely = h('input', { id: 'tray-likely', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '50' });
  const dir = h('select', { id: 'tray-dir', 'aria-label': 'In or out' }, h('option', { value: 'in' }, 'Money in'), h('option', { value: 'out' }, 'Money out'));
  const dateIn = h('input', { id: 'tray-date', type: 'date' });
  const form = h('form', { class: 'editor tray-form', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const a = parseInput('money', amount.value); if (!a.ok) { msg.textContent = 'How much: ' + a.message; amount.focus(); return; }
    const l = likely.value.trim() === '' ? { ok: true, value: 0.5 } : parseInput('rate', likely.value); if (!l.ok || l.value < 0 || l.value > 1) { msg.textContent = 'How likely: 0 to 100'; likely.focus(); return; }
    trayAdding = false;
    change((s) => addMaybe(s, { label: label.value, amount: a.value, likelihood: l.value, direction: dir.value, date: dateIn.value || null }).spine, said.added(label.value.trim()) + (dateIn.value ? ' on ' + shortDate(dateIn.value) : ' to maybe money'));
  } },
    h('label', { for: 'tray-label', class: 'edit-label' }, 'What might come in or go out'), label,
    h('label', { for: 'tray-amount', class: 'edit-label' }, 'How much'), amount,
    h('label', { for: 'tray-likely', class: 'edit-label' }, 'How likely, as a percent'), likely,
    h('label', { for: 'tray-dir', class: 'edit-label' }, 'Direction'), dir,
    h('label', { for: 'tray-date', class: 'edit-label' }, 'Day (optional)'), dateIn,
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add maybe money'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { trayAdding = false; refresh(); } }, 'Cancel')));
  const item = (m) => {
    const d = h('input', { type: 'date', 'aria-label': 'Day for ' + m.label });
    return h('li', { class: 'tray-item', 'data-key': 'maybe:' + m.id, 'data-label': m.label, 'data-drag': 'maybe', 'data-maybe': m.id },
      h('span', { class: 'grip', title: 'Drag onto a day', 'aria-hidden': 'true' }, '⋮⋮'), h('span', {}, h('strong', {}, m.label), h('span', { class: 'choice-sub' }, ' ' + Math.round(m.likelihood * 100) + '% likely, ' + (m.direction === 'out' ? 'out' : 'in'))), h('span', { class: 'tray-amt' }, money(m.amount)), d,
      h('button', { type: 'button', class: 'btn small', onclick: () => { if (!d.value) { say('Pick a day for ' + m.label + ' first'); d.focus(); return; } change((s) => setMaybeDate(s, m.id, d.value), said.moved(m.label, d.value)); } }, 'Put it on that day'),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => change((s) => removeMaybe(s, m.id), said.deleted(m.label)) }, 'Remove'));
  };
  return h('section', { class: 'card tray', id: 'tray', 'aria-labelledby': 'tray-h' },
    c.tray.length ? h('ul', { class: 'tray-list' }, c.tray.map(item)) : null,
    trayAdding ? form : null);
}

// ---------------------------------------------------------------- drag to reschedule (S-204)
// Pointer events on a grip: a drag past 14px lifts the item; dropping it on a day moves that one occurrence (or puts a
// maybe item on that day), one change and so one Undo. A tap on the grip says how to move it.
function dragSetup(root) {
  let drag = null;
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el ? el.closest('[data-date]') : null; };
  root.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip'); if (!grip) return;
    const item = grip.closest('[data-drag]'); if (!item) return;
    const from = item.closest('[data-date]');
    drag = { item, kind: item.dataset.drag, key: item.dataset.key, label: item.dataset.label || 'It', maybeId: item.dataset.maybe, from: from ? from.dataset.date : null, x: e.clientX, y: e.clientY, moving: false, ghost: null, over: null, id: e.pointerId };
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moving) { if (Math.hypot(dx, dy) < 14) return; drag.moving = true; drag.item.classList.add('dragging'); drag.ghost = h('div', { class: 'drag-ghost' }, drag.label); document.body.append(drag.ghost); }
    drag.ghost.style.left = (e.clientX + 12) + 'px'; drag.ghost.style.top = (e.clientY - 12) + 'px';
    const cell = cellAt(e.clientX, e.clientY);
    if (drag.over && drag.over !== cell) drag.over.classList.remove('drop-target');
    if (cell) cell.classList.add('drop-target');
    drag.over = cell;
  });
  const finish = (e, drop) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.item.classList.remove('dragging'); if (d.ghost) d.ghost.remove(); if (d.over) d.over.classList.remove('drop-target');
    if (!drop) return;
    if (!d.moving) { say('To move ' + d.label + ', drag the grip onto another day, or tap its name and pick a day'); return; }
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell || cell.dataset.date === d.from) return;
    const date = cell.dataset.date;
    if (d.kind === 'maybe') change((s) => setMaybeDate(s, d.maybeId, date), said.moved(d.label, date));
    else change((s) => moveOccurrence(s, d.key, date), said.moved(d.label, date));
  };
  root.addEventListener('pointerup', (e) => finish(e, true));
  root.addEventListener('pointercancel', (e) => finish(e, false));
  // The grip in the key of colors moves nothing itself: a tap on it says how moving works.
  root.addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('.grip'); if (g && !g.closest('[data-drag]')) say('Drag an item\'s grip onto another day to move it, or tap its name and pick a day'); });
}

// ---------------------------------------------------------------- marks, rows and dates to know (the Calendar made simple)
// A filled dot: it happened. A hollow dot: expected. "~" before an amount: a guess. No chips or bracketed notes on a
// row: the detail lives inside the item.
const markOf = (e) => (e.logged ? 'done' : 'expected');
// Dates only (bug sweep): deadlines, promo ends and tax dates; a plan item is an item on its day, not a date to know.
const isDateToKnow = (e) => MARKER_KINDS.includes(e.kind) || e.kind === 'taxReturn' || (e.kind === 'estimatedTax' && e.amount === null);
const dotEl = (e) => h('span', { class: 'mk mk-' + markOf(e) + ' ' + (CAT[e.kind] || 'viz-0'), role: 'img', 'aria-label': markOf(e) === 'done' ? 'happened' : 'expected' });
const dayWords = (date) => DOW[weekdayOf(date)] + ' ' + shortDate(date).replace(/, \d{4}$/, '').replace(/\/\d{4}$/, '');
function itemRow(e) {
  const href = itemHref(e);
  const canDrag = e.movable && !e.locked && !!e.key;
  // The whole row is the target (affordance 5): the name's link covers the row; the grip sits above it to drag.
  return h('li', { class: 'cal-item' + (href ? ' has-target' : ''), 'data-key': e.key || null, 'data-label': e.label, 'data-drag': canDrag ? (e.kind === 'maybe' ? 'maybe' : 'event') : null, 'data-maybe': e.kind === 'maybe' ? e.maybeId : null },
    canDrag ? h('span', { class: 'grip', title: 'Drag to another day', 'aria-hidden': 'true' }, '⋮⋮') : null,
    dotEl(e),
    href ? h('a', { class: 'cal-name ev-go', href }, e.label) : h('span', { class: 'cal-name' }, e.label),
    amt(e) ? h('span', { class: 'cal-amt' }, (e.rough ? '~ ' : '') + amt(e)) : null,
    href ? chev() : null);
}
// Dates to know: deadlines and dates with no money (tax dates, a Roth deadline, a promo end, the plan's step), one strip.
// An account deadline shows once for its account and year.
function datesToKnow(list) {
  const seen = new Set();
  const keep = list.filter((x) => { const k = x.kind === 'maxDeadline' && x.accountId ? 'dl|' + x.accountId + '|' + x.date.slice(0, 4) : x.date + '|' + x.label; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!keep.length) return null;
  return h('section', { class: 'dates-strip', 'aria-label': 'Dates to know' },
    h('p', { class: 'dates-h' }, 'Dates to know'),
    h('ul', {}, keep.map((x) => h('li', {}, h('span', { class: 'ms-date' }, shortDate(x.date).replace(/, \d{4}$/, '')), ' ', evHref(x) ? h('a', { href: evHref(x) }, x.label) : x.label))));
}
function monthDates(v, c, m) {
  const ms = c.sim ? milestones(v.spine, v.rules, c.sim, c.months).filter((x) => x.date.slice(0, 7) === m.ym) : [];
  return datesToKnow([...m.events.filter((e) => e.date && isDateToKnow(e)).map((e) => ({ date: e.date, label: e.label, kind: e.kind, path: e.path, accountId: e.accountId })), ...ms]);
}

// ---------------------------------------------------------------- the top: one number, one sentence, the fix, to confirm
function topCard(spine, rules, today) {
  const { story, sim } = forecast(spine, rules);
  const n = waiting(spine, rules, { today }).length;
  if (!story) return [gapsCard(spine, sim)];
  return [
    h('section', { class: 'card cal-top', id: 'cash-low', 'aria-label': 'Will you be OK until payday?' },
      h('p', { class: 'cal-low' }, h('span', { class: 'tile-label' }, 'Lowest'), ' ', h('span', { class: 'cal-low-num' + (story.under ? ' under' : '') }, money(story.low.amount)), ' on ' + shortDate(story.low.date)),
      h('p', { class: 'cal-low-words' }, story.under ? 'Under your floor of ' + money(story.floor) + (story.low.beforePayday ? ', the day before payday.' : '.') : 'You stay above your floor through ' + shortDate(story.through) + '.'),
      story.under ? h('div', { class: 'edit-actions' }, fixButton(story)) : null),
    n ? h('ul', { class: 'go-list' }, h('li', {}, h('a', { class: 'go-row plain', href: '#/confirm', id: 'to-confirm' }, h('span', { class: 'go-name' }, n + ' to confirm'), h('span', { class: 'go-sub' }, 'Did these happen?')))) : null
  ];
}

// ---------------------------------------------------------------- the list (the main view)
function listView(v, c, m, st, today) {
  const floor = c.sim ? c.sim.floor.amount : null, near = floor === null ? null : floor + (c.sim.everydayPerDay || 0) * 7;
  const items = (d) => d.events.filter((e) => !isDateToKnow(e));
  const days = m.days.filter((d) => items(d).length);
  const pays = st.byPay && c.sim ? paychecks(v.spine, v.rules, c.sim, sumOf(v)) : [];
  const out = [];
  for (const d of days) {
    const pay = d.events.some((e) => e.kind === 'pay');
    const bal = m.line.find((x) => x.date === d.date);
    const pc = pay ? pays.find((p) => p.date === d.date) : null;
    // A payday is the day's own heading, highlighted ("Thu Oct 15 · Payday"); grouped by paycheck, it says what that
    // paycheck covers. One heading per day, never a divider above it repeating the date.
    out.push(h('li', { class: 'cal-day' + (d.date === today ? ' today' : '') + (pay ? ' cal-payday' : ''), 'data-date': d.date },
      h('p', { class: 'cal-day-h' }, h('a', { href: dayHref(d.date) }, dayWords(d.date) + (pay ? ' · Payday' : '')), d.date === today ? h('span', { class: 'stage-chip stage-green' }, 'Today') : null,
        pc ? h('span', { class: 'cal-pay-cover' }, 'covers to ' + (pc.until ? shortDate(pc.until).replace(/, \d{4}$/, '') : 'month end') + ', ' + (pc.short ? 'short ' : 'left ') + money(Math.abs(pc.left))) : null),
      h('ul', { class: 'cal-items' }, items(d).map(itemRow)),
      bal ? h('p', { class: 'cal-after' + (floor !== null && bal.primary < floor ? ' under' : near !== null && bal.primary < near ? ' near' : '') }, 'Checking after: ' + money(bal.primary)) : null));
  }
  return [
    monthDates(v, c, m),
    out.length ? h('ol', { class: 'cal-list' }, out) : h('p', { class: 'muted empty-line' }, 'Nothing on a known day in ' + longMonth(m.ym) + '.'),
    m.undated.length ? h('section', { class: 'card', 'aria-labelledby': 'undated-h' }, h('h2', { id: 'undated-h' }, 'Sometime this month'),
      h('ul', { class: 'cal-items' }, m.undated.map((e) => h('li', { class: 'cal-item' }, dotEl(e), h('span', { class: 'cal-name' }, e.label), amt(e) ? h('span', { class: 'cal-amt' }, (e.rough ? '~ ' : '') + amt(e)) : null, itemHref(e) ? h('a', { class: 'btn small', href: itemHref(e) }, 'Give it a day') : null)))) : null
  ];
}

// ---------------------------------------------------------------- the month grid: net, balance, dots
function monthView(v, c, m, st, today) {
  const floor = c.sim ? c.sim.floor.amount : null, near = floor === null ? null : floor + (c.sim.everydayPerDay || 0) * 7;
  const first = m.ym + '-01', lead = (weekdayOf(first) - (pref('weekStart') === 'monday' ? 1 : 0) + 7) % 7;
  const n = new Date(Date.UTC(+m.ym.slice(0, 4), +m.ym.slice(5, 7), 0)).getUTCDate();
  const low = m.line.length ? m.line.reduce((a, x) => (x.primary < a.primary ? x : a), m.line[0]).date : null;
  const dow = pref('weekStart') === 'monday' ? [...DOW.slice(1), DOW[0]] : DOW;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'cell empty', 'aria-hidden': 'true' }));
  for (let day = 1; day <= n; day++) {
    const date = m.ym + '-' + String(day).padStart(2, '0');
    const d = m.days.find((x) => x.date === date), bal = m.line.find((x) => x.date === date);
    const its = d ? d.events.filter((e) => !isDateToKnow(e)) : [];
    const tint = bal && floor !== null && bal.primary < floor ? ' under' : bal && near !== null && bal.primary < near ? ' near' : '';
    cells.push(h('button', { type: 'button', class: 'cell' + (date === today ? ' today' : '') + (date === low ? ' low' : '') + tint + (st.day === date ? ' is-picked' : ''), 'data-date': date, 'aria-pressed': String(st.day === date),
      'aria-label': dayWords(date) + (d && d.net ? ', net ' + money(d.net) : '') + (bal ? ', checking ' + money(bal.primary) : '') + (its.length ? ', ' + its.length + (its.length === 1 ? ' item' : ' items') : ''),
      onclick: () => setRoot({ day: st.day === date ? null : date }) },
      h('span', { class: 'cell-day' }, String(day)),
      d && d.net ? h('span', { class: 'cell-net' + (d.net > 0 ? ' in' : ' out') }, (d.net > 0 ? '+' : '-') + money(Math.abs(d.net))) : null,
      bal ? h('span', { class: 'cell-cash' }, money(bal.primary)) : null,
      its.length ? h('span', { class: 'cell-dots', 'aria-hidden': 'true' }, its.slice(0, 5).map((e) => h('span', { class: 'mk mk-' + markOf(e) + ' ' + (CAT[e.kind] || 'viz-0') }))) : null));
  }
  const picked = st.day && st.day.slice(0, 7) === m.ym ? m.days.find((x) => x.date === st.day) : null;
  return [
    h('div', { class: 'grid-wrap' }, h('div', { class: 'grid-dow', 'aria-hidden': 'true' }, dow.map((x) => h('span', {}, x))), h('div', { class: 'grid' }, cells)),
    st.day && st.day.slice(0, 7) === m.ym ? h('section', { class: 'card', 'aria-labelledby': 'picked-h' }, h('h2', { id: 'picked-h' }, dayWords(st.day)),
      picked && picked.events.length ? h('ul', { class: 'cal-items' }, picked.events.map(itemRow)) : h('p', { class: 'muted' }, 'Nothing lands on this day.')) : null
  ];
}

// ---------------------------------------------------------------- the year: the table, a first month that starts partway
function yearView(spine, rules) {
  const y = yearStrip(spine, rules, { maybeMode: 'weighted' });
  const deadlines = y.months.flatMap((m) => m.deadlines.map((d) => ({ date: d.date, label: d.label, kind: 'maxDeadline', accountId: d.accountId })));
  const sim = forecast(spine, rules, 12).sim;
  const ms = milestones(spine, rules, sim, []).map((x) => ({ ...x }));
  return [
    datesToKnow([...deadlines, ...ms]),
    h('section', { class: 'card', 'aria-labelledby': 'year-h' },
      h('h2', { id: 'year-h' }, 'The year, month by month'),
      h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Month'), h('th', { class: 'num' }, 'In'), h('th', { class: 'num' }, 'Out'), h('th', { class: 'num' }, 'Lowest day'))),
        h('tbody', {}, y.months.map((m) => h('tr', { class: m.underFloor ? 'under' : m.tight ? 'tight' : '' },
          h('td', {}, h('button', { type: 'button', class: 'btn small', onclick: () => { setRoot({ ym: m.ym, view: 'list' }); window.scrollTo({ top: 0 }); } }, MONTH_NAMES[+m.ym.slice(5, 7) - 1].slice(0, 3) + ' ' + m.ym.slice(0, 4)), m.from ? h('span', { class: 'muted' }, ' from ' + shortDate(m.from).replace(/, \d{4}$/, '')) : null),
          h('td', { class: 'num' }, money(m.in)), h('td', { class: 'num' }, money(m.out)), h('td', { class: 'num' }, money(m.low))))))),
      h('p', { class: 'tile-note' }, 'Tinted: the lowest day comes within a week of spending (' + money(y.tightWeek) + ') of your floor.'))
  ];
}

// ---------------------------------------------------------------- the rows under the views (slim by default)
let timingMemo = { sim: null, t: null };
function belowRows(v, c, m, st) {
  const sim = c.sim;
  const timing = sim && timingMemo.sim === sim ? timingMemo.t : null;
  const best = timing && timing.fixes.length ? timing.fixes[0] : null;
  return [
    sim ? foldRow('cal-chart', 'Cash by day', 'lowest ' + money(sim.low ? forecast(v.spine, v.rules).story?.low.amount ?? sim.low.amount : 0), () => {
      const first = cashLine(v.spine, sim);
      const line = first && first.backTo && st.back ? cashLine(v.spine, sim, { from: first.backTo + '-01' }) : first;
      const pre = sim.checking.known ? safeToSpend(sim).low : null;
      return cashChartCard(line, { preCover: pre && pre.covered ? pre : null, back: st.back, onBack: (on) => { store(BACK_KEY, on ? '1' : '0'); setRoot({ back: on }); }, width: Math.min(960, (app.clientWidth || 360) - 66) });
    }) : null,
    foldRow('cal-month-' + m.ym, longMonth(m.ym), (m.net >= 0 ? money(m.net) + ' more in than out' : money(-m.net) + ' more out than in'), () => [
      h('p', { class: 'tile-sub' }, 'In ' + money(m.in) + ', out ' + money(m.out) + '. Lines with no amount are not in these.'),
      m.cash.value !== null ? h('p', { class: 'tile-sub' }, 'Checking at the end of the month: ' + money(m.cash.value) + '.') : null,
      ...payLaterLines(c, m), skippedList(m, v.base),
      m.monthCash ? mathButton(['calendar:monthCash'], () => ({ spine: v.spine, rules: v.rules, s: sumOf(v), month: m })) : null]),
    sim ? foldRow('cal-timing', 'Bill timing', best ? best.label + ' to the ' + ordinal(best.to) + ': +' + money(best.gain) : timing ? 'the timing already works' : 'find better due days', () => {
      if (timingMemo.sim !== sim) timingMemo = { sim, t: billTiming(sim, v.rules) };
      return timingBody(timingMemo.t);
    }) : null,
    foldRow('cal-maybe', 'Maybe money', c.tray.length ? c.tray.length + ' without a day' : 'none', () => trayCard(c, st), { add: { label: 'Add', onOpen: () => { trayAdding = true; } } }),
    h('ul', { class: 'go-list' }, h('li', {}, h('a', { class: 'go-row plain', href: 'ledger.html#/debt' }, h('span', { class: 'go-name' }, 'Debt payoff dates'), h('span', { class: 'go-sub' }, 'On My numbers, Debt'))))
  ];
}
function timingBody(t) {
  return [
    h('p', { class: 'tile-sub' }, 'Lowest point now: ' + money(t.lowNow.amount) + ' on ' + shortDate(t.lowNow.date) + '. ' + t.tried + ' bills and cards tried.'),
    t.fixes.length ? h('ul', { class: 'flow-list' }, t.fixes.map((f) => h('li', {}, h('a', { href: ledgerHref(f.path) }, f.label), ': move the due day from the ' + ordinal(f.from) + ' to the ' + ordinal(f.to) + '; the lowest point rises by ' + money(f.gain) + ', to ' + money(f.lowAfter.amount) + '. ', h('span', { class: 'ev-note' }, 'To ask: "' + f.script + '"'),
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn small', onclick: () => change((s) => putFact(s, f.path, f.to, 'known', todayIso()), said.changed(f.label + ' due day', 'the ' + ordinal(f.to))) }, 'Save the new due day'))))) : h('p', { class: 'muted' }, 'No due day move raises the lowest point.')
  ];
}

// Pay-later flags inside this month (S-209): paid before the paycheck that covers it.
function payLaterLines(c, m) {
  if (!c.sim) return [];
  const pl = payLaterFlags(c.sim);
  const here = pl.flags.filter((f) => f.due.slice(0, 7) === m.ym);
  if (!here.length) return [];
  return [h('ul', { class: 'paylater', 'aria-label': 'Paid before the paycheck that covers it' }, here.map((f) => h('li', {}, f.label + ' (' + money(f.amount) + ') lands ' + shortDate(f.due) + ', ' + f.gap + ' day' + (f.gap === 1 ? '' : 's') + ' before the paycheck on ' + shortDate(f.paidBy) + ' that covers it.')))];
}

// ---------------------------------------------------------------- Did these happen? (#/confirm)
// One row per item: Happened as its one button, More for the rest (didn't happen, a different amount, moved).
// "Mark all happened" at the bottom; Undo takes it back.
function confirmScreen(spine, rules, today) {
  const list = waiting(spine, rules, { today });
  if (!list.length) return h('p', { class: 'muted empty-line' }, 'Nothing to confirm.');
  const actualOf = (e) => { const t = (typedActual.get(e.key) || '').trim(); if (t === '') return { ok: true, value: e.amount }; const p = parseInput('money', t); return p.ok ? p : { ok: false, message: e.label + ', actual: ' + p.message }; };
  const happened = (e) => { const a = actualOf(e); if (!a.ok) { say(a.message); return; } if (a.value === null) { say(e.label + ': type the actual amount first, under More'); return; } typedActual.delete(e.key); change((s) => confirmOccurrence(s, e.key, { amount: a.value }), said.happened(e.label + ' on ' + shortDate(e.date)) + ': ' + exact(a.value) + (e.amount !== null && a.value !== e.amount ? ' (estimated ' + exact(e.amount) + ')' : '')); };
  const all = () => { const keys = list.map((e) => ({ e, a: actualOf(e) })).filter((x) => x.a.ok && x.a.value !== null); if (!keys.length) { say('Each item needs an amount first'); return; } change((s) => keys.reduce((x, k) => confirmOccurrence(x, k.e.key, { amount: k.a.value }), s), keys.length + (keys.length === 1 ? ' item' : ' items') + ' marked happened'); };
  return [
    h('ul', { class: 'confirm-list' }, list.map((e) => h('li', { class: 'confirm-row' },
      h('p', { class: 'wait-what' }, h('strong', {}, e.label), h('span', { class: 'wait-when' }, shortDate(e.date).replace(/, \d{4}$/, '')), h('span', { class: 'wait-amt' }, e.amount === null ? 'no estimate' : (e.direction === 'in' ? '+' : '-') + exact(e.amount))),
      // The row's buttons sit side by side on the right; More opens its choices on a line of their own under the row,
      // so nothing moves (owner's ask: buttons in line and even).
      ...(() => {
        const body = h('div', { class: 'confirm-more-body', id: 'more-' + e.key.replace(/[^a-z0-9]+/gi, '-'), hidden: true }, actualBox(e),
          h('button', { type: 'button', class: 'btn small', onclick: () => change((s) => skipOccurrence(s, e.key, true), e.label + ' did not happen on ' + shortDate(e.origDate)) }, 'Didn\'t happen'),
          h('a', { class: 'btn small', href: '#/' + e.date + '/' + encodeURIComponent(e.key) }, 'Moved: open it'));
        const more = h('button', { type: 'button', class: 'btn small', 'aria-expanded': 'false', 'aria-controls': body.id, onclick: () => { body.hidden = !body.hidden; more.setAttribute('aria-expanded', String(!body.hidden)); } }, 'More');
        return [h('div', { class: 'confirm-acts' }, h('button', { type: 'button', class: 'btn small primary', 'aria-label': 'It happened: ' + e.label, onclick: () => happened(e) }, 'Happened'), more), body];
      })()))),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', id: 'confirm-all', onclick: all }, 'Mark all ' + list.length + ' happened'))
  ];
}

// ---------------------------------------------------------------- the month screen
const VIEW_WORDS = [['list', 'List'], ['month', 'Month'], ['year', 'Year']];
function monthScreen(v, ctx) {
  const rules = v.rules, spine = v.spine, asOf = spine.meta.asOf, asOfYm = asOf.slice(0, 7);
  const st = rootState(ctx.state || {}, asOfYm);
  if (!YM.test((ctx.state || {}).ym || '')) keep({ ym: st.ym });
  const c = monthsOf(v, st.ym, 1), m = filtered(c.months[0], st.filter);
  const today = todayIso();
  const toMonth = (ym) => { setRoot({ ym, day: null }); window.scrollTo({ top: 0 }); };
  const prev = addMonths(st.ym, -1), next = addMonths(st.ym, 1);
  const known = !(c.sim && !c.sim.checking.known);
  const filterOn = st.filter !== 'all' || !!st.q;
  const body = st.view === 'year' ? yearView(spine, rules) : !c.sim && st.ym < asOfYm ? [pastWords(asOf)] : st.view === 'month' ? monthView(v, c, m, st, today) : listView(v, c, m, st, today);
  return [
    ...topCard(v.base, rules, today),
    // One time control: previous, the month, next; Today only when away from this month.
    st.view === 'year' ? null : h('div', { class: 'month-nav', role: 'group', 'aria-label': 'Pick a month' },
      h('button', { type: 'button', class: 'btn small icon-btn', id: 'cal-prev', 'aria-label': 'Previous month, ' + longMonth(prev), title: longMonth(prev), onclick: () => toMonth(prev) }, '‹'),
      h('h2', { class: 'month-h', 'aria-live': 'polite' }, longMonth(st.ym)),
      h('button', { type: 'button', class: 'btn small icon-btn', id: 'cal-next', 'aria-label': 'Next month, ' + longMonth(next), title: longMonth(next), onclick: () => toMonth(next) }, '›'),
      st.ym !== asOfYm ? h('button', { type: 'button', class: 'btn small', id: 'cal-now', onclick: () => toMonth(asOfYm) }, 'Today') : null),
    h('div', { class: 'cal-bar' },
      h('div', { class: 'segmented cal-views', role: 'group', 'aria-label': 'Views' }, VIEW_WORDS.map(([id, w]) => h('button', { type: 'button', class: 'seg-btn', id: 'view-' + id, 'aria-pressed': String(st.view === id), onclick: () => setRoot({ view: id }) }, h('span', { class: 'seg-label' }, w)))),
      st.view === 'list' ? h('label', { class: 'check-row cal-bypay', for: 'by-pay' }, h('input', { type: 'checkbox', id: 'by-pay', checked: st.byPay, onchange: (e) => setRoot({ byPay: e.target.checked }) }), h('span', {}, 'Group by paycheck')) : null,
      st.view === 'year' ? null : filterFold(c, st, filterOn)),
    known ? body : [],
    st.view === 'year' ? null : belowRows(v, c, c.months[0], st)
  ];
}
// Search and the filters, folded under one Filter button.
function filterFold(c, st, on) {
  const box = h('input', { class: 'search-box', type: 'search', id: 'cal-search', placeholder: 'Find an item by name' + keyHint('press /'), 'aria-label': 'Find an item', autocomplete: 'off' });
  box.value = st.q;
  const results = (q, hits) => (q && !hits.length ? [h('li', { class: 'muted' }, 'Nothing matches.')] : hits.slice(0, 30).map((e) => h('li', {}, (e.date ? shortDate(e.date) : 'No day yet') + ': ', itemHref(e) ? h('a', { href: itemHref(e) }, e.label) : e.label, e.amount !== null ? ', ' + (e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : '') + money(e.amount) : '')));
  const list = h('ul', { class: 'flow-list' }, ...results(st.q, searchEvents(c.months, st.q)));
  box.addEventListener('input', () => { keep({ q: box.value }); list.replaceChildren(...results(box.value, searchEvents(c.months, box.value))); });
  const d = h('details', { class: 'cal-filter-fold', open: isOpen('cal-filter') || null },
    h('summary', { class: 'btn small' }, 'Filter' + (st.filter !== 'all' ? ': ' + FILTERS.find(([id]) => id === st.filter)[1] : '')),
    h('div', { class: 'cal-filter-body' }, box, list,
      h('div', { class: 'segmented cal-filter', role: 'group', 'aria-label': 'Show' }, FILTERS.map(([id, label]) => h('button', { type: 'button', class: 'seg-btn', id: 'filter-' + id, 'aria-pressed': String(st.filter === id), onclick: () => setRoot({ filter: id }) }, h('span', { class: 'seg-label' }, label))))));
  d.addEventListener('toggle', () => { try { const s = new Set(JSON.parse(localStorage.getItem('slam-open:v1') || '[]')); if (d.open) s.add('cal-filter'); else s.delete('cal-filter'); localStorage.setItem('slam-open:v1', JSON.stringify([...s])); } catch { /* lasts until the page closes */ } });
  return d;
}

// The words for a view that starts on the as-of date, when the month picked is before it.
const pastWords = (asOf) => h('p', { class: 'muted empty-line' }, 'Your numbers start ' + shortDate(asOf) + '. Pick that month or later.');

function render(ctx) {
  const v = viewOf(ctx.spine, ctx.rules);
  const [date, id] = ctx.levels;
  if (date === 'confirm' && ctx.levels.length === 1) return confirmScreen(v.base, v.rules, todayIso());
  if (ctx.levels.length === 2) return itemScreen(v, date, id);
  following = null;
  if (ctx.levels.length === 1) return dayScreen(v, date);
  return monthScreen(v, ctx);
}

let resizing = null;
window.addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => refresh(), 200); });
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
  const i = document.getElementById('cal-search'); if (i) { e.preventDefault(); i.focus(); }
});

// Drag listeners go on once: the shell redraws inside the same #app, and a second set would make one drag two changes.
dragSetup(app);

startPage({ tab: 'calendar', title: 'Calendar', name: nameOf, render });
