'use strict';
/* Property tests for engines/tax.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, TABLES, buildComplete, withField, arbCompleteSpec, prop, same } = H;
const Tax = H.engine('tax');
const ok = (r) => Money.isOk(r);
const gross = fc.integer({ min: 0, max: 200000000 });
const filing = fc.constantFrom.apply(null, H.FILING);

const props = H.generic('tax').concat([
  prop('ordinary tax never exceeds the income it is charged on and never falls as income rises', fc.record({ g: gross, more: fc.integer({ min: 1, max: 10000000 }), fs: filing }), (o) => {
    const a = Tax.ordinaryTax(TABLES.federalBrackets, o.g, o.fs), b = Tax.ordinaryTax(TABLES.federalBrackets, o.g + o.more, o.fs);
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    if (a.value > o.g) return 'tax ' + a.value + ' > income ' + o.g;
    if (b.value < a.value) return 'more income, less tax: ' + a.value + ' -> ' + b.value;
    if (a.value < 0) return 'negative tax';
    return true;
  }),
  prop('FICA is at most 7.65% of wages plus the additional Medicare tax, and never negative', fc.record({ w: gross, fs: filing }), (o) => {
    const r = Tax.fica(TABLES.seTax, o.w, o.fs);
    if (!ok(r)) return 'incomplete: ' + r.reason;
    if (r.value < 0) return 'negative FICA';
    const ceiling = Math.ceil(o.w * 0.0765) + Math.ceil(o.w * 0.009) + 2;
    return r.value <= ceiling || ('FICA ' + r.value + ' > ceiling ' + ceiling);
  }),
  prop('the whole estimate never exceeds gross and never falls as gross rises', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 100000 })), ([s, more]) => {
    const a = Tax.estimate(buildComplete(s), TABLES), b = Tax.estimate(buildComplete(withField(s, 'gross', s.gross + more)), TABLES);
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    if (a.value > s.gross * 100) return 'estimate ' + a.value + ' > gross ' + s.gross * 100;
    if (b.value < a.value) return 'more gross, less tax: ' + a.value + ' -> ' + b.value;
    return true;
  }),
  prop('capital gains tax is zero on no gain and never negative', fc.record({ gains: fc.integer({ min: -1000000, max: 100000000 }), ord: gross, fs: filing }), (o) => {
    const r = Tax.capitalGainsTax(TABLES.federalBrackets, o.gains, o.ord, o.fs);
    if (!ok(r)) return 'incomplete: ' + r.reason;
    if (o.gains <= 0 && r.value !== 0) return 'no gain, tax ' + r.value;
    return r.value >= 0 || 'negative';
  }),
  prop('the same input gives the same estimate twice', arbCompleteSpec, (s) => {
    const h = buildComplete(s);
    return same(Tax.estimate(h, TABLES), Tax.estimate(h, TABLES)) || 'estimate differs between calls';
  })
]);
module.exports = H.suite('tax', props);
if (require.main === module) H.main(module.exports);
