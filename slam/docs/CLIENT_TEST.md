# Client test: a first session in under an hour

What a first call looks like, step by step, for one person and for a couple, with the time each step takes. The
times come from `tools/friction-audit.mjs`, which plays the coach on made-up households and counts every tap, typed
answer and result talked through at a steady pace (5 seconds a tap, 45 seconds a typed answer, a minute for each
result talked through). The full numbers are in `docs/FRICTION_AFTER.md`.

## The pass mark

- One person: under 60 minutes, start to the printed one-pager. Measured: Maya (renter, one W-2) about 32 minutes;
  Dre (homeowner, a W-2 and 1099 work, a mortgage) about 41 minutes.
- A couple: under 60 minutes. Measured: Jordan and Sam (New York City, two W-2s, joint and separate accounts, one
  student loan) about 35 minutes.

## Screen one and screen two

Screen one is what is asked on the call: the boxes in each Session row and the yes / no questions under it. Screen
two is everything else, in each item's More drawer in My numbers (press M). What moved this run:

- Details that are asked outright ("Which kind of federal loan?", "Rate and monthly payment") are boxes now, not
  Yes / No / Not sure questions. A box the row already has is not asked again under it.
- Protection stays on screen two (My numbers, Protection). It comes up on the call only when the Plan's protection
  line shows a gap.
- No question moved from screen one to screen two: every household finished well under the hour.

## The script, one person (about 30 to 40 minutes)

| Step | What you do | Minutes |
|---|---|---|
| Start | Client menu, + New client, type the name, Create | 1 |
| Debt | "Just you, or the two of you?": Just me. Yes to each kind of debt; owed, rate, payment, due day on each row | 5 to 8 |
| Assets | Yes to a plan at work and savings; a balance on each; the match, tier by tier | 4 to 7 |
| Taxes | Filing status, where you live | 1 |
| Income | + Add income: name, amount, how it is paid, how often | 3 to 5 |
| Needs | The amount on each line that applies | 6 to 8 |
| Goals | + Add a goal: name, amount, by when | 2 |
| End | End call, Print or save the one-pager, talk through the next step | 3 |

Each step ends with "You now have ... Next this unlocks ...": read it out, it is the result for that step.

## The script, a couple (about 35 to 45 minutes)

Same steps, plus:

| Step | What you add | Minutes |
|---|---|---|
| Debt | "The two of us": the partner's name, birth date, how you file. Then a Whose box on every debt | +2 |
| Assets | Whose on each account (Joint for shared accounts) | +1 |
| Income | Whose on each paycheck | +1 |
| Needs | Shared bills split half each unless you change it (Who this is for, at the top of Debt; or a line's More) | 0 to 1 |
| End | The headline strip's Together / each person toggle; the one-pager's Yours, theirs and joint | +1 |

A new item starts as whoever you picked last, so a run of joint accounts takes one pick, not one each.

## What still costs time

- About a minute in total where a box inside a form needs a tap to reach (the add form uses Tab, not Enter).
- Picking Whose on every item for a couple: about 15 seconds each.

## Run it again

```
cd slam && python3 -m http.server 8766 &
SLAM_URL=http://localhost:8766/ node tools/friction-audit.mjs --before docs/friction-before.json --json docs/friction-after.json --out docs/FRICTION_AFTER.md
```
