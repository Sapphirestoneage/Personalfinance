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

## Waiting on the Money Map (not built)

- **A date on every expenditure and incoming amount**, with estimated and
  potential dates, and an **incoming-money list** — asked for alongside the
  Cash Flow rework. Specified in `MONEY-MAP.md` (Task 3, and open questions
  1, 5 and 13) rather than built, because it is the Income and Expenses
  data model that map exists to settle; building it first would have
  designed it twice. Cash Flow's rework (D-126) and the calendar grid
  (D-127) change nothing in the stored shape so that either answer fits.
