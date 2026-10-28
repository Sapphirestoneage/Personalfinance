// Synthetic statements for the uploader's tests (S-243). Every name, number and account is made up; the layouts
// follow Chase's and a generic brokerage's, so the readers see what they will see on real files. Run from slam/:
//   node tools/statement-fixtures.mjs        writes test/fixtures/statements/*.pdf, *.csv, *.ofx
// The expected values live beside them in expected.json (written by hand, checked by test/statements.test.js).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writePdf, layout } from './pdf-write.mjs';

const OUT = fileURLToPath(new URL('../test/fixtures/statements/', import.meta.url));
const L = 36, LV = 236, R = 330, RV = 540;
const two = (a, b, c, d) => [[L, a], [LV, b], [R, c || ''], [RV, d || '']];
const row = (a, b) => [[L, a], [LV, b]];
const tx = (date, words, amt) => [[L, date], [70, words], [520, amt]];

// A Chase card: page 1 the summary and the payment box, page 2 activity, rewards, totals and the rate table.
function chaseCard(o) {
  const p1 = layout([
    [[L, 'CHASE ' + o.title.toUpperCase(), 11], [R, 'Manage your account online: www.chase.com']],
    [[R, 'Customer Service: the number on the back of your card']],
    { gap: 8 },
    [[L, 'ACCOUNT SUMMARY', 10], [R, 'PAYMENT INFORMATION', 10]],
    [[L, 'Account Number: ' + o.acct], [R, 'New Balance'], [RV, '$' + o.newBalance]],
    two('Previous Balance', '$' + o.previousBalance, 'Payment Due Date', o.due),
    two('Payment, Credits', '-$' + o.payments, 'Minimum Payment Due', '$' + o.minimum),
    two('Purchases', '+$' + o.purchases),
    two('Cash Advances', '$0.00'),
    two('Balance Transfers', '$0.00'),
    two('Fees Charged', '$' + o.fees),
    two('Interest Charged', '$' + o.interest),
    [[L, 'New Balance'], [LV, '$' + o.newBalance]],
    { gap: 4 },
    [[L, 'Opening/Closing Date'], [LV, o.period]],
    [[L, o.limitLabel || 'Credit Access Line'], [LV, '$' + o.limit]],
    [[L, 'Available Credit'], [LV, '$' + o.available]],
    [[L, 'Cash Access Line'], [LV, '$' + o.cashLine]],
    [[L, 'Available for Cash'], [LV, '$' + o.availableCash]],
    [[L, 'Past Due Amount'], [LV, '$0.00']],
    [[L, 'Balance over the Credit Access Line'], [LV, '$' + (o.overLimit || '0.00')]],
    { gap: 6 },
    [[R, 'Late Payment Warning: If we do not receive your minimum payment by the']],
    [[R, 'date listed above, you may have to pay a late fee of up to $' + o.lateFee + ' and your']],
    [[R, 'APRs may increase up to the Penalty APR of 29.99%.']],
    { gap: 4 },
    [[R, 'Minimum Payment Warning: If you make only the minimum payment each']],
    [[R, 'period, you will pay more in interest and it will take you longer to pay off']],
    [[R, 'your balance. For example:']],
    [[R, 'If you make no additional charges using this card and each month you pay...']],
    [[R, 'Only the minimum payment'], [430, o.warnMonths + ' years'], [RV, '$' + o.warnTotal]],
    ...(o.warn3 ? [[[R, '$' + o.warn3], [430, '36 months'], [RV, '$' + o.warn3Total]]] : []),
    { gap: 6 },
    ...(o.autopay ? [[[L, 'Your next AutoPay payment for $' + o.autopay + ' will be deducted from your Pay From account and']], [[L, 'credited on the due date. If your due date falls on a weekend or holiday, the payment will be credited']], [[L, 'on the due date and deducted on the business day before.']]] : [[[L, 'Set up AutoPay and never miss a payment. Enroll in AutoPay at chase.com/autopay.']]]),
    { gap: 30 },
    [[L, 'SCENARIO-1D']],
    [[L, 'This Statement is a Facsimile - Not an original']],
    { gap: 10 },
    [[L, o.name], [R, 'Account Number: ' + o.acct]],
    ...(o.business ? [[[L, o.business]]] : []),
    [[L, o.street], [R, 'Payment Due Date: ' + o.due]],
    [[L, o.city], [R, 'New Balance: $' + o.newBalance]],
    [[R, 'Minimum Payment Due: $' + o.minimum]],
    { gap: 8 },
    [[L, '0000' + o.newBalance.replace(/[.,]/g, '') + '00 0' + o.minimum.replace(/[.,]/g, '') + ' 1234567890123456 00000' + o.acct.slice(-4) + ' 1']]
  ]);
  const activity = [
    [[L, 'ACCOUNT ACTIVITY', 10]],
    [[L, 'Date of Transaction'], [120, 'Merchant Name or Transaction Description'], [500, '$ Amount']],
    [[L, 'PAYMENTS AND OTHER CREDITS']],
    ...o.payRows.map((r) => tx(...r)),
    [[L, 'PURCHASE']],
    ...o.rows.map((r) => tx(...r)),
    ...(o.feeRows ? [[[L, 'FEES CHARGED']], ...o.feeRows.map((r) => tx(...r))] : []),
    [[L, 'INTEREST CHARGED']],
    ...(o.interestRows || []).map((r) => tx(...r)),
    [[L, 'TOTAL INTEREST FOR THIS PERIOD'], [520, '$' + o.interest]],
    { gap: 6 },
    [[L, o.rewardsHead, 10]],
    [[L, 'Previous points balance'], [520, o.pointsPrev]],
    ...o.earn.map(([w, n]) => [[L, w], [520, n]]),
    ...(o.redeemed ? [[[L, 'Points redeemed'], [520, '-' + o.redeemed]]] : []),
    [[L, 'Total points available for redemption'], [520, o.pointsAvail]],
    { gap: 6 },
    [[L, '2026 Totals Year-to-Date', 10]],
    [[L, 'Total fees charged in 2026'], [LV, '$' + o.ytdFees]],
    [[L, 'Total interest charged in 2026'], [LV, '$' + o.ytdInterest]],
    [[L, 'Year-to-date totals do not reflect any fee or interest refunds you may have received.']],
    { gap: 6 },
    [[L, 'INTEREST CHARGES', 10]],
    [[L, 'Your Annual Percentage Rate (APR) is the annual interest rate on your account.']],
    [[L, 'Balance Type'], [250, 'Annual Percentage Rate (APR)'], [380, 'Balance Subject To Interest Rate'], [500, 'Interest Charges']],
    [[L, 'PURCHASES']],
    ...o.aprRows.map(([label, apr, subj, int]) => [[L, label], [250, apr + '%(v)(d)'], [380, subj], [500, int]]),
    [[L, 'CASH ADVANCES']],
    [[L, 'Cash Advances'], [250, o.cashApr + '%(v)(d)'], [380, '-0-'], [500, '-0-']],
    [[L, 'BALANCE TRANSFERS']],
    [[L, 'Balance Transfer'], [250, o.transferApr + '%(v)(d)'], [380, '-0-'], [500, '-0-']],
    ...(o.loanApr ? [[[L, 'MY CHASE LOAN']], [[L, 'My Chase Loan'], [250, o.loanApr + '%(f)'], [380, '$1,000.00'], [500, '$8.25']]] : []),
    [[L, '(v) = Variable Rate (d) = Daily Balance Method (including new transactions)']],
    [[L, 'Please see Information About Your Account section for the Calculation of Balance Subject to Interest Rate,']],
    [[L, 'Annual Renewal Notice, How to Avoid Interest on Purchases, and other important information, as applicable.']]
  ];
  return writePdf([p1, layout(activity)]);
}

