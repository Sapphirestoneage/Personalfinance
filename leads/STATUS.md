# Leads Ladder status

Updated: 2026-09-26

## Where it stands
- Its own app (LD-001): two screens, the book as data (67 levels over nine
  bodies and five bands, LD-002), the Machine (LD-003), its own store
  (LD-004), tests (`node leads/test/run.js`, in CI) and log. SPARKS is
  untouched; the only SPARKS files that mention it are `CLAUDE.md`,
  `STATUS.md`, D-340 and the CI step.
- Built: Start Here, the sky and its list view, the strip, the next three,
  the planet view with every exercise and checklist, the come-back list, the
  book map and core four, the words, the Machine with its seven pictures,
  the rule-of-100 log, example numbers, save and load a copy.
- **The spreadsheet (LD-008)**: `Leads-Ladder.xlsx`, the same book, exercises,
  checklists and Machine formulas as thirteen sheets, for the owner who found
  the app too much for now. Regenerate with `python3 leads/tools/workbook.py`
  when `data/book.json` changes; the tests say when it is stale.

## Next
1. The owner works the spreadsheet first (Start Here, then the Magnet sheet)
   and says which words land wrong; the app waits.
2. Later, not now: a printable one-page plan; per-planet cost per engaged
   lead side by side on the Machine.
