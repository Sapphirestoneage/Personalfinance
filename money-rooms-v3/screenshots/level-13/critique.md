# Level 13 critique (round 1, 8 Oct 2026)

Screens reviewed: the hub, the calendar (seven tabs), How much home, House, Car,
Retirement for two, the ten chart pages; coach and client; 1440, 1024 and 390;
dark theme on the main screens. Files: screenshots/level-13/maya-*.jpg.

| # | Screen | Finding | Fix |
|---|---|---|---|
| 1 | Calendar, Cards tab, 390 | The six card figures stacked one per row in tall tiles, a screen of scrolling per card | Two columns and a smaller figure under 720px |
| 2 | Calendar, Cards tab | "Statement closes: the 18" read wrong | Ordinals: "the 18th" |
| 3 | Calendar, Cards tab | A card paid in full every month showed "Stopped revolving: Oct 8", the window's start | "Interest: none, paid in full" when the card never revolved |
| 4 | Calendar, month grid | December showed its whole month with numbered dead days after the window's end | Days after the window are blank; days before it stay muted |
| 5 | How much home, three-answer chart | The row notes under the labels were cut ("housing share of gross...") | A label column of 30% of the width, notes shortened to fit it |
| 6 | House, rent against buy | "You plan to stay 7 years" sat on the x axis | Label moved to the top of its marker |
| 7 | Car, total cost chart | The legend stopped at eight entries with "and 1 more" | The chart draws its own legend with every category |
| 8 | Hub, 390 | Cards read well; the existing calculators' numbers show their rough tilde | None needed |
| 9 | Retirement, dark | The gold growth band and the dashed potential line hold up on the dark paper; the FI line label reads | None needed |
| 10 | Every calculator | Changing an input saved it but the screen did not redraw until the next change elsewhere | Inputs redraw the screen; open input groups are remembered across the redraw |

Copy check: no "registry", "node", "edge", "band", "lever family" or
"decomposition" on any screen in either view (asserted in the flow). Gentle
mode: the client sees "tightest day", never "overdraft"; no red anywhere, the
amber tokens mark the low day and the tight months.

Round 2 after the fixes: the ten screens were re-shot; the ten findings are
closed. Open: the month grid shows only a balance on quiet days, which reads
a little bare at 1440; a one-line "nothing lands" on hover could help.
