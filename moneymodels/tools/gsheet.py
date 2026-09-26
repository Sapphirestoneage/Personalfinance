#!/usr/bin/env python3
"""Build the one-tab CSV edition of the workbook (inputs, dashboard formulas, plays) for import into Google Sheets: python3 moneymodels/tools/gsheet.py -> moneymodels/Money-Models-Sheet.csv. Google Drive converts it to a Sheet with the formulas live."""
import json, re, csv, io, os
APP=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(n): return json.load(open(os.path.join(APP,'data',n+'.json')))
LV,RC,PL,DEMO=load('levels'),load('recipes'),load('plays'),load('demo')
planet={p['id']:p['label'] for p in LV['planets']}
rows=[]
rows.append(['Money Models: the numbers and the dashboard (Google Sheets edition)'])
rows.append(['Type in column D. Blank means not known yet; a typed 0 is a real zero. Money in dollars, rates as fractions (0.25 = 25%). Every figure below is a live formula and reads "not yet" until its inputs are in. Lessons, checklists and charts are in the Excel workbook and the app.'])
rows.append(['Use the example numbers? (Yes or No)','Yes'])
rows.append([])
rows.append(['Planet','Level','What to type','Your answer','Example','In use','Help'])
ref={}
r=6
for lv in LV['levels']:
    if lv['kind'] not in ('facts','choice'): continue
    for f in lv['fields']:
        ex=DEMO['facts'].get(f['key'])
        if f['kind']=='cents': ex=ex/100
        if f['kind']=='percent': ex=ex/100
        if f['kind']=='choice':
            ex=next(o['label'] for o in f['options'] if o['id']==ex); help_='Pick one: '+' / '.join(o['label'] for o in f['options'])
        else:
            h=f.get('help','')
            if f['kind']=='percent':
                for a,b in [(', as a percent.','.'),('as a percent','as a fraction'),('100 if everyone did','1 if everyone did'),('100 if paid in full','1 if paid in full'),('As a percent. 50 is half.','0.5 is half.'),('10 is a common first test','0.1 is a common first test')]: h=h.replace(a,b)
            help_={'cents':'Dollars. ','percent':'A fraction, e.g. 0.25 for 25%. ','days':'Days. ','count':'','text':''}[f['kind']]+h
        if isinstance(ex,float) and ex==int(ex): ex=int(ex)
        rows.append([planet[lv['planet']],lv['level'],f['label'],'',ex,f'=IF($B$3="Yes",E{r},IF(D{r}="","",D{r}))',help_])
        ref[f['key']]=f'$F${r}'
        r+=1
rows.append([]); r+=1
rows.append(['The figures','Value','Verdict','What it says']); r+=1
K={}
def sub(expr):
    parts=expr.split('"')
    for i in range(0,len(parts),2):
        parts[i]=re.sub(r'\b([A-Za-z][A-Za-z0-9]*)\b', lambda m: ref.get(m.group(1)) or K.get(m.group(1)) or m.group(1), parts[i])
    return '"'.join(parts)
