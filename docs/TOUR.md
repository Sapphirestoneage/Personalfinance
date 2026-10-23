# A ten-minute tour for a programmer

This page is for someone who has never seen the repository and wants to know what it is, how it is
built and why, in about ten minutes. Each section says what to open. Words in finance or in this
project's own vocabulary are in `GLOSSARY.md`.

## 1. About this project

[PLACEHOLDER: one paragraph in Eli's own words. The facts to cover: Eli is a financial coach;
background in audit at Deloitte; CPA-eligible; has worked with over 100 clients. Add how long the
coaching practice has run and what kind of clients.]

The problem SLAM solves: a coach and a client sit down with a paycheck, a rent figure and a vague
sense of "where does it all go". Spreadsheets get built and abandoned; budgeting apps assume the
client types alone and already knows the categories. SLAM is built for the session itself. The
client guesses first (the estimate), the log finds the truth (the actual), the month closes with a
checklist, and the one question every client asks, "why does my bank balance not match the budget",
gets a line-by-line answer (the bridge). Everything stays in the client's browser.

Why Eli built it rather than buying it: [PLACEHOLDER: Eli's reason, in one or two sentences. The
repository shows the path: a one-page calculator in July 2026, then four more generations, each
rebuilt from what the previous one got wrong. `../archive/README.md` tells that story; `../slam/LESSONS.md`
is the 23 rules it produced.]

## 2. The tour

Open these in this order. Ten minutes is enough for the first five; the rest is for a second look.

1. **`../slam/LESSONS.md`** (2 minutes). Twenty-three one-line rules, each paired with the mistake
   that produced it. This is the design document; everything else follows from it.
2. **`../slam/src/store/schema.js`**, `newHousehold()` near the bottom (2 minutes). The whole data
   model is one JSON document: income sources, categories of budget lines, debts, accounts with dated
   balances, the log of entries, monthly plans, closed months. `value.js` beside it defines the Value
   every amount is made of: the number, how often (cadence), how sure (status), who said it (source).
   `ARCHITECTURE.md` draws how the document moves.
3. **`../slam/src/engines/totals.js`** (2 minutes). One engine, typical of the 43: pure functions
   that take the household and return numbers. Read `budgetTotals` for how spending, savings,
   surplus and the savings rate are defined, and notice that nothing in the folder imports from the
   UI. `money.js` is 40 lines and shows the house rule that empty is not zero.
4. **`../slam/src/ui/nav.js`** then `../slam/src/ui/screens/today.js` (2 minutes). The one map of
   where everything lives, then a screen: it reads the summary object the engines produced and
   formats it. There is no arithmetic in the screens; the audit that confirmed this is `AUDIT.md`,
   section 7.
5. **`../slam/tests/engines-roundnumbers.test.js`** (1 minute). Small round numbers you can check in
   your head. Then `../slam/tests/riley.test.js` and `../slam/src/data/households/maya.expected.js`:
   a full year of one demo household, every expected number worked out by hand in the comments.
6. Second look: `../slam/src/engines/bridge.js` (why the budget and the bank disagree, explained to
   the dollar), `networth.js` and `networth-bridge.js` (two net worths), `calendar.js` (the next 30
   days of cash and "safe to spend"), `../slam/src/store/records.js` and `../slam/HOSTING.md` (what is
   already in place for a shared, hosted version), `../slam/tools/screens-check.mjs` (the browser check
   that compares what the screens show to the hand-computed files), and `../slam/DECISIONS.md` (139
   dated decisions, one row each, with the reason).

To see it run: `npm run serve` at the repository root, open http://localhost:8765/, click
"Try with example numbers", pick Riley. `npm test` runs the 350 unit tests in a few seconds.

## 3. What Eli is proudest of

[PLACEHOLDER: Eli to confirm or reorder. These are the parts of the build the cleanup pass found
strongest; the links are real.]

- **The monthly loop as the menu** (`../slam/src/ui/nav.js`, decisions S-105 to S-109). Plan, Track,
  Review are the three screens a coach uses in order every month; Insights is read-only; one-time
  Setup is kept apart from weekly use. The earlier generation had 93 screens.
- **Estimates are never overwritten** (`../slam/LESSONS.md` rule 17, `../slam/src/store/plans.js`).
  The client's first guess stays as the client said it. Corrections go into a monthly plan, so
  "how well do I know myself" can be measured month after month.
