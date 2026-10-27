// The Spending page (S-206, on the shell since S-230): safe to spend, the five-second logger, per-tag budgets with
// their pace, the burn tiers, where the money goes with the cut simulator, the bill autopsy, "can I spend this",
// price increases and free trials, the check-in (drift, momentum, staleness) and the month-end sweep.
// Screen by screen: a category in "where it goes" is its own screen (spending.html#/accommodation), and each of its
// lines is one more (spending.html#/accommodation/rent): Spending > Housing > Rent.
// The shell (ui/shell.js) draws the tabs, the header with Undo and Redo, Back and the trail, and the undo bar; every
// change goes through its change() with words. Every number comes from engine/spending.js, engine/cashsim.js,
// engine/compare.js and the summary; every number has Show the math. Formatting only.

import { startPage, change, said, keep, kept, refresh } from './shell.js';
import { gapsCard } from './page.js';
import { summarize } from '../engine/summary.js';
import { cashsim, burnTiers } from '../engine/cashsim.js';
import { spendingView, cutSimulator, canISpend, checkInForecast, cleanMerchant, TAG_WORDS, referenceBands, fixedVariable } from '../engine/spending.js';
import { spendingStart } from '../engine/profile.js';
import { estimatedVsActual, monthOutlook } from '../engine/compare.js';
import { waiting } from '../engine/calendar-views.js';
import { realHourlyWage } from '../engine/plan.js';
import { proposeCsv, proposeBudget, applyImport, budgetDocsFromStorage, FORMATS } from '../engine/feed.js';
import { logSpend, removeLog, checkIn, setSweep, parseInput, removeItem, putFact, setFixed } from '../engine/edits.js';
import { FAT } from '../engine/schema.js';
import { mathButton } from './math-panel.js';
import { paidWithBox } from './card-charges.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { pickedWindow, keepWindow, windowBar, WINDOWS } from './window.js';
import { h, chip, money, shortDate, monthWords, ledgerHref } from './view.js';

const VIZ = ['viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5'];
const TAGS = [...FAT, 'other'];
const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const pc = (f) => Math.round(f * 1000) / 10 + '%';
const cents = (x) => money(x, !Number.isInteger(x));
// A level on this page: at('accommodation', 'rent') is "#/accommodation/rent" (the shell opens it as its own screen).
const at = (...levels) => '#/' + levels.map(encodeURIComponent).join('/');
// "Gym", "Gym and Streaming", "Gym, Streaming and Phone".
const listWords = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const chev = () => h('span', { class: 'chev', 'aria-hidden': 'true' }, '›');
const HOURS_WORK = 'household.workHoursPerWeek';

// The merchant rules the statement reader uses; optional (without them every line is new).
let merchantRules = { kindRules: {}, rules: [] };
try { const r = await fetch(new URL('../data/merchant-rules.json', import.meta.url), { cache: 'no-store' }); if (r.ok) merchantRules = await r.json(); } catch { /* every line reads as new */ }

let rules = null;
// The real hourly wage, said beside the Preferences link (hours of work now follow Preferences on every screen).
let wage = null;
// What the page's forms hold between redraws.
const form = { csv: '', csvFormat: 'auto', csvWith: 'cash', proposals: null, picks: null, importWords: '', amount: '', tag: 'other', paidWith: 'cash', merchant: '', expenseId: '', date: todayIso(), checkDate: todayIso() };

// The cut simulator's picks: the lines tried without, across every screen of this page and kept in this browser tab,
// so drilling in and coming back keeps them. Nothing in the household changes until "Cut them from my plan".
const CUT_KEY = 'slam-cut:v1';
let cutPick = (() => { try { const v = JSON.parse(sessionStorage.getItem(CUT_KEY) || 'null'); if (v && Array.isArray(v.dropped)) return { dropped: v.dropped.map(String), towardDebt: v.towardDebt === true }; } catch { /* storage blocked */ } return { dropped: [], towardDebt: false }; })();
function keepCut(next) { cutPick = next; try { sessionStorage.setItem(CUT_KEY, JSON.stringify(next)); } catch { /* lasts until the page closes */ } }
function toggleCut(id) { keepCut({ ...cutPick, dropped: cutPick.dropped.includes(id) ? cutPick.dropped.filter((x) => x !== id) : [...cutPick.dropped, id] }); refresh(); }

// The time picker: kept with this screen (coming back restores it) and in this browser, so the Calendar and the
// deeper screens read the same window.
function monthsOf(state) {
  const n = state && state.months;
  if (WINDOWS.some(([w]) => w === n)) { if (n !== pickedWindow()) keepWindow(n); return n; }
  return pickedWindow();
}

// ---------------------------------------------------------------- everything the screens read, from one run
let memo = null;
function model(base, rules_, months) {
  const scen = pickedScenario(), day = todayIso();
  if (memo && memo.base === base && memo.rules === rules_ && memo.months === months && memo.scen === scen && memo.day === day) return memo;
  const spine = withScenario(base, rules_, scen);
  const s = summarize(spine, rules_, { flags: false });
  const sim = cashsim(spine, rules_, { months });
  const vw = spendingView(spine, rules_, sim, s, { today: day });
  const compare = estimatedVsActual(spine, rules_, { months });
  const tiers = burnTiers(spine, rules_, s.cashflow, { extra: spine.debtPlan && spine.debtPlan.extra && spine.debtPlan.extra.value !== null ? spine.debtPlan.extra.value : 0 });
  memo = { base, rules: rules_, months, scen, day, spine, s, sim, vw, compare, tiers, fv: fixedVariable(spine, rules_, s), cats: categories(vw), canCut: new Set(s.cashflow.expenses.items.filter((i) => i.amount).map((i) => i.id)), wage: realHourlyWage(spine, rules_, s).wage };
  memo.ctx = () => ({ spine, rules: rules_, s, sim, spend: vw, tiers, compare });
  return memo;
}

// The categories in "where it goes", each with its lines: the four tags (every line in the tag, one with no amount
// too), then the debt minimums. A category with no lines is not a screen.
function categories(vw) {
  const slice = (id) => vw.donut.slices.find((x) => x.id === id) || null;
  const cats = vw.tags.rows.filter((r) => r.items.length).map((r) => ({ id: r.tag, label: r.label, tag: r, slice: slice(r.tag), lines: r.items }));
  const mins = slice('minimums');
  if (mins && mins.items.length) cats.push({ id: 'minimums', label: mins.label, tag: null, slice: mins, lines: mins.items });
  return cats;
}
const catOf = (m, id) => m.cats.find((c) => c.id === id) || null;
// Where a line opens: its own screen under its category, or null when it is in none.
function lineHref(m, id, minimum = false) {
  const c = minimum ? catOf(m, 'minimums') : m.cats.find((x) => x.id !== 'minimums' && x.lines.some((l) => l.id === id));
  return c && c.lines.some((l) => l.id === id) ? at(c.id, id) : null;
}
// A line's name, linked to its screen (or to My numbers when it has none).
const lineLink = (m, id, label, path, minimum = false) => { const href = lineHref(m, id, minimum); return href ? h('a', { href }, label, ' ', chev()) : h('a', { href: ledgerHref(path) }, label); };

// A fold this screen keeps open across Back and a reload; one open at a time (they share a name).
function fold(id, cls, summary, ...body) {
  const d = h('details', { class: cls, name: 'spend-fold', open: kept().open === id }, h('summary', {}, summary), ...body);
  d.addEventListener('toggle', () => { if (!d.isConnected) return; if (d.open) keep({ open: id }); else if (kept().open === id) keep({ open: null }); });
  return d;
}

