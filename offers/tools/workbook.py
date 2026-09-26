#!/usr/bin/env python3
"""offers/tools/workbook.py, the Offer Builder as a spreadsheet (OD-002).

Builds two files beside it: "Offer Builder.xlsx" (blank, yours to fill in)
and "Offer Builder (example).xlsx" (the example offer from data/demo.json).
One tab per planet, the exercises as fill-in rows, the readings as formulas
(one formula, one cell, referenced by name), a Dashboard with charts, and
the Offer Sheet. Needs openpyxl; recalculate with LibreOffice before shipping
(the xlsx skill's recalc.py, zero errors).

    python3 offers/tools/workbook.py
"""
import json, sys, os, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.chart import BarChart, LineChart, Reference, Series
from openpyxl.chart.label import DataLabelList
from openpyxl.comments import Comment

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DEMO = json.load(open(REPO + '/offers/data/demo.json'))['answers']

# ---- look --------------------------------------------------------------------
FONT = 'Arial'
NAVY = '1F3864'; INK = '222222'; MUTED = '6B7280'; LINE = 'D9DEE7'
INPUT_FILL = PatternFill('solid', fgColor='FFF9C4')     # soft yellow: you fill this in
HEAD_FILL = PatternFill('solid', fgColor=NAVY)
SUB_FILL = PatternFill('solid', fgColor='E8EDF5')
CALC_FILL = PatternFill('solid', fgColor='F3F4F6')
GOOD_FILL = PatternFill('solid', fgColor='DCFCE7')
CUT_FILL = PatternFill('solid', fgColor='FEE2E2')
KEEP_FILL = PatternFill('solid', fgColor='DCFCE7')
SOME_FILL = PatternFill('solid', fgColor='FEF3C7')
thin = Side(style='thin', color=LINE)
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
F_TITLE = Font(name=FONT, size=20, bold=True, color=NAVY)
F_SUB = Font(name=FONT, size=11, color=MUTED, italic=True)
F_H = Font(name=FONT, size=11, bold=True, color='FFFFFF')
F_SEC = Font(name=FONT, size=13, bold=True, color=NAVY)
F_LABEL = Font(name=FONT, size=10, bold=True, color=INK)
F_BODY = Font(name=FONT, size=10, color=INK)
F_NOTE = Font(name=FONT, size=9, color=MUTED, italic=True)
F_INPUT = Font(name=FONT, size=10, color='0000FF')
F_CALC = Font(name=FONT, size=10, bold=True, color=INK)
F_LINK = Font(name=FONT, size=10, color='008000')
WRAP = Alignment(wrap_text=True, vertical='top')
CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)

MONEY = '$#,##0;($#,##0);"-"'
PCT = '0%'
MULT = '0.0"x"'

def demo(key, sub=None, i=None):
    """A value from the example offer, or None for the blank file."""
    if not BUILD_DEMO: return None
    v = DEMO.get(key)
    if v is None: return None
    if i is not None:
        if i >= len(v): return None
        v = v[i]
        if sub: v = v.get(sub)
    return v

def cents(v): return None if v is None else v / 100.0

# ---- helpers ------------------------------------------------------------------
class Tab:
    def __init__(self, wb, title, heading, sub, widths):
        self.ws = wb.create_sheet(title)
        self.title = title
        ws = self.ws
        ws.sheet_view.showGridLines = False
        for col, w in widths.items(): ws.column_dimensions[col].width = w
        ws['B1'] = heading; ws['B1'].font = F_TITLE
        ws['B2'] = sub; ws['B2'].font = F_SUB
        ws.merge_cells('B2:H2'); ws['B2'].alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[2].height = 30
        self.row = 4
        self.progress_cells = []
        self.validations = {}

    def ref(self, col, row=None): return f"'{self.title}'!${col}${row or self.row}"

    def section(self, text, note=None, chapter=None):
        ws = self.ws; r = self.row + 1
        ws.cell(r, 2, text).font = F_SEC
        if chapter: ws.cell(r, 8, chapter).font = F_NOTE; ws.cell(r, 8).alignment = Alignment(horizontal='right')
        if note:
            r += 1; c = ws.cell(r, 2, note); c.font = F_BODY; c.alignment = WRAP
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
            ws.row_dimensions[r].height = max(18, 15 * (1 + len(note) // 120))
        self.row = r + 1
        return self.row

    def dv(self, kind, formula=None, lo=None, hi=None):
        key = (kind, formula, lo, hi)
        if key not in self.validations:
            if kind == 'list':
                d = DataValidation(type='list', formula1='"' + ','.join(formula) + '"', allow_blank=True, showDropDown=False)
            elif kind == 'whole':
                d = DataValidation(type='whole', operator='between', formula1=str(lo), formula2=str(hi), allow_blank=True)
                d.error = f'A whole number from {lo} to {hi}.'; d.errorTitle = 'Score'
            elif kind == 'date':
                d = DataValidation(type='date', operator='greaterThan', formula1='1', allow_blank=True)
            self.ws.add_data_validation(d); self.validations[key] = d
        return self.validations[key]

    def style_input(self, c, kind):
        c.fill = INPUT_FILL; c.font = F_INPUT; c.border = BORDER; c.alignment = WRAP
        if kind == 'money': c.number_format = MONEY
        elif kind == 'pct': c.number_format = PCT
        elif kind == 'date': c.number_format = 'mmm d, yyyy'
        elif kind == 'number': c.number_format = '#,##0'

    def input(self, label, kind='text', hint=None, options=None, lo=None, hi=None, value=None, name=None, count=True, height=None):
        """One labelled box: label in B, the box in C (merged C:E for text), the hint in F:H."""
        ws = self.ws; r = self.row
        ws.cell(r, 2, label).font = F_LABEL; ws.cell(r, 2).alignment = WRAP
        c = ws.cell(r, 3); self.style_input(c, kind)
        if kind in ('text', 'long'):
            ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
            for col in (4, 5): ws.cell(r, col).border = BORDER
        if value is not None: c.value = value
        if options: self.dv('list', tuple(options)).add(c)
        if kind == 'score': self.dv('whole', lo=lo, hi=hi).add(c); c.alignment = CENTER
        if kind == 'date': self.dv('date').add(c)
        if hint:
            h = ws.cell(r, 6, hint); h.font = F_NOTE; h.alignment = WRAP
            ws.merge_cells(start_row=r, start_column=6, end_row=r, end_column=8)
        if height: ws.row_dimensions[r].height = height
        elif kind == 'long': ws.row_dimensions[r].height = 45
        else: ws.row_dimensions[r].height = 22
        if name: NAMES[name] = self.ref('C', r)
        if count: self.progress_cells.append(self.ref('C', r))
        self.row += 1
        return f'C{r}'

    def calc(self, label, formula, fmt=None, note=None, name=None, wide=False):
        """A worked-out figure: label in B, formula in C, a note in F:H."""
        ws = self.ws; r = self.row
        ws.cell(r, 2, label).font = F_LABEL; ws.cell(r, 2).alignment = WRAP
        c = ws.cell(r, 3, formula); c.font = F_CALC; c.fill = CALC_FILL; c.border = BORDER; c.alignment = WRAP
        if wide:
            ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=8)
            for col in range(4, 9): ws.cell(r, col).border = BORDER
        if fmt: c.number_format = fmt
        if note and not wide:
            n = ws.cell(r, 6, note); n.font = F_NOTE; n.alignment = WRAP
            ws.merge_cells(start_row=r, start_column=6, end_row=r, end_column=8)
        ws.row_dimensions[r].height = 30 if wide else 22
        if name: NAMES[name] = self.ref('C', r)
        self.row += 1
        return f'C{r}'

    def table(self, cols, n, key=None, spans=None, start_col=2):
        """cols: (header, kind, fn_or_None, options, demo_sub). spans: grid columns per logical column.
        Returns (first_row, last_row, {header: start letter})."""
        ws = self.ws; r = self.row
        spans = spans or [1] * len(cols)
        letters, starts = {}, []
        col = start_col
        for i, c_ in enumerate(cols):
            starts.append(col); letters[c_[0]] = get_column_letter(col); col += spans[i]
        def merge(rr, i):
            if spans[i] > 1:
                ws.merge_cells(start_row=rr, start_column=starts[i], end_row=rr, end_column=starts[i] + spans[i] - 1)
                for cc in range(starts[i], starts[i] + spans[i]): ws.cell(rr, cc).border = BORDER
        for i, c_ in enumerate(cols):
            h = ws.cell(r, starts[i], c_[0]); h.font = F_H; h.fill = HEAD_FILL; h.alignment = CENTER; h.border = BORDER; merge(r, i)
        ws.row_dimensions[r].height = 30
        first = r + 1
        for k in range(n):
            rr = first + k
            ws.cell(rr, start_col - 1, k + 1).font = F_NOTE; ws.cell(rr, start_col - 1).alignment = Alignment(horizontal='right', vertical='top')
            for i, c_ in enumerate(cols):
                header, kind = c_[0], c_[1]
                c = ws.cell(rr, starts[i])
                if kind == 'formula':
                    c.value = c_[2](rr, letters); c.font = F_CALC; c.fill = CALC_FILL; c.border = BORDER; c.alignment = WRAP
                    if len(c_) > 3 and c_[3]: c.number_format = c_[3]
                    merge(rr, i); continue
                self.style_input(c, kind); merge(rr, i)
                options = c_[3] if len(c_) > 3 else None
                if options: self.dv('list', tuple(options)).add(c)
                sub = c_[4] if len(c_) > 4 else None
                if key and sub:
                    v = demo(key, sub, k)
                    if v is not None:
                        if kind == 'money': v = cents(v)
                        c.value = LABELS.get((key, sub, v), v) if isinstance(v, str) else v
            ws.row_dimensions[rr].height = 30
        last = first + n - 1
        self.progress_cells.append(f"'{self.title}'!${letters[cols[0][0]]}${first}")
        self.row = last + 1
        return first, last, letters

    def total(self, label, formula, fmt=None, name=None, col=3, label_col=2):
        ws = self.ws; r = self.row
        ws.cell(r, label_col, label).font = F_LABEL
        c = ws.cell(r, col, formula); c.font = F_CALC; c.fill = CALC_FILL; c.border = BORDER
        if fmt: c.number_format = fmt
        if name: NAMES[name] = self.ref(get_column_letter(col), r)
        self.row += 1
        return f'{get_column_letter(col)}{r}'

    def checklist(self, items, key=None, name=None):
        """A checklist: the item in B:G, a Done? dropdown in H. Returns the H range."""
        ws = self.ws; r = self.row
        h = ws.cell(r, 2, 'Step'); h.font = F_H; h.fill = HEAD_FILL; h.border = BORDER
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
        h2 = ws.cell(r, 8, 'Done?'); h2.font = F_H; h2.fill = HEAD_FILL; h2.alignment = CENTER; h2.border = BORDER
        first = r + 1
        ticked = demo(key) or {}
        if isinstance(ticked, list): ticked = {i: True for i in ticked}
        for k, (iid, text) in enumerate(items):
            rr = first + k
            c = ws.cell(rr, 2, text); c.font = F_BODY; c.alignment = WRAP; c.border = BORDER
            ws.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=7)
            for col in range(3, 8): ws.cell(rr, col).border = BORDER
            d = ws.cell(rr, 8); self.style_input(d, 'text'); d.alignment = CENTER
            self.dv('list', ('Yes', 'Not yet')).add(d)
            if ticked.get(iid): d.value = 'Yes'
            ws.row_dimensions[rr].height = 30
        last = first + len(items) - 1
        rng = f'H{first}:H{last}'
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"Yes"'], fill=GOOD_FILL, font=Font(name=FONT, color='166534', bold=True)))
        self.row = last + 1
        done = self.total('Done', f'=COUNTIF({rng},"Yes")&" of {len(items)}"', name=name, col=8, label_col=7)
        self.progress_cells.append(f"'{self.title}'!$H${first}")
        return rng, first, last

    def gap(self, n=1): self.row += n

    def finish(self, planet_name):
        ws = self.ws
        ws.freeze_panes = 'A4'
        # progress: how many of this tab's exercises have their first box filled
        cells = self.progress_cells
        f = '=(' + '+'.join(f'IF({c}="",0,1)' for c in cells) + f')/{len(cells)}'
        ws['H1'] = f; ws['H1'].number_format = '0%'; ws['H1'].font = Font(name=FONT, size=14, bold=True, color=NAVY); ws['H1'].alignment = Alignment(horizontal='right')
        ws['G1'] = 'Filled in'; ws['G1'].font = F_NOTE; ws['G1'].alignment = Alignment(horizontal='right', vertical='center')
        NAMES['Progress_' + planet_name] = self.ref('H', 1)
        ws.page_setup.orientation = 'landscape'; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_options.horizontalCentered = True

