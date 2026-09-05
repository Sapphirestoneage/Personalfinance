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
  function summarise(household, catalog, opts) {
    var entries = (household && household.expenses && household.expenses.entries) || [];
    var includeLog = !!(opts && opts.includeLog);
    var usable = entries.filter(function (e) {
      /* The log's dated occurrences (D-128) are actuals for the budget,
         not the typical month: they are left out here unless asked for,
         so a receipt logged does not double a line already typed. An
         income cost is never part of the household's month either. */
      if (!includeLog && (e.source === 'log' || e.linkedIncomeId)) return false;
      if (e.active === false) return false;
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
      /* Which of this category's dollars could not be cut next month, and
         whether anyone has said. D-082. */
      var fixedPart = normaliseToMonthly(byCategory[id].filter(function (e) { return e.fixed === true; }));
      var unasked = byCategory[id].filter(function (e) { return e.fixed !== true && e.fixed !== false; }).length;
      addRow(cat, n.monthlyCents, { entryCount: n.counted, monthsCovered: n.monthsCovered,
        fixedMonthlyCents: fixedPart.monthlyCents, fixedAsked: unasked === 0, fixed: unasked === 0 && fixedPart.monthlyCents === n.monthlyCents });
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
      /* A derived line — debt minimums — is fixed by nature. */
      addRow(cat, value.value, { derived: true, derivedFrom: cat.derivedFrom, ownedBy: cat.ownedBy || null,
        fixedMonthlyCents: value.value, fixedAsked: true, fixed: true });
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

  /**
   * templateTargets(household, templates, templateId, tables) — what each
   * bucket of the split comes to in dollars against this household's basis
   * income, with NO spending entered. The comparison below reads it; so
   * does the Cash Flow room when it proposes a first month (D-063). One
   * place turns a split into dollars.
   * A method template (targets: null) has no bucket targets and says so.
   */
  function templateTargets(household, templates, templateId, tables) {
    var template = templateById(templates, templateId);
    if (!template) {
      return Money.incomplete('No budget template with id "' + templateId + '".', ['template']);
    }
    var basis = netMonthlyIncomeCents(household, tables);
    if (!Money.isOk(basis)) {
      return Money.incomplete('Add your income and filing status to compare against a budget.',
        basis.missing);
    }
    var rows = template.targets ? Object.keys(template.targets).map(function (bucketId) {
      return {
        bucketId: bucketId,
        targetRate: template.targets[bucketId],
        targetCents: Math.round(basis.value * template.targets[bucketId])
      };
    }) : [];
    return Money.ok(rows.length, {
      template: template,
      basisMonthlyCents: basis.value,
      rows: rows,
      method: template.targets ? 'split' : 'zero_based',
      referenceVersion: templates.version
    });
  }

  function compareToTemplate(household, catalog, templates, templateId, tables) {
    var targets = templateTargets(household, templates, templateId, tables);
    if (!Money.isOk(targets)) return targets;
    var template = targets.template;
    var summary = summarise(household, catalog);
    if (!Money.isOk(summary)) return summary;
    var basis = { value: targets.basisMonthlyCents };

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

    var rows = targets.rows.map(function (t) {
      var bucketId = t.bucketId;
      var targetCents = t.targetCents;
      var actualCents = summary.byBucket[bucketId] || 0;
      return {
        bucketId: bucketId,
        targetRate: t.targetRate,
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

  /* ---- The contributed savings rate (BRIEF §4.2, D-080) --------------------
     Tier0.savingsRate is the RESIDUAL: what is left of gross after spending
     and tax. This is the CONTRIBUTED rate: what actually went somewhere —
     the 401(k) percentage, Roth and HSA so far this year, and the tracked
     lines in the savings bucket. The gap between the two is money going
     somewhere nobody has named, and comes back as unallocatedMonthlyCents.

     One overlap is handled rather than double-counted: a tracked
     `retirement` line and the contribution percentage are usually the same
     dollars, so the larger of the two counts, once. Every other savings
     category adds. Roth and HSA count only when entered; a blank one is
     listed in `notEntered`, never taken as zero. */
  function savingsRateContributed(household, tables) {
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return gross;
    var ret = household.retirement || {};
    if (!Money.isEntered(ret.contributionPercent)) {
      return Money.incomplete('Add what you contribute to your 401(k) to see what you actually put away.', ['contributionPercent']);
    }
    var pretax = Math.round(gross.value * ret.contributionPercent / 100);
    var parts = [{ id: 'pretax', label: ret.contributionPercent + '% of gross', annualCents: pretax }];
    var notEntered = [];
    ['rothContributedCents', 'hsaContributedCents'].forEach(function (k) {
      if (Money.isEntered(ret[k])) parts.push({ id: k, label: k === 'rothContributedCents' ? 'Roth so far this year' : 'HSA so far this year', annualCents: ret[k] });
      else notEntered.push(k);
    });
    var catalog = tables && tables.expenseCategories;
    var summary = catalog ? summarise(household, catalog) : null;
    var retirementLine = 0, overlapUsed = false;
    if (summary && Money.isOk(summary)) {
      summary.categories.forEach(function (row) {
        if (row.bucket !== 'savings' || !row.monthlyCents) return;
        if (row.categoryId === 'retirement') { retirementLine = row.monthlyCents * MONTHS_PER_YEAR; return; }
        parts.push({ id: 'tracked:' + row.categoryId, label: row.label + ' (tracked)', annualCents: row.monthlyCents * MONTHS_PER_YEAR });
      });
    }
    if (retirementLine > pretax) {
      parts[0] = { id: 'tracked:retirement', label: 'Retirement (tracked, more than the percentage)', annualCents: retirementLine };
      overlapUsed = true;
    }
    var contributed = parts.reduce(function (t, p) { return t + p.annualCents; }, 0);
    var rate = Money.safeDivide(contributed, gross.value, {
      denominatorName: 'grossAnnualIncome',
      zeroReason: 'A gross income of zero can\u2019t produce a savings rate.'
    });
    if (!Money.isOk(rate)) return rate;
    var residual = Tier0.savingsRate(household, tables).excludingMatch;
    var unallocated = Money.isOk(residual) ? residual.annualSavingsCents - contributed : null;
    return Money.ok(rate.value, {
      variant: 'contributed',
      annualSavingsCents: contributed,
      grossAnnualIncomeCents: gross.value,
      parts: parts,
      notEntered: notEntered,
      retirementOverlap: { pretaxCents: pretax, trackedCents: retirementLine, usedTracked: overlapUsed },
      residualRate: Money.isOk(residual) ? residual.value : null,
      residualAnnualCents: Money.isOk(residual) ? residual.annualSavingsCents : null,
      unallocatedAnnualCents: unallocated,
      unallocatedMonthlyCents: unallocated === null ? null : Math.round(unallocated / MONTHS_PER_YEAR)
    });
  }

  /* ---- The floor (BRIEF §4.4, D-082) ------------------------------------
     minimumViableMonthCents: the spending lines marked fixed, plus the
     derived debt minimums — what next month costs if everything cuttable
     is cut. cuttability: 1 − floor ÷ spending. Both need at least one line
     answered; a line nobody has answered is neither fixed nor cuttable, and
     is counted and reported as unasked rather than assumed either way.
     Savings lines are outside both: a floor is spending. */
  function minimumViableMonthCents(household, catalog) {
    var summary = summarise(household, catalog);
    if (!Money.isOk(summary)) return summary;
    var floor = 0, asked = 0, unasked = 0, fixedRows = [];
    summary.categories.forEach(function (row) {
      if (row.bucket === 'savings') return;
      if (row.fixedAsked) asked++; else unasked++;
      if (row.fixedMonthlyCents) { floor += row.fixedMonthlyCents; fixedRows.push({ categoryId: row.categoryId, label: row.label, monthlyCents: row.fixedMonthlyCents, derived: row.derived === true }); }
    });
    var answeredByHand = summary.categories.some(function (row) { return row.bucket !== 'savings' && !row.derived && row.fixedAsked; });
    if (!answeredByHand) {
      return Money.incomplete('Mark which lines you could not cut next month to see the floor.', ['expenseEntries.fixed']);
    }
    return Money.ok(floor, {
      spendMonthlyCents: summary.spendMonthlyCents,
      fixedRows: fixedRows,
      askedCount: asked,
      unaskedCount: unasked,
      monthsCovered: summary.monthsCovered
    });
  }

  function cuttability(household, catalog) {
    var floor = minimumViableMonthCents(household, catalog);
    if (!Money.isOk(floor)) return floor;
    var r = Money.safeDivide(floor.spendMonthlyCents - floor.value, floor.spendMonthlyCents, {
      denominatorName: 'monthlyExpenses',
      zeroReason: 'Nothing is spent, so nothing can be cut.'
    });
    if (Money.isOk(r)) { r.floorCents = floor.value; r.spendMonthlyCents = floor.spendMonthlyCents; r.unaskedCount = floor.unaskedCount; }
    return r;
  }

  function trackedEssentialCents(household, catalog) {
    var summary = summarise(household, catalog);
    if (!Money.isOk(summary)) return summary;
    return Money.ok(summary.essentialMonthlyCents, {
      monthsCovered: summary.monthsCovered,
      basis: 'essential categories only, to match what the estimate was asked for'
    });
  }

  /* ---- The expense log (D-128) --------------------------------------------
     Dated occurrences: a receipt, a bill paid, a transfer made. A logged
     entry with period 'monthly' repeats on its day each month from its
     date on; 'once' lands on its date. Archived entries never count. */
  function groupOf(catalog, categoryId) {
    var c = categoryById(catalog, categoryId);
    return c && c.group ? c.group : 'other';
  }
  function groupById(catalog, groupId) {
    var list = (catalog && catalog.groups) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === groupId) return list[i]; }
    return null;
  }
  function logEntries(household) {
    return ((household && household.expenses && household.expenses.entries) || []).filter(function (e) { return e && e.source === 'log'; });
  }
  function ym(date) { return typeof date === 'string' && date.length >= 7 ? date.slice(0, 7) : null; }
  function logOccurrences(entry, month) {
    if (!entry || !Money.isEntered(entry.amountCents) || !entry.date || !/^\d{4}-\d{2}$/.test(month || '')) return [];
    if (entry.period !== 'monthly') return ym(entry.date) === month ? [{ date: entry.date, cents: entry.amountCents }] : [];
    if (ym(entry.date) > month) return [];
    var y = +month.slice(0, 4), m = +month.slice(5, 7) - 1;
    var dim = new Date(y, m + 1, 0).getDate();
    var day = Math.min(+entry.date.slice(8, 10) || 1, dim);
    return [{ date: month + '-' + (day < 10 ? '0' : '') + day, cents: entry.amountCents }];
  }
  /**
   * logInMonth(household, catalog, 'YYYY-MM') — every active logged
   * occurrence in the month with its group, and the totals: by group, by
   * budget bucket, personal against income costs, deductible.
   */
  function logInMonth(household, catalog, month) {
    var rows = [], byGroup = {}, byBucket = { expenses: 0, savings: 0, investments: 0, debt: 0, income_costs: 0 };
    var personal = 0, costs = 0, deductible = 0, pendingReimb = 0, reimbursed = 0;
    logEntries(household).forEach(function (e) {
      if (e.active === false) return;
      var reimb = e.produced === 'reimbursable';
      logOccurrences(e, month).forEach(function (o) {
        var g = groupOf(catalog, e.categoryId);
        var gr = groupById(catalog, g);
        var bucket = e.linkedIncomeId ? 'income_costs' : ((gr && gr.bucketOf) || 'expenses');
        rows.push({ id: e.id, entryId: e.id, date: o.date, cents: o.cents, categoryId: e.categoryId, group: g, bucket: bucket,
          descriptor: e.descriptor || null, linkedIncomeId: e.linkedIncomeId || null, deductible: e.deductible === true, recurring: e.period === 'monthly', hidden: e.hidden === true,
          produced: e.produced || (e.linkedIncomeId ? 'linked' : 'personal'),
          reimbursableFrom: reimb ? e.reimbursableFrom || null : null, reimbursementStatus: reimb ? e.reimbursementStatus : null, expectedAmountCents: reimb ? e.expectedAmountCents : null });
        byGroup[g] = (byGroup[g] || 0) + o.cents;
        byBucket[bucket] = (byBucket[bucket] || 0) + o.cents;
        if (e.linkedIncomeId) { costs += o.cents; if (e.deductible === true) deductible += o.cents; } else personal += o.cents;
        if (reimb && e.reimbursementStatus !== 'received') pendingReimb += o.cents;
      });
      /* A reimbursement received lands as a credit in the month it came,
         against the bucket the expense sat in — never back in the month
         of the expense (D-129). The expense itself stayed in full above. */
      if (reimb && e.reimbursementStatus === 'received' && e.dateReceived && e.dateReceived.slice(0, 7) === month) {
        var back = Money.isEntered(e.receivedAmountCents) ? e.receivedAmountCents : (Money.isEntered(e.expectedAmountCents) ? e.expectedAmountCents : e.amountCents);
        if (!Money.isEntered(back) || back === 0) return;
        var g2 = groupOf(catalog, e.categoryId);
        var gr2 = groupById(catalog, g2);
        var bucket2 = (gr2 && gr2.bucketOf) || 'expenses';
        rows.push({ id: e.id + ':credit', entryId: e.id, date: e.dateReceived, cents: -back, categoryId: e.categoryId, group: g2, bucket: bucket2,
          descriptor: e.descriptor || null, linkedIncomeId: null, deductible: false, recurring: false, hidden: e.hidden === true,
          produced: 'reimbursable', credit: true, reimbursableFrom: e.reimbursableFrom || null, reimbursementStatus: 'received', expectedAmountCents: e.expectedAmountCents });
        byGroup[g2] = (byGroup[g2] || 0) - back;
        byBucket[bucket2] = (byBucket[bucket2] || 0) - back;
        personal -= back; reimbursed += back;
      }
    });
    rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return { month: month, rows: rows, byGroup: byGroup, byBucket: byBucket, personalCents: personal, incomeCostsCents: costs, deductibleCents: deductible,
      pendingReimbursementCents: pendingReimb, reimbursedCents: reimbursed, count: rows.length };
  }
  /** Reimbursable expenses still waiting to be paid back, whatever the month. */
  function pendingReimbursements(household) {
    return logEntries(household).filter(function (e) { return e.active !== false && e.produced === 'reimbursable' && e.reimbursementStatus !== 'received'; });
  }

  return {
    categoryById: categoryById,
    categorise: categorise,
    groupOf: groupOf,
    groupById: groupById,
    logEntries: logEntries,
    logOccurrences: logOccurrences,
    logInMonth: logInMonth,
    pendingReimbursements: pendingReimbursements,
    normaliseToMonthly: normaliseToMonthly,
    summarise: summarise,
    netMonthlyIncomeCents: netMonthlyIncomeCents,
    netCashFlow: netCashFlow,
    monthlySurplusCents: monthlySurplusCents,
    templateById: templateById,
    templateTargets: templateTargets,
    compareToTemplate: compareToTemplate,
    trackedEssentialCents: trackedEssentialCents,
    savingsRateContributed: savingsRateContributed,
    minimumViableMonthCents: minimumViableMonthCents,
    cuttability: cuttability
  };
});