// ---------------------------------------------------------------- pieces of the top screen

function safeCard(m) {
  const s = m.vw.safe;
  return h('section', { class: 'card', 'aria-labelledby': 'safe-h' },
    h('h2', { id: 'safe-h' }, 'Safe to spend'),
    s.today === null ? [h('p', { class: 'muted missing-row' }, 'Missing: a checking balance.'), gapsCard(m.spine, m.sim)] : [
      gapsCard(m.spine, m.sim),
      h('div', { class: 'safe-row' }, h('p', { class: 'safe-big' + (s.today < 0 ? ' low' : '') }, money(s.today)), h('span', { class: 'muted' }, s.shortfall ? 'short by ' + shortDate(s.shortfall.date) : s.daysUntil ? 'until the next paycheck on ' + shortDate(s.nextIncome) + ' (' + s.daysUntil + ' days): ' + money(s.perDay) + ' a day' : 'to the end of the window')),
      s.shortfall ? h('p', { class: 'verdict no' }, 'Nothing safe to spend: checking runs ' + money(s.shortfall.amount) + ' short' + (s.floor > 0 ? ' of the floor' : '') + ' by ' + shortDate(s.shortfall.date) + '.') : null,
      h('p', { class: 'tile-sub' }, kindChip(s.kind), s.binding === 'low'
        ? ' Set by the lowest day ahead: ' + money(s.low.amount) + ' on ' + shortDate(s.low.date) + '. Spending more today takes that day lower.'
        : ' Cash outside the cushion, less bills due before ' + shortDate(s.through) + ', less the floor.', s.setAsideNote ? ' ' + s.setAsideNote : ''),
      s.low ? h('p', {}, h('a', { href: 'calendar.html#' + s.low.date.slice(0, 7) }, 'See ' + shortDate(s.low.date) + ' on the calendar')) : null,
      mathButton(['spend:safeToday', ...(s.daysUntil && !s.shortfall ? ['spend:safePerDay'] : [])], m.ctx)]);
}

// One logged purchase: when, where, on what, how much, and Remove (it never asks; the bar offers Undo).
function logItem(spine, e) {
  const what = 'The ' + cents(e.amount) + (e.kind === 'refund' ? ' refund' : e.kind === 'income' ? ' income' : ' purchase') + (e.merchant ? ' at ' + e.merchant : '') + ' on ' + shortDate(e.date);
  return h('li', {},
    h('span', {}, shortDate(e.date)), h('span', {}, h('strong', {}, e.merchant || (e.kind === 'refund' ? 'Refund' : e.kind === 'income' ? 'Income' : 'Spend')), e.expenseId ? ' (' + ((spine.expenses.find((x) => x.id === e.expenseId) || {}).label || e.expenseId) + ')' : e.tag ? ' (' + TAG_WORDS[e.tag].toLowerCase() + ')' : ''), e.paidWith && e.paidWith !== 'cash' ? h('span', { class: 'pill' }, ((spine.debts || []).find((d) => d.id === e.paidWith) || {}).name?.value || e.paidWith) : null, e.source === 'import' ? h('span', { class: 'pill' }, 'imported') : null,
    h('span', { class: 'log-amt' }, (e.kind === 'refund' ? '+' : e.kind === 'income' ? '+' : '-') + cents(e.amount)),
    h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'Remove ' + what, onclick: () => change((s) => removeLog(s, e.id), said.deleted(what)) }, 'Remove'));
}

// The five-second logger: amount, a tag chip, paid with, a merchant (cleaned as you type), Add.
function loggerCard(m) {
  const spine = m.spine;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'log-amount', class: 'amount-box', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Amount' });
  amount.value = form.amount;
  amount.addEventListener('input', () => { form.amount = amount.value; });
  const merchant = h('input', { id: 'log-merchant', type: 'text', autocomplete: 'off', placeholder: 'Store or website' });
  merchant.value = form.merchant;
  const hint = h('p', { class: 'merchant-hint' }, form.merchant && cleanMerchant(form.merchant) && cleanMerchant(form.merchant) !== form.merchant.trim() ? 'Reads as ' + cleanMerchant(form.merchant) : '');
  merchant.addEventListener('input', () => { form.merchant = merchant.value; const c = cleanMerchant(merchant.value); hint.textContent = c && c !== merchant.value.trim() ? 'Reads as ' + c : ''; });
  const paid = h('select', { id: 'log-paid', 'aria-label': 'Paid with', onchange: () => { form.paidWith = paid.value; } }, h('option', { value: 'cash' }, 'Cash or debit'), ...(spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => h('option', { value: d.id }, d.name && d.name.value ? d.name.value : d.id)));
  paid.value = form.paidWith;
  const line = h('select', { id: 'log-line', 'aria-label': 'A line it belongs to', onchange: () => { form.expenseId = line.value; } }, h('option', { value: '' }, 'None'), ...(spine.expenses || []).map((e) => h('option', { value: e.id }, e.label)));
  line.value = form.expenseId;
  const date = h('input', { id: 'log-date', type: 'date', 'aria-label': 'Day', onchange: () => { form.date = date.value; } }); date.value = form.date;
  const chips = h('div', { class: 'tag-chips', role: 'group', 'aria-label': 'Tag' }, TAGS.map((t) => h('button', { type: 'button', class: 'tag-chip', 'aria-pressed': String(form.tag === t), onclick: () => { form.tag = t; for (const b of chips.children) b.setAttribute('aria-pressed', String(b.textContent === TAG_WORDS[t])); } }, TAG_WORDS[t])));
  const submit = (kind) => {
    const p = parseInput('money', amount.value);
    if (!p.ok) { msg.textContent = p.message; amount.focus(); return; }
    const was = { amount: form.amount, merchant: form.merchant };
    form.amount = ''; form.merchant = ''; form.paidWith = paid.value; form.expenseId = line.value; form.date = date.value || todayIso();
    const exp = line.value ? spine.expenses.find((e) => e.id === line.value) : null;
    const on = exp ? exp.label : TAG_WORDS[form.tag].toLowerCase();
    const ok = change((s) => logSpend(s, { amount: p.value, date: form.date, kind, tag: exp ? exp.fat || 'other' : form.tag, expenseId: line.value || null, merchant: cleanMerchant(merchant.value), note: merchant.value.trim() && cleanMerchant(merchant.value) !== merchant.value.trim() ? merchant.value.trim() : null, paidWith: paid.value }).spine,
      said.added('A ' + cents(p.value) + (kind === 'refund' ? ' refund' : ' purchase') + ' on ' + on));
    if (!ok) { Object.assign(form, was); refresh(); }
  };
  const entries = m.vw.log;
  return h('section', { class: 'card', id: 'log', 'aria-labelledby': 'log-h' },
    h('h2', { id: 'log-h' }, 'Add a purchase ', h('span', { class: 'count' }, String(entries.length) + ' this month')),
    h('form', { class: 'logger', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit('spend'); } },
      h('label', { for: 'log-amount', class: 'edit-label' }, 'How much'), amount,
      chips,
      h('label', { for: 'log-line', class: 'edit-label' }, 'Which bill (optional)'), line,
      h('label', { for: 'log-paid', class: 'edit-label' }, 'Paid with'), paid,
      h('label', { for: 'log-merchant', class: 'edit-label' }, 'Where (optional)'), merchant, hint,
      h('label', { for: 'log-date', class: 'edit-label' }, 'Day'), date,
      msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add it'), h('button', { type: 'button', class: 'btn', onclick: () => submit('refund') }, 'Add as a refund'))),
    entries.length ? h('ul', { class: 'log-list', 'aria-label': 'This month\'s log' }, entries.map((e) => logItem(spine, e))) : h('p', { class: 'muted' }, 'Nothing added this month.'));
}

