// The Value: every amount in SLAM is one of these. An amount plus how it was
// given (cadence), how sure we are (status), and who said it (source).

export const CADENCES = ['paycheck', 'week', 'month', 'year', 'one-off'];
export const STATUSES = ['known', 'roughly', 'will-email', 'dont-know', 'not-for-me', 'guess', 'computed'];
export const SOURCES = ['client', 'coach', 'lookup', 'app'];

// A Value with amount null and status null is "blank": nobody has answered yet.
export function makeValue(amount = null, opts = {}) {
  return {
    amount: amount,
    cadence: opts.cadence || 'month',
    status: opts.status !== undefined ? opts.status : (amount === null ? null : 'known'),
    source: opts.source || 'client',
    asOf: opts.asOf || null,
    note: opts.note || ''
  };
}

// Fill in missing keys so compact test files and older exports load cleanly.
export function normalizeValue(v) {
  if (v === undefined || v === null) return makeValue();
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
  if (v.amount !== null && (typeof v.amount !== 'number' || !Number.isFinite(v.amount))) errs.push(where + ': amount must be a number or empty');
  if (!CADENCES.includes(v.cadence)) errs.push(where + ': unknown cadence ' + v.cadence);
  if (v.status !== null && !STATUSES.includes(v.status)) errs.push(where + ': unknown status ' + v.status);
  if (!SOURCES.includes(v.source)) errs.push(where + ': unknown source ' + v.source);
  return errs;
}
