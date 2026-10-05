# Module audit (MR-037)

One line per row type: what it is for, then what is Needed (asked, counted,
on the tracker), Optional (sharpens a number when known, never holds anything up)
and Tags (labels to filter by). Generated from `data/fields.json`; the groups
are the `optional` and `tag` flags on each field. Fields tied to a cadence
(pay frequency) are listed under Needed and asked only when the headline is
typed per paycheck.

## Income

### W-2 job
What the household earns from a job, so take-home, taxes and the match can be computed.
- Needed: Gross pay, Pay frequency, Pre-tax retirement
- Optional: Take-home, Roth retirement, HSA via payroll, Other pre-tax, Bonus, Equity, Start date, Paid hours, Commute and prep hours, Costs of working
- Tags: Stability

### 1099 work
Self-employed earnings, so the engine can net out business costs and estimate self-employment tax.
- Needed: Gross pay, Pay frequency
- Optional: Take-home, Business expenses, HSA via payroll, Start date, Paid hours, Commute and prep hours, Costs of working
- Tags: Stability

### Side income
Occasional extra money, so runway and savings rate count it without pretending it is steady.
- Needed: Gross pay, Pay frequency
- Optional: Paid hours
- Tags: Stability

### Unemployment
A benefit that ends, so the projection knows how long it lasts.
- Needed: Benefit, Weeks of benefit
- Optional: Start date

### Rental  (assumed none)
Rent collected from a property, assumed none unless there is one.
- Needed: Rent collected
- Optional: Rental expenses
- Tags: Stability

### Benefits and match
The employer match, so the tracker can say how much free money is being left behind.
- Needed: Match rate, Match up to
- Optional: Other benefit

### Other
Anything else that comes in, as one number.
- Needed: Amount, Pay frequency

## Spending

### Rough total
One rough monthly total when the lines are not known yet.
- Needed: Rough monthly total

### Spending line
One spending line a month, with its category, so the budget, the runway and the rewards lenses work.
- Needed: Category, Amount, Need or want, Unavoidable or mistake
- Optional: In the FAT floor, How it is paid
- Tags: Paid automatically or by hand

### Savings transfer
Money moved to savings each month and where it lands.
- Needed: Savings landing

### Other
Anything else going out, as one number.
- Needed: Amount

## Debt and Credit

### Rough total
One rough total owed when the accounts are not known yet.
- Needed: Rough total debt

### Credit card
A credit card: balance, rate, minimum and limit drive payoff, utilization and the rewards lenses.
- Needed: Balance, Standard APR, Minimum payment, Credit limit
- Optional: Card, Promo APR, Promo ends, Annual fee, Credits used, Autopay

### Student loan
A student loan: balance, rate and minimum.
- Needed: Balance, Interest rate, Minimum payment

### Auto loan
A car loan: balance, rate and payment.
- Needed: Balance, Interest rate, Payment
- Optional: Months left

### Mortgage or HELOC
A home loan: balance, rate and the principal and interest payment; escrow and HOA sharpen housing cost.
- Needed: Balance, Interest rate, Principal and interest
- Optional: Property taxes, Home insurance, HOA, PMI

### Personal, family, medical, BNPL
Personal, family, medical and buy-now-pay-later balances.
- Needed: Balance, Interest rate, Payment

### Credit score
The credit score as reported, with the bureau as a tag.
- Needed: Score
- Tags: Bureau

### Other
Anything else owed, as one number.
- Needed: Amount owed, Interest rate, Payment

## Safety Net

### Insurance
A policy premium, with its type as a tag; coverage and deductible sharpen the gap.
- Needed: Premium
- Optional: Coverage, Deductible
- Tags: Type

### Unemployment estimate
What unemployment would pay a week if a job ended.
- Needed: Weekly benefit estimate

### Ability to cut
How much spending could be cut in a pinch.
- Needed: Could cut per month

### Other
Any other safety net, as one number.
- Needed: Amount

## Investments and Accounts

### Rough total
One rough total invested when the accounts are not known yet.
- Needed: Rough total assets

### Account
An account: its type, balance and monthly contribution drive the projection; allocation sharpens the return.
- Needed: Account type, Balance, Contribution
- Optional: Stocks %, Bonds %, Cash %, Other %, US share %
- Tags: Beneficiary named

### Holding
A fund inside an account: its expense ratio drives the fee drag lens.
- Needed: Expense ratio
- Optional: % of account
- Tags: Account, Fund

### Other
Any other asset, as one number.
- Needed: Value

## Taxes

### Other
Any other tax note, as one number.
- Needed: Amount

## Life Plan

### Goal
A goal with a cost and a target date, so the plan can price it.
- Needed: Cost, Target date
- Tags: Priority

### Retirement
The retirement age; the three spending phases sharpen the projection.
- Needed: Retirement age
- Optional: Go-go years, Slow-go years, No-go years

### Other
Anything else in the plan, as one number.
- Needed: Amount

## Screens

- Home: four facts (birth date on a calendar or an age, state with New York as the default, work situation, filing status); the rest behind More facts.
- Ledger page: the table shows the name and the headline figure only; every other fact is behind Details, grouped Needed, Optional, About this row.
- Tracker strip: counts Needed facts only; the first open one is "Now:".
- Starting soon and Simulate: one headline question per change, the rest behind Details; the start is a calendar.

Totals across the field list: 41 needed, 37 optional, 8 tag fields (57 placements as needed, 45 optional, 11 tags across the row types).
