// The Debt tab on the calendar page (S-205): formatting of engine/debtview.js.
// Every number has Show the math; a missing input or rule reads as a missing
// row in words, never a number. Formatting only.

import { debtView, solvePayoff, whichCard, balanceTransfer } from '../engine/debtview.js';
import { parseInput } from '../engine/edits.js';
import { mathButton } from './math-panel.js';
import { h, chip, money, shortDate, monthWords, ledgerHref } from './view.js';

const VIZ = ['viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5'];
const vizOf = (i) => VIZ[i % VIZ.length];
const pctWords = (r) => (r === null || r === undefined ? 'rate not entered' : Math.round(r * 10000) / 100 + '%');
const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const pc = (f) => Math.round(f * 1000) / 10 + '%';
// What the tab's small forms hold between renders (this page only).
const form = { amount: '100', btCard: '', btFee: '', btMonths: '', btPost: '', solveTarget: '', solveBy: '' };

export function debtTab({ c, spine, rules, mathCtx, rerender }) {
  if (!c.sim) return [h('p', { class: 'muted' }, 'No simulation for a month before the as-of date.')];
  const base = mathCtx();
  const d = debtView(spine, rules, c.sim, base.s);
  const ctx = (extra = {}) => ({ ...base, sim: c.sim, debt: d, ...extra });
  return [clearCard(d), ganttCard(d), orderCard(d, ctx), interestCard(d, ctx), cardsCard(d, ctx), utilCard(d, ctx), whichCardCard(c, spine, rules, ctx, rerender), btCard(c, spine, rules, ctx, rerender), solveCard(c, spine, rules, ctx, rerender), loansCard(d, ctx)].filter(Boolean);
}

function clearCard(d) {
  return h('section', { class: 'card', 'aria-labelledby': 'clear-h' },
    h('h2', { id: 'clear-h' }, 'Clear dates'),
    h('div', { class: 'clear-grid' }, d.clearDates.rows.map((r) => h('div', { class: 'clear-tile' + (r.beyond ? ' beyond' : ''), role: 'group', 'aria-label': r.label },
      h('span', { class: 'clear-date' }, r.date ? shortDate(r.date) : 'Not inside the window'), h('span', { class: 'clear-label' }, r.label), h('span', { class: 'tile-note' }, r.why)))),
    h('p', { class: 'tile-note' }, kindChip(d.kind), ' From the day-by-day run over ' + d.window.days + ' days, from ' + shortDate(d.window.from) + '. A date past the window shows once the window is long enough (12 months is the most).'));
}

function ganttCard(d) {
  const g = d.gantt;
  if (!g.rows.length) return h('section', { class: 'card' }, h('h2', {}, 'Payoff timeline'), h('p', { class: 'muted' }, 'No debt with a balance.'));
  const left = (f) => 'left:' + pc(f);
  const shown = g.ticks.filter((t, i) => g.ticks.length <= 6 || i % Math.ceil(g.ticks.length / 6) === 0);
  return h('section', { class: 'card', 'aria-labelledby': 'gantt-h' },
    h('h2', { id: 'gantt-h' }, 'Payoff timeline'),
    h('p', { class: 'muted' }, 'Each bar runs from today to the day the debt clears. A striped bar runs past the window.'),
    h('div', { class: 'gantt', role: 'img', 'aria-label': 'Payoff timeline: ' + g.rows.map((r) => r.name + (r.clearDate ? ' clears ' + shortDate(r.clearDate) : ' runs past the window')).join('; ') },
      g.rows.map((r, i) => h('div', { class: 'gantt-row' }, h('span', { class: 'gantt-label' }, r.name),
        h('div', { class: 'gantt-track' }, h('div', { class: 'gantt-bar ' + vizOf(i) + (r.beyond ? ' beyond' : ''), style: 'width:' + pc(r.fraction) }), ...g.ticks.map((t) => h('span', { class: 'gantt-tick', style: left(t.fraction) })))))),
    h('div', { class: 'gantt-axis', 'aria-hidden': 'true' }, h('span', {}), h('div', { class: 'axis' }, shown.map((t) => h('span', { style: left(t.fraction) }, monthWords(t.ym).slice(0, 3))))),
    h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' }, g.rows.map((r, i) => h('li', {}, h('span', { class: 'sw ' + vizOf(i), 'aria-hidden': 'true' }), r.name))),
    h('details', { class: 'flow-list' }, h('summary', {}, 'The same timeline as a list'),
      h('ul', {}, g.rows.map((r) => h('li', {}, r.path ? h('a', { href: ledgerHref(r.path) }, r.name) : r.name, ': ' + money(r.startBalance) + ' today, ' + (r.clearDate ? 'clears ' + shortDate(r.clearDate) : money(r.endBalance) + ' left at the end of the window') + ', interest in the window ' + money(r.interest))))));
}

