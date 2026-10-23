/* One tax function for everyone: federal brackets and FICA only (v1).
   Income uses it to infer take-home; Taxes uses it to publish. Cents in,
   cents out; rates as fractions. */

export function standardDeduction(table, status) {
  const d = table.standardDeduction[status];
  if (d === undefined) throw new Error('unknown filing status ' + status);
  return d;
}

/* The federal brackets the taxable income reaches (MR-097): one line per bracket, { rate, from, to, base, tax }. */
export function federalBrackets(table, taxableCents, status) {
  const brackets = table.brackets[status];
  if (!brackets) throw new Error('unknown filing status ' + status);
  const lines = []; let lower = 0;
  for (const [rate, upper] of brackets) {
    if (taxableCents <= lower) break;
    const top = upper === null ? taxableCents : Math.min(taxableCents, upper);
    lines.push({ rate, from: lower, to: upper, base: top - lower, tax: Math.round((top - lower) * rate) });
    lower = upper;
    if (upper === null || taxableCents <= upper) break;
  }
  return lines;
}
/* Federal income tax on taxable income (cents). Returns { tax, marginal }. The bracket lines are the formula. */
export function federalTax(table, taxableCents, status) {
  const lines = federalBrackets(table, taxableCents, status);
  return { tax: lines.reduce((s, l) => s + l.tax, 0), marginal: lines.length ? lines[lines.length - 1].rate : 0 };
}

/* Taxable income from gross and pre-tax deductions, floored at zero. */
export function taxableIncome(table, grossAnnual, pretaxAnnual, status) {
  return Math.max(0, grossAnnual - pretaxAnnual - standardDeduction(table, status));
}

/* Employee FICA on wages (cents): Social Security up to the wage base, Medicare on all. */
export function fica(table, wagesAnnual) {
  const f = table.fica;
  const ss = Math.round(Math.min(wagesAnnual, f.socialSecurityWageBase) * f.socialSecurityRate);
  const med = Math.round(wagesAnnual * f.medicareRate);
  return { socialSecurity: ss, medicare: med, total: ss + med };
}

/* Self-employment tax: both halves on 92.35% of net earnings. Returns { tax, deductibleHalf }. */
export function selfEmploymentTax(table, netEarningsAnnual) {
  const f = table.fica;
  const base = Math.round(Math.max(0, netEarningsAnnual) * f.selfEmploymentNetFactor);
  const ss = Math.round(Math.min(base, f.socialSecurityWageBase) * f.socialSecurityRate * 2);
  const med = Math.round(base * f.medicareRate * 2);
  return { tax: ss + med, deductibleHalf: Math.round((ss + med) * f.selfEmploymentDeductionShare) };
}

/* ---- MR-094: state, local, credits, itemizing and the levers; cents in, cents out ---- */