// One tag's bar: spent against the budget, with a mark where the budget expects you to be today.
function budgetCell(r) {
  if (r.budget === null) return h('span', { class: 'missing-row' }, 'Missing an amount');
  const spentShare = r.budget ? Math.min(1, r.spent / r.budget) : 0;
  const markShare = r.expected !== null && r.budget ? Math.min(1, r.expected / r.budget) : null;
  const bar = h('div', { class: 'budget-bar', role: 'img', 'aria-label': money(r.spent) + ' of ' + money(r.budget) }, h('div', { class: 'fill' + (r.hot ? ' hot' : ''), style: 'width:' + pc(spentShare) }));
  if (markShare !== null) bar.append(h('span', { class: 'mark', style: 'left:' + pc(markShare) }));
  return [bar, h('span', { class: 'muted' }, money(r.spent) + ' of ' + money(r.budget))];
}
// A tag's name: it opens its category when it has lines.
const tagName = (m, tag, label) => (catOf(m, tag) ? h('a', { class: 'cell-link', href: at(tag) }, label, chev()) : label);
const tagMath = (r) => ['spend:tagBudget:' + r.tag, 'spend:tagSpent:' + r.tag, ...(r.pace !== null ? ['spend:pace:' + r.tag] : [])];

function tagsCard(m) {
  const t = m.vw.tags;
  return h('section', { class: 'card', 'aria-labelledby': 'tags-h' },
    h('h2', { id: 'tags-h' }, 'Budgets, ' + monthWords(t.ym)),
    h('p', { class: 'muted' }, t.day ? 'Day ' + t.day + ' of ' + t.daysInMonth + '. The line in each bar is where you would be today on pace.' : 'Spent against the budget.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Category'), h('th', {}, 'Spent'), h('th', { class: 'num' }, 'Left'), h('th', { class: 'num' }, 'At this pace'), h('th', { class: 'num' }, 'Last month, same day'))),
      h('tbody', {}, t.rows.map((r) => h('tr', {},
        h('td', {}, tagName(m, r.tag, r.label)),
        h('td', {}, budgetCell(r)),
        h('td', { class: 'num' }, r.left === null ? 'missing' : money(r.left)),
        h('td', { class: 'num' }, r.pace === null ? '' : money(r.pace)),
        h('td', { class: 'num' }, money(r.lastMonthSameDay))))))),
    h('p', { class: 'tile-note' }, kindChip(t.kind), ' A line with no amount makes its budget missing, not smaller.'),
    mathButton(t.rows.flatMap(tagMath), m.ctx));
}

// Fixed and variable (owner's ask, 2026-10-27): one line each, sorted with a two-button switch; a variable line shows
// what was logged to it on average and which way it is going.
const TREND_WORDS = { up: 'going up', down: 'going down', steady: 'steady' };
function fixedSwitch(l, now) {
  const set = (x) => { if (x !== now) change((sp) => setFixed(sp, l.id, x), said.changed(l.label, x ? 'a fixed expense' : 'a variable expense')); };
  return h('span', { class: 'segmented fv-seg', role: 'group', 'aria-label': l.label + ': fixed or varies' },
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(now === true), onclick: () => set(true) }, h('span', { class: 'seg-label' }, 'Fixed')),
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(now === false), onclick: () => set(false) }, h('span', { class: 'seg-label' }, 'Varies')));
}
function fixedVarCard(m) {
  const fv = m.fv;
  const amt = (a) => (a === null ? h('span', { class: 'empty' }, 'no amount') : cents(a));
  const trend = (l) => {
    if (!l.logged) return h('span', { class: 'fv-note' }, 'nothing logged yet');
    const avg = 'avg ' + cents(l.average) + ' over ' + l.logged + (l.logged === 1 ? ' month' : ' months');
    if (!l.trend || !l.trend.direction) return h('span', { class: 'fv-note' }, avg);
    return h('span', { class: 'fv-note' }, avg + ', ', h('span', { class: 'fv-trend fv-' + l.trend.direction }, TREND_WORDS[l.trend.direction] + (l.trend.direction === 'steady' ? '' : ' ' + Math.abs(Math.round(l.trend.change * 100)) + '%')));
  };
  const row = (l, now, extra) => h('li', { class: 'fv-line' }, h('a', { class: 'fv-name', href: ledgerHref(l.path) }, l.label), h('span', { class: 'fv-amt' }, amt(l.amount)), extra, fixedSwitch(l, now));
  const head = (words, g) => h('h3', { class: 'fv-h' }, words, ' ', h('span', { class: 'fv-total' }, g.total === null ? 'some amounts missing' : money(g.total) + ' a month'));
  return h('section', { class: 'card', 'aria-labelledby': 'fv-h' },
    h('h2', { id: 'fv-h' }, 'Fixed and variable'),
    h('p', { class: 'muted' }, 'Fixed is the same each time, like rent. Variable moves, like utilities and food; its trend comes from what you log.'),
    fv.fixed.items.length ? [head('Fixed', fv.fixed), h('ul', { class: 'fv-list' }, fv.fixed.items.map((l) => row(l, true)))] : null,
    fv.variable.items.length ? [head('Variable', fv.variable), h('ul', { class: 'fv-list' }, fv.variable.items.map((l) => row(l, false, trend(l))))] : null,
    fv.unsorted.length ? [h('h3', { class: 'fv-h' }, 'Not sorted yet ', h('span', { class: 'count' }, String(fv.unsorted.length))), h('ul', { class: 'fv-list' }, fv.unsorted.map((l) => row(l, null)))] : null);
}

function tiersCard(m) {
  const tiers = m.tiers;
  return h('section', { class: 'card', 'aria-labelledby': 'tiers-h' },
    h('h2', { id: 'tiers-h' }, 'What goes out, in four layers'),
    h('ol', { class: 'tiers' }, tiers.tiers.map((x) => h('li', {}, h('span', {}, x.label), h('span', { class: 'tier-amt' }, money(x.amount)), h('span', { class: 'tier-cum' }, 'so far ' + money(x.cumulative))))),
    h('p', { class: 'tile-sub' }, kindChip(tiers.kind), ' ', tiers.takeHome.value === null ? h('span', { class: 'missing-row' }, 'Missing: take-home pay') : 'Take-home ' + money(tiers.takeHome.value) + ' a month; ' + (tiers.unallocated.value === null ? 'unallocated unknown' : tiers.unallocated.value >= 0 ? money(tiers.unallocated.value) + ' not given a job yet' : money(-tiers.unallocated.value) + ' short of take-home') + '.'),
    fold('tiers', 'later-list', 'What the layers mean', h('ul', {}, h('li', {}, 'Core: food, housing and getting around.'), h('li', {}, 'Miscellaneous: everything else that is not debt.'), h('li', {}, 'Minimums: what your debts ask for each month.'), h('li', {}, 'Extra, saving and tax set aside.'))),
    mathButton(tiers.tiers.map((x) => 'spend:tier:' + x.id), m.ctx));
}

