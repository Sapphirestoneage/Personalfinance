// The cash flow calendar (S-200, S-203, S-204): every view is a reading of the
// household's own dates and the day-by-day simulation. One time selector (1,
// 3, 6, 12 months) shared with the budget; tabs for the month grid (running
// cash and debt per day), the weeks, the next 14 days, each paycheck, the
// year strip; "Sometime this month"; a maybe-money tray; milestones and their
// timeline; search. An item moves by dragging its grip (pointer events, a
// drag past 14px moves it) or by the Move button in its editor; it can be
// skipped once, re-priced, locked, and put back in the tray. Edits are kept in
// this browser (the same saved household the Ledger edits) and can be undone.
// Formatting only: engine/calendar.js, engine/calendar-views.js, engine/cashsim.js.

import { calendar, weekdayOf, rangeCashTerms } from '../engine/calendar.js';
import { weeks, agenda, yearStrip, paychecks, milestones, searchEvents } from '../engine/calendar-views.js';
import { summarize } from '../engine/summary.js';
import { moveOccurrence, skipOccurrence, repriceOccurrence, lockOccurrence, addMaybe, setMaybeDate, removeMaybe, parseInput, createHistory, commit, undo, canUndo, undoLabel } from '../engine/edits.js';
import { applyDefaults } from '../engine/defaults.js';
import { mathButton } from './math-panel.js';
import { loadAll, save, SOURCE_WORDS } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { h, chip, money, shortDate, monthWords, ledgerHref } from './view.js';
import { pickedWindow, windowBar } from './window.js';

const app = document.getElementById('app');
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const longMonth = (ym) => MONTH_NAMES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
const addMonths = (ym, n) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; return (y + Math.floor(m / 12)) + '-' + String(((m % 12) + 12) % 12 + 1).padStart(2, '0'); };
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// Data colors by what moves (DESIGN.md 8): one per category, named in a legend.
const CAT = { pay: 'viz-3', bill: 'viz-1', subscription: 'viz-1', debt: 'viz-2', saving: 'viz-3', setAside: 'viz-4', taxReturn: 'viz-4', estimatedTax: 'viz-4', promoEnds: 'viz-2', incomeStarts: 'viz-0', incomeEnds: 'viz-0', expenseStarts: 'viz-0', expenseEnds: 'viz-0', coverage: 'viz-0', situation: 'viz-0', maybe: 'viz-5' };
const LEGEND = [['viz-3', 'Money in, and saving'], ['viz-1', 'Bills'], ['viz-2', 'Debt payments and rates'], ['viz-4', 'Tax'], ['viz-5', 'Maybe money'], ['viz-0', 'Dates: something starts, ends or changes']];
const PILL_WORDS = { sub: 'sub', plan: 'plan', repeat: 'repeat', locked: 'locked', done: 'done', maybe: 'maybe' };
const TABS = [['month', 'Month'], ['weeks', 'Weeks'], ['agenda', 'Next 14 days'], ['paychecks', 'Paychecks'], ['year', 'Year']];

// ---------------------------------------------------------------- state
let hist, rules, source, lastSaved = null;
const KEY = 'slam-calendar:v1';
const read = (k, ok, dflt) => { try { const v = localStorage.getItem(k); return ok(v) ? v : dflt; } catch { return dflt; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: lasts until the page closes */ } };
let window_ = pickedWindow();
let simFloor = null;
let state = { ym: null, tab: 'month', q: '', open: null, maybeMode: 'weighted' };

function apply(next, label) {
  hist = commit(hist, applyDefaults(next, rules), label);
  source = 'saved';
  lastSaved = (save(hist.present) ? 'Saved in this browser: ' : 'Could not save in this browser (storage is blocked), so this lasts until the page closes: ') + label + '.';
  render();
}
function tryApply(fn, label) { try { apply(fn(hist.present), label); return true; } catch (err) { lastSaved = err.message; render(); return false; } }

// ---------------------------------------------------------------- pieces
const SMALL_PILLS = ['sub', 'plan', 'locked', 'maybe'];
const pills = (e, small = false) => (e.pills || []).filter((p) => !small || SMALL_PILLS.includes(p)).map((p) => h('span', { class: 'pill pill-' + p }, PILL_WORDS[p] || p));
const amt = (e) => (e.amount === null ? null : (e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : '') + money(e.amount, !Number.isInteger(e.amount)));

