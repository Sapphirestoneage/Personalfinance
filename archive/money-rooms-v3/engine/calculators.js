/* The calculators' inputs (Level 13, MR-067). Pure. Each calculator reads
   the client's record first (her pay, her rent, her cash, her state, her
   credit score), the libraries second (the county's tax rate, the state's
   insurance, today's stand-in rate), and the coach's own entries last
   (record.calculators). Every field says where its value came from: hers,
   known, rough, a guess from the library, or set here. The hub's live
   numbers come from the same inputs. */
import { setSection } from './record.js';
import { isQ } from './units.js';
import { hasValue, numberOf } from './states.js';
import { homeAfford, monthlyCost, propertyTaxRate, creditRangeOf, priceForBudget } from './home.js';
import { ownership } from './house.js';
import { compareCars } from './car.js';
import { retireFor } from './retire.js';
import { buildModel, simulate } from './cashcal.js';

export function calculatorsOf(record) { return (record && record.calculators) || {}; }
export function setCalculator(record, id, patch, meta) { const all = Object.assign({}, calculatorsOf(record)); const cur = Object.assign({}, all[id] || {}); Object.keys(patch || {}).forEach(k => { if (patch[k] === null || patch[k] === undefined) delete cur[k]; else cur[k] = patch[k]; }); all[id] = cur; return setSection(record, 'calculators', all, meta); }

const STATE_WORD = { verified: 'hers', known: 'known', rough: 'rough', 'will-send': 'rough', estimated: 'rough' };
/* a field descriptor: value plus where it came from */
function F(id, label, kind, value, state, note, extra) { return Object.assign({ id, label, kind, value, state, note: note || '' }, extra || {}); }
function fromQ(x) { return x && x.status === 'ok' ? (x.rough ? 'rough' : (x.confidence >= 0.95 ? 'hers' : 'known')) : null; }
function sunState(record, id) { const f = record.sun && record.sun.f[id]; return f && hasValue(f) ? { v: f.v, state: STATE_WORD[f.state] || 'known' } : null; }
/* lay the coach's entries over the defaults */
function overlay(fields, saved) { fields.forEach(f => { if (saved && saved[f.id] !== undefined && saved[f.id] !== null) { f.value = saved[f.id]; f.state = 'set'; f.note = 'Set here.'; } }); return fields; }
export function valuesOf(fields) { const o = {}; fields.forEach(f => { o[f.id] = f.value; }); return o; }
const stateName = (lib, st) => st;

