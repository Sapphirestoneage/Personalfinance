// Debt payoff dates (S-205), on My numbers' Debt screen since the Calendar was made simple: formatting of
// engine/debtview.js. Every payoff date and interest total is the Plan's (planPayoff, morning answer 1).
// Every number has Show the math; a missing input reads as a missing row in
// words, never a number. A card or a loan is a whole-card target with a
// chevron that opens it in My numbers (S-230). Formatting only.

import { debtView, solvePayoff, whichCard, balanceTransfer } from '../engine/debtview.js';
import { planPayoff } from '../engine/plan.js';
import { parseInput } from '../engine/edits.js';
import { labelFor } from '../engine/labels.js';
import { mathButton } from './math-panel.js';
import { h, chip, money, shortDate, monthWords, ledgerHref } from './view.js';
import { debtCharts } from './chart-cards.js';
import { leadLines } from './debt-lead.js';
import { methodPaths, recommendOrder, METHOD_WORDS } from '../engine/charts.js';
import { putFact } from '../engine/edits.js';
import { change } from './shell.js';
import { said, todayIso } from './view.js';

const VIZ = ['viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5'];
const vizOf = (i) => VIZ[i % VIZ.length];
// A debt's place in the household's list, so it wears one color on every chart (round 2).
let debtIds = [];
const debtIndex = (id) => Math.max(0, debtIds.indexOf(id));
const pctWords = (r) => (r === null || r === undefined ? 'rate not entered' : Math.round(r * 10000) / 100 + '%');
const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const pc = (f) => Math.round(f * 1000) / 10 + '%';
// What the tab's small forms hold between renders. The page keeps them with its screen (saved, onSave), so coming
// back to the calendar shows the same answers.
const FORM = { amount: '100', business: '', btCard: '', btFee: '', btMonths: '', btPost: '', solveTarget: '', solveBy: '' };
const form = { ...FORM };
const chev = () => h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A');

export function debtTab({ c, spine, rules, mathCtx, rerender, saved = null, onSave = null }) {
  debtIds = (spine.debts || []).map((d) => d.id);
  if (!c.sim) return [h('p', { class: 'muted' }, 'This view starts on the date your numbers are from. Pick that month or a later one.')];
  if (saved) for (const k of Object.keys(FORM)) if (typeof saved[k] === 'string') form[k] = saved[k];
  const keepForm = () => (onSave ? onSave({ ...form }) : rerender());
  const base = mathCtx();
  const plan = planPayoff(spine, rules, base.s, { sim: c.sim });
  const d = debtView(spine, rules, c.sim, base.s, { plan });
  const ctx = (extra = {}) => ({ ...base, sim: c.sim, debt: d, ...extra });
  // Charts (Track C): when it is gone, what is interest, and the three orders side by side; each opens as a table.
  const charts = h('section', { class: 'card debt-charts' }, debtCharts(spine, rules, { extra: plan.extraFn || 0, strategy: d.order.strategy, every: plan.every }));
  return [clearCard(d), methodsCard(spine, rules, d, plan.extraFn || 0), charts, ganttCard(d), orderCard(d, ctx), interestCard(d, ctx), cardsCard(d, ctx), utilCard(d, ctx), whichCardCard(c, spine, rules, ctx, keepForm), btCard(c, spine, rules, ctx, keepForm), solveCard(c, spine, rules, ctx, keepForm), loansCard(d, ctx)].filter(Boolean);
}