// One event: the grip (drag), the swatch, the name (a button that opens its editor, or a link), pills, the amount, the note.
function eventEl(e, { small = false } = {}) {
  const editable = !!e.key;
  const name = editable
    ? h('button', { type: 'button', class: 'ev-tap', 'aria-pressed': String(state.open === e.key), onclick: () => { state.open = state.open === e.key ? null : e.key; render(); } }, e.label)
    : e.path ? h('a', { href: ledgerHref(e.path) }, e.label) : h('span', {}, e.label);
  const li = h('li', { class: 'ev ev-' + e.kind + (e.rough ? ' ev-rough' : '') + (small ? ' ev-small' : '') + ((e.pills || []).includes('done') ? ' ev-done' : ''), 'data-key': e.key || null, 'data-drag': e.movable && !e.locked ? 'event' : null },
    e.movable && !e.locked ? h('span', { class: 'grip', title: 'Drag to another day', 'aria-hidden': 'true' }, '⋮⋮') : null,
    h('span', { class: 'sw ' + (CAT[e.kind] || 'viz-0'), 'aria-hidden': 'true' }),
    h('span', { class: 'ev-name' }, name, ...pills(e, small), e.rough && !small ? h('span', { class: 'ev-tag' }, 'rough') : null, !e.counted && e.amount !== null && !small && e.kind !== 'maybe' ? h('span', { class: 'ev-tag' }, 'not added to the total') : null),
    amt(e) ? h('span', { class: 'ev-amt' }, amt(e)) : null,
    e.note && !small ? h('span', { class: 'ev-note' }, e.note) : null);
  return li;
}

// The editor for a selected occurrence (S-204): move (a date and a Move button, the non-drag path), skip once, re-price, lock, back to the tray.
function editor(e) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const date = h('input', { id: 'mv-date', type: 'date' });
  date.value = e.date || '';
  const price = h('input', { id: 'mv-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  price.value = e.amount === null ? '' : String(e.amount);
  const isMaybe = e.kind === 'maybe';
  const doMove = () => { if (!date.value) { msg.textContent = 'Pick a day'; return; } state.open = null; tryApply((s) => (isMaybe ? setMaybeDate(s, e.maybeId, date.value) : moveOccurrence(s, e.key, date.value)), e.label + ' moved to ' + shortDate(date.value)); };
  return h('section', { class: 'card ev-editor', 'aria-labelledby': 'eved-h' },
    h('h2', { id: 'eved-h' }, e.label, ' ', h('span', { class: 'muted' }, shortDate(e.date) + (amt(e) ? ', ' + amt(e) : ''))),
    e.moved ? h('p', { class: 'muted' }, 'Moved from ' + shortDate(e.origDate) + '; the rule itself is untouched.') : null,
    h('form', { class: 'editor', novalidate: true, onsubmit: (ev) => { ev.preventDefault(); doMove(); } },
      h('label', { for: 'mv-date', class: 'edit-label' }, 'Move this one to'), date,
      h('p', { class: 'edit-hint' }, 'Only this occurrence moves. Or drag its grip onto a day.'),
      !isMaybe && e.movable ? [h('label', { for: 'mv-amount', class: 'edit-label' }, 'Amount this time (optional)'), price, h('p', { class: 'edit-hint' }, 'Blank puts the usual amount back.')] : null,
      msg,
      h('div', { class: 'edit-actions' },
        e.locked ? null : h('button', { type: 'submit', class: 'btn primary' }, 'Move'),
        !isMaybe && e.movable && !e.locked ? h('button', { type: 'button', class: 'btn', onclick: () => { const p = price.value.trim() === '' ? { ok: true, value: null } : parseInput('money', price.value); if (!p.ok) { msg.textContent = p.message; return; } state.open = null; tryApply((s) => repriceOccurrence(s, e.key, p.value), e.label + (p.value === null ? ': usual amount' : ': ' + money(p.value) + ' this time')); } }, 'Save the amount') : null,
        !isMaybe && e.movable && !e.locked ? h('button', { type: 'button', class: 'btn', onclick: () => { state.open = null; tryApply((s) => skipOccurrence(s, e.key, true), e.label + ' skipped on ' + shortDate(e.origDate)); } }, 'Skip this one') : null,
        !isMaybe && e.movable ? h('button', { type: 'button', class: 'btn', 'aria-pressed': String(!!e.locked), onclick: () => { tryApply((s) => lockOccurrence(s, e.key, !e.locked), e.label + (e.locked ? ' unlocked' : ' locked')); } }, e.locked ? 'Unlock' : 'Lock it here') : null,
        isMaybe ? h('button', { type: 'button', class: 'btn', onclick: () => { state.open = null; tryApply((s) => setMaybeDate(s, e.maybeId, null), e.label + ' back in the tray'); } }, 'Back to the tray') : null,
        isMaybe ? h('button', { type: 'button', class: 'btn danger', onclick: () => { state.open = null; tryApply((s) => removeMaybe(s, e.maybeId), e.label + ' removed'); } }, 'Remove') : null,
        e.path ? h('a', { class: 'btn ghost', href: ledgerHref(e.path) }, 'Open in the Ledger') : null,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.open = null; render(); } }, 'Close'))),
    e.kind === 'pay' ? payFold(e) : null);
}

