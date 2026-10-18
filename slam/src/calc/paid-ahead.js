// Paid ahead (S-119): a yearly or irregular bill paid for a period longer than the month is an asset
// that runs down as it is used, the way an auditor books a prepaid expense.
//
// Each payment in the log on such a line (Riley's 960 of car insurance on March 14) starts a schedule:
//   period N months: the entry's coverMonths, else 12 for a yearly line (a due month, or an estimate a year);
//   monthly share = the payment / N (to the cent; the last month takes what is left, so it ends at $0);
//   at the end of the month it was paid: payment - one share; each month after, one share less; $0 at the
//   end of the period (month N).
// Inside a month (any day but the last), the balance is the one at the end of the month before (and the
// whole payment in the month it was paid, from the day it was paid).
// It is a thing you own (tier 4) that does not count toward FI. Never typed: computed from the log.

import { counted } from './log.js';
import { isYearlyLine } from './model.js';
import { lastDayOf } from './balances.js';

const r2 = (x) => Math.round(x * 100) / 100 + 0;
const COUNTS = new Set(['spend', 'fee']);
const monthIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const monthOfIndex = (i) => Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0');

// The period a payment covers, in months, or null when it is only this month's.
function periodOf(line, entry) {
  if (Number.isInteger(entry.coverMonths) && entry.coverMonths > 1) return entry.coverMonths;
  if (isYearlyLine(line) || (line.estimate && line.estimate.cadence === 'year')) return 12;
  return null;
}

// Every schedule: one per payment. ends: the month-end balance for each month of the period.
export function paidAheadSchedules(doc) {
  const lines = (doc.categories || []).filter((c) => !c.savings && c.id !== 'debt').flatMap((c) => (c.lines || []).map((l) => ({ l, c })));
  const out = [];
  for (const t of counted(doc.transactions || [])) {
    if (!t.lineId || !COUNTS.has(t.kind) || t.oneOff || !(t.amount > 0)) continue;
    const hit = lines.find((x) => x.l.id === t.lineId);
    if (!hit) continue;
    const n = periodOf(hit.l, t);
    if (!n) continue;
    const share = r2(t.amount / n);
    const m0 = t.date.slice(0, 7);
    const ends = [];
    for (let k = 1; k <= n; k++) ends.push({ month: monthOfIndex(monthIndex(m0) + k - 1), amount: k === n ? 0 : r2(t.amount - share * k) });
    out.push({ id: t.id, lineId: hit.l.id, name: hit.l.name, paid: t.amount, date: t.date, months: n, share, from: m0, through: ends[n - 1].month, ends });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// One schedule's balance on a day.
export function scheduleAt(s, date) {
  if (date < s.date) return 0;
  const m = date.slice(0, 7);
  const i = monthIndex(m) - monthIndex(s.from);
  if (date === lastDayOf(m)) return i < s.months ? s.ends[i].amount : 0;
  if (i === 0) return s.paid;
  return i - 1 < s.months ? s.ends[i - 1].amount : 0;
}

// Paid ahead on a day, one row per line: [{ lineId, name, amount, schedules }].
export function paidAheadAt(doc, date) {
  const by = {};
  for (const s of paidAheadSchedules(doc)) {
    const a = scheduleAt(s, date);
    if (!a) continue;
    const row = by[s.lineId] = by[s.lineId] || { lineId: s.lineId, name: s.name, amount: 0, schedules: [] };
    row.amount = r2(row.amount + a);
    row.schedules.push({ ...s, left: a });
  }
  return Object.values(by);
}

export const paidAheadTotal = (doc, date) => r2(paidAheadAt(doc, date).reduce((a, x) => a + x.amount, 0));
