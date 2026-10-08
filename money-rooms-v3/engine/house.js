/* The House calculator (Level 13, MR-067). Pure. The full cost of owning
   year by year, the loan with its interest from the amortization alone,
   mortgage insurance tied to the loan-to-value each month and ending at
   20% equity, FHA and VA fees, the tax effect against the standard
   deduction, selling costs at exit, and renting against buying for 1 to
   30 years: the port of Eli's Buy vs Rent workbook with its seven fixes
   (see reference/buy-vs-rent-model.md). The renter invests the down
   payment and closing costs up front and the monthly difference whichever
   side is cheaper; the buyer invests the difference too when owning costs
   less. Net worth: sale proceeds after selling costs minus the loan for
   the buyer, the portfolio after capital gains tax for the renter. */
import { levelPayment, amortize } from './loanmath.js';
import { monthlyCost, cashToClose, mortgageInsurance } from './home.js';
import { federalTax, standardDeduction } from './tax.js';
import { fiEffect } from './fieffect.js';

/* Month by month ownership over N years. inp as home.js monthlyCost plus { years, appreciation, inflation, extraPrincipal, pmiByAppreciation } */
export function ownership(lib, inp) {
  const years = inp.years || 30; const months = years * 12; const c0 = monthlyCost(lib, inp);
  const term = (inp.termYears || 30) * 12; const sched = amortize(c0.loan, inp.rate, term, inp.extraPrincipal || 0);
  const mi = mortgageInsurance(lib, inp.loanType || 'conventional', c0.ltv, inp.credit || '740-759', inp.downPct);
  const appr = inp.appreciation === undefined ? lib.comparison.appreciationLikely : inp.appreciation; const infl = inp.inflation === undefined ? lib.comparison.inflation : inp.inflation;
  const rows = []; let miEnd = null; let value = inp.price; let cumInterest = 0, cumPrincipal = 0, cumCost = 0, cumMi = 0;
  const yearRows = [];
  for (let m = 1; m <= months; m++) {
    const yearIdx = Math.floor((m - 1) / 12); const row = sched.rows[m - 1] || { interest: 0, principal: 0, balance: 0, payment: 0 };
    value = Math.round(inp.price * Math.pow(1 + appr, (m - 1) / 12));
    const tax = Math.round(value * inp.taxRate / 12); const ins = Math.round((inp.insuranceAnnual || 0) * Math.pow(1 + infl, yearIdx) / 12); const hoa = Math.round((inp.hoaMonthly || 0) * Math.pow(1 + infl, yearIdx));
    const maint = Math.round(value * (inp.maintenanceShare || 0) / 12); const util = inp.utilitiesDiff || 0; const flood = inp.flood ? Math.round((inp.floodAnnual || lib.comparison.floodInsuranceAnnualCents) / 12) : 0;
    let miM = 0;
    if ((inp.loanType || 'conventional') === 'conventional') { const ltvNow = row.balance / (inp.pmiByAppreciation ? value : inp.price); if (ltvNow > 0.80 - 1e-9 && mi.annual > 0) miM = Math.round(c0.loan * mi.annual / 12); else if (miEnd === null && mi.annual > 0) miEnd = m - 1; }
    else if ((inp.loanType || 'conventional') === 'fha') { const forLife = inp.downPct < 0.10; if (forLife || m <= (lib.fha.mipYearsIfDown10OrMore || 11) * 12) miM = Math.round(row.balance * mi.annual / 12); else if (miEnd === null) miEnd = m - 1; }
    const total = row.payment + tax + ins + hoa + maint + util + flood + miM;
    cumInterest += row.interest; cumPrincipal += row.principal; cumCost += total; cumMi += miM;
    rows.push({ month: m, value, balance: row.balance, pi: row.payment, interest: row.interest, principal: row.principal, tax, ins, hoa, maint, util, flood, mi: miM, total, equity: value - row.balance });
    if (m % 12 === 0) { const ys = rows.slice(m - 12, m); yearRows.push({ year: m / 12, value, balance: row.balance, interest: ys.reduce((s, r) => s + r.interest, 0), principal: ys.reduce((s, r) => s + r.principal, 0), pi: ys.reduce((s, r) => s + r.pi, 0), tax: ys.reduce((s, r) => s + r.tax, 0), ins: ys.reduce((s, r) => s + r.ins, 0), hoa: ys.reduce((s, r) => s + r.hoa, 0), maint: ys.reduce((s, r) => s + r.maint, 0), mi: ys.reduce((s, r) => s + r.mi, 0), other: ys.reduce((s, r) => s + r.util + r.flood, 0), total: ys.reduce((s, r) => s + r.total, 0), cumInterest, cumPrincipal, cumCost, equity: value - row.balance }); }
  }
  if (miEnd === null && (inp.loanType || 'conventional') === 'conventional' && (mi.annual === 0 || c0.ltv <= 0.80)) miEnd = 0; /* no insurance from the start */
  return { first: c0, schedule: sched, payment: sched.payment, totalInterest: sched.totalInterest, loanMonths: sched.months, miEndsMonth: miEnd, miTotal: cumMi, rows, years: yearRows, value: v => rows[Math.min(rows.length, Math.max(1, v)) - 1].value };
}
/* The tax effect in year one: itemizing (mortgage interest within the limit, state and local taxes within the cap) against the standard deduction. Most clients will not itemize; the result says so. */
export function taxEffect(lib, taxTable, own, q) {
  const status = q.filingStatus || 'single'; const std = standardDeduction(taxTable, status);
  const y1 = own.years[0]; const loanShare = own.first.loan > lib.tax.mortgageInterestLimitCents ? lib.tax.mortgageInterestLimitCents / own.first.loan : 1;
  const interest = Math.round(y1.interest * loanShare); const salt = Math.min(lib.tax.saltCapCents, y1.tax + (q.stateIncomeTaxAnnual || 0)); const other = q.otherItemized || 0;
  const itemized = interest + salt + other; const taxable = Math.max(0, q.grossAnnual || 0);
  const withStd = federalTax(taxTable, Math.max(0, taxable - std), status).tax; const withItem = federalTax(taxTable, Math.max(0, taxable - Math.max(std, itemized)), status).tax;
  return { itemizes: itemized > std, itemized, standard: std, interest, salt, savingAnnual: Math.max(0, withStd - withItem), savingMonthly: Math.round(Math.max(0, withStd - withItem) / 12), marginal: federalTax(taxTable, Math.max(0, taxable - std), status).marginal };
}
/* Rent against buy, year by year. q: { years, rentMonthly, rentGrowth, rentersInsuranceMonthly, securityDepositMonths, stockReturn, capitalGainsRate, sellingCostShare, appreciation(s) } */
export function rentVsBuy(lib, inp, q) {
  const years = q.years || 30; const own = ownership(lib, Object.assign({}, inp, { years, appreciation: q.appreciation }));
  const ctc = cashToClose(lib, inp, inp.price); const upfront = ctc.down + ctc.closing + ctc.transfer + own.first.miUpfront;
  const r = (q.stockReturn === undefined ? lib.comparison.stockReturn : q.stockReturn) / 12; const cg = q.capitalGainsRate === undefined ? lib.comparison.capitalGainsRate : q.capitalGainsRate;
  const sell = q.sellingCostShare === undefined ? lib.comparison.sellingCostShare : q.sellingCostShare; const rentG = q.rentGrowth === undefined ? lib.comparison.rentGrowth : q.rentGrowth;
  const deposit = Math.round(q.rentMonthly * (q.securityDepositMonths === undefined ? lib.comparison.securityDepositMonths : q.securityDepositMonths));
  let renterPort = upfront - deposit, renterBasis = upfront - deposit, buyerPort = 0, buyerBasis = 0; const out = []; let cumRent = 0, renterCash = deposit, buyerCash = ctc.total;
  let breakEven = null;
  for (let y = 1; y <= years; y++) {
    const rent = Math.round(q.rentMonthly * Math.pow(1 + rentG, y - 1)); const rIns = Math.round((q.rentersInsuranceMonthly === undefined ? lib.comparison.rentersInsuranceMonthlyCents : q.rentersInsuranceMonthly) * Math.pow(1 + (inp.inflation === undefined ? lib.comparison.inflation : inp.inflation), y - 1));
    for (let m = 1; m <= 12; m++) {
      const row = own.rows[(y - 1) * 12 + m - 1]; const buyerTotal = row.total; const renterTotal = rent + rIns;
      renterPort = Math.round(renterPort * (1 + r)); buyerPort = Math.round(buyerPort * (1 + r));
      const diff = buyerTotal - renterTotal;
      if (diff > 0) { renterPort += diff; renterBasis += diff; } else if (diff < 0) { buyerPort += -diff; buyerBasis += -diff; }
      cumRent += renterTotal; renterCash += renterTotal; buyerCash += buyerTotal;
    }
    const yr = own.years[y - 1];
    const buyerNW = Math.round(yr.value * (1 - sell)) - yr.balance + buyerPort - Math.round(Math.max(0, buyerPort - buyerBasis) * cg);
    const renterNW = renterPort - Math.round(Math.max(0, renterPort - renterBasis) * cg) + deposit;
    out.push({ year: y, rent, buyerMonthly: Math.round(yr.total / 12), renterMonthly: rent + rIns, homeValue: yr.value, loanBalance: yr.balance, buyerNetWorth: buyerNW, renterNetWorth: renterNW, renterPortfolio: renterPort, buyerPortfolio: buyerPort, cumRent, buyerCashSpent: buyerCash, renterCashSpent: renterCash, cumInterest: yr.cumInterest, equity: yr.equity, mi: yr.mi });
    if (breakEven === null && buyerNW >= renterNW) breakEven = y;
    else if (breakEven !== null && buyerNW < renterNW && y - breakEven < 2) breakEven = null;
  }
  return { years: out, breakEvenYear: breakEven, upfront, deposit, own, at: y => out[Math.min(out.length, Math.max(1, y)) - 1] };
}
/* The comparison under low, likely and high appreciation. */
export function rentVsBuyRange(lib, inp, q) { const C = lib.comparison; return { low: rentVsBuy(lib, inp, Object.assign({}, q, { appreciation: q.appreciationLow === undefined ? C.appreciationLow : q.appreciationLow })), likely: rentVsBuy(lib, inp, Object.assign({}, q, { appreciation: q.appreciation === undefined ? C.appreciationLikely : q.appreciation })), high: rentVsBuy(lib, inp, Object.assign({}, q, { appreciation: q.appreciationHigh === undefined ? C.appreciationHigh : q.appreciationHigh })) }; }
/* House hack: rooms or units rented. */
export function houseHack(lib, own, q) { const gross = (q.units || 0) * (q.rentPerUnit || 0); const vacancy = q.vacancy === undefined ? lib.rental.vacancyShare : q.vacancy; const net = Math.round(gross * (1 - vacancy)) - (q.extraCosts || 0); const first = own.first.total; return { grossRent: gross, netRent: net, vacancy, extraCosts: q.extraCosts || 0, housingCost: first - net, before: first, units: q.units || 0 }; }
/* FI date with the house against without it, through the projection. */
export function houseFi(result, own, ctc, rentNow, years) { return fiEffect(result, { oneOff: ctc.total, monthly: own.first.total - (rentNow || 0), years: years || 30 }); }
/* Upfront cash as a list the waterfall draws. */
export function upfrontList(lib, inp) {
  const ctc = cashToClose(lib, inp, inp.price); const c = monthlyCost(lib, inp); const o = lib.oneOffs; const attorney = (lib.transferTaxes.attorneyCustomaryStates || []).includes(inp.state) ? o.attorneyCents : 0;
  const detail = [['Down payment', ctc.down], ['Lender fees and points', o.lenderFeesCents + Math.round(c.loan * (inp.points || 0) / 100)], ['Title and recording', Math.round(inp.price * o.titleShareOfPrice) + o.recordingCents], ['Appraisal and inspection', o.appraisalCents + o.inspectionCents], ['Attorney', attorney], ['Transfer taxes (buyer side)', ctc.transfer], ['Mortgage insurance upfront', c.miUpfront], ['Prepaid taxes, insurance and interest', ctc.prepaids], ['Escrow cushion', ctc.escrow], ['Moving', ctc.moving], ['Initial repairs', ctc.repairs], ['Furnishing', inp.furnishingCents === undefined ? o.furnishingCents : inp.furnishingCents]].filter(p => p[1] > 0);
  return { parts: detail, total: detail.reduce((s, p) => s + p[1], 0), ctc };
}
export { levelPayment };