// A paycheck's fold-out (answer 28): the gross and what came off it.
function payFold(e) {
  if (e.gross === null || e.gross === undefined) return null;
  return h('details', { class: 'pay-fold' }, h('summary', {}, 'Gross ' + money(e.gross) + ' and what came off'),
    h('ul', {}, h('li', {}, 'Gross pay: ' + money(e.gross)), e.withheld !== null ? h('li', {}, 'Tax withheld: ' + money(e.withheld)) : null, e.fica !== null ? h('li', {}, 'Social Security and Medicare: ' + money(e.fica)) : null, e.saved ? h('li', {}, 'Saved from pay (payroll contributions): ' + money(e.saved)) : null, h('li', {}, h('strong', {}, 'Lands: ' + money(e.amount)))));
}

function skippedList(m) {
  const cal = hist.present.calendar || {};
  const keys = Object.entries(cal.overrides || {}).filter(([k, o]) => o.skip && k.split('|')[1].slice(0, 7) === m.ym);
  if (!keys.length) return null;
  return h('p', { class: 'muted' }, 'Skipped this month: ', ...keys.flatMap(([k], i) => [i ? ', ' : '', h('button', { type: 'button', class: 'ev-tap', onclick: () => tryApply((s) => skipOccurrence(s, k, false), k.split('|')[0] + ' put back') }, k.split('|')[0] + ' on ' + shortDate(k.split('|')[1]) + ' (put back)')]));
}

function dayHead(d, m, today) {
  const bal = m.line.find((x) => x.date === d.date);
  return h('p', { class: 'day-head' }, h('strong', {}, DOW[weekdayOf(d.date)] + ' ' + d.day), d.date === today ? h('span', { class: 'stage-chip stage-green' }, 'Today') : null,
    h('span', { class: 'day-sum' }, (d.in ? '+' + money(d.in) : '') + (d.in && d.out ? ' ' : '') + (d.out ? '-' + money(d.out) : '')),
    bal ? h('span', { class: 'day-cash' }, 'ends at ' + money(bal.primary) + (bal.debt ? ', debt ' + money(bal.debt) : '')) : null);
}

function msOn(ms, date) { return ms.filter((x) => x.date === date).map((x) => h('span', { class: 'ms' }, x.path ? h('a', { href: ledgerHref(x.path) }, x.label) : x.label)); }

// The phone form: days as a list.
function dayList(m, today, ms) {
  if (!m.days.length) return h('p', { class: 'muted' }, 'Nothing lands on a known day this month. Enter pay days and bill days in the Ledger to see them here.');
  const low = m.line.length ? m.line.reduce((a, x) => (x.primary < a.primary ? x : a), m.line[0]).date : null;
  return h('ol', { class: 'day-list' }, m.days.map((d) => h('li', { class: 'day' + (d.date === today ? ' today' : '') + (d.date === low ? ' low' : ''), 'data-date': d.date }, dayHead(d, m, today), ...msOn(ms, d.date), h('ul', { class: 'ev-list' }, d.events.map((e) => eventEl(e))))));
}

// The desktop form: a seven-column grid with running cash and debt in every cell.
function grid(m, today, ms) {
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
    cells.push(h('div', { class: 'cell' + (date === today ? ' today' : '') + (d ? ' has' : '') + (date === low ? ' low' : '') + (bal && simFloor !== null && bal.primary < simFloor ? ' under' : ''), role: 'listitem', 'data-date': date, 'aria-label': DOW[weekdayOf(date)] + ' ' + day + (d ? ', ' + d.events.length + ' item' + (d.events.length === 1 ? '' : 's') : '') + (bal ? ', checking ' + money(bal.primary) : '') },
      h('p', { class: 'cell-day' }, String(day), date === today ? h('span', { class: 'cell-today' }, 'today') : null),
      ...msOn(ms, date),
      d ? h('ul', { class: 'ev-list' }, d.events.map((e) => eventEl(e, { small: true }))) : null,
      bal ? h('p', { class: 'cell-cash' }, money(bal.primary)) : null,
      bal && bal.debt ? h('p', { class: 'cell-debt' }, 'debt ' + money(bal.debt)) : null));
  }
  return h('div', { class: 'grid-wrap' }, h('div', { class: 'grid-dow', 'aria-hidden': 'true' }, DOW.map((x) => h('span', {}, x))), h('div', { class: 'grid', role: 'list' }, cells));
}

