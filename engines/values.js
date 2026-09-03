/* ==========================================================================
   engines/values.js — Values vs. Spending Audit. SPEC.md §13, Tier 2.
   --------------------------------------------------------------------------
   "Stated top-5 values vs. actual last-month spending. The 'gap' output is
   inherently qualitative/visual — design as a comparison view, not a scalar."

   Taken literally. This file produces NO score. There is no alignment
   percentage, no rank correlation, no grade. It returns two ordered lists
   and the money behind them, and lets a person look at the two next to each
   other. A single number here would be false precision on top of a
   self-report, and it would invite optimising the number instead of the life.

   Two rules the arithmetic depends on:

     • ONE value per spending category. A category counted under two values
       double-counts the money and the shares stop adding up. The catalogue's
       default mapping is disjoint and test/run.js keeps it that way; a
       person's own assignments are a map, so they cannot break it either.

     • The default mapping is a STARTING POINT, not a claim. Whether
       groceries serve Health or Home is a question about someone's life. The
       room stores their answer and this file prefers it wherever it exists.

   Needs categorised spending from the Cash Flow room. Without it, incomplete
   — never a table of zeroes.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      CashFlow: require('./cashflow.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      CashFlow: root.SLAF && root.SLAF.CashFlow
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.CashFlow);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Values = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, CashFlow) {
  'use strict';

  var TOP_N = 5;

  function profileOf(household) {
    return Schema.createValuesProfile((household && household.valuesProfile) || {});
  }

  function valueById(table, id) {
    var list = (table && table.values) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /** The catalogue's default category -> value map, flattened once. */
  function defaultMap(table) {
    var out = {};
    ((table && table.values) || []).forEach(function (v) {
      (v.defaultCategoryIds || []).forEach(function (cid) { out[cid] = v.id; });
    });
    return out;
  }

  /**
   * Which value a category serves, and on whose authority.
   *   'stated'   — the person said so
   *   'default'  — the catalogue's starting point, untouched
   *   'none'     — the person explicitly said it serves nothing they named
   *   'unmapped' — the catalogue deliberately leaves it unclaimed
   */
  function assignmentFor(household, table, categoryId) {
    var p = profileOf(household);
    if (Object.prototype.hasOwnProperty.call(p.assignments, categoryId)) {
      var stated = p.assignments[categoryId];
      return stated === null
        ? { valueId: null, source: 'none' }
        : { valueId: stated, source: 'stated' };
    }
    var fallback = defaultMap(table)[categoryId];
    return fallback
      ? { valueId: fallback, source: 'default' }
      : { valueId: null, source: 'unmapped' };
  }

  /** The stated top five, trimmed and de-duplicated, in the order named. */
  function statedValues(household, table) {
    var p = profileOf(household);
    var seen = {}, out = [];
    p.stated.forEach(function (id) {
      if (seen[id]) return;
      var v = valueById(table, id);
      if (!v) return;
      seen[id] = true;
      if (out.length < TOP_N) out.push({ id: v.id, label: v.label, blurb: v.blurb, rank: out.length + 1 });
    });
    return out;
  }

  function isSet(household) { return profileOf(household).stated.length > 0; }

  /**
   * The comparison view. Returns, for every value in the catalogue that
   * either was named or picked up money, one row:
   *
   *   { id, label, statedRank | null, monthlyCents, shareOfSpend,
   *     spendRank, categories[] }
   *
   * plus the two orderings the room actually draws — `byStated` and
   * `bySpend` — and the money that serves nothing the person named.
   *
   * `value` is the total monthly spending the rows account for, so a caller
   * can check the shares against something real. It is NOT a score.
   */
  function audit(household, table, catalog) {
    if (!table) return Money.incomplete('Values reference table is not loaded.', ['values']);

    var summary = CashFlow.summarise(household, catalog);
    if (!Money.isOk(summary)) {
      return Money.incomplete(
        'Categorise a month in Cash Flow first — this compares what you said '
          + 'matters against where the money actually went.',
        ['expenseEntries']);
    }

    var stated = statedValues(household, table);
    var statedRank = {};
    stated.forEach(function (s) { statedRank[s.id] = s.rank; });

    /* Every dollar in the summary is rolled up under the value it serves,
       named or not — the right-hand column is more useful when it can show
       a value that eats a third of the money and never made the list.
       Savings categories are included: money put away serves something, and
       for anyone whose top value is Freedom or Security it is the main way
       they serve it.

       "Unclaimed" then means what the room says it means: money serving
       nothing on THIS person's list. A category mapped to a value they did
       not name counts as unclaimed and still says which value it serves, so
       the number and the reason arrive together. */
    var byValue = {}, unclaimedCents = 0, unclaimedCategories = [];
    var totalCents = 0;

    summary.categories.forEach(function (row) {
      totalCents += row.monthlyCents;
      var a = assignmentFor(household, table, row.categoryId);
      var servesNamed = !!a.valueId && !!statedRank[a.valueId];

      if (a.valueId) {
        var v = byValue[a.valueId] || (byValue[a.valueId] = { monthlyCents: 0, categories: [] });
        v.monthlyCents += row.monthlyCents;
        v.categories.push({
          categoryId: row.categoryId, label: row.label,
          monthlyCents: row.monthlyCents, source: a.source
        });
      }

      if (servesNamed) return;
      unclaimedCents += row.monthlyCents;
      var serves = a.valueId ? valueById(table, a.valueId) : null;
      unclaimedCategories.push({
        categoryId: row.categoryId,
        label: row.label,
        monthlyCents: row.monthlyCents,
        source: a.source,
        servesValueId: a.valueId,
        servesLabel: serves ? serves.label : null
      });
    });

    /* A named value with no spending against it still gets a row — that is
       one of the two things this tool exists to show. */
    stated.forEach(function (s) {
      if (!byValue[s.id]) byValue[s.id] = { monthlyCents: 0, categories: [] };
    });

    var rows = Object.keys(byValue).map(function (id) {
      var v = valueById(table, id);
      return {
        id: id,
        label: v ? v.label : id,
        blurb: v ? v.blurb : null,
        statedRank: statedRank[id] || null,
        monthlyCents: byValue[id].monthlyCents,
        shareOfSpend: totalCents === 0 ? null : byValue[id].monthlyCents / totalCents,
        categories: byValue[id].categories.sort(function (a, b) {
          return b.monthlyCents - a.monthlyCents;
        })
      };
    });

    var bySpend = rows.slice().sort(function (a, b) {
      if (b.monthlyCents !== a.monthlyCents) return b.monthlyCents - a.monthlyCents;
      return a.label.localeCompare(b.label);
    });
    bySpend.forEach(function (r, i) { r.spendRank = i + 1; });

    var byStated = rows.filter(function (r) { return r.statedRank !== null; })
      .sort(function (a, b) { return a.statedRank - b.statedRank; });

    return Money.ok(totalCents, {
      rows: rows,
      byStated: byStated,
      bySpend: bySpend,
      statedCount: stated.length,
      /* Money serving nothing on the list — a category with no value at
         all, or one whose value never made the top five. Shown, not
         scored. Together with the stated rows it accounts for every
         dollar exactly once. */
      unclaimedCents: unclaimedCents,
      unclaimedShare: totalCents === 0 ? null : unclaimedCents / totalCents,
      unclaimedCategories: unclaimedCategories.sort(function (a, b) {
        return b.monthlyCents - a.monthlyCents;
      }),
      monthsCovered: summary.monthsCovered,
      referenceVersion: table.version
    });
  }

  /**
   * Every spending category with money against it, and what it is currently
   * assigned to — the list the room turns into a row of choices. Categories
   * with nothing spent are left out; there is nothing to decide about them.
   */
  function assignableCategories(household, table, catalog) {
    var summary = CashFlow.summarise(household, catalog);
    if (!Money.isOk(summary)) return summary;
    return Money.ok(summary.categories.map(function (row) {
      var a = assignmentFor(household, table, row.categoryId);
      return {
        categoryId: row.categoryId,
        label: row.label,
        bucket: row.bucket,
        monthlyCents: row.monthlyCents,
        valueId: a.valueId,
        source: a.source
      };
    }));
  }

  return {
    TOP_N: TOP_N,
    valueById: valueById,
    defaultMap: defaultMap,
    assignmentFor: assignmentFor,
    statedValues: statedValues,
    isSet: isSet,
    audit: audit,
    assignableCategories: assignableCategories
  };
});
