# PANEL REVIEW

Seven lenses on the finished app. **These are simulated perspectives built
from each person's public philosophy — not real quotes, not endorsements,
not anyone's actual opinion of this app.** Each round scores 1–10 and names
three issues. Issues become checklist items in `PROGRESS.md`, get fixed, and
the panel runs again. It stops when every lens is 8 or higher, or after
three rounds.

Every issue below was reproduced before it was written down: a file and line,
a node run, or a screenshot of the running app. Claims that did not survive
checking were struck and are listed under "Checked and dismissed".

---

## Round 1 — 2026-09-19

Baseline: `node test/run.js` → 30990 checks passed. No console errors on any
room sampled. Reviewed at 390px with the demo household (Robin Sparks) and
blank.

| Lens | Score |
|---|---|
| The Money Guy Show — order of operations | 6 |
| Scott Trench — rigour and the big levers | 6 |
| Alan Donegan — simple enough, and income | 5 |
| Alex Hormozi — friction and worth paying for | 5 |
| Scott Galloway — time, compounding, focus | 7 |
| Alexis Gillmore — the avoider | 4 |
| Tom Hutchinson — the CPA | 6 |

### The Money Guy Show — 6/10
*Is the order of operations right? Does every dollar have a clear next job?*

The ladder itself is right, and `rooms/foo-ladder.html` is the best room in
the app: one question at three amounts, guaranteed never added to expected,
every line carrying the step it belongs to.

1. **The front door contradicts the ladder.** `index.html:821` takes
   `foo.flags[0]`, and flags fire in file order (`data/foo_rules.json`),
   not ladder order. On the demo household the Dashboard says *"Point the
   excess at the debt"* (step 3) while the ladder room two taps away says
   *"Your next dollar belongs to step 2 of 9 — capture the employer match."*
   The 50%-guaranteed match is demoted to "the next thing to **learn**".
2. **The ladder dead-ends at step 4 of 9.** `engines/foo.js:196` returns
   `unknown('max_hsa', 'Steps 5 and up need your actual contributions —
   HSA, IRA, 401(k) — which this room doesn't ask for yet.')`. Verified: a
   household that has met steps 0–4 and contributes 10% of salary gets
   `placement: null`. The app *does* hold `retirement.contributionPercent`
   and `data/irs_limits_2026.json`, so the sentence is not true.
3. **The FI date compounds money that is only notionally saved.**
   `engines/tier0.js:298` feeds the *residual* rate into `yearsToFire`.
   D-080 defines the residual as "how much *could* have been saved" and the
   contributed rate as "how much *was*" — and says the gap between them is a
   finding. The headline date is built on the optimistic one with nothing
   said. On the demo: $22,680 assumed in, 6.1% contributed.

### Scott Trench — 6/10
*Is the math rigorous? Does it focus on the big levers?*

Rigour is mostly there: integer cents, a real 5% return (not a nominal 7%),
the FI date seeded with existing investments, credit utilisation computed on
both sides of the division.

1. **The one ratio Trench cares about most is unavailable.** Verified on the
   demo household: 42 of 45 ratios compute; `housingRatio` and
   `backEndRatio` are two of the three that don't —
   `engines/ratios.js:229` demands a categorised month of logged
   transactions, while `Schema.rentMonthlyCents(h)` returns $1,500 from a
   typed field right now. The app reports debt-to-income to four decimals
   and refuses to say what share of pay the roof takes.
2. **The 28% housing rule is written down and read by nobody.**
   `data/foo_rules.json:16` holds `"dtiHousingGuideline": 0.28`;
   `grep -rn dtiHousingGuideline` over all js/html returns no hits. None of
   the five out-of-bounds flags is about housing, so housing can never be
   "the next thing money should do".
3. **Debt service sits on the saved side of the headline rate.** Verified
   on the demo: `monthlyExpenses` is the four FAT buckets ($3,150) and
   excludes the $305/mo of debt minimums, so 28.5% "saved" includes $3,660
   a year going to lenders. This is D-080's residual working as designed —
   the defect is that nothing says so, and issue 3 above compounds it at 5%.