// The orders side by side (Track E): each one's debt-free month, its interest and the first debt it clears, the
// app's pick with its reason, and "Use this order" (one change, so Undo takes it back). Most stressful first is there
// to compare when debts have stress scores; the day-by-day plan runs the other two.
function methodsCard(spine, rules, d, extra) {
  const m = methodPaths(spine, rules, { extra });
  if (!m.length) return null;
  const pick = recommendOrder(m, rules, +spine.meta.asOf.slice(0, 4));
  // Round 1: when every order ends the same month at the same interest and clears the same debt first, there is
  // nothing to choose; one sentence says so instead of identical cards.
  const tie = new Set(m.map((x) => [x.debtFreeYm, Math.round(x.interest ?? -1), x.first ? x.first.name + x.first.ym : ''].join('|'))).size === 1;
  if (tie) return h('section', { class: 'card', 'aria-labelledby': 'methods-h' }, h('h2', { id: 'methods-h' }, 'Which order?'),
    h('p', {}, 'Every order ends ' + (m[0].neverPaysOff ? 'never, at this pace' : monthWords(m[0].debtFreeYm)) + ' with ' + money(m[0].interest) + ' of interest and clears ' + (m[0].first ? m[0].first.name + ' first' : 'nothing first') + ', so there is nothing to choose on your plan. The plan uses ' + METHOD_WORDS[d.order.strategy].toLowerCase() + '.'));
  const now = d.order.strategy;
  const use = (id) => change((s) => putFact(s, 'debtPlan.strategy', id, 'known', todayIso()), said.changed('Payoff order', METHOD_WORDS[id].toLowerCase()));
  return h('section', { class: 'card', 'aria-labelledby': 'methods-h' },
    h('h2', { id: 'methods-h' }, 'Which order?'),
    pick ? h('p', { class: 'tile-sub' }, h('strong', {}, 'Recommended: ' + METHOD_WORDS[pick.id].toLowerCase() + '. '), pick.words) : null,
    h('div', { class: 'method-grid' }, m.map((x) => h('div', { class: 'method-col' + (pick && pick.id === x.id ? ' is-pick' : ''), role: 'group', 'aria-label': x.words },
      h('p', { class: 'method-name' }, x.words, pick && pick.id === x.id ? [' ', h('span', { class: 'pill' }, 'Recommended')] : null),
      h('dl', { class: 'method-facts' },
        h('dt', {}, 'Debt free'), h('dd', {}, x.neverPaysOff ? 'not at this pace' : monthWords(x.debtFreeYm)),
        h('dt', {}, 'Interest in all'), h('dd', {}, x.interest === null ? 'missing' : money(x.interest)),
        h('dt', {}, 'First cleared'), h('dd', {}, x.first ? x.first.name + ', ' + monthWords(x.first.ym) : 'none')),
      x.id === 'stress' ? h('p', { class: 'muted' }, 'To compare: the plan runs the other two.')
        : x.id === now ? h('button', { type: 'button', class: 'btn small', disabled: true, title: 'This is the order the plan uses now' }, 'In use now')
          : h('button', { type: 'button', class: 'btn small' + (pick && pick.id === x.id ? ' primary' : ''), onclick: () => use(x.id) }, 'Use this order')))),
    h('p', { class: 'tile-note' }, 'Each on your plan: the extra goes to the debt while the Plan\'s debt steps are being filled.'));
}

// What the client sees first (morning answer 2, S-243): high-interest debt gone (the Plan's high-interest step), all
// debt gone on the plan, then the comparison with every extra dollar at the debt. The One-pager says the same three.
function clearCard(d) {
  const cd = d.clearDates;
  if (cd.none) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'clear-h' },
    h('h2', { id: 'clear-h' }, 'When your debt is gone'),
    h('div', { class: 'clear-grid' }, leadLines(cd).filter((x) => x[0]).map(([label, words]) => h('div', { class: 'clear-tile', role: 'group', 'aria-label': label },
      h('span', { class: 'clear-date' }, words), h('span', { class: 'clear-label' }, label)))),
    leadLines(cd).filter((x) => !x[0]).map(([, words]) => h('p', { class: 'tile-sub' }, words[0].toUpperCase() + words.slice(1) + (cd.everyInterest !== null && cd.interest !== null ? ' (' + money(cd.everyInterest) + ' of interest instead of ' + money(cd.interest) + ')' : '') + '.')),
    h('p', { class: 'tile-note' }, kindChip(d.kind), ' From the Plan: the extra goes to the debt while its debt steps are being filled (Plan, step by step).'));
}