/* ---- how much home ---- */
export function homeFields(record, result, data) {
  const lib = data.housingCosts; const S = result && result.sun && result.sun.outputs; const asm = result ? result.asm : data.assumptions.defaults;
  const st = sunState(record, 'state'); const city = sunState(record, 'city'); const state = st ? st.v : 'NY';
  const tax = propertyTaxRate(lib, state, city ? city.v : null);
  const score = record.planets.debt.rows.find(r => r.type === 'score'); const scoreV = score && score.f.score && hasValue(score.f.score) ? numberOf(score.f.score) : null; const credit = creditRangeOf(scoreV);
  const rate = Math.round((lib.baseRates.fixed30 + (lib.rateAdjustmentByCredit[credit] || 0)) * 10000) / 10000;
  const rent = S && S.spending.byCategory && isQ(S.spending.byCategory.accommodation) ? S.spending.byCategory.accommodation.cents : null;
  const q = (x, fallback) => (x && x.status === 'ok' ? x.cents : fallback);
  const fields = [
    F('grossMonthly', 'Gross pay a month', 'money', q(S && S.income.grossMonthly, null), fromQ(S && S.income.grossMonthly) || 'missing', 'From the Income room.', { group: 'hers' }),
    F('takeHomeMonthly', 'Take-home a month', 'money', q(S && S.income.takeHomeMonthly, null), fromQ(S && S.income.takeHomeMonthly) || 'missing', 'From the Income room.', { group: 'hers' }),
    F('debtMinimumsMonthly', 'Debt payments a month', 'money', q(S && S.debt.debtServiceMonthly, 0), fromQ(S && S.debt.debtServiceMonthly) || 'known', 'Minimums from the Debt room; a lender counts these.', { group: 'hers' }),
    F('cashAvailable', 'Cash on hand', 'money', q(S && S.invest.cashBalances, 0), fromQ(S && S.invest.cashBalances) || 'missing', 'Checking and savings from the Investments room.', { group: 'hers' }),
    F('savingsPaceMonthly', 'Saved a month', 'money', q(S && S.spending.savingsLandingMonthly, 0), fromQ(S && S.spending.savingsLandingMonthly) || 'known', 'Savings landing a month; sets how fast the down payment grows.', { group: 'hers' }),
    F('rentNow', 'Rent today', 'money', rent, rent !== null ? (S.spending.byCategory.accommodation.rough ? 'rough' : 'hers') : 'missing', 'Accommodation lines from the Spending room; owning is compared against it.', { group: 'hers' }),
    F('state', 'State', 'choice', state, st ? st.state : 'guess', st ? 'From the household facts.' : 'New York until the household says otherwise.', { group: 'place', options: Object.keys(lib.propertyTaxRateByState).sort().map(s => [s, s]) }),
    F('city', 'City', 'text', city ? city.v : '', city ? city.state : 'guess', 'Picks the county for the property tax rate.', { group: 'place' }),
    F('taxRate', 'Property tax, share of value a year', 'percent', tax.rate, 'guess', 'Average for ' + tax.basis + ', verify.', { group: 'place', slider: { min: 0.002, max: 0.03, step: 0.0005 } }),
    F('insuranceAnnual', 'Home insurance a year', 'money', lib.insuranceAnnualByState[state] || 150000, 'guess', 'Average for ' + state + ', verify.', { group: 'place' }),
    F('hoaMonthly', 'HOA a month', 'money', 0, 'guess', 'Zero unless a condo or association.', { group: 'place' }),
    F('maintenanceShare', 'Maintenance, share of value a year', 'percent', lib.maintenance.shareOfValueYear, 'guess', 'One percent a year is the common rule; older homes run nearer two.', { group: 'place', slider: { min: 0.005, max: 0.025, step: 0.0025 } }),
    F('credit', 'Credit score range', 'choice', credit, scoreV !== null ? 'hers' : 'guess', scoreV !== null ? 'From the credit score on Home (' + scoreV + ').' : 'Mid range until the score is in.', { group: 'loan', options: lib.creditRanges.map(r => [r, r]) }),
    F('rate', 'Mortgage rate', 'percent', rate, 'guess', 'Stand-in for a 30-year fixed with this credit range; check today\'s rate.', { group: 'loan', slider: { min: 0.03, max: 0.09, step: 0.00125 } }),
    F('termYears', 'Loan term', 'choice', 30, 'guess', 'Thirty years is the usual; fifteen pays less interest and more a month.', { group: 'loan', options: [[15, '15 years'], [30, '30 years']] }),
    F('loanType', 'Loan type', 'choice', 'conventional', 'guess', 'Conventional with mortgage insurance under 20% down; FHA allows 3.5% down with its own insurance; VA has a funding fee and no monthly insurance.', { group: 'loan', options: [['conventional', 'Conventional'], ['fha', 'FHA'], ['va', 'VA']] }),
    F('downPct', 'Down payment', 'percent', 0.10, 'guess', 'Ten percent to start; the ladder below shows every step.', { group: 'loan', slider: { min: 0.03, max: 0.30, step: 0.005 } }),
    F('frontRatio', 'Lender: housing share of gross', 'percent', 0.28, 'guess', 'The 28% front-end rule.', { group: 'rules', slider: { min: 0.2, max: 0.4, step: 0.01 } }),
    F('backRatio', 'Lender: all debt share of gross', 'percent', 0.36, 'guess', 'The 36% back-end rule; the looser 43% to 50% applies to some loan types.', { group: 'rules', slider: { min: 0.3, max: 0.5, step: 0.01 } }),
    F('looseOn', 'Use the looser lender ratio', 'bool', false, 'guess', 'Some FHA and VA lenders go to 43% or beyond; conservative is off.', { group: 'rules' }),
    F('backRatioLoose', 'Looser all-debt share', 'percent', 0.43, 'guess', 'Where the looser rule lands.', { group: 'rules', slider: { min: 0.36, max: 0.5, step: 0.01 } }),
    F('comfortableShare', 'Comfortable: housing share of take-home', 'percent', asm.housingShareOfTakeHome, 'guess', 'My default, 35% of take-home for rent or the full cost of owning. Change it on Assumptions to move it everywhere.', { group: 'rules', slider: { min: 0.2, max: 0.5, step: 0.01 } }),
    F('fiMonthsAllowed', 'FI date may move by (months)', 'int', 6, 'guess', 'What keeps your FI date: the price that moves it no more than this.', { group: 'rules', slider: { min: 0, max: 36, step: 1 } }),
    F('rentalIncomeMonthly', 'Rent from a roommate or unit a month', 'money', 0, 'guess', 'A lender may count part of it; check with a lender.', { group: 'rules' }),
  ];
  return overlay(fields, calculatorsOf(record).home);
}
export function runHome(record, result, data) { const fields = homeFields(record, result, data); const inp = valuesOf(fields); const out = homeAfford(data.housingCosts, inp, result); return { fields, inp, out }; }

