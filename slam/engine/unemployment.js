// Unemployment (owner's ask, 2026-10-26): when the situation now is between jobs, one place that says what the benefit
// pays and for how long, the tax on it, and what the cash does once it stops. Read from the household and the month's
// summary (cashflow, the income cliff, the cushion); nothing here is stored. Blank is missing, never $0.

import { valueOf as v, toDay, round2 } from './spine.js';
import { answersOf } from './profile.js';
import { cashflow } from './cashflow.js';

const nextMonth = (ym) => (ym.slice(5) === '12' ? +ym.slice(0, 4) + 1 + '-01' : ym.slice(0, 5) + String(+ym.slice(5) + 1).padStart(2, '0'));

// Between jobs: the situation in effect today says so, or the Profile does.
export function betweenJobs(spine, asOf = spine.meta.asOf) {
  const now = [...((spine.household && spine.household.situation) || [])].filter((x) => !x.from || x.from <= asOf).sort((a, b) => ((a.from || '') < (b.from || '') ? -1 : 1)).pop();
  return (now && v(now.value) === 'between_jobs') || answersOf(spine).work === 'between';
}

// Weekly paydays left from asOf through end (the stream's own start sets the weekday); null when there is no end.
export function weeksLeft(s, asOf) {
  if (!s.end) return null;
  const end = toDay(s.end), from = toDay(asOf);
  if (end < from) return 0;
  let d = s.start ? toDay(s.start) : from;
  if (d < from) d += Math.ceil((from - d) / 7) * 7;
  return d > end ? 0 : Math.floor((end - d) / 7) + 1;
}

export function unemploymentView(spine, s, { asOf = spine.meta.asOf, rules = null } = {}) {
  const cf = s.cashflow;
  const streams = (spine.income || []).filter((x) => x.type === 'unemployment' && (!x.end || x.end >= asOf)).map((x) => {
    const weekly = x.cadence === 'weekly' ? v(x.amount) : null;
    const fed = x.withholding ? v(x.withholding.federal) : null;
    const left = weeksLeft(x, asOf);
    const row = cf.income.streams.find((r) => r.id === x.id) || {};
    const setAside = (cf.taxSetAside.lines || []).filter((l) => l.kind === 'income' && l.id === x.id).reduce((a, l) => a + (l.amount ?? 0), 0);
    return {
      id: x.id, label: x.label || 'Unemployment', start: x.start || null, end: x.end || null,
      weekly, monthly: row.gross ?? null,
      weeksLeft: left, stillToCome: weekly === null || left === null ? null : round2(weekly * left),
      withheldWeekly: fed, withholds: fed === null ? null : fed > 0,
      // What is left of a month's benefit once tax is out: what is withheld, or what to set aside when nothing is.
      setAsideMonthly: round2(setAside),
      afterTaxMonthly: row.gross === null || row.gross === undefined ? null : round2(row.gross - (fed === null ? 0 : (row.withheld || 0)) - setAside),
      lastDay: x.end || null,
      paths: { amount: 'income.' + x.id + '.amount', end: 'income.' + x.id + '.end', federal: 'income.' + x.id + '.withholding.federal' }
    };
  });
  // The first full month after the benefit ends, figured as its own month (other pay that continues counts): what is
  // left or short that month, and how many such months the cash covers when it is short.
  const ends = streams.map((x) => x.end).filter(Boolean).sort();
  const lastEnd = ends.length && ends.length === streams.length ? ends[ends.length - 1] : null;
  const cash = s.sheet.cash.value;
  let after = null;
  if (lastEnd && rules) {
    const ym = nextMonth(lastEnd.slice(0, 7));
    const m = cashflow(spine, rules, ym);
    const left = m.monthlySurplus.value;
    after = { ym, from: ym + '-01', left, months: left === null || cash === null || left >= 0 ? null : round2(cash / -left), kind: m.monthlySurplus.kind };
  }
  return {
    between: betweenJobs(spine, asOf), streams,
    // A paycheck still running while between jobs: most likely the job's end date was never typed.
    jobsStillPaying: betweenJobs(spine, asOf) ? (spine.income || []).filter((x) => x.type === 'w2' && x.cadence !== 'once' && (!x.end || x.end >= asOf)).map((x) => ({ id: x.id, label: x.label, path: 'income.' + x.id + '.amount' })) : [],
    endsOn: lastEnd,
    // Cash runway now, with the benefit still coming (the month as it is), and on needs only.
    runway: s.emergency.tiers.full.runway.value, runwayNeeds: s.emergency.tiers.needsOnly.runway.value,
    cash, after,
    monthlyGap: cf.monthlySurplus.value
  };
}

// The tenth of a weekly benefit federal withholding takes when asked for (IRS Form W-4V; the only rate it allows besides none).
export const W4V_RATE = 0.1;
export const tenPercentOf = (weekly) => (weekly === null || weekly === undefined ? null : round2(weekly * W4V_RATE));
