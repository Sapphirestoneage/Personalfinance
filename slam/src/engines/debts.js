// Debts and the budget (S-116): the line that pays a loan, a debt's minimum, the split of a payment
// into interest and principal, each card's computed interest for a month, and promo APR end dates.
// Depends on normalize.js (toMonthly), balances.js (the balance going into a month, the last day of
// a month, the balance on a day) and money.js (r2Exact, to the cent). Dollars a month; an APR is a
// percent number a year like 24.99; a month is 'YYYY-MM' and a day 'YYYY-MM-DD'.

import { toMonthly } from './normalize.js';
import { monthStartOf, lastDayOf, balanceAt } from './balances.js';
import { r2Exact as r2 } from './money.js';

const typed = (v) => !!v && v.amount !== null && v.amount !== undefined;

// A loan paid by a budget line: a debt can point to the line that pays it (Riley's Car payment line
// pays the auto loan). The payment lives in one place, the line: its actual (from the log) is the
// payment, and its estimate is the debt's minimum, never typed a second time. The debt splits the
// payment into interest (spent) and principal (pays down the balance) from its APR and the balance
// going into the month:
//   interest = balance at the start of the month x APR / 12, to the cent, half up on the decimal
//   value (87.465 is 87.47 even when floating point holds 87.46499...)
//   principal = payment - interest
// A linked debt has no row of its own in Debt payments (the line is the payment).

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

/**
 * The line that pays a debt, or null.
 * @param {object} doc the household document.
 * @param {object} debt a debt record, with lineId when linked.
 * @returns {object|null} the live budget line; null when none is linked or the line is archived.
 */
export function linkedLine(doc, debt) {
  if (!debt || !debt.lineId) return null;
  const hit = allLines(doc).find((x) => x.line.id === debt.lineId && x.line.state !== 'archived');
  return hit ? hit.line : null;
}

/**
 * Lines a debt could be paid by: spending lines of a matching type first, then any other spending line.
 * @param {object} doc the household document.
 * @param {object} debt a debt record; its type picks the matching line types (PAYS_DEBT).
 * @returns {Array<{id: string, name: string, category: string, matches: boolean}>} savings lines and the Debt
 *   payments category are never offered.
 */
export function linkCandidates(doc, debt) {
  const types = PAYS_DEBT[debt.type] || [];
  const spend = allLines(doc).filter((x) => !x.cat.savings && x.cat.id !== 'debt' && x.line.state !== 'archived');
  const lineType = (l) => l.type || null;
  return [...spend.filter((x) => types.includes(lineType(x.line))), ...spend.filter((x) => !types.includes(lineType(x.line)))].map((x) => ({ id: x.line.id, name: x.line.name, category: x.cat.name, matches: types.includes(lineType(x.line)) }));
}

/**
 * The debt's minimum as a Value: the linked line's estimate, else its own.
 * @param {object} doc the household document.
 * @param {object} debt a debt record.
 * @returns {object} a Value ({amount, cadence, status}), not yet normalized to a month.
 */
export function minimumOf(doc, debt) {
  const line = linkedLine(doc, debt);
  return line ? line.estimate : debt.minimum;
}

/**
 * The debt's minimum in dollars a month.
 * @param {object} doc the household document.
 * @param {object} debt a debt record.
 * @returns {number|null} dollars a month; 0 for "doesn't apply", null when not entered. A minimum typed per paycheck
 *   counts 12 a year here.
 */
export const minimumAmount = (doc, debt) => toMonthly(minimumOf(doc, debt), 'monthly');

/**
 * Interest and principal in a payment for one month.
 * @param {object} doc the household document.
 * @param {object} debt a debt record; its apr is a Value holding a percent number a year.
 * @param {string} month 'YYYY-MM'.
 * @param {number|null} payment dollars paid in the month (the linked line's actual), null when none is logged.
 * @returns {{balance: number|null, apr: number|null, payment: number|null, interest: number|null, principal:
 *   number|null}} dollars; interest is null without a start balance or APR, principal null without a payment or
 *   interest.
 */