NAMES = {}
LABELS = {}
WIDTHS = {'A': 4, 'B': 34, 'C': 30, 'D': 22, 'E': 22, 'F': 18, 'G': 18, 'H': 22, 'I': 3}

# Human labels for the example's coded values
OPT = {
    'commodity': ['Price. Cheapest wins.', 'Mostly price, with a bit of trust.', 'Mostly what they get, price second.', 'Something only I offer.'],
    'market': ['Health', 'Wealth', 'Relationships', 'Something else'],
    'period': ['One time', 'Per month', 'Per year'],
    'position': ['The cheapest around', 'Below the middle', 'About the middle', 'Above the middle', 'The most expensive'],
    'proofKind': ['A result I got', "A client's result", 'A credential', 'A guarantee', 'A sample or demo', 'Numbers'],
    'driver': ['The dream outcome', 'Belief it will work', 'Time', 'Effort or sacrifice'],
    'group': ['One to one', 'Small group', 'One to many'], 'effort': ['Do it yourself', 'Done with you', 'Done for you'],
    'medium': ['Live', 'Recorded', 'Written', 'A tool or template'], 'speed': ['Same day', 'Within a week', 'When scheduled'],
    'hl': ['High', 'Low'], 'said': ['Yes', 'Not now', 'Too much', 'No answer yet'],
    'scarcity': ['A limited number of clients or seats each period', 'A bonus only for the first few', 'This version goes away after the window', 'None yet'],
    'urgency': ['A cohort with a start date', 'A seasonal or themed promotion', 'A price or bonus deadline', 'An opportunity that closes on its own', 'None yet'],
    'bonusKind': ['A tool or template', 'A checklist', 'A training', 'Access to you or a group', "A partner's product", 'A done for you piece'],
    'guarantee': ['Unconditional', 'Conditional', 'Anti guarantee', 'Implied (pay by result)', 'Two stacked'],
    'reaction': ['It closed the deal', 'It helped', 'No difference', 'It worried them'],
    'container': ['Challenge', 'Blueprint', 'System', 'Bootcamp', 'Program', 'Accelerator', 'Masterclass', 'Intensive', 'Method', 'Sprint'],
    'wrapper': ['The name', 'A bonus', 'The guarantee', 'The scarcity', 'The urgency', 'How the price is framed'],
    'yesno': ['It has a name', 'No name yet'],
}
CODES = {
    'commodityNow': dict(zip(['price', 'mostlyPrice', 'mostlyValue', 'onlyMe'], OPT['commodity'])),
    'marketCore': dict(zip(['health', 'wealth', 'relationships', 'other'], OPT['market'])),
    'pricePeriod': dict(zip(['once', 'month', 'year'], OPT['period'])),
    'pricePosition': dict(zip(['cheapest', 'below', 'middle', 'above', 'top'], OPT['position'])),
    'scarcityKind': dict(zip(['seats', 'bonus', 'gone', 'none'], OPT['scarcity'])),
    'urgencyKind': dict(zip(['cohort', 'season', 'deadline', 'window', 'none'], OPT['urgency'])),
    'guaranteeKind': dict(zip(['unconditional', 'conditional', 'anti', 'implied', 'stacked'], OPT['guarantee'])),
    'hasName': dict(zip(['yes', 'no'], OPT['yesno'])),
}
for key, sub, codes, labels in [
    ('proof', 'kind', ['mine', 'client', 'credential', 'guarantee', 'sample', 'numbers'], OPT['proofKind']),
    ('problems', 'driver', ['dream', 'likely', 'time', 'effort'], OPT['driver']),
    ('vehicles', 'group', ['one', 'small', 'many'], OPT['group']), ('vehicles', 'effort', ['diy', 'dwy', 'dfy'], OPT['effort']),
    ('vehicles', 'medium', ['live', 'recorded', 'written', 'tool'], OPT['medium']), ('vehicles', 'speed', ['sameDay', 'week', 'scheduled'], OPT['speed']),
    ('vehicles', 'value', ['high', 'low'], OPT['hl']), ('vehicles', 'cost', ['high', 'low'], OPT['hl']),
    ('priceTests', 'said', ['yes', 'notNow', 'tooMuch', 'noAnswer'], OPT['said']),
    ('bonuses', 'kind', ['tool', 'checklist', 'training', 'access', 'partner', 'dfy'], OPT['bonusKind']),
    ('guaranteeTests', 'reaction', ['closed', 'helped', 'same', 'worried'], OPT['reaction']),
    ('wrapperRotations', 'what', ['name', 'bonus', 'guarantee', 'scarcity', 'urgency', 'framing'], OPT['wrapper']),
]:
    for c, l in zip(codes, labels): LABELS[(key, sub, c)] = l

def dval(key):
    v = demo(key)
    if v is None: return None
    return CODES[key].get(v, v) if key in CODES else v

def dmoney(key): return cents(demo(key))

