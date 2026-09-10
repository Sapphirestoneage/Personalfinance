'use strict';
/* Property tests for shared/blocks.js (lane 2, section 2, L-2): the
   hypothetical laid on the household, additively. */
const H = require('./_harness.js');
const { fc, Money, Schema, TABLES, build, arbSpec, prop, same } = H;
const B = require(H.ROOT + '/shared/blocks.js');
B.use(TABLES);
const DATE = '2027-03';
function block(id, lines) { return { id, type: 'home', label: 'Block ' + id, status: 'planned', active: true, dates: [{ start: '2027-01', end: null }], replaces: null, answers: {}, lines }; }
const arbLine = fc.record({
  path: fc.constantFrom('expenses.needs.food', 'expenses.needs.accommodation', 'expenses.wants', 'expenses.applied', 'assets.cashCents', 'income.grossAnnualCents'),
  delta: fc.integer({ min: 0, max: 500000 }), kind: fc.constantFrom('monthly', 'annual')
}).map((l) => Object.assign({ id: 'l', label: 'line', source: 'test', confidence: 'convention' }, l));
const spend = (h) => { const m = Schema.monthlyExpensesCents(h); return Money.isOk(m) ? m.value : null; };
const cash = (h) => { const m = Schema.cashCents(h); return Money.isOk(m) ? m.value : null; };
const gross = (h) => { const m = Schema.grossAnnualIncomeCents(h); return Money.isOk(m) ? m.value : null; };

const props = [
  prop('no blocks: the household comes back with every number unchanged and the input untouched', arbSpec, (spec) => {
    const h = build(spec);
    const before = JSON.stringify(h);
    const out = B.applyAll(h, [], DATE);
    if (JSON.stringify(h) !== before) return 'applyAll changed its input';
    const strip = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.meta.blocksAt; delete y.meta.blocksApplied; return y; };
    return same(strip(h), strip(out)) || 'a number changed with no blocks';
  }),
  prop('two additive blocks equal the sum of each applied alone (spending, cash, gross)', fc.tuple(arbSpec, arbLine, arbLine), ([spec, la, lb]) => {
    const h = build(spec);
    const a = B.applyAll(h, [block('a', [la])], DATE), b = B.applyAll(h, [block('b', [lb])], DATE), ab = B.applyAll(h, [block('a', [la]), block('b', [lb])], DATE);
    const checks = [['spending', spend], ['cash', cash], ['gross', gross]];
    for (const [name, f] of checks) {
      const h0 = f(h), fa = f(a), fb = f(b), fab = f(ab);
      if (fa === null || fb === null || fab === null) continue;
      const base = h0 === null ? 0 : h0;
      if (Math.abs((fa - base) + (fb - base) - (fab - base)) > 1) return name + ': a alone +' + (fa - base) + ', b alone +' + (fb - base) + ', both +' + (fab - base);
    }
    return true;
  }, 'Only when the line lands on an already-entered number: a blank line takes the delta as its whole, which is additive too but from a null base.'),
  prop('the same blocks applied twice give the same household', fc.tuple(arbSpec, arbLine), ([spec, l]) => {
    const h = build(spec);
    const a = B.applyAll(h, [block('a', [l])], DATE), b = B.applyAll(h, [block('a', [l])], DATE);
    if (same(a, b)) return true;
    const noIds = (x) => JSON.stringify(x, (k, v) => (k === 'id' || k === 'personId' ? undefined : v));
    return noIds(a) === noIds(b) ? 'differs only in generated ids (Schema.newId) for a source or asset the block created; every number matches' : 'applyAll differs between calls in a number';
  })
];
module.exports = H.suite('blocks', props);
if (require.main === module) H.main(module.exports);
