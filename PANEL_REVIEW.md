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
