/* ==========================================================================
   engines/week.js — the Designed Week, priced.
   BRIEF §8, DECISIONS.md D-101.
   --------------------------------------------------------------------------
   Blocks of hours, each with what it costs a week. The week priced is a
   month priced (× 52 ÷ 12), the month is a FI number (through
   Tier0.fireNumber — the one FIRE formula in the repo, fed the designed
   month), and that month against the one you have names the gap — by
   category, so it says which lines the week you designed differs on. At
   the real hourly wage the month is also a count of hours: the week costs
   N hours of itself.

   Nothing here invents a cost. A block's cost a week is the one stored on
   it (the room stores the proposal when it writes the hours), else the
   tracked line for its category from Cash Flow, else nothing — and
   "nothing" is priced $0 and counted, never blank.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Gate: require('../shared/gate.js'),
             Tier0: require('./tier0.js'), Hourly: require('./hourly.js'), CashFlow: require('./cashflow.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Gate: S.Gate, Tier0: S.Tier0, Hourly: S.Hourly || null, CashFlow: S.CashFlow || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Gate, deps.Tier0, deps.Hourly, deps.CashFlow);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Week = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Gate, Tier0, Hourly, CashFlow) {
  'use strict';

  var WEEKS = 52, MONTHS = 12, HOURS_IN_WEEK = 168;

  /* ---- Readers ------------------------------------------------------------ */
  function blocks(household) { return ((household && household.designedWeek) || {}).blocks || []; }
  function hoursInWeek(tables) {
    var t = tables && tables.weekBlocks;
    return t && Money.isEntered(t.hoursInWeek) ? t.hoursInWeek : HOURS_IN_WEEK;
  }
  function tableBlocks(tables) { return (tables && tables.weekBlocks && tables.weekBlocks.blocks) || []; }
  function tableBlock(tables, id) {
    var list = tableBlocks(tables);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** The blocks with an hour placed — the ones that count. */
  function placed(household) { return blocks(household).filter(function (b) { return Money.isEntered(b.hours); }); }

  /* ---- The two unit conversions, once ---------------------------------------- */
  function weeklyToMonthlyCents(cents) { return Math.round(cents * WEEKS / MONTHS); }
  function monthlyToWeeklyCents(cents) { return Math.round(cents * MONTHS / WEEKS); }

  /** The tracked month by category (Cash Flow's), or null without one. */
  function trackedByCategory(household, tables) {
    if (!CashFlow || !tables || !tables.expenseCategories) return null;
    var s = CashFlow.summarise(household, tables.expenseCategories);
    if (!Money.isOk(s)) return null;
    var out = {};
    s.categories.forEach(function (row) { out[row.categoryId] = row.monthlyCents; });
    return out;
  }

  /** A week's cost for a block, proposed from your own tracked month; null without one. */
  function proposeCost(household, tables, block) {
    if (!block || !block.categoryId) return null;
    var by = trackedByCategory(household, tables);
    if (!by || !Money.isEntered(by[block.categoryId])) return null;
    return monthlyToWeeklyCents(by[block.categoryId]);
  }

  /** The cost a week this block is priced at, and where it came from. */
  function costOf(household, tables, block) {
    if (Money.isEntered(block.costCents)) return { cents: block.costCents, source: 'stored' };
    var p = proposeCost(household, tables, block);
    if (p !== null) return { cents: p, source: 'tracked' };
    return { cents: 0, source: 'none' };
  }

  /**
   * The week, priced. `value` is the designed month in cents (Σ cost a week
   * × 52 ÷ 12); the week, the year, the hours placed and unplaced ride along.
   * A block with hours and no cost is priced $0 and counted in
   * `unpricedCount`, not dropped. Hours over the week are summed as typed and
   * flagged `overHours`; `unplacedHours` never goes below 0 (`rawUnplacedHours`
   * keeps the sign).
   */
  function priced(household, tables) {
    var list = placed(household);
    if (!list.length) return Money.incomplete('Place an hour in a block to price the week.', ['designedWeek']);
    var cap = hoursInWeek(tables);
    var hours = 0, weekly = 0, unpriced = [];
    var rows = list.map(function (b) {
      var c = costOf(household, tables, b);
      hours += b.hours;
      weekly += c.cents;
      if (c.source === 'none') unpriced.push(b.label || b.id);
      return { id: b.id, label: b.label || b.id, hours: b.hours, categoryId: b.categoryId || null,
               costWeeklyCents: c.cents, costMonthlyCents: weeklyToMonthlyCents(c.cents), costSource: c.source };
    });
    var monthly = weeklyToMonthlyCents(weekly);
    return Money.ok(monthly, {
      weeklyCents: weekly, monthlyCents: monthly, annualCents: weekly * WEEKS,
      hours: hours, hoursInWeek: cap, rawUnplacedHours: cap - hours, unplacedHours: Math.max(0, cap - hours), overHours: hours > cap,
      unpricedCount: unpriced.length, unpricedLabels: unpriced, blockCount: list.length, rows: rows
    });
  }

  /**
   * The FI number the designed month implies — Tier0.fireNumber, the one
   * FIRE formula, fed a household whose month is the designed one. The
   * withdrawal rate is the household's own assumption.
   */
  function fiNumber(household, tables) {
    var p = priced(household, tables);
    if (!Money.isOk(p)) return p;
    var shadow = Object.assign({}, household || {}, { expenses: { monthlyEssential: { estimatedValueCents: p.monthlyCents, trackedValueCents: null } } });
    var r = Tier0.fireNumber(shadow);
    if (!Money.isOk(r)) return r;
    return Money.ok(r.value, { monthlyCents: p.monthlyCents, annualExpensesCents: r.annualExpensesCents, swrRate: r.swrRate });
  }

  /**
   * The gap: the designed month against the month you have, and the lines
   * the two differ on. A category the week never mentions is a line the
   * design dropped; one the month never had is a line it added. Savings
   * lines are not spending: a week that does not mention them has not
   * dropped them. `value` is designed − now in cents a month, null when
   * there is no month to compare (the reason rides along).
   */
  function gap(household, tables) {
    var p = priced(household, tables);
    if (!Money.isOk(p)) return p;
    var now = Schema.monthlyExpensesCents(household);
    var by = trackedByCategory(household, tables);
    var labels = {}, savings = {};
    ((tables && tables.expenseCategories && tables.expenseCategories.categories) || []).forEach(function (c) { labels[c.id] = c.label; if (c.bucket === 'savings') savings[c.id] = true; });
    var designed = {};
    p.rows.forEach(function (r) { if (r.categoryId) designed[r.categoryId] = (designed[r.categoryId] || 0) + r.costMonthlyCents; });
    var ids = {};
    Object.keys(designed).forEach(function (k) { ids[k] = true; });
    Object.keys(by || {}).forEach(function (k) { ids[k] = true; });
    var rows = Object.keys(ids).filter(function (id) { return !savings[id]; }).map(function (id) {
      var d = designed[id] || 0, n = by && Money.isEntered(by[id]) ? by[id] : null;
      return { categoryId: id, label: labels[id] || id, designedMonthlyCents: d, nowMonthlyCents: n,
               deltaCents: n === null ? null : d - n, dropped: !designed[id] && n !== null, added: !!designed[id] && n === null };
    }).sort(function (a, b) {
      var wa = a.deltaCents === null ? a.designedMonthlyCents : a.deltaCents, wb = b.deltaCents === null ? b.designedMonthlyCents : b.deltaCents;
      return Math.abs(wb) - Math.abs(wa);
    });
    var known = Money.isOk(now);
    return Money.ok(known ? p.monthlyCents - now.value : null, {
      designedMonthlyCents: p.monthlyCents, nowMonthlyCents: known ? now.value : null, nowReason: known ? null : now.reason,
      nowSource: known ? now.source : null, rows: rows, tracked: !!by
    });
  }

  /** The real hourly wage where the situation has one — Lens's rule, not a second one. */
  function wage(household, tables) {
    if (!Hourly || !Gate.exists(household, 'realHourlyWage')) return null;
    return Hourly.realHourlyWage(household, tables);
  }

  /** "The week costs N hours of itself": a month in cents ÷ the real hourly wage. */
  function hoursOfItself(monthlyCents, realHourlyCents) {
    var r = Money.safeDivide(monthlyCents, realHourlyCents, { denominatorName: 'realHourlyCents', zeroReason: 'A wage of zero buys no hours.' });
    if (!Money.isOk(r)) return r;
    return Money.ok(Math.round(r.value * 10) / 10, { monthlyCents: monthlyCents, realHourlyCents: realHourlyCents });
  }

  /**
   * Everything the room shows, in one Result: value is the designed month;
   * the pricing, the FI number, the gap and the hours-of-itself line ride
   * along, each absent with its reason rather than a number.
   */
  function design(household, tables) {
    var p = priced(household, tables);
    if (!Money.isOk(p)) return p;
    var fi = fiNumber(household, tables);
    var g = gap(household, tables);
    var w = wage(household, tables);
    var hoi = w && Money.isOk(w) ? hoursOfItself(p.monthlyCents, w.realHourlyCents) : null;
    return Money.ok(p.monthlyCents, {
      weeklyCents: p.weeklyCents, monthlyCents: p.monthlyCents, annualCents: p.annualCents,
      hours: p.hours, hoursInWeek: p.hoursInWeek, unplacedHours: p.unplacedHours, rawUnplacedHours: p.rawUnplacedHours, overHours: p.overHours,
      unpricedCount: p.unpricedCount, unpricedLabels: p.unpricedLabels, blockCount: p.blockCount, rows: p.rows,
      fiCents: Money.isOk(fi) ? fi.value : null, fiReason: Money.isOk(fi) ? null : fi.reason, swrRate: Money.isOk(fi) ? fi.swrRate : Schema.resolveAssumptions(household).swrRate,
      nowMonthlyCents: g.nowMonthlyCents, nowReason: g.nowReason, gapCents: g.value, gapRows: g.rows, tracked: g.tracked,
      wageApplies: w !== null, realHourlyCents: w && Money.isOk(w) ? w.realHourlyCents : null, wageReason: w === null ? 'No real hourly wage for this situation.' : (Money.isOk(w) ? null : w.reason),
      hoursOfItself: hoi && Money.isOk(hoi) ? hoi.value : null
    });
  }

  return {
    WEEKS: WEEKS, MONTHS: MONTHS, HOURS_IN_WEEK: HOURS_IN_WEEK,
    blocks: blocks, placed: placed, hoursInWeek: hoursInWeek, tableBlocks: tableBlocks, tableBlock: tableBlock,
    weeklyToMonthlyCents: weeklyToMonthlyCents, monthlyToWeeklyCents: monthlyToWeeklyCents,
    trackedByCategory: trackedByCategory, proposeCost: proposeCost, costOf: costOf,
    priced: priced, fiNumber: fiNumber, gap: gap, wage: wage, hoursOfItself: hoursOfItself, design: design
  };
});
