// The Dashboard: the one-pager out. Every number comes from engine/summary.js
// and links to the Ledger fields it was built from. Formatting only.

import { mountPage } from './page.js';
import { summarize } from '../engine/summary.js';
import { DASHBOARD_MATH, flagMath } from '../engine/math.js';
import { mathButton } from './math-panel.js';
import { labelFor } from '../engine/labels.js';
import { loadAll, SOURCE_WORDS } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { moneyFlow } from '../engine/flow.js';
import { estimatedVsActual, monthOutlook } from '../engine/compare.js';
import { cashsim } from '../engine/cashsim.js';
import { safeToSpend } from '../engine/spending.js';
import { cashReading, waiting } from '../engine/calendar-views.js';
import { flowSection } from './flow-chart.js';
import { pickedScenario, scenarioBar, scenarioText } from './scenario.js';
import { h, chip, money, pct, shortDate, ledgerHref, showValue } from './view.js';

const app = document.getElementById('app');
mountPage({ app });
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
    : rough.length ? h('p', { class: 'tile-note' }, chip('rough'), ' Built on ' + rough.length + ' rough number' + (rough.length === 1 ? '' : 's')) : null;
  return [note, mathCtx && MATH_FOR._m.get(r) ? mathButton(MATH_FOR._m.get(r), mathCtx) : null];
}

// One tile: a label, the big number (a link to its first field), lines under it.
// Which metrics each tile's "Show the math" opens (engine/math.js DASHBOARD_MATH).
let mathCtx = null;
const MATH_FOR = { _m: new Map() };
function tile(spine, { id, label, result, shown, missingText, lines = [], extra = null }) {
  MATH_FOR._m.set(result, DASHBOARD_MATH['tile-' + id]);
  const first = (result.from || [])[0];
  const value = result.value === null
    ? h('p', { class: 'tile-value missing-text' }, missingText || 'Not enough to figure yet')
    : h('p', { class: 'tile-value' }, shown);
  // The number is plain; a link under it says where it opens (CLAUDE.md affordances 4 and 5).
  const view = first ? h('a', { class: 'tile-view', href: ledgerHref(first) }, 'View in the Ledger ›') : null;
  return h('section', { class: 'tile', id: 'tile-' + id, 'aria-labelledby': 'tl-' + id },
    h('h2', { class: 'tile-label', id: 'tl-' + id }, label),
    value,
    view,
    ...lines.filter(Boolean).map((l) => h('p', { class: 'tile-sub' }, ...[].concat(l))),
    extra,
    ...provenance(spine, result));
}

// Utilization in words: "Personal cards 35.0% ($4,200 of $12,000)."
function utilLine(r, label) {
  return r.value === null ? label + ': not enough to figure yet.' : label + ' ' + pct(r.value, 1) + ' (' + money(r.balance) + ' of ' + money(r.limit) + ').';
}

// The payoff order by rate, with the 0% promos named as a group (S-159).
function payoffLine(items) {
  if (items.length < 2) return null;
  const rated = items.filter((x) => !x.promo).map((x) => x.name + (x.rate === null ? ' (APR missing)' : ' (' + showValue(x.rate, 'rate') + ')'));
  const promos = items.filter((x) => x.promo);
  const ends = promos.length ? promos[promos.length - 1].promoEnds : null;
  return 'Payoff order, highest rate first: ' + rated.join(', ') + (promos.length ? (rated.length ? ', then ' : '') + 'the 0% promos due by ' + shortDate(ends) + ': ' + promos.map((x) => x.name).join(', ') : '') + '.';
}

// The credit score note, kept apart from the payoff order (S-159).
function creditNote(cs) {
  if (!cs.cards.length) return null;
  return h('div', { class: 'backstop' },
    h('strong', {}, 'Credit score note'),
    h('p', { class: 'tile-sub' }, 'Personal cards over ' + pct(cs.warn) + ' of their limit, highest first: ' + cs.cards.map((c) => c.name + ' ' + pct(c.util)).join(', ') + '.'),
    cs.smallest && cs.personalAfter.value !== null ? h('p', { class: 'tile-sub' }, 'Paying off ' + cs.smallest.name + ' (' + money(cs.smallest.balance) + ') would bring personal utilization to ' + pct(cs.personalAfter.value, 1) + '.') : null);
}

