// Debts and the budget (S-116), by hand: a loan paid by a budget line, card interest computed and never
// typed, and the account types the coach still has to pick.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { setBalance, addAccount } from '../src/store/accounts.js';
import { addDebt, findLine, setDebtLine, setPromoEnds } from '../src/store/edits.js';
import { buildSummary } from '../src/calc/summary.js';
import { budgetModel } from '../src/calc/model.js';
import { bridgeFor } from '../src/calc/bridge.js';
import { netWorthBridge } from '../src/calc/networth-bridge.js';
import { minimumOf, splitPayment, cardInterest, linkedLine } from '../src/calc/debts.js';
import { owningCosts } from '../src/calc/owning.js';
import { questionItems } from '../src/calc/completion.js';
import { accountTypeNudges } from '../src/calc/loop.js';
import { october } from './fixtures/october.js';
import { loadRefs, loadHousehold } from './helpers.js';

const refs = loadRefs();
const one = (a) => makeValue(a, { cadence: 'one-off' });
const debtLines = (d) => budgetModel(d).categories.find((c) => c.id === 'debt').lines.map((l) => [l.id, l.actual]);
const lines = (b) => Object.fromEntries(b.lines.map((l) => [l.key, l.amount]));

test('Riley: the auto loan is paid by the Car payment line, counted once', () => {
  const d = loadHousehold('riley');
  assert.deepEqual(validateHousehold(d), []);
  const loan = d.debts.find((x) => x.id === 'debt-car');
  assert.equal(linkedLine(d, loan).id, 'car-payment');
  // Its minimum is the line's estimate, 340, never typed on the debt.
  assert.deepEqual([minimumOf(d, loan).amount, loan.minimum.amount], [340, null]);
  // Debt payments in October: the Visa minimum 35 and the Visa's interest, 0 (paid in full each month).
  // No row for the loan: the Car payment line in Transportation is the payment.
  assert.deepEqual(debtLines(d), [['debt:debt-visa', 35], ['interest:debt-visa', 0]]);
  // March, closed: the same, in the saved month.
  const mar = d.months.find((m) => m.key === '2026-03').snapshot.lines;
  assert.equal(mar['debt:debt-car'], undefined);
  assert.equal(mar['interest:debt-visa'].actual, 0);
  assert.equal(mar['car-payment'].actual, 340);
  // Asked once: the completion list no longer asks for the loan's minimum.
  const inc = buildSummary(d, refs).income;
  assert.equal(questionItems(d, budgetModel(d), inc).some((x) => x.key === 'min:debt-car'), false);
  assert.equal(questionItems(d, budgetModel(d), inc).some((x) => x.key === 'min:debt-visa'), true);
});

test('Riley: March\'s car payment split into interest and principal', () => {
  const d = loadHousehold('riley');
  const loan = d.debts.find((x) => x.id === 'debt-car');
  // The loan going into March (February's end) 5,459.67 x 6% / 12 = 27.29835, 27.30 interest (spent);
  // the 340 payment less 27.30 = 312.70 principal, the same as the balance's fall 5,459.67 - 5,146.97.
  assert.deepEqual(splitPayment(d, loan, '2026-03', 340), { balance: 5459.67, apr: 6, payment: 340, interest: 27.3, principal: 312.7 });
  const b = netWorthBridge(d, buildSummary(d, refs).income, '2026-03');
  const paid = b.total.lines.find((l) => l.key === 'paid-down');
  assert.equal(paid.amount, 347.7);
  assert.equal(paid.from, 'Card payments $35, Auto loan $312.70 (Car payment $340: interest $27.30, principal $312.70)');
  // The car next to its alternative: the payment is the line's 340; at September's end the loan is
  // 3,237.64, so 16.19 is interest and 340 - 16.19 = 323.81 principal.
  const [car] = owningCosts(d, buildSummary(d, refs), '2026-10-17');
  assert.deepEqual([car.debt.payment, car.debt.interest, car.debt.principal], [340, 16.19, 323.81]);
});

test('one line pays one debt; unlinking brings back its own minimum', () => {
  const d = october();
  const loan = addDebt(d, { id: 'loan', label: 'Car loan', type: 'car-loan' });
  loan.minimum = makeValue(250);
  findLine(d, 'car-payment').line.estimate = makeValue(300);
  setDebtLine(d, 'loan', 'car-payment');
  // Linked: the minimum is the line's 300, and the loan has no row in Debt payments.
  assert.equal(minimumOf(d, loan).amount, 300);
  assert.equal(debtLines(d).some(([id]) => id === 'debt:loan'), false);
  const other = addDebt(d, { id: 'loan2', label: 'Other loan', type: 'car-loan' });
  assert.throws(() => setDebtLine(d, other.id, 'car-payment'), /already pays another debt/);
  setDebtLine(d, 'loan', null);
  assert.deepEqual(debtLines(d).find(([id]) => id === 'debt:loan'), ['debt:loan', 250]);
});

