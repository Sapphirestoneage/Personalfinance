# Kehillah status

Updated: 2026-09-26

## Where it stands
- Its own app (KD-001): nine pages, its own store (`kehillah.plan.v1`),
  tables, engines, tests (`node kehillah/test/run.js`, in CI) and log. SPARKS
  is untouched; the only SPARKS files that mention it are `CLAUDE.md`,
  `STATUS.md`, `docs/ARCHITECTURE.md`, D-340 and the CI step.
- Built: The Year (5787's calendar of costs), Tzedakah (rate, target, gifts,
  ladder), Chosen Family (ten papers by household shape, the cushion),
  Making a Family (path, cost, credit, timeline), Care (out of pocket with
  the maximum, HSA, name change), Gemach (three-way comparison, societies),
  Elul (the questions), Resources (four groups of doors).

## Next
1. The owner reads every page's plain words and the guide ranges, and
   corrects any figure or organization from their own knowledge.
2. The 5788 year table (`data/jewish_year_5788.json`) before Elul 5787,
   and a way to pick the year on The Year page.
3. A printable one-page summary across the pages.

## Known open
- The guide ranges and the holiday dates are marked rough; nothing has been
  checked against a live calendar or a current fee page.
