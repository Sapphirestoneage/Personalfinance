/* ==========================================================================
   test/rooms/tax.js — the Tax room. DECISIONS.md D-098.
   Every worked figure below is derived by hand from the tables in data/,
   never copied from engine output.
   ========================================================================== */
module.exports = function (t) {
  var check = t.check, checkTrue = t.checkTrue, Money = t.Money, Schema = t.Schema, TABLES = t.TABLES;
  var TaxRoom = require(t.path.join(t.ROOT, 'engines/taxroom.js'));

  function household(o) {
    var src = [];
    if (Money.isEntered(o.wages)) src.push(Schema.createIncomeSource({ id: 'w', personId: 'p', type: 'w2', grossAnnualIncomeCents: o.wages }));
    if (Money.isEntered(o.profit)) src.push(Schema.createIncomeSource({ id: 'c', personId: 'p', type: '1099', grossAnnualIncomeCents: o.profit }));
    return Schema.createHousehold({
      state: o.state === undefined ? null : o.state,
      filingStatus: o.filingStatus === undefined ? 'single' : o.filingStatus,
      people: [Schema.createPerson({ id: 'p', role: 'adult', employmentStatus: o.status || 'employed', incomeSources: src })],
      retirement: { contributionPercent: o.contributionPercent === undefined ? null : o.contributionPercent },
      tax: { otherPreTaxAnnualCents: o.otherPreTax === undefined ? null : o.otherPreTax, withheldAnnualCents: o.withheld === undefined ? null : o.withheld }
    });
  }

  t.section('Tax room — the hand-derived case');
  (function () {
    /* Single, NC, $62,000 wages, 6% into the plan, nothing else pre-tax.
         workplace pre-tax  62,000 × 6%          =  3,720.00
         AGI                62,000 − 3,720       = 58,280.00
         standard deduction (single, 2026 table) = 16,100.00
         taxable            58,280 − 16,100      = 42,180.00
       federal ladder (single):
         10% × 12,400                            =  1,240.00
         12% × (42,180 − 12,400 = 29,780)        =  3,573.60
                                                  ─────────
                                                    4,813.60   marginal 12%
         room to the 22% line: 50,400 − 42,180   =  8,220.00
       NC is flat 4.25% on federal taxable:
         42,180 × 0.0425                         =  1,792.65
       FICA, employee side, on wages:
         Social Security 6.2% × 62,000           =  3,844.00
         Medicare        1.45% × 62,000          =    899.00
                                                  ─────────
                                                    4,743.00
       total   4,813.60 + 1,792.65 + 4,743.00    = 11,349.25
       effective 11,349.25 ÷ 62,000              = 0.183052…
       take-home 62,000 − 11,349.25 − 3,720      = 46,930.75                */
    var p = TaxRoom.picture(household({ wages: 6200000, state: 'NC', contributionPercent: 6 }), TABLES);
    checkTrue('the hand case computes', Money.isOk(p), p.reason);
    check('workplace pre-tax is 6% of wages, as a whole percent', p.workplacePreTaxCents, 372000);
    check('AGI', p.agiCents, 5828000);
    check('standard deduction from the table', p.deductionCents, 1610000);
    check('taxable income', p.taxableIncomeCents, 4218000);
    check('federal, by the ladder', p.federalCents, 481360);
    check('marginal bracket 12%', p.bracket.rate, 0.12);
    check('room before the 22% line', p.bracket.roomCents, 822000);
    check('the next rate is 22%', p.bracket.nextRate, 0.22);
    check('NC flat state tax', p.stateCents, 179265);
    checkTrue('state is in the total', p.stateIncluded);
    check('FICA, employee side', p.ficaCents, 474300);
    check('no SE tax for an employee', p.selfEmploymentTaxCents, 0);
    check('total', p.totalTaxCents, 1134925);
    check('effective rate', p.value, 1134925 / 6200000, 1e-9);
    check('take-home after tax and pre-tax', p.takeHomeCents, 4693075);
    check('a month of tax', p.monthlyTaxCents, Math.round(1134925 / 12));
    check('shares sum to a whole dollar', p.shares.takeHome + p.shares.federal + p.shares.state + p.shares.fica + p.shares.preTax, 1, 1e-9);
    check('no withheld → no refund line', p.refundCents, null);
    checkTrue('other pre-tax blank is none, and flagged as not entered', p.otherPreTaxCents === 0 && p.otherPreTaxKnown === false);
    checkTrue('the blunter table is carried for the drawer', p.blunt && p.blunt.rate === 0.19, JSON.stringify(p.blunt));
    checkTrue('and it differs from the computed rate', Math.abs(p.blunt.rate - p.value) > 0.001);
  })();

  t.section('Tax room — the two inputs');
  (function () {
    /* $3,000 other pre-tax: AGI 55,280, taxable 39,180.
         federal 1,240 + 12% × 26,780 = 1,240 + 3,213.60 = 4,453.60
         NC      39,180 × 0.0425                        = 1,665.15
       $9,000 withheld against federal + state = 6,118.75 → refund 2,881.25 */
    var p = TaxRoom.picture(household({ wages: 6200000, state: 'NC', contributionPercent: 6, otherPreTax: 300000, withheld: 900000 }), TABLES);
    check('other pre-tax comes off the top', p.taxableIncomeCents, 3918000);
    check('federal falls with it', p.federalCents, 445360);
    check('state falls with it', p.stateCents, 166515);
    check('what the return settles is federal + state', p.settledCents, 445360 + 166515);
    check('refund = withheld − settled', p.refundCents, 900000 - 611875);
    check('FICA is untouched by pre-tax money', p.ficaCents, 474300);
    var owe = TaxRoom.picture(household({ wages: 6200000, state: 'NC', contributionPercent: 6, otherPreTax: 300000, withheld: 400000 }), TABLES);
    check('too little withheld is a negative refund', owe.refundCents, 400000 - 611875);
    var zero = TaxRoom.picture(household({ wages: 6200000, state: 'NC', contributionPercent: 6, otherPreTax: 0 }), TABLES);
    checkTrue('typed zero is zero, and entered', zero.otherPreTaxCents === 0 && zero.otherPreTaxKnown === true);
  })();

  t.section('Tax room — edge cases');
  (function () {
    /* Under the standard deduction: $12,000 single in TX.
         taxable = max(0, 12,000 − 16,100) = 0 → federal 0, TX none → 0
         FICA 12,000 × 7.65% = 918 → effective 0.0765 */
    var low = TaxRoom.picture(household({ wages: 1200000, state: 'TX' }), TABLES);
    check('under the deduction: $0 federal', low.federalCents, 0);
    checkTrue('and flagged as below the deduction', low.belowDeduction);
    check('Texas has no income tax', low.stateCents, 0);
    checkTrue('a no-tax state is still "in"', low.stateIncluded && low.stateType === 'none');
    check('effective rate is FICA only', low.value, 0.0765, 1e-9);
    check('the bracket is the bottom one', low.bracket.rate, 0.10);

    /* No state: the state line is incomplete, everything else computes. */
    var noState = TaxRoom.picture(household({ wages: 6200000, contributionPercent: 6 }), TABLES);
    checkTrue('no state → the picture still computes', Money.isOk(noState));
    checkTrue('state line is incomplete and says why', noState.stateIncluded === false && noState.state.status === 'incomplete' && /state/i.test(noState.state.reason));
    check('state cents are not-entered, not zero', noState.stateCents, null);
    check('total is federal + FICA only', noState.totalTaxCents, 481360 + 474300);
    check('state share is nil in the chart', noState.shares.state, 0);
    /* With withheld but no state, the refund compares federal only. */
    var noStateRefund = TaxRoom.picture(household({ wages: 6200000, contributionPercent: 6, withheld: 500000 }), TABLES);
    check('refund without state settles federal only', noStateRefund.refundCents, 500000 - 481360);

    /* No contribution percent entered: nothing comes off (not-entered ≠ 6). */
    var noPlan = TaxRoom.picture(household({ wages: 6200000, state: 'NC' }), TABLES);
    check('no contribution percent → no workplace pre-tax', noPlan.workplacePreTaxCents, 0);
    check('and the percent is reported as not entered', noPlan.workplacePercent, null);
    check('taxable is gross − deduction', noPlan.taxableIncomeCents, 6200000 - 1610000);

    /* Self-employed, $100,000 profit, single, NC. Both halves as SE tax —
       the worked example engines/selfemployed.js is tested on:
         net earnings 92,350; SS 11,451.40; Medicare 2,678.15 → 14,129.55
         deductible half = round(1,412,955 ÷ 2) = 706,478¢ = 7,064.78
         AGI     100,000 − 7,064.78                 = 92,935.22
         taxable 92,935.22 − 16,100                 = 76,835.22
         federal 1,240 + 12% × 38,000 (= 4,560) + 22% × 26,435.22 (= 5,815.7484)
                                                    = 11,615.7484 → 1,161,575¢
         NC      76,835.22 × 0.0425                 = 3,265.4968… → 326,550¢
         employee FICA: none (no wages)                                         */
    var se = TaxRoom.picture(household({ wages: 10000000, state: 'NC', status: 'selfEmployed' }), TABLES);
    checkTrue('self-employed computes', Money.isOk(se), se.reason);
    check('all of a sole earner’s income is profit, whatever the source type', se.selfEmploymentCents, 10000000);
    check('SE tax is both halves on 92.35% of profit', se.selfEmploymentTaxCents, 1412955);
    check('no employee FICA without wages', se.ficaCents, 0);
    check('the deductible half comes off before the ladder', se.agiCents, 10000000 - 706478);
    check('federal on the reduced taxable', se.federalCents, 1161575);
    check('state on the same taxable', se.stateCents, 326550);
    check('bracket 22%', se.bracket.rate, 0.22);
    check('room to the 24% line: 105,700 − 76,835.22', se.bracket.roomCents, 10570000 - 7683522);
    check('the return settles federal + SE tax + state', se.settledCents, 1161575 + 1412955 + 326550);
    check('no workplace pre-tax without wages, even with a percent stored', TaxRoom.picture(household({ wages: 10000000, state: 'NC', status: 'selfEmployed', contributionPercent: 6 }), TABLES).workplacePreTaxCents, 0);

    /* Mixed: $60,000 wages + $20,000 own work. The wages use part of the
       Social Security wage base first, and FICA is on the wages only.
         SE: net earnings 18,470; SS 2,290.28; Medicare 535.63 → 2,825.91; half 1,412.96 (141,296¢ from round(282,591/2))
         FICA on 60,000 × 7.65% = 4,590                                          */
    var mixed = TaxRoom.picture(household({ wages: 6000000, profit: 2000000, status: 'both', state: 'TX' }), TABLES);
    check('mixed: wages are the W-2 source', mixed.wagesCents, 6000000);
    check('mixed: profit is the 1099 source', mixed.selfEmploymentCents, 2000000);
    check('mixed: FICA on the wages', mixed.ficaCents, 459000);
    check('mixed: SE tax on the profit', mixed.selfEmploymentTaxCents, 282591);
    check('mixed: AGI drops by the deductible half', mixed.agiCents, 8000000 - 141296);
    var mixedNoOwn = TaxRoom.picture(household({ wages: 6000000, status: 'both', state: 'TX' }), TABLES);
    checkTrue('mixed with no 1099 source yet is all wages, and says so', mixedNoOwn.mixedWithoutOwnWork === true && mixedNoOwn.selfEmploymentTaxCents === 0);

    /* Top bracket: no room. $800,000 single. taxable 783,900 > 640,600. */
    var top = TaxRoom.picture(household({ wages: 80000000, state: 'TX' }), TABLES);
    check('top bracket has no next one', top.bracket.roomCents, null);
    check('and its rate is 37%', top.bracket.rate, 0.37);

    /* Pre-tax larger than pay is capped at pay; take-home share never negative. */
    var over = TaxRoom.picture(household({ wages: 1000000, state: 'TX', otherPreTax: 5000000 }), TABLES);
    check('pre-tax is capped at gross', over.preTaxCents, 1000000);
    checkTrue('take-home share is never negative', over.shares.takeHome >= 0);
  })();

  t.section('Tax room — says why instead of throwing');
  (function () {
    var empty = TaxRoom.picture(Schema.createHousehold({}), TABLES);
    check('an empty household is incomplete', empty.status, 'incomplete');
    checkTrue('and names the income', /income/i.test(empty.reason) && empty.missing.indexOf('grossAnnualIncome') !== -1, empty.reason);
    var noFs = TaxRoom.picture(household({ wages: 6200000, filingStatus: null, state: 'NC' }), TABLES);
    checkTrue('no filing status is incomplete and says so', noFs.status === 'incomplete' && /filing/i.test(noFs.reason), noFs.reason);
    var noTables = TaxRoom.picture(household({ wages: 6200000, state: 'NC' }), {});
    check('missing tables are incomplete, not a crash', noTables.status, 'incomplete');
    checkTrue('undefined household does not throw', TaxRoom.picture(undefined, TABLES).status === 'incomplete');
    checkTrue('no status key leaks into the meta', Object.keys(TaxRoom.picture(household({ wages: 6200000, state: 'NC' }), TABLES)).filter(function (k) { return k === 'status'; }).length === 1);
  })();

  t.section('Tax room — the page');
  (function () {
    var html = t.fs.readFileSync(t.path.join(t.ROOT, 'rooms/tax.html'), 'utf8');
    checkTrue('mounts the template', /Room\.mount\(\{/.test(html));
    checkTrue('declares built-once', html.indexOf('LIVE-FORM: built once') !== -1);
    ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(function (id) {
      checkTrue('has the deep link #' + id, new RegExp('id="' + id + '"').test(html));
    });
    var Room = require(t.path.join(t.ROOT, 'shared/room.js'));
    Room.IDS.concat(['room-standalone', 'load-notice']).forEach(function (id) {
      checkTrue('has the host #' + id, html.indexOf('id="' + id + '"') !== -1);
    });
    checkTrue('mounts as the registry id', /id: 'tax'/.test(html));
    var tag = function (f) { return html.indexOf('<script src="../' + f + '"></script>'); };
    checkTrue('loads the engine after tax.js and selfemployed.js', tag('engines/selfemployed.js') > 0 && tag('engines/selfemployed.js') < tag('engines/tax.js') && tag('engines/tax.js') < tag('engines/taxroom.js'));
    checkTrue('writes only its own two fields', /Spine\.set\('tax\.' \+ key/.test(html) && !/upsertPerson|updateProfile/.test(html));
    checkTrue('links the self-employed quarterly', /linkTo\('self-employed', 'quarterly'\)/.test(html));
    checkTrue('one chart: Charts.stacked', (html.match(/Charts\.(stacked|area|donut|bars)\(/g) || []).every(function (m) { return m === 'Charts.stacked('; }));
    checkTrue('the scope line', /does not file, itemise, or handle credits/.test(html));
    var reg = t.Registry.byId('tax');
    checkTrue('registered with the income tag', reg && reg.tags.indexOf('income') !== -1);
    ['otherPreTax', 'withheld'].forEach(function (f) {
      var d = t.Ownership.field(f);
      checkTrue('owns ' + f, d && d.owner === 'tax' && d.anchor === 'inputs');
    });
  })();
};
