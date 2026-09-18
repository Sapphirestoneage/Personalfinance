# REVIEW — overnight Phase 1 fixes

Read this before CHANGELOG.md. The section you want is **Needs Eli's
verification**, at the bottom: every tax or legal claim I would not rewrite
without a CPA looking at it, with the file and line.

Branch: `claude/sparks-phase-1-fixes-otw856`. Not merged. `main` untouched.

---

## 1. The one ground rule I could not follow

**The branch is not called `overnight-fixes`.** The session I was started in
was pinned to `claude/sparks-phase-1-fixes-otw856` and told, in as many words,
never to push to a different branch. I took the pinned branch and left the
name alone rather than push somewhere I had been told not to. Everything else
about the brief's ground rules held: one commit per task, nothing merged,
`main` untouched, no feature deleted, the navy/sapphire and Fraunces / Space
Grotesk design system untouched (the only new CSS uses existing tokens).

If you want the branch renamed, it is a rename of six commits and nothing
else.

---

## 2. Judgment calls I made

**Tasks 2 and 3 are one commit.** They are one change. Routing a beginner into
an onboarding that still asks for age, ZIP, situation and pay before saying
anything back is not a fix for either task, and a commit that did only Task 2
would have left the app stuck: you could reach the two-number gate but never
pass it. I said so in the commit message rather than splitting it artificially.

**Finishing onboarding does not open the app.** My first cut had the gate open
automatically once both numbers were in. That made the reward for finishing
onboarding the ninety-four rooms onboarding exists to keep out of the way, and
it made the "Open the rest of the app" button meaningless. The gate now opens
when the person presses that button — or on its own for anyone whose saved
numbers already go beyond Phase 1 (a returning visitor, an imported file, a
share link, the example household), so nobody is ever pushed backwards.

**Where the month is stored.** Phase 1 asks for one figure, "what does a
typical month cost". The app stores a month as four buckets (food,
accommodation, transportation, everything else — decisions D-172 and D-197).
Rather than invent a fifth field, Phase 1 writes the figure to **everything
else**, which is where `shared/schema.js` already puts a month nobody has
split up; its own migration code says so in as many words. Split the month in
Expenses later and the split takes over, and the Round 1 question relabels
itself to "what is left after the split?" so it cannot mislead. **No new
stored field, no second copy of the number.**

**What I gated, and what I did not.** `index.html`, `map.html` and the Ledger
(which *is* the onboarding) are gated. **Individual room URLs are not.** A
direct link to `rooms/runway.html` still works for someone mid-Phase-1. That
is deliberate: those links are shared, bookmarked and printed in the app's own
copy, and redirecting them would break deep links to fix a navigation problem.
Since the map, the ☰ rooms menu and every navigation surface are shut, nobody
*arrives* at a room by wandering. Say the word if you want the rooms hard-gated
too.

**The tax config is an index, not a pile of numbers.** The brief says "move
every hardcoded tax limit into one config file". I moved the hardcoded ones
(six, in `foo-ladder.js`) and made `data/tax_config.json` the one file that
*names* every limit with its tax year and says which table holds it. I did not
copy the values into it, because a second copy of a figure is exactly how
`data/irs_limits_2026.json` and `data/lane2/contribution_limits.json` came to
disagree about the 415(c) limit in the first place, and because CLAUDE.md's
non-negotiables say reference data lives in `data/`, versioned by year. The
"no hardcoded limits outside the config file" test is real and runs on every
test run — it scans every page, room and engine.

**Which room is the tradeoff matrix.** The brief describes "Stress: Increases"
shown as a benefit for relocating and for tax optimization. **No such matrix
exists in this repo** — I searched for "stress", "happiness", "tradeoff",
"increases/decreases" and every comparison surface. What does exist, and has
exactly the problem described, is **The Long Way Round**
(`rooms/adventure.html`): seven ways through five years, including "Move
Somewhere Cheaper", compared on four figures that do not move the same way,
all printed in the same grey type. I fixed that one. If the matrix you saw is
somewhere else — a draft, another branch, a mockup — point me at it and the
convention now lives in one function and can be reused as is.

