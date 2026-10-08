#!/usr/bin/env python3
"""Independent expected values for the Level 13 calculators (MR-067). Reads the
fixtures' facts and the data libraries, never the engine, and writes
calculators-expected.json for tests/engine/calculators.test.js.
Covers: the brief's household (gross 68,000, take-home 1,900 biweekly, Jersey
City) and Leah Brennan (Oakland, CA) for How much home; the Buy vs Rent workbook's default inputs
through the corrected model; Leah's used car against no car; Leah's cash flow
calendar day by day (low point, safe to spend, the first paycheck's map).
Run: python3 money-rooms-v3/tests/households/expected-calculators.py"""
import json, math, os, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, '..', '..', 'data')
H = json.load(open(os.path.join(DATA, 'housing-costs.json'))); A = json.load(open(os.path.join(DATA, 'auto-costs.json')))
LEAH = json.load(open(os.path.join(HERE, 'leah.json')))['record']; MX = json.load(open(os.path.join(HERE, 'leah-expected.json')))
def R(x): return int(math.floor(x + 0.5))
def pay(principal, rate, months):
    r = rate / 12
    return R(principal / months) if r == 0 else R(principal * r / (1 - (1 + r) ** -months))
E = {}

# ---- how much home: the price is linear in the budget above the flat parts ----
def pmi_rate(ltv, credit):
    if ltv <= 0.80: return 0
    for b in H['pmi']['bands']:
        if ltv <= b['maxLtv'] + 1e-9: return b['rates'][credit]
    return H['pmi']['bands'][-1]['rates'][credit]
def cost(price, i):
    down = R(price * i['downPct']); loan = price - down; ltv = 1 - i['downPct']
    pi = pay(loan, i['rate'], i['termYears'] * 12); tax = R(price * i['taxRate'] / 12); ins = R(i['insuranceAnnual'] / 12)
    mi = R(loan * pmi_rate(ltv, i['credit']) / 12); maint = R(price * i['maintenanceShare'] / 12)
    return dict(down=down, loan=loan, pi=pi, tax=tax, ins=ins, mi=mi, maint=maint, lender=pi + tax + ins + mi, total=pi + tax + ins + mi + maint)
def price_for(budget, i, which):
    probe = cost(10000000, i); flat = probe['ins']
    per = ((probe['lender'] if which == 'lender' else probe['total']) - flat) / 10000000
    return max(0, R((budget - flat) / per / 100000) * 100000)
def home(i):
    front = R((i['grossMonthly']) * 0.28); back = R(i['grossMonthly'] * 0.36) - i['debtMinimumsMonthly']
    lender_budget = min(front, back); comfortable_budget = R(i['takeHomeMonthly'] * 0.35)
    lp = price_for(lender_budget, i, 'lender'); cp = price_for(comfortable_budget, i, 'total')
    return dict(lenderPrice=lp, lenderBudget=lender_budget, binding='front' if front <= back else 'back', comfortablePrice=cp, comfortableBudget=comfortable_budget, comfortableMonthly=cost(cp, i)['total'], lenderMonthly=cost(lp, i)['lender'])
nj = dict(state='NJ', credit='760+', rate=0.065, termYears=30, downPct=0.10, taxRate=H['countyOverrides']['Hudson County, NJ'], insuranceAnnual=H['insuranceAnnualByState']['NJ'], maintenanceShare=0.01)
ca = dict(state='CA', city='Oakland', credit='760+', rate=0.065, termYears=30, downPct=0.10, taxRate=H['countyOverrides']['Alameda County, CA'], insuranceAnnual=H['insuranceAnnualByState']['CA'], maintenanceShare=0.01)
brief = dict(nj, grossMonthly=R(6800000 / 12), takeHomeMonthly=R(190000 * 26 / 12), debtMinimumsMonthly=0)
E['brief'] = home(brief); E['brief']['inputs'] = brief
leah_in = dict(ca, grossMonthly=MX['grossMonthly'], takeHomeMonthly=MX['takeHomeMonthly'], debtMinimumsMonthly=MX['debtServiceMonthly'])
E['leahHome'] = home(leah_in); E['leahHome']['inputs'] = leah_in
# the ladder at the comfortable answer: price by down payment, cash to close
def cash_to_close(price, i):
    c = cost(price, i); cs = H['closingCostShareByState'][i['state']]; share = (cs['low'] + cs['high']) / 2
    closing = R(price * share); prepaid = c['tax'] * H['prepaids']['escrowMonthsTaxes'] + c['ins'] * 12 + R(c['loan'] * i['rate'] / 365 * H['prepaids']['prepaidInterestDays'])
    escrow = c['tax'] * 2 + c['ins'] * H['prepaids']['escrowMonthsInsurance']; moving = H['oneOffs']['movingCents']; repairs = R(price * H['oneOffs']['firstYearRepairsShare'])
    # the buyer side of transfer taxes: the state rate, plus the city rate where the city has one (Oakland does, Jersey City does not)
    st = H['transferTaxes']['byState'][i['state']]; ct = H['transferTaxes']['cities'].get(i.get('city', '').lower())
    transfer = R(price * st.get('buyerRate', 0)) + (R(price * ct.get('buyerRate', 0)) if ct and (not ct.get('buyerAbove') or price >= ct['buyerAbove']) else 0)
    return c['down'] + closing + transfer + prepaid + escrow + moving + repairs
