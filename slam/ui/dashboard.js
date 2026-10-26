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
import { estimatedVsActual, monthOutlook } from '../engine/compare.js';
import { cashsim } from '../engine/cashsim.js';
import { safeToSpend } from '../engine/spending.js';
import { waiting } from '../engine/calendar-views.js';
import { flowSection } from './flow-chart.js';
import { pickedScenario, scenarioBar } from './scenario.js';
import { SCENARIO_WORDS } from '../engine/scenarios.js';
import { h, chip, money, pct, shortDate, ledgerHref } from './view.js';
import { toneOf } from '../engine/profile.js';

const monthLabel = (ym) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
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
  return [note, mathCtx && MATH_FOR._m.get(r) ? keptMath(MATH_FOR._m.get(r).key, MATH_FOR._m.get(r).ids, mathCtx) : null];
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

// Utilization in words: "Personal cards 35.0% ($4,200 of $12,000)."
function utilLine(r, label) {
  return r.value === null ? label + ': not enough to figure yet.' : label + ' ' + pct(r.value, 1) + ' (' + money(r.balance) + ' of ' + money(r.limit) + ').';
}

// The picked Triple D set (S-183) replaces the real return and withdrawal rate
// before anything is figured, so every FI number and the projection follow it.
let scenario = pickedScenario();
// Sections of the money flow split into their expenses (S-192): kept with this screen, so coming back opens them again.
const flowOpen = () => kept().flowOpen || [];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function render({ spine: base, rules }) {
  const spine = withScenario(base, rules, scenario);
  const s = summarize(spine, rules);
  const compare = estimatedVsActual(spine, rules, { months: 1 });
  // Cash at a glance (S-209, the Budget's Today strip): checking on the as-of day, the lowest point ahead, safe to spend.
  const sim = cashsim(spine, rules, { months: 1 });
  const safe = safeToSpend(sim);
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const outlook = monthOutlook(spine, rules, sim, { today: todayIso(), waiting: waiting(spine, rules, { today: todayIso() }) });
  mathCtx = { spine, rules, s, compare, spend: { safe }, monthOut: outlook };
  const cf = s.cashflow, sh = s.sheet, em = s.emergency, fi = s.fi, tx = s.tax, pr = s.debt.promo, ut = s.debt.utilization;
  const promoBy = pr.items.length ? pr.items[pr.items.length - 1].promoEnds : null;

  const backstop = h('div', { class: 'backstop' },
    em.backstop.contributions.value ? h('p', { class: 'tile-sub' }, 'Also there in a pinch: ' + money(em.backstop.contributions.value) + ' of Roth contributions, no tax or penalty.') : null,
    ...em.backstop.conversions.map((c) => h('p', { class: 'tile-sub' }, money(c.amount) + ' converted in ' + c.year + (c.penaltyFree ? ': free to take out.' : ': a ' + pct(c.penaltyRate) + ' penalty before ' + shortDate(c.clockOpens) + '.'))));

  const tiles = [
    tile(spine, { id: 'networth', label: 'Net worth', target: numbersHref(), result: sh.netWorth, shown: money(sh.netWorth.value), lines: [money(sh.assets.value) + ' owned, ' + money(sh.debts.value) + ' owed.'] }),
    tile(spine, {
      id: 'runway', label: 'Cash runway', target: numbersHref('assets', 'cash'), result: em.tiers.full.runway, shown: months(em.tiers.full.runway.value) + ' months',
      lines: [
        money(sh.cash.value) + ' in cash; ' + money(em.tiers.full.burn.value) + ' a month goes out.',
        sh.setAsideNote,
        'Rule of 5 goal: ' + em.targetMonths.value + ' months (' + money(em.targetDollars.value) + ').'
      ],
      extra: em.backstop.contributions.value || em.backstop.conversions.length ? backstop : null
    }),
    tile(spine, { id: 'surplus', label: 'Monthly surplus', target: numbersHref('needs'), result: cf.monthlySurplus, shown: money(cf.monthlySurplus.value), lines: [
        cf.income.takeHome.value === null ? null : 'Left of ' + money(cf.income.takeHome.value) + ' take-home after spending, debt minimums and the tax set-aside.'
      ] }),
    tile(spine, { id: 'savings', label: 'Savings rate', target: numbersHref('income'), result: cf.savingsRate.net, shown: pct(cf.savingsRate.net.value, 1) + ' of take-home' }),
    tile(spine, {
      id: 'cards', label: 'Credit cards', target: numbersHref('debt', 'credit-cards'), result: sh.cards, shown: money(sh.cards.value),
      lines: [
        pr.items.length ? money(pr.total.value) + ' on promo, due ' + shortDate(promoBy) + ': ' + money(pr.monthly.value) + ' a month clears it.' : null,
        utilLine(ut.personal, 'Personal cards: limits used')
      ]
    }),
    tile(spine, {
      id: 'fi', label: 'Financial independence', target: numbersHref('goals'), result: fi.fiPercent, shown: pct(fi.fiPercent.value, 1),
      lines: [
        money(sh.invested.value) + ' invested of ' + money(fi.today.value) + ' at today\'s spending.',
        fi.yearsToFi.value !== null ? 'About ' + fi.yearsToFi.value.toFixed(1) + ' years at this pace.' : fi.yearsToFi.note ? 'Years to FI: ' + fi.yearsToFi.note + '.' : null,
        [SCENARIO_WORDS[scenario] + ' assumptions. ', h('a', { href: '#scenario' }, 'Change')]
      ]
    }),
    tile(spine, {
      id: 'cash', label: 'Safe to spend, as of ' + shortDate(spine.meta.asOf), target: 'calendar.html' + (safe.low ? '#' + safe.low.date.slice(0, 7) : ''), result: { value: safe.today, kind: safe.kind, from: safe.cashPath ? [safe.cashPath] : [], rough: safe.rough, missing: safe.missing },
      shown: money(safe.today), missingText: 'Missing: a checking balance',
      lines: [
        safe.shortfall ? 'Checking runs ' + money(safe.shortfall.amount) + ' short' + (safe.floor > 0 ? ' of the floor' : '') + ' by ' + shortDate(safe.shortfall.date) + '.' : safe.today !== null ? 'Through ' + shortDate(safe.through) + '.' : null,
        safe.setAsideNote || null,
        [h('a', { href: 'spending.html#checkin' }, 'Check in balances ›'), ' ', h('a', { href: 'spending.html#log' }, 'Add a purchase ›')]
      ]
    }),
    tile(spine, {
      // Nothing logged this month: no number (empty is not zero), and the card says so.
      id: 'compare', label: monthLabel(compare.to) + ' vs plan', result: { value: compare.monthsLogged.length ? compare.spend.diff : null, kind: compare.monthsLogged.length ? compare.kind : 'missing', from: [], rough: compare.monthsLogged.length ? compare.rough : [], missing: compare.monthsLogged.length ? compare.missing : [] },
      shown: (compare.spend.onPlan ? 'On the plan' : compare.spend.diff > 0 ? money(compare.spend.diff) + ' over the plan' : compare.spend.diff < 0 ? money(-compare.spend.diff) + ' under the plan' : 'On the plan'), missingText: compare.monthsLogged.length ? null : 'Nothing added this month yet',
      lines: [
        compare.monthsLogged.length ? 'Spent ' + money(compare.spend.actual) + ' of ' + (compare.spend.planned === null ? 'a plan with a missing line' : money(compare.spend.planned) + ' planned') + ' (' + compare.spend.entries + (compare.spend.entries === 1 ? ' entry' : ' entries') + ').' : null,
        compare.income.actual !== null ? 'Income ' + money(compare.income.actual) + (compare.income.planned !== null ? ' of ' + money(compare.income.planned) + ' planned' : '') + '.' : compare.monthsLogged.length ? 'No income added yet, so no real savings rate.' : null,
        compare.savingsRate.real !== null ? 'Savings rate ' + pct(compare.savingsRate.real, 1) + (compare.savingsRate.plan !== null ? ' (plan ' + pct(compare.savingsRate.plan, 1) + ')' : '') + '.' : null,
        outlook.stale ? 'Check in balances to see the month so far.' : ['So far: ', h('span', { class: outlook.soFar < 0 ? 'neg' : 'pos' }, (outlook.soFar < 0 ? '-' : '+') + money(Math.abs(outlook.soFar))), '. By month end: ' + (outlook.expected === null ? 'missing' : (outlook.expected < 0 ? '-' : '+') + money(Math.abs(outlook.expected))) + '.'],
        [h('a', { href: 'spending.html' }, 'Add a purchase or import a statement ›')]
      ]
    }),
    tile(spine, {
      id: 'tax', label: tx.year + ' tax still owed (estimate)', target: numbersHref('taxes'), result: tx.balanceDue,
      shown: money(tx.balanceDue.value), missingText: tx.missingText ? tx.missingText.charAt(0).toUpperCase() + tx.missingText.slice(1) : null,
      lines: [
        tx.balanceDue.value === null && tx.partial ? 'At least ' + money(tx.partial.federalIncomeTax.value) + ' federal on the ' + tx.year + ' income known so far.' : null,
        'Next payment due ' + shortDate(tx.nextEstimated.date) + '.',
        tx.notModeled.length ? 'Not included: ' + tx.notModeled.join(', ') + '.' : null
      ]
    })
  ];

  // The tabs, the header and Undo come from the shell; the Calendar is a tab, and the Windfall opens from Plan.
  return [
    h('div', { class: 'tiles' }, tiles),
    scenarioBar(base, rules, scenario, (id) => { scenario = id; refresh(); document.getElementById('scenario')?.scrollIntoView({ block: 'nearest' }); }),
    flowPart(spine, rules, s),
    flagsSection(spine, s.flags)
  ];
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
  return h('li', { class: 'flag flag-' + f.stage, id: 'flag-' + f.id },
    h('h3', { class: 'flag-title' }, c.headline),
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
startPage({ tab: 'today', title: 'Today', render, actions: () => h('a', { class: 'btn', href: 'onepager.html' }, 'One-pager') });
