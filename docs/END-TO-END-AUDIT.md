# End-to-end audit — the green run and the black diamond

*Walked, not guessed. Two personas were driven through the live app in a real
browser on 2026-09-12, every step timestamped, with the console recording.
The harness and its output are in the session scratchpad; the findings below
name the screen, the number and the line of code. Facts read off the code and
the walk on 2026-09-12 (D-001 … D-226).*

The ask this audit was written against: **be the ski lift, the lodge and the
mountain — for the beginner on the green run and the expert on the black
diamond, in the same app.** A lift that carries you up without effort. A lodge
that knows you when you come back. A mountain that is still worth skiing when
you are good.

---

## 1. What was actually done

| Persona | Viewport | What they did |
|---|---|---|
| Beginner | 390×844 (phone) | Cold browser, empty storage. Landing → "Walk me through it" → the five questions → the insight → home → three rooms. |
| Expert | 1440×900 | Cold browser → "See it with example numbers" → dashboard → Express, Ledger, Statement, FIRE Lab, Refresh. |
| Sweep | 1440×900 | All 92 registered rooms opened in turn, console recorded, screen text measured. |

Timestamped, from the walk log:

```
+3343ms  beginner  open /index.html          cold start, empty localStorage
+3852ms  beginner  click "Walk me through it"
+4373ms  beginner  answered q-age            34
+4829ms  beginner  answered q-zip            12203
+5327ms  beginner  answered q-situation      employed
+5806ms  beginner  answered q-pay            62000
+6295ms  beginner  answered q-cash           3000
+6799ms  beginner  FIRST INSIGHT reached
```

Five questions to a real figure: **"About 1.1 months of runway — $3,000 in
cash against $2,842 a month. Rough: it leans on 8 guesses you can confirm or
change behind the doors."**

That is the ski lift, and it works. Almost nothing else in personal finance
gets a stranger to a true, caveated sentence about their own life in five
questions. Everything below is written against that standard, not against
some lower one.

---

## 2. The best version of this

The best version is not more rooms. It is the same ninety-two rooms with four
properties the app already has the data for and does not yet show:

1. **Every number says how old it is.** A runway built on spending you typed
   fourteen months ago is a different number from the same runway typed this
   morning, and it should not look identical.
2. **The lodge knows you.** Coming back is the whole game in personal
   finance. The app should open on what you earned last time, not on the
   pitch it shows a stranger.
3. **One meter.** How far along you are should not change because you walked
   into a different room.
4. **Whose numbers these are is never in doubt.** The example household is
   the path most people take first; it must keep saying it is an example.

With those four, the green run and the black diamond are the same mountain:
the beginner is carried up by the guesses and told which are guesses, and the
expert is handed the provenance — age, source, confidence — of every figure
they are asked to trust. That is the massage from beginner to expert: not a
second "advanced mode", but **the same screen telling you more as you learn to
read it.**

---

## 3. The worst version of this

The worst version is the one the walk actually found in places, and it is
worth naming plainly because it is what the app drifts toward by default:

> A library of ninety-two beautiful rooms, each individually correct, that
> together cannot tell you whether the number on the screen is yours, when it
> was true, or whether you are making progress — and that greets you on your
> fourth visit exactly as it greeted you on your first.

Every ingredient of that worst version was present before this session, and
none of it was carelessness. It is the specific failure mode of a well-built
suite of independent parts: **the seams between the rooms are nobody's room.**

---

## 4. The flaws, ranked, with the fix for each

### F1 — Timestamps existed on every number and reached two screens out of 92 ▲ fixed

Every owned field has carried `{ asOf, source, confidence, room }` since
D-056/D-181, and the spine stamps one on every write. The sweep found the age
of a number visible on **2 of 92 rooms**. `Staleness.summary()` carries a
comment saying it is "for the dashboard's one staleness line" — the dashboard
renders it inside `<details id="full-panel">`, folded shut.

So a figure typed eighteen months ago and one typed this morning were drawn
identically, on ninety screens, while `Doors.understanding` was quietly
discounting the stale one to 0.7 behind the scenes. The app knew. It did not say.

**Fix** — `Staleness.forFields()` and `Staleness.line()` (pure, tested), and
one quiet line under the header of every room: *"Oldest number on this screen:
last touched over a year ago. 3 are past the date it is worth a look. Look at
them →"*. Fresh screens say so in six words. Nothing is discounted, hidden or
recoloured — D-057 holds; it is a prompt to look, not a verdict.

### F2 — The example household left no mark ▲ fixed

`shared/demo-persona.js` sets `meta.isDemo: true` on the object it builds.
All three callers that write the demo into the spine copied out the parts they
wanted and left the meta behind — and **nothing read the flag anyway**. Two
screens after clicking "See it with example numbers", Robin Sparks's runway
read exactly like your own, with no way to tell, forever.

On an app whose first non-negotiable is that it never holds real financial
data — so the demo is the path most people take — this is the most serious
finding in the audit.

**Fix** — `Spine.markDemo()` / `Spine.isDemo()`, stamped at all three write
sites, and one line on every room: *"Example numbers. These are Robin
Sparks's figures, not yours. Clear them and start with mine."* Deliberately
not cleared by typing over one figure: one real number in Robin's household
still leaves the rest Robin's.

### F3 — Home greeted a returning beginner as a stranger ▲ fixed