E['leahLadder'] = []
for d in [0.03, 0.035, 0.05, 0.10, 0.20]:
    i2 = dict(leah_in, downPct=d); p = min(price_for(E['leahHome']['lenderBudget'], i2, 'lender'), price_for(E['leahHome']['comfortableBudget'], i2, 'total'))
    E['leahLadder'].append(dict(downPct=d, price=p, cashToClose=cash_to_close(p, i2)))

# ---- the workbook's defaults through the corrected model ----
def rent_vs_buy(i, q):
    price = i['price']; down = R(price * i['downPct']); loan = price - down; months = i['termYears'] * 12; payment = pay(loan, i['rate'], months); r = i['rate'] / 12
    bal = loan; value = price; years = []; buyer_port = buyer_basis = 0; cum_interest = 0
    upfront = down + R(price * i['closingShare']); deposit = R(q['rent'] * q['depositMonths']); renter_port = renter_basis = upfront - deposit
    sr = q['stockReturn'] / 12; break_even = None
    for y in range(1, q['years'] + 1):
        rent = R(q['rent'] * (1 + q['rentGrowth']) ** (y - 1)); rins = R(q['rentersIns'] * (1 + i['inflation']) ** (y - 1))
        y_total = 0; y_int = 0
        for m in range(1, 13):
            mm = (y - 1) * 12 + m
            value = R(price * (1 + i['appreciation']) ** ((mm - 1) / 12))
            interest = R(bal * r); principal = min(payment - interest, bal)
            if mm == months: principal = bal  # the last payment clears the loan, as the engine's schedule does
            bal -= principal; cum_interest += interest
            tax = R(value * i['taxRate'] / 12); ins = R(i['insuranceAnnual'] * (1 + i['inflation']) ** (y - 1) / 12); maint = R(value * i['maintenanceShare'] / 12)
            total = interest + principal + tax + ins + maint; y_total += total; y_int += interest
            renter_port = R(renter_port * (1 + sr)); buyer_port = R(buyer_port * (1 + sr))
            diff = total - (rent + rins)
            if diff > 0: renter_port += diff; renter_basis += diff
            elif diff < 0: buyer_port += -diff; buyer_basis += -diff
        buyer_nw = R(value * (1 - q['sellingShare'])) - bal + buyer_port - R(max(0, buyer_port - buyer_basis) * q['cg'])
        renter_nw = renter_port - R(max(0, renter_port - renter_basis) * q['cg']) + deposit
        years.append(dict(year=y, buyerNetWorth=buyer_nw, renterNetWorth=renter_nw, annualBuyerCost=y_total, interest=y_int, cumInterest=cum_interest, loanBalance=bal, homeValue=value))
        if break_even is None and buyer_nw >= renter_nw: break_even = y
        elif break_even is not None and buyer_nw < renter_nw and y - break_even < 2: break_even = None
    return dict(payment=payment, upfront=upfront, deposit=deposit, breakEvenYear=break_even, years=years)
wb_i = dict(price=50000000, downPct=0.2, rate=0.07, termYears=30, taxRate=0.012, insuranceAnnual=180000, maintenanceShare=0.01, appreciation=0.035, inflation=0.03, closingShare=0.03)
wb_q = dict(rent=250000, rentGrowth=0.03, rentersIns=2000, depositMonths=2, stockReturn=0.08, cg=0.15, sellingShare=0.06, years=30)
W = rent_vs_buy(wb_i, wb_q)
E['workbook'] = dict(inputs=wb_i, q=wb_q, payment=W['payment'], upfront=W['upfront'], deposit=W['deposit'], breakEvenYear=W['breakEvenYear'], year1=W['years'][0], year10=W['years'][9], year30=W['years'][29],
    workbookSaid=dict(monthlyPI=266121, note='The workbook counted taxes, insurance, maintenance and PMI inside cumulative interest, never stopped PMI, kept insurance flat, and multiplied the buyer FI savings by 0.8; this file holds the corrected arithmetic'))

