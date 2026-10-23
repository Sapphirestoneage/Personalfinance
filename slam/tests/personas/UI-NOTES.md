# How the personas were entered, and what every walkthrough found

## Method

Each persona's numbers were written as a spine file (`households/<id>.json`,
built by `make-personas.js`) and loaded into the real Ledger and Dashboard
pages in headless Chromium with Playwright (`walk-ui.mjs`: 375 pixels wide,
the pages' default assumption set "Likely", the household preloaded as "edits
saved in this browser", which is how the pages read a household). What each
page showed, every console error and a screenshot were recorded. The Ledger's
own add forms, editors and "Pick what you have" list were opened on the demo
household to read what each field offers. So the entry was done against the
real schema and the real pages; the typing of each value into the Ledger's
editors was simulated by the file, except where a walkthrough says a value
was typed. Where the Ledger has no way to enter something the file can hold,
the walkthrough says so.

To repeat it: serve the `slam` folder (`python3 -m http.server 8765`) and run
`node tests/personas/walk-ui.mjs <id> ...` with Playwright installed.

## The Ledger's vocabulary (from the pages)

- **Pick what you have** offers: checking, savings, high-yield savings, money
  market; credit card, federal student loan, private student loan, car loan,
  mortgage, personal loan, buy now pay later, medical bill, money owed to
  family or friends; 401(k), 403(b), Roth IRA, traditional IRA, HSA, brokerage
  account, crypto, 529 college savings; car, home; a paycheck (W-2), freelance
  or contract (1099), unemployment, tips, other income; rent, utilities,
  internet, renters insurance, groceries, eating out, gas, transit, car
  insurance, phone, health insurance, medical and prescriptions, gym,
  streaming and apps, charity, pets, childcare, personal care, clothes.
- **Add a debt** kinds: credit card, federal student loan, private student
  loan, mortgage, HELOC, auto loan, personal loan, buy now pay later, payday or
  cash advance, medical debt, IRS payment plan, 401(k) loan, family IOU.
- **Add income** kinds (the file): w2, 1099, unemployment, tips, rental,
  pension, ss, maybeMoney, other. How often: weekly, biweekly, semimonthly,
  monthly, quarterly, yearly, once. Not offered in the add form: "in total
  over a window", a start date, an end date.
- **An expense's panel**: Name; Who pays? (I pay all of it; I share it with
  others; Someone else covers it); How much is it? with how often; This is a
  subscription; sharing: how many people, your part (an even split, a
  percent, the amount I pay), who pays the bill; covered by: Parents, Partner,
  Roommate, Employer, Family, Other / add a name. Kind of spending when adding:
  food, accommodation, transportation, or "not food, housing or transportation".
- **Filing status**: single, mfj, mfs, hoh. **Situation**: employed, self
  employed, between jobs, student, retired, mixed. **Health coverage**:
  employer, parent plan, own plan, marketplace, medicaid, medicare, none, other.
- **A person**: birth date only, and only the people already in the file;
  there is no "add a person" anywhere. Income added in the Ledger belongs to
  the first person.
- **Dates**: no row on any item for a start or end date. Streams that end,
  streams that start, expenses that start or end, and "once" expenses can be
  dated only in the file. The engines handle all of them.

## Findings that apply to every persona

1. **The Dashboard crashes** ("The Dashboard could not load: Cannot read
   properties of undefined (reading 'split')") for 8 of the 21 personas (and
   the golden household Fay): anyone who lives in New York City, anyone
   outside New York State, anyone with Social Security income, and anyone with
   no 2026 tax-year record, as long as every tax input is "known". The flags
   engine reads the first rough or missing tax input to name it and there is
   none. The Ledger still works.
2. **A card paid in full every month** ("The full statement balance") is
   counted as a minimum payment equal to its whole balance, on top of the
   spending already on it. Every persona with such a card shows a surplus
   that is wrong by the balance (Wes, the couple, the Adlers, Victor, Kai,
   Ruth, Raymond) and a runway and a Rule of 5 target that are too low.
3. **The Dashboard opens on the "Likely" assumption set** (6% real return, 4%
   withdrawal), not the household's own numbers; the FI tile says so in its
   last line, but the years to FI, the coast number and the FI percent on
   first load are not the household's.
4. **"Everything else" rough** produces two stage 2 flags for every persona
   ("Monthly surplus uses 1 rough number", "Cash runway uses 1 rough number"),
   which crowd out the flags that matter.
5. **The FI number assumes the portfolio must cover all spending.** Pension,
   Social Security, part-time income kept on purpose, and a Lean goal that
   covers less than today's spending are all treated as either ignored or a
   problem (a red "FI goal is below what today's spending implies" flag).
6. **Taxes outside the model:** no credits (child tax credit, earned income
   credit, dependent care, education), no net investment income tax, no New
   York City tax, no state but New York (a household in New Jersey gets no tax
   number at all, not even federal), no Social Security benefit taxation, no
   deduction for self-employed retirement or health insurance.
7. **Income kinds** have no gift or family support, no child support, no
   alimony received, no benefits (SNAP, WIC), no stipend, no equity
   compensation, no investment draw; "other" is taxed as ordinary income.
8. **Expense categories** are food, housing, transportation and everything
   else: medical, childcare, education or tuition, giving, insurance and debt
   payments that are not minimums have no home and no total.
