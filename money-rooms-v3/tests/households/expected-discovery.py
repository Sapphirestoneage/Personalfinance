#!/usr/bin/env python3
"""Expected numbers for the Level 8 households, typed from the facts in
discovery-specs.mjs by hand (never read from the engine). Writes
discovery-expected.json. Run: python3 money-rooms-v3/tests/households/expected-discovery.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, '..', '..', 'data')
def R(x): return int(math.floor(x + 0.5))
col = json.load(open(os.path.join(DATA, 'col-tiers.json'))); dflt = json.load(open(os.path.join(DATA, 'defaults.json')))
E = {}
# ---- Maya (discovery): Jersey City -> New York metro -> all items 113 (HCOL), housing 150
ny = next(m for m in col['metros'] if m['id'] == 'new-york')
assert ny['allItems'] >= col['cutPoints']['hcolAtOrAbove']
mult_all = ny['allItems'] / 100; mult_housing = ny['housing'] / 100
people = 2  # Maya and one roommate -> a 2-bed, split evenly
unit = dflt['housingByUnit']['2bed']
rent_full = R(unit['rent'] * mult_housing); rent_share = R(rent_full * 0.5)
util_full = R(unit['utilities'] * mult_housing); util_share = R(util_full * 0.5)
size1 = lambda cat: dflt['categories'][cat]['lines']['1']
guess = {'accommodation': rent_share, 'utilities': util_share + sum(R(c * mult_housing) for n, c in size1('utilities') if n != 'Phone')}
for cat in ('food', 'transportation', 'therapy', 'wants', 'irregular'):
    guess[cat] = sum(R(c * mult_all) for n, c in size1(cat))
take_monthly = R(190000 * 26 / 12)
gross_monthly = R(6800000 / 12)
spending_guessed = sum(guess.values())  # the phone line is 0
cash = 250000 + 30000 + 4000
shared_full = rent_full + util_full; shared_share = rent_share + util_share; gap_monthly = shared_full - shared_share
guess_rows = 2 + (len(size1('utilities')) - 1) + sum(len(size1(c)) for c in ('food', 'transportation', 'therapy', 'wants', 'irregular'))
E['maya'] = dict(tier='HCOL', allItems=ny['allItems'], housing=ny['housing'], metro='new-york', state='NJ', takeHomeMonthly=take_monthly, grossMonthly=gross_monthly,
  guesses=guess, guessRows=guess_rows, guessAreas=7, spendingMonthly=spending_guessed, cash=cash, sharedFull=shared_full, sharedShare=shared_share, gapMonthly=gap_monthly,
  bridge2=gap_monthly * 2, cushionNow=round(cash / spending_guessed, 1), cushionAlone=round(cash / (spending_guessed + gap_monthly), 1),
  ruleOf5Months=27 / 5, ruleOf5Target=R(spending_guessed * 27 / 5) + gap_monthly * 2, fiNumber=R(spending_guessed * 12 / 0.04), gentle=True,
  anchorsGut=['income:gross', 'income:takeHome', 'safety:cash'], noAnchorFor=['spending:accommodation', 'spending:food', 'debt:total'])
# tier scaling checks: the same 2-bed guess in MCOL and LCOL
E['tiers'] = {t: R(unit['rent'] * col['tierAverages'][t]['housing'] / 100 * 0.5) for t in ('HCOL', 'MCOL', 'LCOL')}
E['tiers']['hcolMetro'] = rent_share
# ---- the variance household
g = {'total': 240000, 'food': 50000, 'accommodation': 150000, 'transportation': 30000, 'wants': 30000, 'utilities': 15000}
d = {'food': 45000, 'wants': 40000, 'accommodation': 150000}
a = {'accommodation': 150000, 'food': 65000, 'transportation': 45000, 'wants': 20000, 'utilities': 15000}
total_actual = sum(a.values())
rows = {}
for cat in a:
    row = {'actual': a[cat], 'gut': g.get(cat), 'dream': d.get(cat)}
    if row['gut'] is not None: row['awareness'] = a[cat] - row['gut']
    if row['dream'] is not None: row['dreamGap'] = a[cat] - row['dream']
    if row['gut'] is not None and row['dream'] is not None: row['wish'] = row['dream'] - row['gut']
    rows[cat] = row
E['variance'] = dict(rows=rows, totalActual=total_actual, totalGut=240000, totalAwareness=total_actual - 240000, totalAwarenessPct=round((total_actual - 240000) / 240000, 3),
  bigger=['food', 'transportation'], smaller=['wants'], roomToSpend=['wants'], aboveDream=['food'], rankedFirst='food',
  top2=['food', 'transportation'], top2Share=round((15000 + 15000) / (15000 + 15000 + 10000), 2),
  targetDefault={'food': 'dream', 'wants': 'room', 'transportation': 'middle', 'accommodation': 'middle', 'utilities': 'middle'},
  middle={'transportation': R(45000 + (30000 - 45000) * 0.5), 'accommodation': 150000, 'utilities': 15000})
json.dump(E, open(os.path.join(HERE, 'discovery-expected.json'), 'w'), indent=1)
print('maya: tier', E['maya']['tier'], 'guess rows', guess_rows, 'spending', spending_guessed, 'take-home', take_monthly, 'gap', gap_monthly, 'bridge', gap_monthly * 2)
print('variance:', E['variance']['totalAwareness'], E['variance']['totalAwarenessPct'])
