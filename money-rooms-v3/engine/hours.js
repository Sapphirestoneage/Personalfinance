/* Hours Everywhere (Level 15, MR-112): the client's real hourly wage as a
   global lens. One source of truth for the wage (the same formula the
   realHourlyWage metric has carried since Level 2: take-home less the costs
   of working, over paid, commute and unpaid hours), a fallback chain that
   says which rung it stands on, the hourly pay rows of 1b turned into gross
   and take-home with the one tax function, and one formatter, toHours, that
   every view calls and none re-derives. Pure. */
import { hasValue, numberOf, rangeOf } from './states.js';
import { federalTax, taxableIncome, fica, selfEmploymentTax } from './tax.js';
import { cadenceToMonthly } from './units.js';

export const DEFAULT_WEEKS = 52; export const DEFAULT_WEEKLY_HOURS = 40; export const DEFAULT_OT_MULT = 1.5;
export const HOURS_PER = Object.freeze([['week', 'a week'], ['month', 'a month'], ['year', 'a year']]);
export const WAGE_METHODS = Object.freeze({ real: 'Real hourly wage', basic: 'Basic take-home hourly', guess: 'A guess from income and a 40-hour week', trailing: 'Trailing average of variable income', none: 'Add income to see hours' });
/* the same rungs in the client's words (no guess, no jargon) */
export const WAGE_METHODS_CLIENT = Object.freeze({ real: 'your real hourly wage', basic: 'take-home over your paid hours', guess: 'a rough figure from income and a 40-hour week', trailing: 'a trailing average of what your work pays', none: 'Add income to see hours' });
const PAYCHECKS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const n = (row, fid) => { const f = row.f[fid]; return f && hasValue(f) ? numberOf(f) : null; };
const rng = (row, fid) => { const f = row.f[fid]; return f && hasValue(f) ? rangeOf(f) : null; };
const mon = (row, fid) => { const f = row.f[fid]; if (!f || !hasValue(f)) return null; const v = numberOf(f); if (v === null) return null; const pf = row.f.payFrequency && hasValue(row.f.payFrequency) ? row.f.payFrequency.v : 'biweekly'; return cadenceToMonthly(v, f.cad || 'month', PAYCHECKS[pf] || 26); };

/* Hours a year from the paid hours and their period: a week times the weeks worked, a month times twelve, a year as is. */
export function hoursPerYear(hours, per, weeks) { const w = typeof weeks === 'number' && weeks > 0 ? weeks : DEFAULT_WEEKS; return per === 'year' ? hours : per === 'month' ? hours * 12 : hours * w; }
/* Weeks worked a year from the unpaid time off helper: 52 less holidays, sick days, vacation (in days, five to a week) and seasonal slow weeks. */
export function weeksFromTimeOff(off) { const o = off || {}; const days = (o.holidays || 0) + (o.sick || 0) + (o.vacation || 0); return Math.max(1, Math.round((DEFAULT_WEEKS - days / 5 - (o.slowWeeks || 0)) * 10) / 10); }

