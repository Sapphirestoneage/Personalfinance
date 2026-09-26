#!/usr/bin/env python3
"""binders/tools/build_xlsx.py, the Binders as one Excel workbook. PB-002.

Reads data/playbooks.json and data/example.json and writes
binders/The-Binders.xlsx: a Start sheet, a Dashboard, a Readings sheet with
every figure as a live formula, one sheet per playbook with every exercise
and checklist, and a hidden Lists sheet for the dropdowns.

    python3 binders/tools/build_xlsx.py            writes the workbook
Money is typed in whole dollars here (the app stores cents); percentages are
typed as percentages (80%) and stored as fractions, the spreadsheet way.
"""
import json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.chart import BarChart, LineChart, Reference, Series
from openpyxl.chart.label import DataLabelList

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
T = json.load(open(os.path.join(ROOT, 'data', 'playbooks.json')))
EX = json.load(open(os.path.join(ROOT, 'data', 'example.json')))['state']['answers']
OUT = os.path.join(ROOT, 'The-Binders.xlsx')

FONT = 'Arial'
HUE = {'blue': '3987E5', 'aqua': '199E70', 'orange': 'D95926', 'violet': '9085E9'}
LIGHT = {'blue': 'E3EEFC', 'aqua': 'E0F3EC', 'orange': 'FBE7DF', 'violet': 'EEEBFC'}
NAVY = '1F3A5F'
INPUT_FILL = PatternFill('solid', start_color='FFF2CC')
DONE_FILL = PatternFill('solid', start_color='C6EFCE')
STARTED_FILL = PatternFill('solid', start_color='FFEB9C')
GREY_FILL = PatternFill('solid', start_color='F2F2F2')
HEAD_FILL = PatternFill('solid', start_color=NAVY)
thin = Side(style='thin', color='D9D9D9')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

def f(size=10, bold=False, italic=False, color='000000'):
    return Font(name=FONT, size=size, bold=bold, italic=italic, color=color)
BLUE_IN = f(color='0000FF')
GREEN_LINK = f(color='008000')
WRAP = Alignment(wrap_text=True, vertical='top')
CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)
TOP = Alignment(vertical='top')

# Lists typed as "a | b" in the app become small tables here.
LOG_OF = {
    'hook_results': ['Hook', 'Count'],
    'churn_reasons': ['Reason given', 'Count'],
    'proof_map': ['Claim', 'The proof beside it (or: cut)', 'Kind'],
    'objection_bank': ['Concern heard', 'Your answer'],
    'sop_list': ['Procedure', 'Owner'],
    'scorecard_numbers': ['Number', 'Playbook it comes from'],
    'ask_list': ['Name', 'Result to ask about', 'Kind of proof'],
}
LOG_ROWS = 8
SYSTEMS = {s['id']: s for s in T['systems']}
BANDS = {b['n']: b for b in T['bands']}
PLAYBOOKS = sorted(T['playbooks'], key=lambda p: (SYSTEMS[p['system']]['order'], p['order']))

wb = Workbook()
REG = {}      # exercise key -> (sheet title, cell address)  (dollars / fractions)
LOGREG = {}   # log key -> (sheet, first row, last row, [col letters])
OWNERS = {}   # key -> (playbook, level, exercise)
for p in PLAYBOOKS:
    for l in p['levels']:
        for e in l['exercises']:
            if e.get('key'):
                OWNERS[e['key']] = (p, l, e)

def q(sheet):
    return "'" + sheet.replace("'", "''") + "'"

def ref(key):
    s, a = REG[key]
    return f"{q(s)}!{a}"

def example_for(e):
    v = EX.get(e['key'])
    if v is None:
        return None
    k = e['kind']
    if k == 'money':
        return v / 100
    if k == 'pct':
        return v / 100
    if k == 'choice':
        return e['options'][v] if isinstance(v, int) and v < len(e['options']) else None
    if k == 'list':
        return '\n'.join(v)
    if k == 'log':
        return v
    return v

# ------------------------------------------------------------------ Lists (hidden)
lists = wb.active
lists.title = 'Lists'
LIST_RANGES = {}
col = 1
for p in PLAYBOOKS:
    for l in p['levels']:
        for e in l['exercises']:
            if e.get('kind') == 'choice':
                letter = get_column_letter(col)
                lists.cell(row=1, column=col, value=e['key']).font = f(bold=True)
                for i, o in enumerate(e['options']):
                    lists.cell(row=2 + i, column=col, value=o)
                LIST_RANGES[e['key']] = f"=Lists!${letter}$2:${letter}${1 + len(e['options'])}"
                col += 1
lists.cell(row=1, column=col, value='yesno').font = f(bold=True)
lists.cell(row=2, column=col, value='Y'); lists.cell(row=3, column=col, value='N')
YESNO = f"=Lists!${get_column_letter(col)}$2:${get_column_letter(col)}$3"
lists.sheet_state = 'hidden'

