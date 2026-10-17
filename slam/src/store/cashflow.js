// Cash flow edits (S-086): pay dates, which account an item uses, debt payment
// choice, moving or skipping a scheduled item, a balance checked on a day, the
// cushion, saved forecasts, and "It happened" (a scheduled entry in the log).
// No math: amounts and forecasts arrive worked out by calc.

import { newId } from './ids.js';
import { makeDate } from './schema.js';
import { addEntry } from './log.js';
import { findLine } from './edits.js';

export function setNextPayDate(doc, incomeId, date) {
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

export function addBalanceCheck(doc, accountId, date, value) {
  const c = { id: newId('chk'), accountId, date, amount: { ...value, cadence: 'one-off' } };
  doc.cashflow.checks.push(c);
  return c;
}

export function removeBalanceCheck(doc, id) {
  doc.cashflow.checks = doc.cashflow.checks.filter((c) => c.id !== id);
}

export function saveForecast(doc, month, predicted, nowIso) {
  if (predicted === null || predicted === undefined) return;
  doc.cashflow.forecasts[month] = { predicted, at: nowIso };
}

// It happened: the planned amount (or what the coach changed it to) goes into the log.
export function confirmScheduled(doc, item, amount, date) {
  const out = item.dir === 'in' ? -Math.abs(amount) : Math.abs(amount);
  return addEntry(doc, {
    date: date || item.date, amount: out, kind: item.kind === 'paycheck' ? 'income' : item.kind === 'debt' ? 'card-payment' : 'spend',
    lineId: item.lineId || null, incomeId: item.incomeId || null, merchant: item.name, account: item.account, scheduleKey: item.key
  }, 'scheduled');
}
