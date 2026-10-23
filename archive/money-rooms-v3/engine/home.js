/* How much home (Level 13, MR-067). Pure. Three answers side by side: what
   a lender might approve (28% front, 36% back, or a looser back ratio by
   loan type, whichever binds), what is comfortable (the full monthly cost
   of owning, maintenance included, at or under the housing share of
   take-home, Eli's 35%), and what keeps the FI date (the highest price that
   moves it no more than N months). Then the down payment ladder, cash to
   close, a roommate or rented unit, and buy now or wait. Every default
   comes from data/housing-costs.json and says so. */
import { levelPayment } from './loanmath.js';
import { fiEffect } from './fieffect.js';

export const LADDER = [0.03, 0.035, 0.05, 0.10, 0.20];
export function creditRangeOf(score) { if (score === null || score === undefined) return '740-759'; if (score >= 760) return '760+'; if (score >= 740) return '740-759'; if (score >= 720) return '720-739'; if (score >= 700) return '700-719'; if (score >= 680) return '680-699'; if (score >= 660) return '660-679'; if (score >= 640) return '640-659'; return '620-639'; }
export function pmiRate(lib, ltv, credit) { if (ltv <= 0.80) return 0; const band = lib.pmi.bands.find(b => ltv <= b.maxLtv + 1e-9) || lib.pmi.bands[lib.pmi.bands.length - 1]; return band.rates[credit] || band.rates['740-759']; }
export function propertyTaxRate(lib, state, city) { const c = city ? lib.cityToCounty[String(city).trim().toLowerCase()] : null; if (c && lib.countyOverrides[c] !== undefined) return { rate: lib.countyOverrides[c], basis: c }; const r = lib.propertyTaxRateByState[state]; return r !== undefined ? { rate: r, basis: (state || 'US') + ' average' } : { rate: 0.011, basis: 'US average' }; }
export function mortgageInsurance(lib, loanType, ltv, credit, downPct) {
  /* annual share of the loan, plus the upfront share financed into it */
  if (loanType === 'fha') return { annual: ltv > 0.95 ? lib.fha.annual.ltvOver95 : lib.fha.annual.ltvAtOrUnder95, upfront: lib.fha.upfront, endsAt: null, years: downPct >= 0.10 ? lib.fha.mipYearsIfDown10OrMore : null };
  if (loanType === 'va') { const t = lib.va.fundingFee.firstUse; const key = downPct >= 0.10 ? '0.10' : downPct >= 0.05 ? '0.05' : '0'; return { annual: 0, upfront: t[key], endsAt: null, years: 0 }; }
  return { annual: pmiRate(lib, ltv, credit), upfront: 0, endsAt: 0.80, years: null };
}
/* The monthly cost of owning a home at a price. inp: { price, downPct, rate, termYears, loanType, taxRate, insuranceAnnual, hoaMonthly, maintenanceShare, credit, utilitiesDiff, flood } */
export function monthlyCost(lib, inp) {
  const price = inp.price; const down = Math.round(price * inp.downPct); const ltv = inp.downPct >= 1 ? 0 : 1 - inp.downPct;
  const mi = mortgageInsurance(lib, inp.loanType || 'conventional', ltv, inp.credit || '740-759', inp.downPct);
  const loan = Math.round((price - down) * (1 + (mi.upfront || 0)));
  const pi = levelPayment(loan, inp.rate, (inp.termYears || 30) * 12);
  const tax = Math.round(price * inp.taxRate / 12); const ins = Math.round((inp.insuranceAnnual || 0) / 12); const hoa = inp.hoaMonthly || 0;
  const miMonthly = Math.round(loan * mi.annual / 12); const maint = Math.round(price * (inp.maintenanceShare || 0) / 12);
  const util = inp.utilitiesDiff || 0; const flood = inp.flood ? Math.round((inp.floodAnnual || lib.comparison.floodInsuranceAnnualCents) / 12) : 0;
  const lender = pi + tax + ins + miMonthly + hoa; /* what a lender counts */
  return { price, down, loan, ltv, pi, tax, ins, mi: miMonthly, miAnnualRate: mi.annual, miUpfront: Math.round((price - down) * (mi.upfront || 0)), hoa, maint, util, flood, lender, total: lender + maint + util + flood, parts: [['Principal and interest', pi], ['Property tax', tax], ['Home insurance', ins], ['Mortgage insurance', miMonthly], ['HOA', hoa], ['Maintenance', maint], ['Utilities difference', util], ['Flood insurance', flood]].filter(p => p[1] > 0) };
}
/* The price whose cost lands on a budget: the cost is linear in price above the flat parts, so solve directly. */
export function priceForBudget(lib, inp, budget, which) {
  const probe = monthlyCost(lib, Object.assign({}, inp, { price: 10000000 })); const flat = probe.ins + probe.hoa + probe.util + probe.flood;
  const perDollar = ((which === 'lender' ? probe.lender : probe.total) - flat) / 10000000; if (perDollar <= 0) return 0;
  return Math.max(0, Math.round((budget - flat) / perDollar / 100000) * 100000);
}
/* Cash to close at a price. */
export function cashToClose(lib, inp, price) {
  const c = monthlyCost(lib, Object.assign({}, inp, { price })); const closingShare = inp.closingShare !== undefined ? inp.closingShare : ((lib.closingCostShareByState[inp.state] || { low: 0.02, high: 0.05 }).low + (lib.closingCostShareByState[inp.state] || { low: 0.02, high: 0.05 }).high) / 2;
  const closing = Math.round(price * closingShare); const prepaidTax = c.tax * lib.prepaids.escrowMonthsTaxes; const prepaidIns = lib.prepaids.insuranceFirstYearUpfront ? c.ins * 12 : 0; const prepaidInterest = Math.round(c.loan * inp.rate / 365 * lib.prepaids.prepaidInterestDays);
  const escrow = c.tax * 2 + c.ins * lib.prepaids.escrowMonthsInsurance; const moving = inp.movingCents !== undefined ? inp.movingCents : lib.oneOffs.movingCents; const repairs = Math.round(price * lib.oneOffs.firstYearRepairsShare);
  const transfer = buyerTransferTax(lib, inp.state, inp.city, price);
  const parts = [['Down payment', c.down], ['Closing costs', closing], ['Transfer taxes (buyer side)', transfer], ['Prepaid taxes and insurance', prepaidTax + prepaidIns + prepaidInterest], ['Escrow cushion', escrow], ['Moving', moving], ['First-year repairs reserve', repairs]].filter(p => p[1] > 0);
  return { price, down: c.down, closing, closingShare, transfer, prepaids: prepaidTax + prepaidIns + prepaidInterest, escrow, moving, repairs, total: parts.reduce((s, p) => s + p[1], 0), parts };
}
export function buyerTransferTax(lib, state, city, price) { const st = lib.transferTaxes.byState[state] || { buyerRate: 0 }; const ct = city ? lib.transferTaxes.cities[String(city).trim().toLowerCase()] : null; let t = Math.round(price * (st.buyerRate || 0)); if (ct) { if (!ct.buyerAbove || price >= ct.buyerAbove) t += Math.round(price * (ct.buyerRate || 0)); } return t; }