**Screenshots are committed.** `tests/e2e/screenshots/` is in the branch, 14
PNGs, regenerated on every run. You are not a coder and a wall of passing test
names is not a record; the screenshots are.

---

## 3. What I found that the brief expected but that was not there

Not padding — these are four of the five errors Task 4b listed, and they were
already correct. I checked each rather than assuming, and pinned each with a
test so it stays correct:

| The brief said | What is actually in the code |
| --- | --- |
| "Roth conversions DO count toward MAGI for ACA — remove any claim they don't" | Nothing claimed otherwise. `engines/rothaca.js:96` adds the conversion to MAGI before measuring the cliff, and the room's opening line says conversion is reported income. **Nothing to remove.** |
| "The mega backdoor Roth does not require a non-ERISA plan" | The phrase "non-ERISA" appears nowhere in the repo. The Skill Tree did say the vaguer "Plan must allow", which I replaced with the real requirement. |
| "Solo 401(k) is capped by annual additions (~$70k), not $300k" | No $300,000 figure existed. `engines/accounts.js` already capped at the annual additions limit and already used the correct 20% sole-proprietor employer share, not 25%. |
| "Estate exemption" among the hardcoded thresholds | There is no estate exemption figure anywhere. `data/estate_basics.json` is about *how* property passes (beneficiary, title, will) and carries no dollar amount at all. |

The one that *was* wrong: the Skill Tree hardcoded `$70K/yr` and `$130K` (the
foreign earned income exclusion) into its own text. Both figures are gone.

And the one that was **missing rather than wrong**: **IRMAA.** A Roth
conversion does count towards the MAGI that sets the Medicare surcharge, two
years in arrears — and this app holds no IRMAA table at all. A silence reads
as a calculation, so the Roth/ACA room now says, in its assumptions and its
small print, that it prices the marketplace credit only and not IRMAA.

---

## 4. Nothing was blocked

No task hit three failed attempts. Everything in the brief was delivered.

---

## 5. Two things I noticed and left alone

**The FOO ladder's assumption boxes render blank.** Open The Long Way Round →
"Every month from here" → Assumptions and the six limit boxes (401K LIMIT, IRA
LIMIT, …) show empty. I checked: **this is not something I broke** — I ran the
page before and after my change and it was blank both times. It is a
pre-existing paint-order quirk in `foo-ladder.js`, outside the brief. Worth a
ticket.

**The committed lane-2 reports are stale on `main`.** `docs/lane2-findings.md`
and two files in `tests/reports/` are out of date with the code (they say 87
engines; there are 88). Running `npm test` regenerates them. I reverted those
regenerations so this branch shows only the work you asked for, but somebody
should commit a fresh set.

---

## 6. Needs Eli's verification

Nothing in this list was rewritten. These are the tax and legal claims I could
not confirm, with file and line. The first two are live contradictions inside
the repo — two files that disagree about the same number — and the app is
currently reading one of them without saying why.

### 6.1 Two figures the repo disagrees with itself about

**1. The 2026 415(c) annual additions limit: $70,000 or $72,000?**
- `data/irs_limits_2026.json:19` — `"annualAdditions": 70000`, marked
  *unverified*, "carried from the existing FOO room; not re-checked against
  the IRS notice".
- `data/lane2/contribution_limits.json` — says **72,000**, citing IRS Notice
  2025-67.
- **The app reads 70,000.** This is the cap on the Solo 401(k) total and on
  the mega backdoor Roth, so it is not cosmetic. Recorded as a dispute in
  `data/tax_config.json`; the lane-2 data suite has been flagging it as
  "DECIDE: which the engine reads" for a while.

**2. The 2026 top ACA applicable percentage: 0.0866 or 0.0996?**
- `data/aca_2026.json:39` — `0.0866`, marked *unverified*.
- `data/lane2/aca.json` — `0.0996`, citing Rev. Proc. 2025-25.
- **The app reads 0.0866.** This sets what someone is expected to contribute
  at 400% of the poverty level, so it moves every Roth-conversion-against-
  subsidy number in the Roth/ACA room.

### 6.2 Figures the repo itself marks unverified

Every one of these is currently in use.