// Where the money goes: the ring and its list twin. A slice with lines is a row that opens its category (chevron);
// saving and what is left over have no lines, so they are plain text.
function donutCard(m) {
  const d = m.vw.donut;
  if (!d.slices.length) return null;
  let acc = 0;
  const stops = d.slices.map((x, i) => { const from = acc; acc += (x.share || 0) * 100; return 'var(--' + VIZ[i % VIZ.length] + ') ' + from + '% ' + Math.min(100, acc) + '%'; });
  const ring = h('div', { class: 'donut', role: 'img', 'aria-label': 'Where the money goes: ' + d.slices.map((x) => x.label + ' ' + money(x.amount)).join(', '), style: 'background: conic-gradient(' + stops.join(', ') + ')' });
  const row = (x, i) => {
    const kids = [h('span', { class: 'sw ' + VIZ[i % VIZ.length], 'aria-hidden': 'true' }), h('span', { class: 'go-name' }, x.label), h('span', { class: 'go-sub' }, h('span', { class: 'go-total' }, money(x.amount)), ' a month' + (x.share !== null ? ' (' + Math.round(x.share * 100) + '%)' : ''))];
    return h('li', {}, catOf(m, x.id) ? h('a', { class: 'go-row', href: at(x.id) }, ...kids) : h('div', { class: 'go-still' }, ...kids));
  };
  return h('section', { class: 'card', 'aria-labelledby': 'donut-h' },
    h('h2', { id: 'donut-h' }, 'Where the money goes'),
    h('p', { class: 'muted' }, 'Try cutting something. Nothing is saved until you choose.'),
    h('div', { class: 'donut-wrap' }, ring, h('ul', { class: 'go-list slice-list', 'aria-label': 'The slices' }, d.slices.map(row))),
    h('p', { class: 'tile-sub' }, kindChip(d.kind), ' ', d.total === null ? h('span', { class: 'missing-row' }, 'Missing: take-home pay.') : 'Of ' + money(d.total) + ' take-home a month.' + (d.short ? ' ' + money(d.short) + ' more leaves than comes in.' : '')));
}

// The cut simulator's result, on every screen while something is tried without: what it saves, the surplus, the
// debt-free month when the saving goes to the debt, and the choice to cut them for real (undoable) or put them back.
function cutCard(m) {
  if (!cutPick.dropped.length) return null;
  const cut = cutSimulator(m.spine, rules, m.s, { dropped: cutPick.dropped, towardDebt: cutPick.towardDebt });
  if (!cut.dropped.length) return null;
  const names = cut.dropped.map((i) => i.label);
  const save = () => {
    const ids = cut.dropped.map((i) => i.id), extra = cut.debt ? cut.debt.extraAfter : null, today = todayIso();
    const ok = change((s) => { let n = s; for (const id of ids) n = removeItem(n, 'expenses', id); return extra === null ? n : putFact(n, 'debtPlan.extra', extra, 'known', today); },
      said.deleted(listWords(names)) + (extra === null ? '' : ', and ' + said.changed('the extra toward debt', money(extra) + ' a month')));
    if (ok) keepCut({ dropped: [], towardDebt: false });
  };
  return h('section', { class: 'card', 'aria-labelledby': 'cut-h' },
    h('h2', { id: 'cut-h' }, 'Trying without ' + listWords(names)),
    h('div', { class: 'tool-result' }, h('strong', {}, money(cut.saved) + ' a month saved'), '. Surplus ' + (cut.surplusBefore === null ? 'unknown' : money(cut.surplusBefore) + ' to ' + money(cut.surplusAfter)) + '.', cut.debt ? (cut.debt.neverAfter ? ' Even so the monthly plan never pays everything off.' : ' Debt free ' + (cut.debt.debtFreeAfter ? monthWords(cut.debt.debtFreeAfter) : 'never') + ' instead of ' + (cut.debt.debtFreeBefore ? monthWords(cut.debt.debtFreeBefore) : 'never') + (cut.debt.monthsSooner ? ', ' + cut.debt.monthsSooner + ' months sooner' : '') + (cut.debt.interestSaved !== null ? ', ' + money(cut.debt.interestSaved) + ' less interest.' : '.')) : ''),
    h('label', { class: 'check-row', for: 'cut-debt' }, h('input', { type: 'checkbox', id: 'cut-debt', checked: cutPick.towardDebt, onchange: (e) => { keepCut({ ...cutPick, towardDebt: e.target.checked }); refresh(); } }), h('span', {}, h('strong', {}, 'Put what I save toward debt'))),
    mathButton(['spend:cut', ...(cut.debt && cut.debt.interestSaved !== null ? ['spend:cutDebt'] : [])], () => ({ ...m.ctx(), cut })),
    h('p', { class: 'muted' }, 'Nothing is saved until you choose. Undo puts them back.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn danger', onclick: save }, 'Cut them from my plan'), h('button', { type: 'button', class: 'btn', onclick: () => { keepCut({ dropped: [], towardDebt: cutPick.towardDebt }); refresh(); } }, 'Put them all back')));
}

function autopsyCard(m) {
  const a = m.vw.autopsy;
  return h('section', { class: 'card', 'aria-labelledby': 'autopsy-h' },
    h('h2', { id: 'autopsy-h' }, 'Bills by yearly cost ', h('span', { class: 'count' }, money(a.yearlyTotal) + ' a year')),
    h('p', { class: 'muted' }, 'Biggest first. A subscription you have not looked at in a year is worth a look.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'num' }, 'A month'), h('th', { class: 'num' }, 'A year'), h('th', {}, 'Reviewed'))),
      h('tbody', {}, a.rows.map((r) => { const min = r.id.startsWith('min:'); return h('tr', { class: r.stale && r.subscription ? 'tight' : '' }, h('td', {}, lineLink(m, min ? r.id.slice(4) : r.id, r.label, r.path, min), r.subscription ? [' ', h('span', { class: 'pill pill-sub' }, 'sub')] : null, r.need === false ? [' ', h('span', { class: 'pill' }, 'want')] : null), h('td', { class: 'num' }, money(r.monthly)), h('td', { class: 'num' }, money(r.yearly)), h('td', {}, r.reviewed ? shortDate(r.reviewed) : r.subscription ? h('span', { class: 'missing-row' }, 'never') : '')); })))),
    mathButton(a.rows.slice(0, 5).map((r) => 'spend:autopsy:' + r.id), m.ctx, 0, 'Show the math for the top five'));
}

function askCard(m, state) {
  const spine = m.spine;
  if (m.sim && !m.sim.checking.known) return h('section', { class: 'card', 'aria-labelledby': 'ask-h' }, h('h2', { id: 'ask-h' }, 'Can I spend this?'), h('p', { class: 'muted missing-row' }, 'Missing: a checking balance.'));
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const asked = state.ask || '', askWith = state.askWith || 'cash';
  const amount = h('input', { id: 'ask-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off' }); amount.value = asked;
  const paid = h('select', { id: 'ask-paid' }, h('option', { value: 'cash' }, 'Cash or debit'), ...(spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => h('option', { value: d.id }, d.name && d.name.value ? d.name.value : d.id)));
  paid.value = askWith;
  const parsed = asked.trim() === '' ? null : parseInput('money', asked);
  const ask = parsed && parsed.ok ? canISpend(spine, rules, m.sim, { amount: parsed.value, paidWith: askWith }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'ask-h' },
    h('h2', { id: 'ask-h' }, 'Can I spend this?'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = parseInput('money', amount.value); if (!p.ok) { msg.textContent = p.message; return; } keep({ ask: amount.value, askWith: paid.value }); refresh(); } },
      h('label', { for: 'ask-amount', class: 'edit-label' }, 'How much, today'), amount,
      h('label', { for: 'ask-paid', class: 'edit-label' }, 'Paid with'), paid, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Tell me'))),
    ask && ask.verdict ? [
      h('p', {}, h('span', { class: 'verdict ' + ask.verdict }, ask.verdict === 'yes' ? 'Yes' : ask.verdict === 'tight' ? 'Tight' : 'No')),
      h('ul', {}, h('li', {}, 'Safe to spend: ' + money(ask.safeBefore) + ' to ' + money(ask.safeAfter) + '.'), h('li', {}, 'Lowest day: ' + money(ask.lowBefore.amount) + ' on ' + shortDate(ask.lowBefore.date) + ' to ' + money(ask.lowAfter.amount) + ' on ' + shortDate(ask.lowAfter.date) + (ask.shortfalls ? ', and ' + ask.shortfalls + ' payment' + (ask.shortfalls === 1 ? '' : 's') + ' would dip under the floor' : '') + '.'), ask.interest ? h('li', {}, money(ask.interest) + ' of interest ' + ask.interestNote + '.') : ask.interestNote ? h('li', {}, ask.interestNote + '.') : null, h('li', {}, ask.hours === null ? h('span', { class: 'missing-row' }, 'Hours of life: missing hours worked a week. ', h('a', { href: ledgerHref(HOURS_WORK) }, 'Add it in My numbers')) : 'Hours of life: ' + ask.hours + ' at ' + money(ask.hourlyWage) + ' of take-home an hour.'), ask.delayDays !== null ? h('li', {}, 'Your next goal moves about ' + ask.delayDays + ' days later.') : h('li', {}, 'It comes out of the cushion or goes on a card.')),
      h('p', { class: 'tile-note' }, kindChip(ask.kind)),
      mathButton(['spend:ask'], () => ({ ...m.ctx(), ask }))] : null);
}

