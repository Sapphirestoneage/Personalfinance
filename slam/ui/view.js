// Display helpers shared by the Ledger and Dashboard. Formatting only; every
// number arrives already computed by the engines.

import { money as dollars, pct } from '../src/ui/format.js';
import { hoursOf, fiDaysOf } from '../engine/money-as.js';
import { FILING_STATUSES, LOAN_PLAN_WORDS, PAY_POLICIES, PERSON_PURPOSES, PERSON_PURPOSE_WORDS, ALLOWANCE_MODES } from '../engine/schema.js';

export { pct };

// How this browser shows money and dates (Preferences): the shell sets it on every page from the choices kept here
// and the household's real hourly wage and saving pace. Dollars always lead; hours of work or days of FI follow in
// a short tag, and only when the number they need is known. Exact amounts (cents, Show the math) stay dollars alone.
let display = { moneyAs: 'dollars', wage: null, perDay: null, dateStyle: 'words', round: 1 };
export const setDisplay = (d) => { display = { ...display, ...d }; };
export function money(x, exact = false) {
  const base = dollars(x, exact);
  if (exact || x === null || x === undefined || Number.isNaN(x) || Math.abs(x) < 1 || display.moneyAs === 'dollars') return base;
  if (display.moneyAs === 'hours') { const n = hoursOf(Math.abs(x), display.wage); return n === null ? base : base + ' (' + n + ' h of work)'; }
  // Money as time (S-286): "$14 = 3 days of freedom", one day of FI later for one day of what is saved now.
  if (display.moneyAs === 'fiDays') { const n = fiDaysOf(Math.abs(x), display.perDay); return n === null ? base : base + ' = ' + n + (n === 1 ? ' day' : ' days') + ' of freedom'; }
  return base;
}
// A summary number (Today's tiles, My numbers' totals): rounded to the dollar, $10 or $100 as picked.
export const summaryMoney = (x) => (x === null || x === undefined || display.round <= 1 ? money(x) : money(Math.round(x / display.round) * display.round));

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Today in the browser's own time zone, as YYYY-MM-DD.
export const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const shortDate = (iso) => {
  if (!iso) return '';
  if (display.dateStyle === 'iso') return iso.slice(0, 10);
  if (display.dateStyle === 'us') return +iso.slice(5, 7) + '/' + +iso.slice(8, 10) + '/' + iso.slice(0, 4);
  // Easy to hold (S-283): a date this year reads "Dec 6"; another year keeps its year.
  return MONTHS[+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8, 10) + (iso.slice(0, 4) === String(new Date().getFullYear()) ? '' : ', ' + iso.slice(0, 4));
};
// Where a ranked next step opens: its Plan screen, else the number it needs.
export const stepHref = (step) => (step && step.href ? step.href : step && step.rung ? 'plan.html#/' + step.rung.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) : step && step.path ? ledgerHref(step.path) : 'plan.html');
export const monthWords = (ym) => MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
export const words = (s) => String(s).replace(/_/g, ' ');
export const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export const ROLE_WORDS = { spending: 'Spending money', emergency: 'Emergency cushion', sinking: 'Set aside for a goal', holding: 'Holding' };
// How a card is paid (S-189), in words.
export const PAY_POLICY_WORDS = { minimum: 'New charges plus the minimum on what I carry', statement: 'The full statement balance' };

