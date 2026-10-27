// Shared loaders for the Phase 1 spine tests (Node only).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRules, withHouse } from '../engine/rules.js';

export const SLAM = fileURLToPath(new URL('..', import.meta.url));
export const readJson = (rel) => JSON.parse(readFileSync(SLAM + rel, 'utf8'));
export const exists = (rel) => existsSync(SLAM + rel);
// The law's yearly file with Eli's house defaults laid in (data/house-defaults.json), as every page loads them.
export const lawAndHouse = (reg = readJson('data/rules-2026.json'), houseOverrides) => withHouse(reg, readJson('data/house-defaults.json'), houseOverrides);
export const loadRules = (houseOverrides) => makeRules(lawAndHouse(undefined, houseOverrides));
// The demo with nothing logged (no spend log, no learned merchants), for tests written against an empty log; the
// demo's own three made-up months of actuals are for the Budget view (test/budget.test.js).
export const emptyLog = (s) => { const x = { ...s }; delete x.log; delete x.feed; return x; };
