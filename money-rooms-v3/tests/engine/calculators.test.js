/* The four calculators and the hub (Level 13, MR-067), tied out to tests/households/expected-calculators.py
   (calculators-expected.json), which reads the fixtures and the libraries and never the engine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from '../../engine/compute.js';
import { levelPayment, amortize, principalForPayment, balanceAfter, monthsToPayOff, byYear } from '../../engine/loanmath.js';
import { homeAfford, monthlyCost, cashToClose, priceForBudget, propertyTaxRate, creditRangeOf, pmiRate, mortgageInsurance, LADDER } from '../../engine/home.js';
import { ownership, rentVsBuy, rentVsBuyRange, taxEffect, houseHack, houseFi, upfrontList } from '../../engine/house.js';
import { carOption, compareCars, salesTax, valueByYear } from '../../engine/car.js';
import { retireFor, personPath } from '../../engine/retire.js';
import { fiEffect } from '../../engine/fieffect.js';
import { homeFields, houseFields, carFields, retireFields, runHome, runHouse, runCar, runRetire, liveNumbers, setCalculator, calculatorsOf, valuesOf } from '../../engine/calculators.js';
import { CALC_CHARTS } from '../../engine/chartdata-calc.js';
import { ALL_CHARTS, chartMeta } from '../../engine/charts-all.js';
import { loadData, loadHousehold } from './load-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const X = JSON.parse(fs.readFileSync(path.join(here, '..', 'households', 'calculators-expected.json'), 'utf8'));
const data = loadData(); const lib = data.housingCosts; const auto = data.autoCosts; const TODAY = '2026-10-05';
const leah = loadHousehold('leah'); const R = compute(leah, data, { today: TODAY });
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': engine ' + a + ' vs workpaper ' + b);

test('one loan formula: the payment, its inverse, the amortization, the balance after n months', () => {
  assert.equal(levelPayment(1800000, 0.065, 60), 35219); assert.equal(levelPayment(40000000, 0.07, 360), 266121); assert.equal(levelPayment(120000, 0, 12), 10000);
  close(principalForPayment(35219, 0.065, 60), 1800000, 60, 'inverse');
  const a = amortize(1800000, 0.065, 60); assert.equal(a.months, 60); assert.equal(a.rows[59].balance, 0); assert.equal(a.rows.reduce((s, r) => s + r.principal, 0), 1800000); assert.ok(a.totalInterest > 300000 && a.totalInterest < 330000);
  const extra = amortize(1800000, 0.065, 60, 10000); assert.ok(extra.months < 60 && extra.totalInterest < a.totalInterest);
  close(balanceAfter(1800000, 0.065, 60, 12), a.rows[11].balance, 5, 'balance after 12'); assert.equal(monthsToPayOff(100000, 0.24, 1000), null); assert.ok(monthsToPayOff(100000, 0.24, 10000) > 10); assert.equal(byYear(a).length, 5);
});
test('the brief\'s household: a lender about 198,000 at 10% down and 6.5% with Hudson County defaults; comfortable about 161,000 at 35% of take-home with 1% maintenance', () => {
  const i = X.brief.inputs; const inp = Object.assign({}, i, { cashAvailable: 2000000, savingsPaceMonthly: 50000, rentNow: 150000, city: 'Jersey City', loanType: 'conventional' });
  const o = homeAfford(lib, inp, null);
  assert.equal(o.lender.price, X.brief.lenderPrice); assert.equal(o.lender.binding, X.brief.binding); assert.equal(o.lender.budget, X.brief.lenderBudget);
  assert.equal(o.comfortable.price, X.brief.comfortablePrice); assert.equal(o.comfortable.cost.total, X.brief.comfortableMonthly);
  assert.ok(o.lender.price >= 18500000 && o.lender.price <= 20500000, 'roughly 190,000 to 200,000: ' + o.lender.price); assert.ok(o.comfortable.price >= 15500000 && o.comfortable.price <= 16500000, 'roughly 160,000: ' + o.comfortable.price);
  assert.ok(Math.abs(o.comfortable.cost.total - o.comfortable.budget) <= 10000, 'the comfortable cost sits on the 35% line, within the $1,000 price rounding');
  assert.ok(o.comfortable.cost.parts.some(p => p[0] === 'Maintenance'), 'maintenance is in the comfortable cost'); assert.ok(!('Maintenance' in Object.fromEntries([['x', 1]])) && o.lender.cost.lender === o.lender.cost.pi + o.lender.cost.tax + o.lender.cost.ins + o.lender.cost.mi + o.lender.cost.hoa, 'the lender does not count maintenance');
  assert.equal(propertyTaxRate(lib, 'NJ', 'Jersey City').rate, lib.countyOverrides['Hudson County, NJ']); assert.equal(propertyTaxRate(lib, 'NJ', null).rate, lib.propertyTaxRateByState.NJ);
  assert.equal(creditRangeOf(761), '760+'); assert.equal(creditRangeOf(705), '700-719'); assert.equal(pmiRate(lib, 0.8, '760+'), 0); assert.ok(pmiRate(lib, 0.9, '640-659') > pmiRate(lib, 0.9, '760+'));
});
test('Leah: the three answers, which ratio binds, the ladder with its cash to close, buy now or wait, and the FI-safe price', () => {
  const H = runHome(leah, R, data); const o = H.out;
  assert.equal(o.lender.price, X.leahHome.lenderPrice); assert.equal(o.comfortable.price, X.leahHome.comfortablePrice); assert.equal(o.lender.binding, X.leahHome.binding);
  X.leahLadder.forEach((l, k) => { assert.equal(o.ladder[k].downPct, l.downPct); assert.equal(o.ladder[k].price, l.price, 'ladder price at ' + l.downPct); assert.equal(o.ladder[k].cashToClose, l.cashToClose, 'cash to close at ' + l.downPct); });
  assert.deepEqual(o.ladder.map(l => l.downPct), LADDER); assert.ok(o.ladder[0].months !== null && o.ladder[4].months > o.ladder[0].months, 'more down takes longer to save');
  assert.ok(o.fiSafe && o.fiSafe.price > 0 && o.fiSafe.effect.deltaMonths <= 6, 'FI-safe price moves the date 6 months at most'); assert.ok(o.fiSafe.price <= o.lender.price);
  assert.equal(o.wait.length, 3); assert.ok(o.wait[2].cash > o.wait[0].cash);
  const hers = H.fields.find(f => f.id === 'grossMonthly'); assert.ok(['hers', 'known', 'rough'].includes(hers.state), 'from the record: ' + hers.state); assert.equal(H.fields.find(f => f.id === 'rentNow').value, 225000); assert.equal(H.fields.find(f => f.id === 'taxRate').state, 'guess'); assert.equal(H.fields.find(f => f.id === 'credit').value, '760+');
  /* the coach's own entry wins and is labelled set */
  setCalculator(leah, 'home', { downPct: 0.2 }, {}); const H2 = runHome(leah, R, data); assert.equal(H2.fields.find(f => f.id === 'downPct').state, 'set'); assert.equal(H2.inp.downPct, 0.2); assert.ok(H2.out.comfortable.price > o.comfortable.price, 'more down, higher comfortable price');
  setCalculator(leah, 'home', { downPct: null }, {}); assert.equal(calculatorsOf(leah).home.downPct, undefined);
  /* the comfortable share is the one housing number: changing the assumption moves it */
  leah.sun.assumptions = Object.assign({}, leah.sun.assumptions, { housingShareOfTakeHome: 0.30 }); const R2 = compute(leah, data, { today: TODAY }); const H3 = runHome(leah, R2, data); assert.equal(H3.inp.comfortableShare, 0.30); assert.ok(H3.out.comfortable.price < o.comfortable.price); delete leah.sun.assumptions.housingShareOfTakeHome;
});
test('the house: interest from the amortization only, mortgage insurance ending at 20% equity, FHA and VA, taxes and insurance growing', () => {
  const inp = Object.assign({}, X.leahHome.inputs, { city: 'Oakland', loanType: 'conventional', price: X.leahHome.comfortablePrice, years: 30, hoaMonthly: 0 });
  const own = ownership(lib, inp); const y1 = own.years[0];
  assert.equal(y1.interest + y1.principal, y1.pi, 'P and I split exactly'); assert.equal(y1.cumInterest, y1.interest); assert.ok(y1.cumInterest < y1.total, 'interest is not the whole annual cost');
  assert.ok(own.miEndsMonth > 60 && own.miEndsMonth < 140, 'PMI ends when the scheduled balance reaches 80% of the price: month ' + own.miEndsMonth); assert.equal(own.rows[own.miEndsMonth].mi, 0); assert.ok(own.rows[own.miEndsMonth - 1].mi > 0);
  assert.ok(own.years[5].tax > y1.tax && own.years[5].ins > y1.ins, 'tax follows value, insurance follows inflation');
  const fha = ownership(lib, Object.assign({}, inp, { loanType: 'fha', downPct: 0.035 })); assert.ok(fha.first.miUpfront > 0 && fha.first.mi > 0); assert.equal(fha.miEndsMonth, null, 'FHA under 10% down carries insurance for life');
  const fha10 = ownership(lib, Object.assign({}, inp, { loanType: 'fha', downPct: 0.10 })); assert.equal(fha10.miEndsMonth, 11 * 12);
  const va = mortgageInsurance(lib, 'va', 1, '760+', 0); assert.equal(va.annual, 0); assert.equal(va.upfront, lib.va.fundingFee.firstUse['0']);
  const twenty = ownership(lib, Object.assign({}, inp, { downPct: 0.2 })); assert.equal(twenty.first.mi, 0); assert.equal(twenty.miEndsMonth, 0);
  const extra = ownership(lib, Object.assign({}, inp, { extraPrincipal: 20000 })); assert.ok(extra.loanMonths < 360 && extra.totalInterest < own.totalInterest);
});
test('the Buy vs Rent workbook defaults through the corrected model: payment, no break-even at 8% stocks, year 30 both ways, the renter investing the difference', () => {
  const inp = Object.assign({}, X.workbook.inputs, { state: 'US', city: null, credit: '740-759', loanType: 'conventional', hoaMonthly: 0, movingCents: 0 });
  const q = X.workbook.q; const r = rentVsBuy(lib, inp, { years: 30, rentMonthly: q.rent, rentGrowth: q.rentGrowth, rentersInsuranceMonthly: q.rentersIns, securityDepositMonths: q.depositMonths, stockReturn: q.stockReturn, capitalGainsRate: q.cg, sellingCostShare: q.sellingShare });
  assert.equal(r.own.payment, X.workbook.payment); assert.equal(r.own.payment, X.workbook.workbookSaid.monthlyPI, 'the workbook\'s P and I is right');
  assert.equal(r.upfront, X.workbook.upfront); assert.equal(r.deposit, X.workbook.deposit); assert.equal(r.breakEvenYear, X.workbook.breakEvenYear);
  [[1, X.workbook.year1], [10, X.workbook.year10], [30, X.workbook.year30]].forEach(([y, e]) => { const a = r.at(y); close(a.buyerNetWorth, e.buyerNetWorth, 2, 'buyer year ' + y); close(a.renterNetWorth, e.renterNetWorth, 2, 'renter year ' + y); close(a.cumInterest, e.cumInterest, 2, 'cum interest year ' + y); close(a.loanBalance, e.loanBalance, 2, 'balance ' + y); });
  assert.equal(r.at(30).mi, 0, 'no PMI at 20% down');
  /* the renter invests the difference while owning costs more, the buyer once renting costs more */
  assert.ok(r.at(1).renterPortfolio > r.upfront && r.at(1).buyerPortfolio === 0); assert.ok(r.at(30).buyerPortfolio > 0, 'rent outgrows the flat payment, so the buyer invests late in the span');
  const range = rentVsBuyRange(lib, inp, { years: 30, rentMonthly: q.rent, stockReturn: q.stockReturn }); assert.ok(range.low.at(30).buyerNetWorth < range.likely.at(30).buyerNetWorth && range.likely.at(30).buyerNetWorth < range.high.at(30).buyerNetWorth);
  /* a cheap market at a modest stock return: buying pulls ahead */
  const cheap = rentVsBuy(lib, Object.assign({}, inp, { price: 30000000, appreciation: 0.04 }), { years: 30, rentMonthly: 250000, stockReturn: 0.05 }); assert.ok(cheap.breakEvenYear !== null && cheap.breakEvenYear <= 10);
});
test('taxes: most clients do not itemize; a big loan in a high-tax county can; the hack, the FI effect and the upfront list', () => {
  const small = ownership(lib, Object.assign({}, X.workbook.inputs, { price: 20000000, state: 'US', city: null, credit: '740-759', loanType: 'conventional', hoaMonthly: 0 }));
  const t0 = taxEffect(lib, data.tax2026, small, { filingStatus: 'single', grossAnnual: 7000000 }); assert.equal(t0.itemizes, false); assert.equal(t0.savingAnnual, 0);
  const big = ownership(lib, Object.assign({}, X.leahHome.inputs, { city: 'Oakland', loanType: 'conventional', price: 60000000, hoaMonthly: 0 }));
  const t1 = taxEffect(lib, data.tax2026, big, { filingStatus: 'single', grossAnnual: 12000000 }); assert.equal(t1.itemizes, true); assert.ok(t1.savingAnnual > 0); assert.ok(t1.salt <= lib.tax.saltCapCents);
  const hk = houseHack(lib, big, { units: 2, rentPerUnit: 150000, vacancy: 0.1, extraCosts: 10000 }); assert.equal(hk.netRent, 270000 - 10000); assert.equal(hk.housingCost, big.first.total - hk.netRent);
  const ctc = cashToClose(lib, Object.assign({}, X.leahHome.inputs, { city: 'Oakland', loanType: 'conventional' }), X.leahHome.comfortablePrice); const fi = houseFi(R, ownership(lib, Object.assign({}, X.leahHome.inputs, { city: 'Oakland', loanType: 'conventional', price: X.leahHome.comfortablePrice })), ctc, 225000, 30);
  assert.ok(fi.deltaMonths !== null && fi.deltaMonths > 0, 'owning at the comfortable price moves the FI date later: ' + fi.deltaMonths);
  const up = upfrontList(lib, Object.assign({}, X.leahHome.inputs, { city: 'Oakland', loanType: 'conventional', price: X.leahHome.comfortablePrice })); assert.ok(!up.parts.some(p => p[0] === 'Attorney'), 'California closes through escrow, no attorney line'); assert.ok(up.total > ctc.down && up.parts.some(p => p[0] === 'Furnishing'));
  const nyc = cashToClose(lib, Object.assign({}, X.leahHome.inputs, { state: 'NY', city: 'New York', loanType: 'conventional' }), 120000000); assert.ok(nyc.transfer > 0, 'the New York mansion tax on the buyer side above a million');
});
test('the car: sales tax with and without the trade-in credit, the loan and the lease (money factor x 2400), depreciation and underwater months, the rules, no car', () => {
  const t1 = salesTax(auto, 'NJ', 3000000, 1000000); assert.equal(t1.tax, Math.round(2000000 * auto.salesTaxByState.NJ.rate)); assert.ok(t1.creditUsed);
  const t2 = salesTax(auto, 'CA', 3000000, 1000000); assert.equal(t2.tax, Math.round(3000000 * auto.salesTaxByState.CA.rate)); assert.ok(!t2.creditUsed);
  const ctx = { state: 'CA', city: 'Oakland', tier: 'HCOL', grossMonthly: X.leahHome.inputs.grossMonthly, transportNowMonthly: 19000 };
  const used = carOption(auto, { kind: 'used', price: X.leahUsedCar.price, ageYears: auto.usedDefaults.ageYears, down: Math.round(X.leahUsedCar.price * 0.1), termMonths: 48, keepYears: 5 }, ctx);
  assert.equal(used.financed, X.leahUsedCar.financed); assert.equal(used.monthlyPayment, X.leahUsedCar.payment); close(used.interest, X.leahUsedCar.interest, 48, 'loan interest'); assert.equal(used.upfront.total, X.leahUsedCar.upfront); assert.equal(used.running.total, X.leahUsedCar.runningMonthly); assert.equal(used.endValue, X.leahUsedCar.endValue); close(used.totalCost, X.leahUsedCar.totalCost, 60, 'total'); close(used.costPerMonth, X.leahUsedCar.costPerMonth, 2, 'per month'); close(used.costPerMile, X.leahUsedCar.costPerMile, 1, 'per mile');
  const none = carOption(auto, { kind: 'none', keepYears: 5 }, ctx); assert.equal(none.costPerMonth, X.leahNoCar.costPerMonth); assert.equal(none.costPerMile, null);
  const lease = carOption(auto, { kind: 'lease', price: 4800000, leaseMonths: 36, moneyFactor: 0.0025, keepYears: 3 }, ctx); close(lease.apr, 0.06, 1e-9, 'money factor x 2400'); assert.ok(lease.lease.residual === Math.round(4800000 * auto.lease.residualShare36)); assert.equal(lease.lease.depreciationFee, Math.round((lease.lease.cap - lease.lease.residual) / 36)); assert.equal(lease.lease.financeFee, Math.round((lease.lease.cap + lease.lease.residual) * 0.0025)); assert.equal(lease.endValue, 0);
  const newCar = carOption(auto, { kind: 'new', price: 4800000, down: 0, termMonths: 84, keepYears: 7 }, ctx); assert.ok(newCar.underwaterMonths > 12, 'nothing down over 84 months is underwater for a long while'); assert.ok(newCar.worstGap > 0);
  const vals = valueByYear(auto, 4800000, 0, 5); assert.equal(vals[1], Math.round(4800000 * 0.8)); assert.ok(vals[5] < vals[4]);
  const rule = used.rules.find(r => r.id === 'moneyGuy'); assert.equal(rule.down.ok, false); assert.equal(rule.term.ok, false, '48 months fails 20/3/8'); assert.equal(used.rules.find(r => r.id === 'common').term.ok, true, '48 months passes 20/4/10');
  const good = carOption(auto, { kind: 'used', price: 1500000, ageYears: 4, down: 300000, termMonths: 36, keepYears: 5 }, ctx); assert.ok(good.rules.every(r => r.down.ok && r.term.ok));
  const cmp = compareCars(auto, [{ kind: 'used', price: X.leahUsedCar.price, ageYears: 4, down: 264000, termMonths: 48, keepYears: 5 }, { kind: 'none', keepYears: 5 }], ctx, R); assert.equal(cmp.cheapest, 'none', 'no car wins in Oakland'); assert.ok(cmp.options[0].fi.deltaMonths > cmp.options[1].fi.deltaMonths, 'and on the FI date');
  const C = runCar(leah, R, data); assert.equal(C.out.cheapest, 'none'); assert.equal(C.fields.find(f => f.id === 'state').value, 'CA'); assert.equal(C.fields.find(f => f.id === 'transportNowMonthly').value, 19000);
});
test('retirement for two: growth splits into what was put in and what grew, the second person adds, the potential adds the extra and a maxed account', () => {
  const one = retireFor({ people: [{ name: 'A', age: 30, retireAge: 60, balance: 1000000, monthly: 50000 }], rate: 0.05, withdrawalRate: 0.04, spendingMonthly: 400000, potential: { extraMonthly: 0 } });
  assert.equal(one.horizonAge, 60); assert.equal(one.totalContributed, 1000000 + 50000 * 12 * 30); assert.ok(one.totalGrowth > one.totalContributed); assert.equal(one.atRetirement.balance, one.totalContributed + one.totalGrowth); assert.equal(one.incomeMonthly, Math.round(one.atRetirement.balance * 0.04 / 12)); assert.equal(one.gain, 0);
  const flat = personPath({ age: 30, retireAge: 31, balance: 100000, monthly: 0 }, 0.10, 31); assert.equal(flat[1].balance, 110000);
  const two = retireFor({ people: [{ name: 'A', age: 30, retireAge: 60, balance: 1000000, monthly: 50000 }, { name: 'B', age: 32, retireAge: 65, balance: 500000, monthly: 30000 }], rate: 0.05, withdrawalRate: 0.04, spendingMonthly: 100000, potential: { extraMonthly: 20000, extraFromYear: 5, maxOut: { label: '401(k)', limitAnnual: 2450000, currentAnnual: 600000 } } });
  assert.equal(two.horizonAge, 65); assert.equal(two.people.length, 2); assert.ok(two.atRetirement.balance > one.atRetirement.balance); assert.equal(two.extraMonthly, 20000 + Math.round((2450000 - 600000) / 12)); assert.ok(two.gain > 0); assert.ok(two.potentialAtRetirement.balance === two.atRetirement.balance + two.gain);
  assert.ok(two.enoughAge !== null && (two.enoughAgePot === null || two.enoughAgePot <= two.enoughAge), 'more investing reaches enough no later');
  const later = retireFor({ people: [{ name: 'A', age: 30, retireAge: 60, balance: 1000000, monthly: 50000 }], rate: 0.05, withdrawalRate: 0.04, potential: { extraMonthly: 20000, extraFromYear: 10 } }); const now = retireFor({ people: [{ name: 'A', age: 30, retireAge: 60, balance: 1000000, monthly: 50000 }], rate: 0.05, withdrawalRate: 0.04, potential: { extraMonthly: 20000, extraFromYear: 0 } }); assert.ok(now.gain > later.gain, 'waiting costs');
  const Rt = runRetire(leah, R, data); assert.ok(!Rt.out.needs); assert.equal(Rt.fields.find(f => f.id === 'age1').value, R.age); assert.equal(Rt.fields.find(f => f.id === 'retireAge1').value, 55); assert.equal(Rt.fields.find(f => f.id === 'rate').value, R.asm.returnLikely);
  assert.deepEqual(retireFor({ people: [] }).needs, ['an age, a retirement age, a balance and a monthly amount']);
});
test('the FI effect folds a one-off and a monthly change into the projection like a scenario block', () => {
  const none = fiEffect(R, { oneOff: 0, monthly: 0, years: 30 }); assert.equal(none.deltaMonths, 0);
  const cost = fiEffect(R, { oneOff: 5000000, monthly: 50000, years: 30 }); assert.ok(cost.deltaMonths > 0); const saving = fiEffect(R, { oneOff: 0, monthly: -50000, years: 30 }); assert.ok(saving.deltaMonths < 0);
  const blank = fiEffect({ projectionInputs: null }, { oneOff: 0 }); assert.ok(blank.needs);
});
test('the hub: eleven calculators in the registry with routes and live numbers; the ten charts in the catalog and the list', () => {
  const reg = data.calculators.calculators; assert.equal(reg.length, 11); reg.forEach(c => { assert.ok(/^#\//.test(c.route), c.id); assert.ok(c.purpose.length > 20 && !/registry|node|edge|band|lever family|decomposition/i.test(c.purpose + c.name + c.client), c.id); assert.ok(Number.isInteger(c.firstSession)); });
  const live = liveNumbers(leah, R, data); assert.ok(live.safeToSpend > 0 && live.lowPoint && live.homeComfortable === X.leahHome.comfortablePrice && live.houseMonthly > 0 && live.carBest === X.leahNoCar.costPerMonth && live.retireNestEgg > 0);
  assert.equal(CALC_CHARTS.length, 10); assert.equal(ALL_CHARTS.length, 49);
  CALC_CHARTS.forEach(c => { assert.ok(data.charts.charts[c.id], c.id + ' in the catalog'); c.metrics.forEach(m => assert.ok(data.metrics.metrics.some(x => x.id === m), c.id + ' metric ' + m)); assert.equal(chartMeta(c.id, data).stage, c.stage); const d = c.build(R, {}); assert.ok(d && !d.needs, c.id + ' builds on Leah: ' + JSON.stringify(d && d.needs)); });
  const blank = compute(loadHousehold('maya-discovery'), data, { today: TODAY }); CALC_CHARTS.forEach(c => { const d = c.build(blank, {}); if (d.needs) d.needs.forEach(n => assert.ok(data.unlocks.needsMap[n], c.id + ' needs phrase unmapped: ' + n)); });
  const sm = R.metrics; assert.equal(sm.safeToSpend.status, 'ok'); assert.equal(sm.lowPoint.status, 'ok'); assert.equal(sm.carCostShare.status, 'ok'); assert.equal(sm.safeToSpend.value.cents, X.leahCalendar.safeToSpendToday); assert.equal(sm.lowPoint.value.cents, X.leahCalendar.low.cents); assert.equal(sm.lowPoint.date, X.leahCalendar.low.date);
  close(sm.carCostShare.value.value, 19000 / X.leahHome.inputs.grossMonthly, 1e-6, 'car share');
});
test('Leah\'s calendar ties out to the workpaper: the low point, safe to spend, the first paycheck, the end of the window, no interest, no shortfalls', async () => {
  const C = await import('../../engine/cashcal.js'); const m = C.buildModel(leah, R, data, { days: X.leahCalendar.days }); const run = C.simulate(m, { maybeMode: 'likely' });
  assert.equal(run.low.date, X.leahCalendar.low.date); assert.equal(run.low.cents, X.leahCalendar.low.cents); assert.equal(run.safeToSpend.today, X.leahCalendar.safeToSpendToday); assert.equal(run.safeToSpend.committed, X.leahCalendar.committed); assert.equal(run.safeToSpend.nextIncome, X.leahCalendar.nextIncome);
  const p = run.paychecks[0]; assert.equal(p.date, X.leahCalendar.firstPaycheck.date); assert.equal(p.cents, X.leahCalendar.firstPaycheck.cents); assert.equal(p.left, X.leahCalendar.firstPaycheck.left);
  assert.equal(run.end.primary, X.leahCalendar.endChecking); assert.equal(run.interest.total, 0); assert.equal(run.shortfalls.length, 0); assert.equal(m.floor, 0);
  const fx = C.billTimingFixes(m); assert.ok(fx.tried >= 3);
});
