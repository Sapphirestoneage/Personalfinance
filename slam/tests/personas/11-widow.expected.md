# Hand math, Widow: Ruth Castellano (persona 11)

As of 2026-10-22, October 2026, tax year 2026 (married filing jointly, the year of death). Conventions: `../golden/CONVENTIONS.md`.
Test: `11-widow.golden.test.js`.

## October 2026 cash flow

- Survivor Social Security $2,300 + survivor pension $1,100 + library $2,200 = gross **$5,600**
- Withheld 150 + 80 (library) + 110 + 40 (pension) = $380; FICA on the library wages 2,200 x 7.65% = $168.30; take-home = **$5,051.70**
- Expenses = 900 + 160 + 320 + 550 + 150 + 120 + 110 + 70 + 780 + 200 + 500 = **$3,860** (the $6,000 of estate costs is November); FAT = 900 + 160 + 320 + 550 + 150 + 120 + 110 = **$2,310**
- The Visa is paid in full: debt payments $0 (engine: $900)
- Surplus = 5,051.70 - 3,860 = **$1,191.70** (engine: 291.70)

## 2026 tax (joint, the year of death)

- Paul's wages January 1 to June 15: 5.5 months x 8,500 = $46,750; withheld 6,050 federal, 2,310 state
- Library 2,200 x 12 = $26,400 (withheld 1,800 and 960); pension August to December 5 x 1,100 = $5,500 (withheld 550 and 200); qualified dividends $3,000; Social Security August to December 5 x 2,300 = $11,500
- Taxable Social Security: provisional income = 46,750 + 26,400 + 5,500 + 3,000 + half of 11,500 = $87,400, over the $44,000 joint threshold, so the taxable part = min(85% x 11,500, 85% x (87,400 - 44,000) + 6,000) = **$9,775**
- Gross income = 81,650 + 9,775 = $91,425; taxable = 91,425 - 32,200 = $59,225; ordinary taxable = 56,225
- Federal = 2,480 + (56,225 - 24,800) x 12% = $6,251.00; the $3,000 of dividends sit inside the 0% band (under 98,900): 0. **Federal income tax $6,251.00**
- New York: Social Security is not taxed, and up to $20,000 of pension income is excluded at 59 and a half, so NY AGI = 91,425 - 9,775 - 5,500 = $76,150; NY taxable = 76,150 - 16,050 = 60,100: 668.85 + 283.80 + 221.45 + (60,100 - 27,900) x 5.4% = **$2,912.90**
- Owed = **$9,163.90**; withheld 11,870; **balance due -$2,706.10 (a refund)**
- Engine: Social Security left out entirely ("not modeled"), pension taxed by NY: federal 5,078.00, NY 3,209.90, owed 8,287.90, refund 3,582.10

## Balance sheet, emergency fund, FI

- Net worth = 14,000 + 230,000 + 410,000 + 96,000 + 22,000 + 150,000 + 480,000 + 12,000 - 900 = **$1,413,100**; invested $678,000; cash $244,000
- Age 63: Rule of 5 = 12.6 months; runway = 244,000 / 3,860 = **63.2 months** (engine: 51.3 with the Visa balance in the burn)
- FI number covering all spending = 3,860 x 12 / 0.04 = $1,158,000 (her goal: 48,000 / 0.04 = $1,200,000); FI percent 678,000 / 1,200,000 = 56.5%
- FI number net of guaranteed income: benefits after withholding = 2,300 + 1,100 - 150 = $3,250 a month. While COBRA runs the gap is 3,860 - 3,250 = **$610 a month**, an FI number of 610 x 12 / 0.04 = **$183,000**; once COBRA ends (December 2027) spending is $3,080 and the gap is **nothing**. By that reading she is past FI with $678,000 invested and $244,000 in cash. The app has no such reading.

## Differences from the engine

1. The summary with flags throws (Social Security "not modeled" makes the balance due rough with no rough input): the Dashboard cannot load.
2. Social Security benefits are not taxed at all, and New York's pension exclusion is not applied: refund 3,582.10 vs 2,706.10.
3. The Visa paid in full counts as a 900 minimum: surplus 291.70 vs 1,191.70; runway 51.3 vs 63.2 months.
4. The FI number ignores pension and Social Security income: 56.5% of 1,200,000 vs past FI.
5. Not a mismatch, a gap: the filing status for 2027 (single), required minimum distributions, Medicare at 65 and the survivor-benefit switch have no field.
