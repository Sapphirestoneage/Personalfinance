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
import { maxItFor } from './maxit-panel.js';
import { h, chip, money, pct, ledgerHref, summaryMoney, stepHref, metric } from './view.js';
import { toneOf, answersOf } from '../engine/profile.js';
import { pref } from './prefs.js';
import { forecast, fixButton, lowWords } from './forecast.js';
import { rankSteps } from '../engine/next-step.js';
import { guessesFor } from './urgency.js';

const months = (x) => (x === null ? '' : x.toFixed(1));

// What a number was built from: a link per field, and a note when an input is rough or missing.
function provenance(spine, r) {
  const missing = [...new Set(r.missing || [])];
  const rough = [...new Set(r.rough || [])];
  const from = [...new Set(r.from || [])];
  const link = (p) => h('a', { href: ledgerHref(p) }, labelFor(spine, p));
  // Krug pass: a tile names only what is missing; guesses are one row on Today, and Show the math is on the tile's own
  // screen.
  void rough; void from;
  return [missing.length ? h('p', { class: 'tile-note' }, chip(r.value === null ? 'missing' : 'incomplete'), ' Needs: ', ...missing.flatMap((p, i) => [i ? ', ' : '', link(p)])) : null];
}

// One tile: a label, the big number, lines under it. The whole tile opens what the card is about (target), and a
// chevron says so (CLAUDE.md affordance 5); the fields it was built from are the links in its "Needs:" line and in
// Show the math.
// Which metrics each tile's "Show the math" opens (engine/math.js DASHBOARD_MATH).
let mathCtx = null;
const MATH_FOR = { _m: new Map() };
const TILE_METRIC = { networth: 'netWorth', surplus: 'surplus', savings: 'savingsRateNet', runway: 'runway' };
function tile(spine, { id, label, result, shown, missingText, target = null, lines = [], extra = null }) {
  MATH_FOR._m.set(result, { key: 'tile-' + id, ids: DASHBOARD_MATH['tile-' + id] });
  const first = target;
  const value = result.value === null
    ? h('p', { class: 'tile-value missing-text' }, missingText || 'Not enough to figure yet')
    : h('p', { class: 'tile-value', 'data-metric': TILE_METRIC[id] || null }, shown);
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
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function model(base, rules) {
  const spine = withScenario(base, rules, scenario);
  const s = summarize(spine, rules);
  mathCtx = { spine, rules, s };
  return { spine, rules, s };
}

let rankMemo = { spine: null, rules: null, s: null, rank: null };
function rankOf(spine, rules, s) {
  if (rankMemo.spine !== spine || rankMemo.rules !== rules || rankMemo.s !== s) rankMemo = { spine, rules, s, rank: rankSteps(spine, rules, s, { sim: maxItFor(spine, rules).sim }) };
  return rankMemo.rank;
}
// The ranked step and the questions, as Do first's cards: a headline, one line, one button with a verb.
function stepCard(step) {
  return h('li', { class: 'flag flag-red', id: 'step-' + step.id.replace(/[^a-z0-9]+/gi, '-') },
    h('h3', { class: 'flag-title' }, step.label),
    // Said once (Krug pass): the reason, which already names the dollars; the dollars alone when there is no reason.
    h('p', { class: 'flag-line' }, step.why || (step.loss ? 'About ' + money(step.loss) + ' a month lost until it is done.' : '')),
    h('div', { class: 'flag-actions' }, h('a', { class: 'btn primary small', href: stepHref(step) }, step.rung ? 'Make a plan' : 'Open it')));
}
function questionCard(q) {
  return h('li', { class: 'flag flag-yellow', id: 'ask-' + q.rung },
    h('h3', { class: 'flag-title' }, q.question),
    h('p', { class: 'flag-line' }, 'One number, so the plan can count "' + q.label.toLowerCase() + '".'),
    h('div', { class: 'flag-actions' }, h('a', { class: 'btn small', href: q.path ? ledgerHref(q.path) : 'plan.html' }, 'Answer it')));
}

function tiles({ spine, s }) {
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  // Net worth leads with the total; the liquid figure is named "Cash after card debt" (Krug pass), so it never reads
  // as a second cash number beside the runway's.
  const all = [
    tile(spine, { id: 'networth', label: 'Net worth', target: '#/networth', result: sh.netWorth, shown: summaryMoney(sh.netWorth.value), lines: [sh.liquidNetWorth.value === null ? null : ['Cash after card debt ', metric('liquidNetWorth', summaryMoney(sh.liquidNetWorth.value))]] }),
    // The Plan works from what is left after saving; the tile says it too, so the two never read as a disagreement.
    tile(spine, { id: 'surplus', label: 'Monthly surplus', target: '#/surplus', result: cf.monthlySurplus, shown: summaryMoney(cf.monthlySurplus.value), lines: [cf.monthlySurplus.value !== null && cf.saving.afterTax.value && cf.surplus.value !== null ? [metric('leftAfterSaving', summaryMoney(cf.surplus.value)), ' after saving'] : null] }),
    tile(spine, { id: 'savings', label: 'Savings rate', target: '#/savings', result: cf.savingsRate.net, shown: pct(cf.savingsRate.net.value, 0) }),
    tile(spine, { id: 'runway', label: 'Cash runway', target: '#/runway', result: em.tiers.full.runway, shown: months(em.tiers.full.runway.value) + ' months' })];
  // Which tiles and in what order (Preferences, "What Today shows"); an unknown id is skipped. The next step is its own
  // card below the tiles (Krug pass), so an old "next" in the preference is skipped too.
  const ids = ['networth', 'surplus', 'savings', 'runway'];
  const want = (Array.isArray(pref('todayTiles')) ? pref('todayTiles') : ids).filter((id) => ids.includes(id));
  return h('div', { class: 'tiles tiles-2x2' }, want.map((id) => all[ids.indexOf(id)]));
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
function networthScreen({ s }) {
  const sh = s.sheet;
  return h('section', { class: 'card', 'aria-label': 'Net worth' },
    h('ul', { class: 'sum-lines' }, line('Net worth', sh.netWorth.value, 'sum-total'), line('Cash after card debt', sh.liquidNetWorth.value)),
    h('a', { class: 'btn', href: numbersHref() }, 'Open My numbers'),
    keptMath('screen-networth', DASHBOARD_MATH['tile-networth'], mathCtx));
}
// The money flow, on its own screen (Krug pass): Today has one row that opens it.
function flowScreen({ spine, rules, s }) { return flowPart(spine, rules, s); }
// Also worth doing (Krug pass): every other ranked step, the cards, the questions, and what is done, one screen.
function moreScreen(m) { return flagsSection(m.spine, m.s.flags, rankOf(m.spine, m.rules, m.s)); }
const SCREENS = { surplus: surplusScreen, savings: savingsScreen, runway: runwayScreen, networth: networthScreen, flow: flowScreen, more: moreScreen };

function render({ spine: base, rules, levels }) {
  const m = model(base, rules);
  if (levels.length && SCREENS[levels[0]]) return SCREENS[levels[0]](m);
  // Krug pass: the warning (if any), the four tiles, one Next step card, then rows that open the rest.
  const rank = rankOf(m.spine, rules, m.s);
  const others = alsoWorth(m.spine, m.s.flags, rank);
  // Guesses worth checking now (Rough now and later): the shared ranking, worked out after the page draws.
  const g = guessesFor(base, rules, () => refresh());
  const guesses = g ? g.items.filter((it) => it.urgency === 'now').length : null;
  return [
    cashCard(base, rules),
    tiles(m),
    nextCard(m.spine, rank),
    h('ul', { class: 'go-list' },
      others.length ? h('li', {}, h('a', { class: 'go-row plain', href: '#/more' }, h('span', { class: 'go-name' }, 'Also worth doing (' + others.length + ')'))) : null,
      h('li', {}, h('a', { class: 'go-row plain', href: '#/flow' }, h('span', { class: 'go-name' }, 'Where the money goes'))),
      guesses !== 0 ? h('li', {}, h('a', { class: 'go-row plain', href: numbersHref('still-guessing') }, h('span', { class: 'go-name' }, guesses === null ? 'Guesses' : guesses + ' worth checking now'), guesses === null ? h('span', { class: 'go-sub' }, 'Working out which matter...') : null)) : null,
      h('li', {}, h('a', { class: 'go-row plain', href: 'onepager.html' }, h('span', { class: 'go-name' }, 'One-pager to print'))))
  ];
}

// Cash ahead (audit, 2026-10-27): the one forecast every screen reads. Under the floor it is the first card, ending
// with the fix as a button; above it, one line.
function cashCard(spine, rules) {
  const { story } = forecast(spine, rules);
  if (!story) return null;
  if (!story.under) return null;
  return h('section', { class: 'card flag flag-red cash-first', id: 'cash-low', 'aria-labelledby': 'cash-low-h' },
    h('h2', { id: 'cash-low-h', class: 'flag-title' }, 'Checking goes under your floor'),
    h('p', { class: 'flag-line' }, lowWords(story) + '. Your floor is ' + money(story.floor) + '.'),
    h('div', { class: 'flag-actions' }, fixButton(story)));
}

// The money flow (S-192). No Split here (audit 4): each section opens its screen in My numbers, where its lines are.
function flowPart(spine, rules, s) {
  return flowSection(moneyFlow(spine, rules, s.cashflow, { open: [] }), {
    open: [], month: MONTH_NAMES[+s.ym.slice(5, 7) - 1], onToggle: null,
    listOpen: !!kept().flowList, onList: (on) => { if (!!kept().flowList !== on) keep({ flowList: on }); }
  });
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
// The one Next step card on Today: the ranked step, or the question that holds the plan back.
function nextCard(spine, rank) {
  const step = rank && rank.first, ask = rank && rank.questions[0];
  if (!step && !ask) return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing to work on right now.'));
  return h('section', { class: 'card', 'aria-labelledby': 'next-h' }, h('h2', { id: 'next-h' }, 'Next step'), h('ul', { class: 'flags' }, step ? stepCard(step) : questionCard(ask)));
}
// What else is worth doing: the cards that are not the next step, card use only when the Profile says they will
// apply for credit within a year (and once), and the questions not already shown.
function alsoWorth(spine, flags, rank) {
  const credit = answersOf(spine).applyCredit === 'yes';
  const isCardUse = (f) => f.id.startsWith('utilization');
  const cards = flags.filter((f) => (f.stage === 'red' || (f.stage === 'yellow' && !f.id.startsWith('input-'))) && (!isCardUse(f) || (credit && f.id === 'utilization-personal')));
  const steps = rank ? rank.steps.slice(1).filter((x) => !x.id.startsWith('utilization')) : [];
  const asks = rank ? rank.questions.slice(rank.first ? 0 : 1) : [];
  return [...steps.map((x) => ({ step: x })), ...asks.map((q) => ({ ask: q })), ...cards.map((f) => ({ flag: f }))];
}
// Also worth doing: every other ranked step, the questions, the cards, and what is done.
function flagsSection(spine, flags, rank) {
  const done = flags.filter((f) => f.stage === 'green');
  const items = alsoWorth(spine, flags, rank);
  return [
    items.length ? h('section', { class: 'card' }, h('ul', { class: 'flags' }, items.map((x) => (x.step ? stepCard(x.step) : x.ask ? questionCard(x.ask) : flagItem(spine, x.flag))))) : h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing else right now.')),
    done.length ? h('details', { class: 'card done-group', open: kept().done || null, ontoggle: (e) => { if (!!kept().done !== e.target.open) keep({ done: e.target.open }); } },
      h('summary', {}, h('span', {}, 'Done'), h('span', { class: 'count' }, String(done.length))), h('ul', { class: 'flags' }, done.map((f) => flagItem(spine, f)))) : null
  ];
}

// The One-pager is a button here; its Back comes back to Today.
startPage({ tab: 'today', title: 'Today', render, name: (levels) => ({ surplus: 'Monthly surplus', savings: 'Savings rate', runway: 'Cash runway', networth: 'Net worth', flow: 'Where the money goes', more: 'Also worth doing' }[levels[0]] || null) });