// A stored value, worded by its field type.
const FILING_WORDS = { single: 'Single', mfj: 'Married filing jointly', mfs: 'Married filing separately', hoh: 'Head of household' };
export function showValue(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'last4') return '\u2022\u2022' + value;
  // An expense: how much, how often, and who pays (S-175, S-176).
  if (type === 'expense') {
    const how = { weekly: 'a week', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year', once: 'once', total: 'in total' }[value.cadence] || '';
    const base = value.amount === null ? 'amount not given' : money(value.amount, !Number.isInteger(value.amount)) + ' ' + how;
    const sub = (value.subscription ? ' · subscription' : '') + (value.paysDebt ? ' · pays ' + value.paysDebt + ', counted once under debt payments' : '');
    if (value.covered) return base + ', covered by ' + (value.coveredBy || 'someone else') + ' ($0 to you)' + sub;
    if (value.shared) return base + ', shared by ' + (value.people || '?') + (value.yourMonthly !== null ? ': you pay ' + money(value.yourMonthly) + ' a month' : '') + sub;
    return base + sub;
  }
  // An income stream: how much, how often, since when, until when, and the day paid (S-199).
  if (type === 'income') {
    const how = { weekly: 'a week', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year', once: 'once', total: 'in total' }[value.cadence] || '';
    const base = value.amount === null ? 'amount not given' : money(value.amount, !Number.isInteger(value.amount)) + ' ' + how;
    const when = value.cadence === 'once' ? (value.start ? ' on ' + shortDate(value.start) : '')
      : (value.start ? (value.cadence === 'total' ? ' from ' : ', since ') + shortDate(value.start) : '') + (value.end ? (value.cadence === 'total' ? ' to ' : ', until ') + shortDate(value.end) : '');
    const day = value.payDay && !['weekly', 'biweekly', 'once', 'total'].includes(value.cadence) ? ', paid on the ' + ordinal(value.payDay) + (value.payDay2 && value.cadence === 'semimonthly' ? ' and the ' + ordinal(value.payDay2) : '') : '';
    return base + when + day;
  }
  // A card's interest rate: "24%" or "0% until March 31, 2027, then 24%".
  if (type === 'cardRate') {
    const after = value.apr === null ? 'not given' : showValue(value.apr, 'rate');
    if (!value.intro) return after;
    return (value.intro.rate === null ? 'intro rate not given' : showValue(value.intro.rate, 'rate')) + ' until ' + (value.intro.ends ? shortDate(value.intro.ends) : '(end date not given)') + (value.intro.deferred === true ? ' (deferred interest)' : value.intro.deferred === null || value.intro.deferred === undefined ? ' (deferred interest: not sure)' : '') + ', then ' + after;
  }
  if (type === 'money') return money(value, !Number.isInteger(value));
  // Whole percents plain, others to two places without a trailing zero (3.5%, 24.99%).
  if (type === 'rate') { const p = Math.abs(value * 100 - Math.round(value * 100)) > 1e-9; return p ? pct(value, 2).replace(/(\.\d)0%$/, '$1%') : pct(value, 0); }
  if (type === 'bool') return value ? 'Yes' : 'No';
  if (type === 'date') return shortDate(value);
  // Match tiers (S-266): "100% of the first 3%, then 50% of the next 2%".
  if (type === 'tiers') return value.length ? value.map((t, i) => showValue(t.rate, 'rate') + ' of the ' + (i ? 'next ' : 'first ') + showValue(t.upTo, 'rate')).join(', then ') + ' of pay' : 'none';
  if (type === 'list') {
    if (!value.length) return 'none';
    // A contributions entry says what kind it was when it is not a plain contribution (S-211).
    const KIND = { rollover: ' (rollover, not counted)', conversion: ' (conversion, not counted)', from529: ' (from a 529)', employer: ' (employer part)' };
    return value.map((x) => (typeof x === 'object' ? (x.year ? x.year + ': ' : '') + money(x.amount, !Number.isInteger(x.amount)) + (x.taxable !== undefined && x.taxable !== x.amount ? ' (taxable ' + money(x.taxable, !Number.isInteger(x.taxable)) + ')' : '') + (KIND[x.kind] || '') : x)).join(', ');
  }
  if (type === 'choice:' + PAY_POLICIES.join('|')) return PAY_POLICY_WORDS[value] || words(value);
  // A cash account's role, in a client's words (S-228): a sinking fund is money set aside for a goal.
  if (type === 'choice:spending|emergency|sinking|holding') return ROLE_WORDS[value] || words(value);
  if (type === 'choice:individual|joint|tod|trust') return { individual: 'In your name only', joint: 'Joint', tod: 'Transfer or payable on death (TOD / POD)', trust: 'In a trust' }[value] || words(value);
  if (type === 'choice:' + PERSON_PURPOSES.join('|')) return PERSON_PURPOSE_WORDS[value] || words(value);
  if (type === 'choice:' + ALLOWANCE_MODES.join('|')) return value === 'time' ? 'Pay for my time' : 'A gift';
  if (type === 'choice:' + FILING_STATUSES.join('|')) return FILING_WORDS[value] || words(value);
  if (type === 'choice:oneAtATime|byDeadline') return value === 'byDeadline' ? 'By deadline' : 'One at a time';
  if (type.startsWith('choice:')) return words(value);
  if (type.startsWith('suggest:')) return LOAN_PLAN_WORDS[value] || String(value);
  return String(value);
}

// The kind chip: green known, yellow rough, red missing.
export const KIND_WORDS = { known: 'Known', rough: 'Rough', missing: 'Missing', computed: 'Worked out', notForMe: 'Not for me', incomplete: 'Incomplete' };
// Known and worked-out numbers wear no chip (bug sweep): only what needs a look (Rough, Missing, Incomplete) is marked.
// A screen that lists the kinds themselves (the Design kit, a filter) asks for the label with always.
export const chip = (kind, { always = false } = {}) => (!always && (kind === 'known' || kind === 'computed') ? null : h('span', { class: 'chip chip-' + kind }, KIND_WORDS[kind] || kind));

export const ledgerHref = (path) => 'ledger.html#' + encodeURIComponent(path);

// The words for a change, for the shell's change() and its bar (S-230): said.changed('Rent', '$1,000') is
// "Rent changed to $1,000"; a date in moved() reads as a day ("Rent moved to Nov 3, 2026").
const dayWords = (to) => (/^\d{4}-\d{2}-\d{2}$/.test(String(to)) ? shortDate(to) : to);
// A key number, tagged with its formula's id (engine/math.js) so tools/agree-check.mjs can find every place it shows
// and fail when two places disagree.
export const metric = (id, text) => h('span', { 'data-metric': id }, text);

export const said = {
  changed: (what, to) => what + ' changed to ' + to,
  added: (what) => what + ' added',
  deleted: (what) => what + ' deleted',
  moved: (what, to) => what + ' moved to ' + dayWords(to),
  happened: (what) => what + ' marked as happened'
};

// A keyboard shortcut's hint ("press /") shows only where there is a keyboard to press it on.
export const keyHint = (words) => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches ? ' (' + words + ')' : ''; } catch { return ''; } };

