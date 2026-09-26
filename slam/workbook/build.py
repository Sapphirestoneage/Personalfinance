"""Builds numbers-workbook.xlsx: the SLAM engine as a spreadsheet.
One tab to fill in (pink cells), the rest computes. Same formulas as the app."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.chart import BarChart, PieChart, LineChart, Reference
from openpyxl.chart.series import DataPoint
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else 'numbers-workbook.xlsx'

# ---------- palette ----------
PLUM = '22131D'; ROSE = 'BE185D'; ROSE_SOFT = 'F9A8D4'; BLUSH = 'FCE7F3'; BLUSH_2 = 'FDF2F8'
MAUVE = '85687A'; LINE = 'ECDCE6'; INK = '22131D'; GOLD = 'FDF6EC'; GOLD_INK = '9A6512'; GREEN_INK = '1F6B47'; GREEN_FILL = 'E4F3EA'
FONT = 'Arial'

def font(size=10, bold=False, color=INK, italic=False):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic)
fill = lambda hex_: PatternFill('solid', start_color=hex_, end_color=hex_)
thin = Side(style='thin', color=LINE)
BORDER = Border(top=thin, bottom=thin, left=thin, right=thin)
BOTTOM = Border(bottom=Side(style='thin', color=ROSE_SOFT))
WRAP = Alignment(wrap_text=True, vertical='center')
CENTER = Alignment(horizontal='center', vertical='center')
RIGHT = Alignment(horizontal='right', vertical='center')

MONEY = '$#,##0;($#,##0);"-"'
MONEY2 = '$#,##0.00;($#,##0.00);"-"'
PCT = '0%;(0%);"-"'
PCT1 = '0.0%;(0.0%);"-"'
NUM1 = '#,##0.0;(#,##0.0);"-"'
NUM0 = '#,##0;(#,##0);"-"'

wb = Workbook()

def title(ws, text, sub=None, width=8):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=width)
    c = ws.cell(row=1, column=1, value=text)
    c.font = Font(name='Georgia', size=18, bold=True, color='FFFFFF')
    c.fill = fill(PLUM); c.alignment = Alignment(vertical='center', indent=1)
    for col in range(1, width + 1):
        ws.cell(row=1, column=col).fill = fill(PLUM)
    ws.row_dimensions[1].height = 34
    if sub:
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=width)
        s = ws.cell(row=2, column=1, value=sub)
        s.font = font(10, color=MAUVE, italic=True); s.alignment = Alignment(vertical='center', indent=1, wrap_text=True)
        ws.row_dimensions[2].height = 30
    ws.sheet_view.showGridLines = False

def section(ws, row, text, width=8):
    for col in range(1, width + 1):
        ws.cell(row=row, column=col).fill = fill(BLUSH_2)
        ws.cell(row=row, column=col).border = BOTTOM
    c = ws.cell(row=row, column=1, value=text)
    c.font = Font(name='Georgia', size=13, bold=True, color=ROSE)
    ws.row_dimensions[row].height = 24

def header(ws, row, labels, start_col=1):
    for i, l in enumerate(labels):
        c = ws.cell(row=row, column=start_col + i, value=l)
        c.font = font(9, bold=True, color=MAUVE); c.alignment = Alignment(vertical='center', wrap_text=True)
        c.border = BOTTOM
    ws.row_dimensions[row].height = 26

def label(ws, row, col, text, bold=False, color=INK, wrap=True):
    c = ws.cell(row=row, column=col, value=text)
    c.font = font(10, bold=bold, color=color); c.alignment = Alignment(vertical='center', wrap_text=wrap)
    return c

def input_cell(ws, row, col, value, fmt=None, note=None):
    c = ws.cell(row=row, column=col, value=value)
    c.font = font(11, bold=True, color=ROSE); c.fill = fill(BLUSH); c.border = BORDER
    c.alignment = RIGHT
    if fmt: c.number_format = fmt.split(';')[0] if fmt.startswith('#,##0') or fmt.startswith('$') or fmt.startswith('0') else fmt  # a typed 0 shows as 0, never as a dash
    if note: c.comment = Comment(note, 'SLAM')
    return c

def formula_cell(ws, row, col, formula, fmt=None, bold=False, color=INK, size=10):
    c = ws.cell(row=row, column=col, value=formula)
    c.font = font(size, bold=bold, color=color); c.alignment = RIGHT
    if fmt: c.number_format = fmt
    return c

def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

# =====================================================================
# 1. Start Here
# =====================================================================
ws = wb.active; ws.title = 'Start Here'
title(ws, 'SLAM', 'Stress Less About Money. How every decision flows to profit, in one workbook.', width=6)
widths(ws, [4, 46, 30, 30, 4, 4])
r = 4
section(ws, r, 'Three steps', width=6); r += 1
steps = [
    ('1', 'Open the My Numbers tab and fill the pink cells.', 'Start with just three: contacts last month, how many booked, and your price. Every other pink cell already holds a typical number; change it when you know better.'),
    ('2', 'Read This Month.', 'Your profit, what each business brings, and the one step where the money leaks. Everything on it updates itself.'),
    ('3', 'Each week, add a row to Check-in.', 'Five numbers, one minute. After four weeks the sheet tells you whether your real weeks match the model.'),
]
for n, h, d in steps:
    c = ws.cell(row=r, column=1, value=n); c.font = Font(name='Georgia', size=16, bold=True, color=ROSE); c.alignment = CENTER
    label(ws, r, 2, h, bold=True); ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4)
    label(ws, r, 3, d, color=MAUVE); ws.row_dimensions[r].height = 44; r += 1
r += 1
section(ws, r, 'How to read the cells', width=6); r += 1
legend = [
    (BLUSH, ROSE, 'Pink cell', 'Yours to type. Nothing else needs touching.'),
    ('FFFFFF', INK, 'White cell', 'Computed. It updates itself; leave it alone.'),
    (GOLD, GOLD_INK, 'Gold note', 'An estimate or a caution the sheet wants you to see.'),
    (GREEN_FILL, GREEN_INK, 'Green note', 'Good news: on track, or above the goal.'),
]
for bg, fg, name, meaning in legend:
    c = ws.cell(row=r, column=2, value=name); c.fill = fill(bg); c.font = font(10, bold=True, color=fg); c.border = BORDER; c.alignment = Alignment(indent=1, vertical='center')
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4); label(ws, r, 3, meaning, color=MAUVE); ws.row_dimensions[r].height = 22; r += 1
r += 1
section(ws, r, 'The tabs', width=6); r += 1
tabs = [
    ('My Numbers', 'Every number you can change, with a typical value and where to find yours.'),
    ('This Month', 'Profit, gross profit, hours, each business, the bottleneck, and the charts.'),
    ('Levers', 'What one small move on each number does to your month.'),
    ('Three Futures', 'Normal, Dream and Disaster side by side, and how long your cash lasts.'),
    ('Plan', 'What your goal needs, what your offer is worth per hour, and what a client is worth over time.'),
    ('Check-in', 'One row a week. Four weeks in, the sheet compares your real weeks to the model.'),
    ('Clients', 'A list of aliases and stages. Never names, never documents.'),
    ('Definitions', 'Every word and every formula, in plain English.'),
]
for t, d in tabs:
    label(ws, r, 2, t, bold=True); ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4); label(ws, r, 3, d, color=MAUVE); ws.row_dimensions[r].height = 30; r += 1
r += 1
section(ws, r, 'Three promises', width=6); r += 1
for t in [
    'Empty is not zero. Leave a pink cell blank and This Month counts the blanks and tells you, rather than quietly treating it as a zero.',
    'Screening is never a sales step. Nothing here suggests loosening it.',
    'This file is yours. Keep it somewhere private. Its name says nothing about what you do.',
]:
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4); label(ws, r, 2, t, color=MAUVE); ws.row_dimensions[r].height = 30; r += 1
r += 1
ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
label(ws, r, 2, 'SLAM gives no legal, tax or investment advice; for those, ask a professional. Some frameworks follow ideas published by Alex Hormozi; SLAM is independent and not affiliated.', color=MAUVE)
ws.row_dimensions[r].height = 40

# =====================================================================
# 2. My Numbers (inputs)
# =====================================================================
inp = wb.create_sheet('My Numbers')
title(inp, 'My Numbers', 'Pink cells are yours. Each one comes with a typical number already in it, so every tab works from the first minute. Change what you know; leave the rest.', width=6)
widths(inp, [4, 40, 16, 16, 58, 4])
NAMES = {}  # name -> cell ref on this sheet (absolute)

def inp_row(ws, r, key, text, value, fmt, typical, where):
    label(ws, r, 2, text)
    c = input_cell(ws, r, 3, value, fmt)
    t = ws.cell(row=r, column=4, value=typical); t.font = font(9, color=MAUVE); t.alignment = RIGHT
    if fmt: t.number_format = fmt
    w = ws.cell(row=r, column=5, value=where); w.font = font(9, color=MAUVE); w.alignment = WRAP
    ws.row_dimensions[r].height = 30
    NAMES[key] = f"'My Numbers'!$C${r}"
    return r + 1

r = 4
section(inp, r, 'Shared: the numbers every business reads', width=6); r += 1
header(inp, r, ['', 'What', 'Yours', 'Typical', 'Where to look, and what to do with no idea']); r += 1
r = inp_row(inp, r, 'hoursWeek', 'Hours a week you can work (all of it: sessions, messages, posting, admin)', 40, NUM0, 30, 'Think of last week: days worked times hours each. Most land between 20 and 40.')
r = inp_row(inp, r, 'recovery', 'Days off a week (never zero)', 2, NUM0, 2, 'How many days in the last two weeks were fully off? Two is common.')
r = inp_row(inp, r, 'fixed', 'Money that leaves every month whether you work or not', 1500, MONEY, 1500, 'Last month\'s bank statement: rent for a space, subscriptions, phone, insurance, tools. Guess low rather than skip.')
r = inp_row(inp, r, 'goal', 'What you want left for yourself each month', 10000, MONEY, 6000, 'Your rent and bills plus what you want on top. Start with what makes you feel safe.')
r = inp_row(inp, r, 'tax', 'Share to set aside for tax (a reminder line only)', 0.25, PCT, 0.25, 'Ask an accountant for your rate; a quarter is a common placeholder. No tax advice here.')
r = inp_row(inp, r, 'cash', 'Cash you could live on if nothing came in', 9000, MONEY, None, 'Savings you could reach this week. Leave empty and Runway says "not yet".')
r = inp_row(inp, r, 'hourly', 'What an hour of your time is worth to you', 100, MONEY, 100, 'Profit last month divided by hours worked is a fine start. Used to compare a move\'s hours with its money.')
r = inp_row(inp, r, 'acqSpend', 'Money spent finding clients a month (ads, listings, promo)', 0, MONEY, 0, 'Card statement. If you pay nothing to be found, 0 is right.')
r = inp_row(inp, r, 'acqHours', 'Hours a month spent finding clients (posting, replying, listings)', 0, NUM0, 10, 'A normal week times four.')
r += 1

section(inp, r, 'In person', width=6); r += 1
header(inp, r, ['', 'What', 'Yours', 'Typical', 'Where to look, and what to do with no idea']); r += 1
r = inp_row(inp, r, 'ipOn', 'Counted? (Yes or No)', 'Yes', None, 'Yes', 'No means it leaves every total.')
r = inp_row(inp, r, 'ipPriority', 'Priority (1 = your main engine; it gets your hours first)', 1, NUM0, 1, 'Each counted business needs a different number.')
r = inp_row(inp, r, 'inq', 'People who contacted you last month', 60, NUM0, 60, 'Inbox, DMs, booking form. Count new names once, before screening. No idea? Count last week and multiply by four.')
r = inp_row(inp, r, 'pass', 'Share who pass your screening', 0.5, PCT, 0.5, 'Of the last 10 who contacted you, how many passed? Times 10 is the percent. Your screening is yours; nothing here suggests loosening it.')
r = inp_row(inp, r, 'book', 'Share of screened people who book', 0.4, PCT, 0.4, 'Of the last 10 who passed, how many booked? Type contacts and bookings on This Month if that is easier.')
r = inp_row(inp, r, 'show', 'Share of bookings who turn up', 0.85, PCT, 0.85, 'Of your last 10 bookings, how many happened? 8 or 9 in 10 with a deposit.')
r = inp_row(inp, r, 'rebook', 'Extra sessions per new client (30% = every 10 new clients bring 3 more sessions)', 0.3, PCT, 0.3, 'Of your last 10 new clients, how many booked again? Times 10 is the percent.')
r = inp_row(inp, r, 'cap', 'Most sessions you want in a month (blank = no cap; your hours still cap it)', 18, NUM0, None, 'Your busiest month you would happily repeat.')
r = inp_row(inp, r, 'price', 'Price of one session', 500, MONEY, 500, 'Your rate card.')
r = inp_row(inp, r, 'delivery', 'What one session costs you to deliver (space, travel, supplies)', 100, MONEY, 100, 'Think of your last one and what you paid out to make it happen. Guess low.')
r = inp_row(inp, r, 'allIn', 'Hours one session really takes, all in (prep, travel, the session, recovery, messages)', 4, NUM1, 4, 'Most people undercount. Double what the session itself takes.')
r = inp_row(inp, r, 'fee', 'Cut a platform or processor takes from each sale', 0.05, PCT, 0.05, 'Payouts page, or the gap between the price and what lands in your account.')
r = inp_row(inp, r, 'addonOn', 'Add-on offered? (Yes or No)', 'Yes', None, 'Yes', '')
r = inp_row(inp, r, 'addonPrice', 'Add-on price', 200, MONEY, 200, 'Your rate card.')
r = inp_row(inp, r, 'addonTake', 'Share of new clients who take the add-on', 0.25, PCT, 0.25, 'Of your last 10 new clients, how many took it?')
r = inp_row(inp, r, 'retOn', 'Retainer offered? (Yes or No)', 'Yes', None, 'Yes', '')
r = inp_row(inp, r, 'retPrice', 'Retainer price a month', 1500, MONEY, 1500, 'Your arrangement.')
r = inp_row(inp, r, 'retSess', 'Sessions a month the retainer includes', 2, NUM0, 2, '')
r = inp_row(inp, r, 'retTake', 'Share of new clients who take the retainer', 0.1, PCT, 0.1, 'One in ten is a common start.')
r = inp_row(inp, r, 'retMonths', 'Months a retainer client usually stays', 4, NUM0, 4, 'Think of the last few. How long did they stay?')
r = inp_row(inp, r, 'arcOn', 'Program (several sessions over weeks) as the main offer? (Yes or No)', 'No', None, 'No', 'Yes turns the funnel into consultations: price, sessions, close rate and hours below apply, and the single session, add-on and retainer are not counted.')
r = inp_row(inp, r, 'arcPrice', 'Program price', 3000, MONEY, 3000, '')
r = inp_row(inp, r, 'arcSess', 'Sessions the program includes', 4, NUM0, 4, '')
r = inp_row(inp, r, 'arcClose', 'Share of consultations that say yes', 0.4, PCT, 0.4, 'Of your last 10 conversations, how many went ahead?')
r = inp_row(inp, r, 'arcVar', 'What the whole program costs you to deliver', 400, MONEY, 400, '')
r = inp_row(inp, r, 'arcFee', 'Cut taken on the program', 0.05, PCT, 0.05, '')
r = inp_row(inp, r, 'arcHours', 'Hours the whole program takes, all in', 14, NUM1, 14, '')
r += 1

section(inp, r, 'Content', width=6); r += 1
header(inp, r, ['', 'What', 'Yours', 'Typical', 'Where to look, and what to do with no idea']); r += 1
r = inp_row(inp, r, 'ctOn', 'Counted? (Yes or No)', 'Yes', None, 'Yes', '')
r = inp_row(inp, r, 'ctPriority', 'Priority', 2, NUM0, 2, '')
r = inp_row(inp, r, 'followers', 'Followers, all platforms together', 5000, NUM0, 5000, 'Each app shows it on your profile. Add the two biggest and stop.')
r = inp_row(inp, r, 'subRate', 'Share of followers who subscribe each month', 0.01, PCT1, 0.01, 'New subscribers last month divided by followers.')
r = inp_row(inp, r, 'subs', 'Paying subscribers right now', 150, NUM0, 150, 'The app knows; copy the number.')
r = inp_row(inp, r, 'churn', 'Share of subscribers who leave each month', 0.2, PCT, 0.2, 'Cancelled this month divided by subscribers. One in five is common.')
r = inp_row(inp, r, 'subPrice', 'Subscription price a month', 15, MONEY, 15, 'Your profile shows it.')
r = inp_row(inp, r, 'subFee', 'Cut the platform keeps on subscriptions', 0.2, PCT, 0.2, '20% means you keep 80.')
r = inp_row(inp, r, 'customs', 'Customs a month', 10, NUM0, 10, 'Your messages or order list.')
r = inp_row(inp, r, 'customPrice', 'Custom price', 100, MONEY, 100, '')
r = inp_row(inp, r, 'customFee', 'Cut the platform keeps on customs', 0.2, PCT, 0.2, '')
r = inp_row(inp, r, 'customHours', 'Hours one custom takes', 1, NUM1, 1, '')
r = inp_row(inp, r, 'digital', 'Digital products sold a month', 0, NUM0, 0, '0 if you do not sell these.')
r = inp_row(inp, r, 'digitalPrice', 'Digital product price', 150, MONEY, 150, '')
r = inp_row(inp, r, 'digitalKept', 'What you keep of it', 140, MONEY, 140, '')
r = inp_row(inp, r, 'ctHours', 'Hours a month on content, all in', 40, NUM0, 40, 'A normal week times four.')
r += 1

section(inp, r, 'Calls', width=6); r += 1
header(inp, r, ['', 'What', 'Yours', 'Typical', 'Where to look, and what to do with no idea']); r += 1
r = inp_row(inp, r, 'clOn', 'Counted? (Yes or No)', 'Yes', None, 'Yes', '')
r = inp_row(inp, r, 'clPriority', 'Priority', 3, NUM0, 3, '')
r = inp_row(inp, r, 'calls', 'Calls a month (rebooks included)', 8, NUM0, 8, 'Your calendar. Count last week and multiply by four.')
r = inp_row(inp, r, 'noShow', 'Share who do not show', 0, PCT, 0.1, 'Of your last 10 calls, how many did not happen?')
r = inp_row(inp, r, 'depositCovers', 'Paid even when they do not show? (Yes or No)', 'No', None, 'Yes', 'If people pay before the call, Yes.')
r = inp_row(inp, r, 'callPrice', 'Price per block', 200, MONEY, 200, '')
r = inp_row(inp, r, 'callFee', 'Cut the platform keeps', 0.1, PCT, 0.1, '')
r = inp_row(inp, r, 'callHours', 'Hours one call really takes', 1, NUM1, 1, '')
r += 1

section(inp, r, 'Regulars', width=6); r += 1
header(inp, r, ['', 'What', 'Yours', 'Typical', 'Where to look, and what to do with no idea']); r += 1
r = inp_row(inp, r, 'rgOn', 'Counted? (Yes or No)', 'Yes', None, 'Yes', '')
r = inp_row(inp, r, 'rgPriority', 'Priority', 4, NUM0, 4, '')
r = inp_row(inp, r, 'regulars', 'People who send you something every month right now', 4, NUM0, 4, 'Last month\'s payments grouped by person.')
r = inp_row(inp, r, 'regAvg', 'What a regular sends a month, on average', 500, MONEY, 500, 'Add last month\'s payments from regulars and divide by how many.')
r = inp_row(inp, r, 'regFee', 'Cut the processor keeps', 0.1, PCT, 0.1, '')
r = inp_row(inp, r, 'regMonths', 'Months a regular usually stays', 6, NUM0, 6, '')
r = inp_row(inp, r, 'chargeback', 'Share lost to chargebacks', 0, PCT, 0, 'Your processor\'s disputes page. If it has not happened, 0.')
r = inp_row(inp, r, 'rgFollowers', 'Followers who could send one-off tributes', 2000, NUM0, 2000, '')
r = inp_row(inp, r, 'tributeRate', 'Share of followers who send a one-off tribute each month', 0, PCT1, 0.001, 'New senders last month divided by followers. Small numbers are normal.')
r = inp_row(inp, r, 'tributeAvg', 'Typical one-off tribute', 50, MONEY, 50, '')
r = inp_row(inp, r, 'rgHours', 'Hours a month on this, all in', 10, NUM0, 10, '')
r += 1
section(inp, r, 'Three futures: how far the futures move', width=6); r += 1
header(inp, r, ['', 'What', 'Yours', 'Typical', 'What it means']); r += 1
r = inp_row(inp, r, 'dreamAud', 'Dream: contacts and audience change by', 0.3, PCT, 0.3, '+30% means 60 contacts become 78.')
r = inp_row(inp, r, 'dreamConv', 'Dream: conversion (close rate, follower to subscriber or tribute) changes by', 0.2, PCT, 0.2, 'Never touches screening, booking or show rates.')
r = inp_row(inp, r, 'disAud', 'Disaster: contacts and audience change by', -0.4, PCT, -0.4, '')
r = inp_row(inp, r, 'disConv', 'Disaster: conversion changes by', -0.25, PCT, -0.25, '')
r = inp_row(inp, r, 'houseShare', 'Disaster event: share of contacts that stop if your main source stops', 1, PCT, 1, '100% if one source sends everyone.')
r = inp_row(inp, r, 'priceWar', 'Disaster event: price cut in a price war', 0.15, PCT, 0.15, '')
r = inp_row(inp, r, 'evHouse', 'Switch on: the source stops? (Yes or No)', 'No', None, 'No', '')
r = inp_row(inp, r, 'evPriceWar', 'Switch on: price war? (Yes or No)', 'No', None, 'No', '')
r = inp_row(inp, r, 'evSick', 'Switch on: a month off sick? (Yes or No)', 'No', None, 'No', 'Sessions, calls and customs stop; subscriptions and regulars continue.')

yesno = DataValidation(type='list', formula1='"Yes,No"', allow_blank=False)
inp.add_data_validation(yesno)
for key in ['ipOn','addonOn','retOn','arcOn','ctOn','clOn','rgOn','depositCovers','evHouse','evPriceWar','evSick']:
    yesno.add(NAMES[key].split('!')[1].replace('$', ''))
pct_dv = DataValidation(type='decimal', operator='between', formula1='-1', formula2='1', allow_blank=True, error='Type a share, like 40 for 40%.')
inp.add_data_validation(pct_dv)
for key in ['pass','book','show','fee','addonTake','retTake','arcClose','arcFee','subFee','customFee','callFee','regFee','chargeback','noShow','churn','tax','subRate','tributeRate','dreamAud','dreamConv','disAud','disConv','houseShare','priceWar']:
    pct_dv.add(NAMES[key].split('!')[1].replace('$', ''))
inp.freeze_panes = 'A4'

N = lambda k: NAMES[k]  # absolute cross-sheet ref
ISYES = lambda k: f'({N(k)}="Yes")'

# =====================================================================
# 3. This Month (the model + dashboard)
# =====================================================================
tm = wb.create_sheet('This Month')
title(tm, 'This Month', 'From your numbers. Every white cell recomputes when a pink cell changes. Charts are on the right.', width=7)
widths(tm, [4, 40, 16, 16, 16, 16, 16])
r = 4
section(tm, r, 'The month in four numbers', width=7); r += 1
# --- the in-person model block first (rows below), then headline refers to it ---
# We lay out: headline rows 5-9 referencing cells computed further down.
HEAD = r
r += 6
section(tm, r, 'Shared hours', width=7); r += 1
label(tm, r, 2, 'Sellable hours a month (hours a week × 52 ÷ 12)'); formula_cell(tm, r, 3, f'=IF({N("hoursWeek")}="","",{N("hoursWeek")}*52/12)', NUM1); SELL = f"'This Month'!$C${r}"; r += 1
label(tm, r, 2, 'Working days a week'); formula_cell(tm, r, 3, f'=7-{N("recovery")}', NUM0); r += 1
r += 1

section(tm, r, 'In person: from contacts to sessions', width=7); r += 1
def mrow(text, formula, fmt=NUM1, key=None, bold=False, color=INK):
    global r
    label(tm, r, 2, text, bold=bold)
    formula_cell(tm, r, 3, formula, fmt, bold=bold, color=color)
    ref = f"'This Month'!$C${r}"
    if key: M[key] = ref
    r += 1
    return ref
M = {}
mrow('New clients = contacts × pass × booking × show', f'={N("inq")}*{N("pass")}*{N("book")}*{N("show")}', NUM1, 'newC')
mrow('Retainer clients = new clients × retainer take', f'=IF({ISYES("retOn")},{M["newC"]}*{N("retTake")},0)', NUM1, 'retC')
mrow('Single sessions = (new − retainer clients) × (1 + rebook) + retainer clients\' first sessions', f'=({M["newC"]}-{M["retC"]})*(1+{N("rebook")})+{M["retC"]}', NUM1, 'single')
mrow('Continuity sessions = retainer clients × sessions a month × months', f'={M["retC"]}*{N("retSess")}*{N("retMonths")}', NUM1, 'cont')
mrow('Program clients = new clients × close rate (only when the program is the main offer)', f'=IF({ISYES("arcOn")},{M["newC"]}*{N("arcClose")},0)', NUM1, 'arcC')
mrow('Sessions wanted (demand)', f'=IF({ISYES("arcOn")},{M["arcC"]}*{N("arcSess")},{M["single"]}+{M["cont"]})', NUM1, 'demand')
mrow('Hours per session, all in', f'=IF({ISYES("arcOn")},IF({N("arcSess")}>0,{N("arcHours")}/{N("arcSess")},0),{N("allIn")})', NUM1, 'hps')
mrow('Hours the demand would take', f'={M["demand"]}*{M["hps"]}', NUM1, 'ipNeed')
# hours allocation (priority order) computed in a block below; forward-reference cells in the allocation table
ALLOC_ROW = None  # set later
mrow('Hours available to in person (after higher-priority businesses)', '=0', NUM1, 'ipAlloc')  # placeholder formula patched later
mrow('Cap from hours = hours available ÷ hours per session', f'=IF(OR({SELL}="",{M["hps"]}=0),"",{M["ipAlloc"]}/{M["hps"]})', NUM1, 'hoursCap')
mrow('Cap from your session ceiling', f'=IF({N("cap")}="","",{N("cap")})', NUM1, 'sessCap')
mrow('Capacity = the tighter of the two', f'=IF(AND({M["hoursCap"]}="",{M["sessCap"]}=""),"",IF({M["hoursCap"]}="",{M["sessCap"]},IF({M["sessCap"]}="",{M["hoursCap"]},MIN({M["hoursCap"]},{M["sessCap"]}))))', NUM1, 'capacity')
mrow('Scale = capacity ÷ demand when demand is above it, else 1', f'=IF({M["capacity"]}="",1,IF({M["demand"]}>{M["capacity"]},{M["capacity"]}/{M["demand"]},1))', NUM1, 'scale')
mrow('Sessions this month', f'={M["demand"]}*{M["scale"]}', NUM1, 'sessions', bold=True)
mrow('Gross profit per session = price × (1 − cut) − delivery', f'={N("price")}*(1-{N("fee")})-{N("delivery")}', MONEY2, 'gpSess')
mrow('From single sessions', f'=IF({ISYES("arcOn")},0,{M["single"]}*{M["scale"]}*{M["gpSess"]})', MONEY, 'gpSingle')
mrow('From add-ons = new clients × take × add-on price × (1 − cut)', f'=IF(AND({ISYES("addonOn")},NOT({ISYES("arcOn")})),{M["newC"]}*{N("addonTake")}*{M["scale"]}*{N("addonPrice")}*(1-{N("fee")}),0)', MONEY, 'gpAddon')
mrow('From retainers = retainer clients × months × (price × (1 − cut) − sessions × delivery)', f'=IF(AND({ISYES("retOn")},NOT({ISYES("arcOn")})),{M["retC"]}*{N("retMonths")}*{M["scale"]}*({N("retPrice")}*(1-{N("fee")})-{N("retSess")}*{N("delivery")}),0)', MONEY, 'gpRet')
mrow('From the program = program clients × (price × (1 − cut) − delivery)', f'=IF({ISYES("arcOn")},{M["arcC"]}*{M["scale"]}*({N("arcPrice")}*(1-{N("arcFee")})-{N("arcVar")}),0)', MONEY, 'gpArc')
mrow('In person gross profit a month', f'=IF({ISYES("ipOn")},{M["gpSingle"]}+{M["gpAddon"]}+{M["gpRet"]}+{M["gpArc"]},0)', MONEY, 'gpIP', bold=True)
mrow('In person hours used', f'=IF({ISYES("ipOn")},{M["sessions"]}*{M["hps"]},0)', NUM1, 'hIP')
mrow('Gross profit per contact (before any cap)', f'=IF({N("inq")}>0,IF({ISYES("arcOn")},{M["arcC"]}*({N("arcPrice")}*(1-{N("arcFee")})-{N("arcVar")}),{M["single"]}*{M["gpSess"]}+IF({ISYES("addonOn")},{M["newC"]}*{N("addonTake")}*{N("addonPrice")}*(1-{N("fee")}),0)+IF({ISYES("retOn")},{M["retC"]}*{N("retMonths")}*({N("retPrice")}*(1-{N("fee")})-{N("retSess")}*{N("delivery")}),0))/{N("inq")},"")', MONEY2, 'gpPerInq')
mrow('Sessions per contact (before any cap)', f'=IF({N("inq")}>0,{M["demand"]}/{N("inq")},"")', '0.000', 'sessPerInq')
r += 1

section(tm, r, 'Content, Calls, Regulars', width=7); r += 1
mrow('Content: subscriptions = subscribers × price × (1 − cut)', f'={N("subs")}*{N("subPrice")}*(1-{N("subFee")})', MONEY, 'gpSubs')
mrow('Content: customs = customs × price × (1 − cut)', f'={N("customs")}*{N("customPrice")}*(1-{N("customFee")})', MONEY, 'gpCustoms')
mrow('Content: digital = sold × what you keep', f'={N("digital")}*{N("digitalKept")}', MONEY, 'gpDigital')
mrow('Content gross profit a month, before the hours share', f'={M["gpSubs"]}+{M["gpCustoms"]}+{M["gpDigital"]}', MONEY, 'gpCTraw')
mrow('Content hours wanted', f'={N("ctHours")}+{N("customs")}*{N("customHours")}', NUM1, 'ctNeed')
mrow('Content: new subscribers a month = followers × rate', f'={N("followers")}*{N("subRate")}', NUM1, 'newSubs')
mrow('Content: months a subscriber stays = 1 ÷ churn', f'=IF({N("churn")}>0,1/{N("churn")},"")', NUM1, 'subMonths')
mrow('Calls: paid calls = calls × (1 − no-shows that go unpaid)', f'={N("calls")}*(1-{N("noShow")}*IF({ISYES("depositCovers")},0,1))', NUM1, 'paidCalls')
mrow('Calls gross profit a month, before the hours share = paid calls × price × (1 − cut)', f'={M["paidCalls"]}*{N("callPrice")}*(1-{N("callFee")})', MONEY, 'gpCLraw')
mrow('Calls hours wanted', f'={N("calls")}*{N("callHours")}', NUM1, 'clNeed')
mrow('Regulars: per regular a month = average × (1 − chargebacks) × (1 − cut)', f'={N("regAvg")}*(1-{N("chargeback")})*(1-{N("regFee")})', MONEY2, 'gpReg1')
mrow('Regulars: new one-off tributes = followers × rate × typical × (1 − chargebacks) × (1 − cut)', f'={N("rgFollowers")}*{N("tributeRate")}*{N("tributeAvg")}*(1-{N("chargeback")})*(1-{N("regFee")})', MONEY, 'gpTrib')
mrow('Regulars gross profit a month, before the hours share', f'={N("regulars")}*{M["gpReg1"]}+{M["gpTrib"]}', MONEY, 'gpRGraw')
mrow('Regulars hours wanted', f'={N("rgHours")}+{N("regulars")}*1', NUM1, 'rgNeed')
r += 1

section(tm, r, 'Hours in priority order (your #1 takes its hours first)', width=7); r += 1
header(tm, r, ['', 'Rank', 'Business', 'Hours wanted', 'Hours allowed', 'Share allowed', 'Hours open to it'])
r += 1
# helper ranges: business names, priorities, needs
names_range_start = r
biz = [('In person', 'ipOn', 'ipPriority', M['ipNeed']), ('Content', 'ctOn', 'ctPriority', M['ctNeed']), ('Calls', 'clOn', 'clPriority', M['clNeed']), ('Regulars', 'rgOn', 'rgPriority', M['rgNeed'])]
# table of the four businesses with effective priority (99 when off) in hidden-ish helper columns H:J
helper_col = 9  # I
for i, (name, on, pri, need) in enumerate(biz):
    rr = r + i
    tm.cell(row=rr, column=helper_col, value=name).font = font(9, color=MAUVE)
    formula_cell(tm, rr, helper_col + 1, f'=IF({ISYES(on)},{N(pri)},99)', NUM0, color=MAUVE)
    formula_cell(tm, rr, helper_col + 2, f'=IF({ISYES(on)},{need},0)', NUM1, color=MAUVE)
NAMES_R = f"'This Month'!$I${r}:$I${r+3}"; PRI_R = f"'This Month'!$J${r}:$J${r+3}"; NEED_R = f"'This Month'!$K${r}:$K${r+3}"
tm.cell(row=r-1, column=helper_col, value='helper: business').font = font(8, color=MAUVE)
tm.cell(row=r-1, column=helper_col+1, value='priority').font = font(8, color=MAUVE)
tm.cell(row=r-1, column=helper_col+2, value='hours wanted').font = font(8, color=MAUVE)
ALLOC = {}
for rank in range(1, 5):
    rr = r + rank - 1
    formula_cell(tm, rr, 2, str(rank), None); tm.cell(row=rr, column=2).alignment = Alignment(horizontal='left')
    formula_cell(tm, rr, 3, f'=IFERROR(INDEX({NAMES_R},MATCH(SMALL({PRI_R},{rank}),{PRI_R},0)),"")', None)
    tm.cell(row=rr, column=3).alignment = Alignment(horizontal='left')
    formula_cell(tm, rr, 4, f'=IFERROR(INDEX({NEED_R},MATCH(SMALL({PRI_R},{rank}),{PRI_R},0)),0)', NUM1)
    prev = '' if rank == 1 else f'-SUM($E${r}:$E${rr-1})'
    formula_cell(tm, rr, 5, f'=IF({SELL}="",D{rr},MAX(0,MIN(D{rr},{SELL}{prev})))', NUM1)
    formula_cell(tm, rr, 6, f'=IF(D{rr}>0,E{rr}/D{rr},1)', PCT)
    # hours still open once the higher priorities have taken theirs: the real ceiling, not this business's own demand
    formula_cell(tm, rr, 7, f'=IF({SELL}="","",MAX(0,{SELL}{prev}))', NUM1, color=MAUVE)
ALLOC_OPEN = f"'This Month'!$G${r}:$G${r+3}"
ALLOC_NAMES = f"'This Month'!$C${r}:$C${r+3}"; ALLOC_HOURS = f"'This Month'!$E${r}:$E${r+3}"; ALLOC_SHARE = f"'This Month'!$F${r}:$F${r+3}"
def share_of(name): return f'IFERROR(INDEX({ALLOC_SHARE},MATCH("{name}",{ALLOC_NAMES},0)),1)'
def hours_of(name): return f'IFERROR(INDEX({ALLOC_HOURS},MATCH("{name}",{ALLOC_NAMES},0)),0)'
def open_of(name): return f'IFERROR(INDEX({ALLOC_OPEN},MATCH("{name}",{ALLOC_NAMES},0)),0)'
# patch the in-person allocated hours cell
ip_alloc_row = int(M['ipAlloc'].split('$')[-1])
tm.cell(row=ip_alloc_row, column=3, value=f'=IF({SELL}="","",{open_of("In person")})')
r += 5

section(tm, r, 'Each business, counted', width=7); r += 1
header(tm, r, ['', 'Business', 'Gross profit', 'Share', 'Hours used', 'Note', '']); r += 1
BIZ_START = r
rows_biz = [
    ('In person', f'={M["gpIP"]}', f'={M["hIP"]}', f'=IF(NOT({ISYES("ipOn")}),"Not counted",IF({M["capacity"]}="","",IF({M["demand"]}>{M["capacity"]},"At capacity: more contacts would not become more money","")))'),
    ('Content', f'=IF({ISYES("ctOn")},{M["gpCTraw"]}*{share_of("Content")},0)', f'=IF({ISYES("ctOn")},{hours_of("Content")},0)', f'=IF(NOT({ISYES("ctOn")}),"Not counted",IF({share_of("Content")}<1,"Fewer hours than it wanted; #1 took its hours first",""))'),
    ('Calls', f'=IF({ISYES("clOn")},{M["gpCLraw"]}*{share_of("Calls")},0)', f'=IF({ISYES("clOn")},{hours_of("Calls")},0)', f'=IF(NOT({ISYES("clOn")}),"Not counted",IF({share_of("Calls")}<1,"Fewer hours than it wanted",""))'),
    ('Regulars', f'=IF({ISYES("rgOn")},{M["gpRGraw"]}*{share_of("Regulars")},0)', f'=IF({ISYES("rgOn")},{hours_of("Regulars")},0)', f'=IF(NOT({ISYES("rgOn")}),"Not counted",IF({share_of("Regulars")}<1,"Fewer hours than it wanted",""))'),
]
for i, (name, gp, hrs, note) in enumerate(rows_biz):
    rr = r + i
    label(tm, rr, 2, name, bold=True)
    formula_cell(tm, rr, 3, gp, MONEY)
    formula_cell(tm, rr, 4, f'=IF($C${r+4}>0,C{rr}/$C${r+4},0)', PCT)
    formula_cell(tm, rr, 5, hrs, NUM1)
    c = formula_cell(tm, rr, 6, note, None, color=GOLD_INK); c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='left')
    tm.row_dimensions[rr].height = 30
rr = r + 4
label(tm, rr, 2, 'Total', bold=True); formula_cell(tm, rr, 3, f'=SUM(C{r}:C{r+3})', MONEY, bold=True); formula_cell(tm, rr, 4, f'=SUM(D{r}:D{r+3})', PCT, bold=True); formula_cell(tm, rr, 5, f'=SUM(E{r}:E{r+3})', NUM1, bold=True)
for col in range(2, 7): tm.cell(row=rr, column=col).border = Border(top=Side(style='thin', color=ROSE))
GP_TOTAL = f"'This Month'!$C${rr}"; HOURS_TOTAL = f"'This Month'!$E${rr}"
BIZ_END = r + 3
r = rr + 2

section(tm, r, 'Profit', width=7); r += 1
mrow('Gross profit, all counted businesses', f'={GP_TOTAL}', MONEY, 'gpAll', bold=True)
mrow('Fixed costs', f'=-{N("fixed")}', MONEY, 'fixedNeg')
mrow('Spent finding clients', f'=-{N("acqSpend")}', MONEY, 'acqNeg')
mrow('Profit = gross profit − finding clients − fixed costs', f'={M["gpAll"]}+{M["fixedNeg"]}+{M["acqNeg"]}', MONEY, 'profit', bold=True, color=GREEN_INK)
mrow('Set aside for tax (a reminder, never advice)', f'=MAX(0,{M["profit"]})*{N("tax")}', MONEY, 'setAside')
mrow('Yours to keep after the set-aside', f'={M["profit"]}-{M["setAside"]}', MONEY, 'keep', bold=True)
mrow('Against your goal (positive = above it)', f'={M["profit"]}-{N("goal")}', MONEY, 'gap')
r += 1
section(tm, r, 'The bottleneck: which step is furthest below typical, and what it is worth', width=7); r += 1
header(tm, r, ['', 'Step', 'Yours', 'Typical', 'Worth a month at typical', 'Note', '']); r += 1
# gain from moving a rate to typical: recompute GP with that rate replaced (single/addon/retainer, uncapped then capped) via a compact formula
def ip_gp_with(pass_=None, book_=None, show_=None, rebook_=None, price_=None):
    p = pass_ or N('pass'); b = book_ or N('book'); s = show_ or N('show'); rb = rebook_ or N('rebook'); pr = price_ or N('price')
    newc = f'({N("inq")}*{p}*{b}*{s})'
    retc = f'(IF({ISYES("retOn")},{newc}*{N("retTake")},0))'
    single = f'(({newc}-{retc})*(1+{rb})+{retc})'
    cont = f'({retc}*{N("retSess")}*{N("retMonths")})'
    demand = f'({single}+{cont})'
    scale = f'(IF({M["capacity"]}="",1,IF({demand}>{M["capacity"]},{M["capacity"]}/{demand},1)))'
    gp = f'({single}*({pr}*(1-{N("fee")})-{N("delivery")})+IF({ISYES("addonOn")},{newc}*{N("addonTake")}*{N("addonPrice")}*(1-{N("fee")}),0)+IF({ISYES("retOn")},{retc}*{N("retMonths")}*({N("retPrice")}*(1-{N("fee")})-{N("retSess")}*{N("delivery")}),0))*{scale}'
    return gp
typical = {'book': 0.4, 'show': 0.85, 'rebook': 0.3, 'price': 500}
BOT_START = r
for key, text, typ, kw in [('book', 'Booking rate', 0.4, 'book_'), ('show', 'Show rate', 0.85, 'show_'), ('rebook', 'Rebook rate', 0.3, 'rebook_'), ('price', 'Session price', 500, 'price_')]:
    label(tm, r, 2, text)
    formula_cell(tm, r, 3, f'={N(key)}', PCT if key != 'price' else MONEY)
    formula_cell(tm, r, 4, str(typ) if key != 'price' else '500', PCT if key != 'price' else MONEY)
    gain = f'=IF({ISYES("arcOn")},0,IF({N(key)}<D{r},{ip_gp_with(**{kw: f"$D${r}"})}-{ip_gp_with()},0))'
    formula_cell(tm, r, 5, gain, MONEY, color=GREEN_INK)
    r += 1
label(tm, r, 2, 'The bottleneck', bold=True)
c = formula_cell(tm, r, 3, f'=IF({M["capacity"]}<>"",IF({M["demand"]}>{M["capacity"]},"Capacity: you are full. Raise price or add a retainer or program.",IF(MAX(E{BOT_START}:E{r-1})>0,INDEX(B{BOT_START}:B{r-1},MATCH(MAX(E{BOT_START}:E{r-1}),E{BOT_START}:E{r-1},0))&": worth "&TEXT(MAX(E{BOT_START}:E{r-1}),"$#,##0")&" a month at typical.","Nothing is below typical: it is a volume problem. See Plan.")),IF(MAX(E{BOT_START}:E{r-1})>0,INDEX(B{BOT_START}:B{r-1},MATCH(MAX(E{BOT_START}:E{r-1}),E{BOT_START}:E{r-1},0))&": worth "&TEXT(MAX(E{BOT_START}:E{r-1}),"$#,##0")&" a month at typical.","Nothing is below typical: it is a volume problem. See Plan."))', None, bold=True, color=ROSE)
tm.merge_cells(start_row=r, start_column=3, end_row=r, end_column=6); c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='left'); tm.row_dimensions[r].height = 34
BOTTLENECK = f"'This Month'!$C${r}"
r += 1
label(tm, r, 2, 'Screening is not on this list on purpose. Your screening is yours.', color=MAUVE); r += 2

# headline block
rr = HEAD
label(tm, rr, 2, 'Profit this month', bold=True); c = formula_cell(tm, rr, 3, f'={M["profit"]}', MONEY, bold=True, color=GREEN_INK, size=16); rr += 1
label(tm, rr, 2, 'Gross profit'); formula_cell(tm, rr, 3, f'={M["gpAll"]}', MONEY, size=12); rr += 1
label(tm, rr, 2, 'Sessions (in person)'); formula_cell(tm, rr, 3, f'={M["sessions"]}', NUM1, size=12); rr += 1
label(tm, rr, 2, 'Hours used of sellable'); formula_cell(tm, rr, 3, f'=IF({SELL}="",TEXT({HOURS_TOTAL},"0")&" (set your hours)",TEXT({HOURS_TOTAL},"0")&" of "&TEXT({SELL},"0"))', None, size=12); rr += 1
label(tm, rr, 2, 'The bottleneck', bold=True); c = formula_cell(tm, rr, 3, f'={BOTTLENECK}', None, bold=True, color=ROSE); tm.merge_cells(start_row=rr, start_column=3, end_row=rr, end_column=6); c.alignment = Alignment(wrap_text=True, horizontal='left', vertical='center'); tm.row_dimensions[rr].height = 34
# blank pink cells: a blank reads as zero in a spreadsheet, so say so instead of hiding it (the session cap may be blank on purpose)
_rows = sorted(int(v.split('$')[-1]) for k, v in NAMES.items() if k != 'cap')
_ranges, _start, _prev = [], _rows[0], _rows[0]
for _x in _rows[1:]:
    if _x != _prev + 1:
        _ranges.append((_start, _prev)); _start = _x
    _prev = _x
_ranges.append((_start, _prev))
BLANKS = '+'.join(f"COUNTBLANK('My Numbers'!$C${a}:$C${b})" for a, b in _ranges)
rr += 1
label(tm, rr, 2, 'Blank pink cells on My Numbers'); c = formula_cell(tm, rr, 3, f'=IF(({BLANKS})=0,"None. Every number is filled in.",({BLANKS})&" blank. A blank counts as zero here, so fill it in or copy the typical number.")', None, color=GOLD_INK)
tm.merge_cells(start_row=rr, start_column=3, end_row=rr, end_column=6); c.alignment = Alignment(wrap_text=True, horizontal='left', vertical='center')
tm.conditional_formatting.add(f'C{HEAD}', CellIsRule(operator='lessThan', formula=['0'], font=Font(name=FONT, size=16, bold=True, color=GOLD_INK)))

# ---- charts ----
pie = PieChart(); pie.title = 'Where gross profit comes from'; pie.height = 7.5; pie.width = 12
data = Reference(tm, min_col=3, min_row=BIZ_START - 1, max_row=BIZ_END); cats = Reference(tm, min_col=2, min_row=BIZ_START, max_row=BIZ_END)
pie.add_data(data, titles_from_data=True); pie.set_categories(cats)
for i, col in enumerate(['BE185D', 'EC4899', 'F9A8D4', 'FBCFE8']):
    pt = DataPoint(idx=i); pt.graphicalProperties.solidFill = col; pie.series[0].dPt.append(pt)
tm.add_chart(pie, 'H4')
bar = BarChart(); bar.type = 'col'; bar.title = 'Where the month goes'; bar.height = 7.5; bar.width = 12; bar.legend = None
prow = int(M['gpAll'].split('$')[-1])
data = Reference(tm, min_col=3, min_row=prow, max_row=prow + 3); cats = Reference(tm, min_col=2, min_row=prow, max_row=prow + 3)
bar.add_data(data, titles_from_data=False); bar.set_categories(cats); bar.series[0].graphicalProperties.solidFill = 'BE185D'; bar.y_axis.numFmt = '$#,##0'
tm.add_chart(bar, 'H20')
fun = BarChart(); fun.type = 'col'; fun.title = 'From contacts to sessions'; fun.height = 7.5; fun.width = 12; fun.legend = None
# funnel helper cells in column I/J below helper table
# the funnel table sits in a visible column beside the charts (a chart will not plot hidden cells); the print area leaves it out
fr = 36
tm.cell(row=fr, column=13, value='The funnel this month (feeds the chart)').font = font(9, bold=True, color=ROSE)
funnel = [('Contacts', f'={N("inq")}'), ('Passed', f'={N("inq")}*{N("pass")}'), ('Booked', f'={N("inq")}*{N("pass")}*{N("book")}'), ('Showed', f'={M["newC"]}'), ('Sessions', f'={M["sessions"]}')]
for i, (lab, f) in enumerate(funnel):
    tm.cell(row=fr + 1 + i, column=13, value=lab).font = font(9, color=MAUVE); formula_cell(tm, fr + 1 + i, 14, f, NUM1, color=MAUVE)
data = Reference(tm, min_col=14, min_row=fr + 1, max_row=fr + 5); cats = Reference(tm, min_col=13, min_row=fr + 1, max_row=fr + 5)
fun.add_data(data, titles_from_data=False); fun.set_categories(cats); fun.series[0].graphicalProperties.solidFill = 'F472B6'
tm.add_chart(fun, 'H36')
tm.column_dimensions['M'].width = 14; tm.column_dimensions['N'].width = 10
tm.column_dimensions['I'].width = 16; tm.column_dimensions['J'].width = 12; tm.column_dimensions['K'].width = 12
for _col in ('I', 'J', 'K'): tm.column_dimensions[_col].hidden = True  # helper tables feed the formulas and charts; nothing to read there
tm.freeze_panes = 'A4'

# =====================================================================
# 4. Levers
# =====================================================================
lv = wb.create_sheet('Levers')
title(lv, 'Levers', 'What one small move on each number does to in-person gross profit this month. Biggest first is the one to work on. Screening is not here on purpose.', width=5)
widths(lv, [4, 40, 18, 22, 4])
r = 4
header(lv, r, ['', 'Move', 'Change a month', 'How it is worked out']); r += 1
LV_START = r
levers = [
    ('Booking rate +1 point', ip_gp_with(book_=f'({N("book")}+0.01)'), 'The booking rate raised by one point, everything else the same.'),
    ('Show rate +1 point', ip_gp_with(show_=f'({N("show")}+0.01)'), ''),
    ('Rebook rate +1 point', ip_gp_with(rebook_=f'({N("rebook")}+0.01)'), ''),
    ('Session price +1%', ip_gp_with(price_=f'({N("price")}*1.01)'), ''),
    ('Contacts +1%', ip_gp_with().replace(N('inq'), f'({N("inq")}*1.01)'), ''),
    ('Delivery cost −1%', ip_gp_with().replace(N('delivery'), f'({N("delivery")}*0.99)'), ''),
]
for text, f, how in levers:
    label(lv, r, 2, text)
    formula_cell(lv, r, 3, f'=IF({ISYES("arcOn")},"program on",{f}-{ip_gp_with()})', MONEY, color=GREEN_INK)
    label(lv, r, 4, how, color=MAUVE); r += 1
LV_END = r - 1
r += 1
label(lv, r, 2, 'The biggest single move', bold=True); formula_cell(lv, r, 3, f'=IFERROR(INDEX(B{LV_START}:B{LV_END},MATCH(MAX(C{LV_START}:C{LV_END}),C{LV_START}:C{LV_END},0)),"")', None, bold=True, color=ROSE); lv.cell(row=r, column=3).alignment = Alignment(horizontal='left')
r += 1
c = formula_cell(lv, r, 2, f'=IF({M["capacity"]}="","",IF({M["demand"]}>{M["capacity"]},"You are at capacity, so more contacts or bookings add nothing until you raise the price, add a retainer, or lift the cap. A move can even read below zero: it fills the same hours with cheaper sessions.",""))', None, color=GOLD_INK)
lv.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4); c.alignment = Alignment(wrap_text=True, horizontal='left', vertical='top'); lv.row_dimensions[r].height = 48
ch = BarChart(); ch.type = 'bar'; ch.title = 'Change in gross profit a month'; ch.height = 7.5; ch.width = 14; ch.legend = None
ch.add_data(Reference(lv, min_col=3, min_row=LV_START, max_row=LV_END), titles_from_data=False); ch.set_categories(Reference(lv, min_col=2, min_row=LV_START, max_row=LV_END)); ch.series[0].graphicalProperties.solidFill = 'BE185D'; ch.y_axis.numFmt = '$#,##0'; ch.x_axis.tickLblPos = 'low'
lv.add_chart(ch, 'B16')

# =====================================================================
# 5. Three Futures
# =====================================================================
tf = wb.create_sheet('Three Futures')
title(tf, 'Three Futures', 'Normal is your numbers as they stand. Dream and Disaster move contacts, audience and conversion by the amounts on My Numbers; the Disaster switches add events. Runway is how many months your cash covers the gap to your goal.', width=6)
widths(tf, [4, 40, 16, 16, 16, 4])
r = 4
header(tf, r, ['', '', 'Disaster', 'Normal', 'Dream']); r += 1
def fut_rows(col_letter, aud, conv, events):
    """Builds the in-person and other business GP for one future in a column. aud/conv are formulas for multipliers."""
    inqx = f'({N("inq")}*{aud}{"*(1-"+N("houseShare")+")" if events else ""}{"*0" if False else ""})'
    return inqx
# We write explicit per-future formulas for clarity.
def ip_future(aud, conv, house, war, sick):
    inq = f'({N("inq")}*{aud}*IF({house},1-{N("houseShare")},1)*IF({sick},0,1))'
    price_f = f'({N("price")}*IF({war},1-{N("priceWar")},1))'
    newc = f'({inq}*{N("pass")}*{N("book")}*{N("show")})'
    retc = f'(IF({ISYES("retOn")},{newc}*{N("retTake")},0))'
    single = f'(({newc}-{retc})*(1+{N("rebook")})+{retc})'
    cont = f'({retc}*{N("retSess")}*{N("retMonths")})'
    arcc = f'({newc}*MIN(1,{N("arcClose")}*{conv}))'
    demand = f'(IF({ISYES("arcOn")},{arcc}*{N("arcSess")},{single}+{cont}))'
    scale = f'(IF({M["capacity"]}="",1,IF({demand}>{M["capacity"]},{M["capacity"]}/{demand},1)))'
    gp_single_mix = f'({single}*({price_f}*(1-{N("fee")})-{N("delivery")})+IF({ISYES("addonOn")},{newc}*{N("addonTake")}*{N("addonPrice")}*IF({war},1-{N("priceWar")},1)*(1-{N("fee")}),0)+IF({ISYES("retOn")},{retc}*{N("retMonths")}*({N("retPrice")}*IF({war},1-{N("priceWar")},1)*(1-{N("fee")})-{N("retSess")}*{N("delivery")}),0))'
    gp_arc = f'({arcc}*({N("arcPrice")}*IF({war},1-{N("priceWar")},1)*(1-{N("arcFee")})-{N("arcVar")}))'
    return f'IF({ISYES("ipOn")},IF({ISYES("arcOn")},{gp_arc},{gp_single_mix})*{scale},0)'
def others_future(aud, conv, war, sick):
    pw = f'IF({war},1-{N("priceWar")},1)'
    ct = f'IF({ISYES("ctOn")},({N("subs")}*{aud}*{N("subPrice")}*{pw}*(1-{N("subFee")})+IF({sick},0,{N("customs")}*{aud}*{N("customPrice")}*{pw}*(1-{N("customFee")})+{N("digital")}*{aud}*{N("digitalKept")}*{pw}))*{share_of("Content")},0)'
    cl = f'IF({ISYES("clOn")},IF({sick},0,{N("calls")}*{aud}*(1-{N("noShow")}*IF({ISYES("depositCovers")},0,1))*{N("callPrice")}*{pw}*(1-{N("callFee")}))*{share_of("Calls")},0)'
    rg = f'IF({ISYES("rgOn")},({N("regulars")}*{aud}*{N("regAvg")}*{pw}*(1-{N("chargeback")})*(1-{N("regFee")})+IF({sick},0,{N("rgFollowers")}*{aud}*MIN(1,{N("tributeRate")}*{conv})*{N("tributeAvg")}*{pw}*(1-{N("chargeback")})*(1-{N("regFee")})))*{share_of("Regulars")},0)'
    return ct, cl, rg
cols = {'C': ('Disaster', f'(1+{N("disAud")})', f'(1+{N("disConv")})', ISYES('evHouse'), ISYES('evPriceWar'), ISYES('evSick')), 'D': ('Normal', '1', '1', 'FALSE', 'FALSE', 'FALSE'), 'E': ('Dream', f'(1+{N("dreamAud")})', f'(1+{N("dreamConv")})', 'FALSE', 'FALSE', 'FALSE')}
labels_f = ['In person', 'Content', 'Calls', 'Regulars', 'Gross profit', 'Fixed costs and finding clients', 'Profit', 'Gap to your goal (negative = short)', 'Runway: months your cash covers the gap']
for i, lab in enumerate(labels_f):
    label(tf, r + i, 2, lab, bold=lab in ('Profit', 'Gross profit'))
for col, (name, aud, conv, house, war, sick) in cols.items():
    ct, cl, rg = others_future(aud, conv, war, sick)
    tf[f'{col}{r}'] = f'={ip_future(aud, conv, house, war, sick)}'
    tf[f'{col}{r+1}'] = f'={ct}'
    tf[f'{col}{r+2}'] = f'={cl}'
    tf[f'{col}{r+3}'] = f'={rg}'
    tf[f'{col}{r+4}'] = f'=SUM({col}{r}:{col}{r+3})'
    tf[f'{col}{r+5}'] = f'=-{N("fixed")}-{N("acqSpend")}'
    tf[f'{col}{r+6}'] = f'={col}{r+4}+{col}{r+5}'
    tf[f'{col}{r+7}'] = f'={col}{r+6}-{N("goal")}'
    tf[f'{col}{r+8}'] = f'=IF({N("cash")}="","not yet",IF({col}{r+7}>=0,"not needed",{N("cash")}/(-{col}{r+7})))'
    for i in range(9):
        c = tf[f'{col}{r+i}']; c.font = font(10, bold=i in (4, 6), color=GREEN_INK if i == 6 else INK); c.alignment = RIGHT; c.number_format = NUM1 if i == 8 else MONEY
FUT_ROW = r
r += 10
label(tf, r, 2, 'Disaster switches live on My Numbers: the source stops, a price war, a month off sick. Dream adds nothing on top of its multipliers; add your own upside in the pink cells.', color=MAUVE); tf.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5); tf.row_dimensions[r].height = 30
ch = BarChart(); ch.type = 'col'; ch.title = 'Profit a month in each future'; ch.height = 7.5; ch.width = 13; ch.legend = None
ch.add_data(Reference(tf, min_col=3, max_col=5, min_row=FUT_ROW + 6, max_row=FUT_ROW + 6), from_rows=True, titles_from_data=False); ch.set_categories(Reference(tf, min_col=3, max_col=5, min_row=4, max_row=4)); ch.series[0].graphicalProperties.solidFill = 'BE185D'; ch.y_axis.numFmt = '$#,##0'
tf.add_chart(ch, 'B17')
ch2 = BarChart(); ch2.type = 'col'; ch2.grouping = 'stacked'; ch2.overlap = 100; ch2.title = 'Each business in each future'; ch2.height = 7.5; ch2.width = 13
ch2.add_data(Reference(tf, min_col=2, max_col=5, min_row=FUT_ROW, max_row=FUT_ROW + 3), from_rows=True, titles_from_data=True); ch2.set_categories(Reference(tf, min_col=3, max_col=5, min_row=4, max_row=4))
for s, colr in zip(ch2.series, ['BE185D', 'EC4899', 'F9A8D4', 'FBCFE8']): s.graphicalProperties.solidFill = colr
ch2.y_axis.numFmt = '$#,##0'
tf.add_chart(ch2, 'B33')

# =====================================================================
# 6. Plan
# =====================================================================
pl = wb.create_sheet('Plan')
title(pl, 'Plan', 'What your goal needs, what your offer is worth per hour of you, and what a client is worth over time against what one costs to find.', width=6)
widths(pl, [4, 46, 18, 40, 4, 4])
r = 4
section(pl, r, 'What the goal needs (in person)', width=6); r += 1
label(pl, r, 2, 'Gross profit needed = goal + fixed costs + finding clients'); formula_cell(pl, r, 3, f'={N("goal")}+{N("fixed")}+{N("acqSpend")}', MONEY); NEEDGP = f'C{r}'; r += 1
label(pl, r, 2, 'Gross profit one contact brings (before any cap)'); formula_cell(pl, r, 3, f'={M["gpPerInq"]}', MONEY2); GPI = f'C{r}'; r += 1
label(pl, r, 2, 'Contacts a month the goal needs', bold=True); formula_cell(pl, r, 3, f'=IF(OR({GPI}="",{GPI}<=0),"not yet",ROUNDUP({NEEDGP}/{GPI},0))', NUM0, bold=True, color=ROSE); NEEDINQ = f'C{r}'; r += 1
label(pl, r, 2, 'You have'); formula_cell(pl, r, 3, f'={N("inq")}', NUM0); r += 1
label(pl, r, 2, 'Sessions that would mean'); formula_cell(pl, r, 3, f'=IF({NEEDINQ}="not yet","not yet",{NEEDINQ}*{M["sessPerInq"]})', NUM1); NEEDSESS = f'C{r}'; r += 1
label(pl, r, 2, 'Within your capacity?', bold=True); c = formula_cell(pl, r, 3, f'=IF({NEEDSESS}="not yet","not yet",IF({M["capacity"]}="","No cap set",IF({NEEDSESS}<={M["capacity"]},"Yes","No: at these prices the goal needs more than you can deliver. Raise price or add an offer before chasing volume.")))', None, bold=True); pl.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4); c.alignment = Alignment(wrap_text=True, horizontal='left'); pl.row_dimensions[r].height = 34; r += 2

section(pl, r, 'Your offer, per hour of you', width=6); r += 1
label(pl, r, 2, 'Gross profit per session = price × (1 − cut) − delivery'); formula_cell(pl, r, 3, f'={M["gpSess"]}', MONEY2); r += 1
label(pl, r, 2, 'Per all-in hour = (price − delivery) ÷ all-in hours', bold=True); formula_cell(pl, r, 3, f'=IF({N("allIn")}>0,({N("price")}-{N("delivery")})/{N("allIn")},"not yet")', MONEY2, bold=True, color=ROSE); r += 1
label(pl, r, 2, 'Program: gross profit per client'); formula_cell(pl, r, 3, f'={N("arcPrice")}*(1-{N("arcFee")})-{N("arcVar")}', MONEY2); ARCGP = f'C{r}'; r += 1
label(pl, r, 2, 'Program: clients a month for the goal, and hours'); formula_cell(pl, r, 3, f'=IF({ARCGP}>0,{N("goal")}/{ARCGP},"not yet")', NUM1); formula_cell(pl, r, 4, f'=IF({ARCGP}>0,TEXT({N("goal")}/{ARCGP}*{N("arcHours")},"0.0")&" hours a month","")', None); pl.cell(row=r, column=4).alignment = Alignment(horizontal='left'); r += 2

section(pl, r, 'The value stack: what a client gets, in dollars, next to the price', width=6); r += 1
header(pl, r, ['', 'Piece', 'Worth to them', 'Leave a piece empty if it does not apply']); r += 1
VS_START = r
for piece, val in [('The core result: what the time itself is worth to them', 800), ('Preparation done for them before they arrive', 200), ('Aftercare and follow-up', 150), ('Priority access or a guaranteed date', 300), ('Something only you do', 400), ('A bonus that costs you little and means a lot', 100)]:
    label(pl, r, 2, piece); input_cell(pl, r, 3, val, MONEY); r += 1
VS_END = r - 1
label(pl, r, 2, 'The stack adds up to', bold=True); formula_cell(pl, r, 3, f'=SUM(C{VS_START}:C{VS_END})', MONEY, bold=True); STACK = f'C{r}'; r += 1
label(pl, r, 2, 'Stack ÷ price (3x or more makes the price feel small)'); formula_cell(pl, r, 3, f'=IF({N("price")}>0,{STACK}/{N("price")},"")', '0.0"x"'); r += 1
label(pl, r, 2, 'Price the stack supports at 3x', bold=True); formula_cell(pl, r, 3, f'={STACK}/3', MONEY, bold=True, color=ROSE); r += 1
label(pl, r, 2, 'Value equation and value stack after Alex Hormozi ($100M Offers). SLAM is independent; no book text is reproduced.', color=MAUVE); pl.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4); r += 2

section(pl, r, 'What a client is worth, against what one costs to find', width=6); r += 1
label(pl, r, 2, 'Worth over their time = gross profit per session × (1 + rebook)'); formula_cell(pl, r, 3, f'={M["gpSess"]}*(1+{N("rebook")})', MONEY2); LTGP = f'C{r}'; r += 1
label(pl, r, 2, 'Cost to find one = (spend + hours × your hourly value) ÷ new clients'); formula_cell(pl, r, 3, f'=IF({M["newC"]}>0,({N("acqSpend")}+{N("acqHours")}*{N("hourly")})/{M["newC"]},"not yet")', MONEY2); CAC = f'C{r}'; r += 1
label(pl, r, 2, 'Worth : cost (aim for 3 : 1 or better)', bold=True); formula_cell(pl, r, 3, f'=IF(OR({CAC}="not yet",{CAC}<=0),"no cost yet",{LTGP}/{CAC})', '0.0" : 1"', bold=True, color=ROSE); r += 1
label(pl, r, 2, 'Days to pay back = cost ÷ (gross profit per session ÷ 30)'); formula_cell(pl, r, 3, f'=IF(OR({CAC}="not yet",{M["gpSess"]}<=0),"not yet",{CAC}/({M["gpSess"]}/30))', NUM0); r += 1
label(pl, r, 2, 'Worth-to-cost after Alex Hormozi ($100M Leads). SLAM is independent.', color=MAUVE); pl.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
ch = BarChart(); ch.type = 'bar'; ch.title = 'The value stack'; ch.height = 7; ch.width = 12; ch.legend = None
ch.add_data(Reference(pl, min_col=3, min_row=VS_START, max_row=VS_END), titles_from_data=False); ch.set_categories(Reference(pl, min_col=2, min_row=VS_START, max_row=VS_END)); ch.series[0].graphicalProperties.solidFill = 'F472B6'; ch.x_axis.numFmt = '$#,##0'
pl.add_chart(ch, 'F14')

# =====================================================================
# 7. Check-in
# =====================================================================
ci = wb.create_sheet('Check-in')
title(ci, 'Check-in', 'One row a week, one minute. Type the Monday date and what happened. After four rows the sheet compares your real weeks to the model.', width=8)
widths(ci, [4, 14, 12, 12, 14, 14, 10, 30])
r = 4
header(ci, r, ['', 'Week of', 'Contacts', 'Bookings', 'Sessions or calls held', 'Reach actions (posts, messages)', 'Energy 1-5', 'Note (keep it plain)']); r += 1
CI_START = r
import datetime
example = [(datetime.date(2026, 9, 7), 12, 3, 2, 20, 4, 'example row: replace with your own week'), (datetime.date(2026, 9, 14), 15, 4, 3, 24, 3, ''), (datetime.date(2026, 9, 21), 11, 2, 3, 18, 4, '')]
for i in range(26):
    rr = r + i
    ex = example[i] if i < len(example) else (None, None, None, None, None, None, None)
    c = input_cell(ci, rr, 2, ex[0], 'yyyy-mm-dd'); c.alignment = Alignment(horizontal='center')
    for j, v in enumerate(ex[1:6]): input_cell(ci, rr, 3 + j, v, NUM0)
    n = input_cell(ci, rr, 8, ex[6], None); n.alignment = Alignment(horizontal='left'); n.font = font(10, color=MAUVE)
CI_END = r + 25
r = CI_END + 2
section(ci, r, 'Your last four weeks against the model', width=8); r += 1
def last4(col):
    rng = f'{col}{CI_START}:{col}{CI_END}'
    return f'IFERROR(AVERAGE(INDEX({rng},MAX(1,COUNT({rng})-3)):INDEX({rng},COUNT({rng}))),"")'
label(ci, r, 2, 'Contacts a week, average of the last four'); formula_cell(ci, r, 3, f'={last4("C")}', NUM1); AVGC = f'C{r}'; r += 1
label(ci, r, 2, 'That is, a month'); formula_cell(ci, r, 3, f'=IF({AVGC}="","",{AVGC}*52/12)', NUM1); MONTHC = f'C{r}'; r += 1
label(ci, r, 2, 'The model assumes'); formula_cell(ci, r, 3, f'={N("inq")}', NUM0); r += 1
label(ci, r, 2, 'Gap', bold=True); c = formula_cell(ci, r, 3, f'=IF({MONTHC}="","log four weeks first",IF({N("inq")}>0,TEXT(({MONTHC}-{N("inq")})/{N("inq")},"+0%;-0%")&IF(ABS(({MONTHC}-{N("inq")})/{N("inq")})>0.1,": consider typing "&TEXT({MONTHC},"0")&" as your contacts on My Numbers",": close enough"),""))', None, bold=True, color=ROSE); ci.merge_cells(start_row=r, start_column=3, end_row=r, end_column=8); c.alignment = Alignment(horizontal='left'); r += 1
label(ci, r, 2, 'Bookings a week, last four'); formula_cell(ci, r, 3, f'={last4("D")}', NUM1); r += 1
label(ci, r, 2, 'Reach actions a week, last four'); formula_cell(ci, r, 3, f'={last4("F")}', NUM1); REACH = f'C{r}'; r += 1
label(ci, r, 2, 'Contacts per reach action'); formula_cell(ci, r, 3, f'=IF(OR({AVGC}="",{REACH}="",{REACH}=0),"",{AVGC}/{REACH})', '0.00'); r += 1
label(ci, r, 2, 'Check-ins saved'); formula_cell(ci, r, 3, f'=COUNT(C{CI_START}:C{CI_END})', NUM0); r += 1
label(ci, r, 2, 'Momentum shows after four check-ins of real numbers. Volume is what moves contacts; consistency beats bursts.', color=MAUVE); ci.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
lc = LineChart(); lc.title = 'Contacts and bookings by week'; lc.height = 7.5; lc.width = 16
lc.add_data(Reference(ci, min_col=3, max_col=4, min_row=CI_START - 1, max_row=CI_END), titles_from_data=True); lc.set_categories(Reference(ci, min_col=2, min_row=CI_START, max_row=CI_END))
lc.series[0].graphicalProperties.line.solidFill = 'BE185D'; lc.series[1].graphicalProperties.line.solidFill = 'F9A8D4'; lc.series[0].smooth = True; lc.series[1].smooth = True
ci.add_chart(lc, 'J4')
ci.freeze_panes = 'A5'

# =====================================================================
# 8. Clients
# =====================================================================
cl = wb.create_sheet('Clients')
title(cl, 'Clients', 'Aliases only. Never names, documents, photos or addresses. Screening keeps a result, never a reason. Regulars carry an agreed monthly budget; the sheet flags anyone past it.', width=9)
widths(cl, [4, 16, 12, 14, 14, 12, 14, 14, 30])
r = 4
header(cl, r, ['', 'Alias', 'Business', 'Stage', 'Screening result', 'Deposit', 'Agreed budget a month', 'Sent this month', 'Next action']); r += 1
CL_START = r
stage_dv = DataValidation(type='list', formula1='"Contacted,Screening,Booked,Showed,Client,Regular,Lost"', allow_blank=True); cl.add_data_validation(stage_dv)
screen_dv = DataValidation(type='list', formula1='"Not yet,Passed,Did not pass,Withdrew"', allow_blank=True); cl.add_data_validation(screen_dv)
dep_dv = DataValidation(type='list', formula1='"None,Asked,Paid,Refunded,Kept"', allow_blank=True); cl.add_data_validation(dep_dv)
biz_dv = DataValidation(type='list', formula1='"In person,Content,Calls,Regulars"', allow_blank=True); cl.add_data_validation(biz_dv)
ex = [('Blue', 'In person', 'Client', 'Passed', 'Paid', None, None, 'example row: replace with your own'), ('Fern', 'Regulars', 'Regular', 'Passed', 'None', 500, 620, 'past their budget: time for a check-in')]
for i in range(40):
    rr = r + i
    e = ex[i] if i < len(ex) else (None,) * 8
    for j, v in enumerate(e):
        c = input_cell(cl, rr, 2 + j, v, MONEY if j in (5, 6) else None)
        if j in (0, 1, 2, 3, 4, 7): c.alignment = Alignment(horizontal='left'); c.font = font(10, color=ROSE if j == 0 else INK, bold=j == 0)
    stage_dv.add(f'D{rr}'); screen_dv.add(f'E{rr}'); dep_dv.add(f'F{rr}'); biz_dv.add(f'C{rr}')
CL_END = r + 39
cl.conditional_formatting.add(f'H{CL_START}:H{CL_END}', CellIsRule(operator='greaterThan', formula=[f'G{CL_START}'], fill=fill(GOLD), font=Font(name=FONT, size=11, bold=True, color=GOLD_INK)))
r = CL_END + 2
section(cl, r, 'Where everyone is', width=9); r += 1
for st in ['Contacted', 'Screening', 'Booked', 'Showed', 'Client', 'Regular', 'Lost']:
    label(cl, r, 2, st); formula_cell(cl, r, 3, f'=COUNTIF(D{CL_START}:D{CL_END},"{st}")', NUM0); r += 1
r += 1
section(cl, r, 'From your log (last 40 rows)', width=9); r += 1
label(cl, r, 2, 'Contacts logged'); formula_cell(cl, r, 3, f'=COUNTA(B{CL_START}:B{CL_END})', NUM0); LOGN = f'C{r}'; r += 1
label(cl, r, 2, 'Passed screening'); formula_cell(cl, r, 3, f'=COUNTIF(E{CL_START}:E{CL_END},"Passed")', NUM0); LOGP = f'C{r}'; r += 1
label(cl, r, 2, 'Booked or further'); formula_cell(cl, r, 3, f'=COUNTIF(D{CL_START}:D{CL_END},"Booked")+COUNTIF(D{CL_START}:D{CL_END},"Showed")+COUNTIF(D{CL_START}:D{CL_END},"Client")+COUNTIF(D{CL_START}:D{CL_END},"Regular")', NUM0); LOGB = f'C{r}'; r += 1
label(cl, r, 2, 'Pass rate from your log'); formula_cell(cl, r, 3, f'=IF({LOGN}>0,{LOGP}/{LOGN},"")', PCT); r += 1
label(cl, r, 2, 'Booking rate from your log'); formula_cell(cl, r, 3, f'=IF({LOGP}>0,{LOGB}/{LOGP},"")', PCT); r += 1
label(cl, r, 2, 'After ten contacts these can replace the estimates on My Numbers. Copy them across when they look right.', color=MAUVE); cl.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
cl.freeze_panes = 'A5'

# =====================================================================
# 9. Definitions
# =====================================================================
df = wb.create_sheet('Definitions')
title(df, 'Definitions', 'Every word and every formula in this workbook, in plain English.', width=4)
widths(df, [4, 28, 90, 4])
r = 4
defs = [
    ('Contacts', 'Every new person who reached out in a month, counted once.'),
    ('Pass rate', 'The share of contacts who pass your screening. Never a sales lever.'),
    ('Booking rate', 'The share of screened people who book.'),
    ('Show rate', 'The share of bookings who turn up.'),
    ('Rebook rate', 'Extra sessions each new client brings over time. 30% = every 10 new clients bring 3 more sessions.'),
    ('Take rate', 'The share of new clients who add an offer on.'),
    ('Gross profit', 'Price × (1 − cut) − what it cost to deliver, added up.'),
    ('Fixed costs', 'Money that leaves every month whether you work or not.'),
    ('Profit', 'Gross profit − money spent finding clients − fixed costs.'),
    ('All-in hours', 'Everything one sale really costs in time: prep, travel, the thing itself, recovery, messages.'),
    ('Capacity', 'The most sessions a month allows: your session ceiling or your hours ÷ all-in hours, whichever is tighter.'),
    ('Runway', 'Months your cash covers the gap between profit and your goal.'),
    ('Typical', 'A starting number so every tab works from the first minute. Yours replaces it.'),
    ('F01', 'clients = contacts × pass × booking × show (× close for a program)'),
    ('F02', 'gross profit per sale = price × (1 − cut) − delivery cost'),
    ('F03', 'sessions = new clients × (1 + rebook) + retainer sessions'),
    ('F04', 'sessions never exceed capacity; when they would, everything scales by capacity ÷ demand'),
    ('F05', 'profit = gross profit − finding clients − fixed costs'),
    ('F06', 'worth over time = gross profit a month × months kept'),
    ('F07', 'cost to find one = (spend + hours × hourly value) ÷ new clients'),
    ('F08', 'worth : cost; payback days = cost ÷ daily gross profit'),
    ('F09', 'per hour = (price − delivery) ÷ all-in hours'),
    ('F10', 'contacts needed = (goal + fixed + spend) ÷ gross profit per contact, then the capacity check'),
    ('F23', 'only counted businesses enter a total; hours go to #1 first, then #2, and so on'),
    ('F24', 'futures apply their multipliers and switches; runway = cash ÷ monthly gap'),
    ('Privacy', 'This file holds your numbers in plain text. Keep it somewhere private. Nothing in it names the kind of work.'),
    ('Advice', 'SLAM gives no legal, tax or investment advice. For those, ask a professional.'),
    ('Credit', 'The value equation, value stack, volume and worth-to-cost follow ideas published by Alex Hormozi. SLAM is independent and not affiliated; no book text is reproduced.'),
]
for term, meaning in defs:
    label(df, r, 2, term, bold=True); label(df, r, 3, meaning, color=MAUVE); df.row_dimensions[r].height = 30; r += 1

# tab colors
for ws_, colr in [(wb['Start Here'], PLUM), (inp, ROSE), (tm, ROSE), (lv, 'EC4899'), (tf, 'EC4899'), (pl, 'F472B6'), (ci, 'F9A8D4'), (cl, 'F9A8D4'), (df, MAUVE)]:
    ws_.sheet_properties.tabColor = colr
from openpyxl.worksheet.properties import PageSetupProperties
for _ws in wb.worksheets:
    _ws.page_setup.orientation = 'landscape'
    _ws.page_setup.fitToWidth = 1
    _ws.page_setup.fitToHeight = 0
    _ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    _ws.print_options.horizontalCentered = True
    _ws.page_margins.left = _ws.page_margins.right = 0.4
wb.save(OUT)
print('saved', OUT)
