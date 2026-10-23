# Decisions, and why

The decisions that shape SLAM, each as **Decision / Why / What we rejected**, pulled from the
dated log (`../slam/DECISIONS.md`, rows S-001 to S-139), the rules file (`../slam/LESSONS.md`),
the code, the commit history, and the earlier generations' records in `../archive/`. Row numbers in
parentheses are citations into the dated log; "lesson N" cites the rules file. Anything the records
do not actually say is marked **(inferred, needs confirmation)** and listed again in the final
report of the cleanup pass.

The dated log stays the record of truth: one row per decision, newest last. This page is the
reader's guide to the ones that matter.

## 1. Every value carries a status, and empty is not zero

**Decision.** Every amount in SLAM is a Value: the number, how often it comes (cadence), how sure
we are (status: known, roughly, will-email, dont-know, not-for-me, guess, computed), who said it
(source). A blank Value is `amount: null, status: null` and shows as a "Blank" chip (S-002,
lesson 2). A missing number stays `null` all the way through the engines; `money.js` never turns a
`null` into a 0, so a total that needs a missing balance is `null` and names the gap (S-111).

**Why.** In the earlier generations the coach could not tell what was done, rough, unknown, or
computed (lesson 2). "Not asked yet" is different from "I don't know", and a zero that nobody typed
is a lie in a budget (S-002; the rule was already a non-negotiable in SPARKS).

**What we rejected.** An eighth status word for "not asked yet" (S-002). Counting a blank item as
zero in a split (S-061), a stress rating of null as 0 (S-082), or a missing part as 0 (S-113).

## 2. Money is stored as the dollars the client typed

**Decision.** Amounts are stored as typed, in dollars as a JavaScript number, and formatted only at
display; tests compare to the cent (S-009). Where many fractions are added (card interest, split
payments, a cash calendar) the engines round to the cent with the three helpers in
`src/engines/money.js` (`r2`, `r2OrNull`, `r2Exact`; S-074, S-119, S-133).

**Why.** "Storing what the client said keeps their own words exact" (S-009). The brief for SLAM
defined `amount: number`.

**What we rejected.** Integer cents, which SPARKS and Money Rooms v3 used everywhere in storage and
formulas (SPARKS D-004, "units, locked"). SLAM's own log does not record why it went the other way;
the practical reason is the first one above, and the cost is a known issue (`../KNOWN_ISSUES.md`
item 3). **(partly inferred, needs confirmation)**

## 3. One number store, pure engines, screens that only format

**Decision.** The household is one JSON document in the store (`src/store/`), every number is
computed in one library of pure functions (`src/engines/`), and the screens read one summary
object and format it (lessons 1 and 3). A number can be asked "how was this worked out" and the
panel and the number cannot disagree, because both come from the same function (S-108).

**Why.** "The same fact was asked in several places and drifted" and "each room ran its own math
and they disagreed" (lessons 1 and 3): the 93-room generation computed the same rate several ways.

**What we rejected.** Per-screen math, over and over. The self-audits removed duplicated facts
(roommate share, category boxes, cash on hand, coverage asked in three places: S-035, S-036,
S-084, S-117), and the 2026-10-23 cleanup moved the last fourteen computations out of the screens
(`AUDIT.md`, section 7).

## 4. The estimate is the client's own words and is never overwritten

**Decision.** The client's estimate stays as the client gave it. Last month's actual, the personal
correction and the decisions made in review go into a separate monthly plan,
`doc.plans['YYYY-MM']`, the only place plan amounts live (S-076, S-078, lesson 17). The budget
shows estimate, plan and actual side by side with the gaps between them (S-077). Every change a
client makes to an estimate is appended to an estimate log (S-090).

**Why.** "Estimate vs actual measures how well they knew themselves" (S-078). An app that
"corrects" the estimate destroys the one number that shows a client learning.

**What we rejected.** "Break down" clearing the client's number into a note (S-065, replaced by
S-078). "Use last month's actual" writing the estimate. Guesses filling an answered estimate. A
dream column inside the budget table (S-097: "the budget is estimate vs actual"; the dream moved
to Eras).

## 5. The menu is the monthly loop

**Decision.** The screens are Today, Plan, Track, Review, Insights and Setup, with Clients behind
the client's name (S-105, S-106). Each section has exactly one home. Insights is read-only.
One-time setup is never mixed with weekly use. Today shows numbers, not charts, and every chart is
one tap away (lesson 7 as rewritten in S-116).

**Why.** "The app grew to 67 rooms, then 4 screens became junk drawers" (lesson 5). The trigger was
an audit that found the Analyze screen was 41 phone screens tall for one demo household (S-106).
A coach does the same three things every month, in order; the menu should say so.

**What we rejected.** "At most four screens" (the earlier lesson 5), four key charts on the Budget
screen (S-034, removed by S-106), a 30-day sparkline on Today's cash strip (S-116), a net worth tile
on Today (S-114). Next stage, Eras and the dream life were parked behind a switch (S-105).

