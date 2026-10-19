// Account balances by month (S-084). A month's start that was not typed is
// last month's end, "carried from last month". Cash on hand = checking +
// savings + cash, each at its latest month end, or at the start of the month
// being worked on when it has no end yet. Cards are what is owed, kept apart.

import { CASH_ACCOUNT_TYPES, typeInfo } from '../store/schema.js';
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

// Every active account's balances for one month, cash and cards apart. Cash and cards are needed
// at month-end (the cash bridge counts them); investments and things you own are optional, and
// show when they were last updated instead (S-110).
export function balancesFor(doc, month) {
  const rows = (doc.accounts || []).filter((a) => a.state !== 'archived').map((a) => ({ id: a.id, name: a.name, type: a.type, cash: isCashAccount(a), card: a.type === 'credit-card',
    required: isCashAccount(a) || a.type === 'credit-card', ...monthBalance(doc, month, a.id) }));
  const cash = rows.filter((r) => r.cash);
  const cards = rows.filter((r) => r.card);
  const total = (list, k) => (list.length && list.every((r) => r[k].amount !== null) ? Math.round(sumKnown(list.map((r) => r[k].amount)).total * 100) / 100 : null);
  return {
    month, rows,
    cashStart: total(cash, 'start'), cashEnd: total(cash, 'end'),
    cardsStart: cards.length ? total(cards, 'start') : 0, cardsEnd: cards.length ? total(cards, 'end') : 0,
    required: rows.filter((r) => r.required),
    missing: rows.filter((r) => r.required).flatMap((r) => [r.start.amount === null ? { id: r.id, name: r.name, which: 'start' } : null, r.end.amount === null ? { id: r.id, name: r.name, which: 'end' } : null]).filter(Boolean),
    // Optional ones with no end this month: when each was last updated (a date, or null for never).
    stale: rows.filter((r) => !r.required && r.end.amount === null).map((r) => ({ id: r.id, name: r.name, last: lastUpdated(doc, r.id, lastDayOf(month)) }))
  };
}

export function lastDayOf(month) {
  const [y, m] = month.split('-').map(Number);
  return month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
}

// What is owed (S-110): each card account (its balance is what is owed), and each debt with no card
// account of its own. key = where its balances are kept: the card account's id, else the debt's id.
export function liabilities(doc) {
  const cards = (doc.accounts || []).filter((a) => a.state !== 'archived' && a.type === 'credit-card');
  const linked = new Set(cards.map((a) => a.debtId).filter(Boolean));
  return [
    ...cards.map((a) => ({ key: a.id, name: a.name, debtType: 'credit-card', debtId: a.debtId || null, account: a, debt: (doc.debts || []).find((d) => d.id === a.debtId) || null })),
    ...(doc.debts || []).filter((d) => d.state !== 'archived' && !linked.has(d.id)).map((d) => ({ key: d.id, name: d.label, debtType: d.type, debtId: d.id, account: null, debt: d }))
  ];
}

// Every dated balance of one account or debt (S-110): each month's start (its day, else the 1st), each
// month's end (its day, else the last day), and every balance checked on a day. Oldest first.
export function observations(doc, key) {
  const out = [];
  for (const [m, accts] of Object.entries(doc.balances || {})) {
    const b = accts[key];
    if (!b) continue;
    if (typed(b.start)) out.push({ date: b.startOn || m + '-01', amount: b.start.amount, status: b.start.status, from: 'start', order: 0 });
    if (typed(b.end)) out.push({ date: b.endOn || lastDayOf(m), amount: b.end.amount, status: b.end.status, from: 'end', order: 2 });
  }
  for (const c of ((doc.cashflow || {}).checks || [])) if (c.accountId === key && typed(c.amount)) out.push({ date: c.date, amount: c.amount.amount, status: c.amount.status, from: 'check', order: 1 });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
}

// The balance on a day: the latest dated balance on or before it (S-110). A debt with no dated balance
// uses the balance on the debt itself, as given in Setup, Debts. Null when there is none.
export function balanceAt(doc, key, date) {
  const obs = observations(doc, key).filter((o) => o.date <= date);
  if (obs.length) return obs[obs.length - 1];
  const debt = (doc.debts || []).find((d) => d.id === key);
  if (debt && typed(debt.balance)) return { date: debt.balance.asOf || null, amount: debt.balance.amount, status: debt.balance.status, from: 'debt' };
  return null;
}

// The day an account or debt was last given a balance, on or before a day (null for never).
export function lastUpdated(doc, key, date) {
  const b = balanceAt(doc, key, date);
  return b ? b.date : null;
}

// The kind of an account (cash, invested, valued, owed), from its type (S-110).
export const kindOf = (a) => typeInfo(a).kind;

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

// The account groups in Setup, Accounts (S-103, S-110). What you have and owe is the net worth (networth.js).
export const ACCOUNT_GROUPS = [
  ['bank', 'Bank and cash', ['checking', 'savings', 'cash']],
  ['card', 'Credit cards', ['credit-card']],
  ['invest', 'Investments', ['brokerage', 'crypto', 'other', 'unset']],
  ['retire', 'Retirement, HSA, and 529', ['401k', 'trad-ira', 'roth-ira', 'hsa', '529', 'cash-value-life']],
  ['own', 'Things you own', ['home', 'vehicle', 'other-asset']]
];


// One account's or debt's balance going into the month: the start typed for the month (on any day it
// was read), else the latest dated balance before the month. The same start the cash bridge uses.
const prevDay = (date) => new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const typedValue = (v) => !!v && v.amount !== null && v.amount !== undefined;
export function monthStartOf(doc, key, month) {
  const b = ((doc.balances || {})[month] || {})[key];
  if (b && typedValue(b.start)) return { date: b.startOn || month + '-01', amount: b.start.amount, status: b.start.status, from: 'start' };
  return balanceAt(doc, key, prevDay(month + '-01'));
}

// And at the end of the month: the end typed for the month, else the latest dated balance in it.
export function monthEndOf(doc, key, month) {
  const b = ((doc.balances || {})[month] || {})[key];
  if (b && typedValue(b.end)) return { date: b.endOn || lastDayOf(month), amount: b.end.amount, status: b.end.status, from: 'end' };
  return balanceAt(doc, key, lastDayOf(month));
}

// The Accounts step (S-136): cash accounts (checking, savings, cash), each with its latest balance and how
// old it is. A balance is up to date when it was read in the last 30 days. The step is done when there is
// at least one cash account and every one is up to date; the screen then folds it to one line.
export const FRESH_DAYS = 30;
export function accountsStatus(doc, today) {
  const DAY = 86400000;
  const cash = (doc.accounts || []).filter((a) => a.state !== 'archived' && CASH_ACCOUNT_TYPES.includes(a.type)).map((a) => {
    const latest = balanceAt(doc, a.id, today);
    const days = latest && latest.date ? Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(latest.date + 'T00:00:00Z')) / DAY) : null;
    return { id: a.id, name: a.name, type: a.type, institution: a.institution || '', latest, days, fresh: days !== null && days <= FRESH_DAYS, history: observations(doc, a.id) };
  });
  const known = cash.filter((x) => x.latest);
  return {
    cash,
    cashTotal: known.length ? Math.round(known.reduce((s, x) => s + x.latest.amount, 0) * 100) / 100 : null,
    stale: cash.filter((x) => !x.fresh).map((x) => x.name),
    done: cash.length > 0 && cash.every((x) => x.fresh)
  };
}
