# New York City and Yonkers rates to check

Every New York City bracket and the Yonkers surcharge, exactly as the tax engine uses them (from `data/rules-2026.json`).
Check each line against the New York State IT-201 instructions (the New York City tax rate schedules and the Yonkers worksheet).
All of them stay marked **verify** until you confirm them. To fix one, change its value in `data/rules-2026.json` and run `node tools/nyc-rates-doc.mjs`.

How the engine uses them: the city tax is figured on New York State taxable income (federal AGI less the New York standard deduction; no New York adjustments are modeled), bracket by bracket. The Yonkers surcharge is a share of the New York State tax (credits are not modeled). Both are full-year resident rules.

## Single (`NYC_BRK_S`, verify)

| Taxable income | Rate |
|---|---|
| $0 to $12,000 | 3.078% |
| $12,000 to $25,000 | 3.762% |
| $25,000 to $50,000 | 3.819% |
| Over $50,000 | 3.876% |

Source: NYS Form IT-201-I (2025), New York City tax rate schedule; NYC Admin Code 11-1701 (rates unchanged since 2017). Entered from the published schedule as known; tax.ny.gov could not be opened from this session, so check it there before quoting

## Married filing jointly (and qualifying surviving spouse) (`NYC_BRK_J`, verify)

| Taxable income | Rate |
|---|---|
| $0 to $21,600 | 3.078% |
| $21,600 to $45,000 | 3.762% |
| $45,000 to $90,000 | 3.819% |
| Over $90,000 | 3.876% |

Source: NYS Form IT-201-I (2025), New York City tax rate schedule; NYC Admin Code 11-1701 (rates unchanged since 2017). Entered from the published schedule as known; tax.ny.gov could not be opened from this session, so check it there before quoting

## Married filing separately (`NYC_BRK_MFS`, verify)

| Taxable income | Rate |
|---|---|
| $0 to $12,000 | 3.078% |
| $12,000 to $25,000 | 3.762% |
| $25,000 to $50,000 | 3.819% |
| Over $50,000 | 3.876% |

Source: NYS Form IT-201-I (2025), New York City tax rate schedule; NYC Admin Code 11-1701 (rates unchanged since 2017). Entered from the published schedule as known; tax.ny.gov could not be opened from this session, so check it there before quoting

## Head of household (`NYC_BRK_H`, verify)

| Taxable income | Rate |
|---|---|
| $0 to $14,400 | 3.078% |
| $14,400 to $30,000 | 3.762% |
| $30,000 to $60,000 | 3.819% |
| Over $60,000 | 3.876% |

Source: NYS Form IT-201-I (2025), New York City tax rate schedule; NYC Admin Code 11-1701 (rates unchanged since 2017). Entered from the published schedule as known; tax.ny.gov could not be opened from this session, so check it there before quoting

## Yonkers resident surcharge (`YONKERS_SURCHARGE`, verify)

**16.750%** of the net New York State tax.

Source: NYS Form IT-201-I (2025), Yonkers resident income tax surcharge worksheet. Entered as known; tax.ny.gov could not be opened from this session, so check it there before quoting

Checked by: ________   Date: ________   Changes: ____________________
