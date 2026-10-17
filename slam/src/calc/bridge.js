// The budget-to-cash bridge (S-088): why the budget's surplus and the change in
// cash differ for one month. Every step has an amount, where it came from,
// and a link. Explained + not explained yet = the actual change in cash.
//
//   budget surplus (take-home - spending - savings, the budget's own number)
// + yearly costs: the monthly share in the budget - what was paid this month
// + set-asides counted as spending but not paid out (savings lines with no matching entry)
// + card balances: increase (charged, not paid yet) or - decrease
// + card minimums in the budget (paying a card is not new spending; the card's change counts it)
// - reimbursements still owed for this month's purchases + ones received this month for earlier ones
// - one-off spending (the budget lists it apart)
// + income in the log - take-home in the budget (late, extra, or missing paychecks)
// = explained change in cash
//   actual change in cash = end - start, checking + savings + cash
//   not explained yet = actual - explained

import { modelForMonth } from './plan.js';
import { budgetTotals } from './totals.js';
import { balancesFor } from './balances.js';
import { counted } from './log.js';

const COUNTS = new Set(['spend', 'fee', 'refund', 'reimbursement']);
const r2 = (x) => Math.round(x * 100) / 100 + 0;
const monthOf = (d) => d.slice(0, 7);
export const TIES_WITHIN = 25;
const SHORT = { yearly: 'Yearly costs', 'set-aside': 'Set aside', cards: 'Card balances', 'card-min': 'Card minimums', owed: 'Owed to you', received: 'Paid back', 'one-off': 'One-off', income: 'Income vs take-home' };

// The budget side of one month: from the locked snapshot when closed, else live.
function budgetSide(doc, income, month) {
  const rec = (doc.months || []).find((m) => m.key === month);
  const lineDoc = Object.fromEntries(doc.categories.flatMap((c) => c.lines.map((l) => [l.id, { line: l, cat: c }])));
  if (rec) {
    const cats = rec.snapshot.categories;
    const spending = Object.values(cats).filter((c) => !c.savings).reduce((a, c) => a + (c.actual || 0), 0);
    const saved = Object.values(cats).filter((c) => c.savings).reduce((a, c) => a + (c.actual || 0), 0);
    const lines = Object.entries(rec.snapshot.lines).map(([id, l]) => ({
      id, name: l.name, actual: l.actual, savings: !!(cats[l.categoryId] && cats[l.categoryId].savings),
      yearly: !!(lineDoc[id] && lineDoc[id].line.dueMonth && lineDoc[id].line.dueMonth.amount !== null), debtId: id.startsWith('debt:') ? id.slice(5) : null
    }));
    return { closed: true, takeHome: rec.snapshot.takeHome, surplus: rec.snapshot.takeHome === null ? null : r2(rec.snapshot.takeHome - spending - saved), spending: r2(spending), savings: r2(saved), lines, oneOffs: [] };
  }
  const model = modelForMonth(doc, month);
  const totals = budgetTotals(model, income, doc);
  const lines = model.categories.flatMap((c) => c.lines.map((l) => ({ id: l.id, name: l.name, actual: l.actual, savings: c.savings, yearly: l.actualFrom === 'share', debtId: l.debtId || null })));
  return { closed: false, takeHome: totals.takeHome, surplus: totals.surplus, spending: totals.spending, savings: totals.savings, lines, oneOffs: model.oneOffs.filter((o) => o.which === 'actual') };
}

