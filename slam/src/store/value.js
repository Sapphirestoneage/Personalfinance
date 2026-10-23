// The Value: every amount in SLAM is one of these. An amount plus how it was
// given (cadence), how sure we are (status), and who said it (source). A null
// amount is not entered, never zero; a typed 0 is an answer. Needs engines/normalize.js
// (PART_CADENCES and sumParts) to check that a split amount equals its items.

import { PART_CADENCES, sumParts } from '../engines/normalize.js';

// Re-exported so the pieces that always read them from here keep working; the math lives in the engines.
export { PART_CADENCES, sumParts };

// 'paycheck' needs the income's pay frequency to become monthly; 'one-off' stays out of monthly
// totals (toMonthly in engines/normalize.js).
export const CADENCES = ['paycheck', 'week', 'month', 'year', 'one-off'];
// 'not-for-me' is a real zero (doesn't apply). 'guess' is an app-supplied average, labeled with its
// source; 'computed' is worked out by an engine (a percent deduction, for example).
export const STATUSES = ['known', 'roughly', 'will-email', 'dont-know', 'not-for-me', 'guess', 'computed'];
// 'app' is the source of a guess the app supplied (engines/guesses.js).
export const SOURCES = ['client', 'coach', 'lookup', 'app'];

// A Value with amount null and status null is "blank": nobody has answered yet.
export function makeValue(amount = null, opts = {}) {
  const v = {
    amount: amount,
    cadence: opts.cadence || 'month',
    status: opts.status !== undefined ? opts.status : amount === null ? null : 'known',
    source: opts.source || 'client',
    asOf: opts.asOf || null,
    note: opts.note || ''
  };
  // Optional items inside one amount (Uber, bus, subway); the amount is their sum.
  if (Array.isArray(opts.parts) && opts.parts.length)
    v.parts = opts.parts.map((p) => ({
      name: String(p.name || ''),
      amount: p.amount === undefined ? null : p.amount,
      ...(p.cadence ? { cadence: p.cadence } : {})
    }));
  return v;
}

// Fill in missing keys so compact test files and older exports load cleanly.
export function normalizeValue(v) {
  if (v === undefined || v === null) return makeValue();
  // A bare number is a known amount a month from the client.
  if (typeof v === 'number') return makeValue(v);
  return makeValue(v.amount === undefined ? null : v.amount, v);
}

export function isBlank(v) {
  return !v || (v.amount === null && v.status === null);
}

// Problems with one Value, as plain sentences. Empty array means it is fine.
export function valueErrors(v, where) {
  const errs = [];
  if (!v || typeof v !== 'object') return [where + ': missing value'];
  if (v.amount !== null && (typeof v.amount !== 'number' || !Number.isFinite(v.amount)))
    errs.push(where + ': amount must be a number or empty');
  if (!CADENCES.includes(v.cadence)) errs.push(where + ': unknown cadence ' + v.cadence);
  if (v.status !== null && !STATUSES.includes(v.status)) errs.push(where + ': unknown status ' + v.status);
  if (!SOURCES.includes(v.source)) errs.push(where + ': unknown source ' + v.source);
  if (v.parts !== undefined) {
    if (!Array.isArray(v.parts)) errs.push(where + ': items must be a list');
    else {
      v.parts.forEach((p, i) => {
        if (typeof p.name !== 'string') errs.push(where + '.parts[' + i + ']: name must be text');
        if (p.amount !== null && (typeof p.amount !== 'number' || !Number.isFinite(p.amount)))
          errs.push(where + '.parts[' + i + ']: amount must be a number or empty');
        // An item may carry its own cadence (S-074); none means the value's own.
        if (p.cadence !== undefined && !PART_CADENCES[p.cadence])
          errs.push(where + '.parts[' + i + ']: cadence must be week, month, or year');
      });
      // sumParts rounds to the cent, so half a cent is the tolerance. The check is skipped while an
      // item is already wrong, and when no item has a number (sum null: empty is not zero).
      const sum = errs.length ? null : sumParts(v.parts, v.cadence);
      if (!errs.length && v.amount !== null && sum !== null && Math.abs(sum - v.amount) > 0.005)
        errs.push(where + ': amount must equal the sum of its items');
    }
  }
  return errs;
}
