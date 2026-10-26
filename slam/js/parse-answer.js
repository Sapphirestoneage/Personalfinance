// Reading one answer from the numbers spreadsheet (S-237). The sheet is written for people, so an answer is free text
// typed however a person would say it: "$2,000 left, $500 a month, 0%", "about 18k", "idk". This is the only place
// that text becomes values. It never guesses silently: what it assumed is a note, what it could not read keeps the
// original text and goes to review, and a blank or "don't know" is missing, never $0.
//
// parseAnswer(text, { expect, sure, today, spending, choices }) ->
//   { text, status: 'ok' | 'missing' | 'review', kind: 'known' | 'rough' | 'missing', facts, notes: [words], problems: [words] }
// expect: a field type (money, rate, date, int, bool, text, choice) or a kind of row (income, expenses, accounts, debts,
// goals, scenarios, contributions). facts holds what was read: value (a single field), amount, cadence, start, end,
// balance, payment, limit, rate, promoRate, promoEnds, lender, label, federal, state, contributions, scenarios,
// target, by. Money is in dollars, a rate a fraction (6% is 0.06), a date YYYY-MM-DD.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const monthOf = (w) => MONTHS.indexOf(w.toLowerCase().slice(0, 3)) + 1;
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);

// Words that mean "I do not know": missing, never zero.
export const UNKNOWN_RE = /^(?:-+|\?+|idk|i\s*don'?t\s*know|don'?t\s*know|dont\s*know|do\s*not\s*know|not\s*sure|unsure|unknown|n\/?a|tbd|tbc|no\s*idea|dunno|no\s*clue|\?\s*idk)$/i;
// Does not apply to me: kept as not for me (n/a reads missing: it may mean "not known").
export const NOT_FOR_ME_RE = /^(?:not\s*for\s*me|does\s*not\s*apply|doesn'?t\s*apply|not\s*applicable|not\s*mine)$/i;
// A real zero.
const ZERO_RE = /^(?:\$?\s*0+(?:\.0+)?(?:\s*dollars)?|none|nothing|zero|nada|\$0(?:\.00)?|no\s+\w+)$/i;
// Hedge words: the value is rough even if How sure says known.
const HEDGE_RE = /(?:^|[^\w])(about|around|roughly|approx(?:\.|imately)?|maybe|probably|ish|or\s+so|give\s+or\s+take|estimated?|guess(?:ing)?|ballpark|something\s+like|close\s+to|almost|nearly|~)(?=$|[^\w])|~|\?\s*$/i;

// How sure? in words to a kind. Blank is null (worked out from the answer).
export function readSure(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/[.!]+$/, '');
  if (!t) return null;
  if (/^(i\s*)?(don'?t|do\s*not)\s*know|^unknown|^no\s*idea|^missing|^not\s*known|^idk/.test(t)) return 'missing';
  if (/^worked\s*out|^computed|^calculated/.test(t)) return 'computed';
  if (/rough|estimate|guess|not\s*sure|ballpark|approx|about|unsure|kind\s*of|somewhat|maybe/.test(t)) return 'rough';
  if (/know|sure|certain|exact|confirmed|known|yes|checked|statement|100/.test(t)) return 'known';
  return undefined; // words this does not know: review
}

// ---------------------------------------------------------------- cadence
const CADENCE_RULES = [
  ['biweekly', /\b(bi-?weekly|every\s+(?:2|two|other)\s+weeks?|every\s+other\s+week|fortnight(?:ly)?|(?:a|per|\/|each)\s*2\s*(?:weeks?|wks?))\b/i],
  ['paycheck', /\b(?:per|a|each|every|\/)\s*(?:pay\s*check|paycheque|check|pay\s*period)\b/i],
  ['semimonthly', /\b(semi-?monthly|twice\s+a\s+month|(?:1st|first)\s+and\s+(?:15th|fifteenth))\b/i],
  ['weekly', /(?:\b(?:a|per|each|every)\s*week\b|\bweekly\b|\/\s*(?:wk|week)\b|\bper\s*wk\b|\ba\s*wk\b)/i],
  ['quarterly', /(?:\bquarterly\b|\b(?:a|per|each|every)\s*quarter\b|\/\s*(?:qtr|quarter)\b)/i],
  ['yearly', /(?:\b(?:a|per|each|every)\s*(?:year|yr)\b|\byearly\b|\bannual(?:ly)?\b|\bper\s*annum\b|\/\s*(?:yr|year|y)\b|\bpa\b)/i],
  ['monthly', /(?:\b(?:a|per|each|every)\s*(?:month|mo|mth)\b|\bmonthly\b|\/\s*(?:mo|month|mth|m)\b)/i],
  ['once', /\b(one[-\s]?time|once|lump\s*sum)\b/i]
];
function findCadence(s) {
  for (const [c, re] of CADENCE_RULES) { const m = re.exec(s); if (m) return { cadence: c, at: m.index, len: m[0].length }; }
  return null;
}

// ---------------------------------------------------------------- dates
// Two-digit years: up to ten years ahead of today are this century, the rest the last one (7/15/01 is 2001).
const fullYear = (y, todayYear) => (y >= 100 ? y : y + 2000 <= todayYear + 10 ? y + 2000 : y + 1900);
// end: a month with no day reads as its last day (until May 2027), else its first (starting Jan).
function monthDate(y, m, end) { return iso(y, m, end ? lastDay(y, m) : 1); }

// Every date in a clause: [{ at, len, value, precision: 'day' | 'month' | 'year', guessedYear, role, rangeEnd? }].
function findDates(s, today) {
  const ty = +today.slice(0, 4), tm = +today.slice(5, 7), td = +today.slice(8, 10);
  const out = [];
  const taken = (i, n) => out.some((x) => i < x.at + x.len && x.at < i + n);
  const add = (m, v) => { if (!taken(m.index, m[0].length)) out.push({ at: m.index, len: m[0].length, ...v }); };
  let m;
  // A month with no year: the next one from today (assumed, and said).
  const nextYear = (mo, d = 1) => (mo > tm || (mo === tm && d >= td) ? ty : ty + 1);
  // Ranges first: Jan-Jun, Jan to Jun 2026, Jan 2026 - Mar 2027.
  const range = new RegExp('\\b' + MONTH_RE + '(?:\\s*(\\d{4}))?\\s*(?:-|–|to|through|thru|until)\\s*' + MONTH_RE + '(?:\\s*(\\d{4}))?\\b', 'gi');
  while ((m = range.exec(s))) {
    const m1 = monthOf(m[1]), m2 = monthOf(m[3]);
    let y2 = m[4] ? +m[4] : null, y1 = m[2] ? +m[2] : null;
    const guessed = !y1 && !y2;
    if (!y2) y2 = y1 ? (m2 >= m1 ? y1 : y1 + 1) : ty;
    if (!y1) y1 = m1 <= m2 ? y2 : y2 - 1;
    add(m, { value: monthDate(y1, m1, false), rangeEnd: monthDate(y2, m2, true), precision: 'month', guessedYear: guessed, role: 'range' });
  }
  const re = [
    // 2027-05-31
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (x) => ({ y: +x[1], mo: +x[2], d: +x[3] })],
    // 7/15/01, 07/15/2001
    [/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/g, (x) => ({ y: fullYear(+x[3], ty), mo: +x[1], d: +x[2] })],
    // July 15, 2001; Jul 15 2001; July 15th
    [new RegExp('\\b' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}|\'\\d{2}))?\\b', 'gi'), (x) => ({ y: x[3] ? fullYear(+x[3].replace("'", ''), ty) : null, mo: monthOf(x[1]), d: +x[2] })],
    // 15 July 2001
    [new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RE + ',?\\s*(\\d{4})\\b', 'gi'), (x) => ({ y: +x[3], mo: monthOf(x[2]), d: +x[1] })],
    // Jan 2027, January '27
    [new RegExp('\\b' + MONTH_RE + ',?\\s*(\\d{4}|\'\\d{2})\\b', 'gi'), (x) => ({ y: fullYear(+x[2].replace("'", ''), ty), mo: monthOf(x[1]), d: null })],
    // 5/2027
    [/\b(\d{1,2})\/(\d{4})\b/g, (x) => ({ y: +x[2], mo: +x[1], d: null })],
    // May (no year): only when a date word says it is one, or it stands alone (APR is a rate, "may" a word).
    [new RegExp('(?:\\b(until|till|til|through|thru|ending|ends?|by|starting|starts?|from|since|beginning|begins|in|after|before|on)\\s+)' + MONTH_RE + '(?![\\w])', 'gi'), (x) => ({ y: null, mo: monthOf(x[2]), d: null, word: x[1] })],
    [new RegExp('^\\s*' + MONTH_RE + '\\s*$', 'gi'), (x) => ({ y: null, mo: monthOf(x[1]), d: null })],
    // by 2030, in 2030
    [/\b(?:by|in|until|till|through|thru|starting|from|since)\s+(\d{4})\b/g, (x) => ({ y: +x[1], mo: null, d: null })]
  ];
  for (const [r, f] of re) {
    r.lastIndex = 0;
    while ((m = r.exec(s))) {
      const p = f(m);
      if (p.mo !== null && (p.mo < 1 || p.mo > 12)) continue;
      const before = s.slice(0, m.index).toLowerCase();
      const word = (p.word || '').toLowerCase() || (/(until|till|til|through|thru|ending|ends?|by|before)\s*$/.exec(before) || [])[1] || (/(starting|starts?|from|since|beginning|begins|after|as of|on)\s*$/.exec(before) || [])[1] || '';
      const end = /until|till|til|through|thru|ending|end|by|before/.test(word);
      const start = /starting|start|from|since|beginning|begin|after|^on$/.test(word);
      let { y } = p;
      const guessedYear = y === null;
      if (p.mo === null) { add(m, { value: iso(y, 12, 31), precision: 'year', guessedYear: false, role: end ? 'end' : start ? 'start' : 'date', yearOnly: true }); continue; }
      if (y === null) y = nextYear(p.mo, p.d || (end ? 31 : 1));
      if (p.d !== null && !validDay(y, p.mo, p.d)) continue;
      add(m, { value: p.d !== null ? iso(y, p.mo, p.d) : monthDate(y, p.mo, end), precision: p.d !== null ? 'day' : 'month', guessedYear, role: end ? 'end' : start ? 'start' : 'date' });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- rates
function findRates(s) {
  const out = [];
  let m;
  const add = (m, value, extra = {}) => { if (!out.some((x) => m.index < x.at + x.len && x.at < m.index + m[0].length)) out.push({ at: m.index, len: m[0].length, value, ...extra }); };
  const pct = /(-?\d+(?:\.\d+)?|-?\.\d+)\s*(%|percent\b|pct\b|per\s*cent\b)(\s*(?:apr|apy|interest|rate))?/gi;
  while ((m = pct.exec(s))) add(m, +m[1] / 100);
  const apr = /(?:\b(-?\d+(?:\.\d+)?)\s*(apr|apy)\b|\b(apr|apy)\s*(?:of|is|:)?\s*(-?\d+(?:\.\d+)?)\b)/gi;
  while ((m = apr.exec(s))) add(m, +(m[1] ?? m[4]) / 100);
  const none = /\b(no\s+interest|interest[-\s]free|zero\s+(?:percent|interest)|0\s*interest)\b/gi;
  while ((m = none.exec(s))) add(m, 0);
  return out.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- money
const MULT = { k: 1e3, thousand: 1e3, grand: 1e3, m: 1e6, mm: 1e6, mil: 1e6, million: 1e6 };
function findMoney(s) {
  const out = [];
  const re = /(\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)\s*(k|thousand|grand|mm|mil|million|m)?(?![\w%])/gi;
  let m;
  while ((m = re.exec(s))) {
    const from = m.index + m[0].search(/[$\d.]/);
    const before = s.slice(Math.max(0, from - 1), from);
    if (/[\w.]/.test(before)) continue;
    const n = +m[2].replace(/,/g, '');
    if (!Number.isFinite(n)) continue;
    const unit = (m[3] || '').toLowerCase();
    const neg = /[-\u2212]\s*\$?\s*$/.test(s.slice(Math.max(0, from - 3), from)) && !/\w[-\u2212]\s*$/.test(s.slice(Math.max(0, from - 3), from));
    // "1m" alone reads as a million only with a $ or a word around money; "1 m" as months is not money.
    out.push({ at: m.index, len: m[0].length, value: (neg ? -1 : 1) * Math.round(n * (MULT[unit] || 1) * 100) / 100, dollar: !!m[1] });
  }
  const grand = /\b(?:a|one)\s+grand\b/gi;
  while ((m = grand.exec(s))) out.push({ at: m.index, len: m[0].length, value: 1000, dollar: true });
  const half = /\bhalf\s+a\s+grand\b/gi;
  while ((m = half.exec(s))) out.push({ at: m.index, len: m[0].length, value: 500, dollar: true });
  return out.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- clauses
// Split on commas, semicolons, " and " and new lines, but never inside $1,000 or "July 15, 2001".
function clauses(s) {
  return s.split(/\s*(?:;|\n|,(?!\d{3}\b)(?!\s*\d{4}\b)|\s+(?:and|plus|&)\s+(?=[$~\d]|about|around|roughly|no\b|\w+\s*[:$]))\s*/i).map((x) => x.trim()).filter(Boolean);
}
const blank = (s, at, len) => s.slice(0, at) + ' '.repeat(len) + s.slice(at + len);

const ROLE_WORDS = {
  balance: /\b(left|owe[ds]?|owing|balance|bal|remaining|still|outstanding|due|principal|total)\b/i,
  limit: /\b(limit|credit\s*line|line\s*of\s*credit|max(?:imum)?\s*credit|cl)\b/i,
  payment: /\b(payment|pay(?:ing)?|pmt|min(?:imum)?|installment)\b/i
};
const MONEY_KINDS = ['money', 'expenses', 'income', 'debts', 'accounts', 'goals'];

// The plain reading of a parse, for the preview: "$1,000 per month, known".
const CAD_WORDS = { weekly: 'per week', biweekly: 'every 2 weeks', semimonthly: 'twice a month', monthly: 'per month', quarterly: 'per quarter', yearly: 'per year', once: 'one time', total: 'in total' };
export const dollars = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
export const percent = (r) => +(r * 100).toFixed(4) + '%';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateWords = (d, precision = 'day') => (precision === 'year' ? d.slice(0, 4) : precision === 'month' ? MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : MON[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10) + ', ' + d.slice(0, 4));
export { CAD_WORDS };

const PART_WORDS = { amount: 'the amount', balance: 'the balance', payment: 'the payment', limit: 'the limit', rate: 'the rate', promoRate: 'the intro rate', promoEnds: 'the intro end', federal: 'federal withheld', state: 'state withheld', target: 'the target', monthly: 'the monthly amount', annualSpending: 'spending a year', start: 'the start', end: 'the end', by: 'the date', payoffDate: 'the payoff date', contributions: 'the yearly amounts' };
export function readingWords(r) {
  if (r.status === 'missing') return 'missing (not known yet)';
  if (r.status === 'notForMe') return 'not for me';
  if (r.status === 'review' && !Object.keys(r.facts).length) return 'nothing I could read';
  const f = r.facts, p = r.precision || {};
  const bits = [];
  const amt = (n, cad) => dollars(n) + (cad ? ' ' + CAD_WORDS[cad] : '');
  if (f.lender) bits.push(f.lender);
  if (f.label) bits.push(f.label);
  if ('value' in f) bits.push(r.shown || valueWords(f.value, r.type, p.value));
  if (f.amount !== undefined) bits.push(amt(f.amount, f.cadence));
  if (f.balance !== undefined) bits.push(dollars(f.balance) + ' balance');
  if (f.payment !== undefined) bits.push(amt(f.payment, f.paymentCadence || 'monthly') + ' payment');
  if (f.limit !== undefined) bits.push(dollars(f.limit) + ' limit');
  if (f.monthly !== undefined) bits.push(dollars(f.monthly) + ' a month in');
  if (f.rate !== undefined) bits.push(percent(f.rate) + (r.type === 'accounts' ? ' a year' : ' interest'));
  if (f.promoRate !== undefined) bits.push(percent(f.promoRate) + ' intro rate');
  if (f.promoEnds) bits.push('intro ends ' + dateWords(f.promoEnds, p.promoEnds));
  if (f.federal !== undefined) bits.push(dollars(f.federal) + ' federal tax withheld');
  if (f.state !== undefined) bits.push(dollars(f.state) + ' state tax withheld');
  if (f.target !== undefined) bits.push(dollars(f.target) + ' target');
  if (f.annualSpending !== undefined) bits.push(dollars(f.annualSpending) + ' a year of spending');
  if (f.payoffDate) bits.push('paid off by ' + dateWords(f.payoffDate, p.payoffDate));
  if (f.by) bits.push('by ' + dateWords(f.by, p.by));
  if (f.start) bits.push('from ' + dateWords(f.start, p.start));
  if (f.end) bits.push('until ' + dateWords(f.end, p.end));
  if (f.contributions) bits.push(f.contributions.map((c) => c.year + ': ' + dollars(c.amount)).join(', ') + ' put in');
  if (f.scenarios) bits.push(['best', 'likely', 'worst'].map((k) => k + ' ' + percent(f.scenarios[k])).join(', '));
  const roughParts = Object.keys(r.kinds || {}).filter((k) => r.kinds[k] === 'rough' && r.kind !== 'rough');
  return bits.join(', ') + (r.kind ? ', ' + r.kind : '') + (roughParts.length ? ' (rough: ' + roughParts.map((k) => PART_WORDS[k] || k).join(', ') + ')' : '');
}
function valueWords(v, type, precision) {
  if (v === null) return 'missing';
  if (type === 'money') return dollars(v);
  if (type === 'rate') return percent(v);
  if (type === 'date') return dateWords(v, precision);
  if (type === 'bool') return v ? 'yes' : 'no';
  return String(v);
}

// ---------------------------------------------------------------- the parser
export function parseAnswer(raw, { expect = 'text', sure = '', today = new Date().toISOString().slice(0, 10), spending = false, choices = null } = {}) {
  const text = raw === null || raw === undefined ? '' : String(raw);
  const s = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ').trim();
  const type = expect.startsWith('choice') ? 'choice' : expect;
  // kinds: a fact read in a hedged part of the answer ("about $3k left") is rough whatever the rest is.
  const out = { text, type, status: 'ok', kind: null, facts: {}, kinds: {}, precision: {}, notes: [], problems: [] };
  const sureKind = readSure(sure);
  if (sureKind === undefined) out.problems.push('How sure? says "' + String(sure).trim() + '", which I do not know');

  // Blank or "don't know": missing, never zero.
  const bare = s.replace(/[.!]+$/, '').trim();
  if (!bare || UNKNOWN_RE.test(bare)) {
    out.status = out.problems.length ? 'review' : 'missing'; out.kind = 'missing';
    out.blank = !bare;
    return finish(out);
  }
  if (NOT_FOR_ME_RE.test(bare)) { out.status = 'notForMe'; out.kind = 'notForMe'; return finish(out); }
  const hedged = HEDGE_RE.test(s);
  const isZero = MONEY_KINDS.includes(type) && ZERO_RE.test(bare) && !/^no\s+(?:interest)/i.test(bare);

  if (type === 'text') { out.facts.value = s; }
  else if (type === 'bool') {
    if (/^(y|yes|yeah|yep|true|i\s+do|correct|1)\b/i.test(bare)) out.facts.value = true;
    else if (/^(n|no|nope|false|i\s+don'?t|not|0)\b/i.test(bare)) out.facts.value = false;
    else out.problems.push('Not a yes or no');
  } else if (type === 'choice') {
    const hit = pickChoice(bare, choices || {});
    if (hit) { out.facts.value = hit; out.shown = (choices[hit] || [])[0] || hit; } else out.problems.push('Not one of the choices (' + Object.keys(choices || {}).join(', ') + ')');
  } else if (type === 'int') {
    const n = /(-?\d+)/.exec(bare.replace(/,/g, ''));
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, 'just me': 1 };
    const w = /^(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(bare) || (/^just\s+me$/i.test(bare) ? ['', 'just me'] : null);
    if (n) { out.facts.value = +n[1]; if (/\d+\.\d/.test(bare)) out.notes.push('rounded to a whole number'); }
    else if (w) out.facts.value = words[w[1].toLowerCase()];
    else out.problems.push('No number in it');
    if (n && bare.replace(n[0], '').replace(/\b(people|persons?|hours?|hrs?|a\s+week|per\s+week|weekly|\/\s*wk|years?(\s+old)?|kids?|adults?|of\s+us|total|roughly|about|around|~)\b/gi, '').replace(/[\s.~]/g, '')) out.problems.push('Words I could not read: "' + bare + '"');
  } else if (type === 'date') {
    const ds = findDates(s, today);
    if (ds.length === 1 && ds[0].role !== 'range') {
      const d = ds[0];
      out.facts.value = d.value; out.precision.value = d.precision;
      if (d.precision !== 'day') out.notes.push('no day given: read as ' + dateWords(d.value));
      if (d.guessedYear) out.notes.push('no year given: read as the next ' + MON[+d.value.slice(5, 7) - 1] + ', ' + d.value.slice(0, 4));
      leftovers(blank(s, d.at, d.len), out, /\b(on|in|by|born|until|starting|from|around|about|roughly|approx\w*|maybe|probably)\b/gi);
    } else out.problems.push(ds.length ? 'More than one date in it' : 'No date I could read');
  } else if (type === 'rate') {
    readRate(s, out);
  } else if (type === 'money') {
    if (isZero) out.facts.value = 0;
    else {
      const ms = findMoney(s);
      if (ms.length === 1) { out.facts.value = ms[0].value; const c = findCadence(s); if (c) out.problems.push('It says ' + CAD_WORDS[c.cadence === 'paycheck' ? 'biweekly' : c.cadence] + '; this question wants one amount'); leftovers(blank(s, ms[0].at, ms[0].len), out); }
      else out.problems.push(ms.length ? 'More than one amount in it' : 'No amount I could read');
    }
  } else if (type === 'scenarios') {
    const rs = findRates(s);
    const bare3 = rs.length === 3 ? rs : (/^\s*(\.?\d+(?:\.\d+)?)\s*\/\s*(\.?\d+(?:\.\d+)?)\s*\/\s*(\.?\d+(?:\.\d+)?)\s*$/.exec(s) || []).slice(1).map((x) => ({ value: +x < 1 ? +x : +x / 100 }));
    if (bare3.length === 3) { const [best, likely, worst] = bare3.map((x) => x.value); out.facts.scenarios = { best, likely, worst }; if (!(best >= likely && likely >= worst)) out.notes.push('read in the order best, likely, worst'); }
    else out.problems.push('Expected three rates: best / likely / worst');
  } else if (type === 'contributions') {
    readContributions(s, out);
    if (!out.facts.contributions) out.problems.push('Expected years and amounts, like "2024: 6k, 2025: 7k"');
  } else readRow(s, type, out, { today, spending, isZero });

  const row = ['income', 'expenses', 'accounts', 'debts', 'goals'].includes(type);
  // Every fact hedged is the whole answer hedged.
  const factKeys = Object.keys(out.facts).filter((k) => !/cadence$/i.test(k) && !['lender', 'label'].includes(k));
  if (row && factKeys.length && factKeys.every((k) => out.kinds[k] === 'rough')) out.kinds = {};
  const partHedged = row && Object.keys(out.kinds).length > 0;
  out.kind = sureKind === 'missing' ? 'missing' : sureKind || (hedged && !partHedged ? 'rough' : 'known');
  if (hedged && sureKind === 'known' && !partHedged) { out.kind = 'rough'; out.notes.push('marked rough: the answer says "' + (HEDGE_RE.exec(s)[1] || '~').trim() + '"'); }
  // How sure says "don't know" but there is an answer: not dropped, not used silently.
  if (sureKind === 'missing' && Object.keys(out.facts).length) { out.kind = 'rough'; out.problems.push('How sure? says not known, but there is an answer'); }
  return finish(out);
}
function finish(out) {
  if (out.problems.length) out.status = 'review';
  out.reading = readingWords(out);
  return out;
}

function pickChoice(t, choices) {
  const n = t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  let best = null, len = 0;
  for (const [value, words] of Object.entries(choices)) for (const w of [value, ...words]) {
    const ww = w.toLowerCase();
    if ((n === ww || new RegExp('(^| )' + ww.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(n)) && ww.length > len) { best = value; len = ww.length; }
  }
  return best;
}

function readRate(s, out) {
  const rs = findRates(s);
  if (rs.length === 1) { out.facts.value = rs[0].value; leftovers(blank(s, rs[0].at, rs[0].len), out, /\b(a\s+year|per\s+year|yearly|annual(ly)?|real|after\s+inflation|interest|apr|apy|rate|about|around|roughly|~)\b/gi); return; }
  if (rs.length > 1) { out.problems.push('More than one rate in it'); return; }
  const m = /^\s*~?\s*(-?\d*\.?\d+)\s*$/.exec(s.replace(/\b(about|around|roughly)\b/gi, ''));
  if (m) {
    const n = +m[1];
    if (Math.abs(n) < 1 && /\./.test(m[1])) out.facts.value = n;
    else { out.facts.value = n / 100; if (n !== 0) out.notes.push('read ' + m[1] + ' as ' + n + '%'); }
    return;
  }
  out.problems.push('No rate I could read');
}

function readContributions(s, out) {
  const re = /\b((?:19|20)\d{2})\s*[:=-]?\s*(\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:k|grand|thousand)?)/gi;
  const list = [];
  let m, rest = s;
  while ((m = re.exec(s))) {
    const money = findMoney(m[2]);
    if (!money.length) continue;
    list.push({ year: +m[1], amount: money[0].value });
    rest = rest.replace(m[0], ' ');
  }
  if (list.length) { out.facts.contributions = list; return rest; }
  return s;
}

// What is left of a clause after the values were taken: words that carry nothing are fine; anything else is review.
const FILLER = /\b(a|an|the|of|on|at|in|is|it|my|i|per|each|every|about|around|roughly|approx\w*|maybe|probably|ish|or\s+so|left|owe[ds]?|owing|balance|remaining|still|limit|payment|pay|paying|min(imum)?|monthly|month|mo|week|weekly|year|yearly|annual(ly)?|interest|apr|apy|rate|intro|promo(tional)?|until|till|through|thru|starting|from|since|by|ending|ends?|due|total|now|currently|approx|usd|dollars?|bucks|in\s+it|saved|have|has|federal|fed|state|withheld|withholding|tax(es)?|gross|net|take[-\s]?home|salary|wages?|income|target|goal|put|contributed|contribution|towards?|for|plus|and|to|with|around|ish|just|only|than|over|under|less|more|bal|cl|line|card|currently|right|so|far|paid|off|ny|nys|nyc|nj|ca|ct|pa|il|ga|va|nc|mn|md|az|oh|sit|fit)\b/gi;
function leftovers(rest, out, extra = null) {
  let r = rest;
  if (extra) r = r.replace(extra, ' ');
  r = r.replace(FILLER, ' ').replace(/[~$:;,.()/\-–+&%?!'"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (r && /\d/.test(r)) out.problems.push('Part I could not read: "' + r + '"');
  else if (r) out.unread = (out.unread ? out.unread + ' ' : '') + r;
  return r;
}

// A whole row: a bill, a paycheck, an account, a debt or a goal, several facts in one answer.
function readRow(s, type, out, { today, spending, isZero }) {
  const F = out.facts, P = out.precision;
  let body = s;
  // "Deloitte Jan-Jun: $56,500 pay, ..." and "Capital One: ..." : the words before a colon name the thing.
  const colon = /^([^:$\d][^:]*?):\s*(.+)$/s.exec(body);
  if (colon && !/^\d{4}$/.test(colon[1].trim())) {
    let head = colon[1];
    const hd = findDates(head, today);
    for (const d of hd.reverse()) { takeDate(d, type, F, P, out); head = blank(head, d.at, d.len); }
    head = head.replace(/\s+/g, ' ').trim();
    if (head) F[type === 'debts' ? 'lender' : 'label'] = head;
    body = colon[2];
  }
  if (isZero) { F[type === 'debts' || type === 'accounts' ? 'balance' : type === 'goals' ? 'target' : 'amount'] = 0; return; }
  if (type === 'accounts') { const left = readContributions(body, out); if (out.facts.contributions) body = left; }
  const parts = clauses(body);
  let firstNumber = true;
  parts.forEach((c, i) => {
    let rest = c;
    const lower = c.toLowerCase();
    const before = new Set(Object.keys(F));
    // Dates and rates first, so a year or a percent is never read as money.
    const ds = findDates(rest, today);
    for (const d of [...ds].reverse()) rest = blank(rest, d.at, d.len);
    const rs = findRates(rest);
    for (const r of [...rs].reverse()) rest = blank(rest, r.at, r.len);
    const promo = /\b(intro|promo(?:tional)?|teaser|0%\s*until|until|through|thru|till)\b/i.test(c) && rs.length > 0 && ds.some((d) => d.role === 'end');
    for (const r of rs) {
      if (type === 'debts' && promo) F.promoRate = r.value;
      else if (F.rate === undefined) F.rate = r.value;
      else out.problems.push('Two rates in it: "' + c + '"');
    }
    for (const d of ds) {
      if (type === 'debts' && promo && d.role === 'end') { F.promoEnds = d.value; P.promoEnds = d.precision; if (d.guessedYear) out.notes.push('intro end has no year: read as ' + dateWords(d.value, d.precision)); continue; }
      takeDate(d, type, F, P, out);
    }
    let cad = findCadence(rest);
    const tot = (type === 'income' || type === 'expenses') && !cad ? /\bin\s+total\b/i.exec(rest) : null;
    if (tot) cad = { cadence: 'total', at: tot.index, len: tot[0].length };
    if (cad) rest = blank(rest, cad.at, cad.len);
    const ms = findMoney(rest);
    for (const m of [...ms].reverse()) rest = blank(rest, m.at, m.len);
    const cadence = cad ? (cad.cadence === 'paycheck' ? 'biweekly' : cad.cadence) : null;
    if (cad && cad.cadence === 'paycheck') out.notes.push('read "per paycheck" as every 2 weeks');
    for (const m of ms) {
      const role = roleOf(lower, type, cadence, F);
      if (role === null) { out.problems.push('Two amounts and I could not tell which is which: "' + c + '"'); continue; }
      F[role] = m.value;
      if ((role === 'amount' || role === 'payment' || role === 'monthly') && cadence) F[role === 'amount' ? 'cadence' : role + 'Cadence'] = cadence;
      if (role === 'amount' && !cadence) F.cadence = null;
      firstNumber = false;
    }
    if (!ms.length && cad && (type === 'income' || type === 'expenses') && F.amount !== undefined && !F.cadence) F.cadence = cadence;
    if (HEDGE_RE.test(c)) for (const k of Object.keys(F)) if (!before.has(k) && !/cadence$/i.test(k)) out.kinds[k] = 'rough';
    // A clause with no number: a lender's or an account's name (the first one only), or words to keep.
    const left = leftovers(rest, { problems: out.problems });
    if (!ms.length && !rs.length && !ds.length && !cad && i === 0 && left && type === 'debts' && !F.lender) { F.lender = c.trim(); delete out.unread; }
    else if (left && !/\d/.test(left)) out.unread = (out.unread ? out.unread + '; ' : '') + c.trim();
  });
  void firstNumber;
  // How often: a bill or a paycheck with no "how often" reads as a month for spending, and is said; else it is asked.
  if ((type === 'expenses' || type === 'income') && F.amount !== undefined) {
    if (!F.cadence) {
      if (F.start && F.end && type === 'income') { F.cadence = 'total'; out.notes.push('no "how often" given: read as the total from ' + dateWords(F.start, P.start) + ' to ' + dateWords(F.end, P.end)); }
      else if (spending || type === 'expenses') { F.cadence = 'monthly'; out.notes.push('no "how often" given: read as per month'); }
      else out.problems.push('How often is it paid? (a month, a year, every 2 weeks...)');
    }
  }
  if (type === 'debts' && F.payment !== undefined && F.paymentCadence && F.paymentCadence !== 'monthly') out.problems.push('A debt payment is kept per month; this one says ' + CAD_WORDS[F.paymentCadence]);
  if (type === 'debts' && F.rate !== undefined && F.promoRate === undefined && F.rate === 0 && F.promoEnds) { F.promoRate = 0; delete F.rate; }
  const got = ['amount', 'balance', 'payment', 'limit', 'target', 'annualSpending', 'payoffDate', 'promoEnds', 'end', 'start', 'rate', 'promoRate', 'contributions', 'monthly', 'federal', 'state'].some((k) => F[k] !== undefined);
  if (!got && !out.problems.length) out.problems.push('No amount I could read');
}

function takeDate(d, type, F, P, out) {
  const put = (k, v, p) => { if (F[k] !== undefined && F[k] !== v) { out.problems.push('Two dates for the same thing'); return; } F[k] = v; P[k] = p; };
  if (d.role === 'range') { put('start', d.value, 'month'); put('end', d.rangeEnd, 'month'); if (d.guessedYear) out.notes.push('no year given: read as ' + d.value.slice(0, 4)); return; }
  if (d.guessedYear) out.notes.push('no year given: read as the next ' + dateWords(d.value, 'month'));
  if (type === 'goals') { put('by', d.value, d.precision); return; }
  if (d.role === 'end') put(type === 'debts' ? 'payoffDate' : 'end', d.value, d.precision);
  else if (d.role === 'start') put('start', d.value, d.precision);
  else if (type === 'debts') put('payoffDate', d.value, d.precision);
  else out.problems.push('A date with no "from" or "until": ' + dateWords(d.value, d.precision));
}

// Which fact a dollar amount is, from the words around it in its clause.
function roleOf(c, type, cadence, F) {
  const free = (k) => F[k] === undefined;
  if (type === 'debts') {
    if (ROLE_WORDS.limit.test(c)) return free('limit') ? 'limit' : null;
    if (cadence || ROLE_WORDS.payment.test(c) && !ROLE_WORDS.balance.test(c)) return free('payment') ? 'payment' : null;
    if (ROLE_WORDS.balance.test(c) || free('balance')) return free('balance') ? 'balance' : null;
    return null;
  }
  if (type === 'income') {
    if (/\bfed(eral)?\b|\bfit\b/i.test(c)) return free('federal') ? 'federal' : null;
    if (/\bstate\b|\b(ny|nys|nj|ca|ct|pa|il|ga|va|nc|mn|md|az|oh|sit|nyc)\b/i.test(c) && !/\bpay\b/i.test(c)) return free('state') ? 'state' : null;
    return free('amount') ? 'amount' : null;
  }
  if (type === 'accounts') {
    if (cadence) return free('monthly') ? 'monthly' : null;
    return free('balance') ? 'balance' : null;
  }
  if (type === 'goals') return cadence === 'yearly' ? (free('annualSpending') ? 'annualSpending' : null) : free('target') ? 'target' : null;
  return free('amount') ? 'amount' : null;
}

// Every example the Key may show, kept with the parser so the Key never promises a format it cannot read.
export { findDates, findRates, findMoney, findCadence, clauses };
