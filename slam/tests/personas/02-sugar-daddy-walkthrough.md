# Walkthrough: Raymond Feld, sugar daddy

Method and shared findings: `UI-NOTES.md`.

## What the pages showed

- Ledger: loaded, 101 fields; the still-guessing list led with "Everything else" and "Arrangement: dinners, travel, gifts" (rough), then the paid-from links.
- Dashboard: **crashed** ("The Dashboard could not load: Cannot read properties of undefined (reading 'split')"). Cause: he lives in New York City, so the tax engine notes "New York City income tax not modeled", which makes the balance due "rough" with no rough input to name (UI-NOTES.md item 1). No tile, no flag, no money flow.
- With the flags turned off (the engines run directly): net worth $5,406,500; surplus **-$5,869** (the $6,500 Amex paid in full is counted as a minimum payment, and a $2,289 set-aside); savings rate -7.8%; FI 71% of $5,000,000; 2026 balance due $16,022; runway 8.3 months.

## No field for

- Who receives money. Gift tax reporting ($48,000 a year to one person is above the $19,000 exclusion) is invisible; "Arrangement: monthly allowance" is just an expense.
- RSUs as equity compensation: entered as a second W-2 paid quarterly, which gets the tax right but shows as a "paycheck".
- The net investment income tax (3.8% on $102,000 of dividends and gains, about $3,900) and New York City tax (about $19,000). Both missing from the balance due.
- Alimony as a dated, non-deductible payment: an expense with an end date, settable only in the file.

## Results that look wrong or misleading

- FICA is overstated by about $775 a month: the Social Security wage base is applied to each stream each month (salary capped at $15,375 a month, the RSU stream capped separately), instead of once a year across both. The yearly tax engine gets it right; cash flow does not. Take-home is understated by the same amount.
- The surplus is negative only because of the Amex double count.
- The payoff orders put the Amex at "paid off March 2032, $6,385 of interest" for a card he clears every month.
- FI in "5 years" with a negative surplus: the number comes from growth alone, which is defensible, but nothing says so.

## Assumptions that are not true for him

- One income stream per person under the wage base (two streams, far over it).
- No one pays a card in full.
- Nobody in the household gives money away in amounts that matter for tax.

## Rating

**Doesn't work** (the Dashboard does not load). If the crash were fixed: works with workarounds, with the FICA and Amex errors to live with.