test('card interest: computed from the balance going into the month, and both bridges still tie', () => {
  // The October household (test/bridge.test.js) with the Visa at 24% and not paid in full: interest
  // 500 (the balance going into October) x 24% / 12 = 10.00, charged on the card, so it ends at
  // 500 + 300 - 450 + 10 = 360.
  const d = october();
  const visa = d.debts[0];
  visa.apr = one(24);
  setBalance(d, '2026-10', 'visa', 'end', one(360));
  assert.deepEqual(debtLines(d), [['debt:' + visa.id, 40], ['interest:' + visa.id, 10]]);
  const s = buildSummary(d, refs);
  // Spending 2,100 + 10 = 2,110; surplus: the 4,300 of income in the log (S-118) - 2,110 - 200 = 1,990.
  const br = bridgeFor(d, s.income, '2026-10');
  assert.equal(br.surplus, 1990);
  // Cards: 500 -> 360 = -140. Explained 1,990 - 1,100 + 200 - 140 + 40 - 60 - 250 = 680 = the
  // change in cash, so it ties. (Without the interest line it would be 690, and 10 not explained.)
  assert.deepEqual([br.explained, br.actual, br.unexplained], [680, 680, 0]);
  // Net worth: 2,000 + 5,000 - 500 = 6,500 -> 2,480 + 5,200 + 1,100 paid ahead (S-119) - 360 = 8,420, up 1,920.
  // 1,990 + timing (-1,100 + 1,100 paid ahead - 60 - 250 = -310) + saved 200 + the card minimum 40 = 1,920.
  const nb = netWorthBridge(d, s.income, '2026-10');
  assert.deepEqual([nb.total.start, nb.total.explained, nb.total.actual, nb.total.unexplained], [6500, 8420, 8420, 0]);
});

test('card interest: 0% until the promo ends, none when paid in full, from its own balance without month balances', () => {
  const d = october();
  const visa = d.debts[0];
  visa.apr = one(24);
  visa.promoApr = one(0);
  setPromoEnds(d, visa.id, '2026-12-31');
  assert.equal(cardInterest(d, visa, '2026-10').amount, 0);
  // The promo ended September 30: 24% again, 10.00 in October.
  setPromoEnds(d, visa.id, '2026-09-30');
  assert.equal(cardInterest(d, visa, '2026-10').amount, 10);
  // Paid in full (the statement balance) each month: no interest.
  visa.payWith = 'statement';
  assert.equal(cardInterest(d, visa, '2026-10').amount, 0);
  // A card with only its own balance and no month balances (Luis's Chase, S-133): that balance stands in,
  // 4,200 x 24.99 / 1,200 = 104,958 / 1,200 = 87.465, half up to 87.47.
  const luis = loadHousehold('luis');
  assert.equal(cardInterest(luis, luis.debts.find((x) => x.id === 'debt-chase'), luis.currentMonth).amount, 87.47);
  // No APR yet: the line is blank, not 0.
  const e = october();
  assert.equal(cardInterest(e, e.debts[0], '2026-10').amount, null);
});

test('migration: old Investment and Retirement types become "Type not set"; a loan with no minimum links to its line', () => {
  const raw = newHousehold('Old');
  raw.schemaVersion = 12;
  raw.currentMonth = '2026-10';
  raw.accounts = [
    { id: 'inv', name: 'Brokerage at work', type: 'investment', state: 'active' },
    { id: 'ret', name: 'Old 401k', type: 'retirement', state: 'active' },
    { id: 'oth', name: 'Something else', type: 'other', state: 'active' }
  ];
  raw.balances = { '2026-10': { inv: { start: one(1000) }, ret: { start: one(5000) } } };
  const car = raw.categories.flatMap((c) => c.lines).find((l) => l.id === 'car-payment');
  car.estimate = makeValue(320);
  raw.debts = [
    { id: 'loan', label: 'Car loan', type: 'car-loan', balance: one(8000), apr: one(5), minimum: makeValue(), dueDay: makeValue(), state: 'active' },
    { id: 'stu', label: 'Student loan', type: 'student-loan', balance: one(9000), apr: one(4), minimum: makeValue(110), dueDay: makeValue(), state: 'active' }
  ];
  const d = migrate(raw);
  assert.deepEqual(validateHousehold(d), []);
  // Tier 2 for the old investment, tier 3 for the old retirement, both counting toward FI; balances kept.
  assert.deepEqual(d.accounts.map((a) => [a.id, a.type, a.tier, a.countsForFI]), [['inv', 'unset', 2, true], ['ret', 'unset', 3, true], ['oth', 'other', 2, true]]);
  assert.deepEqual([d.balances['2026-10'].inv.start.amount, d.balances['2026-10'].ret.start.amount], [1000, 5000]);
  // The car loan had no minimum and one Car payment line with an amount: linked. The student loan has its own.
  assert.deepEqual(d.debts.map((x) => [x.id, x.lineId]), [['loan', 'car-payment'], ['stu', null]]);
  // The Next card asks for a type, one account at a time, and never guesses.
  assert.deepEqual(accountTypeNudges(d).map((x) => x.label), ['Pick what kind of account this is: Brokerage at work', 'Pick what kind of account this is: Old 401k', 'Pick a specific type for Something else']);
});

