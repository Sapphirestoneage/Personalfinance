# Dev Okafor: expected workpaper (tie-out)

Hand-computed from tests/households/dev.json on 2026-10-05. Money in cents inside the engine; shown in dollars here. Rounding: floor(x + 0.5) on cents at each step.
Age at 2026-10-05: born 1995-06-22, so 31. Filing status single.

## Income
- Design consulting (c1099): gross $8,000 per pay x 12 / 12 = $8,000 a month; take-home $5,400 x 12 / 12 = $5,400; bonus $0 a year / 12 = $0; pre-tax retirement $0 x 12 / 12 = $0; other pre-tax $0 x 12 / 12 = $0.
- Gross monthly (bonus and equity included) = $8,000.
- Take-home monthly = $5,400 (bonus take-home is not typed, so it is not counted).
- Pre-tax retirement a month = $0; Roth $0; HSA $0; other pre-tax $0.
- Match a month = $0; max available $0.
- Work hours a month = (paid + commute) x 52 / 12 = 182.0.
- Costs of working a month = $220.

## Spending
- Rent: $1,750 a month (accommodation).
- Electric, water and internet: $190 a month (utilities).
- Groceries: $480 a month (food, rough).
- Restaurants and takeout: $360 a month (food, rough).
- Gas and parking: $160 a month (transportation).
- Car insurance: $145 a month (transportation).
- Phone: $70 a month (utilities).
- Software subscriptions: $85 a month (utilities).
- Climbing gym: $95 a month (therapy).
- Clothing and personal care: $75 a month (wants, rough).
- Coffee shops: $120 a month (wants, rough).
- Travel: $200 a month (irregular, rough).
- Gifts: $41.67 a month (irregular, rough).
- Late payment fees: $15 a month (mistakes).
- Insurance paid from the bank: Health (marketplace) $420 a month (added to spending; paycheck premiums are already out of take-home).
- Spending lines total = $3,786.67 a month.
- Bank-paid premiums = $420 a month.
- Monthly spending (metric 3) = $3,786.67 + $420 = $4,206.67.
- Range: each rough line at its spread (rough 20%, estimated 25%, will-send 30%, a typed range as typed), summed: $3,951.34 to $4,462.
- FAT floor (lines flagged) = $2,725.
- Fixed costs (needs $2,880 + bank premiums $420) = $3,300.
- Mistakes = $15 a month = $180 a year.
- Savings landing in accounts = $1,200 a month.