function summary(m, c, mathCtx) {
  const cash = m.cash;
  const cashWords = cash.value === null ? cash.note : 'Checking at the end of the month: ' + money(cash.value) + (cash.total !== null && cash.total !== cash.value ? ' (every cash account: ' + money(cash.total) + ')' : '') + '.';
  return h('section', { class: 'card month-sum', 'aria-label': 'This month in one line' },
    h('p', { class: 'flow-total' }, (m.net >= 0 ? money(m.net) + ' more comes in than goes out' : money(-m.net) + ' more goes out than comes in') + ' on the calendar in ' + longMonth(m.ym) + '.'),
    h('p', { class: 'tile-sub' }, 'Comes in ' + money(m.in) + '; goes out ' + money(m.out) + ' (bills, minimums, saving and the tax set-aside). Lines with no amount or marked "not added" are not in these totals.'),
    cash.today !== null ? h('p', { class: 'tile-sub' }, 'Cash today: ' + money(cash.today) + ' across every cash account.', cash.path ? [' ', h('a', { href: ledgerHref(cash.path) }, 'View in the Ledger')] : null) : null,
    h('p', { class: 'tile-sub' }, chip(cash.kind === 'computed' ? 'known' : cash.kind), ' ', cashWords, m.low !== null ? ' Lowest day: ' + money(m.low) + '.' : '', c.sim && c.sim.floor.amount ? ' Floor on checking: ' + money(c.sim.floor.amount) + '.' : ''),
    m.monthCash ? mathButton(['calendar:monthCash'], () => ({ ...mathCtx(), month: m })) : null,
    h('p', { class: 'tile-note' }, 'A rough tag means the day or the amount is a guess (a house default, or a rough number). The totals use what is on the calendar; the checking balance comes from the day-by-day simulation, where an item with no day is spread evenly across the month and cards are paid on their due days.'));
}

function undated(m) {
  if (!m.undated.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'undated-h-' + m.ym },
    h('h2', { id: 'undated-h-' + m.ym }, 'Sometime in ' + longMonth(m.ym) + ' ', h('span', { class: 'count' }, String(m.undated.length))),
    h('p', { class: 'muted' }, 'These have no day yet. Open one and enter the day it is paid to put it on the calendar; until then the cash line spreads it across the month.'),
    h('ul', { class: 'ev-list' }, m.undated.map((e) => eventEl(e))));
}

function listTwin(m) {
  const all = [...m.days.flatMap((d) => d.events), ...m.undated];
  return h('details', { class: 'flow-list card' }, h('summary', {}, 'Every item in ' + longMonth(m.ym) + ' as a list, with links to the Ledger (' + all.length + ')'),
    h('ul', {}, all.map((e) => h('li', {}, (e.date ? shortDate(e.date) : 'No day yet') + ': ', e.path ? h('a', { href: ledgerHref(e.path) }, e.label) : e.label, e.amount !== null ? ', ' + (e.direction === 'in' ? 'in ' : e.direction === 'out' ? 'out ' : '') + money(e.amount, !Number.isInteger(e.amount)) : '', e.rough ? ' (rough)' : '', e.note ? ' (' + e.note + ')' : ''))));
}

// ---------------------------------------------------------------- tabs
function monthTab(c, today, ms, mathCtx) {
  const parts = [];
  for (const m of c.months) {
    const used = new Set(m.events.map((e) => CAT[e.kind] || 'viz-0'));
    parts.push(
      c.months.length > 1 ? h('h2', { class: 'month-h' }, longMonth(m.ym)) : null,
      summary(m, c, mathCtx),
      h('section', { class: 'card cal', 'aria-labelledby': 'cal-h-' + m.ym },
        h('h2', { id: 'cal-h-' + m.ym }, 'On the days'),
        h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' }, LEGEND.filter(([cc]) => used.has(cc)).map(([cc, t]) => h('li', {}, h('span', { class: 'sw ' + cc, 'aria-hidden': 'true' }), t)), m.events.some((e) => e.rough) ? h('li', {}, h('span', { class: 'ev-tag' }, 'rough'), ' a guessed day or amount') : null, h('li', {}, h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'), ' drag to move; tap the name to edit')),
        h('div', { class: 'cal-grid-only' }, grid(m, today, ms)),
        h('div', { class: 'cal-list-only' }, dayList(m, today, ms)),
        skippedList(m)),
      state.open ? (() => { const e = m.events.find((x) => x.key === state.open); return e ? editor(e) : null; })() : null,
      undated(m),
      listTwin(m));
  }
  return parts.filter(Boolean);
}