## 6. The log owns the money

**Decision.** During the month everything goes into one log: quick entries, scheduled bills and
paychecks confirmed with one tap, and bank CSV files matched against what was already logged
(S-085). A line's actual for the month is the sum of its entries, shown as computed, and the store
refuses a typed actual on a line that has entries (S-087). Month-end only fills the gaps. The same
rule covers income (S-118).

**Why.** "Month-end meant typing everything from memory" (lesson 20). One owner per fact.

**What we rejected.** A confirm step that filled actuals from transactions (S-045). Discarding the
old typed actual when the log took over: it is kept as a labeled adjustment entry instead (S-087).

## 7. Percentages are of take-home, never gross, unless the label says gross

**Decision.** Every share of income uses take-home (lesson 16, S-077). The only figure on gross is
taxes, shown outside the DRAFTT base and labeled "of gross" (S-021, S-072).

**Why.** "Budgets got calculated on gross pay" (lesson 16), and a client does not spend gross.

**What we rejected.** The SPARKS DRAFTT, which measured Retirement and Taxes as shares of gross
(SPARKS D-173).

## 8. DRAFTT is descriptive

**Decision.** DRAFTT (Debt, Retirement, Accommodation, Food, Transportation, plus Therapy when a
therapy line has an amount) shows each letter as a share of the DRAFTT total and of a base equal to
take-home plus pre-tax retirement, so DRAFTT plus everything else plus what is left over is exactly
100% (S-072, S-021). No bands, no verdicts, no good and bad colors.

**Why.** The owner's instruction: DRAFTT "should describe proportions, with no healthy bands,
verdicts, or good and bad colors" (S-072). Benchmarks that could not be verified should not grade
anyone (S-020).

**What we rejected.** The graded version from SPARKS (seven shares against seven bands, one verdict
word a row, D-173), the four band sources and the `judge()` function (S-072), a benchmark source
picker. Kept: the 50/30/20 lens and the 35% housing line. Parked: a comparison to someone else's
proportions "as a reference, never a grade" (`../slam/PARKING_LOT.md`).

## 9. DAITE is not used in SLAM

**Decision (inferred, needs confirmation).** SPARKS organized every number into five money families
(debt, assets, income, taxes, expenses: DAITE, SPARKS D-171). SLAM keeps the same facts as separate
collections (incomes, categories, debts, accounts, with taxes computed) and organizes the screens by
the monthly loop; the word DAITE does not appear under `slam/`.

**Why.** Not recorded. The audit lists DAITE among six vocabularies a newcomer had to learn
(`AUDIT.md`, section 8), and the loop replaced the families as the organizing idea.

**What we rejected.** In SPARKS, rewriting storage into five keys (D-171 made DAITE a view, not a
storage shape). In SLAM, carrying the vocabulary forward: not recorded.

## 10. The bridge: budget surplus to the change in cash, nothing hidden

**Decision.** Every month with balances gets a bridge: surplus, plus yearly costs and set-asides,
card balance change and minimums, reimbursements, one-offs and income timing, equals the explained
change in cash; "not explained yet" is its own step, drawn as an outline, never folded into another
(S-088). The bridge "ties" under a materiality the coach can set, 25 dollars by default (S-096).
The same identity is built for net worth (S-112).

**Why.** "Budget surplus and cash in the bank disagreed and nobody could say why" (lesson 18). It is
the first question every client asks.

**What we rejected.** Not recorded. The checklist at month close says "ties" or "off by $X" rather
than hiding the gap (S-089).

## 11. Two net worths, and what is paid ahead is an asset

**Decision.** Net worth (everything) is all assets less all debts. FI net worth (what can fund your
life) leaves out the home, the vehicle and the debt they secure; the difference is "locked in things
you use" (S-111). A yearly bill paid for months to come is Paid ahead: an asset that does not count
toward FI and runs down by its monthly share (S-119). Owning a home or car is shown next to its
alternative with no verdict (S-113). Milestones are dated events, never grades (S-111).

**Why.** "A house or car felt like wealth but couldn't fund a life" (lesson 22). "Annual bills made
net worth look like it crashed the month they were paid" (lesson 23). "An auditor books a prepaid
bill as an asset" (S-119).

**What we rejected.** The single "what you have and what you owe" net (replaced by S-111).

## 12. Hand-computed households are how the app knows a number is right

**Decision.** Seven made-up households, every expected number worked out by hand in a comment, are
both the demo data and the test data: the demos are loaded from the same files the tests check
(S-025, lesson 11). The browser check compares what the screens show to the same answers (S-038).
The small round-number tests added in the cleanup are the entry point (`../slam/tests/engines-roundnumbers.test.js`).

