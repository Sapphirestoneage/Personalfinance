// Health coverage (S-117): every coverage fact lives in doc.coverage (Setup, Health coverage). Other
// screens show one line from coverageSummary with a link, never a question. The one number here is
// the premium, in dollars a month. Depends on normalize.js (toMonthly) only; model.js reads the line
// types and premiumFor from here to build the Health insurance line.

import { toMonthly } from './normalize.js';

// In the US a child can stay on a parent's plan until 26, so 25 is the last age that counts (S-073).
export const PARENTS_PLAN_MAX_AGE = 25;
// Lines coverage owns: health insurance premiums.
export const PREMIUM_LINE_TYPES = ['health-insurance'];
export const PARENTS_PLAN_LINE_TYPES = PREMIUM_LINE_TYPES;

export const HOW_LABELS = {
  employer: 'An employer plan', parent: 'A parent\'s plan', marketplace: 'Marketplace or ACA', public: 'Medicaid or Medicare',
  school: 'A school plan', none: 'No coverage', 'not-sure': 'Not sure'
};

const cov = (doc) => doc.coverage || {};
const typed = (v) => !!v && v.amount !== null && v.amount !== undefined;

/**
 * The client's age in the working month's year: that year minus the birth year (no birthday math).
 * @param {object} doc needs doc.profile.birthYear and doc.currentMonth ('YYYY-MM').
 * @returns {number|null} years, or null when either is missing.
 */
export function ageThisYear(doc) {
  const by = doc.profile && doc.profile.birthYear;
  if (!by || !doc.currentMonth) return null;
  return Number(doc.currentMonth.slice(0, 4)) - by;
}

/**
 * Whether a parent's plan covers the client this year.
 * @param {object} doc the household document.
 * @returns {{age: number|null, eligible: boolean, chosen: boolean, on: boolean, agedOut: boolean}} on = chosen and 25
 *   or younger; agedOut = chosen but older. With no birth year neither is true.
 */
export function parentsPlan(doc) {
  const age = ageThisYear(doc);
  const eligible = age !== null && age <= PARENTS_PLAN_MAX_AGE;
  const chosen = cov(doc).how === 'parent';
  return { age, eligible, chosen, on: chosen && eligible, agedOut: chosen && age !== null && !eligible };
}

// What the coverage answer drives:
//   - a premium paid directly is the Health insurance line (computed, never asked twice);
//   - a premium from a paycheck stays that income's health deduction (take-home is already net of it),
//     so the Health insurance line is 0;
//   - a parent's plan makes premiums 0, while the client is 25 or younger (PARENTS_PLAN_MAX_AGE); age is
//     the working month's year minus the birth year;
//   - no coverage: no premium (0).
// Out of pocket, prescriptions, and therapy stay budget lines.
/**
 * The premium a month, and where it comes from.
 * @param {object} doc the household document.
 * @param {string} freq pay frequency ('weekly', 'biweekly', 'semimonthly', 'monthly'), for a premium typed per
 *   paycheck.
 * @returns {{amount: number|null, from: string|null, status: string|null, value?: object}} amount in dollars a month,
 *   null = not answered yet; from: 'parent' | 'paycheck' | 'none' (each 0, counted as doesn't apply) | 'direct' | null.
 */
export function premiumFor(doc, freq) {
  const c = cov(doc);
  if (parentsPlan(doc).on) return { amount: 0, from: 'parent', status: 'not-for-me' };
  if (c.how === 'none') return { amount: 0, from: 'none', status: 'not-for-me' };
  if (c.premiumFrom === 'paycheck') return { amount: 0, from: 'paycheck', status: 'not-for-me' };
  if (c.premiumFrom === 'direct') return { amount: typed(c.premium) ? toMonthly(c.premium, freq) : null, from: 'direct', status: typed(c.premium) ? c.premium.status : null, value: c.premium };
  return { amount: null, from: null, status: null };
}

const usd = (x) => '$' + (Math.round(x * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 });

/**
 * One line for every other screen: "Covered by a parent's plan. No premium."
 * @param {object} doc the household document.
 * @param {string} freq pay frequency, for a premium typed per paycheck.
 * @returns {string} a sentence, with the premium in dollars a month where one is typed.
 */
export function coverageSummary(doc, freq) {
  const c = cov(doc);
  const p = parentsPlan(doc);
  if (!c.how) return 'Health coverage not answered yet.';
  if (c.how === 'parent') return p.on ? 'Covered by a parent\'s plan. No premium.' : p.agedOut ? 'Aged off a parent\'s plan (' + p.age + ' this year), so premiums count again.' : 'On a parent\'s plan (needs a birth year: it counts through age ' + PARENTS_PLAN_MAX_AGE + ').';
  if (c.how === 'none') return 'No health coverage. No premium.';
  const head = HOW_LABELS[c.how] + '.';
  if (c.premiumFrom === 'paycheck') {
    const inc = (doc.income || []).find((i) => i.id === c.premiumIncomeId);
    return head + ' Premium taken out of the paycheck' + (inc ? ' (' + inc.label + ')' : '') + '.';
  }
  if (c.premiumFrom === 'direct') {
    const m = typed(c.premium) ? toMonthly(c.premium, freq) : null;
    return head + (m === null ? ' Premium paid directly, amount not answered yet.' : ' Premium ' + usd(m) + ' a month, paid directly.');
  }
  return head + ' How the premium is paid is not answered yet.';
}
