# The Sapphire pass (2026-10-28, S-289)

What the style brief ("SLAM STYLE PASS: one coherent sapphire look, no grey, depth and a lift on hover") asked
for, what was done, and the questions it left. The companion UX pass is the second half of this file.

## Where it was built

SLAM lives on `claude/slam-phase-2` (S-288, the version the phone artifact runs); `main` stops at S-242. The
pass was built on the lane, in four commits (one per part of the brief) plus one test-runner fix, on the branch
`claude/affectionate-carson-gtg404`, PR 85 against the lane.

## Part 1: the tokens (`src/ui/tokens.css`)

| Token | Light | Dark |
| --- | --- | --- |
| `--font-ui` | "Plus Jakarta Sans", system-ui, ... | same |
| `--font-num` | `var(--font-ui)` (the lane's rule: no monospace on client screens) | same |
| `--text-xs` ... `--text-xxl` | 0.8125, 0.875, 1, 1.25, 1.6, 2.2rem | same |
| `--space-1` ... `--space-6` | 4, 8, 12, 16, 24, 32px | same |
| `--radius-sm`, `-md`, `-lg`, `-pill` | 10, 14, 18, 999px | same |
| `--tap` | 44px | same |
| `--bg` | `#f3f6fc` | `#0a1024` |
| `--surface`, `--surface-2` | `#ffffff`, `#e9effa` | `#111a33`, `#16203c` |
| `--text`, `--text-muted` | `#0f1a33`, `#3d4a66` | `#eef2fb`, `#a9b4cc` |
| `--border`, `--border-strong` | `rgb(15 82 186 / 0.14)`, `rgb(15 82 186 / 0.32)` | `rgb(255 255 255 / 0.10)`, `rgb(143 182 255 / 0.40)` |
| `--accent`, `--accent-2` | `#0f52ba`, `#1d6ae0` | `#5b8def`, `#22d3ee` |
| `--accent-soft`, `--accent-text` | `#e4ecfb`, `#ffffff` | `#142040`, `#061026` |
| `--focus` | `#3b7bff` | `#8fb1ff` |
| `--shadow-1` | `0 1px 2px rgb(15 26 51 / 0.06), 0 4px 12px rgb(15 26 51 / 0.06)` | black at double the alpha |
| `--shadow-2` | `0 2px 4px rgb(15 26 51 / 0.06), 0 18px 40px rgb(10 42 102 / 0.14)` | black at double the alpha |
| `--shadow-lift` | `0 2px 4px rgb(15 26 51 / 0.08), 0 10px 24px rgb(15 26 51 / 0.14)` | black at double the alpha |
| `--shadow-press` | `inset 0 2px 4px rgb(15 26 51 / 0.18)` | black at double the alpha |
| `--sheen` | `inset 0 1px 0 rgb(255 255 255 / 0.85)` | `inset 0 1px 0 rgb(255 255 255 / 0.08)` |
| `--shadow-accent` (new) | `0 4px 14px rgb(15 82 186 / 0.30)` | `0 4px 14px rgb(34 211 238 / 0.25)` |
| `--shadow-bar` (new) | `0 -2px 10px rgb(15 26 51 / 0.10)` | `0 -2px 10px rgb(0 0 0 / 0.30)` |
| `--scrim` (new) | `rgb(15 26 51 / 0.40)` | `rgb(0 0 0 / 0.60)` |
| `--on-data` (new) | `#ffffff` | same |
| `--stripe` (new) | `rgb(255 255 255 / 0.35)` | same |
| `--good`, `--bad`, `--warn` | `#23855a`, `#c0392b`, `#b7791f` (as before) | as before |
| `--good-soft`, `--bad-soft`, `--warn-soft` | as before | as before |
| `--st-known`, `--st-roughly`, `--st-dont-know`, `--st-guess` | as before | as before |
| `--st-will-email` | `#2860b4` (was `#2f6fcf`) | as before |
| `--st-computed` | `#176b6b` (was `#1f8a8a`) | as before |
| `--st-not-for-me` | `#44547c` (was grey `#6b7385`) | `#b4c0de` (was `#9aa4b8`) |
| `--st-blank` | `#5a6a92` (was grey `#8a93a6`) | `#9fb0d6` (was `#7d879b`) |
| `--chart-grid`, `--chart-axis` | `var(--border)`, `var(--text-muted)` (were grey hex) | same |
| `--chart-1` ... `--chart-8`, `--series-*`, `--need`, `--want`, `--save` | as before | as before |
| `--chart-other` | `#6b7fb0` (was grey `#8a93a6`) | `#8aa0cc` (was `#7d879b`) |
| `--unassigned` | `#c6d4f0` (was `#c9d2e3`) | `#2a3a66` (was `#34405c`) |
| `--viz-1` ... `--viz-5` (moved here from spine.css) | `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4` | `#3987e5`, `#d95926`, `#199e70`, `#c98500`, `#d55181` |
| `--viz-pass` | `var(--chart-other)` (was grey `#8a93a6`) | `var(--chart-other)` (was `#6b7690`) |

## Part 2: the components (`ui/spine.css`)

- The four names every earlier rule used (`--btn-line`, `--btn-shadow`, `--btn-shadow-lift`, `--btn-shadow-press`)
  now point at `--border-strong`, `--shadow-1`, `--shadow-lift`, `--shadow-press`, so the whole sheet flipped at once.
- Every literal in the sheet is a token now: the old shadow stacks, the danger button's white, the windfall step
  number's white, the chart cell labels' white (`--on-data`), the bulk bar's and tab bar's shadows (`--shadow-bar`),
  the menus' and picker's shadows (`--shadow-2`), the dialog backdrop (`--scrim`), the gantt stripe (`--stripe`), the
  near-floor cell tint (`--warn`), the tax bucket colors and every `var(--x, #hex)` fallback. Print keeps paper
  white and ink black on purpose.
- One appended section (S-289): cards with `--shadow-1` and the sheen; hero tiles (the statement tops, Today's tiles,
  the FI card, the FI date reveal) with `--shadow-2` and `--radius-lg`; the interaction rule; the three button kinds;
  the five tabs, the sub-tabs and every segmented pick as a strip with the chosen one as a pill; inputs with the strong
  line and ink labels; chips tinted by their own hue; 36px letter badges; big numbers at 800.
- Nothing wider, and only a strip is 4px taller: a tab's or a segment's face keeps the full 44px the tester measures, inside a 2px strip; it no longer leans on the 44px
  invisible margin; the sub-tabs' strip still scrolls sideways on a phone; the Session row's two-button picks keep a
  2px strip.

## Part 3: the page sweep

Every page head (19 pages, the lane's `assumptions.html` and `where.html` included) loads Plus Jakarta Sans (500 to
800, `display=swap`) with the two preconnects. The Design kit's donut reads `--viz-1..3` instead of hex fallbacks.
The page scripts needed no change: every color they draw already goes through a token or a class; the pixel values
left are geometry (bar widths, a drag ghost's position, the tab bar's measured height, the Sankey's canvas
`measureText` font, which must match `.fl-name`).

## Part 4: the checks

- Contrast (a script over tokens.css, every text hue on `--bg`, `--surface`, `--surface-2`, `--accent-soft`, its own
  chip tint and its `-soft` tint, light and dark): fixed `--st-will-email` (4.1 to 5.2 on the accent tint),
  `--st-computed` (3.5 to 5.3), the dark `--accent` on `--accent-soft` (4.4 to 4.9, by deepening the tint, since
  darkening a dark-mode text lowers its contrast). `--good` (4.2) and `--warn` (3.4) stay as line and fill colors
  only; every word in those hues uses `--st-known` or `--st-roughly` (the done steps, the sooner and later movers,
  the saved mark, the celebrate check).
- Screenshots: `shots/style/` holds Home, Numbers, Numbers Debt, Calendar, Spending and Plan at 1280 and 375 wide,
  light and dark (24 files): no horizontal scroll, no console errors, the font resolved, every tap 44px (the calendar's
  day numbers are 21px buttons whose target is the whole cell; the hidden picker selects are 1px by design).
- `node --test`: 1184 pass, 0 fail, 2 skipped. The trunk test: 60 of 60. The collide check: 0 problems on 11
  screens at 2 sizes.
- Pages not screenshotted on purpose: the Coach pages, Guide me, End call, the Profile and Before our first call
  (the brief named five pages; the UX audit walked the rest).

## Greys that remain, and why

- `print`: `body { background: #fff; color: #000 }` so a printed one-pager is ink on paper in either scheme.
- `.dot-fine` (the small dot on a guess that is fine for now) is `--st-blank`, navy, no longer `--text-muted` at
  55% opacity.
- Nothing else: the final grep of `ui/spine.css`, `ui/*.js` and `*.html` finds no hex outside tokens.css but the
  favicon's data URI.

## Questions for the owner

1. **Two style briefs arrived in one session and disagree.** "Sapphire Editorial" asks for Fraunces and Inter, an
   ivory page (`#FBFAF7`) and a grey line (`#E3E6EC`), a 220px side navigation with a gear at the bottom, new files
   `styles/tokens.css` and `styles/components.css`, a 13/14/16/20/28/40 type scale, count-up hero numbers,
   completion rings, drag-to-see-the-future sliders, skeleton loaders and a gold accent. "SLAM STYLE PASS" asks for
   Plus Jakarta Sans, an ice page, no grey, the existing token and component files, light and dark, and no layout
   or behavior change. This pass followed "SLAM STYLE PASS" (the later brief, and the one that names this
   repository's files). Which of the Editorial items, if any, should come next?
2. **Dark mode's chosen segment is the sapphire gradient**, as the brief asks ("gradient (dark) pill"). S-287 had
   ruled that a pressed choice is "outlined and tinted, never filled like the primary". In light the pill is white,
   so the rule holds; in dark the pill reads like a primary. Keep the gradient, or use a white-on-navy pill in dark
   too?
3. **The five tabs lost the folder look of S-280** (same color as the page, no line, a colored top edge) for the
   brief's strip and pill. The two cues the trunk test checks (fill and bold, plus `aria-current`) still hold, and
   the trunk test passes 60 of 60. Say if the folder look should return.
4. **`--good` and `--warn` fail 4.5:1 as text** and were left as line colors. If a word must wear them somewhere
   new, use `--st-known` and `--st-roughly`.
