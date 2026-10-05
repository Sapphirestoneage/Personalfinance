/* Shared helpers for the five stations: turn a row's field into a Quantity
   with its confidence and rough range, normalise cadences to a month, and
   build "needs" lists. */
import { q, needs, U, cadenceToMonthly } from '../units.js';
import { hasValue, numberOf, rangeOf, confidenceOf, isRough } from '../states.js';

const PAYCHECKS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

export function paychecksPerYear(row) {
  const pf = row.f.payFrequency && hasValue(row.f.payFrequency) ? row.f.payFrequency.v : 'biweekly';
  return PAYCHECKS[pf] || 26;
}

export function spreadFor(field, asm) {
  const sp = asm.roughSpread || {};
  if (field.source === 'estimated') return sp.estimated || 0;
  if (field.source === 'lookup-verify') return sp['lookup-verify'] || 0;
  return sp[field.state] || 0;
}

/* Monthly cents of a money field, with its rough range, or null. */
export function monthlyCents(row, fieldId) {
  const f = row.f[fieldId];
  if (!f || !hasValue(f)) return null;
  const n = numberOf(f);
  if (n === null) return null;
  return cadenceToMonthly(n, f.cad || 'month', paychecksPerYear(row));
}

/* A Quantity for a money field in the given units (monthly or oneoff). */
export function fieldQ(row, fieldId, units, asm) {
  const f = row.f[fieldId];
  if (!f || !hasValue(f)) return null;
  const n = numberOf(f);
  if (n === null) return null;
  const monthly = units.period === 'monthly';
  const cents = monthly ? cadenceToMonthly(n, f.cad || 'month', paychecksPerYear(row)) : n;
  const typed = rangeOf(f);
  let range = null;
  if (typed) {
    const lo = monthly ? cadenceToMonthly(typed.low, f.cad || 'month', paychecksPerYear(row)) : typed.low;
    const hi = monthly ? cadenceToMonthly(typed.high, f.cad || 'month', paychecksPerYear(row)) : typed.high;
    range = { low: lo, high: hi };
  } else {
    const s = spreadFor(f, asm || {});
    if (s) range = { low: Math.round(cents * (1 - s)), high: Math.round(cents * (1 + s)) };
  }
  return q(cents, units, { confidence: confidenceOf(f), range, rough: isRough(f) });
}

export function num(row, fieldId) {
  const f = row.f[fieldId];
  if (!f || !hasValue(f)) return null;
  return numberOf(f);
}
export function val(row, fieldId) {
  const f = row.f[fieldId];
  if (!f || !hasValue(f)) return null;
  return f.v;
}
export function isNa(row, fieldId) {
  const f = row.f[fieldId];
  return !!f && (f.state === 'not-applicable' || f.state === 'not-for-me');
}
export function needList(items) { return needs(items); }

/* A zero Quantity. */
export function zero(units) { return q(0, units); }
export { q, U, needs };
