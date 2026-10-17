// Part 3 of the monthly loop: the cash flow calendar (S-086). One small
// household worked out by hand, day by day.
//
// Today is Sat 2026-10-10. Accounts at the start of October: checking 1,000,
// savings 2,000, Visa (a card) 300 owed. The calendar's cash is checking only (S-094),
// so savings never moves the line.
// Pay: biweekly, 1,500 a paycheck, next pay date Oct 16, so paychecks land
// Oct 2, Oct 16, Oct 30 (and Nov 13, past the 30-day horizon of Nov 9).
// Bills: rent 1,200 due the 1st; phone 60 due the 18th; Visa minimum 35 due the 25th, from checking.
// Groceries 400 a month has no due day, so it is spread across the month.
// Logged: rent on Oct 1 (It happened), groceries 80 on Oct 4 (checking), groceries 40 on Oct 8 (Visa).
// Not logged: the Oct 2 paycheck, which is waiting and lands on today in the projection.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { addAccount, setBalance } from '../src/store/accounts.js';
import { addDebt, findLine } from '../src/store/edits.js';
import { addEntry } from '../src/store/log.js';
import { setNextPayDate, moveItem, confirmScheduled, addBalanceCheck, saveForecast } from '../src/store/cashflow.js';
import { incomeSummary } from '../src/calc/income.js';
import { cashCalendar, scheduledItems, forecastFor, forecastCheck, monthSoFar, calendarReading, safeReading, addDays } from '../src/calc/calendar.js';
import { loadRefs, near } from './helpers.js';

const refs = loadRefs();
const one = (a) => makeValue(a, { cadence: 'one-off' });
const TODAY = '2026-10-10';

function household() {
  const d = newHousehold('Calendar');
  d.currentMonth = '2026-10';
  d.income.push({ ...d.income[0], id: 'job', type: 'w2', label: 'Paycheck', payFrequency: 'biweekly', takeHome: makeValue(1500, { cadence: 'paycheck' }), gross: makeValue(), hourlyRate: makeValue(), deductions: [], withheld: {}, payBasis: 'salary', state: 'active' });
  const debt = addDebt(d, { label: 'Visa', type: 'credit-card' });
  debt.minimum = makeValue(35);
  debt.dueDay = one(25);
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  addAccount(d, { id: 'sav', name: 'Savings', type: 'savings' });
  addAccount(d, { id: 'visa', name: 'Visa', type: 'credit-card' });
  setBalance(d, '2026-10', 'chk', 'start', one(1000));
  setBalance(d, '2026-10', 'sav', 'start', one(2000));
  setBalance(d, '2026-10', 'visa', 'start', one(300));
  const doc = migrate(d);
  setNextPayDate(doc, 'job', '2026-10-16');
  findLine(doc, 'rent').line.estimate = makeValue(1200);
  findLine(doc, 'rent').line.dueDay = one(1);
  findLine(doc, 'subscriptions').line.estimate = makeValue(60);
  findLine(doc, 'subscriptions').line.dueDay = one(18);
  findLine(doc, 'groceries').line.estimate = makeValue(400);
  return doc;
}

function logged(doc) {
  const inc = incomeSummary(doc, refs.tax);
  const rent = scheduledItems(doc, '2026-10', inc).items.find((i) => i.lineId === 'rent');
  confirmScheduled(doc, rent, 1200);
  addEntry(doc, { date: '2026-10-04', amount: 80, lineId: 'groceries', account: 'chk' });
  addEntry(doc, { date: '2026-10-08', amount: 40, lineId: 'groceries', account: 'visa' });
  return inc;
}

const cashOn = (cal, date) => cal.days.find((x) => x.date === date).cash;
const money = (a, e, l) => assert.ok(near(a, e, 2), l + ': got ' + a + ', expected ' + e);