# ---- Leah's car: a used car against no car ----
def car_used():
    price = R(A['newPriceCents'] * A['usedDefaults']['priceShareOfNew'] / 10000) * 10000; age = A['usedDefaults']['ageYears']; keep = 5; months = keep * 12; miles = A['milesPerYearDefault']
    st = A['salesTaxByState']['CA']; tax = R(price * st['rate']); doc = A['docFeeCapByState']['CA']['typicalCents']; reg = A['titleAndRegistrationByState']['CA']
    down = R(price * 0.1); financed = price + tax + doc + reg['titleCents'] - down; payment = pay(financed, A['loan']['usedRate'], 48)
    bal = financed; interest = 0
    for m in range(48):
        i = R(bal * A['loan']['usedRate'] / 12); interest += i; p = min(payment - i, bal); bal -= p
    curve = A['depreciation']['newByYear']; floor = R(price * A['depreciation']['floorShareOfPrice']); v = price; values = [price]
    for y in range(keep):
        v = max(floor, R(v * (1 - min(0.6, curve[min(len(curve) - 1, age + y)])))); values.append(v)
    ins = A['insuranceAnnualByState']['CA']; fuel = R(miles / A['fuel']['defaultMpg'] * A['fuel']['gasPricePerGallonCents'])
    mt = A['maintenanceAnnualByAge']; maint = R(sum(mt[min(len(mt) - 1, age + y)] for y in range(keep)) / keep); tires = R(miles / A['tires']['everyMiles'] * A['tires']['setCents'])
    regr = reg['registrationAnnualCents'] + reg['inspectionAnnualCents']; parking = A['parkingMonthlyByTier']['HCOL'] * 12; tolls = A['tollsMonthlyByTier']['HCOL'] * 12  # Oakland is in the San Francisco metro, HCOL
    running = ins + fuel + maint + tires + regr + parking + tolls
    upfront = down + tax + doc + reg['titleCents'] + reg['registrationAnnualCents']
    total = upfront + payment * 48 + running * keep - values[keep]
    return dict(price=price, financed=financed, payment=payment, interest=interest, upfront=upfront, runningMonthly=R(running / 12), endValue=values[keep], totalCost=total, costPerMonth=R(total / months), costPerMile=R(total / (miles * keep)))
E['leahUsedCar'] = car_used()
nc = A['noCar']; E['leahNoCar'] = dict(costPerMonth=nc['transitPassByMetro']['oakland'] + nc['rideshareMonthlyCents'] + R(nc['rentalDaysPerYear'] * nc['rentalDayCents'] / 12) + nc['carShareMonthlyCents'])

