/* ==========================================================================
   engines/variableincome.js — a low month, a high month, an average.
   DECISIONS.md D-099 (the Variable Income room).
   --------------------------------------------------------------------------
   The person with uneven income wants one number: the salary to pay
   themselves. The convention (data/variable_income_conventions.json) is to
   set it at the low month, and to hold a buffer of the low-to-average gap
   so the good months fill the buffer rather than the spending.

   plan(h, T) reads the household and returns one Result with every
   figure the room shows:

     averageMonthCents   the source's own average when it is entered as
                         "a month on average — it varies" (frequency
                         'variable' with a rateCents), else gross ÷ 12
     lowCents/highCents  the person's, on the income source
     salaryCents         the low month — or spending, when the low month
                         is below it (salaryIsSpending)
     gapCents            average − low, floored at zero
     bufferNeededCents   gap × bufferMonths
     freeCashCents       cash less the emergency cushion (3 months of
                         spending) — what is actually free for the buffer
     bufferHeldCents     min(freeCash, bufferNeeded)
     cushionCompetes     true when the cushion eats what the buffer wanted
     shortfallCents      spending − low when low < spending, else 0
     lowMonthsCovered    floor(cash ÷ shortfall), or null with coversEveryOne
     taxSetAsideMonthlyCents  the Self-Employed room's quarterly ÷ 3

   Nothing is re-derived: gross, spending and cash come from the schema
   roll-ups, the quarterly from engines/selfemployed.js. A missing input
   makes the part that needs it null with a reason — never a zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Ownership: require('../shared/ownership.js'),
             Gate: require('../shared/gate.js'), SelfEmployed: require('./selfemployed.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Gate: S.Gate, SelfEmployed: S.SelfEmployed };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.Gate, deps.SelfEmployed);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.VariableIncome = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, Gate, SelfEmployed) {
  'use strict';

  var MONTHS = 12;
  var MONTHS_PER_QUARTER = 3;
  var LOW_MONTHS_FLOOR = 3;   /* fewer low months than this covered, with a shortfall, is 'out' */

  /* The conventions table, with the numbers the engine needs if it is
     missing (so an empty tables object still yields a plan). */
  function conventions(T) {
    var c = (T && T.variableIncomeConventions) || {};
    var buffer = c.buffer || {};
    var propose = c.propose || {};
    return {
      usualMonths: Money.isEntered(buffer.usualMonths) ? buffer.usualMonths : 3,
      fullMonths: Money.isEntered(buffer.fullMonths) ? buffer.fullMonths : 6,
      cushionMonths: Money.isEntered(c.emergencyCushionMonths) ? c.emergencyCushionMonths : 3,
      lowShare: Money.isEntered(propose.lowShareOfAverage) ? propose.lowShareOfAverage : 0.7,
      highShare: Money.isEntered(propose.highShareOfAverage) ? propose.highShareOfAverage : 1.3,
      loaded: !!(T && T.variableIncomeConventions),
      table: c
    };
  }

  /* Is this source the own-work one — entered as variable, or a 1099? */
  function isOwnWork(source) {
    return !!source && (source.frequency === 'variable' || source.type === '1099');
  }

  /**
   * averageMonth(h, source) — the average month this room measures against.
   * The source's own average wins when it was entered as one ("a month on
   * average — it varies", D-094); otherwise the household's gross ÷ 12,
   * which for a self-employed household with one source is the same thing.
   */
  function averageMonth(h, source) {
    if (source && source.frequency === 'variable' && Money.isEntered(source.rateCents)) {
      return Money.ok(source.rateCents, { basis: 'source', sourceId: source.id });
    }
    var gross = Schema.grossAnnualIncomeCents(h);
    if (!Money.isOk(gross)) return gross;
    return Money.ok(Math.round(gross.value / MONTHS), { basis: 'gross', grossAnnualIncomeCents: gross.value });
  }

  /**
   * taxSetAside(h, T, source) — a month's share of the Self-Employed room's
   * quarterly estimate. The expected net profit is the own-work source's
   * annual figure when there is one, else the household gross; there is no
   * stored expense figure, so profit is read as gross and said so.
   */
  function taxSetAside(h, T, source) {
    var sit = Gate ? Gate.situationOf(h) : null;
    if (sit !== 'selfEmployed' && sit !== 'mixed') return Money.incomplete('Not self-employed — no quarterly to set aside.', []);
    if (!SelfEmployed) return Money.incomplete('The self-employed engine is not loaded.', []);
    var profit = null, basis = null;
    if (isOwnWork(source) && Money.isEntered(source.grossAnnualIncomeCents)) { profit = source.grossAnnualIncomeCents; basis = 'own-work source'; }
    else { var g = Schema.grossAnnualIncomeCents(h); if (Money.isOk(g)) { profit = g.value; basis = 'gross'; } }
    if (!Money.isEntered(profit)) return Money.incomplete('Add your income to estimate the set-aside.', ['grossAnnualIncome']);
    var q = SelfEmployed.quarterlyEstimated(h, T, { expectedNetProfitCents: profit });
    if (!Money.isOk(q)) return q;
    return Money.ok(Math.round(q.perQuarterCents / MONTHS_PER_QUARTER), {
      perQuarterCents: q.perQuarterCents, requiredAnnualCents: q.requiredAnnualCents,
      expectedNetProfitCents: profit, profitBasis: basis, quarterly: q
    });
  }

  /**
   * plan(h, T, opts) — the whole room in one Result. Its value is the
   * salary to pay yourself, in cents.
   */
  function plan(household, T, opts) {
    var h = household || {};
    var o = opts || {};
    var C = conventions(T);
    var source = o.source !== undefined ? o.source : (Ownership ? Ownership.variableSource(h) : null);

    var avg = averageMonth(h, source);
    if (!Money.isOk(avg)) return Money.incomplete('Add your income to see this.', ['grossAnnualIncome']);
    var averageCents = avg.value;

    var low = source && Money.isEntered(source.variableLowCents) ? source.variableLowCents : null;
    var high = source && Money.isEntered(source.variableHighCents) ? source.variableHighCents : null;
    var spendingR = Schema.monthlyExpensesCents(h);
    var spending = Money.isOk(spendingR) ? spendingR.value : null;
    var cashR = Schema.cashCents(h);
    var cash = Money.isOk(cashR) ? cashR.value : null;
    var bufferMonths = h.variableIncome && Money.isEntered(h.variableIncome.bufferMonths) ? h.variableIncome.bufferMonths : null;

    if (!Money.isEntered(low)) return Money.incomplete('Add a low month to see the salary to pay yourself.', ['variableLowCents']);
    if (low < 0) return Money.incomplete('A month cannot bring in less than nothing.', ['variableLowCents']);

    /* The salary: the low month, or spending when the low month is below it. */
    var salaryIsSpending = Money.isEntered(spending) && low < spending;
    var salary = salaryIsSpending ? spending : low;

    /* The gap and the buffer. */
    var gap = Math.max(0, averageCents - low);
    var lowAboveAverage = low > averageCents;
    var bufferNeeded = Money.isEntered(bufferMonths) ? Math.round(gap * bufferMonths) : null;

    /* Cash against it: the emergency cushion comes first. */
    var cushion = Money.isEntered(spending) ? spending * C.cushionMonths : null;
    var freeCash = Money.isEntered(cash) && Money.isEntered(cushion) ? Math.max(0, cash - cushion) : null;
    var bufferHeld = Money.isEntered(freeCash) && Money.isEntered(bufferNeeded) ? Math.min(freeCash, bufferNeeded) : null;
    var cushionCompetes = Money.isEntered(cash) && Money.isEntered(cushion) && Money.isEntered(bufferNeeded)
      && bufferNeeded > 0 && cash < cushion + bufferNeeded;

    /* Low months in a row the cash covers at the low month's shortfall. */
    var shortfall = salaryIsSpending ? spending - low : 0;
    var coversEveryOne = Money.isEntered(spending) && shortfall === 0;
    var lowMonthsCovered = shortfall > 0 && Money.isEntered(cash) ? Math.floor(cash / shortfall) : null;

    /* Tax off the top, for the self-employed. */
    var tax = taxSetAside(h, T, source);

    /* The zone. Out first, then good, then watch. */
    var zone = null;
    if (shortfall > 0 && Money.isEntered(lowMonthsCovered) && lowMonthsCovered < LOW_MONTHS_FLOOR) zone = 'out';
    else if (Money.isEntered(bufferNeeded) && Money.isEntered(bufferHeld) && bufferHeld >= bufferNeeded) zone = 'good';
    else if (Money.isEntered(bufferNeeded) && Money.isEntered(bufferHeld)) zone = 'watch';

    return Money.ok(salary, {
      sourceId: source ? source.id : null,
      sourceIsOwnWork: isOwnWork(source),
      averageMonthCents: averageCents,
      averageBasis: avg.basis,
      grossAnnualIncomeCents: Money.isEntered(avg.grossAnnualIncomeCents) ? avg.grossAnnualIncomeCents : null,
      lowCents: low,
      highCents: high,
      spendingCents: spending,
      spendingReason: Money.isOk(spendingR) ? null : spendingR.reason,
      cashCents: cash,
      cashReason: Money.isOk(cashR) ? null : cashR.reason,
      bufferMonths: bufferMonths,
      salaryCents: salary,
      salaryIsSpending: salaryIsSpending,
      gapCents: gap,
      lowAboveAverage: lowAboveAverage,
      bufferNeededCents: bufferNeeded,
      cushionCents: cushion,
      cushionMonths: C.cushionMonths,
      freeCashCents: freeCash,
      bufferHeldCents: bufferHeld,
      cushionCompetes: !!cushionCompetes,
      shortfallCents: shortfall,
      coversEveryOne: !!coversEveryOne,
      lowMonthsCovered: lowMonthsCovered,
      taxSetAsideMonthlyCents: Money.isOk(tax) ? tax.value : null,
      taxSetAside: tax,
      zone: zone,
      conventions: { usualMonths: C.usualMonths, fullMonths: C.fullMonths, lowShare: C.lowShare, highShare: C.highShare, loaded: C.loaded }
    });
  }

  /**
   * propose(h, T) — the guesses the boxes show before anything is typed:
   * seven-tenths and thirteen-tenths of the average month, and the table's
   * usual buffer. Each is null when the average is not known.
   */
  function propose(household, T) {
    var C = conventions(T);
    var source = Ownership ? Ownership.variableSource(household || {}) : null;
    var avg = averageMonth(household || {}, source);
    var a = Money.isOk(avg) ? avg.value : null;
    return {
      lowCents: Money.isEntered(a) ? Math.round(a * C.lowShare) : null,
      highCents: Money.isEntered(a) ? Math.round(a * C.highShare) : null,
      bufferMonths: C.usualMonths,
      lowShare: C.lowShare, highShare: C.highShare
    };
  }

  return { plan: plan, propose: propose, averageMonth: averageMonth, taxSetAside: taxSetAside, conventions: conventions, isOwnWork: isOwnWork, MONTHS: MONTHS, LOW_MONTHS_FLOOR: LOW_MONTHS_FLOOR };
});