test('the scheduled items in October', () => {
  const doc = household();
  const inc = incomeSummary(doc, refs.tax);
  const items = scheduledItems(doc, '2026-10', inc).items.map((i) => [i.date, i.kind, i.name, i.amount, i.account]);
  // 1,500 a paycheck: 1,500 x 26 / 12 = 3,250 a month, back to 3,250 x 12 / 26 = 1,500
  assert.deepEqual(items, [
    ['2026-10-01', 'bill', 'Rent or mortgage', 1200, 'chk'],
    ['2026-10-02', 'paycheck', 'Paycheck', 1500, 'chk'],
    ['2026-10-16', 'paycheck', 'Paycheck', 1500, 'chk'],
    ['2026-10-18', 'bill', 'Bills and subscriptions', 60, 'chk'],
    ['2026-10-25', 'debt', 'Visa', 35, 'chk'],
    ['2026-10-30', 'paycheck', 'Paycheck', 1500, 'chk']
  ]);
  assert.deepEqual(validateHousehold(doc), []);
});

test('past days show the log, today takes the waiting paycheck, the future is scheduled and spread', () => {
  const doc = household();
  const inc = logged(doc);
  const cal = cashCalendar(doc, inc, { today: TODAY, horizon: 30 });
  // Range: Oct 1 (first month with balances) to Nov 9 (today + 30)
  assert.deepEqual([cal.start, cal.end, cal.days.length], ['2026-10-01', '2026-11-09', 40]);
  // Oct 1: checking 1,000 - 1,200 rent = -200
  money(cashOn(cal, '2026-10-01'), -200, 'Oct 1');
  // Oct 4: -80 groceries from checking: -280. Oct 8: groceries on the Visa, checking stays -280, the card goes 300 -> 340
  money(cashOn(cal, '2026-10-08'), -280, 'Oct 8');
  assert.equal(cal.days.find((x) => x.date === '2026-10-08').cards, 340);
  // Waiting: only the Oct 2 paycheck (rent was confirmed). It lands today: -280 + 1,500 = 1,220
  assert.deepEqual(cal.waiting.map((i) => [i.date, i.kind]), [['2026-10-02', 'paycheck']]);
  money(cal.todayCash, 1220, 'today');
  // Groceries: 400 planned, 80 + 40 = 120 logged, 280 left over Oct 11 to Oct 31 (21 days) = 13.333 a day
  const g = cal.spreads['2026-10'].units.find((u) => u.name === 'Groceries');
  assert.deepEqual([g.plan, g.logged, g.left], [400, 120, 280]);
  money(g.perDay, 13.333333, 'per day');
  // Oct 15: 1,220 - 5 x 13.333 = 1,153.33
  money(cashOn(cal, '2026-10-15'), 1153.33, 'Oct 15');
  // Oct 16: 1,220 - 6 x 13.333 (80) + 1,500 = 2,640
  money(cashOn(cal, '2026-10-16'), 2640, 'Oct 16');
  // Oct 25: 1,220 - 15 x 13.333 (200) + 1,500 - 60 - 35 = 2,425; the Visa owes 340 - 35 = 305
  money(cashOn(cal, '2026-10-25'), 2425, 'Oct 25');
  assert.equal(cal.days.find((x) => x.date === '2026-10-25').cards, 305);
  // Oct 31: all 280 spread: 1,220 - 280 + 1,500 - 60 - 35 + 1,500 = 3,845
  money(cashOn(cal, '2026-10-31'), 3845, 'Oct 31');
  // November: 400 over 30 days = 13.333 a day. Nov 1: 3,845 - 1,200 rent - 13.333 = 2,631.67; Nov 9: 3,845 - 1,200 - 9 x 13.333 (120) = 2,525
  money(cashOn(cal, '2026-11-01'), 2631.67, 'Nov 1');
  money(cashOn(cal, '2026-11-09'), 2525, 'Nov 9');
  // Lowest from today to the horizon (S-095): Oct 15, the day before payday. Safe to spend: 1,153.33 - 0 cushion,
  // under today's 1,220, so 1,153.33. Until payday the lowest is the same day, so no second number.
  assert.equal(cal.lowest.date, '2026-10-15');
  money(cal.lowest.amount, 1153.33, 'lowest');
  assert.equal(cal.nextPayday, '2026-10-16');
  money(cal.safeToSpend, 1153.33, 'safe to spend');
  assert.equal(cal.shortfall, null);
  assert.deepEqual([cal.belowZero, cal.belowCushion, cal.payLater.length], [0, 0, 0]);
  assert.equal(calendarReading(cal), 'Your lowest point is $1,153 on the 15th, the day before payday.');
});