### Alan Donegan — 5/10
*Simple enough for anyone? Does it help grow income, not just cut spending?*

Round 1 in the Ledger is genuinely excellent and would score on its own:
five questions, one a screen, age first, a blank answer allowed through.

1. **Good news cannot reach the numbers.** The income-growth rooms
   (`side-hustle`, `self-employed`, `credential`, `degree`,
   `real-hourly-wage`, `hassle`) all declare `writes: []` in
   `shared/registry.js`. Someone who starts earning $500 a month more has
   nowhere to put it, and the FI date does not move. `income.extraMonthly`
   exists only as a *hypothetical* (`shared/blocks.js`, `shared/levers.js`).
2. **Six levers, none of them "charge more".** `data/levers.json` offers
   change employer, generic hustle, steady raise, drift, house hack,
   relocate. Every way up is "get a different job" or "move house" — the
   theory of a life with no agency over its own price.
3. **Seven invented vocabularies to read your own screen.** DAITE, FAT,
   DRAFTT, Spheres, Blocks, Lenses, Triple D (`docs/ARCHITECTURE.md:43-53`).
   The Dashboard leads with five bare letters — D A I T E — above the five
   numbers, which already carry their own words.

### Alex Hormozi — 5/10
*Where is the friction? Would people value this enough to pay for it?*

1. **The most shareable number in the app renders `$0.00/h`.** Screenshot of
   `rooms/real-hourly-wage.html` with the demo household: the headline reads
   **$0.00/h** over a subline that correctly says "$53,500 kept over 2,544
   hours a year" ($21.03/h). Cause: `shared/money.js:170` applies the
   household's confidence rounding — $1,000 by default for an unmarked
   field — to a figure asked for with `decimals: 2`. Nine call sites across
   the app are affected; every per-hour figure is $0.00.
2. **Five doors at the threshold where the file's own note says two.**
   `index.html:19` records the intent — one sentence, Start Here, and
   example numbers. Shipped: Walk me through it, Give me the whole form,
   See it with example numbers, The older one-pager is still here, Load it
   below. `docs/ARCHITECTURE.md:70` already lists this as a known problem.
3. **The zero-effort path is the quietest button, and it opens with a
   warning about losing data that does not exist.** `index.html:276` is
   `slaf-btn--quiet`; `index.html:1219` confirms *"This replaces anything
   you have entered"* to a visitor who has entered nothing.

### Scott Galloway — 7/10
*Honest about time, compounding, and focus?*

The most honest layer in the app. Guaranteed is never added to expected.
Real dollars are the default. `data/return_bands.json` gives every projection
a low/likely/high. A hype grep across every room returns nothing.

1. **The headline drops the range the app already computes.**
   `index.html:911` prints "22 years at this pace" from `fi.result.years`
   alone; `rooms/fire.html:291` shows the same household as 29 / 22 / 18.
   An eleven-year spread compressed into a date someone will plan a life on.
2. **No income floor.** `renderNextAction` (`index.html:817`) has branches
   for between-jobs and retired and five flags, then falls through to
   "Nothing is out of bounds." There is no branch for a month that does not
   close. `rooms/cant-pay.html` exists, is good, and is reachable from no
   screen a person starts on. STATUS.md:36 already records this.
3. **The Scorecard opens on its own weakest number.**
   `data/health_score.json:7` says of the weights behind the 75/100:
   *"the most invented numbers in this repository… a considered opinion
   about emphasis by decade, not a finding."* The room opens on it anyway;
   the sourced raw readings are tab two.

### Alexis Gillmore, the avoider — 4/10
*Would she even open it? Where would she feel judged, overwhelmed, or quit?*

1. **The home room opens by telling her she understands 0% of her own
   life.** `rooms/ledger.html:553`, the default view: *"You understand 0% of
   your financial picture."* Under it, six doors counting out 59 empty boxes
   — 0 of 3, 0 of 14, 0 of 9, 0 of 6, 0 of 13, 0 of 14. She has not typed a
   character. She understands her situation perfectly well; that is why she
   is avoiding it.
