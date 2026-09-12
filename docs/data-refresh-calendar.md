# Data refresh calendar

Which file to re-check in which month, and against what. Lane 2, section 3 (DECISIONS.md L-3). Each file also carries the same note in its top-level `refresh` field, so the calendar and the file cannot disagree without `tests/data.test.js` noticing the field is missing. A cell whose `asOf` is older than 18 months fails that test unless it is marked `stale: true` with a `DECIDE:` note.

| Month | File | Re-check against | Why then |
|---|---|---|---|
| January | `data/aca.json` (poverty guidelines) | aspe.hhs.gov poverty guidelines for the new year | HHS publishes the guidelines in mid January; they price marketplace coverage for the following plan year |
| January | `data/lane2/milestones.json` | SECURE 2.0 follow-on law (RMD age), ssa.gov full retirement age page, medicare.gov enrollment page | New tax law usually takes effect on 1 January |
| February | `data/states.json` (`incomeTax`) and `data/state_brackets_2026.json` | Tax Foundation "State Individual Income Tax Rates and Brackets" for the new year | The Tax Foundation publishes the new edition in February |
| February | `data/states.json` (`uiWeeklyMaxCents`, `uiMaxWeeks`) | DOL "Significant Provisions of State UI Laws", January edition | Published each January and July; the January edition catches the 1 January state changes |
| March | `data/return_bands.json` | UBS Global Investment Returns Yearbook, new edition; Shiller data for ten-year windows | The Yearbook is published each March |
| May | `data/states.json` (`childcareInfantCenterMonthlyCents`) and `data/childcare_by_state.json` | Child Care Aware of America, "Price of Care" report | The report comes out in the spring |
| May | `data/lane2/contribution_limits.json` (HSA rows) | The IRS revenue procedure under IRC 223(g) for the next year | Published each May |
| June | `data/states.json` (`autoInsuranceFullCoverageAnnualCents`) | Bankrate average cost of car insurance by state | Bankrate refreshes its state study around mid year |
| July | `data/lane2/studentloans.json` | studentaid.gov repayment plan pages; the Federal Register for RAP rules; IRC 108(f)(5) | Plans open and close to new borrowers on 1 July |
| August | `data/aca.json` (applicable percentages) | The IRS revenue procedure under IRC 36B(b)(3)(A)(ii) for the next plan year; Congress.gov for premium tax credit legislation | Published in the summer for the following year |
| August | `data/states.json` (`propertyTaxEffectiveRate`) | Tax Foundation property tax by state (Census ACS five-year) | The Tax Foundation piece follows the ACS release |
| September | `data/bands.json` | Nothing external: re-read the `DECIDE:` lines with Eli | Opinions and readings of books; an annual look is enough |
| October | `data/tax_brackets.json` | The IRS annual inflation adjustment revenue procedure (brackets, deductions, capital gains, gift exclusion); ssa.gov/oact/cola/cbb.html for the wage base | Both are announced in October with the COLA |
| October | `data/lane2/contribution_limits.json` (gift rows) | The same inflation revenue procedure, IRC 2503(b) | Same release |
| November | `data/lane2/contribution_limits.json` (plan and IRA rows) | The IRS COLA notice for retirement plans (irs.gov newsroom) | Published in early November |
| November | `data/states.json` (`acaBenchmarkSilver40MonthlyCents`) | KFF State Health Facts, marketplace average benchmark premiums, new plan year | Rates for the coming plan year are final by open enrollment |
| December | `data/states.json` (`costOfLivingIndex`) | MERIC Cost of Living Data Series, annual average | The annual average closes with the year |

## How a refresh is done

1. Open the source in the row, read the figure, and change the value in the compact table in `tests/tools/build-data-tables.js` (not in the JSON by hand).
2. Set the cell's `asOf` to the source's publication date, its `confidence` to `sourced`, and remove `verify`.
3. Run `node tests/tools/build-data-tables.js`, then `node tests/data.test.js`; the notes list any figure that still disagrees with the copy an engine reads.
4. Commit the data change on its own, one file per commit, with the source in the message.

## What was not fetched

The session that wrote these tables could search the web but could not open a page, so most cells are `recalled` from memory of the named edition and carry `verify: true`. The `sourced` cells are the ones a search result quoted directly: the 2026 federal brackets, deductions and capital gains thresholds; the 2026 retirement, IRA and HSA limits and phase-outs; the 2026 wage base; the 2026 poverty guidelines; the 2026 applicable percentage band ends; the student loan plan statuses; and a handful of state extremes (Massachusetts, Michigan, New York, Rhode Island and Washington UI maxima; New Hampshire and Vermont ACA benchmarks). The first pass through this calendar should be a full one.