// A sentence ends once: "...(payroll)." never "...(payroll)..", and a question keeps its question mark.
export const sentence = (t) => (/[.!?]$/.test(String(t)) ? String(t) : t + '.');

// A rule's words without its id, for client screens (Show the math, S-230): "Catch-up at age 50 (rule K401_CU50)"
// reads "Catch-up at age 50"; the ids and their links live on the Builder's All formulas and Rules pages.
export const plainLabel = (s) => String(s)
  .replace(/ \(rule [A-Z0-9_]+\)/g, '')
  .replace(/\(rule [A-Z0-9_]+, not in the registry\)/g, '(not set yet)')
  .replace(/\(rule [A-Z0-9_]+, /g, '(');

// A calendar item's note in words: a moved one's "moved from 2026-11-01" reads "moved from Nov 1, 2026". With moved
// false, the note less that part (the item's screen says it on its own line), or null when nothing else is left.
export function itemNote(e, { moved = true } = {}) {
  if (!e || !e.note) return null;
  const m = e.moved ? /^moved from (\d{4}-\d{2}-\d{2})(?:; )?/.exec(e.note) : null;
  if (!m) return e.note;
  const rest = e.note.slice(m[0].length);
  return moved ? 'moved from ' + shortDate(m[1]) + (rest ? '; ' + rest : '') : rest || null;
}

// A rule's value in words (All formulas and the Rules page). Brackets are [top, rate] pairs; any other list (an order,
// two ages) reads as a list (S-211); a date rule says which year it falls in.
export function ruleValueWords(r) {
  if (Array.isArray(r.value) && r.value.every((x) => Array.isArray(x))) return r.value.map(([top, rate]) => (Math.round(rate * 10000) / 100) + '% to ' + (top === null ? 'the top' : '$' + top.toLocaleString('en-US'))).join('; ');
  if (Array.isArray(r.value)) return r.value.join(', ');
  return String(r.value) + (r.yearOffset ? ' of the year after the tax year' : r.yearOffset === 0 ? ' of the tax year' : '');
}
