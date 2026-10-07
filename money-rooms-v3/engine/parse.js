/* Hearing numbers the way people say them (Level 8, MR-045): "1900 every two
   weeks", "like 100 a week", "68k", "2,500ish", "my half is 1,650", "rent's
   3,300 split two ways". Returns the amount in cents, the cadence it was said
   in, how sure it sounded, and anything said about sharing. Pure. */

const CADENCE = [
  [/every\s+two\s+weeks|every\s+other\s+week|biweekly|bi-weekly|per\s+paycheck|a\s+paycheck|each\s+paycheck|each\s+check|a\s+check|per\s+check/i, 'paycheck', 'biweekly'],
  [/twice\s+a\s+month|semi-?monthly|1st\s+and\s+15th|15th\s+and\s+(30th|last)/i, 'paycheck', 'semimonthly'],
  [/every\s+week|a\s+week|per\s+week|weekly|\/\s*wk|\/\s*week/i, 'week', null],
  [/a\s+month|per\s+month|monthly|\/\s*mo\b|\/\s*month|each\s+month|every\s+month/i, 'month', null],
  [/a\s+quarter|quarterly|per\s+quarter/i, 'quarter', null],
  [/a\s+year|per\s+year|yearly|annual|annually|\/\s*yr|\/\s*year|each\s+year|every\s+year|salary/i, 'year', null],
  [/one[- ]?off|once|one\s+time|lump/i, 'oneoff', null],
];
const ROUGH = /ish\b|\babout\b|\blike\b|\broughly\b|\baround\b|\bmaybe\b|\bapprox|\bor\s+so\b|\bsomething\b|\bprobably\b|~/i;
const WORDS_TO_SPLIT = { two: 2, three: 3, four: 4, five: 5, half: 2, halves: 2, thirds: 3, quarters: 4 };

function moneyIn(text) {
  const t = text.replace(/,/g, '');
  const m = /(\d+(?:\.\d+)?)\s*([kK])?/.exec(t);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2]) n *= 1000;
  return Math.round(n * 100);
}

/* parseSaid(text, opts) -> { cents, cadence, payFrequency, state, share, split, isShare, full, raw } or null. opts.defaultCadence applies when none is said; opts.kind 'income' makes a bare "68k" a year. */
export function parseSaid(text, opts) {
  const o = opts || {};
  if (text === null || text === undefined) return null;
  const raw = String(text).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const out = { raw, cents: null, cadence: null, payFrequency: null, state: 'known', share: null, split: null, isShare: false, full: null, none: false, unknown: false };
  if (/^(none|no|nothing|zero|nope)\b/.test(lower) || /\$?0\b(?!\d)/.test(lower) && !/\d\d/.test(lower)) { out.none = true; out.cents = 0; out.state = 'none'; return out; }
  if (/don'?t know|dunno|no idea|not sure|\?$/.test(lower)) { out.unknown = true; out.state = 'unknown'; return out; }
  if (ROUGH.test(lower)) out.state = 'rough';
  for (const [re, cad, pf] of CADENCE) { if (re.test(lower)) { out.cadence = cad; out.payFrequency = pf; break; } }
  /* sharing: "my half is 1,650", "split two ways", "we split it", "split three ways", "half of 3300" */
  const splitWords = /split\s+(two|three|four|\d)\s*ways?|split\s+(in\s+)?(half|halves|thirds|quarters)|(two|three|\d)\s*ways?/i.exec(lower);
  if (splitWords) { const w = (splitWords[1] || splitWords[3] || splitWords[4] || '').trim(); out.split = WORDS_TO_SPLIT[w] || parseInt(w, 10) || 2; }
  else if (/\bsplit\b|\bwe\s+share\b|\bshared?\b|\bbetween\s+us\b/.test(lower)) out.split = 2;
  if (/\bmy\s+(half|share|part|third|quarter)\b|\bi\s+pay\b|\bmine\s+is\b/.test(lower)) { out.isShare = true; if (!out.split) out.split = /third/.test(lower) ? 3 : /quarter/.test(lower) ? 4 : 2; }
  /* the amount: the first money-looking number not used as the split count */
  const nums = raw.replace(/,/g, '').match(/\d+(?:\.\d+)?\s*[kK]?/g) || [];
  const useful = nums.filter(n => !(out.split && parseInt(n, 10) === out.split && !/k/i.test(n) && parseInt(n, 10) < 10));
  if (!useful.length) return null;
  out.cents = moneyIn(useful[0]);
  if (out.cents === null) return null;
  if (!out.cadence) out.cadence = o.defaultCadence || ((o.kind === 'income' && out.cents >= 1000000) ? 'year' : 'month');
  if (out.isShare) { out.share = out.cents; out.full = out.split ? out.cents * out.split : null; }
  else if (out.split) { out.full = out.cents; out.share = Math.round(out.cents / out.split); }
  return out;
}

const PAYCHECKS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
/* To a month, the same arithmetic as units.cadenceToMonthly. */
export function toMonthly(cents, cadence, payFrequency) {
  switch (cadence) {
    case 'month': return cents;
    case 'week': return Math.round(cents * 52 / 12);
    case 'quarter': return Math.round(cents / 3);
    case 'year': return Math.round(cents / 12);
    case 'paycheck': return Math.round(cents * (PAYCHECKS[payFrequency || 'biweekly'] || 26) / 12);
    case 'oneoff': return 0;
    default: return cents;
  }
}

/* Share math both ways: give any two of full, share, split and get the third. */
export function shareMath(x) {
  const o = Object.assign({}, x);
  if (o.full !== null && o.full !== undefined && o.split) o.share = o.share === null || o.share === undefined ? Math.round(o.full / o.split) : o.share;
  if ((o.full === null || o.full === undefined) && o.share !== null && o.share !== undefined && o.split) o.full = o.share * o.split;
  if (!o.split && o.full && o.share) o.split = Math.round(o.full / o.share);
  o.myShare = o.full ? Math.round(o.share / o.full * 10000) / 10000 : (o.split ? Math.round(10000 / o.split) / 10000 : null);
  return o;
}

/* Gross and take-home cross-check: inferred take-home from gross versus what was said. Silent under 10% apart. */
export function crossCheck(saidMonthly, inferredMonthly, tolerance) {
  if (saidMonthly === null || inferredMonthly === null || !inferredMonthly) return { agree: true, gap: 0, pct: 0 };
  const pct = Math.abs(saidMonthly - inferredMonthly) / inferredMonthly;
  return { agree: pct <= (tolerance || 0.1), gap: saidMonthly - inferredMonthly, pct: Math.round(pct * 1000) / 1000 };
}

/* An age ("27"), a year ("1999") or a date, to an ISO birth date; the first of July for a year or an age. */
export function parseBirth(text, todayIso) {
  const t = String(text || '').trim(); const y = parseInt(todayIso.slice(0, 4), 10);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t); if (m) return { iso: m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'), state: 'known' };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); if (m) return { iso: m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'), state: 'known' };
  if (/^\d{4}$/.test(t) && +t > y - 120 && +t <= y) return { iso: t + '-07-01', state: 'rough' };
  if (/^\d{1,3}$/.test(t) && +t > 0 && +t < 120) return { iso: String(y - +t) + '-07-01', state: 'rough' };
  return null;
}
