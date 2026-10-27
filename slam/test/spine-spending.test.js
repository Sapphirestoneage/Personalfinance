// Spending and keeping it true (S-206): the log, per-tag budgets and pace,
// safe to spend, can I spend this, the cut simulator, the donut, the bill
// autopsy, price increases and trials, check-ins (drift, momentum, staleness),
// the sweep. Empty is not zero; the log is a record, never a formula.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { logSpend, removeLog, checkIn, setSweep, putFact } from '../engine/edits.js';
import { cleanMerchant, monthLog, tagBudgets, safeToSpend, canISpend, cutSimulator, donut, billAutopsy, priceChanges, freeTrials, checkInForecast, drift, staleness, momentum, sweepReading, spendingView } from '../engine/spending.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const T = '2026-10-22';
const S = (s) => summarize(s, R, { flags: false });

test('merchant cleanup: "SQ *BLUE BOTTLE 4471" reads as Blue Bottle', () => {
  assert.equal(cleanMerchant('SQ *BLUE BOTTLE 4471'), 'Blue Bottle');
  assert.equal(cleanMerchant('WHOLE FOODS MARKET #123'), 'Whole Foods Market');
  assert.equal(cleanMerchant('TST* The Corner Cafe - NYC'), 'The Corner Cafe');
  assert.equal(cleanMerchant('   '), null);
  assert.equal(cleanMerchant(null), null);
});

test('the log: typed entries validate, group by month, and a refund comes off', () => {
  let s = demo();
  let r = logSpend(s, { amount: 42.5, date: '2026-10-20', tag: 'food', merchant: 'SQ *BLUE BOTTLE 4471', paidWith: 'visa' });
  s = r.spine;
  assert.equal(r.id, 'l1');
  r = logSpend(s, { amount: 12, date: '2026-10-21', kind: 'refund', tag: 'food' }); s = r.spine;
  r = logSpend(s, { amount: 80, date: '2026-09-30', tag: 'other' }); s = r.spine;
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors));
  assert.deepEqual(monthLog(s, '2026-10').map((x) => x.id), ['l2', 'l1'], 'newest first');
  assert.equal(monthLog(s, '2026-09').length, 1);
  assert.throws(() => logSpend(s, { amount: -1, date: T }), /zero or more/);
  assert.throws(() => logSpend(s, { amount: 1, date: 'yesterday' }), /YYYY-MM-DD/);
  s = removeLog(s, 'l3');
  assert.equal(monthLog(s, '2026-09').length, 0);
  // A bad tag does not validate.
  const bad = { ...s, log: [{ id: 'x', date: T, amount: 1, kind: 'spend', tag: 'fun' }] };
  assert.equal(validate(bad).ok, false);
});

test('per-tag budgets: the plan from the spine, spent from the log, the pace, running hot past the margin', () => {
  let s = demo();
  const cf0 = S(s).cashflow;
  const t0 = tagBudgets(s, R, cf0, { ym: '2026-10', asOf: T });
  assert.equal(t0.day, 22);
  assert.equal(t0.daysInMonth, 31);
  const food = t0.rows.find((r) => r.tag === 'food');
  assert.equal(food.budget, 700, 'groceries 500 plus eating out 200');
  assert.equal(food.spent, 0);
  assert.equal(food.left, 700);
  assert.equal(food.hot, false);
  assert.equal(t0.kind, 'rough', 'groceries and dining are rough guesses');
  // Spend 600 on food by the 22nd: expected by now is 700 x 22/31 = 496.77; 600 is past 1.1 x that: running hot.
  s = logSpend(s, { amount: 600, date: '2026-10-20', tag: 'food' }).spine;
  s = logSpend(s, { amount: 100, date: '2026-09-10', tag: 'food' }).spine;
  const t1 = tagBudgets(s, R, S(s).cashflow, { ym: '2026-10', asOf: T });
  const f1 = t1.rows.find((r) => r.tag === 'food');
  assert.equal(f1.spent, 600);
  assert.equal(f1.expected, 496.77);
  assert.equal(f1.hot, true);
  assert.equal(f1.over, false);
  assert.equal(f1.pace, 845.45, 'at this pace the month runs to 600 / (22/31)');
  assert.equal(f1.lastMonthSameDay, 100);
  assert.equal(f1.left, 100);
  // A missing expense amount makes the tag's budget a missing row, not a smaller number.
  const gone = putFact(s, 'expenses.groceries.amount', null, 'missing', T);
  const t2 = tagBudgets(gone, R, S(gone).cashflow, { ym: '2026-10', asOf: T });
  assert.equal(t2.rows.find((r) => r.tag === 'food').budget, null);
  assert.equal(t2.kind, 'missing');
});

