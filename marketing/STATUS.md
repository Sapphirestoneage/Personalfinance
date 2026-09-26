# Marketing Scoreboard status

Updated: 2026-09-26

## Where it stands
- Its own app (MD-001): three screens, its own store (`mkt.` keys), tests
  (`node marketing/test/run.js`, in CI) and log. SPARKS is untouched; the
  only SPARKS files that mention it are `CLAUDE.md`, `STATUS.md`, D-340,
  the CI step and the `.gitignore` rules.
- Built: the content log with results typed later; people with stages,
  rhythms, touches and CSV import; the Scoreboard with weekly targets and
  pace, the period's numbers, lanes, the funnel, week-by-week charts, by
  channel and topic, best posts, who to contact today, the share report.

## Next
1. The owner tries it with the example data, then logs a week of real
   posts and imports one contacts file, and says which words land wrong.
2. Later, not now: a settings screen for the stage rhythms (today they are
   `data/tables.json` and each person's own box); a per-post "which people
   came from this" link the other way.
