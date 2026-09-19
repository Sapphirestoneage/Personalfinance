'use strict';
/* Property tests for engines/gap.js (lane 2; D-248): the levels are a
   reading of which inputs are in; the money is engines/debt.js's. */
const H = require('./_harness.js');
const { fc, Money, TABLES, buildComplete, arbCompleteSpec, prop } = H;
const Gap = H.engine('gap');
const Debt = H.engine('debt');

const props = H.generic('gap').concat([
  prop('levels are reached in order: the level you are on is a prefix', arbCompleteSpec, (s) => {
    const g = Gap.levels(buildComplete(s), TABLES);
    for (let i = 0; i < g.reachedCount; i++) if (!g.levels[i].reached) return 'level ' + (i + 1) + ' not reached below the current level ' + g.reachedCount;
    if (g.reachedCount < g.total && g.levels[g.reachedCount].reached === true && g.next && g.next.n <= g.reachedCount) return 'next is not above current';
    return true;
  }),
  prop('the gap at levels 2 and 3 is the debt engine\'s free-monthly figure', arbCompleteSpec, (s) => {
    const h = buildComplete(s);
    const g = Gap.levels(h, TABLES);
    const free = Debt.freeMonthlyCents(h, TABLES);
    for (const l of g.levels) {
      if (!l.reached || l.id === 'rough' || l.id === 'actual') continue;
      if (!Money.isOk(free) || l.gapCents !== free.value) return l.id + ' gap ' + l.gapCents + ' vs engine ' + (Money.isOk(free) ? free.value : free.reason);
    }
    return true;
  }),
  prop('every missing input is a link into a room', arbCompleteSpec, (s) => {
    const g = Gap.levels(buildComplete(s), TABLES);
    for (const l of g.levels) for (const m of l.missing) if (!/^rooms\/.+\.html/.test(m.href)) return l.id + ': ' + m.fieldId + ' has no room link';
    return true;
  })
]);
module.exports = H.suite('gap', props);
if (require.main === module) H.main(module.exports);
