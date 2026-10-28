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
import { openQuestions } from '../engine/questions.js';
import { netWorthWaterfallCard, netWorthTimeCard, netWorthSpark } from './chart-cards.js';
import { netWorthAhead } from '../engine/charts.js';
import { headlineStrip } from './strip.js';
import { endCall, nextCard as guideNext, STEPS as GUIDE_STEPS } from './guide.js';
import { lastStep } from './clients.js';
import { LEVEL1, asked } from '../engine/profile.js';
import { endCallTodos } from './end-call.js';
import { nothingEntered } from '../engine/blank.js';
import { money as dollars } from '../src/ui/format.js';
import { catalog } from './ticks.js';
import { sentenceCard, tryItCard } from './try-it.js';
import { todayIso } from './view.js';
const catalogNow = () => catalog;

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
// Empty is not zero: with nothing entered yet (engine/blank.js), every number on this page says "Not yet" instead of $0.
let blank = false;
const MATH_FOR = { _m: new Map() };
const TILE_METRIC = { networth: 'netWorth', surplus: 'surplus', savings: 'savingsRateNet', runway: 'runway' };
function tile(spine, { id, label, result, shown, missingText, target = null, lines = [], extra = null }) {
  MATH_FOR._m.set(result, { key: 'tile-' + id, ids: DASHBOARD_MATH['tile-' + id] });
  const first = target;
  const value = result.value === null || blank
    ? h('p', { class: 'tile-value missing-text' }, missingText || 'Not yet')
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
  blank = nothingEntered(spine);
  return { spine, rules, s, base };
}

let rankMemo = { spine: null, rules: null, s: null, rank: null };
function rankOf(spine, rules, s) {
  if (rankMemo.spine !== spine || rankMemo.rules !== rules || rankMemo.s !== s) rankMemo = { spine, rules, s, rank: rankSteps(spine, rules, s, { sim: maxItFor(spine, rules).sim }) };
  return rankMemo.rank;
}
// The ranked step and the questions, as Do first's cards: a headline, one line, one button with a verb. Only the Next
// step card's button is filled (S-287: one primary per screen); on Also worth doing every button is outlined.
function stepCard(step, primary = false) {
  return h('li', { class: 'flag flag-red', id: 'step-' + step.id.replace(/[^a-z0-9]+/gi, '-') },
    h('h3', { class: 'flag-title' }, step.label),
    // Said once (Krug pass): the reason, which already names the dollars; the dollars alone when there is no reason.
    h('p', { class: 'flag-line' }, step.why || (step.loss ? 'About ' + money(step.loss) + ' a month lost until it is done.' : '')),
    h('div', { class: 'flag-actions' }, h('a', { class: primary ? 'btn primary small' : 'btn small', href: stepHref(step) }, step.rung ? 'Make a plan' : 'Open it')));
}
function questionCard(q) {
  return h('li', { class: 'flag flag-yellow', id: 'ask-' + q.rung },
    h('h3', { class: 'flag-title' }, q.question),
    h('p', { class: 'flag-line' }, 'One number, so the plan can count "' + q.label.toLowerCase() + '".'),
    h('div', { class: 'flag-actions' }, h('a', { class: 'btn small', href: q.path ? ledgerHref(q.path) : 'plan.html' }, 'Answer it')));
}