// Each debt's month on the Plan (the day-by-day run's own clear dates are not shown: morning answer 1).
function ganttCard(d) {
  const rows = d.order.rows.filter((r) => (r.balance ?? 0) > 0);
  if (!rows.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'gantt-h' }, h('h2', { id: 'gantt-h' }, 'When each debt clears'),
    h('ul', { class: 'flow-list' }, rows.map((r) => h('li', {}, h('a', { href: ledgerHref(r.path) }, r.name), ': ' + (r.planYm ? monthWords(r.planYm) + ' on your plan' : 'not at this pace')))));
}

function orderCard(d, ctx) {
  const o = d.order;
  return h('section', { class: 'card', 'aria-labelledby': 'order-h' },
    h('h2', { id: 'order-h' }, 'Payoff order ', h('span', { class: 'count' }, o.strategy === 'snowball' ? 'smallest balance first' : 'highest rate first')),
    h('p', { class: 'muted' }, 'The Plan\'s extra at the debt goes to the first unpaid debt in this order. A promo card whose interest would come back (deferred interest) comes first, to clear before its promo ends; a debt marked paid last waits for the others.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Debt'), h('th', { class: 'num' }, 'Balance'), h('th', { class: 'num' }, 'Rate today'), h('th', {}, 'Clears'), h('th', { class: 'num' }, 'Interest, next 12 months'))),
      h('tbody', {}, o.rows.map((r) => h('tr', {}, h('td', {}, String(r.position)), h('td', {}, h('a', { href: ledgerHref(r.path) }, r.name), r.payLast ? [' ', h('span', { class: 'pill' }, 'paid last')] : null), h('td', { class: 'num' }, r.balance === null ? 'missing' : money(r.balance)),
        h('td', { class: 'num' }, pctWords(r.rate) + (r.promo ? ' (intro, ends ' + (r.promoEnds ? shortDate(r.promoEnds) : 'date not entered') + ')' : '')),
        h('td', {}, r.planYm ? monthWords(r.planYm) : 'not at this pace'),
        h('td', { class: 'num' }, money(r.interestInWindow))))))),
    h('p', { class: 'tile-note' }, 'The interest column is the next 12 months day by day, with new charges on the cards; the total below is the Plan\'s to the end, without them, so the two are not meant to add up.'),
    h('p', { class: 'tile-sub' }, o.neverPaysOff ? 'At this pace the Plan does not pay everything off.' : o.debtFreeYm ? ['All debt gone ' + monthWords(o.debtFreeYm) + ' on your plan, ', o.totalInterest.value === null ? 'interest unknown' : h('span', { 'data-metric': 'plan:debtInterest' }, money(o.totalInterest.value)), ' of interest in all.'] : ''),
    mathButton(['debt:interestWindow'], ctx));
}

function interestCard(d, ctx) {
  const t = d.interest;
  if (!t.months.length || !t.debts.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'int-h' },
    h('h2', { id: 'int-h' }, 'Card interest, month by month'),
    h('p', { class: 'muted' }, 'What each card charges at its statement close, stacked by card. Loan interest is not charged by statement; it sits in the order list.'),
    h('div', { class: 'stack', role: 'img', 'aria-label': 'Card interest by month: ' + t.months.map((m) => monthWords(m.ym) + ' ' + money(m.total)).join('; ') },
      t.months.map((m) => h('div', { class: 'stack-col', title: monthWords(m.ym) + ': ' + money(m.total) }, t.debts.map((x) => (m.byDebt[x.id] ? h('div', { class: 'stack-seg ' + vizOf(debtIndex(x.id)), style: 'height:' + pc(t.max ? m.byDebt[x.id] / t.max : 0) }) : null))))),
    h('div', { class: 'stack-axis', 'aria-hidden': 'true' }, t.months.map((m) => h('span', {}, monthWords(m.ym).slice(0, 3)))),
    h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' }, t.debts.map((x) => h('li', {}, h('span', { class: 'sw ' + vizOf(debtIndex(x.id)), 'aria-hidden': 'true' }), x.name + ' ' + money(x.total)))),
    h('details', { class: 'flow-list' }, h('summary', {}, 'The same months as a list'), h('ul', {}, t.months.map((m) => h('li', {}, monthWords(m.ym) + ': ' + money(m.total) + ' (' + t.debts.filter((x) => m.byDebt[x.id]).map((x) => x.name + ' ' + money(m.byDebt[x.id])).join(', ') + ')')))),
    mathButton(['debt:interestWindow'], ctx));
}