const sapphire = chaseCard({
  title: 'Sapphire Preferred', acct: '4147 2021 1234 7001', newBalance: '512.35', previousBalance: '340.00', payments: '340.00', purchases: '412.00', fees: '95.00', interest: '5.35',
  due: '10/31/26', minimum: '40.00', period: '09/04/26 - 10/03/26', limit: '5,000', available: '4,487', cashLine: '1,000', availableCash: '1,000', lateFee: '40.00',
  warnMonths: '2', warnTotal: '583', warn3: '19', warn3Total: '684', autopay: '40.00',
  name: 'JORDAN DEMO', street: '123 EXAMPLE ST APT 4', city: 'ANYTOWN NY 10001-1234',
  payRows: [['09/28', 'AUTOMATIC PAYMENT - THANK YOU', '-340.00']],
  rows: [['09/10', 'TRADER JOES #123 ANYTOWN NY', '86.20'], ['09/15', 'LYFT *RIDE SUN 9AM', '24.80'], ['09/22', 'AIRBNB * HMABCDEFG', '301.00']],
  feeRows: [['10/03', 'ANNUAL MEMBERSHIP FEE', '95.00']],
  interestRows: [['10/03', 'PURCHASE INTEREST CHARGE', '5.35']],
  rewardsHead: 'ULTIMATE REWARDS SUMMARY', pointsPrev: '1,200', earn: [['+ 1 Pt/$1 earned on all purchases', '111'], ['+ 2 Pts/$1 earned on travel and dining', '234']], redeemed: null, pointsAvail: '1,545',
  ytdFees: '95.00', ytdInterest: '12.10',
  aprRows: [['Purchases prior to 07/15/2026', '18.99', '$300.00', '$4.75'], ['Purchases', '22.99', '$40.00', '$0.60']], cashApr: '27.99', transferApr: '22.99'
});
const ink = chaseCard({
  title: 'Ink Business Unlimited', acct: '4246 3151 0000 7002', newBalance: '3,015.40', previousBalance: '2,890.10', payments: '95.00', purchases: '178.20', fees: '0.00', interest: '42.10',
  due: '10/27/26', minimum: '95.00', period: '09/06/26 - 10/05/26', limit: '3,000', available: '0', cashLine: '600', availableCash: '0', lateFee: '40.00', overLimit: '15.40',
  warnMonths: '9', warnTotal: '5,210', autopay: '95.00',
  name: 'JORDAN DEMO', business: 'DEMO CONSULTING LLC', street: '123 EXAMPLE ST APT 4', city: 'ANYTOWN NY 10001-1234',
  payRows: [['09/27', 'AUTOMATIC PAYMENT - THANK YOU', '-95.00']],
  rows: [['09/12', 'ADOBE *CREATIVE CLOUD', '59.99'], ['09/20', 'STAPLES 00123 ANYTOWN NY', '48.21'], ['10/01', 'GOOGLE *WORKSPACE', '70.00']],
  interestRows: [['10/05', 'PURCHASE INTEREST CHARGE', '42.10']],
  rewardsHead: 'ULTIMATE REWARDS SUMMARY', pointsPrev: '640', earn: [['+ 1.5% (1.5 Pts)/$1 earned on all purchases', '180']], redeemed: null, pointsAvail: '820',
  ytdFees: '0.00', ytdInterest: '131.55',
  aprRows: [['Purchases', '17.49', '$2,901.33', '$42.10']], cashApr: '27.99', transferApr: '17.49'
});
const amazon = chaseCard({
  title: 'Amazon Prime Visa', acct: '4147 2022 5555 7003', newBalance: '236.18', previousBalance: '410.50', payments: '410.50', purchases: '236.18', fees: '0.00', interest: '0.00',
  due: '11/03/26', minimum: '35.00', period: '09/07/26 - 10/06/26', limit: '8,000', available: '7,763', cashLine: '1,600', availableCash: '1,600', lateFee: '39.00', limitLabel: 'Credit Limit',
  warnMonths: '1', warnTotal: '250', autopay: '236.18',
  name: 'JORDAN DEMO', street: '123 EXAMPLE ST APT 4', city: 'ANYTOWN NY 10001-1234',
  payRows: [['09/30', 'AUTOMATIC PAYMENT - THANK YOU', '-410.50']],
  rows: [['09/09', 'AMAZON MKTPL*AB12CD34E Amzn.com/bill WA', '48.99'], ['09/18', 'WHOLE FOODS MARKET ANYTOWN NY', '112.40'], ['09/25', 'SHELL OIL 12345678 ANYTOWN NY', '42.79'], ['10/02', 'AMAZON PRIME*XY98ZW Amzn.com/bill WA', '32.00']],
  rewardsHead: 'AMAZON REWARDS SUMMARY', pointsPrev: '1,900', earn: [['+ 5% back at Amazon.com, Amazon Fresh and Whole Foods Market', '125'], ['+ 2% back at restaurants, gas stations and drugstores', '20'], ['+ 1% back on all other purchases', '31']], redeemed: '1,950', pointsAvail: '126',
  ytdFees: '0.00', ytdInterest: '0.00',
  aprRows: [['Purchases', '19.24', '-0-', '-0-']], cashApr: '27.99', transferApr: '19.24'
});

