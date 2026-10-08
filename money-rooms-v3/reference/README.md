# Reference material for Level 13 (Calculators)

Brought in from Eli's own work so Claude Code builds on it instead of starting over.
Nothing here is wired into the app. Read it, reuse what holds up, log what you used in
DECISIONS.md.

| File | What it is | Where it came from |
|---|---|---|
| cashflow-calendar-spec.md | Full spec of the cash flow calendar Eli built (v9 to v44): data model, engine order of operations, every feature, known problems, self-test assertions, and Eli's corrections | Recovered from the build chat. The working cashflow-v44.html and its src/ folder are on Eli's computer and are not in this repo yet |
| BuyVsRent_v3_Final.xlsx | Eli's Buy vs Rent + FIRE workbook (Dashboard, Schedule to 100 years, Charts, Expense Breakdown). Demo values only | Eli's Google Drive |
| LEVEL-13-PROMPT.md | The full Level 13 build prompt, so an overnight run can execute it without anyone pasting it | Written in chat with Eli, 8 Oct 2026 |
| buy-vs-rent-model.md | The workbook's inputs and formulas as text, plus issues to fix when porting | Extracted from the workbook |

If cashflow-v44.html or the cashflow src/ folder is added here later, port its engine and
tests directly (section 0 of the Level 13 prompt).

Status after Level 13 (MR-067): cashflow-v44.html and its src/ folder were not in
the repo, so engine/cashcal.js was built from cashflow-calendar-spec.md; every
difference is listed in DECISIONS.md. The Buy vs Rent workbook was ported into
engine/house.js with the seven fixes from buy-vs-rent-model.md. If the v44 files
arrive, port its 28 engine assertions into tests/engine/cashcal.test.js.
