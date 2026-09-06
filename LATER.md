# LATER.md — what the brief said not to build, and then said to

The one-pager brief (D-094 onward) said: do not add rooms or features
outside it; if something would be substantially better, write it here.
The direction after step 1 was to finish everything, this list included
(D-095), so every line below was built. Each says what it is and the
decision entry that landed it. Nothing on this list is waiting.

## From T8 (the FI-losophy rooms, the D-093 draft) — built

The T8 foundations were parked in a git stash before the brief arrived.
The engines and tables were lifted from it and each room rebuilt on the
frozen template (D-097); the stash is superseded and dropped.

- **Enough** — the monthly figure you would live on by choice, and the
  second FI number it makes. `rooms/enough.html`, D-114.
- **Designed Week** — 168 hours in blocks, what each costs and buys, the
  month the week adds up to. `rooms/week.html`, D-115.
- **Time Buckets** — what you plan to do in each decade, priced, against
  the money there will be. `rooms/buckets.html`, D-116.
- **Dreamline** — dreams priced a month, the target monthly income, the
  hours a week at the real rate. `rooms/dreamline.html`, D-117.
- **Reversibility** — what a decision costs to undo, and how long.
  `rooms/reversibility.html`, D-118.
- **Unlearning** — the advice everyone hears, sorted by whether it still
  applies, and what you have let go of. `rooms/unlearning.html`, D-119.
  The dashboard's learn/unlearn block (D-096) is its top line.
- **Display unit as a household setting** — the small version: one
  stored default lens (`meta.displayUnit`) every page reads. D-100.

## Noticed while building the core — built

- **Undo across tabs** — another tab's write reloads this tab's cache,
  so both read one household and one log. D-100.
- **Undo labels for list edits** — "Changed a goal", not a dot path.
  D-100.
- **The lens on a phone** — the four buttons tighten under 420px. D-100.
- **`rooms.json`** — generated from the registry by
  `tools/rooms-json.js`; the suite checks it is fresh. D-100.
- **Student Loan Decision** — standard, income-driven, aggressive, side
  by side. `rooms/student-loans.html`, D-120.
- **Money Calendar & Pay-Later** — paydays and bills across a month, the
  low point. `rooms/calendar.html`, D-121.

And the brief's own last step, **History** — every snapshot and what
moved between them. `rooms/history.html`, D-122.

## From the Money Map — built (D-128)

- **A date on every expenditure and incoming amount** and an
  **incoming-money list** — the expense log in Cash Flow and the Income
  room's entries. D-128.
- **The revision (D-129)**: Unemployment as a kind and exactly four ways
  to be taxed; an expense that is personal, linked or reimbursable, with
  the repayment a credit in the month it came; the budget as five cards
  with one comparison bar each; Rule of Five, Max IRA and Max 401(k)
  presets stacked into the estimate; Not applicable, and a Hypothetical
  view that never writes.
- **What was pushed off, built (D-130)**: `dateKind` — a date that is
  exact, estimated or potential, the last drawn but never counted; the
  Money Calendar drawn from the ledger's landings and the log's dated
  entries, its own bill inputs retired, Start Here's one-off a dated
  entry (Q5); a month of spending as the closed months' average once
  months close (Q10); one rent, Cash Flow's housing line, with Housing's
  field the alternative (Q11); what the log moved since cash was
  confirmed, set beside the balance and never applied (Q8); N/A beside
  the workplace plan and the HSA in Where It Goes, and the chip that
  says so everywhere; an emergency-fund preset for Savings.
- Decided against, and why (D-130): a Rule of Five preset with a price
  of its own — it would be the budget page's first input field; entries
  moving asset balances — every logged coffee would write to an asset
  another room owns.

## The Skill Tree (D-131)

- **Built on a seed**: the engine, the board, the fog, the warps, the
  fortress line, the exercise library, the Stacker and dashboard wiring,
  versioning. D-131.
- **Waiting on one file**: FI-Skill-Tree-v6.3.html is not in the repo.
  Drop it at the root and write the body of `scripts/extract-v63.mjs`
  against its real internals; the three data files regenerate and the
  counts (625 / ~280 / 125) become the tests' expectations. Quests and
  dares arrive with it.
- Still open after that: the Profile Facts (31 yes/no) mapped to the
  skills they prove, beyond the ownership facts the seed already reads;
  a Triple D run bound to a chosen life event in the Exercises room; a
  band's cutscene as its own screen rather than a card.

## Reasons to keep a debt (D-132)

- **Built**: the five reasons, the multi-select, the suggestion at entry
  time, the hold-back toggle, the tags inline in the payoff order, the
  interest cost of holding one back. D-132.
- Still open: the reasons are per debt and go no further. A household-level
  read of them — "you are carrying $X on purpose, at $Y a year" across every
  held debt at once — would belong on the Statement or the dashboard, not in
  Debt Payoff, and would need an owner deciding before it is built. Tax
  favourability is a tag someone ticks, not a calculation: nothing checks
  whether the interest is actually deductible at their income, and doing so
  needs the Tax room to own a figure it does not own yet.

## How interest works, asked once (D-133)

- **Built**: the three-answer interest block, the derived mode, the promo
  fields freed from the cards-only block, the plain sentence per mode, the
  figures on one rail with their meanings, the orderings as a table, the
  tie that badges nothing. D-133.
- Still open: the same four-controls-in-three-places problem exists
  wherever a rate is asked for with a variant beside it. Housing asks for a
  mortgage rate with no promo concept at all, so a 0% or an ARM cannot be
  said there. Worth one pass over every room that takes a rate, using this
  block as the pattern, rather than fixing them one at a time.
- Also open: a debt left in promo mode with nothing filled in is a
  fixed-rate debt to every engine, which is honest but silent. A nudge on
  the plan card naming those debts would be better than a sentence only
  visible inside the row.

## One debt, one screen (D-134)

- **Built**: four facts up, two drawers with live summaries, open state
  that survives a rebuild, a wider measure for this room. D-134.
- Still open: the same problem exists in every room that edits a list of
  things. Cash Flow's expense log and the Statement's asset list both put
  every field of every row on screen at once. The drawer helper here is
  room-local; if a second room needs it, it should move to `shared/` rather
  than be copied, and the open-state rule (per visit, never stored,
  repainted on every write) should move with it.
- Also open: the room-local width override is a blunt instrument. If more
  editor rooms need it, a second measure token (`--measure-wide`) belongs
  in `shared/theme.css` instead of a media query per room.

## The menu (D-135)

- **Built**: the drawer, the upkeep group, the pinned desktop sidebar, an
  opaque panel, a desktop measure that is not a phone's. D-135.
- Still open: the hop strip and the menu now overlap in purpose. The strip
  is the path, the menu is everything — that is defensible, but on a pinned
  desktop the strip's "All rooms" link is a third route to the same place
  and could go.
- Also open: the desktop pass stopped at width. The rooms still stack one
  card per row on a 1400px screen where two columns would read better, and
  the dashboard's instrument grid is the only thing that uses the space
  properly. That is a per-room layout job, not a token change.