// Chase checking and savings: the summary box, then the detail with a running balance.
function chaseBank(o) {
  const p1 = layout([
    [[L, 'CHASE', 11], [R, 'Customer Service Information']],
    [[L, 'JPMorgan Chase Bank, N.A.'], [R, 'Web site: Chase.com']],
    [[L, 'P O Box 182051'], [R, 'Service Center: see Chase.com']],
    [[L, 'Columbus, OH 43218-2051']],
    { gap: 10 },
    [[L, o.period]],
    [[L, 'Account Number: ' + o.acct]],
    { gap: 10 },
    [[L, 'JORDAN DEMO']],
    [[L, '123 EXAMPLE ST APT 4']],
    [[L, 'ANYTOWN NY 10001-1234']],
    { gap: 14 },
    [[L, o.head, 10], [R, o.product]],
    [[L, ''], [LV, 'INSTANCES'], [R, 'AMOUNT']],
    [[L, 'Beginning Balance'], [R, '$' + o.beginning]],
    [[L, 'Deposits and Additions'], [LV, String(o.deposits.length)], [R, o.depositTotal]],
    ...o.parts.map(([w, n, a]) => [[L, w], [LV, n], [R, a]]),
    [[L, 'Ending Balance'], [LV, String(o.count)], [R, '$' + o.ending]],
    ...(o.apy ? [{ gap: 4 }, [[L, 'Annual Percentage Yield Earned'], [R, o.apy + '%']], [[L, 'Interest Paid This Period'], [R, '$' + o.interestPeriod]], [[L, 'Interest Paid Year-to-Date'], [R, '$' + o.interestYtd]]] : []),
    { gap: 10 },
    [[L, 'TRANSACTION DETAIL', 10]],
    [[L, 'DATE'], [70, 'DESCRIPTION'], [430, 'AMOUNT'], [510, 'BALANCE']],
    [[L, ''], [70, 'Beginning Balance'], [510, '$' + o.beginning]],
    ...o.detail.map(([d, w, a, b]) => [[L, d], [70, w], [430, a], [510, b]]),
    [[L, ''], [70, 'Ending Balance'], [510, '$' + o.ending]]
  ]);
  return writePdf([p1]);
}
const checking = chaseBank({
  period: 'September 11, 2026 through October 10, 2026', acct: '000000098764410', head: 'CHECKING SUMMARY', product: 'Chase Total Checking',
  beginning: '1,850.22', deposits: [1, 2], depositTotal: '4,200.00', parts: [['ATM & Debit Card Withdrawals', '3', '-245.67'], ['Electronic Withdrawals', '2', '-595.00']], count: 7, ending: '5,209.55',
  detail: [
    ['09/19', 'ACME WIDGETS PAYROLL PPD ID: 1234567890', '2,100.00', '3,950.22'],
    ['09/21', 'Card Purchase 09/20 Trader Joes #123 Anytown NY Card 1234', '-86.20', '3,864.02'],
    ['09/27', 'CHASE CREDIT CRD AUTOPAY PPD ID: 4760039224 7002', '-95.00', '3,769.02'],
    ['10/01', 'Online Transfer To Sav ...5520 Transaction#: 1234', '-500.00', '3,269.02'],
    ['10/03', 'ACME WIDGETS PAYROLL PPD ID: 1234567890', '2,100.00', '5,369.02'],
    ['10/05', 'Card Purchase 10/04 Shell Oil 12345678 Anytown NY Card 1234', '-42.79', '5,326.23'],
    ['10/08', 'Card Purchase 10/07 Netflix.com Card 1234', '-15.49', '5,310.74'],
    ['10/09', 'Card Purchase 10/08 Cvs Pharmacy Anytown NY Card 1234', '-101.19', '5,209.55']
  ]
});
const savings = chaseBank({
  period: 'September 11, 2026 through October 10, 2026', acct: '000000098765520', head: 'SAVINGS SUMMARY', product: 'Chase Savings',
  beginning: '10,000.00', deposits: [1, 2], depositTotal: '503.75', parts: [['Electronic Withdrawals', '0', '0.00']], count: 2, ending: '10,503.75', apy: '0.45', interestPeriod: '3.75', interestYtd: '31.20',
  detail: [['10/01', 'Online Transfer From Chk ...4410 Transaction#: 1234', '500.00', '10,500.00'], ['10/10', 'Interest Payment', '3.75', '10,503.75']]
});

