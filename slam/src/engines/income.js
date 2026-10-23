// Monthly income per source: take-home (typed, or guessed from gross), gross,
// pre-tax retirement, hours worked, and the household's hourly take-home.
// Depends on normalize.js (toMonthly, hasAnswer, paychecks a year), tax.js (the federal estimate),
// deductions.js (paycheck deductions), money.js (sumKnown, ratio) and the withheld-line keys in store/schema.js.
// Dollars a month unless a field says Annual or PerPaycheck; estimateAnnualTax and the tax walk are dollars a year.

import { toMonthly, hasAnswer, PAYCHECKS_PER_YEAR } from './normalize.js';
import { estimateAnnualTax } from './tax.js';
import { WITHHELD_KEYS } from '../store/schema.js';
import { sumKnown, ratio } from './money.js';
import { deductionRows, deductionTotals } from './deductions.js';

const HOURS_PER_MONTH_PER_WEEKLY_HOUR = 52 / 12;

/**
 * Hourly pay: gross = rate x hours a week x 52 weeks. Needs both numbers.
 * @param {object} inc an income source.
 * @returns {?{rate: number, annual: number, monthly: number}} rate in dollars an hour, gross in dollars a year and a month;
 *   null for salaried pay, no rate (or "doesn't apply"), or no hours.
 */
export function hourlyGross(inc) {
  if (inc.payBasis !== 'hourly' || !inc.hourlyRate || inc.hourlyRate.amount === null || inc.hourlyRate.status === 'not-for-me') return null;
  if (!inc.hoursPerWeek) return null;
  const annual = inc.hourlyRate.amount * inc.hoursPerWeek * 52;
  return { rate: inc.hourlyRate.amount, annual, monthly: annual / 12 };
}

// Taxes withheld, from the paystub: monthly per line, the federal part
// (income tax, Social Security, Medicare), and the rest (state, local, other).
// Take-home is only worked out from these once the three federal lines are answered.
const FEDERAL_KEYS = ['federal', 'socialSecurity', 'medicare'];

/**
 * Taxes withheld, from the paystub lines, a month at a time.
 * @param {object} inc an income source; inc.withheld holds one Value per line, entered a paycheck at a time.
 * @returns {{lines: Object<string, number|null>, any: boolean, federalDone: boolean, federal: number|null, stateLocal: number|null, total: number|null}}
 *   dollars a month per line (null = not entered); federalDone when income tax, Social Security and Medicare are all answered.
 */
export function withheldFromStub(inc) {
  const w = inc.withheld || {};
  const m = (k) => toMonthly(w[k], inc.payFrequency);
  const lines = Object.fromEntries(WITHHELD_KEYS.map((k) => [k, m(k)]));
  const any = Object.values(lines).some((x) => x !== null);
  const federalDone = ['federal', 'socialSecurity', 'medicare'].every((k) => hasAnswer(w[k]));
  return {
    lines, any, federalDone,
    federal: sumKnown([lines.federal, lines.socialSecurity, lines.medicare]).total,
    stateLocal: sumKnown(WITHHELD_KEYS.filter((k) => !FEDERAL_KEYS.includes(k)).map((k) => lines[k])).total,
    total: sumKnown(Object.values(lines)).total
  };
}

/**
 * The federal estimate step by step (S-101), all for a year: gross, less pre-tax deductions (and half the
 * self-employment tax) = adjusted gross; less the standard deduction = taxable; taxable cut into brackets;
 * Social Security and Medicare on wages.
 * @param {object} est what estimateAnnualTax returns (tax.js), dollars a year.
 * @param {number} grossAnnual dollars a year.
 * @param {number} pretaxAnnual deductions that lower income tax, dollars a year.
 * @param {object} tax tax-constants.json for the year.
 * @returns {object} each step in dollars a year; rates are ratios (0.062); effectiveRate = income tax / gross.
 */
