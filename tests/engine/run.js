/* ==========================================================================
   tests/engine/run.js, the engine's own suite. `node tests/engine/run.js`
   (also run by `npm test` in tests/). Plain node, no dependencies.
   Parts: tax cases worked by hand (tax-cases.js), the corpus and its
   invariants (invariants.js), compare() (compare.js), the golden household
   from the owner's sheet (golden.js, a slot until the sheet arrives).
   ========================================================================== */
var failures = [], passed = 0;
function check(name, actual, expected, tol) {
  var ok = typeof expected === 'number' && typeof actual === 'number' ? Math.abs(actual - expected) <= (tol || 0) : actual === expected;
  if (ok) passed++; else failures.push(name + ': got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
}
function checkTrue(name, cond, detail) { if (cond) passed++; else failures.push(name + (detail ? ': ' + detail : '')); }
function section(t) { console.log('\n== ' + t); }
var ctx = { check: check, checkTrue: checkTrue, section: section };

require('./tax-cases.js')(ctx);
require('./invariants.js')(ctx);
require('./compare.js')(ctx);
require('./golden.js')(ctx);

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
failures.forEach(function (f) { console.log('  FAIL ' + f); });
process.exit(failures.length ? 1 : 0);
