// The printable one-pager (S-208): the household on one page, from the same
// summary and run every other page reads. Print it from the browser.

import { mountPage } from './page.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { clearDates } from '../engine/debtview.js';
import { safeToSpend } from '../engine/spending.js';
import { fooLadder } from '../engine/plan.js';
import { loadAll, SOURCE_WORDS } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { h, money, pct, shortDate } from './view.js';

const app = document.getElementById('app');
mountPage({ app });
const cell = (k, v, sub = null) => h('div', { class: 'op-cell' }, h('span', { class: 'op-v' }, v), h('span', { class: 'op-k' }, k), sub ? h('span', { class: 'tile-note' }, sub) : null);
const m = (x) => (x === null || x === undefined ? 'missing' : money(x));

loadAll().then(({ spine: base, rules, source }) => {
  const spine = withScenario(base, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: 3 });
  const cd = clearDates(sim), safe = safeToSpend(sim), foo = fooLadder(spine, rules, s);
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  app.replaceChildren(
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'dashboard.html' }, 'Dashboard'), h('a', { href: 'plan.html' }, 'Plan'), h('a', { href: 'calendar.html' }, 'Calendar'), h('a', { href: 'spending.html' }, 'Spending')),
    h('div', { class: 'onepager' },
      h('header', { class: 'top' }, h('div', {}, h('h1', {}, spine.meta.name + ' on one page'), h('p', { class: 'muted' }, 'As of ' + shortDate(spine.meta.asOf) + ' · ' + SOURCE_WORDS[source] + ' · printed from SLAM')), h('nav', { class: 'top-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => window.print() }, 'Print'))),
      h('section', { class: 'card' }, h('h2', {}, 'Where things stand'), h('div', { class: 'op-grid' },
        cell('Net worth', m(sh.netWorth.value), 'assets ' + m(sh.assets.value) + ', debts ' + m(sh.debts.value)),
        cell('Cash', m(sh.cash.value), em.tiers.full.runway.value === null ? 'runway unknown' : em.tiers.full.runway.value.toFixed(1) + ' months at ' + m(em.tiers.full.burn.value) + ' a month'),
        cell('Take-home a month', m(cf.income.takeHome.value), 'gross ' + m(cf.income.gross.value)),
        cell('Monthly surplus', m(cf.surplus.value), 'after spending, minimums, saving and the set-aside'),
        cell('Savings rate', cf.savingsRate.gross.value === null ? 'missing' : pct(cf.savingsRate.gross.value, 1), 'of gross'),
        cell('Financial independence', s.fi.fiPercent.value === null ? 'missing' : pct(s.fi.fiPercent.value, 1), 'of ' + m(s.fi.fiNumber.value)),
        cell('Safe to spend today', m(safe.today), safe.daysUntil ? m(safe.perDay) + ' a day until ' + shortDate(safe.nextIncome) : ''),
        cell('Cards', m(sh.cards.value), s.debt.utilization.personal.value === null ? '' : 'personal utilization ' + pct(s.debt.utilization.personal.value, 1)))),
      h('section', { class: 'card' }, h('h2', {}, 'Debt'), h('ul', {}, cd.rows.map((r) => h('li', {}, r.label + ': ' + (r.date ? shortDate(r.date) : 'not inside the next three months'))), h('li', {}, 'Payoff order: ' + s.debt.avalancheCardsDetail.map((x) => x.name).join(', ')))),
      h('section', { class: 'card' }, h('h2', {}, 'The next rung'), foo.current ? h('p', {}, foo.rungs.find((r) => r.id === foo.current).label + ': ' + foo.rungs.find((r) => r.id === foo.current).why) : h('p', {}, foo.rungs.every((r) => r.done) ? 'Every rung is done.' : 'The ladder needs a few answers on the Plan page.'), h('p', { class: 'tile-note' }, 'Rungs done: ' + foo.rungs.filter((r) => r.done).map((r) => r.label).join(', '))),
      h('section', { class: 'card' }, h('h2', {}, 'Spending a month'), h('ul', {}, cf.expenses.items.filter((i) => !i.covered && i.amount).sort((a, b) => b.amount - a.amount).slice(0, 8).map((i) => h('li', {}, i.label + ': ' + money(i.amount)))), h('p', { class: 'tile-note' }, 'The eight biggest lines. Everything else is in the Ledger.')),
      h('p', { class: 'tile-note' }, 'Every number here is on the Dashboard, the Calendar, the Spending page or the Plan page with Show the math.')));
}).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The one-pager could not load: ' + err.message)); });
