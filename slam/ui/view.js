// Display helpers shared by the Ledger and Dashboard. Formatting only; every
// number arrives already computed by the engines.

import { money, pct } from '../src/ui/format.js';
import { LOAN_PLAN_WORDS, PAY_POLICIES } from '../engine/schema.js';

export { money, pct };

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso) => (iso ? MONTHS[+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8, 10) + ', ' + iso.slice(0, 4) : '');
export const monthWords = (ym) => MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
export const words = (s) => String(s).replace(/_/g, ' ');

// How a card is paid (S-189), in words.
export const PAY_POLICY_WORDS = { minimum: 'New charges plus the minimum on what I carry', statement: 'The full statement balance' };

// A stored value, worded by its field type.
export function showValue(value, type) {
  if (value === null || value === undefined) return '';
  // An expense: how much, how often, and who pays (S-175, S-176).
  if (type === 'expense') {
    const how = { weekly: 'a week', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year', once: 'once', total: 'in total' }[value.cadence] || '';
    const base = value.amount === null ? 'amount not given' : money(value.amount, !Number.isInteger(value.amount)) + ' ' + how;
    const sub = value.subscription ? ' · subscription' : '';
    if (value.covered) return base + ', covered by ' + (value.coveredBy || 'someone else') + ' ($0 to you)' + sub;
    if (value.shared) return base + ', shared by ' + (value.people || '?') + (value.yourMonthly !== null ? ': you pay ' + money(value.yourMonthly) + ' a month' : '') + sub;
    return base + sub;
  }
  // A card's interest rate: "24%" or "0% until March 31, 2027, then 24%".
  if (type === 'cardRate') {
    const after = value.apr === null ? 'not given' : showValue(value.apr, 'rate');
    if (!value.intro) return after;
    return (value.intro.rate === null ? 'intro rate not given' : showValue(value.intro.rate, 'rate')) + ' until ' + (value.intro.ends ? shortDate(value.intro.ends) : '(end date not given)') + ', then ' + after;
  }
  if (type === 'money') return money(value, !Number.isInteger(value));
  if (type === 'rate') return pct(value, Math.abs(value * 100 - Math.round(value * 100)) > 1e-9 ? 2 : 0);
  if (type === 'bool') return value ? 'Yes' : 'No';
  if (type === 'date') return shortDate(value);
  if (type === 'list') {
    if (!value.length) return 'none';
    return value.map((x) => (typeof x === 'object' ? (x.year ? x.year + ': ' : '') + money(x.amount) + (x.taxable !== undefined && x.taxable !== x.amount ? ' (taxable ' + money(x.taxable) + ')' : '') : x)).join(', ');
  }
  if (type === 'choice:' + PAY_POLICIES.join('|')) return PAY_POLICY_WORDS[value] || words(value);
  if (type.startsWith('choice:')) return words(value);
  if (type.startsWith('suggest:')) return LOAN_PLAN_WORDS[value] || String(value);
  return String(value);
}

// The kind chip: green known, yellow rough, red missing.
export const KIND_WORDS = { known: 'Known', rough: 'Rough', missing: 'Missing', computed: 'Computed', notForMe: 'Not for me', incomplete: 'Incomplete' };
export const chip = (kind) => h('span', { class: 'chip chip-' + kind }, KIND_WORDS[kind] || kind);

export const ledgerHref = (path) => 'ledger.html#' + encodeURIComponent(path);
