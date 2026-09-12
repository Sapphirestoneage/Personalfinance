/* ==========================================================================
   engines/tax.js — a federal income tax in named steps, and what it means
   for the next dollar.
   --------------------------------------------------------------------------
   The quick figure the other rooms use (Tier0's take-home, the savings
   rate) is Reference.lookupEffectiveTaxRate: the same ladder and the same
   FICA as here, at the standard deduction with nothing else, from the one
   federal table data/tax_brackets.json (D-210). This is the fuller
   computation, with deductions, gains, state and the SE half.

   This is the computation. Each step is its own function with its own
   Result, so a room can show the working and a test can pin each line:

     ordinaryTax        taxable income walked up the bracket ladder
     capitalGainsTax    long-term gains stacked ON TOP of ordinary income,
                        taxed at 0 / 15 / 20 by where the stack lands
     fica               the employee's 7.65%, Social Security capped at the
                        wage base, plus additional Medicare over the threshold
     selfEmploymentTax  engines/selfemployed.js — reused, never re-derived
     stateTax           none / flat / graduated, on federal taxable income as
                        a stated stand-in for state taxable income
     acaCliff           where MAGI sits against 400% of the poverty level

   and estimate() adds them up and says what it did not model. Every table
   it reads is marked unverified except the SE mechanics; the Result carries
   that so a room can print it beside the number. DECISIONS.md D-067.

   Money is integer cents. A missing input is incomplete, never zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      SelfEmployed: require('./selfemployed.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      SelfEmployed: root.SLAF && root.SLAF.SelfEmployed
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.SelfEmployed);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tax = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, SelfEmployed) {
  'use strict';

  function dollars(cents) { return cents / 100; }
  function cents(d) { return Math.round(d * 100); }

  /* The ladder walk and the employee FICA live in shared/reference.js so
     the quick estimate and this engine cannot drift apart (D-210). Looked
     up at call time: a room may load its engines before shared/. */
  function ref() {
    if (typeof module === 'object' && module.exports) return require('../shared/reference.js');
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF.Reference;
  }
  function walk(ladder, amountDollars, topKey, floorDollars) {
    return ref().walkLadder(ladder, amountDollars, topKey, floorDollars);
  }

  /* ---- 1. Ordinary income --------------------------------------------------- */

  /**
   * ordinaryTax(table, grossCents, filingStatus, opts)
   *   opts.deductionCents  itemised deductions, if larger than the standard
   *   opts.aboveTheLineCents  pre-tax 401(k), HSA, the SE tax half, etc.
   * Returns taxable income, the tax, the slices and the marginal rate.
   */
  function ordinaryTax(table, grossCents, filingStatus, opts) {
    var o = opts || {};
    if (!table) return Money.incomplete('Federal bracket table is not loaded.', ['federalBrackets']);
    if (!Money.isEntered(grossCents)) return Money.incomplete('Add your gross income to compute tax.', ['grossAnnualIncome']);
    if (!filingStatus || !table.brackets[filingStatus]) {
      return Money.incomplete('Choose a filing status to compute tax.', ['filingStatus']);
    }
    var standard = table.standardDeduction[filingStatus];
    var deduction = Math.max(standard, Money.isEntered(o.deductionCents) ? dollars(o.deductionCents) : 0);
    var above = Money.isEntered(o.aboveTheLineCents) ? dollars(o.aboveTheLineCents) : 0;
    var agi = Math.max(0, dollars(grossCents) - above);
    var taxable = Math.max(0, agi - deduction);
    var w = walk(table.brackets[filingStatus], taxable, 'upToTaxableIncome', 0);
    return Money.ok(cents(w.taxDollars), {
      agiCents: cents(agi),
      taxableIncomeCents: cents(taxable),
      deductionCents: cents(deduction),
      deductionKind: deduction > standard ? 'itemised' : 'standard',
      aboveTheLineCents: cents(above),
      marginalRate: w.marginalRate,
      slices: w.slices,
      referenceVersion: table.version,
      confidence: table.confidence
    });
  }

  /* ---- 2. Long-term capital gains, stacked ---------------------------------- */

  function capitalGainsTax(table, gainsCents, ordinaryTaxableCents, filingStatus) {
    if (!table || !table.capitalGains) return Money.incomplete('Capital-gains brackets are not loaded.', ['federalBrackets']);
    if (!Money.isEntered(gainsCents)) return Money.incomplete('Add your long-term gains to compute this.', ['capitalGains']);
    var ladder = table.capitalGains[filingStatus];
    if (!ladder) return Money.incomplete('Choose a filing status to compute tax.', ['filingStatus']);
    if (gainsCents <= 0) return Money.ok(0, { slices: [], marginalRate: 0, stackedOnCents: ordinaryTaxableCents || 0 });
    var floor = dollars(Money.isEntered(ordinaryTaxableCents) ? ordinaryTaxableCents : 0);
    var w = walk(ladder, dollars(gainsCents), 'upToTaxableIncome', floor);
    return Money.ok(cents(w.taxDollars), {
      slices: w.slices, marginalRate: w.marginalRate,
      stackedOnCents: cents(floor),
      referenceVersion: table.version, confidence: table.confidence
    });
  }

  /* ---- 3. FICA on wages ------------------------------------------------------ */

  function fica(seTable, wagesCents, filingStatus) {
    if (!seTable) return Money.incomplete('Payroll tax table is not loaded.', ['seTax']);
    if (!Money.isEntered(wagesCents)) return Money.incomplete('Add your wages to compute payroll tax.', ['grossAnnualIncome']);
    var f = ref().employeeFica(seTable, dollars(wagesCents), filingStatus);
    return Money.ok(cents(f.total), {
      socialSecurityCents: cents(f.socialSecurity), medicareCents: cents(f.medicare), additionalMedicareCents: cents(f.additionalMedicare),
      cappedAtWageBase: f.cappedAtWageBase,
      employeeRate: seTable.employeeFicaRate,
      referenceVersion: seTable.version, confidence: seTable.confidence
    });
  }

  /* ---- 4. State --------------------------------------------------------------- */

  function stateTax(table, stateCode, taxableCents, filingStatus) {
    if (!table) return Money.incomplete('State tax table is not loaded.', ['stateBrackets']);
    if (!stateCode) return Money.incomplete('Choose a state to estimate state tax.', ['state']);
    var row = table.states[stateCode];
    if (!row) {
      return Money.unavailable ? Money.unavailable('No state schedule for ' + stateCode + '.')
        : Money.incomplete('No state schedule for ' + stateCode + '.', ['state']);
    }
    if (!Money.isEntered(taxableCents)) return Money.incomplete('Add your income to estimate state tax.', ['grossAnnualIncome']);
    var taxable = Math.max(0, dollars(taxableCents));
    var meta = { type: row.type, stateCode: stateCode, referenceVersion: table.version, confidence: table.confidence,
      approximation: 'applied to federal taxable income; local taxes, state deductions and credits ignored' };
    if (row.type === 'none') return Money.ok(0, Object.assign({ marginalRate: 0 }, meta));
    if (row.type === 'flat') return Money.ok(cents(taxable * row.rate), Object.assign({ marginalRate: row.rate }, meta));
    var mult = filingStatus === 'married_joint' ? (table.jointMultiplier || 1) : 1;
    var ladder = row.single.map(function (b) { return { upTo: b.upTo === null ? null : b.upTo * mult, rate: b.rate }; });
    var w = walk(ladder, taxable, 'upTo', 0);
    return Money.ok(cents(w.taxDollars), Object.assign({ marginalRate: w.marginalRate, slices: w.slices }, meta));
  }

  /* ---- 5. The ACA cliff ------------------------------------------------------ */

  /**
   * applicableFraction(bands, multiple) — the share of income the law expects
   * you to put towards a benchmark plan at `multiple` times the poverty
   * level. The revenue procedure's table RAMPS: inside a band the percentage
   * rises in a straight line from `from` at `fromFpl` to `to` at `toFpl`
   * (D-219). A step read of the same table overstates at the bottom of every
   * band and understates at the top. Above the last band: null, no credit.
   */
  function applicableFraction(bands, multiple) {
    if (!bands || !bands.length) return null;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (multiple > b.toFpl && b.toFpl !== null) continue;
      if (b.to === b.from || b.toFpl === null || b.toFpl === b.fromFpl) return b.from;
      var within = (multiple - b.fromFpl) / (b.toFpl - b.fromFpl);
      if (within < 0) within = 0;
      if (within > 1) within = 1;
      return b.from + (b.to - b.from) * within;
    }
    return null;
  }

  /**
   * acaCliff(table, magiCents, householdSize, region) — where MAGI sits
   * against the subsidy ceiling, and the share of income the law expects.
   * `region` is 'contiguous' (the default), 'alaska' or 'hawaii': the
   * poverty guidelines differ there and so does everything read off them.
   */
  /**
   * povertyLine(table, householdSize, region) — the HHS poverty guideline in
   * DOLLARS for a household of that size, from data/aca.json. One formula,
   * one function (D-224): the ACA cliff and the student-loan income-driven
   * threshold are both a multiple of this line and neither re-derives it.
   * Null when the table is not loaded, so a caller can fall back and say so.
   */
  function povertyLine(table, householdSize, region) {
    if (!table) return null;
    var size = Math.max(1, householdSize || 1);
    var byRegion = table.fplByRegion || {};
    var name = region && byRegion[region] ? region : 'contiguous';
    var row = byRegion[name] || table.fpl;
    if (!row || !Money.isEntered(row.base) || !Money.isEntered(row.perAdditionalPerson)) return null;
    return { dollars: row.base + row.perAdditionalPerson * (size - 1), region: name, householdSize: size,
      guidelineYear: table.guidelineYear === undefined ? null : table.guidelineYear };
  }

  function acaCliff(table, magiCents, householdSize, region) {
    if (!table) return Money.incomplete('ACA table is not loaded.', ['aca']);
    if (!Money.isEntered(magiCents)) return Money.incomplete('Add your income to check the subsidy ceiling.', ['grossAnnualIncome']);
    var line = povertyLine(table, householdSize, region);
    if (!line) return Money.incomplete('The ACA table has no poverty guideline.', ['aca']);
    var size = line.householdSize, name = line.region, fpl = line.dollars;
    var multiple = dollars(magiCents) / fpl;
    var cliffDollars = fpl * table.cliffMultiple;
    var over = multiple > table.cliffMultiple;
    var pct = over ? null : applicableFraction(table.applicablePercentage, multiple);
    return Money.ok(multiple, {
      fplDollars: fpl, householdSize: size, region: name,
      planYear: table.planYear, guidelineYear: table.guidelineYear,
      cliffCents: cents(cliffDollars),
      roomBeforeCliffCents: cents(Math.max(0, cliffDollars - dollars(magiCents))),
      overCliff: over,
      applicablePercentage: pct,
      expectedContributionCents: pct === null ? null : cents(dollars(magiCents) * pct),
      referenceVersion: table.version, confidence: table.confidence
    });
  }

  /* ---- 6. The whole thing, in one go ----------------------------------------- */

  /**
   * estimate(household, tables, opts)
   *   opts.wagesCents          W-2 wages (default: the household's gross)
   *   opts.selfEmploymentCents net profit from self-employment
   *   opts.otherOrdinaryCents  ordinary income with no payroll tax on it
   *                            (unemployment benefit, D-129)
   *   opts.capitalGainsCents   long-term gains / qualified dividends
   *   opts.deferralCents       pre-tax 401(k) / HSA / traditional IRA
   *   opts.deductionCents      itemised, if larger than the standard
   * Returns the total with every component; `notModelled` lists what is
   * deliberately left out so the number is never mistaken for a return.
   */
  function estimate(household, tables, opts) {
    var o = opts || {};
    var t = tables || {};
    var gross = Schema.grossAnnualIncomeCents(household);
    var wages = Money.isEntered(o.wagesCents) ? o.wagesCents : (Money.isOk(gross) ? gross.value : null);
    var se = Money.isEntered(o.selfEmploymentCents) ? o.selfEmploymentCents : 0;
    var gains = Money.isEntered(o.capitalGainsCents) ? o.capitalGainsCents : 0;
    var other = Money.isEntered(o.otherOrdinaryCents) ? o.otherOrdinaryCents : 0;
    var fs = household && household.filingStatus;
    if (!Money.isEntered(wages) && se === 0 && other === 0) {
      return Money.incomplete('Add your income to estimate tax.', ['grossAnnualIncome']);
    }
    if (!fs) return Money.incomplete('Choose a filing status to estimate tax.', ['filingStatus']);

    var seTax = se > 0 ? SelfEmployed.selfEmploymentTax(se, fs, t.seTax, { priorWagesCents: wages || 0 })
      : Money.ok(0, { deductibleHalfCents: 0 });
    if (!Money.isOk(seTax)) return seTax;

    var above = (Money.isEntered(o.deferralCents) ? o.deferralCents : 0) + (seTax.deductibleHalfCents || 0);
    var ordinaryGross = (wages || 0) + se + other;
    var ord = ordinaryTax(t.federalBrackets, ordinaryGross, fs, { deductionCents: o.deductionCents, aboveTheLineCents: above });
    if (!Money.isOk(ord)) return ord;

    var cg = gains > 0 ? capitalGainsTax(t.federalBrackets, gains, ord.taxableIncomeCents, fs) : Money.ok(0, { marginalRate: 0 });
    if (!Money.isOk(cg)) return cg;

    var payroll = Money.isEntered(wages) && wages > 0 ? fica(t.seTax, wages, fs) : Money.ok(0, {});
    if (!Money.isOk(payroll)) return payroll;

    var st = household && household.state && t.stateBrackets
      ? stateTax(t.stateBrackets, household.state, ord.taxableIncomeCents + gains, fs) : null;
    var stateCents = st && Money.isOk(st) ? st.value : 0;

    var magi = ord.agiCents + gains;
    var aca = t.aca ? acaCliff(t.aca, magi, Schema.adults(household).length) : null;

    var federal = ord.value + cg.value;
    var total = federal + payroll.value + seTax.value + stateCents;
    var totalGross = ordinaryGross + gains;
    return Money.ok(total, {
      federalOrdinaryCents: ord.value,
      federalCapitalGainsCents: cg.value,
      federalIncomeTaxCents: federal,
      ficaCents: payroll.value,
      selfEmploymentTaxCents: seTax.value,
      otherOrdinaryCents: other,
      stateCents: stateCents,
      stateIncluded: !!(st && Money.isOk(st)),
      taxableIncomeCents: ord.taxableIncomeCents,
      agiCents: ord.agiCents,
      magiCents: magi,
      marginalRate: ord.marginalRate,
      capitalGainsRate: cg.marginalRate,
      effectiveRate: totalGross > 0 ? total / totalGross : null,
      takeHomeAnnualCents: totalGross - total,
      components: { ordinary: ord, capitalGains: cg, fica: payroll, selfEmployment: seTax, state: st, aca: aca },
      notModelled: ['credits (child, EITC, education)', 'itemised deductions beyond the one figure passed in',
        'state deductions, exemptions and local taxes', 'AMT', 'NIIT', 'the qualified business income deduction'],
      confidence: (t.federalBrackets && t.federalBrackets.confidence) || 'unverified'
    });
  }

  /* ---- 6. Deferred tax on what is owned (15.3, D-181) ---------------------
     A pre-tax dollar is not a whole dollar. The rate it will be taxed at is
     the marginal bracket at PROJECTED FI SPENDING (today's money, 15.2),
     not today's bracket: in retirement the withdrawals are the income.
     Capital gains stack on top of that ordinary income, so the gains rate
     is the one at the first dollar of gains above it. Filing status missing
     is assumed single and said so, because an assumed rate is still a
     rate and a blank net worth helps nobody. */
  function withdrawalRates(household, tables) {
    var t = tables || {};
    if (!t.federalBrackets) return Money.incomplete('Federal bracket table is not loaded.', ['federalBrackets']);
    var spend = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(spend)) return Money.incomplete('Add your monthly spending to see the tax you will owe later.', ['monthlyExpenses']);
    var assumed = [];
    var fs = household && household.filingStatus;
    if (!fs || !t.federalBrackets.brackets[fs]) { fs = 'single'; assumed.push('filingStatus'); }
    var annual = spend.value * 12;
    var ord = ordinaryTax(t.federalBrackets, annual, fs);
    if (!Money.isOk(ord)) return ord;
    var cg = capitalGainsTax(t.federalBrackets, 100, ord.taxableIncomeCents, fs);
    return Money.ok(ord.marginalRate, {
      withdrawalRate: ord.marginalRate,
      capitalGainsRate: Money.isOk(cg) ? cg.marginalRate : 0,
      spendingAnnualCents: annual,
      taxableIncomeCents: ord.taxableIncomeCents,
      filingStatus: fs,
      assumed: assumed,
      referenceVersion: t.federalBrackets.version
    });
  }

  /** Every owned thing after the tax still owed on it, and the net worth
      that leaves. `rows` carry each asset's own answer. */
  function afterTaxAssets(household, tables, categories) {
    var rates = withdrawalRates(household, tables);
    if (!Money.isOk(rates)) return rates;
    var assumed = rates.assumed.slice();
    var listed = 0, after = 0, rows = [], counted = 0;
    Schema.aggregatableAssets(household).forEach(function (a) {
      if (!Money.isEntered(a.valueCents)) return;
      if (categories && categories.indexOf(a.category) === -1) return;
      var r = Schema.afterTaxValue(a, household, rates);
      if (!Money.isOk(r)) return;
      counted++;
      listed += a.valueCents;
      after += r.value;
      r.assumed.forEach(function (k) { if (assumed.indexOf(k) === -1) assumed.push(k); });
      rows.push({ asset: a, result: r });
    });
    if (counted === 0) return Money.incomplete('Add an amount to see this.', ['assets']);
    return Money.ok(after, {
      listedCents: listed,
      afterTaxCents: after,
      deferredTaxCents: listed - after,
      rows: rows,
      rates: rates,
      assumed: assumed
    });
  }

  function afterTaxNetWorth(household, tables) {
    var assets = afterTaxAssets(household, tables, null);
    if (!Money.isOk(assets)) return assets;
    var debt = Schema.totalDebtCents(household);
    if (!Money.isOk(debt)) return Money.incomplete('Add your total debt to see this. Enter 0 if you have none.', ['debts']);
    return Money.ok(assets.afterTaxCents - debt.value, {
      listedNetWorthCents: assets.listedCents - debt.value,
      totalAssetsCents: assets.listedCents,
      afterTaxAssetsCents: assets.afterTaxCents,
      totalDebtCents: debt.value,
      deferredTaxCents: assets.deferredTaxCents,
      rows: assets.rows,
      rates: assets.rates,
      assumed: assets.assumed
    });
  }

  /** The investments the FI target is measured against, after deferred tax. */
  function afterTaxInvestmentsCents(household, tables) {
    return afterTaxAssets(household, tables, ['investment', 'retirement']);
  }

  /* ---- 7. Take-home, source by source (15.4, D-181) -----------------------
     Each source gets its own rules: a W-2 job pays FICA and ordinary tax;
     contract work pays self-employment tax and deducts half of it; passive
     income is ordinary unless marked qualified, which stacks as gains;
     a benefit and a pension are ordinary with no payroll tax; Social
     Security is at most 85% taxable (the higher-income rule; taken as the
     rule for anyone who still has other income, and said so). The
     ordinary tax is computed ONCE on the pool and shared out in proportion
     to what each source put in, so the parts sum to the whole. */
  var SS_TAXABLE_SHARE = 0.85;
  function takeHomeBySource(household, tables) {
    var t = tables || {};
    var sources = Schema.allIncomeSources(household).filter(function (s) { return Money.isEntered(s.grossAnnualIncomeCents); });
    if (!sources.length) return Money.incomplete('Add your income to see this.', ['grossAnnualIncome']);
    if (!t.federalBrackets) return Money.incomplete('Federal bracket table is not loaded.', ['federalBrackets']);
    var assumed = [];
    var fs = household && household.filingStatus;
    if (!fs || !t.federalBrackets.brackets[fs]) { fs = 'single'; assumed.push('filingStatus'); }
    var wages = 0;
    sources.forEach(function (s) { if (s.type === 'w2' || s.type === 'equity') wages += s.grossAnnualIncomeCents; });
    var rows = sources.map(function (s) {
      var type = s.type || 'w2';
      var g = s.grossAnnualIncomeCents;
      var row = { id: s.id, source: s.source, personId: s.personId, type: type, grossCents: g, ordinaryCents: 0, qualifiedCents: 0, payrollCents: 0, seCents: 0, method: '', survivesJobLoss: Schema.survivesJobLoss(s) };
      if (type === 'w2' || type === 'equity') {
        var f = fica(t.seTax, g, fs);
        row.payrollCents = Money.isOk(f) ? f.value : 0;
        row.ordinaryCents = g;
        row.method = 'payroll tax and withholding';
      } else if (type === '1099') {
        var se = SelfEmployed.selfEmploymentTax(g, fs, t.seTax, { priorWagesCents: wages });
        row.seCents = Money.isOk(se) ? se.value : 0;
        row.halfSeCents = Money.isOk(se) ? (se.deductibleHalfCents || 0) : 0;
        row.ordinaryCents = Math.max(0, g - row.halfSeCents);
        row.method = 'self-employment tax, half of it deducted';
      } else if (type === 'passive') {
        if (s.passiveTreatment === 'qualified') { row.qualifiedCents = g; row.method = 'qualified: taxed as gains'; }
        else { row.ordinaryCents = g; row.method = 'ordinary income, no payroll tax'; }
      } else if (type === 'socialSecurity') {
        row.ordinaryCents = Math.round(g * SS_TAXABLE_SHARE);
        row.method = 'up to 85% taxable, no payroll tax';
        if (assumed.indexOf('socialSecurityShare') === -1) assumed.push('socialSecurityShare');
      } else {
        row.ordinaryCents = g;
        row.method = type === 'pension' ? 'ordinary income, no payroll tax' : 'taxable, no payroll tax';
      }
      return row;
    });
    var pool = 0, qualified = 0;
    rows.forEach(function (r) { pool += r.ordinaryCents; qualified += r.qualifiedCents; });
    var ord = ordinaryTax(t.federalBrackets, pool, fs);
    var ordTax = Money.isOk(ord) ? ord.value : 0;
    var cg = qualified > 0 && Money.isOk(ord) ? capitalGainsTax(t.federalBrackets, qualified, ord.taxableIncomeCents, fs) : null;
    var cgTax = cg && Money.isOk(cg) ? cg.value : 0;
    var totalGross = 0, totalTax = 0;
    rows.forEach(function (r) {
      var share = pool > 0 ? r.ordinaryCents / pool : 0;
      var qshare = qualified > 0 ? r.qualifiedCents / qualified : 0;
      r.incomeTaxCents = Math.round(ordTax * share + cgTax * qshare);
      r.taxCents = r.incomeTaxCents + r.payrollCents + r.seCents;
      r.takeHomeCents = r.grossCents - r.taxCents;
      r.effectiveRate = r.grossCents > 0 ? r.taxCents / r.grossCents : null;
      totalGross += r.grossCents; totalTax += r.taxCents;
    });
    return Money.ok(totalGross - totalTax, {
      rows: rows,
      grossCents: totalGross,
      taxCents: totalTax,
      takeHomeCents: totalGross - totalTax,
      effectiveRate: totalGross > 0 ? totalTax / totalGross : null,
      filingStatus: fs,
      assumed: assumed,
      referenceVersion: t.federalBrackets.version
    });
  }

  return {
    takeHomeBySource: takeHomeBySource,
    withdrawalRates: withdrawalRates,
    afterTaxAssets: afterTaxAssets,
    afterTaxNetWorth: afterTaxNetWorth,
    afterTaxInvestmentsCents: afterTaxInvestmentsCents,
    ordinaryTax: ordinaryTax,
    capitalGainsTax: capitalGainsTax,
    fica: fica,
    stateTax: stateTax,
    acaCliff: acaCliff,
    povertyLine: povertyLine,
    applicableFraction: applicableFraction,
    estimate: estimate,
    _walk: walk
  };
});
