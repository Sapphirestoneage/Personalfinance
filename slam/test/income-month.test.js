// Income in Plan and Actual from the log (S-118), by hand. Riley: biweekly paychecks of 1,500 (take-home,
// typed once a paycheck in Setup, Income), Fridays from October 10, 2025, and dog walking (side income,
// 250 a month estimated).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeValue } from '../src/store/value.js';
import { addEntry } from '../src/store/log.js';
import { setIncomeActual } from '../src/store/edits.js';
import { setPlanIncome } from '../src/store/plans.js';
import { incomeMonth } from '../src/calc/income-month.js';
import { payDates } from '../src/calc/calendar.js';
import { buildSummary } from '../src/calc/summary.js';
import { bridgeFor } from '../src/calc/bridge.js';
import { netWorthBridge } from '../src/calc/networth-bridge.js';
import { balanceMonths } from '../src/calc/networth.js';
import { monthEndChecklist } from '../src/calc/loop.js';
import { october } from './fixtures/october.js';
import { loadRefs, loadHousehold } from './helpers.js';

const refs = loadRefs();
const rows = (im) => im.sources.map((x) => [x.label, x.estimate, x.plan, x.planNote, x.actual, x.from, x.count]);
const steps = (br) => Object.fromEntries(br.steps.map((s) => [s.key, s.amount]));
const lines = (b) => Object.fromEntries(b.lines.map((l) => [l.key, l.amount]));

test('Riley, March: estimate, plan from the real paydays, and actual from the log', () => {
  const d = loadHousehold('riley');
  const im = incomeMonth(d, buildSummary(d, refs).income, '2026-03');
  // Estimate: 1,500 x 26 / 12 = 3,250, and dog walking 250: 3,500.
  // Plan: March's paydays are the 13th and 27th: 2 x 1,500 = 3,000; dog walking its estimate, 250: 3,250.
  // Actual: paychecks 1,500 + 1,500 = 3,000 (2 entries); dog walking 120 + 100 = 220 (2 entries): 3,220.
  assert.deepEqual(rows(im), [['Northwind Labs', 3250, 3000, '2 paychecks this month', 3000, 'log', 2], ['Dog walking', 250, 250, '', 220, 'log', 2]]);
  assert.deepEqual([im.estimate, im.plan, im.actual, im.tracked, im.unassigned.count], [3500, 3250, 3220, true, 0]);
});

test('Riley, January: 3 paychecks, planned as 3, and both bridges tie', () => {
  const d = loadHousehold('riley');
  const inc = buildSummary(d, refs).income;
  // Paydays: January 2, 16, and 30 (every 14 days from October 10).
  assert.deepEqual(payDates(d.income[0], '2026-01'), ['2026-01-02', '2026-01-16', '2026-01-30']);
  const im = incomeMonth(d, inc, '2026-01');
  // Plan 3 x 1,500 = 4,500 + 250 = 4,750. Actual: 4,500 (3 entries) + dog walking 149.59 + 114.63 = 264.22: 4,764.22.
  assert.deepEqual(rows(im), [['Northwind Labs', 3250, 4500, '3 paychecks this month', 4500, 'log', 3], ['Dog walking', 250, 250, '', 264.22, 'log', 2]]);
  assert.deepEqual([im.plan, im.actual], [4750, 4764.22]);
  // Spending: rent 1,750 + utilities 77.96 + groceries (103.16 + 58.26 + 84.42 + 89.34 = 335.18) + eating out
  // (6 x 4.75 + 24.01 + 30.98 = 83.49) + car payment 340 + car insurance 80 (its share) + gas (47.98 + 41.47
  // = 89.45) + phone 65 + shopping (40.85 + 51.35 = 92.20) + entertainment 15.49 + gifts 0 + registration 15
  // (its share) + Visa minimum 35 + Visa interest 0 = 2,978.77. Savings 200 + 400 + 50 = 650.
  // Surplus 4,764.22 - 2,978.77 - 650 = 1,135.45.
  const br = bridgeFor(d, inc, '2026-01');
  assert.equal(br.surplus, 1135.45);
  // Yearly shares 80 + 15 = 95, none paid: +95. Set aside 200 + 50: +250. Visa 1,048.40 -> 615.81: -432.59.
  // The card minimum +35. No income step: the surplus already holds what landed.
  assert.deepEqual(steps(br), { yearly: 95, 'set-aside': 250, cards: -432.59, 'card-min': 35 });
  // 1,135.45 + 95 + 250 - 432.59 + 35 = 1,082.86. Cash: 1,859.16 + 1,450 = 3,309.16 -> 2,692.02 + 1,700 = 4,392.02.
  assert.deepEqual([br.explained, br.actual, br.unexplained], [1082.86, 1082.86, 0]);
  // Net worth: start 1,859.16 + 1,450 + 401(k) 13,085 + Roth 7,250 + car 9,300 = 32,944.16, less Visa 1,048.40
  // and the loan 6,080.42: 25,815.34. End 2,692.02 + 1,700 + 13,560 + 7,720 + 9,200 = 34,872.02, less 615.81
  // and 5,770.82: 28,485.39. Lines: saved 650 + the 401(k) 325 = 975; paid down 35 + 6,080.42 - 5,770.82
  // (= 309.60: the 340 car payment less 30.40 interest) = 344.60; market 401(k) 13,560 - 13,085 - 325 = 150,
  // Roth 7,720 - 7,250 - 400 = 70; the car 9,300 -> 9,200.
  const nb = netWorthBridge(d, inc, '2026-01');
  assert.deepEqual(lines(nb.total), { surplus: 1135.45, timing: 95, saved: 975, 'paid-down': 344.6, market: 220, value: -100 });
  // 25,815.34 + 1,135.45 + 95 + 975 + 344.60 + 220 - 100 = 28,485.39: ties.
  assert.deepEqual([nb.total.start, nb.total.explained, nb.total.actual, nb.total.unexplained], [25815.34, 28485.39, 28485.39, 0]);
  assert.equal(nb.reading, 'Net worth rose $2,670. $2,205 you saved, $220 the market added, $345 of debt paid down, $100 of value lost on things you own.');
});