/* An hourly pay row (1b) as gross a year: rate x hours x weeks, plus overtime at its multiplier, plus tips or commission. A range of hours gives a range of gross. Null when the row is not hourly. */
export function hourlyGrossAnnual(row) {
  const rate = n(row, 'hourlyRate'); const hp = n(row, 'hoursPaid');
  if (rate === null || hp === null || hp <= 0) return null;
  const per = (row.f.hoursPer && hasValue(row.f.hoursPer) && row.f.hoursPer.v) || 'week';
  const weeks = n(row, 'weeksPerYear') || DEFAULT_WEEKS;
  const ot = n(row, 'overtimeHours') || 0; const mf = row.f.overtimeMultiplier && hasValue(row.f.overtimeMultiplier) ? parseFloat(row.f.overtimeMultiplier.v) : NaN; const mult = Number.isFinite(mf) && mf > 0 ? mf : DEFAULT_OT_MULT;
  const tipsMonthly = mon(row, 'tips') || 0;
  const base = h => Math.round(rate * hoursPerYear(h, per, weeks)) + Math.round(rate * mult * hoursPerYear(ot, per, weeks)) + tipsMonthly * 12;
  const r = rng(row, 'hoursPaid');
  return { cents: base(hp), range: r ? { low: base(r.low), high: base(r.high) } : null, rate, hours: hp, hoursRange: r, per, weeks, overtime: ot, multiplier: mult, tipsMonthly, unpaidWeeks: Math.max(0, Math.round((DEFAULT_WEEKS - weeks) * 10) / 10), unpaidCostAnnual: Math.round(rate * hoursPerYear(hp, per, DEFAULT_WEEKS)) - Math.round(rate * hoursPerYear(hp, per, weeks)) };
}
/* Gross a year to take-home a year with the one tax function (federal and FICA, or self-employment tax on 1099 work; before state tax). */
export function takeHomeAnnual(table, grossAnnual, filing, selfEmployed, pretaxAnnual) {
  if (!table) return Math.round(grossAnnual * 0.75);
  const pre = pretaxAnnual || 0;
  if (selfEmployed) { const se = selfEmploymentTax(table, grossAnnual); return grossAnnual - se.tax - federalTax(table, taxableIncome(table, grossAnnual - se.deductibleHalf, pre, filing), filing).tax - pre; }
  return grossAnnual - federalTax(table, taxableIncome(table, grossAnnual, pre, filing), filing).tax - fica(table, grossAnnual).total - pre;
}
/* The open conversion, term by term, for the screen: "$X an hour x Y hours x Z weeks = $A a year gross, about $B a month take-home". */
export function hourlyConversion(row, table, filing) {
  const g = hourlyGrossAnnual(row); if (!g) return null;
  const self = row.type === 'c1099' || row.type === 'side';
  const take = takeHomeAnnual(table, g.cents, filing || 'single', self, 0);
  const takeRange = g.range ? { low: takeHomeAnnual(table, g.range.low, filing || 'single', self, 0), high: takeHomeAnnual(table, g.range.high, filing || 'single', self, 0) } : null;
  return Object.assign({}, g, { grossAnnual: g.cents, grossMonthly: Math.round(g.cents / 12), takeHomeAnnual: take, takeHomeMonthly: Math.round(take / 12), takeHomeRange: takeRange ? { low: Math.round(takeRange.low / 12), high: Math.round(takeRange.high / 12) } : null, selfEmployed: self });
}
/* A salaried row read back as a basic hourly figure: gross a year over the paid hours (40 a week by default). */
export function salaryAsHourly(grossMonthly, hoursWeek, weeks) { const hrs = hoursPerYear(hoursWeek || DEFAULT_WEEKLY_HOURS, 'week', weeks || DEFAULT_WEEKS); return hrs > 0 ? Math.round(grossMonthly * 12 / hrs) : null; }

