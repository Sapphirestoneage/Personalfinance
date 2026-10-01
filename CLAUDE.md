# House rules for this repo

This repo should read like it was built by a careful human team, not generated in a hurry. Someone reviewing it on GitHub should understand what it does, where things live, and why, within 10 minutes.

## Every session, before you finish
- Leave the code you touched cleaner than you found it.
- Delete dead code, commented-out blocks, unused files, and leftover debug logs in anything you edited. Don't comment code out "just in case." Git history keeps it.
- If you notice mess outside your task, list it at the end of your reply under "Cleanup spotted." Don't fix it mid-task.

## Commits
- One logical change per commit. Never mix a feature and a cleanup.
- Messages: short imperative summary (under 60 chars), blank line, then 1-3 lines on WHY.
- No commits named "fix," "update," "changes," or "wip."

## Code
- Shared logic lives in one place. If the same math or helper appears in two rooms, move it to the shared core and import it.
- Names say what things are. No temp, data2, newFunction, finalFinal.
- Small functions that do one thing. If a function needs a comment to explain what it does, rename or split it first.
- Comments explain WHY, not what. Delete comments that restate the code.
- No new dependency without explaining why in the commit message.
- Match the existing style of the file you're in.

## Files and folders
- Root holds only what a newcomer needs: README, CLAUDE.md, config, and top-level folders.
- Planning docs and prompt files go in docs/. Superseded ones go in docs/archive/ with the date they were replaced in the filename.
- Every folder with more than a few files gets a short README saying what's in it.

## README
- Keep README.md current: what this is (2 sentences), the live link, how to run it locally on Windows, a folder map, and how to run tests.
- If a change makes any README line wrong, fix it in the same commit.

## Safety
- Cleanup must not change behavior. Run the Playwright tests before and after. If no tests cover what you're touching, say so.
- Never rename or delete localStorage keys or saved data formats without a migration.
- If a cleanup is risky or large, propose it and wait for my OK.

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
- Exception (D-339): `coach/` is a separate app (like `dnd/`), three screens, its own
  tests and log (`coach/README.md`). Nothing outside `coach/` changes for it.
- Exception (D-340): `marketing/` is a separate app the same way (`marketing/README.md`).

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
