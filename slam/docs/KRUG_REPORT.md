# The Krug pass: words and height, before and after

Measured by `node tools/screen-budget.mjs` at 390px, demo household (made up), fresh browser storage, nothing opened. "Before" is the commit just before Krug step 1 (b56a160^), measured with the same tool (docs/krug-budget-before.json); "after" is test/screen-budget.json at the end of step 7. Words count what a person can see in the page body; a closed list counts only its picked option.

| Screen | Words before | Words after | Target | Height before (px) | Height after (px) |
|---|---:|---:|---:|---:|---:|
| Today | 403 | 99 | 150 | 4144 | 1020 |
| Session | 107 | 43 | 60 | 1410 | 844 |
| My numbers | 108 | 86 | - | 1013 | 1053 |
| Still guessing | 149 | 90 | 100 | 1141 | 844 |
| A card (Visa) | 88 | 60 | 80 | 1221 | 990 |
| Needs | 56 | 39 | - | 844 | 844 |
| Calendar | 191 | 180 | 150 | 2016 | 1912 |
| Spending | 163 | 103 | 90 | 1697 | 1382 |
| Plan | 298 | 172 | 150 | 2133 | 1315 |
| Profile | 112 | 46 | 60 | 844 | 844 |
| Assumptions | 1660 | 31 | - | 9658 | 844 |
| One-pager | 226 | 190 | - | 2084 | 1723 |
| Before our first call | 572 | 122 | - | 6306 | 1076 |
| Got extra money? | 123 | 99 | - | 1088 | 879 |

Still over target, on purpose for now:

- Calendar (180 of 150): the overnight build's Track A replaces the Calendar's top screen with a month grid, so trimming its words now would be thrown away.
- Spending (103 of 90): the Budget vs actual brief makes Spending's See tab one Budget view; the words are measured again after it.
- Plan (172 of 150): the step list is the screen's main content (nine steps, each with its amount and date). Everything under it is now three folded rows and one line for Got extra money.
