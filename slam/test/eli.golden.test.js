// Golden values for Eli's profile (from the Phase 1 brief). The expected
// numbers live in fixtures/eli.golden.local.json and the household in
// fixtures/eli.local.json; both are gitignored, so no real number is in this
// public file. Skipped when either is absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashflow } from '../engine/cashflow.js';
import { applyDefaults } from '../engine/defaults.js';
import { readJson, exists, loadRules } from './spine-helpers.js';

const skip = !(exists('fixtures/eli.local.json') && exists('fixtures/eli.golden.local.json')) && 'the local profile or its golden values are not on this machine';
const R = loadRules();

test('Eli golden values', { skip }, async (t) => {
  const spine = applyDefaults(loadHousehold(readJson('fixtures/eli.local.json')), R);
  const X = readJson('fixtures/eli.golden.local.json');
  assert.equal(spine.meta.asOf, X.asOf);
  assert.ok(validate(spine).ok);
  const s = summarize(spine, R);

  await t.test('monthly expenses without debt payments, before and after a dated cost starts', () => {
    assert.equal(s.cashflow.expenses.total.value, X.monthlyExpenses);
    for (const [ym, total] of X.expensesByMonth) assert.equal(cashflow(spine, R, ym).expenses.total.value, total, ym);
  });

  await t.test('credit card total and each balance', () => {
    assert.equal(s.sheet.cards.value, X.cardTotal);
    const bal = Object.fromEntries(spine.debts.filter((d) => d.type === 'credit_card').map((d) => [d.id, d.balance.value]));
    assert.deepEqual(bal, X.cards);
  });

  await t.test('promo balances due by the promo end', () => {
    assert.equal(s.debt.promo.total.value, X.promoTotal);
    assert.ok(s.debt.promo.items.every((x) => x.promoEnds === X.promoEnds));
  });

  await t.test('each promo balance goes to its rate after the intro the day after it ends', () => {
    for (const [id, [rate, day, kind]] of Object.entries(X.promoAfter)) {
      const it = s.debt.promo.items.find((x) => x.id === id);
      assert.deepEqual([it.aprAfter, it.switchDate, it.aprAfterKind], [rate, day, kind], id);
    }
    for (const id of X.defaultRateCards) assert.equal(spine.debts.find((d) => d.id === id).apr.kind, 'rough', id);
  });

  await t.test('every card and loan with no due day is on the 1st, rough', () => {
    for (const id of X.defaultDueDay) {
      const d = spine.debts.find((x) => x.id === id).dueDay;
      assert.deepEqual([d.value, d.kind], [1, 'rough'], id);
    }
  });

  await t.test('avalanche order of cards: highest rate first, then the 0% cards', () => {
    const o = s.debt.avalancheCards;
    assert.deepEqual(o.slice(0, X.avalancheFirst.length), X.avalancheFirst);
    assert.deepEqual(o.slice(X.avalancheFirst.length).sort(), [...X.zeroPromoCards].sort());
  });

  await t.test('utilization per card, personal and overall', () => {
    const r1 = (x) => Math.round(x * 1000) / 10;
    for (const [id, u] of Object.entries(X.utilization)) assert.equal(s.debt.utilization.items.find((x) => x.id === id).util.value, u, id);
    for (const [key, want] of [['personal', X.personalUtilization], ['overall', X.overallUtilization]]) {
      const got = s.debt.utilization[key];
      assert.deepEqual([got.balance, got.limit, r1(got.value)], [want.balance, want.limit, want.percentRounded], key);
    }
  });

  await t.test('credit score note: personal cards over 30% highest first, and the smallest paid off', () => {
    const cs = s.debt.creditScore;
    assert.deepEqual(cs.cards.map((c) => c.id), X.creditScore.order);
    assert.equal(cs.smallest.id, X.creditScore.smallest);
    assert.equal(Math.round(cs.personalAfter.value * 1000) / 10, X.creditScore.afterPercentRounded);
    assert.deepEqual(s.debt.avalancheCards.slice(0, X.avalancheFirst.length), X.avalancheFirst, 'the payoff order is unchanged by the note');
  });

  await t.test('cash, assets, debts, net worth', () => {
    assert.equal(s.sheet.cash.value, X.cash);
    assert.equal(s.sheet.assets.value, X.assets);
    assert.equal(s.sheet.debts.value, X.debts);
    assert.equal(s.sheet.netWorth.value, X.netWorth);
  });

  await t.test('invested assets, FI goal, FI percent', () => {
    assert.equal(s.sheet.invested.value, X.invested);
    assert.equal(s.fi.fiNumber.value, X.fiGoal);
    assert.equal(s.fi.goalSource, 'direct');
    assert.equal(Math.round(s.fi.fiPercent.value * 1000) / 10, X.fiPercentRounded);
  });

  await t.test('FI number implied by spending, flagged above the goal', () => {
    assert.equal(s.fi.implied.value, X.impliedFi);
    assert.equal(s.fi.goalBelowImplied.value, true);
    assert.ok(s.flags.some((f) => f.id === 'fi-goal-gap'));
  });

  await t.test('Rule of 5 target in months', () => assert.equal(s.emergency.targetMonths.value, X.ruleOf5Months));

  await t.test('Roth basis: contributions, and each conversion on its own clock', () => {
    assert.equal(s.emergency.backstop.contributions.value, X.rothContributions);
    assert.deepEqual(s.emergency.backstop.conversions.map((c) => [c.amount, c.year, c.clockOpens]), X.conversions);
    assert.equal(s.emergency.backstop.countedAsCash, false);
    assert.equal(s.sheet.cash.value, X.cash, 'the backstop is not cash');
  });

  await t.test('the tax result reports what is missing instead of a number', () => {
    assert.equal(s.tax.owed.value, null);
    assert.equal(s.tax.balanceDue.value, null);
    assert.equal(s.tax.missingText, X.taxMissingText);
    assert.ok(s.tax.balanceDue.missing.includes(X.taxMissingPath));
    assert.equal(s.tax.nextEstimated.date, X.nextEstimated);
  });

  await t.test('the flags the brief lists all fire', () => {
    const ids = s.flags.map((f) => f.id);
    for (const id of X.flags) assert.ok(ids.includes(id), id);
  });
});
