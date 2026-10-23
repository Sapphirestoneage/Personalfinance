// Builds the seven made-up golden households in tests/golden/households/*.json.
// Every household is fictional. Run from the slam folder:
//   node tests/golden/make-households.js
// The hand-worked expected values live next to each file (<id>.expected.md)
// and the comparison tests in tests/golden/<id>.golden.test.js.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validate } from '../../engine/schema.js';

const OUT = fileURLToPath(new URL('./households/', import.meta.url));
const AS_OF = '2026-10-22';
const SRC = 'golden (made up)';
const F = (value, kind = 'known') => ({ value, asOf: AS_OF, source: SRC, kind: value === null ? (kind === 'notForMe' ? 'notForMe' : 'missing') : kind });
const K = (v) => F(v, 'known');
const RO = (v) => F(v, 'rough');
const M = () => F(null);
const NFM = () => F(null, 'notForMe');

const person = (id, name, birth) => ({ id, name, birthDate: K(birth) });
const house = ({ people, filing = 'single', state = 'NY', county = 'Albany', nyc = false, situation = 'employed', coverage = 'employer', planType = 'other', expenseDefaults, payers }) => ({
  people,
  filingStatus: K(filing), state: K(state), county: K(county), nycResident: K(nyc),
  ...(expenseDefaults ? { expenseDefaults } : {}), ...(payers ? { payers } : {}),
  situation: [{ id: 'now', from: null, value: K(situation) }],
  healthCoverage: [{ id: 'now', from: null, personId: people[0].id, value: K(coverage), planType: K(planType) }]
});
const stream = (id, type, label, amount, cadence, { start = null, end = null, fed = 0, st = 0, personId = 'p1', likelihood, businessExpenses, kind = 'known' } = {}) => ({
  id, type, label, personId, amount: F(amount, kind), cadence, start, end,
  ...(likelihood !== undefined ? { likelihood: RO(likelihood) } : {}),
  ...(businessExpenses !== undefined ? { businessExpenses: K(businessExpenses) } : {}),
  withholding: { federal: K(fed), state: K(st) }
});
const expense = (id, label, amount, { fat = null, need = true, cadence = 'monthly', start = null, end = null, kind = 'known', shared, coveredBy, fixed = null } = {}) => ({
  id, label, amount: F(amount, kind), cadence, start, end, fixed, need: K(need), fat,
  ...(shared ? { shared: K(true), sharedWith: K(shared), whoPays: K('part') } : {}),
  ...(coveredBy ? { covered: K(true), coveredBy: K(coveredBy) } : {})
});
const cash = (id, type, name, balance, { apy, role } = {}) => ({ id, family: 'cash', type, name: K(name), balance: K(balance), ...(apy !== undefined ? { apy: K(apy) } : {}), ...(role ? { role: K(role) } : {}) });
const acct = (id, family, type, name, balance, extra = {}) => ({ id, family, type, name: K(name), balance: K(balance), ...extra });
const card = (id, name, balance, apr, limit, { min, due, stress, business = false, reports = true, promoApr, promoEnds, deferred, payPolicy } = {}) => ({
  id, family: 'debt', type: 'credit_card', name: K(name), balance: K(balance), apr: K(apr), limit: K(limit),
  minimum: min === undefined ? M() : K(min), dueDay: due === undefined ? M() : K(due),
  ...(stress ? { stress: K(stress) } : {}),
  ...(promoApr !== undefined ? { promoApr: K(promoApr), promoEnds: K(promoEnds), deferredInterest: K(!!deferred) } : {}),
  ...(payPolicy ? { payPolicy: K(payPolicy) } : {}),
  business: K(business), reportsToPersonalCredit: K(reports)
});
const loan = (id, type, name, balance, apr, min, { due, extra = {} } = {}) => ({ id, family: 'debt', type, name: K(name), balance: K(balance), apr: apr === null ? NFM() : K(apr), minimum: K(min), ...(due !== undefined ? { dueDay: K(due) } : {}), ...extra });
const assumptions = (over = {}) => ({ inflation: RO(0.03), realReturn: RO(0.05), withdrawalRate: K(0.04), lifeExpectancy: RO(90), coastAge: K(65), ...over });
const taxYear = (over = {}) => ({ id: '2026', year: 2026, estimatedPaidFederal: K(0), estimatedPaidState: K(0), setAside: K(0), ...over });
const spine = (id, name, body) => ({ schema: 'slam-spine/1', meta: { name: name + ' (golden, made up)', asOf: AS_OF, demo: true, from: 'tests/golden/households/' + id + '.json' }, ...body });