/* ---- the house ---- */
export function houseFields(record, result, data) {
  const lib = data.housingCosts; const H = runHome(record, result, data); const base = H.fields.filter(f => ['state', 'city', 'taxRate', 'insuranceAnnual', 'hoaMonthly', 'maintenanceShare', 'credit', 'rate', 'termYears', 'loanType', 'downPct', 'rentNow', 'comfortableShare', 'takeHomeMonthly', 'grossMonthly'].includes(f.id)).map(f => Object.assign({}, f));
  const price = H.out.needs ? 30000000 : H.out.comfortable.price; const C = lib.comparison;
  const fields = [
    F('price', 'Price', 'money', price, H.out.needs ? 'guess' : 'known', H.out.needs ? 'A round number until the income is in.' : 'The comfortable price from How much home; type any price.', { group: 'home', slider: { min: 5000000, max: Math.max(100000000, price * 2), step: 500000 } }),
  ].concat(base, [
    F('points', 'Points paid', 'int', 0, 'guess', 'One point is one percent of the loan, paid up front for a lower rate.', { group: 'loan', slider: { min: 0, max: 3, step: 1 } }),
    F('extraPrincipal', 'Extra principal a month', 'money', 0, 'guess', 'Shortens the loan and cuts the interest.', { group: 'loan' }),
    F('years', 'Years you expect to stay', 'int', 7, 'guess', 'The comparison is read at this year; seven is the median stay.', { group: 'home', slider: { min: 1, max: 30, step: 1 } }),
    F('appreciation', 'Home appreciation a year', 'percent', C.appreciationLikely, 'guess', 'Likely ' + Math.round(C.appreciationLikely * 1000) / 10 + '%, with a range of ' + Math.round(C.appreciationLow * 100) + '% to ' + Math.round(C.appreciationHigh * 100) + '% drawn behind it.', { group: 'home', slider: { min: 0, max: 0.08, step: 0.0025 } }),
    F('flood', 'Flood zone', 'bool', false, 'guess', 'Adds flood insurance when on.', { group: 'home' }),
    F('utilitiesDiff', 'Utilities, more than renting a month', 'money', C.utilitiesDiffMonthlyCents, 'guess', 'A house usually costs more to heat and light than an apartment.', { group: 'home' }),
    F('rentGrowth', 'Rent increase a year', 'percent', C.rentGrowth, 'guess', 'Three percent a year is the long-run average.', { group: 'rent', slider: { min: 0, max: 0.08, step: 0.0025 } }),
    F('rentersInsuranceMonthly', 'Renters insurance a month', 'money', C.rentersInsuranceMonthlyCents, 'guess', 'National average.', { group: 'rent' }),
    F('securityDepositMonths', 'Security deposit, months', 'int', C.securityDepositMonths, 'guess', 'Returned at the end; New Jersey caps it at one and a half months.', { group: 'rent', slider: { min: 0, max: 3, step: 1 } }),
    F('stockReturn', 'Return the renter earns on the difference', 'percent', C.stockReturn, 'guess', 'Before inflation, like the appreciation and rent figures beside it.', { group: 'rent', slider: { min: 0.02, max: 0.12, step: 0.0025 } }),
    F('capitalGainsRate', 'Capital gains rate on the portfolio', 'percent', C.capitalGainsRate, 'guess', 'Long-term rate for most households.', { group: 'rent', slider: { min: 0, max: 0.25, step: 0.01 } }),
    F('units', 'Rooms or units rented out', 'int', 0, 'guess', 'House hack: zero means none.', { group: 'hack', slider: { min: 0, max: 4, step: 1 } }),
    F('rentPerUnit', 'Rent per room or unit a month', 'money', 120000, 'guess', 'What each would bring in.', { group: 'hack' }),
    F('vacancy', 'Vacancy', 'percent', lib.rental.vacancyShare, 'guess', 'About one month empty a year.', { group: 'hack', slider: { min: 0, max: 0.25, step: 0.01 } }),
    F('extraCosts', 'Extra costs a month from renting out', 'money', 0, 'guess', 'More utilities, more wear.', { group: 'hack' }),
  ]);
  return overlay(fields, calculatorsOf(record).house);
}
export function runHouse(record, result, data) { const fields = houseFields(record, result, data); const inp = valuesOf(fields); if (!(inp.price > 0)) return { fields, inp, out: { needs: ['a price'] } }; const own = ownership(data.housingCosts, Object.assign({}, inp, { years: 30 })); return { fields, inp, own }; }

