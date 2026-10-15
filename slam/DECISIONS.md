# Decisions

One entry per decision: number, date, decision, why. Newest at the bottom.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| S-001 | 2026-10-15 | SLAM lives in a self-contained `slam/` folder on branch `claude/slam-budget-build-m26h38` of the existing repo, not in a new `slam` repo. Nothing outside `slam/` is read or changed. | The gh CLI in the build environment was not authenticated, so a new repo could not be created. The folder can be split into its own repo with one command (commands are in the build notes). |
