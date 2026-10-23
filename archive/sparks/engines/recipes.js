/* ==========================================================================
   engines/recipes.js, the readings the Solar System names, worked out.
   --------------------------------------------------------------------------
   data/recipes.json says WHICH readings exist, what each one needs and which
   levels unlock it. This file says what each one IS, for the thirty of Tier 1.

   The rule that shapes the whole file: ONE FORMULA, ONE FUNCTION. Where the
   app already works a figure out, the recipe points at that function and
   nothing is retyped here. The net worth is engines/tier0.js. The FI number
   and the progress toward it are Tier 0's. The FI date, the leverage and the
   income multiple are rows of engines/ratios.js. The wealth-accumulation
   ratio is engines/benchmarks.js. The Coast target is engines/coast.js. Only
   the readings with no home anywhere are written out here, and each of those
   is one line of arithmetic over figures the app already holds.

   Every reading is a Money Result: ok with a value, or incomplete naming the
   facts it is waiting for. Empty is never zero (D-002): a household that has
   not said what it saves has no savings rate, rather than a rate of 0%.

     value(id, household, tables)   one reading, as a Result, or null when
                                    this file does not work that one out yet
     all(household, tables)         every reading it can, keyed by id
     IMPLEMENTED                    the ids it knows, in tier order

   DECISIONS.md D-327.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Recipes = api; }
})(typeof self !== 'undefined' ? self : null, function (root) {
  'use strict';

  /* The engines this one points at are looked up when a reading is asked for,
     not when this file loads: a page may put this script before the ones it
     leans on, and a reading that silently returned "could not be worked out"
     because a global was not there yet is the bug that costs an afternoon. */
  var Money, Schema, Ownership, Tier0, Ratios, Benchmarks, Coast, Tax, Projection, Foo;
  function wire() {
    if (Money) return;
    if (typeof module === 'object' && module.exports) {
      Money = require('../shared/money.js'); Schema = require('../shared/schema.js');
      Ownership = require('../shared/ownership.js'); Tier0 = require('./tier0.js');
      Ratios = require('./ratios.js'); Benchmarks = require('./benchmarks.js');
      Coast = require('./coast.js'); Tax = require('./tax.js'); Projection = require('./projection.js'); Foo = require('./foo.js');
      return;
    }
    var S = (root && root.SLAF) || {};
    Money = S.Money; Schema = S.Schema; Ownership = S.Ownership; Tier0 = S.Tier0;
    Ratios = S.Ratios; Benchmarks = S.Benchmarks; Coast = S.Coast; Tax = S.Tax; Projection = S.Projection; Foo = S.Foo;
  }

  var MONTHS = 12;

  /* ---- Reading the household ----------------------------------------------
     Small readers so a formula below is one line. Each returns a Result, and
     a formula that needs two of them says which one is missing. */
  function takeHome(h, t) { return Schema.takeHomeMonthlyCents(h, t); }
  function grossMonthly(h) {
    var g = Schema.grossAnnualIncomeCents(h);
    return Money.isOk(g) ? Money.ok(Math.round(g.value / MONTHS)) : g;
  }
  function own(h, id) {
    var f = Ownership.FIELDS[id];
    if (!f || typeof f.read !== 'function') return Money.incomplete('No reader for ' + id + '.', [id]);
    return f.read(h);
  }
  /* A row of engines/ratios.js, by its id: the reading it already worked out,
     with its own guards and its own wording, never recomputed here. */
  function ratio(h, t, id) {
    var out = Ratios.all(h, t || {});
    var rows = (out && out.rows) || [];
    for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) return rows[i].result; }
    return Money.incomplete('No ratio called ' + id + '.', [id]);
  }
  /* The roof, as a Result: Schema hands back a plain reading with its source. */
  function roof(h) {
    var r = Schema.rentMonthlyCents(h);
    return r && Money.isEntered(r.cents)
      ? Money.ok(r.cents, { source: r.source || null })
      : Money.incomplete('Add what the roof costs to see this.', ['accommodationMonthly']);
  }
  /* a over b, with the missing one named rather than a zero invented. */
  function over(a, b, extra) {
    if (!Money.isOk(a)) return a;
    if (!Money.isOk(b)) return b;
    if (!b.value) return Money.incomplete('Nothing to divide by yet.', (b.missing || []));
    return Money.ok(a.value / b.value, extra || undefined);
  }

  /* ---- The thirty of Tier 1 ------------------------------------------------
     Read this as a table: the left is the reading's id in data/recipes.json,
     the right is where it comes from. A one-word body means the app already
     had it. */
  var FORMULAS = {
    /* The month */
    gap: function (h, t) { return Schema.monthlyGapCents(h, t); },
    savingsRatePotential: function (h, t) { return over(Schema.monthlyGapCents(h, t), takeHome(h, t)); },
    savingsRateActual: function (h, t) { return over(own(h, 'savedMonthly'), takeHome(h, t)); },
    leakRate: function (h, t) {
      var gap = Schema.monthlyGapCents(h, t), saved = own(h, 'savedMonthly'), take = takeHome(h, t);
      if (!Money.isOk(gap)) return gap;
      if (!Money.isOk(saved)) return saved;
      if (!Money.isOk(take) || !take.value) return Money.isOk(take) ? Money.incomplete('Nothing to divide by yet.', ['takeHomeMonthly']) : take;
      return Money.ok((gap.value - saved.value) / take.value, { gapCents: gap.value, savedCents: saved.value });
    },
    savingsRateGross: function (h) { return over(own(h, 'savedMonthly'), grossMonthly(h)); },
    spendRate: function (h, t) { return over(Schema.cleanMonthlySpendingCents(h), takeHome(h, t)); },
    freedomPerMonth: function (h) { return over(own(h, 'savedMonthly'), Schema.cleanMonthlySpendingCents(h)); },

    /* What you own and owe */
    netWorth: function (h) { return Tier0.netWorth(h); },
    debtToAssets: function (h, t) { return ratio(h, t, 'debtToAsset'); },
    nwToIncome: function (h, t) { return ratio(h, t, 'netWorthToIncome'); },
    pawRatio: function (h, t) { return Benchmarks.pawRatio(h, t); },
    yearsSaved: function (h) {
      var saved = Schema.savedAndInvestedCents(h), spend = Schema.cleanMonthlySpendingCents(h);
      if (!Money.isOk(saved)) return saved;
      if (!Money.isOk(spend) || !spend.value) return Money.isOk(spend) ? Money.incomplete('Nothing to divide by yet.', ['monthlyExpenses']) : spend;
      return Money.ok(saved.value / (spend.value * MONTHS));
    },

    /* Where it ends */
    fiNumber: function (h) { return Tier0.fireNumber(h); },
    pctToFI: function (h, t) { return Tier0.fireProgress(h, t); },
    /* The date, twice (D-329). The plan's date is the app's own, built on the
       gap: the money that COULD be saved once spending and the minimums are
       paid. Beside it, as a hypothetical rather than a replacement, the date
       you arrive at if you keep adding exactly what you add now (A3). The
       distance between them is the leak, in years. */
    fiDate: function (h, t) {
      var planned = ratio(h, t, 'fiDate');
      if (!Money.isOk(planned)) return planned;
      var at = ifYouKeepSaving(h, t);
      if (!Money.isOk(at)) return planned;
      return Money.ok(planned.value, {
        years: planned.years, iso: planned.iso,
        also: { label: 'at what you save now', value: at.value, unit: 'date', years: at.years }
      });
    },
    coastTarget: function (h, t) {
      var fi = Tier0.fireNumber(h), age = Schema.primaryAge(h), want = own(h, 'retireAge');
      if (!Money.isOk(fi)) return fi;
      if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to see this.', ['dob']);
      if (!Money.isOk(want)) return want;
      var months = Math.round((want.value - age) * MONTHS);
      if (months <= 0) return Money.incomplete('The date you named is not ahead of you.', ['retireAge']);
      var r = Schema.resolveAssumptions(h, null, t || {}).returnReal;
      /* Coast.grow is the app's one compounding function: a dollar left alone
         for these months. The target is the FI number discounted by it. */
      var factor = Coast.grow(1, r, months);
      if (!factor) return Money.incomplete('No return assumption to grow by.', ['returnReal']);
      return Money.ok(Math.round(fi.value / factor), { months: months, returnReal: r, fiNumberCents: fi.value });
    },
    pctToCoast: function (h, t) {
      var target = FORMULAS.coastTarget(h, t), invested = Schema.investmentsCents(h);
      if (!Money.isOk(target)) return target;
      return over(invested, target);
    },
    targetDateGap: function (h, t) {
      var years = Tier0.yearsToFire(h, t), want = own(h, 'retireAge'), age = Schema.primaryAge(h);
      if (!Money.isOk(years)) return years;
      if (!Money.isOk(want)) return want;
      if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to see this.', ['dob']);
      return Money.ok((want.value - age) - years.value, { yearsToFi: years.value, wantedAt: want.value, ageNow: age });
    },
    currentWR: function (h) {
      var spend = Schema.cleanMonthlySpendingCents(h), invested = Schema.investmentsCents(h);
      if (!Money.isOk(spend)) return spend;
      if (!Money.isOk(invested) || !invested.value) return Money.isOk(invested) ? Money.incomplete('Nothing to divide by yet.', ['investments']) : invested;
      return Money.ok((spend.value * MONTHS) / invested.value);
    },

    /* What you owe a month */
    minimumsRate: function (h, t) { return over(Schema.monthlyDebtPaymentsCents(h), takeHome(h, t)); },
    payoffTimeRough: function (h) {
      var owed = Schema.totalDebtCents(h), pay = Schema.monthlyDebtPaymentsCents(h);
      if (!Money.isOk(owed)) return owed;
      if (!owed.value) return Money.ok(0, { none: true });
      if (!Money.isOk(pay) || !pay.value) return Money.isOk(pay) ? Money.incomplete('Add what you pay a month to see this.', ['monthlyDebtPayments']) : pay;
      /* The rate is the one the debts themselves carry, weighted by balance.
         There is no blended-rate table in data/ to fall back on, so a
         household that has only totals is told what it is waiting for rather
         than given a figure from a rate nobody chose. */
      var debts = (h.debts || []).filter(function (d) { return Money.isEntered(d.balanceCents) && Money.isEntered(d.rate); });
      var owedWithRate = debts.reduce(function (n, d) { return n + d.balanceCents; }, 0);
      if (!owedWithRate) return Money.incomplete('Add a rate to a debt to see how long it takes.', ['debtRate']);
      var rate = debts.reduce(function (n, d) { return n + d.balanceCents * d.rate; }, 0) / owedWithRate;
      var monthly = rate / MONTHS;
      if (monthly * owed.value >= pay.value) {
        return Money.ok(null, { neverAtThisPace: true, rate: rate, interestAMonthCents: Math.round(monthly * owed.value) });
      }
      var months = monthly === 0 ? owed.value / pay.value
        : -Math.log(1 - (monthly * owed.value) / pay.value) / Math.log(1 + monthly);
      return Money.ok(Math.ceil(months), { rate: rate, owedCents: owed.value, payingCents: pay.value });
    },
    highInterestFlag: function (h) {
      var b = own(h, 'highInterestBalance');
      if (!Money.isOk(b)) return b;
      return Money.ok(b.value > 0, { balanceCents: b.value });
    },
    highInterestShare: function (h) { return over(own(h, 'highInterestBalance'), Schema.totalDebtCents(h)); },

    /* The roof */
    shelterRate: function (h, t) { return over(roof(h), takeHome(h, t)); },
    frontEndDTI: function (h) { return over(roof(h), grossMonthly(h)); },
    backEndDTI: function (h) {
      var r = roof(h), mins = Schema.monthlyDebtPaymentsCents(h);
      if (!Money.isOk(r)) return r;
      if (!Money.isOk(mins)) return mins;
      return over(Money.ok(r.value + mins.value), grossMonthly(h));
    },

    /* Tax, and what the pay does */
    impliedTaxRate: function (h, t) {
      var take = takeHome(h, t), gross = Schema.grossAnnualIncomeCents(h);
      if (!Money.isOk(take)) return take;
      if (!Money.isOk(gross) || !gross.value) return Money.isOk(gross) ? Money.incomplete('Nothing to divide by yet.', ['grossAnnualIncome']) : gross;
      return Money.ok(1 - (take.value * MONTHS) / gross.value, { takeHomeAnnualCents: take.value * MONTHS, grossCents: gross.value });
    },
    stateRateRough: function (h, t) {
      var gross = Schema.grossAnnualIncomeCents(h);
      if (!h || !h.state) return Money.incomplete('Add the state you live in to see this.', ['state']);
      if (!Money.isOk(gross) || !gross.value) return Money.isOk(gross) ? Money.incomplete('Nothing to divide by yet.', ['grossAnnualIncome']) : gross;
      var table = (t || {}).stateBrackets;
      if (!table) return Money.incomplete('The state tax table is not loaded.', ['stateBrackets']);
      var owed = Tax.stateTax(table, h.state, gross.value, h.filingStatus || 'single');
      if (!Money.isOk(owed)) return owed;
      return Money.ok(owed.value / gross.value, { owedCents: owed.value, state: h.state });
    },
    refundShare: function (h, t) {
      var refund = own(h, 'refundLastYear'), take = takeHome(h, t), gross = Schema.grossAnnualIncomeCents(h);
      if (!Money.isOk(refund)) return refund;
      if (!Money.isOk(take)) return take;
      if (!Money.isOk(gross)) return gross;
      var tax = gross.value - take.value * MONTHS;
      if (tax <= 0) return Money.incomplete('The rough tax for the year is not a positive figure yet.', ['grossAnnualIncome', 'takeHomeMonthly']);
      return Money.ok(refund.value / tax, { roughTaxCents: tax });
    },
    /* ---- Tier 2, the Basics (D-329) ---- */
    trueMonthlySpend: function (h) {
      var month = Schema.cleanMonthlySpendingCents(h);
      if (!Money.isOk(month)) return month;
      var yearly = Schema.annualMonthlyCents(h);
      var extra = yearly && Money.isEntered(yearly.monthlyCents) ? yearly.monthlyCents : 0;
      return Money.ok(month.value + extra, { monthCents: month.value, fromYearlyCents: extra, lines: (yearly && yearly.count) || 0 });
    },
    runwayMonths: function (h, t) { return ratio(h, t, 'runwayMonths'); },
    efTarget: function (h, t) {
      var months = cushionMonths(h, t), month = Schema.cleanMonthlySpendingCents(h);
      if (months === null) return Money.incomplete('Say whether your pay swings, so the cushion knows 3 months or 6.', ['payVaries']);
      if (!Money.isOk(month)) return month;
      /* The bare-bones month (E5) is band 4. Until it is in, the whole month
         stands in for it, which is the safer of the two errors, and the
         reading says so. */
      return Money.ok(month.value * months, { months: months, usesWholeMonth: true });
    },
    efCoverage: function (h, t) {
      var target = FORMULAS.efTarget(h, t), cash = Schema.cashCents(h);
      if (!Money.isOk(target)) return target;
      return over(cash, target);
    },
    matchCapture: function (h) { return matchFacts(h); },
    matchLeft: function (h) {
      var m = matchFacts(h);
      if (!Money.isOk(m)) return m;
      return Money.ok(m.missedCents, { cap: m.cap, reached: m.reached });
    },
    /* The share of what you own that you could reach without a penalty. The
       app's "liquidity ratio" is a different reading, liquid assets over the
       month's spending, so this is not that row: it is reachable over total,
       from the same two Schema figures the statement uses. */
    liquidityRate: function (h) {
      var reachable = sumAssets(h, ['cash', 'investment']), total = Schema.totalAssetsCents(h);
      if (!reachable) return Money.incomplete('Add what you hold to see this.', ['cashSavings', 'investments']);
      return over(Money.ok(reachable.value), total, { reachableCents: reachable.value });
    },
    bridgeYears: function (h, t) { return ratio(h, t, 'bridgeGapYears'); },
    mustPayRate: function (h, t) {
      var r = roof(h), mins = Schema.monthlyDebtPaymentsCents(h);
      if (!Money.isOk(r)) return r;
      if (!Money.isOk(mins)) return mins;
      return over(Money.ok(r.value + mins.value), takeHome(h, t));
    },
    fatShares: function (h, t) {
      var f = Schema.fat(h), take = takeHome(h, t);
      if (!Money.isOk(take) || !take.value) return Money.isOk(take) ? Money.incomplete('Nothing to divide by yet.', ['takeHomeMonthly']) : take;
      var buckets = ['food', 'accommodation', 'transportation', 'wants'];
      var said = [], shares = {};
      buckets.forEach(function (k) {
        var b = f[k];
        var cents = b && Money.isOk(b) ? b.value : (b && Money.isEntered(b.cents) ? b.cents : null);
        if (!Money.isEntered(cents)) return;
        shares[k] = cents / take.value;
        said.push(k + ' ' + Math.round(shares[k] * 100) + '%');
      });
      if (!said.length) return Money.incomplete('Add the month, bucket by bucket, to see this.', ['monthlyExpenses']);
      return Money.ok(said.join(', '), { shares: shares });
    },
    slotFirst: function (h, t) {
      var walked = Foo.evaluate(h, t || {});
      var steps = (walked && walked.steps) || [];
      var open = steps.filter(function (x) { return x.status !== 'done'; })[0];
      if (!open) return steps.length ? Money.ok('every step of the order is done') : Money.incomplete('The order of operations could not be walked yet.', ['fooRules']);
      if (open.status === 'unknown') return Money.incomplete(open.detail || 'The order of operations needs more to walk.', open.missing || []);
      var rules = ((t || {}).fooRules && ((t || {}).fooRules.steps || (t || {}).fooRules.ladder)) || [];
      var named = rules.filter(function (x) { return x.key === open.key; })[0];
      return Money.ok((named && named.label) || open.label || open.key, { key: open.key, detail: open.detail || null });
    },
    creditBand: function (h) {
      var band = h && h.credit && h.credit.band;
      return band ? Money.ok(band) : Money.incomplete('The credit band has nowhere to be entered yet.', ['creditBand']);
    },
    accountsUsed: function (h) {
      var kinds = {};
      (h.assets || []).forEach(function (a) { if (a.accountType) kinds[a.accountType] = true; });
      var list = Object.keys(kinds);
      if (!list.length) return Money.incomplete('Say what kind of account each one is to see this.', ['assetAccountType']);
      return Money.ok(list.join(', '), { count: list.length });
    },
    payoffTimeExtra: function (h) {
      var extra = h && h.debtPlan && Money.isEntered(h.debtPlan.extraMonthlyCents) ? h.debtPlan.extraMonthlyCents : null;
      if (!Money.isEntered(extra)) return Money.incomplete('The extra you put against debt each month has nowhere to be entered yet.', ['debtExtra']);
      var owed = Schema.totalDebtCents(h), pay = Schema.monthlyDebtPaymentsCents(h);
      if (!Money.isOk(owed) || !Money.isOk(pay)) return Money.isOk(owed) ? pay : owed;
      return FORMULAS.payoffTimeRough(Object.assign({}, h, { __extra: extra }));
    },
    homeEquity: function (h) { return homeEquityCents(h); },
    householdMode: function (h) {
      var people = (h.people || []).length;
      var split = h.expenses && h.expenses.shared ? h.expenses.shared.mode : (h.splitMode || null);
      var partnered = people > 1 || !!(h.partner && h.partner.name) || !!split;
      if (partnered) return Money.ok(split === 'pooled' ? 'partnered, money pooled' : 'partnered, money kept separate', { split: split || null });
      /* Solo is not the same as unasked. Nothing in the app says "I live
         alone" yet, so a household with no partner and no split has not
         answered this rather than having answered "on your own". */
      return Money.incomplete('Whether the money is yours alone or shared has nowhere to be said yet.', ['householdMode']);
    },
    homeShareNW: function (h) {
      var eq = homeEquityCents(h), nw = Tier0.netWorth(h);
      if (!Money.isOk(eq)) return eq;
      return over(eq, nw);
    },
    trapRatio: function (h) {
      var eq = homeEquityCents(h), ret = sumAssets(h, ['retirement']), nw = Tier0.netWorth(h);
      if (!Money.isOk(eq)) return eq;
      if (!Money.isOk(nw)) return nw;
      return over(Money.ok(eq.value + (ret ? ret.value : 0)), nw, { retirementCents: ret ? ret.value : 0, equityCents: eq.value });
    },
    ltv: function (h, t) { return ratio(h, t, 'loanToValue'); },
    priceToIncome: function (h) {
      var home = sumAssets(h, ['real_estate']);
      if (!home) return Money.incomplete('Add the home to see this.', ['otherAssets']);
      return over(home, Schema.grossAnnualIncomeCents(h));
    },
    carToIncome: function (h) {
      var car = sumAssets(h, ['vehicle']);
      if (!car) return Money.incomplete('Add the vehicle to see this.', ['otherAssets']);
      return over(car, Schema.grossAnnualIncomeCents(h));
    },
    studentToIncome: function (h) {
      var owed = sumDebts(h, ['student_loan']);
      if (!owed) return Money.incomplete('Add the student loan to see this.', ['totalDebt']);
      return over(owed, Schema.grossAnnualIncomeCents(h));
    },
    extraPayRate: function (h) {
      var extra = h && h.debtPlan && Money.isEntered(h.debtPlan.extraMonthlyCents) ? h.debtPlan.extraMonthlyCents : null;
      if (!Money.isEntered(extra)) return Money.incomplete('The extra you put against debt each month has nowhere to be entered yet.', ['debtExtra']);
      return over(Money.ok(extra), Schema.monthlyDebtPaymentsCents(h));
    },

    incomeVolatility: function (h) {
      /* Steady pay is an answer, not a blank: someone who said their pay does
         not swing has a swing of nothing, which is not an invented zero. */
      var varies = own(h, 'payVaries');
      if (Money.isOk(varies) && varies.value === false) return Money.ok(0, { steady: true });
      var low = own(h, 'incomeLow'), high = own(h, 'incomeHigh');
      if (!Money.isOk(low)) return low;
      if (!Money.isOk(high)) return high;
      var typical = (low.value + high.value) / 2;
      if (!typical) return Money.incomplete('Nothing to divide by yet.', ['incomeLow', 'incomeHigh']);
      return Money.ok((high.value - low.value) / typical, { lowCents: low.value, highCents: high.value, typicalCents: typical });
    }
  };

  /* ---- The twenty-three of Tier 2 (D-329) ----------------------------------
     Band 2 asks what the month is really made of, what is reachable, and
     which slot the next dollar belongs in. Same rule as Tier 1: the app's own
     function wherever there is one. A reading whose fact has no home in the
     app yet says what it is waiting for rather than guessing. */
  function assetsOf(h, cats) {
    return (h.assets || []).filter(function (a) { return cats.indexOf(a.category) >= 0 && Money.isEntered(a.valueCents); });
  }
  function sumAssets(h, cats) {
    var list = assetsOf(h, cats);
    return list.length ? Money.ok(list.reduce(function (n, a) { return n + a.valueCents; }, 0), { count: list.length }) : null;
  }
  function debtsOfType(h, types) {
    return (h.debts || []).filter(function (d) { return types.indexOf(d.type) >= 0 && Money.isEntered(d.balanceCents); });
  }
  function sumDebts(h, types) {
    var list = debtsOfType(h, types);
    return list.length ? Money.ok(list.reduce(function (n, d) { return n + d.balanceCents; }, 0), { count: list.length }) : null;
  }
  function homeEquityCents(h) {
    var home = sumAssets(h, ['real_estate']);
    if (!home) return Money.incomplete('Add the home to see this.', ['otherAssets']);
    var owed = sumDebts(h, ['mortgage']);
    return Money.ok(home.value - (owed ? owed.value : 0), { homeCents: home.value, mortgageCents: owed ? owed.value : 0 });
  }
  /* The match: what the employer offers, and how much of it the contribution
     actually reaches. One place, so the capture and what is left agree. */
  function matchFacts(h) {
    var p = (h.people || [])[0] || {};
    var src = (p.incomeSources || [])[0] || {};
    var m = src.employerMatch || {};
    var gross = Schema.grossAnnualIncomeCents(h);
    var pct = h.retirement && Money.isEntered(h.retirement.contributionPercent) ? h.retirement.contributionPercent / 100 : null;
    if (!Money.isEntered(m.matchPercent) || !Money.isEntered(m.matchCapPercentOfSalary)) {
      return Money.incomplete('Add what the employer matches to see this.', ['employerMatch']);
    }
    if (pct === null) return Money.incomplete('Add what you put in, as a share of pay, to see this.', ['contributionPercent']);
    if (!Money.isOk(gross)) return gross;
    var cap = m.matchCapPercentOfSalary;
    var reached = Math.min(pct, cap);
    return Money.ok(cap ? reached / cap : 0, {
      matchPercent: m.matchPercent, cap: cap, contributing: pct, reached: reached,
      missedCents: Math.round(gross.value * (cap - reached) * m.matchPercent)
    });
  }
  function cushionMonths(h, t) {
    var varies = own(h, 'payVaries');
    var table = (t || {}).defaults && (t || {}).defaults.defaults ? (t || {}).defaults.defaults.emergencyFundMonths : null;
    var band = (table && table.value) || { steady: 3, variable: 6 };
    if (!Money.isOk(varies)) return null;
    return varies.value ? band.variable : band.steady;
  }

  /* The same projection loop the app uses for its own date, handed the money
     that actually lands rather than the gap. */
  function ifYouKeepSaving(h, t) {
    var target = Tier0.fireNumber(h), invested = Schema.investmentsCents(h), saved = own(h, 'savedMonthly');
    if (!Money.isOk(target)) return target;
    if (!Money.isOk(invested)) return invested;
    if (!Money.isOk(saved)) return saved;
    var a = Schema.resolveAssumptions(h, null, t || {});
    var years = Projection.yearsToTargetCents({
      startCents: invested.value, targetCents: target.value,
      annualRate: a.expectedReturnRate, annualContributionCents: saved.value * MONTHS
    });
    if (!Money.isOk(years)) return years;
    var now = new Date();
    return Money.ok(now.getUTCFullYear() + years.value, { years: years.value, savedMonthlyCents: saved.value });
  }

  var IMPLEMENTED = Object.keys(FORMULAS);

  /** One reading. null when this file does not work that one out yet, so a
   *  caller can tell "not built" from "waiting on a fact". */
  function value(id, household, tables) {
    wire();
    /* Its own keys only: "valueOf" and "toString" are not readings, and a
       lookup that walks the prototype chain would answer for them. */
    if (!Object.prototype.hasOwnProperty.call(FORMULAS, id)) return null;
    var fn = FORMULAS[id];
    if (typeof fn !== 'function') return null;
    if (!Money || !Schema) return null;
    try { return fn(household || {}, tables || {}); }
    catch (e) { return Money.incomplete('This reading could not be worked out (' + e.message + ').', []); }
  }

  /** Every reading this file knows, keyed by id. */
  function all(household, tables) {
    var out = {};
    IMPLEMENTED.forEach(function (id) { out[id] = value(id, household, tables); });
    return out;
  }

  return { value: value, all: all, IMPLEMENTED: IMPLEMENTED, FORMULAS: FORMULAS };
});
