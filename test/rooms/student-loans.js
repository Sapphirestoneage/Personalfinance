/* test/rooms/student-loans.js — Student Loan Decision: three shapes of repayment. D-120. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Debt, Projection, TABLES } = t;
  const SL = require(path.join(ROOT, 'engines/studentloans.js'));
  section('Student Loan Decision (D-120): standard, income-driven, aggressive');

  const T = TABLES;
  const NOW = Date.parse('2026-09-05T12:00:00Z');
  function student(extra) {
    const h = Schema.createHousehold(Object.assign({ state: 'NC', filingStatus: 'single', meta: { hasDebt: true },
      people: [Schema.createPerson({ id: 'p1', role: 'adult', employmentStatus: 'student', dob: '2002-06-01', incomeSources: [Schema.createIncomeSource({ id: 'i1', personId: 'p1', grossAnnualIncomeCents: 4000000 })] })],
      debts: [Schema.createDebt({ id: 'loan', label: 'Loans', balanceCents: 2000000, rate: 0.05, minPaymentCents: 21213, type: 'student_loan', ownerIds: ['p1'] })] }, extra || {}));
    h.expenses.monthlyEssential.estimatedValueCents = 150000;
    return h;
  }

  /* The level payment by hand: r = 0.05/12, n = 120 → $212.13. */
  const r = 0.05 / 12, n = 120;
  const pmt = 2000000 * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  check('the 10-year level payment on $20,000 at 5% is $212.13', Math.round(pmt), 21213);
  check('… which Projection.levelPaymentCents also gives', Projection.levelPaymentCents({ principalCents: 2000000, annualRate: 0.05, months: 120 }).value, 21213, 1);

  const c = SL.compare(student(), T, { now: NOW });
  checkTrue('the comparison computes', Money.isOk(c), c.reason);
  const std = c.plans.standard, idr = c.plans.income_driven, agg = c.plans.aggressive;
  checkTrue('standard clears', std.ok && std.clears);
  check('… in about 120 months', Math.abs(std.months - 120) <= 1, true);
  check('… total paid about $25,456', Math.round(std.totalPaidCents / 10000), Math.round(2545600 / 10000), 2);
  checkTrue('… equal to the debt engine on the loans alone', std.months === Debt.simulate(SL.loansOnly(student(), c.loans), T.debtRules, { strategyId: 'avalanche', extraMonthlyCents: 0 }).months);
  /* Income-driven at $40,000: discretionary = 40,000 − 1.5 × 15,000 = 17,500; 10% ÷ 12 = $145.83. */
  check('income-driven discretionary income', idr.discretionaryCents, 1750000);
  check('… payment $145.83 a month', idr.monthlyPaymentCents, 14583);
  check('… month 1 interest $83.33', idr.firstMonthInterestCents, 8333);
  checkTrue('… amortises (payment above interest)', idr.negativeAmortisation === false);
  checkTrue('… and clears before 20 years, so nothing is forgiven', idr.clears && idr.forgivenCents === 0 && idr.months < 240);
  checkTrue('aggressive with no extra equals standard', agg.months === std.months && agg.totalPaidCents === std.totalPaidCents);
  check('the recommended plan is the cheapest that clears', c.recommendedId, c.cheapestId);

  /* With $200 extra the aggressive plan clears sooner and pays less. */
  const c2 = SL.compare(student({ studentLoans: { extraMonthlyCents: 20000 } }), T, { now: NOW });
  checkTrue('$200 extra clears sooner', c2.plans.aggressive.months < c2.plans.standard.months);
  checkTrue('… and pays less in total', c2.plans.aggressive.totalPaidCents < c2.plans.standard.totalPaidCents);
  check('… so it is recommended', c2.recommendedId, 'aggressive');
  checkTrue('… the clear year is after now', c2.plans.aggressive.clearYear >= 2028);

  /* Negative amortisation: a $60,000 loan at 7% on a $25,000 income. */
  const big = student({ debts: [Schema.createDebt({ id: 'loan', label: 'Loans', balanceCents: 6000000, rate: 0.07, minPaymentCents: null, type: 'student_loan', ownerIds: ['p1'] })],
    people: [Schema.createPerson({ id: 'p1', role: 'adult', employmentStatus: 'student', incomeSources: [Schema.createIncomeSource({ id: 'i1', personId: 'p1', grossAnnualIncomeCents: 2500000 })] })] });
  const c3 = SL.compare(big, T, { now: NOW });
  check('discretionary on $25,000: $2,500', c3.plans.income_driven.discretionaryCents, 250000);
  check('… $20.83 a month', c3.plans.income_driven.monthlyPaymentCents, 2083);
  checkTrue('… below the $350 of month-one interest: negative amortisation', c3.plans.income_driven.negativeAmortisation === true);
  checkTrue('… forgiven after 20 years, more than was borrowed', !c3.plans.income_driven.clears && c3.plans.income_driven.forgivenCents > 6000000);
  checkTrue('… the standard plan derives its minimum from the term', c3.derivedMinimumIds.indexOf('loan') !== -1);

  /* Edge cases. */
  checkTrue('no loans → incomplete pointing at the list', !Money.isOk(SL.compare(Schema.createHousehold({ state: 'NC', filingStatus: 'single' }), T)) && /loan/i.test(SL.compare(Schema.createHousehold({}), T).reason));
  const noIncome = student({ people: [Schema.createPerson({ id: 'p1', role: 'adult', employmentStatus: 'student' })] });
  const c4 = SL.compare(noIncome, T, { now: NOW });
  checkTrue('no income: the income-driven line says so, the others compute', Money.isOk(c4) && !c4.plans.income_driven.ok && c4.plans.standard.ok);
  const none = SL.compare(student({ studentLoans: { forgivenessYears: 0 } }), T, { now: NOW });
  checkTrue('forgiveness 0 is none', none.forgivenessNone === true);
  checkTrue('an empty household does not throw', (function () { try { SL.compare(Schema.createHousehold({}), T); SL.compare(null, T); return true; } catch (e) { return false; } })());
  checkTrue('a student’s lump debt from the one-pager counts as the loan', (function () {
    const h = student({ debts: [Schema.createDebt({ id: 'intake_debt', label: 'Everything you owe', balanceCents: 1500000, rate: 0.05, minPaymentCents: 16000, type: 'other', ownerIds: ['p1'] })] });
    const r = SL.compare(h, T, { now: NOW }); return Money.isOk(r) && r.lump === true && r.loans.length === 1;
  })());

  /* The table, the page, the map. */
  const conv = T.studentLoanConventions;
  check('a ten-year term', conv.standardTermYears, 10);
  check('ten per cent of discretionary income', conv.idrShareOfDiscretionary, 0.1);
  check('a convention, not a regulation', conv.confidence, 'convention');
  const page = fs.readFileSync(path.join(ROOT, 'rooms/student-loans.html'), 'utf8');
  checkTrue('the page mounts the template as student-loans, guessing a student', /id: 'student-loans'/.test(page) && /guessAs: 'student'/.test(page));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list'].forEach(id => checkTrue(`… has #${id}`, new RegExp('id="' + id + '"').test(page)));
  checkTrue('… four inputs, the room’s own', ['plan', 'extraMonthlyCents', 'idrShare', 'forgivenessYears'].every(c => new RegExp("ctl: '" + c + "'").test(page)));
  checkTrue('… writes only studentLoans.*', (page.match(/Spine\.set\('([a-zA-Z.]+)'/g) || []).every(m => /studentLoans\./.test(m)));
  check('the plan is owned here', Ownership.field('loanPlan').owner, 'student-loans');
  check('the room needs the debt branch', Registry.requires('student-loans').join(','), 'debt');
};
