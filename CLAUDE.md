# CLAUDE.md — working agreement for this repo

## Read first, every session

See `SPEC.md` for the full Tier 0–2 build spec and locked decisions.

Then read `README.md` (what this project is) and `DECISIONS.md` (what has
already been decided and why). `SPEC.md` is the authority on the data model,
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
- **One formula, one function.** Parameterize variants; never copy-paste a
  calculation with small edits. See `SPEC.md` §8.
- **Reference data lives in `data/`, not inline in calculator code**,
  versioned by year where relevant. See `SPEC.md` §7.
- **Build in dependency order.** See `SPEC.md` §9.

## Guardrails — stop and ask rather than guessing

- You can't answer all five questions of the per-tool spec template
  (`SPEC.md` §11) for the tool you're about to build.
- A decision in `SPEC.md` §12 is still marked `[PENDING]` and you've reached
  the tool that depends on it.
- The change would make a room hold its own private copy of a number that
  already exists in the household model.

## Compatibility note requirement

Never change how existing rooms read or write shared profile data without
adding a compatibility note to `DECISIONS.md` stating exactly what changed
in the stored shape, which rooms were updated to match, and what a future
room needs to know before calling `getProfile()` / `updateProfile()` for the
first time.

## Workflow

- One commit per room; brand/systemic passes get their own commit, separate
  from feature work.
- Verify before calling anything done: serve it locally
  (`python3 -m http.server`), check for console errors, click through
  deep-link hashes, and re-derive the core math outside the browser against
  the demo persona. "Doesn't crash" is not verification.
- Log every assumption in `DECISIONS.md`, matching the existing entry format.