/* State income tax as a flat stand-in on taxable income. { tax, rate }; rate 0 where the state has none; null rate when the state is unknown. */
export function stateTax(table, taxableCents, stateCode) {
  const rates = table.stateIncomeTax ? table.stateIncomeTax.rates : {};
  const rate = stateCode && rates[stateCode] !== undefined ? rates[stateCode] : null;
  return { tax: rate === null ? 0 : Math.round(Math.max(0, taxableCents) * rate), rate };
}
/* City wage tax where one exists; most cities have none. */
export function localTax(table, wagesCents, city) {
  const cities = table.localIncomeTax ? table.localIncomeTax.cities : {};
  const key = city ? Object.keys(cities).find(k => k.toLowerCase() === String(city).trim().toLowerCase()) : null;
  const rate = key ? cities[key] : 0;
  return { tax: Math.round(Math.max(0, wagesCents) * rate), rate, city: key || null };
}
/* The child tax credit: per child, phased out above the start; the refundable part is the smaller of the credit and the refundable cap per child. */
export function childTaxCredit(table, status, children, agiCents) {
  const c = table.credits && table.credits.childTaxCredit; const n = Math.max(0, children || 0);
  if (!c || !n) return { total: 0, refundable: 0 };
  const start = c.phaseOutStart[status] || c.phaseOutStart.single;
  const over = Math.max(0, agiCents - start); const cut = Math.ceil(over / 100000) * c.phaseOutPer1000;
  const total = Math.max(0, n * c.perChild - cut);
  return { total, refundable: Math.min(total, n * c.refundableMax) };
}
/* The EITC: phases in on earned income, holds, phases out on the larger of earned income and AGI. Always refundable. */
export function eitc(table, status, children, earnedCents, agiCents) {
  const e = table.credits && table.credits.eitc; if (!e) return 0;
  const p = e.byChildren[String(Math.min(3, Math.max(0, children || 0)))];
  const st = status === 'mfj' ? 'mfj' : (status === 'hoh' ? 'hoh' : 'single');
  const earned = Math.max(0, earnedCents); if (!earned) return 0;
  const rateIn = p.max / p.phaseInEnd; const credit = Math.min(p.max, Math.round(earned * rateIn));
  const outStart = p.phaseOutStart[st], outEnd = p.phaseOutEnd[st]; const test = Math.max(earned, agiCents);
  if (test <= outStart) return credit;
  if (test >= outEnd) return 0;
  return Math.max(0, Math.round(credit - (test - outStart) * (p.max / (outEnd - outStart))));
}
/* A typed credit kind on what was paid. */
export function creditFor(table, kind, paidCents, children) {
  const r = table.credits && table.credits.rules && table.credits.rules[kind]; const paid = Math.max(0, paidCents || 0);
  if (!r) return 0;
  if (kind === 'childcare') return Math.round(Math.min(paid, r.capPerChild * Math.min(r.maxChildren, Math.max(1, children || 1))) * r.share);
  if (kind === 'education') return Math.round(Math.min(paid, r.firstCap) * r.firstAt + Math.min(Math.max(0, paid - r.firstCap), r.nextCap) * r.nextAt);
  if (kind === 'energy') return Math.min(r.cap, Math.round(paid * r.share));
  return Math.round(paid * (r.share || 1));
}
/* Student loan interest: deductible up to the cap, phased out by AGI. */
export function studentLoanDeduction(table, interestCents, agiCents, status) {
  const d = table.deductions; if (!d || !(interestCents > 0)) return 0;
  const [lo, hi] = d.studentLoanPhaseOut[status] || d.studentLoanPhaseOut.single;
  const base = Math.min(interestCents, d.studentLoanInterestCap);
  if (agiCents <= lo) return base; if (agiCents >= hi) return 0;
  return Math.round(base * (1 - (agiCents - lo) / (hi - lo)));
}
/* Itemizing: charity, medical above the floor, mortgage interest, and state and local taxes under the cap. Returns the parts and the total. */
export function itemized(table, parts, agiCents) {
  const d = table.deductions || { saltCap: 1000000, medicalFloorShare: 0.075 };
  const charity = Math.max(0, parts.charity || 0); const mortgage = Math.max(0, parts.mortgageInterest || 0);
  const medical = Math.max(0, (parts.medical || 0) - Math.round(agiCents * d.medicalFloorShare));
  const salt = Math.min(d.saltCap, Math.max(0, (parts.stateIncomeTax || 0) + (parts.propertyTax || 0) + (parts.stateTaxPaid || 0)));
  const other = Math.max(0, parts.other || 0);
  return { charity, medical, mortgageInterest: mortgage, salt, other, total: charity + medical + mortgage + salt + other };
}
/* The saver's credit (MR-097): a share of retirement contributions, capped per person, by AGI tier; nothing above the last tier. { credit, share } */
export function saversCredit(table, status, agiCents, contribCents) {
  const c = table.credits && table.credits.saversCredit; if (!c) return { credit: 0, share: 0 };
  const tiers = c.tiers[status] || c.tiers.single; const people = status === 'mfj' ? 2 : 1;
  const tier = tiers.find(([ceiling]) => agiCents <= ceiling); const share = tier ? tier[1] : 0;
  const base = Math.min(Math.max(0, contribCents || 0), c.capPerPerson * people);
  return { credit: Math.round(base * share), share };
}