# ------------------------------------------------------------------ playbook sheets
def playbook_sheet(p):
    ws = wb.create_sheet(p['label'])
    hue = SYSTEMS[p['system']]['hue']
    ws.sheet_properties.tabColor = HUE[hue]
    widths = {'A': 6, 'B': 9, 'C': 46, 'D': 44, 'E': 5, 'F': 34, 'G': 46, 'H': 11, 'I': 6}
    for k, v in widths.items():
        ws.column_dimensions[k].width = v
    ws.sheet_view.showGridLines = False
    ws['C1'] = p['label']; ws['C1'].font = f(18, bold=True, color=NAVY)
    ws['D1'] = SYSTEMS[p['system']]['label'] + ' system'; ws['D1'].font = f(10, italic=True, color='595959')
    ws['C2'] = p['oneLine']; ws['C2'].font = f(11, bold=True); ws.merge_cells('C2:G2')
    ws['C3'] = p['idea']; ws['C3'].font = f(10); ws['C3'].alignment = WRAP; ws.merge_cells('C3:G3')
    ws.row_dimensions[3].height = 78
    # band progress block
    ws['C5'] = 'Where you stand on this planet'; ws['C5'].font = f(11, bold=True, color=NAVY)
    heads = ['#', 'Band', 'Answered', 'Of', 'Ticked', 'Of', 'Status']
    for i, h in enumerate(heads):
        c = ws.cell(row=6, column=2 + i, value=h); c.font = f(bold=True, color='FFFFFF'); c.fill = HEAD_FILL; c.alignment = CENTER; c.border = BORDER
    for n in range(1, 7):
        r = 6 + n
        b = BANDS[n]
        ws.cell(row=r, column=2, value=n).font = f()
        ws.cell(row=r, column=3, value=f"{b['name']}: {b['meaning']}").font = f()
        ws.cell(row=r, column=4, value=f'=SUMIFS($E$19:$E$400,$A$19:$A$400,B{r},$B$19:$B$400,"exercise")')
        ws.cell(row=r, column=5, value=f'=COUNTIFS($A$19:$A$400,B{r},$B$19:$B$400,"exercise")')
        ws.cell(row=r, column=6, value=f'=SUMIFS($E$19:$E$400,$A$19:$A$400,B{r},$B$19:$B$400,"check")')
        ws.cell(row=r, column=7, value=f'=COUNTIFS($A$19:$A$400,B{r},$B$19:$B$400,"check")')
        ws.cell(row=r, column=8, value=f'=IF(AND(D{r}=E{r},F{r}=G{r}),"done",IF(D{r}+F{r}>0,"started","not yet"))')
        ws.cell(row=r, column=9, value=f'=IF(H{r}="done",99,B{r})')
        for cc in range(2, 10):
            ws.cell(row=r, column=cc).border = BORDER
            if cc > 2: ws.cell(row=r, column=cc).font = f()
        ws.cell(row=r, column=9).font = f(color='BFBFBF')
    ws.conditional_formatting.add('H7:H12', CellIsRule(operator='equal', formula=['"done"'], fill=DONE_FILL))
    ws.conditional_formatting.add('H7:H12', CellIsRule(operator='equal', formula=['"started"'], fill=STARTED_FILL))
    ws['C13'] = 'Levels done'; ws['D13'] = '=COUNTIF(H7:H12,"done")'
    ws['C14'] = 'Working on band'; ws['D14'] = '=IF(MIN(I7:I12)=99,"complete",MIN(I7:I12))'
    ws['C15'] = 'Share of this planet answered'; ws['D15'] = '=IF(SUM(E7:E12,G7:G12)=0,0,SUM(D7:D12,F7:F12)/SUM(E7:E12,G7:G12))'; ws['D15'].number_format = '0%'
    for r in (13, 14, 15):
        ws.cell(row=r, column=3).font = f(bold=True); ws.cell(row=r, column=4).font = f(bold=True, color=NAVY)
    ws['F13'] = 'Yellow cells are yours to fill. A band is done when every yellow cell in it holds an answer and every checklist item is Y.'
    ws['F13'].font = f(9, italic=True, color='595959'); ws['F13'].alignment = WRAP; ws.merge_cells('F13:G15')
    # main table
    heads = ['Band', 'Kind', 'Exercise or step', 'Your answer', '✓', 'Example', 'What counts, where to look']
    for i, h in enumerate(heads):
        c = ws.cell(row=18, column=1 + i, value=h); c.font = f(bold=True, color='FFFFFF'); c.fill = HEAD_FILL; c.alignment = CENTER; c.border = BORDER
    ws.freeze_panes = 'A19'
    r = 19
    for l in p['levels']:
        n = l['band']; b = BANDS[n]
        c = ws.cell(row=r, column=3, value=f"Band {n} · {b['name']} · {b['payoff']} · about {l['minutes']} min:  {l['title']}")
        c.font = f(11, bold=True, color=NAVY); c.fill = PatternFill('solid', start_color=LIGHT[hue])
        for cc in range(1, 8):
            ws.cell(row=r, column=cc).fill = PatternFill('solid', start_color=LIGHT[hue])
        ws.cell(row=r, column=1, value=n).font = f(color='808080')
        ws.cell(row=r, column=2, value='band').font = f(color='BFBFBF')
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
        r += 1
        c = ws.cell(row=r, column=3, value=l['why']); c.font = f(italic=True, color='404040'); c.alignment = WRAP
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
        ws.row_dimensions[r].height = max(30, 15 * (len(l['why']) // 120 + 1))
        ws.cell(row=r, column=2, value='why').font = f(color='BFBFBF')
        r += 1
        for e in l['exercises']:
            ws.cell(row=r, column=1, value=n).font = f(color='808080')
            if 'ref' in e:
                op, ol, oe = OWNERS[e['ref']]
                ws.cell(row=r, column=2, value='exercise').font = f(color='BFBFBF')
                ws.cell(row=r, column=3, value=oe['label'] + '  (read from ' + op['label'] + ', band ' + str(ol['band']) + ')').font = f()
                s, a = REG[e['ref']]
                d = ws.cell(row=r, column=4, value=f'=IF({q(s)}!{a}="","",{q(s)}!{a})')
                d.font = GREEN_LINK; d.number_format = '$#,##0' if oe['kind'] == 'money' else ('0%' if oe['kind'] == 'pct' else 'General')
                ws.cell(row=r, column=5, value=f'=IF(D{r}<>"",1,0)').font = f(color='BFBFBF')
                ws.cell(row=r, column=7, value='Typed once, in ' + op['label'] + '. This cell only reads it.').font = f(9, color='595959')
                ws.cell(row=r, column=3).alignment = WRAP; ws.cell(row=r, column=7).alignment = WRAP
                r += 1
                continue
            k = e['kind']
            label = e['label'] + ('  [shared: other playbooks read this]' if e.get('shared') else '')
            ws.cell(row=r, column=2, value='exercise').font = f(color='BFBFBF')
            ws.cell(row=r, column=3, value=label).font = f(bold=bool(e.get('shared'))); ws.cell(row=r, column=3).alignment = WRAP
            help_ = e.get('help', '') or ''
            if k == 'log' or e['key'] in LOG_OF:
                cols = e['columns'] if k == 'log' else LOG_OF[e['key']]
                first, last = r + 2, r + 1 + LOG_ROWS
                d = ws.cell(row=r, column=4, value=f'=IF(COUNTA(C{first}:{get_column_letter(2 + len(cols))}{last})>0,"logged","")')
                d.font = f(color='595959')
                ws.cell(row=r, column=5, value=f'=IF(COUNTA(C{first}:{get_column_letter(2 + len(cols))}{last})>0,1,0)').font = f(color='BFBFBF')
                exv = EX.get(e['key'])
                exs = ('e.g. ' + ' | '.join(str(x) for x in exv[0])) if k == 'log' and exv else ('e.g. ' + ' | '.join(EX[e['key']][0].split(' | ')) if e['key'] in EX and EX[e['key']] else '')
                ws.cell(row=r, column=6, value=exs).font = f(9, italic=True, color='595959')
                ws.cell(row=r, column=7, value=(help_ + ' ' if help_ else '') + 'Fill the small table below, one row a line.').font = f(9, color='595959'); ws.cell(row=r, column=7).alignment = WRAP
                r += 1
                for i, cname in enumerate(cols):
                    c = ws.cell(row=r, column=3 + i, value=cname); c.font = f(9, bold=True, color='FFFFFF'); c.fill = PatternFill('solid', start_color='7F7F7F'); c.border = BORDER
                ws.cell(row=r, column=2, value='logrow').font = f(color='BFBFBF')
                r += 1
                letters = [get_column_letter(3 + i) for i in range(len(cols))]
                for i in range(LOG_ROWS):
                    ws.cell(row=r, column=2, value='logrow').font = f(color='BFBFBF')
                    for j in range(len(cols)):
                        c = ws.cell(row=r, column=3 + j); c.fill = INPUT_FILL; c.font = BLUE_IN; c.border = BORDER
                        if k == 'log' and 'cash' in cols[j].lower():
                            c.number_format = '$#,##0'
                    r += 1
                LOGREG[e['key']] = (p['label'], first, last, letters)
                continue
            d = ws.cell(row=r, column=4); d.fill = INPUT_FILL; d.font = BLUE_IN; d.border = BORDER; d.alignment = WRAP
            ws.cell(row=r, column=5, value=f'=IF(D{r}<>"",1,0)').font = f(color='BFBFBF')
            exv = example_for(e)
            fx = ws.cell(row=r, column=6, value=exv); fx.font = f(9, italic=True, color='595959'); fx.alignment = WRAP
            g = ws.cell(row=r, column=7, value=help_); g.font = f(9, color='595959'); g.alignment = WRAP
            if k == 'money':
                d.number_format = '$#,##0'; fx.number_format = '$#,##0'
                ws.cell(row=r, column=7, value=(help_ + ' ' if help_ else '') + 'Whole dollars.')
            elif k == 'pct':
                d.number_format = '0%'; fx.number_format = '0%'
                ws.cell(row=r, column=7, value=(help_ + ' ' if help_ else '') + 'Type it as a percentage, for example 80%.')
            elif k == 'rating':
                dv = DataValidation(type='list', formula1='"1,2,3,4,5"', allow_blank=True); ws.add_data_validation(dv); dv.add(d)
                ws.cell(row=r, column=7, value=help_ or 'Pick 1 to 5 from the dropdown.')
            elif k == 'choice':
                dv = DataValidation(type='list', formula1=LIST_RANGES[e['key']], allow_blank=True); ws.add_data_validation(dv); dv.add(d)
                ws.cell(row=r, column=7, value=(help_ + ' ' if help_ else '') + 'Pick one from the dropdown.')
            elif k == 'list':
                ws.cell(row=r, column=7, value=(help_ + ' ' if help_ else '') + 'One a line: Alt+Enter starts a new line inside the cell.')
                ws.row_dimensions[r].height = 60
            elif k == 'long':
                ws.row_dimensions[r].height = 48
            ws.cell(row=r, column=7).font = f(9, color='595959'); ws.cell(row=r, column=7).alignment = WRAP
            REG[e['key']] = (p['label'], f'$D${r}')
            r += 1
        if l['checklist']:
            c = ws.cell(row=r, column=3, value='Checklist'); c.font = f(9, bold=True, color='595959')
            ws.cell(row=r, column=2, value='head').font = f(color='BFBFBF')
            r += 1
            for item in l['checklist']:
                ws.cell(row=r, column=1, value=n).font = f(color='808080')
                ws.cell(row=r, column=2, value='check').font = f(color='BFBFBF')
                ws.cell(row=r, column=3, value='☐ ' + item).font = f(); ws.cell(row=r, column=3).alignment = WRAP
                d = ws.cell(row=r, column=4); d.fill = INPUT_FILL; d.font = BLUE_IN; d.border = BORDER; d.alignment = Alignment(horizontal='center')
                dv = DataValidation(type='list', formula1=YESNO, allow_blank=True); ws.add_data_validation(dv); dv.add(d)
                ws.cell(row=r, column=5, value=f'=IF(D{r}="Y",1,0)').font = f(color='BFBFBF')
                ws.cell(row=r, column=7, value='Y when it is true.').font = f(9, color='595959')
                r += 1
        c = ws.cell(row=r, column=3, value='When this band is done: ' + l['checkpoint']); c.font = f(9, italic=True, color=NAVY)
        ws.cell(row=r, column=2, value='checkpoint').font = f(color='BFBFBF')
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
        r += 2
    ws.conditional_formatting.add('D19:D400', CellIsRule(operator='equal', formula=['"Y"'], fill=DONE_FILL))
    return ws

for p in PLAYBOOKS:
    playbook_sheet(p)

# ------------------------------------------------------------------ Readings
rd = wb.create_sheet('Readings', 1)
rd.sheet_properties.tabColor = NAVY
rd.sheet_view.showGridLines = False
for k, v in {'A': 3, 'B': 44, 'C': 16, 'D': 16, 'E': 16, 'F': 16, 'G': 16, 'H': 50}.items():
    rd.column_dimensions[k].width = v
rd['B1'] = 'Readings: every figure the binder earns, as live formulas'; rd['B1'].font = f(16, bold=True, color=NAVY)
rd['B2'] = 'Nothing here is typed. Each figure reads the facts on its playbook sheet and says "not yet" until they exist. Rules of thumb are rules of thumb, not findings.'
rd['B2'].font = f(10, italic=True, color='595959'); rd.merge_cells('B2:H2')
row = 4
HEAD = {}
def section(title, hue):
    global row
    c = rd.cell(row=row, column=2, value=title); c.font = f(12, bold=True, color='FFFFFF'); c.fill = PatternFill('solid', start_color=HUE[hue])
    for cc in range(3, 9): rd.cell(row=row, column=cc).fill = PatternFill('solid', start_color=HUE[hue])
    row += 1
def line(label, formula, fmt='General', note=''):
    global row
    rd.cell(row=row, column=2, value=label).font = f()
    c = rd.cell(row=row, column=3, value=formula); c.font = f(bold=True, color=NAVY); c.number_format = fmt; c.alignment = Alignment(horizontal='right')
    rd.cell(row=row, column=8, value=note).font = f(9, color='595959'); rd.cell(row=row, column=8).alignment = WRAP
    HEAD[label] = f'$C${row}'
    row += 1
    return f'$C${row - 1}'
def table(title, headers, rows_, fmts=None):
    """rows_: list of [label, formula...]. Returns (first data row, last data row)."""
    global row
    rd.cell(row=row, column=2, value=title).font = f(bold=True, color='404040')
    row += 1
    for i, h in enumerate(headers):
        c = rd.cell(row=row, column=2 + i, value=h); c.font = f(9, bold=True, color='FFFFFF'); c.fill = PatternFill('solid', start_color='7F7F7F'); c.alignment = CENTER
    row += 1
    first = row
    for rr in rows_:
        for i, v in enumerate(rr):
            c = rd.cell(row=row, column=2 + i, value=v); c.font = f()
            if i > 0 and fmts: c.number_format = fmts[min(i - 1, len(fmts) - 1)]
        row += 1
    return first, row - 1
def R(key): return ref(key)
def div(a, b):
    return f'IF(OR({a}="",{b}="",{b}=0),"not yet",{a}/{b})'
def blank(*keys):
    return ','.join(f'{R(k)}=""' for k in keys)
def logcol(key, i):
    s, first, last, letters = LOGREG[key]
    return f"{q(s)}!${letters[i]}${first}:${letters[i]}${last}"
def logcell(key, i, n):
    s, first, last, letters = LOGREG[key]
    a = f"{q(s)}!${letters[i]}${first + n}"
    return f'IF({a}="","",{a})'

charts = []
# ---- Sales
section('Sales: Closing Handbook', 'aqua')
line('Show rate (showed / booked)', f'={div(R("calls_shown_month"), R("calls_booked_month"))}', '0%', 'Seven of ten is the rule of thumb to beat.')
line('Close rate, before (bought / showed)', f'={div(R("closed_month"), R("calls_shown_month"))}', '0%')
line('Close rate, after the run', f'={div(R("run_closed"), R("run_calls"))}', '0%')
line('Cash collected per sale', f'={div(R("cash_collected_month"), R("closed_month"))}', '$#,##0', 'Compare with the price in Lifetime Value.')
line('Share of the price collected at the close', f'=IF(OR({R("price")}="",{R("price")}=0,{HEAD["Cash collected per sale"]}="not yet"),"not yet",{HEAD["Cash collected per sale"]}/{R("price")})', '0%')
fr, lr = table('The funnel, last month', ['Step', 'Count'], [['Booked', f'={R("calls_booked_month")}'], ['Showed', f'={R("calls_shown_month")}'], ['Bought', f'={R("closed_month")}']], ['#,##0'])
charts.append(('bar', 'The funnel, last month', fr, lr, 1, 'aqua', 'B'))
fr, lr = table('Objections heard', ['Objection', 'Times heard', 'Answered well'], [[f'={logcell("objections_log", 0, i)}', f'={logcell("objections_log", 1, i)}', f'={logcell("objections_log", 2, i)}'] for i in range(LOG_ROWS)], ['#,##0'])
row += 1
section('Sales: Proof Checklist', 'aqua')
kinds = [('proof_results', 'Results with a number'), ('proof_stories', 'Named testimonials'), ('proof_before_after', 'Before and after'), ('proof_third', 'Third-party marks'), ('proof_demos', 'Demonstrations')]
fr, lr = table('Proof by kind', ['Kind', 'Count'], [[lab, f'={R(k)}'] for k, lab in kinds], ['#,##0'])
charts.append(('bar', 'Proof by kind', fr, lr, 1, 'aqua', 'B'))
claims_n = f'IF({R("claims")}="",0,LEN({R("claims")})-LEN(SUBSTITUTE({R("claims")},CHAR(10),""))+1)'
line('Claims listed', f'={claims_n}', '#,##0')
line('Claims with a proof beside them', f'=COUNTIFS({logcol("proof_map", 1)},"<>",{logcol("proof_map", 1)},"<>cut")', '#,##0', 'Rows of the proof map whose second column is filled and is not the word cut.')
line('Coverage (claims with proof / claims)', f'=IF({HEAD["Claims listed"]}=0,"not yet",MIN(1,{HEAD["Claims with a proof beside them"]}/{HEAD["Claims listed"]}))', '0%')
line('Testimonials per 100 customers', f'=IF(OR({blank("proof_stories","customers_served")},{R("customers_served")}=0),"not yet",{R("proof_stories")}/{R("customers_served")}*100)', '0.0')
line('Asks that came back', f'={div(R("run_got"), R("run_asked"))}', '0%')
row += 1
section('Sales: GOATed Ads', 'aqua')
fr, lr = table('The ad chain, last month', ['Step', 'Count'], [['Shown', f'={R("ad_impressions")}'], ['Clicked', f'={R("ad_clicks")}'], ['Leads', f'={R("ad_leads")}'], ['Booked', f'={R("ad_booked")}'], ['Bought', f'={R("ad_sales")}']], ['#,##0'])
charts.append(('bar', 'The ad chain, last month', fr, lr, 1, 'aqua', 'B'))
line('Cost per thousand shown', f'=IF(OR({blank("ad_spend_month","ad_impressions")},{R("ad_impressions")}=0),"not yet",{R("ad_spend_month")}/{R("ad_impressions")}*1000)', '$#,##0.00')
line('Click rate', f'={div(R("ad_clicks"), R("ad_impressions"))}', '0.0%')
line('Cost per lead, before', f'={div(R("ad_spend_month"), R("ad_leads"))}', '$#,##0')
line('Cost per lead, after the run', f'={div(R("run_spend"), R("run_leads_ads"))}', '$#,##0')
line('Cost per customer, before', f'={div(R("ad_spend_month"), R("ad_sales"))}', '$#,##0')
line('Cost per customer, after the run', f'={div(R("run_spend"), R("run_sales_ads"))}', '$#,##0')
row += 1
# ---- Leads
section('Leads: Marketing Machine', 'blue')
fr, lr = table('The four ways, per week', ['Way', 'Per week'], [['Warm outreach', f'={R("warm_week")}'], ['Content', f'={R("content_week")}'], ['Cold outreach', f'={R("cold_week")}'], ['Paid ads ($)', f'={R("ads_week")}']], ['#,##0'])
charts.append(('bar', 'The four ways, per week (ads in dollars)', fr, lr, 1, 'blue', 'B'))
line('Leads needed per month', f'=IF(OR({R("customers_wanted")}="",{HEAD["Close rate, before (bought / showed)"]}="not yet",{R("call_rate")}="",{R("call_rate")}=0,{HEAD["Close rate, before (bought / showed)"]}=0),"not yet",{R("customers_wanted")}/{HEAD["Close rate, before (bought / showed)"]}/{R("call_rate")})', '#,##0', 'Customers wanted, divided by the close rate (Closing Handbook) and the booking rate (Lead Nurture).')
line('Leads you have per month', f'=IF({R("leads_month")}="","not yet",{R("leads_month")})', '#,##0')
reach = f'({R("warm_week")}+{R("content_week")}+{R("cold_week")})*4.33'
line('Leads per hundred contacts, before', f'=IF(OR({blank("warm_week","content_week","cold_week","leads_month")},{reach}=0),"not yet",{R("leads_month")}/({reach}))', '0.0%')
line('Leads per hundred contacts, after the run', f'={div(R("run_leads"), R("run_reach"))}', '0.0%')
row += 1
section('Leads: Hooks', 'blue')
line('Hook rate, before (engaged / views)', f'={div(R("engaged_week"), R("views_week"))}', '0.0%')
line('Hook rate, after the run', f'={div(R("hook_wins"), R("hook_runs"))}', '0.0%')
fr, lr = table('The three hooks, by count', ['Hook', 'Count'], [[f'={logcell("hook_results", 0, i)}', f'={logcell("hook_results", 1, i)}'] for i in range(LOG_ROWS)], ['#,##0'])
charts.append(('logbar', 'Replies, clicks or saves by hook', 'hook_results', [1], 0, 'blue', ['Count']))
row += 1
section('Leads: Lead Nurture', 'blue')
line('Minutes to first reply, before', f'=IF({R("reply_minutes")}="","not yet",{R("reply_minutes")})', '#,##0', 'Five minutes is the rule of thumb.')
line('Minutes to first reply, after the run', f'=IF({R("run_reply_minutes")}="","not yet",{R("run_reply_minutes")})', '#,##0')
line('Leads who book, before', f'=IF({R("call_rate")}="","not yet",{R("call_rate")})', '0%')
line('Leads who book, after the run', f'={div(R("run_booked"), R("run_leads_n"))}', '0%')
fr, lr = table('Replies by touch', ['Touch', 'Sent', 'Replied', 'Share'], [[f'={logcell("touch_log", 0, i)}', f'={logcell("touch_log", 1, i)}', f'={logcell("touch_log", 2, i)}', f'=IF(OR(C{row + 2 + i}="",C{row + 2 + i}=0),"",D{row + 2 + i}/C{row + 2 + i})'] for i in range(LOG_ROWS)], ['#,##0', '#,##0', '0%'])
charts.append(('logbar', 'Sent and replied, by touch', 'touch_log', [1, 2], 0, 'blue', ['Sent', 'Replied']))
row += 1
# ---- Delivery
section('Delivery: Lifetime Value', 'orange')
line('Lifetime gross profit per customer', f'=IF(OR({blank("price","gross_margin","purchases_per_customer")}),"not yet",{R("price")}*{R("gross_margin")}*{R("purchases_per_customer")})', '$#,##0', 'Price, times gross margin, times purchases over the stay.')
line('Lifetime gross profit, after the quarter', f'=IF(OR({blank("run_price","run_margin","run_purchases")}),"not yet",{R("run_price")}*{R("run_margin")}*{R("run_purchases")})', '$#,##0')
line('Lifetime gross profit to cost of a customer', f'=IF(OR({HEAD["Lifetime gross profit per customer"]}="not yet",{R("cac")}="",{R("cac")}=0),"not yet",{HEAD["Lifetime gross profit per customer"]}/{R("cac")})', '0.0"x"', 'Three to one is the rule of thumb. Below one, every customer loses money.')
line('The same ratio, after the quarter', f'=IF(OR({HEAD["Lifetime gross profit, after the quarter"]}="not yet",{R("run_cac")}="",{R("run_cac")}=0),"not yet",{HEAD["Lifetime gross profit, after the quarter"]}/{R("run_cac")})', '0.0"x"')
ltgp = HEAD['Lifetime gross profit per customer']
fr, lr = table('A hundred customers, levers pulled at ten percent each', ['Levers pulled', 'Gross profit'], [[('Today' if k == 0 else f'{k} lever' + ('s' if k > 1 else '')), f'=IF({ltgp}="not yet",0,{ltgp}*100*1.1^{k})'] for k in range(5)], ['$#,##0'])
charts.append(('bar', 'A hundred customers, levers at ten percent (they multiply)', fr, lr, 1, 'orange', 'B'))
row += 1
section('Delivery: Retention', 'orange')
line('Monthly churn, before', f'={div(R("customers_left"), R("customers_start"))}', '0.0%')
line('Monthly churn, after the run', f'={div(R("run_left"), R("run_start"))}', '0.0%')
ch = HEAD['Monthly churn, before']
line('Expected stay, months (1 / churn)', f'=IF(OR({ch}="not yet",{ch}=0),"not yet",1/{ch})', '0.0', 'At zero churn the stay cannot be measured yet.')
fr, lr = table('Of a hundred who start, who is still here', ['Month', 'Still here'], [[m, f'=IF({ch}="not yet",0,100*(1-{ch})^{m})'] for m in range(13)], ['0.0'])
charts.append(('line', 'Of a hundred who start, who is still here', fr, lr, 1, 'orange', 'B'))
fr, lr = table('Cohorts', ['Month', 'Started', 'Still here', 'Share'], [[f'={logcell("cohort_log", 0, i)}', f'={logcell("cohort_log", 1, i)}', f'={logcell("cohort_log", 2, i)}', f'=IF(OR(C{row + 2 + i}="",C{row + 2 + i}=0),"",D{row + 2 + i}/C{row + 2 + i})'] for i in range(LOG_ROWS)], ['#,##0', '#,##0', '0%'])
row += 1
section('Delivery: Branding', 'orange')
line('Touches that matched the brand, before', f'={div(R("brand_consistent"), R("brand_touches_week"))}', '0%')
line('Touches that matched the brand, after the run', f'={div(R("run_on_brand"), R("run_touches"))}', '0%')
def lines_of(key): return f'IF({R(key)}="",0,LEN({R(key)})-LEN(SUBSTITUTE({R(key)},CHAR(10),""))+1)'
fr, lr = table('The brand lists against their targets', ['List', 'Have', 'Target'], [['Stand beside', f'={lines_of("assoc_want")}', 10], ['Never', f'={lines_of("assoc_never")}', 5], ['Fixed elements', f'={lines_of("brand_look")}', 5]], ['#,##0', '#,##0'])
row += 1
# ---- Profit
section('Profit: Price Raise', 'violet')
line('Customers you can lose and break even', f'=IF(OR({blank("gross_margin","raise_pct")},({R("gross_margin")}+{R("raise_pct")})=0),"not yet",{R("raise_pct")}/({R("gross_margin")}+{R("raise_pct")}))', '0.0%', 'The raise divided by the margin plus the raise.')
line('Monthly gross profit today', f'=IF(OR({blank("price","gross_margin","customers_month")}),"not yet",{R("customers_month")}*{R("price")}*{R("gross_margin")})', '$#,##0')
line('Monthly gross profit, first month at the new price', f'=IF(OR({blank("price","gross_margin","run_customers_after","run_price_realised")}),"not yet",{R("run_customers_after")}*({R("run_price_realised")}-{R("price")}*(1-{R("gross_margin")})))', '$#,##0')
today = HEAD['Monthly gross profit today']
fr, lr = table('Monthly gross profit against the share of customers kept', ['Kept', 'Today', 'New price'], [[k / 100, f'=IF({today}="not yet",0,{today})', f'=IF(OR({today}="not yet",{R("raise_pct")}=""),0,{R("customers_month")}*{k / 100}*{R("price")}*({R("gross_margin")}+{R("raise_pct")}))'] for k in range(50, 101, 5)], ['$#,##0', '$#,##0'])
rd.cell(row=fr - 2, column=2).value = 'Monthly gross profit against the share of customers kept (they cross at the breakeven loss)'
for rr in range(fr, lr + 1): rd.cell(row=rr, column=2).number_format = '0%'
charts.append(('line2', 'Monthly gross profit against customers kept', fr, lr, 2, 'violet', 'B'))
row += 1
section('Profit: Promo Cash', 'violet')
take = f'IF({R("upsell_take_target")}<>"",{R("upsell_take_target")},IF({R("upsell_take")}<>"",{R("upsell_take")},0))'
upsell = f'IF({R("upsell_price")}="",0,{take}*{R("upsell_price")})'
line('Cash in the first thirty days', f'=IF({R("first_cash")}="","not yet",{R("first_cash")}+{upsell})', '$#,##0', 'First purchase plus the upsell at its take rate.')
line('Cost in the first thirty days', f'=IF(OR({blank("cac","deliver_cost_30")}),"not yet",{R("cac")}+{R("deliver_cost_30")})', '$#,##0', 'To acquire (Lifetime Value) plus to deliver.')
ci, co = HEAD['Cash in the first thirty days'], HEAD['Cost in the first thirty days']
line('Thirty-day ratio', f'=IF(OR({ci}="not yet",{co}="not yet",{co}=0),"not yet",{ci}/{co})', '0.00"x"', 'Above one, growth pays for itself.')
line('Thirty-day ratio, after the run', f'={div(R("run_cash_30"), R("run_cost_30"))}', '0.00"x"')
fr, lr = table('Thirty-day cash against cost', ['Bar', 'First purchase', 'Upsell', 'To acquire', 'To deliver'], [['Cash in 30 days', f'=IF({R("first_cash")}="",0,{R("first_cash")})', f'={upsell}', 0, 0], ['Cost in 30 days', 0, 0, f'=IF({R("cac")}="",0,{R("cac")})', f'=IF({R("deliver_cost_30")}="",0,{R("deliver_cost_30")})']], ['$#,##0'])
charts.append(('stack', 'Thirty-day cash against cost', fr, lr, 4, 'violet', 'B'))
row += 1
section('Profit: Implementation SOPs', 'violet')
line('Procedures someone else runs', f'={div(R("sops_others_run"), R("sops_written"))}', '0%')
line('Hours a week on work someone else could do, before', f'=IF({R("hours_week_owner")}="","not yet",{R("hours_week_owner")})', '0.0')
line('The same, after four weeks', f'=IF({R("run_hours_owner")}="","not yet",{R("run_hours_owner")})', '0.0')
fr, lr = table('The scorecard, week by week', ['Week', 'Leads', 'Sales', 'Kept', 'Cash'], [[f'={logcell("scorecard_log", 0, i)}', f'={logcell("scorecard_log", 1, i)}', f'={logcell("scorecard_log", 2, i)}', f'={logcell("scorecard_log", 3, i)}', f'={logcell("scorecard_log", 4, i)}'] for i in range(LOG_ROWS)], ['#,##0', '#,##0', '#,##0', '$#,##0'])
charts.append(('logline', 'The scorecard: leads, sales, customers kept', 'scorecard_log', [1, 2, 3], 0, 'violet', ['Leads', 'Sales', 'Kept']))
charts.append(('logline', 'The scorecard: cash collected', 'scorecard_log', [4], 0, 'violet', ['Cash']))

# place charts in column J onward, stacked
crow = 4
for kind, title, fr, lr, ncols, hue, labcol in charts:
    if kind in ('logbar', 'logline'):
        key, cols, names = fr, lr, labcol
        sheet, first, last, letters = LOGREG[key]
        src = wb[sheet]
        ch_ = LineChart() if kind == 'logline' else BarChart()
        if kind == 'logbar': ch_.type = 'bar' if key == 'hook_results' else 'col'
        ch_.title = title; ch_.style = 10; ch_.height = 7.2; ch_.width = 16
        from openpyxl.utils import column_index_from_string as cidx
        for ci, nm in zip(cols, names):
            vals = Reference(src, min_col=cidx(letters[ci]), min_row=first, max_row=last)
            se = Series(vals, title=nm)
            if kind == 'logline': se.smooth = False; se.marker.symbol = 'circle'
            if len(cols) == 1:
                se.graphicalProperties.solidFill = HUE[hue]; se.graphicalProperties.line.solidFill = HUE[hue]
            ch_.series.append(se)
        ch_.set_categories(Reference(src, min_col=cidx(letters[0]), min_row=first, max_row=last))
        ch_.display_blanks = 'gap'
        if len(cols) == 1: ch_.legend = None
        rd.add_chart(ch_, f'J{crow}')
        crow += 15
        continue
    if kind.startswith('line'):
        ch_ = LineChart()
    else:
        ch_ = BarChart(); ch_.type = 'bar' if kind == 'bar' else 'col'
        if kind == 'stack': ch_.grouping = 'stacked'; ch_.overlap = 100
    ch_.title = title; ch_.style = 10; ch_.height = 7.2; ch_.width = 16
    ch_.legend = None if kind in ('bar', 'line') else ch_.legend
    if kind == 'lineN':
        data = Reference(rd, min_col=2 + ncols, min_row=fr - 1, max_row=lr)
    elif kind == 'line3':
        data = Reference(rd, min_col=3, max_col=5, min_row=fr - 1, max_row=lr)
    elif kind in ('line2', 'stack'):
        data = Reference(rd, min_col=3, max_col=2 + ncols, min_row=fr - 1, max_row=lr)
    else:
        data = Reference(rd, min_col=2 + ncols, min_row=fr - 1, max_row=lr)
    cats = Reference(rd, min_col=2, min_row=fr, max_row=lr)
    ch_.add_data(data, titles_from_data=True); ch_.set_categories(cats)
    for s in ch_.series:
        if kind in ('bar', 'line', 'lineN'):
            s.graphicalProperties.solidFill = HUE[hue]; s.graphicalProperties.line.solidFill = HUE[hue]
        if kind.startswith('line'): s.smooth = False
    ch_.y_axis.majorGridlines = None if kind == 'bar' else ch_.y_axis.majorGridlines
    rd.add_chart(ch_, f'J{crow}')
    crow += 15
rd.column_dimensions['I'].width = 3

# ------------------------------------------------------------------ Dashboard
db = wb.create_sheet('Dashboard', 0)
db.sheet_properties.tabColor = NAVY
db.sheet_view.showGridLines = False
for k, v in {'A': 3, 'B': 12, 'C': 24, 'D': 11, 'E': 19, 'F': 8, 'G': 11, 'H': 8, 'I': 12, 'J': 13, 'K': 4, 'L': 9, 'M': 9, 'N': 9, 'O': 9, 'P': 9, 'Q': 9}.items():
    db.column_dimensions[k].width = v
db['B1'] = 'The Binders'; db['B1'].font = f(22, bold=True, color=NAVY)
db['B2'] = 'Twelve playbooks in four systems, six bands deep. A band means the same depth on every playbook: read the idea, type the facts, do the exercises, build the thing, run it, sharpen it.'
db['B2'].font = f(10, italic=True, color='595959'); db.merge_cells('B2:Q2'); db['B2'].alignment = WRAP; db.row_dimensions[2].height = 30
db['B4'] = 'Where you stand'; db['B4'].font = f(13, bold=True, color=NAVY)
heads = ['System', 'Playbook', 'Levels done', 'Working on', 'Answered', 'Of', 'Ticked', 'Of', 'Share done']
for i, h in enumerate(heads):
    c = db.cell(row=5, column=2 + i, value=h); c.font = f(bold=True, color='FFFFFF'); c.fill = HEAD_FILL; c.alignment = CENTER; c.border = BORDER
for i, h in enumerate(['Band 1', 'Band 2', 'Band 3', 'Band 4', 'Band 5', 'Band 6']):
    c = db.cell(row=5, column=12 + i, value=h); c.font = f(bold=True, color='FFFFFF'); c.fill = HEAD_FILL; c.alignment = CENTER; c.border = BORDER
r = 6
for p in PLAYBOOKS:
    s = q(p['label'])
    db.cell(row=r, column=2, value=SYSTEMS[p['system']]['label']).font = f(color='595959')
    c = db.cell(row=r, column=3, value=p['label']); c.font = f(bold=True); c.fill = PatternFill('solid', start_color=LIGHT[SYSTEMS[p['system']]['hue']])
    db.cell(row=r, column=4, value=f'={s}!$D$13')
    db.cell(row=r, column=5, value=f'={s}!$D$14')
    db.cell(row=r, column=6, value=f'=SUM({s}!$D$7:$D$12)')
    db.cell(row=r, column=7, value=f'=SUM({s}!$E$7:$E$12)')
    db.cell(row=r, column=8, value=f'=SUM({s}!$F$7:$F$12)')
    db.cell(row=r, column=9, value=f'=SUM({s}!$G$7:$G$12)')
    c = db.cell(row=r, column=10, value=f'={s}!$D$15'); c.number_format = '0%'
    for n in range(1, 7):
        db.cell(row=r, column=11 + n, value=f'={s}!$H${6 + n}').alignment = Alignment(horizontal='center')
    for cc in range(2, 18):
        db.cell(row=r, column=cc).border = BORDER
        if cc >= 4: db.cell(row=r, column=cc).font = GREEN_LINK
    r += 1
last = r - 1
db.cell(row=r, column=3, value='All twelve').font = f(bold=True)
db.cell(row=r, column=4, value=f'=SUM(D6:D{last})').font = f(bold=True)
db.cell(row=r, column=6, value=f'=SUM(F6:F{last})').font = f(bold=True)
db.cell(row=r, column=7, value=f'=SUM(G6:G{last})').font = f(bold=True)
db.cell(row=r, column=8, value=f'=SUM(H6:H{last})').font = f(bold=True)
db.cell(row=r, column=9, value=f'=SUM(I6:I{last})').font = f(bold=True)
c = db.cell(row=r, column=10, value=f'=IF(SUM(G6:G{last},I6:I{last})=0,0,SUM(F6:F{last},H6:H{last})/SUM(G6:G{last},I6:I{last}))'); c.number_format = '0%'; c.font = f(bold=True)
for n in range(1, 7):
    c = db.cell(row=r, column=11 + n, value=f'=IF(COUNTIF({get_column_letter(11 + n)}6:{get_column_letter(11 + n)}{last},"done")=12,"ring lit",COUNTIF({get_column_letter(11 + n)}6:{get_column_letter(11 + n)}{last},"done")&" of 12")'); c.font = f(9, bold=True); c.alignment = Alignment(horizontal='center')
for cc in range(2, 18): db.cell(row=r, column=cc).border = BORDER
total_row = r
db.conditional_formatting.add(f'L6:Q{last}', CellIsRule(operator='equal', formula=['"done"'], fill=DONE_FILL))
db.conditional_formatting.add(f'L6:Q{last}', CellIsRule(operator='equal', formula=['"started"'], fill=STARTED_FILL))
db.conditional_formatting.add(f'L{total_row}:Q{total_row}', CellIsRule(operator='equal', formula=['"ring lit"'], fill=DONE_FILL))
r += 2
db.cell(row=r, column=2, value='Levels done').font = f(bold=True); db.cell(row=r, column=4, value=f'=D{total_row}&" of 72"').font = f(12, bold=True, color=NAVY)
db.cell(row=r + 1, column=2, value='Rings lit').font = f(bold=True); db.cell(row=r + 1, column=4, value=f'=COUNTIF(L{total_row}:Q{total_row},"ring lit")&" of 6"').font = f(12, bold=True, color=NAVY)
db.cell(row=r + 2, column=2, value='Answers').font = f(bold=True); db.cell(row=r + 2, column=4, value=f'=F{total_row}&" of "&G{total_row}').font = f(12, bold=True, color=NAVY)
db.cell(row=r, column=6, value='A band is done when every yellow cell in it holds an answer and every checklist item is Y. A ring lights when all twelve playbooks have finished a band. Start with band 1 on every playbook before going deeper: the same rule as the SPARKS planets.').font = f(9, italic=True, color='595959')
db.merge_cells(start_row=r, start_column=6, end_row=r + 2, end_column=10); db.cell(row=r, column=6).alignment = WRAP
r += 4
db.cell(row=r, column=2, value='Headline readings').font = f(13, bold=True, color=NAVY)
r += 1
for i, h in enumerate(['Reading', '', 'Value', 'Playbook', 'Rule of thumb']):
    if h:
        c = db.cell(row=r, column=2 + i, value=h); c.font = f(bold=True, color='FFFFFF'); c.fill = HEAD_FILL; c.border = BORDER
db.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
r += 1
headline = [
    ('Leads needed per month', 'Marketing Machine', 'Customers wanted over the close and booking rates', '#,##0'),
    ('Show rate (showed / booked)', 'Closing Handbook', 'Seven of ten', '0%'),
    ('Close rate, before (bought / showed)', 'Closing Handbook', '', '0%'),
    ('Lifetime gross profit per customer', 'Lifetime Value', '', '$#,##0'),
    ('Lifetime gross profit to cost of a customer', 'Lifetime Value', 'Three to one', '0.0"x"'),
    ('Monthly churn, before', 'Retention', '', '0.0%'),
    ('Customers you can lose and break even', 'Price Raise', 'Raise over margin plus raise', '0.0%'),
    ('Thirty-day ratio', 'Promo Cash', 'Above one, growth pays for itself', '0.00"x"'),
    ('Cost per customer, before', 'GOATed Ads', 'Against the lifetime gross profit', '$#,##0'),
    ('Procedures someone else runs', 'Implementation SOPs', '', '0%'),
]
hfirst = r
for lab, pb, rule, fmt in headline:
    db.cell(row=r, column=2, value=lab).font = f(); db.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    c = db.cell(row=r, column=4, value=f"=Readings!{HEAD[lab]}"); c.font = f(bold=True, color='008000'); c.number_format = fmt; c.alignment = Alignment(horizontal='right')
    db.cell(row=r, column=5, value=pb).font = f(9, color='595959')
    db.cell(row=r, column=6, value=rule).font = f(9, italic=True, color='595959'); db.merge_cells(start_row=r, start_column=6, end_row=r, end_column=10)
    for cc in range(2, 11): db.cell(row=r, column=cc).border = BORDER
    r += 1
# completion chart
ch_ = BarChart(); ch_.type = 'bar'; ch_.title = 'Share of each playbook answered'; ch_.style = 10; ch_.height = 9; ch_.width = 15; ch_.legend = None
data = Reference(db, min_col=10, min_row=5, max_row=last); cats = Reference(db, min_col=3, min_row=6, max_row=last)
ch_.add_data(data, titles_from_data=True); ch_.set_categories(cats)
ch_.series[0].graphicalProperties.solidFill = NAVY; ch_.y_axis.scaling.min = 0; ch_.y_axis.scaling.max = 1; ch_.y_axis.number_format = '0%'; ch_.y_axis.majorGridlines = None
db.add_chart(ch_, f'L{total_row + 2}')
db.freeze_panes = 'A6'

# ------------------------------------------------------------------ Start
st = wb.create_sheet('Start here', 0)
st.sheet_properties.tabColor = 'D9A63F'
st.sheet_view.showGridLines = False
st.column_dimensions['A'].width = 3; st.column_dimensions['B'].width = 26; st.column_dimensions['C'].width = 80
st['B1'] = 'The Binders'; st['B1'].font = f(22, bold=True, color=NAVY)
st['B2'] = 'A workbook that walks you through twelve business playbooks in four systems, one band at a time.'; st['B2'].font = f(11, italic=True, color='595959')
rows = [
    ('What it is', 'The playbook binder that shipped with the $100M Money Models launch holds twelve playbooks in four systems: Leads (Marketing Machine, Hooks, Lead Nurture), Sales (Closing Handbook, Proof Checklist, GOATed Ads), Delivery (Retention, Lifetime Value, Branding) and Profit (Price Raise, Promo Cash, Implementation SOPs). This workbook is a companion in its own words, built from the published $100M books and public material. No book or playbook text is reproduced, and it is not affiliated with Acquisition.com.'),
    ('How to use it', '1. Open a playbook tab (they run left to right in the order of the four systems).\n2. Work down band 1, then band 2, and so on. Type into the yellow cells only.\n3. Tick a checklist item by choosing Y. When every yellow cell in a band is filled and every item is Y, the band reads done.\n4. Come back to Dashboard to see all twelve at once, and to Readings for every figure the binder earns.\n5. Do band 1 on every playbook before going deeper. A ring lights on the Dashboard when all twelve clear a band.'),
    ('The six bands', '\n'.join(f"Band {b['n']}, {b['name']}: {b['meaning']} (payoff: {b['payoff']})." for b in T['bands'])),
    ('The four systems', '\n'.join(f"{s['label']}: {s['question']}" for s in T['systems'])),
    ('Colours', 'Yellow cell with blue text: yours to type. Black text: a formula, leave it. Green text: a value read from another tab, typed once and only there (price, gross margin, cost to acquire, the booking rate). Grey italic: an example answer for a made-up money coach who sells an eight-week programme; every example number is invented.'),
    ('Money and percentages', 'Type money in whole dollars. Type percentages as percentages (80%). A blank cell means not known yet; it is not zero. Type 0 only when the true answer is zero.'),
    ('Lists', 'Where a cell asks for one item a line, press Alt+Enter (Option+Return on a Mac) to start a new line inside the cell. Where a step asks for a small table, fill the rows under its grey header; add more rows on the sheet if eight is not enough.'),
    ('Rules of thumb', 'Three to one (lifetime gross profit to cost of a customer), five minutes (first reply to a lead), nine touches (the follow-up sequence), thirty days (cash back from a new customer) are rules of thumb, not findings. Your numbers decide.'),
    ('Privacy', 'This file lives wherever you save it. Nothing in it goes anywhere unless you send it.'),
    ('Version', f"Built from the Binders app in the Personalfinance repository, data version {T['version']}, {T['asOf']}."),
]
r = 4
for k, v in rows:
    st.cell(row=r, column=2, value=k).font = f(bold=True, color=NAVY); st.cell(row=r, column=2).alignment = TOP
    c = st.cell(row=r, column=3, value=v); c.font = f(); c.alignment = WRAP
    st.row_dimensions[r].height = 14 * sum(max(1, len(part) // 100 + 1) for part in v.split('\n')) + 6
    r += 1
st.cell(row=r + 1, column=2, value='Legend').font = f(bold=True, color=NAVY)
c = st.cell(row=r + 2, column=2, value='Yours to type'); c.fill = INPUT_FILL; c.font = BLUE_IN; c.border = BORDER
st.cell(row=r + 2, column=3, value='=IF(B' + str(r + 2) + '="","","This is what a filled cell looks like: type over the yellow.")').font = f(9, italic=True, color='595959')
c = st.cell(row=r + 3, column=2, value='=1+1'); c.font = f(); c.border = BORDER
st.cell(row=r + 3, column=3, value='A formula in black. Leave it.').font = f(9, italic=True, color='595959')
c = st.cell(row=r + 4, column=2, value="='Lifetime Value'!D1"); c.font = GREEN_LINK; c.border = BORDER
st.cell(row=r + 4, column=3, value='A value read from another tab, in green.').font = f(9, italic=True, color='595959')
c = st.cell(row=r + 5, column=2, value='an example'); c.font = f(9, italic=True, color='595959'); c.border = BORDER
st.cell(row=r + 5, column=3, value='An example answer, grey and italic. Every example number is made up.').font = f(9, italic=True, color='595959')

for ws in wb.worksheets:
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = 0.4
wb.active = 0
wb.save(OUT)
print('wrote', OUT, 'sheets', len(wb.sheetnames), 'facts', len(REG), 'logs', len(LOGREG))
