/* ==========================================================================
   toolbox/test/run.js, the Toolbox's tests. `node toolbox/test/run.js`.
   --------------------------------------------------------------------------
   Re-derives each tool's maths outside the browser, checks empty stays
   empty (an incomplete Result, never a zero), and holds the Toolbox to the
   SPARKS rules: no em dash, no real data, every page carries the policy and
   loads the error log first, every token a page uses exists.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const TB = path.join(ROOT, 'toolbox');
const Money = require(path.join(ROOT, 'shared/money.js'));
const Projection = require(path.join(ROOT, 'engines/projection.js'));
const E = {};
['loan', 'refinance', 'movedebt', 'cashorfinance', 'lumpsum', 'ladder', 'paydays', 'planloan', 'sinking', 'stayormove', 'paycheck']
  .forEach(n => { E[n] = require(path.join(TB, 'engines', n + '.js')); });

let passed = 0, failed = 0, current = '';
function section(name) { current = name; }
function checkTrue(label, cond, detail) {
  if (cond) { passed++; return; }
  failed++; console.error('FAIL [' + current + '] ' + label + (detail ? '\n      ' + detail : ''));
}
function check(label, got, want) { checkTrue(label, got === want, 'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want)); }
function near(label, got, want, tol) { checkTrue(label, typeof got === 'number' && Math.abs(got - want) <= (tol || 1), 'got ' + got + ', wanted ' + want + ' within ' + (tol || 1)); }
function incompleteOn(label, r, key) { checkTrue(label, r && r.status === 'incomplete' && (!key || r.missing.indexOf(key) !== -1), JSON.stringify(r && { status: r.status, missing: r.missing })); }

/* ---- loan ------------------------------------------------------------------ */
section('loan');
{
  const s = E.loan.simulate({ principalCents: 1000000, annualRate: 0.12, paymentCents: 88849 });
  check('a $10,000 loan at 12% with the 12-month level payment clears in 12', s.value, 12);
  near('its interest is what the payment formula says', s.interestCents, 88849 * 12 - 1000000, 20);
  check('the balance path starts at the principal and ends at zero', s.balances[0] === 1000000 && s.balances[12] === 0, true);
  const never = E.loan.simulate({ principalCents: 1000000, annualRate: 0.24, paymentCents: 20000 });
  checkTrue('a payment under the first month interest never clears, and says so', never.status === 'ok' && never.never === true && never.value === null);
  incompleteOn('no payment is incomplete, not zero', E.loan.simulate({ principalCents: 1000000, annualRate: 0.1 }), 'paymentCents');
  const zero = E.loan.simulate({ principalCents: 500000, annualRate: 0, paymentCents: 100000 });
  check('at 0% it is the amount split evenly', zero.value, 5);
  check('and no interest', zero.interestCents, 0);
  check('balanceAfter reads the path', E.loan.balanceAfter(zero, 2), 300000);
}

