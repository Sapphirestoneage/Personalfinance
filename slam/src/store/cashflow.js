// Cash flow edits (S-086): pay dates, which account an item uses, debt payment
// choice, moving or skipping a scheduled item, a balance checked on a day, the
// cushion, saved forecasts, and "It happened" (a scheduled entry in the log).
// No math: amounts and forecasts arrive worked out by the engines (the schedule
// and the forecast come from src/engines/calendar.js). Depends on newId (ids.js),
// makeDate (schema.js), addEntry (log.js), and findLine (edits.js).

import { newId } from './ids.js';
import { makeDate } from './schema.js';
import { addEntry } from './log.js';
import { findLine } from './edits.js';

export function setNextPayDate(doc, incomeId, date) {
  // A cleared date is null (not entered), carried with a status like a Value (makeDate).
  doc.income.find((i) => i.id === incomeId).nextPayDate = makeDate(date || null);
}

export function setPayDays(doc, incomeId, days) {
  doc.income.find((i) => i.id === incomeId).payDays = days.map(Number);
}

// kind: 'income', 'line', or 'debt'. accountId null = the first checking account.
export function setItemAccount(doc, kind, id, accountId) {
  const target = kind === 'income' ? doc.income.find((i) => i.id === id) : kind === 'line' ? findLine(doc, id).line : doc.debts.find((d) => d.id === id);
  if (kind === 'debt') target.payFrom = accountId || null;
  else target.accountId = accountId || null;
}

// What the scheduled card payment is: the minimum due, or the whole statement balance (paid off each month).
export function setDebtPayWith(doc, debtId, payWith) {
  if (!['minimum', 'statement'].includes(payWith)) throw new Error('Pay the minimum or the statement balance');
  doc.debts.find((d) => d.id === debtId).payWith = payWith;
}

// Didn't happen or moved: a new date, or null to skip it this month.
export function moveItem(doc, key, to, nowIso) {
  doc.cashflow.moves[key] = { to: to || null, at: nowIso };
}

export function clearMove(doc, key) {
  delete doc.cashflow.moves[key];
}

// A real balance read on a day. The calendar and balances engines use checks as observations between
// month ends; one-off because a reading is not a flow.
export function addBalanceCheck(doc, accountId, date, value) {
  const c = { id: newId('chk'), accountId, date, amount: { ...value, cadence: 'one-off' } };
  doc.cashflow.checks.push(c);
  return c;
}

// The month's predicted end cash, saved on the 1st so the review can hold it against the real end
// (calendar.js). Nothing is saved when there was no prediction: null is not entered, never 0.
export function saveForecast(doc, month, predicted, nowIso) {
  if (predicted === null || predicted === undefined) return;
  doc.cashflow.forecasts[month] = { predicted, at: nowIso };
}

// It happened: the planned amount (or what the coach changed it to) goes into the log.
export function confirmScheduled(doc, item, amount, date) {
  // The log's sign: positive is money out, so a paycheck is stored negative (addEntry in log.js).
  const out = item.dir === 'in' ? -Math.abs(amount) : Math.abs(amount);
  return addEntry(doc, {
    // A debt payment is logged as a card payment (money moved to the card, not spending). The calendar finds
    // this entry again by its scheduleKey below, not by kind; matching by kind is only for entries with no key.
    date: date || item.date, amount: out, kind: item.kind === 'paycheck' ? 'income' : item.kind === 'debt' ? 'card-payment' : 'spend',
    // No merchant: the bank's own description matches it on import by amount and date.
    lineId: item.lineId || null, incomeId: item.incomeId || null, note: item.name, account: item.account, scheduleKey: item.key
  }, 'scheduled');
}