function cardTile(t, d, ctx) {
  const kv = [];
  const row = (k, val, cls = '') => kv.push(h('dt', {}, k), h('dd', { class: cls }, val));
  // Round 1: today's balance (the one every screen shows) first; where the run leaves it is its own row, named.
  row('Balance today', t.startBalance === null ? 'missing' : money(t.startBalance), t.startBalance === null ? 'words missing-row' : '');
  // The month it clears is the Plan's (morning answer 1); the day-by-day run says only where the next 12 months leave it.
  const onPlan = d.order.rows.find((r) => r.id === t.id);
  if (onPlan && (onPlan.balance ?? 0) > 0) row('Clears', onPlan.planYm ? monthWords(onPlan.planYm) + ' on your plan' : 'not at this pace', 'words');
  if (!t.clearDate) row('In 12 months', t.balance === null ? 'missing' : money(t.balance) + (t.revolving ? ', revolving' : ''), t.balance === null ? 'words missing-row' : 'words');
  row('Rate', pctWords(t.apr) + (t.promoApr !== null && t.promoEnd ? ', intro ' + pctWords(t.promoApr) + ' until ' + (String(t.promoEnd).length === 7 ? monthWords(t.promoEnd) : shortDate(t.promoEnd)) : ''), 'words');
  row('Closes', 'day ' + t.cycle.stmtDay + (t.cycle.closeRough ? ' (a guess from the due day)' : ''), 'words');
  row('Due', 'day ' + t.cycle.dueDay + ', ' + t.cycle.graceDays + ' days of grace', 'words');
  if (t.cycle.nextClose) row('Next statement', (t.cycle.nextStatement !== null ? money(t.cycle.nextStatement) + ', ' : '') + 'closes ' + shortDate(t.cycle.nextClose) + ', due ' + shortDate(t.cycle.nextDue), 'words');
  row('Pays', t.cycle.autopay === 'statement' ? 'the full statement' : 'the minimum plus new charges', 'words');
  if (t.util) row('At the report day', t.util.util.value === null ? h('span', { class: 'missing-row' }, 'Missing: credit limit') : [t.util.warn ? h('span', { class: 'trap-bad' }, pctWords(t.util.util.value) + ' of the limit, over the ' + pctWords(d.utilization.warn) + ' line') : pctWords(t.util.util.value) + ' of the limit', ' (peak ' + money(t.util.peak) + ' before day ' + t.util.reportDay + (t.util.reportDayRough ? ', the close day standing in' : '') + ')'], 'words');
  if (t.why) row(t.why.code === 'float' || t.why.code === 'clear' ? 'Standing' : 'Why it is stuck', t.why.text, 'words');
  if (t.trap) row('Minimum vs interest', t.trap.minimumNow === null || t.trap.interestNow === null ? h('span', { class: 'missing-row' }, 'Missing: ' + (t.trap.minimumNow === null ? 'the minimum' : 'the balance')) : t.trap.trapped ? h('span', { class: 'trap-bad' }, money(t.trap.minimumNow) + ' minimum against ' + money(t.trap.interestNow) + ' of interest a month: the balance can only grow') : money(t.trap.minimumNow) + ' minimum against ' + money(t.trap.interestNow) + ' of interest a month. At the minimum only: ' + (t.trap.months === null ? 'it never pays off' : t.trap.years + ' years and ' + money(t.trap.interest) + ' of interest'), 'words');
  if (t.fee) row('Annual fee', t.fee.value === null ? h('span', { class: 'missing-row' }, money(t.fee.fee) + ' a year; missing: what it gives back a year') : money(t.fee.fee) + ' against ' + money(t.fee.value) + ' back a year: ' + t.fee.verdict + (t.fee.net !== null ? ' (' + (t.fee.net >= 0 ? '+' : '-') + money(Math.abs(t.fee.net)) + ')' : ''), 'words');
  if (t.bonus) row('Signup bonus', t.bonus.left === null ? h('span', { class: 'missing-row' }, 'Missing: ' + t.bonus.missing.map((p) => p.split('.').pop().replace('bonusSpend', 'the spend required').replace('bonusSpent', 'what is spent so far').replace('bonusBy', 'the deadline')).join(', ')) : t.bonus.done ? 'Done: ' + money(t.bonus.spent) + ' of ' + money(t.bonus.required) + ' spent' + (t.bonus.value ? ', worth ' + money(t.bonus.value) : '') : money(t.bonus.left) + ' still to spend' + (t.bonus.by ? ' by ' + shortDate(t.bonus.by) : '') + (t.bonus.daysLeft !== null && t.bonus.daysLeft > 0 ? ' (' + t.bonus.daysLeft + ' days; ' + money(t.bonus.perDayNeeded) + ' a day needed' + (t.bonus.perDayNow !== null ? ', about ' + money(t.bonus.perDayNow) + ' a day goes on it now' : '') + ')' : t.bonus.missed ? ' (the deadline has passed)' : '') + (t.bonus.value ? '; worth ' + money(t.bonus.value) : ''), 'words');
  const ids = [t.trap ? 'debt:interestMonth:' + t.id : null, t.trap ? 'debt:minOnly:' + t.id : null, t.util && t.util.limit !== null ? 'debt:utilReport:' + t.id : null, t.fee ? 'debt:feeRoi:' + t.id : null, t.bonus ? 'debt:bonus:' + t.id : null].filter(Boolean);
  // The whole card opens the card in My numbers, with a chevron.
  return h('section', { class: 'card card-tile' + (t.path ? ' has-target' : ''), 'aria-label': t.name },
    h('h3', {}, t.path ? h('a', { class: 'card-link', href: ledgerHref(t.path) }, h('span', {}, t.name), chev()) : t.name),
    h('p', { class: 'tile-pills' }, t.revolving ? h('span', { class: 'pill' }, 'revolving') : t.balance > 0 ? h('span', { class: 'pill' }, 'paid in full') : h('span', { class: 'pill' }, 'no balance'), t.everyday ? h('span', { class: 'pill' }, 'everyday card') : null, t.payLast ? h('span', { class: 'pill' }, 'paid last') : null,
      t.bonus && !t.bonus.done ? h('span', { class: 'deadline-chip' + (t.bonus.onPace ? ' ok' : '') }, t.bonus.missed ? 'Bonus deadline passed' : t.bonus.daysLeft !== null ? 'Bonus deadline in ' + t.bonus.daysLeft + ' days' : 'Bonus deadline not entered') : null),
    h('dl', { class: 'kv' }, kv),
    ids.length ? mathButton(ids, ctx) : null);
}