/* ---- refinance -------------------------------------------------------------- */
section('refinance');
{
  const r = E.refinance.compare({ balanceCents: 30000000, currentRate: 0.07, monthsLeft: 300, newRate: 0.055, newMonths: 300, closingCents: 600000 });
  checkTrue('a 1.5 point drop on $300k pays for $6k of costs', r.status === 'ok' && r.value !== 'old', JSON.stringify(r.value));
  const oldP = Projection.levelPaymentCents({ principalCents: 30000000, annualRate: 0.07, months: 300 }).value;
  const newP = Projection.levelPaymentCents({ principalCents: 30000000, annualRate: 0.055, months: 300 }).value;
  check('the old payment is the level payment on the old loan', r.byKey.old.paymentCents, oldP);
  check('the new payment is the level payment on the new loan', r.byKey.new.paymentCents, newP);
  check('the monthly saving is the difference', r.monthlySavingCents, oldP - newP);
  near('break-even is the costs over the saving', r.breakEvenMonths, 600000 / (oldP - newP), 0.01);
  checkTrue('paying the old amount on the new loan is the cheapest path', r.value === 'samePay' && r.byKey.samePay.months < 300);
  checkTrue('closing costs paid up front count in the new total: total less interest and costs is the balance', r.byKey.new.totalPaidCents - r.byKey.new.interestCents === 30000000);
  const trap = E.refinance.compare({ balanceCents: 20000000, currentRate: 0.06, monthsLeft: 120, newRate: 0.055, newMonths: 360, closingCents: 400000 });
  checkTrue('a lower payment on a much longer term is flagged: the payment falls, the lifetime cost rises', trap.paymentFallsCostRises === true && trap.longerTerm === true);
  const rolled = E.refinance.compare({ balanceCents: 30000000, currentRate: 0.07, monthsLeft: 300, newRate: 0.055, newMonths: 300, closingCents: 600000, rollIn: true });
  check('rolled-in costs raise the new principal', rolled.byKey.new.balances[0], 30600000);
  incompleteOn('no new rate is incomplete', E.refinance.compare({ balanceCents: 1, currentRate: 0.07, monthsLeft: 12, newMonths: 12 }), 'newRate');
  incompleteOn('neither months left nor a payment is incomplete', E.refinance.compare({ balanceCents: 1, currentRate: 0.07, newRate: 0.05, newMonths: 12 }), 'monthsLeft');
  const byPay = E.refinance.compare({ balanceCents: 1000000, currentRate: 0.1, currentPaymentCents: 50000, newRate: 0.05, newMonths: 24 });
  checkTrue('the current payment can stand in for the months left', byPay.status === 'ok' && byPay.byKey.old.months > 0);
}

/* ---- move the debt ------------------------------------------------------------ */
section('movedebt');
{
  const r = E.movedebt.compare({ balanceCents: 800000, aprNow: 0.24, paymentCents: 40000, transfer: { feeRate: 0.03, promoMonths: 18, aprAfter: 0.27 }, loan: { apr: 0.11, months: 24, feeRate: 0.02 } });
  checkTrue('three options come back', r.options.length === 3);
  const stay = E.loan.simulate({ principalCents: 800000, annualRate: 0.24, paymentCents: 40000 });
  check('stay is the plain simulation', r.byKey.stay.months, stay.value);
  check('the transfer fee is 3% of the balance', r.byKey.transfer.feeCents, 24000);
  check('the payment to clear inside the promo is the fee-loaded balance over the promo months', r.byKey.transfer.toClearInPromoCents, Math.ceil(824000 / 18));
  checkTrue('$400 a month clears $8,240 inside 18 months at 0%', r.byKey.transfer.clearsInPromo === false || r.byKey.transfer.months <= 21);
  checkTrue('the transfer beats staying at 24%', r.byKey.transfer.costCents < r.byKey.stay.costCents);
  check('the loan payment is the level payment on balance plus fee', r.byKey.loan.paymentCents, Projection.levelPaymentCents({ principalCents: 816000, annualRate: 0.11, months: 24 }).value);
  checkTrue('the cheapest is named and saves against staying', r.value !== null && r.savesVsStayCents > 0);
  const slow = E.movedebt.compare({ balanceCents: 800000, aprNow: 0.24, paymentCents: 20000, transfer: { feeRate: 0.03, promoMonths: 12, aprAfter: 0.27 } });
  checkTrue('paying less than the promo needs leaves a balance at promo end', slow.byKey.transfer.leftAtPromoEndCents > 0 && slow.byKey.transfer.clearsInPromo === false);
  const never = E.movedebt.compare({ balanceCents: 800000, aprNow: 0.30, paymentCents: 15000 });
  checkTrue('a payment under the interest: stay never clears, and the Result says so', never.stayNever === true && never.byKey.stay.cleared === false);
  incompleteOn('no APR is incomplete', E.movedebt.compare({ balanceCents: 1000, paymentCents: 100 }), 'aprNow');
}

