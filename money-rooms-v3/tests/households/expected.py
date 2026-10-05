#!/usr/bin/env python3
"""Independent tie-out workpaper for a synthetic household. Reads the fixture's
facts (never the engine), computes every metric with the arithmetic shown, and
writes <name>-expected.md (the workpaper) and <name>-expected.json (what the
engine tests read). Rounding is floor(x + 0.5) on cents, the same as JS
Math.round, at every step where the engine rounds. Run from the repo:
python3 money-rooms-v3/tests/households/expected.py jordan"""
import json, math, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', 'data')
TAX = json.load(open(os.path.join(DATA, 'tax-2026.json')))
LIM = json.load(open(os.path.join(DATA, 'limits-2026.json')))
ASM = json.load(open(os.path.join(DATA, 'assumptions.json')))['defaults']
CARDS = {c['id']: c for c in json.load(open(os.path.join(DATA, 'cards.json')))['cards']}
TODAY = '2026-10-05'

def R(x): return int(math.floor(x + 0.5))
def dollars(c):
    s = '$' + format(abs(c) // 100, ',') + ('.%02d' % (abs(c) % 100) if abs(c) % 100 else '')
    return ('-' if c < 0 else '') + s
def pct(r): return '%.1f%%' % (r * 100)
PAYCHECKS = {'weekly': 52, 'biweekly': 26, 'semimonthly': 24, 'monthly': 12}
def val(f): 
    if f is None or f['state'] in ('unknown', 'not-applicable', 'not-for-me', 'will-send'): return None
    if f['state'] == 'none': return 0
    v = f['v']
    if isinstance(v, dict) and 'low' in v: return R((v['low'] + v['high']) / 2)
    return v
def monthly(row, fid):
    f = row['f'].get(fid); v = val(f)
    if v is None: return None
    cad = f.get('cad', 'month')
    pf = val(row['f'].get('payFrequency')) or 'biweekly'
    n = PAYCHECKS[pf]
    return {'month': v, 'year': R(v / 12), 'paycheck': R(v * n / 12), 'oneoff': 0}[cad]
def months_between(a, b):  # 'YYYY-MM' strings, b - a
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])
def add_months(ym, n):
    y, m = int(ym[:4]), int(ym[5:7]) - 1 + n
    return '%04d-%02d' % (y + m // 12, m % 12 + 1)
def age_at(birth, at):
    y = int(at[:4]) - int(birth[:4])
    if (at[5:7], at[8:10]) < (birth[5:7], birth[8:10]): y -= 1
    return y

def federal(taxable, status):
    tax = 0; lower = 0; marginal = 0
    for rate, upper in TAX['brackets'][status]:
        if taxable <= lower: break
        top = taxable if upper is None else min(taxable, upper)
        tax += (top - lower) * rate; marginal = rate; lower = upper
        if upper is None or taxable <= upper: break
    return R(tax), marginal

def main(name):
    fx = json.load(open(os.path.join(HERE, name + '.json')))['record']
    sun = fx['sun']['f']; P = fx['planets']
    rows = lambda p, t=None: [r for r in P[p]['rows'] if t is None or r['type'] == t]
    L = []  # workpaper lines
    E = {}  # expected values
    def line(s=''): L.append(s)
    def put(key, cents_or_val, text):
        E[key] = cents_or_val; line(text)
    birth = sun['birthDate']['v']; age = age_at(birth, TODAY); status = sun['filingStatus']['v']
    line('# %s: expected workpaper (tie-out)' % sun['name']['v'])
    line(); line('Hand-computed from tests/households/%s.json on %s. Money in cents inside the engine; shown in dollars here. Rounding: floor(x + 0.5) on cents at each step.' % (name, TODAY))
    line('Age at %s: born %s, so %d. Filing status %s.' % (TODAY, birth, age, status))
    E['age'] = age

    # ---- Income
    line(); line('## Income')
    gross = 0; take = 0; pretax = 0; roth = 0; hsa = 0; other = 0; wh = 0; bonus = 0; equity = 0; hours = 0.0; workcosts = 0
    match_actual = 0; match_max = 0; match_formula = None; paystub = 0; self_monthly = 0; w2_gross_monthly = 0
    for r in rows('income'):
        t = r['type']
        if t in ('w2', 'c1099', 'side'):
            g = monthly(r, 'grossPay') or 0; th = monthly(r, 'takeHome')
            paystub += g
            if t == 'w2' and not w2_gross_monthly: w2_gross_monthly = g
            if t in ('c1099', 'side'): self_monthly += g
            if th is None and g:
                # Enrich: infer take-home with the one tax function, this income on its own, before state tax
                pr0 = monthly(r, 'pretaxRetirement') or 0; hs0 = monthly(r, 'hsaPayroll') or 0; ot0 = monthly(r, 'pretaxOther') or 0; ro0 = monthly(r, 'rothRetirement') or 0
                pretax_a = (pr0 + hs0 + ot0) * 12
                if t in ('c1099', 'side'):
                    exp = (monthly(r, 'businessExpenses') or 0) * 12; net = max(0, g * 12 - exp)
                    base = R(net * TAX['fica']['selfEmploymentNetFactor']); se_tax = R(min(base, TAX['fica']['socialSecurityWageBase']) * TAX['fica']['socialSecurityRate'] * 2) + R(base * TAX['fica']['medicareRate'] * 2); se_half = R(se_tax * 0.5)
                    fed0, _ = federal(max(0, net - se_half - pretax_a - TAX['standardDeduction'][status]), status)
                    th = R((g * 12 - fed0 - se_tax - exp - pretax_a - ro0 * 12) / 12)
                    line('- %s (%s): take-home inferred = (%s x 12 - federal %s - self-employment tax %s - expenses %s) / 12 = %s a month (this income on its own, before state tax).' % (r['nickname'], t, dollars(g), dollars(fed0), dollars(se_tax), dollars(exp), dollars(th)))
                else:
                    fed0, _ = federal(max(0, g * 12 - pretax_a - TAX['standardDeduction'][status]), status)
                    fw = g * 12 - (hs0 + ot0) * 12
                    fica0 = R(min(fw, TAX['fica']['socialSecurityWageBase']) * TAX['fica']['socialSecurityRate']) + R(fw * TAX['fica']['medicareRate'])
                    th = R((g * 12 - fed0 - fica0 - pretax_a - ro0 * 12) / 12)
                    line('- %s (%s): take-home inferred = (%s x 12 - federal %s - FICA %s - pre-tax %s) / 12 = %s a month (before state tax).' % (r['nickname'], t, dollars(g), dollars(fed0), dollars(fica0), dollars(pretax_a), dollars(th)))
                th = max(0, th)
            b = monthly(r, 'bonus') or 0; eq = monthly(r, 'equity') or 0
            pr = monthly(r, 'pretaxRetirement') or 0; ro = monthly(r, 'rothRetirement') or 0; hs = monthly(r, 'hsaPayroll') or 0; ot = monthly(r, 'pretaxOther') or 0
            wf = monthly(r, 'withholdingFederal') or 0
            n_pay = PAYCHECKS[val(r['f'].get('payFrequency')) or 'biweekly']
            line('- %s (%s): gross %s per pay x %d / 12 = %s a month; take-home %s x %d / 12 = %s; bonus %s a year / 12 = %s; pre-tax retirement %s x %d / 12 = %s; other pre-tax %s x %d / 12 = %s.' % (
                r['nickname'], t, dollars(val(r['f']['grossPay']) or 0), n_pay, dollars(g), dollars(val(r['f'].get('takeHome')) or 0) if 'takeHome' in r['f'] else 'inferred', n_pay, dollars(th or 0), dollars(val(r['f'].get('bonus')) or 0), dollars(b), dollars(val(r['f'].get('pretaxRetirement')) or 0), n_pay, dollars(pr), dollars(val(r['f'].get('pretaxOther')) or 0), n_pay, dollars(ot)))
            gross += g + b + eq; take += th or 0; pretax += pr; roth += ro; hsa += hs; other += ot; wh += wf; bonus += b; equity += eq
            hp = val(r['f'].get('hoursPaid')) or 0; hc = val(r['f'].get('hoursCommute')) or 0
            hours += (hp + hc) * 52 / 12; workcosts += monthly(r, 'workCosts') or 0
        if t == 'other':
            o = monthly(r, 'otherIncome') or 0
            gross += o; take += o
            line('- %s (other): %s a month, counted in gross and take-home.' % (r['nickname'], dollars(o)))
        if t == 'benefits':
            rate = val(r['f']['matchRate']); upto = val(r['f']['matchUpTo'])
            match_formula = (rate, upto)
    if match_formula:
        rate, upto = match_formula
        deferral_pct = pretax_pay = None
        # deferral share of pay on the W-2 row
        w2 = rows('income', 'w2')[0]
        gp = val(w2['f']['grossPay']); pr = val(w2['f']['pretaxRetirement']) or 0
        share = pr / gp
        base_gross = w2_gross_monthly
        match_actual = R(base_gross * rate * min(share, upto))
        match_max = R(base_gross * rate * upto)
        line('- Match: employee defers %s of %s = %s of pay; match %s of pay up to %s: actual = %s x %s x %s = %s a month; max = %s x %s x %s = %s a month.' % (dollars(pr), dollars(gp), pct(share), pct(rate), pct(upto), dollars(base_gross), pct(rate), pct(min(share, upto)), dollars(match_actual), dollars(base_gross), pct(rate), pct(upto), dollars(match_max)))
    hours_m = R(hours * 10) / 10
    put('grossMonthly', gross, '- Gross monthly (bonus and equity included) = %s.' % dollars(gross))
    put('takeHomeMonthly', take, '- Take-home monthly = %s (bonus take-home is not typed, so it is not counted).' % dollars(take))
    put('pretaxContribMonthly', pretax, '- Pre-tax retirement a month = %s; Roth %s; HSA %s; other pre-tax %s.' % (dollars(pretax), dollars(roth), dollars(hsa), dollars(other)))
    E['rothContribMonthly'] = roth; E['hsaPayrollMonthly'] = hsa; E['pretaxOtherMonthly'] = other
    put('matchMonthly', match_actual, '- Match a month = %s; max available %s.' % (dollars(match_actual), dollars(match_max)))
    E['matchMaxMonthly'] = match_max
    put('workHoursMonthly', hours_m, '- Work hours a month = (paid + commute) x 52 / 12 = %.1f.' % hours_m)
    put('workCostsMonthly', workcosts, '- Costs of working a month = %s.' % dollars(workcosts))
    E['paystubGrossMonthly'] = paystub

    # ---- Spending
    line(); line('## Spending')
    cats = {}; fat = 0; fixed = 0; mistakes = 0; total = 0; rough_total = 0; savings_landing = 0; card_spend = {}
    lo_total = 0; hi_total = 0
    def spread_of(f):
        if f['source'] == 'estimated': return ASM['roughSpread']['estimated']
        if f['source'] == 'lookup-verify': return ASM['roughSpread']['lookup-verify']
        return ASM['roughSpread'].get(f['state'], 0)
    def row_range(r, fid, a):
        f = r['f'][fid]; v = f['v']
        if isinstance(v, dict) and 'low' in v:
            cad = f.get('cad', 'month'); n = PAYCHECKS[val(r['f'].get('payFrequency')) or 'biweekly']
            conv = lambda x: {'month': x, 'year': R(x / 12), 'paycheck': R(x * n / 12), 'oneoff': 0}[cad]
            return conv(v['low']), conv(v['high'])
        sp = spread_of(f)
        return R(a * (1 - sp)), R(a * (1 + sp))
    for r in rows('spending', 'line'):
        a = monthly(r, 'amount')
        if a is None: continue
        cat = val(r['f']['category']); cats[cat] = cats.get(cat, 0) + a; total += a
        f = r['f']['amount']
        lo, hi = row_range(r, 'amount', a); lo_total += lo; hi_total += hi
        if f['state'] in ('rough', 'will-send') or f['source'] in ('estimated',): rough_total += a
        if val(r['f'].get('fatFloor')): fat += a
        if val(r['f'].get('needWant')) == 'need': fixed += a
        if val(r['f'].get('mistake')) == 'mistake': mistakes += a
        card = val(r['f'].get('primaryCard'))
        if card: card_spend.setdefault(card, {}).__setitem__(r['nickname'], (cat, a))
        line('- %s: %s a month (%s%s).' % (r['nickname'], dollars(a), cat, ', rough' if f['state'] == 'rough' else ''))
    for r in rows('spending', 'other'):
        a = monthly(r, 'otherSpending')
        if a is None: continue
        cats['other'] = cats.get('other', 0) + a; total += a
        lo, hi = row_range(r, 'otherSpending', a); lo_total += lo; hi_total += hi
        line('- %s: %s a month (other).' % (r['nickname'], dollars(a)))
    for r in rows('spending', 'savings'):
        savings_landing += monthly(r, 'savingsLanding') or 0
    premiums = 0; prem_lo = 0; prem_hi = 0
    for r in rows('safety', 'insurance'):
        f = r['f'].get('premium')
        if f and val(f) is not None and f.get('cad') != 'paycheck':
            pm = monthly(r, 'premium'); premiums += pm; plo, phi = row_range(r, 'premium', pm); prem_lo += plo; prem_hi += phi; line('- Insurance paid from the bank: %s %s a month (added to spending; paycheck premiums are already out of take-home).' % (r['nickname'], dollars(monthly(r, 'premium'))))
    spending = total + premiums
    put('baselineMonthly', total, '- Spending lines total = %s a month.' % dollars(total))
    put('premiumsMonthly', premiums, '- Bank-paid premiums = %s a month.' % dollars(premiums))
    put('spending', spending, '- Monthly spending (metric 3) = %s + %s = %s.' % (dollars(total), dollars(premiums), dollars(spending)))
    E['spendingRange'] = [lo_total + prem_lo, hi_total + prem_hi]
    line('- Range: each rough line at its spread (rough 20%%, estimated 25%%, will-send 30%%, a typed range as typed), summed: %s to %s.' % (dollars(lo_total + prem_lo), dollars(hi_total + prem_hi)))
    E['byCategory'] = cats
    put('fatFloor', fat, '- FAT floor (lines flagged) = %s.' % dollars(fat))
    put('fixedMonthly', fixed + premiums, '- Fixed costs (needs %s + bank premiums %s) = %s.' % (dollars(fixed), dollars(premiums), dollars(fixed + premiums)))
    put('mistakesAnnual', mistakes * 12, '- Mistakes = %s a month = %s a year.' % (dollars(mistakes), dollars(mistakes * 12)))
    put('savingsLandingMonthly', savings_landing, '- Savings landing in accounts = %s a month.' % dollars(savings_landing))

    # ---- Debt
    line(); line('## Debt and credit')
    debts = []
    for r in rows('debt'):
        if r['type'] in ('summary', 'score'): continue
        bal = val(r['f'].get('balance'))
        if bal is None: continue
        if r['type'] == 'card':
            rate = val(r['f']['apr']); promo = val(r['f'].get('promoApr')); pend = val(r['f'].get('promoEnd')); mn = monthly(r, 'minimum') or 0
            autopay = val(r['f'].get('autopay'))
            limit = val(r['f'].get('creditLimit'))
            debts.append(dict(id=r['id'], name=r['nickname'], kind='card', bal=bal, rate=rate, promo=promo, promoEnd=pend, min=mn, full=(autopay == 'full'), limit=limit, stress=r.get('stress'), lib=r.get('lib'), fee=val(r['f'].get('annualFee')) or 0, credits=val(r['f'].get('creditsUsed'))))
        else:
            rate = val(r['f'].get('rate')) or 0; mn = monthly(r, 'minimum') if 'minimum' in r['f'] else (monthly(r, 'principalInterest') if r['type'] == 'mortgage' else monthly(r, 'payment'))
            debts.append(dict(id=r['id'], name=r['nickname'], kind=r['type'], bal=bal, rate=rate, promo=None, promoEnd=None, min=mn or 0, full=False, limit=None, stress=r.get('stress')))
    total_debt = sum(d['bal'] for d in debts); service = sum(d['min'] for d in debts)
    for d in debts: line('- %s: balance %s, rate %s%s, minimum %s a month%s.' % (d['name'], dollars(d['bal']), pct(d['rate']), (', promo %s until %s' % (pct(d['promo']), d['promoEnd'])) if d['promo'] is not None and d['promoEnd'] else '', dollars(d['min']), ', autopay full (no interest)' if d['full'] else ''))
    put('totalDebt', total_debt, '- Total debt = %s.' % dollars(total_debt))
    put('debtServiceMonthly', service, '- Monthly debt service = %s.' % dollars(service))
    # weighted APR: promo rate while it runs, standard otherwise
    this_month = TODAY[:7]
    def eff_rate(d, ym):
        if d['promo'] is not None and d['promoEnd'] and ym < d['promoEnd']: return d['promo']
        return d['rate']
    wsum = sum(d['bal'] * eff_rate(d, this_month) for d in debts)
    wapr = wsum / total_debt if total_debt else 0
    put('weightedApr', round(wapr, 6), '- Weighted APR = sum(balance x rate today) / total = %s / %s = %s.' % (dollars(R(wsum)), dollars(total_debt), pct(wapr)))
    interest = 0; parts = []
    for d in debts:
        if d['full']: parts.append('%s: paid in full, 0' % d['name']); continue
        pm = months_between(this_month, d['promoEnd']) if (d['promo'] is not None and d['promoEnd']) else 0
        pm = max(0, min(12, pm))
        i = R(d['bal'] * (d['promo'] if pm else 0) * pm / 12 + d['bal'] * d['rate'] * (12 - pm) / 12)
        interest += i
        parts.append('%s: %s x %s x %d/12 + %s x %s x %d/12 = %s' % (d['name'], dollars(d['bal']), pct(d['promo'] or 0), pm, dollars(d['bal']), pct(d['rate']), 12 - pm, dollars(i)))
    put('annualInterest', interest, '- Interest over the next 12 months on today\'s balances: ' + '; '.join(parts) + '. Total %s.' % dollars(interest))
    cards = [d for d in debts if d['kind'] == 'card' and d['limit']]
    util_total = sum(d['bal'] for d in cards) / sum(d['limit'] for d in cards) if cards else None
    E['utilizationTotal'] = round(util_total, 6) if util_total is not None else None
    E['utilizationPerCard'] = {d['id']: round(d['bal'] / d['limit'], 6) for d in cards}
    line('- Utilization: total %s / %s = %s; per card ' % (dollars(sum(d['bal'] for d in cards)), dollars(sum(d['limit'] for d in cards)), pct(util_total)) + ', '.join('%s %s' % (d['name'], pct(d['bal'] / d['limit'])) for d in cards) + '.')
    cliffs = []
    for d in debts:
        if d['promo'] is not None and d['promoEnd'] and d['promoEnd'] > this_month:
            m = months_between(this_month, d['promoEnd']); cost = R(d['bal'] * d['rate'])
            cliffs.append(dict(rowId=d['id'], monthsLeft=m, costAfterAnnual=cost))
            line('- Promo cliff: %s goes from %s to %s in %d months (%s); %s x %s = %s a year after.' % (d['name'], pct(d['promo']), pct(d['rate']), m, d['promoEnd'], dollars(d['bal']), pct(d['rate']), dollars(cost)))
    E['promoCliffs'] = cliffs
    # payoff simulation
    def simulate(order_ids):
        bal = {d['id']: d['bal'] for d in debts}; paid = {}; ym = this_month; total_int = 0; freed = 0; rolled = 0; log = []
        for step in range(1, 601):
            ym = add_months(ym, 1)
            extra = freed  # minimums of paid-off debts roll to the first open debt in order
            for did in order_ids:
                d = next(x for x in debts if x['id'] == did)
                if did in paid: continue
                if d['full']:
                    pay = bal[did]; i = 0
                else:
                    i = R(bal[did] * eff_rate(d, ym) / 12); pay = d['min'] + extra; extra = 0
                total_int += i
                nb = bal[did] + i - pay
                if nb <= 0:
                    extra = -nb; paid[did] = ym; freed += d['min']; bal[did] = 0
                    log.append('%s: %s paid off (%s payments)' % (ym, d['name'], step))
                else: bal[did] = nb
            if len(paid) == len(debts): return dict(debtFree=ym, interest=total_int, months=step, log=log, paid=paid)
        return dict(debtFree=None, interest=total_int, months=None, log=log, paid=paid)
    aval = [d['id'] for d in sorted(debts, key=lambda d: -d['rate'])]
    snow = [d['id'] for d in sorted(debts, key=lambda d: d['bal'])]
    stress = [d['id'] for d in sorted(debts, key=lambda d: -(d['stress'] or 0))]
    sims = {k: simulate(o) for k, o in (('avalanche', aval), ('snowball', snow), ('stress', stress))}
    E['payoffOrders'] = {'avalanche': aval, 'snowball': snow, 'stress': stress}
    E['debtFreeDate'] = sims['avalanche']['debtFree']; E['payoffInterest'] = {k: v['interest'] for k, v in sims.items()}
    line('- Payoff simulation (monthly from %s; interest = balance x rate / 12, promo rate while it runs; a paid-off debt\'s minimum rolls to the next in order; a full-autopay card is paid in month 1):' % add_months(this_month, 1))
    for k, v in sims.items():
        line('  - %s order %s: debt-free %s after %s payments, total interest %s. %s' % (k, ' > '.join(next(d['name'] for d in debts if d['id'] == i) for i in E['payoffOrders'][k]), v['debtFree'], v['months'], dollars(v['interest']), '; '.join(v['log'])))
    E['freedCashByMonth'] = [{'month': m, 'cents': sum(d['min'] for d in debts if sims['avalanche']['paid'].get(d['id']) and sims['avalanche']['paid'][d['id']] <= m)} for m in sorted(set(sims['avalanche']['paid'].values()))]
    # wallet (every card, with or without a limit)
    import re as _re
    def earn_cat(cat, nick):
        n = (nick or '').lower()
        if cat == 'food': return 'dining' if _re.search(r'restaurant|dining|takeout|take-out|eating out', n) else 'groceries'
        if cat == 'transportation': return 'gas' if _re.search(r'gas|fuel', n) else 'travel'
        if cat == 'utilities': return 'streaming' if 'stream' in n else 'other'
        if cat == 'irregular': return 'travel' if _re.search(r'travel|flight|hotel|trip', n) else 'other'
        return 'other'
    wallet = []
    all_cards = [d for d in debts if d['kind'] == 'card']
    for d in all_cards:
        card = CARDS.get(d['lib']) if d.get('lib') else None
        spend = card_spend.get(d['name'], {})
        rewards = 0; parts = []
        for nick, (cat, amt) in spend.items():
            ecat = earn_cat(cat, nick)
            rate = card['earn'][ecat] if card else 0
            rw = R(amt * 12 * rate * card['pointValueCents'] / 100) if card else 0
            rewards += rw; parts.append('%s %s/mo at %sx %.2fc = %s' % (nick, dollars(amt), rate, card['pointValueCents'] if card else 0, dollars(rw)))
        credits_used = 0
        if card and d.get('credits') and isinstance(d['credits'], dict):
            for c in card['credits']:
                u = d['credits'].get(c['name'], 'no'); credits_used += c['annualValueCents'] if u == 'yes' else (R(c['annualValueCents'] / 2) if u == 'partly' else 0)
        net = credits_used + rewards - d['fee']
        baseline = R(sum(a for (_, a) in spend.values()) * 12 * ASM['noFeeBaselineRate'])
        unused = sum(c['annualValueCents'] for c in card['credits']) - credits_used if card else 0
        wallet.append(dict(rowId=d['id'], rewardsAnnual=rewards, creditsUsedAnnual=credits_used, feeAnnual=d['fee'], netAnnual=net, baselineAnnual=baseline, unusedCreditsAnnual=unused))
        line('- Card %s: rewards %s a year (%s); credits used %s; fee %s; net = %s + %s - %s = %s. A no-fee 2%% card on the same spend: %s; unused credits %s.' % (d['name'], dollars(rewards), '; '.join(parts) or 'no spend on it', dollars(credits_used), dollars(d['fee']), dollars(credits_used), dollars(rewards), dollars(d['fee']), dollars(net), dollars(baseline), dollars(unused)))
    E['wallet'] = wallet
    # rewards left: best library rate per category (capped) vs actual
    best = {}
    for c in CARDS.values():
        for cat, rate in c['earn'].items():
            v = min(rate, ASM['portalOnlyEarnCap']) * c['pointValueCents'] / 100
            best[cat] = max(best.get(cat, 0), v)
    left = 0
    for d in all_cards:
        card = CARDS.get(d['lib']) if d.get('lib') else None
        for nick, (cat, amt) in card_spend.get(d['name'], {}).items():
            ecat = earn_cat(cat, nick)
            actual = (card['earn'][ecat] * card['pointValueCents'] / 100) if card else 0
            left += R(amt * 12 * max(0, best[ecat] - actual))
    put('rewardsLeftAnnual', left, '- Rewards left on the table (best library rate per category, portal-only rates capped at 6x, minus actual) = %s a year. Best rates: %s.' % (dollars(left), ', '.join('%s %.1f%%' % (k, v * 100) for k, v in best.items())))
    E['creditScore'] = val(rows('debt', 'score')[0]['f']['score']) if rows('debt', 'score') else None

    # ---- Investments
    line(); line('## Investments and accounts')
    BUCKET = {'401k': 'pretax', '403b': 'pretax', '457b': 'pretax', 'tsp': 'pretax', 'tradIra': 'pretax', 'sep': 'pretax', 'solo401k': 'pretax', 'pension': 'pretax', 'roth401k': 'roth', 'rothIra': 'roth', 'hsa': 'hsa', '529': 'other', 'taxable': 'taxable', 'crypto': 'taxable', 'hysa': 'cash', 'checking': 'cash', 'cd': 'cash', 'ibonds': 'cash', 'realEstate': 'other', 'other': 'other'}
    LIQ = {'checking': 'liquid', 'hysa': 'liquid', 'cd': 'liquid', 'ibonds': 'liquid', 'taxable': 'liquid', 'crypto': 'liquid', 'rothIra': 'semi', 'hsa': 'semi', '529': 'semi', 'realEstate': 'locked', 'pension': 'locked'}
    INVESTED = {'401k', 'roth401k', '403b', '457b', 'tsp', 'tradIra', 'rothIra', 'sep', 'solo401k', 'hsa', '529', 'taxable', 'crypto'}
    buckets = {'pretax': 0, 'roth': 0, 'taxable': 0, 'hsa': 0, 'cash': 0, 'other': 0}; liq = {'liquid': 0, 'semi': 0, 'locked': 0}
    total_assets = 0; invested = 0; cash = 0; alloc = {'stocks': 0, 'bonds': 0, 'cash': 0, 'other': 0}; us = 0; contrib_employee_annual = 0
    accounts = {}
    for r in rows('invest', 'account'):
        t = val(r['f']['accountType']); b = val(r['f']['accountBalance'])
        if b is None: continue
        bucket = BUCKET[t]; tier = LIQ.get(t, 'locked')
        buckets[bucket] += b; liq[tier] += b; total_assets += b
        if t in INVESTED: invested += b
        if bucket == 'cash': cash += b
        for k, fid in (('stocks', 'allocStocks'), ('bonds', 'allocBonds'), ('cash', 'allocCash'), ('other', 'allocOther')):
            sh = val(r['f'].get(fid)) or 0; alloc[k] += R(b * sh)
        us += R(b * (val(r['f'].get('allocStocks')) or 0) * (val(r['f'].get('usShare')) or 0))
        ca = monthly(r, 'contribAmount') or 0; contrib_employee_annual += ca * 12
        accounts[r['nickname']] = dict(type=t, balance=b, er=None)
        line('- %s (%s): %s, bucket %s, tier %s, %s' % (r['nickname'], t, dollars(b), bucket, tier, 'market returns' if t in INVESTED else 'cash'))
    for r in rows('invest', 'holding'):
        acc = val(r['f'].get('accountRef')); er = val(r['f'].get('expenseRatio')); share = val(r['f'].get('pctOfAccount')) or 1
        if acc in accounts and er is not None: accounts[acc]['er'] = (accounts[acc]['er'] or 0) + er * share
    put('totalAssets', total_assets, '- Total assets = %s; invested (market returns) = %s; cash = %s.' % (dollars(total_assets), dollars(invested), dollars(cash)))
    E['investedAssets'] = invested; E['cashBalances'] = cash; E['balancesByBucket'] = buckets; E['balancesByLiquidity'] = liq
    line('- By bucket: ' + ', '.join('%s %s' % (k, dollars(v)) for k, v in buckets.items()) + '. By liquidity: ' + ', '.join('%s %s' % (k, dollars(v)) for k, v in liq.items()) + '.')
    E['allocation'] = {k: round(v / total_assets, 6) for k, v in alloc.items()}; E['allocationUsShare'] = round(us / alloc['stocks'], 6) if alloc['stocks'] else None
    line('- Allocation (dollar-weighted over all assets): ' + ', '.join('%s %s = %s' % (k, dollars(v), pct(v / total_assets)) for k, v in alloc.items()) + '; US share of stocks %s.' % (pct(us / alloc['stocks']) if alloc['stocks'] else 'n/a'))
    wer_num = sum(a['balance'] * a['er'] for a in accounts.values() if a['er'] is not None); wer_den = sum(a['balance'] for a in accounts.values() if a['er'] is not None)
    wer = wer_num / wer_den if wer_den else None
    E['weightedExpenseRatio'] = round(wer, 8) if wer is not None else None
    E['feeDragAnnual'] = R(wer_num) if wer is not None else None
    line('- Weighted expense ratio = sum(balance x ER) / sum(balance with holdings) = %s / %s = %s; fee drag %s a year.' % (dollars(R(wer_num)), dollars(wer_den), ('%.3f%%' % (wer * 100)) if wer is not None else 'n/a', dollars(R(wer_num))))
    employee_annual = (pretax + roth + hsa) * 12 + contrib_employee_annual; employer_annual = match_actual * 12
    E['annualContributions'] = {'employee': employee_annual, 'employer': employer_annual, 'total': employee_annual + employer_annual}
    line('- Annual contributions: employee (payroll %s x 12 + bank %s) = %s; employer %s; total %s.' % (dollars(pretax + roth + hsa), dollars(contrib_employee_annual), dollars(employee_annual), dollars(employer_annual), dollars(employee_annual + employer_annual)))
    room = []
    K401 = ('401k', 'roth401k', '403b', '457b', 'tsp', 'solo401k')
    acct_types = [val(r['f']['accountType']) for r in rows('invest', 'account')]
    k401 = (pretax + roth) * 12 + sum((monthly(r, 'contribAmount') or 0) * 12 for r in rows('invest', 'account') if val(r['f']['accountType']) in K401)
    if k401 > 0 or any(t in K401 for t in acct_types): room.append(dict(limitId='401k', limit=2450000, used=k401, left=2450000 - k401))
    ira_used = sum((monthly(r, 'contribAmount') or 0) * 12 for r in rows('invest', 'account') if val(r['f']['accountType']) in ('tradIra', 'rothIra'))
    if any(t in ('tradIra', 'rothIra') for t in acct_types): room.append(dict(limitId='ira', limit=750000, used=ira_used, left=750000 - ira_used))
    if 'hsa' in acct_types or hsa:
        hsa_used = hsa * 12 + sum((monthly(r, 'contribAmount') or 0) * 12 for r in rows('invest', 'account') if val(r['f']['accountType']) == 'hsa')
        room.append(dict(limitId='hsa-self', limit=440000, used=hsa_used, left=440000 - hsa_used))
    E['roomLeft'] = room
    line('- Room left: ' + '; '.join('%s limit %s, used %s, left %s' % (x['limitId'], dollars(x['limit']), dollars(x['used']), dollars(x['left'])) for x in room) + '.')
    mc = match_actual / match_max if match_max else None
    E['matchCapture'] = round(mc, 6) if mc is not None else None; E['matchDollarsLeftAnnual'] = (match_max - match_actual) * 12 if match_max else None
    line('- Match capture = %s / %s = %s; left on the table %s x 12 = %s a year.' % (dollars(match_actual), dollars(match_max), pct(mc) if mc is not None else 'n/a', dollars(match_max - match_actual), dollars((match_max - match_actual) * 12)))

    # ---- Safety net
    line(); line('## Safety net')
    rule_months = age / 5; target = R(spending * rule_months)
    E['ruleOf5Months'] = rule_months; put('ruleOf5Target', target, '- Rule of 5: %d / 5 = %.1f months x %s = %s.' % (age, rule_months, dollars(spending), dollars(target)))
    runway = {'full': round(cash / spending, 4), 'draftt': round(cash / (fixed + premiums), 4), 'fat': round(cash / fat, 4)}
    E['runway'] = runway
    line('- Runway: cash %s / full %s = %.2f months; / needs %s = %.2f; / FAT floor %s = %.2f.' % (dollars(cash), dollars(spending), runway['full'], dollars(fixed + premiums), runway['draftt'], dollars(fat), runway['fat']))
    gap = max(0, target - cash); put('gap', gap, '- Emergency gap = max(0, %s - %s) = %s; monthly to close = %s.' % (dollars(target), dollars(cash), dollars(gap), dollars(R(gap / 12))))
    E['monthlyToClose'] = R(gap / 12)
    excess = max(0, cash - target); drag = R(excess * (ASM['returnLikely'] - ASM['cashRealReturn']))
    put('cashDragAnnual', drag, '- Excess cash = %s - %s = %s; drag = %s x (5%% - 1%%) = %s a year.' % (dollars(cash), dollars(target), dollars(excess), dollars(excess), dollars(drag)))

    # ---- Engine metrics
    line(); line('## Metrics')
    surplus = take - spending - service; put('surplus', surplus, '- 4 Surplus = %s - %s - %s = %s.' % (dollars(take), dollars(spending), dollars(service), dollars(surplus)))
    sr = (take - spending) / take; E['savingsRateTakeHome'] = round(sr, 6); line('- 5 Savings rate (take-home) = (%s - %s) / %s = %s.' % (dollars(take), dollars(spending), dollars(take), pct(sr)))
    srg = (pretax + roth + hsa + match_actual + take - spending) / (gross + match_actual); E['savingsRateGross'] = round(srg, 6)
    line('- 6 Savings rate (gross) = (%s + %s + %s + %s + %s - %s) / (%s + %s) = %s.' % (dollars(pretax), dollars(roth), dollars(hsa), dollars(match_actual), dollars(take), dollars(spending), dollars(gross), dollars(match_actual), pct(srg)))
    leak = surplus - savings_landing; E['leakMonthly'] = leak; E['leakRate'] = round(leak / take, 6)
    line('- 7 Leak = %s - %s = %s a month = %s of take-home.' % (dollars(surplus), dollars(savings_landing), dollars(leak), pct(leak / take)))
    ret_contrib = pretax + roth + match_actual + R(contrib_employee_annual / 12)
    draftt = {'debt': round(service / take, 6), 'retirement': round(ret_contrib / gross, 6), 'accommodation': round((cats.get('accommodation', 0) + cats.get('utilities', 0)) / take, 6), 'food': round(cats.get('food', 0) / take, 6), 'transportation': round(cats.get('transportation', 0) / take, 6), 'therapy': round(cats.get('therapy', 0) / take, 6)}
    E['draftt'] = draftt
    line('- 8 DRAFTT: debt %s / %s = %s; retirement (%s + %s + %s + %s) / gross %s = %s; accommodation (%s + utilities %s) / take-home = %s; food %s; transportation %s; therapy %s.' % (dollars(service), dollars(take), pct(draftt['debt']), dollars(pretax), dollars(roth), dollars(match_actual), dollars(R(contrib_employee_annual / 12)), dollars(gross), pct(draftt['retirement']), dollars(cats.get('accommodation', 0)), dollars(cats.get('utilities', 0)), pct(draftt['accommodation']), pct(draftt['food']), pct(draftt['transportation']), pct(draftt['therapy'])))
    E['shelterRate'] = draftt['accommodation']; E['fixedRate'] = round((fixed + premiums) / take, 6)
    line('- 10 Shelter rate = %s. 11 Fixed-cost rate = %s / %s = %s.' % (pct(draftt['accommodation']), dollars(fixed + premiums), dollars(take), pct(E['fixedRate'])))
    rhw = R((take - workcosts) / hours_m); stated = R(gross * 12 / 2080) if hours_m else None
    E['realHourlyWage'] = rhw; E['statedHourlyWage'] = stated
    line('- 12 Real hourly wage = (%s - %s) / %.1f h = %s; stated gross hourly = %s x 12 / 2080 = %s (%s of stated).' % (dollars(take), dollars(workcosts), hours_m, dollars(rhw), dollars(gross), dollars(stated), pct(rhw / stated)))
    E['dti'] = round(service / gross, 6); E['debtToAssets'] = round(total_debt / total_assets, 6)
    line('- 15 DTI = %s / %s = %s. 16 Debt-to-assets = %s / %s = %s.' % (dollars(service), dollars(gross), pct(E['dti']), dollars(total_debt), dollars(total_assets), pct(E['debtToAssets'])))
    nw = total_assets - total_debt; put('netWorth', nw, '- 22 Net worth = %s - %s = %s.' % (dollars(total_assets), dollars(total_debt), dollars(nw)))
    E['liquidityRate'] = round(liq['liquid'] / total_assets, 6); E['bridgeYears'] = round((liq['liquid'] + liq['semi']) / (spending * 12), 4)
    line('- 24 Liquidity rate = %s / %s = %s. 25 Bridge years = (%s + %s) / %s = %.2f.' % (dollars(liq['liquid']), dollars(total_assets), pct(E['liquidityRate']), dollars(liq['liquid']), dollars(liq['semi']), dollars(spending * 12), E['bridgeYears']))
    E['taxAdvantagedShare'] = round((buckets['pretax'] + buckets['roth'] + buckets['hsa']) / total_assets, 6)
    line('- 30 Tax-advantaged share = (%s + %s + %s) / %s = %s.' % (dollars(buckets['pretax']), dollars(buckets['roth']), dollars(buckets['hsa']), dollars(total_assets), pct(E['taxAdvantagedShare'])))
    # taxes
    gross_annual = gross * 12; ded = TAX['standardDeduction'][status]
    self_annual = self_monthly * 12
    se_base = R(self_annual * TAX['fica']['selfEmploymentNetFactor']) if self_annual else 0
    se_tax = (R(min(se_base, TAX['fica']['socialSecurityWageBase']) * TAX['fica']['socialSecurityRate'] * 2) + R(se_base * TAX['fica']['medicareRate'] * 2)) if self_annual else 0
    se_half = R(se_tax * 0.5)
    taxable = max(0, gross_annual - se_half - (pretax + hsa + other) * 12 - ded)
    fed, marginal = federal(taxable, status)
    if self_annual: line('- Self-employment income %s a year: SE tax = both halves on 92.35%% = %s; half (%s) is deducted before the federal calculation.' % (dollars(self_annual), dollars(se_tax), dollars(se_half)))
    E['federalAnnual'] = fed; E['marginalRate'] = marginal; E['effectiveRate'] = round(fed / gross_annual, 6)
    line('- 38 Federal: taxable = %s - pre-tax (%s + %s + %s) x 12 - standard deduction %s = %s; tax by bracket = %s; effective %s / %s = %s; marginal %s.' % (dollars(gross_annual), dollars(pretax), dollars(hsa), dollars(other), dollars(ded), dollars(taxable), dollars(fed), dollars(fed), dollars(gross_annual), pct(fed / gross_annual), pct(marginal)))
    fica_wages = max(0, gross_annual - self_annual - (hsa + other) * 12)
    ss = R(min(fica_wages, TAX['fica']['socialSecurityWageBase']) * TAX['fica']['socialSecurityRate']); med = R(fica_wages * TAX['fica']['medicareRate'])
    E['ficaAnnual'] = ss + med + se_tax
    line('- 39 FICA: wages %s (gross less self-employment income, section 125 and HSA); Social Security 6.2%% = %s; Medicare 1.45%% = %s; plus SE tax %s; total %s.' % (dollars(fica_wages), dollars(ss), dollars(med), dollars(se_tax), dollars(ss + med + se_tax)))
    E['savedPer1000Pretax'] = R(100000 * marginal); line('- 40 Tax saved per $1,000 pre-tax = %s x $1,000 = %s.' % (pct(marginal), dollars(E['savedPer1000Pretax'])))
    implied = (paystub - take - (pretax + roth + hsa + other)) / paystub if paystub else None
    E['impliedRate'] = round(implied, 6) if implied is not None else None
    if implied is not None: line('- 37 Implied tax rate = (paystub gross %s - take-home %s - deductions %s) / %s = %s.' % (dollars(paystub), dollars(take), dollars(pretax + roth + hsa + other), dollars(paystub), pct(implied)))
    # FI
    annual_spend = spending * 12; wr = ASM['withdrawalRate']
    fi = R(annual_spend / wr); put('fiNumber', fi, '- 41 FI number = %s / %s = %s.' % (dollars(annual_spend), pct(wr), dollars(fi)))
    E['pctToFi'] = round(nw / fi, 6); line('- 42 %% to FI = %s / %s = %s.' % (dollars(nw), dollars(fi), pct(nw / fi)))
    ret_rows = rows('life', 'retirement'); ret_age = val(ret_rows[0]['f']['retirementAge']) if ret_rows else ASM['retirementAgeDefault']
    years = ret_age - age; growth = (1 + ASM['returnLikely']) ** years
    coast = R(fi / growth); E['coastFiNumber'] = coast; E['coastPct'] = round(nw / coast, 6); E['retirementAge'] = ret_age
    line('- 43 Coast FI = %s / 1.05^%d (%.4f) = %s; %s / %s = %s.' % (dollars(fi), years, growth, dollars(coast), dollars(nw), dollars(coast), pct(nw / coast)))
    lean = R(fat * 12 / wr); fatfi = R(annual_spend * ASM['fatFiMultiplier'] / wr); barista = R(max(0, annual_spend - ASM['baristaIncomeAnnualCents']) / wr)
    E['leanFi'] = lean; E['fatFi'] = fatfi; E['baristaFi'] = barista
    line('- 45 Lean FI = %s x 12 / 4%% = %s; Fat FI = %s x 1.5 / 4%% = %s; Barista FI = (%s - %s) / 4%% = %s.' % (dollars(fat), dollars(lean), dollars(annual_spend), dollars(fatfi), dollars(annual_spend), dollars(ASM['baristaIncomeAnnualCents']), dollars(barista)))
    fee_life = R(invested * (growth - (1 + ASM['returnLikely'] - (wer or 0)) ** years)) if wer is not None else None
    E['feeDragLifetime'] = fee_life
    if fee_life is not None: line('- 35 Fee drag lifetime = %s x (1.05^%d - (1.05 - %.5f)^%d) = %s.' % (dollars(invested), years, wer, years, dollars(fee_life)))

    # projection (yearly, real): invested grows at r, cash at cash return; contributions until retirement; debts via avalanche sim balances at year ends
    line(); line('## Projection (year by year, real dollars, likely return)')
    line('Rules: invested x (1 + r) + contributions (payroll + match + bank + the leak and freed debt payments go to cash); cash x (1 + 1%); debts follow the avalanche simulation; spending is baseline x go-go/slow-go/no-go after retirement; income stops at the later of retirement age and FI age; Social Security from 67 at the bend-point estimate; FI = first year net worth x withdrawal rate covers annual spending.')
    aime = gross; pia = 0; bp = LIM['socialSecurity']['bendPoints2026Cents']
    pia = 0.9 * min(aime, bp[0]) + 0.32 * max(0, min(aime, bp[1]) - bp[0]) + 0.15 * max(0, aime - bp[1]); ss_monthly = R(pia * ASM['socialSecurityScale'])
    E['socialSecurityMonthly'] = ss_monthly
    line('- Social Security estimate: AIME %s; PIA = 0.9 x %s + 0.32 x (%s - %s) + 0.15 x max(0, %s - %s) = %s a month at 67.' % (dollars(aime), dollars(bp[0]), dollars(min(aime, bp[1])), dollars(bp[0]), dollars(aime), dollars(bp[1]), dollars(ss_monthly)))
    def project(r):
        inv = invested; csh = cash; year = int(TODAY[:4]); a = age; nw_path = []; fi_age = None
        sim = sims['avalanche']
        debt_bal_by_year = {}
        # replay avalanche balances at each December
        bal = {d['id']: d['bal'] for d in debts}; paid = set(); ym = this_month; freed = 0
        for step in range(1, 12 * 70):
            ym = add_months(ym, 1); extra = freed
            for did in aval:
                d = next(x for x in debts if x['id'] == did)
                if did in paid: continue
                if d['full']: pay = bal[did]; i = 0
                else: i = R(bal[did] * eff_rate(d, ym) / 12); pay = d['min'] + extra; extra = 0
                nb = bal[did] + i - pay
                if nb <= 0: extra = -nb; paid.add(did); freed += d['min']; bal[did] = 0
                else: bal[did] = nb
            if ym.endswith('-12'): debt_bal_by_year[int(ym[:4])] = sum(bal.values())
        retire_age = ret_age
        for y in range(1, ASM['projectionEndAge'] - age + 1):
            year += 1; a += 1
            working = a <= retire_age and (fi_age is None or a <= fi_age)
            debt_now = debt_bal_by_year.get(year, 0)
            if working:
                inv = R(inv * (1 + r)) + employee_annual + employer_annual
                freed_cash = service * 12 if debt_now == 0 else 0
                csh = R(csh * (1 + ASM['cashRealReturn'])) + max(0, leak * 12) + freed_cash
            else:
                mult = ASM['gogo'] if a < ASM['slowgoAge'] else ASM['slowgo'] if a < ASM['nogoAge'] else ASM['nogo']
                need = R(annual_spend * mult) - (ss_monthly * 12 if a >= ASM['socialSecurityAge'] else 0)
                inv = R(inv * (1 + r)) - max(0, need)
                csh = R(csh * (1 + ASM['cashRealReturn']))
            nw_y = inv + csh - debt_now
            if fi_age is None and nw_y * wr >= annual_spend: fi_age = a
            nw_path.append(dict(year=year, age=a, invested=inv, cash=csh, debt=debt_now, netWorth=nw_y))
        return nw_path, fi_age
    paths = {}
    for k, r in (('likely', ASM['returnLikely']), ('best', ASM['returnBest']), ('worst', ASM['returnWorst'])):
        path, fi_age = project(r); paths[k] = dict(fiAge=fi_age, fiYear=next((p['year'] for p in path if p['age'] == fi_age), None), path=path)
    E['projection'] = {k: dict(fiAge=v['fiAge'], fiYear=v['fiYear'], first5=v['path'][:5], at95=v['path'][-1]) for k, v in paths.items()}
    for k, v in paths.items():
        line('- %s return: FI at age %s (%s); net worth at 95 %s.' % (k, v['fiAge'], v['fiYear'], dollars(v['path'][-1]['netWorth'])))
    line('- First five years (likely): ' + '; '.join('%d age %d invested %s cash %s debt %s net worth %s' % (p['year'], p['age'], dollars(p['invested']), dollars(p['cash']), dollars(p['debt']), dollars(p['netWorth'])) for p in paths['likely']['path'][:5]) + '.')

    # lenses expected to fire (information, never instructions)
    line(); line('## Lenses expected to fire (impact at or above $100 a year)')
    fires = []
    if match_max and match_actual < match_max and (match_max - match_actual) * 12 >= 10000: fires.append('match-left')
    if cliffs and any(c['costAfterAnnual'] >= 10000 for c in cliffs): fires.append('promo-cliff')
    if drag >= 10000: fires.append('cash-drag')
    if wer is not None and wer > ASM['feeDragEr'] and E['feeDragAnnual'] >= 10000: fires.append('fee-drag')
    if draftt['accommodation'] > ASM['shelterHeavyShare']: fires.append('shelter-heavy')
    if leak / take > ASM['hiddenLeakShare'] and leak * 12 >= 10000: fires.append('hidden-leak')
    if sims['stress']['interest'] - sims['avalanche']['interest'] >= 10000: fires.append('wrong-debt-first')
    if util_total is not None and (util_total > ASM['utilizationTotalMax'] or any(v > ASM['utilizationCardMax'] for v in E['utilizationPerCard'].values())): fires.append('utilization-drag')
    r401 = next((x for x in room if x['limitId'] == '401k'), None)
    if leak > 0 and r401 and r401['left'] > 0 and R(min(leak * 12, r401['left']) * marginal) >= 10000: fires.append('tax-room')
    if runway['fat'] < ASM['thinRunwayMonths']: fires.append('thin-runway')
    if E['liquidityRate'] < ASM['lockedLiquidityShare'] and ret_age < 59.5: fires.append('locked-up')
    if stated and hours_m and rhw < stated * ASM['realWageShare']: fires.append('real-hourly-wage')
    if interest >= 10000: fires.append('cost-in-hours')
    if paths['likely']['fiAge']: fires.append('one-more-point')
    if nw >= coast: fires.append('coast-check')
    if mistakes * 12 >= 10000: fires.append('mistake-tax')
    for w in wallet:
        if w['feeAnnual'] > 0 and w['feeAnnual'] - (w['creditsUsedAnnual'] + max(0, w['rewardsAnnual'] - w['baselineAnnual'])) >= 10000: fires.append('card-fee')
    if left >= 10000: fires.append('wrong-card')
    if excess > 0 and any(not d['full'] and d['rate'] > ASM['cashRealReturn'] + 0.02 for d in debts) and R(excess * (max(eff_rate(d, this_month) for d in debts if not d['full']) - 0.04)) >= 10000: fires.append('saving-at-a-loss')
    E['lensesFiring'] = sorted(set(fires))
    line('- ' + ', '.join(E['lensesFiring']) + ' (%d lenses).' % len(set(fires)))

    open(os.path.join(HERE, name + '-expected.md'), 'w').write('\n'.join(L) + '\n')
    json.dump(E, open(os.path.join(HERE, name + '-expected.json'), 'w'), indent=1)
    print(name, 'workpaper written:', len(L), 'lines;', len(E['lensesFiring']), 'lenses:', ', '.join(E['lensesFiring']))

if __name__ == '__main__':
    for n in sys.argv[1:] or ['jordan']: main(n)