function cardsCard(d, ctx) {
  if (!d.cards.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'cards-h' },
    h('h2', { id: 'cards-h' }, 'Every card ', h('span', { class: 'count' }, String(d.cards.length))),
    h('div', { class: 'tile-grid' }, d.cards.map((t) => cardTile(t, d, ctx))));
}

function utilCard(d, ctx) {
  const u = d.utilization;
  if (!u.items.length) return null;
  const words = (r, what) => (r.value === null ? h('span', { class: 'missing-row' }, what + ': missing ' + (r.missing.length ? r.missing.map((p) => p.split('.').slice(1).join(' ')).join(', ') : 'a limit')) : what + ': ' + pc(r.value) + ' (' + money(r.peak) + ' of ' + money(r.limit) + ')' + (r.value > u.warn ? ', over the ' + pctWords(u.warn) + ' line' : ''));
  return h('section', { class: 'card', 'aria-labelledby': 'util-h' },
    h('h2', { id: 'util-h' }, 'Utilization as the bureaus will see it'),
    h('p', { class: 'muted' }, 'The peak balance before each card reports, not the balance today. Personal counts the cards that report to personal credit; overall counts every card.'),
    h('p', { class: 'tile-sub' }, kindChip(u.personal.kind), ' ', words(u.personal, 'Personal')),
    h('p', { class: 'tile-sub' }, kindChip(u.overall.kind), ' ', words(u.overall, 'Overall')),
    mathButton(['debt:utilPersonal', 'debt:utilOverall'], ctx));
}