function orderCard(d, ctx) {
  const o = d.order;
  return h('section', { class: 'card', 'aria-labelledby': 'order-h' },
    h('h2', { id: 'order-h' }, 'Payoff order ', h('span', { class: 'count' }, o.strategy === 'snowball' ? 'smallest balance first' : 'highest rate first')),
    h('p', { class: 'muted' }, 'The extra at the debt (' + money(o.extra) + ' a month) goes to the first unpaid debt in this order; a promo card waits until its promo ends; a debt marked paid last waits for the others.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Debt'), h('th', { class: 'num' }, 'Balance'), h('th', { class: 'num' }, 'Rate today'), h('th', {}, 'Clears'), h('th', { class: 'num' }, 'Interest in the window'))),
      h('tbody', {}, o.rows.map((r) => h('tr', {}, h('td', {}, String(r.position)), h('td', {}, h('a', { href: ledgerHref(r.path) }, r.name), r.payLast ? [' ', h('span', { class: 'pill' }, 'paid last')] : null), h('td', { class: 'num' }, r.balance === null ? 'missing' : money(r.balance)),
        h('td', { class: 'num' }, pctWords(r.rate) + (r.promo ? ' (intro, ends ' + (r.promoEnds ? shortDate(r.promoEnds) : 'date not entered') + ')' : '')),
        h('td', {}, r.clearDate ? shortDate(r.clearDate) : r.planYm ? 'about ' + monthWords(r.planYm) + ' (monthly plan, rough)' : 'not inside the window'),
        h('td', { class: 'num' }, money(r.interestInWindow))))))),
    h('p', { class: 'tile-sub' }, o.neverPaysOff ? 'At this pace the monthly plan never pays everything off.' : o.debtFreeYm ? 'Debt free about ' + monthWords(o.debtFreeYm) + ' on the monthly plan, ' + (o.totalInterest.value === null ? 'interest unknown' : money(o.totalInterest.value) + ' of interest in all') + '.' : ''),
    mathButton(['debt:interestWindow'], ctx));
}

function interestCard(d, ctx) {
  const t = d.interest;
  if (!t.months.length || !t.debts.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'int-h' },
    h('h2', { id: 'int-h' }, 'Card interest, month by month'),
    h('p', { class: 'muted' }, 'What each card charges at its statement close, stacked by card. Loan interest is not charged by statement; it sits in the order list.'),
    h('div', { class: 'stack', role: 'img', 'aria-label': 'Card interest by month: ' + t.months.map((m) => monthWords(m.ym) + ' ' + money(m.total)).join('; ') },
      t.months.map((m) => h('div', { class: 'stack-col', title: monthWords(m.ym) + ': ' + money(m.total) }, t.debts.map((x, i) => (m.byDebt[x.id] ? h('div', { class: 'stack-seg ' + vizOf(i), style: 'height:' + pc(t.max ? m.byDebt[x.id] / t.max : 0) }) : null))))),
    h('div', { class: 'stack-axis', 'aria-hidden': 'true' }, t.months.map((m) => h('span', {}, monthWords(m.ym).slice(0, 3)))),
    h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' }, t.debts.map((x, i) => h('li', {}, h('span', { class: 'sw ' + vizOf(i), 'aria-hidden': 'true' }), x.name + ' ' + money(x.total)))),
    h('details', { class: 'flow-list' }, h('summary', {}, 'The same months as a list'), h('ul', {}, t.months.map((m) => h('li', {}, monthWords(m.ym) + ': ' + money(m.total) + ' (' + t.debts.filter((x) => m.byDebt[x.id]).map((x) => x.name + ' ' + money(m.byDebt[x.id])).join(', ') + ')')))),
    mathButton(['debt:interestWindow'], ctx));
}

