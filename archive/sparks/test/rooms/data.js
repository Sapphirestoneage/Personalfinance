/* test/rooms/data.js — Your Data: in and out, and a pasted line sorted into its list. D-125. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, TABLES } = t;
  const Importer = require(path.join(ROOT, 'shared/importer.js'));
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  section('Your Data (D-125): a pasted statement, sorted');

  const T = { importKeywords: TABLES.importKeywords, expenseCategories: TABLES.expenseCategories };
  const text = [
    'salary 62,000', 'Chase Visa 2,300', 'checking $4,120', '401k 31k', 'Roth IRA 8,000', 'rent 1,500/mo',
    'groceries 450 a month', 'car loan 12,400', 'mortgage 1,800/mo', 'owe mom 2000', 'label,amount', 'something odd 40', 'no number here', 'checking, 55'
  ].join('\n');
  const c = Importer.classify(text, T);
  const by = {}; c.rows.forEach(r => { by[r.line] = r; });
  check('pay reads as income, a year', by['salary 62,000'].kind + '/' + by['salary 62,000'].sub, 'income/annual');
  check('a card is a credit-card debt', by['Chase Visa 2,300'].kind + '/' + by['Chase Visa 2,300'].sub, 'debt/credit_card');
  check('and keeps its name', by['Chase Visa 2,300'].label, 'Chase Visa');
  check('checking is a cash asset', by['checking $4,120'].kind + '/' + by['checking $4,120'].sub, 'asset/cash');
  check('with the dollar amount', by['checking $4,120'].cents, 412000);
  check('401k is a retirement asset, and the k is thousands', by['401k 31k'].sub + '/' + by['401k 31k'].cents, 'retirement/3100000');
  check('a Roth is retirement too', by['Roth IRA 8,000'].sub, 'retirement');
  check('rent a month is a housing line', by['rent 1,500/mo'].kind + '/' + by['rent 1,500/mo'].sub, 'expense/housing');
  check('groceries a month is groceries', by['groceries 450 a month'].sub, 'groceries');
  check('a car loan is an auto debt', by['car loan 12,400'].sub, 'auto');
  check('a mortgage paid monthly is the housing line, not the loan', by['mortgage 1,800/mo'].kind + '/' + by['mortgage 1,800/mo'].sub, 'expense/housing');
  check('owe mom is a family loan', by['owe mom 2000'].sub, 'family');
  checkTrue('a CSV header row is dropped', !by['label,amount']);
  check('a line no word matches is skipped, not guessed', by['something odd 40'].kind, 'skip');
  check('a line with no amount is skipped and says so', by['no number here'].kind + '|' + by['no number here'].why, 'skip|no amount on the line');
  check('a CSV line parses', by['checking, 55'].kind + '/' + by['checking, 55'].cents, 'asset/5500');
  check('the tally', c.taken + '/' + c.skipped, '11/2');

  const hh = Schema.createHousehold({ people: [Schema.createPerson({ id: 'P', role: 'adult' })],
    expenses: { entries: [Schema.createExpenseEntry({ id: 'cf_housing', categoryId: 'housing', amountCents: 100000, period: 'monthly', source: 'manual', fixed: true })] } });
  const p = Importer.plan(c.rows, hh);
  check('the plan counts what the preview placed', p.count, 11);
  check('three debts', p.debts.length, 3);
  check('the family loan is interest-free with a 0 rate', p.debts[2].interestFree + '/' + p.debts[2].rate, 'true/0');
  check('four assets', p.assets.length, 4);
  checkTrue('cash is liquid, the 401k is not', p.assets[0].liquid === true && p.assets[1].liquid === false);
  check('the Roth carries its tax character', p.assets[2].taxCharacter, 'roth');
  check('three expense lines', p.expenses.length, 3);
  const housing = p.expenses.filter(e => e.categoryId === 'housing');
  check('two housing lines collapse onto the existing one, last wins', housing.length + '/' + housing[housing.length - 1].id, '2/cf_housing');
  check('… keeping its fixed flag', housing[0].fixed, true);
  check('one income, a year', p.income.length + '/' + p.income[0].frequency, '1/annual');

  /* Changing a placement in the preview changes the plan. */
  const odd = c.rows.filter(r => r.line === 'something odd 40')[0];
  odd.kind = 'expense'; odd.sub = 'subscriptions';
  check('a re-placed line is taken', Importer.plan(c.rows, hh).expenses.length, 4);

  /* apply: one batch, one undo, into the lists the owner rooms read. */
  Spine.reset();
  Spine.updateProfile({ people: [Schema.createPerson({ id: 'P', role: 'adult', incomeSources: [Schema.createIncomeSource({ id: 'intake_income', personId: 'P', grossAnnualIncomeCents: 5000000 })] })] });
  const n = Importer.apply(Importer.plan(c.rows, Spine.getProfile()), Spine);
  const h = Spine.getProfile();
  check('apply reports the count', n, 12);
  check('the debts landed in Debt Payoff’s list', h.debts.length, 3);
  check('and hasDebt became an answer', h.meta.hasDebt, true);
  check('the assets landed', h.assets.length, 4);
  check('cash adds up across the accounts', Schema.cashCents(h).value, 412000 + 5500);
  check('the expense lines landed, two housing lines on one record', h.expenses.entries.length, 3);
  check('the one income source was updated, not doubled', h.people[0].incomeSources.length, 1);
  check('… to the pasted salary', h.people[0].incomeSources[0].rateCents + '/' + h.people[0].incomeSources[0].frequency, '6200000/annual');
  check('one undo entry for the lot', Spine.peekUndo().label, 'Imported 12 items');
  Spine.undo();
  check('undo takes it all back', Spine.getProfile().debts.length + '/' + Spine.getProfile().assets.length, '0/0');

  /* merge: add what a file has, change nothing entered. */
  const mine = Schema.createHousehold({ people: [Schema.createPerson({ id: 'P', role: 'adult', dob: null })], assets: [Schema.createAsset({ id: 'a1', category: 'cash', valueCents: 1000 })], filingStatus: 'single' });
  const theirs = Schema.createHousehold({ people: [Schema.createPerson({ id: 'P', role: 'adult', dob: '1990-01-01' }), Schema.createPerson({ id: 'Q', role: 'adult' })],
    assets: [Schema.createAsset({ id: 'a1', category: 'cash', valueCents: 999 }), Schema.createAsset({ id: 'a2', category: 'investment', valueCents: 5000 })],
    debts: [Schema.createDebt({ id: 'd1', balanceCents: 100 })], filingStatus: 'married_joint', state: 'NC' });
  const m = Importer.merge(mine, theirs);
  check('a record already here keeps its value', m.household.assets[0].valueCents, 1000);
  check('a record only in the file is added', m.household.assets.length + '/' + m.household.debts.length, '2/1');
  check('a person only in the file is added', m.household.people.length, 2);
  check('a blank on a person fills from the file', m.household.people[0].dob, '1990-01-01');
  check('a scalar already set is kept', m.household.filingStatus, 'single');
  check('a blank scalar fills', m.household.state, 'NC');
  check('the count says what happened', JSON.stringify(m.added), JSON.stringify({ people: 1, incomeSources: 0, assets: 1, debts: 1, expenses: 0, other: 0, scalars: 2, total: 5 }));
  checkTrue('merge does not touch the original', mine.assets.length === 1 && mine.people.length === 1);

  Spine.reset();
  Spine.updateProfile({ people: mine.people, assets: mine.assets, filingStatus: 'single' });
  const file = JSON.stringify({ format: 'slaf-export', exportVersion: 1, schemaVersion: Schema.SCHEMA_VERSION, household: theirs, snapshots: [{ id: 'snap_x', timestamp: '2026-01-01T00:00:00.000Z', fields: {}, computedOutputs: {} }] });
  const r = Spine.mergeImport(file, Importer);
  checkTrue('Spine.mergeImport adds without replacing', r.ok && Spine.getProfile().assets[0].valueCents === 1000 && Spine.getProfile().assets.length === 2);
  check('and brings the snapshots it lacks', r.snapshotsAdded, 1);
  check('as one undo entry', Spine.peekUndo().label, 'Added 5 things from a file');
  Spine.undo();
  check('which undoes', Spine.getProfile().assets.length, 1);
  check('a bad file is refused with a reason', Spine.mergeImport('{not json', Importer).ok, false);
  Spine.reset();

  /* The page, the registry, the table. */
  const page = fs.readFileSync(path.join(ROOT, 'rooms/data.html'), 'utf8');
  checkTrue('the room loads the importer', /shared\/importer\.js/.test(page));
  checkTrue('the room offers replace and add', /btn-replace/.test(page) && /btn-merge/.test(page));
  checkTrue('the preview lets a placement be changed before it is taken', /select\('kind'/.test(page) && /select\('sub'/.test(page));
  const room = Registry.byId('data');
  checkTrue('Your Data is registered as a utility', !!room && room.utility === true);
  const walked = []; let cur = Registry.nextAfter(null, [], Schema.createHousehold({}));
  while (cur && walked.length < 200 && walked.indexOf(cur.id) === -1) { walked.push(cur.id); cur = Registry.nextAfter(cur.id, walked, Schema.createHousehold({})); }
  checkTrue('and is off the path', walked.length > 5 && walked.indexOf('data') === -1);
  checkTrue('the keyword table is registered', !!TABLES.importKeywords && TABLES.importKeywords.id === 'import_keywords');
  (TABLES.importKeywords.expenseExtra || []).forEach(g => checkTrue(`keyword category "${g.categoryId}" exists`, !!(TABLES.expenseCategories.categories || []).some(c => c.id === g.categoryId)));
  (TABLES.importKeywords.debt || []).forEach(g => checkTrue(`debt keyword type "${g.type}" is a schema type`, Schema.FIELDS['debt.type'].values.includes(g.type)));
  (TABLES.importKeywords.asset || []).forEach(g => checkTrue(`asset keyword category "${g.category}" is a schema category`, Schema.FIELDS['asset.category'].values.includes(g.category)));
};