export function splitPayment(doc, debt, month, payment) {
  const start = monthStartOf(doc, debt.id, month);
  const apr = typed(debt.apr) ? debt.apr.amount : null;
  // The APR is a percent a year: / 100 for the rate, / 12 for one month's share.
  const interest = start === null || start === undefined || apr === null ? null : r2((start.amount * apr) / 100 / 12);
  return { balance: start ? start.amount : null, apr, payment, interest, principal: payment === null || interest === null ? null : r2(payment - interest) };
}

/**
 * The APR that applies in a month: the promo APR until its end date, else the card's.
 * @param {object} debt a debt record; apr and promoApr are Values holding percent numbers, promoEnds a day
 *   'YYYY-MM-DD'.
 * @param {string} month 'YYYY-MM'.
 * @returns {{apr: number|null, promo: boolean}} a percent number a year like 24.99.
 */
export function aprFor(debt, month) {
  // The promo covers a month only when the month's last day is on or before its end date. A promo that ends
  // on a month's last day still covers that month (ending May 31: May is promo, June is not); one that ends
  // mid-month leaves that whole month at the card's own APR.
  if (debt.promoEnds && typed(debt.promoApr) && lastDayOf(month) <= debt.promoEnds) return { apr: debt.promoApr.amount, promo: true };
  return { apr: typed(debt.apr) ? debt.apr.amount : null, promo: false };
}

// The card's balance key: its card account if it has one, else the debt itself.
const cardKey = (doc, debt) => {
  const acct = (doc.accounts || []).find((a) => a.debtId === debt.id && a.state !== 'archived');
  return acct ? acct.id : debt.id;
};
const tracked = (doc, key) => Object.keys(doc.balances || {}).some((m) => (doc.balances[m] || {})[key]);

// Card interest: each credit card gets a computed line under Debt payments, "Interest (computed)",
// never typed, as soon as its details are in (S-133):
//   interest = the balance going into the month x APR / 12
//   the balance going in: the last month's end when the card has month balances, else its own balance
//   0 when the card is paid in full each month (the statement balance, so no interest is charged),
//   and the promo APR (often 0%) until the promo's end date.
// Missing APR or balance: the line is blank (empty is not zero).
/**
 * One card's interest for a month.
 * @param {object} doc the household document.
 * @param {object} debt a debt record; anything that is not a live credit card gives null.
 * @param {string} month 'YYYY-MM'.
 * @returns {{amount: number|null, why: string, apr: number|null, promo: boolean, balance: number|null}|null} amount
 *   in dollars for the month (null = a detail is missing, why says which), apr a percent number, balance the dollars
 *   going into the month.
 */
export function cardInterest(doc, debt, month) {
  if (debt.type !== 'credit-card' || debt.state === 'archived') return null;
  const key = cardKey(doc, debt);
  const { apr, promo } = aprFor(debt, month);
  if (debt.payWith === 'statement') return { amount: 0, why: 'Paid in full each month: no interest', apr, promo, balance: null };
  // No month balances yet: the card's own balance stands in for the one going into the month.
  const start = tracked(doc, key) ? monthStartOf(doc, key, month) : typed(debt.balance) ? { amount: debt.balance.amount } : null;
  if (apr === null || !start) return { amount: null, why: apr === null ? 'Needs the APR' : 'Needs the balance going into the month', apr, promo, balance: start ? start.amount : null };
  const amount = r2((start.amount * apr) / 100 / 12);
  return { amount, why: (promo ? 'Promo ' + apr + '% until ' + debt.promoEnds : apr + '% a year') + ' on ' + start.amount, apr, promo, balance: start.amount };
}