function tiles({ spine, rules, s }) {
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  // Net worth leads with the total; the liquid figure is named "Reachable after all debts" (Krug pass), so it never reads
  // as a second cash number beside the runway's.
  const all = [
    // Money the client owns is plain dollars even with Money as time on (the switch tags what is spent or saved).
    tile(spine, { id: 'networth', label: 'Net worth', target: '#/networth', result: sh.netWorth, shown: summaryMoney(sh.netWorth.value, true), lines: [sh.liquidNetWorth.value === null || blank ? null : ['Reachable after all debts ', metric('liquidNetWorth', summaryMoney(sh.liquidNetWorth.value, true))]], extra: blank ? null : netWorthSpark(aheadOf(spine, rules)) }),
    // The Plan works from what is left after saving; the tile says it too, so the two never read as a disagreement.
    tile(spine, { id: 'surplus', label: 'Monthly surplus', target: '#/surplus', result: cf.monthlySurplus, shown: summaryMoney(cf.monthlySurplus.value), lines: [cf.monthlySurplus.value !== null && cf.saving.afterTax.value && cf.surplus.value !== null ? [metric('leftAfterSaving', summaryMoney(cf.surplus.value)), ' after saving'] : null] }),
    tile(spine, { id: 'savings', label: 'Savings rate', target: '#/savings', result: cf.savingsRate.net, shown: pct(cf.savingsRate.net.value, 1) }),
    tile(spine, { id: 'runway', label: 'Cash runway', target: '#/runway', result: em.tiers.full.runway, shown: months(em.tiers.full.runway.value) + ' months' })];
  // Which tiles and in what order (Preferences, "What Today shows"); an unknown id is skipped. The next step is its own
  // card below the tiles (Krug pass), so an old "next" in the preference is skipped too.
  const ids = ['networth', 'surplus', 'savings', 'runway'];
  const want = (Array.isArray(pref('todayTiles')) ? pref('todayTiles') : ids).filter((id) => ids.includes(id));
  return h('div', { class: 'tiles tiles-2x2' }, want.map((id) => all[ids.indexOf(id)]));
}