## Debt and credit
- 2022 Subaru Crosstrek: balance $14,200, rate 6.9%, minimum $318 a month.
- Double Cash: balance $0, rate 22.2%, minimum $0 a month, autopay full (no interest).
- Total debt = $14,200.
- Monthly debt service = $318.
- Weighted APR = sum(balance x rate today) / total = $979.80 / $14,200 = 6.9%.
- Interest over the next 12 months on today's balances: 2022 Subaru Crosstrek: $14,200 x 0.0% x 0/12 + $14,200 x 6.9% x 12/12 = $979.80; Double Cash: paid in full, 0. Total $979.80.
- Utilization: total $0 / $8,000 = 0.0%; per card Double Cash 0.0%.
- Payoff simulation (monthly from 2026-11; interest = balance x rate / 12, promo rate while it runs; a paid-off debt's minimum rolls to the next in order; a full-autopay card is paid in month 1):
  - avalanche order Double Cash > 2022 Subaru Crosstrek: debt-free 2031-02 after 52 payments, total interest $2,258.20. 2026-11: Double Cash paid off (1 payments); 2031-02: 2022 Subaru Crosstrek paid off (52 payments)
  - snowball order Double Cash > 2022 Subaru Crosstrek: debt-free 2031-02 after 52 payments, total interest $2,258.20. 2026-11: Double Cash paid off (1 payments); 2031-02: 2022 Subaru Crosstrek paid off (52 payments)
  - stress order 2022 Subaru Crosstrek > Double Cash: debt-free 2031-02 after 52 payments, total interest $2,258.20. 2026-11: Double Cash paid off (1 payments); 2031-02: 2022 Subaru Crosstrek paid off (52 payments)
- Card Double Cash: rewards $485.20 a year (Electric, water and internet $190/mo at 2x 1.00c = $45.60; Groceries $480/mo at 2x 1.00c = $115.20; Restaurants and takeout $360/mo at 2x 1.00c = $86.40; Gas and parking $160/mo at 2x 1.00c = $38.40; Car insurance $145/mo at 2x 1.00c = $34.80; Phone $70/mo at 2x 1.00c = $16.80; Software subscriptions $85/mo at 2x 1.00c = $20.40; Climbing gym $95/mo at 2x 1.00c = $22.80; Clothing and personal care $75/mo at 2x 1.00c = $18; Coffee shops $120/mo at 2x 1.00c = $28.80; Travel $200/mo at 2x 1.00c = $48; Gifts $41.67/mo at 2x 1.00c = $10); credits used $0; fee $0; net = $0 + $485.20 - $0 = $485.20. A no-fee 2% card on the same spend: $485.20; unused credits $0.
- Rewards left on the table (best library rate per category, portal-only rates capped at 6x, minus actual) = $801.32 a year. Best rates: dining 6.0%, groceries 6.0%, travel 7.8%, gas 6.0%, streaming 6.0%, other 3.0%.

## Investments and accounts
- HSA (hsa): $3,100, bucket hsa, tier semi, market returns
- Solo 401k (solo401k): $21,400, bucket pretax, tier locked, market returns
- Brokerage (taxable): $24,750, bucket taxable, tier liquid, market returns
- Checking (checking): $4,100, bucket cash, tier liquid, cash
- Savings (hysa): $2,600, bucket cash, tier liquid, cash
- Total assets = $55,950; invested (market returns) = $49,250; cash = $6,700.
- By bucket: pretax $21,400, roth $0, taxable $24,750, hsa $3,100, cash $6,700, other $0. By liquidity: liquid $31,450, semi $3,100, locked $21,400.
- Allocation (dollar-weighted over all assets): stocks $47,110 = 84.2%, bonds $2,140 = 3.8%, cash $6,700 = 12.0%, other $0 = 0.0%; US share of stocks 87.2%.
- Weighted expense ratio = sum(balance x ER) / sum(balance with holdings) = $149.99 / $24,750 = 0.606%; fee drag $149.99 a year.
- Annual contributions: employee (payroll $0 x 12 + bank $14,400) = $14,400; employer $0; total $14,400.
- Room left: 401k limit $24,500, used $6,000, left $18,500; hsa-self limit $4,400, used $3,600, left $800.
- Match capture = $0 / $0 = n/a; left on the table $0 x 12 = $0 a year.

## Safety net
- Rule of 5: 31 / 5 = 6.2 months x $4,206.67 = $26,081.35.
- Runway: cash $6,700 / full $4,206.67 = 1.59 months; / needs $3,300 = 2.03; / FAT floor $2,725 = 2.46.
- Emergency gap = max(0, $26,081.35 - $6,700) = $19,381.35; monthly to close = $1,615.11.
- Excess cash = $6,700 - $26,081.35 = $0; drag = $0 x (5% - 1%) = $0 a year.

## Metrics
- 4 Surplus = $5,400 - $4,206.67 - $318 = $875.33.
- 5 Savings rate (take-home) = ($5,400 - $4,206.67) / $5,400 = 22.1%.
- 6 Savings rate (gross) = ($0 + $0 + $0 + $0 + $5,400 - $4,206.67) / ($8,000 + $0) = 14.9%.
- 7 Leak = $875.33 - $1,200 = -$324.67 a month = -6.0% of take-home.
- 8 DRAFTT: debt $318 / $5,400 = 5.9%; retirement ($0 + $0 + $0 + $1,200) / gross $8,000 = 15.0%; accommodation ($1,750 + utilities $345) / take-home = 38.8%; food 15.6%; transportation 5.6%; therapy 1.8%.
- 10 Shelter rate = 38.8%. 11 Fixed-cost rate = $3,300 / $5,400 = 61.1%.
- 12 Real hourly wage = ($5,400 - $220) / 182.0 h = $28.46; stated gross hourly = $8,000 x 12 / 2080 = $46.15 (61.7% of stated).
- 15 DTI = $318 / $8,000 = 4.0%. 16 Debt-to-assets = $14,200 / $55,950 = 25.4%.
- 22 Net worth = $55,950 - $14,200 = $41,750.
- 24 Liquidity rate = $31,450 / $55,950 = 56.2%. 25 Bridge years = ($31,450 + $3,100) / $50,480.04 = 0.68.
- 30 Tax-advantaged share = ($21,400 + $0 + $3,100) / $55,950 = 43.8%.
- Self-employment income $96,000 a year: SE tax = both halves on 92.35% = $13,564.36; half ($6,782.18) is deducted before the federal calculation.
- 38 Federal: taxable = $96,000 - pre-tax ($0 + $0 + $0) x 12 - standard deduction $16,100 = $73,117.82; tax by bracket = $10,797.92; effective $10,797.92 / $96,000 = 11.2%; marginal 22.0%.
- 39 FICA: wages $0 (gross less self-employment income, section 125 and HSA); Social Security 6.2% = $0; Medicare 1.45% = $0; plus SE tax $13,564.36; total $13,564.36.
- 40 Tax saved per $1,000 pre-tax = 22.0% x $1,000 = $220.
- 37 Implied tax rate = (paystub gross $8,000 - take-home $5,400 - deductions $0) / $8,000 = 32.5%.
- 41 FI number = $50,480.04 / 4.0% = $1,262,001.
- 42 % to FI = invested $49,250 / $1,262,001 = 3.9% (FI progress basis: invested assets).
- 43 Coast FI = $1,262,001 / 1.05^14 (1.9799) = $637,396.26; invested $49,250 / $637,396.26 = 7.7%.
- 45 Lean FI = $2,725 x 12 / 4% = $817,500; Fat FI = $50,480.04 x 1.5 / 4% = $1,893,001.50; Barista FI = ($50,480.04 - $24,000) / 4% = $662,001.
- L9 Ladder: Lean $817,500; Barista Lean = ($2,725 - $2,000) x 12 / 4% = $217,500; Barista FI = ($4,206.67 - $2,000) x 12 / 4% = $662,001; FI $1,262,001; Fat $1,893,001.50. Rule: $100 a month = $30,000. Part-time income to be Barista FI today = max(0, $4,206.67 - $49,250 x 4% / 12) = $4,042.50. Years of expenses 0.98; days of freedom 356.1; FI ratio 3.9%.
- 35 Fee drag lifetime = $49,250 x (1.05^14 - (1.05 - 0.00606)^14) = $7,590.08.

## Projection (year by year, real dollars, likely return)
Rules: invested x (1 + r) + contributions (payroll + match + bank + the leak and freed debt payments go to cash); cash x (1 + 1%); debts follow the avalanche simulation; spending is baseline x go-go/slow-go/no-go after retirement; income stops at the later of retirement age and FI age; Social Security from 67 at the bend-point estimate; FI = first year net worth x withdrawal rate covers annual spending.
- Social Security estimate: AIME $8,000; PIA = 0.9 x $1,247 + 0.32 x ($7,518 - $1,247) + 0.15 x max(0, $8,000 - $7,518) = $3,201.32 a month at 67.
- likely return: FI at age None (None); net worth at 95 -$3,406,565.74.
- best return: FI at age None (None); net worth at 95 -$3,370,834.61.
- worst return: FI at age None (None); net worth at 95 -$2,198,661.56.
- First five years (likely): 2027 age 32 invested $66,112.50 cash $6,767 debt $10,764.54 net worth $62,114.96; 2028 age 33 invested $83,818.13 cash $6,834.67 debt $7,592.20 net worth $83,060.60; 2029 age 34 invested $102,409.04 cash $6,903.02 debt $4,193.95 net worth $105,118.11; 2030 age 35 invested $121,929.49 cash $6,972.05 debt $553.65 net worth $128,347.89; 2031 age 36 invested $142,425.96 cash $10,857.77 debt $0 net worth $153,283.73.

## Lenses expected to fire (impact at or above $100 a year)
- Level 9 lenses stated here: fire big-three, double-lever, healthcare-bridge; silent guardrails-room, house-hack, purchase-in-fi-days, withdrawal-sensitivity.
- cost-in-hours, fee-drag, mistake-tax, real-hourly-wage, shelter-heavy, thin-runway, wrong-card (7 lenses).
