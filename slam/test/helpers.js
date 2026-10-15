// Shared test helpers: load reference data and test households from disk.

import { readFileSync } from 'node:fs';
import { migrate } from '../src/store/migrate.js';

const root = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

export function loadRefs() {
  return {
    tax: readJson('data/tax-constants.json'),
    benchmarks: readJson('data/benchmarks.json'),
    averages: readJson('data/spending-averages.json'),
    colTiers: readJson('data/col-tiers.json'),
    merchantRules: readJson('data/merchant-rules.json')
  };
}

export function loadHousehold(name) {
  return migrate(readJson('test/households/' + name + '.json'));
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
