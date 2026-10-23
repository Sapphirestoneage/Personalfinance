// Shared loader for the golden household tests (Node only). Not a test file.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { makeRules } from '../../engine/rules.js';
import { loadHousehold } from '../../engine/normalize.js';
import { validate } from '../../engine/schema.js';
import { applyDefaults } from '../../engine/defaults.js';

export const SLAM = fileURLToPath(new URL('../../', import.meta.url));
export const readJson = (rel) => JSON.parse(readFileSync(SLAM + rel, 'utf8'));
export const R = makeRules(readJson('data/rules-2026.json'));

// The household as the pages load it: validated, then house defaults applied.
export function loadGolden(id) {
  const spine = applyDefaults(loadHousehold(readJson('tests/golden/households/' + id + '.json')), R);
  const r = validate(spine);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
  return spine;
}

export const near = (a, b, eps = 0.01, what = '') => assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= eps, (what ? what + ': ' : '') + a + ' is not within ' + eps + ' of ' + b);

// A known failure: the test runs and reports as "todo" so the suite stays green
// while the engine is being changed elsewhere. The reason names the bug.
export const KNOWN = (reason) => ({ todo: 'known failure: ' + reason });
