# Buy vs Rent workbook: model as text

Extracted from BuyVsRent_v3_Final.xlsx. Cell references are the workbook's own (Dashboard!C6 = home price, and so on).

```
## Dashboard
🏠  BUY vs. RENT  +  FIRE CALCULATOR
  🟡 Yellow cells = YOUR INPUTS  │  Gray cells = auto-calculated (do not edit)  │  All formulas locked & protected
🏡  BUYING | 🏢  RENTING | 📊  RESULTS | 🔥  FIRE
  PROPERTY |   RENT COSTS |   SELECT VIEW YEAR |   YOUR FINANCES
Home Price | 500000 | Monthly Rent | 2500 | View at Year → | 30 | Annual Gross Income | 75000
Down Payment % | 0.2 | Annual Rent Increase | 0.03 | Annual Expenses | 48000
Down Payment $ | =C6*C7 | Renters Insurance ($/mo) | 20 | BUYER NET WORTH | Savings Rate | 0.3
  MORTGAGE | Security Deposit (mo.) | 2 | =IFERROR(INDEX(Schedule!$H:$H,I6+3),0) | Current Savings/Invest. | 25000
Interest Rate (annual) | 0.07 |   INVESTMENT ASSUMPTIONS |   FIRE SETTINGS
Loan Term (years) | 30 | Stock Return (annual) | 0.08 | RENTER NET WORTH | Withdrawal Rate (4% rule) | 0.04
  ONGOING COSTS | Capital Gains Tax Rate | 0.15 | =IFERROR(INDEX(Schedule!$S:$S,I6+3),0) | Investment Return | 0.07
Property Tax (% of value/yr) | 0.012 | Extra Monthly Invest ($) | 0 | Inflation Rate | 0.03
Home Insurance ($/mo) | 150 |   ANALYSIS PERIOD | =IFERROR(IF(INDEX(Schedule!$H:$H,I6+3)>INDEX(Schedule!$S:$S,I6+3),"🏡 BUYING wins by $"&TEXT(INDEX(Schedule!$H:$H,I6+3)-INDEX(Schedule!$S:$S,I6+3),"#,##0"),"🏢 RENTING wins by $"&TEXT(INDEX(Schedule!$S:$S,I6+3)-INDEX(Schedule!$H:$H,I6+3),"#,##0")),"-") |   FIRE - BUY vs RENT
HOA Fees ($/mo) | 0 | Years to Analyze (1–100) | 30 | Monthly Savings if Renting | =MAX(C6*C19+C8,0)/12
Maintenance (% value/yr) | 0.01 | Monthly Cost | =TEXT(C29,"$#,##0") | Monthly Savings if Buying | =MAX(0,0)
PMI Rate (if <20% down) | 0.005 | Cum. Cash Spent | =TEXT(IFERROR(INDEX(Schedule!$G:$G,I6+3),0),"$#,##0") | Your FIRE Number (25x expenses) | =L7*25
  TRANSACTION & GROWTH | Asset Value | =TEXT(IFERROR(INDEX(Schedule!$B:$B,I6+3),0),"$#,##0") | Yrs to FIRE - If Renting | =IFERROR(LOG((L17*L12/(L6*L8)+1),(1+L12)),99)
Buying Closing Costs % | 0.03 | Cum. Interest Paid | =TEXT(IFERROR(INDEX(Schedule!$E:$E,I6+3),0),"$#,##0") | Yrs to FIRE - If Buying | =IFERROR(LOG((L17*L12/(L6*L8*0.8)+1),(1+L12)),99)
Selling Costs % | 0.06
Home Appreciation (yr %) | 0.035
Marginal Tax Rate | 0.28
  MONTHLY PAYMENT BREAKDOWN |   RENTER MATH
Monthly Mortgage (P&I) | =IFERROR((C6-C8)*($$c10/12)*(1+$$c10/12)^($$c11*12)/((1+$$c10/12)^($$c11*12)-1),0) | Renter Invests Upfront | =C8+C6*C19
Monthly Property Tax | =C6*C13/12 | Renter Security Deposit | =F6*F9
Monthly PMI | =IF(C7<0.2,(C6-C8)*C17/12,0) | Monthly Diff Invested by Renter | =MAX(C26+C27+C14+C15+C6*C16/12+C28-(F6+F8),0)+F13
TOTAL Monthly (Buyer) | =C26+C27+C14+C15+C6*C16/12+C28 | TOTAL Monthly (Renter) | =F6+F8
## Expense Breakdown
📊  ANNUAL EXPENSE BREAKDOWN  -  Buyer vs. Renter at Selected Year
Year (linked from Dashboard): | =Dashboard!$I6 | Change 'View at Year' on Dashboard to update all results & charts
  BUYER - Annual Expenses at Selected Year |   RENTER - Annual Expenses at Selected Year | Category | Buyer ($) | Renter ($)
Mortgage Payment (P&I) | =IFERROR(INDEX(Schedule!$I:$I,B2+3),0) | Rent Payments | =IFERROR(INDEX(Schedule!$T:$T,B2+3),0) | Mortgage / Rent | =IFERROR(INDEX(Schedule!$I:$I,B2+3),0) | =IFERROR(INDEX(Schedule!$T:$T,B2+3),0)
Property Tax | =IFERROR(INDEX(Schedule!$J:$J,B2+3),0) | Renters Insurance | =IFERROR(INDEX(Schedule!$U:$U,B2+3),0) | Property Tax | =IFERROR(INDEX(Schedule!$J:$J,B2+3),0) | 0
Homeowner Insurance | =IFERROR(INDEX(Schedule!$K:$K,B2+3),0) | Opp. Cost Invested (notional) | =Dashboard!$F28*12 | Insurance | =IFERROR(INDEX(Schedule!$K:$K,B2+3),0) | =IFERROR(INDEX(Schedule!$U:$U,B2+3),0)
Maintenance & Repairs | =IFERROR(INDEX(Schedule!$L:$L,B2+3),0) | - | - | Maintenance | =IFERROR(INDEX(Schedule!$L:$L,B2+3),0) | 0
PMI | =IFERROR(INDEX(Schedule!$M:$M,B2+3),0) | - | - | PMI / HOA | =IFERROR(INDEX(Schedule!$M:$M,B2+3)+Dashboard!$C15*12,0) | 0
HOA Fees | =Dashboard!$C15*12 | - | -
TOTAL ANNUAL BUYER COST | =SUM(B5:B10) | TOTAL ANNUAL RENTER COST | =E5+E6
## Schedule (columns and year 1 formulas)
Yr | Home Value | Loan Balance | Annual Buyer Cost | Cum. Interest | Cum. Principal | Buyer Cash Spent | Buyer Net Worth ★ | Ann. Mortgage | Ann. Prop Tax | Ann. Insurance | Ann. Mainten. | Ann. PMI | None | Cum. Rent | Annual Rent Cost | Portfolio Value | Renter Cash Spent | Renter Net Worth ★ | Annual Rent | Ann. RentIns
1 | =B3*(1+Dashboard!$C21) | =MAX((Dashboard!$C6-Dashboard!$C8)*(1+Dashboard!$C10/12)^(1*12)-Dashboard!$C26*((1+Dashboard!$C10/12)^(1*12)-1)/(Dashboard!$C10/12),0) | =I4+J4+K4+L4+M4 | =E3+(D4-(C3-C4)) | =(Dashboard!$C6-Dashboard!$C8)-C4 | =G3+D4 | =B4*(1-Dashboard!$C20)-C4 | =IF(C3>0,Dashboard!$C26*12,0) | =B4*Dashboard!$C13 | =Dashboard!$C14*12 | =B4*Dashboard!$C16 | =IF(Dashboard!$C7<0.2,C4*Dashboard!$C17,0) | None | =O3+T4 | =T4+U4 | =Q3*(1+Dashboard!$F11)+Dashboard!$F28*12 | =Dashboard!$F6*Dashboard!$F9+O4+U4*1 | =Q4-MAX(Q4-(Dashboard!$C8+Dashboard!$C6*Dashboard!$C19+Dashboard!$F6*Dashboard!$F9),0)*Dashboard!$F12 | =Dashboard!$F6*(1+Dashboard!$F7)^(1-1)*12 | =Dashboard!$F8*12```

