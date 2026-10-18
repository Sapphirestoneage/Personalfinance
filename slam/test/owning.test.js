// What owning really costs (S-113), by hand: a condo and a car, each next to its alternative.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { viewFor } from '../src/store/visibility.js';
import { addAccount, setBalance, setAccountField, setAlternative, setAccountNotes, setOwnReturn } from '../src/store/accounts.js';
import { addDebt, addLine, findLine, findCategory } from '../src/store/edits.js';
import { owningCosts, depreciationFromValues } from '../src/calc/owning.js';
import { buildSummary } from '../src/calc/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();
const one = (a, opts = {}) => makeValue(a, { cadence: 'one-off', ...opts });
const DAY = '2026-10-31';

function owner() {
  const d = migrate(newHousehold('Owner'));
  d.currentMonth = '2026-10';
  // The condo: worth 310,000; the mortgage 240,000 at 6%, 1,800 a month.
  const condo = addAccount(d, { id: 'condo', name: 'Condo', type: 'home' });
  const mort = addDebt(d, { id: 'mort', label: 'Mortgage', type: 'mortgage' });
  Object.assign(mort, { apr: one(6), minimum: makeValue(1800) });
  setAccountField(d, condo.id, 'securedDebtId', mort.id);
  setBalance(d, '2026-10', condo.id, 'end', one(310000, { status: 'roughly' }));
  setBalance(d, '2026-10', mort.id, 'end', one(240000));
  // Housing lines: property tax 300, insurance 100, utilities 150; no maintenance line, no rent.
  const tax = addLine(d, 'housing', 'Property tax');
  tax.type = 'taxes';
  tax.estimate = makeValue(300);
  findLine(d, 'home-insurance').line.estimate = makeValue(100);
  findLine(d, 'utilities').line.estimate = makeValue(150);
  setAlternative(d, condo.id, 'rentAlt', makeValue(2100));
  // The car: 10,200 a year ago, 9,000 now; a loan of 5,000 at 7.2%.
  const car = addAccount(d, { id: 'car', name: 'Car', type: 'vehicle' });
  const loan = addDebt(d, { id: 'loan', label: 'Auto loan', type: 'car-loan' });
  Object.assign(loan, { apr: one(7.2), minimum: makeValue(250) });
  setAccountField(d, car.id, 'securedDebtId', loan.id);
  setBalance(d, '2025-10', car.id, 'end', one(10200, { status: 'roughly' }));
  setBalance(d, '2026-10', car.id, 'end', one(9000, { status: 'roughly' }));
  setBalance(d, '2026-10', loan.id, 'end', one(5000));
  // Car lines: insurance 80, maintenance 40, gas 120 a month; no parking or tolls.
  findLine(d, 'car-insurance').line.estimate = makeValue(80);
  findLine(d, 'maintenance').line.estimate = makeValue(40);
  findLine(d, 'gas').line.estimate = makeValue(120);
  setAlternative(d, car.id, 'rideshareAlt', makeValue(250));
  setAlternative(d, car.id, 'transitAlt', makeValue(90));
  return d;
}

const parts = (x) => Object.fromEntries(x.parts.map((p) => [p.key, [p.amount, p.from]]));

test('the condo: what you never get back, next to rent', () => {
  const d = owner();
  assert.deepEqual(validateHousehold(d), []);
  const [condo] = owningCosts(d, buildSummary(d, refs), DAY);
  // Interest: 240,000 x 6% / 12 = 1,200. Tax 300 and insurance 100 from the budget.
  // Maintenance: no line, so the Guess: 310,000 x 1% / 12 = 258.33.
  // Equity 310,000 - 240,000 = 70,000; at the 5% assumption: 70,000 x 5% / 12 = 291.67.
  assert.deepEqual(parts(condo), { interest: [1200, 'debt'], tax: [300, 'budget'], insurance: [100, 'budget'], maintenance: [258.33, 'guess'], opportunity: [291.67, 'assumption'] });
  // 1,200 + 300 + 100 + 258.33 + 291.67 = 2,150.
  assert.deepEqual([condo.equity, condo.neverBack, condo.missing], [70000, 2150, []]);
  // The payment 1,800 builds 1,800 - 1,200 = 600 of equity. To hold it: Housing lines 300 + 100 + 150 = 550, plus the payment = 2,350.
  assert.deepEqual([condo.debt.principal, condo.hold.lines, condo.hold.total], [600, 550, 2350]);
  assert.equal(condo.reading, 'Owning costs you about $2,150 a month you\'ll never get back. Renting a similar place would be about $2,100.');
  // A 3% assumption: 70,000 x 3% / 12 = 175; 2,150 - 291.67 + 175 = 2,033.33.
  setOwnReturn(d, 0.03);
  assert.equal(owningCosts(d, buildSummary(d, refs), DAY)[0].neverBack, 2033.33);
});

test('the car: depreciation from its values, the loan, and the lines, next to Uber and transit', () => {
  const d = owner();
  const car = owningCosts(d, buildSummary(d, refs), DAY)[1];
  // Depreciation: 10,200 on Oct 31, 2025 to 9,000 on Oct 31, 2026, twelve month ends: 1,200 / 12 = 100.
  // Interest: 5,000 x 7.2% / 12 = 30. Insurance 80, maintenance 40, gas 120; parking and tolls not in the budget.
  assert.deepEqual(parts(car), { interest: [30, 'debt'], depreciation: [100, 'values'], insurance: [80, 'budget'], maintenance: [40, 'budget'], parking: [null, null], gas: [120, 'budget'] });
  // 30 + 100 + 80 + 40 + 120 = 370. The alternative: 250 + 90 = 340 (no rental set).
  assert.deepEqual([car.neverBack, car.missing, car.alternative.amount], [370, ['Parking and tolls'], 340]);
  assert.equal(car.reading, 'The car costs about $370 a month you\'ll never get back (not counting parking and tolls). Your trips by Uber and transit would be about $340.');
  // One value only: the Guess, 9,000 x 15% / 12 = 112.50.
  delete d.balances['2025-10'];
  const guessed = owningCosts(d, buildSummary(d, refs), DAY)[1];
  assert.deepEqual(parts(guessed).depreciation, [112.5, 'guess']);
});

test('depreciation counts whole months between month ends, and needs a month at least', () => {
  const o = (date, amount) => ({ date, amount });
  // Sep 30 to Oct 31: one month, 150 down.
  assert.deepEqual(depreciationFromValues([o('2026-09-30', 9150), o('2026-10-31', 9000)], '2026-10-31').amount, 150);
  // Two values ten days apart: not enough.
  assert.equal(depreciationFromValues([o('2026-10-21', 9100), o('2026-10-31', 9000)], '2026-10-31'), null);
});

test('coach notes on an asset are coach-only', () => {
  const d = owner();
  setAccountNotes(d, 'condo', 'Ask about refinancing.');
  assert.equal(viewFor(d, 'client').accounts.find((a) => a.id === 'condo').notes, '');
  assert.equal(viewFor(d, 'coach').accounts.find((a) => a.id === 'condo').notes, 'Ask about refinancing.');
  assert.deepEqual(validateHousehold(d), []);
});