function pricesCard(m) {
  const p = m.vw.prices, f = m.vw.trials;
  if (!p.rows.length && !f.rows.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'prices-h' },
    h('h2', { id: 'prices-h' }, 'Price increases and free trials'),
    p.rows.length ? h('ul', { class: 'flow-list' }, p.rows.map((r) => h('li', {}, lineLink(m, r.id, r.label, r.path), ': ' + priceWords(r)))) : null,
    f.rows.length ? h('ul', { class: 'flow-list' }, f.rows.map((r) => h('li', {}, lineLink(m, r.id, r.label, r.path), ': ' + trialWords(r)))) : null,
    p.rows.length ? mathButton(p.rows.map((r) => 'spend:priceChange:' + r.id), m.ctx) : null);
}
const priceWords = (r) => money(r.logged) + ' on ' + shortDate(r.date) + ', ' + Math.round(r.change * 100) + '% over the planned ' + money(r.planned) + '.';
const trialWords = (r) => (r.converted ? 'the free trial ended ' + shortDate(r.trialEnds) + '; it now charges ' + (r.converts === null ? 'an amount not entered' : money(r.converts)) + '.' : 'free trial ends ' + shortDate(r.trialEnds) + ' (' + r.daysLeft + ' days)' + (r.soon ? ', then ' + (r.converts === null ? 'it charges an amount not entered' : money(r.converts)) + '. Cancel it before then, or keep it on purpose.' : '.'));

function checkinCard(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const date = h('input', { id: 'ci-date', type: 'date', onchange: () => { form.checkDate = date.value; } }); date.value = form.checkDate;
  const f = checkInForecast(m.spine, m.sim, form.checkDate >= m.sim.start ? form.checkDate : m.sim.start);
  const boxes = f.accounts.map((a) => ({ a, input: h('input', { id: 'ci-' + a.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: f.forecast[a.id] === null ? '' : String(f.forecast[a.id]) }) }));
  const dr = m.vw.drift, mo = m.vw.momentum;
  const math = [...(dr.count ? ['spend:drift'] : []), ...(mo.perMonth !== null ? ['spend:momentum'] : [])];
  return h('section', { class: 'card', id: 'checkin', 'aria-labelledby': 'ci-h' },
    h('h2', { id: 'ci-h' }, 'Check in balances'),
    h('p', { class: 'muted' }, 'Type what each account holds today. The grey number, when there is one, is what we expected.'),
    h('form', { class: 'checkin-grid', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const balances = {}, forecast = {};
      for (const { a, input } of boxes) { if (input.value.trim() === '') continue; const p = parseInput('money', input.value); if (!p.ok) { msg.textContent = a.name + ': ' + p.message; input.focus(); return; } balances[a.id] = p.value; forecast[a.id] = f.forecast[a.id]; }
      if (!Object.keys(balances).length) { msg.textContent = 'Type at least one balance'; return; }
      form.checkDate = date.value || todayIso();
      change((s) => checkIn(s, { date: form.checkDate, balances, forecast }), said.added('Check-in for ' + shortDate(form.checkDate)));
    } },
      h('label', { for: 'ci-date', class: 'edit-label' }, 'On'), date,
      ...boxes.flatMap(({ a, input }) => [h('label', { for: 'ci-' + a.id, class: 'edit-label' }, a.name + (a.setAside ? ' (' + a.setAside + ', not spending money)' : a.cushion ? ' (cushion)' : '') + ', now ' + (a.now === null ? 'missing' : money(a.now))), input]),
      msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save balances'))),
    h('h3', { class: 'month-h' }, 'Drift'), h('p', { class: 'tile-sub' }, dr.words),
    h('h3', { class: 'month-h' }, 'Momentum'), h('p', { class: 'tile-sub' }, mo.words),
    math.length ? mathButton(math, m.ctx) : null);
}

