# CLAUDE.md (kept under 100 lines on purpose; every line loads every session)

SPARKS / SLAF: ~70 small personal-finance "rooms" sharing one household data
model. Static HTML + vanilla JS, no build step. Public repo.

## Start of every session (about 3k tokens total)

1. Read `STATUS.md` (where things stand, what is next, what is frozen).
2. Read `docs/ARCHITECTURE.md` (one page: layers, folders, vocabulary).
3. Run `git log --oneline -10`.
Then stop reading. Load more only for the task in front of you:

- A room: `node tools/context/pack.js <room-id>` (card + its latest decisions)
- A decision: `node tools/context/pack.js D-193`
- A field: `node tools/context/pack.js netWorth` (owner, who uses it, where stored)
- Anything else: `node tools/context/pack.js "search words"`
- Big docs by section: `docs/context/DOC-MAP.md`, then `sed -n START,ENDp FILE`

**Never read `DECISIONS.md`, `ROADMAP.md`, or `SPEC.md` top to bottom.** They
are archives. Use the index and the pack tool. Room cards in
`.claude/rules/rooms/` load by themselves when you open a room's files.

Shortcuts: `/start`, `/room <id>`, `/find <words>`, `/simplify`, `/drift`, `/wrap`.

## Non-negotiables

- No real financial data, ever. Demo values only, behind "Try with example numbers".
- Empty is not zero. `null` = not entered, `0` = typed zero. No silent `|| 0`;
  a missing input gives an incomplete state, not a number.
- Money is integer cents internally; format only at display.
- One owner per shared field (`shared/ownership.js`). Editable in one room,
  read-only link everywhere else.
- One formula, one function. Parameterize; never copy-paste a calculation.
- Never rebuild a container of live inputs while it is in use (D-034): guard with
  `shared/liveform.js` or build once and mark `LIVE-FORM: built once`.
- Reference data lives in `data/`, versioned by year. Never inline.
- Changing a stored shape needs a compatibility note in the decision entry.

## The freeze (until STATUS.md lifts it)

- No new rooms, frameworks, lenses, or vocabularies.
- If a request would add one, ask "what does this replace?" before building.
- Prefer deleting, merging, and wiring existing rooms together.
- Every session should leave the app with the same or fewer screens and fields.

## Stop and ask instead of guessing

- The change would give a room a private copy of a household number, or let a
  second room edit a field it does not own.
- A decision it depends on is marked `[PENDING]` in SPEC.md section 12.
- You cannot say what the change replaces or simplifies.

## Decisions log

Two sequences in DECISIONS.md, split by the divider: `D-###` (SPARKS) goes just
above the divider; `DD-###` (Dungeons & Dividends, `dnd/`) goes at the very end.
Take the next free number. `dnd/shared/*.js` are vendored copies; leave their
D-numbers alone. `test/run.js` enforces all of this.

New entries use `docs/context/DECISION-TEMPLATE.md` (20 lines max).
Long reasoning belongs in the commit message, not the log.

## Workflow

- One commit per room; systemic passes get their own commit.
- Verify before "done": `node test/run.js`; for any room with typed input,
  `node test/forms.js`; serve with `python3 -m http.server` and check the console.
- End with `/wrap`. `node tools/context/build.js --check` fails if the
  context files are stale.

## End every session with a link

The owner is not a coder. Finish by printing a clickable link to the room you
changed: `https://sapphirestoneage.github.io/Personalfinance/rooms/<id>.html`.
Pages serves `main` only; if the work is on a branch, say so in one line and
give the branch link instead.
