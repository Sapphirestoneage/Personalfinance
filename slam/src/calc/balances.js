// Account balances by month (S-084). A month's start that was not typed is
// last month's end, "carried from last month". Cash on hand = checking +
// savings + cash, each at its latest month end, or at the start of the month
// being worked on when it has no end yet. Cards are what is owed, kept apart.

import { CASH_ACCOUNT_TYPES } from '../store/schema.js';
import { sumKnown } from './money.js';
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
  const total = (list, k) => (list.length && list.every((r) => r[k].amount !== null) ? sumKnown(list.map((r) => r[k].amount)).total : null);
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