function weeksTab(c, mathCtx) {
  if (!c.sim) return h('p', { class: 'muted' }, 'No simulation for a month before the as-of date.');
  const w = weeks(c.sim);
  return h('section', { class: 'card', 'aria-labelledby': 'weeks-h' },
    h('h2', { id: 'weeks-h' }, 'Week by week'),
    h('p', { class: 'muted' }, 'What comes in, what goes out, and where checking ends each week (Sunday to Saturday). Everyday spending is spread across the days.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Week'), h('th', { class: 'num' }, 'In'), h('th', { class: 'num' }, 'Out'), h('th', { class: 'num' }, 'Ending balance'), h('th', { class: 'num' }, 'Lowest day'))),
      h('tbody', {}, w.map((x) => h('tr', { class: x.underFloor ? 'under' : x.hasLow ? 'tight' : '' }, h('td', {}, shortDate(x.from) + ' to ' + shortDate(x.to) + (x.hasLow ? ' (the lowest day)' : '')), h('td', { class: 'num' }, money(x.in)), h('td', { class: 'num' }, money(x.out)), h('td', { class: 'num' }, money(x.end)), h('td', { class: 'num' }, money(x.low.amount) + ' on ' + shortDate(x.low.date))))))),
    mathButton(['calendar:rangeCash'], () => ({ ...mathCtx(), range: { terms: rangeCashTerms(c.sim, w[0].from, w[w.length - 1].to), kind: c.sim.kind } }), 0, 'Show the math for the whole span'));
}

function agendaTab(c) {
  if (!c.sim) return h('p', { class: 'muted' }, 'No simulation for a month before the as-of date.');
  const a = agenda(c.sim, 14);
  return h('section', { class: 'card', 'aria-labelledby': 'agenda-h' },
    h('h2', { id: 'agenda-h' }, 'The next 14 days'),
    a.length ? h('div', {}, a.map((d) => h('div', { class: 'agenda-day' + (d.isLow ? ' low' : ''), 'data-date': d.date },
      h('p', { class: 'day-head' }, h('strong', {}, DOW[weekdayOf(d.date)] + ' ' + shortDate(d.date)), d.isLow ? h('span', { class: 'stage-chip stage-yellow' }, 'Lowest day') : null, d.underFloor ? h('span', { class: 'stage-chip stage-red' }, 'Under the floor') : null, h('span', { class: 'day-cash' }, 'ends at ' + money(d.end))),
      h('ul', { class: 'ev-list' }, d.events.map((e) => h('li', { class: 'ev' }, h('span', { class: 'sw ' + ({ income: 'viz-3', 'maybe-in': 'viz-5', bill: 'viz-1', paylater: 'viz-2', 'card-payment': 'viz-2', 'loan-payment': 'viz-2', 'extra-payment': 'viz-2', transfer: 'viz-3', interest: 'viz-2', 'late-fee': 'viz-2', statement: 'viz-0', shortfall: 'viz-5', everyday: 'viz-1', 'auto-cover': 'viz-3' }[e.kind] || 'viz-0'), 'aria-hidden': 'true' }), h('span', { class: 'ev-name' }, e.label + (e.kind === 'statement' ? ' (statement ' + money(e.statement) + ', due ' + shortDate(e.due) + ')' : e.kind === 'shortfall' ? ' (could not be paid without breaching the floor)' : '')), e.amount ? h('span', { class: 'ev-amt' }, (e.amount > 0 ? '+' : '-') + money(Math.abs(e.amount), !Number.isInteger(e.amount))) : null)))))) : h('p', { class: 'muted' }, 'Nothing but everyday spending in the next two weeks.'));
}

function paychecksTab(c, spine, mathCtx) {
  if (!c.sim) return h('p', { class: 'muted' }, 'No simulation for a month before the as-of date.');
  const list = paychecks(spine, rules, c.sim, mathCtx().s);
  const payEvents = c.months.flatMap((m) => m.events.filter((e) => e.kind === 'pay'));
  return h('section', { class: 'card', 'aria-labelledby': 'pay-h' },
    h('h2', { id: 'pay-h' }, 'Paycheck by paycheck ', h('span', { class: 'count' }, String(list.length))),
    h('p', { class: 'muted' }, 'Each paycheck, what it has to cover until the next one, and what is left. A bonus paycheck is the third biweekly or fifth weekly pay in a month.'),
    ...list.map((p) => {
      const ev = payEvents.find((e) => e.sourceId === p.streamId && e.date === p.date);
      return h('section', { class: 'card pay-card', 'aria-label': p.label + ' on ' + shortDate(p.date) },
        h('div', { class: 'pay-head' }, h('strong', {}, shortDate(p.date) + ': ' + p.label), h('span', { class: 'pay-amt' }, money(p.amount)), p.bonus ? h('span', { class: 'bonus-chip' }, 'Bonus paycheck') : null, h('span', { class: 'muted' }, p.until ? 'until ' + shortDate(p.until) : 'to the end of the window')),
        ev ? payFold(ev) : null,
        p.bonus ? h('p', { class: 'tile-sub' }, p.bonusWhy + (p.couldDo ? ' It could go to ' + p.couldDo.label.toLowerCase() + ': ' + money(p.couldDo.amount) + '. ' + p.couldDo.why : '')) : null,
        h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'What it covers'), h('th', {}, 'Date'), h('th', { class: 'num' }, 'Amount'))),
          h('tbody', {}, p.bills.map((b) => h('tr', {}, h('td', {}, b.label), h('td', {}, shortDate(b.date)), h('td', { class: 'num' }, money(b.amount))))),
          h('tfoot', {}, h('tr', {}, h('td', {}, h('span', { class: 'pay-left' + (p.short ? ' short' : '') }, p.short ? 'Short by' : 'Left after these')), h('td', {}), h('td', { class: 'num' }, money(Math.abs(p.left))))))),
        p.path ? h('a', { href: ledgerHref(p.path) }, 'View in the Ledger ›') : null,
        mathButton(['calendar:paycheckLeft'], () => ({ ...mathCtx(), paycheck: p })));
    }));
}