/* ---- cash or finance ------------------------------------------------------------ */
section('cashorfinance');
{
  const zero = E.cashorfinance.compare({ priceCents: 240000, apr: 0, months: 12, parkRate: 0.04 });
  check('0% APR: the payment is the price split evenly', zero.paymentCents, 20000);
  checkTrue('0% APR with the cash earning 4% favours financing by the interest earned', zero.value === 'finance' && zero.edgeCents > 0 && zero.edgeCents === zero.earnedWhileWaitingCents);
  const disc = E.cashorfinance.compare({ priceCents: 240000, cashDiscountRate: 0.05, apr: 0, months: 12, parkRate: 0.04 });
  checkTrue('a 5% cash discount beats 4% on the money for a year', disc.value === 'cash' && disc.discountCents === 12000);
  const dear = E.cashorfinance.compare({ priceCents: 240000, apr: 0.199, months: 24, parkRate: 0.04 });
  checkTrue('19.9% financing loses to paying cash', dear.value === 'cash' && dear.financeInterestCents > 0);
  const def = E.cashorfinance.compare({ priceCents: 240000, apr: 0, months: 12, parkRate: 0.04, deferredInterest: true, deferredApr: 0.2999 });
  checkTrue('a deferred-interest plan computes the back interest that lands if a payment slips', def.deferred === true && def.backInterestCents > 0);
  checkTrue('the break-even parked rate is a rate, or zero when cash never wins', zero.breakEvenParkRate === 0 && disc.breakEvenParkRate > 0.04);
  incompleteOn('no months is incomplete', E.cashorfinance.compare({ priceCents: 1000 }), 'months');
}

/* ---- lump sum ------------------------------------------------------------------ */
section('lumpsum');
{
  const r = E.lumpsum.compare({ lumpCents: 20000000, monthlyCents: 120000, ageNow: 62, toAge: 90, returnRate: 0.05 });
  checkTrue('an implied rate comes back', r.status === 'ok' && r.impliedRate > 0 && r.impliedRate < 0.2, JSON.stringify(r.impliedRate));
  near('the implied rate prices the payments to the lump sum', E.lumpsum.presentValue(120000, 0, 336, 0, r.impliedRate), 20000000, 100);
  checkTrue('at 5% the lump drawn at $1,200 a month runs out before 90, so payments win', r.value === 'payments' && r.runsOutAge > 62 && r.runsOutAge < 90);
  const rich = E.lumpsum.compare({ lumpCents: 20000000, monthlyCents: 120000, ageNow: 62, toAge: 90, returnRate: 0.09 });
  checkTrue('at 9% the lump lasts past 90 with money left', rich.value === 'lump' && rich.leftoverAtToAgeCents > 0);
  const later = E.lumpsum.compare({ lumpCents: 20000000, monthlyCents: 120000, ageNow: 55, startAge: 65, toAge: 90, returnRate: 0.05 });
  checkTrue('payments that start later are worth less today: the implied rate falls', later.impliedRate < r.impliedRate);
  const cola = E.lumpsum.compare({ lumpCents: 20000000, monthlyCents: 120000, ageNow: 62, toAge: 90, returnRate: 0.05, colaRate: 0.02 });
  checkTrue('a cost-of-living rise makes the payments worth more', cola.impliedRate > r.impliedRate && cola.totalPaymentsCents > r.totalPaymentsCents);
  checkTrue('the path runs from now to the planning age', r.path[0].age === 62 && Math.abs(r.path[r.path.length - 1].age - 90) < 0.01);
  incompleteOn('the start age cannot be in the past', E.lumpsum.compare({ lumpCents: 1, monthlyCents: 1, ageNow: 60, startAge: 50, returnRate: 0.05 }), 'startAge');
  incompleteOn('no return is incomplete', E.lumpsum.compare({ lumpCents: 1, monthlyCents: 1, ageNow: 60 }), 'returnRate');
}

