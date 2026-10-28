// NYC and Yonkers income tax (S-272), golden by hand. NYC: 3.078% / 3.762% / 3.819% / 3.876% on New York State
// taxable income (single and separate: $12,000 / $25,000 / $50,000; joint: $21,600 / $45,000 / $90,000). Yonkers: 16.75%
// of the New York State tax. Both join the state line, so take-home, the balance due and the set-aside see them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRules } from './spine-helpers.js';
import { computeTax } from '../engine/tax.js';

const R = loadRules(), Y = 2026;
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, a + ' is not ' + b);
const base = { state: 'NY', ficaWages: null, seNet: 0, unemployment: 0, otherOrdinary: 0, conversions: 0, ltcg: 0, qualifiedDividends: 0, hsaDeduction: 0, withheldFederal: 0, withheldState: 0, estimatedFederal: 0, estimatedState: 0 };

test('an NYC single filer on $90,000 of wages', () => {
  const T = 90000 - R.get('NY_STD_S', Y);
  const nyc = 12000 * 0.03078 + 13000 * 0.03762 + 25000 * 0.03819 + (T - 50000) * 0.03876;
  const city = computeTax({ ...base, filingStatus: 'single', wages: 90000, locality: 'nyc' }, R, Y);
  const upstate = computeTax({ ...base, filingStatus: 'single', wages: 90000, locality: null }, R, Y);
  near(city.lines.localTax.value, nyc);
  near(city.lines.stateTax.value, upstate.lines.stateTax.value + nyc);
  near(city.lines.balanceDue.value, upstate.lines.balanceDue.value + nyc);
  assert.ok(city.lines.stateTax.rules.includes('NYC_BRK_S'));
  near(city.lines.marginalState.value, upstate.lines.marginalState.value + 0.03876);
});

test('an NYC joint couple on $180,000 of wages', () => {
  const T = 180000 - R.get('NY_STD_J', Y);
  const nyc = 21600 * 0.03078 + 23400 * 0.03762 + 45000 * 0.03819 + (T - 90000) * 0.03876;
  const x = computeTax({ ...base, filingStatus: 'mfj', wages: 180000, locality: 'nyc' }, R, Y);
  near(x.lines.localTax.value, nyc);
  assert.ok(x.lines.stateTax.rules.includes('NYC_BRK_J'));
});

test('a Yonkers resident pays 16.75% of the state tax on top', () => {
  const x = computeTax({ ...base, filingStatus: 'single', wages: 70000, locality: 'yonkers' }, R, Y);
  near(x.lines.localTax.value, x.lines.nysTax.value * 0.1675);
  near(x.lines.stateTax.value, x.lines.nysTax.value * 1.1675);
});

// The owner's check sheet (S-279) is the rules as the engine reads them, never a copy that drifts.
import { nycRatesDoc } from '../tools/nyc-rates-doc.mjs';
import { readFileSync as rf } from 'node:fs';
test('docs/NYC_RATES_TO_CHECK.md is up to date (node tools/nyc-rates-doc.mjs)', () => {
  assert.equal(rf(new URL('../docs/NYC_RATES_TO_CHECK.md', import.meta.url), 'utf8'), nycRatesDoc());
});