function sweepCard(m) {
  const sw = m.vw.sweep;
  const cal = (m.spine.calendar || {}).sweep || {};
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const on = h('input', { type: 'checkbox', id: 'sweep-on', checked: cal.on === true });
  const to = h('select', { id: 'sweep-to' }, h('option', { value: '' }, 'Pick an account'), ...m.sim.model.accounts.filter((a) => !a.primary).map((a) => h('option', { value: a.id }, a.name)));
  to.value = cal.to || '';
  const keepBox = h('input', { id: 'sweep-keep', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' }); keepBox.value = cal.keep !== undefined ? String(cal.keep) : '';
  const submit = (e) => {
    e.preventDefault();
    const k = keepBox.value.trim() === '' ? { ok: true, value: 0 } : parseInput('money', keepBox.value);
    if (!k.ok) { msg.textContent = 'Keep: ' + k.message; return; }
    if (on.checked && !to.value) { msg.textContent = 'Pick the account it sweeps to'; return; }
    const where = (to.options[to.selectedIndex] || {}).text;
    change((s) => setSweep(s, { on: on.checked, to: to.value || null, keep: k.value }), said.changed('The month-end sweep', on.checked ? 'on, to ' + where + (k.value ? ', keeping ' + cents(k.value) : '') : 'off'));
  };
  return h('section', { class: 'card', 'aria-labelledby': 'sweep-h' },
    h('h2', { id: 'sweep-h' }, 'Month-end sweep'),
    h('p', { class: 'muted' }, 'At month end, extra cash in checking moves to the account you pick.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: submit },
      h('label', { class: 'check-row', for: 'sweep-on' }, on, h('span', {}, h('strong', {}, 'Sweep at month end'))),
      h('label', { for: 'sweep-to', class: 'edit-label' }, 'To'), to,
      h('label', { for: 'sweep-keep', class: 'edit-label' }, 'Keep above the floor'), keepBox, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'))),
    sw.on ? [h('p', { class: 'tile-sub' }, sw.moves.length ? 'Inside the window: ' + sw.moves.map((x) => money(x.amount) + ' on ' + shortDate(x.date) + (x.toName ? ' to ' + x.toName : '')).join('; ') + ' (' + money(sw.total) + ' in all).' : 'Nothing above the floor and the keep at a month end inside the window.'), mathButton(['spend:sweep'], m.ctx)] : h('p', { class: 'muted' }, 'Off.'));
}

// So far and expected by month end (S-209, the Budget's open-month reading): the log so far, then the run.
function outlookCard(m) {
  const o = monthOutlook(m.spine, rules, m.sim, { today: todayIso(), waiting: waiting(m.spine, rules, { today: todayIso() }) });
  const sign = (x) => (x === null ? 'missing' : (x < 0 ? '-' : '+') + money(Math.abs(x)));
  if (o.stale) return h('section', { class: 'card', 'aria-labelledby': 'outlook-h' }, h('h2', { id: 'outlook-h' }, 'This month so far, ' + monthWords(o.ym)),
    h('p', { class: 'muted' }, 'Balances are from ' + shortDate(o.asOf) + '. Check in to see this month.'),
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn primary', href: '#checkin' }, 'Check in')));
  return h('section', { class: 'card', 'aria-labelledby': 'outlook-h' },
    h('h2', { id: 'outlook-h' }, 'This month so far, ' + monthWords(o.ym)),
    h('div', { class: 'clear-grid' },
      h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, sign(o.soFar)), h('span', { class: 'clear-label' }, 'So far'), h('span', { class: 'tile-note' }, money(o.incomeSoFar) + ' in, ' + money(o.spentSoFar) + ' out')),
      h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, sign(o.expected)), h('span', { class: 'clear-label' }, 'By month end'), h('span', { class: 'tile-note' }, o.expected === null ? 'Missing: ' + o.rest.filter((r) => r.left === null).map((r) => r.label).concat(o.missing.length && !o.rest.some((r) => r.left === null) ? ['a line left out'] : []).join(', ') : money(o.paychecks) + ' still to come in, ' + money(o.bills) + ' in bills, ' + money(o.planLeft) + ' left of the plan'))),
    o.logged ? null : h('p', { class: 'muted' }, 'Nothing added this month yet.'),
    o.noPayDate.length ? h('p', { class: 'muted missing-row' }, 'Missing a pay date: ' + o.noPayDate.join(', ') + '.') : null,
    o.guessedPayDay.length ? h('p', { class: 'muted' }, 'Pay day is a guess: ' + o.guessedPayDay.join(', ') + '.') : null,
    fold('to-come', 'flow-list', 'Still to come (' + (o.items.length + o.rest.length) + ')',
      h('ul', {}, o.items.map((i) => h('li', {}, shortDate(i.date) + ': ' + i.label + ', ' + (i.amount > 0 ? 'in ' : 'out ') + money(Math.abs(i.amount), true) + (i.card ? ' (on the card)' : '') + (i.waiting ? ' (not marked yet)' : ''))),
        o.rest.map((r) => h('li', {}, r.label + ' (' + r.lines.join(', ') + '): ' + (r.left === null ? h('span', { class: 'missing-row' }, 'missing: a line has no amount') : money(r.left, true) + ' left of ' + money(r.plan, true)))),
        o.claimed.length ? o.claimed.map((i) => h('li', { class: 'muted' }, shortDate(i.date) + ': ' + i.label + ' already happened')) : null)),
    h('p', { class: 'tile-note' }, kindChip(o.kind)),
    mathButton(['compare:soFar', 'compare:expected'], () => ({ ...m.ctx(), monthOut: o })));
}

// Plan vs what you actually spent (S-207): the plan month by month against the log, over the time picker's window.
const windowWords = (c) => monthWords(c.from) + (c.from === c.to ? '' : ' to ' + monthWords(c.to));
const diffWords = (d) => (d === null ? 'missing' : d > 0 ? '+' + money(d) + ' over' : d < 0 ? money(-d) + ' under' : 'on the plan');
function compareCard(m) {
  const c = m.compare;
  return h('section', { class: 'card', 'aria-labelledby': 'cmp-h' },
    h('h2', { id: 'cmp-h' }, 'Plan vs spent, ' + windowWords(c)),
    c.monthsSilent.length ? h('p', { class: 'muted' }, 'Nothing added in ' + c.monthsSilent.map(monthWords).join(', ') + '.') : null,
    h('p', { class: 'tile-sub' }, kindChip(c.kind), ' Spent ' + money(c.spend.actual) + ' of ' + (c.spend.planned === null ? 'a plan with a missing line' : money(c.spend.planned) + ' planned') + ' (' + diffWords(c.spend.diff) + ').'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Category'), h('th', { class: 'num' }, 'Planned'), h('th', { class: 'num' }, 'Spent'), h('th', { class: 'num' }, 'Difference'))),
      h('tbody', {}, c.tags.map((r) => h('tr', {}, h('td', {}, tagName(m, r.tag, r.label), r.unassigned ? h('span', { class: 'choice-sub' }, ' (' + money(r.unassigned) + ' not on a line)') : null), h('td', { class: 'num' }, r.missing ? 'missing' : money(r.planned)), h('td', { class: 'num' }, money(r.actual)), h('td', { class: 'num' }, diffWords(r.diff))))))),
    fold('lines', 'flow-list', 'Every line (' + c.lines.length + ')',
      h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Line'), h('th', { class: 'num' }, 'Planned'), h('th', { class: 'num' }, 'Logged'), h('th', { class: 'num' }, 'Difference'))),
        h('tbody', {}, c.lines.map((r) => h('tr', {}, h('td', {}, lineLink(m, r.id, r.label, r.path), ' ', h('span', { class: 'choice-sub' }, r.entries + (r.entries === 1 ? ' entry' : ' entries'))), h('td', { class: 'num' }, r.missing ? 'missing' : money(r.planned)), h('td', { class: 'num' }, money(r.actual)), h('td', { class: 'num' }, diffWords(r.diff)))))))),
    mathButton(['compare:spend', 'compare:income', 'compare:savingsReal', ...c.tags.map((r) => 'compare:tag:' + r.tag)], m.ctx));
}

