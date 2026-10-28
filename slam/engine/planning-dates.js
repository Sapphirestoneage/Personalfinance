// Planning dates (Batch 8, S-278): the dates worth knowing ahead, one calendar layer (on by default): open enrollment,
// a health FSA's plan year end, an I bond's 12-month lock and its 5-year penalty end, CD and Treasury maturities, RSU
// vests and ESPP purchases, a policy's renewal and the end of its term, PMI and a HELOC's draw period ending, an
// inherited IRA's last day, a raise. Estimated tax dates, the IRA and HSA deadlines and intro-rate ends are already on
// the calendar (engine/calendar.js); they count as planning dates too (PLANNING_KINDS). A date only: never cash.
// Pure: spine in, events out.

import { valueOf as v, addMonths } from './spine.js';

const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
const fact = (x, k) => (x[k] && x[k].kind !== 'notForMe' ? v(x[k]) : null);
const addYears = (iso, n) => (+iso.slice(0, 4) + n) + iso.slice(4);
const nameOf = (x) => v(x.name) || x.label || x.id;
// A day of the month moved by whole months, the day kept (the 31st becomes the month's last day).
function plusMonths(iso, n) { const ym = addMonths(iso.slice(0, 7), n), d = +iso.slice(8, 10); const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(); return ym + '-' + String(Math.min(d, last)).padStart(2, '0'); }

// Every planning date from `from` to `to` (inclusive, 'YYYY-MM-DD'): [{ id, kind: 'planning', what, label, date, path, note }].
export function planningDates(spine, from, to) {
  const out = [];
  const add = (id, what, label, date, path, note = null) => { if (date && date >= from && date <= to) out.push({ id: 'plan:' + id, kind: 'planning', what, label, date, path, note }); };
  for (const a of spine.accounts || []) {
    const base = 'accounts.' + a.id + '.', nm = nameOf(a);
    const bought = fact(a, 'purchaseDate');
    if (a.type === 'i_bond' && bought) {
      add(a.id + ':lock', 'ibond', nm + ': can be cashed from today (12 months after buying)', addYears(bought, 1), base + 'purchaseDate');
      add(a.id + ':penalty', 'ibond', nm + ': no more 3-month interest penalty (5 years)', addYears(bought, 5), base + 'purchaseDate');
    }
    add(a.id + ':matures', 'matures', nm + ' matures', fact(a, 'maturityDate'), base + 'maturityDate');
    add(a.id + ':planYear', 'fsa', nm + ': plan year ends (use it or lose it)', fact(a, 'planYearEnd'), base + 'planYearEnd');
    add(a.id + ':espp', 'espp', nm + ': ESPP purchase (offering period ends)', fact(a, 'offeringPeriodEnd'), base + 'offeringPeriodEnd');
    add(a.id + ':empty', 'inherited', nm + ': last day to empty the inherited account', fact(a, 'mustEmptyBy'), base + 'mustEmptyBy');
    // RSUs vest from the next vest date on, every month, quarter or year.
    const vest = fact(a, 'rsuNextVest'), step = MONTHS[fact(a, 'rsuVestSchedule')] || null;
    if (vest) for (let d = vest, i = 0; d <= to && i < 120; d = step ? plusMonths(vest, step * ++i) : '9999-12-31') add(a.id + ':vest:' + d, 'rsu', nm + ': RSUs vest', d, base + 'rsuNextVest', fact(a, 'rsuVestValue') !== null ? 'worth about ' + Math.round(fact(a, 'rsuVestValue')) + ' each vest' : null);
  }
  for (const d of spine.debts || []) {
    const base = 'debts.' + d.id + '.', nm = nameOf(d);
    add(d.id + ':pmi', 'pmi', nm + ': PMI ends', fact(d, 'pmiEnds'), base + 'pmiEnds');
    add(d.id + ':draw', 'draw', nm + ': draw period ends (payments rise)', fact(d, 'drawEnds'), base + 'drawEnds');
  }
  for (const p of spine.policies || []) {
    const base = 'policies.' + p.id + '.', nm = nameOf(p);
    add(p.id + ':renews', 'renewal', nm + ' renews', fact(p, 'renewal'), base + 'renewal');
    add(p.id + ':term', 'term', nm + ': term ends (coverage stops)', fact(p, 'termEnds'), base + 'termEnds');
  }
  for (const s of spine.income || []) {
    const base = 'income.' + s.id + '.';
    add(s.id + ':raise', 'raise', s.label + ': raise', fact(s, 'raiseDate'), base + 'raiseDate');
    // Open enrollment: the first of its month, every year.
    const m = fact(s, 'openEnrollmentMonth');
    if (m >= 1 && m <= 12) for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) add(s.id + ':enroll:' + y, 'enrollment', s.label + ': open enrollment for benefits', y + '-' + String(m).padStart(2, '0') + '-01', base + 'openEnrollmentMonth', 'choose health, FSA and insurance for next year');
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}
// The calendar's own date kinds that are planning dates too (the layer's toggle shows or hides them all).
export const PLANNING_KINDS = ['planning', 'estimatedTax', 'maxDeadline', 'promoEnds', 'bonusBy', 'taxReturn'];
