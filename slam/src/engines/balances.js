// Account balances by month (S-084). A month's start that was not typed is
// last month's end, "carried from last month". Cash on hand = checking +
// savings + cash, each at its latest month end, or at the start of the month
// being worked on when it has no end yet. Cards are what is owed, kept apart.
// Numbers are dollars on a day (balances, not monthly flows). Depends on the account
// types in store/schema.js, sumKnown in money.js, and weakestStatus in model.js.

import { CASH_ACCOUNT_TYPES, typeInfo } from '../store/schema.js';
import { sumKnown, minus } from './money.js';
import { weakestStatus } from './model.js';

/**
 * The month before a month.
 * @param {string} key a month 'YYYY-MM'
 * @returns {string} the month before it, 'YYYY-MM'
 */
export function prevKey(key) {
  let [y, m] = key.split('-').map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

const typed = (v) => !!v && v.amount !== null && v.amount !== undefined;

/**
 * One account's start and end balance for a month.
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM'
 * @param {string} accountId
 * @returns {{start: object, end: object}} each { amount, status, from } in dollars; from is 'typed',
 *   'carried' (last month's end stands in for a start that was not typed), or null (missing)
 */
export function monthBalance(doc, month, accountId) {
  const b = ((doc.balances || {})[month] || {})[accountId] || null;
  const end = b && typed(b.end) ? { amount: b.end.amount, status: b.end.status, from: 'typed' } : { amount: null, status: null, from: null };
  if (b && typed(b.start)) return { start: { amount: b.start.amount, status: b.start.status, from: 'typed' }, end };
  const prev = ((doc.balances || {})[prevKey(month)] || {})[accountId];
  if (prev && typed(prev.end)) return { start: { amount: prev.end.amount, status: prev.end.status, from: 'carried' }, end };
  return { start: { amount: null, status: null, from: null }, end };
}

/** True for checking, savings, HYSA, and cash: the accounts the cash bridge counts (CASH_ACCOUNT_TYPES). */
export function isCashAccount(a) {
  return CASH_ACCOUNT_TYPES.includes(a.type);
}

/**
 * Every active account's balances for one month, cash and cards apart. Cash and cards are needed
 * at month-end (the cash bridge counts them); investments and things you own are optional, and
 * show when they were last updated instead (S-110).
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM'
 * @returns {object} { month, rows, cashStart, cashEnd, cardsStart, cardsEnd, required, missing, stale }:
 *   totals in dollars, null while any account in the group has no balance; missing and stale name the gaps
 */
export function balancesFor(doc, month) {
  const rows = (doc.accounts || []).filter((a) => a.state !== 'archived').map((a) => ({ id: a.id, name: a.name, type: a.type, cash: isCashAccount(a), card: a.type === 'credit-card',
    required: isCashAccount(a) || a.type === 'credit-card', ...monthBalance(doc, month, a.id) }));
  const cash = rows.filter((r) => r.cash);
  const cards = rows.filter((r) => r.card);
  // A total is only a total when every account in the list has the number: one missing balance makes
  // it null, not smaller. Rounded to the cent.
  const total = (list, k) => (list.length && list.every((r) => r[k].amount !== null) ? Math.round(sumKnown(list.map((r) => r[k].amount)).total * 100) / 100 : null);
  return {
    month, rows,
    cashStart: total(cash, 'start'), cashEnd: total(cash, 'end'),
    // No card accounts means nothing is owed, a real 0. No cash accounts gives null: there is nothing to add.
    cardsStart: cards.length ? total(cards, 'start') : 0, cardsEnd: cards.length ? total(cards, 'end') : 0,
    required: rows.filter((r) => r.required),
    missing: rows.filter((r) => r.required).flatMap((r) => [r.start.amount === null ? { id: r.id, name: r.name, which: 'start' } : null, r.end.amount === null ? { id: r.id, name: r.name, which: 'end' } : null]).filter(Boolean),
    // Optional ones with no end this month: when each was last updated (a date, or null for never).
    stale: rows.filter((r) => !r.required && r.end.amount === null).map((r) => ({ id: r.id, name: r.name, last: lastUpdated(doc, r.id, lastDayOf(month)) }))
  };
}

/**
 * The last day of a month (day 0 of the next month, in UTC so the local zone cannot shift it).
 * @param {string} month 'YYYY-MM'
 * @returns {string} 'YYYY-MM-DD'
 */
export function lastDayOf(month) {
  const [y, m] = month.split('-').map(Number);
  return month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
}

/**
 * What is owed (S-110): each card account (its balance is what is owed), and each debt with no card
 * account of its own. key = where its balances are kept: the card account's id, else the debt's id.
 * @param {object} doc the household file
 * @returns {Array<{key: string, name: string, debtType: string, debtId: ?string, account: ?object, debt: ?object}>}
 */
export function liabilities(doc) {
  const cards = (doc.accounts || []).filter((a) => a.state !== 'archived' && a.type === 'credit-card');
  const linked = new Set(cards.map((a) => a.debtId).filter(Boolean));
  return [
    ...cards.map((a) => ({ key: a.id, name: a.name, debtType: 'credit-card', debtId: a.debtId || null, account: a, debt: (doc.debts || []).find((d) => d.id === a.debtId) || null })),
    ...(doc.debts || []).filter((d) => d.state !== 'archived' && !linked.has(d.id)).map((d) => ({ key: d.id, name: d.label, debtType: d.type, debtId: d.id, account: null, debt: d }))
  ];
}

/**
 * Every dated balance of one account or debt (S-110): each month's start (its day, else the 1st), each
 * month's end (its day, else the last day), and every balance checked on a day. Oldest first.
 * @param {object} doc the household file
 * @param {string} key an account id, or a debt id for a debt with no card account
 * @returns {Array<{date: string, amount: number, status: string, from: string, order: number}>} dollars on
 *   that day; from is 'start', 'check', or 'end'
 */
export function observations(doc, key) {
  const out = [];
  for (const [m, accts] of Object.entries(doc.balances || {})) {
    const b = accts[key];
    if (!b) continue;
    if (typed(b.start)) out.push({ date: b.startOn || m + '-01', amount: b.start.amount, status: b.start.status, from: 'start', order: 0 });
    if (typed(b.end)) out.push({ date: b.endOn || lastDayOf(m), amount: b.end.amount, status: b.end.status, from: 'end', order: 2 });
  }
  for (const c of ((doc.cashflow || {}).checks || [])) if (c.accountId === key && typed(c.amount)) out.push({ date: c.date, amount: c.amount.amount, status: c.amount.status, from: 'check', order: 1 });
  // On the same day: start, then checks, then end (order 0, 1, 2), so the end is the latest reading.
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
}

/**
 * The balance on a day: the latest dated balance on or before it (S-110). A debt with no dated balance
 * uses the balance on the debt itself, as given on the debt (Accounts, Credit and debt). Null when there is none.
 * @param {object} doc the household file
 * @param {string} key an account id or a debt id
 * @param {string} date 'YYYY-MM-DD'
 * @returns {?{date: ?string, amount: number, status: string, from: string}} dollars; from 'debt' carries the
 *   debt's asOf day, or no day at all
 */
export function balanceAt(doc, key, date) {
  const obs = observations(doc, key).filter((o) => o.date <= date);
  if (obs.length) return obs[obs.length - 1];
  const debt = (doc.debts || []).find((d) => d.id === key);
  if (debt && typed(debt.balance)) return { date: debt.balance.asOf || null, amount: debt.balance.amount, status: debt.balance.status, from: 'debt' };
  return null;
}

/**
 * The day an account or debt was last given a balance, on or before a day.
 * @param {object} doc the household file
 * @param {string} key an account id or a debt id
 * @param {string} date 'YYYY-MM-DD'
 * @returns {?string} 'YYYY-MM-DD', or null for never (or a debt balance with no day)
 */
export function lastUpdated(doc, key, date) {
  const b = balanceAt(doc, key, date);
  return b ? b.date : null;
}

/** The kind of an account (cash, invested, valued, owed), from its type (S-110). */
export const kindOf = (a) => typeInfo(a).kind;

/**
 * Cash on hand for Next stage and Eras: one number, read from the balances.
 * @param {object} doc the household file
 * @returns {object} { amount, status, parts, missing, noAccounts }: amount in dollars, the sum of the cash
 *   accounts that have a balance (null when none do); status is the weakest of the parts
 */
export function cashOnHand(doc) {
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived' && isCashAccount(a));
  // Only months up to the one being worked on count, newest first: a balance typed for a month ahead is
  // not cash on hand yet. An account with no month end anywhere falls back to this month's start.
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

/**
 * A card debt's balance: the linked card account's latest end (or this month's start).
 * @param {object} doc the household file
 * @param {string} debtId
 * @returns {?{accountId: string, name: string, amount: ?number, month: string}} dollars owed; null when no
 *   live account is linked to the debt
 */
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

/**
 * Every credit card, both ways (S-102): each card account with the debt it pays down, what it owes,
 * the lines set to be paid on it, and what was logged on it this month; and the card debts that
 * have no account yet.
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM', the month being worked on
 * @returns {{rows: object[], noAccount: object[]}} rows carry owed (the card's end balance for the month,
 *   dollars) and loggedAmount (this month's charges on the card, dollars)
 */
export function cardMap(doc, month) {
  const cards = (doc.accounts || []).filter((a) => a.state !== 'archived' && a.type === 'credit-card');
  const lines = (doc.categories || []).flatMap((c) => c.state === 'archived' ? [] : c.lines.filter((l) => l.state !== 'archived'));
  // Charges logged on the card: spend entries only (an entry with no kind is a spend).
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
  ['bank', 'Bank and cash', ['checking', 'savings', 'hysa', 'cash']],
  ['card', 'Credit cards', ['credit-card']],
  ['invest', 'Investments', ['brokerage', 'crypto', 'other', 'unset']],
  ['retire', 'Retirement, HSA, and 529', ['401k', 'trad-ira', 'roth-ira', 'hsa', '529', 'cash-value-life']],
  ['own', 'Things you own', ['home', 'vehicle', 'other-asset']]
];


const prevDay = (date) => new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const typedValue = (v) => !!v && v.amount !== null && v.amount !== undefined;
/**
 * One account's or debt's balance going into the month: the start typed for the month (on any day it
 * was read), else the latest dated balance before the month. The same start the cash bridge uses.
 * @param {object} doc the household file
 * @param {string} key an account id or a debt id
 * @param {string} month 'YYYY-MM'
 * @returns {?{date: ?string, amount: number, status: string, from: string}} dollars; null when nothing is known
 */
export function monthStartOf(doc, key, month) {
  const b = ((doc.balances || {})[month] || {})[key];
  if (b && typedValue(b.start)) return { date: b.startOn || month + '-01', amount: b.start.amount, status: b.start.status, from: 'start' };
  return balanceAt(doc, key, prevDay(month + '-01'));
}

/**
 * The same at the end of the month: the end typed for the month, else the latest dated balance in it.
 * @param {object} doc the household file
 * @param {string} key an account id or a debt id
 * @param {string} month 'YYYY-MM'
 * @returns {?{date: ?string, amount: number, status: string, from: string}} dollars; null when nothing is known
 */
export function monthEndOf(doc, key, month) {
  const b = ((doc.balances || {})[month] || {})[key];
  if (b && typedValue(b.end)) return { date: b.endOn || lastDayOf(month), amount: b.end.amount, status: b.end.status, from: 'end' };
  return balanceAt(doc, key, lastDayOf(month));
}

// A balance is up to date when it was read in the last 30 days (S-136).
export const FRESH_DAYS = 30;
/**
 * The Accounts step (S-136): cash accounts (checking, savings, cash), each with its latest balance and how
 * old it is. The step is done when there is at least one cash account and every one is up to date; the
 * screen then folds it to one line.
 * @param {object} doc the household file
 * @param {string} today 'YYYY-MM-DD'
 * @returns {object} { cash, cashTotal, stale, done }: cashTotal in dollars adds the accounts that have a
 *   balance (null when none do); stale names the accounts whose balance is old or missing
 */
export function accountsStatus(doc, today) {
  const DAY = 86400000;
  const cash = (doc.accounts || []).filter((a) => a.state !== 'archived' && CASH_ACCOUNT_TYPES.includes(a.type)).map((a) => {
    const latest = balanceAt(doc, a.id, today);
    // Days since the latest reading; null when it has no day, so it can never count as fresh.
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

const REVOLVING = ['credit-card', 'line-of-credit'];
/**
 * Credit and debt (S-137): every card and loan, with what is owed now. A card or line of credit is credit
 * you have even when nothing is owed; with a limit: available = limit - owed, used = owed / limit.
 * Up to date = read in the last 30 days (a loan's own balance, with no day, is not). Done when every card
 * and loan is up to date (there may be none: "no debts" is an answer).
 * @param {object} doc the household file
 * @param {string} today 'YYYY-MM-DD'
 * @returns {object} { rows, owed, limit, available, used, stale, done }: dollars; used is a ratio 0 to 1 over
 *   the revolving accounts that have both a limit and a balance
 */
export function creditStatus(doc, today) {
  const DAY = 86400000;
  const rows = liabilities(doc).map((l) => {
    const latest = balanceAt(doc, l.key, today);
    const days = latest && latest.date ? Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(latest.date + 'T00:00:00Z')) / DAY) : null;
    const limit = l.debt && typed(l.debt.creditLimit) ? l.debt.creditLimit.amount : null;
    const owed = latest ? latest.amount : null;
    const revolving = REVOLVING.includes(l.debtType);
    return {
      key: l.key, name: l.name, debtType: l.debtType, debtId: l.debtId, revolving, latest, owed, days, fresh: days !== null && days <= FRESH_DAYS,
      // A limit of 0 (or none) gives no used share; a missing balance leaves available and used unknown.
      limit, available: limit === null || owed === null ? null : Math.round((limit - owed) * 100) / 100, used: limit && owed !== null ? owed / limit : null,
      history: observations(doc, l.key)
    };
  });
  const sum = (xs) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) * 100) / 100 : null);
  const cards = rows.filter((r) => r.revolving);
  const limits = cards.filter((r) => r.limit !== null && r.owed !== null);
  return {
    rows,
    owed: sum(rows.filter((r) => r.owed !== null).map((r) => r.owed)),
    limit: sum(limits.map((r) => r.limit)),
    available: sum(limits.map((r) => r.available)),
    used: limits.length ? sum(limits.map((r) => r.owed)) / sum(limits.map((r) => r.limit)) : null,
    stale: rows.filter((r) => !r.fresh).map((r) => r.name),
    done: rows.every((r) => r.fresh) && (rows.length > 0 || !!doc.noDebts)
  };
}
