# How the hand numbers were worked out

Everything is as of 2026-10-22, the household's as-of date, for the month of
October 2026 and the 2026 tax year. Dollar amounts are exact to the cent unless
a line says "about". Rates and brackets are the 2026 figures (see
`docs/CONSTANTS_AUDIT.md`); the New York brackets are the ones in the rules
file, which are themselves unverified.

- **Monthly amount of a stream**: weekly x 52 / 12, every two weeks x 26 / 12,
  monthly as is. A stream that has ended counts $0; one that has not started
  counts $0. A "total" over a window is spread by days.
- **Take-home** = gross - tax withheld - FICA (6.2% + 1.45% of W-2 pay) -
  contributions taken from the paycheck (401(k), 403(b), HSA).
- **Expenses** = your part of every active expense (a shared bill counts your
  share; a covered one counts $0). "Needs" are the ones tagged need.
- **FAT** = food + accommodation + transportation, every expense so tagged.
  **Lean FI** (the owner's definition for this check) = FAT x 12 / withdrawal
  rate. The engine instead leaves out FAT expenses tagged as wants; both
  numbers are shown.
- **Minimum payments**: as entered; a card with none gets the house default,
  the larger of $40 or 1% of the balance plus one month of interest.
- **Tax set-aside** = max(0, 2026 balance due - money already set aside) / 7
  (October 2026 through April 2027).
- **Surplus** = take-home - expenses - minimum payments - saving paid from
  take-home - tax set-aside. Where a first-principles reading differs (a card
  paid in full each month is last month's spending, not a debt payment; a
  freelancer's business expenses come out before anything else), both are shown.
- **Savings rate (gross)** = (surplus + paycheck contributions + after-tax
  contributions) / gross. **(net)** = (surplus + after-tax contributions) /
  take-home.
- **Net worth** = every account balance (cash, investments, home, car) - every
  debt balance. **Invested** = retirement, IRA, HSA and taxable brokerage only.
- **Emergency fund months** = cash / (expenses + minimum payments), the
  app's definition; cash / expenses is also shown. **Rule of 5 target** =
  age / 5 months, in dollars rounded up to whole dollars.
- **Debt payoff date**: month by month from November 2026, interest at
  APR / 12 on the balance, then the minimum (never more than the balance).
  This is the "minimums only" date, the one the projection shows. The app's
  payoff orders also roll freed-up minimums and the whole surplus into the
  next debt, which gives an earlier date; that is a different question, not a
  mismatch, and is noted where it matters.
- **FI number** = the goal (a direct number, or yearly goal spending /
  withdrawal rate), else today's spending x 12 / withdrawal rate. **FI
  percent** = invested / FI number. **Coast FI** = FI number / (1 + real
  return) ^ (coast age - age).
- **Years to FI** (closed form): with P invested, C saved a year, F the FI
  number and r the real return, n = ln((F r + C) / (P r + C)) / ln(1 + r);
  never when C <= 0 and P < F. The engine runs a month-by-month projection
  instead (surplus invested, refunds invested, minimums that stop); where the
  two differ by more than a year the file says why.
- **2026 federal tax**: wages less pre-tax paycheck contributions, plus
  self-employment profit (gross less business expenses), unemployment and other
  ordinary income; less half of self-employment tax and the standard deduction;
  brackets applied; long-term gains and qualified dividends stacked on top at
  0 / 15 / 20%. Self-employment tax = profit x 92.35% x 15.3%. New York tax =
  (federal AGI - NY standard deduction) through the NY brackets. Credits
  (child tax credit, earned income credit, education credits) and New York
  City tax are not modeled by the engine; where they would change the answer
  the file says by how much.
