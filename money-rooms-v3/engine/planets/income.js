/* Income: W-2, 1099, side, unemployment, rental, benefits and match.
   Capture reads rows; Enrich infers take-home from gross with the one tax
   function (before state tax, confidence capped); Analyze sums by type;
   Publish fills the contract. */
import { q, U, add, sum, scale, needs, asTax, isNeeds } from '../units.js';
import { fieldQ, monthlyCents, num, val, isNa, paychecksPerYear } from './common.js';
import { federalTax, taxableIncome, fica, selfEmploymentTax } from '../tax.js';
import { confidenceOf, hasValue } from '../states.js';
import { hasPartner, countsTogether } from '../household.js';

export function run(ctx) {
  const { rows, reader, data, asm } = ctx;
  const out = {};
  const enriched = [];
  const byType = { w2: 0, c1099: 0, side: 0, unemployment: 0, rental: 0, benefits: 0, other: 0, paystub: 0 };
  let gross = q(0, U.monthlyPre), take = q(0, U.monthlyAfter);
  let pretax = q(0, U.monthlyPre), roth = q(0, U.monthlyAfter), hsa = q(0, U.monthlyPre), other = q(0, U.monthlyPre);
  let hours = 0, workCosts = q(0, U.monthlyAfter), anyTake = false, anyGross = false;
  const stabilities = [];
  const grossRows = [];
  let w2Primary = null;
  const filing = ctx.filingStatus || 'single';
  /* a partner's rows (MR-050): counted with the client's under "together", left out under "mine"; their take-home is published either way */
  const hh = ctx.record && ctx.record.household; const mineOnly = hasPartner(hh) && !countsTogether(hh);
  let partnerTake = q(0, U.monthlyAfter);

  rows.forEach(r => {
    const t = r.type;
    const partnerRow = val(r, 'whose') === 'partner';
    if (partnerRow && mineOnly) { const pth = fieldQ(r, 'takeHome', U.monthlyAfter, asm); if (pth) partnerTake = add(partnerTake, pth); return; }
    if (t === 'w2' || t === 'c1099' || t === 'side') {
      const g = fieldQ(r, 'grossPay', U.monthlyPre, asm);
      const bonus = fieldQ(r, 'bonus', U.monthlyPre, asm);
      const equity = fieldQ(r, 'equity', U.monthlyPre, asm);
      const pr = fieldQ(r, 'pretaxRetirement', U.monthlyPre, asm);
      const ro = fieldQ(r, 'rothRetirement', U.monthlyAfter, asm);
      const hs = fieldQ(r, 'hsaPayroll', U.monthlyPre, asm);
      const ot = fieldQ(r, 'pretaxOther', U.monthlyPre, asm);
      if (g) { gross = add(gross, g); byType[t] += g.cents; byType.paystub += g.cents; anyGross = true; grossRows.push({ row: r, g }); if (t === 'w2' && !w2Primary) w2Primary = r; }
      if (bonus) { gross = add(gross, bonus); byType[t] += bonus.cents; }
      if (equity) { gross = add(gross, equity); byType[t] += equity.cents; }
      if (pr) pretax = add(pretax, pr);
      if (ro) roth = add(roth, ro);
      if (hs) hsa = add(hsa, hs);
      if (ot) other = add(other, ot);
      let th = fieldQ(r, 'takeHome', U.monthlyAfter, asm);
      if (!th && g) {
        /* Enrich: infer take-home from gross with the one tax function. No state tax in v1, so the confidence is capped. */
        const grossAnnual = g.cents * 12;
        const pretaxAnnual = ((pr ? pr.cents : 0) + (hs ? hs.cents : 0) + (ot ? ot.cents : 0)) * 12;
        let fed, payroll;
        if (t === 'c1099' || t === 'side') {
          const exp = (monthlyCents(r, 'businessExpenses') || 0) * 12;
          const net = Math.max(0, grossAnnual - exp);
          const se = selfEmploymentTax(data.tax2026, net);
          fed = federalTax(data.tax2026, taxableIncome(data.tax2026, net - se.deductibleHalf, pretaxAnnual, filing), filing).tax;
          payroll = se.tax + exp;
        } else {
          fed = federalTax(data.tax2026, taxableIncome(data.tax2026, grossAnnual, pretaxAnnual, filing), filing).tax;
          payroll = fica(data.tax2026, grossAnnual - ((hs ? hs.cents : 0) + (ot ? ot.cents : 0)) * 12).total;
        }
        const takeAnnual = grossAnnual - fed - payroll - pretaxAnnual - (ro ? ro.cents : 0) * 12;
        const cents = Math.round(takeAnnual / 12);
        const conf = Math.min(g.confidence, 0.6);
        th = q(Math.max(0, cents), U.monthlyAfter, { confidence: conf, range: { low: Math.round(cents * 0.9), high: Math.round(cents * 1.02) }, rough: true });
        enriched.push({ rowId: r.id, field: 'takeHome', value: th, note: (t === 'w2' ? 'Inferred from gross: federal tax and FICA only, before state tax' : 'Inferred from gross: self-employment tax and federal tax on this income alone, before state tax'), source: 'inferred' });
      }
      if (th && partnerRow) partnerTake = add(partnerTake, th);
      if (th) { take = add(take, th); anyTake = true; }
      const hp = num(r, 'hoursPaid') || 0, hc = num(r, 'hoursCommute') || 0;
      hours += (hp + hc) * 52 / 12;
      if (t === 'side') byType.sideHours = (byType.sideHours || 0) + Math.round((hp + hc) * 52 / 12); /* the side hustle lens (MR-043) */
      const wc = fieldQ(r, 'workCosts', U.monthlyAfter, asm);
      if (wc) workCosts = add(workCosts, wc);
      const st = val(r, 'stability'); if (st) stabilities.push(st);
    }
    if (t === 'unemployment') {
      const b = fieldQ(r, 'benefitAmount', U.monthlyPre, asm);
      if (b) { gross = add(gross, b); take = add(take, asTax(b, 'aftertax')); byType.unemployment += b.cents; anyGross = true; anyTake = true; }
      stabilities.push('at-risk');
      /* weeks left are worked out, never typed twice: total weeks less the weeks since the start month (MR-027) */
      const total = num(r, 'weeksLeft'); const start = val(r, 'startDate');
      if (total !== null && start && ctx.today) {
        const t0 = new Date(start + '-01T00:00:00Z'), t1 = new Date(ctx.today + 'T00:00:00Z');
        const elapsed = Math.max(0, Math.floor((t1 - t0) / (7 * 24 * 3600 * 1000)));
        const left = Math.max(0, total - elapsed);
        const end = new Date(t0.getTime() + total * 7 * 24 * 3600 * 1000);
        enriched.push({ rowId: r.id, field: 'weeksLeft', value: left, endsOn: end.toISOString().slice(0, 7), note: 'Weeks of benefit less the weeks since ' + start, source: 'computed' });
      }
    }
    if (t === 'rental') {
      const rent = fieldQ(r, 'rentCollected', U.monthlyPre, asm);
      const exp = fieldQ(r, 'rentalExpenses', U.monthlyPre, asm);
      if (rent) {
        gross = add(gross, rent); byType.rental += rent.cents; anyGross = true;
        const net = exp ? Math.max(0, rent.cents - exp.cents) : rent.cents;
        take = add(take, q(net, U.monthlyAfter, { confidence: rent.confidence, rough: rent.rough })); anyTake = true;
      }
      const st = val(r, 'stability'); if (st) stabilities.push(st);
    }
    if (t === 'benefits') {
      const ob = fieldQ(r, 'otherBenefit', U.monthlyPre, asm);
      if (ob) { byType.benefits += ob.cents; }
    }
    if (t === 'other') {
      const o = fieldQ(r, 'otherIncome', U.monthlyPre, asm);
      if (o) { gross = add(gross, o); take = add(take, asTax(o, 'aftertax')); byType.other += o.cents; anyGross = true; anyTake = true; }
    }
  });

  /* Match: the benefits row's formula against the W-2 deferral share. */
  let matchMonthly = q(0, U.monthlyPre), matchFormula = null, matchMax = 0;
  const ben = rows.find(r => r.type === 'benefits');
  if (ben) {
    const rate = num(ben, 'matchRate'), upTo = num(ben, 'matchUpTo');
    if (rate !== null && upTo !== null) {
      matchFormula = { rate, upTo };
      if (w2Primary) {
        const gp = num(w2Primary, 'grossPay'), pr = num(w2Primary, 'pretaxRetirement') || 0;
        const base = monthlyCents(w2Primary, 'grossPay');
        if (gp && base) {
          const share = pr / gp;
          const actual = Math.round(base * rate * Math.min(share, upTo));
          matchMax = Math.round(base * rate * upTo);
          const conf = Math.min(confidenceOf(ben.f.matchRate), confidenceOf(ben.f.matchUpTo), confidenceOf(w2Primary.f.grossPay));
          matchMonthly = q(actual, U.monthlyPre, { confidence: conf });
          enriched.push({ rowId: ben.id, field: 'matchMonthly', value: matchMonthly, note: 'Match at the current deferral; the most available is ' + matchMax + ' cents a month', source: 'computed' });
        }
      }
    }
  }

  const stability = !stabilities.length ? (rows.length ? 'needs' : 'needs') : stabilities.includes('at-risk') ? 'at-risk' : stabilities.includes('variable') ? 'variable' : 'steady';
  out.grossMonthly = anyGross ? gross : needs(['gross pay']);
  out.takeHomeMonthly = anyTake ? take : needs(['take-home pay']);
  out.pretaxContribMonthly = pretax;
  out.rothContribMonthly = roth;
  out.hsaPayrollMonthly = hsa;
  out.pretaxOtherMonthly = other;
  out.matchMonthly = matchMonthly;
  out.matchFormula = matchFormula ? Object.assign({ maxMonthly: matchMax }, matchFormula) : null;
  out.byType = byType;
  out.stability = stability;
  out.workHoursMonthly = Math.round(hours * 10) / 10;
  out.workCostsMonthly = workCosts;
  out.partnerTakeHomeMonthly = partnerTake;
  return { outputs: out, enriched };
}
