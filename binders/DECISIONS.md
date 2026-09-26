# The Binders: decisions

The log for `binders/`, its own sequence. SPARKS decisions stay in the root
`DECISIONS.md` (`D-###`); D&D in the same file below the divider (`DD-###`);
Coach Mode in `coach/DECISIONS.md` (`CD-###`).

## PB-001: The Binders is its own app in binders/, twelve playbooks as planets with six bands

**Why.** The owner wants a tool for each of the twelve playbooks in the $100M
playbook binder (Leads, Sales, Delivery, Profit; three each), run through the
levels-and-planets dynamic of SPARKS, with pictures, every exercise and a
checklist where a step needs one.

**Decision.** `binders/` is a separate app like `dnd/` and `coach/`: two
screens (the sky, a playbook), its own storage (`binders.v1`, never a `slaf.`
key), copies of the look only (`tools/vendor.js`), its own tests
(`node binders/test/run.js`, in CI) and this log. Twelve planets in four
systems, six bands each (Read, Facts, Exercises, Build, Run, Sharpen), the
same depth on every planet; 72 levels, 203 exercises, 165 checklist items in
`data/playbooks.json`. A level is done when every exercise holds an answer and
every checklist item is ticked. Shared facts (price, gross margin, cost to
acquire, the booking rate) have one owner level and are read elsewhere through
`{ ref }`. 36 readings in `engines/reads.js` draw as SVG with a table twin.
The words are original: no book or playbook text is reproduced.

**Replaces or removes.** Nothing in SPARKS. No SPARKS screen changes.

**Stored shape.** New key `binders.v1` `{ version, answers, rough, checks,
prefs, updatedAt }`. No change to `slaf.household.v2` or any SPARKS key; the
SPARKS device backup neither carries nor removes it.

**Verified.** `node binders/test/run.js`; `node test/run.js`; the two pages
served and walked in Chromium with a clean console.

## PB-002: The binder as one Excel workbook, built from the same data

**Why.** The owner finds the app more than they want right now and asked for
a professional spreadsheet instead.

**Decision.** `tools/build_xlsx.py` writes `The-Binders.xlsx` from
`data/playbooks.json` and `data/example.json`: Start here, Dashboard (all
twelve playbooks, the band matrix, rings, headline readings, a completion
chart), Readings (every figure as a live formula, 1,287 formulas in all, with
charts), one sheet per playbook (band progress, then every exercise and
checklist with yellow input cells, dropdowns for ratings, choices and Y/N,
small tables for logs, an example column from the made-up coach), and a
hidden Lists sheet. Shared facts are typed on their owner sheet and read
elsewhere in green. Money is whole dollars, percentages are fractions shown as
percentages. Verified against the app: with the example answers typed in,
seventeen readings match the engine's figures and LibreOffice reports zero
formula errors.

**Replaces or removes.** Nothing; the app stays. The workbook is the same
content in a second form.

**Stored shape.** None in the browser; the workbook is a file the owner keeps.

**Verified.** `node binders/test/run.js`; the recalculation check with zero
errors; the readings compared to the engine on the example answers.