test('the projected balance on any day is the start plus every item up to that day', () => {
  const doc = household();
  const cal = cashCalendar(doc, logged(doc), { today: TODAY, horizon: 60 });
  let cash = 1000; // checking on Oct 1
  for (const day of cal.days) {
    cash += day.items.filter((i) => i.cash && !i.mirror).reduce((a, i) => a + i.flow, 0);
    // each day is rounded to the cent for display, so allow a cent
    assert.ok(Math.abs(day.cash - cash) <= 0.011, day.date + ': ' + day.cash + ' vs ' + cash);
    assert.ok(cal.safeToSpend <= cal.todayCash);
  }
});

test('a cushion: days below it, a pay-later flag, and safe to spend below zero', () => {
  const doc = household();
  doc.cashflow.cushion = one(2450);
  const cal = cashCalendar(doc, logged(doc), { today: TODAY, horizon: 30 });
  // Below 2,450: Oct 10 to Oct 15 (6 days, 1,220 down to 1,153.33) and Oct 25 to Oct 29
  // (2,425, 2,411.67, 2,398.33, 2,385, 2,371.67): 11 days
  assert.equal(cal.belowCushion, 11);
  // The Visa payment on the 25th leaves 2,425, under the cushion; the next paycheck is Oct 30, 5 days later
  assert.deepEqual(cal.payLater.map((f) => [f.name, f.due, f.paidBy, f.gap]), [['Visa', '2026-10-25', '2026-10-30', 5]]);
  // 1,153.33 - 2,450 = -1,296.67, below 0: safe to spend is 0, and the shortfall is 1,296.67 on Oct 15
  assert.equal(cal.safeToSpend, 0);
  assert.deepEqual(cal.shortfall, { amount: 1296.67, date: '2026-10-15' });
  assert.equal(safeReading(cal), "Nothing safe to spend right now. You'll be $1,297 under your cushion on Oct 15.");
  assert.equal(calendarReading(cal), 'Your lowest point is $1,153 on the 15th, the day before payday. Visa lands 5 days before the paycheck that covers it.');
});

test('spending the safe-to-spend amount today never takes a projected day below the cushion', () => {
  for (const c of [0, 500, 1100]) {
    const doc = household();
    doc.cashflow.cushion = one(c);
    const inc = logged(doc);
    const cal = cashCalendar(doc, inc, { today: TODAY, horizon: 60 });
    // cushion 0: 1,153.33; 500: 653.33; 1,100: 53.33 (lowest 1,153.33 less the cushion)
    money(cal.safeToSpend, 1153.33 - c, 'cushion ' + c);
    addEntry(doc, { date: TODAY, amount: cal.safeToSpend, lineId: 'shopping', account: 'chk' });
    const after = cashCalendar(doc, inc, { today: TODAY, horizon: 60 });
    for (const day of after.days.filter((x) => x.date >= TODAY)) assert.ok(day.cash >= c - 0.01, c + ' ' + day.date + ': ' + day.cash);
  }
});