/* ---- the car ---- */
export function carFields(record, result, data) {
  const lib = data.autoCosts; const S = result && result.sun && result.sun.outputs; const st = sunState(record, 'state'); const state = st ? st.v : 'NY'; const city = sunState(record, 'city');
  const tier = result && result.colTier ? result.colTier.tier : 'MCOL'; const transport = S && S.spending.byCategory && isQ(S.spending.byCategory.transportation) ? S.spending.byCategory.transportation.cents : null;
  const newPrice = lib.newPriceCents; const usedPrice = Math.round(newPrice * lib.usedDefaults.priceShareOfNew / 10000) * 10000;
  const fields = [
    F('transportNowMonthly', 'Getting around today, a month', 'money', transport, transport !== null ? (S.spending.byCategory.transportation.rough ? 'rough' : 'hers') : 'missing', 'Transportation lines from the Spending room; every option is compared against it.', { group: 'hers' }),
    F('grossMonthly', 'Gross pay a month', 'money', S && isQ(S.income.grossMonthly) ? S.income.grossMonthly.cents : null, fromQ(S && S.income.grossMonthly) || 'missing', 'For the 20/3/8 and 20/4/10 rules.', { group: 'hers' }),
    F('state', 'State', 'choice', state, st ? st.state : 'guess', 'Sales tax, fees and insurance.', { group: 'place', options: Object.keys(lib.salesTaxByState).sort().map(s => [s, s]) }),
    F('tier', 'Cost of living', 'choice', tier, result && result.colTier ? 'known' : 'guess', 'Parking and tolls by tier.', { group: 'place', options: [['HCOL', 'High cost area'], ['MCOL', 'Average cost area'], ['LCOL', 'Lower cost area']] }),
    F('keepYears', 'Years you would keep it', 'int', 5, 'guess', 'Every option is costed over the same years.', { group: 'use', slider: { min: 1, max: 12, step: 1 } }),
    F('milesPerYear', 'Miles a year', 'int', lib.milesPerYearDefault, 'guess', 'National average, verify.', { group: 'use', slider: { min: 2000, max: 25000, step: 500 } }),
    F('mpg', 'Miles per gallon', 'int', lib.fuel.defaultMpg, 'guess', 'For a gas car.', { group: 'use', slider: { min: 15, max: 60, step: 1 } }),
    F('ev', 'Electric', 'bool', false, 'guess', 'Charging instead of gas; EVs lose value a little faster.', { group: 'use' }),
    F('insuranceAnnual', 'Insurance a year', 'money', lib.insuranceAnnualByState[state] || 180000, 'guess', 'Full coverage average for ' + state + ', verify.', { group: 'use' }),
    F('parkingMonthly', 'Parking a month', 'money', lib.parkingMonthlyByTier[tier], 'guess', 'By cost-of-living tier.', { group: 'use' }),
    F('tollsMonthly', 'Tolls a month', 'money', lib.tollsMonthlyByTier[tier], 'guess', 'By cost-of-living tier.', { group: 'use' }),
    F('optNew', 'Compare buying new', 'bool', true, 'guess', '', { group: 'options' }),
    F('newPrice', 'New car price', 'money', newPrice, 'guess', 'Average new car price, verify.', { group: 'new' }),
    F('newDown', 'Down payment (new)', 'money', Math.round(newPrice * 0.1), 'guess', 'Ten percent; the rules want twenty.', { group: 'new' }),
    F('newTerm', 'Loan months (new)', 'choice', lib.loan.termMonthsDefault, 'guess', 'Sixty is the most common; the rules want 36 or 48.', { group: 'new', options: [[36, '36'], [48, '48'], [60, '60'], [72, '72'], [84, '84']] }),
    F('newRate', 'Loan rate (new)', 'percent', lib.loan.newRate, 'guess', 'Average for good credit.', { group: 'new', slider: { min: 0, max: 0.2, step: 0.0025 } }),
    F('optUsed', 'Compare buying used', 'bool', true, 'guess', '', { group: 'options' }),
    F('usedPrice', 'Used car price', 'money', usedPrice, 'guess', 'A ' + lib.usedDefaults.ageYears + '-year-old car at about ' + Math.round(lib.usedDefaults.priceShareOfNew * 100) + '% of new.', { group: 'used' }),
    F('usedAge', 'Age in years (used)', 'int', lib.usedDefaults.ageYears, 'guess', 'Sets where it sits on the depreciation curve.', { group: 'used', slider: { min: 1, max: 12, step: 1 } }),
    F('usedDown', 'Down payment (used)', 'money', Math.round(usedPrice * 0.1), 'guess', 'Ten percent.', { group: 'used' }),
    F('usedTerm', 'Loan months (used)', 'choice', 48, 'guess', '', { group: 'used', options: [[24, '24'], [36, '36'], [48, '48'], [60, '60'], [72, '72']] }),
    F('usedRate', 'Loan rate (used)', 'percent', lib.loan.usedRate, 'guess', 'Used-car loans run higher.', { group: 'used', slider: { min: 0, max: 0.2, step: 0.0025 } }),
    F('optLease', 'Compare a lease', 'bool', true, 'guess', '', { group: 'options' }),
    F('leasePrice', 'Car price (lease)', 'money', newPrice, 'guess', 'The same new car, leased.', { group: 'lease' }),
    F('leaseMonths', 'Lease months', 'choice', 36, 'guess', '', { group: 'lease', options: [[24, '24'], [36, '36'], [48, '48']] }),
    F('moneyFactor', 'Money factor', 'percent', lib.lease.moneyFactorDefault, 'guess', 'Times 2,400 is the interest rate: ' + (lib.lease.moneyFactorDefault * 2400).toFixed(1) + '%.', { group: 'lease', slider: { min: 0.0005, max: 0.006, step: 0.00005 } }),
    F('capReduction', 'Due at signing (lease)', 'money', 200000, 'guess', 'Cap cost reduction.', { group: 'lease' }),
    F('optNone', 'Compare no car', 'bool', true, 'guess', '', { group: 'options' }),
    F('transitMonthly', 'Transit pass a month', 'money', lib.noCar.transitPassByMetro[(city ? city.v : '').toLowerCase()] || lib.noCar.transitPassDefaultCents, 'guess', 'Monthly pass for ' + (city ? city.v : 'the area') + ', verify.', { group: 'none' }),
    F('rideshareMonthly', 'Rideshare a month', 'money', lib.noCar.rideshareMonthlyCents, 'guess', 'A few rides a week.', { group: 'none' }),
    F('rentalDays', 'Rental car days a year', 'int', lib.noCar.rentalDaysPerYear, 'guess', 'Trips and errands that need a car.', { group: 'none', slider: { min: 0, max: 60, step: 1 } }),
    F('carShareMonthly', 'Car share a month', 'money', lib.noCar.carShareMonthlyCents, 'guess', 'Zipcar or similar.', { group: 'none' }),
  ];
  return overlay(fields, calculatorsOf(record).car);
}
export function carOptionsOf(inp) {
  const common = { keepYears: inp.keepYears, milesPerYear: inp.milesPerYear, mpg: inp.mpg, ev: inp.ev, insuranceAnnual: inp.insuranceAnnual, parkingMonthly: inp.parkingMonthly, tollsMonthly: inp.tollsMonthly };
  const opts = [];
  if (inp.optNew) opts.push(Object.assign({ kind: 'new', price: inp.newPrice, down: inp.newDown, termMonths: +inp.newTerm, rate: inp.newRate }, common));
  if (inp.optUsed) opts.push(Object.assign({ kind: 'used', price: inp.usedPrice, ageYears: inp.usedAge, down: inp.usedDown, termMonths: +inp.usedTerm, rate: inp.usedRate }, common));
  if (inp.optLease) opts.push(Object.assign({ kind: 'lease', price: inp.leasePrice, leaseMonths: +inp.leaseMonths, moneyFactor: inp.moneyFactor, capReduction: inp.capReduction }, common));
  if (inp.optNone) opts.push(Object.assign({ kind: 'none', transitMonthly: inp.transitMonthly, rideshareMonthly: inp.rideshareMonthly, rentalDays: inp.rentalDays, carShareMonthly: inp.carShareMonthly }, common));
  return opts;
}
export function runCar(record, result, data, withFi) { const fields = carFields(record, result, data); const inp = valuesOf(fields); const city = sunState(record, 'city'); const out = compareCars(data.autoCosts, carOptionsOf(inp), { state: inp.state, city: city ? city.v : null, tier: inp.tier, grossMonthly: inp.grossMonthly || 0, transportNowMonthly: inp.transportNowMonthly || 0 }, withFi === false ? null : result); return { fields, inp, out }; }