// The picked Triple D set (S-183) replaces the real return and withdrawal rate
// before anything is figured, so every FI number and the projection follow it.
let scenario = pickedScenario();
// Sections of the money flow split into their expenses (S-192), for this page only.
let flowOpen = [];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function render(base, rules, source) {
  const spine = withScenario(base, rules, scenario);
  const s = summarize(spine, rules);
  const compare = estimatedVsActual(spine, rules, { months: 1 });
  // Cash at a glance (S-209, the Budget's Today strip): checking on the as-of day, the lowest point ahead, safe to spend.
  const sim = cashsim(spine, rules, { months: 1 });
  const safe = safeToSpend(sim);
  const reading = cashReading(sim, spine.meta.asOf.slice(0, 7));
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const outlook = monthOutlook(spine, rules, sim, { today: todayIso(), waiting: waiting(spine, rules, { today: todayIso() }) });
  mathCtx = { spine, rules, s, compare, spend: { safe }, monthOut: outlook };
  const cf = s.cashflow, sh = s.sheet, em = s.emergency, fi = s.fi, tx = s.tax, pr = s.debt.promo, ut = s.debt.utilization;
  const promoBy = pr.items.length ? pr.items[pr.items.length - 1].promoEnds : null;

  const backstop = h('div', { class: 'backstop' },
    h('strong', {}, 'Roth backstop (not counted as cash)'),
    h('p', { class: 'tile-sub' }, money(em.backstop.contributions.value) + ' of contributions can come out any time with no tax or penalty.'),
    ...em.backstop.conversions.map((c) => h('p', { class: 'tile-sub' }, money(c.amount) + ' converted in ' + c.year + ': no tax on it; ' + (c.penaltyFree ? 'no penalty.' : 'a ' + pct(c.penaltyRate) + ' penalty if taken before ' + shortDate(c.clockOpens) + ' (its own five-year clock).'))));

  const tiles = [
    tile(spine, { id: 'networth', label: 'Net worth', result: sh.netWorth, shown: money(sh.netWorth.value), lines: ['Assets ' + money(sh.assets.value) + ' less debts ' + money(sh.debts.value) + '.'] }),
    tile(spine, {
      id: 'runway', label: 'Cash runway', result: em.tiers.full.runway, shown: months(em.tiers.full.runway.value) + ' months',
      lines: [
        money(sh.cash.value) + ' in cash at ' + money(em.tiers.full.burn.value) + ' a month (expenses plus minimum payments).',
        'Food, housing and transportation only: ' + months(em.tiers.fatOnly.runway.value) + ' months.',
        'Rule of 5 target: ' + em.targetMonths.value + ' months (' + money(em.targetDollars.value) + ').'
      ],
      extra: em.backstop.contributions.value || em.backstop.conversions.length ? backstop : null
    }),
    tile(spine, { id: 'surplus', label: 'Monthly surplus', result: cf.surplus, shown: money(cf.surplus.value), lines: [
        'Take-home ' + money(cf.income.takeHome.value) + ' less expenses ' + money(cf.expenses.total.value) + ', minimum payments ' + money(cf.debtMinimums.total.value) + (cf.saving.afterTax.value ? ', ' + money(cf.saving.afterTax.value) + ' saved from take-home' : '') + (cf.taxSetAside.total.value ? ' and a tax set-aside of ' + money(cf.taxSetAside.total.value) : '') + '.',
        cf.taxSetAside.lines.length ? 'Tax set-aside: ' + cf.taxSetAside.lines.map((l) => l.kind === 'balance' ? l.label + ' ' + money(l.base) + (l.held ? ' less ' + money(l.held) + ' already set aside' : '') + ', over ' + l.months + ' months: ' + money(l.amount) + ' a month' : l.label + ' ' + money(l.amount) + ' (' + pct(l.rate, 1) + ' of ' + money(l.base) + (l.months ? ' over ' + l.months + ' months' : '') + ')').join('; ') + '.' : null
      ] }),
    tile(spine, { id: 'savings', label: 'Savings rate', result: cf.savingsRate.gross, shown: pct(cf.savingsRate.gross.value, 1) + ' of gross', lines: [pct(cf.savingsRate.net.value, 1) + ' of take-home.'] }),
    tile(spine, {
      id: 'cards', label: 'Credit cards', result: sh.cards, shown: money(sh.cards.value),
      lines: [
        pr.items.length ? money(pr.total.value) + ' in promo balances due by ' + shortDate(promoBy) + '; about ' + money(pr.monthly.value, true) + ' a month clears them in time.' : 'No promo balances.',
        utilLine(ut.personal, 'Personal cards') + ' ' + utilLine(ut.overall, 'All cards, business included'),
        payoffLine(s.debt.avalancheCardsDetail)
      ],
      extra: creditNote(s.debt.creditScore)
    }),
    tile(spine, {
      id: 'fi', label: 'Financial independence', result: fi.fiPercent, shown: pct(fi.fiPercent.value, 1),
      lines: [
        'Of an FI number of ' + money(fi.fiNumber.value) + (fi.goalSource === 'direct' ? ' (your goal)' : fi.goalSource === 'spending' ? ' (goal spending at the withdrawal rate)' : ' (today\'s spending)') + '; invested ' + money(sh.invested.value) + '.',
        fi.goalSource ? 'Today\'s spending implies ' + money(fi.implied.value) + '.' : null,
        'Lean FI ' + money(fi.leanFi.value) + '. Coast FI by ' + fi.coastAge + ': ' + money(fi.coastFi.value) + '.',
        fi.yearsToFi.value !== null ? 'At this pace, FI in about ' + fi.yearsToFi.value.toFixed(1) + ' years (from the projection).' : fi.yearsToFi.note ? 'Years to FI: ' + fi.yearsToFi.note + '.' : null,
        ['Assumption set: ' + scenario + ' (' + scenarioText(base, rules, scenario) + '). ', h('a', { href: '#scenario' }, 'Change it')]
      ]
    }),
    tile(spine, {
      id: 'cash', label: 'Safe to spend, as of ' + shortDate(spine.meta.asOf), result: { value: safe.today, kind: safe.kind, from: safe.cashPath ? [safe.cashPath] : [], rough: safe.rough, missing: safe.missing },
      shown: money(safe.today), missingText: 'Missing: a checking balance',
      lines: [
        safe.shortfall ? 'Nothing safe to spend: checking runs ' + money(safe.shortfall.amount) + ' short by ' + shortDate(safe.shortfall.date) + (safe.shortfall.covered ? ', and the cushion covers ' + money(safe.shortfall.covered) + ' of it' : '') + '.' : safe.today !== null ? 'Through ' + shortDate(safe.through) + ', keeping the floor of ' + money(safe.floor) + '.' : null,
        reading && reading.today ? 'Checking on ' + shortDate(reading.today.date) + ': ' + money(reading.today.amount) + '.' : null,
        safe.low ? (safe.low.covered ? 'Lowest point ahead, before the cushion tops checking up: ' : 'Lowest point ahead: ') + money(safe.low.amount) + ' on ' + shortDate(safe.low.date) + '.' : null,
        [h('a', { href: 'calendar.html' + (safe.low ? '#' + safe.low.date.slice(0, 7) : '') }, 'See cash by day ›'), ' ', h('a', { href: 'spending.html#checkin' }, 'Check in balances ›'), ' ', h('a', { href: 'spending.html#log' }, 'Log a spend ›')]
      ]
    }),
    tile(spine, {
      id: 'compare', label: 'Estimated vs actual, ' + monthLabel(compare.to), result: { value: compare.spend.diff, kind: compare.monthsLogged.length ? compare.kind : 'missing', from: [], rough: compare.rough, missing: compare.monthsLogged.length ? compare.missing : ['log'] },
      shown: (compare.spend.diff > 0 ? money(compare.spend.diff) + ' over the plan' : compare.spend.diff < 0 ? money(-compare.spend.diff) + ' under the plan' : 'On the plan'), missingText: compare.monthsLogged.length ? null : 'Nothing logged this month yet',
      lines: [
        compare.monthsLogged.length ? 'Spent ' + money(compare.spend.actual) + ' of ' + (compare.spend.planned === null ? 'a plan with a missing line' : money(compare.spend.planned) + ' planned') + ' (' + compare.spend.entries + (compare.spend.entries === 1 ? ' entry' : ' entries') + ').' : null,
        compare.income.actual !== null ? 'Income logged ' + money(compare.income.actual) + (compare.income.planned !== null ? ' of ' + money(compare.income.planned) + ' take-home planned' : '') + '.' : 'No income logged yet.',
        compare.savingsRate.real !== null ? 'Savings rate from the real ledger: ' + pct(compare.savingsRate.real, 1) + (compare.savingsRate.plan !== null ? ' against ' + pct(compare.savingsRate.plan, 1) + ' planned' : '') + '.' : compare.savingsRate.note,
        outlook.stale ? 'Check in with today\'s balances to see this month so far.' : ['So far this month: ', h('span', { class: outlook.soFar < 0 ? 'neg' : 'pos' }, (outlook.soFar < 0 ? '-' : '+') + money(Math.abs(outlook.soFar))), '. Expected by month end: ' + (outlook.expected === null ? 'missing' : (outlook.expected < 0 ? '-' : '+') + money(Math.abs(outlook.expected))) + '.'],
        [h('a', { href: 'spending.html' }, 'Log a spend, import a statement, or see every line ›')]
      ]
    }),
    tile(spine, {
      id: 'tax', label: tx.year + ' tax balance due (estimate)', result: tx.balanceDue,
      shown: money(tx.balanceDue.value), missingText: tx.missingText ? tx.missingText.charAt(0).toUpperCase() + tx.missingText.slice(1) : null,
      lines: [
        tx.balanceDue.value === null && tx.partial ? 'At least ' + money(tx.partial.federalIncomeTax.value) + ' federal on the ' + tx.year + ' income known so far.' : null,
        'Next estimated payment date: ' + shortDate(tx.nextEstimated.date) + '.',
        tx.notModeled.length ? 'Not included: ' + tx.notModeled.join(', ') + '.' : null
      ]
    })
  ];

  app.replaceChildren(
    // Going somewhere is a link (CLAUDE.md affordances 1 and 4), the same row on every page.
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'ledger.html' }, 'Ledger'), h('a', { href: 'calendar.html' }, 'Calendar'), h('a', { href: 'spending.html' }, 'Spending'), h('a', { href: 'plan.html' }, 'Plan'), h('a', { href: 'windfall.html' }, 'Windfall'), h('a', { href: 'math.html' }, 'All formulas')),
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Dashboard'), h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(s.asOf), ' · ', SOURCE_WORDS[source]))),
    h('div', { class: 'tiles' }, tiles),
    // The Phase 2 pages (S-200, S-201): going somewhere is a link, with a line on what is there.
    h('section', { class: 'card more', 'aria-labelledby': 'more-h' },
      h('h2', { id: 'more-h' }, 'Also'),
      h('ul', { class: 'more-list' },
        h('li', {}, h('a', { href: 'calendar.html' }, 'Cash flow calendar ›'), h('span', { class: 'more-sub' }, 'This month\'s pay, bills and minimums on their days, and the month-end cash.')),
        h('li', {}, h('a', { href: 'windfall.html' }, 'Windfall ›'), h('span', { class: 'more-sub' }, 'A lump sum coming in: where it goes, step by step.')))),
    scenarioBar(base, rules, scenario, (id) => { scenario = id; render(base, rules, source); document.getElementById('scenario')?.scrollIntoView({ block: 'nearest' }); }),
    flowPart(spine, rules, s),
    flagsSection(spine, s.flags)
  );
}

