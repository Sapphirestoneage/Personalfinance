// Debts and the budget (S-116).
//
// A loan paid by a budget line: a debt can point to the line that pays it (Riley's Car payment line
// pays the auto loan). The payment lives in one place, the line: its actual (from the log) is the
// payment, and its estimate is the debt's minimum, never typed a second time. The debt splits the
// payment into interest (spent) and principal (pays down the balance) from its APR and the balance
// going into the month:
//   interest = balance at the start of the month x APR / 12 (to the cent)
//   principal = payment - interest
// A linked debt has no row of its own in Debt payments (the line is the payment).
//
// Card interest: each credit card whose balance is kept by month (dated balances) gets a computed
// line under Debt payments, "Interest (computed)", never typed:
//   interest = the balance going into the month (the last statement) x APR / 12
//   0 when the card is paid in full each month (the statement balance, so no interest is charged),
//   and the promo APR (often 0%) until the promo's end date.
// A card with only a one-time balance (no month balances) has no line: there is no statement to use.
// Missing APR or balance: the line is blank (empty is not zero).

import { toMonthly } from './normalize.js';
import { monthStartOf, lastDayOf } from './balances.js';

const r2 = (x) => Math.round(x * 100) / 100 + 0;
const typed = (v) => !!v && v.amount !== null && v.amount !== undefined;

// The budget line types that can pay each kind of debt.
export const PAYS_DEBT = {
  'car-loan': ['car-payment'],
  mortgage: ['rent'],
  'student-loan': ['loan', 'education'],
  'personal-loan': ['loan'],
  'line-of-credit': ['loan'],
  other: ['loan']
};

const allLines = (doc) => (doc.categories || []).flatMap((c) => (c.lines || []).map((l) => ({ line: l, cat: c })));

// The line that pays a debt, or null.
export function linkedLine(doc, debt) {
  if (!debt || !debt.lineId) return null;
  const hit = allLines(doc).find((x) => x.line.id === debt.lineId && x.line.state !== 'archived');
  return hit ? hit.line : null;
}

// Lines a debt could be paid by: spending lines of a matching type first, then any other spending line.
export function linkCandidates(doc, debt) {
  const types = PAYS_DEBT[debt.type] || [];
  const spend = allLines(doc).filter((x) => !x.cat.savings && x.cat.id !== 'debt' && x.line.state !== 'archived');
  const lineType = (l) => l.type || null;
  return [...spend.filter((x) => types.includes(lineType(x.line))), ...spend.filter((x) => !types.includes(lineType(x.line)))].map((x) => ({ id: x.line.id, name: x.line.name, category: x.cat.name, matches: types.includes(lineType(x.line)) }));
}

// The debt's minimum as a Value: the linked line's estimate, else its own.
export function minimumOf(doc, debt) {
  const line = linkedLine(doc, debt);
  return line ? line.estimate : debt.minimum;
}

// Its monthly amount (or null).
export const minimumAmount = (doc, debt) => toMonthly(minimumOf(doc, debt), 'monthly');

// Interest and principal in a payment for one month.
export function splitPayment(doc, debt, month, payment) {
  const start = monthStartOf(doc, debt.id, month);
  const apr = typed(debt.apr) ? debt.apr.amount : null;
  const interest = start === null || start === undefined || apr === null ? null : r2((start.amount * apr) / 100 / 12);
  return { balance: start ? start.amount : null, apr, payment, interest, principal: payment === null || interest === null ? null : r2(payment - interest) };
}

// The APR that applies in a month: the promo APR until its end date, else the card's.
export function aprFor(debt, month) {
  if (debt.promoEnds && typed(debt.promoApr) && lastDayOf(month) <= debt.promoEnds) return { apr: debt.promoApr.amount, promo: true };
  return { apr: typed(debt.apr) ? debt.apr.amount : null, promo: false };
}

// The card's balance key: its card account if it has one, else the debt itself.
const cardKey = (doc, debt) => {
  const acct = (doc.accounts || []).find((a) => a.debtId === debt.id && a.state !== 'archived');
  return acct ? acct.id : debt.id;
};
const tracked = (doc, key) => Object.keys(doc.balances || {}).some((m) => (doc.balances[m] || {})[key]);

// One card's interest for a month, or null when the card has no month balances (no line at all).
export function cardInterest(doc, debt, month) {
  if (debt.type !== 'credit-card' || debt.state === 'archived') return null;
  const key = cardKey(doc, debt);
  if (!tracked(doc, key)) return null;
  const { apr, promo } = aprFor(debt, month);
  if (debt.payWith === 'statement') return { amount: 0, why: 'Paid in full each month: no interest', apr, promo, balance: null };
  const start = monthStartOf(doc, key, month);
  if (apr === null || !start) return { amount: null, why: apr === null ? 'Needs the APR' : 'Needs the balance going into the month', apr, promo, balance: start ? start.amount : null };
  const amount = r2((start.amount * apr) / 100 / 12);
  return { amount, why: (promo ? 'Promo ' + apr + '% until ' + debt.promoEnds : apr + '% a year') + ' on ' + start.amount, apr, promo, balance: start.amount };
}
