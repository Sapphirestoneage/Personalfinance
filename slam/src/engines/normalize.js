// Turns any Value into a monthly amount. Annual costs are spread evenly
// (accrual, not cash). One-offs are kept out of monthly totals.
// A Value is stored as { amount, cadence, status, ... }. toMonthly returns dollars a month; sumParts returns
// dollars per the value's own cadence (week, month, or year).
// No imports.

// Biweekly is every two weeks (26 a year); semimonthly is twice a month (24).
export const PAYCHECKS_PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

/**
 * Returns a monthly number, 0 for "not-for-me" and one-offs, or null when empty.
 * @param {?object} value a Value: amount in dollars per its cadence ('month', 'week', 'year', 'paycheck',
 *   'one-off'); null amount = not entered
 * @param {?string} payFrequency 'weekly' | 'biweekly' | 'semimonthly' | 'monthly', for a per-paycheck value
 * @returns {?number} dollars a month
 */
export function toMonthly(value, payFrequency) {
  if (!value) return null;
  // "Doesn't apply" is a real zero; a blank amount is not entered.
  if (value.status === 'not-for-me') return 0;
  if (value.amount === null || value.amount === undefined) return null;
  const a = value.amount;
  switch (value.cadence) {
    case 'month': return a;
    // 52 weeks over 12 months (4.33 a month), not 4: four weeks a month loses a month a year.
    case 'week': return (a * 52) / 12;
    case 'year': return a / 12;
    case 'paycheck': {
      // No pay frequency, no answer: guessing one would be a silent assumption.
      const n = PAYCHECKS_PER_YEAR[payFrequency];
      return n ? (a * n) / 12 : null;
    }
    // A one-off is listed apart (isOneOff) and must not inflate a monthly total.
    case 'one-off': return 0;
    default: return null;
  }
}

/**
 * True for a one-off Value with a number that is not "doesn't apply".
 * @param {?object} value a Value
 * @returns {boolean}
 */
export function isOneOff(value) {
  return !!value && value.cadence === 'one-off' && value.amount !== null && value.status !== 'not-for-me';
}

/**
 * True when the value counts as answered for math (an amount or "doesn't apply").
 * @param {?object} value a Value
 * @returns {boolean}
 */
export function hasAnswer(value) {
  return !!value && (value.status === 'not-for-me' || (value.amount !== null && value.amount !== undefined));
}

// Periods a year for each item cadence, used to mix items of different cadences in sumParts.
export const PART_CADENCES = { week: 52, month: 12, year: 1 };

/**
 * The amount of a split value: the sum of the items that have a number, or
 * null when none do (empty is not zero).
 * Items can each have their own cadence (S-074): week, month, or year. An item
 * with none is in the value's own cadence. Mixed items are added up a year at a
 * time and turned into the value's cadence, to the cent.
 * @param {Array<{amount: ?number, cadence?: string}>} parts the items, dollars per their cadence
 * @param {string} cadence the value's own cadence ('week', 'month', 'year')
 * @returns {?number} dollars per the value's cadence, rounded to the cent
 */
export function sumParts(parts, cadence) {
  const known = parts.filter((p) => p.amount !== null);
  if (!known.length) return null;
  const mixed = known.some((p) => p.cadence && p.cadence !== cadence);
  // Same cadence throughout: a plain sum. Mixed: each item x its periods a year, then back to the value's cadence.
  const total = mixed && PART_CADENCES[cadence]
    ? known.reduce((a, p) => a + p.amount * PART_CADENCES[p.cadence || cadence], 0) / PART_CADENCES[cadence]
    : known.reduce((a, p) => a + p.amount, 0);
  return Math.round(total * 100) / 100;
}
