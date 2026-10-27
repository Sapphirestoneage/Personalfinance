// The printable one-pager (S-208): the household on one page, from the same
// summary and run every other page reads. Print it from the browser. It opens
// from the One-pager button on Today, and its Back returns there (S-230). A card
// with more behind it (Debt, the next rung, Spending) is the target as a whole,
// with a chevron, and opens where that detail lives; the rest is plain text.
// A handout (audit 6): who it is for, the date, who prepared it, and the footer; the next step is the shared ranking
// written to the client; debt shows the Plan's own clear months, or "not yet planned".

import { startPage, numbersHref } from './shell.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { debtView } from '../engine/debtview.js';
import { planDebtExtra } from '../engine/plan.js';
import { rankSteps } from '../engine/next-step.js';
import { maxItFor } from './maxit-panel.js';
import { whose } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { money as dollars } from '../src/ui/format.js';
import { h, pct, monthWords, shortDate, stepHref, todayIso } from './view.js';
import { homeworkList } from '../engine/profile.js';
import { moneyFlow } from '../engine/flow.js';
import { flowSection } from './flow-chart.js';

const cell = (k, v, sub = null) => h('div', { class: 'op-cell' }, h('span', { class: 'op-v' }, v), h('span', { class: 'op-k' }, k), sub ? h('span', { class: 'tile-note' }, sub) : null);
// Plain dollars on the handout: no hours or days tags, whatever the screen shows.
const m = (x) => (x === null || x === undefined ? 'missing' : dollars(x));
// A card that opens where its detail lives: the whole card is the target, with a chevron (CLAUDE.md affordance 5).
const goCard = (title, href, ...body) => h('section', { class: 'card has-target' },
  h('h2', {}, h('a', { class: 'card-link', href }, h('span', {}, title), h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'))), ...body);

// Batch 9: both net worths, the monthly surplus, one small chart (the money flow, small), printable on one page.
function render({ spine: base, rules }) {
  const spine = withScenario(base, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: 3 });
  const rank = rankSteps(spine, rules, s, { sim: maxItFor(spine, rules).sim });
  const debt = debtView(spine, rules, sim, s, { extra: planDebtExtra(spine, rules, s, { sim, ladder: rank.ladder }).amount });
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  const step = rank.first, who = whose(base);
  const flow = flowSection(moneyFlow(spine, rules, cf, { open: [] }), { open: [], onToggle: () => {}, month: MONTHS[+s.ym.slice(5, 7) - 1] });
  flow.classList.add('op-flow');
  return h('div', { class: 'onepager' },
      h('header', { class: 'op-head' }, h('p', { class: 'op-who' }, clientName(base) + (who.example ? ' (example, made up)' : '')), h('p', { class: 'op-meta' }, shortDate(new Date().toISOString().slice(0, 10)) + '. Prepared by Eli Saperstein, financial coach.')),
      h('section', { class: 'card' }, h('h2', {}, 'Where things stand'), h('div', { class: 'op-grid' },
        cell('Net worth', m(sh.netWorth.value)),
        cell('Cash after card debt', m(sh.liquidNetWorth.value)),
        cell('Monthly surplus', m(cf.monthlySurplus.value), 'take-home ' + m(cf.income.takeHome.value) + ', after spending, debt minimums and the tax set-aside'),
        cell('Savings rate', cf.savingsRate.net.value === null ? 'missing' : pct(cf.savingsRate.net.value, 1), 'of take-home'),
        cell('Cash runway', em.tiers.full.runway.value === null ? 'missing' : em.tiers.full.runway.value.toFixed(1) + ' months', m(sh.cash.value) + ' in cash'),
        cell('Financial independence', s.fi.fiPercent.value === null ? 'missing' : pct(s.fi.fiPercent.value, 1), 'of ' + m(s.fi.today.value) + ' at today\'s spending')),
        sh.setAsideNote ? h('p', { class: 'tile-note' }, sh.setAsideNote) : null),
      flow,
      goCard('Your next step', stepHref(step), h('p', {}, nextWords(step, rank.questions))),
      debtCard(debt),
      todoCard(base),
      h('footer', { class: 'op-foot' }, 'For education and planning. Not investment, tax or legal advice.'));
}

// The client's name on the handout: the first person's, else the household's.
const clientName = (spine) => { const p = ((spine.household && spine.household.people) || [])[0]; return p && typeof p.name === 'string' && p.name.trim() ? p.name.trim() : whose(spine).name; };
// The next step to the client, in their words: what to do and why, never a screen name.
function nextWords(step, questions) {
  if (step) return step.label + '. ' + (step.why || '');
  if (questions.length) return 'First, we need one answer from you: ' + questions[0].question;
  return 'Every step is done. Keep going as you are.';
}
// Each debt with a balance and the month the Plan's run clears it, else "not yet planned".
function debtCard(d) {
  const owing = d.order.rows.filter((r) => (r.balance ?? 0) > 0);
  if (!owing.length) return h('section', { class: 'card' }, h('h2', {}, 'Debt'), h('p', {}, 'No debt to pay off.'));
  return goCard('Debt', numbersHref('debt'), h('ul', {}, owing.map((r) => h('li', {}, r.name + ' (' + m(r.balance) + '): ' + (r.planYm ? 'clear by ' + monthWords(r.planYm) : 'not yet planned')))),
    d.clearDates.rows.length ? h('p', { class: 'tile-note' }, d.clearDates.rows.map((r) => r.label.replace(/ \(.*\)$/, '') + ' by ' + monthWords(r.ym)).join('. ') + '.') : null);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The client's to-dos from the Profile (Level 3), grouped by where to find each item.
function todoCard(spine) {
  const groups = homeworkList(spine, todayIso());
  if (!groups.length) return null;
  return goCard('Your to-dos', 'profile.html#/todo', ...groups.map((g) => [h('h3', {}, g.where), h('ul', {}, g.items.map((x) => h('li', {}, x)))]));
}

startPage({
  tab: 'today', title: 'One-pager', parent: ['Today', 'dashboard.html'], render,
  actions: ({ spine: base }) => h('button', { type: 'button', class: whose(base).example ? 'btn' : 'btn primary', onclick: () => window.print() }, 'Print')
});
