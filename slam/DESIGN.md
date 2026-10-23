# SLAM visual design rules

Every screen, chart and component follows these. The affordance rules in the
repository's CLAUDE.md cover how things look tappable; these cover how a page
looks put together. `affordances.html` shows the components; check a new one
there first.

## Layout and type

1. One job per card. A card has one title, at most one big number, and its
   supporting lines. If it needs two big numbers, it is two cards.
2. Three text sizes per card at most: title, body, caption. The big number is
   the only thing at display size, in the same sans as the rest.
3. Space on an 8px grid: 16px inside cards, 12px between related things, 24px
   between unrelated ones. Space separates groups before lines or boxes do.
4. Lines of reading text stay under about 70 characters; captions under the
   thing they explain, never in a tooltip only.
5. Show about seven items, then "Show all N". Detail opens on request.

## Color

6. Ink (`--text`, `--text-muted`) for words. Accent for actions and links only.
7. Status colors (good, warning, bad) only for status, always with words
   ("Stage 2 of 3"). Data never borrows them: debt is a data color, not red.
8. Data colors come from `--viz-1` to `--viz-5` in that fixed order, validated
   for color blindness and contrast in light and dark with the dataviz
   validator. Text never wears a data color.
9. Light and dark are both designed. Check both before calling a screen done.

## Charts

10. Pick the form by the question. A single number is a tile, not a chart.
11. Labels never sit on top of marks: they go in gutters beside the chart, or
    above a mark with room kept for them. Nothing overlaps, nothing is clipped.
12. Thin marks, washes not blocks (bands about 25% opacity). A 1px surface gap
    separates touching marks; no outlines, no dashed grid.
13. Two or more colors get a legend in words. Every chart has a list twin with
    every value and its Ledger link; a tooltip is never the only way to a value.
14. If the desktop form does not fit at phone width with 12px text, the phone
    gets its own form (a bar list), not a shrunken chart.

## Numbers and words

15. Money says its period ("$650 a month"). Big numbers use plain figures;
    columns of numbers line up with tabular figures.
16. Missing is shown as missing, never as $0. Rough numbers say so.
17. Sentence case, verbs on buttons, no jargon, no em dashes.

## Before "done"

18. Look at every changed screen at 375px and 1280px wide, light and dark:
    no overlap, no clipped text, no horizontal scroll, every tap 44px.
19. Screenshots of the changed screens go with the report.
