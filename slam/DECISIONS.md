# Decisions

One entry per decision: number, date, decision, why. Newest at the bottom.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| S-001 | 2026-10-15 | SLAM lives in a self-contained `slam/` folder on branch `claude/slam-budget-build-m26h38` of the existing repo, not in a new `slam` repo. Nothing outside `slam/` is read or changed. | The gh CLI in the build environment was not authenticated, so a new repo could not be created. The folder can be split into its own repo with one command (commands are in the build notes). |
| S-002 | 2026-10-15 | A blank Value is `amount: null, status: null` and shows as a "Blank" chip. The seven statuses are only for answered values. | Lesson 2 says every value carries a status, but "not asked yet" is different from "dont-know". Using null avoids inventing an eighth status word. |
| S-003 | 2026-10-15 | Undo and redo keep whole-document copies (up to 200 steps per open client), cleared when another client is opened. | Households are small, so copies are simple and cover every kind of change, including imports and month close. |
| S-004 | 2026-10-15 | Before any import, every household in the browser is copied into a backup (last 10 kept). Importing a file with an existing client id replaces that client. | "Automatic snapshot before any import" and importing your own export should act as a restore. |
| S-005 | 2026-10-15 | One single total is stored on an "Everything else" category. Category estimates entered later are carved out of it by calc, so the original total is never overwritten. | The brief says the total must survive being split later. |
| S-006 | 2026-10-15 | Default "need" flags: FAT lines (housing, groceries, transportation) plus debt minimums and health care. Eating out, delivery, and everything else default to want. Editable per line. | Strict FAT would make rent a need but insurance premiums and minimum payments wants, which skews 50/30/20. Listed as a question. |
| S-007 | 2026-10-15 | Closing a month locks a snapshot and moves to the next month. The live numbers carry forward (they describe a typical month) rather than being wiped. | Fixed costs like rent would otherwise need re-entry every month. Late entries go to the month's separate "revised" record. |
