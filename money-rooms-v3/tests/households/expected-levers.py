#!/usr/bin/env python3
"""Independent expected deltas for the sensitivity tie-out (Level 9, MR-042).
Two synthetic households, typed here by hand (never read from the engine or
from levers-specs.mjs): take-home, spending, FAT floor, invested; 5% real
return, 4% withdrawal rate, 1% cash return. Writes levers-expected.json.
Rules copied from the projection: invested x 1.05 + 12 x the account
contribution each year; the leak (take-home - spending - the savings
transfer) goes to cash at 1%; FI is the first year net worth x 4% covers
annual spending, interpolated inside that year to a tenth of a month.
Run: python3 money-rooms-v3/tests/households/expected-levers.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
def R(x): return int(math.floor(x + 0.5))
H = {
 'starter': dict(take=560000, lines=[160000, 60000, 40000, 120000], floor=260000, invested=4200000, cash=0, barista=150000),
 'mid': dict(take=950000, lines=[230000, 80000, 50000, 190000], floor=360000, invested=18000000, cash=500000, barista=None),
}
def months(take, lines, invested, cash, r=0.05, wr=0.04, contrib_m=None, landing=None):
    spend = sum(lines); contrib_m = (take - spend) if contrib_m is None else contrib_m; landing = contrib_m if landing is None else landing
    leak = take - spend - landing
    target = spend * 12 / wr; inv = invested; csh = cash; prev = inv + csh
    if prev >= target: return 0.0
    for y in range(1, 66):
        inv = R(inv * (1 + r)) + 12 * contrib_m
        csh = R(csh * 1.01) + max(0, leak * 12)
        nw = inv + csh
        if nw >= target:
            frac = 1 if nw == prev else min(1, max(0, (target - prev) / (nw - prev)))
            return round((y - 1 + frac) * 12, 1)
        prev = nw
    return None
out = {}
for name, h in H.items():
    take, lines, floor, inv, cash = h['take'], h['lines'], h['floor'], h['invested'], h['cash']
    spend = sum(lines); base_contrib = take - spend
    base = months(take, lines, inv, cash)
    # shocks: contributions and the savings transfer stay as typed; a spending cut or a raise shows up as leak into cash
    d = {}
    d['spendingMinus10pct'] = round(months(take, [R(l * 0.9) for l in lines], inv, cash, contrib_m=base_contrib, landing=base_contrib) - base, 1)
    d['takeHomePlus10pct'] = round(months(R(take * 1.1), lines, inv, cash, contrib_m=base_contrib, landing=base_contrib) - base, 1)
    big = max(lines); cut = [l - 10000 if l == big else l for l in lines]
    d['spendingMinus100'] = round(months(take, cut, inv, cash, contrib_m=base_contrib, landing=base_contrib) - base, 1)
    d['takeHomePlus100'] = round(months(take + 10000, lines, inv, cash, contrib_m=base_contrib, landing=base_contrib) - base, 1)
    d['investedPlus10pct'] = round(months(take, lines, R(inv * 1.1), cash) - base, 1)
    d['returnPlus1pt'] = round(months(take, lines, inv, cash, r=0.06) - base, 1)
    d['withdrawal35'] = round(months(take, lines, inv, cash, wr=0.035) - base, 1)
    d['windfall1000'] = round(months(take, lines, inv + 100000, cash) - base, 1)
    wr = 0.04; bar = h['barista'] if h['barista'] is not None else 200000  # the assumption: $24,000 a year
    ladder = {'leanFi': R(floor * 12 / wr), 'baristaLeanFi': R(max(0, floor - bar) * 12 / wr), 'baristaRegularFi': R(max(0, spend - bar) * 12 / wr), 'regularFi': R(spend * 12 / wr), 'fatFi': R(spend * 12 * 1.5 / wr)}
    out[name] = dict(baseMonths=base, deltas=d, ladder=ladder, baristaRule=R(10000 * 12 / 0.04), baristaRuleAt35=R(10000 * 12 / 0.035), pctToFiInvested=round(inv / ladder['regularFi'], 6), pctToFiNetWorth=round((inv + cash) / ladder['regularFi'], 6))
    print(name, 'base', base, 'months;', d, ladder)
json.dump(out, open(os.path.join(HERE, 'levers-expected.json'), 'w'), indent=1)
