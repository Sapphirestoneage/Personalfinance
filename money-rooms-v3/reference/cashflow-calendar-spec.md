# Cash flow calendar: the spec of the tool Eli already built (v9 to v44)

Recovered from the build chat ("Interactive cash flow calendar with automatic updates",
July to September 2026). The working file (cashflow-v44.html, plus its extracted
src/engine.js, src/adapter.js, src/main.js and tests) lives on Eli's computer, not in
this repo. If it is added here later, port it directly and treat this file as the map.

Sections 1 to 6 are the v22 architecture spec written in that chat (lightly edited).
Section 7 lists everything added in v23 to v44. Section 8 lists Eli's own corrections,
which override anything above.

---

## 1. Core idea

Everything is one day-by-day simulation run from an anchor date out to a long horizon
(12 years in the original). Every screen is a different view of that same run. There is
no separate budget and forecast: the calendar, the charts, the payoff dates and the plan
ladder all come from one function.

    state -> txns() (generate occurrences) -> simulate() (walk day by day, move money) -> every view

Build the engine first. Everything else is presentation.

## 2. Data model

State is one JSON object, versioned, persisted whole.

### Accounts (one array holds cash and debt)

Cash account: {id, type:'cash', name, color, balance, confirmed, emergency, autoCover}
- The first cash account is primary: card minimums and anything unassigned come out of it.
- emergency marks the emergency fund (drives a months-of-coverage readout).
- autoCover: if primary drops below the safety floor, pull from here automatically.

Debt account: {id, type:'card', name, color, balance, apr, limit, stmtDay, dueDay,
payInFull, minPct, minFloor, promoApr, promoUntil, debtKind, goalNoInterest, payLast,
confirmed, lateFee, penaltyApr, reportDay, annualFee, feeValue}
- debtKind: card | student | auto | other
- promoApr / promoUntil: 0% intro periods. Effective rate = promoUntil && date <= promoUntil ? promoApr : apr.
- payInFull: a charge rail, not a debt. Excluded from debt totals.
- goalNoInterest: "my everyday card" (see 4.6).
- payLast: deprioritised in the payoff order.

