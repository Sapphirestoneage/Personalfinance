# CLAUDE.md — working agreement for this repo

## Read first, every session

See `SPEC.md` for the full Tier 0–2 build spec and locked decisions.
`ROADMAP.md` is the master idea index — every tier, 0 through 24. It is the
idea universe, not the build plan: its ✅ means "the idea is locked", not
"this exists". `SPEC.md` scopes what this repo actually builds, and the
build-status table at the top of `ROADMAP.md` says what is shipped.

Then read `README.md` (what this project is, and how to change it) and
`DECISIONS.md` (what has already been decided and why). This repo is the
build — a parallel Vue/TypeScript effort was stopped, see D-037. `SPEC.md` is the authority on the data model,
naming, units, design rules, and build order. `DECISIONS.md` is the running
log; when the two disagree, `SPEC.md` wins unless a `DECISIONS.md` entry
explicitly supersedes it and says so.

## What this repo is

SPARKS / SLAF — a suite of small, self-contained personal-finance tools
("rooms") that share one canonical household data model through a thin
client-side spine. Static HTML + vanilla JS, no build step, served straight
from the filesystem. Public repo.

## Non-negotiables

- **Public repo. No real financial data, ever.** Demo/placeholder values
  only, and only behind an explicit "Try with example numbers" action.
- **Empty ≠ zero.** Inputs default to empty with a format-only placeholder.
  `null`/`undefined` means "not entered"; `0` means the user typed zero.
  They never collapse into each other. See `SPEC.md` §4, §5.
- **No silent `|| 0` in formulas.** A missing required input produces an
  incomplete state, not a number. See `SPEC.md` §5.
- **Money is integer cents internally**, formatted to dollars only at
  display time. See `SPEC.md` §6.
- **One owner per shared number.** A field is editable in exactly one room;
  everywhere else it renders read-only and links to its owner. The map is
  `shared/ownership.js`. See `DECISIONS.md` D-017.
- **One formula, one function.** Parameterize variants; never copy-paste a
  calculation with small edits. See `SPEC.md` §8.
- **Never rebuild a container of live inputs while someone is using it.**
  A room either guards the container with `shared/liveform.js` and calls
  `request()`, or builds its controls once and only writes their `.value` —
  and says which, with the marker `LIVE-FORM: built once`. Replacing an
  input's DOM node mid-tap closes the soft keyboard on a phone and it does
  not come back, because a programmatic `.focus()` cannot reopen it. See
  `DECISIONS.md` D-034; `test/run.js` enforces the declaration and
  `test/forms.js` taps through every form on a mobile browser.
- **Reference data lives in `data/`, not inline in calculator code**,
  versioned by year where relevant. See `SPEC.md` §7.
- **Build in dependency order.** See `SPEC.md` §9.

## Guardrails — stop and ask rather than guessing

- You can't answer all five questions of the per-tool spec template
  (`SPEC.md` §11) for the tool you're about to build.
- A decision in `SPEC.md` §12 is still marked `[PENDING]` and you've reached
  the tool that depends on it.
- The change would make a room hold its own private copy of a number that
  already exists in the household model, or would let a second room edit a
  field it does not own (`shared/ownership.js`).

## Compatibility note requirement

Never change how existing rooms read or write shared profile data without
adding a compatibility note to `DECISIONS.md` stating exactly what changed
in the stored shape, which rooms were updated to match, and what a future
room needs to know before calling `getProfile()` / `updateProfile()` for the
first time.

## Two decision sequences

`DECISIONS.md` holds two logs separated by a divider, and they do not share
numbers:

- **`D-001` onward — SPARKS / SLAF**, above the divider. A new one goes
  immediately *above* the divider.
- **`DD-001` onward — Dungeons & Dividends** (`dnd/`), below it. A new one
  goes at the *end* of the file.

Take the next free number in whichever sequence you are writing in. They cannot
collide, which is the point: the D&D entries used to restart at D-046 and clash
head-on with the SPARKS entries of the same numbers, and parallel sessions kept
having to renumber on merge.

`dnd/shared/*.js` are byte-identical vendored copies of the SPARKS files, so the
`D-0xx` references inside them are SPARKS numbers. Leave them alone —
renumbering them breaks the vendored-copy guard. `test/run.js` enforces all of
this: prefixes by side of the divider, uniqueness within each sequence, that
every `DD-` reference in the repo resolves, and that no vendored copy carries
one.

## Workflow

- One commit per room; brand/systemic passes get their own commit, separate
  from feature work.
- Verify before calling anything done: serve it locally
  (`python3 -m http.server`), check for console errors, click through
  deep-link hashes, and re-derive the core math outside the browser against
  the demo persona. "Doesn't crash" is not verification.
- **Test any room that takes typed input on a phone-shaped browser with
  touch, not just a desktop window.** `node test/forms.js` does it. A
  desktop click resolves too fast to show the bugs a real tap finds, and a
  programmatic `.focus()` hides them completely.
- Log every assumption in `DECISIONS.md`, matching the existing entry format.

## End every session with a link

The repo owner is not a coder and does not want to hunt for what was built.
**Finish every session by printing a clickable link to the thing you changed**,
as the last thing in your reply.

GitHub Pages serves from `main` at
`https://sapphirestoneage.github.io/Personalfinance/` — so a room is only live
once its work is **on `main`**. Give the deep link to the specific room, not the
site root:

    https://sapphirestoneage.github.io/Personalfinance/dnd/campaign.html

If the work is still on a feature branch, **say so in one line** and give the
branch link instead of a Pages link that would show the old version. Never hand
over a Pages URL for something that is not on `main` yet — it looks broken and
it is not.
