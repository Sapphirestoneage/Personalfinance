// The Value: every amount in SLAM is one of these. An amount plus how it was
// given (cadence), how sure we are (status), and who said it (source).

export const CADENCES = ['paycheck', 'week', 'month', 'year', 'one-off'];
export const STATUSES = ['known', 'roughly', 'will-email', 'dont-know', 'not-for-me', 'guess', 'computed'];
export const SOURCES = ['client', 'coach', 'lookup', 'app'];

// A Value with amount null and status null is "blank": nobody has answered yet.
export function makeValue(amount = null, opts = {}) {
  const v = {
    amount: amount,
    cadence: opts.cadence || 'month',
    status: opts.status !== undefined ? opts.status : (amount === null ? null : 'known'),
    source: opts.source || 'client',
    asOf: opts.asOf || null,
    note: opts.note || ''
  };
  // Optional items inside one amount (Uber, bus, subway); the amount is their sum.
  if (Array.isArray(opts.parts) && opts.parts.length) v.parts = opts.parts.map((p) => ({ name: String(p.name || ''), amount: p.amount === undefined ? null : p.amount, ...(p.cadence ? { cadence: p.cadence } : {}) }));
  return v;
}

// The amount of a split value: the sum of the items that have a number, or
// null when none do (empty is not zero).
// Items can each have their own cadence (S-074): week, month, or year. An item
// with none is in the value's own cadence. Mixed items are added up a year at a
// time and turned into the value's cadence, to the cent.
export const PART_CADENCES = { week: 52, month: 12, year: 1 };

export function sumParts(parts, cadence) {
  const known = parts.filter((p) => p.amount !== null);
  if (!known.length) return null;
  const mixed = known.some((p) => p.cadence && p.cadence !== cadence);
  const total = mixed && PART_CADENCES[cadence]
    ? known.reduce((a, p) => a + p.amount * PART_CADENCES[p.cadence || cadence], 0) / PART_CADENCES[cadence]
    : known.reduce((a, p) => a + p.amount, 0);
  return Math.round(total * 100) / 100;
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
  if (v.parts !== undefined) {
    if (!Array.isArray(v.parts)) errs.push(where + ': items must be a list');
    else {
      v.parts.forEach((p, i) => {
        if (typeof p.name !== 'string') errs.push(where + '.parts[' + i + ']: name must be text');
        if (p.amount !== null && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) errs.push(where + '.parts[' + i + ']: amount must be a number or empty');
        if (p.cadence !== undefined && !PART_CADENCES[p.cadence]) errs.push(where + '.parts[' + i + ']: cadence must be week, month, or year');
      });
      const sum = errs.length ? null : sumParts(v.parts, v.cadence);
      if (!errs.length && v.amount !== null && sum !== null && Math.abs(sum - v.amount) > 0.005) errs.push(where + ': amount must equal the sum of its items');
    }
  }
  return errs;
}
