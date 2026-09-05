/* ==========================================================================
   engines/events.js — one life event, three ways. BRIEF §6.1, D-086.
   --------------------------------------------------------------------------
     Events.answers(template, given, env)        every question answered:
                                                 what was given, else the
                                                 template's default (which
                                                 may be an expression)
     Events.run(h, template, answers, opts)      one scenario, month by month
     Events.runAll(h, template, answers, opts)   { dream, default, disaster }
     Events.baseline(h, opts)                    run() on the empty template
     Events.evaluate(expr, env)                  the tiny expression language
                                                 templates are written in

   A template is DATA (data/events/*.json): questions, and a diff — dated
   overlays on income and expenses, one-time costs, asset moves — written
   as expressions over the answers ("@months"), the household ("$cashCents")
   and the reference tables ({"table": "travelBands", "path": [...]}). The
   engine applies the diff, then the Triple D bundle (data/triple_d.json):
   which return percentile, what income does after the event, how long the
   gap after it runs, and whether the worst plausible year lands on top.

   Compounding is engines/projection.js's, one month at a time; the loop
   here is the calendar, not the maths. Money is integer cents; anything the
   household cannot supply comes back as a Result that says what is missing.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js'),
      Projection: require('./projection.js'),
      Statement: require('./statement.js'),
      Rerank: require('./rerank.js'),
      CashFlow: require('./cashflow.js'),
      Hourly: require('./hourly.js'),
      SelfEmployed: require('./selfemployed.js'),
      Tax: require('./tax.js'),
      Debt: require('./debt.js'),
      QuickMath: require('./quickmath.js'),
      VPW: require('./vpw.js'),
      SocialSecurity: require('./ss.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0,
      Projection: root.SLAF && root.SLAF.Projection,
      Statement: root.SLAF && root.SLAF.Statement,
      Rerank: root.SLAF && root.SLAF.Rerank,
      CashFlow: root.SLAF && root.SLAF.CashFlow,
      Hourly: root.SLAF && root.SLAF.Hourly,
      SelfEmployed: root.SLAF && root.SLAF.SelfEmployed,
      Tax: root.SLAF && root.SLAF.Tax,
      Debt: root.SLAF && root.SLAF.Debt,
      QuickMath: root.SLAF && root.SLAF.QuickMath,
      VPW: root.SLAF && root.SLAF.VPW,
      SocialSecurity: root.SLAF && root.SLAF.SocialSecurity
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Projection, deps.Statement, deps.Rerank, deps.CashFlow, deps.Hourly, deps.SelfEmployed, deps.Tax, deps.Debt, deps.QuickMath, deps.VPW, deps.SocialSecurity);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Events = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Projection, Statement, Rerank, CashFlow, Hourly, SelfEmployed, Tax, Debt, QuickMath, VPW, SocialSecurity) {
  'use strict';

  var MONTHS = 12;
  var DEFAULT_HORIZON = 120;
  var RUNWAY_FLOOR_MONTHS = 3;

  var EMPTY = {
    id: 'baseline', title: 'Nothing changes', questions: [],
    diff: { income: [], expenses: [], oneTime: [], assets: [] },
    protect: [], cut: [], tripleD: {}, outputs: [], horizonMonths: DEFAULT_HORIZON, gapMonths: 0
  };

  function val(r) { return Money.isOk(r) ? r.value : null; }
  function num(v) { return Money.isEntered(v) ? v : null; }

  /* ---- 1. The expression language ------------------------------------------
     number                       itself
     "@id"                        an answer
     "$name"                      a household figure from the context
     {"*": [..]} {"+": [..]}      arithmetic; {"-": [a, b]} {"/": [a, b]}
     {"max": [..]} {"min": [..]} {"round": x} {"neg": x}
     {"if": [cond, a, b]}         cond: {"eq"|"ne"|"gt"|"lt"|"gte"|"lte": [a, b]}
     {"table": "name", "path": [k, "@id", ...]}   a reference-table lookup
     {"cents": x}                 dollars to cents
     A null anywhere makes the result null: "not enough to say". */
  function evaluate(x, env) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (typeof x === 'boolean') return x;
    if (typeof x === 'string') {
      if (x.charAt(0) === '@') { var a = env.answers[x.slice(1)]; return a === undefined ? null : a; }
      if (x.charAt(0) === '$') { var c = env.ctx[x.slice(1)]; return c === undefined ? null : c; }
      if (x.charAt(0) === '^') { var l = env.lines && env.lines[x.slice(1)]; return l === undefined ? null : l; }
      return x;
    }
    if (Array.isArray(x)) return x.map(function (y) { return evaluate(y, env); });
    var op = Object.keys(x)[0];
    var args = x[op];
    function all(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) { var v = evaluate(list[i], env); if (v === null) return null; out.push(v); }
      return out;
    }
    var v;
    switch (op) {
      case '*': v = all(args); return v && v.reduce(function (t, n) { return t * n; }, 1);
      case '+': v = all(args); return v && v.reduce(function (t, n) { return t + n; }, 0);
      case '-': v = all(args); return v && (v.length === 1 ? -v[0] : v[0] - v[1]);
      case '/': v = all(args); return v && (v[1] === 0 ? null : v[0] / v[1]);
      case 'max': v = all(args); return v && Math.max.apply(null, v);
      case 'min': v = all(args); return v && Math.min.apply(null, v);
      case 'round': v = evaluate(args, env); return v === null ? null : Math.round(v);
      case 'neg': v = evaluate(args, env); return v === null ? null : -v;
      case 'cents': v = evaluate(args, env); return v === null ? null : Math.round(v * 100);
      case 'eq': v = all(args); return v && v[0] === v[1];
      case 'ne': v = all(args); return v && v[0] !== v[1];
      case 'gt': v = all(args); return v && v[0] > v[1];
      case 'lt': v = all(args); return v && v[0] < v[1];
      case 'gte': v = all(args); return v && v[0] >= v[1];
      case 'lte': v = all(args); return v && v[0] <= v[1];
      case 'if': var cond = evaluate(args[0], env); if (cond === null) return null; return evaluate(cond ? args[1] : args[2], env);
      case 'coalesce': { for (var ci = 0; ci < args.length; ci++) { var cv = evaluate(args[ci], env); if (cv !== null) return cv; } return null; }
      case 'fn': return callFn(x.fn, x.args || {}, env);
      case 'table': {
        var table = env.tables && env.tables[x.table];
        if (!table) return null;
        var node = table;
        var path = x.path || [];
        for (var i = 0; i < path.length; i++) {
          var key = evaluate(path[i], env);
          if (key === null || node === null || node === undefined || typeof node !== 'object') return null;
          node = node[key];
        }
        return node === undefined ? null : node;
      }
      default: return null;
    }
  }

  /* ---- 1b. Named engine calls --------------------------------------------------
     A template may ask an engine that already exists for a figure it would
     otherwise have to re-derive. Each call builds a household with the
     stated figures swapped in and hands it to the real function, so the
     formula stays where it lives. Anything not on this list is null. */
  function withIncome(household, grossAnnualCents, work) {
    var h = JSON.parse(JSON.stringify(household));
    var person = Schema.primaryPerson(h);
    if (!person) return null;
    if (Money.isEntered(grossAnnualCents)) {
      person.incomeSources = [Schema.createIncomeSource({ personId: person.id, grossAnnualIncomeCents: Math.round(grossAnnualCents) })];
      h.people.forEach(function (p) { if (p.id !== person.id) p.incomeSources = []; });
    }
    if (work) person.work = Object.assign({}, Schema.workProfile(person), work);
    return h;
  }
  function callFn(name, rawArgs, env) {
    var args = {};
    var missing = false;
    Object.keys(rawArgs).forEach(function (k) { var v = evaluate(rawArgs[k], env); if (v === null) missing = true; args[k] = v; });
    if (missing) return null;
    var h = env.household, t = env.tables;
    switch (name) {
      case 'takeHomeMonthly': {
        var clone = withIncome(h, args.grossAnnualCents);
        if (!clone) return null;
        if (args.filingStatus) clone.filingStatus = args.filingStatus;
        return val(Tier0.takeHomeMonthlyCents(clone, t));
      }
      case 'growTo': {
        /* A balance with a yearly contribution, grown for some years at a
           rate — the one projection loop. */
        return val(Projection.futureValueCents({ startCents: args.startCents, annualRate: args.annualRate, years: Math.max(0, Math.round(args.years)), annualContributionCents: args.annualContributionCents || 0 }));
      }
      case 'ssMonthly': {
        if (!SocialSecurity) return null;
        return val(SocialSecurity.estimate(h, t, { retireAge: args.retireAge, claimAge: args.claimAge, grossAnnualCents: args.grossAnnualCents }));
      }
      case 'acaPremiumMonthly': {
        /* A marketplace premium for the bridge years: the applicable share
           of income, capped at the unsubsidised silver benchmark. */
        if (!Tax || !t.aca || !t.cobraAca) return null;
        var cliff = Tax.acaCliff(t.aca, args.magiCents, Schema.adults(h).length || 1);
        if (!Money.isOk(cliff)) return null;
        var full = t.cobraAca.monthly.acaSilver40Cents * (Money.isEntered(args.ageFactor) ? args.ageFactor : 1);
        if (cliff.overCliff) return Math.round(full);
        var pct = Money.isEntered(cliff.applicablePercentage) ? cliff.applicablePercentage : null;
        if (pct === null) return Math.round(full);
        return Math.round(Math.min(full, args.magiCents * pct / 12));
      }
      case 'vpwPlan': case 'vpwFirstYear': case 'vpwDieWith': case 'vpwPeakAge': case 'vpwFirstShortAge': {
        if (!VPW || !t.vpwTable) return null;
        var ss = args.ssMonthlyCents || 0, claimAge = args.claimAge || 67;
        var p = VPW.plan({ table: t.vpwTable, portfolioCents: args.portfolioCents, retireAge: args.retireAge, planAge: args.planAge,
          stockShare: args.stockShare, realReturn: args.realReturn, annualSpendCents: args.annualSpendCents,
          otherIncomeCents: function (age) { return age >= claimAge ? ss * 12 : 0; } });
        if (!Money.isOk(p)) return null;
        if (name === 'vpwPlan') return p.success ? 1 : 0;
        if (name === 'vpwFirstYear') return p.firstWithdrawalCents;
        if (name === 'vpwDieWith') return p.dieWithCents;
        if (name === 'vpwPeakAge') return p.peakAge;
        return p.firstShortAge;
      }
      case 'realHourly': {
        if (!Hourly) return null;
        var work = {};
        if (Money.isEntered(args.hoursPerWeek)) work.contractedHoursPerWeek = args.hoursPerWeek;
        if (Money.isEntered(args.commuteHoursPerWeek)) work.commuteHoursPerWeek = args.commuteHoursPerWeek;
        if (Money.isEntered(args.workCostsMonthlyCents)) work.workCostsMonthlyCents = args.workCostsMonthlyCents;
        var hh = withIncome(h, args.grossAnnualCents, work);
        return hh ? val(Hourly.realHourlyWage(hh, t)) : null;
      }
      case 'levelPayment':
        return val(Projection.levelPaymentCents({ principalCents: args.principalCents, annualRate: args.annualRate, months: args.months }));
      case 'seTax':
        return SelfEmployed && t.seTax ? val(SelfEmployed.selfEmploymentTax(args.netProfitCents, h.filingStatus, t.seTax)) : null;
      case 'debtFreeMonths': {
        if (!Debt || !t.debtRules) return null;
        var sim = Debt.simulate(h, t.debtRules, { strategyId: args.strategyId || 'avalanche', extraMonthlyCents: args.extraMonthlyCents || 0 });
        return Money.isOk(sim) ? sim.months : null;
      }
      case 'debtInterest': {
        if (!Debt || !t.debtRules) return null;
        var sim2 = Debt.simulate(h, t.debtRules, { strategyId: args.strategyId || 'avalanche', extraMonthlyCents: args.extraMonthlyCents || 0 });
        return Money.isOk(sim2) ? sim2.totalInterestCents : null;
      }
      case 'costPerUse':
        return QuickMath ? val(QuickMath.costPerUse({ priceCents: args.priceCents, uses: args.uses })) : null;
      case 'stateTaxAnnual': {
        /* The state schedule (engines/tax.js) on this household's taxable
           income, with the state swapped. */
        if (!Tax || !t.stateBrackets || !t.federalBrackets) return null;
        var sh = withIncome(h, args.grossAnnualCents);
        if (!sh) return null;
        sh.state = args.state;
        var est = Tax.estimate(sh, t);
        return Money.isOk(est) && est.stateIncluded ? est.stateCents : null;
      }
      default: return null;
    }
  }

  /* ---- 2. The household as a context ----------------------------------------- */

  function context(household, tables) {
    var gross = Schema.grossAnnualIncomeCents(household);
    var take = Tier0.takeHomeMonthlyCents(household, tables);
    var expenses = Schema.monthlyExpensesCents(household);
    var ret = household.retirement || {};
    var contribution = Money.isOk(gross) && Money.isEntered(ret.contributionPercent)
      ? Math.round(gross.value * ret.contributionPercent / 100 / MONTHS) : 0;
    /* The match actually captured: matchPercent × min(contribution, cap) ×
       gross, per source. With no contribution entered nothing is captured
       and the run says so rather than assuming the cap. */
    var matchYear = 0, matchKnown = false;
    if (Money.isEntered(ret.contributionPercent)) {
      Schema.allIncomeSources(household).forEach(function (src) {
        var em = src.employerMatch || {};
        if (!Money.isEntered(src.grossAnnualIncomeCents) || !Money.isEntered(em.matchPercent) || !Money.isEntered(em.matchCapPercentOfSalary)) return;
        matchYear += Math.round(src.grossAnnualIncomeCents * Math.min(ret.contributionPercent / 100, em.matchCapPercentOfSalary) * em.matchPercent);
        matchKnown = true;
      });
    }
    var other = Schema.otherAssetsCents(household);
    var fire = Tier0.fireNumber(household);
    var cut = 0, cutTop = 0, cutCount = 0;
    if (Rerank && tables && tables.expenseCategories) {
      var r = Rerank.analyse(household, tables);
      if (Money.isOk(r)) {
        cut = r.flaggedMonthlyCents;
        cutCount = r.cut.length;
        /* The four dearest cut lines that are not needs: what a sprint
           actually takes to zero. */
        cutTop = r.cut.filter(function (row) { return !row.need; }).sort(function (a, b) { return b.monthlyCents - a.monthlyCents; })
          .slice(0, 4).reduce(function (tot, row) { return tot + row.monthlyCents; }, 0);
      }
    }
    var swan = household.swan && Money.isEntered(household.swan.targetCents) ? household.swan.targetCents : null;
    /* Whose income is whose, for events that take one earner out. */
    var primary = Schema.primaryPerson(household);
    var primaryGross = 0, allGross = 0;
    Schema.allIncomeSources(household).forEach(function (src) {
      if (!Money.isEntered(src.grossAnnualIncomeCents)) return;
      allGross += src.grossAnnualIncomeCents;
      if (primary && src.personId === primary.id) primaryGross += src.grossAnnualIncomeCents;
    });
    var work = primary ? Schema.workProfile(primary) : {};
    var ins = household.insurance || {};
    /* A tracked month, by category, for events that scale one line. */
    var byCategory = null;
    if (CashFlow && tables && tables.expenseCategories) {
      var sum = CashFlow.summarise(household, tables.expenseCategories);
      if (Money.isOk(sum)) { byCategory = {}; sum.categories.forEach(function (row) { byCategory[row.categoryId] = row.monthlyCents; }); }
    }
    var expensesVal = val(Schema.monthlyExpensesCents(household));
    return {
      housingMonthlyCents: byCategory && Money.isEntered(byCategory.housing) ? byCategory.housing : null,
      retireAge: num((household.targets || {}).retireAge),
      allocationStocks: num((household.allocation || {}).stocks),
      /* The cushion floor: the sleep-at-night number when there is one,
         else three months of spending. */
      efFloorCents: swan !== null ? swan : (Money.isEntered(expensesVal) ? expensesVal * 3 : null),
      primaryIncomeShare: allGross > 0 ? primaryGross / allGross : null,
      partnerIncomeShare: allGross > 0 ? (allGross - primaryGross) / allGross : null,
      hoursPerWeek: num(work.contractedHoursPerWeek),
      commuteHoursPerWeek: num(work.commuteHoursPerWeek),
      workCostsMonthlyCents: num(work.workCostsMonthlyCents),
      termLifeCents: num(ins.termLifeCents),
      oopMaxCents: num(ins.oopMaxCents),
      monthlyDebtPaymentsCents: val(Schema.monthlyDebtPaymentsCents(household)),
      categoryMonthly: byCategory,
      grossAnnualCents: val(gross),
      grossMonthlyCents: Money.isOk(gross) ? Math.round(gross.value / MONTHS) : null,
      takeHomeMonthlyCents: val(take),
      monthlyExpensesCents: val(expenses),
      cashCents: val(Schema.cashCents(household)),
      investmentsCents: val(Schema.investmentsCents(household)),
      otherAssetsCents: Money.isOk(other) ? other.value : 0,
      totalDebtCents: Money.isOk(Schema.totalDebtCents(household)) ? Schema.totalDebtCents(household).value : 0,
      matchMonthlyCents: Math.round(matchYear / MONTHS),
      matchKnown: matchKnown,
      contributionMonthlyCents: contribution,
      fireNumberCents: val(fire),
      rerankCutMonthlyCents: cut,
      rerankCutCount: cutCount,
      rerankCutTopMonthlyCents: cutTop,
      swanFloorCents: swan,
      deductibleCents: num((household.insurance || {}).highestDeductibleCents),
      age: Schema.primaryAge(household),
      state: household.state || null,
      filingStatus: household.filingStatus || null,
      expectedReturnRate: Schema.resolveAssumptions(household).expectedReturnRate
    };
  }

  /* ---- 3. Answers ------------------------------------------------------------- */

  function answers(template, given, env) {
    var out = {};
    var g = given || {};
    (template.questions || []).forEach(function (q) {
      var v = g[q.id];
      if (v === undefined || v === null || v === '') {
        v = evaluate(q.default === undefined ? null : q.default, { answers: out, ctx: env.ctx, tables: env.tables, household: env.household });
      }
      out[q.id] = v;
    });
    return out;
  }

  /* ---- 4. One run -------------------------------------------------------------- */

  function bundleFor(tables, template, d) {
    var base = (tables.tripleD && tables.tripleD.bundles && tables.tripleD.bundles[d]) || tables.tripleD.bundles['default'];
    return Object.assign({ id: d }, base, (template.tripleD && template.tripleD[d]) || {});
  }

  function run(household, template, given, opts) {
    var o = opts || {};
    var tables = o.tables || {};
    var d = o.d || 'default';
    var tpl = template || EMPTY;
    if (!tables.tripleD || !tables.returnBands) return Money.incomplete('The Triple D tables are not loaded.', ['tripleD', 'returnBands']);
    var ctx = context(household, tables);
    var missing = [];
    if (!Money.isEntered(ctx.takeHomeMonthlyCents)) missing.push('grossAnnualIncome');
    if (!Money.isEntered(ctx.monthlyExpensesCents)) missing.push('monthlyExpenses');
    if (!Money.isEntered(ctx.cashCents)) missing.push('cashSavings');
    if (!Money.isEntered(ctx.investmentsCents)) missing.push('investments');
    if (missing.length) return Money.incomplete('Needs your income, spending, cash and investments to run a month.', missing);

    var env = { ctx: ctx, tables: tables, answers: {}, household: household };
    env.answers = answers(tpl, given, env);
    /* Derived figures a template names once and uses many times — written
       into the context under their own names, in order, after the answers. */
    (tpl.derived || []).forEach(function (dv) { env.ctx = ctx = Object.assign({}, ctx); ctx[dv.id] = evaluate(dv.value, env); });
    var bundle = bundleFor(tables, tpl, d);
    var rate = tables.returnBands.percentiles[bundle.returns];
    if (!Money.isEntered(rate)) return Money.incomplete('No return band named ' + bundle.returns + '.', ['returnBands']);

    var H = tpl.horizonMonths || DEFAULT_HORIZON;
    var start = Math.max(0, Math.round(evaluate(tpl.startsOn === undefined ? '@startsOn' : tpl.startsOn, env) || 0));
    var gapAfter = Math.max(0, Math.round(evaluate(tpl.gapAfter === undefined ? 0 : tpl.gapAfter, env) || 0));
    var gapBase = evaluate(tpl.gapMonths === undefined ? 0 : tpl.gapMonths, env) || 0;
    var gap = Math.max(0, Math.round(gapBase * bundle.gapMultiplier));
    var gapStart = start + gapAfter, gapEnd = gapStart + gap;

    function items(kind) {
      return ((tpl.diff && tpl.diff[kind]) || []).map(function (it) {
        var from = start + Math.round(evaluate(it.from === undefined ? 0 : it.from, env) || 0);
        var months = evaluate(it.months === undefined ? null : it.months, env);
        var when = start + Math.round(evaluate(it.when === undefined ? 0 : it.when, env) || 0);
        return {
          label: it.label || kind, categoryId: it.categoryId || null, target: it.target || 'cash', source: it.source || 'cash',
          from: from, to: months === null ? H : from + Math.round(months), when: when,
          multiplier: evaluate(it.multiplier === undefined ? null : it.multiplier, env),
          matchMultiplier: evaluate(it.matchMultiplier === undefined ? null : it.matchMultiplier, env),
          contributionMultiplier: evaluate(it.contributionMultiplier === undefined ? null : it.contributionMultiplier, env),
          addCents: evaluate(it.addCents === undefined ? null : it.addCents, env),
          cents: evaluate(it.cents === undefined ? null : it.cents, env),
          debtCents: evaluate(it.debtCents === undefined ? null : it.debtCents, env),
          debtRate: evaluate(it.debtRate === undefined ? null : it.debtRate, env),
          debtMonths: evaluate(it.debtMonths === undefined ? null : it.debtMonths, env),
          unpriced: (it.multiplier !== undefined && evaluate(it.multiplier, env) === null)
            || (it.addCents !== undefined && evaluate(it.addCents, env) === null)
            || (it.cents !== undefined && evaluate(it.cents, env) === null)
        };
      });
    }
    var incomeItems = items('income'), expenseItems = items('expenses'), oneTimes = items('oneTime'), assetMoves = items('assets');
    /* Extra payments to existing debt: cash out, debt down, month by month. */
    var debtPayments = items('debtPayments');
    var flags = [];
    incomeItems.concat(expenseItems, oneTimes, assetMoves, debtPayments).forEach(function (it) {
      if (it.unpriced) flags.push({ key: 'unpriced', month: null, text: it.label + ' could not be priced from what is entered; it is left out.' });
    });
    expenseItems.forEach(function (it) {
      if (it.categoryId && it.multiplier !== null && !(ctx.categoryMonthly && Money.isEntered(ctx.categoryMonthly[it.categoryId]))) {
        flags.push({ key: 'unpriced', month: null, text: it.label + ' scales a tracked line (' + it.categoryId + ') and there is no tracked month; it is left out.' });
      }
    });

    /* The shock: the worst plausible year lands the month the event starts. */
    var shockCents = 0;
    if (bundle.shock === 'worstPlausibleYear' && Statement) {
      var w = Statement.worstPlausibleYear(household, tables);
      if (Money.isOk(w)) shockCents = w.netCents;
      else flags.push({ key: 'shockUnpriced', month: start, text: 'The disaster column could not add the worst plausible year: ' + w.reason });
    }

    if (!ctx.matchKnown) flags.push({ key: 'matchUnknown', month: null, text: 'No 401(k) contribution entered, so no match is counted either way.' });
    var cash = ctx.cashCents, inv = ctx.investmentsCents, other = ctx.otherAssetsCents, debt = ctx.totalDebtCents;
    /* Loans a template takes on: a balance that amortises at the level
       payment (engines/projection.js) — the payment itself is an expense
       the template adds; here only the balance moves. */
    var loans = [];
    var monthly = [], runwayMin = null, lostMatch = 0, firstNegative = null, lowRunway = null;
    for (var m = 0; m < H; m++) {
      var mult = 1, adds = 0, matchMult = null, contribMult = null;
      incomeItems.forEach(function (it) {
        if (m < it.from || m >= it.to) return;
        if (it.multiplier !== null) mult *= it.multiplier;
        if (it.addCents !== null) adds += it.addCents;
        if (it.matchMultiplier !== null) matchMult = (matchMult === null ? 1 : matchMult) * it.matchMultiplier;
        if (it.contributionMultiplier !== null) contribMult = (contribMult === null ? 1 : contribMult) * it.contributionMultiplier;
      });
      if (m >= gapStart && m < gapEnd) mult = 0;
      if (m >= gapEnd && m >= start) mult *= bundle.incomeAfter;
      var employed = mult > 0;
      /* The plan follows the paycheque unless the template says otherwise. */
      var contribution = employed ? Math.round(ctx.contributionMonthlyCents * (contribMult === null ? mult : contribMult)) : 0;
      var match = employed ? Math.round(ctx.matchMonthlyCents * (matchMult === null ? mult : matchMult)) : 0;
      lostMatch += Math.max(0, ctx.matchMonthlyCents - match);
      var income = Math.round(ctx.takeHomeMonthlyCents * mult) + adds - contribution;

      var exp = ctx.monthlyExpensesCents, expMult = 1, expAdds = 0;
      expenseItems.forEach(function (it) {
        if (m < it.from || m >= it.to) return;
        if (it.multiplier !== null) {
          /* A category multiplier scales that line of a tracked month;
             without a tracked month it scales nothing and was flagged. */
          if (it.categoryId) {
            var base = ctx.categoryMonthly && Money.isEntered(ctx.categoryMonthly[it.categoryId]) ? ctx.categoryMonthly[it.categoryId] : null;
            if (base !== null) expAdds += Math.round(base * (it.multiplier - 1));
          } else expMult *= it.multiplier;
        }
        if (it.addCents !== null) expAdds += it.addCents;
      });
      var expenses = Math.max(0, Math.round(exp * expMult) + expAdds);

      cash += income - expenses;
      oneTimes.forEach(function (it) { if (it.when === m && it.cents !== null) cash -= it.cents; });
      assetMoves.forEach(function (it) {
        if (it.when !== m || it.cents === null) return;
        /* source 'none': the target simply changes — a forfeited match, a
           write-down — with no cash on the other side. */
        if (it.source !== 'none') cash -= it.cents;
        if (it.target === 'investments') inv += it.cents;
        else if (it.target === 'cash') cash += it.cents;      /* money arriving, with no source here */
        else other += it.cents;
        if (it.debtCents !== null && it.debtCents > 0) {
          var pmt = (it.debtRate !== null && it.debtMonths !== null)
            ? val(Projection.levelPaymentCents({ principalCents: it.debtCents, annualRate: it.debtRate, months: it.debtMonths })) : null;
          loans.push({ balance: it.debtCents, rate: it.debtRate || 0, pmt: pmt });
          debt += it.debtCents;
        }
      });
      loans.forEach(function (loan) {
        if (loan.pmt === null || loan.balance <= 0) return;
        var interest = loan.balance * loan.rate / MONTHS;
        var principal = Math.min(loan.balance, loan.pmt - interest);
        loan.balance -= principal; debt -= principal;
      });
      debtPayments.forEach(function (it) {
        if (m < it.from || m >= it.to || it.addCents === null) return;
        var pay = Math.min(it.addCents, Math.max(0, debt));
        cash -= pay; debt -= pay;
      });
      if (m === start && shockCents) cash -= shockCents;

      var grown = Projection.futureValueMonthlyCents({ startCents: inv + contribution + match, monthlyContributionCents: 0, annualRate: rate, months: 1 });
      inv = Money.isOk(grown) ? grown.value : inv + contribution + match;

      var runway = expenses > 0 ? cash / expenses : null;
      if (runway !== null && (runwayMin === null || runway < runwayMin)) runwayMin = runway;
      if (cash < 0 && firstNegative === null) firstNegative = m;
      if (runway !== null && runway < RUNWAY_FLOOR_MONTHS && lowRunway === null && cash >= 0) lowRunway = m;
      monthly.push({ month: m, incomeCents: income, expensesCents: expenses, cashCents: Math.round(cash), investmentsCents: Math.round(inv),
        netWorthCents: Math.round(cash + inv + other - debt), employed: employed, contributionCents: contribution, matchCents: match });
    }
    if (firstNegative !== null) flags.push({ key: 'cashOut', month: firstNegative, text: 'Cash runs out in month ' + (firstNegative + 1) + '.' });
    else if (lowRunway !== null) flags.push({ key: 'lowRunway', month: lowRunway, text: 'Runway drops under ' + RUNWAY_FLOOR_MONTHS + ' months in month ' + (lowRunway + 1) + '.' });
    if (Money.isEntered(ctx.swanFloorCents) && monthly.some(function (r) { return r.cashCents < ctx.swanFloorCents; })) {
      flags.push({ key: 'swan', month: null, text: 'Cash falls below your sleep-at-night number along the way.' });
    }

    /* Named lines: figures the template wants shown beside the columns. */
    env.lines = {};
    /* Run-level figures a line may read: the column's return, and the end
       state the column arrived at. */
    var endRow = monthly[monthly.length - 1];
    env.ctx = ctx = Object.assign({}, ctx, {
      rate: rate, bundleId: d,
      investmentsAtEndCents: endRow.investmentsCents, cashAtEndCents: endRow.cashCents, netWorthAtEndCents: endRow.netWorthCents,
      contributionAnnualAtEndCents: (endRow.contributionCents + endRow.matchCents) * MONTHS,
      horizonYears: H / MONTHS
    });
    var lines = (tpl.lines || []).map(function (ln) {
      var v = evaluate(ln.value, env);
      env.lines[ln.id] = v;
      var warn = ln.warn === undefined ? null : evaluate(ln.warn, env);
      var bad = ln.bad === undefined ? null : evaluate(ln.bad, env);
      return { id: ln.id, label: ln.label, unit: ln.unit || 'dollars', value: v, note: ln.note || null,
        warn: warn === true, bad: bad === true, perColumn: ln.perColumn === true };
    });

    /* FI from the end state: what is invested then, growing at the
       household's own assumption with the end-state contribution. */
    var end = monthly[monthly.length - 1];
    var fiMonths = null;
    if (Money.isEntered(ctx.fireNumberCents)) {
      var y = Projection.yearsToTargetCents({ startCents: end.investmentsCents, targetCents: ctx.fireNumberCents,
        annualRate: ctx.expectedReturnRate, annualContributionCents: (end.contributionCents + end.matchCents) * MONTHS });
      if (Money.isOk(y)) fiMonths = H + Math.round(y.value * MONTHS);
    }

    return Money.ok(end.netWorthCents, {
      d: d, bundle: bundle, template: tpl.id, answers: env.answers, rate: rate,
      startMonth: start, gapMonths: gap, gapStartMonth: gapStart, shockCents: shockCents,
      horizonMonths: H, monthly: monthly,
      netWorthAtEndCents: end.netWorthCents,
      cashAtEndCents: end.cashCents,
      runwayMinMonths: runwayMin === null ? null : Math.round(runwayMin * 10) / 10,
      lostMatchCents: lostMatch,
      lines: lines,
      fiMonthsFromNow: fiMonths,
      flags: flags,
      ctx: ctx
    });
  }

  function baseline(household, opts) {
    return run(household, EMPTY, {}, Object.assign({}, opts, { d: (opts && opts.d) || 'default' }));
  }

  /* ---- 5. All three, against the baseline ---------------------------------- */

  function runAll(household, template, given, opts) {
    var tables = (opts && opts.tables) || {};
    var order = (tables.tripleD && tables.tripleD.order) || ['dream', 'default', 'disaster'];
    var base = baseline(household, { tables: tables, d: 'default' });
    var out = { baseline: base };
    order.forEach(function (d) {
      var r = run(household, template, given, Object.assign({}, opts, { d: d }));
      if (Money.isOk(r) && Money.isOk(base)) {
        r.vsBaselineCents = r.netWorthAtEndCents - base.netWorthAtEndCents;
        r.fiDateShiftMonths = (r.fiMonthsFromNow !== null && base.fiMonthsFromNow !== null) ? r.fiMonthsFromNow - base.fiMonthsFromNow : null;
      }
      out[d] = r;
    });
    return out;
  }

  return {
    EMPTY: EMPTY,
    DEFAULT_HORIZON: DEFAULT_HORIZON,
    RUNWAY_FLOOR_MONTHS: RUNWAY_FLOOR_MONTHS,
    evaluate: evaluate,
    context: context,
    answers: answers,
    run: run,
    baseline: baseline,
    runAll: runAll
  };
});
