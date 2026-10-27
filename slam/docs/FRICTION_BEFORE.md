# Friction audit, before

Minutes are taps, typed answers and results at the pace, plus the time each friction below loses.

Made by `node slam/tools/friction-audit.mjs` on 2026-10-27. Two made-up households (Maya: renter, one W-2; Dre: homeowner, a W-2 and 1099 work, a mortgage), a full first session from opening the app to printing the one-pager, on a 1280 x 800 laptop screen. Time at the CLIENT_TEST pace: 5 s a tap, 45 s a typed answer, 60 s a result talked through.

| Household | Numbers typed | Taps | Taps per number | Keys | Scrolls | Page loads | Screen changes | Dead ends | Next below the fold | Results talked | Minutes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Maya | 28 | 48 | 1.71 | 139 | 5 | 4 | 21 | 0 | 3 | 7 | 36.2 |
| Dre | 35 | 64 | 1.83 | 180 | 5 | 5 | 22 | 0 | 1 | 7 | 48.2 |

## Per step (taps, typed answers, scrolls)

- Maya: new client 4/0/0; debt 7/8/1; assets 9/5/1; taxes 3/0/0; income 9/2/0; needs 11/10/3; goals 2/2/0; one-pager 1/0/0
- Dre: new client 4/0/0; debt 7/8/1; assets 15/8/0; taxes 3/0/0; income 13/4/1; needs 12/11/2; goals 2/2/0; my numbers (left over) 5/1/1; one-pager 1/0/0

## The worst frictions, by time lost

1. No way to start a new client: the coach makes a blank file and opens it (2x, about 4 min)
2. A mortgage cannot be added in the Session: done later in My numbers (1x, about 4 min)
3. The progress tracker says 4 steps are done on an empty household (2x, about 2 min)
4. Tab does not reach the next box: a tap into each one (19x, about 1.6 min)
5. Rate, payment and due day of the mortgage are one screen deeper in My numbers (1x, about 1.5 min)
6. The one-pager is not on the Session: the coach goes to it by address or the menu (2x, about 0.3 min)
7. Next step below the fold on debt (2x, about 0.2 min)
8. Next step below the fold on assets (1x, about 0.1 min)
9. Next step below the fold on needs (1x, about 0.1 min)

## Dead ends

None.

## Errors

None.

## Printed

Maya: yes, Dre: yes
## Also seen on the walk (not timed by the script)

- Seven tabs in the header (Today, Session, My numbers, Calendar, Spending, Plan, and the name menu), plus pages reached only by address (Windfall, Math, Rules, House, Builder, Before, One-pager).
- The client's name shows only inside the name menu; there is one household per browser, so switching clients means saving and opening files.
- Opening the app lands on Today, not on the Session step where the call stopped.
- No End call: the one-pager, the to-dos and a backup file are three separate trips.
- My numbers has a Save button for the profile file; nothing says the browser already kept the change.
- The Session asks a 401(k) match as one rate and one cap; a two-tier match (100% of 3%, then 50% of 2%) cannot be typed there.

## The ten to fix, and where

1. Start a new client: Batch 1 (client switcher, New client).
2. A mortgage in the Session: Batch 1 (Mortgage in the Session's debt questions, with its own boxes).
3. The progress tracker on an empty household: Batch 1 (a step is done when something was entered in it).
4. Tab into the next box: Batch 3 (keyboard first: Tab and Enter move on).
5. The mortgage's rate, payment and due day one screen deeper: Batch 1 (fixed with 2).
6. The one-pager not on the Session: Batch 1 (End call in the header).
7. Next below the fold: Batch 1 (Back and Next pinned at the bottom of the step).
8. Too many tabs: Batch 1 (four tabs and a More menu).
9. Opening the app away from the Session: Batch 1 (pick up where we left off).
10. The one-rate match in the Session: Batch 3 (the match tiers on screen one).