export function taxWalk(est, grossAnnual, pretaxAnnual, tax) {
  return {
    gross: grossAnnual, pretax: pretaxAnnual, seHalf: est.seTax / 2, agi: est.agi, std: est.stdUsed, taxable: est.taxable,
    slices: est.slices, incomeTax: est.incomeTax, bracket: est.bracket, effectiveRate: ratio(est.incomeTax, grossAnnual),
    ficaBase: est.ficaBase, ssBase: Math.min(est.ficaBase, tax.fica.socialSecurityWageBase), wageBase: tax.fica.socialSecurityWageBase, ssRate: tax.fica.socialSecurityRate, socialSecurity: est.socialSecurity,
    medicareRate: tax.fica.medicareRate, medicare: est.medicare, seTax: est.seTax, taxYear: tax.taxYear
  };
}

/**
 * Additional withholding the client asked for on the W-4 (step 4c); W-2 pay only (S-101).
 * @param {object} inc an income source.
 * @returns {number|null} dollars a month; null for other pay types or when not entered.
 */
export function extraWithholding(inc) {
  return inc.type === 'w2' ? toMonthly(inc.extraWithholding, inc.payFrequency) : null;
}

// The taxes on a paycheck, one line per tax (S-099). Copied paystub lines are used as they are.
// Otherwise the federal estimate: income tax (with the bracket the last dollar falls in), Social
// Security, and Medicare (self-employment tax for 1099 pay). With an actual paycheck typed, what is
// left of the withheld amount is shown as "State and other taxes" (state tax is not estimated); with
// no actual paycheck, state tax is listed as not estimated. Monthly amounts; null = not known.
const TAX_LABELS = {
  federal: 'Federal income tax', socialSecurity: 'Social Security', medicare: 'Medicare', state: 'State income tax',
  local: 'Local or city tax', sdi: 'State disability (SDI)', pfl: 'Paid family or medical leave', sui: 'State unemployment', other: 'Other tax'
};
/**
 * The taxes on a paycheck, one line per tax (S-099); the rules are in the note above TAX_LABELS.
 * @param {object} inc an income source.
 * @param {object} row the source's row in incomeSummary, with taxCheck or estimate filled in.
 * @returns {?Array<{key: string, label: string, monthly: number|null, from: string}>} dollars a month; from is 'paystub',
 *   'estimate', 'W-4', 'the rest' or 'not estimated'; null when there is nothing to work from.
 */
export function taxBreakdown(inc, row) {
  const stub = withheldFromStub(inc);
  if (stub.federalDone) {
    return WITHHELD_KEYS.filter((k) => stub.lines[k] !== null).map((k) => ({ key: k, label: TAX_LABELS[k], monthly: stub.lines[k], from: 'paystub' }));
  }
  const tc = row.taxCheck;
  // The tax check's numbers are annual; these lines are monthly.
  const est = tc ? { incomeTax: tc.estIncomeTaxAnnual / 12, socialSecurity: tc.estSocialSecurityAnnual / 12, medicare: tc.estMedicareAnnual / 12, seTax: 0, bracket: tc.bracket, walk: tc.walk } : row.estimate;
  if (!est) return null;
  const lines = [
    { key: 'federal', label: TAX_LABELS.federal, monthly: est.incomeTax, from: 'estimate', bracket: est.bracket, walk: est.walk },
    est.socialSecurity ? { key: 'socialSecurity', label: TAX_LABELS.socialSecurity, monthly: est.socialSecurity, from: 'estimate' } : null,
    est.medicare ? { key: 'medicare', label: TAX_LABELS.medicare, monthly: est.medicare, from: 'estimate' } : null,
    est.seTax ? { key: 'seTax', label: 'Self-employment tax (Social Security and Medicare)', monthly: est.seTax, from: 'estimate' } : null,
    extraWithholding(inc) ? { key: 'extra', label: 'Additional withholding', monthly: extraWithholding(inc), from: 'W-4' } : null
  ].filter(Boolean);
  if (row.withheldMonthly === null) return [...lines, { key: 'state', label: TAX_LABELS.state, monthly: null, from: 'not estimated' }];
  const rest = row.withheldMonthly - sumKnown(lines.map((l) => l.monthly)).total;
  // Under half a cent is rounding, not a tax.
  if (Math.abs(rest) < 0.005) return lines;
  return [...lines, rest > 0
    ? { key: 'rest', label: 'State and other taxes', monthly: rest, from: 'the rest' }
    : { key: 'short', label: 'Not taken out', monthly: rest, from: 'the rest' }];
}