test('safe to spend: cash outside the cushion less what is committed before the next paycheck less the floor, and per day', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 1 });
  const x = safeToSpend(sim);
  assert.ok(x.today !== null);
  assert.equal(x.nextIncome, '2026-11-01');
  assert.equal(x.daysUntil, 10);
  assert.equal(x.perDay, Math.round(x.today / 10 * 100) / 100);
  assert.equal(x.excludesCushion, true);
  assert.ok(x.byDay.length > 0 && x.byDay[0].date === T);
});

test('can I spend this: yes, tight or no; hours of life need the hours a week; the purchase on a revolving card carries interest', () => {
  let s = demo();
  const sim = cashsim(s, R, { months: 1 });
  const a = canISpend(s, R, sim, { amount: 50 });
  assert.ok(['yes', 'tight', 'no'].includes(a.verdict));
  assert.equal(a.hours, null);
  assert.ok(a.missing.includes('household.workHoursPerWeek'));
  assert.equal(a.interest, 0, 'cash carries no interest');
  s = putFact(s, 'household.workHoursPerWeek', 40, 'known', T);
  const sim2 = cashsim(s, R, { months: 1 });
  const b = canISpend(s, R, sim2, { amount: 50, paidWith: 'visa' });
  assert.ok(b.hours > 0 && b.hourlyWage > 0, 'hours of life at take-home per hour: ' + b.hours);
  assert.ok(b.interest > 0, 'the Visa is revolving');
  assert.ok(!b.missing.includes('household.workHoursPerWeek'));
  const big = canISpend(s, R, sim2, { amount: 20000 });
  assert.equal(big.verdict, 'no');
  assert.ok(big.lowAfter.amount < big.lowBefore.amount);
  assert.equal(canISpend(s, R, sim2, { amount: 0 }).verdict, null);
});

test('the cut simulator: dropped lines add to the surplus; aimed at the debt they move the debt-free month and the interest', () => {
  const s = demo();
  const sum = S(s);
  const c0 = cutSimulator(s, R, sum, { dropped: [] });
  assert.equal(c0.saved, 0);
  assert.equal(c0.surplusAfter, c0.surplusBefore);
  const c1 = cutSimulator(s, R, sum, { dropped: ['streaming', 'gym'] });
  assert.equal(c1.saved, 64); // your $14 of the shared streaming and the $50 gym
  assert.equal(c1.surplusAfter, Math.round((c1.surplusBefore + 64) * 100) / 100);
  assert.equal(c1.debt, null);
  const c2 = cutSimulator(s, R, sum, { dropped: ['streaming', 'gym'], towardDebt: true });
  assert.equal(c2.debt.extraAfter, 64);
  assert.ok(c2.debt.debtFreeAfter < c2.debt.debtFreeBefore, 'sooner: ' + c2.debt.debtFreeAfter + ' vs ' + c2.debt.debtFreeBefore);
  assert.ok(c2.debt.interestSaved > 0);
  assert.ok(c2.debt.monthsSooner > 0);
  assert.ok(c2.from.includes('expenses.gym.amount'));
});

test('where the money goes: slices by tag with their lines, minimums, saving, what is left; shares add to one', () => {
  const s = demo();
  const d = donut(s, R, S(s));
  const ids = d.slices.map((x) => x.id);
  assert.ok(ids.includes('food') && ids.includes('accommodation') && ids.includes('minimums') && ids.includes('saving'));
  const food = d.slices.find((x) => x.id === 'food');
  assert.equal(food.amount, 700);
  assert.deepEqual(food.items.map((i) => i.id).sort(), ['dining', 'groceries']);
  assert.ok(Math.abs(d.slices.reduce((a, x) => a + x.share, 0) - 1) < 0.01, 'shares add to one');
  assert.equal(d.total, S(s).cashflow.income.takeHome.value);
});