// ---------------------------------------------------------------- the tile screens
const line = (label, value, cls = '', fmt = money) => h('li', { class: 'sum-line ' + cls }, h('span', {}, label), h('span', { class: 'num' }, value === null || value === undefined || blank ? 'Not yet' : fmt(value)));
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
    h('p', { class: 'tile-value' }, cf.savingsRate.net.value === null || blank ? 'Not yet' : pct(cf.savingsRate.net.value, 1) + ' of pay after tax'),
    h('ul', { class: 'sum-lines' },
      line('Saved from take-home', sv.fromTakeHome),
      line('Retirement from your paycheck', sv.payroll.value),
      line('Employer match', sv.match.value),
      line('Extra on debt', sv.extraDebt.value),
      line('All of it, a month', sv.total, 'sum-total')),
    h('p', { class: 'tile-sub' }, (cf.savingsRate.gross.value === null || blank ? '' : 'Of gross pay it is ' + pct(cf.savingsRate.gross.value, 1) + '. ') + 'Money left over but not set to go anywhere is not counted.'),
    keptMath('screen-savings', ['savingsRateNet', 'savingsRateGross'], mathCtx));
}
function runwayScreen({ s }) {
  const em = s.emergency, sh = s.sheet;
  return [
    h('section', { class: 'card nw-pair', 'aria-label': 'Cash runway' },
      h('div', { class: 'nw-one' }, h('p', { class: 'tile-label' }, 'At today\'s spending'), h('p', { class: 'tile-value' }, em.tiers.full.runway.value === null || blank ? 'Not yet' : months(em.tiers.full.runway.value) + ' months'), keptMath('screen-runway', ['runway'], mathCtx)),
      h('div', { class: 'nw-one' }, h('p', { class: 'tile-label' }, 'On needs only'), h('p', { class: 'tile-value' }, em.tiers.needsOnly.runway.value === null || blank ? 'Not yet' : months(em.tiers.needsOnly.runway.value) + ' months'), keptMath('screen-runway-needs', ['runwayNeeds'], mathCtx))),
    h('section', { class: 'card', 'aria-labelledby': 'cushion-h' }, h('h2', { id: 'cushion-h' }, 'Build my cushion'),
      // A reached step is the check mark on its row; only a step still to go says how much.
      h('ol', { class: 'cushion-steps' }, em.cushion.map((c) => h('li', { class: c.reached && !blank ? 'is-done' : '' }, h('span', {}, c.label), h('span', { class: 'num' }, c.target.value === null || blank ? 'Not yet' : money(c.target.value)), h('span', { class: 'muted' }, c.reached === false && !blank ? money(c.toGo) + ' to go' : '')))),
      sh.cash.value === null || blank ? null : h('p', { class: 'tile-sub' }, money(sh.cash.value) + ' in cash.'), sh.setAsideNote ? h('p', { class: 'tile-sub' }, sh.setAsideNote) : null, sh.unvestedNote ? h('p', { class: 'tile-sub' }, sh.unvestedNote) : null,
      em.backstop.contributions.value ? h('p', { class: 'tile-sub' }, 'Also there in a pinch: ' + money(em.backstop.contributions.value) + ' of Roth contributions, no tax or penalty.') : null,
      em.backstop.disability && em.backstop.disability.monthly ? h('p', { class: 'tile-sub' }, 'If you cannot work: disability insurance pays about ' + money(em.backstop.disability.monthly) + ' a month' + (em.backstop.disability.waitDays !== null ? ' after ' + em.backstop.disability.waitDays + ' days; the cushion carries you until then.' : '.')) : null,
      em.backstop.plans.length ? h('p', { class: 'tile-sub' }, 'Also without the 10% penalty (income tax still applies): ' + em.backstop.plans.map((q) => q.name + (q.amount === null ? '' : ', ' + money(q.amount)) + ', because ' + q.why).join('; ') + '.') : null,
      keptMath('screen-cushion', ['cushionNeeds', 'cushionMonth', 'ruleOf5Dollars'], mathCtx))
  ];
}
// Net worth: the totals, then two charts (Track C): what makes it up, and how it is changing (a range switch).
function networthScreen({ spine, rules, s }) {
  const sh = s.sheet, range = (kept() || {}).nwRange || '1y';
  // Money the client owns is plain dollars (no Money as time tag); with nothing entered yet there is no chart to draw.
  return [h('section', { class: 'card', 'aria-label': 'Net worth' },
    h('ul', { class: 'sum-lines' }, line('Net worth', sh.netWorth.value, 'sum-total', dollars), line('Reachable after all debts', sh.liquidNetWorth.value, '', dollars)),
    h('a', { class: 'btn', href: numbersHref() }, 'Open Numbers'),
    keptMath('screen-networth', DASHBOARD_MATH['tile-networth'], mathCtx)),
  blank ? null : h('section', { class: 'card' }, netWorthWaterfallCard(sh, spine)),
  blank ? null : h('section', { class: 'card' }, netWorthTimeCard(spine, sh, aheadOf(spine, rules), { range, asOf: s.asOf, onRange: (k) => { keep({ nwRange: k }); refresh(); } }))];
}
// The projection's months ahead, figured once per household (the sparkline and the chart read the same months).
let ahead = { spine: null, months: null };
const aheadOf = (spine, rules) => { if (ahead.spine !== spine) ahead = { spine, months: netWorthAhead(spine, rules, { years: 30 }) }; return ahead.months; };
// The money flow, on its own screen (Krug pass): Today has one row that opens it.
function flowScreen({ spine, rules, s }) { return [flowPart(spine, rules, s), keptMath('screen-flow', ['leftAfterSaving', 'surplus'], mathCtx)]; }
// Also worth doing (Krug pass): every other ranked step, the cards, the questions, and what is done, one screen.
function moreScreen(m) { return flagsSection(m.spine, m.s.flags, rankOf(m.spine, m.rules, m.s), askedPaths(m.base, m.rules)); }
// The numbers the Next card already asks for, so a card is not asked a second time below it.
const askedPaths = (base, rules) => new Set((openQuestions(base, guessesFor(base, rules, () => refresh())) || []).map((q) => q.path));
const SCREENS = { surplus: surplusScreen, savings: savingsScreen, runway: runwayScreen, networth: networthScreen, flow: flowScreen, more: moreScreen };