// The feed (S-207): a statement pasted in, or the old Budget's households saved in this browser; nothing lands until Apply.
function importCard(m) {
  const spine = m.spine;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const text = h('textarea', { id: 'csv-text', rows: 5, placeholder: 'Paste your bank or card download here', 'aria-label': 'Statement CSV' });
  text.value = form.csv;
  text.addEventListener('input', () => { form.csv = text.value; });
  const fmt = h('select', { id: 'csv-format' }, h('option', { value: 'auto' }, 'Figure it out'), ...Object.entries(FORMATS).map(([k, f]) => h('option', { value: k }, f.label)));
  fmt.value = form.csvFormat;
  const paid = h('select', { id: 'csv-with' }, h('option', { value: 'cash' }, 'Checking or debit'), ...(spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => h('option', { value: d.id }, d.name && d.name.value ? d.name.value : d.id)));
  paid.value = form.csvWith;
  let docs = [];
  try { docs = budgetDocsFromStorage((k) => localStorage.getItem(k), Object.keys(localStorage)); } catch { docs = []; }
  const p = form.proposals;
  const picks = form.picks;
  const apply = () => {
    // The ticks as they are now (a tick changes form.picks without a redraw).
    const picked = form.picks || p.proposals.filter((y) => y.include).map((y) => y.key);
    let r = null;
    form.importWords = '';
    const ok = change((s) => { r = applyImport(s, p.proposals, { picks: picked }); return r.spine; }, said.added(picked.length + (picked.length === 1 ? ' entry' : ' entries') + ' from the statement'));
    if (ok) { form.proposals = null; form.picks = null; form.importWords = r ? 'Added ' + r.added + ', skipped ' + r.skipped + ' (already in, or not spending).' : ''; refresh(); }
  };
  return h('section', { class: 'card', id: 'import', 'aria-labelledby': 'imp-h' },
    h('h2', { id: 'imp-h' }, 'Import a statement'),
    h('p', { class: 'muted' }, 'Paste a download from your bank or card. You check each line before anything is added, and nothing is added twice.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); form.csv = text.value; form.csvFormat = fmt.value; form.csvWith = paid.value; try { form.proposals = proposeCsv(spine, rules, text.value, { format: fmt.value, paidWith: paid.value, merchantRules }); form.picks = null; form.importWords = ''; } catch (err) { msg.textContent = err.message; return; } refresh(); } },
      h('label', { for: 'csv-text', class: 'edit-label' }, 'A statement'), text,
      h('label', { for: 'csv-format', class: 'edit-label' }, 'Format'), fmt,
      h('label', { for: 'csv-with', class: 'edit-label' }, 'Which account'), paid, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Read the statement'), ...docs.map((d) => h('button', { type: 'button', class: 'btn', onclick: () => { form.proposals = proposeBudget(spine, rules, d.doc, { merchantRules }); form.picks = null; form.importWords = ''; refresh(); } }, 'Read the Budget app: ' + d.name + ' (' + d.transactions + ')')))),
    form.importWords ? h('p', { class: 'tool-result' }, form.importWords) : null,
    p ? [h('p', { class: 'tile-sub' }, (p.label ? p.label + ': ' : '') + p.words + (p.skippedRows && p.skippedRows.length ? ' Rows skipped (no date, amount or words): ' + p.skippedRows.join(', ') + '.' : '')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Take'), h('th', {}, 'Day'), h('th', {}, 'Where'), h('th', { class: 'num' }, 'Amount'), h('th', {}, 'Line'), h('th', {}, 'Status'))),
        h('tbody', {}, p.proposals.map((x) => { const on = picks ? picks.includes(x.key) : x.include; return h('tr', { class: x.status === 'matched' ? '' : x.status === 'new' ? 'tight' : '' }, h('td', {}, h('input', { type: 'checkbox', 'aria-label': 'Take ' + (x.merchant || x.description), checked: on, disabled: x.status === 'skip' || x.status === 'same', onchange: (e) => { const set = new Set(form.picks || p.proposals.filter((y) => y.include).map((y) => y.key)); if (e.target.checked) set.add(x.key); else set.delete(x.key); form.picks = [...set]; } })), h('td', {}, shortDate(x.date)), h('td', {}, x.merchant || x.description), h('td', { class: 'num' }, (x.kind === 'income' || x.kind === 'refund' ? '+' : '-') + cents(x.amount)), h('td', {}, x.expenseId ? ((spine.expenses || []).find((e) => e.id === x.expenseId) || {}).label || x.expenseId : x.kind === 'income' ? 'income' : x.tag ? TAG_WORDS[x.tag] : ''), h('td', {}, h('span', { class: 'pill' + (x.status === 'new' ? ' pill-maybe' : x.status === 'skip' || x.status === 'same' ? ' pill-done' : '') }, x.status === 'same' ? 'already in' : x.status), ' ', h('span', { class: 'choice-sub' }, x.why))); })))),
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: apply }, 'Add the ticked lines'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { form.proposals = null; form.picks = null; refresh(); } }, 'Discard'))] : null);
}

// The time picker and the hours-of-life switch.
function controls(m, months) {
  return [
    windowBar(months, (n) => { keep({ months: n }); refresh(); }),
    // Hours of work moved to Preferences (every screen follows it now): one line here says where.
    h('p', { class: 'muted pref-link' }, 'Show money as hours of work or days of FI: ', h('a', { href: 'profile.html#/prefs' }, 'Preferences'), wage ? ' (' + money(wage, true) + ' an hour)' : '', '.')
  ];
}

// ---------------------------------------------------------------- a category: Spending > Housing
// A line in the list: the row opens it (chevron); the button beside it tries the month without it.
function lineRow(m, cat, l) {
  const cuttable = cat.id !== 'minimums' && m.canCut.has(l.id), off = cuttable && cutPick.dropped.includes(l.id);
  return h('li', { class: off ? 'dropped' : null },
    h('a', { class: 'go-row plain', href: at(cat.id, l.id) },
      h('span', { class: 'go-name' }, l.label),
      h('span', { class: 'go-sub' }, l.amount === null ? [chip('missing'), h('span', { class: 'empty' }, 'No amount yet')] : [h('span', { class: 'go-total' }, cents(l.amount)), ' a month'])),
    cuttable ? h('button', { type: 'button', class: 'btn small toggle', 'aria-pressed': String(off), 'aria-label': (off ? 'Put back ' : 'Try without ') + l.label, onclick: () => toggleCut(l.id) }, off ? 'Put back' : 'Try without') : null);
}

function categoryScreen(m, cat) {
  const r = cat.tag, slice = cat.slice;
  const ct = r ? m.compare.tags.find((x) => x.tag === r.tag) : null;
  const share = slice ? cents(slice.amount) + ' a month' + (slice.share !== null ? ', ' + Math.round(slice.share * 100) + '% of ' + (m.vw.donut.total === null ? 'what is planned' : 'take-home') : '') + '.' : null;
  // Its lines first (what the slice was opened for), then the cut, the month's budget and the plan against the log.
  return [
    h('section', { class: 'card', 'aria-labelledby': 'cat-lines-h' },
      h('h2', { id: 'cat-lines-h' }, 'Lines'),
      share ? h('p', {}, share) : null,
      cat.id === 'minimums' ? null : h('p', { class: 'muted' }, 'Try cutting something. Nothing is saved until you choose.'),
      h('ul', { class: 'go-list line-list' }, cat.lines.map((l) => lineRow(m, cat, l)))),
    cutCard(m),
    r ? h('section', { class: 'card', 'aria-labelledby': 'cat-h' },
      h('h2', { id: 'cat-h' }, 'Budget, ' + monthWords(m.vw.tags.ym)),
      h('div', { class: 'cat-bar' }, budgetCell(r)),
      h('ul', { class: 'flow-list' },
        h('li', {}, 'Left: ' + (r.left === null ? 'missing' : money(r.left))),
        r.pace !== null ? h('li', {}, 'At this pace: ' + money(r.pace) + ' by month end') : null,
        h('li', {}, 'Last month by today: ' + money(r.lastMonthSameDay))),
      mathButton(tagMath(r), m.ctx)) : null,
    ct ? h('section', { class: 'card', 'aria-labelledby': 'cat-cmp-h' },
      h('h2', { id: 'cat-cmp-h' }, 'Plan vs spent, ' + windowWords(m.compare)),
      h('p', {}, 'Planned ' + (ct.missing ? 'missing' : money(ct.planned)) + ', spent ' + money(ct.actual) + ' (' + diffWords(ct.diff) + ').'),
      mathButton(['compare:tag:' + ct.tag], m.ctx)) : null
  ];
}

