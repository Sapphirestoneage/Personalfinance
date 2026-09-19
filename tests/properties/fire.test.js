'use strict';
/* Property tests for engines/fire.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, TABLES, buildComplete, withField, arbCompleteSpec, prop } = H;
const Fire = H.engine('fire');
const ok = (r) => Money.isOk(r);

const props = H.generic('fire').concat([
  prop('every variant target rises when spending rises', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 5000 }), fc.constantFrom('standard', 'lean', 'chubby', 'fat')), ([s, more, variantId]) => {
    const a = Fire.calculateFIRE(buildComplete(s), TABLES, { variantId });
    const b = Fire.calculateFIRE(buildComplete(withField(s, 'wants', s.wants + more)), TABLES, { variantId });
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    return b.value > a.value || (variantId + ' target went ' + a.value + ' -> ' + b.value + ' with spending up');
  }),
  prop('lean <= standard <= chubby <= fat', arbCompleteSpec, (s) => {
    const h = buildComplete(s);
    const v = ['lean', 'standard', 'chubby', 'fat'].map((id) => Fire.calculateFIRE(h, TABLES, { variantId: id }));
    if (v.some((r) => !ok(r))) return 'incomplete';
    for (let i = 1; i < v.length; i++) if (v[i].value < v[i - 1].value) return 'variant order broken: ' + v.map((r) => r.value).join(' <= ');
    return true;
  }),
  prop('the FI date never moves earlier when spending rises or income falls', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 3000 }), fc.integer({ min: 1, max: 50000 })), ([s, more, less]) => {
    const base = Fire.progressToward(buildComplete(s), TABLES);
    if (!ok(base) || !base.yearsAway || !ok(base.yearsAway)) return true;
    const up = Fire.progressToward(buildComplete(withField(s, 'wants', s.wants + more)), TABLES);
    const down = Fire.progressToward(buildComplete(withField(s, 'gross', Math.max(1, s.gross - less))), TABLES);
    if (ok(up) && up.yearsAway && ok(up.yearsAway) && up.yearsAway.value < base.yearsAway.value) return 'spending up, years away ' + base.yearsAway.value + ' -> ' + up.yearsAway.value;
    if (ok(down) && down.yearsAway && ok(down.yearsAway) && down.yearsAway.value < base.yearsAway.value) return 'income down, years away ' + base.yearsAway.value + ' -> ' + down.yearsAway.value;
    return true;
  })
]);
module.exports = H.suite('fire', props);
if (require.main === module) H.main(module.exports);
