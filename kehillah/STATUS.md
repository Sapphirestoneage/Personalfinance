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

- The selling layer (KD-005): Home is a landing page; Work with me, About
  and Book are new; every tool ends with a call to book. All of it reads
  `data/practice.json`, so the owner corrects words in one file.

## Next
1. **The owner fills in `data/practice.json`**: the booking link and email
   (the Book page is honest but empty without them), a photo, any line of
   the bio that is not right, and prices if any should be shown. The bio
   is a first draft written from the coach spec, not from Eli.
2. The owner reads every tool's plain words and guide ranges, and corrects
   any figure or organization from their own knowledge.
3. The 5788 year table (`data/jewish_year_5788.json`) before Elul 5787,
   and a way to pick the year on The Year page.
4. A printable one-page summary across the pages.

## Known open
- The guide ranges and the holiday dates are marked rough; nothing has been
  checked against a live calendar or a current fee page.
