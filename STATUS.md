# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-12

## Where it stands
- The Ledger rework brief (owner, 2026-09-11) is being built in order: G1, A, B, C/C2, D, E, F shipped (D-204 to D-208); G2/G3, H to K next. The owner's brief overrides the freeze for those phases; each adds a VIEW of existing rows (First Round, doors, Express), no second store.
- ~70 rooms live on GitHub Pages. Each room works on its own; the connections
  between them are the weak spot (see docs/ARCHITECTURE.md "Known problems").
- Context system added. Sessions should no longer read the archives.
- Clutter pass (D-209, D-210): nine dead root files gone; the glossary hover is
  live on every room; one federal tax table (`data/tax_brackets.json`, sourced)
  feeds every tax figure; every user switch starts on. Owner decided: dnd/
  stays separate and unlinked; the roadmap tiers wait.

## Freeze
- ON. No new rooms, frameworks, or vocabularies until the first journey
  below works end to end.

## Next (top item first; one per session)
0b. Gated-intake brief: all six phases done (D-211 to D-216). The first round
   asks 9 (student) to 10 (between jobs), never more than 12, and the gate
   decides. Three phases turned out to be already true and are recorded as
   such rather than built twice: the path collisions, most of the derivation
   ledger, and seven of the eleven cuts.
0c. `test/alignment.js`: 4 failures in financial-snapshot.html ("nothing
   rendered"), present at 2cb6f50 and older than this work.
   The Express walk flake is FIXED and was never the app (D-217): only a
   synthesized tap plus synthetic raw keys loses text, which no real device
   sends. The walk now commits text the way a soft keyboard does.
1. Decide who owns income sources once Start Here retires (Ledger or Income).
   OWNER DECISION NEEDED.
2. Make logged income reconcile with typical income (known problem 1).
3. First journey works end to end: about 8 questions in, a FOO step and an FI
   date range out. Add a node test for it.
4. Monthly close prompts a backup export.

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
