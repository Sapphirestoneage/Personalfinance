// The printable one-pager (S-208): the household on one page, from the same
// summary and run every other page reads. Print it from the browser. It opens
// from the One-pager button on Today, and its Back returns there (S-230). A card
// with more behind it (Debt, the next rung, Spending) is the target as a whole,
// with a chevron, and opens where that detail lives; the rest is plain text.

import { startPage, numbersHref } from './shell.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { clearDates } from '../engine/debtview.js';
import { safeToSpend } from '../engine/spending.js';
import { fooLadder } from '../engine/plan.js';
import { maxItFor } from './maxit-panel.js';
import { whose } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { h, money, pct, shortDate } from './view.js';
import { homeworkList } from '../engine/profile.js';

const cell = (k, v, sub = null) => h('div', { class: 'op-cell' }, h('span', { class: 'op-v' }, v), h('span', { class: 'op-k' }, k), sub ? h('span', { class: 'tile-note' }, sub) : null);
const m = (x) => (x === null || x === undefined ? 'missing' : money(x));
// A card that opens where its detail lives: the whole card is the target, with a chevron (CLAUDE.md affordance 5).
const goCard = (title, href, ...body) => h('section', { class: 'card has-target' },
  h('h2', {}, h('a', { class: 'card-link', href }, h('span', {}, title), h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'))), ...body);

function render({ spine: base, rules }) {
  const spine = withScenario(base, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: 3 });
  const cd = clearDates(sim), safe = safeToSpend(sim), foo = fooLadder(spine, rules, s, { sim: maxItFor(spine, rules).sim });
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  return h('div', { class: 'onepager' },
      h('section', { class: 'card' }, h('h2', {}, 'Where things stand'), h('div', { class: 'op-grid' },
        cell('Net worth', m(sh.netWorth.value), 'assets ' + m(sh.assets.value) + ', debts ' + m(sh.debts.value)),
        cell('Cash', m(sh.cash.value), em.tiers.full.runway.value === null ? 'runway unknown' : em.tiers.full.runway.value.toFixed(1) + ' months at ' + m(em.tiers.full.burn.value) + ' a month'),
        cell('Take-home a month', m(cf.income.takeHome.value), 'gross ' + m(cf.income.gross.value)),
        cell('Monthly surplus', m(cf.monthlySurplus.value), 'after spending, debt minimums and the tax set-aside'),
        cell('Savings rate', cf.savingsRate.net.value === null ? 'missing' : pct(cf.savingsRate.net.value, 1), 'of take-home'),
        cell('Financial independence', s.fi.fiPercent.value === null ? 'missing' : pct(s.fi.fiPercent.value, 1), 'of ' + m(s.fi.fiNumber.value)),
        cell('Safe to spend today', m(safe.today), safe.daysUntil ? m(safe.perDay) + ' a day until ' + shortDate(safe.nextIncome) : ''),
        cell('Cards', m(sh.cards.value), s.debt.utilization.personal.value === null ? '' : 'personal utilization ' + pct(s.debt.utilization.personal.value, 1))),
        sh.setAsideNote ? h('p', { class: 'tile-note' }, sh.setAsideNote) : null),
      goCard('Debt', numbersHref('debt'), h('ul', {}, cd.rows.map((r) => h('li', {}, r.label + ': ' + (r.date ? shortDate(r.date) : 'not in the next 3 months'))), h('li', {}, 'Payoff order: ' + s.debt.avalancheCardsDetail.map((x) => x.name).join(', ')))),
      goCard('The next rung', 'plan.html', foo.current ? h('p', {}, foo.rungs.find((r) => r.id === foo.current).label + ': ' + foo.rungs.find((r) => r.id === foo.current).why) : h('p', {}, foo.rungs.every((r) => r.done) ? 'Every rung is done.' : 'The ladder needs a few answers on the Plan page.'), h('p', { class: 'tile-note' }, 'Rungs done: ' + foo.rungs.filter((r) => r.done).map((r) => r.label).join(', '))),
      goCard('Spending a month', numbersHref('needs'), h('ul', {}, cf.expenses.items.filter((i) => !i.covered && i.amount).sort((a, b) => b.amount - a.amount).slice(0, 8).map((i) => h('li', {}, i.label + ': ' + money(i.amount)))), h('p', { class: 'tile-note' }, 'The eight biggest.')),
      todoCard(base));
}

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
