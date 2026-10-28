# Friction audit, after

Minutes are taps, typed answers and results at the pace, plus the time each friction below loses.

Made by `node slam/tools/friction-audit.mjs` on 2026-10-28. Made-up households (Maya: renter, one W-2; Dre: homeowner, a W-2 and 1099 work, a mortgage; Jordan and Sam: a couple in New York City, two W-2s), a full first session from opening the app to printing the one-pager, on a 1280 x 800 laptop screen. Time at the CLIENT_TEST pace: 5 s a tap, 45 s a typed answer, 60 s a result talked through.

| Household | Numbers typed | Confirmed with Enter | Taps | Taps per number | Keys | Keypresses per number | Scrolls | Page loads | Screen changes | Page changes per session | Dead ends | Next below the fold | Results talked | Minutes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Maya | 28 | 16 | 57 | 2.04 | 143 | 5.1 | 11 | 5 | 22 | 27 | 0 | 0 | 7 | 33 |
| Dre | 39 | 19 | 70 | 1.79 | 199 | 5.1 | 14 | 5 | 22 | 27 | 0 | 0 | 7 | 42.4 |
| Jordan | 30 | 13 | 78 | 2.60 | 184 | 6.1 | 15 | 5 | 22 | 27 | 0 | 0 | 7 | 36.3 |

## Before and after

| Household | Keypresses per number, before | after | Page changes per session, before | after | Fields typed / confirmed with Enter, before | after | Taps per number, before | after | Minutes, before | after |
|---|---|---|---|---|---|---|---|---|---|---|
| Maya | 5.0 | 5.1 | 31 | 27 | 28 / 0 | 28 / 16 | 1.64 | 2.04 | 32.3 | 33 |
| Dre | 5.0 | 5.1 | 31 | 27 | 39 / 0 | 39 / 19 | 1.44 | 1.79 | 41.3 | 42.4 |
| Jordan | 6.0 | 6.1 | 31 | 27 | 30 / 0 | 30 / 13 | 2.27 | 2.60 | 35.4 | 36.3 |

## Per step (taps, typed answers, scrolls)

- Maya: new client 5/1/0; debt 8/8/1; assets 11/5/3; taxes 2/0/0; income 12/2/3; needs 13/9/3; goals 2/2/1; one-pager 3/0/0
- Dre: new client 5/1/0; debt 9/12/2; assets 17/8/4; taxes 2/0/0; income 18/4/3; needs 13/11/4; goals 2/2/1; one-pager 3/0/0
- Jordan: new client 5/1/0; debt 13/9/2; assets 17/6/4; taxes 2/0/1; income 26/4/4; needs 9/7/3; goals 2/2/1; one-pager 3/0/0

## The worst frictions, by time lost

1. Tab does not reach the next box: a tap into each one (11x, about 0.9 min)

## Dead ends

None.

## Errors

None.

## Printed

Maya: yes, Dre: yes, Jordan: yes