# ---- Leah's calendar, day by day for 60 days from 2026-10-05 ----
def ymd(d): return d.strftime('%Y-%m-%d')
def dim(y, m): return (dt.date(y + (m // 12), m % 12 + 1, 1) - dt.timedelta(days=1)).day
START = dt.date(2026, 10, 5); DAYS = 60
rows = {r['id']: r for p in LEAH['planets'].values() for r in p['rows']}; cal = LEAH['calendar']
def monthly(rid, fid):
    f = rows[rid]['f'][fid]; v = f['v']; v = R((v['low'] + v['high']) / 2) if isinstance(v, dict) else v; cad = f.get('cad', 'month')
    return {'month': v, 'year': R(v / 12), 'paycheck': R(v * 26 / 12)}[cad]
checking = rows['m-chk']['f']['accountBalance']['v']; savings = rows['m-hysa']['f']['accountBalance']['v']
take_biweekly = rows['m-w2']['f']['takeHome']['v']; side = monthly('m-side', 'grossPay'); other = monthly('m-oth', 'otherIncome')
dated_cash = {'m-ther': (3, monthly('m-ther', 'amount')), 'm-rentins': (1, monthly('m-rentins', 'premium'))}
dated_csp = {'m-util': (15, monthly('m-util', 'amount')), 'm-phone': (20, monthly('m-phone', 'amount')), 'm-stream': (7, monthly('m-stream', 'amount')), 'm-climb': (1, monthly('m-climb', 'amount'))}
rent = monthly('m-rent', 'amount')  # on the Bilt card, day 1
spread_cash = [monthly('m-park', 'amount'), monthly('m-cat', 'otherSpending')]
spread_csp = [monthly('m-groc', 'amount'), monthly('m-rest', 'amount'), monthly('m-bart', 'amount'), monthly('m-cloth', 'amount'), monthly('m-gifts', 'amount')]
roth = monthly('m-save1', 'savingsLanding'); save = monthly('m-save2', 'savingsLanding'); loan_pay = monthly('m-loan', 'minimum'); loan_bal = rows['m-loan']['f']['balance']['v']; loan_rate = rows['m-loan']['f']['rate']['v']
csp_bal = rows['m-csp']['f']['balance']['v']; bilt_bal = 0
csp = dict(stmt=None, due=None, bal=csp_bal); bilt = dict(stmt=None, due=None, bal=bilt_bal)
paydays = set(); d = dt.date(2026, 10, 9)
while d <= START + dt.timedelta(days=DAYS): paydays.add(d); d += dt.timedelta(days=14)
pl_dates = {dt.date(2026, 10, 12), dt.date(2026, 10, 26), dt.date(2026, 11, 9)}  # 180 left of 240, 60 each, every two weeks
days = []; low = None
for i in range(DAYS):
    day = START + dt.timedelta(days=i); dom = day.day; n = dim(day.year, day.month); events = []
    if day in paydays: checking += take_biweekly; events.append(('income', take_biweekly))
    if dom == 1: checking += side + other; events += [('income', side), ('income', other)]
    for rid, (dd, c) in dated_cash.items():
        if dom == min(dd, n): checking -= c; events.append(('bill', -c))
    for rid, (dd, c) in dated_csp.items():
        if dom == min(dd, n): csp['bal'] += c
    if dom == 1: bilt['bal'] += rent
    if day == dt.date(2026, 10, 28): checking += 30000; events.append(('maybe', 30000))  # tutoring, 60% likely, counted in likely mode
    if day in pl_dates: checking -= 6000; events.append(('paylater', -6000))
    if dom == 10: checking -= roth; checking -= save; savings += save; events += [('transfer', -roth), ('transfer', -save)]
    for c in spread_cash: checking -= R(c / n); events.append(('everyday', -R(c / n)))
    for c in spread_csp: csp['bal'] += R(c / n)
    # statements (no interest: both cards are paid in full by autopay) and due dates
    if dom == 18: csp['stmt'] = max(0, csp['bal']); csp['due'] = dt.date(day.year + (day.month == 12), day.month % 12 + 1, 13)
    if dom == 25: bilt['stmt'] = max(0, bilt['bal']); bilt['due'] = dt.date(day.year + (day.month == 12), day.month % 12 + 1, 20)
    if csp['due'] == day: p = min(csp['stmt'], csp['bal']); checking -= p; csp['bal'] -= p; csp['due'] = None; events.append(('card-payment', -p))
    if bilt['due'] == day: p = max(0, bilt['bal']); checking -= p; bilt['bal'] -= p; bilt['due'] = None; events.append(('card-payment', -p))
    if dom == 1: li = R(loan_bal * loan_rate / 12); loan_bal += li; p = min(loan_pay, loan_bal); checking -= p; loan_bal -= p; events.append(('loan-payment', -p))
    days.append(dict(date=ymd(day), checking=checking, events=events))
    if low is None or checking < low['cents']: low = dict(date=ymd(day), cents=checking, index=i)
next_pay = min(p for p in paydays if p > START)
committed = sum(-c for dday in days if START < dt.date.fromisoformat(dday['date']) < next_pay for k, c in dday['events'] if c < 0)
first_pay_idx = next(i for i, dd in enumerate(days) if dt.date.fromisoformat(dd['date']) in paydays); second_pay = next_pay + dt.timedelta(days=14)
bills_first = sum(-c for dd in days[first_pay_idx:] if dt.date.fromisoformat(dd['date']) < second_pay for k, c in dd['events'] if c < 0)
E['leahCalendar'] = dict(start=ymd(START), days=DAYS, low=low, safeToSpendToday=days[0]['checking'] - committed, committed=committed, nextIncome=ymd(next_pay), firstPaycheck=dict(date=ymd(next_pay), cents=take_biweekly, left=take_biweekly - bills_first), endChecking=days[-1]['checking'], interest=0, shortfalls=0, floor=0, note='Both cards are paid in full by autopay, so no interest; the cushion sits in savings, so the floor on checking is zero')
json.dump(E, open(os.path.join(HERE, 'calculators-expected.json'), 'w'), indent=1)
print('brief', E['brief']['lenderPrice'], E['brief']['comfortablePrice'], E['brief']['comfortableMonthly'])
print('leah home', E['leahHome']['lenderPrice'], E['leahHome']['comfortablePrice'])
print('workbook', W['payment'], W['breakEvenYear'], E['workbook']['year30']['buyerNetWorth'], E['workbook']['year30']['renterNetWorth'])
print('car', E['leahUsedCar']['costPerMonth'], E['leahNoCar']['costPerMonth'])
print('calendar', E['leahCalendar']['low'], E['leahCalendar']['safeToSpendToday'], E['leahCalendar']['firstPaycheck'])
