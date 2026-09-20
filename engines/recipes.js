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
  var Money, Schema, Ownership, Tier0, Ratios, Benchmarks, Coast, Tax;
  function wire() {
    if (Money) return;
    if (typeof module === 'object' && module.exports) {
      Money = require('../shared/money.js'); Schema = require('../shared/schema.js');
      Ownership = require('../shared/ownership.js'); Tier0 = require('./tier0.js');
      Ratios = require('./ratios.js'); Benchmarks = require('./benchmarks.js');
      Coast = require('./coast.js'); Tax = require('./tax.js');
      return;
    }
    var S = (root && root.SLAF) || {};
    Money = S.Money; Schema = S.Schema; Ownership = S.Ownership; Tier0 = S.Tier0;
    Ratios = S.Ratios; Benchmarks = S.Benchmarks; Coast = S.Coast; Tax = S.Tax;
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
    fiDate: function (h, t) { return ratio(h, t, 'fiDate'); },
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
