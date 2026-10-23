// The cash flow calendar (S-200): one month at a time, every dated event on
// its day, the undated ones under "Sometime this month", and the month's cash
// at its end from the projection. From 640px the month is a seven-column
// grid; on a phone it is a list by day (DESIGN.md 14). Every event links to
// the Ledger field behind it. Formatting only: the engine is engine/calendar.js.

import { calendar, weekdayOf } from '../engine/calendar.js';
import { loadAll, SOURCE_WORDS } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { h, chip, money, shortDate, monthWords, ledgerHref } from './view.js';

const app = document.getElementById('app');
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const longMonth = (ym) => MONTH_NAMES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
const addMonths = (ym, n) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; return (y + Math.floor(m / 12)) + '-' + String(((m % 12) + 12) % 12 + 1).padStart(2, '0'); };

// Data colors by what moves (DESIGN.md 8): one per category, named in a legend.
const CAT = { pay: 'viz-3', bill: 'viz-1', subscription: 'viz-1', debt: 'viz-2', saving: 'viz-3', setAside: 'viz-4', taxReturn: 'viz-4', estimatedTax: 'viz-4', promoEnds: 'viz-2', incomeStarts: 'viz-0', incomeEnds: 'viz-0', expenseStarts: 'viz-0', expenseEnds: 'viz-0', coverage: 'viz-0', situation: 'viz-0' };
const LEGEND = [['viz-3', 'Money in, and saving'], ['viz-1', 'Bills'], ['viz-2', 'Debt payments and rates'], ['viz-4', 'Tax'], ['viz-0', 'Dates: something starts, ends or changes']];

let base, rules, source, ym;

// One event: a swatch, the words (a link to its field), the amount with its direction.
function eventEl(e, { small = false } = {}) {
  const amt = e.amount === null ? null : (e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : '') + money(e.amount, !Number.isInteger(e.amount));
  const name = e.path ? h('a', { href: ledgerHref(e.path) }, e.label) : h('span', {}, e.label);
  return h('li', { class: 'ev ev-' + e.kind + (e.rough ? ' ev-rough' : '') + (small ? ' ev-small' : '') },
    h('span', { class: 'sw ' + (CAT[e.kind] || 'viz-0'), 'aria-hidden': 'true' }),
    h('span', { class: 'ev-name' }, name, e.rough ? h('span', { class: 'ev-tag' }, 'rough') : null, !e.counted && e.amount !== null ? h('span', { class: 'ev-tag' }, 'not added to the total') : null),
    amt ? h('span', { class: 'ev-amt' }, amt) : null,
    e.note && !small ? h('span', { class: 'ev-note' }, e.note) : null);
}

function dayHead(d, today) {
  return h('p', { class: 'day-head' }, h('strong', {}, DOW[weekdayOf(d.date)] + ' ' + d.day), d.date === today ? h('span', { class: 'stage-chip stage-green' }, 'Today') : null,
    h('span', { class: 'day-sum' }, (d.in ? '+' + money(d.in) : '') + (d.in && d.out ? ' ' : '') + (d.out ? '-' + money(d.out) : '')));
}

// The phone form: days as a list, nothing in between.
function dayList(m, today) {
  if (!m.days.length) return h('p', { class: 'muted' }, 'Nothing lands on a known day this month. Enter pay days and bill days in the Ledger to see them here.');
  return h('ol', { class: 'day-list' }, m.days.map((d) => h('li', { class: 'day' + (d.date === today ? ' today' : '') }, dayHead(d, today), h('ul', { class: 'ev-list' }, d.events.map((e) => eventEl(e))))));
}

// The desktop form: a seven-column grid, weeks as rows.
function grid(m, today) {
  const first = m.ym + '-01';
  const lead = weekdayOf(first);
  const n = new Date(Date.UTC(+m.ym.slice(0, 4), +m.ym.slice(5, 7), 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'cell empty', 'aria-hidden': 'true' }));
  for (let day = 1; day <= n; day++) {
    const date = m.ym + '-' + String(day).padStart(2, '0');
    const d = m.days.find((x) => x.date === date);
    cells.push(h('div', { class: 'cell' + (date === today ? ' today' : '') + (d ? ' has' : ''), role: 'listitem', 'aria-label': DOW[weekdayOf(date)] + ' ' + day + (d ? ', ' + d.events.length + ' item' + (d.events.length === 1 ? '' : 's') : '') },
      h('p', { class: 'cell-day' }, String(day), date === today ? h('span', { class: 'cell-today' }, 'today') : null),
      d ? h('ul', { class: 'ev-list' }, d.events.map((e) => eventEl(e, { small: true }))) : null));
  }
  return h('div', { class: 'grid-wrap' },
    h('div', { class: 'grid-dow', 'aria-hidden': 'true' }, DOW.map((x) => h('span', {}, x))),
    h('div', { class: 'grid', role: 'list' }, cells));
}

