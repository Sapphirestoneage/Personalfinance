/* ==========================================================================
   engines/dreamline.js — the Dreamline: what the life costs a month, and
   how many hours a week that is.
   BRIEF §8, DECISIONS.md D-093 / D-101.
   --------------------------------------------------------------------------
   Ferriss's exercise. Each dream priced a month, plus what you spend, times
   a pad, is the Target Monthly Income. At your real hourly wage that is a
   number of hours a week — which is the point: a dream is not a sum, it
   is a Tuesday afternoon.

     dreams a month   = Σ monthlyCents of the priced dreams
     target a month   = (spending + dreams) × bufferMultiplier
     gap              = target − take-home a month (positive = short)
     hours a week     = monthly ÷ real hourly wage ÷ (52 ÷ 12)
     over the horizon = monthly × horizonMonths

   Nothing here is a second copy of a formula: the real rate comes from
   engines/hourly.js, take-home from engines/tier0.js's one tax lookup, and
   spending from Schema.monthlyExpensesCents. Money is integer cents.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Hourly: require('./hourly.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0 || null, Hourly: S.Hourly || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Hourly);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Dreamline = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Hourly) {
  'use strict';

  /* A month is 52 ÷ 12 weeks: a monthly figure over a weekly rate. */
  var WEEKS_PER_MONTH = 52 / 12;
  var DEFAULT_BUFFER = 1.3;
  var DEFAULT_HORIZON_MONTHS = 6;
  var SLOTS = 5;
  /* "Watch" is take-home within this much of the target; further is "out". */
  var WATCH_SHARE = 0.2;

  /* The kinds a slot can be named as. The id is stored as the dream's
     label so the list stays plain strings in the household. */
  var KINDS = [
    ['travel', 'Travel'],
    ['sabbatical', 'A sabbatical'],
    ['course', 'A course'],
    ['place', 'A place'],
    ['gift', 'A gift'],
    ['other', 'Something else']
  ];
  function kindLabel(id) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0] === id) return KINDS[i][1];
    return id === null || id === undefined || id === '' ? null : String(id);
  }

  /* ---- The list ------------------------------------------------------------ */
  function dreams(household) { return (household && Array.isArray(household.dreams)) ? household.dreams : []; }
  function buffer(tables) {
    var v = tables && tables.dreamline && tables.dreamline.bufferMultiplier;
    return Money.isEntered(v) && v > 0 ? v : DEFAULT_BUFFER;
  }
  function horizonMonths(tables) {
    var v = tables && tables.dreamline && tables.dreamline.horizonMonths;
    return Money.isEntered(v) && v > 0 ? v : DEFAULT_HORIZON_MONTHS;
  }

  /* The room's five slots have stable ids, dream_1 … dream_5, so a box
     always edits the same dream and an undo names the slot. */
  function slotId(i) { return 'dream_' + i; }
  function slot(household, i) {
    var id = slotId(i);
    var list = dreams(household);
    for (var k = 0; k < list.length; k++) if (list[k] && list[k].id === id) return list[k];
    return null;
  }
  /** What a slot is shown as: its kind's label, or "Dream N". */
  function slotName(dream, i) { return (dream && kindLabel(dream.label)) || ('Dream ' + i); }

  /**
   * withSlot(list, i, fields) → a NEW list with slot i upserted from
   * fields ({ monthlyCents, label }). A price typed blank (monthlyCents:
   * null) removes the slot, kind and all; a kind cleared on an unpriced
   * slot removes it too. The list stays in slot order. Pure: the room
   * hands the result to Spine.set('dreams', …).
   */
  function withSlot(list, i, fields) {
    var id = slotId(i), f = fields || {};
    var current = null, rest = [];
    (list || []).forEach(function (d) { if (d && d.id === id) current = d; else rest.push(d); });
    if (f.monthlyCents === null) return rest;
    var next = {
      id: id,
      label: f.label === undefined ? (current ? current.label : null) : (f.label === null || f.label === '' ? null : String(f.label)),
      monthlyCents: f.monthlyCents === undefined ? (current ? current.monthlyCents : null) : (Money.isEntered(f.monthlyCents) ? Math.round(f.monthlyCents) : null)
    };
    if (!Money.isEntered(next.monthlyCents) && next.label === null) return rest;
    rest.push(next);
    var index = function (d) { var m = /^dream_(\d+)$/.exec(d && d.id || ''); return m ? Number(m[1]) : SLOTS + 1; };
    return rest.sort(function (a, b) { return index(a) - index(b); });
  }

  /* ---- The figures ---------------------------------------------------------- */

  /** Σ dreams a month; dreams without a figure are counted, not summed. */
  function dreamsMonthlyCents(household) {
    var priced = [], unpriced = 0, total = 0;
    dreams(household).forEach(function (d) {
      if (d && Money.isEntered(d.monthlyCents)) { total += d.monthlyCents; priced.push(d); } else unpriced++;
    });
    return { cents: total, pricedCount: priced.length, unpricedCount: unpriced, count: dreams(household).length, priced: priced };
  }

  /** (spending + dreams) × the pad. Incomplete only without spending. */
  function targetMonthlyIncome(household, tables) {
    var ex = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(ex)) return Money.incomplete('Add your monthly spending to price the life.', ['monthlyExpenses']);
    var d = dreamsMonthlyCents(household);
    var b = buffer(tables);
    var target = Math.round((ex.value + d.cents) * b);
    return Money.ok(target, {
      expensesCents: ex.value, dreamsCents: d.cents, bufferMultiplier: b,
      dreamCount: d.count, pricedCount: d.pricedCount, unpricedCount: d.unpricedCount,
      bufferCents: target - ex.value - d.cents,
      noDreamPriced: d.pricedCount === 0
    });
  }

  /** good: take-home covers the target; watch: within 20% of it; out: beyond. */
  function zone(targetCents, takeHomeCents) {
    if (!Money.isEntered(targetCents) || !Money.isEntered(takeHomeCents)) return null;
    if (takeHomeCents >= targetCents) return 'good';
    if (takeHomeCents >= targetCents * (1 - WATCH_SHARE)) return 'watch';
    return 'out';
  }

  /** target − take-home a month. Positive is short. */
  function gap(household, tables) {
    var tmi = targetMonthlyIncome(household, tables);
    if (!Money.isOk(tmi)) return tmi;
    if (!Tier0) return Money.incomplete('The Tier 0 engine is not loaded.', ['tier0']);
    var th = Tier0.takeHomeMonthlyCents(household, tables);
    if (!Money.isOk(th)) return Money.incomplete('Add your income to see how far the target is from what you take home: ' + th.reason, th.missing);
    return Money.ok(tmi.value - th.value, {
      targetMonthlyIncomeCents: tmi.value, takeHomeMonthlyCents: th.value,
      short: tmi.value > th.value, zone: zone(tmi.value, th.value),
      effectiveRate: th.effectiveRate, referenceVersion: th.referenceVersion
    });
  }

  /** Hours a week at the real hourly wage to earn the target — and each dream's own. */
  function hoursPerWeek(household, tables) {
    var tmi = targetMonthlyIncome(household, tables);
    if (!Money.isOk(tmi)) return tmi;
    if (!Hourly) return Money.incomplete('The hourly engine is not loaded.', ['hourly']);
    var wage = Hourly.realHourlyWage(household, tables);
    if (!Money.isOk(wage)) return wage;
    if (wage.value <= 0) return Money.incomplete('Your real hourly wage is not above zero, so hours cannot be counted.', ['realHourlyWage']);
    var perWeek = function (monthly) { return Math.round(monthly / wage.value / WEEKS_PER_MONTH * 10) / 10; };
    return Money.ok(perWeek(tmi.value), {
      wageCents: wage.value, nominalWageCents: Money.isEntered(wage.nominalHourlyCents) ? wage.nominalHourlyCents : null,
      hoursNow: wage.totalHoursPerWeek, paidHoursNow: wage.paidHoursPerWeek,
      expensesHours: perWeek(tmi.expensesCents),
      dreamsHours: perWeek(tmi.dreamsCents),
      bufferHours: perWeek(tmi.bufferCents),
      perDream: dreams(household).map(function (d) {
        return { id: d.id, label: d.label, monthlyCents: d.monthlyCents, hoursPerWeek: Money.isEntered(d.monthlyCents) ? perWeek(d.monthlyCents) : null };
      }),
      targetMonthlyIncomeCents: tmi.value
    });
  }

  /** What each dream, and the target, costs over the horizon. */
  function horizon(household, tables) {
    var months = horizonMonths(tables);
    var tmi = targetMonthlyIncome(household, tables);
    var d = dreamsMonthlyCents(household);
    return {
      months: months,
      dreams: dreams(household).map(function (dr) {
        return { id: dr.id, label: dr.label, monthlyCents: dr.monthlyCents, overHorizonCents: Money.isEntered(dr.monthlyCents) ? dr.monthlyCents * months : null };
      }),
      dreamsOverHorizonCents: d.cents * months,
      targetOverHorizonCents: Money.isOk(tmi) ? tmi.value * months : null
    };
  }

  /**
   * picture(h, T) — everything the room shows, in one Result whose value is
   * the target monthly income. The gap and the hours are carried as their
   * own Results so the room can say which is missing without the target
   * going with it.
   */
  function picture(household, tables) {
    var tmi = targetMonthlyIncome(household, tables);
    if (!Money.isOk(tmi)) return tmi;
    var g = gap(household, tables), hrs = hoursPerWeek(household, tables), hz = horizon(household, tables);
    return Money.ok(tmi.value, {
      target: tmi, gap: g, hours: hrs, horizon: hz,
      zone: Money.isOk(g) ? g.zone : null,
      dreams: dreams(household).map(function (d, k) {
        var i = (/^dream_(\d+)$/.exec(d.id || '') || [])[1];
        return { id: d.id, label: d.label, name: slotName(d, i || (k + 1)), monthlyCents: d.monthlyCents };
      })
    });
  }

  return {
    WEEKS_PER_MONTH: WEEKS_PER_MONTH, DEFAULT_BUFFER: DEFAULT_BUFFER, DEFAULT_HORIZON_MONTHS: DEFAULT_HORIZON_MONTHS,
    SLOTS: SLOTS, WATCH_SHARE: WATCH_SHARE, KINDS: KINDS, kindLabel: kindLabel,
    dreams: dreams, buffer: buffer, horizonMonths: horizonMonths,
    slotId: slotId, slot: slot, slotName: slotName, withSlot: withSlot,
    dreamsMonthlyCents: dreamsMonthlyCents, targetMonthlyIncome: targetMonthlyIncome,
    zone: zone, gap: gap, hoursPerWeek: hoursPerWeek, horizon: horizon, picture: picture
  };
});
