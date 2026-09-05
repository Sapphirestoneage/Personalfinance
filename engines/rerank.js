/* ==========================================================================
   engines/rerank.js — cost rank against value rank, and where they disagree.
   BRIEF §5, DECISIONS.md D-084.
   --------------------------------------------------------------------------
     lines(h, tables)     every cost line: the tracked categories and custom
                          lines when a month exists, else the common-cost
                          table scaled to the household's essentials, each
                          marked entered | suggested | derived
     analyse(h, tables)   the lines with costRank, valueRank, joy, miss,
                          who, need, and a flag ∈ {cut, keep, ok}; plus what
                          the cut lines add up to a year and at 25×
     threshold(n)         max(3, round(n × 0.25)) — how deep "top" goes

   A line is CUT when it is in the top k by cost and its value rank trails
   its cost rank by more than k; KEEP when it is in the top k by value and
   its cost rank trails its value rank by more than k. Everything else is
   ok: the two orders roughly agree. A need can be flagged — the room words
   it more gently — because "I spend a lot on this and it gives me little"
   is still worth knowing about a necessity.

   Value order: the hand-set valueRank when the person has reranked, else
   joy descending, then miss (yes > some > no), then cheaper first. Nothing
   here invents a joy: an unrated line has no value rank and no flag.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Rating: require('../shared/rating.js'),
      CashFlow: require('./cashflow.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Rating: root.SLAF && root.SLAF.Rating,
      CashFlow: root.SLAF && root.SLAF.CashFlow
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Rating, deps.CashFlow);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Rerank = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Rating, CashFlow) {
  'use strict';

  var SCOPE = 'rerank';
  var MONTHS = 12;
  var FI_MULTIPLE = 25;          /* the 4% rule, inverted: $1 a year needs $25 */
  var MISS_ORDER = { yes: 0, some: 1, no: 2 };
  /* A suggested line, once typed, is stored as an expense entry with this
     id, so it replaces its suggestion instead of sitting beside it. */
  var SUGGESTED_ENTRY_PREFIX = 'rr_';

  function threshold(n) { return Math.max(3, Math.round(n * 0.25)); }

  function rowFor(household, id) {
    var rows = (household.rerank && household.rerank.rows) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function catById(catalog, id) {
    var cats = (catalog && catalog.categories) || [];
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i];
    return null;
  }

  /* ---- 1. The cost lines ----------------------------------------------------- */

  /**
   * lines(household, tables) → Result; value = count, `lines` = [...]
   * Each: { id, label, categoryId, monthlyCents, need, source, custom, entryId }
   *   source 'entered'   a tracked category or a custom line in expenses
   *          'derived'   debt minimums, read from Debt Payoff
   *          'suggested' a common-cost line, scaled — never stored
   * `scale` says what the suggestions were scaled by (null = unscaled).
   */
  function lines(household, tables) {
    var catalog = tables && tables.expenseCategories;
    if (!catalog) return Money.incomplete('The category table is not loaded.', ['expenseCategories']);
    var entries = (household.expenses && household.expenses.entries) || [];
    var out = [];

    /* Custom lines are single entries typed on The Rerank; they keep their
       own identity rather than folding into their category. */
    var custom = entries.filter(function (e) { return e.source === 'rerank' && e.descriptor; });
    var customIds = {};
    custom.forEach(function (e) { customIds[e.id] = true; });
    var byCategory = entries.filter(function (e) { return !customIds[e.id] && Money.isEntered(e.amountCents) && e.categoryId; });

    var basis = 'entered';
    if (byCategory.length) {
      var grouped = {};
      byCategory.forEach(function (e) { (grouped[e.categoryId] = grouped[e.categoryId] || []).push(e); });
      Object.keys(grouped).forEach(function (id) {
        var cat = catById(catalog, id);
        if (!cat || cat.derivedFrom || cat.bucket === 'savings') return;
        var n = CashFlow.normaliseToMonthly(grouped[id]);
        if (!n.monthlyCents) return;
        out.push({ id: id, label: cat.label, categoryId: id, monthlyCents: n.monthlyCents,
          need: cat.bucket === 'needs', source: 'entered', custom: false, entryId: null });
      });
    } else if (tables.commonCosts) {
      basis = 'suggested';
      var table = tables.commonCosts;
      var essential = Schema.monthlyExpensesCents(household);
      var tableEssential = table.lines.filter(function (l) { return l.essential; })
        .reduce(function (t, l) { return t + l.monthlyCents; }, 0);
      var scale = Money.isOk(essential) && tableEssential > 0 ? essential.value / tableEssential : null;
      var typed = {};
      custom.forEach(function (e) { typed[e.id] = true; });
      table.lines.forEach(function (l) {
        if (!l.monthlyCents || typed[SUGGESTED_ENTRY_PREFIX + l.id]) return;
        var cat = catById(catalog, l.categoryId);
        out.push({ id: l.id, label: l.label, categoryId: l.categoryId,
          monthlyCents: Math.round(l.monthlyCents * (scale === null ? 1 : scale)),
          need: cat ? cat.bucket === 'needs' : !!l.essential, source: 'suggested', custom: false, entryId: null });
      });
      out.scale = scale;
    }

    /* A custom line with no amount yet is still a line — the room needs a
       box to type into — but it has no cost rank until one is typed. */
    custom.forEach(function (e) {
      var cat = catById(catalog, e.categoryId);
      out.push({ id: e.id, label: e.descriptor, categoryId: e.categoryId || 'other',
        monthlyCents: Money.isEntered(e.amountCents) ? e.amountCents : null,
        need: cat ? cat.bucket === 'needs' : false, source: 'entered', custom: true, entryId: e.id });
    });

    /* Debt minimums come from Debt Payoff, never typed. */
    var minimums = Schema.monthlyDebtPaymentsCents(household);
    if (Money.isOk(minimums) && minimums.value > 0) {
      out.push({ id: 'debt_minimums', label: 'Debt minimums', categoryId: 'debt_minimums',
        monthlyCents: minimums.value, need: true, source: 'derived', custom: false, entryId: null });
    }

    if (!out.length) return Money.incomplete('Nothing to rank yet: track a month in Cash Flow, or add a cost here.', ['expenseEntries']);
    return Money.ok(out.length, { lines: out, basis: basis, scale: out.scale === undefined ? null : out.scale, referenceVersion: tables.commonCosts ? tables.commonCosts.version : null });
  }

  /* ---- 2. The analysis ------------------------------------------------------- */

  function analyse(household, tables) {
    var l = lines(household, tables);
    if (!Money.isOk(l)) return l;
    var rows = l.lines.map(function (line) {
      var r = rowFor(household, line.id) || {};
      return {
        id: line.id, label: line.label, categoryId: line.categoryId, monthlyCents: line.monthlyCents,
        need: line.need, source: line.source, custom: line.custom, entryId: line.entryId,
        joy: Rating.get(household, SCOPE, line.id),
        miss: r.miss || null,
        who: r.who || null,
        handRank: Money.isEntered(r.valueRank) ? r.valueRank : null,
        costRank: null, valueRank: null, flag: null
      };
    });

    /* Cost rank: most expensive first, ties by label so it is stable. A
       line with no amount has no rank anywhere. */
    /* A proposal is not a cost the person has: it is listed to be typed,
       and ranked only once it is. */
    var costed = rows.filter(function (r) { return Money.isEntered(r.monthlyCents) && r.source !== 'suggested'; });
    costed.slice().sort(function (a, b) { return b.monthlyCents - a.monthlyCents || a.label.localeCompare(b.label); })
      .forEach(function (r, i) { r.costRank = i + 1; });

    /* Value rank: the hand order when every rated line has one, else joy. */
    var rated = costed.filter(function (r) { return Rating.isValid(r.joy); });
    var allHand = rated.length > 0 && rated.every(function (r) { r.handRank !== null; return r.handRank !== null; });
    rated.slice().sort(function (a, b) {
      if (allHand) return a.handRank - b.handRank;
      return (b.joy - a.joy)
        || ((MISS_ORDER[a.miss] === undefined ? 1.5 : MISS_ORDER[a.miss]) - (MISS_ORDER[b.miss] === undefined ? 1.5 : MISS_ORDER[b.miss]))
        || (a.monthlyCents - b.monthlyCents)
        || a.label.localeCompare(b.label);
    }).forEach(function (r, i) { r.valueRank = i + 1; });

    var n = rated.length, k = threshold(n);
    rated.forEach(function (r) {
      if (r.costRank <= k && r.valueRank - r.costRank > k) r.flag = 'cut';
      else if (r.valueRank <= k && r.costRank - r.valueRank > k) r.flag = 'keep';
      else r.flag = 'ok';
    });

    var cut = rated.filter(function (r) { return r.flag === 'cut'; });
    var keep = rated.filter(function (r) { return r.flag === 'keep'; });
    var flaggedMonthly = cut.reduce(function (t, r) { return t + r.monthlyCents; }, 0);
    return Money.ok(rows.length, {
      rows: rows,
      ratedCount: n,
      unratedCount: costed.length - n,
      uncostedCount: rows.filter(function (r) { return r.source !== 'suggested' && !Money.isEntered(r.monthlyCents); }).length,
      proposedCount: rows.filter(function (r) { return r.source === 'suggested'; }).length,
      threshold: k,
      valueOrder: allHand ? 'hand' : 'joy',
      cut: cut, keep: keep,
      flaggedMonthlyCents: flaggedMonthly,
      flaggedAnnualCents: flaggedMonthly * MONTHS,
      fiImpactCents: flaggedMonthly * MONTHS * FI_MULTIPLE,
      fiMultiple: FI_MULTIPLE,
      basis: l.basis, scale: l.scale,
      /* Agreement: mean absolute gap between the two ranks, over rated lines. */
      agreement: n ? Money.ok(rated.reduce(function (t, r) { return t + Math.abs(r.costRank - r.valueRank); }, 0) / n) : Money.incomplete('Rate at least one line.', ['ratings'])
    });
  }

  /** The value order as a list of ids, for the rerank stage to write back. */
  function valueOrder(household, tables) {
    var a = analyse(household, tables);
    if (!Money.isOk(a)) return a;
    var ordered = a.rows.filter(function (r) { return r.valueRank !== null; })
      .sort(function (x, y) { return x.valueRank - y.valueRank; });
    return Money.ok(ordered.length, { ids: ordered.map(function (r) { return r.id; }), rows: ordered });
  }

  return {
    SCOPE: SCOPE,
    FI_MULTIPLE: FI_MULTIPLE,
    SUGGESTED_ENTRY_PREFIX: SUGGESTED_ENTRY_PREFIX,
    threshold: threshold,
    lines: lines,
    analyse: analyse,
    valueOrder: valueOrder
  };
});
