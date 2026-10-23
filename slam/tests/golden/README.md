# Golden households (made up)

Seven fictional households, each worked out by hand from first principles and
then run through the Phase 1 engines. Nothing here is a real person's data.

| File | Who | What it exercises |
| --- | --- | --- |
| `households/jobless-june.json` | June, 35, between jobs | unemployment with no withholding, an ended W-2, a likely new job |
| `households/w2-wes.json` | Wes, 38 | W-2 pay every two weeks, a 401(k) with a match, a card paid in full monthly |
| `households/freelance-fay.json` | Fay, 40 | 1099 income, business expenses, quarterly estimates, a solo 401(k) |
| `households/card-carlos.json` | Carlos, 23 | cards near their limits, a payday loan, buy now pay later, money owed to family, negative net worth |
| `households/student-sam.json` | Sam, 24 | federal loans in deferment, part-time and summer W-2, help from parents, shared rent |
| `households/carloan-cat.json` | Cat, 36, head of household | a car loan that pays off in September 2027, a 529 |
| `households/near-fi-nina.json` | Nina and Lev, 47 and 45, married | close to FI, a small mortgage, gains and dividends |

Next to each household: `<id>.expected.md`, the hand math for every number
(formula, inputs, source), and `../<id>.golden.test.js`, which runs the engines
on the file and checks each number. A check the engine fails is marked as a
known failure (`todo`) with the reason, so it runs and reports but does not
break the suite. The conventions used for the hand math are in
`CONVENTIONS.md`; the differences found are collected in
`../../docs/CHECKER_REPORT.md`.

Rebuild the JSON files with `node tests/golden/make-households.js` from the
`slam` folder. Run the tests with `node --test` from the same folder (they are
picked up with the rest).