function whichCardCard(c, spine, rules, ctx, save) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'which-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  amount.value = form.amount;
  const parsed = form.amount.trim() === '' ? null : parseInput('money', form.amount);
  const w = parsed && parsed.ok ? whichCard(spine, rules, c.sim, { amount: parsed.value, business: form.business === '1' }) : null;
  // A business purchase (morning answer 8): only then are business cards in the comparison.
  const biz = h('input', { type: 'checkbox', id: 'which-biz', checked: form.business === '1' ? 'checked' : null, onchange: (e) => { form.business = e.target.checked ? '1' : ''; save(); } });
  return h('section', { class: 'card', 'aria-labelledby': 'which-h' },
    h('h2', { id: 'which-h' }, 'Which card should I use?'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = parseInput('money', amount.value); if (!p.ok) { msg.textContent = p.message; return; } form.amount = amount.value; save(); } },
      h('label', { for: 'which-amount', class: 'edit-label' }, 'A purchase today, in dollars'), amount, msg,
      h('label', { class: 'check-row', for: 'which-biz' }, biz, ' A business purchase'),
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Compare the cards'))),
    w && w.rows.length ? [h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Card'), h('th', { class: 'num' }, 'Rewards'), h('th', { class: 'num' }, 'Interest'), h('th', { class: 'num' }, 'Net'), h('th', {}, 'Float'))),
      h('tbody', {}, w.rows.map((r, i) => h('tr', { class: i === 0 ? 'tight' : '' }, h('td', {}, r.path ? h('a', { href: ledgerHref(r.path) }, r.name) : r.name, i === 0 ? [' ', h('span', { class: 'pill' }, 'best')] : null, r.utilizationWarn ? [' ', h('span', { class: 'pill' }, 'utilization')] : null), h('td', { class: 'num' }, money(r.rewards) + ' (' + pctWords(r.rate) + ')'), h('td', { class: 'num' }, r.revolving ? money(r.interest) + ' a month' : 'none'), h('td', { class: 'num' }, money(r.net)), h('td', {}, r.revolving ? 'revolving, no float' : r.interestFreeDays + ' days interest-free')))))),
      w.left.length ? h('p', { class: 'tile-sub' }, 'Left out: ' + w.left.join(', ') + ' (a business card; tick A business purchase to compare it).') : null,
      h('p', { class: 'tile-note' }, kindChip(w.kind), ' Rewards at each card\'s own rate, else usually 1% (rough). A revolving card charges a month of interest on the purchase. Float days run to the next due date.'),
      mathButton(w.rows.map((r) => 'debt:whichCard:' + r.id), () => ctx({ which: w }))] : h('p', { class: 'muted' }, 'Type an amount to compare the cards.'));
}

