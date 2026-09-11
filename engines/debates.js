/* ==========================================================================
   engines/debates.js — debates as buttons: both sides, on your numbers.
   DECISIONS.md D-218 (K3).
   --------------------------------------------------------------------------
   data/debates.json names each debate, its sides with their sources, the
   Ledger fields it reads and the one figure it turns on (the flip point).
   This file runs each side through the shared engines and says what the
   numbers say for this household: an answer as a range across the return
   bands, the flip point, and how far the household sits from it. Never
   "you should"; never a side picked in general.

     list(tables)                       the debates, with sides and sources
     run(id, household, tables, opts)   → Result: value 'a' | 'b' | 'cantTell',
                                           sides, range, flip, sentence

   Every function of arithmetic here is a shared engine's: tax rates from
   engines/tax.js, the FI years from engines/tier0.js, the trap from
   engines/trap.js, the price bands from data/price_to_rent.json.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tax: require('./tax.js'), Tier0: require('./tier0.js'), Trap: require('./trap.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tax: S.Tax, Tier0: S.Tier0, Trap: S.Trap };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tax, deps.Tier0, deps.Trap);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Debates = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tax, Tier0, Trap) {
  'use strict';

  var MONTHS = 12;
  var LOWER_SWR = 0.0325;   /* the lower rate the "lower" side argues for; from the debate's own case */

  function list(tables) { var t = tables && tables.debates; return t && t.debates ? t.debates.slice() : []; }
  function byId(tables, id) { return list(tables).filter(function (d) { return d.id === id; })[0] || null; }
  function pct(r) { return Money.formatRate(r, { decimals: 1 }); }
  function bands(T) { return T.returnBands && T.returnBands.percentiles ? T.returnBands.percentiles : null; }

  /* A rate against the three bands: which side wins in each, and the one answer if all agree. */
  function rateVsReturn(rate, T, winsWhenReturnHigher) {
    var b = bands(T);
    if (!b) return null;
    var per = { p25: b.p25 > rate, p50: b.p50 > rate, p75: b.p75 > rate };
    var all = per.p25 === per.p50 && per.p50 === per.p75;
    /* the sides are [payoff, invest]: a higher return means the second side */
    return { per: per, agree: all, answer: all ? (per.p50 === !!winsWhenReturnHigher ? 'b' : 'a') : 'cantTell', bands: b };
  }

  var FN = {
    middleClassTrap: function (h, T, o) {
      var t = Trap.run(h, T, o);
      if (!Money.isOk(t)) return t;
      var free = t.paths.filter(function (p) { return p.available && p.verdict !== 'Trapped'; });
      var bridgeOnly = t.paths.filter(function (p) { return p.id === 'bridge'; })[0];
      var answer = free.length ? (bridgeOnly.verdict !== 'Trapped' ? 'cantTell' : 'b') : 'a';
      var flipValue = t.bridgeYears, flipAt = t.seasoningYears;
      return Money.ok(answer, {
        sides: [{ id: 'trap', line: bridgeOnly.available ? 'Bridge accounts alone: ' + bridgeOnly.verdict + '.' : 'Bridge accounts alone: not available.' },
                { id: 'solvable', line: free.length ? free.map(function (p) { return p.label + ': ' + p.verdict; }).join('; ') + '.' : 'No path reaches the pre-tax money in time.' }],
        range: t.paths.filter(function (p) { return p.available; }).map(function (p) { return p.label + ' ' + (p.verdicts.p25 || p.verdict) + ' to ' + (p.verdicts.p75 || p.verdict); }).join('; '),
        flip: { value: flipValue, at: flipAt, unit: 'years', distance: flipValue === null ? null : flipValue - flipAt, words: (flipValue === null ? 'no bridge money' : Math.round(flipValue * 10) / 10 + ' years of bridge money') + ' against the ' + flipAt + ' the ladder needs' },
        sentence: answer === 'a' ? 'The numbers say trapped: no path covers the years before ' + t.inputs.accessAge + ' without a shortfall.' : answer === 'b' ? 'The numbers say solvable: bridge accounts alone fall short, but ' + free.map(function (p) { return p.label; }).join(' or ') + ' reaches the money in time.' : 'The numbers say neither side has a case here: the bridge accounts alone get you to ' + t.inputs.accessAge + '.',
        detail: t
      });
    },
    mortgageVsInvest: function (h, T) {
      var m = (h.debts || []).filter(function (d) { return d.type === 'mortgage' && Money.isEntered(d.rate); })[0];
      if (!m) return Money.incomplete('Add a mortgage with its rate in Debt Payoff to run this.', ['debtRate']);
      var r = rateVsReturn(m.rate, T, true);
      if (!r) return Money.incomplete('The return bands are not loaded.', ['returnBands']);
      return Money.ok(r.answer, {
        sides: [{ id: 'payoff', line: 'Paying it off earns ' + pct(m.rate) + ' a year, guaranteed.' }, { id: 'invest', line: 'Investing earns ' + pct(r.bands.p25) + ' to ' + pct(r.bands.p75) + ' a year real, ' + pct(r.bands.p50) + ' in the middle.' }],
        range: r.agree ? (r.per.p50 ? 'Investing wins in every band.' : 'Paying it off wins in every band.') : 'Investing wins in a good decade, paying it off wins in a poor one.',
        flip: { value: m.rate, at: r.bands.p50, unit: 'rate', distance: r.bands.p50 - m.rate, words: 'investing wins if returns beat ' + pct(m.rate) + ' a year; the middle band is ' + pct(r.bands.p50) },
        sentence: r.agree ? (r.per.p50 ? 'The numbers say invest: even a poor decade beats a ' + pct(m.rate) + ' mortgage.' : 'The numbers say pay it off: even a good decade does not beat ' + pct(m.rate) + '.') : 'The numbers say it depends on the decade: ' + pct(m.rate) + ' sits inside the range of returns.'
      });
    },
    studentLoansVsInvest: function (h, T) {
      var loans = (h.debts || []).filter(function (d) { return d.type === 'student_loan' && Money.isEntered(d.rate) && Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
      if (!loans.length) return Money.incomplete('Add a student loan with its rate in Debt Payoff to run this.', ['debtRate']);
      var bal = loans.reduce(function (s, d) { return s + d.balanceCents; }, 0);
      var rate = loans.reduce(function (s, d) { return s + d.rate * d.balanceCents; }, 0) / bal;
      var r = rateVsReturn(rate, T, true);
      if (!r) return Money.incomplete('The return bands are not loaded.', ['returnBands']);
      return Money.ok(r.answer, {
        sides: [{ id: 'payoff', line: 'Paying them off earns ' + pct(rate) + ' a year, guaranteed, on ' + Money.formatCents(bal) + '.' }, { id: 'invest', line: 'Investing earns ' + pct(r.bands.p25) + ' to ' + pct(r.bands.p75) + ' a year real.' }],
        range: r.agree ? (r.per.p50 ? 'Investing wins in every band.' : 'Paying them off wins in every band.') : 'Investing wins in a good decade, paying them off wins in a poor one.',
        flip: { value: rate, at: r.bands.p50, unit: 'rate', distance: r.bands.p50 - rate, words: 'investing wins if returns beat ' + pct(rate) + ' a year' },
        sentence: r.agree ? (r.per.p50 ? 'The numbers say invest: the loans cost less than a poor decade returns.' : 'The numbers say pay them off: the rate beats even a good decade.') : 'The numbers say it depends on the decade: ' + pct(rate) + ' sits inside the range of returns.'
      });
    },
    rothVsTraditional: function (h, T) {
      var est = Tax.estimate(h, T);
      if (!Money.isOk(est)) return est;
      var later = Tax.withdrawalRates(h, T);
      if (!Money.isOk(later)) return later;
      var now = est.marginalRate, then = later.withdrawalRate;
      var answer = now > then ? 'a' : now < then ? 'b' : 'cantTell';
      return Money.ok(answer, {
        sides: [{ id: 'traditional', line: 'Your marginal rate now: ' + pct(now) + '. A deduction today saves that.' }, { id: 'roth', line: 'The rate your spending would be taxed at later: ' + pct(then) + (later.assumed && later.assumed.length ? ' (filing status assumed)' : '') + '.' }],
        range: 'Federal ordinary rates only; state and future law are outside this.',
        flip: { value: now, at: then, unit: 'rate', distance: now - then, words: 'traditional wins while the rate now (' + pct(now) + ') is above the rate later (' + pct(then) + ')' },
        sentence: answer === 'a' ? 'The numbers say traditional: ' + pct(now) + ' now against ' + pct(then) + ' later.' : answer === 'b' ? 'The numbers say Roth: ' + pct(now) + ' now against ' + pct(then) + ' later.' : 'The numbers say a wash: the same rate now and later, so the choice is about flexibility.'
      });
    },
    fourPercent: function (h, T) {
      var four = Tier0.yearsToFire(h, T, { swrRate: 0.04 }, { fractional: true });
      var lower = Tier0.yearsToFire(h, T, { swrRate: LOWER_SWR }, { fractional: true });
      if (!Money.isOk(four)) return four;
      if (!Money.isOk(lower)) return lower;
      var fiFour = Tier0.fireNumber(h, { swrRate: 0.04 }), fiLow = Tier0.fireNumber(h, { swrRate: LOWER_SWR });
      var extra = lower.value - four.value;
      return Money.ok('cantTell', {
        sides: [{ id: 'four', line: 'At 4%: ' + Money.formatCents(fiFour.value) + ', about ' + (Math.round(four.value * 10) / 10) + ' years away.' }, { id: 'lower', line: 'At ' + pct(LOWER_SWR) + ': ' + Money.formatCents(fiLow.value) + ', about ' + (Math.round(lower.value * 10) / 10) + ' years away.' }],
        range: 'The lower rate costs ' + (Math.round(extra * 10) / 10) + ' more year' + (Math.abs(extra) === 1 ? '' : 's') + ' of saving.',
        flip: { value: 0.04, at: LOWER_SWR, unit: 'rate', distance: extra, words: 'the difference between the two rates is ' + (Math.round(extra * 10) / 10) + ' years of work' },
        sentence: 'The numbers say the lower rate costs ' + (Math.round(extra * 10) / 10) + ' more years of saving; whether that safety is worth the years is yours to weigh.'
      });
    },
    oneMoreYear: function (h, T) {
      var fi = Tier0.fireNumber(h);
      var inv = Schema.investmentsCents(h);
      if (!Money.isOk(fi)) return fi;
      if (!Money.isOk(inv)) return inv;
      var a = Schema.resolveAssumptions(h, null, T);
      var sr = Tier0.savingsRate(h, T);
      var basis = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
      if (!Money.isOk(basis)) return basis;
      var spend = Schema.monthlyExpensesCents(h).value * MONTHS;
      var supportsNow = Math.round(inv.value * a.swrRate);
      var afterYear = Math.round((inv.value * (1 + a.returnReal) + basis.annualSavingsCents) * a.swrRate);
      var answer = supportsNow >= spend ? 'b' : 'a';
      return Money.ok(answer, {
        sides: [{ id: 'stay', line: 'One more year adds about ' + Money.formatCents(afterYear - supportsNow) + ' a year of safe income, for the whole retirement.' }, { id: 'go', line: 'The pot supports ' + Money.formatCents(supportsNow) + ' a year now against ' + Money.formatCents(spend) + ' of spending.' }],
        range: 'At ' + pct(a.returnReal) + ' real and a ' + pct(a.swrRate) + ' withdrawal rate.',
        flip: { value: supportsNow, at: spend, unit: 'cents', distance: supportsNow - spend, words: 'go now when the pot supports the spending; it supports ' + Money.formatCents(supportsNow) + ' against ' + Money.formatCents(spend) },
        sentence: answer === 'b' ? 'The numbers say the pot already supports the spending; one more year buys ' + Money.formatCents(afterYear - supportsNow) + ' a year of cushion, not the plan.' : 'The numbers say one more year: the pot is ' + Money.formatCents(spend - supportsNow) + ' a year short of the spending, and a year closes ' + Money.formatCents(afterYear - supportsNow) + ' of that.'
      });
    },
    rentVsBuy: function (h, T, o) {
      var rent = Schema.rentMonthlyCents(h);
      var P = T.priceToRent;
      if (!rent || !rent.cents) return Money.incomplete('Add the rent you pay in Cash Flow to run this.', ['rent']);
      if (!P) return Money.incomplete('The price-to-rent table is not loaded.', ['priceToRent']);
      var price = Money.isEntered(o && o.priceCents) ? o.priceCents : null;
      if (price === null) return Money.incomplete('Type the price of the place you would buy instead.', ['price']);
      var ratio = price / (rent.cents * MONTHS);
      var answer = ratio < P.bands.buyingFavouredBelow ? 'a' : ratio > P.bands.rentingFavouredAbove ? 'b' : 'cantTell';
      return Money.ok(answer, {
        sides: [{ id: 'buy', line: 'Buying favoured under ' + P.bands.buyingFavouredBelow + ' times the yearly rent.' }, { id: 'rent', line: 'Renting favoured over ' + P.bands.rentingFavouredAbove + ' times.' }],
        range: 'The national ratio sits near ' + P.ratio + '.',
        flip: { value: Math.round(ratio * 10) / 10, at: answer === 'a' ? P.bands.buyingFavouredBelow : P.bands.rentingFavouredAbove, unit: 'ratio', distance: Math.round((ratio - (answer === 'b' ? P.bands.rentingFavouredAbove : P.bands.buyingFavouredBelow)) * 10) / 10, words: Money.formatCents(price) + ' is ' + (Math.round(ratio * 10) / 10) + ' times your yearly rent of ' + Money.formatCents(rent.cents * MONTHS) },
        sentence: answer === 'a' ? 'The numbers favour buying at this price and rent.' : answer === 'b' ? 'The numbers favour renting at this price and rent.' : 'The numbers say neutral: the price sits between the two bands.'
      });
    }
  };

  function run(id, household, tables, opts) {
    var d = byId(tables, id);
    if (!d) return Money.incomplete('No debate called ' + id + '.', ['debate']);
    var fn = FN[d.fn];
    if (!fn) return Money.incomplete('The debate ' + id + ' has no engine function.', ['fn']);
    var r = fn(household || {}, tables || {}, opts || {});
    if (Money.isOk(r)) { r.debate = d; r.answerSide = r.value === 'a' ? d.sides[0].id : r.value === 'b' ? d.sides[1].id : null; }
    return r;
  }

  return { LOWER_SWR: LOWER_SWR, list: list, byId: byId, run: run, FN: FN };
});