def needs_ok(needs): return 'AND('+','.join((f'ISNUMBER({K[n]})' if n in K else f'{ref[n]}<>""') for n in needs)+')'
FIG=[
 ('Foundations: the business today',None,None,None,None),
 ('gpPerSale','Gross profit per sale, today','price-deliveryCost',['price','deliveryCost'],None),
 ('grossMargin','Gross margin, today','IF(price=0,"no margin",(price-deliveryCost)/price)',['price','deliveryCost'],'IF({v}>=0.5,"good",IF({v}>=0.3,"watch","low"))'),
 ('cac','Cost of a customer (CAC)','IF(newCustomers=0,"no customers",adSpend/newCustomers)',['adSpend','newCustomers'],None),
 ('firstSaleGap','First sale minus the cost of the customer','gpPerSale-cac',['gpPerSale','cac'],'IF({v}>=0,"pays for itself","the rest of the model covers this")'),
 ('cpl','Cost per lead','IF(leads=0,"no leads",adSpend/leads)',['adSpend','leads'],None),
 ('baselineRatio','30-day ratio, today (cash collected / CAC)','IF(cac=0,"free customers",cash30Today/cac)',['cash30Today','cac'],'IF({v}>=2,"self-funding",IF({v}>=1,"break even","losing"))'),
 ('The sequence: each offer, per customer',None,None,None,None),
 ('attrGp','Attraction offer gross profit','attrPrice-attrCost',['attrPrice','attrCost'],None),
 ('upGp','Upsell gross profit (per taker)','upPrice-upCost',['upPrice','upCost'],None),
 ('upExpected','Upsell profit per customer','upGp*upTake',['upGp','upTake'],None),
 ('downGp','Downsell gross profit (per taker)','downPrice-downCost',['downPrice','downCost'],None),
 ('downExpected','Downsell profit per customer','downGp*(1-upTake)*downTake',['downGp','upTake','downTake'],None),
 ('contGp','Continuity gross profit per month','contPrice-contCost',['contPrice','contCost'],None),
 ('contMonth1','Continuity, first month, per customer','contGp*contJoin',['contGp','contJoin'],None),
 ('expectedMonths','Months a member stays, on average','IF(churn=0,"nobody leaves",1/churn)',['churn'],None),
 ('contLtgp','Continuity lifetime profit per customer','contGp*contJoin*expectedMonths',['contGp','contJoin','expectedMonths'],None),
 ('The headline: the 30-day rule and lifetime value',None,None,None,None),
 ('gp30','30-day cash per customer (planned, gross profit)','attrGp+upExpected+downExpected+contMonth1',['attrGp','upExpected','downExpected','contMonth1'],None),
 ('collected30','30-day cash collected per customer (before delivery)','attrPrice+upPrice*upTake+downPrice*(1-upTake)*downTake+contPrice*contJoin',['attrPrice','upPrice','upTake','downPrice','downTake','contPrice','contJoin'],None),
 ('ratio30','30-day ratio (planned)','IF(cac=0,"free customers",gp30/cac)',['gp30','cac'],'IF({v}>=2,"SELF-FUNDING: each customer pays for the next",IF({v}>=1,"break even inside the month","not paying back inside 30 days"))'),
 ('maxCac','The most you could pay for a customer','gp30/2',['gp30'],None),
 ('ltgp','Lifetime gross profit per customer (LTGP)','attrGp+upExpected+downExpected+contLtgp',['attrGp','upExpected','downExpected','contLtgp'],None),
 ('ltgpCac','LTGP to CAC','IF(cac=0,"free customers",ltgp/cac)',['ltgp','cac'],'IF({v}>=3,"good: 3x or more",IF({v}>=1,"thin","losing"))'),
 ('cashPerLead','30-day cash per lead','gp30*attrConversion',['gp30','attrConversion'],None),
 ('breakEvenCustomers','Customers a month to cover fixed costs','IF(gp30<=0,"no profit in 30 days",ROUNDUP(fixedCosts/gp30,0))',['fixedCosts','gp30'],None),
 ('affordableCustomers','Customers you can afford per month','IF(cac=0,"no ceiling",ROUNDDOWN(growthCash/cac,0))',['growthCash','cac'],None),
 ('capacityHeadroom','Room to grow before capacity','capacity-newCustomers',['capacity','newCustomers'],None),
 ('gpPerHour','Gross profit per hour of your time','IF(hoursPerCustomer=0,"no hours",gp30/hoursPerCustomer)',['gp30','hoursPerCustomer'],None),
 ('Prove: what actually happened',None,None,None,None),
 ('effectiveUpTake','Real upsell take across all customers','showRate*upOfferedShare*upTake',['showRate','upOfferedShare','upTake'],None),
 ('attrGpNet','Attraction gross profit after refunds','attrGp-attrPrice*refundRate',['attrGp','attrPrice','refundRate'],None),
 ('cash30Verified','30-day cash, checked against timing','attrGp+IF(upWhen<=30,upExpected+(downPrice*planFirstShare-downCost)*(1-upTake)*downTake,0)+IF(contFirstDays<=30,contMonth1,0)',['attrGp','upWhen','upExpected','downPrice','planFirstShare','downCost','upTake','downTake','contFirstDays','contMonth1'],None),
 ('planLeak','Cash lost to failed payment plans, per customer','downPrice*(1-planFirstShare)*planDefault*(1-upTake)*downTake',['downPrice','planFirstShare','planDefault','upTake','downTake'],None),
 ('retain3Predicted','Month-three retention, predicted by churn','(1-churn)^3',['churn'],None),
 ('measuredRatio','30-day ratio, measured (cash collected / CAC)','IF(cac=0,"free customers",measuredCash30/cac)',['measuredCash30','cac'],'IF({v}>=2,"self-funding",IF({v}>=1,"break even","losing"))'),
 ('customerGrowth','Customer growth since the model','IF(newCustomers=0,"no customers before",measuredNewCustomers/newCustomers-1)',['measuredNewCustomers','newCustomers'],None),
 ('Optimize',None,None,None,None),
 ('runRevenue','Cash a full run brings in','attrCap*collected30',['attrCap','collected30'],None),
 ('up2Expected','Second upsell profit per customer','up2Price*up2Take*upTake',['up2Price','up2Take','upTake'],None),
 ('anchorGap','The upsell as a share of the anchor','IF(anchorPrice=0,"no anchor",upPrice/anchorPrice)',['anchorPrice','upPrice'],None),
 ('annualLift','Cash the yearly plan moves into month one','(contAnnualPrice-contPrice)*contAnnualTake*contJoin',['contAnnualPrice','contPrice','contAnnualTake','contJoin'],None),
 ('gp30Stacked','30-day cash with the yearly plan','gp30+annualLift',['gp30','annualLift'],None),
 ('ltgpFull','LTGP with the second upsell and the yearly plan','ltgp+up2Expected+annualLift',['ltgp','up2Expected','annualLift'],None),
 ('entryDownExpected','Entry downsell cash per lead','entryDownPrice*entryDownTake*(1-attrConversion)',['entryDownPrice','entryDownTake','attrConversion'],None),
 ('breakEvenTake','Take rate that keeps a price test even','IF(upGp+upPrice*priceRaise<=0,"no profit",upTake*upGp/(upGp+upPrice*priceRaise))',['upGp','upPrice','priceRaise','upTake'],None),
]
says={x['id']:x['says'] for x in RC['recipes']}
for item in FIG:
    if item[1] is None:
        rows.append([item[0]]); r+=1; continue
    rid,label,expr,needs,verdict=item
    formula='=IF('+needs_ok(needs)+','+sub(expr)+',"not yet")'
    v=f'=IF(ISNUMBER(B{r}),{verdict.replace("{v}",f"B{r}")},"")' if verdict else ''
    rows.append([label,formula,v,says.get(rid, {'contMonth1':'Monthly gross profit times the share who join.','retain3Predicted':'What your churn rate predicts at month three. Compare it with the cohort you counted.'}.get(rid,''))])
    K[rid]=f'$B${r}'; r+=1
