// Builds the made-up persona households in tests/personas/households/*.json.
// Every person here is fictional. Run from the slam folder:
//   node tests/personas/make-personas.js
// Three personas reuse households that already exist and are not built here:
//   6 (single, early 20s, negative net worth): tests/golden/households/card-carlos.json
//   15 (side hustler): fixtures/demo.json (Casey Rivera)
//   17 (regular FI): tests/golden/households/w2-wes.json
// Each persona's story, numbers and questions are in <id>.md next to this file;
// what happened when they were entered is in <id>-walkthrough.md.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validate } from '../../engine/schema.js';
import { K, RO, M, NFM, person, house, stream, expense, cash, acct, card, loan, assumptions, taxYear, spine as base } from '../golden/spine-builders.js';

const OUT = fileURLToPath(new URL('./households/', import.meta.url));
const spine = (id, name, body) => base(id, name, body, 'tests/personas/households/');
const P = {};

// 1. Sugar baby: Mila Soto, 24, Manhattan. An allowance that varies, gifts in kind, a part-time W-2.
P['01-sugar-baby'] = spine('01-sugar-baby', 'Mila Soto', {
  household: house({ people: [person('p1', 'Mila Soto', '2002-05-18')], county: 'New York', nyc: true, coverage: 'marketplace', planType: 'bronze' }),
  income: [
    stream('boutique', 'w2', 'Boutique, part time', 1100, 'biweekly', { start: '2025-03-03', fed: 60, st: 30 }),
    stream('allowance', 'other', 'Monthly allowance (arrangement)', 3000, 'monthly', { start: '2026-02-01', kind: 'rough', notes: 'Varies from 2,000 to 4,500; some months he pays the rent directly instead. Gifts in kind (a bag, trips) are not entered anywhere.' })
  ],
  expenses: [
    expense('rent', 'Rent', 2100, { fat: 'accommodation' }), expense('utilities', 'Utilities', 90, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 420, { fat: 'food' }), expense('dining', 'Eating out', 350, { fat: 'food', need: false }),
    expense('subway', 'Subway', 132, { fat: 'transportation' }), expense('phone', 'Phone', 75), expense('health', 'Marketplace bronze plan', 280),
    expense('beauty', 'Hair, nails, skincare', 300, { need: false }), expense('clothes', 'Clothes', 250, { need: false }), expense('travel', 'Travel (her share)', 200, { need: false }),
    expense('other', 'Everything else', 300, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 1900, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 8500, { apy: 0.039, role: 'emergency' }), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 2000, { monthlyContribution: K(100), basis: K(2000) })],
  debts: [card('visa', 'Visa', 1800, 0.2699, 4000, { stress: 5 }), loan('bnpl', 'bnpl', 'Buy now pay later', 350, 0, 88, { due: 12 })],
  goals: [{ id: 'exit', type: 'savings', label: 'Exit fund (six months of everything)', target: K(15000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 2. Sugar daddy: Raymond Feld, 58, Manhattan. High W-2 and RSUs, alimony, an allowance as a budget line.
P['02-sugar-daddy'] = spine('02-sugar-daddy', 'Raymond Feld', {
  household: house({ people: [person('p1', 'Raymond Feld', '1968-03-02')], county: 'New York', nyc: true }),
  income: [
    stream('salary', 'w2', 'Salary, asset management', 28000, 'monthly', { start: '2016-01-01', fed: 7500, st: 2100 }),
    stream('rsu', 'w2', 'RSU vesting (each quarter)', 37500, 'quarterly', { start: '2019-03-15', fed: 8250, st: 2600 })
  ],
  expenses: [
    expense('alimony', 'Alimony to ex-spouse (ends June 2029)', 3500, { end: '2029-06-30' }),
    expense('allowance', 'Arrangement: monthly allowance', 4000, { need: false }), expense('arrangement', 'Arrangement: dinners, travel, gifts', 1500, { need: false, kind: 'rough' }),
    expense('maint', 'Co-op maintenance', 2600, { fat: 'accommodation' }), expense('utilities', 'Utilities', 250, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 900, { fat: 'food' }), expense('dining', 'Restaurants', 1200, { fat: 'food', need: false }),
    expense('garage', 'Garage', 650, { fat: 'transportation' }), expense('carins', 'Car insurance', 220, { fat: 'transportation' }),
    expense('phone', 'Phone', 120), expense('club', 'Club dues', 400, { need: false }), expense('travel', 'Travel', 1500, { need: false }), expense('charity', 'Charity', 1000, { need: false }),
    expense('other', 'Everything else', 1500, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 35000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 180000, { apy: 0.04, role: 'emergency' }),
    acct('k401', 'employerRetirement', 'k401', '401(k)', 1450000, { monthlyContribution: K(2708.33), catchUpEligible: K(true) }),
    acct('brk', 'taxable', 'brokerage', 'Brokerage', 2100000, { costBasis: K(1300000) }),
    acct('coop', 'otherAssets', 'home', 'Co-op apartment', 1600000, { appreciationRate: K(0.02) }), acct('car', 'otherAssets', 'car', 'Car', 48000)
  ],
  debts: [card('amex', 'Amex (paid in full)', 6500, 0.2899, 50000, { min: 200, due: 5, payPolicy: 'statement' })],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', fiNumber: K(5000000) }],
  assumptions: assumptions({ coastAge: K(62) }), taxYears: [taxYear({ qualifiedDividends: K(42000), capitalGainsLong: K(60000) })]
});

// 3. Splenda daddy: Devin Marsh, 41, Queens. The same arrangement on a tight budget, partly on a card.
P['03-splenda-daddy'] = spine('03-splenda-daddy', 'Devin Marsh', {
  household: house({ people: [person('p1', 'Devin Marsh', '1985-08-14')], county: 'Queens', nyc: true }),
  income: [stream('salary', 'w2', 'Operations manager', 7200, 'monthly', { start: '2019-04-01', fed: 900, st: 380 })],
  expenses: [
    expense('rent', 'Rent', 1950, { fat: 'accommodation' }), expense('utilities', 'Utilities', 120, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 450, { fat: 'food' }), expense('dining', 'Eating out', 500, { fat: 'food', need: false }),
    expense('subway', 'Subway', 132, { fat: 'transportation' }), expense('phone', 'Phone', 85), expense('gym', 'Gym', 60, { need: false }),
    expense('allowance', 'Arrangement: monthly allowance', 1500, { need: false }), expense('arrangement', 'Arrangement: dinners, gifts, trips', 400, { need: false, kind: 'rough' }),
    expense('other', 'Everything else', 350, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 1200, { role: 'spending' }), cash('sav', 'savings', 'Savings', 2400), acct('k401', 'employerRetirement', 'k401', '401(k)', 61000, { monthlyContribution: K(300) })],
  debts: [card('visa', 'Visa', 9800, 0.2699, 12000, { stress: 8 }), loan('personal', 'personal_loan', 'Personal loan', 8000, 0.149, 270, { due: 15, extra: { stress: K(6) } })],
  goals: [{ id: 'ef', type: 'savings', label: 'Emergency fund', target: K(10000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 4. Trans person: Jordan Avery, 28, Brooklyn. Transition care partly uncovered, a surgery to save for, name-change costs.
P['04-trans-person'] = spine('04-trans-person', 'Jordan Avery', {
  household: house({ people: [person('p1', 'Jordan Avery', '1997-11-09')], county: 'Kings', nyc: true }),
  income: [stream('salary', 'w2', 'Product designer', 5400, 'monthly', { start: '2023-02-01', fed: 560, st: 250 })],
  expenses: [
    expense('rent', 'Rent', 1650, { fat: 'accommodation' }), expense('utilities', 'Utilities', 110, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 480, { fat: 'food' }), expense('dining', 'Eating out', 240, { fat: 'food', need: false }),
    expense('subway', 'Subway', 132, { fat: 'transportation' }), expense('phone', 'Phone', 70),
    expense('therapy', 'Therapy copays', 160), expense('hrt', 'HRT and prescriptions (copays)', 60), expense('electrolysis', 'Electrolysis (not covered)', 250),
    expense('surgery', 'Surgery: out-of-pocket max plus uncovered parts', 7500, { cadence: 'once', start: '2027-03-10' }),
    expense('namechange', 'Name change: court filing, passport, license, certified copies', 450, { cadence: 'once', start: '2026-12-01' }),
    expense('gym', 'Gym', 45, { need: false }), expense('other', 'Everything else', 300, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 2800, { role: 'spending' }), cash('sav', 'hysa', 'Surgery fund (high-yield savings)', 7000, { apy: 0.039, role: 'sinking' }),
    acct('k401', 'employerRetirement', 'k401', '401(k)', 28000, { monthlyContribution: K(324) }), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 9000, { monthlyContribution: K(200), basis: K(8000) })
  ],
  debts: [card('visa', 'Visa', 2200, 0.2449, 6000, { min: 65, due: 9, stress: 4 }), loan('fedloan', 'student_loan', 'Federal student loans', 18500, 0.055, 190, { due: 20, extra: { federal: K(true), plan: K('standard'), stress: K(3) } })],
  goals: [{ id: 'surgery', type: 'savings', label: 'Surgery fund', target: K(12000), by: '2027-03-01' }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 5. Lesbian couple: Priya Raman and Naomi Katz, 34 and 36, Westchester. IVF, donor sperm, a parentage order.
P['05-lesbian-couple'] = spine('05-lesbian-couple', 'Priya Raman and Naomi Katz', {
  household: house({ people: [person('p1', 'Priya Raman', '1992-04-03'), person('p2', 'Naomi Katz', '1990-07-22')], filing: 'mfj', county: 'Westchester' }),
  income: [
    stream('priya', 'w2', 'Priya: hospital administrator', 7800, 'monthly', { start: '2019-06-01', fed: 1000, st: 420 }),
    stream('naomi', 'w2', 'Naomi: high school teacher', 6100, 'monthly', { start: '2015-09-01', fed: 720, st: 310, personId: 'p2' })
  ],
  expenses: [
    expense('rent', 'Rent', 2600, { fat: 'accommodation' }), expense('utilities', 'Utilities', 220, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 850, { fat: 'food' }), expense('dining', 'Eating out', 400, { fat: 'food', need: false }),
    expense('gas', 'Gas', 180, { fat: 'transportation' }), expense('carins', 'Car insurance', 170, { fat: 'transportation' }),
    expense('phones', 'Phones', 130), expense('dog', 'Dog', 120), expense('therapy', 'Therapy (Naomi)', 200),
    expense('ivf', 'IVF cycle (clinic, after insurance)', 18000, { cadence: 'once', start: '2027-02-15' }),
    expense('ivfmeds', 'IVF medications', 5000, { cadence: 'once', start: '2027-02-01' }),
    expense('donor', 'Donor sperm, three vials, shipping and storage', 3600, { cadence: 'once', start: '2027-01-15' }),
    expense('parentage', 'Second-parent adoption or parentage order (lawyer and court)', 3500, { cadence: 'once', start: '2027-09-01' }),
    expense('travel', 'Travel', 300, { need: false }), expense('other', 'Everything else', 500, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Joint checking', 6500, { role: 'spending', owner: 'joint' }), cash('sav', 'hysa', 'IVF fund (high-yield savings)', 32000, { apy: 0.04, role: 'sinking', owner: 'joint' }),
    acct('k401', 'employerRetirement', 'k401', 'Priya 401(k)', 95000, { monthlyContribution: K(700) }), acct('k403', 'employerRetirement', 'k403b', 'Naomi 403(b)', 71000, { monthlyContribution: K(500), owner: K('partner') }),
    acct('roth', 'ira', 'roth_ira', 'Priya Roth IRA', 24000, { basis: K(20000) }), acct('brk', 'taxable', 'joint_brokerage', 'Joint brokerage', 15000, { costBasis: K(12000) })
  ],
  debts: [loan('carloan', 'auto_loan', 'Car loan', 11000, 0.069, 410, { due: 14, extra: { secured: K(true) } }), card('visa', 'Visa (paid in full)', 1400, 0.2299, 10000, { min: 35, due: 18, payPolicy: 'statement' })],
  goals: [{ id: 'ivf', type: 'savings', label: 'IVF and legal', target: K(30000), by: '2027-02-01' }, { id: 'fi', type: 'fi', label: 'Financial independence', annualSpending: K(60000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 7. Polyamorous household: Tess Nakamura and Omar Haddad (married) share a home with Lin Zhao. Tess's household view.
P['07-polyamorous-household'] = spine('07-polyamorous-household', 'Tess Nakamura and Omar Haddad (with Lin Zhao)', {
  household: house({ people: [person('p1', 'Tess Nakamura', '1988-09-12'), person('p2', 'Omar Haddad', '1985-02-28')], filing: 'mfj', county: 'Kings', nyc: true, payers: ['Lin'] }),
  income: [
    stream('tess', 'w2', 'Tess: nonprofit program director', 6500, 'monthly', { start: '2020-01-06', fed: 800, st: 330 }),
    stream('omar', '1099', 'Omar: contract UX work', 4200, 'monthly', { start: '2023-05-01', kind: 'rough', businessExpenses: 600, personId: 'p2' })
  ],
  expenses: [
    expense('rent', 'Rent (three adults)', 3900, { fat: 'accommodation', shared: 3, yourShare: 2 / 3 }), expense('utilities', 'Utilities (three adults)', 330, { fat: 'accommodation', shared: 3, yourShare: 2 / 3 }),
    expense('internet', 'Internet (three adults)', 80, { fat: 'accommodation', shared: 3, yourShare: 2 / 3 }),
    expense('groceries', 'Groceries (three adults)', 1100, { fat: 'food', shared: 3, yourShare: 2 / 3 }), expense('dining', 'Eating out', 500, { fat: 'food', need: false }),
    expense('subway', 'Subway (both)', 264, { fat: 'transportation' }), expense('phones', 'Phones (both)', 140),
    expense('omarhealth', 'Omar: marketplace health plan', 480), expense('therapy', 'Omar: therapy', 150),
    expense('travel', 'Travel', 300, { need: false }), expense('other', 'Everything else', 600, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('joint', 'checking', 'Joint checking (Tess and Omar)', 4200, { role: 'spending', owner: 'joint' }), cash('tsav', 'hysa', 'Tess: high-yield savings', 14000, { apy: 0.04, role: 'emergency' }), cash('ochk', 'checking', 'Omar: business checking', 2600),
    acct('k401', 'employerRetirement', 'k401', 'Tess 401(k)', 88000, { monthlyContribution: K(500) }), acct('sep', 'ira', 'sep_ira', 'Omar SEP IRA', 31000, { monthlyContribution: K(400), owner: K('partner') }),
    acct('roth', 'ira', 'roth_ira', 'Tess Roth IRA', 20000, { basis: K(17000) })
  ],
  debts: [loan('omarloan', 'student_loan', 'Omar: federal student loan', 14000, 0.068, 180, { due: 5, extra: { federal: K(true), plan: K('standard') } }), card('visa', 'Tess Visa (paid in full)', 1200, 0.2399, 8000, { min: 35, due: 20, payPolicy: 'statement' })],
  goals: [{ id: 'home', type: 'savings', label: 'A bigger place with Lin (down payment, three ways)', target: K(60000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 8. Modern Orthodox family: the Adlers, Teaneck NJ. Day school for four, kosher groceries, shul dues, maaser.
P['08-modern-orthodox-family'] = spine('08-modern-orthodox-family', 'Eitan and Shira Adler', {
  household: house({ people: [person('p1', 'Eitan Adler', '1984-06-10'), person('p2', 'Shira Adler', '1986-01-30'), person('p3', 'Noa', '2012-09-01'), person('p4', 'Ari', '2014-11-15'), person('p5', 'Tali', '2017-04-20'), person('p6', 'Benny', '2020-08-05')], filing: 'mfj', state: 'NJ', county: 'Bergen' }),
  income: [
    stream('eitan', 'w2', 'Eitan: actuary', 17500, 'monthly', { start: '2014-07-01', fed: 2800, st: 950 }),
    stream('shira', 'w2', 'Shira: speech therapist, part time', 3200, 'monthly', { start: '2021-09-01', fed: 260, st: 110, personId: 'p2' })
  ],
  expenses: [
    expense('proptax', 'Property tax', 1450, { fat: 'accommodation' }), expense('homeins', 'Home insurance', 190, { fat: 'accommodation' }), expense('utilities', 'Utilities', 420, { fat: 'accommodation' }),
    expense('groceries', 'Groceries (kosher)', 1900, { fat: 'food' }), expense('dining', 'Eating out (kosher)', 350, { fat: 'food', need: false }),
    expense('tuition', 'Day school tuition, four children (after assistance; full price is 81,000)', 42000, { cadence: 'yearly' }), expense('camp', 'Summer camp', 6000, { cadence: 'yearly', need: false }),
    expense('pesach', 'Pesach and the holidays', 4500, { cadence: 'yearly' }), expense('shul', 'Shul membership', 3600, { cadence: 'yearly' }),
    expense('maaser', 'Maaser (a tenth to tzedakah)', 1600), expense('gas', 'Gas', 260, { fat: 'transportation' }), expense('carins', 'Car insurance (two cars)', 240, { fat: 'transportation' }),
    expense('phones', 'Phones', 180), expense('activities', 'Kids: activities and lessons', 250, { need: false }), expense('other', 'Everything else', 700, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Joint checking', 9000, { role: 'spending', owner: 'joint' }), cash('sav', 'savings', 'Savings', 24000, { apy: 0.004, role: 'emergency' }),
    acct('k401', 'employerRetirement', 'k401', 'Eitan 401(k)', 310000, { monthlyContribution: K(900) }), acct('k403', 'employerRetirement', 'k403b', 'Shira 403(b)', 42000, { monthlyContribution: K(150), owner: K('partner') }),
    acct('k529', 'education', 'k529', '529 (all four)', 18000, { beneficiary: K('the kids') }),
    acct('home', 'otherAssets', 'home', 'House', 780000, { appreciationRate: K(0.03) }), acct('car1', 'otherAssets', 'car', 'Minivan', 24000), acct('car2', 'otherAssets', 'car', 'Sedan', 11000)
  ],
  debts: [
    loan('mortgage', 'mortgage', 'Mortgage (refinanced 2021)', 280000, 0.0325, 2100, { due: 1, extra: { secured: K(true) } }),
    loan('heloc', 'heloc', 'HELOC (tuition)', 25000, 0.085, 210, { due: 15, extra: { limit: K(100000), reportsToPersonalCredit: K(true) } }),
    card('visa', 'Visa (paid in full)', 3200, 0.2199, 20000, { min: 100, due: 8, payPolicy: 'statement' })
  ],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', annualSpending: K(90000) }, { id: 'tuition', type: 'savings', label: 'Tuition reserve', target: K(40000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 9. Yeshivish family: the Weinbergs, Lakewood NJ. Kollel stipend, a teaching salary, help from parents, six children.
P['09-yeshivish-family'] = spine('09-yeshivish-family', 'Chaim and Rivky Weinberg', {
  household: house({ people: [person('p1', 'Chaim Weinberg', '1993-03-15'), person('p2', 'Rivky Weinberg', '1995-08-02'), person('p3', 'Shloimy', '2014-10-01'), person('p4', 'Miri', '2016-05-11'), person('p5', 'Yanky', '2018-12-20'), person('p6', 'Esti', '2021-02-14'), person('p7', 'Dovid', '2023-07-30'), person('p8', 'Baby', '2025-09-08')], filing: 'mfj', state: 'NJ', county: 'Ocean', situation: 'mixed', coverage: 'medicaid' }),
  income: [
    stream('kollel', 'other', 'Kollel stipend', 1200, 'monthly', { start: '2017-09-01', notes: 'Paid monthly by the kollel; no W-2 or 1099. Whether it is taxable is a question.' }),
    stream('rivky', 'w2', 'Rivky: teaching at a girls\' school', 3400, 'monthly', { start: '2016-09-01', fed: 150, st: 60, personId: 'p2' }),
    stream('parents', 'other', 'Help from parents (both sides)', 1500, 'monthly', { start: '2017-09-01', notes: 'A gift, not income.' }),
    stream('tutoring', '1099', 'Tutoring (cash)', 400, 'monthly', { start: '2024-01-01', kind: 'rough' }),
    stream('snap', 'other', 'SNAP and WIC (benefits, not money in the bank)', 600, 'monthly', { start: '2022-01-01', notes: 'Benefits, not taxable income; entered as income because there is nowhere else to put them.' })
  ],
  expenses: [
    expense('rent', 'Rent', 1900, { fat: 'accommodation' }), expense('utilities', 'Utilities', 280, { fat: 'accommodation' }),
    expense('groceries', 'Groceries (kosher, eight people)', 1400, { fat: 'food' }), expense('dining', 'Takeout', 80, { fat: 'food', need: false }),
    expense('tuition', 'Tuition, four children (scholarship rate)', 15000, { cadence: 'yearly' }), expense('maaser', 'Maaser', 500), expense('shul', 'Shul', 1200, { cadence: 'yearly' }),
    expense('yomtov', 'Yom tov and simchas', 3000, { cadence: 'yearly' }), expense('phone', 'Phones', 90),
    expense('gas', 'Gas', 150, { fat: 'transportation' }), expense('carins', 'Car insurance', 160, { fat: 'transportation' }),
    expense('kids', 'Baby and kids: diapers, clothes, shoes', 300), expense('other', 'Everything else', 400, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 1400, { role: 'spending' }), cash('sav', 'savings', 'Savings', 3200), acct('roth', 'ira', 'roth_ira', 'Rivky Roth IRA', 4000, { basis: K(4000), owner: K('partner') }), acct('car', 'otherAssets', 'car', 'Minivan (2014)', 8000)],
  debts: [card('visa', 'Visa', 2900, 0.2499, 5000, { min: 85, due: 12, stress: 7 }), loan('gemach', 'family_iou', 'Gemach loan (interest free)', 5000, null, 100, { due: 1 })],
  goals: [{ id: 'simcha', type: 'savings', label: 'Simcha fund', target: K(10000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 10. Divorced: Marcus Bell, 44, Albany. Pays alimony, receives child support, the kids 60% of the time.
P['10-divorced'] = spine('10-divorced', 'Marcus Bell', {
  household: house({ people: [person('p1', 'Marcus Bell', '1982-02-11'), person('p2', 'Zoe', '2015-05-20'), person('p3', 'Eli', '2018-10-02')], filing: 'hoh', county: 'Albany' }),
  income: [
    stream('salary', 'w2', 'State agency analyst', 7000, 'monthly', { start: '2017-05-01', fed: 700, st: 300 }),
    stream('childsupport', 'other', 'Child support received', 900, 'monthly', { start: '2022-09-01', notes: 'Not taxable income.' })
  ],
  expenses: [
    expense('alimony', 'Alimony to ex-spouse (ends June 2029)', 1200, { end: '2029-06-30' }),
    expense('rent', 'Rent', 1900, { fat: 'accommodation' }), expense('utilities', 'Utilities', 180, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 750, { fat: 'food' }), expense('dining', 'Eating out', 220, { fat: 'food', need: false }),
    expense('gas', 'Gas', 170, { fat: 'transportation' }), expense('carins', 'Car insurance', 150, { fat: 'transportation' }),
    expense('afterschool', 'After-school care', 500), expense('kids', 'Kids: activities, clothes, school fees', 350), expense('kidsmed', 'Kids\' medical copays (his half)', 80),
    expense('phone', 'Phone', 75), expense('other', 'Everything else', 400, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 3100, { role: 'spending' }), cash('sav', 'savings', 'Savings', 7500, { apy: 0.03 }), acct('k401', 'employerRetirement', 'k457b', 'Deferred comp 457(b)', 142000, { monthlyContribution: K(420) }), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 18000, { basis: K(15000) }), acct('car', 'otherAssets', 'car', 'SUV', 16000)],
  debts: [loan('carloan', 'auto_loan', 'Car loan', 9500, 0.064, 345, { due: 12, extra: { secured: K(true) } }), card('visa', 'Visa', 2600, 0.2349, 9000, { min: 80, due: 24, stress: 5 }), loan('legal', 'personal_loan', 'Divorce lawyer, payment plan', 3400, null, 300, { due: 1 })],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', annualSpending: K(55000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 11. Widow: Ruth Castellano, 63, Suffolk County. Survivor benefits, a life insurance payout, one income where there were two.
P['11-widow'] = spine('11-widow', 'Ruth Castellano', {
  household: house({ people: [person('p1', 'Ruth Castellano', '1963-04-20'), person('p2', 'Paul Castellano (died June 15, 2026)', '1960-11-03')], filing: 'mfj', county: 'Suffolk', coverage: 'other' }),
  income: [
    stream('paul', 'w2', 'Paul: salary (ended at his death)', 8500, 'monthly', { start: '2010-01-01', end: '2026-06-15', fed: 1100, st: 420, personId: 'p2' }),
    stream('ss', 'ss', 'Survivor Social Security', 2300, 'monthly', { start: '2026-08-01' }),
    stream('pension', 'pension', 'Survivor pension (50% of Paul\'s)', 1100, 'monthly', { start: '2026-08-01', fed: 110, st: 40 }),
    stream('library', 'w2', 'Part time at the library', 2200, 'monthly', { start: '2019-02-01', fed: 150, st: 80 })
  ],
  expenses: [
    expense('proptax', 'Property tax', 900, { fat: 'accommodation' }), expense('homeins', 'Home insurance', 160, { fat: 'accommodation' }), expense('utilities', 'Utilities', 320, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 550, { fat: 'food' }), expense('dining', 'Eating out', 150, { fat: 'food', need: false }),
    expense('gas', 'Gas', 120, { fat: 'transportation' }), expense('carins', 'Car insurance', 110, { fat: 'transportation' }),
    expense('phone', 'Phone', 70), expense('cobra', 'COBRA health coverage (until December 2027)', 780, { end: '2027-12-31' }),
    expense('estate', 'Funeral and estate costs still to pay', 6000, { cadence: 'once', start: '2026-11-01' }),
    expense('grandkids', 'Gifts to the grandchildren', 200, { need: false }), expense('other', 'Everything else', 500, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 14000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings (life insurance payout)', 230000, { apy: 0.04, role: 'holding' }),
    acct('rollover', 'ira', 'rollover_ira', 'Paul\'s 401(k), rolled to her IRA', 410000), acct('k403', 'employerRetirement', 'k403b', 'Her 403(b) (old employer)', 96000),
    acct('roth', 'ira', 'roth_ira', 'Roth IRA', 22000, { basis: K(18000) }), acct('brk', 'taxable', 'brokerage', 'Brokerage (life insurance payout)', 150000, { costBasis: K(150000) }),
    acct('home', 'otherAssets', 'home', 'House (paid off)', 480000, { appreciationRate: K(0.02) }), acct('car', 'otherAssets', 'car', 'Car', 12000)
  ],
  debts: [card('visa', 'Visa (paid in full)', 900, 0.2199, 15000, { min: 35, due: 10, payPolicy: 'statement' })],
  goals: [{ id: 'fi', type: 'fi', label: 'Enough to stop the library job', annualSpending: K(48000) }],
  assumptions: assumptions({ lifeExpectancy: RO(92) }), taxYears: [taxYear({ qualifiedDividends: K(3000) })]
});

// 12. Partially employed: Dev Okonkwo, 31, Buffalo. A part-time W-2, seasonal work with gaps, a possible full-time offer.
P['12-partially-employed'] = spine('12-partially-employed', 'Dev Okonkwo', {
  household: house({ people: [person('p1', 'Dev Okonkwo', '1995-01-20')], county: 'Erie', coverage: 'marketplace', planType: 'bronze' }),
  income: [
    stream('bookstore', 'w2', 'Bookstore, 24 hours a week', 456, 'weekly', { start: '2024-09-02', fed: 25, st: 10 }),
    stream('festival', 'w2', 'Summer festival staff (total, ended)', 4800, 'total', { start: '2026-06-01', end: '2026-08-31', fed: 380, st: 150 }),
    stream('taxseason', 'w2', 'Tax season preparer (January to April)', 3200, 'monthly', { start: '2027-01-15', end: '2027-04-15', fed: 350, st: 140 }),
    stream('offer', 'maybeMoney', 'Possible full-time offer', 4300, 'monthly', { start: '2027-05-01', likelihood: 0.4, fed: 450, st: 190, kind: 'rough' })
  ],
  expenses: [
    expense('rent', 'Rent (two roommates)', 1900, { fat: 'accommodation', shared: 2 }), expense('utilities', 'Utilities (shared)', 140, { fat: 'accommodation', shared: 2 }),
    expense('groceries', 'Groceries', 380, { fat: 'food' }), expense('dining', 'Eating out', 120, { fat: 'food', need: false }),
    expense('bus', 'Bus pass', 75, { fat: 'transportation' }), expense('phone', 'Phone', 60), expense('health', 'Marketplace plan (after the subsidy)', 140),
    expense('other', 'Everything else', 250, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 900, { role: 'spending' }), cash('sav', 'savings', 'Savings', 3100), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 6500, { basis: K(6000) })],
  debts: [card('visa', 'Visa', 1100, 0.2599, 3000, { min: 40, due: 15, stress: 4 }), loan('fedloan', 'student_loan', 'Federal student loan', 9800, 0.0499, 105, { due: 20, extra: { federal: K(true), plan: K('ibr') } })],
  goals: [{ id: 'cushion', type: 'savings', label: 'Three months of expenses', target: K(6000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 13. Lean FI: Ana Reyes, 45, Rochester. Spends little on purpose; the target is food, housing and transportation.
P['13-lean-fi'] = spine('13-lean-fi', 'Ana Reyes', {
  household: house({ people: [person('p1', 'Ana Reyes', '1981-02-02')], county: 'Monroe' }),
  income: [stream('salary', 'w2', 'Lab technician', 4600, 'monthly', { start: '2012-03-01', fed: 450, st: 200 })],
  expenses: [
    expense('rent', 'Rent', 950, { fat: 'accommodation' }), expense('utilities', 'Utilities', 110, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 400, { fat: 'food' }), expense('dining', 'Eating out', 120, { fat: 'food', need: false }),
    expense('bus', 'Bus', 60, { fat: 'transportation' }), expense('bike', 'Bike upkeep', 20, { fat: 'transportation' }),
    expense('phone', 'Phone', 40), expense('gym', 'Gym', 30, { need: false }), expense('media', 'Books and streaming', 25, { need: false }), expense('giving', 'Giving', 100, { need: false }),
    expense('other', 'Everything else', 250, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 3000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 25000, { apy: 0.04, role: 'emergency' }), acct('k401', 'employerRetirement', 'k401', '401(k)', 290000, { monthlyContribution: K(800) }), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 110000, { monthlyContribution: K(625), basis: K(70000) }), acct('brk', 'taxable', 'brokerage', 'Brokerage', 80000, { costBasis: K(55000) })],
  debts: [],
  goals: [{ id: 'fi', type: 'fi', label: 'Lean FI: food, housing and transportation covered', annualSpending: K(20000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 14. Barista FI: Theo Marsh, 52, Albany. A part-time job for the health plan; the portfolio covers the rest.
P['14-barista-fi'] = spine('14-barista-fi', 'Theo Marsh', {
  household: house({ people: [person('p1', 'Theo Marsh', '1974-05-30')], county: 'Albany', situation: 'mixed' }),
  income: [stream('roaster', 'w2', 'Coffee roaster, part time (with the health plan)', 1650, 'monthly', { start: '2025-03-01', fed: 60, st: 30 })],
  expenses: [
    expense('rent', 'Rent', 1300, { fat: 'accommodation' }), expense('utilities', 'Utilities', 150, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 450, { fat: 'food' }), expense('dining', 'Eating out', 200, { fat: 'food', need: false }),
    expense('gas', 'Gas', 120, { fat: 'transportation' }), expense('carins', 'Car insurance', 110, { fat: 'transportation' }),
    expense('phone', 'Phone', 55), expense('health', 'Health plan premium (from the paycheck)', 120), expense('hobbies', 'Woodworking and music', 150, { need: false }), expense('travel', 'Travel', 250, { need: false }),
    expense('other', 'Everything else', 300, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 6000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings (two years of the gap)', 40000, { apy: 0.04, role: 'emergency' }), acct('k401', 'employerRetirement', 'k401', 'Old employer 401(k)', 380000), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 120000, { basis: K(80000) }), acct('brk', 'taxable', 'brokerage', 'Brokerage (drawing about 1,600 a month)', 190000, { costBasis: K(120000) }), acct('car', 'otherAssets', 'car', 'Car', 9000)],
  debts: [],
  goals: [{ id: 'fi', type: 'fi', label: 'Full FI (no job at all)', annualSpending: K(38500) }],
  assumptions: assumptions({ withdrawalRate: K(0.035) }), taxYears: [taxYear({ qualifiedDividends: K(4000), capitalGainsLong: K(9000) })]
});

// 16. Slow FI: Maya Lindgren, 33, Brooklyn. Saves steadily, spends on life now, FI at 55, a sabbatical in 2028.
P['16-slow-fi'] = spine('16-slow-fi', 'Maya Lindgren', {
  household: house({ people: [person('p1', 'Maya Lindgren', '1993-06-25')], county: 'Kings', nyc: true }),
  income: [
    stream('salary', 'w2', 'UX researcher (until the sabbatical)', 9200, 'monthly', { start: '2021-04-01', end: '2028-02-29', fed: 1300, st: 560 }),
    stream('after', 'w2', 'Same work after the sabbatical (rough)', 9200, 'monthly', { start: '2028-09-01', fed: 1300, st: 560, kind: 'rough' })
  ],
  expenses: [
    expense('rent', 'Rent (studio)', 1950, { fat: 'accommodation' }), expense('utilities', 'Utilities', 120, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 500, { fat: 'food' }), expense('dining', 'Eating out', 450, { fat: 'food', need: false }),
    expense('subway', 'Subway', 132, { fat: 'transportation' }), expense('phone', 'Phone', 80), expense('therapy', 'Therapy', 200),
    expense('travel', 'Travel', 600, { need: false }), expense('climbing', 'Climbing gym', 150, { need: false }), expense('other', 'Everything else', 500, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 5000, { role: 'spending' }), cash('sav', 'hysa', 'Sabbatical fund (high-yield savings)', 28000, { apy: 0.04, role: 'sinking' }), acct('k401', 'employerRetirement', 'k401', '401(k)', 120000, { monthlyContribution: K(600), matchFormula: K('100% of the first 4%') }), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 45000, { monthlyContribution: K(625), basis: K(38000) }), acct('brk', 'taxable', 'brokerage', 'Brokerage', 22000, { monthlyContribution: K(300), costBasis: K(19000) })],
  debts: [],
  goals: [{ id: 'fi', type: 'fi', label: 'FI by 55, not sooner', annualSpending: K(60000), by: '2048-06-25' }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 18. Chubby FI: Grace and Daniel Park, 49 and 50, Westchester. Comfortable spending, a college kid, 2.5 million invested.
P['18-chubby-fi'] = spine('18-chubby-fi', 'Grace and Daniel Park', {
  household: house({ people: [person('p1', 'Grace Park', '1977-09-14'), person('p2', 'Daniel Park', '1976-11-02')], filing: 'mfj', county: 'Westchester' }),
  income: [
    stream('grace', 'w2', 'Grace: pharma director', 19000, 'monthly', { start: '2008-02-01', fed: 3900, st: 1250 }),
    stream('daniel', 'w2', 'Daniel: architect', 11000, 'monthly', { start: '2005-06-01', fed: 1900, st: 650, personId: 'p2' })
  ],
  expenses: [
    expense('proptax', 'Property tax', 1900, { fat: 'accommodation' }), expense('homeins', 'Home insurance', 250, { fat: 'accommodation' }), expense('utilities', 'Utilities', 450, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 1300, { fat: 'food' }), expense('dining', 'Restaurants', 900, { fat: 'food', need: false }),
    expense('gas', 'Gas', 300, { fat: 'transportation' }), expense('carins', 'Car insurance', 280, { fat: 'transportation' }), expense('phones', 'Phones', 200),
    expense('college', 'College for Ethan, after the 529 (until May 2029)', 2000, { end: '2029-05-31' }),
    expense('travel', 'Travel', 1500, { need: false }), expense('giving', 'Gifts and giving', 500, { need: false }), expense('other', 'Everything else', 1000, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Joint checking', 25000, { role: 'spending', owner: 'joint' }), cash('sav', 'hysa', 'High-yield savings', 120000, { apy: 0.04, role: 'emergency' }),
    acct('gk401', 'employerRetirement', 'k401', 'Grace 401(k)', 1050000, { monthlyContribution: K(2041.67) }), acct('dk401', 'employerRetirement', 'k401', 'Daniel 401(k)', 720000, { monthlyContribution: K(2708.33), owner: K('partner'), catchUpEligible: K(true) }),
    acct('brk', 'taxable', 'joint_brokerage', 'Joint brokerage', 640000, { monthlyContribution: K(1500), costBasis: K(380000) }), acct('roth', 'ira', 'roth_ira', 'Grace Roth IRA (backdoor)', 110000, { basis: K(60000) }),
    acct('k529', 'education', 'k529', '529 for Ethan', 60000, { beneficiary: K('Ethan') }), acct('home', 'otherAssets', 'home', 'House', 1250000, { appreciationRate: K(0.02) }), acct('car1', 'otherAssets', 'car', 'Two cars', 52000)
  ],
  debts: [loan('mortgage', 'mortgage', 'Mortgage', 320000, 0.031, 3100, { due: 1, extra: { secured: K(true) } })],
  goals: [{ id: 'fi', type: 'fi', label: 'Chubby FI', fiNumber: K(3400000) }],
  assumptions: assumptions(), taxYears: [taxYear({ qualifiedDividends: K(14000), capitalGainsLong: K(20000) })]
});

// 19. Fat FI: Victor Lam, 54, Manhattan. A very high W-2 with RSUs and a bonus, 6 million invested, a large mortgage.
P['19-fat-fi'] = spine('19-fat-fi', 'Victor Lam', {
  household: house({ people: [person('p1', 'Victor Lam', '1972-01-08')], county: 'New York', nyc: true }),
  income: [
    stream('salary', 'w2', 'Managing director', 35000, 'monthly', { start: '2011-01-01', fed: 10500, st: 3200 }),
    stream('rsu', 'w2', 'RSU vesting (each quarter)', 40000, 'quarterly', { start: '2018-02-15', fed: 9000, st: 2800 }),
    stream('bonus', 'maybeMoney', 'Annual bonus (February)', 250000, 'once', { start: '2027-02-15', likelihood: 0.9, fed: 60000, st: 19000 })
  ],
  expenses: [
    expense('maint', 'Co-op maintenance', 4200, { fat: 'accommodation' }), expense('utilities', 'Utilities', 400, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 1500, { fat: 'food' }), expense('dining', 'Restaurants', 2500, { fat: 'food', need: false }),
    expense('car', 'Car, garage and driver', 1200, { fat: 'transportation' }), expense('phones', 'Phones', 150), expense('help', 'Household help', 2500),
    expense('travel', 'Travel', 4000, { need: false }), expense('club', 'Club', 800, { need: false }), expense('charity', 'Charity', 2000, { need: false }),
    expense('other', 'Everything else', 3000, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 60000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 400000, { apy: 0.04, role: 'emergency' }),
    acct('k401', 'employerRetirement', 'k401', '401(k)', 1900000, { monthlyContribution: K(2708.33), catchUpEligible: K(true) }), acct('brk', 'taxable', 'brokerage', 'Brokerage', 4100000, { costBasis: K(2200000) }),
    acct('coop', 'otherAssets', 'home', 'Co-op', 3200000, { appreciationRate: K(0.02) })
  ],
  debts: [loan('mortgage', 'mortgage', 'Co-op mortgage', 900000, 0.059, 5900, { due: 1, extra: { secured: K(true) } }), card('amex', 'Amex (paid in full)', 14000, 0.2899, 100000, { min: 300, due: 5, payPolicy: 'statement' })],
  goals: [{ id: 'fi', type: 'fi', label: 'Fat FI', fiNumber: K(8000000) }],
  assumptions: assumptions({ coastAge: K(60) }), taxYears: [taxYear({ qualifiedDividends: K(70000), capitalGainsLong: K(120000) })]
});

// 20. Coast FI: Sofia Bianchi, 36, Syracuse. Enough invested; a part-time job that covers today.
P['20-coast-fi'] = spine('20-coast-fi', 'Sofia Bianchi', {
  household: house({ people: [person('p1', 'Sofia Bianchi', '1990-10-03')], county: 'Onondaga' }),
  income: [stream('salary', 'w2', 'Data analyst, part time', 3900, 'monthly', { start: '2025-01-06', fed: 380, st: 170 })],
  expenses: [
    expense('rent', 'Rent', 1200, { fat: 'accommodation' }), expense('utilities', 'Utilities', 130, { fat: 'accommodation' }),
    expense('groceries', 'Groceries', 420, { fat: 'food' }), expense('dining', 'Eating out', 180, { fat: 'food', need: false }),
    expense('gas', 'Gas', 120, { fat: 'transportation' }), expense('carins', 'Car insurance', 110, { fat: 'transportation' }),
    expense('phone', 'Phone', 55), expense('yoga', 'Yoga', 80, { need: false }), expense('travel', 'Travel', 250, { need: false }), expense('other', 'Everything else', 300, { need: false, kind: 'rough' })
  ],
  accounts: [cash('chk', 'checking', 'Checking', 4000, { role: 'spending' }), cash('sav', 'hysa', 'High-yield savings', 18000, { apy: 0.04, role: 'emergency' }), acct('k401', 'employerRetirement', 'k401', 'Old 401(k)', 210000), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 70000, { basis: K(50000) }), acct('brk', 'taxable', 'brokerage', 'Brokerage', 30000, { costBasis: K(24000) }), acct('car', 'otherAssets', 'car', 'Car', 11000)],
  debts: [],
  goals: [{ id: 'fi', type: 'fi', label: 'Financial independence at 65', fiNumber: K(1000000) }],
  assumptions: assumptions(), taxYears: [taxYear()]
});

// 21. SPARKS: Kai Nakamura-Reyes, 26, Brooklyn. A big raise, a possible move, a house hack, a side business, and no settled goal yet.
P['21-sparks'] = spine('21-sparks', 'Kai Nakamura-Reyes', {
  household: house({ people: [person('p1', 'Kai Nakamura-Reyes', '2000-02-29')], county: 'Kings', nyc: true }),
  income: [
    stream('salary', 'w2', 'Software engineer (a big jump last year)', 11000, 'monthly', { start: '2025-09-01', fed: 1900, st: 750 }),
    stream('austin', 'maybeMoney', 'Austin offer (no state tax there)', 12000, 'monthly', { start: '2027-03-01', likelihood: 0.4, fed: 2000, st: 0, kind: 'rough' }),
    stream('apps', '1099', 'Freelance app work (just starting)', 800, 'monthly', { start: '2026-11-01', kind: 'rough', businessExpenses: 100 })
  ],
  expenses: [
    expense('rent', 'Rent (with a roommate)', 3000, { fat: 'accommodation', shared: 2 }), expense('utilities', 'Utilities (shared)', 180, { fat: 'accommodation', shared: 2 }),
    expense('groceries', 'Groceries', 450, { fat: 'food' }), expense('dining', 'Eating out', 700, { fat: 'food', need: false }),
    expense('subway', 'Subway', 132, { fat: 'transportation' }), expense('rideshare', 'Rideshare', 150, { fat: 'transportation', need: false }),
    expense('phone', 'Phone', 90), expense('gym', 'Climbing and gym', 180, { need: false }), expense('travel', 'Travel', 700, { need: false }), expense('goingout', 'Concerts and going out', 300, { need: false }),
    expense('clothes', 'Clothes', 200, { need: false }), expense('other', 'Everything else', 500, { need: false, kind: 'rough' })
  ],
  accounts: [
    cash('chk', 'checking', 'Checking', 7500, { role: 'spending' }), cash('sav', 'hysa', 'House hack down payment (high-yield savings)', 31000, { apy: 0.04, role: 'sinking' }),
    acct('k401', 'employerRetirement', 'k401', '401(k)', 34000, { monthlyContribution: K(792), matchFormula: K('100% of the first 4%') }), acct('roth', 'ira', 'roth_ira', 'Roth IRA', 18000, { monthlyContribution: K(625), basis: K(16000) }),
    acct('brk', 'taxable', 'brokerage', 'Brokerage', 12000, { monthlyContribution: K(500), costBasis: K(10000) }), acct('crypto', 'taxable', 'crypto', 'Crypto', 6000, { monthlyContribution: K(150), costBasis: K(7500) })
  ],
  debts: [loan('fedloan', 'student_loan', 'Federal student loans', 22000, 0.055, 230, { due: 1, extra: { federal: K(true), plan: K('standard') } }), card('visa', 'Visa (paid in full)', 1900, 0.2499, 12000, { min: 40, due: 15, payPolicy: 'statement' })],
  goals: [
    { id: 'house', type: 'savings', label: 'Down payment: a two-family in Queens (house hack)', target: K(60000), by: '2027-12-31' },
    { id: 'business', type: 'other', label: 'Start the app business (a cushion to quit)', target: K(15000) },
    { id: 'fi', type: 'fi', label: 'Financial independence (number not decided)', fiNumber: M() }
  ],
  assumptions: assumptions(), taxYears: [taxYear()]
});

for (const [id, s] of Object.entries(P)) {
  const r = validate(s);
  if (!r.ok) throw new Error(id + ': ' + r.errors.map((e) => e.path + ' ' + e.message).join('; '));
  writeFileSync(OUT + id + '.json', JSON.stringify(s, null, 2) + '\n');
  console.log('wrote', id);
}