// ---------------------------------------------------------------- a line: Spending > Housing > Rent
function lineScreen(m, cat, l) {
  const min = cat.id === 'minimums';
  const a = m.vw.autopsy.rows.find((x) => x.id === (min ? 'min:' + l.id : l.id)) || null;
  const cl = min ? null : m.compare.lines.find((x) => x.id === l.id) || null;
  const price = min ? null : m.vw.prices.rows.find((x) => x.id === l.id) || null;
  const trial = min ? null : m.vw.trials.rows.find((x) => x.id === l.id) || null;
  const logged = min ? [] : m.vw.log.filter((e) => e.expenseId === l.id);
  const cuttable = !min && m.canCut.has(l.id), off = cuttable && cutPick.dropped.includes(l.id);
  return [
    h('section', { class: 'card', 'aria-labelledby': 'line-h' },
      h('h2', { id: 'line-h' }, 'What it costs', a && a.subscription ? [' ', h('span', { class: 'pill pill-sub' }, 'sub')] : null, a && a.need === false ? [' ', h('span', { class: 'pill' }, 'want')] : null),
      l.amount === null ? h('p', { class: 'missing-row' }, chip('missing'), ' No amount yet.') : h('div', { class: 'safe-row' }, h('p', { class: 'safe-big' }, cents(l.amount)), h('span', { class: 'muted' }, 'a month', a ? ', ' + money(a.yearly) + ' a year' : '')),
      a && a.subscription ? h('p', { class: 'tile-sub' }, 'Last looked at: ', a.reviewed ? shortDate(a.reviewed) : h('span', { class: 'missing-row' }, 'never')) : null,
      price ? h('p', { class: 'tile-sub' }, 'Price: ' + priceWords(price)) : null,
      trial ? h('p', { class: 'tile-sub' }, 'Free trial: ' + trialWords(trial)) : null,
      cuttable ? h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn toggle', 'aria-pressed': String(off), onclick: () => toggleCut(l.id) }, off ? 'Put it back' : 'Try without it')) : null,
      // Which account or card it goes on (owner's ask, 2026-10-27).
      min ? null : paidWithBox(m.spine, l.id),
      a || price ? mathButton([...(a ? ['spend:autopsy:' + a.id] : []), ...(price ? ['spend:priceChange:' + price.id] : [])], m.ctx) : null),
    h('section', { class: 'card has-target', 'aria-labelledby': 'line-edit-h' },
      h('h2', { id: 'line-edit-h' }, h('a', { class: 'card-link', href: ledgerHref(l.path) }, h('span', {}, 'Change it in My numbers'), chev())),
      null),
    cl ? h('section', { class: 'card', 'aria-labelledby': 'line-cmp-h' },
      h('h2', { id: 'line-cmp-h' }, 'Plan vs spent, ' + windowWords(m.compare)),
      h('p', {}, 'Planned ' + (cl.missing ? 'missing' : money(cl.planned)) + ', spent ' + money(cl.actual) + ' in ' + cl.entries + (cl.entries === 1 ? ' purchase' : ' purchases') + ' (' + diffWords(cl.diff) + ').'),
      mathButton(['compare:line:' + cl.id], m.ctx)) : null,
    min ? null : h('section', { class: 'card', 'aria-labelledby': 'line-log-h' },
      h('h2', { id: 'line-log-h' }, 'Added this month ', h('span', { class: 'count' }, String(logged.length))),
      logged.length ? h('ul', { class: 'log-list' }, logged.map((e) => logItem(m.spine, e))) : h('p', { class: 'muted' }, 'Nothing added this month.')),
    cutCard(m)
  ];
}

// ---------------------------------------------------------------- the screens
// Two tabs (Phase 2.5 Batch 7): Do (import a statement, the review queue, add a purchase, the check-in as one chip
// that opens in place) and See (the time picker that says its range in words, the categories, reference lines from
// data/benchmarks.json, never a verdict). The tab is kept with the screen; a link to #checkin or #log opens Do.
let BENCH = null;
try { const r = await fetch(new URL('../data/benchmarks.json', import.meta.url), { cache: 'no-store' }); if (r.ok) BENCH = await r.json(); } catch { /* no reference lines */ }
const tabOf = (state) => (state.tab === 'see' || state.tab === 'do' ? state.tab : 'do');
function tabsBar(tab) {
  return h('div', { class: 'segmented spend-tabs', role: 'group', 'aria-label': 'Spending' },
    [['do', 'Do'], ['see', 'See']].map(([id, words]) => h('button', { type: 'button', class: 'seg-btn', id: 'tab-' + id, 'aria-pressed': String(tab === id), onclick: () => { if (tab !== id) { keep({ tab: id }); refresh(); } } }, h('span', { class: 'seg-label' }, words))));
}
function checkinChip(m) {
  const open = /^#checkin$/.test(location.hash) || kept().checkinOpen === true;
  const d = h('details', { class: 'card checkin-chip', open: open || null }, h('summary', {}, h('span', {}, 'Check in balances'), ' ', h('span', { class: 'pill' + (m.vw.stale.stale ? ' pill-maybe' : '') }, m.vw.stale.stale ? 'out of date' : 'up to date')), checkinCard(m));
  d.addEventListener('toggle', () => { if (!!kept().checkinOpen !== d.open) keep({ checkinOpen: d.open }); });
  return d;
}
function referenceCard(m) {
  const r = referenceBands(m.s, BENCH);
  if (!r) return null;
  const pc1 = (x) => (x === null ? 'missing' : Math.round(x * 1000) / 10 + '%');
  return h('section', { class: 'card', 'aria-labelledby': 'ref-h' },
    h('h2', { id: 'ref-h' }, 'Beside a common reference'),
    h('p', { class: 'muted' }, 'Shares of pay a month (take-home plus what your paycheck saves and the match), beside the 50/30/20 lines. A reference point, not a grade.'),
    r.unmarked ? h('p', { class: 'muted missing-row' }, money(r.unmarked) + ' a month is not marked need or want yet, so needs and wants read missing.') : null,
    h('ul', { class: 'sum-lines' }, r.rows.map((x) => h('li', { class: 'sum-line' }, h('span', {}, x.label), h('span', { class: 'num' }, pc1(x.share) + ' (line at ' + pc1(x.reference) + ')')))),
    h('p', { class: 'tile-note' }, 'Source: ' + r.source + '.'));
}
const rangeWords = (m) => h('p', { class: 'range-words', 'aria-live': 'polite' }, 'Showing ' + windowWords(m.compare) + '.');
function topScreen(m, months, state) {
  const tab = /^#(checkin|log)$/.test(location.hash) ? 'do' : tabOf(state);
  const addFirst = spendingStart(m.base || m.spine) === 'add';
  return [
    tabsBar(tab),
    ...(tab === 'do' ? [
      safeCard(m),
      addFirst ? loggerCard(m) : importCard(m),
      addFirst ? importCard(m) : loggerCard(m),
      checkinChip(m),
      askCard(m, state),
      sweepCard(m)
    ] : [
      controls(m, months),
      rangeWords(m),
      tagsCard(m),
      fixedVarCard(m),
      compareCard(m),
      referenceCard(m),
      donutCard(m),
      tiersCard(m),
      outlookCard(m),
      cutCard(m),
      autopsyCard(m),
      pricesCard(m)
    ])
  ];
}

function render(ctx) {
  rules = ctx.rules;
  const months = monthsOf(ctx.state);
  const m = model(ctx.spine, ctx.rules, months);
  wage = m.wage;
  const [catId, lineId] = ctx.levels;
  const cat = catId === undefined ? null : catOf(m, catId);
  if (!cat) return topScreen(m, months, ctx.state);
  const line = lineId === undefined ? null : cat.lines.find((l) => l.id === lineId);
  return line ? lineScreen(m, cat, line) : categoryScreen(m, cat);
}

// A level's words: a category (Housing), then one of its lines (Rent); null when it is not there any more.
function name(levels, ctx) {
  const m = model(ctx.spine, ctx.rules, monthsOf(ctx.state));
  const cat = catOf(m, levels[0]);
  if (!cat || levels.length > 2) return null;
  if (levels.length === 1) return cat.label;
  const line = cat.lines.find((l) => l.id === levels[1]);
  return line ? line.label || line.id : null;
}

startPage({ tab: 'spending', title: 'Spending', render, name });