function cardTile(t, d, ctx) {
  const kv = [];
  const row = (k, val, cls = '') => kv.push(h('dt', {}, k), h('dd', { class: cls }, val));
  row('Balance', t.balance === null ? 'missing' : money(t.balance) + (t.clearDate ? ', clears ' + shortDate(t.clearDate) : t.revolving ? ', revolving' : ''), t.balance === null ? 'words missing-row' : '');
  row('Rate', pctWords(t.apr) + (t.promoApr !== null && t.promoEnd ? ', intro ' + pctWords(t.promoApr) + ' until ' + t.promoEnd : ''), 'words');
  row('Closes', 'day ' + t.cycle.stmtDay + (t.cycle.closeRough ? ' (a house guess from the due day)' : ''), 'words');
  row('Due', 'day ' + t.cycle.dueDay + ', ' + t.cycle.graceDays + ' days of grace', 'words');
  if (t.cycle.nextClose) row('Next statement', (t.cycle.nextStatement !== null ? money(t.cycle.nextStatement) + ', ' : '') + 'closes ' + shortDate(t.cycle.nextClose) + ', due ' + shortDate(t.cycle.nextDue), 'words');
  row('Pays', t.cycle.autopay === 'statement' ? 'the full statement' : 'the minimum plus new charges', 'words');
  if (t.util) row('At the report day', t.util.util.value === null ? h('span', { class: 'missing-row' }, 'Missing: credit limit') : [t.util.warn ? h('span', { class: 'trap-bad' }, pctWords(t.util.util.value) + ' of the limit, over the ' + pctWords(d.utilization.warn) + ' line') : pctWords(t.util.util.value) + ' of the limit', ' (peak ' + money(t.util.peak) + ' before day ' + t.util.reportDay + (t.util.reportDayRough ? ', the close day standing in' : '') + ')'], 'words');
  if (t.why) row(t.why.code === 'float' || t.why.code === 'clear' ? 'Standing' : 'Why it is stuck', t.why.text, 'words');
  if (t.trap) row('Minimum vs interest', t.trap.minimumNow === null || t.trap.interestNow === null ? h('span', { class: 'missing-row' }, 'Missing: ' + (t.trap.minimumNow === null ? 'the minimum' : 'the balance')) : t.trap.trapped ? h('span', { class: 'trap-bad' }, money(t.trap.minimumNow) + ' minimum against ' + money(t.trap.interestNow) + ' of interest a month: the balance can only grow') : money(t.trap.minimumNow) + ' minimum against ' + money(t.trap.interestNow) + ' of interest a month. At the minimum only: ' + (t.trap.months === null ? 'it never pays off' : t.trap.years + ' years and ' + money(t.trap.interest) + ' of interest'), 'words');
  if (t.fee) row('Annual fee', t.fee.value === null ? h('span', { class: 'missing-row' }, money(t.fee.fee) + ' a year; missing: what it gives back a year') : money(t.fee.fee) + ' against ' + money(t.fee.value) + ' back a year: ' + t.fee.verdict + (t.fee.net !== null ? ' (' + (t.fee.net >= 0 ? '+' : '-') + money(Math.abs(t.fee.net)) + ')' : ''), 'words');
  if (t.bonus) row('Signup bonus', t.bonus.left === null ? h('span', { class: 'missing-row' }, 'Missing: ' + t.bonus.missing.map((p) => p.split('.').pop().replace('bonusSpend', 'the spend required').replace('bonusSpent', 'what is spent so far').replace('bonusBy', 'the deadline')).join(', ')) : t.bonus.done ? 'Done: ' + money(t.bonus.spent) + ' of ' + money(t.bonus.required) + ' spent' + (t.bonus.value ? ', worth ' + money(t.bonus.value) : '') : money(t.bonus.left) + ' still to spend' + (t.bonus.by ? ' by ' + shortDate(t.bonus.by) : '') + (t.bonus.daysLeft !== null && t.bonus.daysLeft > 0 ? ' (' + t.bonus.daysLeft + ' days; ' + money(t.bonus.perDayNeeded) + ' a day needed' + (t.bonus.perDayNow !== null ? ', about ' + money(t.bonus.perDayNow) + ' a day goes on it now' : '') + ')' : t.bonus.missed ? ' (the deadline has passed)' : '') + (t.bonus.value ? '; worth ' + money(t.bonus.value) : ''), 'words');
  const ids = [t.trap ? 'debt:interestMonth:' + t.id : null, t.trap ? 'debt:minOnly:' + t.id : null, t.util && t.util.limit !== null ? 'debt:utilReport:' + t.id : null, t.fee ? 'debt:feeRoi:' + t.id : null, t.bonus ? 'debt:bonus:' + t.id : null].filter(Boolean);
  return h('section', { class: 'card card-tile', 'aria-label': t.name },
    h('h3', {}, h('a', { href: ledgerHref(t.path) }, t.name), t.revolving ? h('span', { class: 'pill' }, 'revolving') : t.balance > 0 ? h('span', { class: 'pill' }, 'paid in full') : h('span', { class: 'pill' }, 'no balance'), t.everyday ? h('span', { class: 'pill' }, 'everyday card') : null, t.payLast ? h('span', { class: 'pill' }, 'paid last') : null,
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
  const words = (r, what) => (r.value === null ? h('span', { class: 'missing-row' }, what + ': missing ' + (r.missing.length ? r.missing.map((p) => p.split('.').slice(1).join(' ')).join(', ') : 'a limit')) : what + ': ' + pctWords(r.value) + ' (' + money(r.peak) + ' of ' + money(r.limit) + ')' + (r.value > u.warn ? ', over the ' + pctWords(u.warn) + ' line' : ''));
  return h('section', { class: 'card', 'aria-labelledby': 'util-h' },
    h('h2', { id: 'util-h' }, 'Utilization as the bureaus will see it'),
    h('p', { class: 'muted' }, 'The peak balance before each card reports, not the balance today. Personal counts the cards that report to personal credit; overall counts every card.'),
    h('p', { class: 'tile-sub' }, kindChip(u.personal.kind), ' ', words(u.personal, 'Personal')),
    h('p', { class: 'tile-sub' }, kindChip(u.overall.kind), ' ', words(u.overall, 'Overall')),
    mathButton(['debt:utilPersonal', 'debt:utilOverall'], ctx));
}

function whichCardCard(c, spine, rules, ctx, rerender) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'which-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  amount.value = form.amount;
  const parsed = form.amount.trim() === '' ? null : parseInput('money', form.amount);
  const w = parsed && parsed.ok ? whichCard(spine, rules, c.sim, { amount: parsed.value }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'which-h' },
    h('h2', { id: 'which-h' }, 'Which card should I use?'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = parseInput('money', amount.value); if (!p.ok) { msg.textContent = p.message; return; } form.amount = amount.value; rerender(); } },
      h('label', { for: 'which-amount', class: 'edit-label' }, 'A purchase today, in dollars'), amount, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Compare the cards'))),
    w && w.rows.length ? [h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Card'), h('th', { class: 'num' }, 'Rewards'), h('th', { class: 'num' }, 'Interest'), h('th', { class: 'num' }, 'Net'), h('th', {}, 'Float'))),
      h('tbody', {}, w.rows.map((r, i) => h('tr', { class: i === 0 ? 'tight' : '' }, h('td', {}, r.path ? h('a', { href: ledgerHref(r.path) }, r.name) : r.name, i === 0 ? [' ', h('span', { class: 'pill' }, 'best')] : null, r.utilizationWarn ? [' ', h('span', { class: 'pill' }, 'utilization')] : null), h('td', { class: 'num' }, money(r.rewards) + ' (' + pctWords(r.rate) + ')'), h('td', { class: 'num' }, r.revolving ? money(r.interest) + ' a month' : 'none'), h('td', { class: 'num' }, money(r.net)), h('td', {}, r.revolving ? 'revolving, no float' : r.interestFreeDays + ' days interest-free')))))),
      h('p', { class: 'tile-note' }, kindChip(w.kind), ' Rewards at each card\'s own rate, else the house 1% (rough). A revolving card charges a month of interest on the purchase. Float days run to the next due date.'),
      mathButton(w.rows.map((r) => 'debt:whichCard:' + r.id), () => ctx({ which: w }))] : h('p', { class: 'muted' }, 'Type an amount to compare the cards.'));
}

