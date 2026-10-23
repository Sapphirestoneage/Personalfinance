# Marketing Scoreboard status

Updated: 2026-09-26

## Where it stands
- Its own app (MD-001): three screens, its own store (`mkt.` keys), tests
  (`node marketing/test/run.js`, in CI) and log. SPARKS is untouched; the
  only SPARKS files that mention it are `CLAUDE.md`, `STATUS.md`, D-340,
  the CI step and the `.gitignore` rules.
- Built: the content log with results typed later; people with stages,
  rhythms, touches, CSV import and the post that brought them; the
  Scoreboard with this week's read (MD-009), weekly targets and pace, every
  number against the period before, lanes, the funnel, week-by-week charts,
  the posting heatmap, what works by format, ask, topic and weekday,
  attribution by lane and channel, conversion rates and the sales cycle,
  who to contact today, the share report.

- **The spreadsheet (MD-010)**: `Marketing-Scoreboard.xlsx`, the same tool as
  one workbook, because the owner trusts a cell over an app.

## Next
1. The owner tries it with the example data, then logs a week of real
   posts and imports one contacts file, and says which words land wrong.
2. Later, not now: a settings screen for the stage rhythms (today they are
   `data/tables.json` and each person's own box); a per-post "which people
   came from this" link the other way.
