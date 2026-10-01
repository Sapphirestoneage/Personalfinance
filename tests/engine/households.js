/* ==========================================================================
   tests/engine/households.js, the synthetic corpus the engine tests run.
   Demo values only (CLAUDE.md: no real financial data). Each household is
   built through shared/schema.js constructors so it is the stored shape.
   ========================================================================== */
var Schema = require('../../shared/schema.js');

function person(label, dob, sources, extra) {
  return Schema.createPerson(Object.assign({ label: label, role: 'adult', dob: dob, incomeSources: sources }, extra || {}));
}
function w2(cents, match) {
  return Schema.createIncomeSource({ source: 'Pay', grossAnnualIncomeCents: cents, type: 'w2', employerMatch: match || null });
}
function asset(label, accountType, category, valueCents, extra) {
  return Schema.createAsset(Object.assign({ label: label, accountType: accountType, category: category, valueCents: valueCents }, extra || {}));
}
function expenses(food, home, transport, wants) {
  return { needs: { food: { monthlyCents: food }, accommodation: { monthlyCents: home }, transportation: { monthlyCents: transport } }, wants: { totalCents: wants } };
}

var NOW = new Date('2026-06-15');

var households = {
  /* A single 25-year-old on a W-2 in New York, 6% into the plan with a 50% match to 6%. */
  single25: {
    label: 'Single 25-year-old W-2 earner, NY',
    household: Schema.createHousehold({
      people: [person('Sam', '2001-02-14', [w2(6500000, { matchPercent: 0.5, matchCapPercentOfSalary: 0.06 })])],
      filingStatus: 'single', state: 'NY',
      assets: [asset('Checking', 'checking', 'cash', 800000), asset('401k', '401k', 'retirement', 1200000)],
      debts: [Schema.createDebt({ label: 'Student loan', balanceCents: 1800000, rate: 0.055, minPaymentCents: 20000, type: 'student_loan' })],
      expenses: expenses(50000, 150000, 25000, 60000),
      retirement: { contributionPercent: 6, has401k: true, onHdhp: false },
      insurance: { health: { type: 'employer', monthlyCents: 15000 } },
      targets: { retireAge: 65 }
    }),
    assumptions: { socialSecurity: [{ monthlyAtFraCents: 220000, claimAge: 67 }] }
  },
  /* A couple with two kids, two incomes, a mortgage, filing jointly. */
  coupleKids: {
    label: 'Couple with two kids, mortgage, married filing jointly, NY',
    household: Schema.createHousehold({
      people: [person('Ana', '1988-05-20', [w2(11000000, { matchPercent: 1, matchCapPercentOfSalary: 0.04 })]), person('Ben', '1986-11-03', [w2(7000000)])],
      filingStatus: 'married_joint', state: 'NY', dependents: [{ age: 6 }, { age: 3 }],
      assets: [asset('Joint checking', 'checking', 'cash', 2500000), asset('Ana 401k', '401k', 'retirement', 18000000, { ownerIds: [] }),
        asset('Brokerage', 'brokerage', 'investment', 6000000, { costBasisCents: 4000000 }), asset('Roth IRA', 'roth_ira', 'retirement', 3000000, { costBasisCents: 2000000 }),
        asset('Home', null, 'real_estate', 55000000)],
      debts: [Schema.createDebt({ label: 'Mortgage', balanceCents: 38000000, rate: 0.0625, minPaymentCents: 234000, type: 'mortgage' })],
      expenses: expenses(140000, 60000, 70000, 250000),
      retirement: { contributionPercent: 10, has401k: true, onHdhp: true, hsaFamilyPlan: true },
      insurance: { health: { type: 'employer', monthlyCents: 60000 } },
      targets: { retireAge: 60 }
    }),
    assumptions: { socialSecurity: [{ monthlyAtFraCents: 300000, claimAge: 67 }, { monthlyAtFraCents: 240000, claimAge: 67 }] }
  },
  /* A self-employed designer, 1099 income, no workplace plan, on the marketplace. */
  selfEmployed: {
    label: 'Self-employed, 1099 income, marketplace cover, NY',
    household: Schema.createHousehold({
      people: [person('Jo', '1990-09-09', [Schema.createIncomeSource({ source: 'Design studio', grossAnnualIncomeCents: 9000000, type: '1099' })])],
      filingStatus: 'single', state: 'NY',
      assets: [asset('Savings', 'hysa', 'cash', 3000000), asset('SEP IRA', 'sep_ira', 'retirement', 9000000), asset('Brokerage', 'brokerage', 'investment', 4000000, { costBasisCents: 3500000 })],
      expenses: expenses(70000, 220000, 20000, 90000),
      retirement: { contributionPercent: 0, has401k: false, onHdhp: true },
      insurance: { health: { type: 'marketplace', monthlyCents: 55000 } },
      targets: { retireAge: 62 }
    }),
    assumptions: { socialSecurity: [{ monthlyAtFraCents: 200000, claimAge: 67 }], contributionOrder: ['hsa', 'rothIra', 'tradIra', 'taxable'], acaBenchmarkMonthlyCents: 70000 }
  },
  /* Between jobs: no earned income this year, living on cash and a severance. */
  betweenJobs: {
    label: 'Between jobs, no earned income, Texas (no state tax)',
    household: Schema.createHousehold({
      people: [person('Lee', '1983-01-30', [], { employmentStatus: 'unemployed' })],
      filingStatus: 'single', state: 'TX',
      assets: [asset('Savings', 'savings', 'cash', 4500000), asset('Old 401k', 'old_401k', 'retirement', 22000000), asset('Brokerage', 'brokerage', 'investment', 3000000, { costBasisCents: 2800000 })],
      expenses: expenses(60000, 200000, 30000, 70000),
      retirement: { contributionPercent: 0, has401k: false },
      insurance: { health: { type: 'marketplace', monthlyCents: 0 } },
      targets: { retireAge: 65 }
    }),
    assumptions: { socialSecurity: [{ monthlyAtFraCents: 230000, claimAge: 67 }], stateFlatRate: 0 }
  },
  /* An early retiree at 52 living off taxable and Roth basis, pricing ACA cover. */
  earlyRetireeAca: {
    label: 'Early retiree on the marketplace, 52, NY',
    household: Schema.createHousehold({
      people: [person('Pat', '1974-04-01', [], { employmentStatus: 'retired' })],
      filingStatus: 'single', state: 'NY',
      assets: [asset('Cash', 'hysa', 'cash', 6000000), asset('Brokerage', 'brokerage', 'investment', 60000000, { costBasisCents: 30000000 }),
        asset('IRA', 'traditional_ira', 'retirement', 50000000), asset('Roth IRA', 'roth_ira', 'retirement', 15000000, { costBasisCents: 9000000 })],
      expenses: expenses(60000, 180000, 25000, 150000),
      retirement: { contributionPercent: 0, has401k: false },
      insurance: { health: { type: 'marketplace', monthlyCents: 0 } },
      targets: { retireAge: 52 }
    }),
    assumptions: { socialSecurity: [{ monthlyAtFraCents: 260000, claimAge: 70 }], acaBenchmarkMonthlyCents: 95000 }
  },
  /* A Roth ladder: retired at 45 with most money pretax, converting to the top of the 12% bracket. */
  rothLadder: {
    label: 'Roth conversion ladder from 45, fill the 12% bracket, NY',
    household: Schema.createHousehold({
      people: [person('Kim', '1981-07-15', [], { employmentStatus: 'retired' })],
      filingStatus: 'single', state: 'NY',
      assets: [asset('Cash', 'hysa', 'cash', 5000000), asset('Brokerage', 'brokerage', 'investment', 25000000, { costBasisCents: 18000000 }),
        asset('401k', '401k', 'retirement', 90000000), asset('Roth IRA', 'roth_ira', 'retirement', 8000000, { costBasisCents: 6000000 })],
      expenses: expenses(50000, 160000, 20000, 90000),
      retirement: { contributionPercent: 0, has401k: false },
      insurance: { health: { type: 'marketplace', monthlyCents: 0 } },
      targets: { retireAge: 45 }
    }),
    assumptions: { socialSecurity: [{ monthlyAtFraCents: 210000, claimAge: 67 }], conversion: { strategy: 'fillBracket', bracketRate: 0.12 }, acaBenchmarkMonthlyCents: 60000 }
  }
};

module.exports = { households: households, NOW: NOW, helpers: { person: person, w2: w2, asset: asset, expenses: expenses } };
