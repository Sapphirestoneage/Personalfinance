// Shared test helpers: load reference data and test households from disk.

import { readFileSync } from 'node:fs';
import { migrate } from '../src/store/migrate.js';
import { addAccount, setBalance } from '../src/store/accounts.js';
import { makeValue } from '../src/store/value.js';

const root = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

export function loadRefs() {
  return {
    tax: readJson('src/data/tax-constants.json'),
    benchmarks: readJson('src/data/benchmarks.json'),
    averages: readJson('src/data/spending-averages.json'),
    merchantRules: readJson('src/data/merchant-rules.json'),
    subcategoryIdeas: readJson('src/data/subcategory-ideas.json'),
    eraTemplates: readJson('src/data/era-templates.json')
  };
}

export function loadHousehold(name) {
  return migrate(readJson('src/data/households/' + name + '.json'));
}

export function readText(p) {
  return readFileSync(new URL(p, root), 'utf8');
}

// Cents-level comparison for money; 4 decimals for ratios.
export function near(actual, expected, places = 2) {
  if (expected === null) return actual === null;
  if (actual === null || actual === undefined) return false;
  return Math.abs(actual - expected) < 0.5 * Math.pow(10, -places) + 1e-9;
}

// Cash on hand now lives in account balances (S-084): one checking account
// whose start for the month being worked on is the amount.
export function withCashOnHand(doc, amount) {
  const a = addAccount(doc, { name: 'Checking', type: 'checking' });
  setBalance(doc, doc.currentMonth, a.id, 'start', makeValue(amount, { cadence: 'one-off' }));
  return a;
}