- **The bridge** (`../slam/src/engines/bridge.js`). Budget surplus to the actual change in cash, step
  by step, and anything unexplained is shown as its own step rather than hidden. The same idea
  repeats for net worth (`networth-bridge.js`).
- **Two net worths** (`../slam/src/engines/networth.js`). Everything, and what can actually fund a
  life (FI net worth leaves out the home, the car and the debt they secure). A yearly bill paid ahead
  is an asset that runs down monthly, so net worth does not crash the month it is paid.
- **Hand-computed test households** (`../slam/src/data/households/`, `../slam/tests/riley.test.js`).
  Seven made-up clients, every expected figure worked out by hand, checked both in Node and on the
  rendered screens.
- **Status on every value and empty is not zero** (`../slam/src/store/value.js`,
  `../slam/src/engines/money.js`). A blank is null, a typed zero is zero, an average is labeled a
  guess with its source, and a computed number says how it was worked out.
- **The lessons file itself** (`../slam/LESSONS.md`). Four rebuilds in four months, and the
  reasons written down in a form that a reviewer can check the code against.

## 4. Where Eli wants feedback

Concrete questions, pulled from `../KNOWN_ISSUES.md` and `AUDIT.md`. Blunt answers are welcome.

1. **Architecture.** Is "one JSON document per household in localStorage, pure engines, screens that
   only format" the right shape to grow into a hosted coach-and-client product, or would you start the
   server version differently? `../slam/HOSTING.md` lists what is already in place (record ids and
   versions, no hard deletes, one storage interface, a visibility map).
2. **Data model.** Every amount is a Value object (amount, cadence, status, source). Is that the
   right unit, or should status live at the record level? Would you store integer cents instead of
   dollars as typed (`KNOWN_ISSUES.md` item 3)?
3. **The engines.** 43 modules of pure functions, about 5,600 lines, all recomputed on every render
   through `buildSummary`. At what household size does that stop being fine, and what would you
   memoize first?
4. **Testing.** The strategy is hand-computed households plus browser checks that compare the
   rendered numbers to the same files. Is that enough? What would you add first: property tests,
   snapshot tests of the summary object, or something else?
5. **Migrations.** `../slam/src/store/migrate.js` carries every stored shape forward (schema version
   20 today). Is a step-per-version function the right pattern for a document that will live in a
   client's browser for years?
6. **What would you change first** if this were your codebase for the next six months?

## 5. Where a collaborator would make the biggest difference

These are the parts of the road ahead that need engineering experience Eli does not have. They are
open invitations, not a job posting; `../slam/HOSTING.md` and `../slam/PARKING_LOT.md` have the
detail.

- **Hosting, sign-in and a client view.** A coach signs in; a client signs in and sees their own
  household and nothing else; the visibility map already says which fields are coach-only. Where to
  host, how to authenticate, and what it should cost are undecided.
- **Syncing two copies.** Today a client file travels by export and import, and a record changed on
  both sides is a conflict the coach picks. A server version needs per-record saves with version
  checks and a live update when the other side saves; the interface is sketched in `HOSTING.md`.
- **Scaling the engines.** Everything recomputes on every render. Incremental computation,
  caching by month, or moving the engines into a worker are all open.
- **Bank connections.** Four CSV layouts are recognized. OFX and QFX files, more banks, or a
  connection service would remove the most tedious part of a session.
- **Accessibility.** No screen-reader or contrast audit has been done on SLAM.
- **Integer cents, a typed schema, or a build step** are all things a professional might want
  before building on this, and are open to argument.

## 6. How Eli works

Eli builds with Claude Code. One branch per change, small commits with plain messages, tests run
before and after (`npm test`, and the browser checks for anything a screen shows). Every decision
that a reader might ask "why" about gets a numbered row in `../slam/DECISIONS.md` on the day it is
made. Ideas that are out of scope go in `../slam/PARKING_LOT.md` rather than into the code. The rules
in `../slam/LESSONS.md` are checked against every change, and a self-audit (`../slam/AUDIT.md`) is
written at the end of each phase. The repository is public, and no real client data has ever been
in it: the demo households are made up, and the ignore rules refuse the file names every export has
used.
