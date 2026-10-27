// The printable one-pager (S-208): the household on one page, from the same
// summary and run every other page reads. Print it from the browser. It opens
// from the One-pager button on Today, and its Back returns there (S-230). A card
// with more behind it (Debt, the next rung, Spending) is the target as a whole,
// with a chevron, and opens where that detail lives; the rest is plain text.
// A handout (audit 6): who it is for, the date, who prepared it, and the footer; the next step is the shared ranking
// written to the client; debt shows the Plan's own clear months, or "not yet planned".

import { forecast } from './forecast.js';
import { sharedNotes } from '../engine/notes.js';
import { startPage, numbersHref } from './shell.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { debtView } from '../engine/debtview.js';
import { planPayoff } from '../engine/plan.js';
import { leadLines } from './debt-lead.js';
import { rankSteps } from '../engine/next-step.js';
import { maxItFor } from './maxit-panel.js';
import { whose } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { money as dollars } from '../src/ui/format.js';
import { h, pct, monthWords, shortDate, stepHref, todayIso } from './view.js';
import { homeworkList } from '../engine/profile.js';
import { moneyFlow, flowTable } from '../engine/flow.js';

const cell = (k, v, sub = null, id = null) => h('div', { class: 'op-cell' }, h('span', { class: 'op-v', 'data-metric': id }, v), h('span', { class: 'op-k' }, k), sub ? h('span', { class: 'tile-note' }, sub) : null);
// Plain dollars on the handout: no hours or days tags, whatever the screen shows.
const m = (x) => (x === null || x === undefined ? 'missing' : dollars(x));
// A card that opens where its detail lives: the whole card is the target, with a chevron (CLAUDE.md affordance 5).
// The notes marked "Share with the client" in Session notes (Track I), oldest first, each with its date.
function notesCard(spine) {
  const list = sharedNotes(spine).slice().reverse();
  return list.length ? h('section', { class: 'card op-notes' }, h('h2', {}, 'Notes from our sessions'), h('ul', {}, list.map((n) => h('li', {}, h('strong', {}, shortDate(n.date) + ': '), n.text)))) : null;
}
const goCard = (title, href, ...body) => h('section', { class: 'card has-target' },
  h('h2', {}, h('a', { class: 'card-link', href }, h('span', {}, title), h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'))), ...body);

// Batch 9: both net worths, the monthly surplus, one small chart (the money flow, small), printable on one page.
function render({ spine: base, rules }) {
  const spine = withScenario(base, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: 3 });
  const rank = rankSteps(spine, rules, s, { sim: maxItFor(spine, rules).sim });
  const debt = debtView(spine, rules, sim, s, { plan: planPayoff(spine, rules, s, { sim, ladder: rank.ladder }) });
  const cf = s.cashflow, sh = s.sheet, em = s.emergency;
  const step = rank.first, who = whose(base);
  // The money flow as a small table (Krug pass): in, then where it ends up; a guessed amount is marked "about".
  // What is left goes last, after everything it is left from (round 3).
  const rows = flowTable(moneyFlow(spine, rules, cf, { open: [] })).sort((a, b) => (a.side === b.side ? (/left/i.test(a.label) ? 1 : /left/i.test(b.label) ? -1 : 0) : 0));
  const flow = rows.length ? h('section', { class: 'card op-flow' }, h('h2', {}, 'Where the money goes in ' + MONTHS[+s.ym.slice(5, 7) - 1]),
    h('table', { class: 'data-table op-flow-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), h('th', { scope: 'col', class: 'num' }, 'A month'))),
      h('tbody', {}, rows.map((r, i) => h('tr', { class: r.side === 'out' && (i === 0 || rows[i - 1].side === 'in') ? 'op-first-out' : null },
        h('th', { scope: 'row' }, (r.side === 'in' ? 'In: ' : '') + r.label), h('td', { class: 'num' }, (r.rough && r.side === 'out' ? 'about ' : '') + m(r.amount))))))) : null;
  return h('div', { class: 'onepager' },
      h('header', { class: 'op-head' }, h('p', { class: 'op-who' }, clientName(base) + (who.example ? ' (example, made up)' : '')), h('p', { class: 'op-meta' }, shortDate(new Date().toISOString().slice(0, 10)) + '. Prepared by Eli Saperstein, financial coach.')),
      h('section', { class: 'card' }, h('h2', {}, 'Where things stand'), h('div', { class: 'op-grid' },
        cell('Net worth', m(sh.netWorth.value), null, 'netWorth'),
        cell('Reachable after all debts', m(sh.liquidNetWorth.value), null, 'liquidNetWorth'),
        cell('Monthly surplus', m(cf.monthlySurplus.value), 'take-home ' + m(cf.income.takeHome.value) + ', after spending, debt minimums and the tax set-aside', 'surplus'),
        cell('Savings rate', cf.savingsRate.net.value === null ? 'missing' : pct(cf.savingsRate.net.value, 1), 'of pay after tax, with what goes from pay to saving', 'savingsRateNet'),
        cell('Cash runway', em.tiers.full.runway.value === null ? 'missing' : em.tiers.full.runway.value.toFixed(1) + ' months', m(sh.cash.value) + ' in cash', 'runway'),
        cell('Financial independence', s.fi.fiPercent.value === null ? 'missing' : pct(s.fi.fiPercent.value, 1), ['of ', h('span', { 'data-metric': 'fiToday' }, m(s.fi.today.value)), ' at today\'s spending'], 'fiPercent')),
        sh.setAsideNote ? h('p', { class: 'tile-note' }, sh.setAsideNote) : null),
      flow,
      goCard('Your next step', stepHref(step), h('p', {}, nextWords(step, rank.questions)),
        // Round 4: the most urgent thing on Today goes on the handout too, in one calm line.
        (() => { const f = forecast(spine, rules).story; return f && f.under && f.fix && f.fix.from ? h('p', { class: 'tile-note' }, 'Before ' + shortDate(f.fix.by) + ': move ' + m(f.fix.amount) + ' from ' + f.fix.from.name + ' to checking, so checking stays above your floor.') : null; })()),
      debtCard(debt),
      todoCard(base),
      notesCard(base),
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
// Debt (morning answer 2): the same three lines the Debt screen leads with, then each debt and its month on the Plan.
function debtCard(d) {
  const owing = d.order.rows.filter((r) => (r.balance ?? 0) > 0);
  if (!owing.length) return h('section', { class: 'card' }, h('h2', {}, 'Debt'), h('p', {}, 'No debt to pay off.'));
  return goCard('Debt', numbersHref('debt'),
    h('ul', { class: 'op-lead' }, leadLines(d.clearDates).map(([label, words]) => h('li', {}, label ? [h('strong', {}, label + ': '), words] : words[0].toUpperCase() + words.slice(1)))),
    h('ul', {}, owing.map((r) => h('li', {}, r.name + ' (' + m(r.balance) + '): ' + (r.planYm ? 'clear by ' + monthWords(r.planYm) : 'not yet on your plan')))));
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