// J.P. Morgan Self-Directed Investing (taxable) and a Roth IRA at a made-up firm, read by the generic words.
function investment(o) {
  const p1 = layout([
    [[L, o.firm, 11], [R, o.kind]],
    [[L, 'Account Number: ' + o.acct], [R, 'Statement Period: ' + o.period]],
    { gap: 8 },
    [[L, 'JORDAN DEMO' + (o.joint ? ' AND SAM DEMO JTWROS' : '')]],
    [[L, '123 EXAMPLE ST APT 4']],
    [[L, 'ANYTOWN NY 10001-1234']],
    { gap: 10 },
    [[L, 'ACCOUNT SUMMARY', 10], [R, 'INCOME SUMMARY', 10]],
    [[L, 'Beginning Value'], [LV, '$' + o.beginning], [R, ''], [420, 'This Period'], [RV, 'Year to Date']],
    [[L, 'Deposits'], [LV, '$' + o.deposits], [R, 'Dividends'], [420, '$' + o.divPeriod], [RV, '$' + o.divYtd]],
    [[L, 'Withdrawals'], [LV, '$' + o.withdrawals], [R, 'Qualified Dividends'], [420, '$' + o.qdPeriod], [RV, '$' + o.qdYtd]],
    [[L, 'Dividends and Interest'], [LV, '$' + o.divPeriod], [R, 'Interest'], [420, '$0.00'], [RV, '$' + o.intYtd]],
    [[L, 'Change in Value'], [LV, o.change]],
    [[L, 'Ending Value'], [LV, '$' + o.ending]],
    { gap: 8 },
    [[L, 'REALIZED GAIN/LOSS', 10], [R, 'CASH', 10]],
    [[L, 'Short-Term Gain/Loss Year to Date'], [LV, '$' + o.stg], [R, 'Cash and Sweep Funds'], [RV, '$' + o.cash]],
    [[L, 'Long-Term Gain/Loss Year to Date'], [LV, '$' + o.ltg], [R, 'Sweep Yield'], [RV, o.sweep + '%']],
    ...(o.ira ? [{ gap: 8 }, [[L, 'RETIREMENT SUMMARY', 10]], [[L, 'Contributions for Tax Year 2026'], [LV, '$' + o.contrib]], [[L, 'Distributions Year-to-Date'], [LV, '$0.00']]] : []),
    { gap: 10 },
    [[L, 'HOLDINGS', 10]],
    [[L, 'Description'], [200, 'Symbol'], [260, 'Quantity'], [320, 'Price'], [380, 'Market Value'], [450, 'Cost Basis'], [520, 'Unrealized Gain/Loss']],
    [[L, o.assetClass]],
    ...o.holdings.map((h) => [[L, h[0]], [200, h[1]], [260, h[2]], [320, h[3]], [380, h[4]], [450, h[5]], [520, h[6]]]),
    [[L, 'Total'], [380, '$' + o.holdTotal]],
    { gap: 8 },
    [[L, 'This Statement is a Facsimile']]
  ]);
  return writePdf([p1]);
}
const brokerage = investment({
  firm: 'J.P. Morgan Self-Directed Investing', kind: 'Individual Brokerage Account', acct: '****8801', period: '09/01/2026 - 09/30/2026',
  beginning: '24,500.00', deposits: '1,000.00', withdrawals: '0.00', divPeriod: '85.40', divYtd: '612.30', qdPeriod: '80.00', qdYtd: '540.00', intYtd: '12.40', change: '$610.25', ending: '26,195.65',
  stg: '0.00', ltg: '320.50', cash: '1,195.65', sweep: '4.10', assetClass: 'ETFs',
  holdings: [['Vanguard Total Stock Market ETF', 'VTI', '100.000', '$250.00', '$25,000.00', '$20,000.00', '$5,000.00']], holdTotal: '25,000.00'
});
const roth = investment({
  firm: 'Northwind Investments', kind: 'Roth IRA', acct: '****9901', period: '09/01/2026 - 09/30/2026', ira: true,
  beginning: '14,800.00', deposits: '500.00', withdrawals: '0.00', divPeriod: '0.00', divYtd: '140.00', qdPeriod: '0.00', qdYtd: '140.00', intYtd: '0.00', change: '-$50.00', ending: '15,250.00',
  stg: '0.00', ltg: '0.00', cash: '3,250.00', sweep: '3.90', contrib: '3,500.00', assetClass: 'ETFs',
  holdings: [['Vanguard Total Intl Stock ETF', 'VXUS', '200.000', '$60.00', '$12,000.00', '$11,000.00', '$1,000.00']], holdTotal: '12,000.00'
});

