/* ==========================================================================
   engines/ratios.js — every ratio in one registry. SPEC.md §13, Tiers 18-19.
   --------------------------------------------------------------------------
   The Ratio Glossary is mostly assembly: the household already holds what
   these need, and engines/tier0.js already computes several of them. So the
   rule here is the same as everywhere else — one calculation lives in one
   place. Where Tier 0 already owns a ratio, this file CALLS it rather than
   re-deriving it, and a test asserts the two agree.

   Each entry declares:
     id, label, formula   what it is, in words a person can check
     unit                 'rate' | 'months' | 'multiple' | 'years'
     compute(ctx)         a Money Result — never a bare number
     needs                what it wants, for the "why is this blank" line

   Bands live in data/ratio_benchmarks.json, not here, and a null band means
   no convention worth quoting exists. A ratio without a band still computes;
   it just gets no verdict, which is the honest outcome for a number like
   investment-to-net-worth that is right for a renter and wrong for someone
   whose wealth is a paid-off house.

   NOT INCLUDED, on purpose: Credit Utilization needs total credit limits and
   the household does not hold them; Life Insurance Needs compares against
   coverage nobody has entered. Both are listed by `unavailable()` with what
   they would need, rather than computed from a stand-in. A believable wrong
   answer is worse than a missing one — DECISIONS.md D-036.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js'),
      CashFlow: require('./cashflow.js'),
      Statement: require('./statement.js'),
      Benchmarks: require('./benchmarks.js'),
      Reference: require('../shared/reference.js'),
      Skills: require('./skills.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0,
      CashFlow: root.SLAF && root.SLAF.CashFlow,
      Statement: root.SLAF && root.SLAF.Statement,
      Benchmarks: root.SLAF && root.SLAF.Benchmarks,
      Reference: root.SLAF && root.SLAF.Reference,
      Skills: null
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.CashFlow, deps.Statement, deps.Benchmarks, deps.Reference, deps.Skills);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Ratios = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, CashFlow, Statement, Benchmarks, Reference, SkillsDep) {
  'use strict';

  /* The skills engine is optional and, in a browser, may be loaded after
     this file — so it is looked up when a ratio asks, not when this runs. */
  function skillsEngine() {
    if (SkillsDep) return SkillsDep;
    return (typeof self !== 'undefined' && self.SLAF && self.SLAF.Skills) || null;
  }

  var MONTHS = 12;
  var MS_PER_DAY = 86400000;
  var DAYS_PER_YEAR = 365.25;
  /* Two readings count as a year apart at eleven months — a snapshot taken
     "about a year later" rarely lands on the day. BRIEF §4.3. */
  var YEAR_APART_DAYS = 335;

  /* A ratio this app deliberately cannot compute, and what it would need. */
  function unavailable(reason, needs) {
    var r = Money.incomplete(reason, needs || []);
    r.unavailable = true;
    return r;
  }

  function val(result) { return Money.isOk(result) ? result.value : null; }

  /* ---- The context every ratio reads ------------------------------------
     Built once per call so twenty ratios do not each re-walk the asset list. */
  function context(household, tables, opts) {
    var c = { household: household, tables: tables || {}, opts: opts || {} };
    c.snapshots = (opts && opts.snapshots) || [];
    c.now = opts && Money.isEntered(opts.now) ? opts.now : Date.now();
    c.assumptions = Schema.resolveAssumptions(household);
    c.grossAnnual = val(Schema.grossAnnualIncomeCents(household));
    c.monthlyGross = Money.isEntered(c.grossAnnual) ? c.grossAnnual / MONTHS : null;
    c.monthlyExpenses = val(Schema.monthlyExpensesCents(household));
    c.cash = val(Schema.cashCents(household));
    c.investments = val(Schema.investmentsCents(household));
    c.totalAssets = val(Schema.totalAssetsCents(household));
    c.totalDebt = val(Schema.totalDebtCents(household));
    c.monthlyDebtPayments = val(Schema.monthlyDebtPaymentsCents(household));
    c.netWorth = val(Tier0.netWorth(household));
    c.debts = Schema.aggregatableDebts(household);

    /* Liquid assets carry an explicit flag; cash is the subset Emergency
       Fund Coverage uses, and the two are deliberately different. */
    var liquid = 0, liquidCount = 0, realEstate = 0;
    Schema.aggregatableAssets(household).forEach(function (a) {
      if (!Money.isEntered(a.valueCents)) return;
      if (a.liquid) { liquid += a.valueCents; liquidCount++; }
      if (a.category === 'real_estate') realEstate += a.valueCents;
    });
    c.liquidAssets = liquidCount ? liquid : (Money.isEntered(c.cash) ? c.cash : null);
    c.realEstate = realEstate;

    /* For the shadow runway: a Roth's contributions come out any time, and
       a home is worth something in a hurry — at a haircut. D-081. */
    var rothBasis = 0;
    Schema.aggregatableAssets(household).forEach(function (a) {
      if (!Money.isEntered(a.valueCents)) return;
      var key = c.tables.accessRules ? Schema.assetRule(a, c.tables.accessRules).key : a.taxCharacter;
      if (key === 'roth' && Money.isEntered(a.costBasisCents)) rothBasis += Math.min(a.costBasisCents, a.valueCents);
    });
    c.rothBasis = rothBasis;
    c.takeHomeMonthly = val(Tier0.takeHomeMonthlyCents(household, c.tables));

    function debtSum(pred, field) {
      var total = 0, counted = 0;
      c.debts.forEach(function (d) {
        if (!pred(d)) return;
        var v = d[field];
        if (Money.isEntered(v)) { total += v; counted++; }
      });
      return counted ? total : null;
    }
    c.mortgageBalance = debtSum(function (d) { return d.type === 'mortgage'; }, 'balanceCents');
    c.homeEquity = realEstate > 0 ? Math.max(0, realEstate - (Money.isEntered(c.mortgageBalance) ? c.mortgageBalance : 0)) : 0;
    c.mortgagePayment = debtSum(function (d) { return d.type === 'mortgage'; }, 'minPaymentCents');
    c.autoPayment = debtSum(function (d) { return d.type === 'auto'; }, 'minPaymentCents');
    c.revolvingBalance = debtSum(function (d) { return d.type === 'credit_card'; }, 'balanceCents');

    /* Credit utilisation counts only the cards whose limit is known, on BOTH
       sides of the division. A card with a balance and no limit entered
       would otherwise inflate the numerator against a denominator it never
       contributed to — the single easiest way to make this ratio lie. How
       many were left out comes back with the answer. DECISIONS.md D-045. */
    var limit = 0, limitedBalance = 0, limitedCards = 0, unlimitedCards = 0;
    c.debts.forEach(function (d) {
      if (d.type !== 'credit_card') return;
      if (Money.isEntered(d.creditLimitCents) && d.creditLimitCents > 0) {
        limit += d.creditLimitCents;
        if (Money.isEntered(d.balanceCents)) limitedBalance += d.balanceCents;
        limitedCards++;
      } else {
        unlimitedCards++;
      }
    });
    c.revolvingLimit = limitedCards ? limit : null;
    c.limitedRevolvingBalance = limitedCards ? limitedBalance : null;
    c.limitedCardCount = limitedCards;
    c.unlimitedCardCount = unlimitedCards;

    /* Categorised spending, when a month exists. Several ratios need the
       split and say so rather than guessing at it. */
    var summary = CashFlow.summarise(household, c.tables.expenseCategories);
    c.spend = Money.isOk(summary) ? summary : null;
    if (c.spend) {
      c.housingMonthly = 0;
      c.spend.categories.forEach(function (row) {
        if (row.categoryId === 'housing' || row.categoryId === 'utilities') c.housingMonthly += row.monthlyCents;
      });
      c.needsMonthly = c.spend.byBucket.needs || 0;
      c.wantsMonthly = c.spend.byBucket.wants || 0;
      c.giftsMonthly = 0;
      c.spend.categories.forEach(function (row) { if (row.categoryId === 'gifts') c.giftsMonthly += row.monthlyCents; });
    }
    return c;
  }

  /* ---- Reading a snapshot back ---------------------------------------------
     `fields` holds every owned reading at the time — a bare number or a
     {status, value} Result. The most recent snapshot at least eleven months
     before `now` is "then". */
  function stored(bucket, id) {
    if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, id)) return null;
    var v = bucket[id];
    if (v && typeof v === 'object' && 'status' in v) return v.status === 'ok' ? v.value : null;
    return Money.isEntered(v) ? v : null;
  }
  function aYearAgo(c) {
    var best = null;
    c.snapshots.forEach(function (s) {
      var t = Date.parse(s.timestamp);
      if (!Number.isFinite(t)) return;
      if ((c.now - t) / MS_PER_DAY < YEAR_APART_DAYS) return;
      if (!best || t > best.t) best = { t: t, snap: s };
    });
    return best;
  }
  function needsAYear(c) {
    return Money.incomplete(c.snapshots.length
      ? 'Needs a snapshot at least eleven months old to compare against; the oldest is more recent than that.'
      : 'Save a snapshot on the Financial Snapshot, then come back in a year.', ['snapshots']);
  }

  function over(numerator, denominator, opts) {
    return Money.safeDivide(numerator, denominator, opts || {});
  }

  /* ---- The registry ------------------------------------------------------ */

  var RATIOS = [
    /* --- Tier 18 --------------------------------------------------------- */
    { id: 'debtToIncome', label: 'Debt-to-income', tier: 18,
      formula: 'monthly debt payments ÷ gross monthly income',
      unit: 'rate', needs: 'your debts and your income',
      note: 'Gross, not net — the 28/36 thresholds are calibrated to gross.',
      compute: function (c) { return Tier0.debtToIncome(c.household); } },

    { id: 'housingRatio', label: 'Housing ratio (front-end)', tier: 18,
      formula: 'housing + utilities ÷ gross monthly income',
      unit: 'rate', needs: 'a categorised month and your income',
      note: 'The 28% rule. Counts housing and utilities, which is how underwriters read it.',
      compute: function (c) {
        if (!c.spend) return Money.incomplete('Categorise a month in Cash Flow to split housing out.', ['expenseEntries']);
        return over(c.housingMonthly, c.monthlyGross, { denominatorName: 'grossAnnualIncome' });
      } },

    { id: 'backEndRatio', label: 'Back-end ratio', tier: 18,
      formula: '(housing + every debt payment) ÷ gross monthly income',
      unit: 'rate', needs: 'a categorised month, your debts and your income',
      note: 'The 36% rule. Housing plus all other debt service.',
      compute: function (c) {
        if (!c.spend) return Money.incomplete('Categorise a month in Cash Flow to split housing out.', ['expenseEntries']);
        if (!Money.isEntered(c.monthlyDebtPayments)) return Money.incomplete('Add your debts to see this.', ['debts']);
        /* A mortgage payment sits in both halves; count it once. */
        var nonMortgage = c.monthlyDebtPayments - (Money.isEntered(c.mortgagePayment) ? c.mortgagePayment : 0);
        return over(c.housingMonthly + nonMortgage, c.monthlyGross, { denominatorName: 'grossAnnualIncome' });
      } },

    { id: 'savingsRate', label: 'Savings rate', tier: 18,
      formula: '(gross − expenses×12 − estimated tax) ÷ gross',
      unit: 'rate', needs: 'your income, expenses and filing status',
      note: 'Your money only. The including-match variant lives in the Savings Rate room.',
      compute: function (c) { return Tier0.savingsRate(c.household, c.tables).excludingMatch; } },

    { id: 'emergencyFundMonths', label: 'Emergency fund coverage', tier: 18,
      formula: 'cash ÷ monthly expenses',
      unit: 'months', needs: 'your cash and your monthly expenses',
      note: 'Cash alone, not cash plus investments.',
      compute: function (c) { return Tier0.emergencyFundMonths(c.household); } },

    { id: 'creditUtilization', label: 'Credit utilisation', tier: 18,
      formula: 'card balances ÷ total credit limit',
      unit: 'rate', needs: 'a credit limit on at least one card',
      note: 'Only the cards you have given a limit for are counted, on both sides — mixing a card with a known limit into the balance while leaving its limit out would overstate the figure. Add the limit in Debt Payoff.',
      compute: function (c) {
        if (c.revolvingLimit === null) {
          return unavailable(
            'This needs the credit limit on at least one card. Add it in Debt Payoff — '
              + 'guessing a limit would produce a number people act on.',
            ['creditLimitTotal']);
        }
        var r = over(c.limitedRevolvingBalance, c.revolvingLimit,
          { denominatorName: 'creditLimitTotal' });
        if (!Money.isOk(r)) return r;
        return Money.ok(r.value, {
          cardsCounted: c.limitedCardCount,
          cardsWithoutLimit: c.unlimitedCardCount,
          limitCents: c.revolvingLimit,
          balanceCents: c.limitedRevolvingBalance
        });
      } },

    { id: 'netWorthToIncome', label: 'Net worth to income', tier: 18,
      formula: 'net worth ÷ gross annual income',
      unit: 'multiple', needs: 'your balances and your income',
      compute: function (c) {
        return over(c.netWorth, c.grossAnnual, {
          denominatorName: 'grossAnnualIncome',
          /* Someone who answered "nothing" has answered. Telling them to
             add the input they just gave is the empty-vs-zero rule leaking
             out through the copy. DECISIONS.md D-048. */
          zeroReason: 'A gross income of zero can’t produce a net-worth multiple — '
            + 'your net worth is what it is, there is just nothing to divide it by.'
        });
      } },

    { id: 'liquidityRatio', label: 'Liquidity ratio', tier: 18,
      formula: 'liquid assets ÷ monthly expenses',
      unit: 'months', needs: 'your liquid assets and your monthly expenses',
      note: 'Everything marked liquid, which is a wider net than the cash-only emergency fund figure.',
      compute: function (c) { return over(c.liquidAssets, c.monthlyExpenses, { denominatorName: 'monthlyExpenses' }); } },

    { id: 'solvencyRatio', label: 'Solvency ratio', tier: 18,
      formula: 'net worth ÷ total assets',
      unit: 'rate', needs: 'your assets and debts',
      compute: function (c) { return over(c.netWorth, c.totalAssets, { denominatorName: 'totalAssets' }); } },

    { id: 'currentRatio', label: 'Current ratio', tier: 18,
      formula: 'liquid assets ÷ a year of required debt payments',
      unit: 'multiple', needs: 'your liquid assets and your debt payments',
      note: '"Current liabilities" has no personal-finance definition, so this uses twelve months of minimum payments and says so.',
      compute: function (c) {
        var yearOfPayments = Money.isEntered(c.monthlyDebtPayments) ? c.monthlyDebtPayments * MONTHS : null;
        return over(c.liquidAssets, yearOfPayments, {
          denominatorName: 'monthlyDebtPayments',
          zeroReason: 'With no required debt payments, there is nothing for liquid assets to cover.'
        });
      } },

    { id: 'retirementMultiple', label: 'Retirement savings multiple', tier: 18,
      formula: 'investments ÷ gross annual income, against an age benchmark',
      unit: 'multiple', needs: 'your investments, income and date of birth',
      compute: function (c) { return Tier0.retirementBenchmark(c.household, c.tables); } },

    { id: 'lifeInsuranceMultiple', label: 'Life insurance needs multiple', tier: 18,
      formula: 'coverage ÷ gross annual income, against a 10× rule of thumb',
      unit: 'multiple', needs: 'your current life cover',
      note: 'Not computed: your existing coverage is not something this app holds.',
      compute: function () {
        return unavailable('This needs your current life cover, which nothing here asks for yet.',
          ['currentLifeCoverage']);
      } },

    { id: 'carPaymentToIncome', label: 'Car payment to income', tier: 18,
      formula: 'auto loan payments ÷ gross monthly income',
      unit: 'rate', needs: 'an auto debt and your income',
      compute: function (c) {
        if (!Money.isEntered(c.autoPayment)) {
          return Money.incomplete('No auto loan entered — add one in Debt Payoff to see this.', ['debts']);
        }
        return over(c.autoPayment, c.monthlyGross, { denominatorName: 'grossAnnualIncome' });
      } },

    { id: 'investmentToNetWorth', label: 'Investment to net worth', tier: 18,
      formula: 'investments ÷ net worth',
      unit: 'rate', needs: 'your investments and your net worth',
      compute: function (c) { return over(c.investments, c.netWorth, { denominatorName: 'netWorth' }); } },

    { id: 'fiRatio', label: 'FI ratio', tier: 18,
      formula: '(investments × safe withdrawal rate) ÷ annual expenses',
      unit: 'rate', needs: 'your investments and your monthly expenses',
      note: 'Portfolio income at your safe withdrawal rate, against a year of spending. 1.0 is financial independence.',
      compute: function (c) {
        if (!Money.isEntered(c.investments)) return Money.incomplete('Add your investments to see this.', ['investments']);
        var passive = c.investments * c.assumptions.swrRate;
        var annualExpenses = Money.isEntered(c.monthlyExpenses) ? c.monthlyExpenses * MONTHS : null;
        return over(passive, annualExpenses, { denominatorName: 'monthlyExpenses' });
      } },

    { id: 'debtToAsset', label: 'Debt to asset', tier: 18,
      formula: 'total debt ÷ total assets',
      unit: 'rate', needs: 'your assets and debts',
      compute: function (c) { return over(c.totalDebt, c.totalAssets, { denominatorName: 'totalAssets' }); } },

    { id: 'personalCashFlowRatio', label: 'Personal cash flow ratio', tier: 18,
      formula: '(income − everything out) ÷ income',
      unit: 'rate', needs: 'your income and expenses',
      compute: function (c) {
        var flow = CashFlow.monthlySurplusCents(c.household, c.tables.expenseCategories, c.tables);
        if (!Money.isOk(flow)) return flow;
        return over(flow.value, c.monthlyGross, { denominatorName: 'grossAnnualIncome' });
      } },

    { id: 'ruleOf72', label: 'Rule of 72', tier: 18,
      formula: '72 ÷ your expected return, in percent',
      unit: 'years', needs: 'an expected return',
      note: 'A shortcut, not a ratio: roughly how long money takes to double.',
      compute: function (c) {
        var pct = c.assumptions.expectedReturnRate * 100;
        return over(72, pct, { denominatorName: 'expectedReturnRate' });
      } },

    /* --- Tier 19, the ones computable from what the household holds ------- */
    { id: 'safeWithdrawalRate', label: 'Safe withdrawal rate', tier: 19,
      formula: 'your assumption, adjustable in the FIRE room',
      unit: 'rate', needs: 'nothing — it is an assumption',
      compute: function (c) { return Money.ok(c.assumptions.swrRate); } },

    { id: 'loanToValue', label: 'Loan to value', tier: 19,
      formula: 'mortgage balance ÷ property value',
      unit: 'rate', needs: 'a mortgage and a property value',
      compute: function (c) {
        if (!Money.isEntered(c.mortgageBalance)) return Money.incomplete('No mortgage entered.', ['debts']);
        return over(c.mortgageBalance, c.realEstate || null, { denominatorName: 'otherAssets' });
      } },

    { id: 'homeEquityRatio', label: 'Home equity ratio', tier: 19,
      formula: '(property value − mortgage) ÷ property value',
      unit: 'rate', needs: 'a property value',
      compute: function (c) {
        if (!c.realEstate) return Money.incomplete('Add a property in Net Worth to see this.', ['otherAssets']);
        var mortgage = Money.isEntered(c.mortgageBalance) ? c.mortgageBalance : 0;
        return over(c.realEstate - mortgage, c.realEstate, { denominatorName: 'otherAssets' });
      } },

    { id: 'debtPayoffVelocity', label: 'Debt payoff velocity', tier: 19,
      formula: 'a year of payments ÷ total debt',
      unit: 'rate', needs: 'your debts',
      note: 'How much of the balance a year of minimums clears — before interest, so the real figure is lower.',
      compute: function (c) {
        var yearOfPayments = Money.isEntered(c.monthlyDebtPayments) ? c.monthlyDebtPayments * MONTHS : null;
        return over(yearOfPayments, c.totalDebt, {
          denominatorName: 'totalDebt',
          zeroReason: 'With no debt there is nothing to pay off.'
        });
      } },

    { id: 'burnRateCents', label: 'Burn rate', tier: 19,
      formula: 'what leaves each month',
      unit: 'cents', needs: 'your monthly expenses',
      compute: function (c) {
        if (!Money.isEntered(c.monthlyExpenses)) return Money.incomplete('Add your monthly expenses to see this.', ['monthlyExpenses']);
        return Money.ok(c.monthlyExpenses);
      } },

    { id: 'runwayMonths', label: 'Runway', tier: 19,
      formula: 'cash ÷ burn rate',
      unit: 'months', needs: 'your cash and your monthly expenses',
      note: 'The same arithmetic as emergency fund coverage, named the way people ask for it.',
      compute: function (c) { return Tier0.emergencyFundMonths(c.household); } },

    { id: 'liquidToIlliquid', label: 'Liquid to illiquid', tier: 19,
      formula: 'liquid assets ÷ everything else you own',
      unit: 'multiple', needs: 'your assets',
      compute: function (c) {
        if (!Money.isEntered(c.liquidAssets) || !Money.isEntered(c.totalAssets)) {
          return Money.incomplete('Add your assets to see this.', ['assets']);
        }
        return over(c.liquidAssets, c.totalAssets - c.liquidAssets, {
          denominatorName: 'assets',
          zeroReason: 'Everything you own is liquid, so there is nothing to compare against.'
        });
      } },

    { id: 'cashDrag', label: 'Cash drag', tier: 19,
      formula: 'cash ÷ total assets',
      unit: 'rate', needs: 'your cash and your assets',
      note: 'Whether this is too high depends entirely on why the cash is there — see Sleep At Night.',
      compute: function (c) { return over(c.cash, c.totalAssets, { denominatorName: 'totalAssets' }); } },

    { id: 'revolvingShare', label: 'Revolving to installment debt', tier: 19,
      formula: 'card balances ÷ total debt',
      unit: 'rate', needs: 'your itemised debts',
      compute: function (c) {
        if (!Money.isEntered(c.totalDebt)) return Money.incomplete('Add your debts to see this.', ['debts']);
        var revolving = Money.isEntered(c.revolvingBalance) ? c.revolvingBalance : 0;
        return over(revolving, c.totalDebt, {
          denominatorName: 'totalDebt',
          zeroReason: 'With no debt there is nothing to split.'
        });
      } },

    { id: 'needsToWants', label: 'Needs to wants', tier: 19,
      formula: 'essential spending ÷ discretionary spending',
      unit: 'multiple', needs: 'a categorised month',
      compute: function (c) {
        if (!c.spend) return Money.incomplete('Categorise a month in Cash Flow to see this.', ['expenseEntries']);
        return over(c.needsMonthly, c.wantsMonthly, {
          denominatorName: 'wants',
          zeroReason: 'Nothing is categorised as discretionary, so there is no split to report.'
        });
      } },

    { id: 'discretionaryIncomeRatio', label: 'Discretionary income ratio', tier: 19,
      formula: 'discretionary spending ÷ gross monthly income',
      unit: 'rate', needs: 'a categorised month and your income',
      compute: function (c) {
        if (!c.spend) return Money.incomplete('Categorise a month in Cash Flow to see this.', ['expenseEntries']);
        return over(c.wantsMonthly, c.monthlyGross, { denominatorName: 'grossAnnualIncome' });
      } },

    { id: 'realEstateConcentration', label: 'Real estate concentration', tier: 19,
      formula: 'property value ÷ total assets',
      unit: 'rate', needs: 'a property and your other assets',
      compute: function (c) {
        if (!c.realEstate) return Money.incomplete('Add a property on The Statement to see this.', ['otherAssets']);
        return over(c.realEstate, c.totalAssets, { denominatorName: 'totalAssets' });
      } },

    /* --- BRIEF §4.3 — the numbers T3 unlocked (D-081) --------------------- */
    { id: 'incomeConcentration', label: 'Income concentration', tier: 21,
      formula: 'largest income source ÷ household income',
      unit: 'rate', needs: 'your income sources',
      note: '100% means one paycheque. No convention says where it should sit; two incomes at 60/40 read 60%.',
      compute: function (c) {
        if (!Statement) return unavailable('The Statement engine is not loaded.', ['statement']);
        return Statement.incomeConcentration(c.household);
      } },

    { id: 'confidenceWeightedNetWorth', label: 'Confidence-weighted net worth', tier: 21,
      formula: 'Σ asset × confidence weight − debts',
      unit: 'dollars', needs: 'at least one asset rated for confidence on The Statement',
      note: 'Unrated assets are left out, not assumed guaranteed. Weights are a convention (data/confidence_weights.json).',
      compute: function (c) {
        if (!Statement) return unavailable('The Statement engine is not loaded.', ['statement']);
        if (!c.tables.confidenceWeights) return Money.incomplete('The confidence weights are not loaded.', ['confidenceWeights']);
        return Statement.confidenceWeightedNetWorth(c.household, c.tables.confidenceWeights);
      } },

    { id: 'liquidityLadder', label: 'Reachable within a year', tier: 21,
      formula: 'assets reachable within a year ÷ all assets',
      unit: 'rate', needs: 'your assets, rated on The Statement or at their default liquidity',
      note: 'The four rungs — today, a month, a year, not without a penalty — come back with the figure.',
      compute: function (c) {
        if (!Statement) return unavailable('The Statement engine is not loaded.', ['statement']);
        var l = Statement.liquidityLadder(c.household, c.tables.accessRules);
        if (!Money.isOk(l)) return l;
        var total = l.bands.today + l.bands.thisMonth + l.bands.thisYear + l.bands.never;
        var r = over(l.cumulative.thisYear, total, { denominatorName: 'assets' });
        if (Money.isOk(r)) { r.bands = l.bands; r.cumulative = l.cumulative; r.gatedCents = l.gatedCents; }
        return r;
      } },

    { id: 'shadowRunway', label: 'Shadow runway', tier: 21,
      formula: '(cash + Roth contributions + home equity × haircut) ÷ monthly expenses',
      unit: 'months', needs: 'your cash and monthly expenses; Roth basis and a home make it longer',
      note: 'Runway if you were willing to raid the Roth and sell the house. The haircut is an assumption (80%).',
      compute: function (c) {
        if (!Money.isEntered(c.cash)) return Money.incomplete('Add your cash to see this.', ['cashSavings']);
        var haircut = c.assumptions.homeEquityHaircut;
        var pool = c.cash + c.rothBasis + Math.round(c.homeEquity * haircut);
        var r = over(pool, c.monthlyExpenses, { denominatorName: 'monthlyExpenses' });
        if (Money.isOk(r)) { r.poolCents = pool; r.rothBasisCents = c.rothBasis; r.homeEquityCents = c.homeEquity; r.haircut = haircut; }
        return r;
      } },

    { id: 'worstPlausibleYearCoverage', label: 'Worst-year coverage', tier: 21,
      formula: 'cash ÷ the worst plausible year, net of the unemployment benefit',
      unit: 'multiple', needs: 'cash, your deductible, monthly essentials and your state',
      note: '1× means the cash would carry you through everything going wrong at once. Replaces "3–6 months" once the inputs exist.',
      compute: function (c) {
        if (!Statement) return unavailable('The Statement engine is not loaded.', ['statement']);
        var w = Statement.worstPlausibleYear(c.household, c.tables);
        if (!Money.isOk(w)) return w;
        var r = over(w.cashCents, w.netCents, { denominatorName: 'worstYear', zeroReason: 'Nothing to cover: the worst year nets to zero.' });
        if (Money.isOk(r)) { r.worstYearNetCents = w.netCents; r.shortCents = w.value; }
        return r;
      } },

    { id: 'automationRatio', label: 'Automation ratio', tier: 21,
      formula: 'automated savings ÷ all savings',
      unit: 'rate', needs: 'which contributions are automated — asked by the Skill Stacker',
      note: 'The Skill Stacker asks which active skills run without you; the ratio is their annual value over every active skill\'s. D-090.',
      compute: function (c) {
        var Skills = skillsEngine();
        if (!Skills) return unavailable('The skills engine is not loaded.', ['skills']);
        var r = Skills.automationRatio(c.household, c.tables);
        return Money.isOk(r) ? r : unavailable(r.reason, r.missing);
      } },

    { id: 'givingRate', label: 'Giving rate', tier: 21,
      formula: 'gifts ÷ take-home pay, monthly',
      unit: 'rate', needs: 'a categorised month and your take-home pay',
      note: 'The tithe is a religious convention, not a financial one, so there is no band.',
      compute: function (c) {
        if (!c.spend) return Money.incomplete('Categorise a month in Cash Flow to see this.', ['expenseEntries']);
        return over(c.giftsMonthly, c.takeHomeMonthly, { denominatorName: 'takeHome' });
      } },

    { id: 'netWorthInYears', label: 'Net worth in years', tier: 21,
      formula: 'net worth ÷ a year of spending',
      unit: 'years', needs: 'your net worth and monthly expenses',
      note: 'How long what you own would last at what you spend, before growth.',
      compute: function (c) {
        if (!Benchmarks) return unavailable('The benchmarks engine is not loaded.', ['benchmarks']);
        return Benchmarks.netWorthInYears(c.household);
      } },

    { id: 'humanToFinancialCapital', label: 'Human to financial capital', tier: 21,
      formula: 'present value of pay to the stop age ÷ (cash + investments)',
      unit: 'multiple', needs: 'your income, age, stop age (FIRE Number) and financial assets',
      note: 'High early in a career, falling toward zero as pay is converted into assets. No convention.',
      compute: function (c) {
        if (!Benchmarks) return unavailable('The benchmarks engine is not loaded.', ['benchmarks']);
        var hc = Benchmarks.humanCapital(c.household, c.tables);
        if (!Money.isOk(hc)) return hc;
        var fin = (Money.isEntered(c.cash) ? c.cash : 0) + (Money.isEntered(c.investments) ? c.investments : 0);
        if (!Money.isEntered(c.cash) && !Money.isEntered(c.investments)) return Money.incomplete('Add your cash and investments.', ['cashSavings', 'investments']);
        var r = over(hc.value, fin, { denominatorName: 'financialCapital', zeroReason: 'With no financial capital yet the ratio has no floor.' });
        if (Money.isOk(r)) { r.humanCapitalCents = hc.value; r.financialCapitalCents = fin; }
        return r;
      } },

    { id: 'bracketRoom', label: 'Room in your bracket', tier: 21,
      formula: 'top of the current federal bracket − taxable income',
      unit: 'dollars', needs: 'your income and filing status',
      note: 'How much more you could earn or convert before the next dollar is taxed higher. Federal only, unverified table.',
      compute: function (c) {
        if (!Reference || !c.tables.federalBrackets) return Money.incomplete('The federal bracket table is not loaded.', ['federalBrackets']);
        if (!Money.isEntered(c.grossAnnual)) return Money.incomplete('Add your income to find the bracket.', ['grossAnnualIncome']);
        var b = Reference.marginalBracket(c.tables.federalBrackets, c.grossAnnual / 100, c.household.filingStatus);
        if (!Money.isOk(b)) return b;
        if (b.roomBeforeNextBracketDollars === null) return Money.incomplete('You are in the top bracket; there is no next one.', []);
        return Money.ok(Math.round(b.roomBeforeNextBracketDollars * 100), { marginalRate: b.value, nextRate: b.nextRate });
      } },

    { id: 'bridgeGapYears', label: 'Bridge to 59½', tier: 21,
      formula: '59½ − the age FI arrives at the current pace',
      unit: 'years', needs: 'your date of birth, spending, investments and savings rate',
      note: 'Years between stopping and the retirement accounts opening. Zero if FI lands after 59½.',
      compute: function (c) {
        if (!Statement) return unavailable('The Statement engine is not loaded.', ['statement']);
        var b = Statement.bridgeGap(c.household, c.tables);
        if (!Money.isOk(b)) return b;
        return Money.ok(b.gapYears, { fiAge: b.fiAge, shortCents: b.value, coveredYears: b.coveredYears });
      } },

    { id: 'lifestyleInflation', label: 'Lifestyle inflation', tier: 21,
      formula: 'rise in yearly spending ÷ rise in income, since a snapshot a year ago',
      unit: 'rate', needs: 'a snapshot at least eleven months old, with income and expenses in it',
      note: 'Below 50% means most of a raise was kept. Needs time to exist before it can say anything.',
      compute: function (c) {
        var then = aYearAgo(c);
        if (!then) return needsAYear(c);
        var incThen = stored(then.snap.fields, 'grossAnnualIncome'), expThen = stored(then.snap.fields, 'monthlyExpenses');
        if (!Money.isEntered(incThen) || !Money.isEntered(expThen)) return Money.incomplete('That snapshot did not hold both income and expenses.', ['snapshots']);
        if (!Money.isEntered(c.grossAnnual) || !Money.isEntered(c.monthlyExpenses)) return Money.incomplete('Add your income and expenses now to compare.', ['grossAnnualIncome', 'monthlyExpenses']);
        var dInc = c.grossAnnual - incThen, dExp = (c.monthlyExpenses - expThen) * MONTHS;
        if (dInc <= 0) return Money.incomplete('Income has not risen since then, so there is no raise to measure against.', []);
        return Money.ok(dExp / dInc, { since: then.snap.timestamp, incomeThenCents: incThen, expensesThenMonthlyCents: expThen, raiseCents: dInc, extraSpendCents: dExp });
      } },

    { id: 'netWorthGrowthRate', label: 'Net worth growth', tier: 21,
      formula: '(net worth now − then) ÷ |then|, per year, since a snapshot a year ago',
      unit: 'rate', needs: 'a snapshot at least eleven months old',
      note: 'Annualised over the actual gap. Undefined from a net worth of exactly zero.',
      compute: function (c) {
        var then = aYearAgo(c);
        if (!then) return needsAYear(c);
        var nwThen = stored(then.snap.fields, 'netWorth');
        if (nwThen === null) nwThen = stored(then.snap.computedOutputs, 'netWorth');
        if (!Money.isEntered(nwThen)) return Money.incomplete('That snapshot did not hold a net worth.', ['snapshots']);
        if (!Money.isEntered(c.netWorth)) return Money.incomplete('Add your assets and debts now to compare.', ['netWorth']);
        if (nwThen === 0) return Money.incomplete('Growth from exactly zero is undefined.', []);
        var years = (c.now - then.t) / MS_PER_DAY / DAYS_PER_YEAR;
        return Money.ok((c.netWorth - nwThen) / Math.abs(nwThen) / years, { since: then.snap.timestamp, thenCents: nwThen, nowCents: c.netWorth, years: Math.round(years * 100) / 100 });
      } },

    { id: 'fiDate', label: 'FI date', tier: 21,
      formula: 'today + years to FI at the current pace',
      unit: 'date', needs: 'your spending, investments and savings rate',
      note: 'The same projection as the FI year on the dashboard, to the month.',
      compute: function (c) {
        var y = Tier0.yearsToFire(c.household, c.tables);
        if (!Money.isOk(y)) return y;
        var d = new Date(c.now + y.value * DAYS_PER_YEAR * MS_PER_DAY);
        return Money.ok(d.getUTCFullYear() + d.getUTCMonth() / MONTHS, { iso: d.toISOString().slice(0, 10), years: y.value, alreadyThere: y.alreadyThere === true });
      } }
  ];

  function byId(id) {
    for (var i = 0; i < RATIOS.length; i++) { if (RATIOS[i].id === id) return RATIOS[i]; }
    return null;
  }

  /* ---- Verdicts ----------------------------------------------------------
     A band says which way is healthier and where the edges are. Missing band
     means no convention worth quoting — the ratio still computes, it just
     gets no colour.                                                       */
  function verdict(id, value, table) {
    var band = table && table.bands ? table.bands[id] : null;
    if (!band || !Money.isEntered(value)) return { zone: 'none', band: band || null };
    if (band.good === null || band.warn === null) return { zone: 'none', band: band };
    var good, warn;
    if (band.direction === 'lower') {
      good = value <= band.good; warn = value <= band.warn;
    } else {
      good = value >= band.good; warn = value >= band.warn;
    }
    return { zone: good ? 'good' : warn ? 'watch' : 'out', band: band };
  }

  /* ---- Plotting a ratio on a common axis ---------------------------------
     The radar chart needs every ratio on one scale, and they arrive in
     rates, months and multiples pointing in opposite directions. This maps
     each onto a health position where:

         1.00  exactly at the comfortable edge (`good`)
         0.50  exactly at the far edge (`warn`)
         0.00  far outside it
         1.25  capped ceiling for comfortably past `good`

     It is a VIEW, not a score. Nothing sums these axes into one number:
     that would be the Financial Health Score, whose weighting SPEC.md §12.4
     still marks [PENDING], and picking weights here to make a picture would
     be deciding it by accident. Each spoke stands alone.                 */

  var RADAR_CEILING = 1.25;

  function position(value, band) {
    if (!band || !Money.isEntered(value) || band.good === null || band.warn === null) return null;
    var good = band.good, warn = band.warn;
    var beyond, span;
    if (band.direction === 'lower') {
      if (value <= good) {
        beyond = good === 0 ? 0 : (good - value) / good;
        return Math.min(RADAR_CEILING, 1 + beyond * 0.25);
      }
      if (value <= warn) {
        span = warn - good;
        return span === 0 ? 0.5 : 0.5 + 0.5 * ((warn - value) / span);
      }
      return value === 0 ? 0 : Math.max(0, 0.5 * (warn / value));
    }
    if (value >= good) {
      beyond = good === 0 ? 0 : (value - good) / good;
      return Math.min(RADAR_CEILING, 1 + beyond * 0.25);
    }
    if (value >= warn) {
      span = good - warn;
      return span === 0 ? 0.5 : 0.5 + 0.5 * ((value - warn) / span);
    }
    return warn === 0 ? 0 : Math.max(0, 0.5 * (value / warn));
  }

  /**
   * The spokes for the radar: every ratio that computed AND has a band.
   * Anything without a band is left off rather than given an invented axis.
   */
  function radar(household, tables, opts) {
    var a = all(household, tables, opts);
    var points = a.rows.filter(function (r) {
      return r.ok && r.verdict.band && r.verdict.band.good !== null;
    }).map(function (r) {
      return {
        id: r.id, label: r.label, unit: r.unit, value: r.value,
        zone: r.verdict.zone, band: r.verdict.band,
        position: position(r.value, r.verdict.band)
      };
    }).filter(function (p) { return p.position !== null; });

    if (points.length < 3) {
      return Money.incomplete(
        'A radar needs at least three axes to be a shape. ' + points.length
          + ' of the banded ratios can be worked out so far.', ['ratios']);
    }
    return Money.ok(points.length, {
      points: points,
      ceiling: RADAR_CEILING,
      /* Where the comfortable edge sits on every axis, by construction. */
      goodRing: 1,
      warnRing: 0.5
    });
  }

  /**
   * Every ratio, computed. `value` is the count that came back with a real
   * number, so a room can say "14 of 30" rather than showing thirty dashes
   * and no explanation.
   */
  function all(household, tables, opts) {
    var c = context(household, tables, opts);
    var bands = tables && tables.ratioBenchmarks;
    var rows = RATIOS.map(function (r) {
      var result = r.compute(c);
      var v = Money.isOk(result) ? result.value : null;
      return {
        id: r.id, label: r.label, tier: r.tier, formula: r.formula,
        unit: r.unit, note: r.note || null, needs: r.needs,
        result: result,
        value: v,
        ok: Money.isOk(result),
        unavailable: result.unavailable === true,
        verdict: verdict(r.id, v, bands)
      };
    });
    return Money.ok(rows.filter(function (r) { return r.ok; }).length, {
      rows: rows,
      total: rows.length,
      unavailableCount: rows.filter(function (r) { return r.unavailable; }).length,
      referenceVersion: bands ? bands.version : null
    });
  }

  /** The subset that has a band, for the radar chart — SPEC.md §13 Tier 20. */
  function scored(household, tables, opts) {
    var a = all(household, tables, opts);
    return Money.ok(a.value, {
      rows: a.rows.filter(function (r) { return r.ok && r.verdict.zone !== 'none'; }),
      total: a.total
    });
  }

  return {
    RATIOS: RATIOS,
    MONTHS: MONTHS,
    byId: byId,
    context: context,
    verdict: verdict,
    RADAR_CEILING: RADAR_CEILING,
    position: position,
    radar: radar,
    all: all,
    scored: scored
  };
});
