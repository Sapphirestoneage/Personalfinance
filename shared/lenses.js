/* ==========================================================================
   shared/lenses.js — a lens re-reads DAITE numbers and returns a verdict.
   --------------------------------------------------------------------------
   Thirty-three lenses in data/lenses.json, seven domains, one default a
   domain. A lens never adds a field: it reads what the owner rooms already
   hold, through the engines that already compute it (one formula, one
   function), and says in one sentence what a well-known framework would say
   about it — then who it is for and who it is not for. Rooms never write
   lens logic; they call render(). DECISIONS.md D-175.

   The name: SLAF.Lens is the four-way $ / hours / bought / pushed toggle
   (D-094). This is SLAF.Lenses — plural, the cards.

     use(table)                        hand it data/lenses.json once
     all() · get(id) · domains()       the table
     byDomain(domain) · defaultFor(domain)
     measure(id, household, tables)    Result: value + tokens + band
     verdictFor(lens, m)               { zone, text } from the measure
     render(id, household, tables)     one card's HTML
     renderDomain(domain, h, tables, { more })   default card, or all
     renderAll(h, tables, { more })    every domain
     mount(hostId, getHousehold, getTables)      the section with its toggles
   Preferences (shared/prefs.js): `lenses.more` (off), `showFrameworkNames`.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node
    ? { Money: require('./money.js'), Schema: require('./schema.js'), Prefs: require('./prefs.js') }
    : { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Prefs: root.SLAF && root.SLAF.Prefs };
  /* Engines are reached for at call time, so a page that lacks one shows
     "not loaded" on that card instead of failing to load the library. */
  var PATHS = { Tier0: '../engines/tier0.js', CashFlow: '../engines/cashflow.js', Hourly: '../engines/hourly.js',
    Fire: '../engines/fire.js', Foo: '../engines/foo.js', Debt: '../engines/debt.js', TaxRoom: '../engines/taxroom.js',
    Housing: '../engines/housing.js', QuickMath: '../engines/quickmath.js', Draftt: '../engines/draftt.js', Levers: './levers.js' };
  function engine(name) {
    if (node) { try { return require(PATHS[name]); } catch (e) { return null; } }
    return (root.SLAF && root.SLAF[name]) || null;
  }
  var api = factory(deps.Money, deps.Schema, deps.Prefs, engine);
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Lenses = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Prefs, engine) {
  'use strict';

  var MONTHS = 12, HOURS_FACTOR = 4.33;
  var TABLE = null;
  function use(table) { TABLE = table || TABLE; return TABLE; }
  function table() {
    if (TABLE) return TABLE;
    if (typeof module === 'object' && module.exports) { try { TABLE = require('../data/lenses.json'); } catch (e) { TABLE = null; } }
    return TABLE;
  }
  function all() { var t = table(); return t ? t.lenses.slice() : []; }
  function get(id) { return all().filter(function (l) { return l.id === id; })[0] || null; }
  function domains() { var t = table(); return t ? t.domains.slice() : []; }
  function byDomain(domain) { return all().filter(function (l) { return l.domain === domain; }); }
  function defaultFor(domain) {
    var d = domains().filter(function (x) { return x.id === domain; })[0];
    return d ? get(d['default']) : null;
  }

  /* ---- Small readers shared by several measures --------------------------- */
  function notLoaded(name) { return Money.incomplete('The ' + name + ' engine is not loaded on this page.', [name]); }
  function pct(v, d) { return Money.formatRate(v, { decimals: d === undefined ? 0 : d }); }
  function money(c) { return Money.formatCents(c); }
  function years(y) { var r = Math.round(y * 10) / 10; return r === 1 ? '1 year' : r + ' years'; }
  function takeHomeMonthly(h, T) { return Schema.takeHomeMonthlyCents(h, T); }
  function shareOf(numCents, denom, denomName) {
    if (!Money.isOk(denom)) return denom;
    return Money.safeDivide(numCents, denom.value, { denominatorName: denomName, zeroReason: 'Nothing to divide by yet.' });
  }
  function liveDebts(h) {
    return Schema.aggregatableDebts(h).filter(function (d) { return Money.isEntered(d.balanceCents) && d.balanceCents > 0 && Money.isEntered(d.rate); });
  }
  function topDebt(h) {
    if (Schema.saidNoDebt(h)) return { none: true };
    var debts = liveDebts(h);
    if (!debts.length) return null;
    var top = debts.slice().sort(function (a, b) { return b.rate - a.rate; })[0];
    return { none: false, top: top, debts: debts };
  }
  function debtLabel(d) { return d.label || (d.type ? d.type.replace(/_/g, ' ') : 'a debt'); }
  function retirementByCharacter(h) {
    var out = { pretax: 0, roth: 0, taxable: 0, hsa: 0, known: 0, unknown: 0 };
    (h.assets || []).forEach(function (a) {
      if (!Money.isEntered(a.valueCents) || a.valueCents <= 0) return;
      if (a.category !== 'investment' && a.category !== 'retirement') return;
      var c = a.taxCharacter;
      if (c === 'pretax' || c === 'roth' || c === 'taxable' || c === 'hsa') { out[c] += a.valueCents; out.known += a.valueCents; }
      else out.unknown += a.valueCents;
    });
    return out;
  }
  function draftt(h, T, rowId) {
    var D = engine('Draftt');
    if (!D) return notLoaded('Draftt');
    if (!T || !T.bands) return Money.incomplete('The bands table is not loaded.', ['bands']);
    var row = D.rows(h, T, {}).rows.filter(function (r) { return r.id === rowId; })[0];
    if (!row) return Money.incomplete('No such DRAFTT row.', [rowId]);
    if (!Money.isOk(row.share)) return row.share;
    return Money.ok(row.share.value, { band: row.band ? { low: row.band.low, high: row.band.high } : null, share: pct(row.share.value), amount: money(row.amountCents) });
  }
  function ageOf(h) { var a = Schema.primaryAge(h); return Money.isEntered(a) ? a : null; }

  /* ---- The measures: one per lens id, each a few lines ------------------- */
  var MEASURES = {
    fatwants: function (h, T) {
      var fat = Schema.fat(h); var keys = Schema.FAT_NEEDS; var missing = [];
      var total = 0;
      keys.forEach(function (k) { if (Money.isOk(fat[k])) total += fat[k].value; else missing.push(k + 'Monthly'); });
      if (missing.length) return Money.incomplete('Fill in food, accommodation and transportation in Cash Flow to see this.', missing);
      var s = shareOf(total, takeHomeMonthly(h, T), 'takeHome');
      return Money.isOk(s) ? Money.ok(s.value, { share: pct(s.value), amount: money(total) }) : s;
    },
    /* 15.5: the sinking fund. The yearly lines over twelve: set that much
       aside each month and nothing surprises you. */
    sinkingfund: function (h) {
      var yr = Schema.annualMonthlyCents(h);
      if (!yr.on) return Money.incomplete('The "Also once a year" switch is off in Settings.', ['annualLines']);
      if (!yr.count) return Money.incomplete('Add a yearly cost in Cash Flow (insurance, gifts, registration) to see this.', ['annualLines']);
      return Money.ok(yr.monthlyCents, { amount: money(yr.monthlyCents), total: money(yr.annualCents), count: yr.count + (yr.count === 1 ? ' yearly cost' : ' yearly costs') });
    },
    fiftythirty: function (h, T) {
      var th = takeHomeMonthly(h, T), spend = Schema.monthlyExpensesCents(h);
      if (!Money.isOk(th)) return th;
      if (!Money.isOk(spend)) return spend;
      var s = shareOf(th.value - spend.value, th, 'takeHome');
      return Money.isOk(s) ? Money.ok(s.value, { share: pct(s.value), left: money(th.value - spend.value) }) : s;
    },
    moneyguy25: function (h, T) {
      var CF = engine('CashFlow'); if (!CF) return notLoaded('CashFlow');
      var c = CF.savingsRateContributed(h, T);
      return Money.isOk(c) ? Money.ok(c.value, { share: pct(c.value), amount: money(c.annualSavingsCents) }) : c;
    },
    conscious: function (h, T) {
      var w = h.expenses && h.expenses.wants && h.expenses.wants.totalCents;
      if (!Money.isEntered(w)) return Money.incomplete('Add the wants line in Cash Flow to see this.', ['wantsMonthly']);
      var s = shareOf(w, takeHomeMonthly(h, T), 'takeHome');
      return Money.isOk(s) ? Money.ok(s.value, { share: pct(s.value), amount: money(w) }) : s;
    },
    ymoyl: function (h, T) {
      var H = engine('Hourly'); if (!H) return notLoaded('Hourly');
      var wage = H.realHourlyWage(h, T); if (!Money.isOk(wage)) return wage;
      if (wage.value <= 0) return Money.incomplete('The job costs more than it pays, so an hour of it buys nothing.', ['realHourlyWage']);
      var spend = Schema.monthlyExpensesCents(h); if (!Money.isOk(spend)) return spend;
      var hours = spend.value / wage.value;
      return Money.ok(hours, { hours: Math.round(hours), wage: Money.formatCents(wage.value, { decimals: 2 }), hoursWeek: Math.round(hours / HOURS_FACTOR) });
    },
    diewithzero: function (h) {
      var age = ageOf(h);
      if (age === null) return Money.incomplete('Add your date of birth in Start Here to place yourself on the curve.', ['dob']);
      return Money.ok(age, { age: age });
    },

    avalanche: function (h, T) {
      var t = topDebt(h);
      if (t === null) return Money.incomplete('Add your debts, or say there are none, to see this.', ['debts']);
      var threshold = (T && T.fooRules && T.fooRules.thresholds && T.fooRules.thresholds.highInterestDebtRate) || 0.075;
      if (t.none) return Money.ok(0, { band: { low: 0, high: threshold }, none: true, threshold: pct(threshold, 1) });
      return Money.ok(t.top.rate, { band: { low: 0, high: threshold }, top: debtLabel(t.top), rate: pct(t.top.rate, 1), threshold: pct(threshold, 1), count: t.debts.length });
    },
    snowball: function (h) {
      var t = topDebt(h);
      if (t === null) return Money.incomplete('Add your debts, or say there are none, to see this.', ['debts']);
      if (t.none) return Money.incomplete('No debt to snowball.', []);
      var small = t.debts.slice().sort(function (a, b) { return a.balanceCents - b.balanceCents; })[0];
      var min = Money.isEntered(small.minPaymentCents) && small.minPaymentCents > 0 ? small.minPaymentCents : null;
      var monthsText = min ? Money.formatMonths(Math.ceil(small.balanceCents / min)) : 'a minimum you have not entered';
      return Money.ok(small.balanceCents, { label: debtLabel(small), balance: money(small.balanceCents), months: monthsText, rate: pct(small.rate, 1),
        costNote: small.rate >= 0.075 ? 'a lot to leave for last if it were not first' : 'little to carry while you clear it' });
    },
    moneyguyage: function (h) {
      var L = get('moneyguyage'); var byDecade = (L && L.thresholdsByDecade) || {};
      var t = topDebt(h);
      if (t === null) return Money.incomplete('Add your debts, or say there are none, to see this.', ['debts']);
      var age = ageOf(h);
      if (age === null) return Money.incomplete('Add your date of birth in Start Here: the line depends on your decade.', ['dob']);
      var decade = Math.max(20, Math.min(60, Math.floor(age / 10) * 10));
      var threshold = byDecade[String(decade)];
      if (!Money.isEntered(threshold)) return Money.incomplete('No threshold for that decade.', ['thresholdsByDecade']);
      var tokens = { band: { low: 0, high: threshold }, threshold: pct(threshold), decade: decade + 's' };
      if (t.none) return Money.ok(0, Object.assign(tokens, { none: true }));
      return Money.ok(t.top.rate, Object.assign(tokens, { top: debtLabel(t.top), rate: pct(t.top.rate, 1) }));
    },
    crossover: function (h) {
      var t = topDebt(h);
      if (t === null) return Money.incomplete('Add your debts, or say there are none, to see this.', ['debts']);
      var r = Schema.resolveAssumptions(h).returnReal;
      var tokens = { band: { low: 0, high: r }, crossover: pct(r, 1) };
      if (t.none) return Money.ok(0, Object.assign(tokens, { none: true }));
      var above = t.debts.filter(function (d) { return d.rate > r; }).length;
      return Money.ok(t.top.rate, Object.assign(tokens, { top: debtLabel(t.top), rate: pct(t.top.rate, 1), aboveCount: above, count: t.debts.length }));
    },
    drafttD: function (h, T) { return draftt(h, T, 'debt'); },

    foo: function (h, T) {
      var F = engine('Foo'); if (!F) return notLoaded('Foo');
      if (!T || !T.fooRules) return Money.incomplete('The FOO rules are not loaded.', ['fooRules']);
      var e = F.evaluate(h, T);
      if (e.status === 'incomplete') return Money.incomplete(e.reason, ['foo']);
      if (e.status === 'unknown' || !e.placement) {
        var s = e.stoppedAt;
        return Money.incomplete(s && s.reason ? s.reason : 'Fill in Start Here to place yourself on the ladder.', (s && s.missing) || ['foo']);
      }
      return Money.ok(e.placement.step, { step: e.placement.step, label: e.placement.label });
    },
    threefund: function (h) {
      var a = h.allocation || {};
      if (!Money.isEntered(a.bonds)) return Money.incomplete('Set a target mix in Where It Goes to check it.', ['allocation']);
      return Money.ok(a.bonds, { share: pct(a.bonds), stocks: Money.isEntered(a.stocks) ? pct(a.stocks) : 'not set' });
    },
    bucket: function (h) {
      var cash = Schema.cashCents(h), spend = Schema.monthlyExpensesCents(h);
      if (!Money.isOk(cash)) return cash;
      if (!Money.isOk(spend)) return spend;
      var y = Money.safeDivide(cash.value, spend.value * MONTHS, { denominatorName: 'monthlyExpenses', zeroReason: 'No spending, so every dollar of cash lasts forever.' });
      return Money.isOk(y) ? Money.ok(y.value, { years: years(y.value), cash: money(cash.value) }) : y;
    },
    assetlocation: function (h, T) {
      var TR = engine('TaxRoom'); if (!TR) return notLoaded('TaxRoom');
      var r = retirementByCharacter(h);
      if (r.known <= 0) return Money.incomplete('Say how each account is taxed in the Statement to see this.', ['taxCharacter']);
      var p = TR.picture(h, T); if (!Money.isOk(p)) return p;
      var marginal = p.bracket ? p.bracket.rate : null;
      if (!Money.isEntered(marginal)) return Money.incomplete('The bracket is not known yet.', ['federalBrackets']);
      var share = r.pretax / r.known;
      /* A higher bracket now favours pre-tax; a lower one, Roth. The band is
         the half that matches the bracket, read against 22% as the middle. */
      var band = marginal >= 0.22 ? { low: 0.5, high: 1 } : { low: 0, high: 0.5 };
      return Money.ok(share, { band: band, share: pct(share), roth: pct(r.roth / r.known), taxable: pct(r.taxable / r.known), marginal: pct(marginal) });
    },
    glidepath: function (h, T) {
      var T0 = engine('Tier0'); if (!T0) return notLoaded('Tier0');
      var prog = T0.fireProgress(h, T); if (!Money.isOk(prog)) return prog;
      var progress = Math.max(0, Math.min(1, prog.value));
      var suggested = 0.9 - 0.3 * progress;
      var a = h.allocation || {};
      if (!Money.isEntered(a.stocks)) return Money.incomplete('Set a target mix in Where It Goes: ' + pct(progress) + ' of the way to the target suggests about ' + pct(suggested) + ' in stocks.', ['allocation']);
      return Money.ok(a.stocks, { band: { low: suggested - 0.1, high: suggested + 0.1 }, share: pct(a.stocks), progress: pct(progress), suggested: pct(suggested) });
    },
    coastfi: function (h, T) {
      var F = engine('Fire'); if (!F) return notLoaded('Fire');
      if (!T || !T.fireVariants) return Money.incomplete('The FIRE variants table is not loaded.', ['fireVariants']);
      var target = (h.targets || {}).coastAge;
      var c = F.calculateFIRE(h, T, Money.isEntered(target) ? { variantId: 'coast', coastTargetAge: target } : { variantId: 'coast' });
      if (!Money.isOk(c)) return c;
      var inv = Schema.investmentsCents(h); if (!Money.isOk(inv)) return inv;
      var s = Money.safeDivide(inv.value, c.value, { denominatorName: 'coastNumber', zeroReason: 'A coast number of zero.' });
      return Money.isOk(s) ? Money.ok(s.value, { share: pct(s.value), invested: money(inv.value), coast: money(c.value), target: c.coastTargetAge, age: c.currentAge }) : s;
    },

    tco: function (h, T) {
      var line = Schema.fat(h).transportation; if (!Money.isOk(line)) return line;
      var s = shareOf(line.value, takeHomeMonthly(h, T), 'takeHome');
      return Money.isOk(s) ? Money.ok(s.value, { share: pct(s.value), amount: money(line.value) }) : s;
    },
    twentythreeeight: function (h) {
      var Q = engine('QuickMath'); if (!Q) return notLoaded('QuickMath');
      var line = Schema.fat(h).transportation; if (!Money.isOk(line)) return line;
      var gross = Schema.grossAnnualIncomeCents(h); if (!Money.isOk(gross)) return gross;
      var s = Money.safeDivide(line.value, gross.value / MONTHS, { denominatorName: 'grossAnnualIncome', zeroReason: 'No income to size a payment against.' });
      if (!Money.isOk(s)) return s;
      var rule = Q.carRule2038(h, {});
      return Money.ok(s.value, { share: pct(s.value), amount: money(line.value), maxPrice: Money.isOk(rule) && Money.isEntered(rule.value) ? money(rule.value) : Money.EM_DASH });
    },
    carnetworth: function (h) {
      var T0 = engine('Tier0'); if (!T0) return notLoaded('Tier0');
      var cars = (h.assets || []).filter(function (a) { return a.category === 'vehicle' && Money.isEntered(a.valueCents); });
      if (!cars.length) return Money.incomplete('Add a vehicle in the Statement to see this.', ['assets']);
      var total = cars.reduce(function (t, a) { return t + a.valueCents; }, 0);
      var nw = T0.netWorth(h); if (!Money.isOk(nw)) return nw;
      if (nw.value <= 0) return Money.incomplete('Net worth is not above zero, so the share has no meaning yet.', ['netWorth']);
      return Money.ok(total / nw.value, { share: pct(total / nw.value), amount: money(total) });
    },
    returnonhassle: function (h, T) {
      var H = engine('Hourly'); if (!H) return notLoaded('Hourly');
      var wage = H.realHourlyWage(h, T); if (!Money.isOk(wage)) return wage;
      return Money.ok(wage.value, { wage: Money.formatCents(wage.value, { decimals: 2 }), weekly: money(wage.value), monthly: money(Math.round(wage.value * HOURS_FACTOR)) });
    },

    twentyfive: function (h) {
      var line = Schema.fat(h).accommodation; if (!Money.isOk(line)) return line;
      var gross = Schema.grossAnnualIncomeCents(h); if (!Money.isOk(gross)) return gross;
      var s = Money.safeDivide(line.value, gross.value / MONTHS, { denominatorName: 'grossAnnualIncome', zeroReason: 'No income to measure housing against.' });
      return Money.isOk(s) ? Money.ok(s.value, { share: pct(s.value), amount: money(line.value) }) : s;
    },
    rentbuy: function (h, T) {
      var Ho = engine('Housing'); if (!Ho) return notLoaded('Housing');
      var r = Ho.compare(h, T); if (!Money.isOk(r)) return r;
      if (r.rentIsNone || !Money.isEntered(r.rentCents) || r.rentCents <= 0) return Money.incomplete('Add a rent to weigh the purchase against.', ['rentMonthly']);
      var savedMonthly = r.rentCents - r.unrecoverableCents;
      if (savedMonthly <= 0) return Money.incomplete('Owning’s unrecoverable costs (' + money(r.unrecoverableCents) + ' a month) are at or above the rent, so buying never breaks even on costs alone.', ['housing']);
      var y = r.closingCents / (savedMonthly * MONTHS);
      return Money.ok(y, { years: years(y), closing: money(r.closingCents), saved: money(savedMonthly) });
    },
    househack: function (h, T) {
      var L = engine('Levers'); if (!L) return notLoaded('Levers');
      if (T && T.levers) L.use(T.levers);
      var lv = L.get('househack'); if (!lv) return Money.incomplete('The lever library is not loaded.', ['levers']);
      var gain = L.monthlyGainCents('househack', h); if (!Money.isOk(gain)) return gain;
      var hourly = L.impliedHourlyCents('househack', h);
      var line = Schema.fat(h).accommodation;
      return Money.ok(gain.value, { gain: money(gain.value), line: money(line.value), hours: lv.hoursPerWeek,
        hourly: Money.isOk(hourly) ? Money.formatCents(hourly.value, { decimals: 2 }) : Money.EM_DASH,
        applies: L.applies('househack', h) ? 'It applies to you: you own a place or are weighing one.' : 'It does not apply yet: no property, and no price weighed in Housing Decision.' });
    },
    fiveyear: function (h, T) {
      var price = h.housing && h.housing.priceCents;
      if (!Money.isEntered(price) || price <= 0) return Money.incomplete('Type a price in Housing Decision to weigh the round trip.', ['housingPrice']);
      var c = T && T.housingConventions;
      if (!c || !Money.isEntered(c.closingCostRate) || !Money.isEntered(c.sellingCostRate)) return Money.incomplete('The housing conventions are not loaded.', ['housingConventions']);
      var round = Math.round(price * (c.closingCostRate + c.sellingCostRate));
      return Money.ok(round, { price: money(price), roundTrip: money(round) + ' (' + pct(c.closingCostRate + c.sellingCostRate) + ')' });
    },
    drafttA: function (h, T) { return draftt(h, T, 'accommodation'); },

    takehome: function (h, T) {
      var th = Schema.takeHomeAnnualCents(h, T); if (!Money.isOk(th)) return th;
      var gross = th.grossAnnualIncomeCents;
      var s = Money.safeDivide(th.value, gross, { denominatorName: 'grossAnnualIncome', zeroReason: 'No income.' });
      return Money.isOk(s) ? Money.ok(s.value, { share: pct(s.value), takeHome: money(Math.round(th.value / MONTHS)), gross: money(Math.round(gross / MONTHS)), tax: money(th.estimatedTaxCents) }) : s;
    },
    rhw: function (h, T) {
      var H = engine('Hourly'); if (!H) return notLoaded('Hourly');
      var w = H.realHourlyWage(h, T); if (!Money.isOk(w)) return w;
      return Money.ok(w.value, { real: Money.formatCents(w.value, { decimals: 2 }), nominal: Money.formatCents(w.nominalHourlyCents, { decimals: 2 }), hours: Math.round(w.totalHoursPerWeek * 10) / 10 });
    },
    savingsrate: function (h, T) {
      var T0 = engine('Tier0'); if (!T0) return notLoaded('Tier0');
      var r = T0.savingsRate(h, T).excludingMatch; if (!Money.isOk(r)) return r;
      return Money.ok(r.value, { share: pct(r.value) });
    },
    simplemath: function (h, T) {
      var T0 = engine('Tier0'); if (!T0) return notLoaded('Tier0');
      var r = T0.savingsRate(h, T).excludingMatch; if (!Money.isOk(r)) return r;
      var ret = Schema.resolveAssumptions(h).returnReal;
      var y = yearsFromRate(r.value, ret), y10 = yearsFromRate(Math.min(1, r.value + 0.10), ret);
      if (y === null) return Money.incomplete('At ' + pct(r.value) + ' saved, FI never arrives from zero: the rate has to rise first.', ['savingsRate']);
      return Money.ok(y, { share: pct(r.value), years: Math.round(y), yearsPlus: y10 === null ? 'never' : Math.round(y10) + ' years', returnRate: pct(ret, 1) });
    },

    effmarg: function (h, T) {
      var TR = engine('TaxRoom'); if (!TR) return notLoaded('TaxRoom');
      var p = TR.picture(h, T); if (!Money.isOk(p)) return p;
      return Money.ok(p.value, { effective: pct(p.value, 1), marginal: p.bracket && Money.isEntered(p.bracket.rate) ? pct(p.bracket.rate) : Money.EM_DASH });
    },
    fourbuckets: function (h) {
      var r = retirementByCharacter(h);
      var ret = h.retirement || {};
      var inUse = {
        pretax: r.pretax > 0 || (Money.isEntered(ret.contributionPercent) && ret.contributionPercent > 0),
        roth: r.roth > 0 || (Money.isEntered(ret.rothContributedCents) && ret.rothContributedCents > 0),
        taxable: r.taxable > 0,
        hsa: r.hsa > 0 || (Money.isEntered(ret.hsaContributedCents) && ret.hsaContributedCents > 0)
      };
      if (r.known <= 0 && !inUse.pretax && !inUse.roth && !inUse.hsa) {
        return Money.incomplete('Say how each account is taxed in the Statement, or what you contribute in Where It Goes, to see this.', ['taxCharacter']);
      }
      var names = { pretax: 'pre-tax', roth: 'Roth', taxable: 'taxable', hsa: 'HSA' };
      var filled = Object.keys(inUse).filter(function (k) { return inUse[k]; }), empty = Object.keys(inUse).filter(function (k) { return !inUse[k]; });
      return Money.ok(filled.length, { filled: filled.length, filledList: filled.map(function (k) { return names[k]; }).join(', ') || 'none', emptyList: empty.map(function (k) { return names[k]; }).join(', ') || 'none' });
    },
    headroom: function (h, T) {
      var TR = engine('TaxRoom'); if (!TR) return notLoaded('TaxRoom');
      var p = TR.picture(h, T); if (!Money.isOk(p)) return p;
      var b = p.bracket || {};
      if (!Money.isEntered(b.roomCents)) return Money.incomplete('You are in the top bracket; there is no next one.', []);
      return Money.ok(b.roomCents, { room: money(b.roomCents), marginal: pct(b.rate), next: Money.isEntered(b.nextRate) ? pct(b.nextRate) : Money.EM_DASH });
    }
  };

  /** Mr. Money Mustache's arithmetic: saving share s of take-home, spending
      the rest, at real return r, until the pot is 25× spending. From zero. */
  function yearsFromRate(s, r) {
    if (!Money.isEntered(s) || s <= 0) return null;
    if (s >= 1) return 0;
    var spend = 1 - s, target = 25 * spend;
    if (r <= 0) return target / s;
    /* pot after n years = s × ((1+r)^n − 1) / r = target */
    var n = Math.log(1 + target * r / s) / Math.log(1 + r);
    return n;
  }

  function measure(id, household, tables) {
    var L = get(id);
    if (!L) return Money.incomplete('No such lens.', ['lens']);
    var fn = MEASURES[id];
    if (!fn) return Money.incomplete('This lens has no measure yet.', ['measure']);
    var h = household || {};
    try { return fn(h, tables || {}); } catch (e) { return Money.incomplete('This lens could not be read: ' + (e && e.message ? e.message : e), ['lens']); }
  }

  /* ---- Verdict: the band picks the sentence, the tokens fill it --------- */
  function fill(text, m) {
    return String(text).replace(/\{(\w+)\}/g, function (_, k) {
      var v = m[k];
      if (v === undefined || v === null) return k === 'share' && Money.isEntered(m.value) ? pct(m.value) : Money.EM_DASH;
      return String(v);
    });
  }
  function verdictFor(lens, m) {
    if (!Money.isOk(m)) return { zone: 'incomplete', text: m.reason || 'Not enough entered to read this.' };
    var band = m.band || lens.band;
    var v = lens.verdict || [];
    if (!band) return { zone: 'stated', text: fill(v[0] || '', m), band: null };
    var zone = m.value < band.low - 1e-9 ? 'under' : m.value > band.high + 1e-9 ? 'over' : 'in';
    var i = zone === 'under' ? 0 : zone === 'in' ? 1 : 2;
    return { zone: zone, text: fill(v[i] || v[v.length - 1] || '', m), band: band };
  }

  /* ---- Cards ------------------------------------------------------------- */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function frameworkNames() {
    if (!Prefs) return true;
    var v = Prefs.get('showFrameworkNames', null);
    if (v === true || v === false) return v;
    /* The onboarding split: the beginner door hides the names, the FI door
       shows them. With no door chosen, the names show. */
    return Prefs.get('door', null) !== 'beginner';
  }
  function bandText(lens, m, band) {
    if (!band) return lens.measure || '';
    var unit = function (x) {
      if (lens.id === 'diewithzero') return String(Math.round(x));
      if (lens.id === 'bucket' || lens.id === 'rentbuy') return years(x);
      if (lens.id === 'fourbuckets') return String(x);
      if (lens.id === 'coastfi') return x >= 1 ? 'the coast number' : pct(x);
      return pct(x);
    };
    var low = band.low, high = band.high;
    var text = high >= 100 || (lens.id === 'coastfi' && high >= 100) ? 'at least ' + unit(low)
      : (low <= 0 && lens.id !== 'diewithzero') ? 'under ' + unit(high)
      : unit(low) + ' to ' + unit(high);
    return (lens.measure ? lens.measure + ' · ' : '') + 'band ' + text;
  }
  function figureText(lens, m) {
    if (!Money.isOk(m)) return Money.EM_DASH;
    switch (lens.id) {
      case 'diewithzero': return 'age ' + m.age;
      case 'foo': return 'step ' + m.step;
      case 'ymoyl': return m.hours + ' h';
      case 'bucket': case 'rentbuy': return m.years;
      case 'simplemath': return m.years + ' years';
      case 'snowball': case 'househack': case 'fiveyear': case 'headroom': case 'sinkingfund': return money(m.value);
      case 'rhw': case 'returnonhassle': return Money.formatCents(m.value, { decimals: 2 }) + '/h';
      case 'fourbuckets': return m.filled + ' of 4';
      default: return pct(m.value);
    }
  }
  function render(id, household, tables) {
    var lens = get(id);
    if (!lens) return '';
    var m = measure(id, household, tables);
    var v = verdictFor(lens, m);
    var names = frameworkNames();
    return '<article class="lens-card is-' + v.zone + '" data-lens="' + esc(lens.id) + '" data-domain="' + esc(lens.domain) + '">'
      + '<header><b>' + esc(names ? lens.name : (lens.plain || lens.name)) + '</b>'
      + (names ? '<small>' + esc(lens.source) + '</small>' : '') + '</header>'
      + '<p class="lens-rule">' + esc(lens.rule) + '</p>'
      + '<div class="lens-row"><span class="lens-figure">' + esc(figureText(lens, m)) + '</span>'
      + '<span class="lens-band">' + esc(bandText(lens, m, v.band === undefined ? lens.band : v.band)) + '</span></div>'
      + '<p class="lens-verdict">' + (v.zone === 'under' || v.zone === 'in' || v.zone === 'over' ? '<em>' + v.zone + '</em> ' : '') + esc(v.text) + '</p>'
      + '<p class="lens-who"><span><b>For:</b> ' + esc(lens.forWhom) + '</span><span><b>Not for:</b> ' + esc(lens.notForWhom) + '</span></p>'
      + '</article>';
  }
  function renderDomain(domain, household, tables, opts) {
    var more = !!(opts && opts.more);
    var d = domains().filter(function (x) { return x.id === domain; })[0];
    if (!d) return '';
    var list = more ? byDomain(domain) : [defaultFor(domain)].filter(Boolean);
    return '<div class="lens-domain" data-domain="' + esc(domain) + '"><h3>' + esc(d.label) + '</h3>'
      + list.map(function (l) { return render(l.id, household, tables); }).join('') + '</div>';
  }
  function renderAll(household, tables, opts) {
    return domains().map(function (d) { return renderDomain(d.id, household, tables, opts); }).join('');
  }

  /** The section: its two toggles and the cards. Rebuilt on each paint; it
      holds no live inputs (buttons only), so no LiveForm guard is needed. */
  function mount(hostId, getHousehold, getTables) {
    var host = typeof document !== 'undefined' && document.getElementById(hostId);
    if (!host) return null;
    function paint() {
      var more = Prefs ? !!Prefs.get('lenses.more', false) : false;
      var names = frameworkNames();
      host.innerHTML = '<div class="lens-toggles">'
        + '<button type="button" class="slaf-btn slaf-btn--quiet" id="lens-more" aria-pressed="' + more + '">More ways to look at this</button>'
        + '<button type="button" class="slaf-btn slaf-btn--quiet" id="lens-names" aria-pressed="' + names + '">Show framework names</button>'
        + '</div><div class="lens-domains">' + renderAll(getHousehold(), getTables(), { more: more }) + '</div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('#lens-more, #lens-names');
      if (!b || !Prefs) return;
      if (b.id === 'lens-more') Prefs.set('lenses.more', !Prefs.get('lenses.more', false));
      else Prefs.set('showFrameworkNames', !frameworkNames());
      paint();
    });
    paint();
    return { paint: paint };
  }

  return { use: use, all: all, get: get, domains: domains, byDomain: byDomain, defaultFor: defaultFor,
    measure: measure, verdictFor: verdictFor, yearsFromRate: yearsFromRate, frameworkNames: frameworkNames,
    render: render, renderDomain: renderDomain, renderAll: renderAll, mount: mount, MEASURES: MEASURES };
});
