// Turns any Value into a monthly amount. Annual costs are spread evenly
// (accrual, not cash). One-offs are kept out of monthly totals.

export const PAYCHECKS_PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

// Returns a monthly number, 0 for "not-for-me" and one-offs, or null when empty.
export function toMonthly(value, payFrequency) {
  if (!value) return null;
  if (value.status === 'not-for-me') return 0;
  if (value.amount === null || value.amount === undefined) return null;
  const a = value.amount;
  switch (value.cadence) {
    case 'month': return a;
    case 'week': return (a * 52) / 12;
    case 'year': return a / 12;
    case 'paycheck': {
      const n = PAYCHECKS_PER_YEAR[payFrequency];
      return n ? (a * n) / 12 : null;
    }
    case 'one-off': return 0;
    default: return null;
  }
}

export function isOneOff(value) {
  return !!value && value.cadence === 'one-off' && value.amount !== null && value.status !== 'not-for-me';
}

// True when the value counts as answered for math (an amount or "doesn't apply").
export function hasAnswer(value) {
  return !!value && (value.status === 'not-for-me' || (value.amount !== null && value.amount !== undefined));
}