function yearTab(c, spine, mathCtx) {
  const y = yearStrip(spine, rules, { maybeMode: state.maybeMode });
  return h('section', { class: 'card', 'aria-labelledby': 'year-h' },
    h('h2', { id: 'year-h' }, 'The year, month by month ', h('span', { class: 'count' }, y.tightCount + ' tight')),
    h('p', { class: 'muted' }, 'A month is tight when its lowest day comes within a week of everyday spending (' + money(y.tightWeek) + ') of the floor' + (y.floor ? ' (' + money(y.floor) + ')' : '') + '; red when it goes under.'),
    h('div', { class: 'year-strip', role: 'list' }, y.months.map((m) => h('div', { class: 'ys' + (m.underFloor ? ' under' : m.tight ? ' tight' : ''), role: 'listitem', 'aria-label': longMonth(m.ym) + ', lowest ' + money(m.low) + (m.tight ? ', tight' : '') }, h('b', {}, MONTH_NAMES[+m.ym.slice(5, 7) - 1].slice(0, 3)), h('span', { class: 'ys-low' }, money(m.low)), m.underFloor ? h('span', { class: 'pill' }, 'under') : m.tight ? h('span', { class: 'pill' }, 'tight') : null))),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Month'), h('th', { class: 'num' }, 'In'), h('th', { class: 'num' }, 'Out'), h('th', { class: 'num' }, 'Net'), h('th', { class: 'num' }, 'Lowest day'), h('th', { class: 'num' }, 'Interest'))),
      h('tbody', {}, y.months.map((m) => h('tr', { class: m.underFloor ? 'under' : m.tight ? 'tight' : '' }, h('td', {}, h('button', { type: 'button', class: 'ev-tap', onclick: () => { state.ym = m.ym; state.tab = 'month'; keep(KEY, state.ym); render(); window.scrollTo({ top: 0 }); } }, longMonth(m.ym))), h('td', { class: 'num' }, money(m.in)), h('td', { class: 'num' }, money(m.out)), h('td', { class: 'num' }, money(m.net)), h('td', { class: 'num' }, money(m.low) + (m.tight ? ' (tight)' : '')), h('td', { class: 'num' }, money(m.interest))))))),
    h('p', { class: 'tile-note' }, chip(y.kind === 'computed' ? 'known' : y.kind), ' Twelve months from the as-of date, from the day-by-day simulation. Tap a month to open it.'));
}

// ---------------------------------------------------------------- the tray, milestones, search
function trayCard(c) {
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
    tryApply((s) => addMaybe(s, { label: label.value, amount: a.value, likelihood: l.value, direction: dir.value, date: dateIn.value || null }).spine, 'Maybe money: ' + label.value.trim() + (dateIn.value ? ' on ' + shortDate(dateIn.value) : ' in the tray'));
  } },
    h('label', { for: 'tray-label', class: 'edit-label' }, 'What might come in or go out'), label,
    h('label', { for: 'tray-amount', class: 'edit-label' }, 'How much'), amount,
    h('label', { for: 'tray-likely', class: 'edit-label' }, 'How likely, as a percent'), likely,
    h('label', { for: 'tray-dir', class: 'edit-label' }, 'Direction'), dir,
    h('label', { for: 'tray-date', class: 'edit-label' }, 'On a day (optional; blank keeps it in the tray)'), dateIn,
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add maybe money')));
  return h('section', { class: 'card tray', id: 'tray', 'aria-labelledby': 'tray-h' },
    h('h2', { id: 'tray-h' }, 'Maybe money ', h('span', { class: 'count' }, String(c.tray.length))),
    h('p', { class: 'muted' }, 'Money that might come (or go) and is not in the plan until it has a day. Drag an item\'s grip onto a day, or pick a day and put it there. On the calendar it counts at its likelihood in the cash line.'),
    c.tray.length ? h('ul', { class: 'tray-list' }, c.tray.map((m) => { const d = h('input', { type: 'date', 'aria-label': 'Day for ' + m.label }); return h('li', { class: 'tray-item', 'data-key': 'maybe:' + m.id, 'data-drag': 'maybe', 'data-maybe': m.id }, h('span', { class: 'grip', title: 'Drag onto a day', 'aria-hidden': 'true' }, '⋮⋮'), h('span', {}, h('strong', {}, m.label), h('span', { class: 'choice-sub' }, ' ' + Math.round(m.likelihood * 100) + '% likely, ' + (m.direction === 'out' ? 'out' : 'in'))), h('span', { class: 'tray-amt' }, money(m.amount)), d, h('button', { type: 'button', class: 'btn small', onclick: () => { if (!d.value) { lastSaved = 'Pick a day for ' + m.label + ' first.'; render(); return; } tryApply((s) => setMaybeDate(s, m.id, d.value), m.label + ' on ' + shortDate(d.value)); } }, 'Put it on that day'), h('button', { type: 'button', class: 'btn ghost small', onclick: () => tryApply((s) => removeMaybe(s, m.id), m.label + ' removed') }, 'Remove')); })) : h('p', { class: 'muted' }, 'The tray is empty.'),
    h('details', { class: 'later-list' }, h('summary', {}, 'Add maybe money'), form));
}

