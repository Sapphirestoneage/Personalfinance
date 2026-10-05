# Jordan Avila: expected workpaper (tie-out)

Hand-computed from tests/households/jordan.json on 2026-10-05. Money in cents inside the engine; shown in dollars here. Rounding: floor(x + 0.5) on cents at each step.
Age at 2026-10-05: born 1999-03-14, so 27. Filing status single.

## Income
- Analyst (w2): gross $3,000 per pay x 26 / 12 = $6,500 a month; take-home $2,061.47 x 26 / 12 = $4,466.52; bonus $3,000 a year / 12 = $250; pre-tax retirement $120 x 26 / 12 = $260; other pre-tax $95 x 26 / 12 = $205.83.
- Match: employee defers $120 of $3,000 = 4.0% of pay; match 50.0% of pay up to 6.0%: actual = $6,500 x 50.0% x 4.0% = $130 a month; max = $6,500 x 50.0% x 6.0% = $195 a month.
- Gross monthly (bonus and equity included) = $6,750.
- Take-home monthly = $4,466.52 (bonus take-home is not typed, so it is not counted).
- Pre-tax retirement a month = $260; Roth $0; HSA $0; other pre-tax $205.83.
- Match a month = $130; max available $195.
- Work hours a month = (paid + commute) x 52 / 12 = 205.8.
- Costs of working a month = $180.

## Spending
- Rent: $2,150 a month (accommodation).
- Electric and internet: $142 a month (utilities).
- Groceries: $420 a month (food).
- Restaurants and takeout: $310 a month (food, rough).
- Subway and bus: $132 a month (transportation).
- Phone: $30 a month (utilities).
- Streaming: $38 a month (utilities).
- Gym: $55 a month (therapy).
- Therapy: $240 a month (therapy).
- Clothing and personal care: $90 a month (wants, rough).
- Travel: $150 a month (irregular, rough).
- Gifts: $50 a month (irregular, rough).
- Overdraft and late fees: $35 a month (mistakes).
- Insurance paid from the bank: Renters $14 a month (added to spending; paycheck premiums are already out of take-home).
- Spending lines total = $3,842 a month.
- Bank-paid premiums = $14 a month.
- Monthly spending (metric 3) = $3,842 + $14 = $3,856.
- Range: each rough line at its spread (rough 20%, estimated 25%, will-send 30%, a typed range as typed), summed: $3,736 to $3,976.
- FAT floor (lines flagged) = $2,844.
- Fixed costs (needs $3,114 + bank premiums $14) = $3,128.
- Mistakes = $35 a month = $420 a year.
- Savings landing in accounts = $250 a month.

