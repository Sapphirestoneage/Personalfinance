/* ==========================================================================
   engine/project.js, the one year-by-year projection. D-341.
   --------------------------------------------------------------------------
     project(household, assumptions, blocks, opts) -> run
       run = { years: [YearRow...], milestones, warnings, assumptionsUsed }

   Pure: same inputs, same output. Nothing here reads localStorage or the
   DOM; a room passes the household, its assumption overrides and the
   blocks in (and, in the browser, the tables through assumptions.tables).

   Every year, in this order:
     1. ages and dates; blocks that open this year switch on, ones that
        end switch off (engine/facts.js)
     2. income: wages grown at the wage-growth rate, side income, rental,
        Social Security from the claim age, pensions
     3. spending: FAT plus wants, inflated; healthcare through the ACA
        before 65 when not on employer cover, Medicare from 65
     4. required debt payments
     5. contributions from a surplus in the order of operations, or a
        shortfall from the withdrawal order
     6. the Roth conversion, if a strategy is on
     7. taxes on all of the above
     8. steps 5 to 7 repeat until the year's taxes and healthcare move by
        under a dollar, or 25 passes (then a warning)
     9. growth on every balance at its own rate
    10. the row is saved; milestones are checked at the end

   Definitions (engine/project.js is the one place they live):
     FI          the first year from which, with no earned income from
                 then on, the plan still survives to the horizon
     Coast FI    the first year from which contributions could stop (the
                 surplus is spent) and, working to the traditional
                 retirement age, the plan still survives
     Bridge gap  the years between FI and 59 and a half, and the dollars
                 the FI run draws in them; what is reachable without a
                 penalty at FI stands beside it
   Dollars are nominal in every row; `deflator` turns them into today's.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Tables: require('./tables.js'), Assumptions: require('./assumptions.js'), Facts: require('./facts.js'), Accounts: require('./accounts.js'),
      Contributions: require('./contributions.js'), Withdrawals: require('./withdrawals.js'), Conversions: require('./conversions.js'),
      Federal: require('./tax/federal.js'), Fica: require('./tax/fica.js'), State: require('./tax/state.js'), Aca: require('./tax/aca.js') };
  } else {
    var E = (root.SLAF && root.SLAF.Engine) || {};
    deps = { Tables: E.Tables, Assumptions: E.Assumptions, Facts: E.Facts, Accounts: E.Accounts, Contributions: E.Contributions,
      Withdrawals: E.Withdrawals, Conversions: E.Conversions, Federal: E.Federal, Fica: E.Fica, State: E.State, Aca: E.Aca };
  }
  var api = factory(deps);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Project = api; root.SLAF.Engine.project = api.project; }
})(typeof self !== 'undefined' ? self : null, function (D) {
  'use strict';

  var MONTHS = 12;
  var MAX_PASSES = 25;
  var TOLERANCE_CENTS = 100;
  var MEDICARE_AGE = 65;
  var ACCESS_AGE = 59.5;

  function sum(a) { return a.reduce(function (t, v) { return t + v; }, 0); }
  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }

  /** The Social Security benefit for the year, per person, nominal cents. */
  function socialSecurity(fp, personFacts, A, tax, inflator) {
    var ss = personFacts.ss;
    if (!ss || ss.monthlyAtFraCents === null || fp.age === null || fp.age < ss.claimAge) return 0;
    var S = tax.federal.socialSecurity;
    var fra = S.fullRetirementAge, claim = Math.min(S.latestClaimAge, Math.max(S.earliestClaimAge, ss.claimAge));
    var factor = 1;
    if (claim < fra) {
      var m = Math.round((fra - claim) * MONTHS);
      factor = 1 - Math.min(36, m) * S.earlyReductionPerMonthFirst36 - Math.max(0, m - 36) * S.earlyReductionPerMonthBeyond36;
    } else if (claim > fra) factor = 1 + (claim - fra) * S.delayedCreditPerYear;
    return Math.round(ss.monthlyAtFraCents * MONTHS * factor * inflator);
  }

  /** A year of required payments on every debt (monthly compounding). */
  function payDebts(state, warnings, year) {
    var out = { totalCents: 0, interestCents: 0, byDebt: {} };
    state.debts.forEach(function (d) {
      var paid = 0, interest = 0;
      for (var m = 0; m < MONTHS && d.balance > 0.5; m++) {
        var i = d.balance * d.rate / MONTHS;
        var pay = Math.min(d.minPaymentCents, d.balance + i);
        d.balance = d.balance + i - pay; paid += pay; interest += i;
      }
      if (d.balance > 0.5 && !d.minPaymentCents && d.rate > 0) warnings.push('No minimum payment set on ' + d.label + ': its balance only grows.');
      out.byDebt[d.id] = Math.round(paid); out.totalCents += paid; out.interestCents += interest;
    });
    state.debts = state.debts.filter(function (d) { return d.balance > 0.5; });
    out.totalCents = Math.round(out.totalCents); out.interestCents = Math.round(out.interestCents);
    return out;
  }

  function applyOneOffs(state, f, A) {
    f.oneOffs.forEach(function (o) {
      if (o.kind === 'cash') state.cash += o.cents;
      else if (o.kind === 'debt') state.debts.push({ id: o.id, label: o.label, type: o.type, balance: Math.max(0, o.cents), rate: o.rate, minPaymentCents: o.minPaymentCents, owner: 0 });
      else if (o.kind === 'invested') {
        if (o.taxCharacter === 'pretax') state.pretaxIra[0] += o.cents;
        else if (o.taxCharacter === 'roth') state.rothIra[0].basis += o.cents;
        else { state.taxable.value += o.cents; state.taxable.basis += o.cents; }
      }
      else if (o.kind === 'home') state.home.value += o.cents;
      else if (o.kind === 'vehicle') state.vehicles += o.cents;
    });
  }

  /**
   * simulate(household, A, facts, initState, opts) -> { years, warnings, ranOutYear }
   *   opts.stopEarnedIncomeFromYear, opts.stopContributionsFromYear
   */
  function simulate(facts, A, initState, opts) {
    var o = opts || {};
    var tables = D.Tables.get(), tax = tables.tax;
    var state = D.Accounts.clone(initState);
    var rows = [], warnings = [], ranOutYear = null;
    var ages0 = facts.people.map(function (p) { return D.Facts.ageAtYearEnd(p.dob, A.baseYear); });
    var oldest = Math.max.apply(null, ages0.map(function (a) { return a === null ? -1 : a; }));
    var endYear = oldest >= 0 ? A.baseYear + (A.horizonAge - oldest) : A.baseYear + 60;
    if (oldest < 0) warnings.push('No date of birth: the projection runs sixty years and age-based rules (59 and a half, 65, RMDs) cannot apply.');
    var lastTaxes = 0, lastMagi = 0, lastHealth = 0;
    var cumulativePenalty = 0;

    for (var year = A.baseYear; year <= endYear; year++) {
      var f = D.Facts.forYear(facts, A, year, o);
      var factor = D.Tables.indexFactor(year, tax.taxYear, A.inflation);
      var inflator = f.inflator;
      var yearWarnings = [];
      applyOneOffs(state, f, A);
      var start = D.Accounts.totals(state);
      var people = f.people.map(function (p, i) { return Object.assign({}, p, { label: facts.people[i].label, birthYear: facts.people[i].birthYear }); });
      var contributionsStopped = o.stopContributionsFromYear !== undefined && o.stopContributionsFromYear !== null && year >= o.stopContributionsFromYear;

      /* 4. debt */
      var debt = payDebts(state, yearWarnings, year);
      /* RMDs are forced before anything else is drawn. */
      var rmds = D.Withdrawals.rmd(state, people, tax, year);
      var rmdTotal = sum(rmds);
      people.forEach(function (p, i) {
        var left = rmds[i], fromK = Math.min(left, state.pretax401k[i]); state.pretax401k[i] -= fromK; left -= fromK;
        state.pretaxIra[i] -= Math.min(left, state.pretaxIra[i]);
      });
      /* 2. income */
      var ssByPerson = people.map(function (p, i) { return socialSecurity(p, facts.people[i], A, tax, inflator); });
      var ssTotal = sum(ssByPerson) + f.income.socialSecurity;
      var wagesBy = people.map(function (p) { return p.wagesCents; }), seBy = people.map(function (p) { return p.seProfitCents; });
      var earned = sum(wagesBy) + sum(seBy);
      var dividends = Math.round(start.taxableCents * A.dividendYield);
      var interest = Math.round(start.cashCents * A.cashReturnNominal);
      var income = { wagesCents: sum(wagesBy), selfEmploymentCents: sum(seBy), sideHustleCents: f.income.sideHustle + f.income.nonTaxable,
        rentalCents: f.income.rental, socialSecurityCents: ssTotal, pensionCents: f.income.pension, otherCents: f.income.other,
        dividendsCents: dividends, interestCents: interest, rmdCents: rmdTotal };
      income.totalCents = income.wagesCents + income.selfEmploymentCents + income.sideHustleCents + income.rentalCents + income.socialSecurityCents
        + income.pensionCents + income.otherCents + income.dividendsCents + income.rmdCents;
      var cashIncome = income.totalCents;   /* interest stays in the cash account as growth */

      /* 3. healthcare: who is under 65, and where cover comes from */
      var anyoneWorking = people.some(function (p) { return p.working; });
      var under65 = people.filter(function (p) { return p.age === null || p.age < MEDICARE_AGE; }).length;
      var over65 = people.length - under65;
      var coverage = anyoneWorking ? A.healthCoverageWhileWorking : 'marketplace';
      var medicare = Math.round(over65 * A.medicareMonthlyPerPersonCents * MONTHS * inflator);
      var benchmark = under65 ? Math.round(A.acaBenchmarkMonthlyCents * MONTHS * inflator * under65 / Math.max(1, people.length)) : 0;
      var employerCover = under65 && coverage === 'employer' ? Math.round(A.healthcareMonthlyCents * MONTHS * inflator) : 0;
      var cashFloor = Math.round((f.spending.needsCents + f.spending.wantsCents) / MONTHS * A.emergencyFundMonths);

      /* 5 to 8: the loop */
      var guessTaxes = lastTaxes, guessMagi = lastMagi, guessHealth = lastHealth;
      var pass, converged = false, R = null, prevR = null, prevPrevR = null, cliffEdge = false;
      for (pass = 1; pass <= MAX_PASSES; pass++) {
        var aca = null, healthcare = medicare + employerCover;
        if (under65 && coverage === 'marketplace') {
          aca = D.Aca.compute({ magiCents: guessMagi, householdSize: facts.householdSize, coverageYear: year, rule: A.acaRule, benchmarkAnnualCents: benchmark, inflation: A.inflation, medicaidExpansion: A.medicaidExpansion }, tables);
          healthcare += aca.premiumAfterCreditCents;
        }
        var spendingTotal = f.spending.needsCents + f.spending.wantsCents + healthcare + debt.totalCents;
        var available = cashIncome - spendingTotal - guessTaxes;
        var contrib;
        if (contributionsStopped) {
          contrib = { k401Pretax: people.map(function () { return 0; }), k401Roth: people.map(function () { return 0; }), match: people.map(function () { return 0; }), hsa: people.map(function () { return 0; }),
            rothIra: people.map(function () { return 0; }), tradIra: people.map(function () { return 0; }), taxableCents: 0, cashTopUpCents: 0, shortfallCents: Math.max(0, -available),
            deferralCents: 0, employeeCents: 0, investedCents: 0, matchCents: 0, deductions: { deferral401kCents: 0, hsaCents: 0, iraCents: 0 }, warnings: [], explain: [], unallocatedCents: Math.max(0, available) };
        } else {
          contrib = D.Contributions.allocate({ surplusCents: available, people: people, retirement: facts.retirement, filingStatus: facts.filingStatus,
            magiCents: guessMagi, cashCents: state.cash, cashFloorCents: cashFloor }, A, tax, factor);
          contrib.unallocatedCents = 0;
        }
        var draws = D.Withdrawals.draw(contrib.shortfallCents, state, { year: year, people: people, A: A, cashFloorCents: cashFloor, healthcareCents: healthcare });
        var pretaxWithdrawals = rmdTotal + sum(draws.pretax401k) + sum(draws.pretaxIra);
        var fed = D.Fica.compute({ wagesByPerson: wagesBy, seProfitByPerson: seBy, filingStatus: facts.filingStatus }, tax, factor);
        var fedInput = { wagesCents: income.wagesCents, deferral401kCents: contrib.deductions.deferral401kCents, seProfitCents: income.selfEmploymentCents,
          halfSeDeductionCents: fed.halfSeDeductionCents, otherOrdinaryCents: income.pensionCents + income.otherCents, interestCents: interest,
          qualifiedDividendsCents: dividends, longTermGainsCents: draws.longTermGainsCents, rentalNetCents: income.rentalCents,
          pretaxWithdrawalsCents: pretaxWithdrawals, conversionsCents: 0, rothEarningsTaxableCents: draws.rothEarningsTaxableCents,
          hsaTaxableCents: draws.hsaTaxableCents, socialSecurityBenefitsCents: ssTotal, hsaDeductionCents: contrib.deductions.hsaCents,
          iraDeductionCents: contrib.deductions.iraCents, penaltyBaseCents: draws.penaltyBaseCents, ages: f.ages };
        var ctx = { tax: tax, year: year, factor: factor, filingStatus: facts.filingStatus };
        var before = D.Federal.compute(fedInput, ctx);
        /* 6. the conversion */
        var pretaxLeft = sum(state.pretax401k) + sum(state.pretaxIra) - sum(draws.pretax401k) - sum(draws.pretaxIra);
        var conv = D.Conversions.amount({ A: A, year: year, people: people, earnedCents: earned, pretaxAvailableCents: Math.max(0, Math.round(pretaxLeft)), federalBefore: before, inflator: inflator });
        fedInput.conversionsCents = conv.cents;
        /* 7. taxes */
        var federal = conv.cents ? D.Federal.compute(fedInput, ctx) : before;
        var pensionAndIra = people.map(function (p, i) { return { cents: (i === 0 ? income.pensionCents : 0) + rmds[i] + draws.pretax401k[i] + draws.pretaxIra[i], age: p.ageMid }; });
        var st = D.State.compute({ state: f.state, filingStatus: facts.filingStatus, agiCents: federal.agiCents, socialSecurityTaxableCents: federal.socialSecurityTaxableCents,
          pensionAndIraByPerson: pensionAndIra, flatRate: A.stateFlatRate }, factor);
        var taxesTotal = federal.totalCents + fed.totalCents + st.taxCents + draws.hsaPenaltyCents;
        R = { aca: aca, healthcare: healthcare, spendingTotal: spendingTotal, available: available, contrib: contrib, draws: draws, fica: fed, federal: federal, state: st,
          conv: conv, taxesTotal: taxesTotal, pretaxWithdrawals: pretaxWithdrawals };
        if (Math.abs(taxesTotal - guessTaxes) < TOLERANCE_CENTS && Math.abs(healthcare - guessHealth) < TOLERANCE_CENTS) { converged = true; break; }
        /* A two-state cycle: income sits right on an ACA threshold, where
           the credit flips and the withdrawal that pays for it flips back.
           Settle on the costlier side and say so. */
        if (prevPrevR && Math.abs(prevPrevR.taxesTotal - taxesTotal) < TOLERANCE_CENTS && Math.abs(prevPrevR.healthcare - healthcare) < TOLERANCE_CENTS
            && (Math.abs(prevR.taxesTotal - taxesTotal) >= TOLERANCE_CENTS || Math.abs(prevR.healthcare - healthcare) >= TOLERANCE_CENTS)) {
          if (prevR.taxesTotal + prevR.healthcare > taxesTotal + healthcare) R = prevR;
          converged = true; cliffEdge = true; break;
        }
        prevPrevR = prevR; prevR = R;
        guessTaxes = taxesTotal; guessMagi = federal.magiCents; guessHealth = healthcare;
      }
      if (cliffEdge) yearWarnings.push('Income sits right on a marketplace threshold in ' + year + ': the costlier side is shown.');
      if (!converged) yearWarnings.push('Taxes and withdrawals did not settle in ' + year + ' after ' + MAX_PASSES + ' passes; the row carries the last pass.');
      lastTaxes = R.taxesTotal; lastMagi = R.federal.magiCents; lastHealth = R.healthcare;

      /* Settle the year: cash is the residual of the flows. */
      var c = R.contrib, w = R.draws;
      var cashBefore = state.cash;
      var flows = cashIncome - R.spendingTotal - R.taxesTotal - c.investedCents + w.fromAccountsCents;
      state.cash = cashBefore + flows;
      var unmet = w.unmetCents;
      if (state.cash < 0) { unmet = Math.max(unmet, -state.cash); state.cash = 0; }
      if (unmet > 0 && ranOutYear === null) ranOutYear = year;
      D.Withdrawals.apply(state, w);
      people.forEach(function (p, i) {
        state.pretax401k[i] += c.k401Pretax[i] + c.match[i]; state.roth401k[i] += c.k401Roth[i]; state.hsa[i] += c.hsa[i];
        state.rothIra[i].basis += c.rothIra[i]; state.pretaxIra[i] += c.tradIra[i];
      });
      state.taxable.value += c.taxableCents; state.taxable.basis += c.taxableCents;
      var layers = R.conv.cents ? D.Conversions.apply(state, R.conv.cents, year) : [];
      /* 9. growth */
      var growth = D.Accounts.grow(state, A);
      /* 10. the row */
      var end = D.Accounts.totals(state);
      var annualSpend = f.spending.needsCents + f.spending.wantsCents + R.healthcare;
      var fiNumber = A.swrRate > 0 ? Math.round(annualSpend / A.swrRate) : null;
      var penalty = R.federal.penaltyCents + w.hsaPenaltyCents;
      cumulativePenalty += penalty;
      var flags = {
        working: anyoneWorking, retired: !anyoneWorking, acaYear: !!R.aca, acaCliff: !!(R.aca && R.aca.overCliff), medicaidTerritory: !!(R.aca && R.aca.medicaidTerritory),
        medicare: over65 > 0, socialSecurity: ssTotal > 0, rmd: rmdTotal > 0, conversion: R.conv.cents > 0, penalty: penalty > 0,
        shortfall: unmet > 0, ranOut: unmet > 0, didNotConverge: !converged, acaThresholdEdge: cliffEdge, contributionsStopped: contributionsStopped, blocks: f.activeBlocks.length > 0
      };
      w.warnings.concat(c.warnings, R.state.warnings).forEach(function (m) { yearWarnings.push(m); });
      if (R.aca && R.aca.overCliff) yearWarnings.push('Income crosses the 400% of poverty line cliff in ' + year + ': the whole premium is paid.');
      if (R.aca && R.aca.medicaidTerritory) yearWarnings.push('Income is under 138% of the poverty line in ' + year + ': Medicaid territory in an expansion state.');
      if (unmet > 0) yearWarnings.push('Money runs out in ' + year + ': ' + dollars(unmet) + ' of spending has nothing to come from.');
      yearWarnings = yearWarnings.filter(function (m, i, arr) { return arr.indexOf(m) === i; });
      yearWarnings.forEach(function (m) { if (warnings.indexOf(m) < 0) warnings.push(m); });

      rows.push({
        year: year, ages: f.ages, agesMid: f.agesMid, deflator: Math.round(inflator * 1e6) / 1e6, activeBlocks: f.activeBlocks,
        people: people.map(function (p) { return { label: p.label, age: p.age, working: p.working }; }),
        income: income,
        spending: { fatCents: f.spending.needsCents, wantsCents: f.spending.wantsCents, healthcareCents: R.healthcare, debtPaymentsCents: debt.totalCents,
          debtInterestCents: debt.interestCents, totalCents: R.spendingTotal, unallocatedCents: c.unallocatedCents || 0 },
        contributions: { pretax401kCents: sum(c.k401Pretax), roth401kCents: sum(c.k401Roth), employerMatchCents: c.matchCents, hsaCents: sum(c.hsa),
          rothIraCents: sum(c.rothIra), traditionalIraCents: sum(c.tradIra), taxableCents: c.taxableCents, cashCents: c.cashTopUpCents,
          employeeCents: c.employeeCents, investedCents: c.investedCents, byPerson: { pretax401k: c.k401Pretax, roth401k: c.k401Roth, match: c.match, hsa: c.hsa, rothIra: c.rothIra },
          limits: c.limits || [], explain: c.explain },
        withdrawals: { cashCents: w.cashCents, taxableCents: w.taxable.grossCents, taxableGainCents: w.taxable.gainCents, rothBasisCents: sum(w.rothBasis),
          seasonedConversionsCents: sum(w.seasonedConversions), unseasonedConversionsCents: sum(w.unseasonedConversions),
          pretax401kCents: sum(w.pretax401k), pretaxIraCents: sum(w.pretaxIra), rmdCents: rmdTotal, rothEarningsCents: sum(w.rothEarnings), hsaCents: sum(w.hsa),
          totalCents: w.totalCents + rmdTotal, fromAccountsCents: w.fromAccountsCents, unmetCents: unmet, byPerson: { rmd: rmds, pretax: w.pretaxByPerson }, explain: w.explain },
        conversions: { cents: R.conv.cents, layers: layers, explain: R.conv.explain },
        taxes: { federalOrdinaryCents: R.federal.ordinaryTaxCents, federalCapitalGainsCents: R.federal.capitalGainsTaxCents, niitCents: R.federal.niitCents,
          ficaCents: R.fica.employeeFicaCents, seTaxCents: R.fica.seTaxCents, additionalMedicareCents: R.fica.additionalMedicareCents,
          stateCents: R.state.taxCents, acaCreditCents: R.aca ? R.aca.creditCents : 0, penaltiesCents: penalty,
          totalCents: R.taxesTotal, federalTotalCents: R.federal.totalCents, marginalRate: R.federal.marginalRate, stateMarginalRate: R.state.marginalRate,
          effectiveRate: income.totalCents > 0 ? Math.round(R.taxesTotal / income.totalCents * 10000) / 10000 : null },
        agiCents: R.federal.agiCents, magiCents: R.federal.magiCents, taxableIncomeCents: R.federal.taxableIncomeCents,
        socialSecurityTaxableCents: R.federal.socialSecurityTaxableCents,
        balances: end, balancesStart: start,
        growth: { cashCents: Math.round(growth.cash), taxableCents: Math.round(growth.taxable), pretaxCents: Math.round(growth.pretax), rothCents: Math.round(growth.roth), hsaCents: Math.round(growth.hsa), homeCents: Math.round(growth.home) },
        cashFlow: { inCents: cashIncome + w.fromAccountsCents, outCents: R.spendingTotal + R.taxesTotal + c.investedCents, netCents: flows, cashBeforeCents: Math.round(cashBefore), unmetCents: unmet },
        netWorthCents: end.netWorthCents,
        fiNumberCents: fiNumber,
        fiRatio: fiNumber ? Math.round(end.liquidCents / fiNumber * 1000) / 1000 : null,
        flags: flags,
        aca: R.aca ? { fplShare: R.aca.fplShare, applicablePct: R.aca.applicablePct, creditCents: R.aca.creditCents, premiumCents: R.aca.premiumAfterCreditCents, rule: R.aca.rule, eligible: R.aca.eligible } : null,
        explain: { federal: R.federal.explain, fica: R.fica.explain, state: R.state.explain, aca: R.aca ? R.aca.explain : [], contributions: c.explain, withdrawals: w.explain, conversions: R.conv.explain },
        warnings: yearWarnings, converged: converged, passes: pass
      });
    }
    return { years: rows, warnings: warnings, ranOutYear: ranOutYear, endYear: endYear, cumulativePenaltyCents: cumulativePenalty };
  }

  function survives(sim) { return sim.ranOutYear === null; }

  function yearOfAge(facts, A, age) {
    var p = facts.people[0];
    if (!p || p.birthYear === null) return null;
    return p.birthYear + age;
  }

  function milestones(facts, A, initState, base) {
    var m = { fi: null, fiAge: null, coastFI: null, coastFIAge: null, bridgeGapYears: null, bridgeGapCents: null, bridgeAvailableCents: null,
      accessYear: null, firstConversionYear: null, rmdStart: null, socialSecurityStart: null, medicareStart: null, acaCliffYears: [], ranOutYear: base.ranOutYear, horizonYear: base.endYear };
    var p0 = facts.people[0];
    var born = p0 ? p0.birthYear : null;
    if (born !== null) {
      m.accessYear = born + 60;   /* the first full year past 59 and a half */
      m.medicareStart = born + MEDICARE_AGE;
    }
    base.years.forEach(function (r) {
      if (r.flags.conversion && m.firstConversionYear === null) m.firstConversionYear = r.year;
      if (r.flags.rmd && m.rmdStart === null) m.rmdStart = r.year;
      if (r.flags.socialSecurity && m.socialSecurityStart === null) m.socialSecurityStart = r.year;
      if (r.flags.acaCliff) m.acaCliffYears.push(r.year);
    });
    /* FI: scan the years earned income could stop. */
    var lastWork = null;
    base.years.forEach(function (r) { if (r.flags.working) lastWork = r.year; });
    var fiRun = null;
    if (lastWork !== null && survives(base)) {
      for (var y = A.baseYear; y <= lastWork + 1; y++) {
        var s = simulate(facts, A, initState, { stopEarnedIncomeFromYear: y });
        if (survives(s)) { m.fi = y; fiRun = s; break; }
      }
      if (m.fi === null) { m.fi = lastWork + 1; fiRun = base; }
    } else if (survives(base)) { m.fi = A.baseYear; fiRun = base; }
    if (m.fi !== null && p0 && p0.birthYear !== null) m.fiAge = m.fi - p0.birthYear;
    /* Coast FI: contributions stop, work goes on to the traditional retirement age. */
    if (lastWork !== null) {
      var tradYear = yearOfAge(facts, A, A.traditionalRetirementAge);
      if (tradYear !== null) {
        for (var y2 = A.baseYear; y2 <= Math.min(tradYear, lastWork + 1); y2++) {
          var s2 = simulate(facts, A, initState, { stopContributionsFromYear: y2, workUntilYear: tradYear });
          if (survives(s2)) { m.coastFI = y2; break; }
        }
        if (m.coastFI !== null && p0 && p0.birthYear !== null) m.coastFIAge = m.coastFI - p0.birthYear;
      }
    }
    /* The bridge: FI to 59 and a half, in the FI run. */
    if (m.fi !== null && m.accessYear !== null && fiRun) {
      var gapYears = Math.max(0, m.accessYear - m.fi);
      m.bridgeGapYears = gapYears;
      var need = 0;
      fiRun.years.forEach(function (r) { if (r.year >= m.fi && r.year < m.accessYear) need += r.withdrawals.fromAccountsCents + r.withdrawals.cashCents; });
      m.bridgeGapCents = Math.round(need);
      var at = fiRun.years.filter(function (r) { return r.year === m.fi; })[0];
      if (at) {
        var b = at.balancesStart;
        var seasoned = b.rothConversionLayers.filter(function (l) { return l.seasonedFrom <= m.fi; }).reduce(function (t, l) { return t + l.cents; }, 0);
        m.bridgeAvailableCents = b.cashCents + b.taxableCents + b.rothIraBasisCents + seasoned;
      }
    }
    return m;
  }

  /**
   * project(household, assumptions, blocks, opts)
   *   opts.now          the run date (defaults to today; pass it for a fixed test)
   *   opts.milestones   false skips the FI and Coast FI scans (a quick run)
   */
  function project(household, assumptions, blocks, opts) {
    var o = opts || {};
    var A = D.Assumptions.resolve(household, assumptions, o.now);
    var facts = D.Facts.build(household, A, blocks || []);
    var initState = D.Accounts.init(household, facts, A);
    var base = simulate(facts, A, initState, {});
    var warnings = initState.warnings.concat(base.warnings);
    if (!facts.spending.entered) warnings.unshift('No spending entered: the projection has nothing to cover.');
    facts.people.forEach(function (p) { if (!p.ss || p.ss.monthlyAtFraCents === null) warnings.push('No Social Security benefit entered for ' + p.label + ': none is counted.'); });
    var ms = o.milestones === false ? null : milestones(facts, A, initState, base);
    var lifetimeTax = base.years.reduce(function (t, r) { return t + r.taxes.totalCents; }, 0);
    var lifetimeTaxToday = base.years.reduce(function (t, r) { return t + r.taxes.totalCents / r.deflator; }, 0);
    return {
      years: base.years,
      milestones: ms,
      warnings: warnings.filter(function (m, i, arr) { return arr.indexOf(m) === i; }),
      assumptionsUsed: A,
      summary: { lifetimeTaxCents: lifetimeTax, lifetimeTaxTodayCents: Math.round(lifetimeTaxToday), endNetWorthCents: base.years.length ? base.years[base.years.length - 1].netWorthCents : null,
        ranOutYear: base.ranOutYear, horizonYear: base.endYear, cumulativePenaltyCents: base.cumulativePenaltyCents },
      facts: { people: facts.people.map(function (p) { return { label: p.label, birthYear: p.birthYear, retireAge: p.retireAge }; }), filingStatus: facts.filingStatus, state: facts.state, householdSize: facts.householdSize }
    };
  }

  /** A row's figure in today's dollars. */
  function today(cents, row) { return cents === null || cents === undefined ? null : Math.round(cents / row.deflator); }

  return { project: project, simulate: simulate, today: today, MAX_PASSES: MAX_PASSES, TOLERANCE_CENTS: TOLERANCE_CENTS };
});