function milestonesCard(c, spine) {
  if (!c.sim) return null;
  const ms = milestones(spine, rules, c.sim, c.months);
  return h('section', { class: 'card', 'aria-labelledby': 'ms-h' },
    h('h2', { id: 'ms-h' }, 'Milestones ', h('span', { class: 'count' }, String(ms.length))),
    ms.length ? [h('ul', { class: 'ms-line', 'aria-label': 'Milestones in date order' }, ms.map((x) => h('li', {}, h('span', { class: 'ms-date' }, shortDate(x.date)), x.path ? h('a', { href: ledgerHref(x.path) }, x.label) : x.label, x.note ? h('span', { class: 'ev-note' }, x.note) : null))), h('p', { class: 'muted' }, 'Cards cleared, loans paid off, promo rates ending, income starting or ending, inside the ' + window_ + '-month window. Markers sit on their days in the month view.')] : h('p', { class: 'muted' }, 'No milestone falls inside the ' + window_ + '-month window. A longer window may show when a card clears.'));
}

function searchCard(c) {
  const box = h('input', { class: 'search-box', type: 'search', id: 'cal-search', placeholder: 'Find an item by name (press /)', 'aria-label': 'Find an item', autocomplete: 'off' });
  box.value = state.q;
  box.addEventListener('input', () => { state.q = box.value; const hits = searchEvents(c.months, state.q); list.replaceChildren(...results(hits)); });
  const results = (hits) => (state.q && !hits.length ? [h('li', { class: 'muted' }, 'Nothing matches.')] : hits.slice(0, 30).map((e) => h('li', {}, (e.date ? shortDate(e.date) : 'No day yet') + ': ', e.path ? h('a', { href: ledgerHref(e.path) }, e.label) : e.label, e.amount !== null ? ', ' + (e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : '') + money(e.amount) : '', e.key ? [' ', h('button', { type: 'button', class: 'ev-tap', onclick: () => { state.open = e.key; state.ym = e.ym; state.tab = 'month'; render(); } }, 'open')] : null)));
  const list = h('ul', { class: 'flow-list' }, ...results(searchEvents(c.months, state.q)));
  return h('section', { class: 'card', 'aria-label': 'Search' }, box, list);
}

// ---------------------------------------------------------------- drag to reschedule (S-204)
// Pointer events on a grip: a drag past 14px lifts the item; dropping it on a day moves
// that one occurrence (or puts a tray item on that day). A tap stays a tap.
function dragSetup(root) {
  let drag = null;
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el ? el.closest('[data-date]') : null; };
  root.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip'); if (!grip) return;
    const item = grip.closest('[data-drag]'); if (!item) return;
    drag = { item, kind: item.dataset.drag, key: item.dataset.key, maybeId: item.dataset.maybe, x: e.clientX, y: e.clientY, moving: false, ghost: null, over: null, id: e.pointerId };
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moving) { if (Math.hypot(dx, dy) < 14) return; drag.moving = true; drag.item.classList.add('dragging'); drag.ghost = h('div', { class: 'drag-ghost' }, drag.item.querySelector('.ev-name, strong')?.textContent || 'Item'); document.body.append(drag.ghost); }
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
    if (!d.moving || !drop) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const date = cell.dataset.date;
    if (d.kind === 'maybe') tryApply((s) => setMaybeDate(s, d.maybeId, date), 'Maybe money put on ' + shortDate(date));
    else tryApply((s) => moveOccurrence(s, d.key, date), d.key.split('|')[0] + ' moved to ' + shortDate(date));
  };
  root.addEventListener('pointerup', (e) => finish(e, true));
  root.addEventListener('pointercancel', (e) => finish(e, false));
}

