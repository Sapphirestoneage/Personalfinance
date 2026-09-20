'use strict';
/* Property tests for engines/recipes.js (lane 2, section 2, L-2). The four
   generic properties, plus the two that matter for a table of readings: every
   one of them is a Result on any household, and a reading is never a number
   pulled out of nothing. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, build, arbSpec } = H;
const Schema = require('../../shared/schema.js');
const R = H.engine('recipes');

const props = H.generic('recipes').concat([
  prop('every reading answers with a Result, on any household', arbSpec, (spec) => {
    const h = build(spec);
    for (const id of R.IMPLEMENTED) {
      const r = R.value(id, h, TABLES);
      if (!r || typeof r.status !== 'string') return id + ' answered ' + JSON.stringify(r);
      if (r.status !== 'ok' && typeof r.reason !== 'string') return id + ' is incomplete without a reason';
      if (Money.isOk(r) && typeof r.value === 'number' && !Number.isFinite(r.value)) return id + ' = ' + r.value;
    }
    return true;
  }),
  prop('a reading this file does not know answers null, rather than a figure', fc.string(), (name) => {
    if (R.IMPLEMENTED.indexOf(name) >= 0) return true;
    return R.value(name, Schema.createHousehold({}), TABLES) === null || (name + ' answered something');
  }),
  /* Empty is not zero (D-002): a household with nothing entered has no
     readings at all, rather than a page of 0%. */
  prop('an empty household has no reading', fc.constant(null), () => {
    const h = Schema.createHousehold({});
    const any = R.IMPLEMENTED.filter((id) => Money.isOk(R.value(id, h, TABLES)));
    return any.length === 0 || ('read ' + any.join(', ') + ' from nothing');
  })
]);

module.exports = H.suite('recipes', props);
if (require.main === module) H.main(module.exports);
