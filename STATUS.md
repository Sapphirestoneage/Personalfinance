# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-12

## Where it stands
- The Ledger rework brief (owner, 2026-09-11) is being built in order: G1, A, B, C/C2, D, E, F shipped (D-204 to D-208); G2/G3, H to K next. The owner's brief overrides the freeze for those phases; each adds a VIEW of existing rows (First Round, doors, Express), no second store.
- ~70 rooms live on GitHub Pages. Each works on its own; the connections
  between them are the weak spot (docs/ARCHITECTURE.md "Known problems").
- Lane 2 is landed except one row: the lens copy and the lookup sentences are
  folded in (D-222, D-223) and every sourced table is live. `data/lane2/
  studentloans.json` stays parked pending Next item 4.
- Clutter pass (D-209/210, D-219/220/221): nine dead root files gone; the
  glossary hover is live everywhere; one sourced table now feeds each of tax,
  ACA, unemployment and contribution limits, and all four duplicates are
  deleted. Owner decided: dnd/ stays separate; the roadmap tiers wait.

## Freeze
- ON. No new rooms, frameworks, or vocabularies until the first journey
  below works end to end.

## Next (top item first; one per session)
0b. Gated-intake brief: six phases done (D-211 to D-216) plus the last two
   gate branches (D-218). The first round asks 9 to 10, never more than 12.
0c. Every suite is green (D-227). Two of the three long-standing failures
   were the tests: alignment never opened the fold, settings pinned six
   sections when Backup made seven. The third was real, a 28px tap target.
1. Decide who owns income sources once Start Here retires (Ledger or Income).
   OWNER DECISION NEEDED.
2. First journey works end to end: about 8 questions in, a FOO step and an FI
   date range out. Add a node test for it.
3. Student loans: name the plans (RAP, IBR, PAYE, ICR) and ask when the loans
   were disbursed, or keep the room's stated scope of three shapes and no plan
   names? Naming them adds a question and a vocabulary. OWNER DECISION NEEDED.

## Cut list (for /simplify, one per session, owner approves each)
- Retire Start Here, Front Doors, Walk-Through into the Ledger (decided).
- Merge candidates, not yet decided: Financial Snapshot / Savings Rate /
  Every Ratio / The Score into the DRAFTT scorecard; FIRE Number + FIRE Lab;
  Worth It / Worth the Hassle / Price the Dream; Designed Week + Time Buckets;
  Budget + Estimated vs Actual into a monthly close.
- rooms/net-worth.html is a redirect to statement.html, not in the registry.

## Proposed in chat, not decided
- Four layers: Ledger (facts), Log (actuals, one + button), Blocks, Readings.
- Round 1 uses answer-from-your-head rows only; lookups move to round 2.
