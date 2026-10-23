# Walkthrough, Sugar baby: Mila Soto (persona 01)

Method and the findings shared by every persona: `UI-NOTES.md`.

## What the pages showed

- Ledger: 88 fields, 25 "still guessing". The first item: "Monthly allowance (arrangement): amount, rough; off by 20%, moves cash in 24 months by $10,185". That is the right field to doubt, for the right reason.
- Dashboard: loaded (the allowance is marked rough, so the crash in UI-NOTES.md item 1 did not fire). Net worth $10,250. Cash runway 2.2 months (Rule of 5 target 4.8 months, $22,292). Monthly surplus **-$538**, of which $800 a month is a "tax set-aside: 2026 tax still due $5,601". Savings rate -8.1%. Credit cards: Visa at 45%, red. FI: 0.1% of $1,349,100 (today's spending). 2026 tax balance due $5,601, "not included: New York City income tax".
- Flags: Visa at 45% (red), personal cards 45% (red), estimated 2026 balance due $5,601 (yellow), runway (yellow), and the usual "uses rough numbers" flags.

## No field for

- A gift or an allowance. The only kinds are W-2, 1099, unemployment, tips, rental, pension, Social Security, maybe money, other. "Other" is taxed as ordinary income with nothing withheld: the app shows $5,601 due and sets aside $800 a month. Worked by hand (`01-sugar-baby.expected.md`): if the money is a gift she owes nothing and gets a $141 refund; if it is compensation it is self-employment income and she owes $9,858. The app's number matches neither reading.
- Income that varies. A single monthly amount, known or rough. No range, no "some months $0".
- In-kind gifts (trips, a bag). Not income, not an expense she pays; no place for "my lifestyle costs more than my cash shows".
- Rent paid by him some months. "Someone else covers it" makes it $0 every month; she pays it most months.
- A "what if it stops" view: runway without the allowance. The runway tile uses this month's income only through the surplus; there is no "if this stream ends" switch short of ending the stream in the file.

## Forced into the wrong category

- The allowance as "Other income" (taxed; a gift is not).
- The marketplace plan, hair and skincare, and clothes all land in "Everything else"; a health line is only a label.

## Confusing labels or steps

- "Save as a guess" is the right button for the allowance, and it is what keeps the Dashboard from crashing; nothing tells her that an "other income" she marks known would break the page.
- The tax flag says "set aside $5,601 ... $801 a month" with no hint that the kind of income decides whether that is true.

## Results that look wrong or misleading

- The surplus (-$538) is driven by a tax the app cannot know she owes. Without the set-aside she is +$263 a month.
- "FI in: The projection does not reach the FI number" is right for her but beside the point; the exit fund goal ($15,000) has no date, no monthly amount and no flag.

## Assumptions that are not true for her

- Income is from an employer or a business. Money from a person is not modeled.
- An income that exists this month exists every month (there is likelihood only for "maybe money", and that is for a stream that has not started).

## Rating

**Doesn't work** for the question she brings (what is this income and what do I owe); **works with workarounds** for the budget and the cards.