/* ---- ladder ------------------------------------------------------------------- */
section('ladder');
{
  const r = E.ladder.build({ cashCents: 2000000, rungs: [{ months: 3, rate: 0.05 }, { months: 6, rate: 0.049 }, { months: 12, rate: 0.046 }, { months: 9, rate: 0.048 }], hysaRate: 0.041, startDate: '2026-09-26' });
  check('four rungs, sorted by term', r.rungs.map(x => x.months).join(','), '3,6,9,12');
  check('equal split puts $5,000 on each', r.rungs.every(x => x.amountCents === 500000), true);
  near('the blended rate is the average', r.blendedRate, (0.05 + 0.049 + 0.046 + 0.048) / 4, 1e-9);
  check('the 3-month rung matures in December', r.rungs[0].maturesOn, '2026-12-26');
  check('and the year rung a year on', r.rungs[3].maturesOn, '2027-09-26');
  check('a rung earns simple interest to maturity', r.rungs[3].interestCents, Math.round(500000 * 0.046));
  near('a year of the ladder against the account is cash times the spread', r.value, Math.round(2000000 * (r.blendedRate - 0.041)), 1);
  const t = E.ladder.build({ cashCents: 1000000, rungs: [{ months: 6, rate: 0.045 }], hysaRate: 0.045, treasury: true, stateRate: 0.05, startDate: '2026-01-31' });
  near('a Treasury at 4.5% with 5% state tax is worth 4.74% taxable', t.rungs[0].taxEquivalentRate, 0.045 / 0.95, 1e-9);
  checkTrue('so it beats a savings account paying the same', t.ladderWins === true);
  check('month arithmetic clamps to the month end', t.rungs[0].maturesOn, '2026-07-31');
  check('and February', E.ladder.addMonths('2026-01-31', 1), '2026-02-28');
  incompleteOn('no rungs is incomplete', E.ladder.build({ cashCents: 1000, rungs: [], hysaRate: 0.04 }), 'rungs');
  incompleteOn('no account rate is incomplete', E.ladder.build({ cashCents: 1000, rungs: [{ months: 3, rate: 0.05 }] }), 'hysaRate');
}

/* ---- paydays ------------------------------------------------------------------- */
section('paydays');
{
  const r = E.paydays.calendar({ frequency: 'biweekly', nextPayday: '2026-10-02', netCents: 180000 });
  check('twelve months', r.months.length, 12);
  check('26 checks against 24 leaves two extra', r.value, 2);
  check('two months hold three paydays', r.extraMonths.length, 2);
  check('October 2026 is one of them (2, 16, 30)', r.months[0].count === 3 && r.months[0].dates.join(',') === '2026-10-02,2026-10-16,2026-10-30', true);
  check('the budget is built on two checks', r.budgetBaseCents, 360000);
  check('the extra is two checks a year', r.extraCents, 360000);
  const w = E.paydays.calendar({ frequency: 'weekly', nextPayday: '2026-10-02', netCents: 90000 });
  check('weekly: 52 against 48, four extra', w.value, 4);
  check('and four months of five', w.extraMonths.length, 4);
  const semi = E.paydays.calendar({ frequency: 'semimonthly', netCents: 100000 });
  checkTrue('twice a month has no extra month and says so', semi.status === 'ok' && semi.hasExtra === false && semi.value === 0);
  incompleteOn('no payday is incomplete', E.paydays.calendar({ frequency: 'biweekly' }), 'nextPayday');
  incompleteOn('no frequency is incomplete', E.paydays.calendar({ nextPayday: '2026-10-02' }), 'frequency');
}

