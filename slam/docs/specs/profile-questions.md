# Profile questions (Phase 2.5 B3)

Written from `engine/profile.js` by `node tools/profile-doc.mjs`; do not edit by hand. Every question changes at
least one of: which fields show, what a number means, the starting guess, or what the app does. "Not sure" is on
the client's before-the-call page only; the Profile asks for an answer. Changing an answer hides fields and never deletes them; switching back shows what was typed. Each change is
logged as a life change with its date, and Undo takes it back. A number never changes which fields show.

Where it lives: its own page (profile.html), opened by tapping the client's name in the header. The six tabs do not
change. Each area ends with one line saying what it set up (for example "Shows Rent, your share, Utilities, your share").

## Level 1: before the call

The client's page "Before our first call" (before.html): about 5 minutes, facts only, taps only, the areas as cards in
any order. The one number is the gut number ("About how much do you spend a month? Your best guess, don't look
anything up"), saved to Numbers as a guess. "Send my answers" saves answers-<first name>-<date>.json: "Email or text
this file to Eli." It never asks for account numbers or logins, and the answers stay on the phone until sent. On the
Profile page, "Import answers" fills the Profile and the gut number and shows what it set up.

### Why now

- **What made you reach out now?** (Debt feels out of control / Money is tight every month / A big change is coming / Other, or Not sure). Where the first call starts.
- **What would make this worth it for you?** (A clear plan I can follow / A date I am debt free / Saving for something big / Other, or Not sure). What a good result looks like, so we can measure it.
- **How stressed do you feel about money? (1 is calm, 10 is very)** (1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10, or Not sure). Saved with its date, so later sessions can show the change.
- **How often are you paid?** (Every week / Every 2 weeks / Twice a month / Once a month / It varies, or Not sure). Puts paydays on the Calendar.
- **About how much lands in your account a month?** (Under $2,000 / $2,000 to $4,000 / $4,000 to $6,000 / $6,000 to $8,000 / Over $8,000, or Not sure). A ballpark, so the first call starts in the right place.
- **Anything else you would like me to know?** (text, or Not sure). Your own words, for the first call.

### You

- **Your first name** (text, or Not sure). Names the household on every page.
- **The year you were born** (year, or Not sure). Sets your age for the cushion target, Coast FI and the turning-26 switch.
- **The state you live in** (state, or Not sure). Picks the state tax.
- **Your county** (text, or Not sure). Picks a local tax where there is one.
- **Who lives with you?** (Just me / A partner / Kids / Roommates, or Not sure). Kids shows childcare; with a partner, a new housing or food line starts shared, half each; with roommates, rent and the bills read as your share.
- **How many roommates?** (1 / 2 / 3 / 4 or more, or Not sure; asked only when it applies). Rent and the bills read as your share.
- **How do the two of you handle money?** (All joint / All separate / Mixed: joint for shared bills, separate for the rest, or Not sure; asked only when it applies). Sets whose a new account or debt starts as, and how shared bills split between you. Your totals stay the same.
- **How should I talk to you?** (Gently / Straight to it / Numbers only, or Not sure). Sets how Today words the next step; it never changes a number.

### Home

- **Where do you live?** (I rent / I own / With family, or Not sure). Shows rent or a mortgage and the bills that go with it.
- **Whose family?** (My parents / A partner's family / Other family, or Not sure; asked only when it applies). Names who covers the bills they pay for you.
- **What do you pay your family?** (Rent / Some bills / Nothing, or Not sure; asked only when it applies). Rent becomes "paid to family"; utilities are covered unless you pay bills.
- **Is there a mortgage?** (A mortgage / Paid off, or Not sure; asked only when it applies). Shows the mortgage, or only the property tax and insurance.
- **Moving in the next year?** (Yes / Maybe / No, or Not sure). Adds moving costs as a goal to plan for.

### Getting around

- **How do you get around?** (My own car / A car with a loan / A leased car / Transit / Rideshare / A mix, or Not sure). Shows the car costs, a loan or lease, transit or rides.

### Work

- **What kind of work?** (A job (W-2) / Self-employed / Both / Between jobs / Student / Retired, or Not sure). Shows the pay fields that fit and the tax set-aside on self-employed pay.
- **How are you paid?** (Salary / By the hour / Some of each, or Not sure; asked only when it applies). Salary is a yearly amount; by the hour is rate x hours.
- **Any extras?** (Bonus / Overtime / Tips / Commission / None, or Not sure; asked only when it applies). Each extra gets its own line, so the steady part stays steady.
- **What does work offer?** (401(k) or similar / Health insurance / HSA / FSA, or Not sure; asked only when it applies). Opens those accounts in the session.
- **Paying quarterly taxes?** (Yes / No, or Not sure; asked only when it applies). No or not sure turns on a set-aside on every deposit.
- **Getting unemployment?** (Yes / No, or Not sure; asked only when it applies). Shows the weekly benefit and its end date.
- **When does it end? (if you know)** (date, or Not sure; asked only when it applies). Ends the benefit on the Calendar.
- **Work for a nonprofit, government or school?** (Yes / No, or Not sure). Shows Public Service Loan Forgiveness on federal student loans.

### Money with other people

- **Get money from family or a partner?** (Yes / No, or Not sure). Shows money from a person, taxed the right way.
- **What is it?** (Gift or support / Allowance / Child support / Alimony / A loan, or Not sure; asked only when it applies). A gift and child support are not taxed; a loan becomes a debt.
- **Do you give money regularly?** (Family support / Tzedakah or maaser / Child support / None, or Not sure). Shows each as a line; maaser as a share of pay.

### Debt

- **Planning to apply for credit in the next 12 months?** (Yes / No, or Not sure). A loan, a card or a lease: card use then comes first, since it is part of a credit score.
- **Which debts do you have?** (Credit cards / Student loans / Car / Mortgage / Personal loan / Owed to family / Buy now, pay later / Medical / None, or Not sure). Opens each debt in the session.
- **Student loans: federal or private?** (Federal / Private / Some of each, or Not sure; asked only when it applies). Federal loans show plans and forgiveness.
- **In the last 3 months, did you pay the full statement?** (Always / Sometimes / No, or Not sure; asked only when it applies). Always means cards are paid in full; otherwise the rate matters.
- **Behind on any payment right now?** (Yes / No, or Not sure). Yes opens "When it won't all get paid" first.

### Accounts

- **Which accounts do you have?** (Checking / Savings / 401(k) or similar / IRA / HSA / Brokerage / Crypto / None, or Not sure). Opens each account in the session.
- **Emergency money kept apart from checking?** (Yes / No, or Not sure). Yes shows an emergency fund account.

### Health

- **Where is your health insurance from?** (Work / A parent's plan / My own plan / Marketplace / Medicaid / Medicare / Other / None, or Not sure). A parent's plan sets the turning-26 switch on the Calendar.

### Protection

- **Do you have disability insurance?** (Through work / My own policy / None, or Not sure). Pays part of your income if you cannot work. Missing, it becomes a step after the starter emergency fund.
- **Do you have renters or home insurance?** (Yes / No, or Not sure). Covers your things and liability. Missing, it becomes a step.
- **Does anyone depend on your income?** (Yes / No, or Not sure). If someone does, life insurance and a will matter.
- **Do you have life insurance?** (Through work / My own policy / None, or Not sure). Needed when someone depends on your income.
- **Are the beneficiaries on your accounts up to date?** (Yes / No, or Not sure). Retirement accounts go to whoever is named, whatever a will says.
- **Do you have a will?** (Yes / No, or Not sure). Says who looks after your kids and your things.

### Spending style

- **How do you keep track now?** (I don't / An app / A spreadsheet / Statements, or Not sure). Spending opens on what fits: adding purchases, or importing a statement.

### Goals

- **Pick your top 3** (An emergency fund / Out of debt / Buy a home / A car / Travel / A wedding / Kids / Start investing / Start a business / School, or Not sure; up to 3). Adds those goals, ready for an amount and a date.
- **Financial independence?** (Yes / Curious / Not now, or Not sure). Not now keeps FI off Today.

## Level 2: in the session

Coach-guided. Opens only for what Level 1 ticked; listed on the Session's first screen ("To ask today").

### Work

- **How secure is your income?** (Solid / Okay / Shaky). Okay adds a month to the cushion; shaky adds three.
- **Pay changes coming?** (Yes / No). Yes puts the change on the Calendar with its date.
- **Your pay rate (yearly salary, or hourly rate and usual hours)** (a number in My numbers; find it in your paystub).
- **Business structure** (Just me (sole) / LLC / S corp). An S corp pays you a wage; the rest stays 1099.
- **A separate business account?** (Yes / No). No adds "open a business account" to the to-dos.
- **Retirement through the business** (None / SEP IRA / Solo 401(k)). Opens that account.

### 401(k) or similar

- **401(k): traditional, Roth or both?** (Traditional / Roth / Both). Sets whether it lowers your tax now.
- **What goes in (% or $ per check)** (a number in My numbers; find it in your paystub).
- **The match formula and vesting** (a number in My numbers; find it in your benefits site or HR).
- **Getting the full match?** (Yes / No). No or not sure puts "Get the match" first.
- **Old 401(k)s at past jobs?** (Yes / No). Yes adds them as accounts to find.

### IRA

- **IRA: traditional or Roth?** (Traditional / Roth / Both). Sets the IRA type.
- **Any pre-tax IRA money?** (Yes / No). Yes warns before a backdoor Roth.

### HSA

- **HSA through payroll?** (Yes / No). Through payroll skips Social Security and Medicare tax.
- **HSA invested or cash?** (Invested / Cash). Invested counts toward FI.
- **Saving receipts?** (Yes / No). No adds "keep receipts" to the to-dos.

### Brokerage

- **What is in the brokerage, and its fee** (a number in My numbers; find it in the plan or brokerage site).

### Cards

- **Each card: which card, business or personal, rate, due day, limit, any 0% promo and its end** (a number in My numbers; find it in the card app or a statement).

### Student loans

- **Student loans: federal or private, plan, rate, forgiveness and payments made** (a number in My numbers; find it in studentaid.gov or your loan servicer).

### Car

- **Car: rate, payment, payoff date; a lease's miles and end** (a number in My numbers; find it in the lender app).

### Mortgage

- **Mortgage: rate, years left, PMI, taxes and insurance in the payment** (a number in My numbers; find it in the lender app).

### Health

- **A high-deductible plan?** (Yes / No). Yes opens an HSA.
- **Deductible, out-of-pocket max and premium** (a number in My numbers; find it in your benefits site or HR).
- **Big medical costs expected?** (Yes / No). Yes adds a medical goal.

### Debt overall

- **Which debt stresses you most?** (a number in My numbers).

### Goals

- **Each goal: amount and date** (a number in My numbers).
- **One goal at a time, or several?** (One at a time / Several at once). Sets how the Plan funds goals.

### Statements

- **The last 2 statements for each card and bank account, as CSV** (a number in My numbers; find it in bank statements).

## Level 3: homework

Every Level 2 question on the Profile has "I know it" (type it) or "I'll look it up" (a to-do with where to find it);
the Profile has no "Not sure" (owner, 2026-10-27; the client's before-the-call page keeps it). The to-dos print on the One-pager and in the Profile's To-dos, grouped by
where to find each item:

- Your paystub
- Your benefits site or HR
- The plan or brokerage site
- The card app or a statement
- studentaid.gov or your loan servicer
- The lender app
- Last year's tax return
- Bank statements

Plus the last 2 statements for each card and bank account, as CSV.
