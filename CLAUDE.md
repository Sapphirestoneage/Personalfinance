# CLAUDE.md

SLAM (Stress Less About Money): coach-operated budgeting software. Static HTML and ES modules,
no build step, no dependencies. The app is `slam/`; everything else at the root is documentation,
tests wiring, or the archive of earlier generations. Public repository.

## Start of a session

1. Read `README.md` (the front page) and `slam/LESSONS.md` (the 23 rules every change is checked
   against). For how the pieces fit, `docs/ARCHITECTURE.md`; for words, `docs/GLOSSARY.md`.
2. Run `git log --oneline -10` and `npm test` (350 tests, a few seconds).
3. Decisions are logged in `slam/DECISIONS.md` (one row per decision, S-###, newest last); the
   reasoning behind the main ones is in `docs/DECISIONS.md`. Add a row for anything a reader would
   ask "why" about. Ideas out of scope go in `slam/PARKING_LOT.md`.

## Non-negotiables

- No real financial data, ever. Demo households are made up (`slam/src/data/households/`).
- Empty is not zero. `null` means not entered; a typed 0 is an answer. No silent `|| 0` on a fact.
- Every number lives in one place (the store) and is computed in one place (`slam/src/engines/`).
  Screens never calculate; they read `buildSummary` and format.
- Every value carries a status; app-supplied averages are labeled "Guess" with their source.
- Estimates are the client's own words and are never overwritten.
- Reference data lives in `slam/src/data/` with a source and a year. Never inline a figure.
- No em dashes in code comments, UI text, docs, or commit messages.

## Workflow

- One branch and small commits per change; tests before and after (`npm test`; for a screen change,
  serve `slam/` on port 8765 and run `npm run test:browser`).
- A changed stored shape needs a migration step in `slam/src/store/migrate.js` and a bump of
  `SCHEMA_VERSION`, and the household tests must still load every demo.
- `archive/` is read-only history. Do not change it; its suites run from `.github/workflows/archive.yml`
  on demand. If something in there is wrong, note it in `KNOWN_ISSUES.md`.
- Two SLAM branches are open (`claude/slam-phase-1-foundation`, `claude/slam-phase-2`). Check them
  before adding a tool beside the Budget.

## End every session with a link

The owner is not a coder. Finish with the address of what changed. Pages serves `main`:
`https://sapphirestoneage.github.io/Personalfinance/slam/`. If the work is on a branch, say so and
give the branch link instead.