rows.append([]); r+=1
rows.append(['The plays','Open?','What it is','Opens when']); r+=1
def rule(w):
    of,op=w['of'],w['op']
    cell=ref.get(of) or K.get(of)
    if op=='known': return f'ISNUMBER({cell})' if of in K else f'{cell}<>""'
    v=w['value']
    if of in ('grossMargin','upTake','contJoin','churn','cpl','price','upPrice','contPrice','attrPrice','upExpected','upCost','contGp'): v=v/100
    return f'AND(ISNUMBER({cell}),{cell}{op}{v})'
for p in PL['plays']:
    cond='AND('+','.join(rule(w) for w in p['when'])+')' if len(p['when'])>1 else rule(p['when'][0])
    rows.append([planet[p['planet']]+': '+p['label'],f'=IF({cond},"Open","Waiting")',p['what'],'; '.join(w['says'] for w in p['when'])]); r+=1
rows.append([])
rows.append(['A companion to $100M Money Models in this sheet\'s own words. The example is a made-up business. Not financial or business advice.'])
out=io.StringIO(); w=csv.writer(out, lineterminator='\n')
for row in rows: w.writerow(row)
txt=out.getvalue()
open(os.path.join(APP,'Money-Models-Sheet.csv'),'w').write(txt)
print(len(txt),'chars', len(rows),'rows')
