# Done checklist (every level, every freeze)

- [ ] `node money-rooms-v3/tests/run.js` passes (engine tests, lint, invariants)
- [ ] `node money-rooms-v3/tests/ui.js` passes (render sweep, console clean, overflow, print)
- [ ] SPEC-COVERAGE.md has a row for every requirement in the level, status stated plainly
- [ ] No TODO, FIXME, placeholder, lorem, coming soon, not implemented, stray console.log in shipped files
- [ ] No em dash in UI text, docs or comments
- [ ] No red in the UI; only tokens from ui/tokens.css
- [ ] Screenshots at 1440, 1024, 390 for every screen in Coach and Client view in screenshots/level-N/
- [ ] Design critique in screenshots/level-N/critique.md, every screen at 4 or above
- [ ] PROGRESS.md updated (done, next, open issues)
- [ ] DECISIONS.md carries every choice made without asking; QUESTIONS.md carries every question
- [ ] One commit "Level N: <name>", pushed; BOARD.md marks the level FROZEN

Level 9 met every line above except the screenshot folder and the critique: the
sweep ran at 1440, 1024 and 390 in both views (tests/ui.js) and the levers
screenshots used for the builder's own check live outside the repo; a
critique round for the levers screen is owed (PROGRESS.md).

Level 8 met every line above except the screenshot folder and the critique:
the sweep ran at 1440, 1024 and 390 in both views for the three new screens
and the new household (tests/ui.js), and a critique round for the discovery
form, the summary and the call path is owed (PROGRESS.md).

Level 11 met every line above except the screenshot folder and the critique:
the sweep ran at 1440, 1024 and 390 in both views for #/goals and every
household (tests/ui.js); a critique round is owed (PROGRESS.md).

Level 10 met every line above except the screenshot folder and the critique:
the sweep ran at 1440, 1024 and 390 in both views for #/program, #/prep,
#/transactions and the session runner for every household (tests/ui.js); a
critique round is owed (PROGRESS.md).