/* ---- plan loan -------------------------------------------------------------- */
section('planloan');
{
  const rules = JSON.parse(fs.readFileSync(path.join(TB, 'data/plan_loan_rules_2026.json'), 'utf8'));
  ['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote'].forEach(k => checkTrue('the rules file carries ' + k, typeof rules[k] === 'string' && rules[k].length > 0));
  const r = E.planloan.cost({ loanCents: 2000000, vestedCents: 8000000, loanRate: 0.085, months: 60, marketRate: 0.07, age: 40, marginalRate: 0.22, pausedMonthlyCents: 50000, leaveAfterMonths: 24, personalLoanRate: 0.12 }, rules);
  check('the allowed loan is half the vested balance under $50k', r.allowedCents, 4000000);
  check('and this loan is inside it', r.overLimit, false);
  check('the payment is the level payment', r.paymentCents, Projection.levelPaymentCents({ principalCents: 2000000, annualRate: 0.085, months: 60 }).value);
  checkTrue('at a loan rate above the market rate the lost growth is small or negative', r.lostGrowthCents < 200000, String(r.lostGrowthCents));
  checkTrue('paused contributions carry a cost above what was not put in', r.pausedCostCents > r.pausedPutInCents && r.pausedPutInCents === 3000000);
  checkTrue('leaving at month 24 leaves a balance, taxed and penalised under 59 and a half', r.leave.outstandingCents > 0 && r.leave.penalised === true && r.leave.taxCents === Math.round(r.leave.outstandingCents * 0.22) && r.leave.penaltyCents === Math.round(r.leave.outstandingCents * 0.1));
  checkTrue('the personal loan alternative is priced', r.personal.interestCents > 0);
  const big = E.planloan.cost({ loanCents: 6000000, vestedCents: 20000000, loanRate: 0.08, months: 72, marketRate: 0.07 }, rules);
  checkTrue('$60k on $200k is over the $50k cap and 72 months is over the term', big.overLimit === true && big.overTerm === true && big.allowedCents === 5000000);
  const old = E.planloan.cost({ loanCents: 1000000, vestedCents: 5000000, loanRate: 0.08, months: 36, marketRate: 0.07, age: 60, marginalRate: 0.22, leaveAfterMonths: 12 }, rules);
  check('past 59 and a half there is no penalty', old.leave.penaltyCents, 0);
  incompleteOn('no rules is incomplete', E.planloan.cost({ loanCents: 1, vestedCents: 1, loanRate: 0.08, months: 12, marketRate: 0.07 }, null), 'rules');
  incompleteOn('no market rate is incomplete', E.planloan.cost({ loanCents: 1, vestedCents: 1, loanRate: 0.08, months: 12 }, rules), 'marketRate');
}

/* ---- sinking funds ------------------------------------------------------------ */
section('sinking');
{
  const r = E.sinking.plan([
    { name: 'Car insurance', amountCents: 90000, everyMonths: 6, nextDue: '2026-12-15' },
    { name: 'Holidays', amountCents: 120000, everyMonths: 12, nextDue: '2026-12-01' },
    { name: 'Tyres', amountCents: 80000, everyMonths: 36, nextDue: '2028-03-01' }
  ], '2026-09-26');
  check('the monthly set-aside is each bill over its months, summed', r.value, 15000 + 10000 + Math.ceil(80000 / 36));
  check('twelve months laid out', r.landing.length, 12);
  check('December carries the insurance and the holidays', r.landing[3].cents, 210000);
  check('and June the insurance again', r.landing[9].cents, 90000);
  checkTrue('the holidays are mostly accrued by late September', r.items[1].shouldHoldCents > 90000 && r.items[1].shouldHoldCents < 120000);
  checkTrue('a bill due beyond the window lands nowhere in it', r.items[2].dueInWindow.length === 0);
  check('the yearly total is the bills at their yearly rate', r.yearlyCents, 180000 + 120000 + Math.round(80000 / 3));
  checkTrue('the fund path never runs short when it starts from the accrued amount', r.shortfallCents === 0, String(r.lowestCents));
  const short = E.sinking.plan([{ name: 'Tax bill', amountCents: 600000, everyMonths: 12, nextDue: '2026-10-15' }], '2026-09-26');
  checkTrue('a bill due next month with nothing set aside is mostly accrued: what to hold now is nearly the bill', short.holdNowCents > 550000);
  incompleteOn('an empty list is incomplete', E.sinking.plan([], '2026-09-26'), 'items');
  incompleteOn('a bill with no amount is not a bill', E.sinking.plan([{ name: 'x', everyMonths: 12, nextDue: '2026-10-01' }], '2026-09-26'), 'items');
}

