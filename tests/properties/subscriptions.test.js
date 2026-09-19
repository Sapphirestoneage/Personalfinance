'use strict';
/* Property tests for engines/subscriptions.js (lane 2, section 2, L-2). The
   four generic properties, plus: a charge that repeats every month at the
   same amount is found as one subscription with that many charges, and a
   log with nothing in it leaks nothing. */
const H = require('./_harness.js');
const { fc, prop, Schema, TABLES, arbSpec, build } = H;
const S = H.engine('subscriptions');
const rhythms = (S.RHYTHMS || []).map((r) => (r && r.id) || r);
const statuses = Array.isArray(S.STATUSES) ? S.STATUSES : Object.keys(S.STATUSES || {});

function withLog(spec, entries) {
  const h = build(spec);
  h.expenses = Schema.createExpenses(h.expenses);
  h.expenses.entries = entries;
  return h;
}

const props = H.generic('subscriptions').concat([
  prop('an empty log finds nothing and leaks nothing', arbSpec, (spec) => {
    const h = withLog(spec, []);
    const found = S.find(h, TABLES), leak = S.leak(h, TABLES);
    if (found.length) return found.length + ' subscriptions in an empty log';
    return (leak.count === 0 && leak.yearlyCents === 0) || ('leak ' + JSON.stringify(leak));
  }),
  prop('the same charge every month for N months is one subscription with N charges, a rhythm the engine names, whole cents a year', fc.record({ spec: arbSpec, n: fc.integer({ min: 3, max: 12 }), cents: fc.integer({ min: 100, max: 20000 }), day: fc.integer({ min: 1, max: 28 }) }), (o) => {
    const entries = [];
    for (let i = 0; i < o.n; i++) {
      const m = i + 1;
      entries.push(Schema.createExpenseEntry({ id: 'e' + i, categoryId: 'subscriptions', period: 'once', amountCents: o.cents, date: '2026-' + String(m).padStart(2, '0') + '-' + String(o.day).padStart(2, '0'), descriptor: 'STREAMFLIX' }));
    }
    const found = S.find(withLog(o.spec, entries), TABLES);
    if (found.length !== 1) return found.length + ' subscriptions for one repeating charge';
    const f = found[0];
    if (f.count !== o.n) return 'count ' + f.count + ' for ' + o.n + ' charges';
    if (rhythms.length && rhythms.indexOf(f.rhythm) < 0) return 'rhythm ' + f.rhythm;
    if (f.status !== null && statuses.length && statuses.indexOf(f.status) < 0) return 'status ' + f.status;
    if (!Number.isInteger(f.yearlyCents) || f.yearlyCents <= 0) return 'yearlyCents ' + f.yearlyCents;
    return f.typicalCents === o.cents || ('typical ' + f.typicalCents + ' for ' + o.cents);
  })
]);
module.exports = H.suite('subscriptions', props);
if (require.main === module) H.main(module.exports);