/* The whole screen. inp: { grossMonthly, takeHomeMonthly, debtMinimumsMonthly, cashAvailable, savingsPaceMonthly, rentNow, state, city, credit, rate, termYears, loanType, downPct, hoaMonthly, insuranceAnnual, taxRate, maintenanceShare, frontRatio, backRatio, backRatioLoose, looseOn, comfortableShare, fiMonthsAllowed, rentalIncomeMonthly, rentalCountShare } */
export function homeAfford(lib, inp, result) {
  const front = inp.frontRatio || 0.28; const back = inp.looseOn ? (inp.backRatioLoose || 0.43) : (inp.backRatio || 0.36);
  const rental = (inp.rentalIncomeMonthly || 0) * (inp.rentalCountShare === undefined ? lib.rental.lenderCountsShareOfRent : inp.rentalCountShare);
  const gross = inp.grossMonthly + rental; const needs = [];
  if (!(inp.grossMonthly > 0)) needs.push('gross pay'); if (!(inp.takeHomeMonthly > 0)) needs.push('take-home pay');
  if (needs.length) return { needs };
  const frontBudget = Math.round(gross * front); const backBudget = Math.round(gross * back) - (inp.debtMinimumsMonthly || 0);
  const lenderBudget = Math.min(frontBudget, backBudget); const binding = frontBudget <= backBudget ? 'front' : 'back';
  const lenderPrice = priceForBudget(lib, inp, lenderBudget, 'lender');
  const comfortableBudget = Math.round((inp.takeHomeMonthly + (inp.rentalIncomeMonthly || 0)) * (inp.comfortableShare || 0.35));
  const comfortablePrice = priceForBudget(lib, inp, comfortableBudget, 'total');
  /* what keeps the FI date: the highest price whose full cost (less today's rent) and cash to close move it no more than N months */
  let fiSafe = null;
  if (result && result.projectionInputs) {
    const allowed = inp.fiMonthsAllowed === undefined ? 6 : inp.fiMonthsAllowed; const ok = price => { const c = monthlyCost(lib, Object.assign({}, inp, { price })); const ctc = cashToClose(lib, inp, price); const e = fiEffect(result, { oneOff: ctc.total, monthly: c.total - (inp.rentNow || 0), years: 30 }); return e.deltaMonths !== null && e.deltaMonths <= allowed ? e : null; };
    let lo = 0, hi = Math.max(lenderPrice, comfortablePrice) * 1.5 || 50000000, best = null; const base = ok(0);
    if (base) { for (let i = 0; i < 18; i++) { const mid = Math.round((lo + hi) / 2 / 100000) * 100000; const e = ok(mid); if (e) { best = { price: mid, effect: e }; lo = mid; } else hi = mid; if (hi - lo <= 100000) break; } }
    fiSafe = best ? { price: best.price, cost: monthlyCost(lib, Object.assign({}, inp, { price: best.price })), effect: best.effect, allowed } : { price: 0, cost: null, effect: null, allowed };
  }
  const lender = { price: lenderPrice, budget: lenderBudget, binding, front, back, cost: monthlyCost(lib, Object.assign({}, inp, { price: lenderPrice })) };
  const comfortable = { price: comfortablePrice, budget: comfortableBudget, share: inp.comfortableShare || 0.35, cost: monthlyCost(lib, Object.assign({}, inp, { price: comfortablePrice })) };
  const ladder = LADDER.map(d => { const i2 = Object.assign({}, inp, { downPct: d }); const lp = priceForBudget(lib, i2, lenderBudget, 'lender'); const cp = priceForBudget(lib, i2, comfortableBudget, 'total'); const price = Math.min(lp, cp); const ctc = cashToClose(lib, i2, price); const gap = ctc.total - (inp.cashAvailable || 0); const months = gap <= 0 ? 0 : (inp.savingsPaceMonthly > 0 ? Math.ceil(gap / inp.savingsPaceMonthly) : null); return { downPct: d, price, lenderPrice: lp, comfortablePrice: cp, cashToClose: ctc.total, gap: Math.max(0, gap), months, loanType: d < 0.035 && inp.loanType === 'fha' ? 'conventional 3%' : null, mi: monthlyCost(lib, Object.assign({}, i2, { price })).mi }; });
  const ctc = cashToClose(lib, inp, comfortablePrice);
  const wait = [0, 12, 24].map(m => { const cash = (inp.cashAvailable || 0) + (inp.savingsPaceMonthly || 0) * m; const reach = ladder.filter(l => l.cashToClose <= cash).sort((a, b) => b.downPct - a.downPct)[0] || null; return { months: m, cash, reachable: reach ? { downPct: reach.downPct, price: reach.price } : null, comfortablePrice, lenderPrice }; });
  const hack = inp.rentalIncomeMonthly > 0 ? { rental, counted: inp.rentalCountShare === undefined ? lib.rental.lenderCountsShareOfRent : inp.rentalCountShare, lenderWithout: priceForBudget(lib, inp, Math.min(Math.round(inp.grossMonthly * front), Math.round(inp.grossMonthly * back) - (inp.debtMinimumsMonthly || 0)), 'lender'), comfortableWithout: priceForBudget(lib, inp, Math.round(inp.takeHomeMonthly * (inp.comfortableShare || 0.35)), 'total') } : null;
  return { lender, comfortable, fiSafe, ladder, cashToClose: ctc, wait, hack, headline: null };
}