// The money flow (S-192); a split or join redraws only this section.
function flowPart(spine, rules, s) {
  const el = flowSection(moneyFlow(spine, rules, s.cashflow, { open: flowOpen }), {
    open: flowOpen, month: MONTH_NAMES[+s.ym.slice(5, 7) - 1],
    onToggle: (sec) => { flowOpen = flowOpen.includes(sec) ? flowOpen.filter((x) => x !== sec) : [...flowOpen, sec]; el.replaceWith(flowPart(spine, rules, s)); }
  });
  return el;
}

// A goal line: a link to the Ledger field it depends on when there is one.
const goalLine = (g, cls) => g && h('p', { class: 'goal ' + cls }, g.path ? h('a', { href: ledgerHref(g.path) }, g.text) : g.text);

// One flag: its stage in words and color (never color alone), what is true,
// what moves it up one stage, and the goal for stage 3 (S-165).
function flagItem(spine, f) {
  return h('li', { class: 'flag flag-' + f.stage, id: 'flag-' + f.id },
    h('p', { class: 'flag-title' }, h('span', { class: 'stage-chip stage-' + f.stage }, f.stageLabel), ' ', f.title),
    h('p', { class: 'flag-detail' }, f.detail),
    goalLine(f.next, 'goal-next'),
    f.next && f.green && f.green.text.slice(9) !== f.next.text.slice(6) ? goalLine(f.green, 'goal-green') : null,
    flagMath(f).length ? mathButton(flagMath(f), mathCtx) : null);
}

