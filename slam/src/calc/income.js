// Monthly income per source: take-home (typed, or guessed from gross), gross,
// pre-tax retirement, hours worked, and the household's hourly take-home.

import { toMonthly, hasAnswer } from './normalize.js';
import { estimateAnnualTax } from './tax.js';
import { sumKnown, ratio } from './money.js';

const HOURS_PER_MONTH_PER_WEEKLY_HOUR = 52 / 12;

export function incomeSummary(doc, tax) {
  const filing = doc.household.filingStatus;
  let stdLeft = tax.standardDeduction[filing] || tax.standardDeduction.single;
  const sources = [];

  for (const inc of doc.income) {
    if (inc.state === 'archived') continue;
    const freq = inc.payFrequency;
    const grossMonthly = toMonthly(inc.gross, freq);
    // Optional field: blank means no pre-tax contribution was recorded.
    const pretaxMonthly = hasAnswer(inc.pretaxRetirement) ? toMonthly(inc.pretaxRetirement, freq) : 0;
    const row = {
      id: inc.id, label: inc.label, type: inc.type, state: inc.state,
      grossMonthly, pretaxMonthly,
      takeHomeMonthly: null, takeHomeStatus: inc.takeHome.status, takeHomeNote: '',
      taxMonthly: null,
      hoursMonthly: inc.hoursPerWeek ? inc.hoursPerWeek * HOURS_PER_MONTH_PER_WEEKLY_HOUR : null
    };

    if (hasAnswer(inc.takeHome)) {
      row.takeHomeMonthly = toMonthly(inc.takeHome, freq);
      // A source with known take-home is assumed to use the standard deduction first.
      const used = grossMonthly === null ? stdLeft : Math.min(stdLeft, Math.max(0, (grossMonthly - pretaxMonthly) * 12));
      stdLeft -= used;
      if (grossMonthly !== null) row.taxMonthly = grossMonthly - pretaxMonthly - row.takeHomeMonthly;
    } else if (grossMonthly !== null) {
      const est = estimateAnnualTax({
        gross: grossMonthly * 12, pretax: pretaxMonthly * 12, type: inc.type,
        filingStatus: filing, stdDeduction: stdLeft
      }, tax);
      stdLeft -= est.stdUsed;
      row.takeHomeMonthly = est.takeHome / 12;
      row.taxMonthly = est.totalTax / 12;
      row.takeHomeStatus = 'guess';
      row.takeHomeNote = 'State tax not included' + (est.withheld ? '' : '. Nothing is withheld, so set this aside');
      row.estimate = { incomeTax: est.incomeTax / 12, fica: est.fica / 12, seTax: est.seTax / 12, taxYear: tax.taxYear };
    }
    sources.push(row);
  }

  const take = sumKnown(sources.map((s) => s.takeHomeMonthly));
  const withHours = sources.filter((s) => s.hoursMonthly && s.takeHomeMonthly !== null);
  const hoursTakeHome = sumKnown(withHours.map((s) => s.takeHomeMonthly)).total;
  const hours = sumKnown(withHours.map((s) => s.hoursMonthly)).total;
  const pretax = sources.reduce((a, s) => a + s.pretaxMonthly, 0);

  return {
    sources,
    takeHome: take.total,
    takeHomeMissing: take.missing,
    takeHomeIsGuess: sources.some((s) => s.takeHomeStatus === 'guess'),
    gross: sources.length && sources.every((s) => s.grossMonthly !== null) ? sumKnown(sources.map((s) => s.grossMonthly)).total : null,
    pretax,
    hoursMonthly: hours,
    hourlyTakeHome: ratio(hoursTakeHome, hours),
    taxYear: tax.taxYear
  };
}
