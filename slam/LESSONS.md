# Lessons from past versions

These rules come from earlier attempts. Every change to SLAM is checked against them.

1. The same fact was asked in several places and drifted. RULE: every number lives in exactly one place (the number store). Screens are views. No screen owns data.
2. I couldn't tell what was done, rough, unknown, or computed. RULE: every value carries a status: known, roughly, will-email, dont-know, not-for-me, guess (app-supplied average), computed. Status is always visible.
3. Each room ran its own math and they disagreed. RULE: all math lives in one library of pure functions (src/calc/). Screens never calculate.
4. Too many questions up front felt overwhelming. RULE: the first pass asks very little. Detail is always optional and comes later. Every question has an "I don't have this / doesn't apply" answer.
5. The app grew to 67 rooms and the sidebar became chaos. RULE: the Budget gets at most 4 screens. Anything else goes in PARKING_LOT.md, not in the code.
6. Prompts kept adding features, then features got cut, then restored. RULE: respect the OUT OF SCOPE list. If you think something is missing, write it in PARKING_LOT.md.
7. Charts were buried behind long paths. RULE: the main budget screen shows the key visuals without clicking anywhere, and every chart is at most one tap away.
8. There was no clear next step. RULE: always show a "Next" card: one big #1, plus #2 and #3 smaller.
9. Data lived only in localStorage with no backup. RULE: versioned JSON export and import from day one, with an automatic snapshot before any import.
10. Styling was inconsistent across screens. RULE: one design token file, used everywhere.
11. We skipped hand-checked tie-outs to move fast, and errors surfaced late. RULE: synthetic test households with hand-computed expected answers. Every phase's tests must pass before committing.
12. Fields that don't apply cluttered screens. RULE: if something doesn't apply (no debt, no roommates, no side income), its fields are absent, and "none" counts as complete.
13. People give numbers in different ways. RULE: every amount can be entered per paycheck, week, month, or year, or as a one-off. The app normalizes to monthly. Annual costs are spread evenly (accrual, not cash).
14. Completion got confused with progress. RULE: "how filled in is the picture" and "how is the client doing" are separate and shown separately.
15. Averages were presented like facts. RULE: app-supplied averages are always labeled "Guess" with their source.
16. Budgets got calculated on gross pay. RULE: every percentage of income uses take-home unless the label explicitly says gross.
17. Adjustments overwrote what the client originally said. RULE: estimates are the client's own words and are never overwritten by the app. Changes go into a monthly plan.
18. Budget surplus and cash in the bank disagreed and nobody could say why. RULE: every closed month has a bridge from the budget surplus to the actual change in cash, and anything unexplained is shown, never hidden.
19. Cash crunches showed up as surprises. RULE: the calendar shows the lowest point before it happens, and every month checks the forecast against what actually happened.
20. Month-end meant typing everything from memory. RULE: the log owns the money and actuals are computed from it. Month-end only fills gaps.
21. Single-user shortcuts would have blocked sharing later. RULE: every record has an id, timestamps, author, and version, nothing is hard-deleted, storage goes through one async interface, and visibility is decided in one map.
