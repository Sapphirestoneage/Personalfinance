/* One year-by-year projection to 95, in real dollars, run three times
   (likely, best, worst). Invested money grows at the return; cash grows at
   the cash return and never takes a market shock; debts follow the avalanche
   simulation; contributions stop at retirement; spending follows go-go,
   slow-go and no-go after retirement; Social Security from 67 at a bend-point
   estimate. FI is the first year net worth x withdrawal rate covers spending. */
import { yearEndBalances } from './debtsim.js';

export function socialSecurityMonthly(aimeCents, limits, scale) {
  const [b1, b2] = limits.socialSecurity.bendPoints2026Cents;
  const [r1, r2, r3] = limits.socialSecurity.pia;
  const pia = r1 * Math.min(aimeCents, b1) + r2 * Math.max(0, Math.min(aimeCents, b2) - b1) + r3 * Math.max(0, aimeCents - b2);
  return Math.round(pia * (scale === undefined ? 1 : scale));
}

/* inputs: { age, year, invested, cash, debts, debtOrder, annualSpend, employeeAnnual, employerAnnual, leakAnnual, debtServiceAnnual, retirementAge, ssMonthly, asm, extraContribAnnual, oneOffs }
   oneOffs (MR-070): { [year]: cents } the goals spend along the way; cash first, then invested while working; added to the year's need after. */
export function project(inp, rate) {
  const asm = inp.asm;
  const end = asm.projectionEndAge;
  const years = end - inp.age;
  const debtByYear = inp.debts.length ? yearEndBalances(inp.debts, inp.debtOrder, inp.today.slice(0, 7), years) : {};
  let inv = inp.invested, csh = inp.cash, year = inp.year, a = inp.age, fiAge = null;
  const path = [];
  const retireAge = inp.retirementAge;
  const oneOffs = inp.oneOffs || {};
  for (let y = 1; y <= years; y++) {
    year++; a++;
    /* keepWorking (MR-061): work on to the retirement age even past FI, so two paths can be compared like for like */
    const working = a <= retireAge && (fiAge === null || a <= fiAge || inp.keepWorking);
    const debtNow = debtByYear[year] || 0;
    const oneOff = oneOffs[year] || 0;
    if (working) {
      inv = Math.round(inv * (1 + rate)) + inp.employeeAnnual + inp.employerAnnual + (inp.extraContribAnnual || 0);
      const freed = debtNow === 0 && inp.debts.length ? inp.debtServiceAnnual : 0;
      csh = Math.round(csh * (1 + asm.cashRealReturn)) + Math.max(0, inp.leakAnnual) + freed - oneOff;
      if (csh < 0) { inv += csh; csh = 0; }
    } else {
      const mult = a < asm.slowgoAge ? inp.mult.gogo : a < asm.nogoAge ? inp.mult.slowgo : inp.mult.nogo;
      const need = Math.round(inp.annualSpend * mult) + oneOff - (a >= asm.socialSecurityAge ? inp.ssMonthly * 12 : 0);
      inv = Math.round(inv * (1 + rate)) - Math.max(0, need);
      csh = Math.round(csh * (1 + asm.cashRealReturn));
    }
    const nw = inv + csh - debtNow;
    if (fiAge === null && nw * asm.withdrawalRate >= inp.annualSpend) fiAge = a;
    path.push({ year, age: a, invested: inv, cash: csh, debt: debtNow, netWorth: nw, working, ss: a >= asm.socialSecurityAge && !working ? inp.ssMonthly * 12 : 0 });
  }
  return { fiAge, fiYear: fiAge !== null ? path.find(p => p.age === fiAge).year : null, path, rate };
}

export function tripleD(inp) {
  const asm = inp.asm;
  /* Level 8 (MR-047): the worst case also carries a roommate leaving for good when there is one */
  const worstInp = inp.worstExtraAnnualSpend ? Object.assign({}, inp, { annualSpend: inp.annualSpend + inp.worstExtraAnnualSpend, leakAnnual: inp.leakAnnual - inp.worstExtraAnnualSpend }) : inp;
  return { likely: project(inp, asm.returnLikely), best: project(inp, asm.returnBest), worst: project(worstInp, asm.returnWorst) };
}
