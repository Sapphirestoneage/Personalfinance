# PROGRESS — the panel's issues, ranked and worked

Every item here came out of `PANEL_REVIEW.md`. Ranked by impact: a wrong
number beats a missing number beats a hard word beats a wasted tap.

The loop for each: reproduce → fix → `node test/run.js` → screenshot the
room at 390px → commit.

**The freeze is on.** No item here adds a room, a framework, a lens or a
vocabulary. Items that would are parked under "Owner decisions needed" and
are not built.

---

## Round 1 — worked

### Wrong or missing numbers

- [ ] **P1 · The Scorecard drops three of its nine numbers.** (CPA 1)
      `rooms/financial-snapshot.html` writes to `#provenance` and
      `#ra-provenance`, neither of which is in the page since the merge. The
      throw aborts the render, so Emergency fund coverage, Debt-to-income and
      FIRE number read "—" on a household that has every input. Restore both
      elements; add a check to `test/run.js` so no room can write to an id it
      does not contain.
- [ ] **P2 · Every per-hour figure in the app is `$0.00`.** (Hormozi 1)
      `shared/money.js` applies confidence rounding ($1,000 by default) to
      figures asked for with `decimals`. An hourly wage rounded to the
      nearest thousand is always zero. Nine call sites; fix once in `money.js`.
- [ ] **P3 · "Ahead by $0".** (CPA 2) `engines/tier0.js` collapses the
      on-track case to zero. Make the shortfall signed; the room already
      calls `Math.abs`.
- [ ] **P4 · Debt-to-income banded at 28% under a note naming 36%.** (CPA 3)
      `data/ratio_benchmarks.json` disagrees with its own note, with
      `foo_rules.json`, and with `backEndRatio`'s band. Band it at 36/43.
- [ ] **P5 · The housing ratio is unavailable on a household whose rent is
      known.** (Trench 1) `engines/ratios.js` demands a categorised month;
      `Schema.rentMonthlyCents` has the figure. Fall back to it and say
      which basis was used.

### The order of operations

- [ ] **P6 · The front door contradicts the ladder.** (Money Guy 1)
      Order the out-of-bounds flags by the ladder step they belong to, in
      `engines/foo.js`, so every consumer inherits it — and have the
      Dashboard name the step beside the action.
- [ ] **P7 · Housing can never be the next thing money should do.**
      (Trench 2) `dtiHousingGuideline: 0.28` is read by no code. Fire a
      `warning` flag off the threshold that is already there.
- [ ] **P8 · The ladder dead-ends at step 4 of 9.** (Money Guy 2) Say what
      is known from `retirement.contributionPercent` and
      `data/irs_limits_2026.json` instead of "this room doesn't ask for it
      yet", which is not true. Read the step count from the data file
      rather than the inlined "of 9".

### Honesty about time

- [ ] **P9 · The FI headline drops the range the app computes, and says
      nothing about what it assumes.** (Galloway 1, Money Guy 3) Put the
      low/likely/high band and the assumed annual contribution in the small
      line under the date.
- [ ] **P10 · No income floor.** (Galloway 2) Add one branch to
      `renderNextAction` for a month that does not close, routing to
      `rooms/cant-pay.html`, which is already written and reachable from
      nowhere.

### Where a person would quit

- [ ] **P11 · "You understand 0% of your financial picture."** (Avoider 1)
      Describe the app's state, not the person's understanding, and say
      nothing at all at zero.
- [ ] **P12 · "13 still needed to finish this room."** (Avoider 2) At zero
      state, one line and one link instead of a count and a list. The
      counter stays exactly as it is the moment anything is entered.
- [ ] **P13 · The Scorecard opens on its own weakest number.**
      (Galloway 3, Avoider 3) Open on the nine plain readings; the composite
      score is one tap away. This is what D-233 said the room would do.
- [ ] **P14 · The one-click path warns about losing data that does not
      exist.** (Hormozi 3) Confirm only when something has been entered.

---

## Owner decisions needed (not built — the freeze holds)

- **The doors.** Five ways in on the front page where `index.html:19` says
  two, and `docs/ARCHITECTURE.md:70` lists four live onboarding doors as a
  known problem. Which two survive is a product decision, and Start Here's
  retirement is already blocked on the field-ownership question in
  STATUS.md. Not touched.
- **A "charge more" lever.** `data/levers.json` has six levers and no way to
  raise your own price. Adding a seventh changes a documented six
  (`docs/ARCHITECTURE.md`), which the freeze puts to the owner.
- **Income rooms that write nothing.** Six income-growth rooms declare
  `writes: []`, so a real raise or a real side hustle cannot move the FI
  date. The clean fix is a handoff to Income's own add-source flow, keeping
  ownership where it is — but it is new wiring across two rooms and belongs
  in the Step 5 shell work STATUS.md already has queued.
- **The DAITE letter chips** on the Dashboard, above five words that already
  carry the meaning. A deletion, but of a taught vocabulary (D-171).
