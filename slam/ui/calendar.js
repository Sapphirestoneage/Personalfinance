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
import { calendar, weekdayOf, rangeCashTerms } from '../engine/calendar.js';
import { weeks, agenda, yearStrip, paychecks, milestones, searchEvents, payLaterFlags, billTiming, cashReading, cashLine, waiting, itemId, itemDay } from '../engine/calendar-views.js';
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
import { pickedWindow, windowBar, WINDOWS } from './window.js';
import { debtTab } from './debt-tab.js';
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
const LEGEND = [['viz-3', 'Money in, and saving'], ['viz-1', 'Bills'], ['viz-2', 'Debt payments and rates'], ['viz-4', 'Tax and account deadlines'], ['viz-5', 'Maybe money'], ['viz-0', 'Start and end dates']];
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
const VIEWS = [['month', 'Month'], ['weeks', 'Weeks'], ['agenda', 'Next 14 days'], ['paychecks', 'Paychecks'], ['year', 'Year'], ['debt', 'Debt']];

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
    ym: YM.test(s.ym || '') ? s.ym : linked || read(KEY, (v) => YM.test(v || ''), null) || asOfYm,
    view: VIEWS.some(([id]) => id === s.view) ? s.view : 'month',
    months: WINDOWS.some(([n]) => n === s.months) ? s.months : pickedWindow(),
    q: typeof s.q === 'string' ? s.q : '',
    agendaAll: s.agendaAll === true,
    timing: s.timing === true,
    back: typeof s.back === 'boolean' ? s.back : read(BACK_KEY, (v) => v === '1' || v === '0', '0') === '1',
    open: Array.isArray(s.open) ? s.open : [],
    debt: s.debt && typeof s.debt === 'object' ? s.debt : null,
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
  if (levels.length > 2 || !isDay(levels[0], spine)) return null;
  if (levels.length === 1) return dayName(levels[0], spine);
  const e = findItem(spine, rules, levels[0], levels[1]);
  return e ? e.label : null;
}

// ---------------------------------------------------------------- pieces
const SMALL_PILLS = ['sub', 'plan', 'locked', 'logged', 'waiting', 'maybe'];
const pills = (e, small = false) => (e.pills || []).filter((p) => !small || SMALL_PILLS.includes(p)).map((p) => h('span', { class: 'pill pill-' + p }, PILL_WORDS[p] || p));
const amt = (e) => (e.amount === null ? null : (e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : '') + money(e.amount, !Number.isInteger(e.amount)));
const exact = (n) => money(n, !Number.isInteger(n));
const chev = () => h('span', { class: 'chev', 'aria-hidden': 'true' }, '›');

// A milestone or a deadline's own place: an account's deadline opens its "How much to max it?" panel (S-211), the rest
// their numbers.
const evHref = (e) => (e.kind === 'maxDeadline' && e.accountId ? maxHref(e.accountId) : e.path ? ledgerHref(e.path) : null);

// One item: the grip (drag), the swatch, the name, pills, the amount, a chevron in a list, the note. The whole row
// opens it (its own screen); the grip stays above the row so it drags.
function eventEl(e, { small = false, drag = true } = {}) {
  const href = itemHref(e);
  const isMaybe = e.kind === 'maybe';
  const canDrag = drag && e.movable && !e.locked && !!e.key;
  return h('li', { class: 'ev ev-' + e.kind + (e.rough ? ' ev-rough' : '') + (small ? ' ev-small' : '') + ((e.pills || []).includes('done') ? ' ev-done' : '') + (href ? ' has-target' : ''), 'data-key': e.key || null, 'data-label': e.label, 'data-drag': canDrag ? (isMaybe ? 'maybe' : 'event') : null, 'data-maybe': isMaybe ? e.maybeId : null },
    canDrag ? h('span', { class: 'grip', title: 'Drag to another day', 'aria-hidden': 'true' }, '⋮⋮') : null,
    h('span', { class: 'sw ' + (CAT[e.kind] || 'viz-0'), 'aria-hidden': 'true' }),
    h('span', { class: 'ev-name' }, href ? h('a', { class: 'ev-go', href }, e.label) : h('span', {}, e.label), e.kind === 'maxDeadline' ? h('span', { class: 'deadline-chip due' }, e.passed ? 'Deadline passed' : e.missing ? 'Deadline, room missing' : 'Deadline') : null, ...pills(e, small), e.rough && !small ? h('span', { class: 'ev-tag' }, 'rough') : null, !e.counted && e.amount !== null && !small && e.kind !== 'maybe' ? h('span', { class: 'ev-tag' }, 'not added to the total') : null),
    amt(e) ? h('span', { class: 'ev-amt' }, amt(e)) : null,
    href && !small ? chev() : null,
    e.note && !small ? h('span', { class: 'ev-note' }, noteOf(e)) : null);
}

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
    d && d.events.length ? h('ul', { class: 'ev-list ev-rows' }, d.events.map((e) => eventEl(e, { drag: false }))) : h('p', { class: 'muted' }, 'Nothing lands on this day.'));
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

function dayHead(d, m, today) {
  const bal = m.line.find((x) => x.date === d.date);
  return h('p', { class: 'day-head' }, h('a', { class: 'day-go', href: dayHref(d.date) }, DOW[weekdayOf(d.date)] + ' ' + d.day), d.date === today ? h('span', { class: 'stage-chip stage-green' }, 'Today') : null,
    h('span', { class: 'day-sum' }, (d.in ? '+' + money(d.in) : '') + (d.in && d.out ? ' ' : '') + (d.out ? '-' + money(d.out) : '')),
    bal ? h('span', { class: 'day-cash' }, 'ends at ' + money(bal.primary) + (bal.debt ? ', debt ' + money(bal.debt) : '')) : null);
}

