# Walkthrough: Ruth Castellano, widow

Method and shared findings: `UI-NOTES.md`. Hand math: `11-widow.expected.md`.

## What the pages showed

- Ledger: loaded, 110 fields; "Paul Castellano (died June 15, 2026)" with his birth date under "You and where you file"; his salary under Paychecks with no sign on the page that it ended; "Survivor Social Security" under its own heading.
- Dashboard: **crashed**. Cause: the Social Security stream makes the tax engine note "Social Security benefits not modeled", the balance due becomes rough with no rough input, and the flags throw.
- Engines directly: take-home $5,052; expenses $3,860; the Visa she pays in full counted as a $900 minimum; surplus **$292** (by hand $1,192); runway 51 months (63 by hand); net worth $1,413,100; FI 56.5% of $1,200,000, "FI in about 7.5 years"; 2026 refund $3,582 (by hand $2,706: 85% of the Social Security is taxable, and New York excludes the survivor pension).

## No field for

- The life insurance payout as an event: $350,000 arrived in August and is just two balances now; nothing marks it as money with a decision attached.
- A spousal rollover IRA: entered as "Rollover IRA"; the required minimum distribution age, the inherited rules, and the "treat as her own" choice are nowhere.
- Taxation of Social Security benefits, and New York's pension exclusion.
- The filing status change: married filing jointly for 2026, single from 2027 (no qualifying surviving spouse without a dependent child). The status is one field with no date; the 2027 tax will be figured as joint.
- COBRA ending and the marketplace from 2028 to Medicare at 65: an end date in the file, a start date in the file, premiums she cannot know yet.
- When to switch from the survivor benefit to her own retirement benefit.

## Forced into the wrong category

- Paul as a second person who is dead: the only way to carry his 2026 wages is to keep him in the household.

## Results that look wrong or misleading

- The FI number ($1,200,000, 56.5%) treats $3,400 a month of Social Security and pension as if it did not exist. By first principles her portfolio only has to cover the gap between spending and the benefits: $610 a month while COBRA runs (an FI number of $183,000 at 4%), and nothing at all once COBRA ends in December 2027, because $3,250 a month of benefits after withholding is more than $3,080 of spending. She passed that number long ago. The app's answer to "can I stop the library job" is no; the real answer is yes.
- The runway (51 or 63 months) is a strange number for someone with $1.4 million; the question is not runway.
- "FI in about 7.5 years" for a 63-year-old who is already there.

## Assumptions that are not true for her

- Income must come from working; benefits and pensions are not part of being independent.
- A household's second person is alive and present.
- The future is accumulation; there is no drawing down, no required distributions, no Medicare, no survivor rules.

## Rating

**Doesn't work.**
