/* Two synthetic households for the sensitivity tie-out (Level 9, MR-042).
   Built through the record API by the test; the same numbers are typed into
   tests/households/expected-levers.py, which never reads this file. */
export const LEVER_SPECS = {
  starter: { birthDate: '1996-05-01', grossMonthly: 800000, takeHomeMonthly: 560000, lines: [['Rent', 'accommodation', 160000, true], ['Groceries', 'food', 60000, true], ['Transit', 'transportation', 40000, true], ['Everything else', 'wants', 120000, false]], invested: 4200000, baristaIncome: 150000 },
  mid: { birthDate: '1981-05-01', grossMonthly: 1350000, takeHomeMonthly: 950000, lines: [['Mortgage', 'accommodation', 230000, true], ['Groceries', 'food', 80000, true], ['Car', 'transportation', 50000, true], ['Everything else', 'wants', 190000, false]], invested: 18000000, cash: 500000, baristaIncome: null },
};