// An account deadline is already on its day as an item with its chip (S-211), so its marker is left off the day; it stays on the Milestones card.
function msOn(ms, date) { return ms.filter((x) => x.date === date && x.kind !== 'maxDeadline').map((x) => h('span', { class: 'ms' }, evHref(x) ? h('a', { href: evHref(x) }, x.label) : x.label)); }

// The phone form: days as a list.
function dayList(m, today, ms) {
  if (!m.days.length) return h('p', { class: 'muted' }, 'Nothing lands on a known day this month. Enter pay days and bill days in ', h('a', { href: 'ledger.html' }, 'My numbers'), ' to see them here.');
  const low = m.line.length ? m.line.reduce((a, x) => (x.primary < a.primary ? x : a), m.line[0]).date : null;
  return h('ol', { class: 'day-list' }, m.days.map((d) => h('li', { class: 'day' + (d.date === today ? ' today' : '') + (d.date === low ? ' low' : ''), 'data-date': d.date }, dayHead(d, m, today), ...msOn(ms, d.date), h('ul', { class: 'ev-list ev-rows' }, d.events.map((e) => eventEl(e))))));
}

// The desktop form: a seven-column grid with running cash and debt in every cell; the day's number opens the day.
function grid(m, today, ms, floor) {
  const first = m.ym + '-01';
  const lead = weekdayOf(first);
  const n = new Date(Date.UTC(+m.ym.slice(0, 4), +m.ym.slice(5, 7), 0)).getUTCDate();
  const low = m.line.length ? m.line.reduce((a, x) => (x.primary < a.primary ? x : a), m.line[0]).date : null;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'cell empty', 'aria-hidden': 'true' }));
  for (let day = 1; day <= n; day++) {
    const date = m.ym + '-' + String(day).padStart(2, '0');
    const d = m.days.find((x) => x.date === date);
    const bal = m.line.find((x) => x.date === date);
    cells.push(h('div', { class: 'cell' + (date === today ? ' today' : '') + (d ? ' has' : '') + (date === low ? ' low' : '') + (bal && floor !== null && bal.primary < floor ? ' under' : ''), role: 'listitem', 'data-date': date, 'aria-label': DOW[weekdayOf(date)] + ' ' + day + (d ? ', ' + d.events.length + ' item' + (d.events.length === 1 ? '' : 's') : '') + (bal ? ', checking ' + money(bal.primary) : '') },
      h('p', { class: 'cell-day' }, h('a', { class: 'day-go', href: dayHref(date), 'aria-label': longDay(date) }, String(day)), date === today ? h('span', { class: 'cell-today' }, 'today') : null),
      ...msOn(ms, date),
      d ? h('ul', { class: 'ev-list' }, d.events.map((e) => eventEl(e, { small: true }))) : null,
      bal ? h('p', { class: 'cell-cash' }, money(bal.primary)) : null,
      bal && bal.debt ? h('p', { class: 'cell-debt' }, 'debt ' + money(bal.debt)) : null));
  }
  return h('div', { class: 'grid-wrap' }, h('div', { class: 'grid-dow', 'aria-hidden': 'true' }, DOW.map((x) => h('span', {}, x))), h('div', { class: 'grid', role: 'list' }, cells));
}

function summary(m, c, mathCtx) {
  const cash = m.cash;
  const cashWords = cash.value === null ? cap(cash.note) : 'Checking at month end: ' + money(cash.value) + '.';
  const todayLine = cash.today !== null ? 'Cash today: ' + money(cash.today) : null;
  const todaySub = cash.todayNote ? cash.todayNote : 'All cash accounts';
  return h('section', { class: 'card month-sum', 'aria-label': 'This month in one line' },
    h('p', { class: 'flow-total' }, (m.net >= 0 ? money(m.net) + ' more in than out' : money(-m.net) + ' more out than in') + ' in ' + longMonth(m.ym) + '.'),
    h('p', { class: 'tile-sub' }, 'In ' + money(m.in) + ', out ' + money(m.out) + '. Lines with no amount are not in these.'),
    // Cash today opens the cash accounts in My numbers: the whole row is the target.
    todayLine ? (cash.path ? h('a', { class: 'go-row plain', href: ledgerHref(cash.path) }, h('span', { class: 'go-name' }, todayLine), h('span', { class: 'go-sub' }, todaySub)) : h('p', { class: 'tile-sub' }, todayLine + '. ' + todaySub)) : null,
    h('p', { class: 'tile-sub' }, cash.when === 'past' ? null : [chip(cash.kind === 'computed' ? 'known' : cash.kind), ' '], cashWords, c.sim && c.sim.floor.amount ? ' Floor on checking: ' + money(c.sim.floor.amount) + '.' : ''),
    readingLines(c, m),
    m.monthCash ? mathButton(['calendar:monthCash'], () => ({ ...mathCtx(), month: m })) : null,
    ...payLaterLines(c, m),
    m.confirm && m.confirm.scheduled ? h('p', { class: 'tile-sub' }, m.confirm.happened + ' of ' + m.confirm.scheduled + ' paychecks and bills marked happened.') : null,
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn', href: 'spending.html#log' }, 'Add a purchase'), h('a', { class: 'btn', href: 'spending.html#checkin' }, 'Check in balances')),
    null);
}

