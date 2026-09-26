/* ==========================================================================
   safeword/engines/longgame.js, retiring without a boss, and the exit. SF-006.
   --------------------------------------------------------------------------
   Growth is SPARKS' engines/projection.js, carried byte for byte. The
   contribution limits are SPARKS' data/irs_limits_2026.json. This file
   decides what to feed them and reads out:

     room        how much the chosen account can take this year, from the
                 same profit the tax page uses (SEP: 20% of profit after the
                 deductible half, the classic sole-proprietor figure)
     path        the balance year by year to the stop age
     atStop      the balance then, and what 4% of it pays a month
     number      25 times a lean year, and the year the path crosses it
     exit        the cushion for the year you plan to step away from the
                 work, and what to set aside a month to have it by then

   LongGame.read(h, T, S, TX) -> { limits, room: Result, path: Result, atStop: Result,
     monthlyAtStop: Result, number: Result, crossesAtYear: Result, exit: { years, cushion, monthly } }
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Projection: require('./projection.js'), Streams: require('./streams.js'), House: require('./house.js'), TaxPlan: require('./taxplan.js') }
    : { Money: root.SLAF && root.SLAF.Money, Projection: root.SLAF && root.SLAF.Projection, Streams: root.SLAF && root.SLAF.Streams, House: root.SLAF && root.SLAF.House, TaxPlan: root.SLAF && root.SLAF.TaxPlan };
  var api = factory(deps.Money, deps.Projection, deps.Streams, deps.House, deps.TaxPlan);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.LongGame = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Projection, Streams, House, TaxPlan) {
  'use strict';
  var WITHDRAWAL_RATE = 0.04;
  var YEARS_OF_SPENDING = 25;

  function room(h, T, TX) {
    var L = T.irsLimits.limits, over50 = Money.isEntered(h.you.age) && h.you.age >= 50;
    var acct = h.longgame.account || 'none';
    var iraCents = Math.round((L.ira + (over50 ? L.iraCatchup50Plus : 0)) * 100);
    var electiveCents = Math.round((L.elective401k + (over50 ? L.elective401kCatchup50Plus : 0)) * 100);
    var additionsCents = Math.round(L.annualAdditions * 100);
    if (acct === 'none') return Money.incomplete('Choose an account to see how much it can take.', ['account']);
    if (acct === 'roth' || acct === 'ira') return Money.ok(iraCents, { basis: 'the yearly IRA limit', catchup: over50 });
    if (acct === 'job401k') return Money.ok(electiveCents, { basis: 'the yearly deferral limit at a job', catchup: over50 });
    if (acct === 'taxable') return Money.ok(null, { basis: 'no limit; nothing is sheltered', unlimited: true });
    /* SEP and Solo 401(k) both hang off the self-employed profit. */
    if (!TX || !TX.profit || !Money.isOk(TX.profit) || !TX.se || !Money.isOk(TX.se)) return Money.incomplete('Needs the profit from the Taxes page.', ['profit']);
    var base = Math.max(0, TX.profit.value - TX.se.deductibleHalfCents);
    var employer = Math.min(Math.round(base * L.soloEmployerShareSoleProprietor), additionsCents);
    if (acct === 'sep') return Money.ok(employer, { basis: (L.soloEmployerShareSoleProprietor * 100) + '% of profit after the deductible half of SE tax', baseCents: base });
    var solo = Math.min(Math.min(electiveCents, base) + employer, additionsCents + (over50 ? Math.round(L.elective401kCatchup50Plus * 100) : 0));
    return Money.ok(solo, { basis: 'the deferral plus ' + (L.soloEmployerShareSoleProprietor * 100) + '% of profit after the deductible half', employerCents: employer, electiveCents: Math.min(electiveCents, base), catchup: over50 });
  }

  function read(h, T, S, TX) {
    S = S || Streams.read(h, T);
    TX = TX || TaxPlan.read(h, T, S, House.read(h, T, S));
    var g = h.longgame, lean = h.personal.leanMonthCents, thisYear = new Date().getFullYear();
    var years = Money.isEntered(h.you.age) && Money.isEntered(g.stopAge) ? g.stopAge - h.you.age : null;
    var missing = Money.missingFrom({ age: h.you.age, stopAge: g.stopAge, annualRate: g.annualRate, balanceCents: g.balanceCents, monthCents: g.monthCents });
    var path = missing.length ? Money.incomplete('Fill in the age, the stop age, the balance, the monthly amount and the rate.', missing)
      : years <= 0 ? Money.incomplete('The stop age has to be after your age.', ['stopAge'])
      : Projection.pathCents({ startCents: g.balanceCents, monthlyContributionCents: g.monthCents, annualRate: g.annualRate, years: years, contributeYears: years });
    var atStop = Money.isOk(path) ? Money.ok(path.value, { years: years, age: g.stopAge }) : path;
    var monthlyAtStop = Money.isOk(atStop) ? Money.ok(Math.round(atStop.value * WITHDRAWAL_RATE / 12), { rate: WITHDRAWAL_RATE }) : atStop;
    var number = Money.isEntered(lean) ? Money.ok(lean * 12 * YEARS_OF_SPENDING, { multiple: YEARS_OF_SPENDING }) : Money.incomplete('Add your lean month.', ['leanMonthCents']);
    var crosses = Money.incomplete('Needs the path and the number.', ['path', 'number']);
    if (Money.isOk(path) && Money.isOk(number)) {
      var hit = path.years.filter(function (r) { return r.balanceCents >= number.value; })[0];
      crosses = hit ? Money.ok(hit.year, { age: h.you.age + hit.year }) : Money.ok(null, { never: true, shortCents: number.value - path.value });
    }
    var exitYears = Money.isEntered(g.exitYear) ? g.exitYear - thisYear : null;
    var cushion = Money.isEntered(g.cushionMonths) && Money.isEntered(lean) ? Money.ok(g.cushionMonths * lean, { months: g.cushionMonths }) : Money.incomplete('Choose how many months the exit cushion should cover.', Money.isEntered(lean) ? ['cushionMonths'] : ['leanMonthCents']);
    var exitMonthly = !Money.isEntered(exitYears) ? Money.incomplete('Pick the year you plan to step away, if there is one.', ['exitYear'])
      : !Money.isOk(cushion) ? cushion
      : exitYears <= 0 ? Money.ok(cushion.value, { now: true })
      : Money.ok(Math.ceil(cushion.value / (exitYears * 12)), { months: exitYears * 12 });
    return { limits: T.irsLimits, room: room(h, T, TX), path: path, atStop: atStop, monthlyAtStop: monthlyAtStop, number: number, crossesAtYear: crosses,
      exit: { years: exitYears, year: g.exitYear, cushion: cushion, monthly: exitMonthly }, withdrawalRate: WITHDRAWAL_RATE, multiple: YEARS_OF_SPENDING };
  }
  return { read: read, room: room };
});