function render(ctx) {
  const { spine: base, rules, levels } = ctx;
  if (levels[0] === 'end') return endCall(ctx);
  const m = model(base, rules);
  if (levels.length && SCREENS[levels[0]]) return SCREENS[levels[0]](m);
  // Home (S-280): today's agenda first (where we left off, the next three things to fill, the open to-dos), then
  // Before our first call while it has open items; Today's cards stay, folded, under them. The numbers are the strip.
  const rank = rankOf(m.spine, rules, m.s);
  const g = guessesFor(base, rules, () => refresh());
  const open = openQuestions(base, g);
  const others = alsoWorth(m.spine, m.s.flags, rank, new Set((open || []).map((q) => q.path)));
  const guesses = open ? open.length : null;
  return [
    sentenceCard(base, rules),
    headlineStrip(base, rules, { timeSwitch: true }),
    cashCard(base, rules),
    agendaCard(base, g),
    nextFill(ctx),
    tryItCard(base, rules, todayIso()),
    beforeCard(base),
    h('details', { class: 'card done-group home-more', open: kept().all || null, ontoggle: (e) => { if (!!kept().all !== e.target.open) keep({ all: e.target.open }); } },
      h('summary', {}, h('span', {}, 'Today\'s numbers in full'), h('span', { class: 'count' }, 'net worth, surplus, savings rate, runway, next step')),
      tiles(m),
      nextCard(m.spine, rank),
      h('ul', { class: 'go-list' },
        others.length ? h('li', {}, h('a', { class: 'go-row plain', href: '#/more' }, h('span', { class: 'go-name' }, 'Also worth doing (' + others.length + ')'))) : null,
        h('li', {}, h('a', { class: 'go-row plain', href: '#/flow' }, h('span', { class: 'go-name' }, 'Where the money goes'))),
        // The One-pager opens from End call and from here (QUESTIONS.md 197).
        h('li', {}, h('a', { class: 'go-row plain', href: 'onepager.html' }, h('span', { class: 'go-name' }, 'One-pager (print or save)'))),
        guesses !== 0 ? h('li', {}, h('a', { class: 'go-row plain', href: numbersHref('still-guessing') }, h('span', { class: 'go-name' }, guesses === null ? 'Guesses: counting...' : [h('span', { 'data-metric': 'list:open' }, String(guesses)), ' guesses worth checking']))) : null))
  ];
}