// The same pay in every unit: per paycheck, month, year, and hour.
function payBreakdown(row, freq) {
  const perYear = (m) => (m === null ? null : m * 12);
  const n = PAYCHECKS_PER_YEAR[freq] || null;
  const perCheck = (m) => (m === null || !n ? null : (m * 12) / n);
  return {
    grossAnnual: perYear(row.grossMonthly),
    grossPerPaycheck: perCheck(row.grossMonthly),
    grossPerHour: row.hourlyRate !== null ? row.hourlyRate : ratio(row.grossMonthly, row.hoursMonthly),
    deductionsAnnual: perYear(row.deductionsMonthly),
    deductionsPerPaycheck: perCheck(row.deductionsMonthly),
    preTaxPerPaycheck: perCheck(row.preTaxMonthly), preTaxAnnual: perYear(row.preTaxMonthly),
    postTaxPerPaycheck: perCheck(row.postTaxMonthly), postTaxAnnual: perYear(row.postTaxMonthly),
    withheldPerPaycheck: perCheck(row.withheldMonthly), withheldAnnual: perYear(row.withheldMonthly),
    taxPerPaycheck: perCheck(row.taxMonthly), taxAnnual: perYear(row.taxMonthly),
    estimatedTakeHomePerPaycheck: perCheck(row.estimatedTakeHomeMonthly === undefined ? null : row.estimatedTakeHomeMonthly),
    estimatedTaxPerPaycheck: perCheck(row.estimatedTaxMonthly === undefined ? null : row.estimatedTaxMonthly),
    paycheckGapPerPaycheck: perCheck(row.paycheckGapMonthly === undefined ? null : row.paycheckGapMonthly),
    takeHomeAnnual: perYear(row.takeHomeMonthly),
    takeHomePerPaycheck: perCheck(row.takeHomeMonthly),
    takeHomePerHour: ratio(row.takeHomeMonthly, row.hoursMonthly),
    taxLines: row.taxLines ? row.taxLines.map((l) => ({ ...l, perPaycheck: perCheck(l.monthly), annual: perYear(l.monthly) })) : null
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Roughly when unemployment benefits run out, counted from the middle of the month being worked on.
 * @param {string} monthKey 'YYYY-MM'.
 * @param {number|null} weeksLeft weeks of benefit left.
 * @returns {?string} 'Month YYYY'; null without a month or a count.
 */
export function benefitsEndAround(monthKey, weeksLeft) {
  if (!monthKey || weeksLeft === null || weeksLeft === undefined) return null;
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15 + weeksLeft * 7));
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

// Unemployment: one number (the benefit). What lands is the benefit, less 10%
// if the client chose federal withholding. The tax is shown as a set-aside.
function unemploymentRow(doc, inc, row, tax, stdLeft) {
  const freq = inc.payFrequency;
  // The benefit may have been typed in either box; gross wins when both are.
  const benefit = hasAnswer(inc.gross) ? inc.gross : inc.takeHome;
  const benefitMonthly = toMonthly(benefit, freq);
  row.grossMonthly = benefitMonthly;
  row.grossFrom = benefitMonthly === null ? null : 'typed';
  row.takeHomeStatus = benefit.status;
  if (benefitMonthly === null) return { stdUsed: 0 };
  // The federal option on unemployment is a flat 10% withholding.
  const withheldMonthly = inc.withholding === 'ten-percent' ? benefitMonthly * 0.1 : 0;
  row.takeHomeMonthly = benefitMonthly - withheldMonthly;
  // The benefit uses whatever standard deduction the sources before it left.
  const est = estimateAnnualTax({ gross: benefitMonthly * 12, type: 'unemployment', filingStatus: doc.household.filingStatus, stdDeduction: stdLeft }, tax);
  // Owed beyond what was withheld, never negative; a likely refund is its own field below.
  const owed = Math.max(0, est.incomeTax - withheldMonthly * 12);
  row.taxMonthly = est.incomeTax / 12;
  const weeksLeft = inc.benefitWeeksLeft === null || inc.benefitWeeksLeft === undefined ? null : inc.benefitWeeksLeft;
  const benefitWeekly = (benefitMonthly * 12) / 52;
  row.unemployment = {
    // What lands each week after the optional 10% federal withholding.
    benefitMonthly, benefitWeekly, takeHomeWeekly: inc.withholding === 'ten-percent' ? benefitWeekly * 0.9 : benefitWeekly, withheldMonthly, takeHomeMonthly: row.takeHomeMonthly,
    estTaxAnnual: est.incomeTax, owedAtTaxTime: owed, setAsideWeekly: owed / 52, refundLikely: Math.max(0, withheldMonthly * 12 - est.incomeTax),
    withholding: inc.withholding || null, weeksLeft,
    stillToCome: weeksLeft === null ? null : ((benefitMonthly * 12) / 52) * weeksLeft,
    endsAround: benefitsEndAround(doc.currentMonth, weeksLeft), taxYear: tax.taxYear
  };
  return { stdUsed: est.stdUsed };
}

/**
 * Withheld (paystub, or gross minus deductions minus take-home) against the estimate of what the year's
 * federal income tax and FICA will really be. State tax is not estimated, so it is kept out when known.
 * @param {object} inc an income source; row its row in incomeSummary (withheldMonthly and withheldFrom are set here).
 * @param {object} dt deductionTotals (deductions.js), dollars a month; grossMonthly dollars a month.
 * @param {object} tax tax-constants.json; filing the filing status; stdLeft the standard deduction still unused, dollars a year.
 * @returns {object} fields ending Annual are dollars a year, Monthly dollars a month; estRate and withheldRate are ratios of
 *   gross; gapAnnual positive = refund likely, negative = owed; includesState when withheld came from take-home.
 */
export function taxCheck(inc, row, dt, grossMonthly, tax, filing, stdLeft) {
  const est = estimateAnnualTax({
    gross: grossMonthly * 12, deductions: dt.all * 12, incomeTaxFree: dt.incomeTaxFree * 12, ficaFree: dt.ficaFree * 12, type: inc.type,
    filingStatus: filing, stdDeduction: stdLeft
  }, tax);
  const stub = withheldFromStub(inc);
  const fromStub = stub.federalDone;
  // Without paystub lines, everything between gross, deductions and take-home is treated as tax, state included.
  const withheldMonthly = fromStub ? stub.total : (row.takeHomeMonthly === null ? null : grossMonthly - dt.all - row.takeHomeMonthly);
  // The federal estimate is compared with the paystub's federal lines when known, else with the whole withheld amount.
  const federalMonthly = fromStub ? stub.federal : withheldMonthly;
  row.withheldMonthly = withheldMonthly;
  row.withheldFrom = fromStub ? 'paystub' : 'take-home';
  const typedTake = hasAnswer(inc.takeHome) ? toMonthly(inc.takeHome, inc.payFrequency) : null;
  return {
    stdUsed: est.stdUsed,
    withheldFrom: row.withheldFrom,
    withheldMonthly, federalWithheldMonthly: federalMonthly,
    stateWithheldMonthly: fromStub ? stub.stateLocal : null,
    lines: stub.lines,
    estIncomeTaxAnnual: est.incomeTax, estFicaAnnual: est.fica, estTotalAnnual: est.totalTax,
    estSocialSecurityAnnual: est.socialSecurity, estMedicareAnnual: est.medicare, bracket: est.bracket,
    walk: taxWalk(est, grossMonthly * 12, dt.incomeTaxFree * 12, tax),
    estRate: ratio(est.totalTax, grossMonthly * 12),
    withheldRate: ratio(withheldMonthly, grossMonthly),
    // Positive: more withheld than the estimate (refund likely). Negative: likely owed at tax time.
    gapAnnual: federalMonthly === null ? null : federalMonthly * 12 - est.totalTax,
    includesState: !fromStub,
    // Typed take-home and paystub lines both given: what the lines leave vs the take-home typed.
    stubMismatchMonthly: fromStub && typedTake !== null ? typedTake - (grossMonthly - dt.all - stub.total) : null,
    taxYear: tax.taxYear
  };
}

/**
 * Monthly income per source and for the household.
 * @param {object} doc the household file.
 * @param {object} tax tax-constants.json for the year (standard deduction, brackets, FICA rates).
 * @returns {{sources: object[], takeHome: number|null, takeHomeMissing: number, takeHomeIsGuess: boolean, gross: number|null,
 *   retirementDeductions: number, deductionsByKind: object, fromPaycheckByLineType: object, deductions: number,
 *   hoursMonthly: number|null, hourlyTakeHome: number|null, taxYear: number}} dollars a month (hourlyTakeHome dollars an hour);
 *   each source row also carries Annual and PerPaycheck versions of its numbers; takeHomeMissing counts sources with none.
 */
export function incomeSummary(doc, tax) {
  const filing = doc.household.filingStatus;
  // One standard deduction for the household: each source, in order, uses what the earlier ones left.
  let stdLeft = tax.standardDeduction[filing] || tax.standardDeduction.single;
  const sources = [];

  for (const inc of doc.income) {
    if (inc.state === 'archived') continue;
    const freq = inc.payFrequency;
    const hourly = hourlyGross(inc);
    const grossMonthly = hourly ? hourly.monthly : toMonthly(inc.gross, freq);
    // Paycheck deductions (none listed means none taken out).
    const deductions = deductionRows(inc, grossMonthly);
    const dt = deductionTotals(deductions);
    const row = {
      id: inc.id, label: inc.label, type: inc.type, state: inc.state,
      grossMonthly, deductions, deductionsMonthly: dt.all, retirementMonthly: dt.retirement, deductionsMissing: dt.missing, grossFrom: hourly ? 'hourly' : (grossMonthly === null ? null : 'typed'),
      hourlyRate: hourly ? hourly.rate : null,
      takeHomeMonthly: null, takeHomeStatus: inc.takeHome.status, takeHomeNote: '',
      taxMonthly: null,
      // Paystub order: gross, pre-tax deductions, taxes, post-tax deductions, take-home.
      preTaxMonthly: deductions.length ? deductions.filter((x) => x.lowersIncomeTax && x.monthly !== null).reduce((a, x) => a + x.monthly, 0) : null,
      postTaxMonthly: deductions.length ? deductions.filter((x) => !x.lowersIncomeTax && x.monthly !== null).reduce((a, x) => a + x.monthly, 0) : null,
      withheldMonthly: null, withheldFrom: null,
      hoursMonthly: inc.hoursPerWeek ? inc.hoursPerWeek * HOURS_PER_MONTH_PER_WEEKLY_HOUR : null
    };

    if (inc.type === 'unemployment') {
      stdLeft -= unemploymentRow(doc, inc, row, tax, stdLeft).stdUsed;
    } else if (hasAnswer(inc.takeHome)) {
      row.takeHomeMonthly = toMonthly(inc.takeHome, freq);
      // A source with known take-home is assumed to use the standard deduction first.
      const used = grossMonthly === null ? stdLeft : Math.min(stdLeft, Math.max(0, (grossMonthly - dt.incomeTaxFree) * 12));
      if (inc.type === 'w2' && grossMonthly !== null) row.taxCheck = taxCheck(inc, row, dt, grossMonthly, tax, filing, stdLeft);
      stdLeft -= used;
      // With a typed take-home, tax is whatever is left of gross after deductions, state included.
      if (grossMonthly !== null) row.taxMonthly = grossMonthly - dt.all - row.takeHomeMonthly;
    } else if (inc.type === 'w2' && grossMonthly !== null && withheldFromStub(inc).federalDone) {
      // Copied from the paystub: take-home is what the lines leave.
      const stub = withheldFromStub(inc);
      row.takeHomeMonthly = grossMonthly - dt.all - stub.total;
      row.takeHomeStatus = 'computed';
      row.takeHomeNote = 'From the paystub lines';
      row.taxCheck = taxCheck(inc, row, dt, grossMonthly, tax, filing, stdLeft);
      stdLeft -= row.taxCheck.stdUsed;
      row.taxMonthly = stub.total;
    } else if (grossMonthly !== null) {
      const est = estimateAnnualTax({
        gross: grossMonthly * 12, deductions: dt.all * 12, incomeTaxFree: dt.incomeTaxFree * 12, ficaFree: dt.ficaFree * 12, type: inc.type,
        filingStatus: filing, stdDeduction: stdLeft
      }, tax);
      stdLeft -= est.stdUsed;
      row.takeHomeMonthly = est.takeHome / 12;
      row.taxMonthly = est.totalTax / 12;
      row.takeHomeStatus = 'guess';
      row.takeHomeNote = 'State tax not included' + (est.withheld ? '' : '. Nothing is withheld, so set this aside');
      row.estimate = { incomeTax: est.incomeTax / 12, fica: est.fica / 12, socialSecurity: est.socialSecurity / 12, medicare: est.medicare / 12, seTax: est.seTax / 12, bracket: est.bracket, taxYear: tax.taxYear,
        walk: taxWalk(est, grossMonthly * 12, dt.incomeTaxFree * 12, tax) };
      // Additional withholding is taken out of each paycheck too (it is a prepayment, not more tax).
      const extra = extraWithholding(inc);
      if (extra) { row.takeHomeMonthly -= extra; row.taxMonthly += extra; }
    }
    // Estimated paycheck (W-2): gross - deductions - taxes, from the paystub lines when the
    // three federal lines are there, else the federal tax and FICA estimate (state tax not included).
    // With an actual paycheck typed too, the gap shows what does not add up.
    if (inc.type === 'w2' && grossMonthly !== null) {
      const stub = withheldFromStub(inc);
      const extra = stub.federalDone ? 0 : extraWithholding(inc) || 0;
      const taxM = stub.federalDone ? stub.total : row.taxCheck ? row.taxCheck.estTotalAnnual / 12 + extra : row.takeHomeStatus === 'guess' ? row.taxMonthly : null;
      row.estimatedTakeHomeMonthly = taxM === null ? null : grossMonthly - dt.all - taxM;
      row.estimatedTaxMonthly = taxM;
      row.estimatedFrom = stub.federalDone ? 'paystub lines' : 'tax estimate';
      row.paycheckGapMonthly = hasAnswer(inc.takeHome) && row.estimatedTakeHomeMonthly !== null ? row.takeHomeMonthly - row.estimatedTakeHomeMonthly : null;
    }
    row.taxLines = taxBreakdown(inc, row);
    Object.assign(row, payBreakdown(row, freq));
    if (row.taxCheck) {
      // Per paycheck, the way the paystub shows it (twelve a year when pay is monthly or the schedule is unknown).
      const n = row.grossPerPaycheck ? row.grossAnnual / row.grossPerPaycheck : 12;
      row.taxCheck.estTotalPerPaycheck = row.taxCheck.estTotalAnnual / n;
      row.taxCheck.gapPerPaycheck = row.taxCheck.gapAnnual === null ? null : row.taxCheck.gapAnnual / n;
    }
    sources.push(row);
  }

  const take = sumKnown(sources.map((s) => s.takeHomeMonthly));
  const withHours = sources.filter((s) => s.hoursMonthly && s.takeHomeMonthly !== null);
  const hoursTakeHome = sumKnown(withHours.map((s) => s.takeHomeMonthly)).total;
  const hours = sumKnown(withHours.map((s) => s.hoursMonthly)).total;
  const retirementDeductions = sources.reduce((a, s) => a + s.retirementMonthly, 0);
  const deductionsAll = sources.reduce((a, s) => a + s.deductionsMonthly, 0);

  // Monthly paycheck deductions by kind (health, transportation, ...), for "already taken out" notes.
  const deductionsByKind = sources.flatMap((s) => s.deductions).reduce((acc, d) => {
    if (d.monthly !== null) acc[d.kind] = (acc[d.kind] || 0) + d.monthly;
    return acc;
  }, {});
  return {
    sources,
    takeHome: take.total,
    takeHomeMissing: take.missing,
    takeHomeIsGuess: sources.some((s) => s.takeHomeStatus === 'guess'),
    // Household gross only when every source has one; a partial gross would understate it.
    gross: sources.length && sources.every((s) => s.grossMonthly !== null) ? sumKnown(sources.map((s) => s.grossMonthly)).total : null,
    retirementDeductions,
    deductionsByKind,
    // What the paycheck already covers for a budget line type (Plan's "Already taken out" note).
    fromPaycheckByLineType: { health: (deductionsByKind.health || 0) + (deductionsByKind.hsa || 0), transport: deductionsByKind.transportation },
    deductions: deductionsAll,
    hoursMonthly: hours,
    hourlyTakeHome: ratio(hoursTakeHome, hours),
    taxYear: tax.taxYear
  };
}
