// Type it any way (S-285): money, dates, days and rates as people say them. Pure; today is passed in.
//   money: 2k, $2,000, 2000/mo, 500 a week, 1.2k a year, 3m      -> { value (a month when a period is given), cadence, words }
//   date:  2026-12-06, dec 6, December 6 2027, 12/6, the 15th, next friday, friday, today, tomorrow
//   day:   15, the 15th, 1st                                     -> 15
//   rate:  25, 25%, 0.25 (25% or 0.25%: both offered)
// Each read returns { ok, value, words, alt? }: alt is the other likely reading, offered beside the first.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
const real = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
// Today on this computer, as YYYY-MM-DD (only for reading a typed date with no year).
export const localToday = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
export const dateWords = (s) => MONTH_WORDS[+s.slice(5, 7) - 1] + ' ' + +s.slice(8, 10) + ', ' + s.slice(0, 4);
const money = (x) => '$' + (Math.round(x * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Math.round(x * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

// The periods people say, and how many of each make a month.
const PERIODS = [
  [/(?:\/|\bper\s+|\ba\s+|\beach\s+)?(?:wk|week)$|\bweekly$/, 'weekly', 52 / 12, 'a week'],
  [/\bevery\s+(?:2|two|other)\s+weeks?$|\bbi-?weekly$/, 'biweekly', 26 / 12, 'every 2 weeks'],
  [/\btwice\s+a\s+month$|\bsemi-?monthly$/, 'semimonthly', 2, 'twice a month'],
  [/(?:\/|\bper\s+|\ba\s+|\beach\s+)?(?:yr|year)$|\byearly$|\bannually$|\/a$/, 'yearly', 1 / 12, 'a year'],
  [/(?:\/|\bper\s+|\ba\s+|\beach\s+)?(?:mo|mth|month)$|\bmonthly$/, 'monthly', 1, 'a month']
];
export function readMoney(text) {
  let t = String(text ?? '').trim().toLowerCase();
  if (!t) return { ok: false, message: 'Type an amount' };
  let cadence = null, per = 1, said = '';
  for (const [re, c, n, w] of PERIODS) if (re.test(t)) { cadence = c; per = n; said = w; t = t.replace(re, '').trim(); break; }
  const m = t.replace(/[$,\s]/g, '').match(/^(-?\d*\.?\d+)([km])?$/);
  if (!m) return { ok: false, message: 'Type an amount, like 2,000 or 2k' };
  const base = Number(m[1]) * (m[2] === 'k' ? 1000 : m[2] === 'm' ? 1e6 : 1);
  if (!Number.isFinite(base)) return { ok: false, message: 'Type an amount' };
  const value = Math.round(base * per * 100) / 100;
  const words = !cadence || cadence === 'monthly' ? money(base) + (cadence ? ' a month' : '') : money(base) + ' ' + said + ', about ' + money(value) + ' a month';
  return { ok: true, value, cadence, words };
}
export function readDay(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/^(on\s+)?the\s+/, '').replace(/(st|nd|rd|th)$/, '');
  if (!/^\d{1,2}$/.test(t)) return { ok: false, message: 'A day of the month, like 15 or the 15th' };
  const n = +t;
  return n >= 1 && n <= 31 ? { ok: true, value: n, words: 'the ' + ord(n) } : { ok: false, message: 'A day from 1 to 31' };
}
export function readRate(text) {
  const t = String(text ?? '').trim().replace(/\s/g, '');
  const pc = t.endsWith('%');
  const n = Number(t.replace(/%$/, ''));
  if (!t || !Number.isFinite(n)) return { ok: false, message: 'A percent, like 24 or 24%' };
  const value = Math.round(n * 1e6) / 1e8, w = (x) => (Math.round(x * 1e6) / 1e4) + '%';
  // "0.25" with no % sign: a quarter of a percent, or a quarter (25%)? Both are offered.
  const alt = !pc && n > 0 && n < 1 ? { value: n, words: w(n) } : null;
  return { ok: true, value, words: w(value), alt };
}
// A date. A month and day with no year: the next one on or after today, with the one before it offered too.
export function readDate(text, today) {
  const t = String(text ?? '').trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  const [ty, tm, td] = today.split('-').map(Number);
  const done = (s, alt = null) => ({ ok: true, value: s, words: dateWords(s), alt: alt ? { value: alt, words: dateWords(alt) } : null });
  const at = (offset) => { const d = new Date(Date.UTC(ty, tm - 1, td + offset)); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  if (!t) return { ok: false, message: 'A date, like Dec 6 or 2026-12-06' };
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return real(+m[1], +m[2], +m[3]) ? done(iso(+m[1], +m[2], +m[3])) : { ok: false, message: 'That day is not on the calendar' };
  if (t === 'today') return done(today);
  if (t === 'tomorrow') return done(at(1));
  m = t.match(/^(next |this )?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
  if (m) { const want = DAYS.findIndex((d) => d.startsWith(m[2])); const now = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay(); const k = (want - now + 7) % 7 || 7; return done(at(k)); }
  m = t.match(/^(?:on )?the (\d{1,2})(?:st|nd|rd|th)?$/);
  if (m) { const d = +m[1]; let y = ty, mo = tm; if (d < td) { mo += 1; if (mo > 12) { mo = 1; y += 1; } } return real(y, mo, d) ? done(iso(y, mo, d)) : { ok: false, message: 'That day is not in that month' }; }
  const withYear = (mo, d, y) => {
    if (y) { const yy = y < 100 ? 2000 + y : y; return real(yy, mo, d) ? done(iso(yy, mo, d)) : { ok: false, message: 'That day is not on the calendar' }; }
    if (!real(ty, mo, d) && !real(ty + 1, mo, d)) return { ok: false, message: 'That day is not on the calendar' };
    const thisYear = iso(ty, mo, d);
    return thisYear >= today ? done(thisYear, iso(ty - 1, mo, d)) : done(iso(ty + 1, mo, d), thisYear);
  };
  m = t.match(/^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{2,4}))?$/);
  if (m && MONTHS.includes(m[1].slice(0, 3))) return withYear(MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2], m[3] ? +m[3] : null);
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})(?: (\d{2,4}))?$/);
  if (m && MONTHS.includes(m[2].slice(0, 3))) return withYear(MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1], m[3] ? +m[3] : null);
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) return withYear(+m[1], +m[2], m[3] ? +m[3] : null);
  return { ok: false, message: 'A date, like Dec 6, the 15th or next Friday' };
}
// What a box understood, in words, for the line under it: { ok, words, alt? } or { ok: false, message }.
export function understood(type, text, today) {
  if (!String(text ?? '').trim()) return null;
  if (type === 'money') return readMoney(text);
  if (type === 'rate') return readRate(text);
  if (type === 'date') return readDate(text, today);
  if (type === 'day') return readDay(text);
  return null;
}
