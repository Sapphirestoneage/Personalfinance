# The standard this app is held to

One page. It exists because "make it look professional" is not a review you
can act on, and "the label wraps onto three lines" is. Everything below is a
rule a session can check, most of them in `test/run.js` or a browser gate.

D-342 wrote it. Add to it when a rule earns its place; do not add taste.

## Numbers

1. **Nothing unrounded reaches a screen.** Every figure goes through a
   formatter: `Money.formatCents`, `formatRate`, `formatMonths`,
   `formatMultiple`, `formatAge`. `test/render.js` fails on any rendered text
   holding three or more decimals, in every room, empty and with data. The
   bug that wrote this rule: "to age 55.88101594379056".
2. **Empty is not zero.** A figure the app cannot work out says what it is
   waiting for. It never shows 0, and a share of nothing reads "not yet".
3. **A rough figure says so**, in the line under it, not in the figure.

## Words

4. **The room's own words first.** The name, one line of what it is, then the
   room. Anything about the room (what it shows, what it needs) is folded.
5. **Sentences are sentences.** A generated line that glues two fragments
   together lower-cases the join and reads as a typo; build each part as its
   own element instead.
6. **A label is one line.** An uppercase label that wraps to three lines is a
   label that needs shorter words: "Owned, less owed", not "What you own,
   less what you owe".
7. **No em dash anywhere the app can show one** (D-321), and no jargon in a
   band-1 question (D-336).

## Layout

8. **Nothing floats over what you are reading.** Controls live in the page,
   in a strip that scrolls with it. The undo pair was fixed to a corner for
   two years and covered a figure in one corner and the labels in the other.
9. **One row of tabs, not three.** A nav that wraps onto three lines reads as
   a pile: it scrolls sideways, the current one is scrolled into view, and
   the edges fade so it is clear there is more.
10. **The reading column has a measure.** Prose stays inside `--measure`; a
    line that runs the full width of a desktop is unreadable.
11. **Tap targets are at least 44px** on a coarse pointer, and links inside a
    sentence are left alone (padding them tears the paragraph apart).
12. **`test/alignment.js` holds every multi-cell row** at every width. A cell
    that shifts its neighbours is a bug, not a detail.
13. **Nothing moves under a finger.** A tap is a touch and then, milliseconds
    later, a click at the same point. Anything that collapses in between, a
    help line put away on blur, a toast that appears, moves the target and the
    click lands on whatever took its place. Whatever a row shows on focus, it
    keeps until the tap that took the focus away has landed (D-343), and the
    bottom of the screen belongs to the primary action and the keyboard, not
    to a notice.

## Charts (and see the `dataviz` skill)

14. **Pick the form before the colour.** Magnitude is a bar; a share of a
    whole is a ring; a value against a range is a bullet bar; one number is a
    number.
15. **One measure, one hue.** Bars that all answer the same question are the
    same accent; the label carries the identity, never the colour alone.
16. **Status colours are reserved** (positive, caution, critical) and always
    ship with the word as well: "in range", "watch", "outside".
17. **Every mark carries its own figure** beside it. A chart is never the only
    way to read a number.
18. **Measures of different scale never share an axis.** Index each to its own
    band edge and print the real figure, or draw two charts.
19. **A chart's styles live once**, in `shared/theme.css`, not copied into each
    page that draws one.

## Accessibility

20. **`:focus-visible` on everything interactive**, one ring, defined once.
21. **`prefers-reduced-motion` is honoured** globally.
22. **Every drawing has a text equivalent**: a legend, a table, or the figure
    printed beside it.
23. **Nothing is conveyed by colour alone.**

## How to check

    node test/run.js          the lints, including the design ones
    node test/render.js       every room, empty and with data, no ugly numbers
    node test/alignment.js    every multi-cell row, every width
    node test/features.js     the eight promises, every room

And then look at it: `python3 -m http.server`, a phone-width window, both a
blank household and the example one. Half the rules above came from looking.