| File : line | Figure | Value in use |
| --- | --- | --- |
| `data/irs_limits_2026.json:13` | 401(k) elective deferral, 2026 | 24,500 |
| `data/irs_limits_2026.json:14` | 401(k) catch-up 50+ | 8,000 |
| `data/irs_limits_2026.json:15` | IRA limit | 7,500 |
| `data/irs_limits_2026.json:16` | IRA catch-up 50+ | 1,100 |
| `data/irs_limits_2026.json:17-18` | HSA self-only / family | 4,400 / 8,750 |
| `data/aca_2026.json:11-12` | Federal poverty level, base / each further person | 15,650 / 5,500 |
| `data/se_tax_2026.json:13` | Social Security wage base, 2026 | 184,500 — the file's own `precision` field says this is "UNVERIFIED for 2026 and is the single figure to check before relying on any output above it" |
| `data/federal_brackets_2026.json` | Every federal bracket and the standard deduction | whole file marked unverified |
| `data/state_brackets_2026.json` | Every state's brackets | whole file marked unverified; the lane-2 suite also flags that **Ohio** is flat for 2026 in `states.json` but still bracketed here (a 2025 edition) |
| `data/effective_tax_rates_2026.json` | Effective federal rate by income band | whole file marked unverified |
| `data/ss_bend_points_2026.json` | Bend points, FRA, claiming adjustments | whole file marked unverified |
| `data/cobra_aca_2024.json:9-11` | COBRA single / family, ACA benchmark silver at 40 | 2024 KFF figures, "recalled … rounded; not copied from the tables" — **two years older than everything else in the app**, now labelled as such in `data/tax_config.json` |
| `data/ui_benefits.json` vs `data/states.json` | State unemployment weekly maximum | the two disagree in **26 states**; the lane-2 suite has been asking which the engine should read |

### 6.3 Rules stated as fact that I did not check

These are legal or procedural claims, not amounts. They read correctly to me,
but "reads correctly to me" is not verification.

- `data/rollover_options.json:11-13` — the mandatory 20% withholding on an
  indirect rollover, the 60-day window, and the rule-of-55 separation age, plus
  the note at line 14 that the age is **the one you turn in the calendar year
  you leave**, not your age on the day.
- `data/rollover_options.json` (options list) — the claim that leaving money in
  a plan keeps the age-55 rule alive and rolling to an IRA loses it until 59½;
  the pro-rata interaction with a backdoor Roth; federal vs state creditor
  protection.
- `data/early_access_rules_2026.json:16-17` — the SEPP / 72(t) ceiling taken as
  5%, described as "the floor of that ceiling". The file says this produces the
  *largest payment the floor allows*, which is a choice, not a rule.
- `data/early_access_rules_2026.json:22-24` — the single life expectancy table,
  "IRS Publication 590-B Table I, the 2022 revision, ages 40 to 65", typed from
  memory as far as I can tell.
- `data/access_rules.json` — `byTaxCharacter.roth.basisAccessAge: null`, i.e.
  Roth *contributions* come out at any age but earnings wait for 59½. Correct
  as a general rule; the five-year clocks are not modelled at all.
- `data/estate_basics.json` — the whole "how property passes" model: beneficiary
  designation beats the will, joint title passes by the deed, everything else
  goes through probate. Marked *convention*.
- `engines/tax.js:273` — the app's own list of what it does **not** model: state
  deductions and exemptions, local taxes, AMT, NIIT, and the qualified business
  income deduction. Worth confirming that list is complete enough for what the
  app claims to do. `data/tax_config.json` now carries the same list under
  `notModelled`, with IRMAA and the estate exemption added.

### 6.4 One structural thing, not a number

`data/skill_tree.json:556` — the mega backdoor Roth node lists
`main-path-open-a-solo-401-k` as its prerequisite, which implies you need a
solo 401(k) to do a mega backdoor Roth. **You do not** — it is an employer-plan
feature, and a solo 401(k) is one way to get it, not the requirement. I fixed
the *wording* of that node (it now names the real requirement: a plan allowing
after-tax contributions plus in-plan Roth conversion or in-service
withdrawals), but I did not re-wire the prerequisite chain. Changing the shape
of the Skill Tree is a structural change and the freeze in CLAUDE.md says to
ask first. Your call.
