/* ==========================================================================
   engines/presets.js — the Savings and Investments presets. D-129.

   A preset is a monthly figure the Budget room can stack into a bucket's
   Estimated without anyone typing a number: each one is read off a rule
   or a table that already exists, through the function that owns it.

     ruleOfFive   savings       QuickMath.ruleOfFive on the Big Purchase
                                room's price: the shortfall to five of it,
                                spread over the months until the purchase.
     maxIra       investments   the year's IRA limit, catch-up from age 50,
                                age from the spine's date of birth.
     emergencyFund savings      the gap to N months of spending in cash,
                                spread over a horizon — both from
                                data/savings_presets.json; spending is
                                Schema.monthlyExpensesCents, cash is
                                Schema.cashCents.
     max401k      investments   the year's elective 401(k) limit with its
                                catch-up — only when an employer 401(k) is
                                indicated (retirement.has401k === true).
                                Otherwise ABSENT, not disabled.

   Every function returns Results; a preset with nothing to read says why.
   Nothing here writes. Money is integer cents.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), QuickMath: require('./quickmath.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, QuickMath: root.SLAF && root.SLAF.QuickMath };
  }
  var api = factory(deps.Money, deps.Schema, deps.QuickMath);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Presets = api; }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (Money, Schema, QuickMath) {
  'use strict';

  var MONTHS = 12;
  var CATCH_UP_AGE = 50;
  var DEFAULT_MONTHS_AWAY = 12;

  var DEFS = {
    ruleOfFive: { id: 'ruleOfFive', bucket: 'savings', label: 'Rule of Five', structural: false,
      short: 'Save toward five of the thing you are eyeing', owner: { room: 'big-purchase', label: 'Big Purchase' } },
    emergencyFund: { id: 'emergencyFund', bucket: 'savings', label: 'Emergency fund', structural: false,
      short: 'Close the gap to a few months of spending in cash, over a year', owner: { room: 'start', label: 'Start Here' } },
    maxIra: { id: 'maxIra', bucket: 'investments', label: 'Max the IRA', structural: true,
      short: 'A twelfth of the year’s IRA limit, catch-up from 50', owner: { room: 'start', label: 'Start Here' } },
    max401k: { id: 'max401k', bucket: 'investments', label: 'Max the 401(k)', structural: true,
      short: 'A twelfth of the year’s elective limit, catch-up from 50', owner: { room: 'budget', label: 'Budget' } }
  };

  function limitsOf(T) { return T && T.irsLimits && T.irsLimits.limits; }
  function dollars(d) { return Math.round(d * 100); }

  /* ---- Each preset, as a Result ------------------------------------------- */
  function ruleOfFive(h, T) {
    var price = (h && h.purchase || {}).priceCents;
    if (!Money.isEntered(price)) return Money.incomplete('Name the purchase in Big Purchase and this reads its price.', ['purchase.priceCents']);
    var r = QuickMath.ruleOfFive(h, price);
    if (!Money.isOk(r)) return r;
    var months = (h.purchase || {}).monthsAway;
    var over = Money.isEntered(months) && months > 0 ? months : DEFAULT_MONTHS_AWAY;
    var monthly = r.passes ? 0 : Math.ceil(r.shortfallCents / over);
    return Money.ok(monthly, { priceCents: price, neededCents: r.neededCents, cashCents: r.cashCents, shortfallCents: r.shortfallCents, passes: r.passes, monthsAway: over,
      monthsAssumed: !(Money.isEntered(months) && months > 0), rule: r.rule,
      why: r.passes ? 'You could already buy five of it, so nothing more is needed.'
        : Money.formatCents(r.shortfallCents) + ' short of five × ' + Money.formatCents(price) + ', over ' + over + (over === 1 ? ' month' : ' months') + (Money.isEntered(months) && months > 0 ? '' : ' (no date set, so a year)') + '.' });
  }
  /* Schema.primaryAge wants the day as ISO; the clock may come as anything. */
  function isoDay(now) {
    if (!now) return undefined;
    if (typeof now === 'string') return now.slice(0, 10);
    var d = new Date(now);
    return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
  }
  function emergencyFund(h, T) {
    var P = T && T.savingsPresets && T.savingsPresets.emergencyFund;
    if (!P) return Money.incomplete('The savings presets table is not loaded.', ['savingsPresets']);
    var spend = Schema.monthlyExpensesCents(h);
    if (!Money.isOk(spend)) return Money.incomplete('Add a month of spending in Start Here and this reads it.', ['monthlyExpenses']);
    var cash = Schema.cashCents(h);
    if (!Money.isOk(cash)) return Money.incomplete('Add your cash in Start Here and this reads it.', ['cashSavings']);
    var target = spend.value * P.targetMonths;
    var gap = Math.max(0, target - cash.value);
    var monthly = Math.ceil(gap / P.horizonMonths);
    return Money.ok(monthly, { targetCents: target, targetMonths: P.targetMonths, horizonMonths: P.horizonMonths, cashCents: cash.value, gapCents: gap, spendCents: spend.value, spendSource: spend.source, referenceVersion: T.savingsPresets.version,
      why: gap === 0 ? 'You already hold ' + P.targetMonths + ' months of spending in cash.'
        : Money.formatCents(gap) + ' short of ' + P.targetMonths + ' months of spending (' + Money.formatCents(target) + '), over ' + P.horizonMonths + ' months.' });
  }
  function catchUp(h, now) {
    var age = Schema.primaryAge(h, isoDay(now));
    return { age: age, applies: Money.isEntered(age) && age >= CATCH_UP_AGE, unknown: !Money.isEntered(age) };
  }
  function maxIra(h, T, now) {
    var L = limitsOf(T);
    if (!L) return Money.incomplete('The IRS limits table is not loaded.', ['irsLimits']);
    var c = catchUp(h, now);
    var annual = dollars(L.ira + (c.applies ? L.iraCatchup50Plus : 0));
    return Money.ok(Math.round(annual / MONTHS), { annualCents: annual, limitCents: dollars(L.ira), catchUpCents: c.applies ? dollars(L.iraCatchup50Plus) : 0, age: c.age, catchUp: c.applies, ageUnknown: c.unknown,
      referenceVersion: T.irsLimits.version,
      why: Money.formatCents(annual) + ' a year' + (c.applies ? ' with the catch-up from ' + CATCH_UP_AGE : c.unknown ? '; add a date of birth in Start Here and the catch-up from ' + CATCH_UP_AGE + ' applies when it should' : '') + ', a twelfth each month.' });
  }
  function max401k(h, T, now) {
    var has = (h && h.retirement || {}).has401k;
    if (has !== true) return Money.incomplete(has === false ? 'No employer 401(k), so this preset is not offered.' : 'Say whether you have an employer 401(k) and this appears.', ['retirement.has401k']);
    var L = limitsOf(T);
    if (!L) return Money.incomplete('The IRS limits table is not loaded.', ['irsLimits']);
    var c = catchUp(h, now);
    var annual = dollars(L.elective401k + (c.applies ? L.elective401kCatchup50Plus : 0));
    return Money.ok(Math.round(annual / MONTHS), { annualCents: annual, limitCents: dollars(L.elective401k), catchUpCents: c.applies ? dollars(L.elective401kCatchup50Plus) : 0, age: c.age, catchUp: c.applies, ageUnknown: c.unknown,
      referenceVersion: T.irsLimits.version,
      why: Money.formatCents(annual) + ' a year of your own deferral' + (c.applies ? ' with the catch-up from ' + CATCH_UP_AGE : '') + ', a twelfth each month; the employer match is on top.' });
  }
  var COMPUTE = { ruleOfFive: ruleOfFive, emergencyFund: emergencyFund, maxIra: maxIra, max401k: max401k };

  /**
   * Is the Max 401(k) question still to be asked? True when nobody has
   * answered and the household's situation could carry an employer plan.
   */
  function ask401k(h) {
    var has = (h && h.retirement || {}).has401k;
    return has === null || has === undefined ? Schema.couldHaveEmployerMatch(h) : false;
  }

  /**
   * available(household, tables, opts) — every preset, offered or not.
   *   opts.now         the clock, for age
   *   opts.notApplicable  { id: true } — the N/A set; those are `hidden`
   *                    unless opts.hypothetical, when they show but say so
   * Each: { id, bucket, label, short, structural, offered, hidden,
   *         notApplicable, result, monthlyCents|null, reason }
   * An absent preset (no employer 401(k)) is not in the list at all.
   */
  function available(h, T, opts) {
    var o = opts || {};
    var na = o.notApplicable || {};
    var out = [];
    Object.keys(DEFS).forEach(function (id) {
      var d = DEFS[id];
      if (id === 'max401k' && (h && h.retirement || {}).has401k !== true) return;   /* absent, not disabled */
      var r = COMPUTE[id](h, T, o.now);
      var isNa = na[id] === true;
      out.push({ id: id, bucket: d.bucket, label: d.label, short: d.short, structural: d.structural, owner: d.owner,
        offered: Money.isOk(r) && !isNa, hidden: isNa && !o.hypothetical, notApplicable: isNa,
        result: r, monthlyCents: Money.isOk(r) ? r.value : null, reason: Money.isOk(r) ? null : r.reason });
    });
    return out;
  }

  /**
   * stacked(household, tables, 'YYYY-MM', opts) — what is stacked into
   * each bucket for the month: { bucket: { cents, items: [{ id, label, cents }] } }.
   * A preset that is N/A, or can no longer be read, drops out of the live
   * figure — the stored list is left alone so it comes back when it can.
   */
  function stacked(h, T, ym, opts) {
    var o = opts || {};
    var chosen = (h && h.budget && h.budget.presets && h.budget.presets[ym]) || {};
    var all = available(h, T, o);
    var byId = {}; all.forEach(function (p) { byId[p.id] = p; });
    var out = {};
    Object.keys(chosen).forEach(function (b) {
      var items = [];
      (chosen[b] || []).forEach(function (id) {
        var p = byId[id];
        if (!p || !p.offered || p.bucket !== b) return;
        items.push({ id: id, label: p.label, cents: p.monthlyCents });
      });
      if (items.length) out[b] = { cents: items.reduce(function (t, i) { return t + i.cents; }, 0), items: items };
    });
    return out;
  }

  return {
    DEFS: DEFS,
    CATCH_UP_AGE: CATCH_UP_AGE,
    DEFAULT_MONTHS_AWAY: DEFAULT_MONTHS_AWAY,
    ruleOfFive: ruleOfFive,
    emergencyFund: emergencyFund,
    maxIra: maxIra,
    max401k: max401k,
    ask401k: ask401k,
    available: available,
    stacked: stacked
  };
}));
