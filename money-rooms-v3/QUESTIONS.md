# Questions for Eli

Collected during the run; none blocked the build. Answer whenever.

1. The app is on branch `claude/money-rooms-v3-coach-build-2ftvlz` of the
   Personalfinance repo. Merge it to `main` (or say so) and GitHub Pages will
   serve it at `https://sapphirestoneage.github.io/Personalfinance/money-rooms-v3/`.
   Do you want it in its own repository instead?

2. The SPARKS root suite (`node test/run.js`) fails one check on any day after
   early October 2026: "with its as-of day and source" expects an as-of date of
   2026-09-02 to still read "typed confirmed". It is time-based and not part of
   this app. Do you want it fixed in the SPARKS lane?

3. Every card, fund, tax bracket, FICA figure and contribution limit in data/ was
   written from memory and is marked verify: true (shown as "Looked up (verify)"
   at 0.7 confidence). The final report lists them. Do you want to confirm them
   against the 2026 IRS tables and the issuers' pages, or should I leave the
   verify flags on until you do?
4. Metric 3 counts an insurance premium as spending only when it is not paid
   through payroll (MR-015). Is that the convention you want?
5. The FI date ignores Social Security (MR-017); the chart draws it from 67.
   Do you want a second "with Social Security" date on the one-pager?