2. **Every room greets her with a deficit.** `shared/progress.js:249` emits
   *"N still needed to finish this room"* ungated by whether she has
   started. Blank Start Here: *"13 still needed"*, thirteen links, the last
   one *Any debt*. The code comment above it states the right intent — a
   nudge for someone mid-flow — and the zero case was never carved out.
3. **A room called The Scorecard grades her in red by default.** 75/100,
   a verdict word, six pillars of which Retirement renders red at 10/100,
   then "What would move it most" ranking her four biggest shortfalls.

### Tom Hutchinson, the CPA — 6/10
*Is every number correct? Where is it right but confusing?*

The tax engine is exact — federal ordinary, stacked LTCG, the FICA cap,
additional Medicare, the 92.35% SE adjustment all reconcile to hand
arithmetic to the cent, and additional Medicare is not double-counted.

1. **The Scorecard silently drops three of its nine numbers, then blames the
   data folder.** `rooms/financial-snapshot.html:1695` writes to
   `el('provenance')`, which is not in the page — the element was lost when
   the rooms merged (`rooms/ratios.html:31` still redirects `#provenance`).
   The throw aborts the render, so **Emergency fund coverage, Debt-to-income
   and FIRE number show "—"** on a household that has every input for all
   three. The same room's score card shows the emergency-fund pillar at
   50/100 on the previous tab. A red banner then says *"Couldn't load the
   reference tables in data/"*, which is false — the tables loaded fine.
   Same again at `:2293` for `ra-provenance`.
2. **"Ahead by $0."** `engines/tier0.js:375` collapses the on-track case to
   `0`; `rooms/financial-snapshot.html:1570` prints that zero under the
   label "Ahead by". Everyone ahead of their retirement milestone is told
   they are ahead by nothing. The room's `Math.abs()` shows it expected a
   signed figure.
3. **One ratio, two thresholds, on the same screen.**
   `data/ratio_benchmarks.json:12` bands `debtToIncome` at `good: 0.28` with
   the note *"The 36% back-end rule used by mortgage underwriters."* The
   ratio is the back-end ratio (every debt minimum ÷ gross). A household at
   32% is painted amber by the panel, passes clean in the FOO flags
   (`dtiComfortCeiling: 0.36`), and reads a caption telling it the rule is
   36%.

   *Also logged, not ranked:* the Tax room divides a ledger-derived tax by a
   Start-Here gross (`engines/taxroom.js:140`), so a stale profile can print
   an effective rate off by a factor of three; `engines/tax.js:74` reports a
   10% marginal rate at zero taxable income; `engines/ratios.js:452` is
   labelled "Revolving to installment debt" over `card balances ÷ total`.

### Disagreements between the lenses, and how they were resolved

- **Galloway wants the range; Hormozi wants one number.** Galloway asks the
  FI date to carry 18/22/29; Hormozi says a third number at the threshold is
  a third decision. *Resolved:* the date stays the headline in display type,
  and the band goes in the small line beneath it that already exists. One
  number to read, the honesty available without a tap.
- **Trench wants the housing flag; the avoider wants fewer red boxes.**
  *Resolved:* the flag fires as a `warning`, never `critical`, and the
  front-door block shows one flag at a time — so it replaces a flag rather
  than adding a box.
- **The CPA wants the Scorecard's raw readings first; the Money Guy wants a
  single prioritised action.** *Resolved:* these are different screens. The
  Dashboard keeps one action; the Scorecard opens on the plainest reading,
  which is what D-233 said it would do.
- **Donegan wants a "charge more" lever; the freeze forbids new
  vocabularies.** *Resolved in the freeze's favour* — logged for the owner,
  not built. A seventh lever changes a documented six.

### Checked and dismissed

- *"The example-numbers button fills localStorage and leaves you on the
  homepage."* Not true. `index.html` **is** the Dashboard — `Spine.onChange`
  re-renders it in place. Clicked it in a browser: the page becomes the
  seeded Dashboard, title and all. Only the false confirm warning survives.