/* ---- retirement for two ---- */
export function retireFields(record, result, data) {
  const S = result && result.sun && result.sun.outputs; const asm = result ? result.asm : data.assumptions.defaults; const hh = record.household || {};
  const age = result && result.age !== null && result.age !== undefined ? result.age : null; const retireAge = S && S.life && S.life.retirementAge ? S.life.retirementAge : asm.retirementAgeDefault;
  const invested = S && isQ(S.invest.investedAssets) ? S.invest.investedAssets.cents : null; const contrib = S && S.invest.annualContributions ? Math.round((S.invest.annualContributions.employee + S.invest.annualContributions.employer) / 12) : null;
  const spend = S && isQ(S.safety.spendingWithPremiums) ? S.safety.spendingWithPremiums.cents : null;
  const limits = data.limits2026 ? data.limits2026.limits : []; const l401 = limits.find(l => l.id === '401k'); const lira = limits.find(l => l.id === 'ira'); const lhsa = limits.find(l => l.id === 'hsa-self');
  const pretax = S && S.income && isQ(S.income.pretaxContribMonthly) ? S.income.pretaxContribMonthly.cents * 12 : 0;
  const rothRow = record.planets.invest.rows.find(r => r.f.accountType && ['rothIra', 'tradIra'].includes(r.f.accountType.v)); const iraNow = rothRow && rothRow.f.contribAmount && hasValue(rothRow.f.contribAmount) ? (numberOf(rothRow.f.contribAmount) || 0) * 12 : 0;
  const fields = [
    F('name1', 'Your name', 'text', (record.sun.f.name && record.sun.f.name.v ? String(record.sun.f.name.v).split(' ')[0] : 'You'), 'hers', '', { group: 'you' }),
    F('age1', 'Your age', 'int', age, age !== null ? 'hers' : 'missing', 'From the birth date on Home.', { group: 'you', slider: { min: 18, max: 80, step: 1 } }),
    F('retireAge1', 'Your retirement age', 'int', retireAge, S && S.life && S.life.retirementAge ? 'hers' : 'guess', S && S.life && S.life.retirementAge ? 'From Retirement and FI on Home.' : 'The default until the Life plan says.', { group: 'you', slider: { min: 30, max: 80, step: 1 } }),
    F('balance1', 'Invested today', 'money', invested, invested !== null ? (S.invest.investedAssets.rough ? 'rough' : 'hers') : 'missing', 'Invested balances from the Investments room.', { group: 'you' }),
    F('monthly1', 'Investing a month', 'money', contrib, contrib !== null ? 'hers' : 'missing', 'Payroll deferrals, the match and transfers into accounts.', { group: 'you' }),
    F('partnerOn', 'A partner too', 'bool', !!hh.partner, hh.partner ? 'hers' : 'guess', hh.partner ? 'From the household.' : 'Turn on for two.', { group: 'partner' }),
    F('name2', 'Partner\'s name', 'text', hh.partner && hh.partner.nickname ? hh.partner.nickname : 'Partner', hh.partner ? 'hers' : 'guess', '', { group: 'partner' }),
    F('age2', 'Partner\'s age', 'int', age !== null ? age : 30, 'guess', 'Type it.', { group: 'partner', slider: { min: 18, max: 80, step: 1 } }),
    F('retireAge2', 'Partner\'s retirement age', 'int', retireAge, 'guess', '', { group: 'partner', slider: { min: 30, max: 80, step: 1 } }),
    F('balance2', 'Partner invested today', 'money', 0, 'guess', '', { group: 'partner' }),
    F('monthly2', 'Partner investing a month', 'money', 0, 'guess', '', { group: 'partner' }),
    F('rate', 'Return a year, after inflation', 'percent', asm.returnLikely, 'guess', 'The household\'s likely return from Assumptions, so the totals read in today\'s dollars.', { group: 'assume', slider: { min: 0, max: 0.1, step: 0.0025 } }),
    F('withdrawalRate', 'Withdrawal rate', 'percent', asm.withdrawalRate, 'guess', 'The 4% rule turns a nest egg into a monthly income.', { group: 'assume', slider: { min: 0.025, max: 0.05, step: 0.0025 } }),
    F('spendingMonthly', 'Spending a month in retirement', 'money', spend, spend !== null ? 'hers' : 'missing', 'Today\'s spending with premiums; the enough line.', { group: 'assume' }),
    F('extraMonthly', 'Invest more each month', 'money', 20000, 'guess', 'The potential: what another amount a month would add.', { group: 'potential' }),
    F('extraFromYear', 'Starting in how many years', 'int', 0, 'guess', 'Zero means now; a later start shows what waiting costs.', { group: 'potential', slider: { min: 0, max: 20, step: 1 } }),
    F('maxOut', 'Or max out an account', 'choice', 'none', 'guess', 'Adds the room left under this year\'s limit.', { group: 'potential', options: [['none', 'None'], ['401k', '401(k): ' + (l401 ? '$' + (l401.cents / 100).toLocaleString('en-US') : '')], ['ira', 'IRA: ' + (lira ? '$' + (lira.cents / 100).toLocaleString('en-US') : '')], ['hsa', 'HSA: ' + (lhsa ? '$' + (lhsa.cents / 100).toLocaleString('en-US') : '')]] }),
    F('current401k', 'Into the 401(k) now, a year', 'money', pretax, pretax ? 'hers' : 'known', 'Pre-tax deferrals from the Income room.', { group: 'potential', hidden: true }),
    F('currentIra', 'Into the IRA now, a year', 'money', iraNow, iraNow ? 'hers' : 'known', '', { group: 'potential', hidden: true }),
  ];
  return overlay(fields, calculatorsOf(record).retire);
}
export function retireInputOf(inp, data) {
  const limits = data.limits2026 ? data.limits2026.limits : []; const lim = id => (limits.find(l => l.id === id) || {}).cents || 0;
  const people = [{ name: inp.name1, age: inp.age1, retireAge: inp.retireAge1, balance: inp.balance1 || 0, monthly: inp.monthly1 || 0 }];
  if (inp.partnerOn) people.push({ name: inp.name2, age: inp.age2, retireAge: inp.retireAge2, balance: inp.balance2 || 0, monthly: inp.monthly2 || 0 });
  const maxOut = inp.maxOut === '401k' ? { label: '401(k)', limitAnnual: lim('401k'), currentAnnual: inp.current401k || 0 } : inp.maxOut === 'ira' ? { label: 'IRA', limitAnnual: lim('ira'), currentAnnual: inp.currentIra || 0 } : inp.maxOut === 'hsa' ? { label: 'HSA', limitAnnual: lim('hsa-self'), currentAnnual: 0 } : null;
  return { people, rate: inp.rate, withdrawalRate: inp.withdrawalRate, spendingMonthly: inp.spendingMonthly, potential: { extraMonthly: inp.extraMonthly || 0, extraFromYear: inp.extraFromYear || 0, maxOut } };
}
export function runRetire(record, result, data) { const fields = retireFields(record, result, data); const inp = valuesOf(fields); const out = retireFor(retireInputOf(inp, data)); return { fields, inp, out }; }

