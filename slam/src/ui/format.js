// Display formatting only. Turns numbers from calc into text; never computes.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const EMPTY = '·';

export function money(x, exact = false) {
  if (x === null || x === undefined || Number.isNaN(x)) return EMPTY;
  return (exact ? usd2 : usd0).format(x);
}

export function signedMoney(x) {
  if (x === null || x === undefined) return EMPTY;
  return (x > 0 ? '+' : '') + money(x);
}

export function pct(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return EMPTY;
  return (x * 100).toFixed(digits) + '%';
}

export function signedPct(x) {
  if (x === null || x === undefined) return EMPTY;
  return (x > 0 ? '+' : '') + pct(x);
}

export function times(x) {
  if (x === null || x === undefined) return EMPTY;
  return x.toFixed(x >= 10 ? 0 : 2).replace(/\.?0+$/, '') + 'x';
}

export function hours(x) {
  if (x === null || x === undefined) return EMPTY;
  return (x >= 10 ? x.toFixed(0) : x.toFixed(1)) + ' h';
}

// One number in the unit picked by the lens toggle. The value already comes from calc.
export function inLens(x, unit) {
  if (unit === 'percent') return pct(x, 1);
  if (unit === 'hours') return hours(x);
  return money(x);
}

export const STATUS_LABELS = {
  null: 'Blank', known: 'Known', roughly: 'Roughly', 'will-email': 'Will email',
  'dont-know': "Don't know", 'not-for-me': "Doesn't apply", guess: 'Guess', computed: 'Computed'
};

export const CADENCE_LABELS = { month: '/ month', week: '/ week', paycheck: '/ paycheck', year: '/ year', 'one-off': 'one-off' };

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
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

export function dayLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
