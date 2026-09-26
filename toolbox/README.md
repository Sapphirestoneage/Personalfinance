# The Toolbox

Ten calculators beside SPARKS, the way `coach/` and `dnd/` sit beside it. Each
is one question with a number for an answer: the kind that arrives as a letter,
an offer or a paystub, and that no room answered. They read the household where
a box can start from it and write nothing back. Nothing in `rooms/`, `shared/`,
`engines/` or `data/` changes for them, and nothing in SPARKS depends on them.

Open `toolbox/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/toolbox/`).

## The ten

| # | Page | The question | Engine |
|---|---|---|---|
| 1 | `paycheck.html` | Is the withholding on this paystub right, or is April a refund or a bill? | `engines/paycheck.js` on SPARKS `engines/tax.js` |
| 2 | `refinance.html` | Is a new loan worth its closing costs? Three paths to the last payment. | `engines/refinance.js` |
| 3 | `move-debt.html` | A balance transfer or a consolidation loan against staying put. | `engines/movedebt.js` |
| 4 | `cash-or-finance.html` | 0% for 24 months, or a discount for cash: which leaves you richer? | `engines/cashorfinance.js` |
| 5 | `lump-or-payments.html` | A lump sum now or a payment for life: the implied return and the run-out age. | `engines/lumpsum.js` |
| 6 | `cash-ladder.html` | CDs or T-bills in rungs against one savings account. | `engines/ladder.js` |
| 7 | `three-paychecks.html` | Which months hold a third check, and the budget that never counts on it. | `engines/paydays.js` |
| 8 | `plan-loan.html` | What a 401(k) loan really costs, and the bill if you leave the job. | `engines/planloan.js` |
| 9 | `sinking-funds.html` | The yearly bills, spread into a monthly set-aside. | `engines/sinking.js` |
| 10 | `stay-or-move.html` | The rent went up: stay, or move, and the counter-offer. | `engines/stayormove.js` |

`engines/loan.js` is the one amortization loop the loan-shaped tools share.
`common.js` is the head, the form binding and the rendering pieces every page
uses; `toolbox.css` is what they wear on top of `shared/theme.css`.
`data/plan_loan_rules_2026.json` is the one reference file, year-tagged.

**The same ten tools as one workbook:** `SPARKS-Toolbox.xlsx`, built by
`python3 toolbox/tools/build-xlsx.py` from the same data files. Eleven tabs
(a cover, ten tools) plus a Tax Tables tab; every answer is a live formula on
the yellow input cells above it. Rebuild it after changing a tool's maths and
recalculate it (the xlsx skill's `recalc.py`) before committing.

## The rules that carry over from SPARKS

- **No real financial data, ever.** Example numbers sit behind "Try with example numbers".
- **Empty is not zero.** A blank box is `null`; every engine returns an incomplete Result for it and the page shows the reason, never a zero.
- **Money is integer cents** until it is formatted.
- **One formula, one function.** The level payment is `engines/projection.js`; compound growth is `engines/projection.js`; the tax is `engines/tax.js`. The Toolbox reads them in place rather than vendoring copies, because it is served from the same site and nothing in it is meant to leave.
- **No em dash.** `toolbox/test/run.js` checks every file.
- **Nothing rebuilt while in use** (D-034). Every box is in the HTML and only ever has `.value` set.
- **Nine of the ten store nothing.** Sinking Funds keeps its list under `toolbox.sinking.v1` in this browser, never a `slaf.*` key.
- **Every page carries the Content Security Policy** and loads `shared/errlog.js` first, like every SPARKS page.

## Charts

The three hues (`--tb-series-a/b/c`) were validated on the app's dark surface
with the dataviz palette checker: adjacent-pair colour-vision separation and
contrast all pass. Every two-series picture also has a legend and a dashed
second line, so identity is never colour alone.

## Working on it

- `node toolbox/test/run.js` before every commit (also in CI).
- Decisions for this lane are the `TB-###` entries below, not the SPARKS log.

## Decisions (TB-###)

- **TB-001** The Toolbox is a separate app in `toolbox/`, like `coach/` and `dnd/`. One shelf, ten tools, its own tests and this log. Nothing outside `toolbox/` changes for it except one line in CI and the SPARKS decision entry that records it (D-340). Reads SPARKS shared code in place, writes nothing to the household.
- **TB-002** Three chart hues, validated on the dark surface. Text never wears a series colour.
- **TB-003** One amortization loop, `engines/loan.js`. A payment under the first month's interest returns an ok Result with `never: true`: "never" is an answer, not a missing input.
- **TB-004** Refinance runs three paths, including the new loan at the old payment, because a lower payment on a longer term is the trap the tool exists to show.
- **TB-005** Move the Debt costs a path as everything paid minus the balance: interest plus fees, so a fee-loaded transfer and a plain loan compare on one number.
- **TB-006** Pay Cash or Finance compares what is left in the account after the last payment, on the assumption that you hold the price in cash. Deferred interest is a flag with the back interest computed.
- **TB-007** Lump Sum or Payments gives two readings, the implied rate and the run-out age, and refuses to guess a lifespan: the planning age is a box.
- **TB-008** Cash Ladder compares on the tax-equivalent rate when the rungs are Treasuries and a state rate is given; otherwise on the plain rate.
- **TB-009** Three Paychecks counts from the next payday forward and says plainly that semi-monthly and monthly pay have no extra month.
- **TB-010** Borrow From Yourself costs a plan loan as the growth the money misses, plus paused contributions at what they would have grown to. The limits are a data file, not inline.
- **TB-011** Sinking Funds is the one tool with a list, kept under its own key. What the fund should hold today is each bill's accrued share.
- **TB-012** Stay or Move sums both paths over the lease term and names the counter-offer: the rent at which staying costs what moving does.
- **TB-013** Paycheck Check is the paystub check without the parser: five typed lines, the SPARKS tax engine, and the change per remaining check. STATUS.md's "paystub parser: not built" stays true; this is the half that needed no parser.
- **TB-014** The workbook. `SPARKS-Toolbox.xlsx` is the ten tools for someone who finds the app too much: one tab a tool, inputs in yellow, the verdict as a sentence, the 2026 figures on a Tax Tables tab rather than inside formulas. Same maths as the pages (the level payment is PMT, the loop is NPER and FV, the tax is the bracket ladder as one SUMPRODUCT); the pages stay the reference. Verified by LibreOffice recalculation, 762 formulas, no errors, and every verdict matching the page with the same example numbers.