**Why.** "We skipped hand-checked tie-outs to move fast, and errors surfaced late" (lesson 11).
"Hand-checked households are how this app knows a number is right" (S-115).

**What we rejected.** Putting the browser tie-out inside `node --test`, so the math tests run
anywhere with plain Node (S-038). Generating the expected answers by running code: Money Rooms v3
wrote its workpapers with a Python script that read the fixtures, SLAM writes them by hand.

**Excel-first validation (inferred, needs confirmation).** Nothing in `slam/` mentions Excel or a
spreadsheet. The nearest records: the owner's Buy vs Rent workbook was the source a Money Rooms v3
model was ported from (`../archive/money-rooms-v3/reference/`), the Marketing Scoreboard had a
spreadsheet twin because "the owner trusts a cell over an app" (MD-010), and SPARKS could export a
spreadsheet (D-222). If "the math is checked in Excel first" describes how the owner works, it is
not written down anywhere in the repository.

## 13. Reference data is a file with a source and a year, and a guess says so

**Decision.** Tax constants (2026, from Rev. Proc. 2025-32), spending averages and benchmarks live
in `src/data/*.json`, each with its source and year; what could not be verified is marked a
placeholder in the file and labeled "Guess" with its source on screen (S-008, S-020, lesson 15).
The take-home guess from gross is "simple and conservative" and always says "State tax not
included" (S-013).

**Why.** "Averages were presented like facts" (lesson 15). The higher 2026 brackets and the wage
base were entered from memory and flagged rather than silently trusted (S-008).

**What we rejected.** ZIP codes and a cost-of-living tier, which "added false precision" (S-070).
State tax tables (S-099). Verified averages and cost-of-living scaling are parked, not promised.

## 14. Records that can be shared later, without a rewrite

**Decision.** Every record carries a stable id, created and updated timestamps, who created and
updated it (coach or client) and a version; nothing is hard-deleted; all storage goes through one
async interface; who sees what is decided in one visibility map; "View as client" shows the client's
view from that map (S-096, S-098, lesson 21). Two copies of a client file merge record by record
and a record changed on both sides is a conflict the coach picks.

**Why.** "Single-user shortcuts would have blocked sharing later" (lesson 21). The hosted version
with a coach sign-in and a client view is the stated direction (`../slam/HOSTING.md`).

**What we rejected.** Replacing a client wholesale on import (S-004, replaced by the merge in S-096).
A hard delete of a client (S-098). Where to host, how to sign in and what it costs are undecided.

## 15. Static files, no build step, no dependencies

**Decision (inferred, needs confirmation).** The app is plain HTML and ES modules served as they
are. Charts are hand-drawn SVG so there is "no dependency to pin" (S-031); the unit tests use Node's
own runner so they "stay dependency-free" (S-038); Playwright is used only by the optional browser
tools. No row records the choice as such; it is inherited from SPARKS, whose rules said "no build
step, no framework requirement, no server".

**Why.** The owner is not a coder and needs to be able to open a file and read it; a build step is
one more thing that can break between sessions. Money Rooms v2, the one generation with a build
step (Vite and TypeScript), was not continued.

**What we rejected.** Frameworks, bundlers and chart libraries. The 2026-10-23 cleanup added a root
`package.json` so that `npm test` exists; the app itself still has no dependencies.

## 16. Versioned export and import, with a snapshot before every import

**Decision.** Export and import are versioned JSON with a `format` and an `exportVersion`; a newer
file is refused; before any import every household in the browser is copied into a backup, the last
ten kept (S-004, lesson 9). Undo and redo keep whole-document copies, up to 200 steps per open
client (S-003).

**Why.** "Data lived only in localStorage with no backup" (lesson 9). Importing your own export
should act as a restore (S-004). Households are small, so whole copies are simpler than diffs
(S-003).

**What we rejected.** Not recorded.

## 17. SLAM lives in a folder of this repository

**Decision.** SLAM started as a self-contained `slam/` folder on a branch of the existing repository
rather than a new one, reading and changing nothing outside it (S-001).

**Why.** The build environment's GitHub tooling was not signed in, so a new repository could not be
created that day; the folder "can be split into its own repo with one command" (S-001).

**What we rejected.** A new repository, blocked by tooling rather than by preference. The cleanup
pass kept `slam/` as the app folder for the same reason it was easy to keep: two open branches
continue it there.

## 18. Coach-operated, one client at a time

**Decision.** A coach runs SLAM live with a client, one household at a time; the client list is
behind the client's name; "View as client" hides coach-only fields and swaps the wording while
edits are still stamped as the coach (S-096, S-106). Today, everyone is the coach
(`src/store/session.js`).

**Why.** It is the shape every generation since Coach Mode has kept: the coach drives the session.
The visibility map exists so a client sign-in can be added without deciding anything twice
(lesson 21).

**What we rejected.** Not recorded. A client logging entries from their own phone is parked
(`../slam/HOSTING.md`, item 5).
