/* ==========================================================================
   engines/budget.js — the reflected budget: five buckets, estimated beside
   actual, and the month closed on them. DECISIONS.md D-128.
   --------------------------------------------------------------------------
   Nothing is typed onto the budget. Every figure here is READ:

     Estimated   for an open month, in order: a figure set by hand for that
                 month and bucket (household.budget.estimated — the
                 Estimated-vs-Actual room's one write); else the last closed
                 month's actual for the bucket; else the onboarding figures
                 the one-pager and Cash Flow already hold — take-home a
                 month for income, the typical-month lines by group for
                 expenses / savings / investments / debt, the workplace
                 contribution when no line is typed.
     Actual      the month's landings: income entries netted of tax
                 (engines/ledger.js month → takeHomeCents), and the expense
                 log by bucket (engines/cashflow.js logInMonth). The cost
                 of earning an income entry is neither bucket's line — it
                 is shown under income as what it cost.

   Closing a month (recordFor → Spine.closeMonth) freezes both columns into
   a MonthRecord. An entry logged into a closed month afterwards changes
   only actualRevised (syncRevised); the frozen actual never moves.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'),
             CashFlow: require('./cashflow.js'), Ledger: require('./ledger.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, CashFlow: S.CashFlow, Ledger: S.Ledger };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.CashFlow, deps.Ledger);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Budget = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, CashFlow, Ledger) {
  'use strict';

  var BUCKETS = Schema.BUDGET_BUCKETS;
  var LABELS = { income: 'Income', expenses: 'Expenses', savings: 'Savings', investments: 'Investments', debt: 'Debt' };
  var MONTHS = 12;

  function closedMonths(h) { return ((h && h.ledger && h.ledger.months) || []).slice(); }
  function recordFor(h, ym) { return closedMonths(h).filter(function (m) { return m.id === ym; })[0] || null; }
  function isClosed(h, ym) { return !!recordFor(h, ym); }
  function lastClosedBefore(h, ym) {
    var before = closedMonths(h).filter(function (m) { return m.id < ym; });
    return before.length ? before[before.length - 1] : null;
  }
  function shift(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    var d = new Date(y, m, 1);
    return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
  }
  /** The first month not yet closed: after the last closed one, or now. */
  function nextOpenMonth(h, now) {
    var cur = Ledger.thisMonth(now);
    var all = closedMonths(h);
    if (!all.length) return cur;
    var after = shift(all[all.length - 1].id, 1);
    return after > cur ? after : cur;
  }

  /* ---- Onboarding figures: what the household already holds ------------- */
  function onboarding(h, T, catalog) {
    var out = {};
    var take = Tier0.takeHomeMonthlyCents(h, T);
    out.income = Money.isOk(take) ? { cents: take.value, reason: null, from: 'take-home a month, from Start Here' } : { cents: null, reason: take.reason, from: null };
    var sum = CashFlow.summarise(h, catalog);
    var byBucket = { expenses: 0, savings: 0, investments: 0, debt: 0 };
    var seen = { expenses: false, savings: false, investments: false, debt: false };
    if (Money.isOk(sum)) {
      sum.categories.forEach(function (c) {
        var g = CashFlow.groupById(catalog, CashFlow.groupOf(catalog, c.categoryId));
        var b = g && byBucket.hasOwnProperty(g.bucketOf) ? g.bucketOf : 'expenses';
        byBucket[b] += c.monthlyCents; seen[b] = true;
      });
    }
    out.expenses = seen.expenses ? { cents: byBucket.expenses, reason: null, from: 'the typical-month lines in Cash Flow' } : (function () {
      var e = Schema.monthlyExpensesCents(h);
      return Money.isOk(e) ? { cents: e.value, reason: null, from: 'a month of spending, from Start Here' } : { cents: null, reason: 'Add a month of spending in Start Here or a line in Cash Flow.', from: null };
    })();
    out.savings = seen.savings ? { cents: byBucket.savings, reason: null, from: 'the savings lines in Cash Flow' } : { cents: null, reason: 'Type a savings line in Cash Flow, or log a transfer, and it starts here.', from: null };
    if (seen.investments) out.investments = { cents: byBucket.investments, reason: null, from: 'the retirement and investment lines in Cash Flow' };
    else {
      var pct = (h.retirement || {}).contributionPercent;
      var gross = Schema.grossAnnualIncomeCents(h);
      out.investments = Money.isEntered(pct) && Money.isOk(gross) ? { cents: Math.round(gross.value * pct / 100 / MONTHS), reason: null, from: 'the workplace contribution, from Start Here' } : { cents: null, reason: 'Add a contribution rate in Start Here, or an investment line in Cash Flow.', from: null };
    }
    if (seen.debt) out.debt = { cents: byBucket.debt, reason: null, from: 'the debt lines in Cash Flow' };
    else {
      var mins = Schema.monthlyDebtPaymentsCents(h);
      out.debt = Money.isOk(mins) ? { cents: mins.value, reason: null, from: 'the minimums, from Debt Payoff' } : { cents: null, reason: mins.reason, from: null };
    }
    return out;
  }

  /** The Estimated column for an open month, with where each figure came from. */
  function estimated(h, T, catalog, ym) {
    var set = (h.budget && h.budget.estimated && h.budget.estimated[ym]) || {};
    var last = lastClosedBefore(h, ym);
    var base = null;
    var out = {};
    BUCKETS.forEach(function (b) {
      if (Money.isEntered(set[b])) { out[b] = { cents: set[b], basis: 'set', from: 'set by hand for ' + Schema.monthLabel(ym) }; return; }
      if (last && Money.isEntered(last.actual[b])) { out[b] = { cents: last.actual[b], basis: 'lastClosed', from: last.label + '’s actual' }; return; }
      if (!base) base = onboarding(h, T, catalog);
      out[b] = { cents: base[b].cents, basis: 'onboarding', from: base[b].from, reason: base[b].reason };
    });
    return out;
  }

  /** The Actual column for a month, from the ledger and the log. */
  function actual(h, T, catalog, ym) {
    var inc = Ledger.month(h, T, ym);
    var log = CashFlow.logInMonth(h, catalog, ym);
    var out = {
      income: { cents: inc.count ? inc.takeHomeCents : 0, gross: inc.grossCents, tax: inc.taxCents, count: inc.count, incomplete: inc.incomplete,
        lines: inc.rows.map(function (r) { return { id: r.entry.id, label: r.entry.label || Schema.INCOME_KIND_RULES[r.entry.kind].label, cents: Money.isEntered(r.takeHomeCents) ? r.takeHomeCents : r.grossCents, grossCents: r.grossCents, times: r.occurrences.length, reason: r.reason || null }; }) },
      expenses: { cents: log.byBucket.expenses || 0 }, savings: { cents: log.byBucket.savings || 0 },
      investments: { cents: log.byBucket.investments || 0 }, debt: { cents: log.byBucket.debt || 0 },
      incomeCostsCents: log.incomeCostsCents, deductibleCents: log.deductibleCents
    };
    ['expenses', 'savings', 'investments', 'debt'].forEach(function (b) {
      var groups = {};
      log.rows.forEach(function (r) { if (r.bucket !== b) return; groups[r.group] = (groups[r.group] || 0) + r.cents; });
      out[b].lines = Object.keys(groups).map(function (g) { var gr = CashFlow.groupById(catalog, g); return { id: g, label: gr ? gr.label : g, cents: groups[g] }; }).sort(function (a, c) { return c.cents - a.cents; });
      out[b].count = log.rows.filter(function (r) { return r.bucket === b; }).length;
    });
    out.sources = { income: inc.rows.map(function (r) { return r.entry.id; }), expenses: log.rows.map(function (r) { return r.entryId; }) };
    return out;
  }

  /**
   * month(h, T, catalog, 'YYYY-MM') — the sheet. For a closed month the
   * columns are the record's, frozen, with actualRevised beside them when
   * a late entry moved it; for an open month they are read live.
   */
  function month(h, T, catalog, ym, now) {
    var m = ym || nextOpenMonth(h, now);
    var record = recordFor(h, m);
    var cur = Ledger.thisMonth(now);
    if (record) {
      return { month: m, label: record.label, status: 'closed', closedAt: record.closedAt, record: record,
        rows: BUCKETS.map(function (b) {
          var e = record.estimated[b], a = record.actual[b], r = record.actualRevised ? record.actualRevised[b] : null;
          return { bucket: b, label: LABELS[b], estimatedCents: e, estBasis: 'frozen', actualCents: a, revisedCents: Money.isEntered(r) && r !== a ? r : null,
            differenceCents: Money.isEntered(e) && Money.isEntered(a) ? a - e : null, lines: (record.lines && record.lines[b]) || [] };
        }), canClose: false, isCurrent: m === cur };
    }
    var est = estimated(h, T, catalog, m);
    var act = actual(h, T, catalog, m);
    return { month: m, label: Schema.monthLabel(m), status: 'open', record: null,
      rows: BUCKETS.map(function (b) {
        var e = est[b], a = act[b];
        return { bucket: b, label: LABELS[b], estimatedCents: e.cents, estBasis: e.basis, estFrom: e.from, estReason: e.reason || null,
          actualCents: a.cents, actualCount: a.count || 0, differenceCents: Money.isEntered(e.cents) ? a.cents - e.cents : null, lines: a.lines || [] };
      }),
      incomeCostsCents: act.incomeCostsCents, deductibleCents: act.deductibleCents, incomeIncomplete: act.income.incomplete,
      sources: act.sources, canClose: m <= cur, isCurrent: m === cur, isFuture: m > cur };
  }

  /** The record Spine.closeMonth takes, from the open month as it stands. */
  function recordPayload(h, T, catalog, ym, now) {
    var sheet = month(h, T, catalog, ym, now);
    if (sheet.status === 'closed') return null;
    var est = {}, act = {}, lines = {};
    sheet.rows.forEach(function (r) { est[r.bucket] = r.estimatedCents; act[r.bucket] = r.actualCents; lines[r.bucket] = r.lines; });
    return { month: sheet.month, label: sheet.label, estimated: est, actual: act, lines: lines, sources: sheet.sources };
  }

  /**
   * revisedFor(h, T, catalog, record) — the actual as it stands now for a
   * closed month; null when nothing moved since the close. Whatever moved
   * is a late entry: it goes to actualRevised and nowhere else.
   */
  function revisedFor(h, T, catalog, record) {
    var act = actual(h, T, catalog, record.id);
    var out = {}, moved = false;
    BUCKETS.forEach(function (b) {
      var now = act[b].cents;
      out[b] = now;
      if (now !== record.actual[b]) moved = true;
    });
    var prior = record.actualRevised || record.actual;
    var same = BUCKETS.every(function (b) { return prior[b] === out[b]; });
    return moved && !same ? out : (moved && record.actualRevised ? null : (moved ? out : null));
  }
  /** Write the revised column for every closed month a late entry touched. */
  function syncRevised(h, T, catalog, Spine) {
    var n = 0;
    closedMonths(h).forEach(function (r) {
      var rev = revisedFor(h, T, catalog, r);
      if (rev) { Spine.reviseMonth(r.id, rev); n++; }
    });
    return n;
  }

  return {
    BUCKETS: BUCKETS,
    LABELS: LABELS,
    closedMonths: closedMonths,
    recordFor: recordFor,
    isClosed: isClosed,
    lastClosedBefore: lastClosedBefore,
    nextOpenMonth: nextOpenMonth,
    shift: shift,
    onboarding: onboarding,
    estimated: estimated,
    actual: actual,
    month: month,
    recordPayload: recordPayload,
    revisedFor: revisedFor,
    syncRevised: syncRevised
  };
});
