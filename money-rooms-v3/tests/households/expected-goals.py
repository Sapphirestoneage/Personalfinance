#!/usr/bin/env python3
"""Independent workpaper for the Level 11 goal timeline: Maya's goals, hand
typed (never read from the engine), funded month by month in the three modes
with the arithmetic written out. The cushion is one pot filled in three
steps: a lean month, a full month (both floors), then the Rule of 5 cushion.
Writes goals-expected.json for tests/engine/goals.test.js. Rounding is
floor(x + 0.5) on cents like JS.
Run: python3 money-rooms-v3/tests/households/expected-goals.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda x: int(math.floor(x + 0.5))

# ---- Maya at her first sessions (cents). Surplus about 700 a month after minimums.
FROM = '2026-10'
SURPLUS = 70000
CASH = 250000                  # the cushion pot today
LEAN = 245000                  # one month of rent share, food and getting around
FULLMONTH = 360000             # one month of everything
RULE5_MONTHS = 26 / 5          # age 26
RULE5 = R(FULLMONTH * RULE5_MONTHS)
CARD = dict(balance=400000, apr=0.24, minimum=12000)
GOALS = [  # id, type, target, date
    ('lean', 'floor', LEAN, None),
    ('fullmonth', 'floor', FULLMONTH, None),
    ('card', 'debt', CARD['balance'], None),
    ('full', 'amount', RULE5, None),
    ('bach', 'dated', 120000, '2027-04'),
    ('wedding', 'dated', 200000, '2027-09'),
    ('trip', 'amount', 150000, None),
]
CUSHION = ('lean', 'fullmonth', 'full')
TARGET = dict((g[0], g[2]) for g in GOALS)

def add_months(ym, n):
    y, m = int(ym[:4]), int(ym[5:7]) - 1 + n
    return '%04d-%02d' % (y + m // 12, m % 12 + 1)
def between(a, b):
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])

def run(mode, surplus=SURPLUS, cash=CASH, events=(), max_months=240):
    pot = cash
    bal = {'bach': 0, 'wedding': 0, 'trip': 0}
    debt = CARD['balance']; interest = 0
    done = {g[0]: False for g in GOALS}; finish = {g[0]: None for g in GOALS}; done_at_start = {}
    for gid in CUSHION:
        if pot >= TARGET[gid]: done[gid] = True; done_at_start[gid] = True
    funded = {g[0]: [] for g in GOALS}
    freed = 0; freed_next = 0
    def remaining(gid):
        if gid == 'card': return debt
        if gid in CUSHION: return TARGET[gid] - pot
        return TARGET[gid] - bal[gid]
    def give(gid, cents, m):
        nonlocal debt, pot
        pay = min(cents, max(0, remaining(gid)))
        if gid == 'card': debt -= pay
        elif gid in CUSHION: pot += pay
        else: bal[gid] += pay
        funded[gid][m] += pay
        return pay
    def finish_check(gid, ym):
        nonlocal freed_next
        if not done[gid] and remaining(gid) <= 0:
            done[gid] = True; finish[gid] = ym
            if gid == 'card': freed_next += CARD['minimum']
    for m in range(max_months):
        ym = add_months(FROM, m)
        for g in GOALS: funded[g[0]].append(0)
        freed += freed_next; freed_next = 0
        avail = surplus + freed
        for e in events:
            if e['month'] == ym and e['kind'] == 'windfall': avail += e['cents']
            if e['month'] == ym and e['kind'] == 'withdraw':
                pot = max(0, pot - e['cents'])
                for gid in CUSHION:
                    if done[gid] and pot < TARGET[gid]: done[gid] = False; done_at_start[gid] = False
        if not done['card']:
            i = R(debt * CARD['apr'] / 12); interest += i; debt = debt + i - CARD['minimum']
            if debt <= 0: debt = 0; finish_check('card', ym)
        # 1. the floors, in order
        for gid in ('lean', 'fullmonth'):
            if not done[gid] and avail > 0:
                avail -= give(gid, avail, m); finish_check(gid, ym)
        if not (done['lean'] and done['fullmonth']):
            continue
        open_goals = [g[0] for g in GOALS if g[1] != 'floor' and not done[g[0]]]
        if mode == 'deadlines-first':
            for gid in open_goals:
                g = dict((x[0], x) for x in GOALS)[gid]
                if g[1] == 'dated':
                    left = between(ym, g[3]) + 1
                    need = remaining(gid) if left <= 1 else math.ceil(remaining(gid) / left)
                    avail -= give(gid, min(avail, need), m)
            for gid in open_goals:
                if avail > 0: avail -= give(gid, avail, m)
        elif mode == 'one-at-a-time':
            for gid in open_goals:
                if avail > 0: avail -= give(gid, avail, m)
        else:
            pool = avail; guard = 0
            while pool > 0 and guard < 10:
                guard += 1
                el = [gid for gid in open_goals if remaining(gid) > 0]
                if not el: break
                before = pool
                for gid in el:
                    share = math.floor(before * (1.0 / len(el)))
                    pool -= give(gid, min(share, pool), m)
                if pool == before: pool -= give(el[0], pool, m)
            avail = pool
        for gid in open_goals: finish_check(gid, ym)
        if all(done.values()): break
    return dict(finish=finish, interest=interest, funded=funded, doneAtStart=done_at_start)

out = {}
for mode in ('deadlines-first', 'one-at-a-time', 'all-at-once'):
    r = run(mode)
    on_time = sum(1 for g in GOALS if g[1] == 'dated' and r['finish'][g[0]] and r['finish'][g[0]] <= g[3])
    out[mode] = dict(finish=r['finish'], interest=r['interest'], onTime=on_time, doneAtStart=r['doneAtStart'],
                     fundedBachApril=r['funded']['bach'][between(FROM, '2027-04')], fundedBachMay=r['funded']['bach'][between(FROM, '2027-05')],
                     fundedMonth1={g[0]: r['funded'][g[0]][0] for g in GOALS}, fundedMonth2={g[0]: r['funded'][g[0]][1] for g in GOALS}, fundedDec={g[0]: r['funded'][g[0]][between(FROM, '2026-12')] for g in GOALS})
# she uses 2,000 of the cushion in March 2027 under dates first: step 1 reopens and refills before step 2
w = run('deadlines-first', events=[dict(month='2027-03', kind='withdraw', cents=200000)])
out['withdraw'] = dict(finish=w['finish'], leanMarch=w['funded']['lean'][between(FROM, '2027-03')], fullmonthMarch=w['funded']['fullmonth'][between(FROM, '2027-03')], fullmonthApril=w['funded']['fullmonth'][between(FROM, '2027-04')], bachMarch=w['funded']['bach'][between(FROM, '2027-03')])
wf = run('deadlines-first', events=[dict(month='2027-01', kind='windfall', cents=200000)])
out['windfall'] = dict(finish=wf['finish'])
p = run('deadlines-first', surplus=SURPLUS + 10000)
out['plus100'] = dict(finish=p['finish'])
# a smaller pot: step 1 is not met at creation and fills first, then step 2
small = run('deadlines-first', cash=100000)
out['smallPot'] = dict(finish=small['finish'], fundedMonth1={g[0]: small['funded'][g[0]][0] for g in GOALS}, fundedMonth2={g[0]: small['funded'][g[0]][1] for g in GOALS}, fundedMonth3={g[0]: small['funded'][g[0]][2] for g in GOALS})
out['inputs'] = dict(from_=FROM, surplus=SURPLUS, cash=CASH, lean=LEAN, fullMonth=FULLMONTH, rule5=RULE5, card=CARD, goals=[dict(id=g[0], type=g[1], target=g[2], date=g[3]) for g in GOALS])
json.dump(out, open(os.path.join(HERE, 'goals-expected.json'), 'w'), indent=1)
for mode in ('deadlines-first', 'one-at-a-time', 'all-at-once'):
    print(mode, out[mode]['finish'], 'onTime', out[mode]['onTime'], 'interest', out[mode]['interest'], 'doneAtStart', out[mode]['doneAtStart'])
print('withdraw', out['withdraw']); print('windfall', out['windfall']['finish']); print('plus100', out['plus100']['finish']); print('smallPot', out['smallPot'])
