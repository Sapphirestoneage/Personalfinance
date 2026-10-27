# SLAM review kit

The standard every overnight round is judged by. A reviewer reads this, docs/FEATURES.md, the screenshots in
docs/overnight/round-N/ and the reports (qa-crawl, agree-check, screen-budget), and writes findings.md: screen, severity,
who hits it, and a specific fix.

Principle: slim on the surface, deep underneath. A screen is calm (one main number, one main action, the rest in
one-line rows that expand); a feature is complete, not cut. A working feature is never deleted to meet a word budget:
it moves behind a row, a tab or a view. Every task has at least two ways to do it; every set of data has at least two
ways to see it (a chart and a table at least).

Severity: high breaks trust or a task (a wrong number, two numbers that disagree, a dead end, a crash). Medium is noise,
extra steps, ugly, inconsistent, or a chart that does not answer its question at a glance. Low is polish.

## The people

**Eli, the coach.** On a laptop in dark mode, screen shared on a live call, the client talking while he types. An
ex-auditor who catches a wrong number instantly.
- Wants: calm screens with depth one tap away; buttons that look like buttons; software that looks and feels real and is
  beautiful; one next step; edit where the number is; more than one way to do anything; charts that answer a question at
  a glance; numbers that agree everywhere; plain words.
- Stops at: the same message twice; forms open that nobody asked for; chips on every row; typewriter fonts; anything he
  would have to explain aloud; dead ends.

**Alexis, the avoidant client.** A red number with no fix makes her leave. One calm sentence and one button.

**Tom, the CPA client.** Catches contradictions. Also notices a screen that is all detail and no answer.

## Krug's checklist, per screen

- The trunk test: the site's name, the page's name, the sections, the options, where am I, search.
- The main number and the main action show without scrolling.
- Nothing is said twice.
- What can be clicked looks clickable, and nothing else does.
- Exactly one primary button.
- No line that needs explaining.
- Nothing that drains goodwill (a forced step, a question already answered, a scold).

## Money logic

- Next steps are ranked by dollars lost a month; a promo cliff and deferred interest count.
- Card use comes first only when the client is applying for credit soon.
- A missing number is a question, not a blocking step.
- A covered line, or one marked not for me, asks nothing.
- Money owed to you is not cash; a repayment counts only once it lands in an account.
- A handout carries the client's name, the date, the preparer and the education-not-advice line.

## Visual standard

- One color system: tokens for surface, text, accent, success, caution and danger, each tested for contrast in light and
  dark. Dark mode is designed, not inverted.
- One icon set: inline SVG, the same stroke everywhere.
- One type scale; money in tabular figures.
- Spacing on a 4px grid.
- Designed empty states: an icon, one sentence, one button.
- Subtle motion: 150 to 200ms, and none for people who ask for reduced motion.

## Chart standard

- Each chart answers one question, written as its title ("When is your debt gone?").
- One shared chart palette: categorical colors safe for color-blind readers, a sequential ramp, a diverging pair; the
  same in light and dark.
- Direct labels instead of legends where possible. No 3D; no pie chart past 3 slices; no gridline clutter.
- Money axes in whole dollars with k and M.
- Hover or tap shows exact values.
- Every chart has "Show as table" and a text summary of its main point for screen readers.
- Rough or missing inputs show hatched or dashed, never as solid fact.
- Plain SVG, no outside library unless one is already vendored.

## The skeleton every feature must have

- Entry points: everywhere it is relevant, at least two.
- At least two views of its data.
- Every state designed: empty, partly filled, rough, full, error.
- Actions: add, edit in place, stop or close, delete, undo.
- Where its numbers come from: Show the math.
- Tests.

docs/FEATURES.md marks every feature against this skeleton (done, partial, missing).

## The reports

- `node tools/qa-crawl.mjs`: every screen within 3 taps, at 375px light, 375px dark and 1280px light; errors, overflow,
  words that should never show (undefined, NaN, null, [object, Infinity, em dashes), cents outside Show the math, "0"
  placeholders, inputs with no label, tap targets under 44px, monospace on client text, a tab bar on two rows; then every
  enabled control tapped in fresh storage, with errors and dead clicks flagged. Must pass.
- `node tools/agree-check.mjs`: every key number carries data-metric="<registry id>"; fails when one metric shows two
  different values anywhere, charts included. Must pass.
- `node tools/screen-budget.mjs`: words, height, buttons and chips per screen at 390px and 1024px. Reports; never fails.