/* ---- the wage ---- */
/* Every income source with its own real hourly wage, and the blend weighted by hours. Reads the finished result's take-home by row (typed or inferred) so the money is never worked out twice. */
export function realHourlyWage(record, result) {
  const S = result && result.sun && result.sun.outputs; const inc = S && S.income;
  const rows = record.planets.income.rows.filter(r => ['w2', 'c1099', 'side'].includes(r.type) && !(r.f.whose && r.f.whose.v === 'partner'));
  const enriched = (result && result.enriched && result.enriched.income) || [];
  const takeOf = r => { const t = mon(r, 'takeHome'); if (t !== null) return { cents: t, inferred: false }; const e = enriched.find(x => x.rowId === r.id && x.field === 'takeHome'); return e && e.value ? { cents: e.value.cents, inferred: true } : null; };
  const work = record.sun.f.workSituation && hasValue(record.sun.f.workSituation) ? record.sun.f.workSituation.v : null;
  const sources = rows.map(r => {
    const take = takeOf(r); if (!take) return null;
    const hp = n(r, 'hoursPaid'); const per = (r.f.hoursPer && hasValue(r.f.hoursPer) && r.f.hoursPer.v) || 'week'; const weeks = n(r, 'weeksPerYear') || DEFAULT_WEEKS;
    const paidMonthly = hp !== null && hp > 0 ? hoursPerYear(hp, per, weeks) / 12 : null;
    const commuteMonthly = (n(r, 'hoursCommute') || 0) * 52 / 12; const unpaidMonthly = (n(r, 'hoursUnpaid') || 0) * 52 / 12;
    const costs = mon(r, 'workCosts') || 0; const hourly = n(r, 'hourlyRate');
    const hrs = paidMonthly !== null ? paidMonthly + commuteMonthly + unpaidMonthly : null;
    const method = hrs !== null && hrs > 0 ? 'real' : null;
    const basicHours = DEFAULT_WEEKLY_HOURS * 52 / 12;
    const wage = method === 'real' ? Math.round((take.cents - costs) / hrs) : Math.round(take.cents / basicHours);
    const variable = r.type === 'c1099' || r.type === 'side' || (r.f.stability && r.f.stability.v === 'variable');
    return { rowId: r.id, name: r.nickname || r.type, type: r.type, takeHomeMonthly: take.cents, inferred: take.inferred, costsMonthly: costs, hoursMonthly: hrs, paidMonthly, commuteMonthly, unpaidMonthly, wage, method: method || 'guess', statedHourly: hourly, variable, label: method === 'real' ? WAGE_METHODS.real : WAGE_METHODS.guess };
  }).filter(Boolean);
  const takeAll = inc && inc.takeHomeMonthly && inc.takeHomeMonthly.status === 'ok' ? inc.takeHomeMonthly.cents : null;
  if (takeAll === null || takeAll <= 0 || work === 'between-jobs') return { wage: null, method: 'none', label: WAGE_METHODS.none, weeklyHours: null, sources, betweenJobs: work === 'between-jobs' || !sources.length };
  /* a snapshot alone (no pay rows): the last rung, a guess from income and a 40-hour week */
  if (!sources.length) return { wage: Math.round(takeAll / (DEFAULT_WEEKLY_HOURS * 52 / 12)), method: 'guess', label: WAGE_METHODS.guess, weeklyHours: DEFAULT_WEEKLY_HOURS, hoursMonthly: DEFAULT_WEEKLY_HOURS * 52 / 12, sources, betweenJobs: false, blended: false };
  const real = sources.filter(s => s.method === 'real');
  if (real.length === sources.length) {
    const hrs = real.reduce((s, x) => s + x.hoursMonthly, 0); const net = real.reduce((s, x) => s + x.takeHomeMonthly - x.costsMonthly, 0);
    const variable = sources.every(s => s.variable);
    return { wage: Math.round(net / hrs), method: variable ? 'trailing' : 'real', label: variable ? WAGE_METHODS.trailing + ' (the figures on file, hours as given)' : WAGE_METHODS.real, weeklyHours: Math.round(hrs * 12 / 52 * 10) / 10, hoursMonthly: hrs, sources, betweenJobs: false, blended: real.length > 1 };
  }
  /* some hours known, some not: basic take-home hourly, every source at its stated or default hours */
  const anyHours = sources.some(s => s.paidMonthly !== null);
  const hrs = sources.reduce((s, x) => s + (x.paidMonthly !== null ? x.paidMonthly : DEFAULT_WEEKLY_HOURS * 52 / 12), 0);
  const wage = Math.round(sources.reduce((s, x) => s + x.takeHomeMonthly, 0) / hrs);
  return { wage, method: anyHours ? 'basic' : 'guess', label: anyHours ? WAGE_METHODS.basic + ' (costs of working and commute not on file)' : WAGE_METHODS.guess, weeklyHours: Math.round(hrs * 12 / 52 * 10) / 10, hoursMonthly: hrs, sources, betweenJobs: false, blended: sources.length > 1 };
}

/* ---- the formatter ---- */
/* Hours of work for a dollar figure: minutes under an hour, hours under a week, work-weeks under a work-year, then work-years, at the client's real weekly hours. Null when there is no wage; never NaN or Infinity. */
export function toHours(cents, wage, weeklyHours) {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || typeof wage !== 'number' || !Number.isFinite(wage) || wage <= 0) return null;
  const wk = typeof weeklyHours === 'number' && weeklyHours > 0 ? weeklyHours : DEFAULT_WEEKLY_HOURS;
  const hours = Math.abs(cents) / wage; const sign = cents < 0 ? '-' : '';
  const one = (v, unit) => { const r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10; return sign + (Number.isInteger(r) ? String(r) : r.toFixed(1)) + ' ' + unit; };
  if (hours < 1) return { hours, text: sign + Math.max(1, Math.round(hours * 60)) + ' min', unit: 'minutes' };
  if (hours < wk) return { hours, text: one(hours, 'h'), unit: 'hours' };
  const weeks = hours / wk;
  if (weeks < 50) return { hours, text: one(weeks, weeks >= 1.95 ? 'work-weeks' : 'work-week'), unit: 'weeks' };
  const years = weeks / 50;
  return { hours, text: one(years, years >= 1.95 ? 'work-years' : 'work-year'), unit: 'years' };
}
/* The materiality line (MR-111): knowing a fact is worth less than the time to find it when its dollars a year times its uncertainty fall under the wage times the minutes. */
export function belowMateriality(dollarsAtStakeAnnual, wage, minutes) { if (typeof wage !== 'number' || wage <= 0) return false; return Math.abs(dollarsAtStakeAnnual || 0) < wage * ((minutes || 5) / 60); }