## What to keep
- Inputs: price, down %, rate, term, property tax % of value, insurance, HOA, maintenance %
  of value, PMI rate under 20% down, closing %, selling %, appreciation, marginal tax rate;
  rent, rent increase, renters insurance, security deposit months, stock return, capital
  gains rate, extra monthly invested, analysis years.
- Renter invests the down payment plus buyer closing costs upfront, and each month invests
  the difference between the buyer's total monthly cost and rent plus renters insurance.
- Buyer net worth = sale proceeds (after selling costs) minus loan balance. Renter net worth
  = portfolio after capital gains tax. Year-by-year schedule; "view at year" selector.

## Issues to fix when porting
1. Cumulative interest is computed as annual buyer cost minus principal paid, which also
   counts tax, insurance, maintenance and PMI. Compute interest from the amortization only.
2. PMI never stops. It should end at 20% equity (scheduled, or by appreciation if allowed).
3. Monthly cost uses PMI from the start based on the down payment percent only; tie it to
   loan-to-value each month.
4. Insurance and HOA are flat forever; grow them with inflation.
5. The marginal tax rate input is unused in the schedule (no itemizing logic). Use the
   app's tax.js and compare itemized vs the standard deduction; most clients will not itemize.
6. "Years to FIRE if buying" multiplies savings by 0.8 as a stand-in. Replace with the real
   difference in monthly cost through the projection engine.
7. "Monthly savings if buying" is hard-wired to 0. When owning costs less than renting, the
   buyer should invest the difference too.
