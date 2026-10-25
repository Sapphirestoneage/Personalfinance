# Life Pyramid

Status: Phase 3e, after the 3a to 3d items. Not built.

## What it is

A lens, like DRAFTT: it re-reads the budget lines and adds no questions to the session. Maslow's hierarchy drawn as a pyramid where every level is also a bar that fills. Three views on one toggle:

- **Classic**: the textbook version. A level stays locked at 0 until the one below is full. Creativity is the reward at the end.
- **Real**: every level is present at every stage, in different amounts. The bottom fills fastest, but nothing above it is ever 0.
- **You**: the client's own spending share per level, read from the budget, with the Real shape shown as a faint marker behind it. Shares only, no verdict, same as DRAFTT.

Classic and Real are each labeled "a reference shape, not a rule".

The point: people have needs throughout the journey, and art or creativity is not just a reward for the end.

## Where it lives

On the Plan tab beside DRAFTT, with the same look and toggle style. A small version goes on the one-pager only if it fits without crowding.

## Levels (top to bottom)

5. **Creativity and meaning**: art, hobbies, theater, travel, giving, creative tools
4. **Esteem and confidence**: education, credentials, career, self-care, grooming
3. **Belonging and connection**: social, dating, gifts, family, community, dues
2. **Safety and stability**: emergency fund, insurance, debt payoff above minimums, savings
1. **Food, shelter, health**: FAT (food, accommodation, transportation), health costs, debt minimums

## Stages (computed from data SLAM already has, never asked)

1. **Crisis**: runway under 1 month, or high-interest debt growing
2. **Stable**: runway 1 month or more, all minimums covered
3. **Building**: no high-interest debt, Rule of 5 cushion in progress
4. **Thriving**: Rule of 5 cushion full, investing every month
5. **Free**: FI progress at 100%

The client can also tap any stage to preview it.

## Reference fills (percent of each level met; Classic, then Real)

- Stage 1: L1 60/60, L2 0/30, L3 0/40, L4 0/20, L5 0/20
- Stage 2: L1 100/85, L2 60/60, L3 0/50, L4 0/35, L5 0/25
- Stage 3: L1 100/95, L2 100/80, L3 60/60, L4 0/50, L5 0/35
- Stage 4: L1 100/100, L2 100/90, L3 100/70, L4 60/65, L5 0/50
- Stage 5: L1 100/100, L2 100/100, L3 100/75, L4 100/70, L5 80/70

Keep these in a data file (`data/pyramid.json`), never in view code. They are not bands: nothing is scored against them, and the You view is never graded by them.

## Data

- Each budget line's level is auto-tagged from its category (defaults from the list above) and editable per line, stored next to the existing Need/Want tag. A line with no level shows as "not sorted yet", never dropped.
- Savings and extra debt payments count toward level 2.
- If budget lines have happiness ratings, show joy per dollar per level.

## House rules

- Never red, and no verdict: the You view states shares, the same as DRAFTT.
- Every number has Show the math.
- Empty is not zero. Missing data shows as missing.
- Views never calculate: math lives in `engine/pyramid.js` with tests.
- Strong affordances: the Classic / Real / You toggle and the stage picker are real buttons with borders, 44px tap targets, in a card that looks like DRAFTT's. DRAFTT has no toggle yet, so this one sets the style; add it to `affordances.html`.
- Works at 375px. No em dashes.

## Eli's answers (2026-10-25)

- What it is: a lens like DRAFTT. It re-reads budget lines and adds no questions to the session. Each line's level is auto-tagged from its category and editable.
- Name: keep "Life Pyramid".
- Reference fills are not bands. The You view shows shares only, no verdict, same as DRAFTT. Classic and Real are labeled "a reference shape, not a rule".
- Where it lives: the Plan tab beside DRAFTT, same look and toggle style. A small version goes on the one-pager only if it fits without crowding.