test('Luis: computed interest as soon as a card has its APR and a balance; the typed line hands off (S-133)', () => {
  const d = loadHousehold('luis');
  const c = (x) => Math.round(x * 100) / 100;
  // As loaded (no month balances): each card's own balance stands in.
  //   Chase 4,200 x 24.99 / 1,200 = 104,958 / 1,200 = 87.465 -> 87.47
  //   Discover 1,100 x 22.9 / 1,200 = 25,190 / 1,200 = 20.99166 -> 20.99. Together 108.46.
  assert.deepEqual(debtLines(d).filter(([id]) => id.startsWith('interest:')), [['interest:debt-chase', 87.47], ['interest:debt-discover', 20.99]]);
  // The typed "Interest charged" 45 is replaced (never both): Bills is the ATM 5 alone.
  const s0 = buildSummary(d, refs);
  const typed = s0.rows.find((r) => r.id === 'bills').lines.find((l) => l.id === 'fee-interest');
  assert.deepEqual([typed.actual, typed.covered], [0, 'computed-interest']);
  // Debt payments 685 + 108.46 = 793.46. Spending 3,765 - 45 + 108.46 = 3,828.46; surplus 4,600 - 3,828.46 - 200 = 571.54.
  assert.deepEqual([c(s0.rows.find((r) => r.id === 'debt').actual), s0.rows.find((r) => r.id === 'bills').actual, c(s0.totals.spending), c(s0.totals.surplus)], [793.46, 5, 3828.46, 571.54]);
  // Month balances, once there are some, are the balance going in: the statements going into September,
  // Chase 4,000 x 24.99 / 1,200 = 83.30; Discover 1,200 x 22.9 / 1,200 = 22.90. Together 106.20.
  addAccount(d, { id: 'chase', name: 'Chase', type: 'credit-card', debtId: 'debt-chase' });
  addAccount(d, { id: 'discover', name: 'Discover', type: 'credit-card', debtId: 'debt-discover' });
  setBalance(d, '2026-09', 'chase', 'start', one(4000));
  setBalance(d, '2026-09', 'discover', 'start', one(1200));
  assert.deepEqual(debtLines(d).filter(([id]) => id.startsWith('interest:')), [['interest:debt-chase', 83.3], ['interest:debt-discover', 22.9]]);
  // Spending 3,765 - 45 + 106.20 = 3,826.20; surplus 4,600 - 3,826.20 - 200 = 573.80.
  const s1 = buildSummary(d, refs);
  assert.deepEqual([c(s1.rows.find((r) => r.id === 'debt').actual), c(s1.totals.spending), c(s1.totals.surplus)], [791.2, 3826.2, 573.8]);
  // A card missing its APR shows a blank line (empty is not zero); the other still computes.
  d.debts.find((x) => x.id === 'debt-discover').apr = { amount: null, cadence: 'one-off', status: null, source: 'client', asOf: null, note: '' };
  assert.deepEqual(debtLines(d).filter(([id]) => id.startsWith('interest:')), [['interest:debt-chase', 83.3], ['interest:debt-discover', null]]);
  // No card can compute: the typed line counts again (Bills interest 45 + ATM 5 = 50), and there are no computed lines.
  d.debts.find((x) => x.id === 'debt-chase').apr = { amount: null, cadence: 'one-off', status: null, source: 'client', asOf: null, note: '' };
  assert.deepEqual(debtLines(d).filter(([id]) => id.startsWith('interest:')), []);
  assert.equal(buildSummary(d, refs).rows.find((r) => r.id === 'bills').actual, 50);
});

test('months to a promo end, by hand (S-125)', async () => {
  const { promoMonthsLeft } = await import('../src/calc/debts.js');
  // October 2026 to May 31, 2027: (2027 - 2026) x 12 + (5 - 10) = 12 - 5 = 7.
  assert.equal(promoMonthsLeft({ promoEnds: '2027-05-31' }, '2026-10'), 7);
  // Ends this month: 0; ended in August: (2026 - 2026) x 12 + (8 - 10) = -2; no end date: null.
  assert.deepEqual([promoMonthsLeft({ promoEnds: '2026-10-31' }, '2026-10'), promoMonthsLeft({ promoEnds: '2026-08-31' }, '2026-10'), promoMonthsLeft({ promoEnds: null }, '2026-10')], [0, -2, null]);
});
