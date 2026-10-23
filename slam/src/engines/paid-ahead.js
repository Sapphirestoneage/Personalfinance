// Paid ahead (S-119): a yearly or irregular bill paid for a period longer than the month is an asset
// that runs down as it is used, the way an auditor books a prepaid expense. One schedule per payment,
// its balance on any day, and the total per line. Depends on log.js (counted entries), model.js
// (isYearlyLine), balances.js (lastDayOf) and money.js (r2). Dollars, to the cent; a month is 'YYYY-MM'
// and a day 'YYYY-MM-DD'.

import { counted } from './log.js';
import { isYearlyLine } from './model.js';
import { lastDayOf } from './balances.js';
import { r2 } from './money.js';

const COUNTS = new Set(['spend', 'fee']);
const monthIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const monthOfIndex = (i) => Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0');

// The period a payment covers, in months, or null when it is only this month's.
function periodOf(line, entry) {
  if (Number.isInteger(entry.coverMonths) && entry.coverMonths > 1) return entry.coverMonths;
  if (isYearlyLine(line) || (line.estimate && line.estimate.cadence === 'year')) return 12;
  return null;
}

// Each payment in the log on such a line (Riley's 960 of car insurance on March 14) starts a schedule:
//   period N months: the entry's coverMonths, else 12 for a yearly line (a due month, or an estimate a year);
//   monthly share = the payment / N (to the cent; the last month takes what is left, so it ends at $0);
//   at the end of the month it was paid: payment - one share; each month after, one share less; $0 at the
//   end of the period (month N).
// Inside a month (any day but the last), the balance is the one at the end of the month before (and the
// whole payment in the month it was paid, from the day it was paid).
// It is a thing you own (tier 4) that does not count toward FI. Computed from the log, except one
// opening amount per line (S-130).
//
// Opening Paid ahead (S-130): a yearly bill paid before the client's first month (Riley's car insurance,
// paid March 2025, with 5 months left in October 2025) is typed once on its line: the amount left and the
// months left, as of the first month. It runs down the same way:
//   share = amount left / months left; the end of the first month: amount - one share; $0 at the end of
//   the last month. On the last day before the first month it is the whole amount left, so the first
//   month's net worth bridge starts with it.
// The first month is the earliest month the file knows: a closed month, a month with balances, or the
// working month.
/**
 * Every schedule: one per payment in the log, plus one per opening amount, oldest first.
 * @param {object} doc the household file.
 * @returns {Array<object>} { id, lineId, name, paid, date, months, share, from, through, ends, opening?, status? }: paid and
 *   share in dollars; from and through 'YYYY-MM'; ends[k] is the balance at the end of each month of the period, the last
 *   one 0; an opening schedule is dated the day before the first month.
 */
export function paidAheadSchedules(doc) {
  // Only spending lines can be paid ahead: a savings transfer or a debt payment is not a prepaid expense.
  const lines = (doc.categories || [])
    .filter((c) => !c.savings && c.id !== 'debt')
    .flatMap((c) => (c.lines || []).map((l) => ({ l, c })));
  const out = [];
  for (const t of counted(doc.transactions || [])) {
    // Purchases and fees with money out only; a one-off entry is not a recurring bill, so it starts nothing.
    if (!t.lineId || !COUNTS.has(t.kind) || t.oneOff || !(t.amount > 0)) continue;
    const hit = lines.find((x) => x.l.id === t.lineId);
    if (!hit) continue;
    const n = periodOf(hit.l, t);
    if (!n) continue;
    const share = r2(t.amount / n);
    const m0 = t.date.slice(0, 7);
    const ends = [];
    for (let k = 1; k <= n; k++)
      ends.push({ month: monthOfIndex(monthIndex(m0) + k - 1), amount: k === n ? 0 : r2(t.amount - share * k) });
    out.push({
      id: t.id,
      lineId: hit.l.id,
      name: hit.l.name,
      paid: t.amount,
      date: t.date,
      months: n,
      share,
      from: m0,
      through: ends[n - 1].month,
      ends
    });
  }
  for (const { l } of lines) {
    const amount = typedAmount(l.openingAhead);
    const n = typedAmount(l.openingAheadMonths);
    if (amount === null || !(amount > 0) || !Number.isInteger(n) || n < 1) continue;
    const m0 = firstMonth(doc);
    const share = r2(amount / n);
    const ends = [];
    for (let k = 1; k <= n; k++)
      ends.push({ month: monthOfIndex(monthIndex(m0) + k - 1), amount: k === n ? 0 : r2(amount - share * k) });
    out.push({
      id: 'opening:' + l.id,
      lineId: l.id,
      name: l.name,
      paid: amount,
      date: prevDay(m0),
      months: n,
      share,
      from: m0,
      through: ends[n - 1].month,
      ends,
      opening: true,
      status: l.openingAhead.status
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

const typedAmount = (v) =>
  v && v.amount !== null && v.amount !== undefined && v.status !== 'not-for-me' ? v.amount : null;
const prevDay = (m) => lastDayOf(monthOfIndex(monthIndex(m) - 1));

/**
 * The client's first month: the earliest closed month, month with balances, or the working month.
 * @param {object} doc the household file.
 * @returns {string} 'YYYY-MM'.
 */
export function firstMonth(doc) {
  const all = [...(doc.months || []).map((m) => m.key), ...Object.keys(doc.balances || {}), doc.currentMonth]
    .filter(Boolean)
    .sort();
  return all[0];
}

/**
 * One schedule's balance on a day.
 * @param {object} s a schedule from paidAheadSchedules.
 * @param {string} date 'YYYY-MM-DD'.
 * @returns {number} dollars; 0 before the payment and once the period is over.
 */
export function scheduleAt(s, date) {
  if (date < s.date) return 0;
  // An opening amount is all there on the day before the first month.
  if (s.opening && date < s.from + '-01') return s.paid;
  const m = date.slice(0, 7);
  const i = monthIndex(m) - monthIndex(s.from);
  // A month's last day takes that month's end; any earlier day still shows the end of the month before.
  if (date === lastDayOf(m)) return i < s.months ? s.ends[i].amount : 0;
  if (i === 0) return s.paid;
  return i - 1 < s.months ? s.ends[i - 1].amount : 0;
}

/**
 * Paid ahead on a day, one row per line.
 * @param {object} doc the household file.
 * @param {string} date 'YYYY-MM-DD'.
 * @returns {Array<{lineId: string, name: string, amount: number, schedules: object[]}>} dollars, to the cent; each schedule
 *   carries left, its own balance that day; a line with nothing left is left out.
 */
export function paidAheadAt(doc, date) {
  const by = {};
  for (const s of paidAheadSchedules(doc)) {
    const a = scheduleAt(s, date);
    if (!a) continue;
    const row = (by[s.lineId] = by[s.lineId] || { lineId: s.lineId, name: s.name, amount: 0, schedules: [] });
    row.amount = r2(row.amount + a);
    row.schedules.push({ ...s, left: a });
  }
  return Object.values(by);
}

/**
 * Everything paid ahead on a day (the net worth asset, tier 4).
 * @param {object} doc the household file.
 * @param {string} date 'YYYY-MM-DD'.
 * @returns {number} dollars, to the cent; 0 when nothing is paid ahead.
 */
export const paidAheadTotal = (doc, date) => r2(paidAheadAt(doc, date).reduce((a, x) => a + x.amount, 0));
