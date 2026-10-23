// Next stage: a drastic change worked out by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../src/engines/summary.js';
import { newHousehold, newNextStage } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findCategory } from '../src/store/edits.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { loadRefs, near, withCashOnHand } from './helpers.js';

const refs = loadRefs();
const v = (a, cadence = 'month') => makeValue(a, { cadence });

function household() {
  // NOW: take-home 4,000 a month, 50 hours a week. Housing 1,500 + food 500 = 2,000 spending, savings 300.
  // outflow 2,300; surplus 1,700. Take-home per hour: 4,000 / (50 x 52 / 12 = 216.667) = 18.461538
  const d = newHousehold('Switch');
  d.noDebts = true;
  d.income.push({ id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: v(4000), gross: makeValue(), deductions: [], hoursPerWeek: 50, state: 'active' });
  findCategory(d, 'housing').estimate = v(1500);
  findCategory(d, 'food').estimate = v(500);
  findCategory(d, 'savings').estimate = v(300);
  // NEXT: teaching job, take-home 3,000 a month, 40 hours. Costs: +200 a month (license loan), -100 (shorter commute).
  // One-offs: course 2,500 + moving 500 = 3,000. Three months at 1,000 take-home while switching.
  // Pay rises to 4,500 a month after month 24.
  const ns = newNextStage([['Stress, 1 to 10', 'lower'], ['Meaning or joy, 1 to 10', 'higher']]);
  Object.assign(ns, { name: 'Become a teacher', takeHome: v(3000), hoursPerWeek: 40, transitionMonths: 3, transitionTakeHome: v(1000), laterTakeHome: v(4500), laterAfterMonths: 24 });
  ns.costChanges = [{ id: 'c1', label: 'License loan', amount: v(200) }, { id: 'c2', label: 'Commute', amount: v(-100) }];
  ns.oneOffCosts = [{ id: 'o1', label: 'Course', amount: v(2500, 'one-off') }, { id: 'o2', label: 'Moving', amount: v(500, 'one-off') }];
  // hours are not a typed measure: 50 now (Basics) and 40 next come from the hours fields
  ns.metrics[0].now = 8; ns.metrics[0].next = 4;
  ns.metrics[1].now = 3; ns.metrics[1].next = 8;
  d.nextStage = ns;
  return d;
}

test('next stage: what you would need', () => {
  const d = household();
  assert.deepEqual(validateHousehold(migrate(d)), []);
  const n = buildSummary(migrate(d), refs).nextStage;
  // next outflow = 2,300 + 200 - 100 = 2,400; next surplus = 3,000 - 2,400 = 600
  assert.equal(n.now.surplus, 1700);
  assert.equal(n.next.outflow, 2400);
  assert.equal(n.next.surplus, 600);
  // switching months: 1,000 - 2,400 = -1,400 a month x 3 = 4,200; plus one-offs 3,000 = 7,200 needed
  assert.equal(n.transitionGap, -1400);
  assert.equal(n.cashNeeded, 7200);
  // at today's surplus: 7,200 / 1,700 = 4.235 -> 5 months
  assert.ok(near(n.monthsToSave, 4.235294, 6));
  assert.equal(n.monthsToSaveWhole, 5);
  assert.equal(n.cutNeeded, 0);
  // per hour: now 18.461538; next 3,000 / (40 x 52 / 12 = 173.333) = 17.307692
  assert.ok(near(n.now.perHour, 18.461538, 6));
  assert.ok(near(n.next.perHour, 17.307692, 6));
});

test('next stage: stay vs change breaks even in month 113', () => {
  // difference (change - stay): month 0 -3,000; months 1-3: -1,400 - 1,700 = -3,100 each -> -12,300
  // months 4-24 (21 months): 600 - 1,700 = -1,100 each -> -23,100 -> -35,400 at month 24
  // from month 25: 4,500 - 2,400 = 2,100; 2,100 - 1,700 = +400 a month; 35,400 / 400 = 88.5 -> month 24 + 89 = 113
  const n = buildSummary(migrate(household()), refs).nextStage;
  assert.equal(n.path.breakEven, 113);
  assert.equal(n.path.change[24] - n.path.stay[24], -35400);
  assert.equal(n.path.change[113] - n.path.stay[113], 200);
});

