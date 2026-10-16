// Monthly income per source: take-home (typed, or guessed from gross), gross,
// pre-tax retirement, hours worked, and the household's hourly take-home.

import { toMonthly, hasAnswer, PAYCHECKS_PER_YEAR } from './normalize.js';
import { estimateAnnualTax } from './tax.js';
import { sumKnown, ratio } from './money.js';
import { deductionRows, deductionTotals } from './deductions.js';

const HOURS_PER_MONTH_PER_WEEKLY_HOUR = 52 / 12;

// Hourly pay: gross = rate x hours a week x 52 weeks. Needs both numbers.
export function hourlyGross(inc) {
  if (inc.payBasis !== 'hourly' || !inc.hourlyRate || inc.hourlyRate.amount === null || inc.hourlyRate.status === 'not-for-me') return null;
  if (!inc.hoursPerWeek) return null;
  const annual = inc.hourlyRate.amount * inc.hoursPerWeek * 52;
  return { rate: inc.hourlyRate.amount, annual, monthly: annual / 12 };
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
    takeHomeAnnual: perYear(row.takeHomeMonthly),
    takeHomePerPaycheck: perCheck(row.takeHomeMonthly),
    takeHomePerHour: ratio(row.takeHomeMonthly, row.hoursMonthly)
  };
}

export function incomeSummary(doc, tax) {
  const filing = doc.household.filingStatus;
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
      hoursMonthly: inc.hoursPerWeek ? inc.hoursPerWeek * HOURS_PER_MONTH_PER_WEEKLY_HOUR : null
    };

    if (hasAnswer(inc.takeHome)) {
      row.takeHomeMonthly = toMonthly(inc.takeHome, freq);
      // A source with known take-home is assumed to use the standard deduction first.
      const used = grossMonthly === null ? stdLeft : Math.min(stdLeft, Math.max(0, (grossMonthly - dt.incomeTaxFree) * 12));
      stdLeft -= used;
      if (grossMonthly !== null) row.taxMonthly = grossMonthly - dt.all - row.takeHomeMonthly;
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
      row.estimate = { incomeTax: est.incomeTax / 12, fica: est.fica / 12, seTax: est.seTax / 12, taxYear: tax.taxYear };
    }
    Object.assign(row, payBreakdown(row, freq));
    sources.push(row);
  }

  const take = sumKnown(sources.map((s) => s.takeHomeMonthly));
  const withHours = sources.filter((s) => s.hoursMonthly && s.takeHomeMonthly !== null);
  const hoursTakeHome = sumKnown(withHours.map((s) => s.takeHomeMonthly)).total;
  const hours = sumKnown(withHours.map((s) => s.hoursMonthly)).total;
  const retirementDeductions = sources.reduce((a, s) => a + s.retirementMonthly, 0);
  const deductionsAll = sources.reduce((a, s) => a + s.deductionsMonthly, 0);

  return {
    sources,
    takeHome: take.total,
    takeHomeMissing: take.missing,
    takeHomeIsGuess: sources.some((s) => s.takeHomeStatus === 'guess'),
    gross: sources.length && sources.every((s) => s.grossMonthly !== null) ? sumKnown(sources.map((s) => s.grossMonthly)).total : null,
    retirementDeductions,
    // Monthly paycheck deductions by kind (health, transportation, ...), for "already taken out" notes.
    deductionsByKind: sources.flatMap((s) => s.deductions).reduce((acc, d) => {
      if (d.monthly !== null) acc[d.kind] = (acc[d.kind] || 0) + d.monthly;
      return acc;
    }, {}),
    deductions: deductionsAll,
    hoursMonthly: hours,
    hourlyTakeHome: ratio(hoursTakeHome, hours),
    taxYear: tax.taxYear
  };
}
