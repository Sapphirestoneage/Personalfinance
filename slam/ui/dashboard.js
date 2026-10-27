// Today (the Dashboard, S-230): the household at a glance. Every number comes from engine/summary.js; each card opens
// the part of your numbers it is about (the whole card is the target, with a chevron): net worth the top of My numbers,
// the runway your cash, safe to spend the calendar, and so on. The shell draws the tabs, the header with Undo and
// Redo, and the bar. What is open here (Show the math, Done, Every flow, a split) is kept with the screen, so coming
// back by Back or by the tab finds it open. Formatting only.

import { startPage, refresh, keep, kept, numbersHref } from './shell.js';
import { summarize } from '../engine/summary.js';
import { DASHBOARD_MATH, flagMath } from '../engine/math.js';
import { keptMath } from './math-panel.js';
import { labelFor } from '../engine/labels.js';
import { withScenario } from '../engine/scenarios.js';
import { moneyFlow } from '../engine/flow.js';
import { flowSection } from './flow-chart.js';
import { pickedScenario } from './scenario.js';
import { fooLadder } from '../engine/plan.js';
import { maxItFor } from './maxit-panel.js';
import { h, chip, money, pct, ledgerHref, summaryMoney } from './view.js';
import { toneOf } from '../engine/profile.js';
import { pref } from './prefs.js';
import { forecast, fixButton, lowWords } from './forecast.js';

const months = (x) => (x === null ? '' : x.toFixed(1));

// What a number was built from: a link per field, and a note when an input is rough or missing.
function provenance(spine, r) {
  const missing = [...new Set(r.missing || [])];
  const rough = [...new Set(r.rough || [])];
  const from = [...new Set(r.from || [])];
  const link = (p) => h('a', { href: ledgerHref(p) }, labelFor(spine, p));
  const note = missing.length
    ? h('p', { class: 'tile-note' }, chip(r.value === null ? 'missing' : 'incomplete'), ' Needs: ', ...missing.flatMap((p, i) => [i ? ', ' : '', link(p)]))
    : rough.length ? h('p', { class: 'tile-note' }, chip('rough'), ' ' + rough.length + (rough.length === 1 ? ' guess' : ' guesses')) : null;
  return [note, mathCtx && MATH_FOR._m.get(r) && (MATH_FOR._m.get(r).ids || []).length ? keptMath(MATH_FOR._m.get(r).key, MATH_FOR._m.get(r).ids, mathCtx) : null];
}