function btCard(c, spine, rules, ctx, rerender) {
  const cards = c.sim.model.cards.filter((x) => x.balance > 0);
  if (!cards.length) return null;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pick = h('select', { id: 'bt-card' }, cards.map((x) => h('option', { value: x.id }, x.name)));
  pick.value = form.btCard || cards[0].id;
  const fee = h('input', { id: 'bt-fee', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'house default 3' }); fee.value = form.btFee;
  const months = h('input', { id: 'bt-months', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'house default 18' }); months.value = form.btMonths;
  const post = h('input', { id: 'bt-post', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'the card\'s own rate' }); post.value = form.btPost;
  const num = (text, type) => (text.trim() === '' ? { ok: true, value: null } : parseInput(type, text));
  const f = num(form.btFee, 'rate'), m = num(form.btMonths, 'int'), p = num(form.btPost, 'rate');
  const b = f.ok && m.ok && p.ok ? balanceTransfer(spine, rules, { cardId: pick.value, feeShare: f.value, promoMonths: m.value, postApr: p.value }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'bt-h' },
    h('h2', { id: 'bt-h' }, 'A balance transfer'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); for (const [el, type, what] of [[fee, 'rate', 'The fee'], [months, 'int', 'The months'], [post, 'rate', 'The rate after']]) { const r = num(el.value, type); if (!r.ok) { msg.textContent = what + ': ' + r.message; return; } } form.btCard = pick.value; form.btFee = fee.value; form.btMonths = months.value; form.btPost = post.value; rerender(); } },
      h('label', { for: 'bt-card', class: 'edit-label' }, 'Move the balance of'), pick,
      h('label', { for: 'bt-fee', class: 'edit-label' }, 'Transfer fee, as a percent'), fee,
      h('label', { for: 'bt-months', class: 'edit-label' }, 'Months at 0%'), months,
      h('label', { for: 'bt-post', class: 'edit-label' }, 'Rate after the window, as a percent'), post,
      msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Work it out'))),
    b && b.value !== null ? [h('div', { class: 'tool-result' + (b.worthIt ? '' : ' bad') }, h('strong', {}, b.worthIt ? 'Worth it: ' : 'Not worth it: '), 'moving ' + money(b.balance) + ' from ' + b.name + ' at ' + pctWords(b.apr) + ' costs a ' + money(b.fee) + ' fee and skips ' + money(b.interestSkipped) + ' of interest over ' + b.promoMonths + ' months at 0%, so ' + (b.netSaving >= 0 ? money(b.netSaving) + ' saved' : money(-b.netSaving) + ' lost') + '. Paying ' + money(b.payment) + ' a month, ' + (b.balanceLeftAfterPromo > 0 ? money(b.balanceLeftAfterPromo) + ' is left when the window ends, at ' + pctWords(b.postApr) + '.' : 'nothing is left when the window ends.')),
      h('p', { class: 'tile-note' }, kindChip(b.kind), ' Offer terms you leave blank use the house defaults.'),
      mathButton(['debt:bt'], () => ctx({ bt: b }))] : b ? h('p', { class: 'muted missing-row' }, 'Missing: the card\'s balance.') : null);
}

