# Trunk test

Krug's trunk test, run by `tools/trunk-test.mjs` on the made-up example household: every main tab, every second-level tab, and a level-3 (group) and level-4 (item) screen in each section, at phone (390px) and computer (1280px) width. Pass is a check mark.

- Site ID: "Stress Less About Money" shows top left.
- Page name: the page title shows.
- Sections: the five main tabs show.
- Local options: the second-level tabs, the siblings strip or the screen's own choices show.
- You are here: the current main tab (and second-level tab, where there is one) is marked with two cues at once, a fill and bold.
- Search: the search box shows.
- First action: the first thing to do is on screen without scrolling.

Result: 60 of 60 screens pass every check.

| Level | Screen | Width | Title | Site ID | Page name | Sections | Local options | You are here | Search | First action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | dashboard.html | phone | Home | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | ledger.html | phone | Numbers | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | plan.html | phone | Plan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | calendar.html | phone | Calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | spending.html | phone | Spending | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/needs | phone | Needs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/debt | phone | Debt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/income | phone | Income | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/assets | phone | Assets | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/goals | phone | Goals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/protection | phone | Protection | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | plan.html#/debt | phone | Debt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | plan.html#/retirement | phone | Retirement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | plan.html#/protection | phone | Protection | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | windfall.html | phone | Extra money | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/needs/housing | phone | Housing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/needs/housing/rent | phone | Rent | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/debt/credit-cards | phone | Credit cards | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/debt/credit-cards/visa | phone | Visa | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/income/paychecks-w-2 | phone | Paychecks (W-2) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/income/paychecks-w-2/salary | phone | Salary at Hudson Valley Health | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/assets/ira | phone | IRA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/assets/ira/roth | phone | Roth IRA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/goals/your-goals | phone | Your goals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/goals/your-goals/fi | phone | Financial independence | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/taxes/tax-withheld | phone | Tax withheld | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | plan.html#/max-it | phone | How much to max it | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | calendar.html#/2026-11 | phone | Calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html?guide=1#/needs | phone | Needs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html?guide=1#/debt | phone | Debt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | dashboard.html | computer | Home | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | ledger.html | computer | Numbers | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | plan.html | computer | Plan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | calendar.html | computer | Calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | spending.html | computer | Spending | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/needs | computer | Needs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/debt | computer | Debt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/income | computer | Income | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/assets | computer | Assets | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/goals | computer | Goals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | ledger.html#/protection | computer | Protection | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | plan.html#/debt | computer | Debt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | plan.html#/retirement | computer | Retirement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | plan.html#/protection | computer | Protection | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | windfall.html | computer | Extra money | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/needs/housing | computer | Housing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/needs/housing/rent | computer | Rent | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/debt/credit-cards | computer | Credit cards | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/debt/credit-cards/visa | computer | Visa | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/income/paychecks-w-2 | computer | Paychecks (W-2) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/income/paychecks-w-2/salary | computer | Salary at Hudson Valley Health | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/assets/ira | computer | IRA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/assets/ira/roth | computer | Roth IRA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/goals/your-goals | computer | Your goals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html#/goals/your-goals/fi | computer | Financial independence | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html#/taxes/tax-withheld | computer | Tax withheld | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | plan.html#/max-it | computer | How much to max it | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | calendar.html#/2026-11 | computer | Calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | ledger.html?guide=1#/needs | computer | Needs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ledger.html?guide=1#/debt | computer | Debt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
