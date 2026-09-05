/* ==========================================================================
   engines/advice.js — the Advice Translator.
   DECISIONS.md D-096.
   --------------------------------------------------------------------------
   A piece of advice people hear, restated for this household's numbers,
   and marked "learn" (take it, here is what it means for you) or "unlearn"
   (drop it, here is why for you). The catalogue is data/advice_translator.json;
   this file evaluates each item's predicates against the household and
   fills the tokens in the winner's body. pick() returns exactly one item —
   the dashboard's third block — and list() returns every item that applies,
   in order, for a room that wants the whole translation.

   Nothing here is a formula of its own: every number is read from the
   engines that own it (tier0, ratios, hourly, debt, foo).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Gate: require('../shared/gate.js'),
             Tier0: require('./tier0.js'), Ratios: require('./ratios.js'), Foo: require('./foo.js'), Hourly: require('./hourly.js'), Debt: require('./debt.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Gate: S.Gate, Tier0: S.Tier0, Ratios: S.Ratios, Foo: S.Foo, Hourly: S.Hourly, Debt: S.Debt };
  }
  var api = factory(deps.Money, deps.Schema, deps.Gate, deps.Tier0, deps.Ratios, deps.Foo, deps.Hourly, deps.Debt);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Advice = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Gate, Tier0, Ratios, Foo, Hourly, Debt) {
  'use strict';

  var MONTHS = 12;
  var COFFEE_CENTS = 500;
  var HIGH_INTEREST = 0.075;
  var MS_PER_DAY = 86400000, DAYS_PER_MONTH = 365.25 / 12;

  /* Everything a predicate or a token could need, computed once. */
  function facts(household, tables, now) {
    var h = household || {};
    var f = { situation: Gate.situationOf(h), savingsRateExists: Gate.exists(h, 'savingsRate'), decumulates: Gate.exists(h, 'decumulation') };
    f.gross = Schema.grossAnnualIncomeCents(h);
    f.spending = Schema.monthlyExpensesCents(h);
    f.cash = Schema.cashCents(h);
    f.investments = Schema.investmentsCents(h);
    f.cashMonths = Money.isOk(f.cash) && Money.isOk(f.spending) && f.spending.value > 0 ? f.cash.value / f.spending.value : null;
    var rates = Tier0.savingsRate(h, tables);
    f.savingsRate = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    f.floor = tables && tables.fooRules && tables.fooRules.thresholds && Money.isEntered(tables.fooRules.thresholds.savingsRateBenchmarkFloor) ? tables.fooRules.thresholds.savingsRateBenchmarkFloor
      : (tables && tables.ratioBenchmarks && tables.ratioBenchmarks.bands.savingsRate ? tables.ratioBenchmarks.bands.savingsRate.good : 0.15);
    f.tax = Tier0.takeHomeMonthlyCents(h, tables);
    f.wage = Gate.exists(h, 'realHourlyWage') && Hourly ? Hourly.realHourlyWage(h, tables) : Money.incomplete('No wage.', []);
    var foo = Foo.evaluate(h, tables);
    f.flags = (foo && foo.flags) || [];
    f.matchFlag = f.flags.filter(function (x) { return x.key === 'match_left_on_table'; })[0] || null;
    f.highDebt = Schema.aggregatableDebts(h).filter(function (d) { return Money.isEntered(d.rate) && d.rate > HIGH_INTEREST && Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
    f.highDebtCents = f.highDebt.reduce(function (t, d) { return t + d.balanceCents; }, 0);
    var all = Ratios.all(h, tables, { now: now });
    f.withdrawal = (all.rows.filter(function (r) { return r.id === 'withdrawalRate'; })[0] || {}).result || Money.incomplete('', []);
    f.fiYear = Tier0.yearsToFire(h, tables);
    f.nowMs = now === undefined ? Date.now() : now;
    if (Gate.exists(h, 'studentLoans') && Debt && tables && tables.debtRules && Schema.aggregatableDebts(h).length) {
      var sim = Debt.simulate(h, tables.debtRules, { strategyId: 'avalanche' });
      f.loanYear = Money.isOk(sim) ? new Date(f.nowMs + sim.months * DAYS_PER_MONTH * MS_PER_DAY).getFullYear() : null;
    } else f.loanYear = null;
    f.paysRent = !!(h.meta && h.meta.noRent === false);
    var src = Schema.primaryPerson(h) && (Schema.primaryPerson(h).incomeSources || [])[0];
    f.matchCap = src && src.employerMatch && Money.isEntered(src.employerMatch.matchCapPercentOfSalary) ? src.employerMatch.matchCapPercentOfSalary : null;
    return f;
  }

  var PREDICATES = {
    betweenJobs:  function (f) { return f.situation === 'betweenJobs' && Money.isOk(f.cash) && Money.isOk(f.spending); },
    retired:      function (f) { return f.situation === 'retired'; },
    student:      function (f) { return f.situation === 'student'; },
    selfEmployed: function (f) { return f.situation === 'selfEmployed' || f.situation === 'mixed'; },
    incomeKnown:  function (f) { return Money.isOk(f.gross) && f.gross.value > 0 && Money.isOk(f.tax); },
    hasDebt:      function (f) { return f.loanYear !== null; },
    matchLeftOnTable: function (f) { return !!f.matchFlag && f.matchCap !== null; },
    withdrawalKnown: function (f) { return Money.isOk(f.withdrawal) && !f.withdrawal.covered; },
    savingsRateKnown: function (f) { return f.savingsRateExists && Money.isOk(f.savingsRate) && Money.isOk(f.gross) && f.gross.value > 0; },
    withdrawalCovered: function (f) { return f.decumulates && Money.isOk(f.withdrawal) && f.withdrawal.covered === true && Money.isOk(f.investments); },
    savingsRateBelowFloor: function (f) { return f.savingsRate.value < f.floor; },
    savingsRateAboveFloor: function (f) { return f.savingsRate.value >= f.floor && Money.isOk(f.fiYear); },
    highInterestDebt: function (f) { return f.highDebtCents > 0; },
    hoursKnown:   function (f) { return Money.isOk(f.wage) && f.wage.value > 0 && Money.isOk(f.spending); },
    cashKnown:    function (f) { return f.cashMonths !== null; },
    cashBelowThree: function (f) { return f.cashMonths < 3; },
    cashAboveNine: function (f) { return f.cashMonths > 9; },
    paysRent:     function (f) { return f.paysRent; }
  };

  function tokens(f, tables) {
    var m = Money.formatCents;
    var spend = Money.isOk(f.spending) ? f.spending.value : null;
    var t = {
      spending: spend !== null ? m(spend) : '—',
      cash: Money.isOk(f.cash) ? m(f.cash.value) : '—',
      cashMonths: f.cashMonths !== null ? Money.formatMonths(f.cashMonths) : '—',
      threeMonths: spend !== null ? m(spend * 3) : '—',
      cashGap: spend !== null && Money.isOk(f.cash) ? m(Math.max(0, spend * 3 - f.cash.value)) : '—',
      cashExcess: spend !== null && Money.isOk(f.cash) ? m(Math.max(0, f.cash.value - spend * 6)) : '—',
      savingsRate: Money.isOk(f.savingsRate) ? Money.formatRate(f.savingsRate.value, { decimals: 1 }) : '—',
      floor: Money.formatRate(f.floor, { decimals: 0 }),
      gapMonthly: Money.isOk(f.savingsRate) && Money.isOk(f.gross) ? m(Math.max(0, Math.round((f.floor - f.savingsRate.value) * f.gross.value / MONTHS))) : '—',
      matchGap: f.matchFlag && f.matchFlag.detail ? m(f.matchFlag.detail.annualMatchCents || 0) : '—',
      matchCap: f.matchCap !== null ? Money.formatRate(f.matchCap, { decimals: 0 }) : '—',
      withdrawalRate: Money.isOk(f.withdrawal) ? Money.formatRate(f.withdrawal.value, { decimals: 1 }) : '—',
      annualDraw: Money.isOk(f.withdrawal) ? m(f.withdrawal.annualDrawCents || 0) + ' a year' : '—',
      highInterestBalance: m(f.highDebtCents),
      loanYear: f.loanYear !== null ? String(f.loanYear) : '—',
      hundred: m(10000),
      gross: Money.isOk(f.gross) ? m(f.gross.value) : '—',
      income: Money.isOk(f.gross) ? m(Math.round(f.gross.value / MONTHS)) : '—',
      investments: Money.isOk(f.investments) ? m(f.investments.value) : '—',
      investmentYears: Money.isOk(f.investments) && spend !== null && spend > 0 ? (Math.round(f.investments.value / (spend * MONTHS) * 10) / 10) + ' years' : '—',
      tax: Money.isOk(f.tax) ? m(f.tax.estimatedTaxCents) : '—',
      taxMonthly: Money.isOk(f.tax) ? m(Math.round(f.tax.estimatedTaxCents / MONTHS)) : '—',
      effectiveRate: Money.isOk(f.tax) ? Money.formatRate(f.tax.effectiveRate, { decimals: 0 }) : '—',
      fiYear: Money.isOk(f.fiYear) ? (f.fiYear.alreadyThere ? 'now' : String(new Date(f.nowMs + f.fiYear.value * 365.25 * MS_PER_DAY).getFullYear())) : '—',
      wage: Money.isOk(f.wage) ? m(f.wage.value) + '/h' : '—',
      coffee: m(COFFEE_CENTS),
      coffeeTime: Money.isOk(f.wage) ? Money.formatAsTime(COFFEE_CENTS, f.wage.value) : '—',
      rentTime: Money.isOk(f.wage) && spend !== null ? Money.formatAsTime(spend, f.wage.value) + ' a month' : '—'
    };
    return t;
  }
  function fill(text, t) {
    return String(text).replace(/\{(\w+)\}/g, function (_, k) { return t[k] === undefined ? '{' + k + '}' : t[k]; });
  }
  function applies(item, f) {
    return (item.when || []).every(function (p) { var fn = PREDICATES[p]; return fn ? !!fn(f) : false; });
  }

  /** Every item that applies, in priority order, bodies filled. */
  function list(household, tables, now) {
    var table = tables && tables.adviceTranslator;
    if (!table) return Money.incomplete('The advice table is not loaded.', ['adviceTranslator']);
    var f = facts(household, tables, now);
    var t = tokens(f, tables);
    var out = table.items.filter(function (i) { return applies(i, f); })
      .sort(function (a, b) { return a.priority - b.priority; })
      .map(function (i) { return { id: i.id, kind: i.kind, headline: i.headline, body: fill(i.body, t), room: i.room, anchor: i.anchor || null, priority: i.priority }; });
    return Money.ok(out.length, { items: out, confidence: table.confidence });
  }
  /** The one for the dashboard. */
  function pick(household, tables, now) {
    var l = list(household, tables, now);
    if (!Money.isOk(l)) return l;
    if (!l.items.length) return Money.incomplete('Nothing to translate yet.', ['monthlyExpenses']);
    return Money.ok(l.items[0].id, { item: l.items[0], count: l.items.length });
  }

  return { PREDICATES: Object.keys(PREDICATES), COFFEE_CENTS: COFFEE_CENTS, HIGH_INTEREST: HIGH_INTEREST, facts: facts, tokens: tokens, list: list, pick: pick };
});