def build(is_demo, out):
    global BUILD_DEMO, NAMES
    BUILD_DEMO = is_demo; NAMES = {}
    wb = Workbook(); wb.remove(wb.active)

    # ==================================================================
    # 1 CROWD
    # ==================================================================
    t = Tab(wb, '1 Crowd', 'Crowd: the starving crowd', 'Section II, chapters 3 and 4. A commodity is anything a buyer compares on price alone. The way out is a narrow crowd that badly wants what you do. A good market shows four signs: massive pain, purchasing power, easy to target, growing.', WIDTHS)
    t.section('1.1 What you sell today', 'Say it the way you would to a stranger. The second box is the book\'s commodity test.', 'Chapter 3')
    t.input('What you sell, and to whom', 'long', value=demo('offerNow'))
    c = t.input('When a prospect compares you with others, what do they decide on?', 'text', options=OPT['commodity'], value=dval('commodityNow'), name='Commodity', hint='Pick one. Price means commodity; the rest of this workbook is how to stop being one.')
    t.calc('Where you sit', f'=IF({c}="","",IF({c}="{OPT["commodity"][0]}","A commodity today. Buyers pick on price.",IF({c}="{OPT["commodity"][1]}","Mostly a commodity. Trust helps a little, price decides.",IF({c}="{OPT["commodity"][2]}","Mostly differentiated. Price comes second.","A category of one. Price barely comes up."))))', wide=True, name='CommodityRead')
    t.section('1.2 The market you are in', 'The book names health, wealth and relationships as the three markets that never go away.', 'Chapter 4')
    t.input('The big market', 'text', options=OPT['market'], value=dval('marketCore'), name='MarketCore')
    t.input('Who buys from you now, in a few words', 'text', value=demo('marketWho'), name='MarketWho')
    t.section('1.3 The four signs of a starving crowd', 'Score each 1 to 5. Massive pain: they need it, not just want it. Purchasing power: they can pay. Easy to target: one place, list or group holds them. Growing: more of them every year.', 'Chapter 4')
    signs = [('Massive pain', 'painScore', '1 is a mild wish, 5 keeps them up at night'), ('Purchasing power', 'payScore', '1 is no spare money, 5 is they already spend on this'), ('Easy to target', 'targetScore', '1 is scattered everywhere, 5 is one group holds them'), ('Growing', 'growthScore', '1 is shrinking, 5 is growing fast')]
    sign_cells = []
    for label, key, hint in signs:
        sign_cells.append(t.input(label, 'score', lo=1, hi=5, value=demo(key), hint='1 to 5. ' + hint))
    rng = f'{sign_cells[0]}:{sign_cells[-1]}'
    lab_rng = f'B{sign_cells[0][1:]}:B{sign_cells[-1][1:]}'
    NAMES['SignScores'] = f"'1 Crowd'!$C${sign_cells[0][1:]}:$C${sign_cells[-1][1:]}"
    NAMES['SignLabels'] = f"'1 Crowd'!$B${sign_cells[0][1:]}:$B${sign_cells[-1][1:]}"
    t.calc('Starving crowd score (of 20)', f'=IF(COUNT({rng})<4,"",SUM({rng}))', name='MarketScore', note='16 or more is a starving crowd. Under 12, the book would look for a hungrier crowd first.')
    t.calc('The weakest sign', f'=IF(COUNT({rng})<4,"",INDEX({lab_rng},MATCH(MIN({rng}),{rng},0)))', name='WeakestSign')
    t.calc('What that means', f'=IF(COUNT({rng})<4,"",IF(SUM({rng})>=16,"A starving crowd.",IF(SUM({rng})>=12,"A decent market.","A thin market. Find a hungrier crowd before building more.")))', wide=True)
    t.section('1.4 The pain in their words', 'Three or more things this crowd says or complains about, in their own words, not yours. These come back in the problems list.', 'Chapter 4')
    f, l, L = t.table([('In their words', 'text', None, None, 'quote')], 5, key='painQuotes', spans=[5])
    t.total('Lines written', f'=IF(COUNTA(B{f}:B{l})=0,"",COUNTA(B{f}:B{l})&" of 3 or more")')
    t.section('1.5 The niche ladder', 'Start broad, then narrow three times. At each rung write the price the same help could sell for. The book\'s example goes from time management for anyone to time management for one industry\'s salespeople, with the price rising many times over.', 'Chapter 4, riches in niches')
    f, l, L = t.table([('Rung: who it is for (broad at the top, narrow at the bottom)', 'text', None, None, 'niche'), ('What it could sell for', 'money', None, None, 'price')], 5, key='nicheLadder', spans=[3, 1])
    P = L['What it could sell for']
    NAMES['LadderPrices'] = f"'1 Crowd'!${P}${f}:${P}${l}"; NAMES['LadderNames'] = f"'1 Crowd'!$B${f}:$B${l}"
    t.total('Narrowest over broadest', f'=IF(OR(COUNT({P}{f}:{P}{l})<2,{P}{f}=0),"",INDEX({P}{f}:{P}{l},COUNT({P}{f}:{P}{l}))/{P}{f})', fmt=MULT, name='LadderMultiple')
    t.ws.cell(t.row - 1, 4, 'How many times the price rises from the first rung to the last one filled in (fill the rungs from the top).').font = F_NOTE
    t.section('1.6 Commit to one', 'Pick the rung you will serve. The book\'s warning: people switch niches before the niche can pay them.', 'Chapter 4')
    t.input('The niche you commit to (your avatar)', 'text', value=demo('nicheChosen'), name='Niche')
    t.checklist([('gather', 'I can name where these people gather: a place, a group, a list'), ('pay', 'They can pay what I plan to charge'), ('grow', 'There are more of them each year, or at least not fewer'), ('stay', 'I will stay with this niche long enough to learn its language')], key='nicheCommit', name='NicheCommitDone')
    t.section('1.7 Where to find them', 'Places you can reach this crowd, and roughly how many are in each.', 'Chapter 4, easy to target')
    f, l, L = t.table([('The place', 'text', None, None, 'where'), ('Roughly how many', 'number', None, None, 'count')], 5, key='channels', spans=[3, 1])
    t.total('Reach, added up', f'=IF(COUNT(E{f}:E{l})=0,"",SUM(E{f}:E{l}))', fmt='#,##0', name='Reach')
    t.section('1.8 Prove the crowd is starving', 'Do these in the world, then mark them done.', 'Chapter 4')
    t.checklist([('talked', 'Talked to three people in the niche about the pain'), ('spend', 'Found one paid alternative they already spend money on'), ('growing', 'Found one sign the market is growing: a trend, a count, a new rule'), ('words', 'Wrote down the exact words they use for the problem (1.4)')], key='crowdProof', name='CrowdProofDone')
    t.finish('Crowd')

    # ==================================================================
    # 2 PRICE
    # ==================================================================
    t = Tab(wb, '2 Price', 'Price: charge what it is worth', 'Section II, chapter 5. Lowering a price starts a vicious cycle: less margin, less service, worse results, less proof, more pressure to lower it again. Raising it starts the opposite cycle. Charge so much it hurts, then build so much value the price feels small.', WIDTHS)
    t.section('2.1 Your price today', 'Cost is your time at the rate you would pay someone else, plus materials, tools and the refunds you eat.', 'Chapter 5')
    pn = t.input('Price today', 'money', value=dmoney('priceNow'), name='PriceNow')
    pp = t.input('Charged', 'text', options=OPT['period'], value=dval('pricePeriod'), name='Period')
    cn = t.input('What one delivery costs you, roughly', 'money', value=dmoney('costNow'), name='CostNow')
    t.calc('Gross margin today', f'=IF(OR({pn}="",{cn}="",{pn}=0),"",({pn}-{cn})/{pn})', fmt=PCT, name='MarginNow', note='Under half is where the vicious cycle starts.')
    t.calc('What you keep, per sale', f'=IF(OR({pn}="",{cn}=""),"",{pn}-{cn})', fmt=MONEY, name='ProfitNow')
    t.section('2.2 Where you sit', 'Be honest about the position. The close rate is your baseline for the Prove steps.', 'Chapter 5')
    t.input('Against the alternatives your crowd sees, your price is', 'text', options=OPT['position'], value=dval('pricePosition'), name='Position')
    t.input('Of ten people you pitch, how many say yes (as a percent)', 'pct', value=demo('closeRateNow'), name='CloseRateNow', hint='Type 20% for two in ten.')
    t.section('2.3 Which cycle you are in', 'Mark every line that is true of your business this year. The count says which loop you are riding.', 'Chapter 5, the two cycles')
    down_rng, df, dl = t.checklist([('discount', 'I lower the price to win deals'), ('demanding', 'Clients expect a lot and value it little'), ('noService', 'I cannot afford to give the service I would like to'), ('worseResults', 'Clients get worse results than they could'), ('chasing', 'I am always chasing the next sale'), ('resent', 'I resent some of the work')], key='cycleSigns')
    t.gap()
    up_rng, uf, ul = t.checklist([('committed', 'The clients who pay more are the most committed'), ('betterResults', 'The clients who pay more get better results'), ('overDeliver', 'I can afford to over-deliver'), ('funds', 'The margin pays for better help and better marketing'), ('proud', 'I am proud to say the price'), ('referrals', 'Good clients send more good clients')], key='cycleGood')
    # the demo stores cycleSigns/cycleGood as arrays of ids: mark them
    if is_demo:
        for rng_, first_, items_key in ((down_rng, df, 'cycleSigns'), (up_rng, uf, 'cycleGood')):
            ids = {'cycleSigns': ['discount', 'demanding', 'noService', 'worseResults', 'chasing', 'resent'], 'cycleGood': ['committed', 'betterResults', 'overDeliver', 'funds', 'proud', 'referrals']}[items_key]
            for k, iid in enumerate(ids): t.ws.cell(first_ + k, 8).value = 'Yes' if iid in DEMO[items_key] else None
    t.calc('The loop you are riding', f'=IF(COUNTIF({down_rng},"Yes")+COUNTIF({up_rng},"Yes")=0,"",IF(COUNTIF({down_rng},"Yes")>COUNTIF({up_rng},"Yes"),"The vicious cycle: "&COUNTIF({down_rng},"Yes")&" of its six signs are true. The way out is the price, not the hours.",IF(COUNTIF({up_rng},"Yes")>COUNTIF({down_rng},"Yes"),"The virtuous cycle: "&COUNTIF({up_rng},"Yes")&" of its six signs are true. Keep the price where it belongs.","A foot in each loop. The next price move decides.")))', wide=True, name='CycleRead')
    NAMES['DownCount'] = f"'2 Price'!$H${dl + 1}"; NAMES['UpCount'] = f"'2 Price'!$H${ul + 1}"
    t.section('2.4 What the outcome is worth', 'If the client gets the dream outcome, what is it worth to them in money over a year? Revenue gained, cost stopped, time back at their rate, a pain made to stop. The gap between this and your price is what makes an offer a Grand Slam.', 'Chapter 5')
    ow = t.input('Worth to the client, a year', 'money', value=dmoney('outcomeWorth'), name='OutcomeWorth')
    t.input('How you got the number', 'long', value=demo('outcomeWorthWhy'))
    t.calc('Worth against today\'s price', f'=IF(OR({ow}="",{pn}="",{pn}=0),"",{ow}/{pn})', fmt=MULT, name='GapNow', note='10x or more is a Grand Slam gap. 3x is real. Under 3x, the outcome is probably worth more than you wrote.')
    t.section('2.5 Charge so much it hurts', 'Pick a price that makes you a little uncomfortable to say out loud, and the revenue you want in a year. The table shows how many clients each price needs.', 'Chapter 5')
    pw = t.input('The new price (charged the same way as today)', 'money', value=dmoney('priceNew'), name='PriceNew')
    rg = t.input('Revenue you want in a year', 'money', value=dmoney('revenueGoal'), name='RevenueGoal')
    per = f'IF({pp}="Per month",12,1)'
    t.calc('Clients needed a year at today\'s price', f'=IF(OR({rg}="",{pn}="",{pn}=0,{pp}=""),"",ROUNDUP({rg}/({pn}*{per}),0))', fmt='#,##0', name='ClientsOld')
    t.calc('Clients needed a year at the new price', f'=IF(OR({rg}="",{pw}="",{pw}=0,{pp}=""),"",ROUNDUP({rg}/({pw}*{per}),0))', fmt='#,##0', name='ClientsNew', note='Fewer people, more care each.')
    t.calc('Worth against the new price', f'=IF(OR({ow}="",{pw}="",{pw}=0),"",{ow}/{pw})', fmt=MULT, name='GapNew')
    t.gap()
    # the curve table: price points from half to three times today's price
    r0 = t.row
    for i, h in enumerate(['Price point', 'Clients needed a year', 'Margin at that price']):
        c = t.ws.cell(r0, 2 + i, h); c.font = F_H; c.fill = HEAD_FILL; c.alignment = CENTER; c.border = BORDER
    mults = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]
    for k, m in enumerate(mults):
        rr = r0 + 1 + k
        a = t.ws.cell(rr, 2, f'=IF({pn}="","",{pn}*{m})'); a.number_format = MONEY; a.font = F_BODY; a.border = BORDER; a.fill = CALC_FILL
        b = t.ws.cell(rr, 3, f'=IF(OR({rg}="",{pn}="",{pp}=""),"",ROUNDUP({rg}/({pn}*{m}*{per}),0))'); b.number_format = '#,##0'; b.font = F_BODY; b.border = BORDER; b.fill = CALC_FILL
        d = t.ws.cell(rr, 4, f'=IF(OR({pn}="",{cn}=""),"",({pn}*{m}-{cn})/({pn}*{m}))'); d.number_format = PCT; d.font = F_BODY; d.border = BORDER; d.fill = CALC_FILL
        t.ws.cell(rr, 5, f'{m:g} times today').font = F_NOTE
    NAMES['CurvePrices'] = f"'2 Price'!$B${r0 + 1}:$B${r0 + len(mults)}"; NAMES['CurveClients'] = f"'2 Price'!$C${r0 + 1}:$C${r0 + len(mults)}"
    t.row = r0 + len(mults) + 1
    t.section('2.6 The premium price checklist', 'The conditions the book puts around a high price. A line you cannot mark yet points at the Offer or Enhancers tab.', 'Chapter 5')
    t.checklist([('noApology', 'I can say the new price without apologising or adding a discount'), ('gap', 'The offer gives back many times the price (worth to price is 3 to 1 or better)'), ('adds', 'I know what I will add so the price feels small (the Offer tab)'), ('noCompare', 'I have stopped comparing my price with the cheapest alternative')], key='premiumChecks', name='PremiumDone')
    t.section('2.7 Say it out loud', 'Offer the new price to three real prospects and write down what each one said. A no at a high price teaches more than a yes at a low one.', 'Chapter 5')
    f, l, L = t.table([('Who (first name or a note)', 'text', None, None, 'who'), ('They said', 'text', None, OPT['said'], 'said')], 6, key='priceTests', spans=[3, 1])
    t.total('Close rate at the new price', f'=IF(COUNTA(E{f}:E{l})=0,"",COUNTIF(E{f}:E{l},"Yes")/COUNTA(E{f}:E{l}))', fmt=PCT, name='CloseRateTested')
    t.section('2.8 Your margin at the new price', 'Uses the delivery costs you put on the stack (Offer tab) where you have them, else today\'s delivery cost.', 'Chapter 5')
    t.calc('Cost used', '=IF(StackCost<>"",StackCost,IF(CostNow="","",CostNow))', fmt=MONEY, name='CostUsed', note='From the Offer tab\'s stack when its cost column is filled, else today\'s delivery cost.')
    t.calc('Margin at the new price', '=IF(OR(PriceNew="",CostUsed="",PriceNew=0),"",(PriceNew-CostUsed)/PriceNew)', fmt=PCT, name='MarginNew')
    t.calc('What you keep, per client', '=IF(OR(PriceNew="",CostUsed=""),"",PriceNew-CostUsed)', fmt=MONEY, name='ProfitNew')
    t.finish('Price')

    # ==================================================================
    # 3 VALUE
    # ==================================================================
    t = Tab(wb, '3 Value', 'Value: the value equation', 'Section III, chapter 6. Value = (dream outcome x perceived likelihood) / (time delay x effort and sacrifice). Raise the top, shrink the bottom. The bottom matters most, and the book\'s goal for it is zero.', WIDTHS)
    t.section('3.1 Rate the offer as it is', 'Score each 1 to 10. Dream outcome: how big and wanted (10 is life-changing). Likelihood: how sure they feel it works for them (10 is certain). Time delay: how long until they notice a result (10 is a very long wait). Effort: how much they must do and give up (10 is a great deal).', 'Chapter 6')
    v_now = [t.input(lbl + ' (1 to 10)', 'score', lo=1, hi=10, value=demo(k)) for lbl, k in [('Dream outcome', 'dreamNow'), ('Perceived likelihood', 'likelyNow'), ('Time delay, 10 is long', 'timeNow'), ('Effort and sacrifice, 10 is a lot', 'effortNow')]]
    d, li, ti, e = v_now
    NAMES['RatingsNow'] = f"'3 Value'!$C${d[1:]}:$C${e[1:]}"
    t.calc('Value score, before', f'=IF(COUNT({d}:{e})<4,"",({d}*{li})/({ti}*{e}))', fmt='0.00', name='ValueNow', note='Top over bottom. Higher is better; 1 means the top only equals the bottom.')
    t.calc('What that says', f'=IF(COUNT({d}:{e})<4,"",IF({ti}*{e}>=25,"The bottom is heavy: time and effort are where this offer loses value.",IF({d}*{li}<=25,"The top is light: a bigger promise or more proof would lift it.","Both halves are working; the bottom still has room.")))', wide=True)
    t.section('3.2 The dream outcome', 'Write the result they want, in their words. Not what you do; what they get, and who they get to be.', 'Chapter 6')
    t.input('The dream outcome, in their words', 'long', value=demo('dreamOutcome'), name='Dream')
    t.input('Who they get to be, in the eyes of people they care about', 'text', value=demo('dreamStatus'), name='DreamStatus')
    t.section('3.3 Why they will believe it', 'The proof that makes a stranger believe this will work for someone like them. The more it looks like them, the more it counts.', 'Chapter 6, perceived likelihood')
    f, l, L = t.table([('Kind', 'text', None, OPT['proofKind'], 'kind'), ('What it is', 'text', None, None, 'what')], 6, key='proof', spans=[1, 5])
    client_lbl = OPT['proofKind'][1]
    t.total('Pieces of proof', f'=IF(COUNTA(B{f}:B{l})=0,"",COUNTA(B{f}:B{l})&IF(COUNTIF(B{f}:B{l},"' + client_lbl + '")=0,", none yet a client result (the kind that raises belief most)",", including a client result"))', name='ProofRead')
    t.section('3.4 Time to the first win', 'The book\'s fix for a long wait is a fast win: something real inside days, while the big result takes its time.', 'Chapter 6, time delay')
    t.input('The first thing they will notice', 'text', value=demo('firstWinWhat'), name='FirstWin')
    fd = t.input('Days until they notice it', 'number', value=demo('firstWinDays'), name='FirstWinDays')
    fw = t.input('Weeks to the full result', 'number', value=demo('fullResultWeeks'), name='FullWeeks')
    t.calc('Read', f'=IF(OR({fd}="",{fw}=""),"",IF({fd}<=7,"A first win inside a week, which is what the book asks for. Full result in "&{fw}&" weeks.","The book would look for something they can feel inside the first week. Full result in "&{fw}&" weeks."))', wide=True)
    t.section('3.5 What it costs them beyond money', 'Every hour, habit and thing they must give up, and how the offer takes each one off them.', 'Chapter 6, effort and sacrifice')
    f, l, L = t.table([('What they must do or give up', 'text', None, None, 'what'), ('How the offer removes or softens it', 'text', None, None, 'fix')], 6, key='sacrifices', spans=[3, 3])
    t.total('Sacrifices with a fix', f'=IF(COUNTA(B{f}:B{l})=0,"",COUNTA(E{f}:E{l})&" of "&COUNTA(B{f}:B{l}))', name='SacrificesFixed')
    t.section('3.6 Tighten the bottom of the equation', 'The book\'s aim for the bottom is zero: no wait, no work. Each mark moves you toward it.', 'Chapter 6')
    t.checklist([('weekOne', 'The offer promises a first win inside the first week, or says exactly when'), ('noNewTools', 'Asks the client to learn nothing they do not already use'), ('hardestDone', 'Does the hardest step with them or for them'), ('allFixed', 'Has a fix for every sacrifice on the list')], key='bottomChecks', name='BottomDone')
    t.section('3.7 Rate the new offer', 'Score it again, as it stands after the Offer and Enhancers tabs. Be as hard on it as a stranger would be.', 'Chapter 6')
    v_new = [t.input(lbl + ' (1 to 10)', 'score', lo=1, hi=10, value=demo(k)) for lbl, k in [('Dream outcome', 'dreamNew'), ('Perceived likelihood', 'likelyNew'), ('Time delay, 10 is long', 'timeNew'), ('Effort and sacrifice, 10 is a lot', 'effortNew')]]
    d2, l2, t2, e2 = v_new
    NAMES['RatingsNew'] = f"'3 Value'!$C${d2[1:]}:$C${e2[1:]}"
    t.calc('Value score, after', f'=IF(COUNT({d2}:{e2})<4,"",({d2}*{l2})/({t2}*{e2}))', fmt='0.00', name='ValueNew')
    t.calc('How much it moved', '=IF(OR(ValueNow="",ValueNew=""),"",ValueNew/ValueNow)', fmt=MULT, name='ValueChange', note='The after score as a multiple of the before.')
    t.finish('Value')

    # ==================================================================
    # 4 OFFER
    # ==================================================================
    t = Tab(wb, '4 Offer', 'Offer: problems, solutions, trim and stack', 'Section III, chapters 8 to 10. Loosen up, list every problem on the way to the dream outcome, turn each into a solution, brainstorm ways to deliver every solution, sort by value and cost, keep the high value ones, drop the rest, then name and price what is left.', WIDTHS)
    t.section('4.1 Warm up: the brick', 'Set a two minute timer and list every use you can think of for a brick. Quantity is the point; no judging.', 'Chapter 8, divergent thinking')
    f, l, L = t.table([('A use for a brick', 'text', None, None, 'use')], 15, key='brickUses', spans=[3])
    t.total('Uses found', f'=IF(COUNTA(B{f}:B{l})=0,"",COUNTA(B{f}:B{l})&IF(COUNTA(B{f}:B{l})>=12," in two minutes: well warmed up",IF(COUNTA(B{f}:B{l})>=8," in two minutes: warmed up"," so far; five or more counts")))', name='BrickRead')
    t.section('4.2 The trip from here to there', 'The steps your client goes through, from today to the dream outcome, in order. Three to eight is typical. Every step is a place something goes wrong.', 'Chapter 9')
    f, l, L = t.table([('Step', 'text', None, None, 'step')], 8, key='journeySteps', spans=[5])
    t.section('4.3 Every problem, and its solution', 'For each step: what goes wrong, what they fear, what takes too long, what is a hassle. Aim past ten. Tag each with the part of the value equation it hurts. Then flip it: how to get the outcome even if, or without, the problem.', 'Chapter 9, steps 2 and 3')
    f, l, L = t.table([('The problem, in their words', 'text', None, None, 'problem'), ('It hurts', 'text', None, OPT['driver'], 'driver'), ('How to ... (the solution)', 'text', None, None, 'solution')], 15, key='problems', spans=[2, 1, 4])
    NAMES['ProblemsRange'] = f"'4 Offer'!$B${f}:$B${l}"; NAMES['DriversRange'] = f"'4 Offer'!$D${f}:$D${l}"; NAMES['SolutionsRange'] = f"'4 Offer'!$E${f}:$E${l}"
    t.total('Problems listed', f'=IF(COUNTA(B{f}:B{l})=0,"",COUNTA(B{f}:B{l})&" (eight or more)")')
    t.total('Solutions written', f'=IF(COUNTA(B{f}:B{l})=0,"",COUNTA(E{f}:E{l})&" of "&COUNTA(B{f}:B{l}))', name='SolutionsRead')
    for i, drv in enumerate(OPT['driver']):
        t.total('Problems that hurt ' + drv.lower(), f'=COUNTIF(D{f}:D{l},"{drv}")', fmt='0', name='Driver' + str(i + 1))
    t.section('4.4 Ways to deliver each solution', 'For each solution, pick how it could be delivered, then rate its value to the client and its cost to you. Two more questions from the book: if you charged ten times the price, what would you do? If a tenth, what would you have to do? The verdict is the trim: high value and low cost stays, high value and high cost stays if you can afford it, low value goes.', 'Chapter 10, steps 4 and 5')
    verdict = lambda rr, L: f'=IF(OR({L["Value to them"]}{rr}="",{L["Cost to you"]}{rr}=""),"",IF({L["Value to them"]}{rr}="Low","Cut",IF({L["Cost to you"]}{rr}="Low","Keep","Keep if affordable")))'
    f, l, L = t.table([('The solution it delivers', 'text', None, None, 'solution'), ('Group', 'text', None, OPT['group'], 'group'), ('Who does the work', 'text', None, OPT['effort'], 'effort'), ('Medium', 'text', None, OPT['medium'], 'medium'), ('Speed', 'text', None, OPT['speed'], 'speed'), ('Value to them', 'text', None, OPT['hl'], 'value'), ('Cost to you', 'text', None, OPT['hl'], 'cost'), ('Verdict', 'formula', verdict)], 15, key='vehicles')
    vr = f'I{f}:I{l}'
    t.ws.conditional_formatting.add(vr, CellIsRule(operator='equal', formula=['"Keep"'], fill=KEEP_FILL))
    t.ws.conditional_formatting.add(vr, CellIsRule(operator='equal', formula=['"Keep if affordable"'], fill=SOME_FILL))
    t.ws.conditional_formatting.add(vr, CellIsRule(operator='equal', formula=['"Cut"'], fill=CUT_FILL))
    t.total('Keep', f'=COUNTIF({vr},"Keep")', fmt='0', name='KeepCount'); t.total('Keep if affordable', f'=COUNTIF({vr},"Keep if affordable")', fmt='0', name='KeepSomeCount'); t.total('Cut', f'=COUNTIF({vr},"Cut")', fmt='0', name='CutCount')
    t.section('4.5 Name and price every piece', 'Give each kept piece a name a client would repeat, say what it solves, and the price it would sell for on its own. Your cost per piece is optional and feeds the margin on the Price tab.', 'Chapter 10, the stack')
    f, l, L = t.table([('Name', 'text', None, None, 'name'), ('What it solves', 'text', None, None, 'solves'), ('Worth on its own', 'money', None, None, 'valueCents'), ('Your cost to deliver (optional)', 'money', None, None, 'costCents')], 8, key='stack', spans=[1, 3, 1, 1])
    NAMES['StackNames'] = f"'4 Offer'!$B${f}:$B${l}"; NAMES['StackSolves'] = f"'4 Offer'!$C${f}:$C${l}"; NAMES['StackWorth'] = f"'4 Offer'!$F${f}:$F${l}"
    t.total('The stack adds up to', f'=IF(COUNT(F{f}:F{l})=0,"",SUM(F{f}:F{l}))', fmt=MONEY, name='StackTotal', col=6, label_col=2)
    t.total('Your cost, added up (blank if none entered)', f'=IF(COUNT(G{f}:G{l})=0,"",SUM(G{f}:G{l}))', fmt=MONEY, name='StackCost', col=7, label_col=2)
    t.calc('The stack against the price', '=IF(OR(StackTotal="",PriceUsed="",PriceUsed=0),"",StackTotal/PriceUsed)', fmt=MULT, name='StackMultiple', note='Uses the new price when there is one, else today\'s. 5x or more is the book\'s kind of gap.')
    t.section('4.6 The offer checklist', 'The book\'s conditions for a finished core offer.', 'Chapters 9 and 10')
    t.checklist([('everySolved', 'Every problem on the list is solved by a piece of the stack or a bonus'), ('noDeadWeight', 'Nothing low value and high cost survived the trim'), ('manyTimes', 'The stack adds up to many times the price'), ('hardestDone', 'The hardest thing for the client is done for them or with them'), ('names', 'Each piece has a name a client would repeat')], key='offerChecks', name='OfferDone')
    t.section('4.7 Show it to someone', 'Walk two people who fit the niche through the stack. Not friends who will be kind: people who could buy.', 'Section V')
    f, l, L = t.table([('Who', 'text', None, None, 'who'), ('What they said', 'text', None, None, 'said'), ('What you changed', 'text', None, None, 'changed')], 4, key='offerFeedback', spans=[1, 3, 3])
    t.finish('Offer')

    # ==================================================================
    # 5 ENHANCERS
    # ==================================================================
    t = Tab(wb, '5 Enhancers', 'Enhancers: scarcity, urgency, bonuses, guarantees', 'Section IV, chapters 11 to 14. Four things make a good offer irresistible without changing the core. All four must be true.', WIDTHS)
    t.section('5.1 What holds them back', 'The reasons people give for not buying, in their words. Every bonus answers one; the guarantee answers the biggest.', 'Chapter 13')
    f, l, L = t.table([('In their words', 'text', None, None, 'objection')], 6, key='objections', spans=[5])
    t.section('5.2 Scarcity, honestly', 'A true limit on how many people can have this. Your hours, your capacity and the cohort size are where real limits come from. A false limit costs more trust than it earns.', 'Chapter 11')
    sk = t.input('The kind', 'text', options=OPT['scarcity'], value=dval('scarcityKind'), name='ScarcityKind')
    sc = t.input('The number', 'number', value=demo('scarcityCount'), name='ScarcityCount')
    t.input('Why the limit is real', 'long', value=demo('scarcityWhy'))
    t.calc('Your scarcity, in one line', f'=IF({sk}="","",IF({sk}="None yet","No scarcity yet. How many you can serve well each month is usually the true limit.",IF({sc}="","Add the number.",IF({sk}="{OPT["scarcity"][0]}","Only "&{sc}&" places each round.",IF({sk}="{OPT["scarcity"][1]}","The bonus goes to the first "&{sc}&" only.","This version is sold "&{sc}&" more times, then it goes away.")))))', wide=True, name='ScarcityLine')
    t.section('5.3 Urgency, honestly', 'A true reason the decision cannot wait. The date must be one you will hold.', 'Chapter 12')
    uk = t.input('The kind', 'text', options=OPT['urgency'], value=dval('urgencyKind'), name='UrgencyKind')
    ud = t.input('The date', 'date', value=(datetime.date.fromisoformat(demo('urgencyDate')) if demo('urgencyDate') else None), name='UrgencyDate')
    t.input('Why the date is real', 'long', value=demo('urgencyWhy'))
    t.calc('Days left', f'=IF(OR({ud}="",{uk}="None yet"),"",{ud}-TODAY())', fmt='0', name='DaysLeft', note='Counted from the day the file is opened.')
    t.calc('Your urgency, in one line', f'=IF({uk}="","",IF({uk}="None yet","No urgency yet. A cohort start date is the book\'s most natural kind.",IF({ud}="","Add the date.",IF({uk}="{OPT["urgency"][0]}","The next group starts on ",IF({uk}="{OPT["urgency"][1]}","This runs until ",IF({uk}="{OPT["urgency"][2]}","The price and bonuses hold until ","The window closes on ")))&TEXT({ud},"mmmm d, yyyy")&".")))', wide=True, name='UrgencyLine')
    t.section('5.4 Bonuses', 'Three or more. Each answers one worry, has a price of its own, and something that proves it. Offer them after the core price. Prefer tools, checklists and templates to more training. A partner\'s product can be a bonus.', 'Chapter 13')
    f, l, L = t.table([('Name', 'text', None, None, 'name'), ('The worry it answers', 'text', None, None, 'solves'), ('Kind', 'text', None, OPT['bonusKind'], 'kind'), ('Worth on its own', 'money', None, None, 'valueCents'), ('Proof, or the picture it paints', 'text', None, None, 'proof')], 6, key='bonuses', spans=[1, 1, 1, 1, 3])
    NAMES['BonusNames'] = f"'5 Enhancers'!$B${f}:$B${l}"; NAMES['BonusSolves'] = f"'5 Enhancers'!$C${f}:$C${l}"; NAMES['BonusKinds'] = f"'5 Enhancers'!$D${f}:$D${l}"; NAMES['BonusWorth'] = f"'5 Enhancers'!$E${f}:$E${l}"
    t.total('Bonuses add up to', f'=IF(COUNT(E{f}:E{l})=0,"",SUM(E{f}:E{l}))', fmt=MONEY, name='BonusTotal', col=5, label_col=2)
    t.calc('Stack and bonuses together', '=IF(AND(StackTotal="",BonusTotal=""),"",N(StackTotal)+N(BonusTotal))', fmt=MONEY, name='OfferTotal')
    t.calc('Against the price', '=IF(OR(OfferTotal="",PriceUsed="",PriceUsed=0),"",OfferTotal/PriceUsed)', fmt=MULT, name='OfferMultiple')
    t.calc('A tool or checklist among them?', f'=IF(COUNTA(B{f}:B{l})=0,"",IF(COUNTIF(D{f}:D{l},"A tool or template")+COUNTIF(D{f}:D{l},"A checklist")>0,"Yes, as the book prefers.","Not yet. The book prefers a tool or checklist to more training."))', wide=True)
    t.section('5.5 The bonus checklist', 'The book\'s own list for bonuses.', 'Chapter 13')
    t.checklist([('named', 'Each bonus has a name of its own'), ('worry', 'Each bonus answers one specific worry from the list'), ('priced', 'Each has a price and one line saying why it is worth that'), ('proof', 'Each has proof, or a picture of life with it'), ('tool', 'At least one is a tool, checklist or template rather than more training'), ('after', 'They are offered after the core price is named, not folded into it')], key='bonusChecks', name='BonusDone')
    t.section('5.6 The guarantee', 'Unconditional: money back, no questions. Conditional: do these steps and get this result, or this happens. Anti guarantee: all sales final, with the reason said out loud. Implied: you pay when it works. The book stacks two where it can, and frames a conditional one as: if you do X, you get Y, or Z.', 'Chapter 14')
    t.input('The kind', 'text', options=OPT['guarantee'], value=dval('guaranteeKind'), name='GuaranteeKind')
    t.input('The guarantee, word for word', 'long', value=demo('guaranteeText'), name='GuaranteeText', height=60)
    t.input('What the client must do for it to hold (conditional or stacked)', 'text', value=demo('guaranteeCondition'), name='GuaranteeCondition', count=False)
    t.section('5.7 Enhancers you can stand behind', 'Every enhancer works only while it is true.', 'Chapters 11 to 14')
    t.checklist([('scarcityTrue', 'The scarcity number is true and I would say it to a friend'), ('deadlineHeld', 'The deadline is real and I will hold it'), ('affordClaims', 'I can afford the guarantee if one client in ten claims it'), ('bonusCost', 'Every bonus can be delivered without extra hours per client, or its cost is in the price')], key='enhancerChecks', name='EnhancerDone')
    t.section('5.8 Try the guarantee on a real prospect', 'Say it to two real prospects and write down how each one reacted.', 'Chapter 14')
    f, l, L = t.table([('Who', 'text', None, None, 'who'), ('Reaction', 'text', None, OPT['reaction'], 'reaction')], 4, key='guaranteeTests')
    t.total('Good reactions', f'=IF(COUNTA(C{f}:C{l})=0,"",(COUNTIF(C{f}:C{l},"It closed the deal")+COUNTIF(C{f}:C{l},"It helped"))&" of "&COUNTA(C{f}:C{l}))', name='GuaranteeTested')
    t.calc('Enhancers in play', '=(IF(OR(ScarcityKind="",ScarcityKind="None yet"),0,1)+IF(OR(UrgencyKind="",UrgencyKind="None yet"),0,1)+IF(BonusTotal="",0,1)+IF(GuaranteeText="",0,1))&" of 4"', name='EnhancersInPlay')
    t.finish('Enhancers')

    # ==================================================================
    # 6 NAME
    # ==================================================================
    t = Tab(wb, '6 Name', 'Name: MAGIC and the launch', 'Section IV, chapter 15 and Section V. A name is the wrapper, and a wrapper can be refreshed without touching the offer. MAGIC: a Magnetic reason why, Announce the avatar, Give them a goal, Indicate a time interval, Complete with a container word.', WIDTHS)
    t.section('6.1 What it is called today', 'No name is a fine answer.', 'Chapter 15')
    t.input('Today', 'text', options=OPT['yesno'], value=dval('hasName'))
    t.input('The name, if it has one', 'text', value=demo('nameNow'), count=False)
    t.section('6.2 The offer in one line', 'Who gets what, by when, without what, or else what. A suggestion is built from the other tabs; write your own version in the box.', 'Section V')
    t.calc('Built from the other tabs', '=IF(AND(Niche="",Dream=""),"",IF(Niche="",MarketWho,Niche)&" get "&IF(Dream="","the result",Dream)&IF(FullWeeks=""," in "&FullWeeks&" weeks","")&IF(GuaranteeText="",""," Or: "&GuaranteeText))', wide=True)
    t.ws.row_dimensions[t.row - 1].height = 60
    t.input('The offer in one line, in your words', 'long', value=demo('oneLine'), name='OneLine', height=60)
    t.section('6.3 M A G I C', 'Fill the five parts; three names are built from them below.', 'Chapter 15')
    mr = t.input('Magnetic reason why (a season, an event, a milestone, a group)', 'text', value=demo('magicReason'))
    ma = t.input('Announce the avatar (who it is for, short)', 'text', value=demo('magicAvatar'))
    mg = t.input('Give them a goal (the result in a few words)', 'text', value=demo('magicGoal'))
    mi = t.input('Indicate a time interval (6 Week, 30 Day)', 'text', value=demo('magicInterval'))
    mc = t.input('Complete with a container word', 'text', options=OPT['container'], value=demo('magicContainer'))
    parts = f'COUNTA({mr},{ma},{mg},{mi},{mc})'
    t.calc('Name 1', f'=IF({parts}<5,"","The "&{mi}&" "&{mg}&" "&{mc})', wide=True, name='Name1')
    t.calc('Name 2', f'=IF({parts}<5,"","The "&{mr}&" "&{mg}&" "&{mc}&" for "&{ma})', wide=True, name='Name2')
    t.calc('Name 3', f'=IF({parts}<5,"","The "&{ma}&" "&{mg}&" "&{mc}&": "&{mi})', wide=True, name='Name3')
    t.section('6.4 Pick the name', 'Choose one of the built names or write your own version. Say it out loud three times.', 'Chapter 15')
    t.input('The name', 'text', value=demo('nameChosen'), name='NameChosen')
    t.section('6.5 Name every piece', 'The book names the bonuses and the pieces of the stack the same way as the offer.', 'Chapter 15')
    t.checklist([('who', 'The name says who it is for'), ('result', 'The name says the result'), ('when', 'The name says how long'), ('container', 'It ends in a container word'), ('pieces', 'Each piece of the stack and each bonus has a name that makes sense on its own')], key='nameChecks', name='NameDone')
    t.section('6.6 Beat offer fatigue', 'An offer gets tired in the market long before the core stops working. Plan to change the wrapper on a rhythm and leave the core alone.', 'Chapter 15')
    f, l, L = t.table([('What changes', 'text', None, OPT['wrapper'], 'what'), ('When, roughly', 'text', None, None, 'whenNext')], 5, key='wrapperRotations', spans=[1, 4])
    t.section('6.7 Launch', 'The last two are the launch itself.', 'Section V')
    t.checklist([('sheet', 'The offer sheet (last tab) is complete'), ('price', 'The price on it is the new price, said without a discount'), ('words', 'The guarantee, scarcity and urgency are in the exact words I will use'), ('ten', 'It went in front of at least ten people who fit the niche'), ('tracked', 'I wrote down every answer')], key='launchChecks', name='LaunchDone')
    t.section('6.8 First results', 'The close rate at the new price against the old one, and cash per pitch: fewer, better clients, paying more.', 'Section V')
    pi = t.input('People offered it', 'number', value=demo('pitched'), name='Pitched')
    cl = t.input('Said yes', 'number', value=demo('closed'), name='Closed')
    ca = t.input('Cash collected', 'money', value=dmoney('cashCollected'), name='Cash')
    t.calc('Close rate at the new price', f'=IF(OR({pi}="",{cl}="",{pi}=0),"",{cl}/{pi})', fmt=PCT, name='CloseRateNew')
    t.calc('Close rate before (from the Price tab)', '=IF(CloseRateNow="","",CloseRateNow)', fmt=PCT)
    t.calc('Cash for every pitch', f'=IF(OR({pi}="",{ca}="",{pi}=0),"",{ca}/{pi})', fmt=MONEY, name='CashPerPitch')
    t.finish('Name')

    # ==================================================================
    # DASHBOARD (inserted first)
    # ==================================================================
    NAMES['PriceUsed'] = None  # defined below as a formula name
    ws = wb.create_sheet('Dashboard', 0)
    ws.sheet_view.showGridLines = False
    for col, w in {'A': 3, 'B': 30, 'C': 18, 'D': 4, 'E': 30, 'F': 18, 'G': 4, 'H': 30, 'I': 18}.items(): ws.column_dimensions[col].width = w
    ws['B1'] = 'Offer Builder'; ws['B1'].font = F_TITLE
    ws['B2'] = 'The exercises of $100M Offers (Alex Hormozi, 2021), one tab per part. Yellow cells are yours to fill in; grey cells work themselves out. Nothing here is advice; the book has the reasoning, this has the work.' + (' THIS COPY CARRIES THE EXAMPLE OFFER: a made-up strength program for new fathers, with invented numbers.' if is_demo else '')
    ws['B2'].font = F_SUB; ws['B2'].alignment = WRAP; ws.merge_cells('B2:I2'); ws.row_dimensions[2].height = 42
    # legend
    r = 4
    ws.cell(r, 2, 'How to use it').font = F_SEC; r += 1
    for text, fill, font in [('A yellow cell with blue text is yours to type in. Dropdowns open when you click the cell.', INPUT_FILL, F_INPUT), ('A grey cell works itself out. Leave it alone.', CALC_FILL, F_CALC), ('A checklist row turns green when you pick Yes.', GOOD_FILL, F_BODY)]:
        c = ws.cell(r, 2, 'example'); c.fill = fill; c.font = font; c.border = BORDER; c.alignment = CENTER
        d = ws.cell(r, 3, text); d.font = F_BODY; ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=9); r += 1
    ws.cell(r, 2, 'Go through the tabs in order, left to right. Each tab is one part of the book; each numbered section is one exercise. Every figure on this page comes from those tabs.').font = F_BODY
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=9); r += 2

    # progress by planet
    ws.cell(r, 2, 'Where you stand').font = F_SEC; r += 1
    for i, h in enumerate(['Part of the book', 'Filled in']):
        c = ws.cell(r, 2 + i, h); c.font = F_H; c.fill = HEAD_FILL; c.border = BORDER; c.alignment = CENTER
    pr0 = r + 1
    for k, (tab, label) in enumerate([('Crowd', '1 Crowd: the starving crowd'), ('Price', '2 Price: charge what it is worth'), ('Value', '3 Value: the value equation'), ('Offer', '4 Offer: problems, solutions, the stack'), ('Enhancers', '5 Enhancers: scarcity, urgency, bonuses, guarantee'), ('Name', '6 Name: MAGIC and the launch')]):
        rr = pr0 + k
        a = ws.cell(rr, 2, label); a.font = F_BODY; a.border = BORDER; a.hyperlink = f"#'{k + 1} {tab}'!A1"; a.font = Font(name=FONT, size=10, color='1F3864', underline='single')
        b = ws.cell(rr, 3, f'=Progress_{tab}'); b.number_format = '0%'; b.font = F_LINK; b.border = BORDER; b.alignment = CENTER
    ws.conditional_formatting.add(f'C{pr0}:C{pr0 + 5}', CellIsRule(operator='equal', formula=['1'], fill=GOOD_FILL))
    rr = pr0 + 6
    ws.cell(rr, 2, 'The whole offer').font = F_LABEL; ws.cell(rr, 2).border = BORDER
    c = ws.cell(rr, 3, f'=AVERAGE(C{pr0}:C{pr0 + 5})'); c.number_format = '0%'; c.font = F_CALC; c.fill = CALC_FILL; c.border = BORDER; c.alignment = CENTER
    # key readings, right side
    kr = pr0 - 1
    for i, h in enumerate(['Reading', 'Figure']):
        c = ws.cell(kr, 5 + i, h); c.font = F_H; c.fill = HEAD_FILL; c.border = BORDER; c.alignment = CENTER
    readings = [
        ('Starving crowd score (of 20)', '=IF(MarketScore="","not yet",MarketScore)', None),
        ('Weakest sign of the four', '=IF(WeakestSign="","not yet",WeakestSign)', None),
        ('Margin today', '=IF(MarginNow="","not yet",MarginNow)', PCT),
        ("Worth against today's price", '=IF(GapNow="","not yet",GapNow)', MULT),
        ('Clients needed a year, new price', '=IF(ClientsNew="","not yet",ClientsNew)', '#,##0'),
        ('Value score, before', '=IF(ValueNow="","not yet",ValueNow)', '0.00'),
        ('Value score, after', '=IF(ValueNew="","not yet",ValueNew)', '0.00'),
        ('Pieces kept after the trim', '=IF(COUNTA(SolutionsRange)=0,"not yet",KeepCount+KeepSomeCount)', '0'),
        ('The stack adds up to', '=IF(StackTotal="","not yet",StackTotal)', MONEY),
        ('Stack and bonuses against the price', '=IF(OfferMultiple="","not yet",OfferMultiple)', MULT),
        ('Enhancers in play', '=EnhancersInPlay', None),
        ('Margin at the new price', '=IF(MarginNew="","not yet",MarginNew)', PCT),
        ('Close rate, before', '=IF(CloseRateNow="","not yet",CloseRateNow)', PCT),
        ('Close rate at the new price', '=IF(CloseRateNew="","not yet",CloseRateNew)', PCT),
    ]
    for k, (label, formula, fmt) in enumerate(readings):
        rr = kr + 1 + k
        a = ws.cell(rr, 5, label); a.font = F_BODY; a.border = BORDER
        b = ws.cell(rr, 6, formula); b.font = F_LINK; b.border = BORDER; b.alignment = Alignment(horizontal='right')
        if fmt: b.number_format = fmt
    # the name and the one line
    rr = kr + 1
    ws.cell(rr, 8, 'The offer').font = F_H; ws.cell(rr, 8).fill = HEAD_FILL; ws.cell(rr, 8).border = BORDER; ws.merge_cells(start_row=rr, start_column=8, end_row=rr, end_column=9)
    c = ws.cell(rr + 1, 8, '=IF(NameChosen="","Unnamed, so far",NameChosen)'); c.font = Font(name=FONT, size=14, bold=True, color=NAVY); c.alignment = WRAP; ws.merge_cells(start_row=rr + 1, start_column=8, end_row=rr + 2, end_column=9)
    c = ws.cell(rr + 3, 8, '=IF(OneLine="","The one-line offer is written on the Name tab, 6.2.",OneLine)'); c.font = F_BODY; c.alignment = WRAP; ws.merge_cells(start_row=rr + 3, start_column=8, end_row=rr + 8, end_column=9)
    c = ws.cell(rr + 9, 8, '=IF(GuaranteeText="","",GuaranteeText)'); c.font = F_NOTE; c.alignment = WRAP; ws.merge_cells(start_row=rr + 9, start_column=8, end_row=rr + 13, end_column=9)

    # chart data blocks (below), and the charts
    cr = kr + len(readings) + 3
    ws.cell(cr, 2, 'Pictures').font = F_SEC; cr += 1
    # 1: four signs
    d0 = cr
    ws.cell(d0, 2, 'Sign').font = F_LABEL; ws.cell(d0, 3, 'Score of 5').font = F_LABEL
    for k in range(4):
        ws.cell(d0 + 1 + k, 2, f'=INDEX(SignLabels,{k + 1})').font = F_BODY
        ws.cell(d0 + 1 + k, 3, f'=IF(INDEX(SignScores,{k + 1})="",0,INDEX(SignScores,{k + 1}))').font = F_LINK
    ch = BarChart(); ch.type = 'bar'; ch.style = 10; ch.title = 'The four signs of a starving crowd'; ch.y_axis.title = 'Score of 5'; ch.y_axis.scaling.min = 0; ch.y_axis.scaling.max = 5
    ch.add_data(Reference(ws, min_col=3, min_row=d0, max_row=d0 + 4), titles_from_data=True); ch.set_categories(Reference(ws, min_col=2, min_row=d0 + 1, max_row=d0 + 4))
    ch.legend = None; ch.height = 7; ch.width = 14; ch.series[0].graphicalProperties.solidFill = '3987E5'
    ws.add_chart(ch, f'E{d0}')
    # 2: value equation before / after
    d1 = d0 + 6
    ws.cell(d1, 2, 'Part of the equation').font = F_LABEL; ws.cell(d1, 3, 'Before').font = F_LABEL; ws.cell(d1, 4, 'After').font = F_LABEL
    ws.column_dimensions['D'].width = 12
    for k, lbl in enumerate(['Dream outcome', 'Likelihood', 'Time delay', 'Effort']):
        ws.cell(d1 + 1 + k, 2, lbl).font = F_BODY
        ws.cell(d1 + 1 + k, 3, f'=IF(INDEX(RatingsNow,{k + 1})="",0,INDEX(RatingsNow,{k + 1}))').font = F_LINK
        ws.cell(d1 + 1 + k, 4, f'=IF(INDEX(RatingsNew,{k + 1})="",0,INDEX(RatingsNew,{k + 1}))').font = F_LINK
    ch = BarChart(); ch.type = 'bar'; ch.style = 10; ch.title = 'The value equation, before and after'; ch.y_axis.scaling.min = 0; ch.y_axis.scaling.max = 10
    ch.add_data(Reference(ws, min_col=3, max_col=4, min_row=d1, max_row=d1 + 4), titles_from_data=True); ch.set_categories(Reference(ws, min_col=2, min_row=d1 + 1, max_row=d1 + 4))
    ch.height = 7; ch.width = 14; ch.series[0].graphicalProperties.solidFill = '9CA3AF'; ch.series[1].graphicalProperties.solidFill = '3987E5'
    ws.add_chart(ch, f'E{d1 + 9}')
    # 3: clients needed curve
    d2 = d1 + 6
    ws.cell(d2, 2, 'Price point').font = F_LABEL; ws.cell(d2, 3, 'Clients a year').font = F_LABEL
    for k in range(8):
        a = ws.cell(d2 + 1 + k, 2, f'=IF(INDEX(CurvePrices,{k + 1})="","",INDEX(CurvePrices,{k + 1}))'); a.number_format = MONEY; a.font = F_LINK
        b = ws.cell(d2 + 1 + k, 3, f'=IF(INDEX(CurveClients,{k + 1})="",0,INDEX(CurveClients,{k + 1}))'); b.font = F_LINK
    ch = LineChart(); ch.style = 12; ch.title = 'Clients needed a year, at each price'; ch.y_axis.title = 'Clients'; ch.x_axis.title = 'Price'
    ch.add_data(Reference(ws, min_col=3, min_row=d2, max_row=d2 + 8), titles_from_data=True); ch.set_categories(Reference(ws, min_col=2, min_row=d2 + 1, max_row=d2 + 8))
    ch.legend = None; ch.height = 7; ch.width = 14; ch.series[0].graphicalProperties.line.solidFill = '3987E5'; ch.series[0].graphicalProperties.line.width = 28000; ch.series[0].smooth = False
    ws.add_chart(ch, f'E{d2 + 12}')
    # 4: stack, bonuses, price
    d3 = d2 + 10
    ws.cell(d3, 2, 'Piece').font = F_LABEL; ws.cell(d3, 3, 'Amount').font = F_LABEL
    for k, (lbl, fml) in enumerate([('The stack', '=IF(StackTotal="",0,StackTotal)'), ('The bonuses', '=IF(BonusTotal="",0,BonusTotal)'), ('Your price', '=IF(PriceUsed="",0,PriceUsed)'), ('Worth to them, a year', '=IF(OutcomeWorth="",0,OutcomeWorth)')]):
        ws.cell(d3 + 1 + k, 2, lbl).font = F_BODY
        c = ws.cell(d3 + 1 + k, 3, fml); c.number_format = MONEY; c.font = F_LINK
    ch = BarChart(); ch.type = 'bar'; ch.style = 10; ch.title = 'What it adds up to, against the price'; ch.y_axis.number_format = '$#,##0'
    ch.add_data(Reference(ws, min_col=3, min_row=d3, max_row=d3 + 4), titles_from_data=True); ch.set_categories(Reference(ws, min_col=2, min_row=d3 + 1, max_row=d3 + 4))
    ch.legend = None; ch.height = 7; ch.width = 14; ch.series[0].graphicalProperties.solidFill = '199E70'
    ws.add_chart(ch, f'E{d3 + 15}')
    ws.freeze_panes = 'A4'
    ws.page_setup.orientation = 'landscape'; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True

    # ==================================================================
    # OFFER SHEET (last)
    # ==================================================================
    ws = wb.create_sheet('Offer Sheet')
    ws.sheet_view.showGridLines = False
    for col, w in {'A': 3, 'B': 34, 'C': 40, 'D': 16, 'E': 16, 'F': 3}.items(): ws.column_dimensions[col].width = w
    ws['B1'] = '=IF(NameChosen="","Unnamed offer",NameChosen)'; ws['B1'].font = Font(name=FONT, size=22, bold=True, color=NAVY); ws.merge_cells('B1:E1'); ws.row_dimensions[1].height = 34
    ws['B2'] = '=IF(OneLine="","The one-line offer is written on the Name tab, 6.2.",OneLine)'; ws['B2'].font = Font(name=FONT, size=12, color=INK); ws['B2'].alignment = WRAP; ws.merge_cells('B2:E2'); ws.row_dimensions[2].height = 64
    r = 4
    def sheet_sec(title):
        nonlocal r
        c = ws.cell(r, 2, title.upper()); c.font = Font(name=FONT, size=9, bold=True, color=MUTED); c.border = Border(top=thin)
        for col in range(3, 6): ws.cell(r, col).border = Border(top=thin)
        r += 1
    def sheet_line(formula, bold=False, h=None, note=False):
        nonlocal r
        c = ws.cell(r, 2, formula); c.font = F_NOTE if note else (F_LABEL if bold else F_BODY); c.alignment = WRAP; ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
        ws.row_dimensions[r].height = h or 30; r += 1
    sheet_sec('Who it is for'); sheet_line('=IF(Niche="",IF(MarketWho="","Not chosen yet (Crowd tab, 1.6)",MarketWho&" (the starting avatar; Crowd 1.6 narrows it)"),Niche)')
    sheet_sec('The dream outcome'); sheet_line('=IF(Dream="","Not written yet (Value tab, 3.2)",Dream)', h=45)
    sheet_line('=IF(DreamStatus="","","They get to be "&DreamStatus&".")', note=True, h=20)
    sheet_line('=IF(FirstWinDays="","","First win: "&FirstWin&" in "&FirstWinDays&" days. Full result in "&FullWeeks&" weeks.")', note=True, h=20)
    sheet_sec('What you get')
    for i, h in enumerate(['Piece', 'What it solves', 'Worth']):
        c = ws.cell(r, 2 + i, h); c.font = F_H; c.fill = HEAD_FILL; c.border = BORDER; c.alignment = CENTER
    ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=5); r += 1
    for k in range(8):
        a = ws.cell(r, 2, f'=IF(INDEX(StackNames,{k + 1})="","",INDEX(StackNames,{k + 1}))'); a.font = F_BODY; a.alignment = WRAP
        b = ws.cell(r, 3, f'=IF(INDEX(StackSolves,{k + 1})="","",INDEX(StackSolves,{k + 1}))'); b.font = F_BODY; b.alignment = WRAP
        c = ws.cell(r, 4, f'=IF(INDEX(StackWorth,{k + 1})="","",INDEX(StackWorth,{k + 1}))'); c.number_format = MONEY; c.font = F_BODY; ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=5); c.alignment = Alignment(horizontal='right')
        ws.row_dimensions[r].height = 26; r += 1
    ws.cell(r, 2, 'The stack').font = F_LABEL; c = ws.cell(r, 4, '=IF(StackTotal="","",StackTotal)'); c.number_format = MONEY; c.font = F_CALC; c.alignment = Alignment(horizontal='right'); ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=5); r += 1
    sheet_sec('Bonuses')
    for i, h in enumerate(['Bonus', 'The worry it answers', 'Kind', 'Worth']):
        c = ws.cell(r, 2 + i, h); c.font = F_H; c.fill = HEAD_FILL; c.border = BORDER; c.alignment = CENTER
    r += 1
    for k in range(6):
        for col, nm in ((2, 'BonusNames'), (3, 'BonusSolves'), (4, 'BonusKinds'), (5, 'BonusWorth')):
            c = ws.cell(r, col, f'=IF(INDEX({nm},{k + 1})="","",INDEX({nm},{k + 1}))'); c.font = F_BODY; c.alignment = WRAP
            if nm == 'BonusWorth': c.number_format = MONEY; c.alignment = Alignment(horizontal='right')
        ws.row_dimensions[r].height = 26; r += 1
    ws.cell(r, 2, 'The bonuses').font = F_LABEL; c = ws.cell(r, 5, '=IF(BonusTotal="","",BonusTotal)'); c.number_format = MONEY; c.font = F_CALC; c.alignment = Alignment(horizontal='right'); r += 1
    sheet_sec('The price')
    c = ws.cell(r, 2, '=IF(PriceUsed="","Not set yet (Price tab)",PriceUsed)'); c.number_format = MONEY; c.font = Font(name=FONT, size=20, bold=True, color=NAVY)
    d = ws.cell(r, 3, '=IF(Period="","",IF(Period="Per month","a month",IF(Period="Per year","a year","one time")))'); d.font = F_BODY; ws.row_dimensions[r].height = 30; r += 1
    sheet_line('=IF(OfferMultiple="","","Everything above adds up to "&TEXT(OfferTotal,"$#,##0")&", "&TEXT(OfferMultiple,"0.0")&"x the price.")', note=True, h=20)
    sheet_line('=IF(OR(OutcomeWorth="",PriceUsed=""),"","The outcome is worth about "&TEXT(OutcomeWorth,"$#,##0")&" a year to them, "&TEXT(OutcomeWorth/PriceUsed,"0.0")&"x the price.")', note=True, h=20)
    sheet_sec('The guarantee'); sheet_line('=IF(GuaranteeText="","Not written yet (Enhancers tab, 5.6)",IF(GuaranteeKind="","",GuaranteeKind&": ")&GuaranteeText)', h=50)
    sheet_line('=IF(GuaranteeCondition="","","It holds when the client "&GuaranteeCondition&".")', note=True, h=20)
    sheet_sec('Why now, and why not everyone'); sheet_line('=IF(ScarcityLine="","Scarcity not set yet (Enhancers tab, 5.2)",ScarcityLine)'); sheet_line('=IF(UrgencyLine="","Urgency not set yet (Enhancers tab, 5.3)",UrgencyLine)')
    sheet_sec('The value equation'); sheet_line('=IF(ValueNow="","Not rated yet (Value tab, 3.1)",IF(ValueNew="","Value score "&TEXT(ValueNow,"0.0")&" before. Rate it again after the Offer and Enhancers tabs (Value 3.7).","The value score went from "&TEXT(ValueNow,"0.0")&" to "&TEXT(ValueNew,"0.0")&", "&TEXT(ValueChange,"0.0")&"x what it was."))')
    ws.page_setup.orientation = 'portrait'; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True

    # ---- names ----------------------------------------------------------------
    NAMES['PriceUsed'] = None
    for nm, ref in NAMES.items():
        if nm == 'PriceUsed':
            dn = DefinedName('PriceUsed', attr_text="IF('2 Price'!$C$" + NAMES['PriceNew'].split('$')[-1] + "=\"\",'2 Price'!$C$" + NAMES['PriceNow'].split('$')[-1] + ",'2 Price'!$C$" + NAMES['PriceNew'].split('$')[-1] + ")")
        else:
            dn = DefinedName(nm, attr_text=ref)
        wb.defined_names[nm] = dn
    wb.properties.creator = 'Offer Builder'; wb.properties.title = 'Offer Builder: the exercises of $100M Offers'
    wb.save(out)
    print('wrote', out)

if __name__ == '__main__':
    build(False, REPO + '/offers/Offer Builder.xlsx')
    build(True, REPO + '/offers/Offer Builder (example).xlsx')
