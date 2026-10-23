/* test/rooms/manage.js — hide, set aside, restore, and the archive prompt. D-128 (7). */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, TABLES } = t;
  const Manage = require(path.join(ROOT, 'shared/manage.js'));
  const Ledger = require(path.join(ROOT, 'engines/ledger.js'));
  const Budget = require(path.join(ROOT, 'engines/budget.js'));
  const CashFlow = require(path.join(ROOT, 'engines/cashflow.js'));
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  section('Manage sources (D-128): hidden still counts, set aside stops, closed months keep the past');
  const T = TABLES, CAT = TABLES.expenseCategories, NOW = Date.parse('2026-10-05T12:00:00');
  const items = [{ id: 'a', label: 'A', hidden: false, active: true }, { id: 'b', label: 'B', hidden: true, active: true }, { id: 'c', label: 'C', hidden: false, active: false }, { id: 'd', label: 'D', hidden: true, active: false }];
  check('three states', Manage.STATES.join(','), 'active,hidden,archived');
  check('active: shown and counted', Manage.filter(items, 'active').map(i => i.id).join(','), 'a');
  check('hidden: off the list, still counted', Manage.filter(items, 'hidden').map(i => i.id).join(','), 'b');
  check('archived wins over hidden', Manage.filter(items, 'archived').map(i => i.id).join(','), 'c,d');
  check('counts', JSON.stringify(Manage.counts(items)), '{"active":1,"hidden":1,"archived":2}');
  checkTrue('the panel offers restore only to the set-aside', /data-manage="restore"/.test(Manage.panel(items, 'archived')) && !/data-manage="restore"/.test(Manage.panel(items, 'active')));
  checkTrue('and hide plus set aside to the active', /data-manage="hide"/.test(Manage.panel(items, 'active')) && /data-manage="archive"/.test(Manage.panel(items, 'active')));

  Spine.reset();
  Spine.updateProfile({ filingStatus: 'single', state: 'NC', people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'P', grossAnnualIncomeCents: 7200000 })] })] });
  Spine.upsertIncomeEntry({ id: 'pay', kind: 'w2', label: 'Day job', amountCents: 250000, frequency: 'fortnightly', receivedOn: '2026-09-04' });
  Spine.upsertIncomeEntry({ id: 'gig', kind: 'se', label: 'One-off gig', amountCents: 200000, frequency: 'once', receivedOn: '2026-09-10' });
  Spine.upsertExpenseEntry(Schema.createExpenseEntry({ id: 'rent', categoryId: 'housing', amountCents: 150000, period: 'monthly', date: '2026-09-01', source: 'log' }));
  let h = Spine.getProfile();
  const before = Ledger.month(h, T, '2026-09').takeHomeCents;
  /* Hide: cosmetic. */
  Spine.upsertIncomeEntry({ id: 'gig', hidden: true });
  h = Spine.getProfile();
  check('a hidden entry still counts in the month', Ledger.month(h, T, '2026-09').takeHomeCents, before);
  check('… and is off the active list', Manage.filter(h.ledger.income, 'active').map(e => e.id).join(','), 'pay');
  Spine.upsertIncomeEntry({ id: 'gig', hidden: false });
  /* Close September with the gig in it. */
  h = Spine.getProfile();
  const r = Spine.closeMonth(Budget.recordPayload(h, T, CAT, '2026-09', Date.parse('2026-09-30T12:00:00')));
  checkTrue('September closes with the gig in it', r.ok && r.record.lines.income.some(l => l.id === 'gig'));
  /* The prompt: a one-time entry whose month closed, not yet answered. */
  h = Spine.getProfile();
  const mk = e => ({ id: e.id, label: e.label, hidden: e.hidden, active: e.active, once: e.frequency === 'once', month: e.receivedOn ? e.receivedOn.slice(0, 7) : null });
  const due = Manage.suggestArchive(h.ledger.income.map(mk), m => Budget.isClosed(h, m), h.ledger.dismissed);
  check('the one-off gig is suggested for setting aside', due.map(i => i.id).join(','), 'gig');
  Spine.set('ledger.dismissed', ['gig']);
  h = Spine.getProfile();
  check('… until it is waved away', Manage.suggestArchive(h.ledger.income.map(mk), m => Budget.isClosed(h, m), h.ledger.dismissed).length, 0);
  /* Archive: stops counting; the closed month is untouched. */
  Spine.upsertIncomeEntry({ id: 'gig', active: false });
  h = Spine.getProfile();
  const oct = Budget.month(h, T, CAT, '2026-10', NOW);
  check('October expects the paycheque only', oct.rows[0].lines.map(l => l.id).join(','), 'pay');
  checkTrue('an archived entry is out of the month’s income', !Ledger.month(h, T, '2026-10').rows.some(r => r.entry.id === 'gig'));
  const sep = Budget.recordFor(h, '2026-09');
  checkTrue('September’s record still shows the gig in full', sep.lines.income.some(l => l.id === 'gig' && l.cents > 0) && sep.actual.income === r.record.actual.income);
  check('the estimate for October comes from September’s closed actual, gig and all', oct.rows[0].estimatedCents + '/' + oct.rows[0].estBasis, sep.actual.income + '/lastClosed');
  /* Restore: active again, no backfill, a fresh estimate. */
  Spine.upsertIncomeEntry({ id: 'gig', active: true });
  h = Spine.getProfile();
  check('restored: active again', h.ledger.income[1].active, true);
  check('… counted again where it lands', Ledger.activeEntries(h).length, 2);
  check('… and the closed month still untouched', Budget.recordFor(h, '2026-09').actual.income, r.record.actual.income);
  /* The log too. */
  Spine.upsertExpenseEntry({ id: 'rent', hidden: true });
  h = Spine.getProfile();
  check('a hidden logged line still counts', CashFlow.logInMonth(h, CAT, '2026-10').byBucket.expenses, 150000);
  Spine.upsertExpenseEntry({ id: 'rent', active: false });
  h = Spine.getProfile();
  check('a set-aside logged line does not', CashFlow.logInMonth(h, CAT, '2026-10').byBucket.expenses, 0);
  check('… but September’s record kept it', Budget.recordFor(h, '2026-09').actual.expenses, 150000);
  Spine.reset();

  const inc = fs.readFileSync(path.join(ROOT, 'rooms/income.html'), 'utf8');
  const cf = fs.readFileSync(path.join(ROOT, 'rooms/cash-flow.html'), 'utf8');
  checkTrue('Income has the manage panel with the three chips', /Manage\.panel\(/.test(inc) && /btn-manage/.test(inc));
  checkTrue('… and the archive prompt', /Manage\.suggestArchive\(/.test(inc) && /data-prompt="dismiss"/.test(inc));
  checkTrue('the expense log has the manage panel too', /Manage\.panel\(/.test(cf) && /btn-manage-log/.test(cf));
  checkTrue('the default list on Income leaves hidden and set-aside out', /e\.active !== false && !e\.hidden/.test(inc));
};