// ---------------------------------------------------------------- render
function render() {
  const spine = withScenario(hist.present, rules, pickedScenario());
  const asOfYm = spine.meta.asOf.slice(0, 7);
  if (!state.ym) state.ym = asOfYm;
  const c = calendar(spine, rules, { from: state.ym, months: window_, maybeMode: state.maybeMode });
  simFloor = c.sim ? c.sim.floor.amount : null;
  const today = todayIso();
  const mathCtx = () => ({ spine, rules, s: summarize(spine, rules, { flags: false }) });
  const ms = c.sim ? milestones(spine, rules, c.sim, c.months) : [];
  const go = (n) => { state.ym = addMonths(state.ym, n); state.open = null; keep(KEY, state.ym); render(); window.scrollTo({ top: 0 }); };
  const focusId = document.activeElement && document.activeElement.id;
  const caret = focusId === 'cal-search' ? document.activeElement.selectionStart : null;
  app.replaceChildren(...[
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'dashboard.html' }, 'Dashboard'), h('a', { href: 'ledger.html' }, 'Ledger'), h('a', { href: 'windfall.html' }, 'Windfall'), h('a', { href: 'math.html' }, 'All formulas')),
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Cash flow calendar'), h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(c.asOf), ' · ', SOURCE_WORDS[source])),
      h('nav', { class: 'top-actions' }, h('button', { type: 'button', class: 'btn', disabled: !canUndo(hist), title: canUndo(hist) ? 'Undo ' + undoLabel(hist) : null, onclick: () => { const before = hist; hist = undo(hist); if (hist !== before) { save(hist.present); lastSaved = 'Undone: ' + undoLabel(before) + '.'; render(); } } }, canUndo(hist) ? 'Undo' : 'Nothing to undo'))),
    h('p', { class: 'saved-line', role: 'status', 'aria-live': 'polite' }, lastSaved || ''),
    windowBar(window_, (n) => { window_ = n; render(); }),
    h('div', { class: 'month-nav', role: 'group', 'aria-label': 'Pick a month' },
      h('button', { type: 'button', class: 'btn', onclick: () => go(-1) }, '‹ ' + monthWords(addMonths(state.ym, -1))),
      h('h2', { class: 'month-h', 'aria-live': 'polite' }, longMonth(state.ym) + (window_ > 1 ? ' and ' + (window_ - 1) + ' more' : ''), state.ym === asOfYm ? h('span', { class: 'stage-chip stage-green' }, 'This month') : null),
      h('button', { type: 'button', class: 'btn', onclick: () => go(1) }, monthWords(addMonths(state.ym, 1)) + ' ›'),
      state.ym !== asOfYm ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.ym = asOfYm; keep(KEY, state.ym); render(); } }, 'Back to this month') : null),
    h('div', { class: 'tabs', role: 'group', 'aria-label': 'Views' }, TABS.map(([id, label]) => h('button', { type: 'button', class: 'tab-btn', 'aria-pressed': String(state.tab === id), onclick: () => { state.tab = id; state.open = null; render(); } }, label))),
    searchCard(c),
    ...(state.tab === 'month' ? monthTab(c, today, ms, mathCtx) : state.tab === 'weeks' ? [weeksTab(c, mathCtx)] : state.tab === 'agenda' ? [agendaTab(c)] : state.tab === 'paychecks' ? [paychecksTab(c, spine, mathCtx)] : [yearTab(c, spine, mathCtx)]),
    trayCard(c),
    milestonesCard(c, spine),
    h('p', { class: 'muted' }, 'Maybe money is weighted by how likely it is. Cards are paid by their pay setting on their due days; the extra at the debt follows the debt plan in the Ledger.')].filter(Boolean));
  if (focusId === 'cal-search') { const i = document.getElementById('cal-search'); if (i) { i.focus({ preventScroll: true }); i.setSelectionRange(caret, caret); } }
}

document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
  const i = document.getElementById('cal-search'); if (i) { e.preventDefault(); i.focus(); }
});

loadAll().then((loaded) => {
  hist = createHistory(loaded.spine); rules = loaded.rules; source = loaded.source;
  const asOfYm = loaded.spine.meta.asOf.slice(0, 7);
  const want = location.hash.slice(1);
  const saved = read(KEY, (v) => /^\d{4}-\d{2}$/.test(v || ''), null);
  state.ym = /^\d{4}-\d{2}$/.test(want) ? want : saved || asOfYm;
  dragSetup(app);
  render();
  if (loaded.problem) app.prepend(h('p', { class: 'card', role: 'alert' }, loaded.problem));
}).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The calendar could not load: ' + err.message)); });
