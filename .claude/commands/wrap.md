---
description: Close the session: tests, decision entry, STATUS rewrite, rebuild, commit, link
---
1. Run the tests that apply: `node test/run.js` always; `node test/forms.js`
   if a room with typed input changed.
2. If a decision was made, add it to `DECISIONS.md` using
   `docs/context/DECISION-TEMPLATE.md` (20 lines max, next free number, above
   the divider for `D-`, at the end for `DD-`).
3. If the stored shape, the layers or the folders changed, update
   `docs/ARCHITECTURE.md`.
4. Rewrite `STATUS.md`: under 40 lines, date updated, finished items moved
   out, the next item on top.
5. Run `node tools/context/build.js`, then `--check`; it must say current.
6. Commit with a clear message. Push only if asked.
7. Print the live link to the room changed
   (`https://sapphirestoneage.github.io/Personalfinance/rooms/<id>.html`),
   or the branch link with a one-line note if the work is not on `main`.