test('It happened, moved, skipped, and a real balance resets the projection', () => {
  const doc = household();
  const inc = logged(doc);
  const pay = scheduledItems(doc, '2026-10', inc).items.find((i) => i.date === '2026-10-02');
  confirmScheduled(doc, pay, 1500);
  let cal = cashCalendar(doc, inc, { today: TODAY, horizon: 30 });
  // Now in the log on Oct 2: 1,000 - 1,200 + 1,500 = 1,300 checking; nothing waiting; today still 1,220
  assert.equal(cal.waiting.length, 0);
  money(cashOn(cal, '2026-10-02'), 1300, 'Oct 2');
  money(cal.todayCash, 1220, 'today');
  assert.equal(doc.transactions.find((t) => t.scheduleKey === pay.key).source, 'scheduled');
  // Skip the phone this month: Oct 31 is 3,845 + 60 = 3,905
  const phone = cal.scheduled.find((i) => i.lineId === 'subscriptions' && i.planned === '2026-10-18');
  moveItem(doc, phone.key, null, '2026-10-10T12:00:00Z');
  cal = cashCalendar(doc, inc, { today: TODAY, horizon: 30 });
  money(cashOn(cal, '2026-10-31'), 3905, 'skipped phone');
  // Move it to Nov 2 instead: Oct 31 still 3,905; Nov 2 = 3,905 - 1,200 - 2 x 13.333 - 60 = 2,618.33
  moveItem(doc, phone.key, '2026-11-02', '2026-10-10T12:00:00Z');
  cal = cashCalendar(doc, inc, { today: TODAY, horizon: 30 });
  money(cashOn(cal, '2026-11-02'), 2618.33, 'moved phone');
  // A real checking balance of 1,000 on Oct 12 resets it: cash that day 1,000
  addBalanceCheck(doc, 'chk', '2026-10-12', one(1000));
  cal = cashCalendar(doc, inc, { today: TODAY, horizon: 30 });
  money(cashOn(cal, '2026-10-12'), 1000, 'checked');
  // Oct 13: 1,000 - 13.333 = 986.67
  money(cashOn(cal, '2026-10-13'), 986.67, 'after check');
  assert.deepEqual(validateHousehold(doc), []);
});

test('the forecast saved on the 1st against the real end', () => {
  const doc = household();
  const inc = incomeSummary(doc, refs.tax);
  // Checking 1,000 + 3 paychecks 4,500 - rent 1,200 - phone 60 - Visa 35 - groceries 400 = 3,805
  assert.equal(forecastFor(doc, inc, '2026-10'), 3805);
  saveForecast(doc, '2026-10', 3805, '2026-10-01T09:00:00Z');
  setBalance(doc, '2026-10', 'chk', 'end', one(3900));
  setBalance(doc, '2026-10', 'sav', 'end', one(2000));
  // checking ended 3,900: 95 better than predicted
  assert.deepEqual(forecastCheck(doc, '2026-10'), { month: '2026-10', predicted: 3805, actual: 3900, diff: 95 });
});

test('this month so far: plan vs logged per category', () => {
  const doc = household();
  logged(doc);
  const rows = Object.fromEntries(monthSoFar(doc, '2026-10', TODAY).map((r) => [r.id, [r.plan, r.logged, r.left]]));
  assert.deepEqual(rows, { housing: [1200, 1200, 0], food: [400, 120, 280], bills: [60, 0, 60] });
});

test('semimonthly pays on its two days; a version 6 file loads with blank dates', () => {
  const doc = household();
  doc.income[0].payFrequency = 'semimonthly';
  doc.income[0].payDays = [5, 20];
  const inc = incomeSummary(doc, refs.tax);
  const pays = scheduledItems(doc, '2026-02', inc).items.filter((i) => i.kind === 'paycheck').map((i) => [i.date, i.amount]);
  // 1,500 x 24 / 12 = 3,000 a month; back to 3,000 x 12 / 24 = 1,500
  assert.deepEqual(pays, [['2026-02-05', 1500], ['2026-02-20', 1500]]);
  const raw = JSON.parse(JSON.stringify(household()));
  raw.schemaVersion = 6;
  delete raw.cashflow;
  delete raw.income[0].nextPayDate;
  const d = migrate(raw);
  assert.deepEqual([d.income[0].nextPayDate.date, d.cashflow.cushion.amount, d.cashflow.checks.length], [null, null, 0]);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
