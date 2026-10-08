#!/usr/bin/env python3
"""Independent expected values for the momentum tie-out (Level 12, MR-063).
The two lever households (starter, mid), typed here by hand, never read from
the engine or from levers-specs.mjs. One month passes with contributions
going in while the market falls hard (a sixth off): the brokerage balance is re-typed lower.
The engine's "why it moved" must split net worth into what was done (the
contributions expected over the elapsed time, at the account's own monthly
contribution) and what the market did (the rest), and the savings rate must
not move at all. Writes momentum-expected.json.
Run: python3 money-rooms-v3/tests/households/expected-momentum.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
def R(x): return int(math.floor(x + 0.5))
H = {
 'starter': dict(take=560000, lines=[160000, 60000, 40000, 120000], floor=260000, invested=4200000, cash=0, after=3500000),
 'mid': dict(take=950000, lines=[230000, 80000, 50000, 190000], floor=360000, invested=18000000, cash=500000, after=16000000),
}
SNAP = '2026-10-01T00:00:00.000Z'; MOVE = '2026-11-01T00:00:00.000Z'
DAYS = 31  # October has 31 days
MONTHS = DAYS / 30.44
out = {}
for name, h in H.items():
    spend = sum(h['lines']); surplus = h['take'] - spend
    savings_rate = surplus / h['take']
    nw_before = h['invested'] + h['cash']; nw_after = h['after'] + h['cash']
    expected_contrib = R(surplus * MONTHS)          # the account's contribution is the monthly surplus
    did = expected_contrib                          # contributions over the month
    market = (nw_after - nw_before) - did           # the rest of the balance move
    runway_full = h['cash'] / spend if spend else None  # months of full spending the cash covers
    out[name] = dict(
        savingsRate=round(savings_rate, 6), netWorthBefore=nw_before, netWorthAfter=nw_after,
        netWorthDelta=nw_after - nw_before, did=did, market=market, time=0, learned=0,
        surplus=surplus, spend=spend, runwayFullMonthsBefore=None if runway_full is None else round(runway_full, 3),
        ladderSavingsRateRung=max([r for r in [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5] if r <= savings_rate]),
        nextSavingsRateRung=min([r for r in [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5] if r > savings_rate]),
        snapAt=SNAP, moveAt=MOVE, elapsedMonths=round(MONTHS, 4))
json.dump(out, open(os.path.join(HERE, 'momentum-expected.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