- *"The savings rate is wrong arithmetic."* Overstated. D-080 defines
  `Tier0.savingsRate` as the residual on purpose. The real defect is
  narrower: the residual is fed to `yearsToFire` as if it were contributed.


---

## Round 2 — 2026-09-19, after the fourteen fixes

`node test/run.js` → 31011 checks passed (30990 at the start of round 1;
the difference is new checks, not new code paths). All 95 pages swept at
390px with the demo household: no page errors, no console errors, no 404s.

| Lens | Round 1 | Round 2 |
|---|---|---|
| The Money Guy Show | 6 | **9** |
| Scott Trench | 6 | **8** |
| Alan Donegan | 5 | **7** |
| Alex Hormozi | 5 | **7** |
| Scott Galloway | 7 | **9** |
| Alexis Gillmore, the avoider | 4 | **8** |
| Tom Hutchinson, the CPA | 6 | **8** |

### The Money Guy Show — 9/10 *(was 6)*
The front door and the ladder now describe the same household the same
way: flags come out in ladder order, the Dashboard names the rung and
links to it, and the demo reads "capture the employer match · Step 2 of
the order of operations" on both screens. Past step 4 the ladder gives the
next dollar a job against the real IRS limit instead of returning nothing.

Remaining: steps 5 and 6 are still honestly unknown, because what goes into
an HSA or a Roth is not collected anywhere. That is a missing input, not a
wrong answer, and it is named on screen.

### Scott Trench — 8/10 *(was 6)*
The housing ratio computes off the typed roof on every household that has
one (25.0% and 30.1% on the demo), and housing can now be the next thing
money should do, off the 28% guideline that sat unread in the rules file.
The FI date says what it assumes rather than implying the residual lands in
a brokerage.

Remaining, and not fixed: the residual **is** still what compounds. The
honest fix is to project the contributed rate beside it, which is a change
to what `yearsToFire` means and to every engine reading it — a decision for
the owner, not a panel fix. Disclosure was the right move this round; it is
not the whole move.

### Alan Donegan — 7/10 *(was 5)*
Round 1 was already the app's best on-ramp and is now the first thing under
the doors rather than the thing after a wall of zeros.

**Two of round 1's three findings do not survive checking, and are struck.**
Opening `rooms/adventure.html?path=hustle` on the demo household shows a
side hustle priced at "$500 a month, net" with −$100 / +$100 steppers, the
hours it takes with its own stepper, a five-year walk against drifting, and
the answer in three return bands: *"9 years sooner than Drift, and +$54,804
after five years."* `data/levers.json` read directly has six levers of which
three move income — `hustle` (editable, $500/mo), `careermove` (+20%),
`steady` (+3% kept rather than spent) — plus a "A real raise" tailwind of
15% in year 2. The claim that every way up is "get a different job or move
house" was wrong, and `engines/adventure.js`'s `hustleMonthlyCents` override
is not unused: `rooms/adventure.html:241` sets it from the stepper.

**The one real gap, verified in node:** good news can be *modelled* and
cannot be *recorded*. Appending a $500/month entry to `ledger.income[]`
leaves `Schema.grossAnnualIncomeCents` at $72,000 and `Tier0.yearsToFire` at
22 years, both unchanged, because `allIncomeSources` reads only
`people[].incomeSources[]` — and no room in the app adds one. So the FI date
on the Dashboard cannot move when a person's income actually grows.

That is known structural problem #1 in `docs/ARCHITECTURE.md` and item 4 on
STATUS.md's own Next list. A handoff from Side Hustle into the income log
would not fix it — it would write to a log the headline numbers do not
read, which looks like the date should move and it would not. Fixing it
means deciding which income figure is authoritative, which is the owner's
call. Logged, not guessed at; the score records the cost.

### Alex Hormozi — 7/10 *(was 5)*
The flagship per-hour figure reads $21.04 instead of $0.00, across nine
call sites. The one-click demo path no longer opens with a warning about
losing data that does not exist. The two blocks under the Dashboard's five
numbers stopped saying the same sentence twice.