test('the bill autopsy ranks every recurring item by yearly cost; a subscription never reviewed is stale', () => {
  const s = putFact(demo(), 'expenses.streaming.subscription', true, 'known', T);
  const a = billAutopsy(s, R, S(s), T);
  assert.equal(a.rows[0].id, 'rent');
  assert.equal(a.rows[0].yearly, 21600);
  for (let i = 1; i < a.rows.length; i++) assert.ok(a.rows[i - 1].yearly >= a.rows[i].yearly);
  assert.ok(a.rows.some((r) => r.id.startsWith('min:')), 'minimums are in it');
  const streaming = a.rows.find((r) => r.id === 'streaming');
  assert.equal(streaming.subscription, true);
  assert.equal(streaming.stale, true, 'never reviewed');
  assert.ok(a.staleCount >= 1);
  const reviewed = putFact(s, 'expenses.streaming.reviewed', '2026-09-01', 'known', T);
  assert.equal(billAutopsy(reviewed, R, S(reviewed), T).rows.find((r) => r.id === 'streaming').stale, false);
});

test('price increases from the log, free trials from a date', () => {
  let s = demo();
  assert.equal(priceChanges(s, R, T).rows.length, 0);
  s = logSpend(s, { amount: 44, date: '2026-10-15', expenseId: 'streaming' }).spine;
  const p = priceChanges(s, R, T);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].id, 'streaming');
  assert.equal(p.rows[0].planned, 40);
  assert.equal(p.rows[0].logged, 44);
  assert.equal(p.rows[0].change, 0.1);
  // Within the margin is not a flag.
  s = logSpend(s, { amount: 40.5, date: '2026-10-16', expenseId: 'streaming' }).spine;
  assert.equal(priceChanges(s, R, T).rows.length, 0);
  // A trial ending in ten days is soon; one that ended has converted.
  s = putFact(s, 'expenses.gym.trialEnds', '2026-11-01', 'known', T);
  const f = freeTrials(s, R, T);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].daysLeft, 10);
  assert.equal(f.rows[0].soon, true);
  assert.equal(f.rows[0].converted, false);
  const past = putFact(s, 'expenses.gym.trialEnds', '2026-10-01', 'known', T);
  assert.equal(freeTrials(past, R, T).rows[0].converted, true);
  assert.equal(validate(s).ok, true);
});

test('a check-in records real balances against the forecast, re-anchors the household, and feeds drift and momentum', () => {
  let s = demo();
  const sim = cashsim(s, R, { months: 1 });
  const f = checkInForecast(s, sim, T);
  assert.equal(f.date, T);
  assert.ok(f.accounts.some((a) => a.id === 'chk') && f.forecast.chk !== null);
  assert.equal(staleness(s, R, T).days, 0);
  assert.equal(staleness(s, R, '2026-11-05').stale, true, 'fourteen days without a check-in');
  assert.equal(staleness(s, R, '2026-10-30').stale, false);
  assert.equal(drift(s).kind, 'none');
  assert.equal(momentum(s, R).kind, 'none');
  // First check-in: real checking is 200 under the forecast.
  s = checkIn(s, { date: T, balances: { chk: f.forecast.chk - 200 }, forecast: { chk: f.forecast.chk } });
  assert.equal(s.meta.asOf, T);
  assert.equal(s.accounts.find((a) => a.id === 'chk').balance.value, Math.round((f.forecast.chk - 200) * 100) / 100);
  assert.equal(s.accounts.find((a) => a.id === 'chk').balance.kind, 'known');
  assert.equal(drift(s).kind, 'first');
  assert.equal(drift(s).mean, -200);
  // Second check-in, a week on: under again by 180: bias. Cash down: slipping.
  const sim2 = cashsim(s, R, { months: 1 });
  const f2 = checkInForecast(s, sim2, '2026-10-29');
  s = checkIn(s, { date: '2026-10-29', balances: { chk: f2.forecast.chk - 180 }, forecast: { chk: f2.forecast.chk } });
  assert.equal(s.meta.asOf, '2026-10-29', 're-anchored');
  const d = drift(s);
  assert.equal(d.count, 2);
  assert.equal(d.kind, 'bias');
  assert.equal(d.mean, -190);
  const m = momentum(s, R);
  assert.equal(m.points.length, 2);
  assert.ok(['slipping', 'building', 'flat'].includes(m.kind));
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors));
  assert.equal(staleness(s, R, '2026-11-05').stale, false, 'anchored by the last check-in, seven days ago');
  assert.throws(() => checkIn(s, { date: T, balances: {} }), /At least one/);
  assert.throws(() => checkIn(s, { date: T, balances: { nope: 1 } }), /No account/);
});