// The top three (Batch 6): cash today, what checking has left at the end of this month, and the lowest point, each
// with Show the math. A month with no run (before the as-of date) has none.
function topThree(c, mathCtx) {
  // Only for this month: another month's view has its own reading below.
  const m = c.months[0];
  if (!c.sim || !m || m.ym !== c.sim.start.slice(0, 7)) return null;
  const r = cashReading(c.sim, m.ym);
  const one = (label, value, sub, ids, extra) => h('div', { class: 'nw-one' }, h('p', { class: 'tile-label' }, label), value === null || value === undefined ? h('p', { class: 'tile-value missing-text' }, 'Missing') : h('p', { class: 'tile-value' }, money(value)), sub ? h('p', { class: 'tile-sub muted' }, sub) : null, mathButton(ids, () => ({ ...mathCtx(), ...extra })));
  return h('section', { class: 'card nw-pair cal-three', 'aria-label': 'Cash in three numbers' },
    one('Cash today', m.cash.today, 'Every cash account', ['cash'], {}),
    one('Left this month', m.cash.value, 'Checking at the end of ' + longMonth(m.ym), ['calendar:monthCash'], { month: m }),
    one('Lowest point', r ? r.low.amount : null, r ? shortDate(r.low.date) + (r.low.beforePayday ? ', the day before payday' : '') : null, ['calendar:lowPoint'], { low: r ? { ...r.low, floor: c.sim.floor.amount } : null }));
}

// Waiting (S-209, the Budget's Track card): due on or before today and not marked yet. One tap each way; Open it opens
// the item's own screen, for a different amount or a move.
function waitingCard(spine, rules, today) {
  const list = waiting(spine, rules, { today });
  if (!list.length) return null;
  // Several at once (Batch 6): tick them, then one tap marks them all, and one Undo takes them all back.
  for (const k of [...picked]) if (!list.some((e) => e.key === k)) picked.delete(k);
  const chosen = list.filter((e) => picked.has(e.key));
  // Estimated vs actual (owner's ask, 2026-10-27): a typed actual is what is logged; blank logs the estimate.
  const actualOf = (e) => { const t = (typedActual.get(e.key) || '').trim(); if (t === '') return { ok: true, value: e.amount }; const p = parseInput('money', t); return p.ok ? p : { ok: false, message: e.label + ', actual: ' + p.message }; };
  const markAll = (happened) => { const bad = happened ? chosen.map(actualOf).find((x) => !x.ok) : null; if (bad) { say(bad.message); return; } const keys = chosen.map((e) => ({ key: e.key, amount: happened ? actualOf(e).value : e.amount })).filter((k) => !happened || k.amount !== null); const n = keys.length; if (!n) { say('An item with no amount needs its own screen: open it to type what came in or went out'); return; } picked.clear(); change((s) => keys.reduce((x, k) => (happened ? (k.amount === null ? x : confirmOccurrence(x, k.key, { amount: k.amount })) : skipOccurrence(x, k.key, true)), s), n + (n === 1 ? ' item' : ' items') + (happened ? ' marked happened' : ' marked did not happen')); };
  return h('section', { class: 'card', 'aria-labelledby': 'waiting-h' },
    h('h2', { id: 'waiting-h' }, 'Did these happen? ', h('span', { class: 'count' }, String(list.length))),
    list.length > 1 ? h('div', { class: 'edit-actions' },
      h('button', { type: 'button', class: 'btn small', id: 'wait-all', disabled: chosen.length === list.length, onclick: () => { for (const e of list) picked.add(e.key); refresh(); } }, 'Select all'),
      h('button', { type: 'button', class: 'btn small', id: 'wait-none', disabled: !chosen.length, onclick: () => { picked.clear(); refresh(); } }, 'Deselect all'),
      h('button', { type: 'button', class: 'btn small primary', id: 'wait-happened', disabled: !chosen.length, onclick: () => markAll(true) }, chosen.length ? 'Mark ' + chosen.length + ' happened' : 'Mark selected happened'),
      h('button', { type: 'button', class: 'btn small', id: 'wait-not', disabled: !chosen.length, onclick: () => markAll(false) }, 'Did not happen')) : null,
    // One line each (owner's ask, 2026-10-27): tick, what and when, then the answer buttons.
    h('ul', { class: 'waiting-list' }, list.map((e) => h('li', { class: 'happened wait-line' },
      list.length > 1 ? h('label', { class: 'wait-tick', title: 'Select ' + e.label }, h('input', { type: 'checkbox', class: 'wait-pick', 'aria-label': 'Select ' + e.label + ', ' + shortDate(e.date), checked: picked.has(e.key) ? 'checked' : null, onchange: (ev) => { if (ev.target.checked) picked.add(e.key); else picked.delete(e.key); pickedWords(); } })) : null,
      h('p', { class: 'wait-what' }, h('strong', {}, e.label), h('span', { class: 'wait-when' }, shortDate(e.date) + (e.moved ? ' (moved from ' + shortDate(e.origDate) + ')' : '')), h('span', { class: 'wait-amt' }, e.amount === null ? 'estimate not entered' : 'est. ' + (e.direction === 'in' ? 'in ' : 'out ') + exact(e.amount))),
      actualBox(e),
      h('div', { class: 'wait-btns' },
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'It happened: ' + e.label, onclick: () => { const a = actualOf(e); if (!a.ok) { say(a.message); return; } if (a.value === null) { say(e.label + ': type the actual amount first'); return; } typedActual.delete(e.key); change((s) => confirmOccurrence(s, e.key, { amount: a.value }), said.happened(e.label + ' on ' + shortDate(e.date)) + ': ' + exact(a.value) + (e.amount !== null && a.value !== e.amount ? ' (estimated ' + exact(e.amount) + ')' : '')); } }, 'Happened'),
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'It did not happen: ' + e.label, onclick: () => change((s) => skipOccurrence(s, e.key, true), e.label + ' did not happen on ' + shortDate(e.origDate)) }, 'Didn\'t happen'),
        h('a', { class: 'btn small ghost', 'aria-label': 'Different amount or day: open ' + e.label, href: '#/' + e.date + '/' + encodeURIComponent(e.key) }, 'Different \u203A'))))));
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
// The items ticked in Did these happen?, kept while the page is open. A tick updates the two buttons in place, never
// the list it is in (D-034).
const picked = new Set();
function pickedWords() {
  const n = picked.size, a = document.getElementById('wait-happened'), b = document.getElementById('wait-not');
  if (a) { a.disabled = !n; a.textContent = n ? 'Mark ' + n + ' happened' : 'Mark selected happened'; }
  if (b) b.disabled = !n;
  const all = document.getElementById('wait-all'), none = document.getElementById('wait-none');
  if (none) none.disabled = !n;
  if (all) all.disabled = n === document.querySelectorAll('.wait-pick').length;
}