Remaining: five doors at the threshold. `index.html:19` says two, and
`docs/ARCHITECTURE.md:70` calls four live onboarding doors a known problem,
but which two survive is a product decision and Start Here's retirement is
already blocked on the field-ownership question in STATUS.md. Logged, not
guessed at.

### Scott Galloway — 9/10 *(was 7)*
The headline carries the range the engine computes — "22 years at this pace
— 18 if returns run high, 29 if they run low" — and says what the pace
assumes. The floor has an answer: a household whose month does not close is
routed to the room written for it and told plainly that no step of the
ladder answers that. The Scorecard leads with its sourced readings instead
of the composite its own data file calls the most invented numbers in the
repository.

Remaining: the means-tested floor itself is still unmodelled (STATUS.md
already records it). Routing to Can't Pay is the honest interim; modelling
benefits is the Back Half's work.

### Alexis Gillmore, the avoider — 8/10 *(was 4)*
Nothing counts her failures before she has typed anything. The home room
does not tell her she understands 0% of her own life; it says what the app
holds, and says nothing at zero. The six doors keep their names and lose
their denominators until there is something to count. A room she has not
touched says "Nothing entered here yet. Start with monthly expenses" rather
than listing thirteen things she has not done, ending on the word debt. The
Scorecard no longer opens on a grade.

Remaining: the room is still *called* The Scorecard, and "Where you rank"
is still a hat. Both are named things the owner chose, and the gating on
rank (guess first, then a deliberate button) is already the right pattern.

### Tom Hutchinson, the CPA — 8/10 *(was 6)*
Three of the nine numbers came back from the dead, the false "couldn't load
the reference tables" banner is gone, and a test now fails the build if any
page writes to an id it does not carry. "Ahead by $0" reads "Ahead by
$199,200". Debt-to-income is banded against the rule its own note names and
its own flag uses.

Remaining, logged in round 1 and not fixed this round: `engines/taxroom.js`
divides a ledger-derived tax by a Start-Here gross, so a stale profile can
print an effective rate off by a factor of three. This is known structural
problem #1 in `docs/ARCHITECTURE.md` — logged income not reaching the
headline numbers — and fixing it properly means deciding which income
figure is authoritative, which is the owner's call and is item 4 on
STATUS.md's own Next list. `engines/tax.js:74` reporting a 10% marginal rate
at zero taxable income, and `engines/ratios.js:452`'s label, are both
one-liners left for the next pass rather than folded into a panel round.

### New in round 2, found and fixed
- Ordering the flags made the Dashboard's "next thing to do" and "next thing
  to learn" both land on the employer match, one above the other. The learn
  block now skips an item pointing at the room and anchor the action already
  links to.
- `rooms/adventure.html` was the only page in the app without a `rel="icon"`,
  so every visit 404'd on `/favicon.ico`.

### Disagreements in round 2, and how they were resolved
- **Trench wants the residual replaced; Galloway wants it disclosed.**
  Replacing it changes what the FI date means in eight engines and is a
  decision about the product, not a defect. *Resolved in favour of
  disclosure this round,* with the replacement written up as an owner
  decision rather than quietly shipped.
- **Donegan wants the income rooms wired up; nothing the app can write
  would reach the headline numbers.** Tested rather than argued: a logged
  $500/month leaves gross income and the FI date untouched. A handoff built
  anyway would be theatre. *Resolved by leaving it to the owner,* with the
  Donegan score at 7 to record the cost rather than hide it.
- **The avoider wants fewer counters; the Ledger's doors use the counter as
  its progress signal.** *Resolved by state:* the counter is progress once
  there is progress, and silent before it. Nothing was removed, only
  deferred to the moment it means something.

### Outcome

Six of seven lenses are at 8 or above. Alan Donegan is at 7, held there by
one verified item: income growth can be modelled but not recorded, because
no room writes an income source and the headline numbers read nothing else.
That is the owner's decision about which income figure is authoritative.

Round 3 follows, for the CPA's remaining one-liners.
