/* The Car calculator (Level 13, MR-067). Pure. Two to four options side by
   side: buy new, buy used, lease, no car. Upfront (price, sales tax with
   the state's trade-in credit, fees, down payment, trade-in), the loan or
   the lease (money factor shown as a rate, x 2400), running costs by age,
   depreciation by year from data/auto-costs.json, when the loan is
   underwater, true cost a month and a mile, and the 20/3/8 and 20/4/10
   rules as pass or not. The level-payment formula is engine/loanmath.js. */
import { levelPayment, amortize } from './loanmath.js';
import { fiEffect } from './fieffect.js';

export function valueByYear(lib, price, ageYears, years, ev) { const curve = lib.depreciation.newByYear; const adj = ev ? lib.depreciation.evAdjustment : 1; const floor = Math.round(price * lib.depreciation.floorShareOfPrice); const out = [price]; let v = price; for (let y = 0; y < years; y++) { const idx = Math.min(curve.length - 1, ageYears + y); v = Math.max(floor, Math.round(v * (1 - Math.min(0.6, curve[idx] * adj)))); out.push(v); } return out; }
function maintenanceAt(lib, age) { const m = lib.maintenanceAnnualByAge; return m[Math.min(m.length - 1, Math.max(0, age))]; }
export function salesTax(lib, state, price, tradeIn) { const st = lib.salesTaxByState[state] || { rate: 0.06, tradeInCredit: true }; const base = st.tradeInCredit ? Math.max(0, price - (tradeIn || 0)) : price; return { rate: st.rate, tax: Math.round(base * st.rate), creditUsed: !!st.tradeInCredit && (tradeIn || 0) > 0 }; }
/* One option. opt: { kind: new|used|lease|none, price, ageYears, miles, down, tradeIn, tradeInPayoff, rate, termMonths, addOns, moneyFactor, residualShare, leaseMonths, capReduction, milesAllowed, ev, mpg, milesPerYear, gasPrice, insuranceAnnual, parkingMonthly, tollsMonthly, keepYears, transitMonthly, rideshareMonthly, rentalDays, carShareMonthly } */
export function carOption(lib, opt, ctx) {
  const state = ctx.state; const keep = opt.keepYears || 5; const months = keep * 12; const miles = opt.milesPerYear || lib.milesPerYearDefault;
  if (opt.kind === 'none') {
    const transit = opt.transitMonthly === undefined ? (lib.noCar.transitPassByMetro[(ctx.city || '').toLowerCase()] || lib.noCar.transitPassDefaultCents) : opt.transitMonthly;
    const ride = opt.rideshareMonthly === undefined ? lib.noCar.rideshareMonthlyCents : opt.rideshareMonthly; const rent = Math.round(((opt.rentalDays === undefined ? lib.noCar.rentalDaysPerYear : opt.rentalDays) * lib.noCar.rentalDayCents) / 12); const share = opt.carShareMonthly === undefined ? lib.noCar.carShareMonthlyCents : opt.carShareMonthly;
    const monthly = transit + ride + rent + share;
    return { kind: 'none', label: 'No car', upfront: { total: 0, parts: [] }, monthlyPayment: 0, running: { total: monthly, parts: [['Transit pass', transit], ['Rideshare', ride], ['Occasional rental', rent], ['Car share', share]].filter(p => p[1] > 0) }, totalCost: monthly * months, costPerMonth: monthly, costPerMile: null, endValue: 0, interest: 0, underwaterMonths: 0, keepYears: keep, rules: null, stack: [['Getting around', monthly * months]] };
  }
  const isLease = opt.kind === 'lease'; const price = opt.price; const age0 = opt.kind === 'used' ? (opt.ageYears || lib.usedDefaults.ageYears) : 0;
  const tax = salesTax(lib, state, price, opt.tradeIn); const doc = (lib.docFeeCapByState[state] || {}).typicalCents || 50000; const reg = lib.titleAndRegistrationByState[state] || { titleCents: 5000, registrationAnnualCents: 8000, inspectionAnnualCents: 0 };
  const addOns = opt.addOns || 0; const tradeEquity = (opt.tradeIn || 0) - (opt.tradeInPayoff || 0);
  let upfrontParts, financed = 0, payment = 0, interest = 0, schedule = null, leaseInfo = null, endValue = 0, apr = opt.rate;
  const values = valueByYear(lib, price, age0, keep, opt.ev);
  if (isLease) {
    const mf = opt.moneyFactor === undefined ? lib.lease.moneyFactorDefault : opt.moneyFactor; apr = mf * 2400 / 100; const lm = opt.leaseMonths || 36; const residual = Math.round(price * (opt.residualShare === undefined ? (lm <= 24 ? lib.lease.residualShare24 : lib.lease.residualShare36) : opt.residualShare));
    const cap = price + addOns - (opt.capReduction || 0) - Math.max(0, tradeEquity); const dep = Math.round((cap - residual) / lm); const fin = Math.round((cap + residual) * mf); const base = dep + fin; payment = Math.round(base * (1 + tax.rate));
    const over = Math.max(0, miles - (opt.milesAllowed || lib.lease.milesPerYear)) * keep * lib.lease.overageCentsPerMile;
    upfrontParts = [['Cap reduction (down)', opt.capReduction || 0], ['Acquisition fee', lib.lease.acquisitionFeeCents], ['First payment', payment], ['Doc fee, title and registration', doc + reg.titleCents]].filter(p => p[1] > 0);
    const cycles = Math.ceil(months / lm); interest = fin * lm * cycles; leaseInfo = { moneyFactor: mf, apr, residual, cap, depreciationFee: dep, financeFee: fin, taxOnPayment: payment - base, months: lm, cycles, overage: over, disposition: lib.lease.dispositionFeeCents * cycles };
    endValue = 0;
  } else {
    const down = opt.down || 0; financed = Math.max(0, price + tax.tax + doc + reg.titleCents + addOns - down - tradeEquity); const term = opt.termMonths || lib.loan.termMonthsDefault; apr = opt.rate === undefined ? (opt.kind === 'used' ? lib.loan.usedRate : lib.loan.newRate) : opt.rate;
    schedule = financed > 0 ? amortize(financed, apr, term) : null; payment = schedule ? schedule.payment : 0; interest = schedule ? schedule.totalInterest : 0;
    upfrontParts = [['Down payment', down], ['Sales tax', tax.tax], ['Doc fee', doc], ['Title and registration', reg.titleCents + reg.registrationAnnualCents], ['Dealer add-ons (optional)', addOns], ['Trade-in equity', -Math.max(0, tradeEquity)]].filter(p => p[1] !== 0);
    endValue = values[keep];
  }
  /* running costs */
  const insurance = opt.insuranceAnnual === undefined ? (lib.insuranceAnnualByState[state] || 180000) : opt.insuranceAnnual;
  const fuel = opt.ev ? Math.round(miles * lib.fuel.evKwhPerMile * ((1 - lib.fuel.publicChargingShare) * lib.fuel.homeKwhPriceCents + lib.fuel.publicChargingShare * lib.fuel.publicKwhPriceCents)) : Math.round(miles / (opt.mpg || lib.fuel.defaultMpg) * (opt.gasPrice === undefined ? lib.fuel.gasPricePerGallonCents : opt.gasPrice));
  const maint = isLease ? Math.round(maintenanceAt(lib, 0) * 0.6) : Math.round(Array.from({ length: keep }, (_, y) => maintenanceAt(lib, age0 + y)).reduce((s, v) => s + v, 0) / keep);
  const tires = isLease ? 0 : Math.round(miles / lib.tires.everyMiles * lib.tires.setCents); const regRenew = reg.registrationAnnualCents + (reg.inspectionAnnualCents || 0);
  const tier = ctx.tier || 'MCOL'; const parking = (opt.parkingMonthly === undefined ? lib.parkingMonthlyByTier[tier] : opt.parkingMonthly) * 12; const tolls = (opt.tollsMonthly === undefined ? lib.tollsMonthlyByTier[tier] : opt.tollsMonthly) * 12;
  const runningAnnual = insurance + fuel + maint + tires + regRenew + parking + tolls;
  const running = { total: Math.round(runningAnnual / 12), parts: [['Insurance', Math.round(insurance / 12)], [opt.ev ? 'Charging' : 'Gas', Math.round(fuel / 12)], ['Maintenance and repairs', Math.round(maint / 12)], ['Tires', Math.round(tires / 12)], ['Registration and inspection', Math.round(regRenew / 12)], ['Parking', Math.round(parking / 12)], ['Tolls', Math.round(tolls / 12)]].filter(p => p[1] > 0) };
  const upfront = { total: upfrontParts.reduce((s, p) => s + p[1], 0), parts: upfrontParts };
  const paymentsTotal = isLease ? payment * months + leaseInfo.overage + leaseInfo.disposition : (schedule ? Math.min(months, schedule.months) * payment + (schedule.months > months ? 0 : 0) : 0);
  const loanLeft = schedule && schedule.months > months ? schedule.rows[months - 1].balance : 0;
  const totalCost = upfront.total + paymentsTotal + runningAnnual * keep - endValue + loanLeft;
  /* underwater: months the loan balance sits above the value */
  let underwater = 0, worstGap = 0; if (schedule) { for (let m = 1; m <= Math.min(schedule.months, months); m++) { const v = Math.round(values[Math.floor(m / 12)] + (values[Math.min(keep, Math.floor(m / 12) + 1)] - values[Math.floor(m / 12)]) * ((m % 12) / 12)); const gap = schedule.rows[m - 1].balance - v; if (gap > 0) { underwater++; if (gap > worstGap) worstGap = gap; } } }
  const monthlyAll = payment + running.total; const gross = ctx.grossMonthly || 0;
  const rules = Object.keys(lib.rules).map(k => { const R = lib.rules[k]; const downOk = isLease ? false : ((opt.down || 0) + Math.max(0, tradeEquity)) >= price * R.downShare; const termOk = isLease ? (opt.leaseMonths || 36) <= R.maxTermMonths : (opt.termMonths || lib.loan.termMonthsDefault) <= R.maxTermMonths; const shareOk = gross ? monthlyAll <= gross * R.maxShareOfGross : null; return { id: k, label: R.label, down: { ok: downOk, have: (opt.down || 0) + Math.max(0, tradeEquity), need: Math.round(price * R.downShare) }, term: { ok: termOk, have: isLease ? (opt.leaseMonths || 36) : (opt.termMonths || lib.loan.termMonthsDefault), max: R.maxTermMonths }, share: { ok: shareOk, have: gross ? Math.round(monthlyAll / gross * 1000) / 1000 : null, max: R.maxShareOfGross }, pass: downOk && termOk && shareOk === true }; });
  return { kind: opt.kind, label: opt.kind === 'new' ? 'Buy new' : opt.kind === 'used' ? 'Buy used' : 'Lease', price, upfront, financed, apr, monthlyPayment: payment, interest, lease: leaseInfo, running, values, endValue, loanLeft, totalCost, costPerMonth: Math.round(totalCost / months), costPerMile: Math.round(totalCost / (miles * keep)), monthlyAll, underwaterMonths: underwater, worstGap, keepYears: keep, rules, schedule: schedule ? schedule.rows.map(r => r.balance) : null, stack: [['Depreciation', isLease ? 0 : Math.max(0, price - endValue)], ['Interest and fees', interest + (isLease ? leaseInfo.disposition + leaseInfo.overage + lib.lease.acquisitionFeeCents : 0)], ['Taxes and fees', isLease ? doc + reg.titleCents : tax.tax + doc + reg.titleCents + addOns], ['Insurance', insurance * keep], [opt.ev ? 'Charging' : 'Gas', fuel * keep], ['Maintenance and tires', (maint + tires) * keep], ['Parking, tolls, registration', (parking + tolls + regRenew) * keep], ['Lease payments', isLease ? payment * months : 0]].filter(p => p[1] > 0) };
}
/* Compare options; the FI effect of each against today's transportation spend. */
export function compareCars(lib, opts, ctx, result) {
  const rows = opts.map(o => carOption(lib, o, ctx));
  rows.forEach(r => { const monthlyDelta = r.costPerMonth - (ctx.transportNowMonthly || 0); r.fi = result ? fiEffect(result, { oneOff: r.upfront.total, monthly: monthlyDelta, years: r.keepYears }) : null; });
  const cheapest = rows.slice().sort((a, b) => a.costPerMonth - b.costPerMonth)[0] || null;
  return { options: rows, cheapest: cheapest ? cheapest.kind : null };
}
export { levelPayment };