// One tile: a label, the big number, lines under it. The whole tile opens what the card is about (target), and a
// chevron says so (CLAUDE.md affordance 5); the fields it was built from are the links in its "Needs:" line and in
// Show the math.
// Which metrics each tile's "Show the math" opens (engine/math.js DASHBOARD_MATH).
let mathCtx = null;
const MATH_FOR = { _m: new Map() };
function tile(spine, { id, label, result, shown, missingText, target = null, lines = [], extra = null }) {
  MATH_FOR._m.set(result, { key: 'tile-' + id, ids: DASHBOARD_MATH['tile-' + id] });
  const first = target;
  const value = result.value === null
    ? h('p', { class: 'tile-value missing-text' }, missingText || 'Not enough to figure yet')
    : h('p', { class: 'tile-value' }, shown);
  return h('section', { class: 'tile' + (first ? ' has-target' : ''), id: 'tile-' + id, 'aria-labelledby': 'tl-' + id },
    h('h2', { class: 'tile-label', id: 'tl-' + id }, first ? h('a', { class: 'card-link', href: first }, h('span', {}, label), h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A')) : label),
    value,
    ...lines.filter(Boolean).map((l) => h('p', { class: 'tile-sub' }, ...[].concat(l))),
    extra,
    ...provenance(spine, result));
}

// The five tiles (Phase 2.5 Batch 5), each one tap to its own screen: Net worth (liquid and total, the drill-down in My
// numbers), Monthly surplus, Savings rate of take-home and Cash runway (screens of this page), Next step (the Plan's
// current step). The credit cards, FI, tax, safe to spend and month-vs-plan moved to Debt, Goals, Taxes, the Calendar
// and Spending.
let scenario = pickedScenario();
// Sections of the money flow split into their expenses (S-192): kept with this screen, so coming back opens them again.
const flowOpen = () => kept().flowOpen || [];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const slugOf = (id) => id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
function model(base, rules) {
  const spine = withScenario(base, rules, scenario);
  const s = summarize(spine, rules);
  mathCtx = { spine, rules, s };
  return { spine, rules, s };
}

function tiles({ spine, rules, s }) {
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  const foo = fooLadder(spine, rules, s, { sim: maxItFor(spine, rules).sim });
  // The first step not done yet, a blank one too (a blank deductible is not skipped).
  const step = foo.rungs.find((r) => r.done !== true) || null;
  const both = h('p', { class: 'tile-value nw-two' }, h('span', {}, h('small', {}, 'Liquid '), sh.liquidNetWorth.value === null ? 'missing' : summaryMoney(sh.liquidNetWorth.value)), h('span', {}, h('small', {}, 'Total '), sh.netWorth.value === null ? 'missing' : summaryMoney(sh.netWorth.value)));
  const all = [
    tile(spine, { id: 'networth', label: 'Net worth', target: numbersHref(), result: sh.netWorth, shown: both }),
    tile(spine, { id: 'surplus', label: 'Monthly surplus', target: '#/surplus', result: cf.monthlySurplus, shown: summaryMoney(cf.monthlySurplus.value), lines: [cf.income.takeHome.value === null ? null : 'Left of ' + summaryMoney(cf.income.takeHome.value) + ' take-home.'] }),
    tile(spine, { id: 'savings', label: 'Savings rate', target: '#/savings', result: cf.savingsRate.net, shown: pct(cf.savingsRate.net.value, 1) + ' of take-home' }),
    tile(spine, { id: 'runway', label: 'Cash runway', target: '#/runway', result: em.tiers.full.runway, shown: months(em.tiers.full.runway.value) + ' months', lines: [sh.cash.value === null ? null : summaryMoney(sh.cash.value) + ' in cash.'] }),
    tile(spine, { id: 'next', label: 'Next step', target: step ? 'plan.html#/' + slugOf(step.id) : 'plan.html', result: { value: step ? 1 : foo.rungs.every((r) => r.done) ? 1 : null, kind: step ? step.kind : foo.kind, from: [], rough: [], missing: [] },
      shown: step ? step.label : 'Every step is done', missingText: 'Answer a few things on the Plan first', lines: [step && step.need !== null && !step.done ? summaryMoney(step.need) + (step.flow ? ' a month' : '') + '.' : null] })];
  // Which tiles and in what order (Preferences, "What Today shows"); an unknown id is skipped.
  const ids = ['networth', 'surplus', 'savings', 'runway', 'next'];
  const want = (Array.isArray(pref('todayTiles')) ? pref('todayTiles') : ids).filter((id) => ids.includes(id));
  return h('div', { class: 'tiles' }, want.map((id) => all[ids.indexOf(id)]));
}

// ---------------------------------------------------------------- the tile screens
const line = (label, value, cls = '') => h('li', { class: 'sum-line ' + cls }, h('span', {}, label), h('span', { class: 'num' }, value === null || value === undefined ? 'missing' : money(value)));
function surplusScreen({ s }) {
  const cf = s.cashflow;
  return [
    h('section', { class: 'card', 'aria-label': 'Monthly surplus in three lines' },
      h('ul', { class: 'sum-lines' },
        line('Take-home', cf.income.takeHome.value),
        line('What goes out', cf.goesOut.value),
        h('li', { class: 'sum-sub' }, h('ul', {}, line('Spending', cf.expenses.total.value), line('Debt payments', cf.debtMinimums.total.value), line('Tax set-aside', cf.taxSetAside.total.value))),
        line('What is left', cf.monthlySurplus.value, 'sum-total')),
      cf.monthlySurplus.value !== null && cf.saving.afterTax.value ? h('p', { class: 'tile-sub' }, money(cf.saving.afterTax.value) + ' of it already goes to saving; ' + money(cf.surplus.value) + ' is left after that.') : null,
      keptMath('screen-surplus', ['surplus', 'leftAfterSaving'], mathCtx))
  ];
}
function savingsScreen({ s }) {
  const cf = s.cashflow, sv = cf.saving;
  return h('section', { class: 'card', 'aria-label': 'Savings rate' },
    h('p', { class: 'tile-value' }, pct(cf.savingsRate.net.value, 1) + ' of take-home'),
    h('ul', { class: 'sum-lines' },
      line('Saved from take-home', sv.fromTakeHome),
      line('Retirement from your paycheck', sv.payroll.value),
      line('Employer match', sv.match.value),
      line('Extra on debt', sv.extraDebt.value),
      line('All of it, a month', sv.total, 'sum-total')),
    h('p', { class: 'tile-sub' }, 'Of gross pay it is ' + pct(cf.savingsRate.gross.value, 1) + '. Money left over but not set to go anywhere is not counted.'),
    keptMath('screen-savings', ['savingsRateNet', 'savingsRateGross'], mathCtx));
}
function runwayScreen({ s }) {
  const em = s.emergency, sh = s.sheet;
  return [
    h('section', { class: 'card nw-pair', 'aria-label': 'Cash runway' },
      h('div', { class: 'nw-one' }, h('p', { class: 'tile-label' }, 'At today\'s spending'), h('p', { class: 'tile-value' }, months(em.tiers.full.runway.value) + ' months'), keptMath('screen-runway', ['runway'], mathCtx)),
      h('div', { class: 'nw-one' }, h('p', { class: 'tile-label' }, 'On needs only'), h('p', { class: 'tile-value' }, em.tiers.needsOnly.runway.value === null ? 'missing' : months(em.tiers.needsOnly.runway.value) + ' months'), keptMath('screen-runway-needs', ['runwayNeeds'], mathCtx))),
    h('section', { class: 'card', 'aria-labelledby': 'cushion-h' }, h('h2', { id: 'cushion-h' }, 'Your cushion, in three steps'),
      h('ol', { class: 'cushion-steps' }, em.cushion.map((c) => h('li', { class: c.reached ? 'is-done' : '' }, h('span', {}, c.label), h('span', { class: 'num' }, c.target.value === null ? 'missing' : money(c.target.value)), h('span', { class: 'muted' }, c.reached === null ? '' : c.reached ? 'there' : money(c.toGo) + ' to go')))),
      sh.cash.value === null ? null : h('p', { class: 'tile-sub' }, money(sh.cash.value) + ' in cash.'), sh.setAsideNote ? h('p', { class: 'tile-sub' }, sh.setAsideNote) : null,
      em.backstop.contributions.value ? h('p', { class: 'tile-sub' }, 'Also there in a pinch: ' + money(em.backstop.contributions.value) + ' of Roth contributions, no tax or penalty.') : null,
      keptMath('screen-cushion', ['cushionNeeds', 'cushionMonth', 'ruleOf5Dollars'], mathCtx))
  ];
}
const SCREENS = { surplus: surplusScreen, savings: savingsScreen, runway: runwayScreen };

function render({ spine: base, rules, levels }) {
  const m = model(base, rules);
  if (levels.length && SCREENS[levels[0]]) return SCREENS[levels[0]](m);
  return [
    cashCard(base, rules),
    tiles(m),
    flowPart(m.spine, rules, m.s),
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn', href: 'onepager.html' }, 'One-pager')),
    flagsSection(m.spine, m.s.flags)
  ];
}

// Cash ahead (audit, 2026-10-27): the one forecast every screen reads. Under the floor it is the first card, ending
// with the fix as a button; above it, one line.
function cashCard(spine, rules) {
  const { story } = forecast(spine, rules);
  if (!story) return null;
  if (!story.under) return h('p', { class: 'tile-sub cash-line', id: 'cash-low' }, lowWords(story));
  return h('section', { class: 'card flag flag-red cash-first', id: 'cash-low', 'aria-labelledby': 'cash-low-h' },
    h('h2', { id: 'cash-low-h', class: 'flag-title' }, 'Checking goes under your floor'),
    h('p', { class: 'flag-line' }, lowWords(story) + '. Your floor is ' + money(story.floor) + '.'),
    h('div', { class: 'flag-actions' }, fixButton(story)));
}

// The money flow (S-192); a split or join redraws only this section.
function flowPart(spine, rules, s) {
  const open = flowOpen();
  const el = flowSection(moneyFlow(spine, rules, s.cashflow, { open }), {
    open, month: MONTH_NAMES[+s.ym.slice(5, 7) - 1],
    listOpen: !!kept().flowList, onList: (on) => { if (!!kept().flowList !== on) keep({ flowList: on }); },
    onToggle: (sec) => { keep({ flowOpen: open.includes(sec) ? open.filter((x) => x !== sec) : [...open, sec] }); el.replaceWith(flowPart(spine, rules, s)); }
  });
  return el;
}

// Where a card's action goes: a field opens on its screen in My numbers (with a value ready to accept when the card
// suggests one), else a page.
const PREFILL_KEY = 'slam-prefill:v1';
function actionEl(a, cls) {
  if (!a || (!a.path && !a.href)) return null;
  const href = a.path ? ledgerHref(a.path) : a.href;
  const keepPrefill = () => { try { if (a.prefill !== undefined && a.path) sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ path: a.path, value: a.prefill })); } catch { /* the field opens with what it holds */ } };
  return h('a', { class: cls, href, onclick: keepPrefill }, a.label);
}