// The agenda (S-280): where the call stopped (Guide me, at that step), and the open to-dos from last time: the same
// list End call handed out (its open numbers, the homework and the type to-dos), one source.
function agendaCard(spine, g) {
  const step = lastStep(), at = step ? (GUIDE_STEPS.find((x) => x[0] === (step === 'taxes' ? 'income' : step)) || null) : null;
  const all = endCallTodos(spine, g, catalogNow()).map((t) => ({ words: t.words, href: t.path ? ledgerHref(t.path) : 'profile.html#/homework', who: t.who }));
  return h('section', { class: 'card agenda', 'aria-labelledby': 'agenda-h' },
    h('h2', { id: 'agenda-h' }, 'Today\'s agenda'),
    h('a', { class: 'go-row agenda-resume', href: 'ledger.html?guide=1' + (at ? '#/' + at[0] : '') },
      h('span', { class: 'go-name' }, at ? 'Pick up where we left off: ' + at[2] : 'Start the call: Guide me'),
      h('span', { class: 'go-sub' }, at ? 'Guide me, step ' + (GUIDE_STEPS.indexOf(at) + 1) + ' of ' + GUIDE_STEPS.length : 'Six steps, Needs first')),
    all.length ? h('div', { class: 'agenda-todos' },
      h('h3', {}, 'Open to-dos from last time (' + all.length + ')'),
      h('ul', { class: 'todo-list' }, all.slice(0, 3).map((t) => h('li', {}, h('a', { href: t.href }, t.words), t.who === 'coach' ? h('span', { class: 'pill' }, 'for the coach') : null))),
      all.length > 3 ? h('p', {}, h('a', { href: 'profile.html#/todo' }, 'All ' + all.length + ' to-dos')) : null) : null);
}
// The next three things to fill, ranked by how much each moves the headline numbers (Guide me's Next card).
const nextFill = (ctx) => guideNext(ctx);
// Before our first call (S-280): a card on Home while the client's first questions have open items.
function beforeCard(spine) {
  const a = answersOf(spine), l1 = LEVEL1.filter((q) => asked(a, q)), open = l1.filter((q) => a[q.id] === undefined).length;
  if (!open) return null;
  return h('section', { class: 'card before-card', 'aria-labelledby': 'before-h' },
    h('h2', { id: 'before-h' }, 'Before our first call'),
    h('p', {}, open + ' of ' + l1.length + ' questions still open.'),
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn', href: 'before.html' }, 'Open the questions'), h('a', { class: 'btn', href: 'where.html' }, 'Where to find each number')));
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
    h('div', { class: 'flag-actions' }, fixButton(story, 'btn small')));
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

// One card: a short headline, one line of numbers, one outlined button with a verb (the Next step card holds the one
// filled button, S-287); a smaller second way when there is one; then Show the math, small, after the action.
function flagItem(spine, f) {
  const c = f.card || { headline: f.title, line: '', action: null };
  // Numbers only (tone): the numbers line and the button, no sentence around them; a card with no numbers keeps its headline.
  const bare = toneOf(spine) === 'numbers' && c.line;
  return h('li', { class: 'flag flag-' + f.stage, id: 'flag-' + f.id },
    bare ? null : h('h3', { class: 'flag-title' }, c.headline),
    c.line ? h('p', { class: 'flag-line' }, c.line) : null,
    h('div', { class: 'flag-actions' },
      actionEl(c.action, 'btn small'),
      c.alt ? actionEl(c.alt, 'flag-alt') : null,
      flagMath(f).length ? keptMath('flag-' + f.id, flagMath(f), mathCtx) : null));
}

// Three groups: Do first, Next up, Done (folded, with a count). A number that only rests on guesses is one row that
// opens Still guessing, not a card each.
// The one Next step card on Today: the ranked step, or the question that holds the plan back.
function nextCard(spine, rank) {
  const step = rank && rank.first, ask = rank && rank.questions[0];
  if (!step && !ask) return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing to work on right now.'));
  return h('section', { class: 'card', 'aria-labelledby': 'next-h' }, h('h2', { id: 'next-h' }, 'Next step'), h('ul', { class: 'flags' }, step ? stepCard(step, true) : questionCard(ask)));
}
// What else is worth doing: the cards that are not the next step, card use only when the Profile says they will
// apply for credit within a year (and once), and the questions not already shown. A number the Next card already asks
// for (openPaths) is not asked again as a "missing a number" card.
function alsoWorth(spine, flags, rank, openPaths = new Set()) {
  const credit = answersOf(spine).applyCredit === 'yes';
  const isCardUse = (f) => f.id.startsWith('utilization');
  const askedAlready = (f) => f.stage === 'red' && f.id.startsWith('input-') && openPaths.has((f.from || [])[0]);
  const cards = flags.filter((f) => (f.stage === 'red' || (f.stage === 'yellow' && !f.id.startsWith('input-'))) && !askedAlready(f) && (!isCardUse(f) || (credit && f.id === 'utilization-personal')));
  const steps = rank ? rank.steps.slice(1).filter((x) => !x.id.startsWith('utilization')) : [];
  const asks = rank ? rank.questions.slice(rank.first ? 0 : 1) : [];
  return [...steps.map((x) => ({ step: x })), ...asks.map((q) => ({ ask: q })), ...cards.map((f) => ({ flag: f }))];
}
// Also worth doing: every other ranked step, the questions, the cards, and what is done.
function flagsSection(spine, flags, rank, openPaths) {
  const done = flags.filter((f) => f.stage === 'green');
  const items = alsoWorth(spine, flags, rank, openPaths);
  return [
    items.length ? h('section', { class: 'card' }, h('ul', { class: 'flags' }, items.map((x) => (x.step ? stepCard(x.step) : x.ask ? questionCard(x.ask) : flagItem(spine, x.flag))))) : h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing else right now.')),
    done.length ? h('details', { class: 'card done-group', open: kept().done || null, ontoggle: (e) => { if (!!kept().done !== e.target.open) keep({ done: e.target.open }); } },
      h('summary', {}, h('span', {}, 'Done'), h('span', { class: 'count' }, String(done.length))), h('ul', { class: 'flags' }, done.map((f) => flagItem(spine, f)))) : null
  ];
}

// The One-pager is a row in Today's numbers in full; its Back comes back here.
startPage({ tab: 'home', title: 'Home', render, name: (levels) => ({ end: 'End call', surplus: 'Monthly surplus', savings: 'Savings rate', runway: 'Cash runway', networth: 'Net worth', flow: 'Where the money goes', more: 'Also worth doing' }[levels[0]] || null) });
