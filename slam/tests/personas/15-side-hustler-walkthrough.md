# Walkthrough: Casey Rivera, side hustler (the demo household)

Method and shared findings: `UI-NOTES.md`. Hand math: `../../test/demo.golden.test.js` and `../../SIGNOFF.md`.

## What the pages showed

- Ledger: loaded, 129 fields; 1 missing (the "need or want" tag on "Everything else"), 36 rough.
- Dashboard: loaded. Net worth $62,800. Runway 3.4 months (target 6.4, $22,861). Surplus $686 after a $153 set-aside ("2026 tax still due $1,073, over 7 months"). Savings rate 22.9%. Credit cards: $1,200 of promo balance due February 28, 2027 ("about $300 a month clears them"), personal cards 35% (red), store card 60% (red), the payoff order "Visa (22%), then the 0% promos". FI 6.5% of $1,000,000; Lean FI $774,000; "FI in about 20.3 years". 2026 balance due $1,073.
- Flags: 2 red (the store card, personal cards), 10 yellow, matching SIGNOFF.md.

## No field for

- The quarterly estimate amount. The tax tile gives the next date (January 15, 2027) and the flag says "set aside $1,073 by April 15"; a 1099 earner needs "send $X by January 15", and whether the W-2 withholding already satisfies the safe harbor (it does: $9,960 withheld against $6,917 of federal tax).
- The tutoring's after-tax hourly rate, or any "is the hustle worth it" reading: the set-aside shows the tax, the income tile shows the gross, nothing joins them.
- Business expenses on the tutoring (the field exists and is blank; the Ledger shows it only if the file carries it).
- Raising W-2 withholding instead of paying estimates: no lever.

## Forced into the wrong category

- Nothing. The demo was built to fit.

## Confusing labels or steps

- "Weekend tutoring: amount, rough" tops the still-guessing list with "moves tax due by ..."; right, and the Ledger's confirm button is one tap. Good.

## Results that look wrong or misleading

- None against the hand math. The "FI in about 20.3 years" uses the Likely set, not the household's 5%; the tile says so in its last line.

## Assumptions that are not true for them

- A side hustle has no expenses and no separate account; close enough for tutoring.

## Rating

**Works well.**