// A 401(k) at a recordkeeper: sources, vesting, a loan, funds.
const k401 = writePdf([layout([
  [[L, 'Fidelity Investments', 11], [R, 'Your Retirement Savings Statement']],
  [[L, 'Plan: ACME WIDGETS 401(K) PLAN'], [R, 'Statement Period: 07/01/2026 - 09/30/2026']],
  [[L, 'Employer: Acme Widgets Inc'], [R, 'Plan Account Number: 12345-6789']],
  { gap: 8 },
  [[L, 'JORDAN DEMO']], [[L, '123 EXAMPLE ST APT 4']], [[L, 'ANYTOWN NY 10001-1234']],
  { gap: 10 },
  [[L, 'ACCOUNT SUMMARY', 10]],
  [[L, 'Total Balance'], [LV, '$48,200.00']],
  [[L, 'Vested Balance'], [LV, '$45,700.00']],
  [[L, 'Vesting: 80% vested in employer contributions']],
  [[L, 'Contribution Rate'], [LV, '6%']],
  [[L, 'Your Contributions Year-to-Date'], [LV, '$5,400.00']],
  [[L, 'Employer Contributions Year-to-Date'], [LV, '$2,700.00']],
  [[L, 'Outstanding Loan Balance'], [LV, '$3,000.00']],
  [[L, 'Loan Payment'], [LV, '$125.00 per paycheck']],
  [[L, 'Personal Rate of Return'], [LV, '8.4%']],
  { gap: 8 },
  [[L, 'BALANCE BY SOURCE', 10]],
  [[L, 'Employee Pre-Tax'], [LV, '$30,000.00']], [[L, 'Roth'], [LV, '$5,000.00']], [[L, 'Employer Match'], [LV, '$12,500.00']], [[L, 'Rollover'], [LV, '$700.00']],
  { gap: 8 },
  [[L, 'INVESTMENTS', 10]],
  [[L, 'Fund'], [200, 'Symbol'], [330, 'Expense Ratio'], [450, 'Balance']],
  [[L, 'Target Date 2055 Fund'], [200, 'FXYZ'], [330, '0.12%'], [450, '$40,000.00']],
  [[L, 'Total Market Index Fund'], [330, '0.02%'], [450, '$8,200.00']],
  [[L, 'Total'], [450, '$48,200.00']]
])]);

