/* ==========================================================================
   engines/cashflow.js — categorised income minus expenses.
   --------------------------------------------------------------------------
   SPEC.md §9 item 4. Everything downstream of this — the Fulfillment Curve,
   Values vs. Spending Audit, Mutant Expenses, Personal Inflation, and the
   real (rather than estimated) Savings Rate — needs spending in categorised
   form, which is why it is built before any of them.

   SPEC.md §12.5: manual entry now, bank-linked import architected in. There
   is ONE store, household.expenses.entries[], and every record in it is
   transaction-shaped. A hand-typed monthly total is a record with
   period 'monthly'; an imported transaction is a record with period 'once'
   and a date. normaliseToMonthly() reduces both to a monthly figure, so the
   roll-up, the bucketing and the template comparison all keep working
   unchanged the day an importer starts writing records.

   SPEC.md §12.3: what this engine produces is the TRACKED expense figure.
   It never overwrites the user's original estimate; the divergence between
   the two is its own output.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.CashFlow = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';

  var MONTHS_PER_YEAR = 12;

  /* Household fields a category may be derived from. Keyed by the name a
     category's `derivedFrom` uses in data/expense_categories.json. */
  var DERIVED = {
    monthlyDebtPayments: function (household) { return Schema.monthlyDebtPaymentsCents(household); }
  };

  /* ---- Category catalogue lookups -------------------------------------- */

  function categoryById(catalog, id) {
    var list = (catalog && catalog.categories) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /**
   * Assign a category to a transaction-shaped record by matching its
   * descriptor against the catalogue's keywords.
   *
   * Unused by manual entry, where the user picks the category outright. It
   * exists now so the import path (SPEC.md §12.5) plugs into a categoriser
   * that already operates on a transaction, rather than one retrofitted onto
   * hand-typed totals. Returns null rather than guessing 'other' — an
   * uncategorised transaction is a real state the UI should surface, not
   * something to bury in a catch-all.
   */
  function categorise(transaction, catalog) {
    var text = String((transaction && transaction.descriptor) || '').toLowerCase();
    if (!text) return null;
    var list = (catalog && catalog.categories) || [];
    for (var i = 0; i < list.length; i++) {
      var keywords = list[i].keywords || [];
      for (var k = 0; k < keywords.length; k++) {
        if (text.indexOf(String(keywords[k]).toLowerCase()) !== -1) {
          return { categoryId: list[i].id, categorizedBy: 'rule', matched: keywords[k] };
        }
      }
    }
    return null;
  }

  /* ---- Normalising a mixed store to monthly ----------------------------
     Monthly records count as themselves. Dated one-off records are summed
     and divided by the number of DISTINCT months they span — not by a fixed
     30 days, and not by the count of records — so three months of imported
     transactions produce a monthly average rather than a quarterly total. */

  function monthKey(date) {
    if (!date) return null;
    var s = String(date);
    return s.length >= 7 ? s.slice(0, 7) : null;
  }

  function normaliseToMonthly(entries) {
    var monthlyTotal = 0, monthlyCount = 0;
    var datedTotal = 0, datedCount = 0;
    var months = {};

    (entries || []).forEach(function (e) {
      if (!Money.isEntered(e.amountCents)) return;
      if (e.period === 'once') {
        datedTotal += e.amountCents;
        datedCount++;
        var k = monthKey(e.date);
        if (k) months[k] = true;
      } else {
        monthlyTotal += e.amountCents;
        monthlyCount++;
      }
    });

    var monthsCovered = Object.keys(months).length;
    /* Undated one-offs can't be spread across a window, so they count as a
       single month rather than being silently annualised. */
    if (datedCount > 0 && monthsCovered === 0) monthsCovered = 1;

    var datedMonthly = monthsCovered > 0 ? datedTotal / monthsCovered : 0;

    return {
      monthlyCents: Math.round(monthlyTotal + datedMonthly),
      counted: monthlyCount + datedCount,
      monthsCovered: monthsCovered,
      fromDatedCents: Math.round(datedMonthly),
      fromMonthlyCents: monthlyTotal
    };
  }

  /* ---- The summary ------------------------------------------------------ */

  /**
   * Roll the household's expense entries up by category and by bucket.
   * Returns a Result; an empty store is incomplete, not a pile of zeroes.
   */
  function summarise(household, catalog) {
    var entries = (household && household.expenses && household.expenses.entries) || [];
    var usable = entries.filter(function (e) {
      return Money.isEntered(e.amountCents) && e.categoryId;
    });

    if (usable.length === 0) {
      return Money.incomplete('Add where your money goes to see this.', ['expenseEntries']);
    }
    if (!catalog) {
      return Money.incomplete('Category reference table is not loaded.', ['expenseCategories']);
    }

    var byCategory = {}, byBucket = {}, uncategorised = [];
    ((catalog.buckets) || []).forEach(function (b) { byBucket[b.id] = 0; });

    usable.forEach(function (e) {
      var cat = categoryById(catalog, e.categoryId);
      if (!cat) { uncategorised.push(e); return; }
      (byCategory[cat.id] = byCategory[cat.id] || []).push(e);
    });

    var categories = [], essentialCents = 0, spendCents = 0, savingsCents = 0;

    function addRow(cat, monthlyCents, extra) {
      var row = {
        categoryId: cat.id, label: cat.label, bucket: cat.bucket,
        essential: !!cat.essential, monthlyCents: monthlyCents
      };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) row[k] = extra[k]; } }
      categories.push(row);
      byBucket[cat.bucket] = (byBucket[cat.bucket] || 0) + monthlyCents;
      if (cat.essential) essentialCents += monthlyCents;
      if (cat.bucket === 'savings') savingsCents += monthlyCents;
      else spendCents += monthlyCents;
    }

    Object.keys(byCategory).forEach(function (id) {
      var cat = categoryById(catalog, id);
      /* A derived category is handled below, from the household. Any entry
         someone managed to leave here is deliberately ignored rather than
         added — otherwise the figure would be counted twice. */
      if (cat.derivedFrom) return;
      var n = normaliseToMonthly(byCategory[id]);
      addRow(cat, n.monthlyCents, { entryCount: n.counted, monthsCovered: n.monthsCovered });
    });

    /* Derived categories: the value comes from the household field named in
       the catalogue, never from a typed entry. This is what keeps debt
       minimums a single number owned by the Debt Payoff room instead of a
       third editable copy. */
    (catalog.categories || []).forEach(function (cat) {
      if (!cat.derivedFrom) return;
      var source = DERIVED[cat.derivedFrom];
      if (!source) return;
      var value = source(household);
      if (!Money.isOk(value)) return;
      addRow(cat, value.value, { derived: true, derivedFrom: cat.derivedFrom, ownedBy: cat.ownedBy || null });
    });

    categories.sort(function (a, b) { return b.monthlyCents - a.monthlyCents; });

    var window = normaliseToMonthly(usable);

    return Money.ok(spendCents, {
      categories: categories,
      byBucket: byBucket,
      /* Money that leaves and does not come back. Savings is excluded — it
         is a destination, not an expense. */
      spendMonthlyCents: spendCents,
      savingsMonthlyCents: savingsCents,
      /* The subset comparable with the user's monthly-essential estimate. */
      essentialMonthlyCents: essentialCents,
      uncategorisedCount: uncategorised.length,
      monthsCovered: window.monthsCovered,
      entryCount: usable.length,
      referenceVersion: catalog.version
    });
  }

  /* ---- Net cash flow ---------------------------------------------------- */

  /**
   * Take-home pay minus what actually goes out.
   * Uses NET income — the effective-tax lookup from Tier 0 rather than a
   * second tax calculation, per SPEC.md §8.
   */
  function netMonthlyIncomeCents(household, tables) {
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return gross;
    var tax = Tier0.estimatedAnnualTaxCents(household, tables);
    if (!Money.isOk(tax)) return tax;
    return Money.ok(Math.round((gross.value - tax.value) / MONTHS_PER_YEAR), {
      grossAnnualIncomeCents: gross.value,
      estimatedTaxCents: tax.value,
      effectiveRate: tax.effectiveRate,
      referenceVersion: tax.referenceVersion
    });
  }

  function netCashFlow(household, catalog, tables) {
    var summary = summarise(household, catalog);
    if (!Money.isOk(summary)) return summary;
    var net = netMonthlyIncomeCents(household, tables);
    if (!Money.isOk(net)) return net;

    var leftAfterSpending = net.value - summary.spendMonthlyCents;
    return Money.ok(leftAfterSpending, {
      netMonthlyIncomeCents: net.value,
      spendMonthlyCents: summary.spendMonthlyCents,
      savingsMonthlyCents: summary.savingsMonthlyCents,
      /* Zero-based budgeting's test: is every dollar assigned? */
      unassignedCents: leftAfterSpending - summary.savingsMonthlyCents
    });
  }

  /**
   * What is actually free each month — the one place anything asks that.
   *
   * Two bases, in preference order, because a person who has only answered
   * intake has no categories yet and would otherwise see an em dash where
   * the useful number goes:
   *
   *   'categorised'  — take-home minus every category actually entered.
   *                    Sharper, and the one to use once a month is tracked.
   *   'monthlyTotal' — Tier 0's own annual savings figure over twelve.
   *                    Same arithmetic Tier 0 already does for the savings
   *                    rate, not a second definition of "left over", but it
   *                    measures against ESSENTIAL expenses only and so runs
   *                    optimistic wherever discretionary spending has not
   *                    been entered.
   *
   * The basis is always reported back, because the two are not interchangeable
   * and a caller showing the number should be able to say which it is.
   */
  function monthlySurplusCents(household, catalog, tables) {
    var categorised = netCashFlow(household, catalog, tables);
    if (Money.isOk(categorised)) {
      return Money.ok(categorised.value, {
        basis: 'categorised',
        netMonthlyIncomeCents: categorised.netMonthlyIncomeCents,
        spendMonthlyCents: categorised.spendMonthlyCents
      });
    }
    var rate = Tier0.savingsRate(household, tables).excludingMatch;
    if (!Money.isOk(rate)) return rate;
    return Money.ok(Math.round(rate.annualSavingsCents / MONTHS_PER_YEAR), {
      basis: 'monthlyTotal',
      annualSavingsCents: rate.annualSavingsCents,
      expenseSource: rate.expenseSource,
      note: 'measured against essential expenses only'
    });
  }

  /* ---- Budget templates -------------------------------------------------
     Template logic is configuration (SPEC.md §13). This function knows how
     to compare against a split; it does not know what any split IS.       */

  function templateById(templates, id) {
    var list = (templates && templates.templates) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  function compareToTemplate(household, catalog, templates, templateId, tables) {
    var template = templateById(templates, templateId);
    if (!template) {
      return Money.incomplete('No budget template with id "' + templateId + '".', ['template']);
    }
    var summary = summarise(household, catalog);
    if (!Money.isOk(summary)) return summary;

    var basis = netMonthlyIncomeCents(household, tables);
    if (!Money.isOk(basis)) {
      return Money.incomplete('Add your income and filing status to compare against a budget.',
        basis.missing);
    }

    if (!template.targets) {
      /* A method, not a split. The test is whether every dollar is assigned. */
      var flow = netCashFlow(household, catalog, tables);
      return Money.ok(0, {
        template: template, method: 'zero_based',
        basisMonthlyCents: basis.value,
        unassignedCents: Money.isOk(flow) ? flow.unassignedCents : null,
        balanced: Money.isOk(flow) && flow.unassignedCents === 0,
        referenceVersion: templates.version
      });
    }

    var rows = Object.keys(template.targets).map(function (bucketId) {
      var targetCents = Math.round(basis.value * template.targets[bucketId]);
      var actualCents = summary.byBucket[bucketId] || 0;
      return {
        bucketId: bucketId,
        targetRate: template.targets[bucketId],
        targetCents: targetCents,
        actualCents: actualCents,
        varianceCents: actualCents - targetCents,
        actualRate: Money.isOk(Money.safeDivide(actualCents, basis.value, {}))
          ? actualCents / basis.value : null
      };
    });

    return Money.ok(rows.reduce(function (s, r) { return s + Math.abs(r.varianceCents); }, 0), {
      template: template,
      basisMonthlyCents: basis.value,
      rows: rows,
      referenceVersion: templates.version
    });
  }

  /* ---- Feeding the tracked figure ---------------------------------------
     SPEC.md §12.3, resolved: never overwrite. This returns what the tracked
     value SHOULD be; writing it is the room's job, through
     Spine.setMonthlyExpenses(cents, 'tracked'), which preserves the estimate
     and leaves the divergence computable forever.                        */

  function trackedEssentialCents(household, catalog) {
    var summary = summarise(household, catalog);
    if (!Money.isOk(summary)) return summary;
    return Money.ok(summary.essentialMonthlyCents, {
      monthsCovered: summary.monthsCovered,
      basis: 'essential categories only, to match what the estimate was asked for'
    });
  }

  return {
    categoryById: categoryById,
    categorise: categorise,
    normaliseToMonthly: normaliseToMonthly,
    summarise: summarise,
    netMonthlyIncomeCents: netMonthlyIncomeCents,
    netCashFlow: netCashFlow,
    monthlySurplusCents: monthlySurplusCents,
    templateById: templateById,
    compareToTemplate: compareToTemplate,
    trackedEssentialCents: trackedEssentialCents
  };
});