Measured: a beginner finishes the First Round, is told their runway, and goes
home. Home shows the same marketing card a cold browser gets — *"Answer a
short set of questions once"* — asking for work they just did. The figure they
earned lived on the screen they had navigated away from and nowhere else. The
only trace was one grey line: *"4 of 16 answers in."*

**Fix** — the lodge. When anything has been answered, the landing leads with
the figure they earned (`Doors.firstInsight`, the First Round's own insight —
not a second copy of the arithmetic), the understanding meter every other room
shows, and when they were last here. The heading becomes "Welcome back."

### F4 — The progress meter changed when you changed rooms ▲ fixed

Same household, same moment, two answers:

- home: **"4 of 16 answers in"** (`Progress.overall`)
- Ledger and Express: **"You understand 31% of your financial picture"** (`Doors.understanding`)

Neither equals the five questions the person had answered. A meter that
disagrees with itself is worse than no meter: it teaches the person that the
numbers on the screen are decorative.

**Fix** — home now prints `Doors.understanding`, the same sentence the Ledger
and Express print, from the same function. Verified equal (31% / 31%) on the
same household. Uncovered on the way: the dashboard never called
`LedgerRows.use()`, so the meter there was right arithmetic over an empty list.

### F5 — No record of deliberate use ▲ fixed

`meta.visitedRooms` is written on every room open, carries **no dates**, and
is **read by nothing** (one of the 66 dead fields in known problem 4). The only
clock was `meta.updatedAt` — one last-write stamp — and a single `visit.last`
number in Prefs that exists to fire the Comeback and is not part of the
household, so it does not survive an export.

The app therefore could not answer the most motivating question a returning
person has: *have I kept this up?*

**Fix** — `meta.visits { firstAt, lastAt, days[], count }`: one entry per
calendar day, written by `Spine.noteVisit()` on every room open, skipped by
the command log so looking at a screen is not undoable, and travelling with an
export because it lives in the household. Home reads it: *"You were last here
9 days ago, on 7 days so far."*

### F6 — Four front doors are live at once ○ not fixed, needs the owner

The landing offers **First Round**, **Express**, **example numbers** and *"The
older one-pager is still here"* (Start Here) — plus Front Doors and
Walk-Through elsewhere. `ARCHITECTURE.md` already names this as known problem
5, and STATUS.md's cut list says Start Here retires into the Ledger once
someone decides who owns income sources.

This is a decision, not a bug: closing a door moves 17 owned fields. It sits
above the fix line deliberately. **It is the single biggest remaining cost to
the beginner** — the lift has four queues and no sign saying which is shortest.

### F7 — Express is a cliff, not a black diamond ○ not fixed

94 visible inputs on one page (Expenses: 87). The expert path is real, which
most tools cannot claim — but a black diamond is steep *and groomed*. 94 boxes
is ungroomed. The material for the fix already exists: the rows carry doors
and levels 1–4, and Express already groups by them. What is missing is a
default that opens level 1 only, with the rest one tap away.

### F8 — `test/forms.js` has been silently skipping ▲ fixed

The repo's own phone-form walk resolves Chromium at `/opt/pw-browsers/chromium`.
In this container it lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
and playwright is installed globally rather than locally — so the test prints
`SKIPPED` and exits 0. A verification step that always passes by not running is
a verification step that is not there.

---

## 5. Measured after the fixes

The same sweep, re-run against a household with numbers in it (the empty one
correctly shows nothing, because nothing that was never entered can be old):

| | Before | After |
|---|---|---|
| Rooms showing when their numbers were last touched | **2 of 92** | **66 of 92** |
| Rooms saying the example household is the example | **0 of 92** | **91 of 92**, plus the dashboard |
| Page errors across all 92 rooms, full household | 0 | **0** |
| Home vs Ledger progress meter | 4 of 16 · 31% | **31% · 31%** |

The 26 rooms with no age line declare no `needs` or hold nothing entered —
silence there is the honest answer, not a gap.

Suites: `node test/run.js` 30,634 checks; `node test/forms.js` 604 checks,
typing survives in every room; `node tools/context/build.js --check` current.
`tests/` a11y could not run — `axe-core` is not installed in this container
and there is no egress to fetch it; that gap is pre-existing and untouched.

---

## 6. What the audit did not find

Worth stating, because an audit that only lists faults is a dishonest audit:

- **Zero console errors across all 92 rooms on a cold open.** The single hit
  in the sweep log was the harness requesting a wrong URL, not the app.
- **`empty ≠ zero` holds everywhere it was checked.** The First Round's
  insight names its eight guesses rather than absorbing them.
- **No network call after load**, and the app proves it on screen rather than
  claiming it (`Progress.privacyReceipt` counts cross-origin requests from the
  browser's own resource timing).
- **The arithmetic is not duplicated.** Every fix above reads an existing
  function rather than deriving a second copy; that was possible *because* the
  one-formula-one-function rule has been kept.

---

## 7. Where this leaves the mountain

The lift (First Round) was already good. This session built the lodge — home
knows you, says what you earned, says when you were last here — and put a
clock and a name on every number on the mountain, so a beginner is told which
figures are guesses and how old they are, in the same words an expert needs to
audit them.

What remains is the queue at the bottom: **four doors, one mountain** (F6).
That one is the owner's call, and it is next.