export function bridgeFor(doc, income, month) {
  const b = budgetSide(doc, income, month);
  const all = counted(doc.transactions).filter((t) => !t.adjust);
  const inMonth = all.filter((t) => monthOf(t.date) === month);
  const byLine = (ids) => r2(inMonth.filter((t) => ids.has(t.lineId) && COUNTS.has(t.kind) && !t.oneOff).reduce((a, t) => a + t.amount, 0));
  const steps = [];
  const step = (key, label, amount, from, link, extra = {}) => { if (amount !== null && Math.abs(amount) >= 0.005) steps.push({ key, label, short: SHORT[key], amount: r2(amount), from, link, ...extra }); };

  // Yearly costs: the share in the budget, less what was paid.
  const yearly = b.lines.filter((l) => l.yearly);
  if (yearly.length) {
    const ids = new Set(yearly.map((l) => l.id));
    const share = yearly.reduce((a, l) => a + (l.actual || 0), 0);
    const paid = byLine(ids);
    const paidLines = yearly.map((l) => ({ name: l.name, paid: byLine(new Set([l.id])) })).filter((x) => x.paid);
    step('yearly', 'Yearly costs paid this month, less the monthly share already in the budget', share - paid,
      (paidLines.length ? paidLines.map((x) => x.name + ' ' + money(x.paid) + ' paid').join(', ') + '; ' : 'Nothing yearly paid; ') + money(share) + ' a month is in the budget', { to: 'actual' }, { paid: paidLines });
  }
  // Set-asides: savings lines counted in the budget but still in the client's own accounts.
  const sav = b.lines.filter((l) => l.savings && l.actual);
  const setAside = sav.reduce((a, l) => a + (l.actual - byLine(new Set([l.id]))), 0);
  step('set-aside', 'Set aside (counted in the budget, still in your accounts)', setAside, sav.map((l) => l.name + ' ' + money(l.actual)).join(', '), { to: 'actual' });

  const bal = balancesFor(doc, month);
  const missing = bal.missing.slice();
  // Cards: charged but not paid yet adds back; paying down more than was charged takes away.
  const cards = bal.rows.filter((r) => r.card);
  if (cards.length) {
    if (cards.every((r) => r.start.amount !== null && r.end.amount !== null)) {
      const change = cards.reduce((a, r) => a + r.end.amount - r.start.amount, 0);
      step('cards', change >= 0 ? 'Card balances went up (charged, not paid yet)' : 'Card balances went down (paid more than was charged)', change,
        cards.map((r) => r.name + ' ' + money(r.start.amount) + ' to ' + money(r.end.amount)).join(', '), { to: 'balances' });
    }
    // A card's minimum in Debt payments is a payment of past charges, which the card's change already counts.
    const linked = new Set((doc.accounts || []).filter((a) => a.type === 'credit-card' && a.state !== 'archived' && a.debtId).map((a) => a.debtId));
    const mins = b.lines.filter((l) => l.debtId && linked.has(l.debtId) && l.actual);
    step('card-min', 'Card minimums in the budget (the card\'s change already counts them)', mins.reduce((a, l) => a + l.actual, 0), mins.map((l) => l.name + ' ' + money(l.actual)).join(', '), { to: 'actual' });
  }
  // Reimbursements: owed for this month's purchases, and received now for earlier ones.
  const settled = new Map(all.filter((t) => t.kind === 'reimbursement' && t.settles).map((t) => [t.settles, t]));
  const owed = inMonth.filter((t) => t.owed && !(settled.has(t.id) && monthOf(settled.get(t.id).date) <= month));
  step('owed', 'Reimbursements still owed to you', -owed.reduce((a, t) => a + t.owed, 0), owed.map((t) => (t.description || t.note || 'purchase') + ' ' + money(t.owed)).join(', '), { to: 'log' });
  const received = inMonth.filter((t) => t.kind === 'reimbursement' && t.settles).map((t) => ({ t, p: all.find((x) => x.id === t.settles) })).filter((x) => x.p && monthOf(x.p.date) < month);
  step('received', 'Reimbursements received for earlier months', received.reduce((a, x) => a + x.p.owed, 0), received.map((x) => (x.p.description || 'purchase') + ' ' + money(x.p.owed)).join(', '), { to: 'log' });
  // One-offs: paid, but listed apart from the monthly budget.
  const oneOffEntries = inMonth.filter((t) => t.oneOff && COUNTS.has(t.kind));
  const oneOff = b.oneOffs.reduce((a, o) => a + o.amount, 0) + oneOffEntries.reduce((a, t) => a + t.amount, 0);
  step('one-off', 'One-off spending (the budget lists it apart)', -oneOff, [...b.oneOffs.map((o) => o.name + ' ' + money(o.amount)), ...oneOffEntries.map((t) => (t.description || t.note || 'entry') + ' ' + money(t.amount))].join(', '), { to: 'log' });
  // Income that landed different from the budget's take-home (only when paychecks are in the log).
  const pay = inMonth.filter((t) => t.kind === 'income');
  if (pay.length && b.takeHome !== null) {
    const got = -pay.reduce((a, t) => a + t.amount, 0);
    step('income', got >= b.takeHome ? 'More income landed than the budget\'s take-home' : 'Less income landed than the budget\'s take-home', got - b.takeHome,
      pay.length + ' deposit' + (pay.length === 1 ? '' : 's') + ' ' + money(got) + ' vs take-home ' + money(b.takeHome), { to: 'log' });
  }
  const explained = b.surplus === null ? null : r2(b.surplus + steps.reduce((a, s) => a + s.amount, 0));
  const actual = bal.cashStart !== null && bal.cashEnd !== null ? r2(bal.cashEnd - bal.cashStart) : null;
  const cardsMissing = missing.filter((m) => cards.some((c) => c.id === m.id));
  const unexplained = explained !== null && actual !== null && !cardsMissing.length ? r2(actual - explained) : null;
  const out = {
    month, closed: b.closed, takeHome: b.takeHome, surplus: b.surplus, steps, explained,
    cashStart: bal.cashStart, cashEnd: bal.cashEnd, actual, unexplained, missing,
    ties: unexplained === null ? null : Math.abs(unexplained) < TIES_WITHIN
  };
  out.reading = bridgeReading(out);
  return out;
}