// A federal student loan at a made-up servicer.
const student = writePdf([layout([
  [[L, 'EDUSERV STUDENT LOAN SERVICING', 11], [R, 'Statement Date: 10/20/2026']],
  [[L, 'Account Number: 1234567890'], [R, 'Payment Due Date: 11/15/2026']],
  [[L, 'www.studentaid.gov'], [R, 'Current Amount Due: $210.00']],
  { gap: 8 },
  [[L, 'JORDAN DEMO']], [[L, '123 EXAMPLE ST APT 4']], [[L, 'ANYTOWN NY 10001-1234']],
  { gap: 10 },
  [[L, 'LOAN SUMMARY', 10]],
  [[L, 'Loan Type: Direct Unsubsidized Stafford Loan']],
  [[L, 'Repayment Plan: Standard']],
  [[L, 'Interest Rate: 5.50% Fixed']],
  [[L, 'Original Loan Amount'], [LV, '$22,000.00']],
  [[L, 'Current Principal Balance'], [LV, '$18,400.00']],
  [[L, 'Monthly Payment Amount'], [LV, '$210.00']],
  [[L, 'Interest Paid Year-to-Date'], [LV, '$820.00']],
  [[L, 'Qualifying Payments Made'], [LV, '36']],
  [[L, 'Past Due Amount'], [LV, '$0.00']],
  { gap: 8 },
  [[L, 'PAYMENT ACTIVITY', 10]],
  [[L, '09/15/2026'], [120, 'Payment - Thank You'], [LV, '-$210.00']],
  [[L, '10/15/2026'], [120, 'Payment - Thank You'], [LV, '-$210.00']]
])]);