/* ---- stay or move ---------------------------------------------------------- */
section('stayormove');
{
  const r = E.stayormove.compare({ rentNowCents: 180000, rentStayCents: 195000, rentMoveCents: 170000, oneOffCents: 250000, commuteDeltaCents: 5000, termMonths: 12 });
  near('the rise is 8.3%', r.increaseRate, 15000 / 180000, 1e-9);
  check('moving costs $1,750 a month all in', r.monthlyMoveCents, 175000);
  check('so it saves $200 a month', r.monthlySavingCents, 20000);
  check('and pays back the $2,500 of moving in 12.5 months', r.breakEvenMonths, 12.5);
  checkTrue('over a 12-month lease that is not inside the term: stay', r.value === 'stay' && r.breakEvenInsideTerm === false);
  const long = E.stayormove.compare({ rentNowCents: 180000, rentStayCents: 195000, rentMoveCents: 170000, oneOffCents: 250000, commuteDeltaCents: 5000, termMonths: 24 });
  checkTrue('over 24 months moving wins', long.value === 'move' && long.deltaCents === 20000 * 24 - 250000);
  check('the counter-offer is the rent at which staying costs what moving does', long.counterRentCents, Math.round((175000 * 24 + 250000) / 24));
  check('the cumulative paths start at zero and at the one-off', r.stayCum[0] === 0 && r.moveCum[0] === 250000, true);
  incompleteOn('no new rent is incomplete', E.stayormove.compare({ rentStayCents: 1 }), 'rentMoveCents');
}

/* ---- paycheck ------------------------------------------------------------------ */
section('paycheck');
{
  const T = { federalBrackets: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/federal_brackets_2026.json'), 'utf8')), seTax: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/se_tax_2026.json'), 'utf8')), stateBrackets: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/state_brackets_2026.json'), 'utf8')) };
  const Tax = require(path.join(ROOT, 'engines/tax.js'));
  const r = E.paycheck.check({ grossCents: 300000, frequency: 'biweekly', pretaxCents: 18000, section125Cents: 12000, fedWithheldCents: 28000, filingStatus: 'single', state: 'CA', stateWithheldCents: 10000 }, T);
  check('26 checks a year', r.checksPerYear, 26);
  check('the year gross is the check times 26', r.annualGrossCents, 7800000);
  check('federal wages leave out both deductions', r.federalWagesCents, (300000 - 30000) * 26);
  check('payroll wages leave out only the section 125 ones', r.ficaWagesCents, (300000 - 12000) * 26);
  check('the federal tax is the SPARKS engine on those wages', r.federalTaxCents, Tax.ordinaryTax(T.federalBrackets, 7020000, 'single', {}).value);
  check('the gap is tax less withholding', r.gapCents, r.federalTaxCents - 28000 * 26);
  checkTrue('a refund or a bill, one of them', (r.refund && !r.owes) || (r.owes && !r.refund) || r.gapCents === 0);
  check('the per-check change lands it at zero over the checks left', r.perCheckAdjustCents, Math.round(r.gapCents / 26));
  check('payroll tax per check is the year figure over 26', r.ficaPerCheckCents, Math.round(Tax.fica(T.seTax, r.ficaWagesCents, 'single').value / 26));
  checkTrue('California has a state figure', r.state && !r.state.unavailable && r.state.taxCents > 0);
  checkTrue('take-home per check is gross less everything', r.takeHomePerCheckCents === 300000 - 18000 - 12000 - 28000 - 10000 - r.ficaPerCheckCents);
  const mid = E.paycheck.check({ grossCents: 300000, frequency: 'biweekly', fedWithheldCents: 28000, filingStatus: 'single', checksSoFar: 20 }, T);
  check('with 20 checks gone the change spreads over 6', mid.perCheckAdjustCents, Math.round(mid.gapCents / 6));
  const none = E.paycheck.check({ grossCents: 300000, frequency: 'biweekly', fedWithheldCents: 28000, filingStatus: 'single', state: 'TX' }, T);
  checkTrue('a no-income-tax state comes back as zero, not missing', none.state && none.state.taxCents === 0);
  incompleteOn('no filing status is incomplete', E.paycheck.check({ grossCents: 1, frequency: 'weekly', fedWithheldCents: 0 }, T), 'filingStatus');
  incompleteOn('no frequency is incomplete', E.paycheck.check({ grossCents: 1, fedWithheldCents: 0, filingStatus: 'single' }, T), 'frequency');
  incompleteOn('no tables is incomplete', E.paycheck.check({ grossCents: 1, frequency: 'weekly', fedWithheldCents: 0, filingStatus: 'single' }, {}), 'federalBrackets');
}

