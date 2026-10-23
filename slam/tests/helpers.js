// Shared test helpers: load the reference data (src/data/*.json) and the demo households
// (src/data/households/*.json, run through the store's migrate so an older file loads as the app
// would load it), compare numbers to a given number of places, and put cash on hand in a checking
// account (store/accounts.js, store/value.js).

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

// Half a unit in the last place, plus float slack: 2 places (cents) for money by default; callers
// pass 5 or 6 for ratios and per-hour or per-paycheck figures. null only matches null (not entered
// is not zero).
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
