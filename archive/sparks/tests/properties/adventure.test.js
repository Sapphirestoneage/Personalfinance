'use strict';
/* Property tests for engines/adventure.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, TABLES, buildComplete, arbCompleteSpec, prop } = H;
const A = H.engine('adventure');
const ok = (r) => Money.isOk(r);
const pathIds = fc.constantFrom('drift', 'steady', 'hustle', 'househack', 'combo');

const props = H.generic('adventure').concat([
  prop('applying a shock leaves the household byte-identical, and a headwind never ends with a bigger pot', fc.tuple(arbCompleteSpec, pathIds, fc.constantFrom('crash', 'jobloss', 'inflation')), ([s, pathId, shockId]) => {
    const h = buildComplete(s);
    const before = JSON.stringify(h);
    const plain = A.run(h, TABLES, { pathId });
    const shocked = A.run(h, TABLES, { pathId, shockIds: [shockId] });
    if (JSON.stringify(h) !== before) return 'run changed the household';
    if (!ok(plain) || !ok(shocked)) return true;
    const net = (r) => r.value.portfolioCents - (r.value.borrowedCents || 0);
    return net(shocked) <= net(plain) || (shockId + ' ended with ' + net(shocked) + ' net > ' + net(plain) + ' unshocked (portfolio ' + shocked.value.portfolioCents + ' vs ' + plain.value.portfolioCents + ', borrowed ' + shocked.value.borrowedCents + ' vs ' + plain.value.borrowedCents + ')');
  }, 'Net of anything borrowed: a shock that stops income can leave a smaller pot and a bigger loan, and the two are compared together.'),
  prop('a tailwind never ends with a smaller pot', fc.tuple(arbCompleteSpec, pathIds), ([s, pathId]) => {
    const h = buildComplete(s);
    const plain = A.run(h, TABLES, { pathId }), raised = A.run(h, TABLES, { pathId, shockIds: ['raise'] });
    if (!ok(plain) || !ok(raised)) return true;
    const net = (r) => r.value.portfolioCents - (r.value.borrowedCents || 0);
    return net(raised) >= net(plain) || ('raise ended with ' + net(raised) + ' net < ' + net(plain));
  }),
  prop('every way through but Drift holds or cuts year-one spending against the baseline', fc.tuple(arbCompleteSpec, fc.constantFrom('steady', 'hustle', 'househack', 'combo')), ([s, pathId]) => {
    const h = buildComplete(s);
    const base = A.baseline(h, TABLES), run = A.run(h, TABLES, { pathId });
    if (!ok(base) || !ok(run)) return true;
    const first = run.value.rows && run.value.rows[0];
    if (!first) return 'no rows';
    return first.spendCents <= base.value.annualSpendCents + 1 || ('year-one spend ' + first.spendCents + ' above the baseline ' + base.value.annualSpendCents + ' on ' + pathId);
  }, 'Drift is the one way that spends the raise, so its year-one spending sits above the baseline by design.')
]);
module.exports = H.suite('adventure', props, [
  'Six months without work (jobloss) on a household already in deficit ends with LESS borrowed than the unshocked run: in the shrunk case (gross $1 a year, $1 a month of food) the shock year adds $605 of borrowing against a $1,159 shortfall, where every other year adds the full $1,108. The half-year of lost income seems to be applied to the net of the year rather than to the income alone. Small numbers, but the sign is wrong: a headwind helped.'
]);
if (require.main === module) H.main(module.exports);
