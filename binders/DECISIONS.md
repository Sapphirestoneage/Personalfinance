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
