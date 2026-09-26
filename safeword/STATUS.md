# Safeword status

Updated: 2026-09-26

## Where it stands
- Its own app (SF-001): eleven screens, its own store (`safeword.household.v1`),
  tests (`node safeword/test/run.js`, `node safeword/test/browser.js`, both in
  CI) and log. SPARKS is untouched; the only SPARKS files that mention it are
  `CLAUDE.md`, `STATUS.md`, D-340, the CI steps and the `.gitignore` rule.
- Built (SF-002 to SF-010): Streams, The house, Taxes, The safeword, Rails,
  The long game, House rules, Chosen family, The life, The plan; the example
  household (Vesper); a "?" with plain words on every box; a picture with a
  table twin for every number set; backup and wipe; a print view of the plan.
- Tax, growth and limit figures are SPARKS' own engines and tables, carried
  as byte-identical copies (`tools/vendor.js --check`).
- The site (SF-011): a landing page, three audience pages, coaching, about,
  six guides and a booking page, every word from `data/site.json`. The planner
  is the free tool behind it (`tools.html`).

## Next
1. The owner tries it with the example, then with their own numbers, and says
   which words land wrong for the community. The stream kinds and the fee
   starting points (`data/stream_kinds.json`) are the first thing to check
   against real payouts.
3. Not built, on purpose: the monthly log (what actually landed each month
   against the typical figure), a client-side vault for the backup file, a
   coach's view. Each would be its own SF entry.
4. Open question for the owner: should the tax jar assume the "sometimes"
   costs (the look, the wardrobe) are carried, or stay conservative? The box
   defaults to conservative.

## Known open
- Nothing. Both suites are green on this tree.
