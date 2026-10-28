# The map (S-280 to S-288): every page and where it lives, at all four levels

Levels: 1 a main tab, 2 a second-level tab, 3 a group (Credit cards), 4 an item (Amex Gold); a field opens on the
item. The header is the same on every page: the site ID (to Home), the client with the switcher, the search box, Undo,
Redo, End call, the Coach gear. Below it the five main tabs; below them, on Numbers and Plan, the second-level tabs;
below level 2, the trail from the client ("Maya > Numbers > Debt > Credit cards > Amex Gold") with Back beside it, then
the page title, word for word the label that was tapped.

## Level 1: the five tabs

| Tab | Page | What is on it |
|---|---|---|
| Home | `dashboard.html` | the headline strip (four numbers and the Money as time switch), their money in one sentence, Checking under the floor (only when it is), What we are doing today (where the call stopped, the open to-dos), Do this next (the three things worth filling), Drag to see the future (three sliders), Before our first call (while it has open items), All my numbers today (folded: the tiles, Do this next in full, Where the money goes, the guesses) |
| Numbers | `ledger.html` | the six sections as rows, Still guessing, Quick add; the Guide me switch (on: the six steps in order with Back and Next; `session.html` lands here at the last step) |
| Plan | `plan.html` | Overview: What to do next, in order (the ladder), then What is left after saving, Paychecks, When can I stop working?, What if I changed something?, Bills I could lower with a call, What an hour of my work is worth, Where my take-home goes, If my income stopped, Goals, The next three months, A big change coming, Saved what-ifs, Save or load my numbers |
| Calendar | `calendar.html` | the lowest day, Did these happen?, the month (Month, Week, List, Year views), Dates to know, Cash by day, the month in words, Bill timing, Maybe money, the Debt views |
| Spending | `spending.html` | Log it / My budget; Safe to spend, Add a purchase, Where the money goes, What goes out in four layers, Can I afford this?, Update my balances, Add a bank statement, Move what is left at month end, Fixed bills and the rest, How I compare to a common guide, Price increases and free trials |

Off the tabs, by design: Profile (from the client's name in the header), Before our first call (`before.html`, the
client's own page: a card on Home while open), Where to find each number (`where.html`, from that card and the gear),
the One-pager (`onepager.html`, an action: Print one-pager from End call and Home), End call (`dashboard.html#/end`).

## Level 2: the second-level tabs

| Under | Tab | Address | What is on it |
|---|---|---|---|
| Numbers | Needs | `ledger.html#/needs` | the seven groups (Housing, Food, Getting around, Bills and subscriptions, Health, Fun, Other), Subscriptions, Covered by others |
| Numbers | Debt | `ledger.html#/debt` | the debts by kind (Credit cards by bank, Student loans, Car loans, Mortgages, ...) |
| Numbers | Income | `ledger.html#/income` | Paychecks (W-2), Self-employed (1099), other money in; in Guide me the two tax questions first (how you file, where you live); the old Taxes screen sits under it |
| Numbers | Assets | `ledger.html#/assets` | Cash, Employer retirement, IRAs, Investing, Things you own, Owed to you |
| Numbers | Goals | `ledger.html#/goals` | Your goals, Financial independence and its assumptions |
| Numbers | Protection | `ledger.html#/protection` | the policies (health coverage is in the Profile) |
| Plan | Overview | `plan.html` | the ladder and the rows above |
| Plan | Debt | `plan.html#/debt` | Pay off my debt, in order; When each debt is gone; the Debt views (When your debt is gone, Which debt first?, Clear it by a date, Is a balance transfer worth it?, How full my cards look to the credit bureaus, Which card should I use?, Student loans) |
| Plan | Retirement and tax | `plan.html#/retirement` | Save for later, in order; How much to max it?; the tax buckets, bracket room, fees in dollars |
| Plan | Protection | `plan.html#/protection` | the four protection checks and the backstop |
| Plan | Extra money | `windfall.html` | a lump sum through the house order |

## Level 3: groups

`ledger.html#/<section>/<group>`: Housing, Food, Getting around, Bills and subscriptions, Health, Fun, Other under
Needs; Credit cards (then each bank's heading), Federal student loans, Car loans, Mortgages and so on under Debt;
Paychecks (W-2), Self-employed (1099) under Income; Cash, Employer retirement, IRAs, Investing, Things you own under
Assets; Your goals under Goals; the policy kinds under Protection. A group screen shows the siblings strip (the other
groups of its section, this one marked), Looks right when it has guesses, the items as rows with their figure, Need or
Want, "covered today" and the counts, and + Add.

## Level 4: items

`ledger.html#/<section>/<group>/<item>` (Amex Gold, Rent, Work 401(k), Salary at Northwind): the siblings strip (the
other items of the group), Whose (a couple), Looks right, What it has (the guessed answers in one line, each phrase
opens its own question; the full list folded under it), screen one's rows (what moves a headline number or the client
knows on the spot), the More drawer (screen two, folded), How you feel about it, the card's charges, How much to max
it?, the coach's note, Duplicate and Delete. A field opens on the item (`ledger.html#debts.amex.balance` lands here
with the box open); every link in the app (search, to-dos, Do this next, shared items) lands on the exact item with its
field open.

## The gear (coach only; never on a client print or in Guide me)

Rules (`rules.html`), House defaults (`house.html`), Assumptions (`assumptions.html`), All formulas (`math.html`),
Where each number came from (`plan.html#/sources`), Builder (`builder.html`: the Design kit `affordances.html`, the old
client list `clients.html`, Where to find). Show the math stays as the fold on each number.

## Old addresses

`index.html` opens Home; `session.html` opens Numbers with Guide me on at the last step; `session.html#/end` opens End
call; `ledger.html#<field path>` opens the field's item; `windfall.html` is Plan > Extra money; the Taxes screen is
under Income.
