/* test/rooms/variance.js — closed months read back. D-128. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry } = t;
  const V = require(path.join(ROOT, 'engines/variance.js'));
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  section('Estimated vs Actual (D-128): one month, the trend, the pattern, one write');
  const rec = (id, est, act, rev) => Schema.createMonthRecord({ month: id, estimated: est, actual: act, actualRevised: rev || null, closedAt: id + '-28T00:00:00Z' });
  const h = Schema.createHousehold({});
  check('nothing closed: the trend says so', V.trend(h).status + '|' + V.trend(h).reason, 'incomplete|No month closed yet. Close one on the Budget and come back.');
  check('nothing closed: the pattern says so', V.perBucket(h).status, 'incomplete');
  h.ledger.months = [rec('2026-07', { income: 400000, expenses: 250000, savings: 50000, investments: 30000, debt: 20000 }, { income: 380000, expenses: 280000, savings: 50000, investments: 30000, debt: 20000 })];
  const s = V.single(h.ledger.months[0]);
  check('one month: five rows', s.rows.length, 5);
  check('income under estimate hurts', s.rows[0].differenceCents + '/' + s.rows[0].hurts, '-20000/true');
  check('expenses over estimate hurts', s.rows[1].differenceCents + '/' + s.rows[1].hurts, '30000/true');
  check('a bucket on its estimate neither', s.rows[2].differenceCents + '/' + s.rows[2].hurts, '0/false');
  check('the share of the estimate', Math.round(s.rows[1].share * 100), 12);
  check('two buckets missed the way that hurts', s.value, 2);
  check('the worst by share is expenses', s.worst.bucket, 'expenses');
  check('one month closed: a trend needs two', V.trend(h).reason, 'One month closed; a trend needs two.');
  h.ledger.months.push(rec('2026-08', { income: 380000, expenses: 280000, savings: 50000, investments: 30000, debt: 20000 }, { income: 390000, expenses: 290000, savings: 40000, investments: 30000, debt: 20000 }, { income: 390000, expenses: 295000, savings: 40000, investments: 30000, debt: 20000 }));
  h.ledger.months.push(rec('2026-09', { income: 390000, expenses: 290000, savings: 40000, investments: 30000, debt: 20000 }, { income: 395000, expenses: 296000, savings: 40000, investments: 30000, debt: 20000 }));
  const tr = V.trend(h);
  checkTrue('three months: the trend renders', Money.isOk(tr) && tr.value === 3);
  check('two lines per bucket, one point a month', tr.series.expenses.actual.length + '/' + tr.series.expenses.estimated.length, '3/3');
  check('the variance each month, expenses', tr.series.expenses.variance.map(v => v.cents).join(','), '30000,10000,6000');
  check('late entries counted when asked', V.trend(h, { revised: true }).series.expenses.variance[1].cents, 15000);
  check('… and not by default', V.single(h.ledger.months[1]).rows[1].actualCents, 290000);
  const pb = V.perBucket(h);
  const exp = pb.rows.filter(r => r.bucket === 'expenses')[0];
  check('per bucket: expenses over every month', exp.sameWay + '/' + exp.months, 'over/3');
  check('… the average miss', exp.averageCents, Math.round((30000 + 10000 + 6000) / 3));
  check('… the last actual', exp.lastActualCents, 296000);
  const sav = pb.rows.filter(r => r.bucket === 'savings')[0];
  check('savings is not off the same way every month', sav.sameWay, null);
  const prop = V.proposal(h, 'expenses', 3);
  check('the proposal is the last three months’ average actual', prop.value + '/' + prop.count, Math.round((280000 + 290000 + 296000) / 3) + '/3');
  check('… or fewer when fewer exist', V.proposal(h, 'expenses', 12).count, 3);
  check('… and says which months', prop.months.join(','), 'July 2026,August 2026,September 2026');

  /* The one write, only when asked. */
  Spine.reset();
  Spine.updateProfile({ ledger: { months: h.ledger.months } });
  check('nothing is written by reading', JSON.stringify(Spine.getProfile().budget.estimated), '{}');
  Spine.setBudgetEstimate('2026-10', 'expenses', prop.value, 'October 2026’s expenses estimate ← the closed months’ average');
  check('the tap writes next month’s estimate', Spine.getProfile().budget.estimated['2026-10'].expenses, prop.value);
  check('with a label that says so', Spine.peekUndo().label, 'October 2026’s expenses estimate ← the closed months’ average');
  check('and the closed months are untouched', Spine.getProfile().ledger.months[2].actual.expenses, 296000);
  Spine.reset();

  const page = fs.readFileSync(path.join(ROOT, 'rooms/variance.html'), 'utf8');
  checkTrue('the page renders the single, the trend and the per-bucket views', /Variance\.single\(/.test(page) && /Variance\.trend\(/.test(page) && /Variance\.perBucket\(/.test(page));
  checkTrue('the one write is behind a button', /data-use=/.test(page) && /Spine\.setBudgetEstimate\(/.test(page));
  checkTrue('and nothing else writes', (page.match(/Spine\.(set|upsert|update|close|revise)[A-Za-z]*\(/g) || []).length === 1);
  const room = Registry.byId('variance');
  checkTrue('registered as a reading after Budget', !!room && room.kind === 'read' && room.order > Registry.byId('budget').order);
};
