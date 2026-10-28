// The housing line (owner, 2026-10-28): 30% of take-home with a car, 35% without.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasCar, housingRefRule } from '../engine/profile.js';
import { loadRules } from './spine-helpers.js';

const demo = JSON.parse(readFileSync(new URL('../fixtures/demo.json', import.meta.url)));
test('the house defaults: 30% with a car, 35% without', () => {
  const R = loadRules();
  assert.equal(R.get('APP_HOUSING_REF_CAR', 2026), 0.3);
  assert.equal(R.get('APP_HOUSING_REF', 2026), 0.35);
});
test('a car in Assets, a car loan, or getting around by car picks the 30% line', () => {
  const none = { ...demo, accounts: (demo.accounts || []).filter((x) => x.type !== 'car'), debts: (demo.debts || []).filter((x) => x.type !== 'auto_loan'), profile: undefined };
  assert.equal(hasCar(none), false);
  assert.equal(housingRefRule(none), 'APP_HOUSING_REF');
  assert.equal(housingRefRule({ ...none, accounts: [...none.accounts, { id: 'c', family: 'otherAssets', type: 'car' }] }), 'APP_HOUSING_REF_CAR');
  assert.equal(housingRefRule({ ...none, debts: [...none.debts, { id: 'l', family: 'debt', type: 'auto_loan' }] }), 'APP_HOUSING_REF_CAR');
});
