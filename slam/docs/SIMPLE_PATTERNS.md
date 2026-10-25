# Simple patterns (Phase 2.5)

Six patterns taken from simple money apps. Each one names the screen it goes on.
A screen copies the pattern as written here; anything a pattern does not cover
follows `slam/DESIGN.md` and the affordance rules in the repository `CLAUDE.md`.

How every screen is judged: one job per screen; cut the words in half, then in
half again; if everything is big, nothing is big; no screen needs a manual.

## 1. Collapsible groups with one total per row

A group is one row: a chevron, its name, and one total on the right. Tap the
row to open it; only one group is open at a time. Inside, the biggest items
come first. A rough or missing number is a small chip on its row.

Goes on: Enter (the Ledger statement: the six DATING sections, then groups
such as Credit cards, then items); Spending, See tab (Where it goes: each
category down to its lines); Plan (each step opens in place).

## 2. An inline editable row, like a spreadsheet

The amount is a box on the row. Type a number and it is saved; monthly is the
default. Everything else (who pays, shared, covered by someone, dates) is a
small toggle on the right, closed until asked for. Nothing else is required.

Goes on: Enter (every step: Needs, Debt, Income, Assets, Goals); the Ledger
rows inside each group.

## 3. A review queue for imported transactions

One big "Import a statement" button. The rows come back as a queue sorted into
matched, recurring and new; each row can be changed or skipped; one Apply
button at the end. Nothing lands until Apply.

Goes on: Spending, Do tab.

## 4. Net worth that drills down

Two numbers side by side: liquid net worth and total net worth. Tap one to
see the six DATING sections, then a group, then an account.

Goes on: Enter (the top of the Ledger statement); Today (the Net worth tile,
which opens the same drill-down); One-pager (both numbers).

## 5. A small segmented time picker

1, 3, 6 or 12 months as one row of small segments. The range is said in words
next to it ("Showing Nov to Jan"). A section the picker does not change hides
it.

Goes on: Spending, See tab; Calendar (how far ahead the line and the grid run).

## 6. A balance line chart with labeled axes

Cash as one line and debt as another, each labeled, with dollar values on the
y axis and month names on the x axis. A dot only where something changes. A
point shows its day and value; the same values are in a list underneath.

Goes on: Calendar (Cash by day).
