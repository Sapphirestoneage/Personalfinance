# The SLAM workbook

`numbers-workbook.xlsx` is the SLAM Profit Engine as one spreadsheet, for
anyone who finds the app too much. Same model, same formulas (F01 to F12,
F23, F24), same sample numbers. Nine tabs:

| Tab | What it holds |
| --- | --- |
| Start Here | Three steps, how to read the cells, the three promises |
| My Numbers | Every input as a pink cell, with a typical value and where to look |
| This Month | Profit, gross profit, sessions, hours, each business, the bottleneck, three charts |
| Levers | What one small move on each number does to the month |
| Three Futures | Disaster, Normal, Dream side by side, with the Disaster switches and runway |
| Plan | What the goal needs, per hour, the value stack, worth against cost to find |
| Check-in | One row a week; the last four weeks against the model |
| Clients | Aliases and stages only; budget flag for regulars; rates from the log |
| Definitions | Every word and every formula in plain English |

Rules the workbook keeps from the app: no names or documents anywhere,
screening never appears as a lever, a blank pink cell is counted and
called out (never silently a zero), a typed zero shows as 0, tax is a
reminder line only, and the file name says nothing about the kind of work.

## Rebuild

```
pip install openpyxl
python3 build.py numbers-workbook.xlsx
```

Then recalculate once with LibreOffice so every formula carries a cached
value (Excel and Numbers do this on open anyway):

```
soffice --headless --convert-to xlsx --outdir /tmp numbers-workbook.xlsx
```

## Checks

With the sample numbers the workbook must agree with the app: gross profit
$14,655, profit $13,155, 18 sessions. With add-on and retainer set to No and
the session cap blank: in-person gross profit $4,972.50 and 13.26 sessions
(golden test G7's single-only case). Blank inputs give zero formula errors.