// Red first, then yellow; green folded into "Done" with a count.
function flagsSection(spine, flags) {
  const open = flags.filter((f) => f.stage !== 'green'), done = flags.filter((f) => f.stage === 'green');
  const count = (st) => flags.filter((f) => f.stage === st).length;
  return h('section', { class: 'card', 'aria-labelledby': 'flags-h' },
    h('h2', { id: 'flags-h' }, 'Flags', h('span', { class: 'group-counts' },
      count('red') ? h('span', { class: 'stage-chip stage-red' }, count('red') + ' at stage 1') : null,
      count('yellow') ? h('span', { class: 'stage-chip stage-yellow' }, count('yellow') + ' at stage 2') : null)),
    open.length ? h('ul', { class: 'flags' }, open.map((f) => flagItem(spine, f))) : h('p', { class: 'muted' }, 'Nothing open.'),
    done.length ? h('details', { class: 'done' }, h('summary', {}, h('span', { class: 'stage-chip stage-green' }, 'Stage 3'), ' Done (' + done.length + ')'), h('ul', { class: 'flags' }, done.map((f) => flagItem(spine, f)))) : null);
}

loadAll().then(({ spine, rules, source, problem }) => { render(spine, rules, source); if (problem) app.prepend(h('p', { class: 'card', role: 'alert' }, problem)); }).catch((err) => {
  app.replaceChildren(h('p', { class: 'card' }, 'The Dashboard could not load: ' + err.message));
});