// One card: a short headline, one line of numbers, one filled button with a verb; a smaller second way when there is
// one; then Show the math, small, after the action. The detail is behind Show the math.
function flagItem(spine, f) {
  const c = f.card || { headline: f.title, line: '', action: null };
  // Numbers only (tone): the numbers line and the button, no sentence around them; a card with no numbers keeps its headline.
  const bare = toneOf(spine) === 'numbers' && c.line;
  return h('li', { class: 'flag flag-' + f.stage, id: 'flag-' + f.id },
    bare ? null : h('h3', { class: 'flag-title' }, c.headline),
    c.line ? h('p', { class: 'flag-line' }, c.line) : null,
    h('div', { class: 'flag-actions' },
      actionEl(c.action, f.stage === 'green' ? 'btn small' : 'btn primary small'),
      c.alt ? actionEl(c.alt, 'flag-alt') : null,
      flagMath(f).length ? keptMath('flag-' + f.id, flagMath(f), mathCtx) : null));
}

// Three groups: Do first, Next up, Done (folded, with a count). A number that only rests on guesses is one row that
// opens Still guessing, not a card each.
function flagsSection(spine, flags) {
  const guessy = flags.filter((f) => f.stage === 'yellow' && f.id.startsWith('input-'));
  const first = flags.filter((f) => f.stage === 'red'), next = flags.filter((f) => f.stage === 'yellow' && !guessy.includes(f)), done = flags.filter((f) => f.stage === 'green');
  // The Profile's tone (Level 1): gently, one step to start with and the rest under Next up; straight to it, all of it.
  const gentle = toneOf(spine) === 'gentle';
  const group = (id, title, list) => (list.length ? h('section', { class: 'card', 'aria-labelledby': id }, h('h2', { id }, title), h('ul', { class: 'flags' }, list.map((f) => flagItem(spine, f)))) : null);
  return [
    group('do-first-h', gentle ? 'One step to start with' : 'Do first', gentle ? first.slice(0, 1) : first),
    group('next-up-h', 'Next up', gentle ? [...first.slice(1), ...next] : next),
    !first.length && !next.length ? h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing to work on right now.')) : null,
    guessy.length ? h('ul', { class: 'go-list' }, h('li', {}, h('a', { class: 'go-row plain', href: numbersHref('still-guessing') }, h('span', { class: 'go-name' }, guessy.length + (guessy.length === 1 ? ' number is a guess' : ' numbers are guesses'))))) : null,
    done.length ? h('details', { class: 'card done-group', open: kept().done || null, ontoggle: (e) => { if (!!kept().done !== e.target.open) keep({ done: e.target.open }); } },
      h('summary', {}, h('span', {}, 'Done'), h('span', { class: 'count' }, String(done.length))), h('ul', { class: 'flags' }, done.map((f) => flagItem(spine, f)))) : null
  ];
}

// The One-pager is a button here; its Back comes back to Today.
startPage({ tab: 'today', title: 'Today', render, name: (levels) => ({ surplus: 'Monthly surplus', savings: 'Savings rate', runway: 'Cash runway' }[levels[0]] || null) });