function btCard(c, spine, rules, ctx, save) {
  const cards = c.sim.model.cards.filter((x) => x.balance > 0);
  if (!cards.length) return null;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pick = h('select', { id: 'bt-card' }, cards.map((x) => h('option', { value: x.id }, x.name)));
  pick.value = form.btCard || cards[0].id;
  const fee = h('input', { id: 'bt-fee', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'usually 3' }); fee.value = form.btFee;
  const months = h('input', { id: 'bt-months', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'usually 18' }); months.value = form.btMonths;
  const post = h('input', { id: 'bt-post', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'the card\'s own rate' }); post.value = form.btPost;
  const num = (text, type) => (text.trim() === '' ? { ok: true, value: null } : parseInput(type, text));
  const f = num(form.btFee, 'rate'), m = num(form.btMonths, 'int'), p = num(form.btPost, 'rate');
  const b = f.ok && m.ok && p.ok ? balanceTransfer(spine, rules, { cardId: pick.value, feeShare: f.value, promoMonths: m.value, postApr: p.value }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'bt-h' },
    h('h2', { id: 'bt-h' }, 'A balance transfer'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); for (const [el, type, what] of [[fee, 'rate', 'The fee'], [months, 'int', 'The months'], [post, 'rate', 'The rate after']]) { const r = num(el.value, type); if (!r.ok) { msg.textContent = what + ': ' + r.message; return; } } form.btCard = pick.value; form.btFee = fee.value; form.btMonths = months.value; form.btPost = post.value; save(); } },
      h('label', { for: 'bt-card', class: 'edit-label' }, 'Move the balance of'), pick,
      h('label', { for: 'bt-fee', class: 'edit-label' }, 'Transfer fee, as a percent'), fee,
      h('label', { for: 'bt-months', class: 'edit-label' }, 'Months at 0%'), months,
      h('label', { for: 'bt-post', class: 'edit-label' }, 'Rate after the window, as a percent'), post,
      msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Work it out'))),
    b && b.value !== null ? [h('div', { class: 'tool-result' + (b.worthIt ? '' : ' bad') }, h('strong', {}, b.worthIt ? 'Worth it: ' : 'Not worth it: '), 'moving ' + money(b.balance) + ' from ' + b.name + ' at ' + pctWords(b.apr) + ' costs a ' + money(b.fee) + ' fee and skips ' + money(b.interestSkipped) + ' of interest over ' + b.promoMonths + ' months at 0%, so ' + (b.netSaving >= 0 ? money(b.netSaving) + ' saved' : money(-b.netSaving) + ' lost') + '. Paying ' + money(b.payment) + ' a month, ' + (b.balanceLeftAfterPromo > 0 ? money(b.balanceLeftAfterPromo) + ' is left when the window ends, at ' + pctWords(b.postApr) + '.' : 'nothing is left when the window ends.')),
      h('p', { class: 'tile-note' }, kindChip(b.kind), ' Offer terms you leave blank use the usual ones.'),
      mathButton(['debt:bt'], () => ctx({ bt: b }))] : b ? h('p', { class: 'muted missing-row' }, 'Missing: the card\'s balance.') : null);
}

function solveCard(c, spine, rules, ctx, save) {
  const targets = [...c.sim.model.cards.filter((x) => x.balance > 0).map((x) => ({ id: x.id, name: x.name })), ...c.sim.model.loans.filter((x) => x.balance > 0).map((x) => ({ id: x.id, name: x.name }))];
  if (!targets.length) return null;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pick = h('select', { id: 'solve-target' }, targets.map((x) => h('option', { value: x.id }, x.name)));
  pick.value = form.solveTarget || targets[0].id;
  const by = h('input', { id: 'solve-by', type: 'date' }); by.value = form.solveBy;
  const x = form.solveBy ? solvePayoff(spine, rules, c.sim, { target: pick.value, byDate: form.solveBy }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'solve-h' },
    h('h2', { id: 'solve-h' }, 'Paid off by a date'),
    h('p', { class: 'muted' }, 'The smallest extra a month that clears one debt by a date, with your cash day by day, and whether that extra pushes checking under the floor.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); if (!by.value) { msg.textContent = 'Pick a date'; return; } form.solveTarget = pick.value; form.solveBy = by.value; save(); } },
      h('label', { for: 'solve-target', class: 'edit-label' }, 'Clear'), pick,
      h('label', { for: 'solve-by', class: 'edit-label' }, 'By'), by,
      msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Work it out'))),
    x ? [h('div', { class: 'tool-result' + (x.breaksCash ? ' bad' : '') },
      x.impossible ? 'Even ' + money(x.need) + ' a month more does not clear ' + x.name + ' by ' + shortDate(x.byDate) + (x.best ? '; the soonest is ' + shortDate(x.best) : '') + '.'
        : x.already ? x.name + ' already clears by ' + shortDate(x.date) + ' with the extra as it is (' + money(x.extraNow) + ' a month).'
        : [h('strong', {}, money(x.need) + ' a month'), ' at the debt (now ' + money(x.extraNow) + ') clears ' + x.name + ' by ' + shortDate(x.date) + '.'],
      x.breaksCash ? ' That breaks cash: checking goes under the floor ' + x.shortfalls + ' time' + (x.shortfalls === 1 ? '' : 's') + ' (lowest day ' + money(x.low) + ').' : ' Checking stays above the floor (lowest day ' + money(x.low) + ').'),
      mathButton(['debt:solve'], () => ctx({ solve: x }))] : null);
}

