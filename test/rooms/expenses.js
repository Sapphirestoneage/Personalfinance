/* test/rooms/expenses.js — the expense log: groups, the month, the rule. D-128. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, CashFlow, TABLES } = t;
  section('The expense log (D-128): nine groups, the month, personal apart from the cost of earning');
  const CAT = TABLES.expenseCategories;
  const nine = ['housing', 'transportation', 'food', 'debt_payments', 'insurance', 'personal', 'kids', 'giving', 'other'];
  nine.forEach(g => checkTrue(`group "${g}" exists`, !!CashFlow.groupById(CAT, g)));
  checkTrue('every category carries a group the table lists', CAT.categories.every(c => !!CashFlow.groupById(CAT, c.group)));
  check('groceries and eating out are food', CashFlow.groupOf(CAT, 'groceries') + '/' + CashFlow.groupOf(CAT, 'dining_out'), 'food/food');
  check('mileage is a cost of earning', CashFlow.groupOf(CAT, 'mileage'), 'income_costs');
  check('the costs bucket exists and is not the typical month', CAT.buckets.filter(b => b.id === 'costs').length, 1);
  check('an unknown category is other', CashFlow.groupOf(CAT, 'zzz'), 'other');

  const h = Schema.createHousehold({ filingStatus: 'single' });
  h.ledger.income = [Schema.createIncomeEntry({ id: 'gig', kind: 'se', amountCents: 200000, frequency: 'once', receivedOn: '2026-09-10' })];
  h.expenses.entries = [
    Schema.createExpenseEntry({ id: 'cf_groceries', categoryId: 'groceries', amountCents: 45000, period: 'monthly', source: 'manual' }),
    Schema.createExpenseEntry({ id: 'l1', categoryId: 'groceries', amountCents: 6420, period: 'once', date: '2026-09-03', source: 'log', descriptor: 'TJ' }),
    Schema.createExpenseEntry({ id: 'l2', categoryId: 'housing', amountCents: 150000, period: 'monthly', date: '2026-08-01', source: 'log' }),
    Schema.createExpenseEntry({ id: 'l3', categoryId: 'mileage', amountCents: 20000, period: 'once', date: '2026-09-11', source: 'log', linkedIncomeId: 'gig', deductible: true }),
    Schema.createExpenseEntry({ id: 'l4', categoryId: 'groceries', amountCents: 9000, period: 'once', date: '2026-09-12', source: 'log', deductible: true }),
    Schema.createExpenseEntry({ id: 'l5', categoryId: 'extra_debt_payment', amountCents: 10000, period: 'once', date: '2026-09-15', source: 'log' }),
    Schema.createExpenseEntry({ id: 'l6', categoryId: 'shopping', amountCents: 5000, period: 'once', date: '2026-10-01', source: 'log' }),
    Schema.createExpenseEntry({ id: 'l7', categoryId: 'shopping', amountCents: 7000, period: 'once', date: '2026-09-20', source: 'log', active: false })
  ];
  const sum = CashFlow.summarise(h, CAT);
  check('the typical month ignores the log', sum.categories.length + '/' + sum.categories[0].monthlyCents, '1/45000');
  check('… unless asked', CashFlow.summarise(h, CAT, { includeLog: true }).categories.length > 1, true);
  const m = CashFlow.logInMonth(h, CAT, '2026-09');
  check('September holds the recurring rent on the 1st, then the receipts, the mileage, the extra payment, by date', m.rows.map(r => r.id).join(','), 'l2,l1,l3,l4,l5');
  check('the recurring rent lands on its day', m.rows.filter(r => r.id === 'l2')[0].date, '2026-09-01');
  check('personal apart from the cost of earning', m.personalCents + '/' + m.incomeCostsCents, (6420 + 150000 + 9000 + 10000) + '/20000');
  check('only the linked one is deductible — the personal receipt marked deductible was refused', m.deductibleCents, 20000);
  check('by group: food', m.byGroup.food, 6420 + 9000);
  check('by bucket: the extra payment is debt, the rest expenses, the mileage a cost', m.byBucket.debt + '/' + m.byBucket.expenses + '/' + m.byBucket.income_costs, '10000/' + (6420 + 150000 + 9000) + '/20000');
  checkTrue('an archived log entry never counts', !m.rows.some(r => r.id === 'l7'));
  check('October has the rent again and the October receipt', CashFlow.logInMonth(h, CAT, '2026-10').rows.map(r => r.id).join(','), 'l2,l6');
  check('a recurring entry does not land before its first date', CashFlow.logInMonth(h, CAT, '2026-07').count, 0);
  check('the 31st clamps', CashFlow.logOccurrences(Schema.createExpenseEntry({ amountCents: 1, period: 'monthly', date: '2026-01-31', source: 'log' }), '2026-09')[0].date, '2026-09-30');

  const page = fs.readFileSync(path.join(ROOT, 'rooms/cash-flow.html'), 'utf8');
  checkTrue('the page has the log form', /id="log-form"/.test(page) && /id="l-linked"/.test(page));
  checkTrue('the deductible tick is live only when linked', /el\('l-deductible'\)\.disabled = !linked/.test(page));
  checkTrue('the category select is grouped into the nine', /cats\.groups/.test(page) && /optgroup/.test(page));
  checkTrue('a logged entry is written with source log and the link', /source: 'log'/.test(page) && /linkedIncomeId: linked/.test(page));
  checkTrue('the room still declares its form pattern once', /LIVE-FORM: built once/.test(page));
};