// Typed interest hands off to computed (S-120, S-133). A typed interest line (Luis's "Interest charged")
// counts only while no card's interest can be computed. As soon as any card has its APR and a balance,
// the computed lines count and the typed line is replaced (shown as "replaced by computed interest").
// Never both in one month. A card still missing a detail shows a blank line (empty is not zero), unless
// a typed interest line is what counts (no card can compute yet).
/**
 * Which interest counts this month: the cards' computed lines or the typed line.
 * @param {object} doc the household document.
 * @param {string} month 'YYYY-MM'.
 * @returns {{rows: Array<{d: object, i: object|null}>, computed: boolean, show: boolean}} one row per live card with
 *   its cardInterest; computed = at least one card has a number; show = the computed rows go in the budget (any card
 *   computes, or there is no typed line to fall back on).
 */
export function interestHandoff(doc, month) {
  const cards = (doc.debts || []).filter((d) => d.type === 'credit-card' && d.state !== 'archived');
  const rows = cards.map((d) => ({ d, i: cardInterest(doc, d, month) }));
  const computed = rows.some((x) => x.i && x.i.amount !== null);
  const typedLine = allLines(doc).some((x) => x.line.type === 'interest' && x.line.state !== 'archived');
  return { rows, computed, show: computed || !typedLine };
}

/**
 * Months from a working month to the month a promo ends (S-125): October 2026 to May 31, 2027 is
 * (2027 - 2026) x 12 + (5 - 10) = 7. Below 0 once it has ended; null with no end date.
 * @param {object} debt a debt record; promoEnds is a day 'YYYY-MM-DD'.
 * @param {string} month 'YYYY-MM'.
 * @returns {number|null} whole months; the day of the month is ignored.
 */
export function promoMonthsLeft(debt, month) {
  if (!debt.promoEnds || !month) return null;
  const [y1, m1] = month.split('-').map(Number);
  const [y2, m2] = debt.promoEnds.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/**
 * The first month at the card's own APR after a promo (S-127): the month whose last day is past the
 * promo's end, when the month before was still at the promo rate. Dana's 0% ends May 31, 2026, so
 * June 2026 is that month.
 * @param {object} doc the household document.
 * @param {string} month 'YYYY-MM'.
 * @returns {Array<{debt: object, promoApr: number, interest: object|null}>} each such card with its promo APR (a
 *   percent number) and its computed interest for the month (cardInterest).
 */
export function promoEnded(doc, month) {
  const [y, m] = month.split('-').map(Number);
  const prev = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
  return (doc.debts || []).filter((d) => d.type === 'credit-card' && d.state !== 'archived' && d.promoEnds && !aprFor(d, month).promo && aprFor(d, prev).promo)
    .map((d) => ({ debt: d, promoApr: d.promoApr.amount, interest: cardInterest(doc, d, month) }));
}

/**
 * Promos ending within 60 days of a day (S-127), for the Next card: the end date and what is still on
 * the card (its latest balance on that day). Dana on April 1, 2026: May 31 is 60 days away, and the
 * Visa's latest balance is March's end, 13,360.
 * @param {object} doc the household document.
 * @param {string} today a day 'YYYY-MM-DD'.
 * @returns {Array<{debt: object, ends: string, days: number, balance: number|null}>} days until the end date (0 to
 *   60), balance in dollars.
 */
export function promoWarnings(doc, today) {
  const DAY = 86400000;
  return (doc.debts || []).filter((d) => d.type === 'credit-card' && d.state !== 'archived' && d.promoEnds && typed(d.promoApr)).map((d) => {
    // Both days at UTC midnight, so a daylight saving change cannot leave a day count at 0.96 days.
    const days = Math.round((Date.parse(d.promoEnds + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / DAY);
    const b = balanceAt(doc, cardKey(doc, d), today);
    return { debt: d, ends: d.promoEnds, days, balance: b ? b.amount : null };
  }).filter((x) => x.days >= 0 && x.days <= 60);
}

/**
 * The month's card interest added up, for the chart's "Together $X a month" line.
 * @param {Array<{amount: number|null}>} rows cardInterest results; a blank card (amount null) is skipped.
 * @returns {number} dollars for the month.
 */
export function cardInterestTotal(rows) {
  return rows.reduce((a, r) => (r.amount === null ? a : a + r.amount), 0);
}
