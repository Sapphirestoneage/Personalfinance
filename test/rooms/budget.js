/* test/rooms/budget.js — the reflected budget and the month-end close. D-128. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, TABLES } = t;
  const Budget = require(path.join(ROOT, 'engines/budget.js'));
  const Ledger = require(path.join(ROOT, 'engines/ledger.js'));
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  section('Budget (D-128): estimated beside actual, nothing typed, closed once');
  const T = TABLES, CAT = TABLES.expenseCategories;
  const NOW = Date.parse('2026-09-20T12:00:00');

  Spine.reset();
  Spine.updateProfile({ filingStatus: 'single', state: 'NC',
    people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'P', grossAnnualIncomeCents: 7200000 })] })],
    retirement: { contributionPercent: 5 } });
  let h = Spine.getProfile();
  /* First load, nothing logged, nothing closed: estimates from onboarding. */
  let sheet = Budget.month(h, T, CAT, '2026-09', NOW);
  check('the sheet is the open month', sheet.status + '/' + sheet.canClose, 'open/true');
  const rowOf = (s, b) => s.rows.filter(r => r.bucket === b)[0];
  check('income estimate is take-home a month, from Start Here', rowOf(sheet, 'income').estimatedCents + '/' + rowOf(sheet, 'income').estBasis, Math.round(7200000 * (1 - 0.19) / 12) + '/onboarding');
  check('investments estimate is the workplace contribution', rowOf(sheet, 'investments').estimatedCents, Math.round(7200000 * 0.05 / 12));
  check('a bucket with no figure anywhere says what would give it one', Money.isEntered(rowOf(sheet, 'savings').estimatedCents) + '|' + typeof rowOf(sheet, 'savings').estReason, 'false|string');
  check('actuals are zero with nothing logged', sheet.rows.map(r => r.actualCents).join(','), '0,0,0,0,0');

  /* The end-to-end month: a W-2 paycheque, a 1099 gig with $200 of mileage, a
     personal receipt and an expense linked to the gig. */
  Spine.upsertIncomeEntry({ id: 'pay', kind: 'w2', label: 'Day job', amountCents: 250000, frequency: 'fortnightly', receivedOn: '2026-09-04' });
  Spine.upsertIncomeEntry({ id: 'gig', kind: 'se', label: 'Website gig', amountCents: 200000, frequency: 'once', receivedOn: '2026-09-10', costs: [{ amountCents: 20000, category: 'mileage' }] });
  Spine.upsertExpenseEntry(Schema.createExpenseEntry({ id: 'l1', categoryId: 'groceries', amountCents: 6420, period: 'once', date: '2026-09-03', source: 'log' }));
  Spine.upsertExpenseEntry(Schema.createExpenseEntry({ id: 'l2', categoryId: 'platform_fees', amountCents: 3000, period: 'once', date: '2026-09-03', source: 'log', linkedIncomeId: 'gig', deductible: true }));
  Spine.upsertExpenseEntry(Schema.createExpenseEntry({ id: 'l3', categoryId: 'extra_debt_payment', amountCents: 10000, period: 'once', date: '2026-09-15', source: 'log' }));
  h = Spine.getProfile();
  sheet = Budget.month(h, T, CAT, '2026-09', NOW);
  const m = Ledger.month(h, T, '2026-09');
  check('income actual is the combined net-of-tax figure', rowOf(sheet, 'income').actualCents, m.takeHomeCents);
  const pay = Ledger.netOf(Ledger.byId(h, 'pay'), h, T), gig = Ledger.netOf(Ledger.byId(h, 'gig'), h, T);
  check('… two paycheques plus the gig, each netted', rowOf(sheet, 'income').actualCents, pay.takeHomeCents * 2 + gig.takeHomeCents);
  check('the gig’s tax base is net of the mileage and the linked fee', gig.taxableCents, 200000 - 20000 - 3000);
  check('the personal receipt is the expenses actual; the linked fee is not', rowOf(sheet, 'expenses').actualCents + '/' + sheet.incomeCostsCents, '6420/3000');
  check('… and only the linked one is deductible', sheet.deductibleCents, 3000);
  check('the extra payment lands in debt', rowOf(sheet, 'debt').actualCents, 10000);
  check('income lines name each entry', rowOf(sheet, 'income').lines.map(l => l.label + ' ×' + l.times).join(','), 'Day job ×2,Website gig ×1');

  /* Close: once. */
  const payload = Budget.recordPayload(h, T, CAT, '2026-09', NOW);
  check('the record carries both columns', Money.isEntered(payload.estimated.income) && payload.actual.income === rowOf(sheet, 'income').actualCents, true);
  const r1 = Spine.closeMonth(payload);
  checkTrue('September closes', r1.ok);
  h = Spine.getProfile();
  check('closing again is refused', Spine.closeMonth(Budget.recordPayload(h, T, CAT, '2026-09', NOW) || { month: '2026-09' }).ok, false);
  check('recordPayload has nothing to give for a closed month', Budget.recordPayload(h, T, CAT, '2026-09', NOW), null);
  const closed = Budget.month(h, T, CAT, '2026-09', NOW);
  check('the closed sheet is frozen', closed.status + '/' + closed.canClose + '/' + rowOf(closed, 'expenses').actualCents, 'closed/false/6420');
  check('the next open month is October', Budget.nextOpenMonth(h, NOW), '2026-10');
  const oct = Budget.month(h, T, CAT, '2026-10', NOW);
  check('October’s estimates are September’s actuals', rowOf(oct, 'income').estimatedCents + '/' + rowOf(oct, 'income').estBasis, rowOf(closed, 'income').actualCents + '/lastClosed');
  check('October is ahead, not closable', oct.isFuture + '/' + oct.canClose, 'true/false');

  /* A late entry: only the revised column moves. */
  Spine.upsertExpenseEntry(Schema.createExpenseEntry({ id: 'late', categoryId: 'shopping', amountCents: 5000, period: 'once', date: '2026-09-28', source: 'log' }));
  h = Spine.getProfile();
  check('a late entry is found for the closed month', Budget.syncRevised(h, T, CAT, Spine), 1);
  h = Spine.getProfile();
  const rec = Budget.recordFor(h, '2026-09');
  check('the frozen actual did not move', rec.actual.expenses, 6420);
  check('the revised column did', rec.actualRevised.expenses, 11420);
  check('the estimate did not', rec.estimated.expenses, closed.rows[1].estimatedCents);
  check('the sheet shows the revision beside the actual', rowOf(Budget.month(h, T, CAT, '2026-09', NOW), 'expenses').revisedCents, 11420);
  check('syncing again writes nothing', Budget.syncRevised(h, T, CAT, Spine), 0);
  check('the closed count is owned by Budget', Ownership.field('monthsClosed').owner + '/' + Ownership.field('monthsClosed').read(h).value, 'budget/1');

  /* A hand-set estimate wins. */
  Spine.setBudgetEstimate('2026-10', 'expenses', 55000);
  h = Spine.getProfile();
  check('a hand-set estimate wins for its month', rowOf(Budget.month(h, T, CAT, '2026-10', NOW), 'expenses').estimatedCents + '/' + rowOf(Budget.month(h, T, CAT, '2026-10', NOW), 'expenses').estBasis, '55000/set');
  Spine.reset();

  /* Once months close, "a month of spending" is their average (D-130, Q10). */
  const hc = Schema.createHousehold({ expenses: { monthlyEssential: { estimatedValueCents: 300000, trackedValueCents: 280000 } } });
  check('with no closed month the tracked figure still rules', Schema.monthlyExpensesCents(hc).value + '/' + Schema.monthlyExpensesCents(hc).source, '280000/tracked');
  hc.ledger.months = [
    Schema.createMonthRecord({ month: '2026-05', estimated: {}, actual: { expenses: 250000 } }),
    Schema.createMonthRecord({ month: '2026-06', estimated: {}, actual: { expenses: 260000 } }),
    Schema.createMonthRecord({ month: '2026-07', estimated: {}, actual: { expenses: 270000 } }),
    Schema.createMonthRecord({ month: '2026-08', estimated: {}, actual: { expenses: 320000 } })
  ];
  const mc = Schema.monthlyExpensesCents(hc);
  check('closed months: the average of the last three wins over tracked', mc.value + '/' + mc.source + '/' + mc.months.join(','), Math.round((260000 + 270000 + 320000) / 3) + '/closed/2026-06,2026-07,2026-08');
  hc.ledger.months = [Schema.createMonthRecord({ month: '2026-08', estimated: {}, actual: { expenses: 0 } })];
  check('a closed month with nothing logged does not count as a month of spending', Schema.monthlyExpensesCents(hc).source, 'tracked');

  /* What the log moved since cash was confirmed (D-130, Q8): read, never applied. */
  const hm = Schema.createHousehold({ filingStatus: 'single', state: 'NC', people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'P', grossAnnualIncomeCents: 7200000 })] })] });
  hm.ledger.income = [
    Schema.createIncomeEntry({ id: 'w', kind: 'w2', amountCents: 200000, frequency: 'once', receivedOn: '2026-09-10' }),
    Schema.createIncomeEntry({ id: 'g', kind: 'gift', amountCents: 10000, frequency: 'once', receivedOn: '2026-09-01' }),
    Schema.createIncomeEntry({ id: 'p', kind: 'bonus', amountCents: 999900, frequency: 'once', receivedOn: '2026-09-12', dateKind: 'potential' })
  ];
  hm.expenses.entries = [
    Schema.createExpenseEntry({ id: 'e1', categoryId: 'groceries', amountCents: 6420, period: 'once', date: '2026-09-04', source: 'log' }),
    Schema.createExpenseEntry({ id: 'e0', categoryId: 'groceries', amountCents: 5000, period: 'once', date: '2026-09-02', source: 'log' }),
    Schema.createExpenseEntry({ id: 'e2', categoryId: 'shopping', amountCents: 70000, period: 'once', date: '2026-09-20', source: 'log', dateKind: 'potential' })
  ];
  const w2cash = require(path.join(ROOT, 'engines/ledger.js')).netOf(hm.ledger.income[0], hm, T).cashReceivedCents;
  const mv = Budget.cashMovedSince(hm, T, CAT, '2026-09-03T10:00:00.000Z', Date.parse('2026-09-15T12:00:00'));
  check('since the 3rd: the paycheque’s cash (net of withholding) in, the receipt after the 3rd out; the gift before it and the potentials never', mv.inCents + '/' + mv.outCents + '/' + mv.value + '/' + mv.count, w2cash + '/6420/' + (w2cash - 6420) + '/2');
  check('never confirmed: nothing to count from', Budget.cashMovedSince(hm, T, CAT, null).status, 'incomplete');
  checkTrue('the Statement sets it beside the cash figure and applies nothing', /cashMovedSince\(/.test(fs.readFileSync(path.join(ROOT, 'rooms/statement.html'), 'utf8')) && /nothing moves it for you/.test(fs.readFileSync(path.join(ROOT, 'rooms/statement.html'), 'utf8')));

  /* The page: no field to type in, ever. */
  const page = fs.readFileSync(path.join(ROOT, 'rooms/budget.html'), 'utf8');
  const markup = page.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  check('zero input fields on the sheet', (markup.match(/<input|<select|<textarea/g) || []).length, 0);
  checkTrue('the script builds none either', !/<input|<select|<textarea/.test(page.replace(/<!--[\s\S]*?-->/g, '').split('<script')[1] || ''));
  checkTrue('the Add button navigates with a way back', /sessionStorage\.setItem\(RETURN_KEY/.test(page) && /for=budget&month=/.test(page));
  checkTrue('and the way back lands on the bucket card', /just-added/.test(page) && /bucket-' \+ justAdded/.test(page));
  checkTrue('five cards, each with a comparison bar in the ratios room’s bar language and its Add inside', /class="bucket-card/.test(page) && /slaf-bars/.test(page) && /data-toggle=/.test(page) && /c-body/.test(page) && page.indexOf('data-add="') > page.indexOf('<div class="c-body">'));
  checkTrue('the bar colours over and under apart, and an income shortfall as its own thing', /is-over/.test(page) && /is-under/.test(page) && /is-short/.test(page));
  checkTrue('the room re-renders on every spine change, so a new entry updates the actual with no refresh', /Spine\.onChange\(render\)/.test(page));
  checkTrue('late entries are synced on every render', /Budget\.syncRevised\(/.test(page));
  const room = Registry.byId('budget');
  checkTrue('Budget is registered after Income', !!room && room.order > Registry.byId('income').order);
};