## Debt and credit
- Freedom Unlimited: balance $2,840, rate 25.0%, promo 0.0% until 2027-03, minimum $85 a month.
- Gold Card: balance $410, rate 25.2%, minimum $35 a month, autopay full (no interest).
- Direct unsubsidized: balance $18,400, rate 5.5%, minimum $196 a month.
- Total debt = $21,650.
- Monthly debt service = $316.
- Weighted APR = sum(balance x rate today) / total = $1,115.48 / $21,650 = 5.2%.
- Interest over the next 12 months on today's balances: Freedom Unlimited: $2,840 x 0.0% x 5/12 + $2,840 x 25.0% x 7/12 = $414; Gold Card: paid in full, 0; Direct unsubsidized: $18,400 x 0.0% x 0/12 + $18,400 x 5.5% x 12/12 = $1,012. Total $1,426.
- Utilization: total $3,250 / $16,500 = 19.7%; per card Freedom Unlimited 43.7%, Gold Card 4.1%.
- Promo cliff: Freedom Unlimited goes from 0.0% to 25.0% in 5 months (2027-03); $2,840 x 25.0% = $709.72 a year after.
- Payoff simulation (monthly from 2026-11; interest = balance x rate / 12, promo rate while it runs; a paid-off debt's minimum rolls to the next in order; a full-autopay card is paid in month 1):
  - avalanche order Gold Card > Freedom Unlimited > Direct unsubsidized: debt-free 2033-09 after 83 payments, total interest $4,935.63. 2026-11: Gold Card paid off (1 payments); 2029-05: Freedom Unlimited paid off (31 payments); 2033-09: Direct unsubsidized paid off (83 payments)
  - snowball order Gold Card > Freedom Unlimited > Direct unsubsidized: debt-free 2033-09 after 83 payments, total interest $4,935.63. 2026-11: Gold Card paid off (1 payments); 2029-05: Freedom Unlimited paid off (31 payments); 2033-09: Direct unsubsidized paid off (83 payments)
  - stress order Freedom Unlimited > Direct unsubsidized > Gold Card: debt-free 2033-09 after 83 payments, total interest $4,935.63. 2026-11: Gold Card paid off (1 payments); 2029-05: Freedom Unlimited paid off (31 payments); 2033-09: Direct unsubsidized paid off (83 payments)
- Card Freedom Unlimited: rewards $143.10 a year (Electric and internet $142/mo at 1.5x 1.00c = $25.56; Subway and bus $132/mo at 5x 1.00c = $79.20; Phone $30/mo at 1.5x 1.00c = $5.40; Streaming $38/mo at 1.5x 1.00c = $6.84; Gym $55/mo at 1.5x 1.00c = $9.90; Clothing and personal care $90/mo at 1.5x 1.00c = $16.20); credits used $0; fee $0; net = $0 + $143.10 - $0 = $143.10. A no-fee 2% card on the same spend: $116.88; unused credits $0.
- Card Gold Card: rewards $410.40 a year (Groceries $420/mo at 4x 1.00c = $201.60; Restaurants and takeout $310/mo at 4x 1.00c = $148.80; Travel $150/mo at 3x 1.00c = $54; Gifts $50/mo at 1x 1.00c = $6); credits used $0; fee $325; net = $0 + $410.40 - $325 = $85.40. A no-fee 2% card on the same spend: $223.20; unused credits $424.
- Rewards left on the table (best library rate per category, portal-only rates capped at 6x, minus actual) = $395.53 a year. Best rates: dining 6.0%, groceries 6.0%, travel 7.8%, gas 6.0%, streaming 6.0%, other 3.0%.

## Investments and accounts
- 401k (401k): $11,250, bucket pretax, tier locked, market returns
- Roth IRA (rothIra): $6,800, bucket roth, tier semi, market returns
- Savings (hysa): $22,600, bucket cash, tier liquid, cash
- Checking (checking): $2,900, bucket cash, tier liquid, cash
- Total assets = $43,550; invested (market returns) = $18,050; cash = $25,500.
- By bucket: pretax $11,250, roth $6,800, taxable $0, hsa $0, cash $25,500, other $0. By liquidity: liquid $25,500, semi $6,800, locked $11,250.
- Allocation (dollar-weighted over all assets): stocks $16,925 = 38.9%, bonds $1,125 = 2.6%, cash $25,500 = 58.6%, other $0 = 0.0%; US share of stocks 82.1%.
- Weighted expense ratio = sum(balance x ER) / sum(balance with holdings) = $16.22 / $18,050 = 0.090%; fee drag $16.22 a year.
- Annual contributions: employee (payroll $260 x 12 + bank $3,000) = $6,120; employer $1,560; total $7,680.
- Room left: 401k limit $24,500, used $3,120, left $21,380; ira limit $7,500, used $3,000, left $4,500.
- Match capture = $130 / $195 = 66.7%; left on the table $65 x 12 = $780 a year.

## Safety net
- Rule of 5: 27 / 5 = 5.4 months x $3,856 = $20,822.40.
- Runway: cash $25,500 / full $3,856 = 6.61 months; / needs $3,128 = 8.15; / FAT floor $2,844 = 8.97.
- Emergency gap = max(0, $20,822.40 - $25,500) = $0; monthly to close = $0.
- Excess cash = $25,500 - $20,822.40 = $4,677.60; drag = $4,677.60 x (5% - 1%) = $187.10 a year.

## Metrics
- 4 Surplus = $4,466.52 - $3,856 - $316 = $294.52.
- 5 Savings rate (take-home) = ($4,466.52 - $3,856) / $4,466.52 = 13.7%.
- 6 Savings rate (gross) = ($260 + $0 + $0 + $130 + $4,466.52 - $3,856) / ($6,750 + $130) = 14.5%.
- 7 Leak = $294.52 - $250 = $44.52 a month = 1.0% of take-home.
- 8 DRAFTT: debt $316 / $4,466.52 = 7.1%; retirement ($260 + $0 + $130 + $250) / gross $6,750 = 9.5%; accommodation ($2,150 + utilities $210) / take-home = 52.8%; food 16.3%; transportation 3.0%; therapy 6.6%.
- 10 Shelter rate = 52.8%. 11 Fixed-cost rate = $3,128 / $4,466.52 = 70.0%.
- 12 Real hourly wage = ($4,466.52 - $180) / 205.8 h = $20.83; stated gross hourly = $6,750 x 12 / 2080 = $38.94 (53.5% of stated).
- 15 DTI = $316 / $6,750 = 4.7%. 16 Debt-to-assets = $21,650 / $43,550 = 49.7%.
- 22 Net worth = $43,550 - $21,650 = $21,900.
- 24 Liquidity rate = $25,500 / $43,550 = 58.6%. 25 Bridge years = ($25,500 + $6,800) / $46,272 = 0.70.
- 30 Tax-advantaged share = ($11,250 + $6,800 + $0) / $43,550 = 41.4%.
- 38 Federal: taxable = $81,000 - pre-tax ($260 + $0 + $205.83) x 12 - standard deduction $16,100 = $59,310.04; tax by bracket = $7,760.21; effective $7,760.21 / $81,000 = 9.6%; marginal 22.0%.
- 39 FICA: wages $78,530.04 (gross less self-employment income, section 125 and HSA); Social Security 6.2% = $4,868.86; Medicare 1.45% = $1,138.69; plus SE tax $0; total $6,007.55.
- 40 Tax saved per $1,000 pre-tax = 22.0% x $1,000 = $220.
- 37 Implied tax rate = (paystub gross $6,500 - take-home $4,466.52 - deductions $465.83) / $6,500 = 24.1%.
- 41 FI number = $46,272 / 4.0% = $1,156,800.
- 42 % to FI = $21,900 / $1,156,800 = 1.9%.
- 43 Coast FI = $1,156,800 / 1.05^33 (5.0032) = $231,212.55; $21,900 / $231,212.55 = 9.5%.
- 45 Lean FI = $2,844 x 12 / 4% = $853,200; Fat FI = $46,272 x 1.5 / 4% = $1,735,200; Barista FI = ($46,272 - $24,000) / 4% = $556,800.
- 35 Fee drag lifetime = $18,050 x (1.05^33 - (1.05 - 0.00090)^33) = $2,515.87.

## Projection (year by year, real dollars, likely return)
Rules: invested x (1 + r) + contributions (payroll + match + bank + the leak and freed debt payments go to cash); cash x (1 + 1%); debts follow the avalanche simulation; spending is baseline x go-go/slow-go/no-go after retirement; income stops at the later of retirement age and FI age; Social Security from 67 at the bend-point estimate; FI = first year net worth x withdrawal rate covers annual spending.
- Social Security estimate: AIME $6,750; PIA = 0.9 x $1,247 + 0.32 x ($6,750 - $1,247) + 0.15 x max(0, $6,750 - $7,518) = $2,883.26 a month at 67.
- likely return: FI at age 78 (2077); net worth at 95 $2,425,689.87.
- best return: FI at age 59 (2058); net worth at 95 $8,222,231.46.
- worst return: FI at age None (None); net worth at 95 $595,246.08.
- First five years (likely): 2027 age 28 invested $26,632.50 cash $26,289.24 debt $18,413.46 net worth $34,508.28; 2028 age 29 invested $35,644.13 cash $27,086.37 debt $15,787.15 net worth $46,943.35; 2029 age 30 invested $45,106.34 cash $27,891.47 debt $12,808.80 net worth $60,189.01; 2030 age 31 invested $55,041.66 cash $28,704.62 debt $9,642.26 net worth $74,104.02; 2031 age 32 invested $65,473.74 cash $29,525.91 debt $6,297.10 net worth $88,702.55.

## Lenses expected to fire (impact at or above $100 a year)
- card-fee, cash-drag, cost-in-hours, match-left, mistake-tax, one-more-point, promo-cliff, real-hourly-wage, shelter-heavy, tax-room, utilization-drag, wrong-card (12 lenses).
