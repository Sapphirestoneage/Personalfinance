# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-12

## Where it stands
- The Ledger rework brief (owner, 2026-09-11) is being built in order: G1, A, B, C/C2, D, E, F, G2, G3 with J1, H1 to H5, H7, H8 shipped (D-204 to D-212); H6 waits on sourced 1871-on returns data (egress blocked); I1 to I5 shipped (D-213, D-214); J2 to J8 shipped (D-214 to D-216; J7 without gift privacy, which waits on the owner); K4, K6, K7, K11 shipped on the one countdown (D-217); K1 and K3 shipped (D-218); K2, K5, K8, K9, K10 shipped (D-219): Phase K is built; one CSV out and back in (D-220), made to survive a real spreadsheet (D-221: one reader for every CSV, any way a number, date, yes or choice is written, a preview naming what each line would do, one undo for the lot) and then made a spreadsheet (D-222: the download is a real .xlsx with a tab a door, money in money cells, headings in words; a workbook or a CSV comes back); I6 (Eli's taxonomy), I7 (needs H6), I8 (needs the §11 tree) wait. Still waiting on the owner: the Pages switch, the domain (G1.1), a LICENSE (G3.14). The owner's brief overrides the freeze for those phases; each adds a VIEW of existing rows (First Round, doors, Express), no second store.
- ~70 rooms live on GitHub Pages. Each room works on its own; the connections
  between them are the weak spot (see docs/ARCHITECTURE.md "Known problems").
- Context system added. Sessions should no longer read the archives.
- End-to-end audit, walked in a browser as beginner and expert
  (`docs/END-TO-END-AUDIT.md`, D-226). Four seams fixed: every room says how
  old its numbers are; the example household says it is the example; home
  opens on what you earned, not the pitch; one progress meter, not two.

## Freeze
- ON. No new rooms, frameworks, or vocabularies until the first journey
  below works end to end.

## Next (top item first; one per session)
1. Decide who owns income sources once Start Here retires (Ledger or Income).
   OWNER DECISION NEEDED. Now the top cost to a beginner: four ways in are
   live on the landing and none can close until this is decided (D-226 F6).
2. Make logged income reconcile with typical income (known problem 1).
3. First journey works end to end: about 8 questions in, a FOO step and an FI
   date range out. Add a node test for it.
4. Monthly close prompts a backup export.
5. Express opens at level 1 only (94 boxes on one page today). D-226 F7.

## Cut list (for /simplify, one per session, owner approves each)
- Retire Start Here, Front Doors, Walk-Through into the Ledger (decided).
- Merge candidates, not yet decided: Financial Snapshot / Savings Rate /
  Every Ratio / The Score into the DRAFTT scorecard; FIRE Number + FIRE Lab;
  Worth It / Worth the Hassle / Price the Dream; Designed Week + Time Buckets;
  Budget + Estimated vs Actual into a monthly close.
- rooms/net-worth.html is a redirect to statement.html, not in the registry.

## Proposed in chat, not decided
- Four layers: Ledger (facts), Log (actuals, one + button), Blocks, Readings.
- Round 1 uses only answer-from-your-head rows; lookups move to round 2.
