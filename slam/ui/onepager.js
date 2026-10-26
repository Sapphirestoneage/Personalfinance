// The printable one-pager (S-208): the household on one page, from the same
// summary and run every other page reads. Print it from the browser. It opens
// from the One-pager button on Today, and its Back returns there (S-230). A card
// with more behind it (Debt, the next rung, Spending) is the target as a whole,
// with a chevron, and opens where that detail lives; the rest is plain text.

import { startPage, numbersHref } from './shell.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { clearDates } from '../engine/debtview.js';
import { fooLadder } from '../engine/plan.js';
import { maxItFor } from './maxit-panel.js';
import { whose } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { h, money, pct, shortDate } from './view.js';
import { homeworkList } from '../engine/profile.js';
import { moneyFlow } from '../engine/flow.js';
import { flowSection } from './flow-chart.js';

const cell = (k, v, sub = null) => h('div', { class: 'op-cell' }, h('span', { class: 'op-v' }, v), h('span', { class: 'op-k' }, k), sub ? h('span', { class: 'tile-note' }, sub) : null);
const m = (x) => (x === null || x === undefined ? 'missing' : money(x));
// A card that opens where its detail lives: the whole card is the target, with a chevron (CLAUDE.md affordance 5).
const goCard = (title, href, ...body) => h('section', { class: 'card has-target' },
  h('h2', {}, h('a', { class: 'card-link', href }, h('span', {}, title), h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'))), ...body);

// Batch 9: both net worths, the monthly surplus, one small chart (the money flow, small), printable on one page.
function render({ spine: base, rules }) {
  const spine = withScenario(base, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: 3 });
  const cd = clearDates(sim), foo = fooLadder(spine, rules, s, { sim: maxItFor(spine, rules).sim });
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  const step = foo.rungs.find((r) => r.done !== true) || null;
  const flow = flowSection(moneyFlow(spine, rules, cf, { open: [] }), { open: [], onToggle: () => {}, month: MONTHS[+s.ym.slice(5, 7) - 1] });
  flow.classList.add('op-flow');
  return h('div', { class: 'onepager' },
      h('section', { class: 'card' }, h('h2', {}, 'Where things stand'), h('div', { class: 'op-grid' },
        cell('Liquid net worth', m(sh.liquidNetWorth.value), 'what you can reach, less all you owe'),
        cell('Total net worth', m(sh.netWorth.value), 'all you own, less all you owe'),
        cell('Monthly surplus', m(cf.monthlySurplus.value), 'take-home ' + m(cf.income.takeHome.value) + ', after spending, debt minimums and the tax set-aside'),
        cell('Savings rate', cf.savingsRate.net.value === null ? 'missing' : pct(cf.savingsRate.net.value, 1), 'of take-home'),
        cell('Cash runway', em.tiers.full.runway.value === null ? 'missing' : em.tiers.full.runway.value.toFixed(1) + ' months', m(sh.cash.value) + ' in cash'),
        cell('Financial independence', s.fi.fiPercent.value === null ? 'missing' : pct(s.fi.fiPercent.value, 1), 'of ' + m(s.fi.today.value) + ' at today\'s spending')),
        sh.setAsideNote ? h('p', { class: 'tile-note' }, sh.setAsideNote) : null),
      flow,
      goCard('Next step', step ? 'plan.html#/' + step.id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) : 'plan.html', h('p', {}, step ? step.label + ': ' + step.why : foo.rungs.every((r) => r.done) ? 'Every step is done.' : 'The steps need a few answers on the Plan page.')),
      goCard('Debt', numbersHref('debt'), h('ul', {}, cd.rows.slice(0, 4).map((r) => h('li', {}, r.label + ': ' + (r.date ? shortDate(r.date) : 'not in the next 3 months'))))),
      todoCard(base));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The client's to-dos from the Profile (Level 3), grouped by where to find each item.
function todoCard(spine) {
  const groups = homeworkList(spine);
  if (!groups.length) return null;
  return goCard('Your to-dos', 'profile.html#/todo', ...groups.map((g) => [h('h3', {}, g.where), h('ul', {}, g.items.map((x) => h('li', {}, x)))]));
}

startPage({
  tab: 'today', title: 'One-pager', parent: ['Today', 'dashboard.html'], render,
  actions: ({ spine: base }) => h('button', { type: 'button', class: whose(base).example ? 'btn' : 'btn primary', onclick: () => window.print() }, 'Print')
});
