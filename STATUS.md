# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-11

## Where it stands
- The Ledger rework brief (owner, 2026-09-11) is being built in order: G1, A, B, C/C2, D, E, F, G2, G3 with J1 shipped (D-204 to D-210); H (H1, H3, H2 first), then I (I1 by Dec 1), J, K next. Still waiting on the owner: the Pages switch, the domain (G1.1), a LICENSE (G3.14). The owner's brief overrides the freeze for those phases; each adds a VIEW of existing rows (First Round, doors, Express), no second store.
- ~70 rooms live on GitHub Pages. Each room works on its own; the connections
  between them are the weak spot (see docs/ARCHITECTURE.md "Known problems").
- Context system added. Sessions should no longer read the archives.

## Freeze
- ON. No new rooms, frameworks, or vocabularies until the first journey
  below works end to end.

## Next (top item first; one per session)
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