// The month's cash reading in words (S-209): checking today, the lowest day, and the days in trouble.
function readingLines(c, m) {
  const r = cashReading(c.sim, m.ym);
  if (!r) return null;
  const n = (k, word) => k + ' day' + (k === 1 ? '' : 's') + ' ' + word;
  return h('ul', { class: 'flow-list', 'aria-label': 'Checking in ' + longMonth(m.ym) + ' in words' },
    r.today ? h('li', {}, 'Checking on ' + shortDate(r.today.date) + ': ' + money(r.today.amount) + '.') : null,
    h('li', {}, 'The lowest point is ' + money(r.low.amount) + ' on ' + shortDate(r.low.date) + (r.low.beforePayday ? ', the day before payday' : '') + '.'),
    r.belowZero.days ? h('li', {}, n(r.belowZero.days, 'below zero') + ', from ' + shortDate(r.belowZero.first) + '.') : null,
    r.underFloor.days ? h('li', {}, n(r.underFloor.days, 'under the floor of ' + money(r.underFloor.floor)) + ', from ' + shortDate(r.underFloor.first) + '.') : null,
    r.toppedUp.days ? h('li', {}, n(r.toppedUp.days, 'topped up from the cushion') + ', from ' + shortDate(r.toppedUp.first) + '. Spending less before then, or moving a bill (Bill timing below), keeps the cushion whole.') : null);
}

// Pay-later flags inside this month (S-209): paid before the paycheck that covers it.
function payLaterLines(c, m) {
  if (!c.sim) return [];
  const pl = payLaterFlags(c.sim);
  const here = pl.flags.filter((f) => f.due.slice(0, 7) === m.ym);
  if (!here.length) return [h('p', { class: 'tile-note' }, 'Every bill in ' + longMonth(m.ym) + ' is covered by the paycheck before it.')];
  const flagLine = (f) => h('li', {}, h('span', { class: 'pill' }, 'pay-later'), ' ', f.label + ' (' + money(f.amount) + ') lands ' + shortDate(f.due) + ', ' + f.gap + ' day' + (f.gap === 1 ? '' : 's') + ' before the paycheck on ' + shortDate(f.paidBy) + ' that covers it; checking that day ' + money(f.cashThatDay) + '.');
  return [here.length > 4 ? h('p', { class: 'tile-sub' }, here.length + ' bills land while checking is under ' + money(pl.line) + '; the first four, then the rest:') : null, here.length > 4 ? h('details', { class: 'flow-list' }, h('summary', {}, 'The other ' + (here.length - 4)), h('ul', { class: 'paylater' }, here.slice(4).map(flagLine))) : null, h('ul', { class: 'paylater', 'aria-label': 'Paid before the paycheck that covers it' }, here.slice(0, 4).map(flagLine)),
    h('p', { class: 'tile-note' }, 'Checking is under ' + money(pl.line) + ' on these days. Bill timing below shows a better due day.')];
}

// Bill timing (S-209): the due day that raises the lowest point the most, with a script to ask for it.
function timingCard(c, rules, st) {
  if (!c.sim) return null;
  if (!st.timing) return h('section', { class: 'card', 'aria-labelledby': 'timing-h' }, h('h2', { id: 'timing-h' }, 'Bill timing'), h('p', { class: 'muted' }, 'Find due days that keep checking higher.'), h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', id: 'timing-find', onclick: () => setRoot({ timing: true }) }, 'Find better due days')));
  const t = billTiming(c.sim, rules);
  return h('section', { class: 'card', 'aria-labelledby': 'timing-h' },
    h('h2', { id: 'timing-h' }, 'Bill timing'),
    h('p', { class: 'tile-sub' }, 'Lowest point now: ' + money(t.lowNow.amount) + ' on ' + shortDate(t.lowNow.date) + '. ' + t.tried + ' bills and cards tried.'),
    t.fixes.length ? h('ul', { class: 'flow-list' }, t.fixes.map((f) => h('li', {}, h('a', { href: ledgerHref(f.path) }, f.label), ': move the due day from the ' + ordinal(f.from) + ' to the ' + ordinal(f.to) + ': the lowest point rises by ' + money(f.gain) + ', to ' + money(f.lowAfter.amount) + (f.shortfallsBefore > f.shortfallsAfter ? ', and ' + (f.shortfallsBefore - f.shortfallsAfter) + ' payment' + (f.shortfallsBefore - f.shortfallsAfter === 1 ? '' : 's') + ' no longer held back' : '') + '. ', h('span', { class: 'ev-note' }, 'To ask: "' + f.script + '"'),
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => { keep({ timing: false }); if (!change((s) => putFact(s, f.path, f.to, 'known', todayIso()), said.changed(f.label + ' due day', 'the ' + ordinal(f.to)))) refresh(); } }, 'Save the new due day'))))) : h('p', { class: 'muted' }, 'No due day move raises the lowest point: the timing already works.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn ghost', id: 'timing-hide', onclick: () => setRoot({ timing: false }) }, 'Hide')));
}

function undated(m) {
  if (!m.undated.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'undated-h-' + m.ym },
    h('h2', { id: 'undated-h-' + m.ym }, 'Sometime in ' + longMonth(m.ym) + ' ', h('span', { class: 'count' }, String(m.undated.length))),
    h('p', { class: 'muted' }, 'No day yet. Open one to add its day.'),
    h('ul', { class: 'ev-list ev-rows' }, m.undated.map((e) => eventEl(e))));
}