const cardCsv = 'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n10/02/2026,10/03/2026,ADOBE *CREATIVE CLOUD,Professional Services,Sale,-59.99,\n09/27/2026,09/27/2026,AUTOMATIC PAYMENT - THANK YOU,,Payment,95.00,\n10/04/2026,10/05/2026,GOOGLE *WORKSPACE,Professional Services,Sale,-70.00,\n10/06/2026,10/07/2026,STAPLES 00123 ANYTOWN NY,Shopping,Return,12.50,\n';
const positionsCsv = 'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today\'s Gain/Loss Dollar,Today\'s Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type\nX12345678,Individual,VTI,VANGUARD TOTAL STOCK MARKET ETF,100,$250.00,+$1.00,"$25,000.00",+$100.00,+0.40%,"+$5,000.00",+25.00%,95.44%,"$20,000.00",$200.00,Cash\nX12345678,Individual,SPAXX,FIDELITY GOVERNMENT MONEY MARKET,1195.65,$1.00,$0.00,"$1,195.65",$0.00,0.00%,,,4.56%,,,Cash\n';
const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261010120000<LANGUAGE>ENG<FI><ORG>Example Credit Union<FID>9999</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>USD<BANKACCTFROM><BANKID>123456789<ACCTID>000111222333<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260911<DTEND>20261010
<STMTTRN><TRNTYPE>DIRECTDEP<DTPOSTED>20260919<TRNAMT>1500.00<FITID>1<NAME>PAYROLL DEPOSIT EXAMPLE CO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260922<TRNAMT>-64.10<FITID>2<NAME>GROCERY OUTLET<MEMO>POS PURCHASE</STMTTRN>
<STMTTRN><TRNTYPE>XFER<DTPOSTED>20261001<TRNAMT>-200.00<FITID>3<NAME>TRANSFER TO SAVINGS</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2235.90<DTASOF>20261010</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;

mkdirSync(OUT, { recursive: true });
const files = {
  'chase-sapphire-preferred-7001.pdf': sapphire, 'chase-ink-business-unlimited-7002.pdf': ink, 'chase-amazon-prime-visa-7003.pdf': amazon,
  'chase-total-checking-4410.pdf': checking, 'chase-savings-5520.pdf': savings, 'jpm-brokerage-8801.pdf': brokerage, 'northwind-roth-ira-9901.pdf': roth,
  'fidelity-401k-acme.pdf': k401, 'eduserv-student-loan.pdf': student,
  'Chase7002_Activity20261001_20261028.CSV': cardCsv, 'Portfolio_Positions_Oct-28-2026.csv': positionsCsv, 'example-credit-union-checking.qfx': ofx
};
for (const [name, body] of Object.entries(files)) writeFileSync(OUT + name, body);
console.log('wrote ' + Object.keys(files).length + ' files to ' + OUT);