test('the month-end sweep moves what is above the floor plus the keep amount into the account picked', () => {
  let s = demo();
  const off = sweepReading(cashsim(s, R, { months: 2 }));
  assert.equal(off.on, false);
  assert.equal(off.moves.length, 0);
  s = setSweep(s, { on: true, to: 'hysa', keep: 500 });
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors));
  const on = sweepReading(cashsim(s, R, { months: 2 }));
  assert.equal(on.on, true);
  assert.equal(on.to, 'hysa');
  assert.equal(on.keep, 500);
  assert.ok(on.moves.length >= 1, 'a sweep at a month end inside the window');
  assert.ok(on.moves.every((m) => m.date.endsWith('-31') || m.date.endsWith('-30')));
  assert.ok(on.total > 0);
  assert.throws(() => setSweep(s, { on: true, keep: -1 }));
});

test('the spending view bundles everything from one run', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 1 });
  const vw = spendingView(s, R, sim, S(s), { today: T });
  for (const k of ['safe', 'tags', 'donut', 'autopsy', 'prices', 'trials', 'drift', 'stale', 'momentum', 'sweep', 'log']) assert.ok(k in vw, k);
  assert.equal(vw.ym, '2026-10');
});

test('safe to spend is the lower of the paycheck reading and the lowest point ahead less the floor, and names a shortfall (S-209)', () => {
  const s = demo();
  const f = safeToSpend(cashsim(s, R, { months: 2 }));
  assert.equal(f.today, Math.min(f.byPaycheck, f.byLow));
  assert.equal(f.binding, f.byLow < f.byPaycheck ? 'low' : 'paycheck');
  assert.equal(f.byLow, Math.round((f.low.amount - f.floor) * 100) / 100);
  assert.equal(f.shortfall, f.today < 0 ? f.shortfall : null);
  // The demo: the paycheck reading offers money, but checking runs dry on Nov 11 and the cushion tops it up until
  // the Nov 15 paycheck. Read before those top-ups, the lowest point is below zero: nothing is safe to spend.
  assert.ok(f.byPaycheck > 0);
  assert.equal(f.binding, 'low');
  assert.equal(f.low.date, '2026-11-14');
  assert.ok(f.low.covered > 0 && f.low.asRun === 0);
  assert.equal(f.low.amount, Math.round((f.low.asRun - f.low.covered - f.low.held) * 100) / 100);
  assert.deepEqual(f.shortfall, { amount: -f.today, date: '2026-11-14', covered: f.low.covered, held: 0 });
  // With 3,000 more in checking the paycheck reading is the lower one again and nothing is short.
  const rich = putFact(s, 'accounts.chk.balance', 6000, 'known', '2026-10-23');
  const g = safeToSpend(cashsim(rich, R, { months: 2 }));
  assert.equal(g.binding, g.byLow < g.byPaycheck ? 'low' : 'paycheck');
  assert.ok(g.today > 0);
  assert.equal(g.shortfall, null);
});

test('the check-in offers every cash account, one with no balance too, with no forecast for it (S-209)', () => {
  const s = putFact(demo(), 'accounts.hysa.balance', null, 'missing', '2026-10-23');
  const f = checkInForecast(s, cashsim(s, R, { months: 1 }));
  const hysa = f.accounts.find((a) => a.id === 'hysa');
  assert.ok(hysa && hysa.inRun === false && hysa.now === null);
  assert.equal(f.forecast.hysa, null);
  assert.ok(f.accounts.find((a) => a.id === 'chk').inRun);
});
