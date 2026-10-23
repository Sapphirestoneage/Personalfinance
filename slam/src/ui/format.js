// Display formatting only. Turns numbers from the engines into text; never computes.
// Imports nothing; every screen and component calls these for money, percents, and dates.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// What a null (not entered) value shows as. Never '0' or '$0': empty is not zero.
export const EMPTY = '·';

export function money(x, exact = false) {
  if (x === null || x === undefined || Number.isNaN(x)) return EMPTY;
  return (exact ? usd2 : usd0).format(x);
}

export function signedMoney(x) {
  if (x === null || x === undefined) return EMPTY;
  return (x > 0 ? '+' : '') + money(x);
}

// x is a ratio: 0.25 shows as 25%.
export function pct(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return EMPTY;
  return (x * 100).toFixed(digits) + '%';
}

export function signedPct(x) {
  if (x === null || x === undefined) return EMPTY;
  return (x > 0 ? '+' : '') + pct(x);
}

// A multiple like 2.5x (actual over estimate). Whole numbers from 10x up, trailing zeros dropped.
export function times(x) {
  if (x === null || x === undefined) return EMPTY;
  return x.toFixed(x >= 10 ? 0 : 2).replace(/\.?0+$/, '') + 'x';
}

// Hours of work, for the hours lens; one decimal under 10.
export function hours(x) {
  if (x === null || x === undefined) return EMPTY;
  return (x >= 10 ? x.toFixed(0) : x.toFixed(1)) + ' h';
}

// One number in the unit picked by the lens toggle. The conversion is inUnit in engines/lenses.js; this only formats.
export function inLens(x, unit) {
  if (unit === 'percent') return pct(x, 1);
  if (unit === 'hours') return hours(x);
  return money(x);
}

// The word on a status chip (store/value.js lists the statuses). null is a field nobody has answered;
// 'guess' is an average the app supplied, which is always labeled; 'computed' came from the engines.
export const STATUS_LABELS = {
  null: 'Blank',
  known: 'Known',
  roughly: 'Roughly',
  'will-email': 'Will email',
  'dont-know': "Don't know",
  'not-for-me': "Doesn't apply",
  guess: 'Guess',
  computed: 'Computed'
};

export const CADENCE_LABELS = {
  month: '/ month',
  week: '/ week',
  paycheck: '/ paycheck',
  year: '/ year',
  'one-off': 'one-off'
};

// 'YYYY-MM' to "October 2026". UTC in and out (Date.UTC to build, timeZone: 'UTC' to print), so the
// first of the month cannot slip into the month before, whatever zone the viewer is in.
export function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Accounting style for amounts taken away: (1,000).
export function less(x) {
  if (x === null || x === undefined) return EMPTY;
  return '(' + money(x) + ')';
}

// Today as YYYY-MM-DD in the viewer's own time zone (dates in the log are local days).
export function todayIso(now = new Date()) {
  return (
    now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  );
}

// 'YYYY-MM-DD' to "May 31". UTC in and out, for the same reason as monthLabel.
export function dayLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// A whole date in words: "May 31, 2027".
export function dateLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}