/* ---- the hub's live numbers ---- */
export function liveNumbers(record, result, data) {
  const out = { safeToSpend: null, lowPoint: null, homeComfortable: null, homeLender: null, houseMonthly: null, carBest: null, carBestLabel: null, retireNestEgg: null, retireGain: null };
  if (!record || !result) return out;
  try { const model = buildModel(record, result, data, { days: 30 }); if (model.accounts.length && model.incomes.length) { const run = simulate(model); out.safeToSpend = run.safeToSpend.today; out.lowPoint = run.low; out.calendarNeeds = model.needs; } } catch (e) { out.calendarError = e.message; }
  try { const H = homeAfford(data.housingCosts, valuesOf(homeFields(record, result, data)), null); if (!H.needs) { out.homeComfortable = H.comfortable.price; out.homeLender = H.lender.price; out.houseMonthly = H.comfortable.cost.total; } } catch (e) { out.homeError = e.message; }
  try { const c = runCar(record, result, data, false).out; const best = c.options.find(o => o.kind === c.cheapest); if (best) { out.carBest = best.costPerMonth; out.carBestLabel = best.label; } } catch (e) { out.carError = e.message; }
  try { const r = runRetire(record, result, data).out; if (!r.needs) { out.retireNestEgg = r.atRetirement.balance; out.retireGain = r.gain; out.retireAge = r.horizonAge; } } catch (e) { out.retireError = e.message; }
  return out;
}
export { monthlyCost, priceForBudget };