test('W-2 income is never typed twice: the plan and the actual come from the paycheck and the log', () => {
  const d = loadHousehold('riley');
  // Scheduled pay has no plan input: it is the paydays x the take-home a paycheck.
  assert.throws(() => setPlanIncome(d, '2026-10', 'job', makeValue(3000)), /Scheduled pay comes from the paydays/);
  // A source with entries this month cannot be typed over.
  assert.throws(() => setIncomeActual(d, '2026-10', 'job', makeValue(3000)), /This comes from 1 entry/);
  // Side income can change for the month: 300 in place of 250.
  setPlanIncome(d, '2026-11', 'side', makeValue(300));
  const nov = incomeMonth(d, buildSummary(d, refs).income, '2026-11');
  // November's paydays: the 6th and 20th: 3,000; plus 300 = 3,300.
  assert.deepEqual([nov.sources[1].plan, nov.sources[1].planNote, nov.plan], [300, 'changed for this month', 3300]);
  // The take-home is one stored number: 1,500 a paycheck.
  assert.deepEqual([d.income[0].takeHome.amount, d.income[0].takeHome.cadence], [1500, 'paycheck']);
});

test('income not tracked: the surplus uses take-home, and says so; typed or none counts as tracked', () => {
  const d = loadHousehold('dana');
  const t = () => buildSummary(d, refs).totals;
  // Dana has no income entries: take-home 4,000 - spending 3,510 - savings 300 = 190, not tracked.
  assert.deepEqual([t().incomeTracked, t().incomeBasis, t().surplus], [false, 4000, 190]);
  // A typed 3,900 for October (no entries): tracked; 3,900 - 3,510 - 300 = 90.
  setIncomeActual(d, '2026-10', 'job', makeValue(3900));
  assert.deepEqual([t().incomeTracked, t().surplus], [true, 90]);
  // None this month: 0 - 3,810 = -3,810.
  setIncomeActual(d, '2026-10', 'job', 'none');
  assert.deepEqual([t().income.sources[0].from, t().surplus], ['none', -3810]);
});

test('an income entry with no source counts, and is a month-end checklist item', () => {
  const d = october();
  addEntry(d, { date: '2026-10-22', amount: -75, kind: 'income', account: 'chk', note: 'cash gift' });
  const s = buildSummary(d, refs);
  // 4,300 from the job + 75 with no source = 4,375.
  assert.deepEqual([s.totals.income.unassigned.count, s.totals.income.unassigned.amount, s.totals.income.actual], [1, 75, 4375]);
  const item = monthEndChecklist(d, s, '2026-10-31').items.find((i) => i.key === 'income-source');
  assert.deepEqual([item.count, item.open, item.short], [1, true, '1 income entry with no source']);
});

test('both bridges tie every month, for every household', () => {
  const files = readdirSync(new URL('./households/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  let checked = 0;
  for (const name of files) {
    const d = loadHousehold(name);
    const inc = buildSummary(d, refs).income;
    const months = [...new Set([...d.months.map((m) => m.key), ...balanceMonths(d)])];
    for (const m of months) {
      const br = bridgeFor(d, inc, m);
      if (br.explained !== null && br.actual !== null && br.unexplained !== null) {
        assert.equal(Math.round((br.explained + br.unexplained) * 100), Math.round(br.actual * 100), name + ' ' + m + ' cash');
        checked += 1;
      }
      const nb = netWorthBridge(d, inc, m);
      if (nb.total.unexplained !== null) assert.equal(Math.round((nb.total.explained + nb.total.unexplained) * 100), Math.round(nb.total.actual * 100), name + ' ' + m + ' net worth');
    }
  }
  assert.ok(checked >= 24, 'checked ' + checked);
});
