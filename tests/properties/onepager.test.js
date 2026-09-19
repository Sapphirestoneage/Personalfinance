'use strict';
/* Property tests for engines/onepager.js (lane 2, section 2, L-2). The four
   generic properties, plus: the Public page never carries a dollar figure,
   a blank row is blank and never $0, and every audience's sections are a
   subset of the nine. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbSpec, build } = H;
const O = H.engine('onepager');
const audiences = O.AUDIENCES.map((a) => a.id);

const props = H.generic('onepager').concat([
  prop('the Public page never carries a dollar figure; blank rows are blank; sections come from the nine', fc.record({ spec: arbSpec, audience: fc.constantFrom.apply(null, audiences) }), (o) => {
    const h = build(o.spec);
    const pub = O.build(h, TABLES, { audience: o.audience, version: 'public' }), priv = O.build(h, TABLES, { audience: o.audience, version: 'private' });
    if (!Money.isOk(pub) || !Money.isOk(priv)) return 'not ok';
    if (/\$/.test(O.text(pub))) return 'a dollar figure on the Public page';
    if (pub.value.some((s) => s.rows.some((r) => r.kind === 'cents'))) return 'a cents row on the Public page';
    for (const s of priv.value) {
      if (O.SECTIONS.map((x) => x.id).indexOf(s.id) < 0) return 'section ' + s.id;
      for (const r of s.rows) {
        if (r.blank && r.text !== '') return r.label + ' blank but shows ' + r.text;
        if (r.text === '$0' && r.kind === 'cents' && r.value === null) return r.label + ' shows $0 for nothing';
      }
    }
    return true;
  })
]);
module.exports = H.suite('onepager', props);
if (require.main === module) H.main(module.exports);