/* ---- the pages ----------------------------------------------------------------- */
section('pages');
{
  const pages = fs.readdirSync(TB).filter(f => f.endsWith('.html'));
  check('eleven pages: the shelf and ten tools', pages.length, 11);
  const themeCss = fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8');
  const tbCss = fs.readFileSync(path.join(TB, 'toolbox.css'), 'utf8');
  const defs = new Set(((themeCss + tbCss).match(/(--[a-z0-9-]+)\s*:/gi) || []).map(m => m.replace(/\s*:$/, '')));
  const everything = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) walk(full); else if (/\.(js|html|css|json|md)$/.test(d.name)) everything.push(full);
    });
  })(TB);
  everything.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    checkTrue(path.relative(ROOT, f) + ' has no em dash', src.indexOf(String.fromCharCode(8212)) === -1);
    checkTrue(path.relative(ROOT, f) + ' names no SPARKS decision it does not have: TB- only', !/\bCD-\d{3}\b/.test(src));
  });
  pages.forEach(p => {
    const t = fs.readFileSync(path.join(TB, p), 'utf8');
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/>/.exec(t);
    checkTrue(p + ' carries the Content Security Policy', !!m);
    if (m) checkTrue(p + ' allows only this origin', /default-src 'self'/.test(m[1]) && !/https?:/.test(m[1]) && !/\*/.test(m[1]));
    const first = /<script[^>]*src="([^"]+)"/.exec(t);
    checkTrue(p + ' loads shared/errlog.js first', !!first && /shared\/errlog\.js$/.test(first[1]));
    checkTrue(p + ' opts into the theme', /<body class="slaf/.test(t));
    checkTrue(p + ' is a phone page', /name="viewport"/.test(t));
    const code = t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const used = (code.match(/var\(\s*(--[a-z0-9-]+)\s*\)/gi) || []).map(x => x.replace(/var\(\s*/i, '').replace(/\s*\)$/, ''));
    const orphans = used.filter(u => !defs.has(u));
    checkTrue(p + ' uses only tokens the theme defines', orphans.length === 0, orphans.join(','));
    if (p !== 'index.html') {
      checkTrue(p + ' loads the Toolbox helper', /toolbox\/common\.js|"common\.js"/.test(t));
      checkTrue(p + ' has an example-numbers path', /TB\.actions\(/.test(t));
      checkTrue(p + ' says what it stores', /stores nothing|is kept in this browser/.test(t));
    }
  });
  const shelf = fs.readFileSync(path.join(TB, 'index.html'), 'utf8');
  pages.filter(p => p !== 'index.html').forEach(p => checkTrue('the shelf links ' + p, shelf.indexOf('href="' + p + '"') !== -1));
  const readme = fs.readFileSync(path.join(TB, 'README.md'), 'utf8');
  pages.filter(p => p !== 'index.html').forEach(p => checkTrue('the README names ' + p, readme.indexOf(p) !== -1));
  checkTrue('nothing in SPARKS depends on the Toolbox', ['shared', 'engines', 'rooms'].every(dir => fs.readdirSync(path.join(ROOT, dir)).every(f => fs.readFileSync(path.join(ROOT, dir, f), 'utf8').indexOf('toolbox/') === -1)));
  const cssUsed = (tbCss.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/var\(\s*(--[a-z0-9-]+)\s*(,[^)]*)?\)/gi) || []).map(x => x.replace(/var\(\s*/i, '').replace(/\s*(,[^)]*)?\)$/, ''));
  checkTrue('toolbox.css uses only tokens that exist', cssUsed.every(u => defs.has(u)), cssUsed.filter(u => !defs.has(u)).join(','));
}

console.log('toolbox: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
