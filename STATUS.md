# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-12

## Where it stands
- The Ledger rework brief (owner, 2026-09-11) is being built in order: G1, A, B, C/C2, D, E, F, G2, G3 with J1, H1 to H5, H7, H8 shipped (D-204 to D-212); H6 waits on sourced 1871-on returns data (egress blocked); I1 to I5 shipped (D-213, D-214); J2 to J8 shipped (D-214 to D-216; J7 without gift privacy, which waits on the owner); K4, K6, K7, K11 shipped on the one countdown (D-217); K1 and K3 shipped (D-218); K2, K5, K8, K9, K10 shipped (D-219): Phase K is built; one CSV out and back in (D-220), made to survive a real spreadsheet (D-221: one reader for every CSV, any way a number, date, yes or choice is written, a preview naming what each line would do, one undo for the lot); I6 (Eli's taxonomy), I7 (needs H6), I8 (needs the §11 tree) wait. Still waiting on the owner: the Pages switch, the domain (G1.1), a LICENSE (G3.14). The owner's brief overrides the freeze for those phases; each adds a VIEW of existing rows (First Round, doors, Express), no second store.
- ~70 rooms live on GitHub Pages. Each room works on its own; the connections
  between them are the weak spot (see docs/ARCHITECTURE.md "Known problems").
- Context system added. Sessions should no longer read the archives.
- **Also this session (D-223): Express, made short.** The owner: too long, too
  much extra, levels were a good separation. It was also drawing every account
  and card twice, because a list's rows span levels and the build put all of a
  list's fields into every level holding any of them; the second copy won the
  index and the first went dead. Each level now renders only its own fields, is
  a named fold with a badge that reads Done or a count, and arrives shut unless
  it still has work. The walk steps one family-and-level a screen. The per-row
  furniture and the row's `unlocks` line appear only for the row being
  answered; an enum of four or more is a select. A line (account, card, source,
  yearly cost) now has a name, an institution and a last four as three fields
  rather than one mangled string, can be renamed in place, and the lines group
  under their institution with a subtotal. The spreadsheet carries the
  institution column so it can pivot by bank.
- **This session (D-222): the screens as a person on a phone meets them.** The
  owner walked the live app and sent ten screenshots. Fixed: the math sheet was
  translucent with no backdrop, so the room behind it read through it (now
  opaque, dims the page, closes on Escape or a tap outside, hides the undo pair
  while open); the Ledger, Express and the First Round had no side gutter, so
  every line sat against both edges of the glass; a door card's parts were
  inline spans that collided into one run of text; a Settings switch looked the
  same on and off, and a situation row's sentence squeezed its own label to one
  word a line; `--color-warning` was used a dozen times and never declared.
  Saving now gives you something you can read: a spreadsheet and a printable
  page first, the JSON named as the restore file, the One-Pager saving a CSV
  instead of a file of code, and the save card no longer folded away. Express
  gained the guided DAITE walk: one family a screen, then a sharpening pass over
  the families that got an answer. No new room, no new store, no new vocabulary.

## Freeze
- ON. No new rooms, frameworks, or vocabularies until the first journey
  below works end to end.

## Next (top item first; one per session)
1. Decide who owns income sources once Start Here retires (Ledger or Income).
   OWNER DECISION NEEDED.
2. Walk the other rooms at 390px the way D-222 walked six. Its four faults (a
   floating panel that is not opaque, a wrapper with no gutter, a run of inline
   spans where lines were meant, a control with no on state) are patterns, not
   one-offs; a test that catches them beats a walk that finds them.
3. Make logged income reconcile with typical income (known problem 1).
4. First journey works end to end: about 8 questions in, a FOO step and an FI
   date range out. Add a node test for it.
5. Monthly close prompts a backup export, and offers the spreadsheet (D-222).

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