function listTwin(m, st) {
  const all = [...m.days.flatMap((d) => d.events), ...m.undated];
  return fold(st, 'list:' + m.ym, 'flow-list card', 'Every item in ' + longMonth(m.ym) + ' as a list (' + all.length + ')',
    h('ul', {}, all.map((e) => h('li', {}, (e.date ? shortDate(e.date) : 'No day yet') + ': ', itemHref(e) ? h('a', { href: itemHref(e) }, e.label) : e.label, e.amount !== null ? ', ' + (e.direction === 'in' ? 'in ' : e.direction === 'out' ? 'out ' : '') + exact(e.amount) : '', e.rough ? ' (rough)' : '', e.note ? ' (' + e.note + ')' : ''))));
}

// The words for a view that starts on the as-of date, when the month picked is before it.
const pastWords = (asOf) => h('p', { class: 'muted' }, 'Your numbers start ' + shortDate(asOf) + '. Pick that month or later.');

// ---------------------------------------------------------------- views
let chartWidth = null; // the width the chart is shown at, measured after it is drawn, so its text stays 12px
function measureChart() {
  const wrap = document.querySelector('.cl-wrap');
  if (wrap && wrap.clientWidth && Math.abs(wrap.clientWidth - (chartWidth || 0)) > 2) { chartWidth = wrap.clientWidth; refresh(); }
}

function monthTab(v, c, today, ms, mathCtx, st) {
  const parts = [];
  const spine = v.spine;
  // Cash by day for the whole window (S-209), above the months.
  const first = cashLine(spine, c.sim);
  const line = first && first.backTo && st.back ? cashLine(spine, c.sim, { from: first.backTo + '-01' }) : first;
  const pre = c.sim && c.sim.checking.known ? safeToSpend(c.sim).low : null;
  parts.push(cashChartCard(line, { preCover: pre && pre.covered ? pre : null, back: st.back, onBack: (on) => { store(BACK_KEY, on ? '1' : '0'); setRoot({ back: on }); }, width: chartWidth || Math.min(960, (app.clientWidth || 360) - 66) }));
  const floor = c.sim ? c.sim.floor.amount : null;
  for (const whole of c.months) {
    const m = filtered(whole, st.filter);
    const used = new Set(m.events.map((e) => CAT[e.kind] || 'viz-0'));
    parts.push(
      c.months.length > 1 ? h('h2', { class: 'month-h' }, longMonth(m.ym)) : null,
      summary(whole, c, mathCtx),
      h('section', { class: 'card cal', 'aria-labelledby': 'cal-h-' + m.ym },
        h('h2', { id: 'cal-h-' + m.ym }, 'On the days'),
        h('ul', { class: 'flow-legend', id: 'legend-' + m.ym, 'aria-label': 'What the colors mean' }, LEGEND.filter(([cc]) => used.has(cc)).map(([cc, t]) => h('li', {}, h('span', { class: 'sw ' + cc, 'aria-hidden': 'true' }), t)), m.events.some((e) => e.rough) ? h('li', {}, h('span', { class: 'ev-tag' }, 'rough'), ' a guess') : null, h('li', {}, h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'), ' drag to move')),
        h('div', { class: 'cal-grid-only' }, grid(m, today, ms, floor)),
        h('div', { class: 'cal-list-only' }, dayList(m, today, ms)),
        skippedList(m, v.base)),
      undated(m),
      listTwin(m, st));
  }
  parts.push(timingCard(c, v.rules, st));
  return parts.filter(Boolean);
}

function weeksTab(c, mathCtx, asOf) {
  if (!c.sim) return pastWords(asOf);
  const w = weeks(c.sim);
  return h('section', { class: 'card', 'aria-labelledby': 'weeks-h' },
    h('h2', { id: 'weeks-h' }, 'Week by week'),
    null,
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Week'), h('th', { class: 'num' }, 'In'), h('th', { class: 'num' }, 'Out'), h('th', { class: 'num' }, 'Ending balance'), h('th', { class: 'num' }, 'Lowest day'))),
      h('tbody', {}, w.map((x) => h('tr', { class: x.underFloor ? 'under' : x.hasLow ? 'tight' : '' }, h('td', {}, shortDate(x.from) + ' to ' + shortDate(x.to) + (x.hasLow ? ' (the lowest day)' : '')), h('td', { class: 'num' }, money(x.in)), h('td', { class: 'num' }, money(x.out)), h('td', { class: 'num' }, money(x.end)), h('td', { class: 'num' }, money(x.low.amount) + ' on ' + shortDate(x.low.date))))))),
    mathButton(['calendar:rangeCash'], () => ({ ...mathCtx(), range: { terms: rangeCashTerms(c.sim, w[0].from, w[w.length - 1].to), kind: c.sim.kind } }), 0, 'Show the math for the whole span'));
}