function loansCard(d, ctx) {
  if (!d.loans.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'loans-h' },
    h('h2', { id: 'loans-h' }, 'Student loans: income-driven repayment and forgiveness'),
    h('p', { class: 'muted' }, 'Your payment is based on your income and household size.'),
    // The whole card opens the loan in My numbers, with a chevron.
    d.loans.map((l) => h('section', { class: 'card card-tile' + (l.path ? ' has-target' : ''), 'aria-label': l.name },
      h('h3', {}, l.path ? h('a', { class: 'card-link', href: ledgerHref(l.path) }, h('span', {}, l.name), chev()) : l.name),
      l.plan ? h('p', { class: 'tile-pills' }, h('span', { class: 'pill' }, l.plan)) : null,
      l.federal === false ? h('p', { class: 'tile-sub' }, kindChip('notForMe'), ' ', l.note) : (() => {
        const kv = [];
        const row = (k, val, cls = '') => kv.push(h('dt', {}, k), h('dd', { class: cls }, val));
        if (l.missingRules.length) row('Missing', h('span', { class: 'missing-row' }, (l.missingRules.length === 1 ? 'A figure' : l.missingRules.length + ' figures') + ' this plan needs, not available yet'), 'words');
        row('Income-driven payment', l.payment === null ? [h('span', { class: 'missing-row' }, 'Missing: ' + (l.missing.filter((p) => !p.startsWith('rule:')).map((p) => p === 'household.householdSize' ? 'people in the household' : labelFor(ctx().spine, p)).join(', ') || 'a figure this plan needs')), l.missing.includes('household.householdSize') ? h('span', {}, ' ', h('a', { class: 'btn small', href: ledgerHref('household.householdSize') }, 'Add household size')) : null] : money(l.payment) + ' a month' + (l.standardPayment !== null ? ' against ' + money(l.standardPayment) + ' now' + (l.lower ? ' (lower)' : ' (not lower)') : ''), 'words');
        if (l.payment !== null) row('How', 'income ' + money(l.agi) + (l.agiSource === 'cashflow' ? ' (a year of this month\'s gross, rough)' : ' (this year\'s AGI)') + ', poverty line ' + money(l.povertyLine) + ' for ' + l.householdSize + (l.householdSize === 1 ? ' person' : ' people') + ', discretionary ' + money(l.discretionary), 'words');
        row('Forgiveness', l.forgivenessYears === null ? h('span', { class: 'missing-row' }, 'Missing: when this plan forgives what is left') : 'whatever is left after ' + l.forgivenessYears + ' years of payments, about ' + shortDate(l.forgivenessDate), 'words');
        if (l.rap) row('Repayment Assistance Plan', money(l.rap.payment) + ' a month (' + Math.round(l.rap.share * 100) + '% of income, less ' + (l.householdSize > 1 ? 'a credit for each dependent' : 'no dependents') + '); what is left is forgiven after ' + l.rap.payments / 12 + ' years, about ' + shortDate(l.rap.date), 'words');
        if (l.pslf) row('Public service', l.pslf.payments === null ? h('span', { class: 'missing-row' }, 'Missing: how many payments public service forgiveness takes') : l.pslf.payments + ' qualifying payments, about ' + shortDate(l.pslf.date), 'words');
        return [h('dl', { class: 'kv' }, kv), h('p', { class: 'tile-note' }, kindChip(l.kind), ' Not included: tax on a forgiven amount, and the Repayment Assistance Plan\'s interest waiver and principal match. Both plans\' figures are marked verify.'), mathButton(['debt:idr:' + l.id], ctx)];
      })())));
}
