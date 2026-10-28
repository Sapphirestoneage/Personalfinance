# Friction audit, after

Minutes are taps, typed answers and results at the pace, plus the time each friction below loses.

Made by `node slam/tools/friction-audit.mjs` on 2026-10-28. Made-up households (Maya: renter, one W-2; Dre: homeowner, a W-2 and 1099 work, a mortgage; Jordan and Sam: a couple in New York City, two W-2s), a full first session from opening the app to printing the one-pager, on a 1280 x 800 laptop screen. Time at the CLIENT_TEST pace: 5 s a tap, 45 s a typed answer, 60 s a result talked through.

| Household | Numbers typed | Taps | Taps per number | Keys | Scrolls | Page loads | Screen changes | Dead ends | Next below the fold | Results talked | Minutes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Maya | 28 | 46 | 1.64 | 139 | 14 | 3 | 28 | 0 | 0 | 7 | 32.3 |
| Dre | 39 | 56 | 1.44 | 195 | 19 | 3 | 28 | 0 | 0 | 7 | 41.3 |
| Jordan | 30 | 68 | 2.27 | 181 | 14 | 3 | 28 | 0 | 0 | 7 | 35.4 |

## Before and after

| Household | Taps per number, before | after | Page loads + screen changes, before | after | Minutes, before | after |
|---|---|---|---|---|---|---|
| Maya | 1.71 | 1.64 | 25 | 31 | 36.2 | 32.3 |
| Dre | 1.83 | 1.44 | 27 | 31 | 48.2 | 41.3 |

## Per step (taps, typed answers, scrolls)

- Maya: new client 4/1/0; debt 7/8/4; assets 10/5/2; taxes 3/0/0; income 9/2/3; needs 7/9/3; goals 2/2/1; one-pager 3/0/1
- Dre: new client 4/1/0; debt 8/12/7; assets 16/8/3; taxes 3/0/0; income 13/4/4; needs 6/11/3; goals 2/2/1; one-pager 3/0/1
- Jordan: new client 4/1/0; debt 13/9/2; assets 16/6/3; taxes 3/0/0; income 21/4/5; needs 5/7/2; goals 2/2/1; one-pager 3/0/1

## The worst frictions, by time lost

1. Tab does not reach the next box: a tap into each one (12x, about 1 min)

## Dead ends

None.

## Errors

None.

## Printed

Maya: yes, Dre: yes, Jordan: yes
