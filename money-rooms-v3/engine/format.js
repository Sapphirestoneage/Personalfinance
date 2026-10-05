/* The one formatting module. Views call these and nothing else. Every
   function returns a string; a null or undefined input returns the empty
   string so a view can show its own "needs" chip; a NaN or non-finite input
   throws, because that is a bug upstream, never something to print. */

const TILDE = '~';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function guard(n, what) {
  if (n === null || n === undefined) return false;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('format ' + what + ': not a finite number: ' + String(n));
  return true;
}

function withCommas(intString) {
  return intString.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* Dollars from integer cents. At or above $1,000 no cents are shown; below,
   cents show. Negative is a leading hyphen-minus: -$1,250. Zero is $0. */
export function dollars(cents, opts) {
  if (!guard(cents, 'dollars')) return '';
  const o = opts || {};
  const neg = cents < 0;
  const abs = Math.abs(cents);
  let body;
  if (abs >= 100000 || o.whole) {
    body = '$' + withCommas(String(Math.round(abs / 100)));
  } else {
    const d = Math.floor(abs / 100), c = abs % 100;
    body = '$' + withCommas(String(d)) + '.' + String(c).padStart(2, '0');
  }
  if (abs === 0) body = '$0';
  const sign = neg ? '-' : '';
  return (o.rough && abs !== 0 ? TILDE : '') + sign + body;
}

/* Whole dollars only, for dense tables and chart axes. */
export function dollarsWhole(cents, opts) {
  return dollars(cents, Object.assign({}, opts || {}, { whole: true }));
}

/* Compact for chart axes: $1.2M, $450k, $800. */
export function dollarsCompact(cents) {
  if (!guard(cents, 'dollarsCompact')) return '';
  const neg = cents < 0 ? '-' : '';
  const d = Math.abs(cents) / 100;
  if (d >= 1e6) return neg + '$' + trimZero((d / 1e6).toFixed(d >= 1e7 ? 0 : 1)) + 'M';
  if (d >= 1e3) return neg + '$' + trimZero((d / 1e3).toFixed(d >= 1e5 ? 0 : 1)) + 'k';
  return neg + '$' + Math.round(d);
}
function trimZero(s) { return s.replace(/\.0$/, ''); }

export function range(lowCents, highCents, opts) {
  if (!guard(lowCents, 'range') || !guard(highCents, 'range')) return '';
  return dollars(lowCents, opts) + ' to ' + dollars(highCents, Object.assign({}, opts || {}, { rough: false }));
}

/* Percent with one decimal from a ratio (0.234 -> 23.4%). */
export function percent(ratio, opts) {
  if (!guard(ratio, 'percent')) return '';
  const o = opts || {};
  const v = ratio * 100;
  const s = (Math.round(Math.abs(v) * 10) / 10).toFixed(1);
  return (o.rough && s !== '0.0' ? TILDE : '') + (v < 0 && s !== '0.0' ? '-' : '') + s + '%';
}

/* Whole months. */
export function months(n, opts) {
  if (!guard(n, 'months')) return '';
  const w = Math.round(n);
  const o = opts || {};
  const word = o.bare ? '' : (w === 1 ? ' month' : ' months');
  return (o.rough ? TILDE : '') + String(w) + word;
}

export function years(n, opts) {
  if (!guard(n, 'years')) return '';
  const o = opts || {};
  const v = Math.round(n * 10) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return (o.rough ? TILDE : '') + s + (o.bare ? '' : (v === 1 ? ' year' : ' years'));
}

/* "Oct 2026" from YYYY-MM or YYYY-MM-DD. */
export function date(iso, opts) {
  if (iso === null || iso === undefined || iso === '') return '';
  const m = /^(\d{4})-(\d{2})/.exec(String(iso));
  if (!m) throw new Error('format date: expected YYYY-MM, got ' + String(iso));
  const mi = parseInt(m[2], 10) - 1;
  if (mi < 0 || mi > 11) throw new Error('format date: bad month ' + iso);
  return ((opts && opts.rough) ? TILDE : '') + MONTHS[mi] + ' ' + m[1];
}

/* "5 Oct 2026" for journal lines and asOf. */
export function dateLong(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return date(iso);
  return String(parseInt(m[3], 10)) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
}

export function integer(n, opts) {
  if (!guard(n, 'integer')) return '';
  return ((opts && opts.rough) ? TILDE : '') + withCommas(String(Math.round(n)));
}

export function hours(n, opts) {
  if (!guard(n, 'hours')) return '';
  const v = Math.round(n * 10) / 10;
  return ((opts && opts.rough) ? TILDE : '') + (Number.isInteger(v) ? String(v) : v.toFixed(1)) + ' h';
}

/* Age from a birth date at a given date (both ISO). */
export function ageAt(birthIso, atIso) {
  const b = new Date(birthIso + (birthIso.length === 7 ? '-01' : '') + 'T00:00:00Z');
  const a = new Date(atIso + (atIso.length === 7 ? '-01' : '') + 'T00:00:00Z');
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = a.getUTCMonth() < b.getUTCMonth() || (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/* Format any engine value (Quantity, ratio, count, date, needs). */
export function value(v, opts) {
  if (v === null || v === undefined) return '';
  if (v.status === 'needs') return '';
  const o = Object.assign({ rough: !!v.rough }, opts || {});
  if (v.kind === 'ratio') return percent(v.value, o);
  if (v.kind === 'count') {
    if (v.unit === 'months') return months(v.value, o);
    if (v.unit === 'years') return years(v.value, o);
    if (v.unit === 'hours') return hours(v.value, o);
    return integer(v.value, o);
  }
  if (v.kind === 'date') return date(v.value, o);
  if (typeof v.cents === 'number') return dollars(v.cents, o);
  if (typeof v === 'number') return integer(v, o);
  throw new Error('format value: unknown shape');
}

/* The likely/best/worst line under a rough figure. */
export function rangeOfValue(v) {
  if (!v || v.status !== 'ok' || !v.range) return '';
  if (v.kind === 'ratio') return percent(v.range.low) + ' to ' + percent(v.range.high);
  return range(v.range.low, v.range.high);
}

/* Parse typed money ("1,847", "$1,847.50", "1500-2000", "1,500 to 2,000", "2k")
   into cents or a range. Returns null for empty, throws for junk. */
export function parseMoney(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim().replace(/\$/g, '').replace(/,/g, '');
  if (t === '') return null;
  const rangeMatch = /^(-?[\d.]+k?)\s*(?:to|-|–)\s*(-?[\d.]+k?)$/i.exec(t);
  if (rangeMatch) {
    const low = parseOne(rangeMatch[1]), high = parseOne(rangeMatch[2]);
    return { low: Math.min(low, high), high: Math.max(low, high) };
  }
  return parseOne(t);
}
function parseOne(s) {
  let mult = 1;
  let t = s.trim();
  if (/k$/i.test(t)) { mult = 1000; t = t.slice(0, -1); }
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error('not a number: ' + s);
  return Math.round(n * mult * 100);
}

export function parsePercent(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim().replace(/%/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error('not a percent: ' + text);
  return n / 100;
}

/* Cut long text at a word boundary with one ellipsis character. */
export function shorten(text, max) {
  const t = String(text || '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ');
  return (atWord > max * 0.5 ? cut.slice(0, atWord) : cut).trim() + String.fromCharCode(0x2026);
}