function agendaTab(c, st, asOf) {
  if (!c.sim) return pastWords(asOf);
  const all = st.agendaAll;
  const a = agenda(c.sim, all ? c.sim.daily.length : 14);
  const COLOR = { income: 'viz-3', 'maybe-in': 'viz-5', bill: 'viz-1', paylater: 'viz-2', 'card-payment': 'viz-2', 'loan-payment': 'viz-2', 'extra-payment': 'viz-2', transfer: 'viz-3', interest: 'viz-2', 'late-fee': 'viz-2', statement: 'viz-0', shortfall: 'viz-5', everyday: 'viz-1', log: 'viz-1', 'auto-cover': 'viz-3' };
  const SOURCE = { scheduled: 'scheduled', happened: 'happened', logged: 'logged', maybe: 'maybe' };
  return h('section', { class: 'card', 'aria-labelledby': 'agenda-h' },
    h('h2', { id: 'agenda-h' }, all ? 'Every day with money moving, by date' : 'The next 14 days'),
    null,
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', id: 'agenda-all', 'aria-pressed': String(all), onclick: () => setRoot({ agendaAll: !all }) }, all ? 'Show the next 14 days' : 'Show every day in the window')),
    a.length ? h('div', {}, a.map((d) => h('div', { class: 'agenda-day' + (d.isLow ? ' low' : ''), 'data-date': d.date },
      h('p', { class: 'day-head' }, h('a', { class: 'day-go', href: dayHref(d.date) }, DOW[weekdayOf(d.date)] + ' ' + shortDate(d.date)), d.isLow ? h('span', { class: 'stage-chip stage-yellow' }, 'Lowest day') : null, d.underFloor ? h('span', { class: 'stage-chip stage-red' }, 'Under the floor') : null, h('span', { class: 'day-cash' }, 'ends at ' + money(d.end))),
      h('ul', { class: 'ev-list' }, d.events.map((e) => h('li', { class: 'ev' },
        h('span', { class: 'sw ' + (COLOR[e.kind] || 'viz-0'), 'aria-hidden': 'true' }),
        h('span', { class: 'ev-name' }, e.label + (e.kind === 'statement' ? ' (statement ' + money(e.statement) + ', due ' + shortDate(e.due) + ')' : e.kind === 'shortfall' ? ' (could not be paid without breaching the floor)' : e.card ? ' (on the card)' : ''), e.kind !== 'statement' && e.kind !== 'shortfall' ? h('span', { class: 'pill' + (e.source === 'happened' ? ' pill-logged' : '') }, SOURCE[e.source] || e.source) : null),
        e.amount ? h('span', { class: 'ev-amt' }, (e.amount > 0 ? '+' : '-') + money(Math.abs(e.amount), !Number.isInteger(e.amount))) : null,
        e.after !== null && e.after !== undefined ? h('span', { class: 'ev-note' }, 'checking then ' + exact(e.after)) : null))))))
      : h('p', { class: 'muted' }, 'Nothing but everyday spending in the next two weeks.'));
}

function paychecksTab(c, spine, rules, mathCtx, asOf) {
  if (!c.sim) return pastWords(asOf);
  const list = paychecks(spine, rules, c.sim, mathCtx().s);
  const payEvents = c.months.flatMap((m) => m.events.filter((e) => e.kind === 'pay'));
  return h('section', { class: 'card', 'aria-labelledby': 'pay-h' },
    h('h2', { id: 'pay-h' }, 'Paycheck by paycheck ', h('span', { class: 'count' }, String(list.length))),
    h('p', { class: 'muted' }, 'What each paycheck covers until the next one.'),
    ...list.map((p) => {
      const ev = payEvents.find((e) => e.sourceId === p.streamId && e.date === p.date);
      const head = shortDate(p.date) + ': ' + p.label;
      // The whole card opens the pay in My numbers, with a chevron.
      return h('section', { class: 'card pay-card' + (p.path ? ' has-target' : ''), 'aria-label': p.label + ' on ' + shortDate(p.date) },
        p.path ? h('a', { class: 'card-link', href: ledgerHref(p.path) }, h('strong', {}, head), chev()) : h('strong', {}, head),
        h('div', { class: 'pay-head' }, h('span', { class: 'pay-amt' }, money(p.amount)), p.bonus ? h('span', { class: 'bonus-chip' }, 'Bonus paycheck') : null, h('span', { class: 'muted' }, p.until ? 'until ' + shortDate(p.until) : 'to the end of the window')),
        ev ? payFold(ev) : null,
        p.bonus ? h('p', { class: 'tile-sub' }, p.bonusWhy + (p.couldDo ? ' It could go to ' + p.couldDo.label.toLowerCase() + ': ' + money(p.couldDo.amount) + '. ' + p.couldDo.why : '')) : null,
        h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'What it covers'), h('th', {}, 'Date'), h('th', { class: 'num' }, 'Amount'))),
          h('tbody', {}, p.bills.map((b) => h('tr', {}, h('td', {}, b.label), h('td', {}, shortDate(b.date)), h('td', { class: 'num' }, money(b.amount))))),
          h('tfoot', {}, h('tr', {}, h('td', {}, h('span', { class: 'pay-left' + (p.short ? ' short' : '') }, p.short ? 'Short by' : 'Left after these')), h('td', {}), h('td', { class: 'num' }, money(Math.abs(p.left))))))),
        mathButton(['calendar:paycheckLeft'], () => ({ ...mathCtx(), paycheck: p })));
    }));
}