const H = {};

// 1. June Okafor, 35: between jobs on unemployment with no tax withholding.
H['jobless-june'] = spine('jobless-june', 'June Okafor', {
  household: house({ people: [person('p1', 'June Okafor', '1991-06-15')], county: 'Monroe', situation: 'between_jobs', coverage: 'marketplace', planType: 'bronze' }),
  income: [
    stream('oldjob', 'w2', 'Salary at Finger Lakes Logistics (ended)', 5500, 'monthly', { start: '2024-01-01', end: '2026-08-31', fed: 380, st: 200 }),
    stream('ui', 'unemployment', 'NY unemployment', 504, 'weekly', { start: '2026-09-07', end: '2027-03-07', fed: 0, st: 0 }),
    stream('newjob', 'maybeMoney', 'Likely new job (offer pending)', 5800, 'monthly', { start: '2027-02-01', fed: 650, st: 270, likelihood: 0.5, kind: 'rough' })
  ],
  expenses: [
    expense('rent', 'Rent', 1400, { fat: 'accommodation' }), expense('utilities', 'Utilities', 120, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 450, { fat: 'food' }), expense('dining', 'Eating out', 100, { fat: 'food', need: false }),
    expense('carins', 'Car insurance', 110, { fat: 'transportation' }), expense('gas', 'Gas', 90, { fat: 'transportation' }),
    expense('phone', 'Phone', 55), expense('health', 'Marketplace health plan', 310, { start: '2026-09-01' }),
    expense('streaming', 'Streaming', 25, { need: false }), expense('other', 'Everything else', 250, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 2200, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 6800, { apy: 0.038, role: 'emergency' }),
    acct('k401', 'employerRetirement', 'k401', 'Old employer 401(k)', 38000),
    acct('car', 'otherAssets', 'car', '2018 Civic', 9000, { appreciationRate: K(-0.15) })
  ],
  debts: [card('visa', 'Visa', 2400, 0.2399, 6000, { min: 75, due: 18, stress: 5 })],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', annualSpending: K(36000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 2. Wes Delgado, 38: W-2 earner with a 401(k) match, card paid in full each month.
H['w2-wes'] = spine('w2-wes', 'Wes Delgado', {
  household: house({ people: [person('p1', 'Wes Delgado', '1988-02-20')], county: 'Erie' }),
  income: [stream('salary', 'w2', 'Salary at Lakeshore Software', 3200, 'biweekly', { start: '2020-05-01', fed: 410, st: 160 })],
  expenses: [
    expense('rent', 'Rent', 1650, { fat: 'accommodation' }), expense('utilities', 'Utilities', 140, { fat: 'accommodation' }), expense('internet', 'Internet', 60, { fat: 'accommodation' }),
    expense('renters', 'Renters insurance', 15, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 480, { fat: 'food' }), expense('dining', 'Eating out', 220, { fat: 'food', need: false }),
    expense('transit', 'Metro pass', 127, { fat: 'transportation' }), expense('gym', 'Gym', 45, { need: false }), expense('phone', 'Phone', 65),
    expense('streaming', 'Streaming', 30, { need: false }), expense('other', 'Everything else', 400, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 4500, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 15000, { apy: 0.04, role: 'emergency' }),
    acct('k401', 'employerRetirement', 'k401', 'Work 401(k)', 96000, { monthlyContribution: K(520), matchFormula: K('50% of the first 6%') }),
    acct('roth', 'ira', 'roth_ira', 'Roth IRA', 31000, { monthlyContribution: K(300), basis: K(24000) }),
    acct('brk', 'taxable', 'brokerage', 'Brokerage', 12000, { monthlyContribution: K(150), costBasis: K(10500) })
  ],
  debts: [card('visa', 'Rewards Visa (paid in full monthly)', 900, 0.2199, 8000, { min: 35, due: 25, payPolicy: 'statement' })],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', fiNumber: K(1100000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 3. Fay Nakamura, 40: 1099 freelancer paying quarterly estimates, with a solo 401(k).
H['freelance-fay'] = spine('freelance-fay', 'Fay Nakamura', {
  household: house({ people: [person('p1', 'Fay Nakamura', '1985-11-03')], county: 'Kings', nyc: true, situation: 'self_employed', coverage: 'marketplace', planType: 'other' }),
  income: [stream('design', '1099', 'Freelance design clients', 7500, 'monthly', { start: '2022-03-01', businessExpenses: 900 })],
  expenses: [
    expense('rent', 'Rent', 1900, { fat: 'accommodation' }), expense('utilities', 'Utilities', 130, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 520, { fat: 'food' }), expense('dining', 'Eating out', 300, { fat: 'food', need: false }),
    expense('subway', 'Subway', 132, { fat: 'transportation' }), expense('phone', 'Phone', 70), expense('health', 'Marketplace health plan', 420),
    expense('gym', 'Gym', 60, { need: false }), expense('other', 'Everything else', 350, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Business and personal checking', 6000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 22000, { apy: 0.041, role: 'emergency' }),
    acct('solo', 'employerRetirement', 'solo_k401', 'Solo 401(k)', 85000, { monthlyContribution: K(1000), employerType: K('self') }),
    acct('roth', 'ira', 'roth_ira', 'Roth IRA', 40000, { monthlyContribution: K(625), basis: K(30000) }),
    acct('brk', 'taxable', 'brokerage', 'Brokerage', 28000, { monthlyContribution: K(200), costBasis: K(21000) })
  ],
  debts: [],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', annualSpending: K(48000) }],
  assumptions: assumptions(), taxYears: [taxYear({ estimatedPaidFederal: K(9000), estimatedPaidState: K(2400), setAside: K(1500) })]
});

// 4. Carlos Reyes, 23: cards, a payday loan, buy now pay later, money owed to family; negative net worth.
H['card-carlos'] = spine('card-carlos', 'Carlos Reyes', {
  household: house({ people: [person('p1', 'Carlos Reyes', '2003-04-12')], county: 'Bronx', nyc: true, coverage: 'parent_plan' }),
  income: [
    stream('retail', 'w2', 'Retail job (hourly)', 1480, 'biweekly', { start: '2025-06-16', fed: 95, st: 45 }),
    stream('delivery', '1099', 'Delivery app on weekends', 350, 'monthly', { start: '2026-03-01', kind: 'rough' })
  ],
  expenses: [
    expense('rent', 'Rent (shared apartment)', 1900, { fat: 'accommodation', shared: 2 }), expense('utilities', 'Utilities (shared)', 160, { fat: 'accommodation', shared: 2 }),
    expense('groceries', 'Groceries', 380, { fat: 'food' }), expense('dining', 'Eating out and delivery', 260, { fat: 'food', need: false }),
    expense('transit', 'Subway and bus', 132, { fat: 'transportation' }), expense('phone', 'Phone', 85),
    expense('streaming', 'Streaming and games', 35, { need: false }), expense('other', 'Everything else', 300, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 340, { role: 'spending' }), cash('sav', 'savings', 'Savings', 25)],
  debts: [
    card('visa', 'Visa (with cash advances)', 4800, 0.2899, 5000, { stress: 8 }),
    card('store', 'Store card', 1350, 0.3199, 1500, { min: 45, due: 15, stress: 6 }),
    loan('payday', 'payday', 'Payday loan', 600, 3.9, 675, { due: 6, extra: { stress: K(10) } }),
    loan('bnpl', 'bnpl', 'Buy now pay later (sneakers and a phone)', 420, 0, 105, { due: 20, extra: { stress: K(3) } }),
    loan('mom', 'family_iou', 'Owed to Mom', 1200, null, 50, { due: 1, extra: { stress: K(7) } })
  ],
  goals: [],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 5. Sam Lindqvist, 24: a student with federal loans in deferment, help from parents.
H['student-sam'] = spine('student-sam', 'Sam Lindqvist', {
  household: house({ people: [person('p1', 'Sam Lindqvist', '2002-09-30')], county: 'Tompkins', situation: 'student', coverage: 'parent_plan' }),
  income: [
    stream('campus', 'w2', 'Campus library job', 900, 'monthly', { start: '2025-09-01', fed: 40, st: 20 }),
    stream('intern', 'w2', 'Summer internship (total)', 9000, 'total', { start: '2026-06-01', end: '2026-08-15', fed: 700, st: 300 }),
    stream('parents', 'other', 'Help from parents', 500, 'monthly', { start: '2025-09-01', fed: 0, st: 0 })
  ],
  expenses: [
    expense('rent', 'Rent (house with 2 roommates)', 2400, { fat: 'accommodation', shared: 3 }), expense('utilities', 'Utilities (shared)', 180, { fat: 'accommodation', shared: 3 }),
    expense('groceries', 'Groceries', 320, { fat: 'food' }), expense('dining', 'Eating out', 150, { fat: 'food', need: false }),
    expense('bus', 'Bus pass', 45, { fat: 'transportation' }), expense('phone', 'Phone', 40, { coveredBy: 'Parents' }),
    expense('books', 'Textbooks and supplies', 60), expense('other', 'Everything else', 150, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 1100, { role: 'spending' }), cash('sav', 'savings', 'Savings', 2500),
    acct('roth', 'ira', 'roth_ira', 'Roth IRA', 1800, { monthlyContribution: K(50), basis: K(1800), contributions: K([{ year: 2025, amount: 1000 }, { year: 2026, amount: 800 }]) })
  ],
  debts: [
    loan('fedloan', 'student_loan', 'Federal direct loans (in school, deferred)', 27000, 0.0653, 0, { extra: { federal: K(true), plan: K('paused'), stress: K(4) } }),
    card('visa', 'Student Visa', 400, 0.2449, 1000, { stress: 2 })
  ],
  goals: [],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 6. Cat Morales, 36: head of household with a car loan that pays off in 2027.
H['carloan-cat'] = spine('carloan-cat', 'Cat Morales', {
  household: house({ people: [person('p1', 'Cat Morales', '1990-07-08'), person('p2', 'Mia Morales', '2018-03-14')], filing: 'hoh', county: 'Onondaga' }),
  income: [stream('salary', 'w2', 'Salary at Salt City Dental', 6200, 'monthly', { start: '2021-09-01', fed: 520, st: 250 })],
  expenses: [
    expense('rent', 'Rent', 1750, { fat: 'accommodation' }), expense('utilities', 'Utilities', 170, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 650, { fat: 'food' }), expense('dining', 'Eating out', 180, { fat: 'food', need: false }),
    expense('gas', 'Gas', 160, { fat: 'transportation' }), expense('carins', 'Car insurance', 140, { fat: 'transportation' }),
    expense('afterschool', 'After-school care', 450), expense('phone', 'Phone', 70), expense('activities', 'Kid activities', 120, { need: false }),
    expense('streaming', 'Streaming', 30, { need: false }), expense('other', 'Everything else', 250, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 3800, { role: 'spending' }), cash('sav', 'savings', 'Savings', 11000, { apy: 0.005, role: 'emergency' }),
    acct('k401', 'employerRetirement', 'k401', 'Work 401(k)', 72000, { monthlyContribution: K(400) }),
    acct('k529', 'education', 'k529', '529 for Mia', 9000, { monthlyContribution: K(100), beneficiary: K('Mia') }),
    acct('car', 'otherAssets', 'car', '2022 RAV4', 14000)
  ],
  debts: [
    loan('carloan', 'auto_loan', 'Car loan', 4250, 0.0549, 425, { due: 10, extra: { secured: K(true), stress: K(3) } }),
    card('visa', 'Visa', 650, 0.2149, 7000, { min: 25, due: 22, stress: 2 })
  ],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', annualSpending: K(45000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 7. Nina and Lev Petrov, 47 and 45: close to FI, married filing jointly, a small mortgage.
H['near-fi-nina'] = spine('near-fi-nina', 'Nina and Lev Petrov', {
  household: house({ people: [person('p1', 'Nina Petrov', '1979-01-25'), person('p2', 'Lev Petrov', '1981-05-02')], filing: 'mfj', county: 'Westchester' }),
  income: [
    stream('nina', 'w2', 'Nina: salary at Hudson Biotech', 9000, 'monthly', { start: '2015-03-01', fed: 900, st: 420 }),
    stream('lev', 'w2', 'Lev: salary at the school district', 4500, 'monthly', { start: '2012-09-01', fed: 350, st: 180, personId: 'p2' })
  ],
  expenses: [
    expense('proptax', 'Property tax', 650, { fat: 'accommodation' }), expense('homeins', 'Home insurance', 120, { fat: 'accommodation' }), expense('utilities', 'Utilities', 260, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 900, { fat: 'food' }), expense('dining', 'Eating out', 400, { fat: 'food', need: false }),
    expense('carins', 'Car insurance (two cars)', 180, { fat: 'transportation' }), expense('gas', 'Gas', 200, { fat: 'transportation' }),
    expense('phone', 'Phones', 120), expense('travel', 'Travel', 500, { need: false }), expense('giving', 'Gifts and giving', 200, { need: false }), expense('other', 'Everything else', 600, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Joint checking', 12000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 60000, { apy: 0.04, role: 'emergency' }),
    acct('k401', 'employerRetirement', 'k401', 'Nina 401(k)', 780000, { monthlyContribution: K(1500) }),
    acct('k403', 'employerRetirement', 'k403b', 'Lev 403(b)', 310000, { monthlyContribution: K(800), owner: K('partner') }),
    acct('brk', 'taxable', 'joint_brokerage', 'Joint brokerage', 410000, { monthlyContribution: K(2000), costBasis: K(250000) }),
    acct('home', 'otherAssets', 'home', 'House', 520000, { appreciationRate: K(0.02) }),
    acct('car1', 'otherAssets', 'car', '2023 Outback', 22000), acct('car2', 'otherAssets', 'car', '2015 Fit', 9000)
  ],
  debts: [loan('mortgage', 'mortgage', 'Mortgage', 95000, 0.02875, 1650, { due: 1, extra: { secured: K(true), stress: K(1) } })],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', fiNumber: K(1600000) }],
  assumptions: assumptions(), taxYears: [taxYear({ capitalGainsLong: K(4000), qualifiedDividends: K(6000) })]
});

for (const [id, s] of Object.entries(H)) {
  const r = validate(s);
  if (!r.ok) throw new Error(id + ': ' + r.errors.map((e) => e.path + ' ' + e.message).join('; '));
  writeFileSync(OUT + id + '.json', JSON.stringify(s, null, 2) + '\n');
  console.log('wrote', id);
}