function solveCard(c, spine, rules, ctx, rerender) {
  const targets = [...c.sim.model.cards.filter((x) => x.balance > 0).map((x) => ({ id: x.id, name: x.name })), ...c.sim.model.loans.filter((x) => x.balance > 0).map((x) => ({ id: x.id, name: x.name }))];
  if (!targets.length) return null;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pick = h('select', { id: 'solve-target' }, targets.map((x) => h('option', { value: x.id }, x.name)));
  pick.value = form.solveTarget || targets[0].id;
  const by = h('input', { id: 'solve-by', type: 'date' }); by.value = form.solveBy;
  const x = form.solveBy ? solvePayoff(spine, rules, c.sim, { target: pick.value, byDate: form.solveBy }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'solve-h' },
    h('h2', { id: 'solve-h' }, 'Paid off by a date'),
    h('p', { class: 'muted' }, 'The smallest extra a month that clears one debt by a date, on the same day-by-day run, and whether that extra pushes checking under the floor.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); if (!by.value) { msg.textContent = 'Pick a date'; return; } form.solveTarget = pick.value; form.solveBy = by.value; rerender(); } },
      h('label', { for: 'solve-target', class: 'edit-label' }, 'Clear'), pick,
      h('label', { for: 'solve-by', class: 'edit-label' }, 'By'), by,
      msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Work it out'))),
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
    h('p', { class: 'muted' }, 'From the rules registry: the payment is a share of income above a multiple of the poverty line for the household size. A rule that is not in the registry is a missing row.'),
    d.loans.map((l) => h('section', { class: 'card card-tile', 'aria-label': l.name },
      h('h3', {}, h('a', { href: ledgerHref(l.path) }, l.name), l.plan ? h('span', { class: 'pill' }, l.plan) : null),
      l.federal === false ? h('p', { class: 'tile-sub' }, kindChip('notForMe'), ' ', l.note) : (() => {
        const kv = [];
        const row = (k, val, cls = '') => kv.push(h('dt', {}, k), h('dd', { class: cls }, val));
        for (const id of l.missingRules) row('Missing rule', h('span', { class: 'missing-row' }, id + ' is not in the rules registry'), 'words');
        row('Income-driven payment', l.payment === null ? h('span', { class: 'missing-row' }, 'Missing: ' + (l.missing.filter((p) => !p.startsWith('rule:')).map((p) => p === 'household.householdSize' ? 'people in the household' : p === 'income' ? 'income' : p.split('.').pop()).join(', ') || 'a rule')) : money(l.payment) + ' a month' + (l.standardPayment !== null ? ' against ' + money(l.standardPayment) + ' now' + (l.lower ? ' (lower)' : ' (not lower)') : ''), 'words');
        if (l.payment !== null) row('How', 'income ' + money(l.agi) + (l.agiSource === 'cashflow' ? ' (a year of this month\'s gross, rough)' : ' (this year\'s AGI)') + ', poverty line ' + money(l.povertyLine) + ' for ' + l.householdSize + (l.householdSize === 1 ? ' person' : ' people') + ', discretionary ' + money(l.discretionary), 'words');
        row('Forgiveness', l.forgivenessYears === null ? h('span', { class: 'missing-row' }, 'Missing: the forgiveness rule') : 'whatever is left after ' + l.forgivenessYears + ' years of payments, about ' + shortDate(l.forgivenessDate), 'words');
        if (l.pslf) row('Public service', l.pslf.payments === null ? h('span', { class: 'missing-row' }, 'Missing: the PSLF rule') : l.pslf.payments + ' qualifying payments, about ' + shortDate(l.pslf.date), 'words');
        return [h('dl', { class: 'kv' }, kv), h('p', { class: 'tile-note' }, kindChip(l.kind), ' Any tax on a forgiven amount is not modeled; the Repayment Assistance Plan that opens July 2026 is not modeled yet.'), mathButton(['debt:idr:' + l.id], ctx)];
      })())));
}
