# Architecture (one page; read at the start of every session)

## The shape

One household object per browser, in localStorage under `slaf.household.v2`
(`shared/spine-v2.js`; older shapes migrate on read). Every shared number in
it has exactly one owning room (`shared/ownership.js` `FIELDS`, 110 fields);
the owner writes through `Ownership.write`, everything else renders a
read-only link. Reads go through `shared/schema.js` accessors and
`shared/daite.js`, which names every path as one of five money families
(debt, assets, income, taxes, expenses) plus you/plans/prefs/progress.

Logs live inside the household: `ledger.income[]` (dated income entries with
their costs), `ledger.months[]` (closed months, estimate beside actual) and
`expenses.entries[]` (the expense log). Scenarios and blocks live beside it,
never in it: `slaf.scenarios.v1` (`shared/scenarios.js`, capped at ten) and
`shared/blocks.js`, which lays a hypothetical onto a copy of the household
through `Spine.householdAt(date, { blocks })`. Readings are computed on every
render; engines never write. Undo snapshots sit under `slaf.snapshots.v1`.

## Folders

- `rooms/` — 71 registered pages, one per room; markup + inline script.
- `engines/` — 64 pure calculation modules; take a household, return Results.
- `shared/spine-v2.js` — load/save/migrate the household; `onChange`; `householdAt`.
- `shared/schema.js` — constructors and accessors; every stored shape starts here.
- `shared/money.js` — integer cents, `ok`/`incomplete` Results, formatting.
- `shared/ownership.js` — the field map: owner, anchor, read, format, write.
- `shared/registry.js` — every room: id, title, href, group, aliases, blurb, needs.
- `shared/daite.js` — the five families; field id → declared path; `view()`.
- `shared/blocks.js`, `shared/scenarios.js` — hypotheticals beside the facts.
- `shared/liveform.js` — guard for containers of live inputs (D-034).
- `shared/backup.js` — export/import of everything this browser holds (D-204).
- `data/` — 80 reference files, year-versioned; `ledger-rows.json` (every
  number the app can hold, 81 rows), `spheres.json`, `levers.json`,
  `lenses.json`, `blocks/<type>.json`; keys map to files in `shared/reference.js`.
- `test/run.js` — 28k unit checks, node only; `test/forms.js` — phone form walk.
- `tests/` — property, corpus, data and a11y suites with their reports.
- `dnd/` — Dungeons & Dividends, a separate tool; `dnd/shared/*` are vendored copies.
- `tools/context/` — `build.js` (indexes, room cards) and `pack.js` (per-task context).
- `docs/context/` — generated indexes: ROOMS, FIELDS, DECISIONS-INDEX, DOC-MAP.

## Vocabulary

- **DAITE** — debt, assets, income, taxes, expenses: the five families every number belongs to (D-171).
- **FAT** — food, accommodation, transportation: the three boxes whose total is the lean month (D-172, revised D-197).
- **DRAFTT** — seven shares against seven bands, the scorecard's measuring stick (D-173).
- **The Ledger** — every number the app can hold as one row of three kinds: know, lookup, computed (D-183, room D-185); also the dated income and expense logs (D-128).
- **Spheres** — nine life spheres, each with depth, drawn from one file (D-184).
- **Blocks** — a hypothetical (a home, a kid, a job change) laid on the household, never in it (D-178).
- **Lenses** — thirty-three ways to read the same numbers, one card a domain (D-175).
- **Levers** — six levers in one file, three verbs, an hourly figure (D-174).
- **Triple D** — the shaded band on the Long Way Round chart: drawdown, duration, depth (D-176).

## Known structural problems (confirmed in the code, 2026-09-11)

1. Logged income does not reach the headline numbers. `ledger.income[]` is
   read only by the ledger, budget, calendar and tax-room engines; savings
   rate and the FI date (`engines/tier0.js`) read `grossAnnualIncome`, which
   Start Here still owns. Logged pay never changes them.
2. Start Here owns 17 core fields (the most of any room) but is meant to
   retire into the Ledger; those owners must move first.
3. Typical versus actual is spread over four rooms: Expenses (the typical
   month), Cash Flow (the log), Budget (estimate beside actual), Variance
   (closed months read back).
4. 66 of the 103 traceable shared fields are mentioned by no room but their
   owner (`docs/context/FIELDS.md`); some are read through schema paths the
   trace cannot see, the rest are dead ends.
5. Four onboarding doors are live at once: Start Here, Front Doors (`doors`),
   Walk-Through (`walk`) and the Ledger.
6. Data lives only in this browser. Two reminders: the 30-day nudge inside the
   Backup panel on Ledger and Settings, and the offer at a monthly close
   (D-225). Neither is a popup; both are a line and a button.