test('next stage: other measures, and a shortfall that needs a cut', () => {
  const d = household();
  const n = buildSummary(migrate(d), refs).nextStage;
  assert.deepEqual(n.metrics.map((m) => [m.change, m.better]), [[-10, true], [-4, true], [5, true]]);
  d.nextStage.takeHome = v(2000); // 2,000 - 2,400 = -400 a month
  const n2 = buildSummary(migrate(d), refs).nextStage;
  assert.equal(n2.cutNeeded, 400);
  // difference: -3,000; months 1-3: -3,100 each -> -12,300; months 4-24: -400 - 1,700 = -2,100 x 21 = -44,100 -> -56,400;
  // from month 25: +400 a month -> 56,400 / 400 = 141 more months -> month 165, past the 10-year (120 month) window
  assert.equal(n2.path.breakEven, null);
});

test('three lenses: disaster, likely, dream, with cash on hand and runway', () => {
  const d = household();
  const ns = d.nextStage;
  withCashOnHand(d, 10000);
  // DISASTER: take-home 2,500; 6 months with no pay; course costs 4,000 (moving stays 500). Later pay follows likely (4,500 after 24).
  Object.assign(ns.cases.disaster, { takeHome: v(2500), transitionMonths: 6, transitionTakeHome: v(0) });
  ns.oneOffCosts[0].disaster = v(4000, 'one-off');
  // DREAM: take-home 3,500; 1 month switching (at likely's 1,000); pay rises to 5,000 after 12 months.
  Object.assign(ns.cases.dream, { takeHome: v(3500), transitionMonths: 1, laterTakeHome: v(5000), laterAfterMonths: 12 });
  const { cases } = buildSummary(migrate(d), refs).nextStage;

  // DISASTER: outflow 2,400; after the switch 2,500 - 2,400 = +100
  // switching: 0 - 2,400 = -2,400 x 6 = 14,400; one-offs 4,000 + 500 = 4,500; cash needed 18,900
  // months to save: 18,900 / 1,700 = 11.12 -> 12. Cash 10,000 is 8,900 short.
  // runway: (10,000 - 4,500) / 2,400 = 2.291667 months of the 6
  // break-even: -4,500; months 1-6: -4,100 each -> -29,100; months 7-24: -1,600 x 18 -> -57,900;
  // then +400 a month -> 145 more months -> month 169, past 120 -> none
  const x = cases.disaster;
  assert.equal(x.next.surplus, 100);
  assert.equal(x.cashNeeded, 18900);
  assert.equal(x.monthsToSaveWhole, 12);
  assert.equal(x.cash.gap, -8900);
  assert.equal(x.cash.covers, false);
  assert.ok(near(x.cash.runwayMonths, 2.291667, 6));
  assert.equal(x.path.breakEven, null);

  // LIKELY (unchanged): 7,200 needed; cash covers it with 2,800 to spare; runway (10,000 - 3,000) / 1,400 = 5 months
  const l = cases.likely;
  assert.equal(l.cashNeeded, 7200);
  assert.equal(l.cash.gap, 2800);
  assert.equal(l.cash.runwayMonths, 5);
  assert.equal(l.path.breakEven, 113);

  // DREAM: after the switch 3,500 - 2,400 = +1,100; switching 1 x 1,400 = 1,400; one-offs 3,000; needs 4,400
  // months to save 4,400 / 1,700 = 2.59 -> 3; cash gap 10,000 - 4,400 = 5,600
  // break-even: -3,000; month 1: -3,100 -> -6,100; months 2-12: -600 x 11 -> -12,700;
  // from month 13: 5,000 - 2,400 = 2,600 -> +900 a month; 12,700 / 900 = 14.1 -> 15 months -> month 27
  const r = cases.dream;
  assert.equal(r.next.surplus, 1100);
  assert.equal(r.cashNeeded, 4400);
  assert.equal(r.monthsToSaveWhole, 3);
  assert.equal(r.cash.gap, 5600);
  assert.equal(r.path.breakEven, 27);
  assert.equal(r.path.change[27] - r.path.stay[27], 800);
});
