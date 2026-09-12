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
0b. Gated-intake brief: phases 0 (D-211), 1 (D-212) and 2 (D-213) done. Next:
   phase 3 (the derivation ledger: 21 fields still asked that a table could
   answer), then phase 4 (rebuild first-round) and phase 5 (the cuts).
0c. Two failures older than this work (both at 2cb6f50): `test/alignment.js`, 4 in
   financial-snapshot.html ("nothing rendered"); `test/forms.js`, the Express
   walk's "the last pay landed" null in ~half of runs — the keystrokes never
   reach the box the tap focused, so a typed value is LOST. Its own session.
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