### Money movements, four kinds
| Kind | Meaning |
|---|---|
| income | into a cash account |
| expense | out of cash, or onto a card (increases that card's balance) |
| payment | cash to a card, or to a strategy target (avalanche / snowball) |
| transfer | between two of your own cash accounts (saving / investing) |

### Sources that generate movements
| Source | Shape | Behaviour |
|---|---|---|
| once | a single dated item | one occurrence |
| rules (repeats) | {freq, dom/dow/mon, start, end, endCount} | weekly, monthly, quarterly, yearly; endCount stops after N payments |
| subs (subscriptions) | rule + {reimbursed, reimbDays, paused} | optionally emits a matching income item N days later |
| plans (payoff plans) | {total, upAmt, upDate, instAmt, freq, apr} | fixed total; installments stop when the total is met, last one trims to the remainder; with apr > 0 it amortises |
| parked (maybe money) | undated, later dated with a likelihood | not in the projection until dragged onto a date |
| goals and sinking funds | {target, saved, by, repeat, to} | monthly transfer until the date; a sinking fund also spends itself on the date |

### Overrides
One map keyed sourceId|originalDate. Moves, re-prices or skips one occurrence of a repeat
without touching the rule. Also how drag-to-reschedule persists.

### Rule: null means nobody has said; 0 means we know it is zero. Never conflate them.

## 3. The engine: simulate()

Walks one day at a time. Order within each day matters:

1. Scheduled movements: income, expenses, payments, transfers.
2. Statement close (per card, on stmtDay)
   - Grace period: interest only if the previous statement was not paid in full during the
     cycle. Track payments per cycle. Getting this wrong makes a card you keep using charge
     interest forever.
   - Interest on the average daily balance for the cycle (added v23), at the effective APR,
     or the penalty APR after a missed payment until it expires.
   - Snapshot the new statement balance; reset the cycle counter.
3. Due dates (per card, on dueDay)
   - payInFull: pay the whole statement.
   - otherwise: max(minFloor, statement x minPct%).
   - goalNoInterest card: pays at least this cycle's charges + interest, so it holds flat.
   - Missed or unfundable payment: late fee and penalty APR (added v23).
4. Extra at debt: the strategy payment, on extraDay.
5. Auto-cover: if primary is below the floor, pull from an autoCover account.
6. Cash-constrained payments (added v23, hardStop on by default): a payment the account
   cannot fund without breaching the floor is not made; it is recorded as a shortfall.

### Payoff targeting
- Avalanche sorts by effective rate (a 0% promo card sorts last until it reverts).
- Snowball sorts by balance.
- payLast cards (student loans, float cards) wait while anything else is outstanding.
- stopAtHi: once everything above hiRate is clear, strategy payments stop and that money
  becomes surplus for the plan ladder.
- rollFreed: when a payoff plan finishes, its installment rolls into the extra.

### Returns
Daily cash and debt series, monthly roll-up (net surplus per month), interest per card per
month, per-card clear dates, dryDate, cardFreeDate, hiFreeDate, freeDate, allFree,
raidDate, generated automatic payments, shortfalls, late fees, forgiven amounts.

### "Cleared" is not "balance hits zero"
A card used daily never hits zero. Cleared = the day you stop revolving (the last statement
not paid in full). Works at 0% too.

## 4. Features (v22)

4.1 Calendar: weeks view (in, out, ending balance per week), month grid (running cash and
debt per day), drag to reschedule (pointer events, works on touch; tap to edit, drag past
14px to move), chips colour-coded by kind with tag spine, card dot and pills (sub, plan,
repeat, locked, done), drag into Maybe money to unschedule, locks, search.

4.2 Tags and the burn model, four cumulative tiers:
1. Core burn (food, accommodation, transport)
2. + everything else that is not debt (the cuttable tier)
3. + every debt at its minimum
4. + extra at the debt, or invested
= Still unallocated.
Spending on a card counts in its tier; a pay-in-full card's settling payment is skipped so
nothing counts twice; only card-generated minimums can be tier 3.

4.3 Where the money goes: donut by tag, expandable to line items, cut simulator (tap rows to
drop them, toggle "put what I save toward the debt").

4.4 Debt: payoff Gantt on one timeline, payoff order list (rate, clear date, interest),
interest timeline (stacked monthly bars per card), "why it's taking so long" (paid, charged
back on, interest, net paydown per card), target solver ("X paid off by Y" binary-searches
the monthly payment and says if it breaks cash), separate dates for high-interest free,
cards clear and student loans.

4.5 Student loans are their own category, held back from avalanche by default.

4.6 The float card (goalNoInterest): goal is zero interest, not zero balance; paid last,
held flat, "interest-free from <date>".

4.7 Financial Order of Operations: nine rungs funded by the surplus left after the rungs
above, with a completion date per rung (surplus grows as debts clear). Allocations shown on
the calendar as dashed ghost chips tagged Plan.

4.8 Milestones: auto-generated calendar markers ("Amex cleared", "Rung 4 done"), clickable,
also a horizontal timeline.

4.9 Keeping it true: setup wizard (six screens, ends listing what is still a guess),
weekly check-in (what was due since last confirm: happened / different amount / didn't
happen; real balances prefilled with the forecast; drift recorded; re-anchor to today),
staleness banner after 10 days, CSV statement import (Date/Description/Amount, debit and
credit columns, headerless; sorts rows into matched within 5 days and 2%, recurring for 3+
occurrences, and new; nothing applies until Apply; no duplicates on re-import), "still to
fill" checklist of every placeholder.

4.10 Output: Google Sheets export (nine tab-separated tables), plan files (JSON to and from
a coach), booking call-to-action when cash gets tight.

4.11 Interop: shared profile schema slaf.profile/1 (person, cash, income, expenses, debts,
subscriptions, goals, assumptions), window.SLAF bus, postMessage events, ?embed=1.

4.12 Everything else: undo, storage fallback with a warning, build stamp, editable tag
colours, help sheet on the tiers, bottom-sheet modals on mobile with pinned Save.

## 5. Known problems at v22 (status after v44 in brackets)

1. The simulation never failed (fixed v23: cash-constrained payments and shortfalls).
2. Monthly interest on statement balance; no late fees or penalty APR (fixed v23: average
   daily balance, late fees, penalty APR).
3. No cash-constrained ordering (fixed v23).
4. No migration between versions (partly fixed by the engine extraction in v44).
5. The burn model's meaning changed during development: hold the four-tier definition in 4.2.
6. Modals stack without back navigation (open).
7. No amortisation for loans with a term (fixed v24).
8. Everything typed by hand; import helps once, no ongoing feed (open; bank sync never built).

## 6. Build order

1. State shape + repeatDates() + txns() with overrides.
2. simulate(): cash first, then cards with statement, due and grace logic.
3. Weeks view + chips + drag (usable on its own).
4. Editors: item, repeat, plan, card, cash account, labels.
5. Burn tiers and the donut.
6. Payoff calendar, interest timeline, the drag panel.
7. FOO ladder (needs the monthly surplus roll-up).
8. Setup, check-in, import.
9. Interop and sharing.
Steps 1 and 2 are 80% of the value.

## 7. Added in v23 to v44

Batch 1 (v23): average daily balance; cash-constrained payments (hardStop); late fees and
penalty APR; bill autopsy (every recurring item ranked by yearly cost); annual fee ROI per
card (fee vs value used); utilization guardrail (peak balance before the report day,
warns at 30%); minimum-payment trap readout; quarterly tax set-aside (monthly sweep plus
the four IRS dates); balance transfer analysis (fee, 0% window, post-window rate, does the
skipped interest beat the fee); saved scenarios with a diff ("cards clear 6 months sooner
now, $1,200 less interest").

Batch 2 (v24): goals and sinking funds (monthly set-aside, sinking funds spend on the date
and can repeat yearly); amortizing loans with a term ($18,000, 60 months, 6.5% = $352.28);
net worth with per-asset growth rates and a ten-year projection; drift analysis (bias vs
noise across check-ins: "you land $197 below forecast almost every time"); undo history
(last 25 restore points); printable one-pager.

Batch 3 (v25): which card should I use (rewards minus interest, interest-free days,
utilization warning); float days per card for a purchase today; signup bonus tracking
(spend so far, days left, monthly pace needed, deadline on the calendar); billing cycle on
every card tile; student loan income-driven payment and forgiveness (term, months paid,
amount forgiven); price-increase and free-trial detection; merchant name cleanup
("SQ *BLUE BOTTLE 4471" to "Blue Bottle"); split transactions; household mode.

Batch 4 (v26): outlook (run the plan 120 times with amounts wobbling, report bad, typical
and good cash at the horizon, interest range, share of runs that run dry, card-clear
date); maybe money with a date and likelihood (ignored, likely only, weighted); life event
templates (lose my job, start a new job, move house, new baby, buy a car, wedding); self
test (19 engine assertions); error catcher banner; accessibility (skip link, focus
trapping, aria-live headline).

v27 to v33: fixes from real use (buttons, routing, real-DOM audit with jsdom).

v34 onward: safe to spend (cash, excluding the emergency fund, minus everything committed
before the next income, minus the reserve, also per day); five-second spend logger (keypad,
tag, paid with, live safe-to-spend); per-tag budgets (spent, budget, left, per-day pace to
stay inside, vs last month by the same day, "running hot"); month-end sweep with hard
reset; "Can I spend this?" (prices a purchase in hours of life and goal delays);
momentum from check-in snapshots; savings rate from the real ledger; income shock
simulation; Sankey money-flow; FOO setup reduced to three questions.

v44: engine extracted to src/engine.js (pure, no DOM), src/adapter.js bridge for sibling
tools, src/main.js view layer, Vite + vite-plugin-singlefile build to one classic-script
file that works over file://. Tests: 28 engine assertions, 7 adapter tests, 69 parity
comparisons against the hand-written build, a real-DOM UI audit, and an on-screen vitals
parity check between versions.

### Self-test assertions to keep (from v26 and v44)
- Interest accrues on a carried balance and never on a pay-in-full card.
- Paying more clears sooner and costs less.
- Plans pay exactly their total.
- Loans with a term pay more than principal.
- Cash never breaches the floor when the guard is on.
- Burn tiers reconcile to total spending.
- null is never treated as zero.
- A 0% promo card sorts last in avalanche until it reverts.
- Cleared means stopped revolving, including at 0%.
- Weighted maybe money falls between the ignored and likely-only results.

## 8. Eli's corrections (these override the above)

- The SWAN emergency fund formula in the old tool was invented by Claude. Replace it with
  Eli's Rule of 5 (age / 5 = months of savings) and the three-step cushion in Money Rooms v3.
- BIG5 goal amounts in the old tool were placeholders, not his numbers.
- Do not duplicate features that already exist elsewhere in Money Rooms (Coast FI,
  milestone levels, archetypes): link to them.
- The FOO setup is three questions, no more.
- Total housing (rent or full cost of owning) should be 35% of net (take-home) income by default.