function money(x) {
  return '$' + (Math.round(Math.abs(x) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Math.round(Math.abs(x) * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
}
const whole = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');

// One or two plain sentences, no judgment.
export function bridgeReading(br) {
  if (br.surplus === null) return 'Needs take-home and the month\'s actuals first.';
  const left = br.surplus >= 0 ? 'Your budget showed ' + whole(br.surplus) + ' left' : 'Your budget showed ' + whole(br.surplus) + ' over';
  if (br.actual === null) {
    const names = [...new Set(br.missing.map((m) => m.name + ' ' + m.which))];
    return left + '. The change in cash needs ' + names.join(', ') + ' balance' + (names.length === 1 ? '' : 's') + '.';
  }
  const moved = (Math.abs(br.actual - br.surplus) >= TIES_WITHIN ? 'but ' : 'and ') + (br.actual >= 0 ? 'cash went up ' + whole(br.actual) : 'cash went down ' + whole(br.actual));
  const top = br.steps.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  const why = top ? ' ' + topSentence(top) : '';
  const tail = br.ties ? '' : ' ' + whole(br.unexplained) + ' is not explained yet.';
  return left + ', ' + moved + '.' + why + tail;
}

function topSentence(s) {
  if (s.key === 'yearly' && s.paid && s.paid.length) return s.paid.map((p) => 'The ' + p.name.toLowerCase() + ' bill (' + whole(p.paid) + ')').join(' and ') + ' came due this month.';
  if (s.key === 'cards') return s.amount >= 0 ? 'Card balances went up ' + whole(s.amount) + '.' : 'Card balances went down ' + whole(s.amount) + '.';
  if (s.key === 'set-aside') return whole(s.amount) + ' was set aside and is still in your accounts.';
  if (s.key === 'income') return s.amount >= 0 ? whole(s.amount) + ' more income landed than the take-home.' : whole(s.amount) + ' less income landed than the take-home.';
  if (s.key === 'owed') return whole(s.amount) + ' is still owed back to you.';
  if (s.key === 'one-off') return 'One-off spending was ' + whole(s.amount) + '.';
  return s.label + ': ' + whole(s.amount) + '.';
}
