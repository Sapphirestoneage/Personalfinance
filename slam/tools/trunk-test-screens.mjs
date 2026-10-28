// The screens the trunk test and the squint kit look at (S-288).
// [level, address]. Level 1 a main tab, 2 a second-level tab, 3 a group, 4 an item.
export const SCREENS = [
  [1, 'dashboard.html'], [1, 'ledger.html'], [1, 'plan.html'], [1, 'calendar.html'], [1, 'spending.html'],
  [2, 'ledger.html#/needs'], [2, 'ledger.html#/debt'], [2, 'ledger.html#/income'], [2, 'ledger.html#/assets'], [2, 'ledger.html#/goals'], [2, 'ledger.html#/protection'],
  [2, 'plan.html#/debt'], [2, 'plan.html#/retirement'], [2, 'plan.html#/protection'], [2, 'windfall.html'],
  [3, 'ledger.html#/needs/housing'], [4, 'ledger.html#/needs/housing/rent'],
  [3, 'ledger.html#/debt/credit-cards'], [4, 'ledger.html#/debt/credit-cards/visa'],
  [3, 'ledger.html#/income/paychecks-w-2'], [4, 'ledger.html#/income/paychecks-w-2/salary'],
  [3, 'ledger.html#/assets/ira'], [4, 'ledger.html#/assets/ira/roth'],
  [3, 'ledger.html#/goals/your-goals'], [4, 'ledger.html#/goals/your-goals/fi'],
  [3, 'ledger.html#/taxes/tax-withheld'], [3, 'plan.html#/max-it'],
  [3, 'calendar.html#/2026-11'], [3, 'ledger.html?guide=1#/needs'], [4, 'ledger.html?guide=1#/debt']
];