function yearTab(spine, rules) {
  const y = yearStrip(spine, rules, { maybeMode: 'weighted' });
  return h('section', { class: 'card', 'aria-labelledby': 'year-h' },
    h('h2', { id: 'year-h' }, 'The year, month by month ', h('span', { class: 'count' }, y.tightCount + ' tight')),
    h('p', { class: 'muted' }, 'Tight: the lowest day comes within a week of spending (' + money(y.tightWeek) + ') of the floor.'),
    h('div', { class: 'year-strip', role: 'list' }, y.months.map((m) => h('div', { class: 'ys' + (m.underFloor ? ' under' : m.tight ? ' tight' : ''), role: 'listitem', 'aria-label': longMonth(m.ym) + ', lowest ' + money(m.low) + (m.tight ? ', tight' : '') + (m.deadlines.length ? ', ' + m.deadlines.length + ' account deadline' + (m.deadlines.length === 1 ? '' : 's') : '') }, h('b', {}, MONTH_NAMES[+m.ym.slice(5, 7) - 1].slice(0, 3)), h('span', { class: 'ys-low' }, money(m.low)), m.underFloor ? h('span', { class: 'pill' }, 'under') : m.tight ? h('span', { class: 'pill' }, 'tight') : null, m.deadlines.length ? h('span', { class: 'ys-flag', title: m.deadlines.map((d) => d.label).join('; ') }, '⚑' + (m.deadlines.length > 1 ? ' ' + m.deadlines.length : '')) : null))),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Month'), h('th', { class: 'num' }, 'In'), h('th', { class: 'num' }, 'Out'), h('th', { class: 'num' }, 'Net'), h('th', { class: 'num' }, 'Lowest day'), h('th', { class: 'num' }, 'Interest'))),
      h('tbody', {}, y.months.map((m) => h('tr', { class: m.underFloor ? 'under' : m.tight ? 'tight' : '' }, h('td', {}, h('button', { type: 'button', class: 'btn small', onclick: () => { store(KEY, m.ym); setRoot({ ym: m.ym, view: 'month' }); window.scrollTo({ top: 0 }); } }, longMonth(m.ym))), h('td', { class: 'num' }, money(m.in)), h('td', { class: 'num' }, money(m.out)), h('td', { class: 'num' }, money(m.net)), h('td', { class: 'num' }, money(m.low) + (m.tight ? ' (tight)' : '')), h('td', { class: 'num' }, money(m.interest))))))),
    // The strip's deadline chips in words, each opening its account's panel (S-211).
    y.months.some((m) => m.deadlines.length) ? h('div', { class: 'ys-deadlines' }, h('h3', {}, '⚑ Account deadlines in these twelve months'), h('ul', { class: 'max-list' }, y.months.flatMap((m) => m.deadlines).map((d) => h('li', { class: 'max-row' }, h('a', { class: 'max-name', href: maxHref(d.accountId) }, shortDate(d.date) + ': ' + d.label + ' ›'), h('span', { class: 'tile-sub' }, d.note))))) : null,
    h('p', { class: 'tile-note' }, chip(y.kind === 'computed' ? 'known' : y.kind), ' Twelve months from ' + shortDate(spine.meta.asOf) + ', the date your numbers are from. Tap a month to open it.'));
}

// ---------------------------------------------------------------- the tray, milestones, search
function trayCard(c, st) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const label = h('input', { id: 'tray-label', type: 'text', autocomplete: 'off', placeholder: 'A tax refund, a gift, a side job' });
  const amount = h('input', { id: 'tray-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
  const likely = h('input', { id: 'tray-likely', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '50' });
  const dir = h('select', { id: 'tray-dir', 'aria-label': 'In or out' }, h('option', { value: 'in' }, 'Money in'), h('option', { value: 'out' }, 'Money out'));
  const dateIn = h('input', { id: 'tray-date', type: 'date' });
  const form = h('form', { class: 'editor tray-form', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const a = parseInput('money', amount.value); if (!a.ok) { msg.textContent = 'How much: ' + a.message; amount.focus(); return; }
    const l = likely.value.trim() === '' ? { ok: true, value: 0.5 } : parseInput('rate', likely.value); if (!l.ok || l.value < 0 || l.value > 1) { msg.textContent = 'How likely: 0 to 100'; likely.focus(); return; }
    change((s) => addMaybe(s, { label: label.value, amount: a.value, likelihood: l.value, direction: dir.value, date: dateIn.value || null }).spine, said.added(label.value.trim()) + (dateIn.value ? ' on ' + shortDate(dateIn.value) : ' to maybe money'));
  } },
    h('label', { for: 'tray-label', class: 'edit-label' }, 'What might come in or go out'), label,
    h('label', { for: 'tray-amount', class: 'edit-label' }, 'How much'), amount,
    h('label', { for: 'tray-likely', class: 'edit-label' }, 'How likely, as a percent'), likely,
    h('label', { for: 'tray-dir', class: 'edit-label' }, 'Direction'), dir,
    h('label', { for: 'tray-date', class: 'edit-label' }, 'Day (optional)'), dateIn,
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add maybe money')));
  const item = (m) => {
    const d = h('input', { type: 'date', 'aria-label': 'Day for ' + m.label });
    return h('li', { class: 'tray-item', 'data-key': 'maybe:' + m.id, 'data-label': m.label, 'data-drag': 'maybe', 'data-maybe': m.id },
      h('span', { class: 'grip', title: 'Drag onto a day', 'aria-hidden': 'true' }, '⋮⋮'), h('span', {}, h('strong', {}, m.label), h('span', { class: 'choice-sub' }, ' ' + Math.round(m.likelihood * 100) + '% likely, ' + (m.direction === 'out' ? 'out' : 'in'))), h('span', { class: 'tray-amt' }, money(m.amount)), d,
      h('button', { type: 'button', class: 'btn small', onclick: () => { if (!d.value) { say('Pick a day for ' + m.label + ' first'); d.focus(); return; } change((s) => setMaybeDate(s, m.id, d.value), said.moved(m.label, d.value)); } }, 'Put it on that day'),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => change((s) => removeMaybe(s, m.id), said.deleted(m.label)) }, 'Remove'));
  };
  return h('section', { class: 'card tray', id: 'tray', 'aria-labelledby': 'tray-h' },
    h('h2', { id: 'tray-h' }, 'Maybe money ', h('span', { class: 'count' }, String(c.tray.length))),
    h('p', { class: 'muted' }, 'Money that might come or go. Give it a day to put it on the calendar.'),
    c.tray.length ? h('ul', { class: 'tray-list' }, c.tray.map(item)) : h('p', { class: 'muted' }, 'The tray is empty.'),
    fold(st, 'tray-add', 'later-list', 'Add maybe money', form));
}

function milestonesCard(c, spine, rules, st) {
  if (!c.sim) return null;
  const ms = milestones(spine, rules, c.sim, c.months);
  return h('section', { class: 'card', 'aria-labelledby': 'ms-h' },
    h('h2', { id: 'ms-h' }, 'Milestones ', h('span', { class: 'count' }, String(ms.length))),
    ms.length ? [h('ul', { class: 'ms-line', 'aria-label': 'Milestones in date order' }, ms.map((x) => h('li', {}, h('span', { class: 'ms-date' }, shortDate(x.date)), evHref(x) ? h('a', { href: evHref(x) }, x.label) : x.label, x.note ? h('span', { class: 'ev-note' }, x.note) : null))), null] : h('p', { class: 'muted' }, 'None in the next ' + st.months + (st.months === 1 ? ' month.' : ' months.')));
}

