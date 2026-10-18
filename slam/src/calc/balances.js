// Account balances by month (S-084). A month's start that was not typed is
// last month's end, "carried from last month". Cash on hand = checking +
// savings + cash, each at its latest month end, or at the start of the month
// being worked on when it has no end yet. Cards are what is owed, kept apart.

import { CASH_ACCOUNT_TYPES } from '../store/schema.js';
import { sumKnown, minus } from './money.js';
import { weakestStatus } from './model.js';

export function prevKey(key) {
  let [y, m] = key.split('-').map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

const typed = (v) => !!v && v.amount !== null && v.amount !== undefined;

// One account's start and end for a month: { amount, status, from }.
// from: 'typed', 'carried' (last month's end), or null (missing).
export function monthBalance(doc, month, accountId) {
  const b = ((doc.balances || {})[month] || {})[accountId] || null;
  const end = b && typed(b.end) ? { amount: b.end.amount, status: b.end.status, from: 'typed' } : { amount: null, status: null, from: null };
  if (b && typed(b.start)) return { start: { amount: b.start.amount, status: b.start.status, from: 'typed' }, end };
  const prev = ((doc.balances || {})[prevKey(month)] || {})[accountId];
  if (prev && typed(prev.end)) return { start: { amount: prev.end.amount, status: prev.end.status, from: 'carried' }, end };
  return { start: { amount: null, status: null, from: null }, end };
}

export function isCashAccount(a) {
  return CASH_ACCOUNT_TYPES.includes(a.type);
}

// Every active account's balances for one month, cash and cards apart.
export function balancesFor(doc, month) {
  const rows = (doc.accounts || []).filter((a) => a.state !== 'archived').map((a) => ({ id: a.id, name: a.name, type: a.type, cash: isCashAccount(a), card: a.type === 'credit-card', ...monthBalance(doc, month, a.id) }));
  const cash = rows.filter((r) => r.cash);
  const cards = rows.filter((r) => r.card);
  const total = (list, k) => (list.length && list.every((r) => r[k].amount !== null) ? Math.round(sumKnown(list.map((r) => r[k].amount)).total * 100) / 100 : null);
  return {
    month, rows,
    cashStart: total(cash, 'start'), cashEnd: total(cash, 'end'),
    cardsStart: cards.length ? total(cards, 'start') : 0, cardsEnd: cards.length ? total(cards, 'end') : 0,
    missing: rows.flatMap((r) => [r.start.amount === null ? { id: r.id, name: r.name, which: 'start' } : null, r.end.amount === null ? { id: r.id, name: r.name, which: 'end' } : null]).filter(Boolean)
  };
}

// Cash on hand for Next stage and Eras: one number, read from the balances.
export function cashOnHand(doc) {
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived' && isCashAccount(a));
  const months = Object.keys(doc.balances || {}).filter((k) => k <= doc.currentMonth).sort().reverse();
  const parts = accts.map((a) => {
    for (const m of months) {
      const v = (doc.balances[m][a.id] || {}).end;
      if (typed(v)) return { id: a.id, name: a.name, amount: v.amount, status: v.status, month: m, from: 'end' };
    }
    const s = monthBalance(doc, doc.currentMonth, a.id).start;
    return { id: a.id, name: a.name, amount: s.amount, status: s.status, month: doc.currentMonth, from: s.from ? 'start' : null };
  });
  const known = parts.filter((p) => p.amount !== null);
  return {
    amount: known.length ? sumKnown(known.map((p) => p.amount)).total : null,
    status: known.length ? weakestStatus(known.map((p) => p.status)) : null,
    parts,
    missing: parts.filter((p) => p.amount === null).map((p) => p.name),
    noAccounts: !accts.length
  };
}

// A card debt's balance: the linked card account's latest end (or this month's start).
export function linkedCardBalance(doc, debtId) {
  const a = (doc.accounts || []).find((x) => x.debtId === debtId && x.state !== 'archived');
  if (!a) return null;
  const months = Object.keys(doc.balances || {}).filter((k) => k <= doc.currentMonth).sort().reverse();
  for (const m of months) {
    const v = (doc.balances[m][a.id] || {}).end;
    if (typed(v)) return { accountId: a.id, name: a.name, amount: v.amount, month: m };
  }
  const s = monthBalance(doc, doc.currentMonth, a.id).start;
  return { accountId: a.id, name: a.name, amount: s.amount, month: doc.currentMonth };
}

// Every credit card, both ways (S-102): each card account with the debt it pays down, what it owes,
// the lines set to be paid on it, and what was logged on it this month; and the card debts that
// have no account yet. Month = the month being worked on.
export function cardMap(doc, month) {
  const cards = (doc.accounts || []).filter((a) => a.state !== 'archived' && a.type === 'credit-card');
  const lines = (doc.categories || []).flatMap((c) => c.state === 'archived' ? [] : c.lines.filter((l) => l.state !== 'archived'));
  const entries = (doc.transactions || []).filter((t) => !t.deleted && t.date.startsWith(month) && (t.kind || 'spend') === 'spend');
  const rows = cards.map((a) => {
    const debt = a.debtId ? (doc.debts || []).find((d) => d.id === a.debtId) || null : null;
    const logged = entries.filter((t) => t.account === a.id);
    return {
      id: a.id, name: a.name, institution: a.institution || '',
      debt: debt ? { id: debt.id, label: debt.label } : null,
      owed: monthBalance(doc, month, a.id).end.amount,
      paidOn: lines.filter((l) => l.accountId === a.id).map((l) => l.name),
      loggedCount: logged.length,
      loggedAmount: logged.length ? Math.round(sumKnown(logged.map((t) => t.amount)).total * 100) / 100 : 0
    };
  });
  const linked = new Set(cards.map((a) => a.debtId).filter(Boolean));
  const noAccount = (doc.debts || []).filter((d) => d.state !== 'archived' && d.type === 'credit-card' && !linked.has(d.id)).map((d) => ({ id: d.id, label: d.label }));
  return { rows, noAccount };
}

// The Accounts pass (S-103): every account in four groups, each with its latest balance (this month's
// end, else its start), and what you have against what you owe. A blank balance is listed as missing,
// never counted as 0. Cards are money owed; everything else is money you have.
export const ACCOUNT_GROUPS = [
  ['bank', 'Bank and cash', ['checking', 'savings', 'cash']],
  ['card', 'Credit cards', ['credit-card']],
  ['invest', 'Investments and retirement', ['investment', 'retirement', 'hsa']],
  ['other', 'Other', ['other']]
];
export function accountsOverview(doc, month) {
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived');
  const groups = ACCOUNT_GROUPS.map(([id, label, types]) => {
    const rows = accts.filter((a) => types.includes(a.type)).map((a) => {
      const b = monthBalance(doc, month, a.id);
      const latest = b.end.amount !== null ? { amount: b.end.amount, which: 'end' } : b.start.amount !== null ? { amount: b.start.amount, which: 'start' } : { amount: null, which: null };
      return { id: a.id, name: a.name, type: a.type, institution: a.institution || '', ...latest };
    });
    const known = rows.filter((r) => r.amount !== null);
    // A group with no accounts holds $0; a group with a blank balance has no total yet.
    const total = !rows.length ? 0 : known.length === rows.length ? Math.round(sumKnown(known.map((r) => r.amount)).total * 100) / 100 : null;
    return { id, label, rows, total, missing: rows.filter((r) => r.amount === null).map((r) => r.name) };
  });
  const by = Object.fromEntries(groups.map((g) => [g.id, g]));
  const parts = ['bank', 'invest', 'other'].map((k) => by[k].total);
  const have = parts.includes(null) ? null : Math.round(parts.reduce((x, y) => x + y, 0) * 100) / 100;
  const owe = by.card.total;
  return { month, groups, have, owe, net: minus(have, owe), missing: groups.flatMap((g) => g.missing), count: accts.length };
}
