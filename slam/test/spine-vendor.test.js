// The vendored cashcal.js (S-203) must not drift from money-rooms-v3/engine/cashcal.js:
// everything below the import block is byte-identical, and loanmath.js is a byte copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM } from './spine-helpers.js';

const ROOT = SLAM + '../';
const afterImports = (src) => src.split('\n').filter((l) => !/^import /.test(l)).join('\n').replace(/^\/\*[\s\S]*?\*\/\n/, '');

test('vendored cashcal.js is the Money Rooms engine below its import block', () => {
  const ours = readFileSync(SLAM + 'engine/vendor/cashcal.js', 'utf8');
  const theirs = readFileSync(ROOT + 'money-rooms-v3/engine/cashcal.js', 'utf8');
  assert.equal(afterImports(ours), afterImports(theirs), 'engine/vendor/cashcal.js drifted from money-rooms-v3/engine/cashcal.js: re-vendor it (keep the header and the one shim import)');
  // The original's imports are the six names the shim provides, plus levelPayment.
  const names = [...theirs.matchAll(/^import \{ ([^}]+) \} from/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
  assert.deepEqual(names.sort(), ['hasValue', 'isQ', 'levelPayment', 'monthlyOf', 'numberOf', 'paychecksPerYear', 'setSection', 'shareOf'], 'the original gained or lost an import: update mr3-shims.js');
});

test('vendored loanmath.js is a byte copy', () => {
  assert.equal(readFileSync(SLAM + 'engine/vendor/loanmath.js', 'utf8'), readFileSync(ROOT + 'money-rooms-v3/engine/loanmath.js', 'utf8'));
});
