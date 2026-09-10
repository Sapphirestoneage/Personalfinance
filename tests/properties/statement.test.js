'use strict';
/* Property tests for engines/statement.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, Schema, TABLES, build, arbSpec, prop } = H;
const Statement = H.engine('statement');
const ok = (r) => Money.isOk(r);

const props = H.generic('statement').concat([
  prop('confidence-weighted net worth never exceeds plain net worth (weights are at most 1)', arbSpec, (spec) => {
    const r = Statement.confidenceWeightedNetWorth(build(spec), TABLES.confidenceWeights);
    if (!ok(r)) return true;
    return r.value <= r.plainNetWorthCents || ('weighted ' + r.value + ' > plain ' + r.plainNetWorthCents);
  }),
  prop('the portfolios add up to every valued asset, each in exactly one bucket', arbSpec, (spec) => {
    const h = build(spec);
    const r = Statement.portfolios(h, TABLES.accessRules);
    if (!ok(r)) return true;
    const buckets = Object.keys(r.buckets || {}).map((k) => r.buckets[k]);
    const sum = buckets.reduce((t, b) => t + b.totalCents, 0);
    const count = buckets.reduce((t, b) => t + b.assets.length, 0);
    const valued = (h.assets || []).filter((a) => Money.isEntered(a.valueCents)).length;
    if (sum !== r.value) return 'buckets sum to ' + sum + ', total says ' + r.value;
    if (count !== valued) return count + ' assets bucketed, ' + valued + ' valued';
    return true;
  })
]);
module.exports = H.suite('statement', props, [
  'After-tax value of a holding (at most its listed value; Roth equal to listed) has no engine yet: after-tax assets arrive with section 15 of the master build. The property is deferred until the shape lands.'
]);
if (require.main === module) H.main(module.exports);
