/* ==========================================================================
   tests/engine/tax-cases.js, tax years worked out by hand in the comments.
   Every expected figure below was computed from data/tax/2026.json by hand
   before the engine ran; the engine must land on the same cents.
   ========================================================================== */
var T = require('../../engine/tables.js');
var Federal = require('../../engine/tax/federal.js');
var Fica = require('../../engine/tax/fica.js');
var State = require('../../engine/tax/state.js');
var Aca = require('../../engine/tax/aca.js');
var SST = require('../../engine/tax/socialSecurityTax.js');
var Contributions = require('../../engine/contributions.js');

module.exports = function (t) {
  var tables = T.get(), tax = tables.tax;
  var ctx2026 = function (status) { return { tax: tax, year: 2026, factor: 1, filingStatus: status }; };

  t.section('Federal ordinary tax, 2026');
  /* Single, $60,000 wages, no deferral.
     Taxable = 60,000 - 16,100 = 43,900.
     10% on 12,400 = 1,240; 12% on (43,900 - 12,400) = 31,500 x 0.12 = 3,780. Total 5,020. Marginal 12%. */
  var r = Federal.compute({ wagesCents: 6000000, ages: [30] }, ctx2026('single'));
  t.check('single 60k: taxable', r.taxableIncomeCents, 4390000);
  t.check('single 60k: ordinary tax', r.ordinaryTaxCents, 502000);
  t.check('single 60k: marginal', r.marginalRate, 0.12);
  t.check('single 60k: nothing else', r.totalCents, 502000);
  /* MFJ, $180,000 wages, $20,000 401k deferral, $8,750 HSA.
     AGI = 180,000 - 20,000 - 8,750 = 151,250. Taxable = 151,250 - 32,200 = 119,050.
     10% on 24,800 = 2,480; 12% on 76,000 = 9,120; 22% on (119,050 - 100,800) = 18,250 x 0.22 = 4,015. Total 15,615. */
  r = Federal.compute({ wagesCents: 18000000, deferral401kCents: 2000000, hsaDeductionCents: 875000, ages: [38, 40] }, ctx2026('married_joint'));
  t.check('mfj 180k: AGI', r.agiCents, 15125000);
  t.check('mfj 180k: taxable', r.taxableIncomeCents, 11905000);
  t.check('mfj 180k: ordinary tax', r.ordinaryTaxCents, 1561500);
  t.check('mfj 180k: marginal', r.marginalRate, 0.22);

  t.section('Capital gains stacking and NIIT, 2026');
  /* Single, $30,000 ordinary (pretax withdrawal) + $40,000 long-term gains.
     AGI 70,000; taxable 53,900; ordinary part 13,900; preferential 40,000.
     Ordinary tax: 10% on 12,400 = 1,240; 12% on 1,500 = 180 -> 1,420.
     Gains: 0% band ends at 49,450: 49,450 - 13,900 = 35,550 at 0%; the remaining 4,450 at 15% = 667.50 -> 668 (rounded). */
  r = Federal.compute({ pretaxWithdrawalsCents: 3000000, longTermGainsCents: 4000000, ages: [50] }, ctx2026('single'));
  t.check('gains stack: ordinary tax', r.ordinaryTaxCents, 142000);
  t.check('gains stack: at zero', r.capitalGainsBands.zeroCents, 3555000);
  t.check('gains stack: at fifteen', r.capitalGainsBands.fifteenCents, 445000);
  t.check('gains stack: gains tax', r.capitalGainsTaxCents, 66750, 1);
  t.check('gains stack: no NIIT under 200k', r.niitCents, 0);
  /* Single, $190,000 wages + $30,000 qualified dividends: AGI 220,000, over the 200,000 NIIT threshold by 20,000;
     NII is 30,000, so NIIT = 3.8% x min(30,000, 20,000) = 760. */
  r = Federal.compute({ wagesCents: 19000000, qualifiedDividendsCents: 3000000, ages: [45] }, ctx2026('single'));
  t.check('NIIT on the lesser of NII and the excess', r.niitCents, 76000);

  t.section('Social Security taxation (IRC 86)');
  /* Single, benefit 24,000, other AGI 20,000: provisional = 20,000 + 12,000 = 32,000; between 25,000 and 34,000;
     taxable = min(12,000, 0.5 x (32,000 - 25,000) = 3,500) = 3,500. */
  var s = SST.taxable({ benefitsCents: 2400000, otherAgiCents: 2000000, filingStatus: 'single' }, tax.federal.socialSecurityBenefitTaxation);
  t.check('ss tier 1', s.taxableCents, 350000);
  t.check('ss tier 1 tier', s.tier, 1);
  /* MFJ, benefit 40,000, other AGI 60,000: provisional = 80,000; over 44,000;
     tier one = min(20,000, 0.5 x (44,000 - 32,000) = 6,000) = 6,000;
     taxable = min(34,000, 0.85 x (80,000 - 44,000) = 30,600 + 6,000 = 36,600) = 34,000. */
  s = SST.taxable({ benefitsCents: 4000000, otherAgiCents: 6000000, filingStatus: 'married_joint' }, tax.federal.socialSecurityBenefitTaxation);
  t.check('ss tier 2 capped at 85%', s.taxableCents, 3400000);
  /* MFJ, benefit 40,000, other AGI 30,000: provisional = 50,000; tier one 6,000; 0.85 x 6,000 = 5,100 + 6,000 = 11,100 < 34,000. */
  s = SST.taxable({ benefitsCents: 4000000, otherAgiCents: 3000000, filingStatus: 'married_joint' }, tax.federal.socialSecurityBenefitTaxation);
  t.check('ss tier 2 formula', s.taxableCents, 1110000);

  t.section('Standard deduction extras');
  /* MFJ, both 66, AGI 100,000 in 2026: 32,200 + 2 x 1,650 aged + 2 x 6,000 senior (under the 150,000 phase-out) = 47,500. */
  var d = Federal.deductions({ ages: [66, 66], agiCents: 10000000 }, tax, 1, 'married_joint', 2026);
  t.check('aged plus senior, mfj', d.totalCents, 4750000);
  /* Single, 70, AGI 125,000: senior = 6,000 - 6% x (125,000 - 75,000) = 6,000 - 3,000 = 3,000; aged 2,050; std 16,100 -> 21,150. */
  d = Federal.deductions({ ages: [70], agiCents: 12500000 }, tax, 1, 'single', 2026);
  t.check('senior deduction phases out', d.totalCents, 2115000);
  /* In 2029 the senior deduction is gone. */
  d = Federal.deductions({ ages: [70], agiCents: 5000000 }, tax, 1, 'single', 2029);
  t.check('senior deduction ends after 2028', d.seniorCents, 0);

  t.section('FICA and self-employment tax, 2026');
  /* W-2 $60,000: 6.2% = 3,720; 1.45% = 870; total 4,590. */
  var f = Fica.compute({ wagesByPerson: [6000000], seProfitByPerson: [0], filingStatus: 'single' }, tax, 1);
  t.check('fica 60k', f.employeeFicaCents, 459000);
  /* W-2 $200,000: SS capped at 184,500 x 6.2% = 11,439; Medicare 2,900; additional Medicare 0 (at the threshold). */
  f = Fica.compute({ wagesByPerson: [20000000], seProfitByPerson: [0], filingStatus: 'single' }, tax, 1);
  t.check('fica wage base cap', f.socialSecurityCents, 1143900);
  t.check('fica medicare uncapped', f.medicareCents, 290000);
  t.check('additional medicare at the threshold', f.additionalMedicareCents, 0);
  /* W-2 $250,000 single: 0.9% on 50,000 = 450. */
  f = Fica.compute({ wagesByPerson: [25000000], seProfitByPerson: [0], filingStatus: 'single' }, tax, 1);
  t.check('additional medicare over 200k', f.additionalMedicareCents, 45000);
  /* Self-employed, $90,000 profit: net earnings 83,115; SS 12.4% = 10,306.26; Medicare 2.9% = 2,410.34; SE tax 12,716.60; half 6,358.30. */
  f = Fica.compute({ wagesByPerson: [0], seProfitByPerson: [9000000], filingStatus: 'single' }, tax, 1);
  t.check('se tax 90k', f.seTaxCents, 1271660, 1);
  t.check('half se deduction', f.halfSeDeductionCents, 635830, 1);
  /* Wages $150,000 plus $60,000 profit: net earnings 55,410; SS room 184,500 - 150,000 = 34,500 -> 12.4% x 34,500 = 4,278; Medicare 2.9% x 55,410 = 1,606.89. */
  f = Fica.compute({ wagesByPerson: [15000000], seProfitByPerson: [6000000], filingStatus: 'single' }, tax, 1);
  t.check('se tax shares the wage base with wages', f.seTaxCents, 588489, 1);

  t.section('New York state tax, 2026');
  /* Single, AGI 60,000: taxable 52,000. 8,500 x 3.9% = 331.50; 3,200 x 4.4% = 140.80; 2,200 x 5.15% = 113.30; 38,100 x 5.4% = 2,057.40. Total 2,643. */
  var st = State.compute({ state: 'NY', filingStatus: 'single', agiCents: 6000000 }, 1);
  t.check('ny single 60k', st.taxCents, 264300, 1);
  t.check('ny method', st.method, 'brackets');
  /* MFJ, AGI 150,000 with 20,000 of taxable Social Security and a 65-year-old's 30,000 IRA withdrawal:
     150,000 - 20,000 - 20,000 (exclusion capped) - 16,050 = 93,950.
     17,150 x 3.9% = 668.85; 6,450 x 4.4% = 283.80; 4,300 x 5.15% = 221.45; 66,050 x 5.4% = 3,566.70. Total 4,740.80 -> 4,741. */
  st = State.compute({ state: 'NY', filingStatus: 'married_joint', agiCents: 15000000, socialSecurityTaxableCents: 2000000, pensionAndIraByPerson: [{ cents: 3000000, age: 65 }] }, 1);
  t.check('ny mfj retiree exclusions', st.taxableIncomeCents, 9395000);
  t.check('ny mfj retiree tax', st.taxCents, 474080, 1);
  t.check('ny recapture warning above 107,650', st.warnings.length, 1);
  /* A state with no file and no flat rate: zero, with a warning. A flat 5% on AGI 80,000: 4,000. */
  st = State.compute({ state: 'CA', filingStatus: 'single', agiCents: 8000000 }, 1);
  t.check('unknown state warns', st.warnings.length, 1);
  st = State.compute({ state: 'CA', filingStatus: 'single', agiCents: 8000000, flatRate: 0.05 }, 1);
  t.check('flat state rate', st.taxCents, 400000);

  t.section('ACA premium tax credit, 2026 coverage (2025 guidelines)');
  /* One person, MAGI 30,000, benchmark 9,600 a year. FPL 15,650 -> 191.69% of FPL, in the 150 to 200 band:
     pct = 4.19% + (6.60 - 4.19)% x (0.4169 / 0.5) = 6.20%; expected 1,859.88; credit 7,740.12. */
  var a = Aca.compute({ magiCents: 3000000, householdSize: 1, coverageYear: 2026, benchmarkAnnualCents: 960000 }, tables);
  t.check('aca fpl 2025 for 2026 coverage', a.fplCents, 1565000);
  t.check('aca applicable pct', a.applicablePct, 0.062, 0.0005);
  t.check('aca credit', a.creditCents, 774012, 60);
  /* Four people, MAGI 130,000: FPL 15,650 + 3 x 5,500 = 32,150; 404% -> over the cliff, no credit. */
  a = Aca.compute({ magiCents: 13000000, householdSize: 4, coverageYear: 2026, benchmarkAnnualCents: 2400000 }, tables);
  t.check('aca cliff', a.overCliff, true);
  t.check('aca cliff no credit', a.creditCents, 0);
  /* The same under the enhanced rule: 8.5% x 130,000 = 11,050 expected; credit 24,000 - 11,050 = 12,950. */
  a = Aca.compute({ magiCents: 13000000, householdSize: 4, coverageYear: 2026, benchmarkAnnualCents: 2400000, rule: 'enhanced' }, tables);
  t.check('aca enhanced no cliff', a.creditCents, 1295000);
  /* Under 138% FPL flags Medicaid territory: MAGI 20,000, one person -> 127.8%. */
  a = Aca.compute({ magiCents: 2000000, householdSize: 1, coverageYear: 2026, benchmarkAnnualCents: 960000 }, tables);
  t.check('aca medicaid territory', a.medicaidTerritory, true);
  /* 2027 coverage reads the 2026 guidelines: 15,960 for one. */
  a = Aca.compute({ magiCents: 3000000, householdSize: 1, coverageYear: 2027, benchmarkAnnualCents: 960000 }, tables);
  t.check('aca 2026 guidelines for 2027 coverage', a.fplCents, 1596000);

  t.section('Indexing');
  /* 2030 at 3%: factor 1.03^4 = 1.1255; the single 10% top 12,400 x 1.1255 = 13,956; the NIIT threshold stays 200,000. */
  var factor = T.indexFactor(2030, 2026, 0.03);
  t.check('indexed bracket', T.brackets(tax.federal.ordinaryBrackets, 'single', factor)[0].upToCents, 1395600, 100);
  t.check('fixed threshold', T.byStatus(tax.federal.netInvestmentIncomeTax, 'threshold', 'single', factor), 20000000);

  t.section('Contribution limits');
  var lim = Contributions.limits(tax, 1, 30, false);
  t.check('401k limit', lim.k401, 2450000);
  t.check('ira limit', lim.ira, 750000);
  t.check('hsa self', lim.hsa, 440000);
  lim = Contributions.limits(tax, 1, 61, true);
  t.check('401k super catch-up 60 to 63', lim.k401, 2450000 + 1125000);
  t.check('ira catch-up 50+', lim.ira, 860000);
  t.check('hsa family plus 55 catch-up', lim.hsa, 875000 + 100000);
  /* Roth phase-out, single, MAGI 160,500: halfway through 153,000 to 168,000 -> half of 7,500. */
  t.check('roth phase-out midpoint', Contributions.rothRoom(tax, 1, 'single', 16050000, 750000), 375000);
};