function summary(m) {
  const cash = m.cash;
  const cashWords = cash.value === null ? cash.note : (cash.when === 'now' ? 'Cash today: ' : 'Cash at the end of the month: ') + money(cash.value) + '.';
  return h('section', { class: 'card month-sum', 'aria-label': 'This month in one line' },
    h('p', { class: 'flow-total' }, (m.net >= 0 ? money(m.net) + ' more comes in than goes out' : money(-m.net) + ' more goes out than comes in') + ' on the calendar this month.'),
    h('p', { class: 'tile-sub' }, 'Comes in ' + money(m.in) + '; goes out ' + money(m.out) + ' (bills, minimums, saving and the tax set-aside). Lines with no amount or marked "not added" are not in these totals.'),
    h('p', { class: 'tile-sub' }, chip(cash.kind === 'computed' ? 'known' : cash.kind), ' ', cashWords, cash.path ? [' ', h('a', { href: ledgerHref(cash.path) }, 'View in the Ledger')] : null),
    h('p', { class: 'tile-note' }, 'A rough tag means the day or the amount is a guess (a house default, or a rough number). The totals use what is on the calendar; the month-end cash uses the whole month from the projection, undated items included.'));
}

function undated(m) {
  if (!m.undated.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'undated-h' },
    h('h2', { id: 'undated-h' }, 'Sometime this month ', h('span', { class: 'count' }, String(m.undated.length))),
    h('p', { class: 'muted' }, 'These have no day yet. Open one and enter the day it is paid to put it on the calendar.'),
    h('ul', { class: 'ev-list' }, m.undated.map((e) => eventEl(e))));
}

function listTwin(m) {
  const all = [...m.days.flatMap((d) => d.events), ...m.undated];
  return h('details', { class: 'flow-list card' }, h('summary', {}, 'Every item this month as a list, with links to the Ledger (' + all.length + ')'),
    h('ul', {}, all.map((e) => h('li', {}, (e.date ? shortDate(e.date) : 'No day yet') + ': ', e.path ? h('a', { href: ledgerHref(e.path) }, e.label) : e.label, e.amount !== null ? ', ' + (e.direction === 'in' ? 'in ' : e.direction === 'out' ? 'out ' : '') + money(e.amount, !Number.isInteger(e.amount)) : '', e.rough ? ' (rough)' : '', e.note ? ' (' + e.note + ')' : ''))));
}

function render() {
  const spine = withScenario(base, rules, pickedScenario());
  const c = calendar(spine, rules, { from: ym, months: 1 });
  const m = c.months[0];
  const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  const asOfYm = c.asOf.slice(0, 7);
  const go = (n) => { ym = addMonths(ym, n); keep(); render(); window.scrollTo({ top: 0 }); };
  const used = new Set(m.events.map((e) => CAT[e.kind] || 'viz-0'));
  app.replaceChildren(
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'dashboard.html' }, 'Dashboard'), h('a', { href: 'ledger.html' }, 'Ledger'), h('a', { href: 'windfall.html' }, 'Windfall'), h('a', { href: 'math.html' }, 'All formulas')),
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Cash flow calendar'), h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(c.asOf), ' · ', SOURCE_WORDS[source]))),
    h('div', { class: 'month-nav', role: 'group', 'aria-label': 'Pick a month' },
      h('button', { type: 'button', class: 'btn', onclick: () => go(-1) }, '‹ ' + monthWords(addMonths(ym, -1))),
      h('h2', { class: 'month-h', 'aria-live': 'polite' }, longMonth(ym), ym === asOfYm ? h('span', { class: 'stage-chip stage-green' }, 'This month') : null),
      h('button', { type: 'button', class: 'btn', onclick: () => go(1) }, monthWords(addMonths(ym, 1)) + ' ›'),
      ym !== asOfYm ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { ym = asOfYm; keep(); render(); } }, 'Back to this month') : null),
    summary(m),
    h('section', { class: 'card cal', 'aria-labelledby': 'cal-h' },
      h('h2', { id: 'cal-h' }, 'On the days'),
      h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' }, LEGEND.filter(([cc]) => used.has(cc)).map(([cc, t]) => h('li', {}, h('span', { class: 'sw ' + cc, 'aria-hidden': 'true' }), t)), m.events.some((e) => e.rough) ? h('li', {}, h('span', { class: 'ev-tag' }, 'rough'), ' a guessed day or amount') : null),
      h('div', { class: 'cal-grid-only' }, grid(m, today)),
      h('div', { class: 'cal-list-only' }, dayList(m, today))),
    undated(m),
    listTwin(m),
    h('p', { class: 'muted' }, 'Shows the ' + c.mode + ' view: maybe money counts at how likely it is. Only minimum payments are paid; the surplus stays in cash. Cash at month end follows the assumption set picked on the Dashboard.'));
}

const KEY = 'slam-calendar:v1';
const keep = () => { try { localStorage.setItem(KEY, ym); } catch { /* storage blocked: the month lasts until the page closes */ } };

loadAll().then((loaded) => {
  base = loaded.spine; rules = loaded.rules; source = loaded.source;
  const asOfYm = base.meta.asOf.slice(0, 7);
  const want = location.hash.slice(1);
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  ym = /^\d{4}-\d{2}$/.test(want) ? want : /^\d{4}-\d{2}$/.test(saved || '') ? saved : asOfYm;
  render();
  if (loaded.problem) app.prepend(h('p', { class: 'card', role: 'alert' }, loaded.problem));
}).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The calendar could not load: ' + err.message)); });
