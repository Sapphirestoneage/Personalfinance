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

## Slim by default

20. A screen opens closed: one line per group (name, total, a chevron), the main
    number visible without scrolling. Detail, forms and options open on request.
21. No form is open on load. "+ Add" opens one shared form (ui/add-form.js): name
    and amount first, the kind only for a general Add, the rest under "More
    options". Labels above boxes, "$" and "%" inside, a hint only while empty.
22. No "0" placeholder and no cents on a summary row; cents live in Show the
    math and the log.

## Fields never collide (owner, 2026-10-28)

23. A row wraps before it squeezes. A name keeps its whole width (at least 10rem) and is never cut to a few letters;
    when a row runs out of room, its boxes go to the next line.
24. Every box has a visible label. A row with one box may use the row's name; a row with more labels each box above
    it ("Owed", "Rate (%)", "Payment a month", "Due day"). A table of boxes labels its columns once.
25. A picker is as wide as its longest choice, and its choices are short ("Not set yet", "Yes, in full", "No, I carry
    a balance"); the question goes in the label above it, never inside the choice.
26. Nothing overlaps: no box over a word, no word over a box, no two pieces of a row on top of each other, at a laptop
    width and at a phone width.
27. A class name means one thing in the whole app: look before naming a new one (a calendar's `.cell` is not a
    field's cell).
Check: `node slam/tools/collide-check.mjs` (Session steps, a My numbers screen and the Plan, at 1280 and 390 wide,
on a household with many long-named cards) must print "No field collides".

## Color

6. Ink (`--text`, `--text-muted`) for words. Accent for actions and links only.
7. Status colors (good, warning, bad) only for status, always with words
   ("Stage 2 of 3"). Data never borrows them: debt is a data color, not red.
8. Data colors come from `--viz-1` to `--viz-5` in that fixed order, validated
   for color blindness and contrast in light and dark with the dataviz
   validator. Text never wears a data color.
9. Light and dark are both designed. Check both before calling a screen done.

### The palette (S-289: one family, ink and sapphire; no neutral grey anywhere)

Every value lives in `src/ui/tokens.css`; nothing on screen uses a color,
shadow, radius or font that is not a token there.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#f3f6fc` (ice) | `#0a1024` | the page |
| `--surface`, `--surface-2` | `#ffffff`, `#e9effa` | `#111a33`, `#16203c` | cards; strips and wells |
| `--text`, `--text-muted` | `#0f1a33`, `#3d4a66` (navy, never grey) | `#eef2fb`, `#a9b4cc` | words; quieter words |
| `--border`, `--border-strong` | sapphire at 14% and 32% | white at 10%, sky at 40% | lines; inputs and quiet buttons |
| `--accent`, `--accent-2` | `#0f52ba`, `#1d6ae0` | `#5b8def`, `#22d3ee` | actions and links; the top of the primary gradient |
| `--accent-soft`, `--accent-text` | `#e4ecfb`, `#ffffff` | `#142040`, `#061026` | tints behind a badge or a pressed toggle; words on the accent |
| `--focus` | `#3b7bff` | `#8fb1ff` | the 3px focus ring |

Status (`--good`, `--bad`, `--warn` and their `-soft` tints) and the status
inks (`--st-*`) keep their hues; the quiet ones (`--st-not-for-me`,
`--st-blank`, `--chart-other`, the flow chart's `--viz-pass`) are navy, not
grey. Every text color passes 4.5:1 on every background it sits on, light and
dark (`--good` and `--warn` are lines and borders only; the words next to them
use `--st-known` and `--st-roughly`). Grid lines and axes in a chart are
`--border` and `--text-muted`. Ink on a data color is `--on-data`.

Depth: `--shadow-1` (a card), `--shadow-2` (a hero tile: the statement tops,
Today's tiles, the FI card, the FI date reveal; also a menu or a picker's
list), `--shadow-lift` (hover), `--shadow-press` (pressed), `--sheen` (the 1px
highlight along a card's or a button's top edge), `--shadow-accent` (under a
primary button), `--shadow-bar` (the phone's tab bar), `--scrim` (behind a
dialog). Radii: `--radius-sm` 10px (inputs, buttons, badges, pills in a strip),
`--radius-md` 14px (cards, strips, menus), `--radius-lg` 18px (hero tiles),
`--radius-pill`.

Type: Plus Jakarta Sans (Google Fonts, 500 to 800, `display=swap`, system-ui
behind it) for everything; big numbers and page titles at 800, letter-spacing
-0.03em and tabular figures.

### The interaction rule (S-289)

Everything clickable with a box of its own (a button, a tab, a segment, a chip,
a row card, a tile that links, a step, a phrase) lifts 1px with `--shadow-lift`
on hover (only inside `@media (hover: hover)`) and presses 1px down at 98% with
`--shadow-press`; transitions are 0.12s ease and off under
`prefers-reduced-motion`. A row inside a card moves but casts no shadow, so it
never floats over its neighbors. The five tabs, the sub-tabs and every
segmented pick sit in a strip (4px padding, `--surface-2`, `--radius-md`); the
chosen one is a pill, white in light and the sapphire gradient in dark, with
`--shadow-1`, and carries `aria-current` or `aria-pressed` as the second cue; a
guessed answer stays a dashed box. Inputs wear a 1.5px `--border-strong` line
on `--surface`; their labels are ink at 600, never muted. A status chip is a
12% tint of its own hue with a 40% line of it. No button is ever plain text.
Letter badges (D A T I N G, the Plan's step numbers) are 36px squares, sapphire
on its soft tint, at 800.

## Charts

10. Pick the form by the question. A single number is a tile, not a chart.
11. Labels never sit on top of marks: they go in gutters beside the chart, or
    above a mark with room kept for them. Nothing overlaps, nothing is clipped.
12. Thin marks, washes not blocks (bands about 25% opacity). A 1px surface gap
    separates touching marks; no outlines, no dashed grid.
13. Two or more colors get a legend in words. Every chart has a list twin with
    every value and its link to My numbers; a tooltip is never the only way to a
    value.
14. If the desktop form does not fit at phone width with 12px text, the phone
    gets its own form (a bar list), not a shrunken chart.

## Numbers and words

15. Money says its period ("$650 a month"). Big numbers use plain figures;
    columns of numbers line up with tabular figures.
16. Missing is shown as missing, never as $0. Rough numbers say so.
17. Sentence case, verbs on buttons, no jargon, no em dashes.

## Before "done"

18. Look at every changed screen at 375px and 1280px wide, light and dark:
    no overlap, no clipped text, no horizontal scroll, every tap 44px; then run the collide check (rules 23 to 27).
19. Screenshots of the changed screens go with the report.