// Search: what is typed is kept with the screen, so coming back shows the same results.
function searchCard(c, st) {
  const box = h('input', { class: 'search-box', type: 'search', id: 'cal-search', placeholder: 'Find an item by name' + keyHint('press /'), 'aria-label': 'Find an item', autocomplete: 'off' });
  box.value = st.q;
  const results = (q, hits) => (q && !hits.length ? [h('li', { class: 'muted' }, 'Nothing matches.')] : hits.slice(0, 30).map((e) => h('li', {}, (e.date ? shortDate(e.date) : 'No day yet') + ': ', itemHref(e) ? h('a', { href: itemHref(e) }, e.label) : e.label, e.amount !== null ? ', ' + (e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : '') + money(e.amount) : '')));
  const list = h('ul', { class: 'flow-list' }, ...results(st.q, searchEvents(c.months, st.q)));
  box.addEventListener('input', () => { keep({ q: box.value }); list.replaceChildren(...results(box.value, searchEvents(c.months, box.value))); });
  return h('section', { class: 'card', 'aria-label': 'Search' }, box, list);
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

// ---------------------------------------------------------------- the month screen
function monthScreen(v, ctx) {
  const rules = v.rules, spine = v.spine, asOf = spine.meta.asOf, asOfYm = asOf.slice(0, 7);
  const st = rootState(ctx.state || {}, asOfYm);
  // The month shown is kept with the screen (a deep link's month too), so coming back shows the same one.
  if (!YM.test((ctx.state || {}).ym || '')) keep({ ym: st.ym });
  const c = monthsOf(v, st.ym, st.months);
  const today = todayIso();
  const mathCtx = () => ({ spine, rules, s: sumOf(v) });
  const ms = c.sim ? milestones(spine, rules, c.sim, c.months) : [];
  const toMonth = (ym) => { store(KEY, ym); setRoot({ ym }); window.scrollTo({ top: 0 }); };
  if (st.view === 'month') requestAnimationFrame(measureChart);
  const known = !(c.sim && !c.sim.checking.known);
  const body = !known ? [] : st.view === 'month' ? monthTab(v, c, today, ms, mathCtx, st) : st.view === 'weeks' ? [weeksTab(c, mathCtx, asOf)] : st.view === 'agenda' ? [agendaTab(c, st, asOf)] : st.view === 'paychecks' ? [paychecksTab(c, spine, rules, mathCtx, asOf)]
    : st.view === 'debt' ? (c.sim ? debtTab({ c, spine, rules, mathCtx, rerender: refresh, saved: st.debt, onSave: (f) => setRoot({ debt: f }) }) : [pastWords(asOf)]) : [yearTab(spine, rules)];
  return [
    windowBar(st.months, (n) => setRoot({ months: n })),
    gapsCard(spine, c.sim),
    topThree(c, mathCtx),
    waitingCard(spine, rules, today),
    h('div', { class: 'month-nav', role: 'group', 'aria-label': 'Pick a month' },
      h('button', { type: 'button', class: 'btn', id: 'cal-prev', onclick: () => toMonth(addMonths(st.ym, -1)) }, '‹ ' + monthWords(addMonths(st.ym, -1))),
      h('h2', { class: 'month-h', 'aria-live': 'polite' }, longMonth(st.ym) + (st.months > 1 ? ' and ' + (st.months - 1) + ' more' : ''), st.ym === asOfYm ? h('span', { class: 'stage-chip stage-green' }, 'This month') : null),
      h('button', { type: 'button', class: 'btn', id: 'cal-next', onclick: () => toMonth(addMonths(st.ym, 1)) }, monthWords(addMonths(st.ym, 1)) + ' ›'),
      st.ym !== asOfYm ? h('button', { type: 'button', class: 'btn ghost', id: 'cal-now', onclick: () => toMonth(asOfYm) }, 'Back to this month') : null),
    h('div', { class: 'tabs', role: 'group', 'aria-label': 'Views' }, VIEWS.map(([id, label]) => h('button', { type: 'button', class: 'tab-btn', id: 'view-' + id, 'aria-pressed': String(st.view === id), onclick: () => setRoot({ view: id }) }, label))),
    st.view === 'month' ? h('div', { class: 'segmented cal-filter', role: 'group', 'aria-label': 'Show' }, FILTERS.map(([id, label]) => h('button', { type: 'button', class: 'seg-btn', id: 'filter-' + id, 'aria-pressed': String(st.filter === id), onclick: () => setRoot({ filter: id }) }, h('span', { class: 'seg-label' }, label)))) : null,
    st.view === 'month' ? h('p', { class: 'muted cal-hint' }, 'Drag an item to another day to move it. ', h('a', { href: '#legend-' + st.ym }, 'What the colors mean')) : null,
    searchCard(c, st),
    ...body,
    trayCard(c, st),
    milestonesCard(c, spine, rules, st),
    null
  ];
}

function render(ctx) {
  const v = viewOf(ctx.spine, ctx.rules);
  const [date, id] = ctx.levels;
  if (ctx.levels.length === 2) return itemScreen(v, date, id);
  following = null;
  if (ctx.levels.length === 1) return dayScreen(v, date);
  return monthScreen(v, ctx);
}

let resizing = null;
window.addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { chartWidth = null; refresh(); }, 200); });
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
  const i = document.getElementById('cal-search'); if (i) { e.preventDefault(); i.focus(); }
});

// Drag listeners go on once: the shell redraws inside the same #app, and a second set would make one drag two changes.
dragSetup(app);

startPage({ tab: 'calendar', title: 'Calendar', name: nameOf, render });
