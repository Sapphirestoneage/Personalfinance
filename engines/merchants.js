/* ==========================================================================
   engines/merchants.js, the unique lines in a statement, and the slope.
   DECISIONS.md D-306.
   --------------------------------------------------------------------------
   A bank or card statement is a few hundred lines from a few dozen places.
   This reads the expense log Expenses owns and folds it by MERCHANT: one
   row per place money went, with how many times, how much, the last date,
   the rhythm when there is one, and the category its lines file under. A
   category chosen for a merchant is a RULE, stored on the household, and
   a rule re-files every line from that merchant, past and future.

   A line can also say what day it was FOR (forDate): a ticket bought in
   March for July, a bill paid in May for April. The SLOPE is spending
   cumulated two ways over a window, by the day it left the account and by
   the day it was for. Where the two lines part is money paid ahead or paid
   late, which is the accounting layer a cash log alone cannot show.

     Merchants.key(description)              the merchant key (one function
                                             with the finder's, so a
                                             subscription and a merchant
                                             agree on who is who)
     Merchants.rules(h)                      the household's rules, normalised
     Merchants.setRule(list, key, categoryId, label) → the new list; a null
                                             category removes the rule
     Merchants.categoryFor(description, h)   the rule's category, or null
     Merchants.list(h, tables)               → [{ key, label, count, totalCents,
                                             typicalCents, firstDate, lastDate,
                                             categoryId, ruled, mixed, rhythm,
                                             rhythmLabel, entries[] }]
     Merchants.refile(h)                     → [{ id, categoryId }]: every line
                                             a rule would move
     Merchants.slope(h, { month })           → { from, to, days[], paidCents,
                                             forCents, aheadCents, behindCents,
                                             aheadCount, behindCount }
     Merchants.discretionary(row, catalog)   true when a logged line is wants
                                             money: a category the catalog
                                             files under wants, in the expenses
                                             bucket, and not marked fixed (D-338)
     Merchants.byPlace(h, tables, { months, month, today })
                                             → { from, to, months, rows[], totalCents,
                                             discretionaryCents, count }: a
                                             window of the log folded by place,
                                             all money and discretionary money
                                             apart, largest first (D-338)
   Money is integer cents. Nothing here writes; the room writes through
   the spine.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Subs: require('./subscriptions.js'), CashFlow: require('./cashflow.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Subs: root.SLAF && root.SLAF.Subscriptions, CashFlow: root.SLAF && root.SLAF.CashFlow };
  }
  var api = factory(deps.Money, deps.Schema, deps.Subs, deps.CashFlow);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Merchants = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Subs, CashFlow) {
  'use strict';
  var ISO = /^\d{4}-\d{2}-\d{2}$/;

  /* One key for a merchant and a subscription: the finder's. */
  function key(desc) { return Subs.key(desc); }

  /* The lines a statement contributes: dated, one-off, spending, live. */
  function lines(h) {
    return (((h || {}).expenses || {}).entries || []).filter(function (e) {
      return e && e.date && ISO.test(e.date) && Money.isEntered(e.amountCents) && e.amountCents > 0 && e.period === 'once' && e.hidden !== true && e.active !== false;
    });
  }

  function rules(h) {
    return (((h || {}).expenses || {}).rules || []).filter(function (r) { return r && typeof r.key === 'string' && r.key && typeof r.categoryId === 'string' && r.categoryId; });
  }
  function setRule(list, k, categoryId, label) {
    var out = (list || []).filter(function (r) { return r && r.key !== k; });
    if (!k || !categoryId) return out;
    out.push({ key: k, categoryId: categoryId, label: label || k, at: Schema.localDay() });
    return out;
  }
  function categoryFor(desc, h) {
    var k = key(desc);
    if (!k) return null;
    var r = rules(h).filter(function (x) { return x.key === k; })[0];
    return r ? r.categoryId : null;
  }

  /* The category most of a merchant's lines carry; ties go to the latest. */
  function commonest(list) {
    var n = {}, best = null;
    list.forEach(function (e) { var c = e.categoryId || 'other'; n[c] = (n[c] || 0) + 1; });
    Object.keys(n).forEach(function (c) { if (best === null || n[c] > n[best]) best = c; });
    return best;
  }
  function median(xs) {
    var s = xs.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  function list(h, tables) {
    var groups = {};
    lines(h).forEach(function (e) { var k = key(e.descriptor || e.categoryId || ''); if (!k) return; (groups[k] = groups[k] || []).push(e); });
    var rhythm = {};
    (Subs && Subs.find ? Subs.find(h, tables) : []).forEach(function (s) { rhythm[s.key] = s; });
    var rule = {}; rules(h).forEach(function (r) { rule[r.key] = r; });
    var out = Object.keys(groups).map(function (k) {
      var g = groups[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var total = g.reduce(function (s, e) { return s + e.amountCents; }, 0);
      var cats = {}; g.forEach(function (e) { cats[e.categoryId || 'other'] = true; });
      var r = rhythm[k];
      return {
        key: k,
        label: g[g.length - 1].descriptor || k,
        count: g.length,
        totalCents: total,
        typicalCents: median(g.map(function (e) { return e.amountCents; })),
        firstDate: g[0].date,
        lastDate: g[g.length - 1].date,
        categoryId: rule[k] ? rule[k].categoryId : commonest(g),
        ruled: !!rule[k],
        mixed: Object.keys(cats).length > 1,
        rhythm: r ? r.rhythm : null,
        rhythmLabel: r ? r.rhythmLabel : null,
        entries: g.map(function (e) { return { id: e.id, date: e.date, amountCents: e.amountCents, categoryId: e.categoryId || null, forDate: e.forDate && ISO.test(e.forDate) ? e.forDate : null, descriptor: e.descriptor || null, categorizedBy: e.categorizedBy || null }; })
      };
    });
    out.sort(function (a, b) { return b.totalCents - a.totalCents || (a.label < b.label ? -1 : 1); });
    return out;
  }

  /* Every line a rule would move: the room writes these through the spine. */
  function refile(h) {
    var rule = {}; rules(h).forEach(function (r) { rule[r.key] = r; });
    var out = [];
    lines(h).forEach(function (e) {
      var r = rule[key(e.descriptor || e.categoryId || '')];
      if (r && e.categoryId !== r.categoryId) out.push({ id: e.id, categoryId: r.categoryId });
    });
    return out;
  }

  /* ---- The slope --------------------------------------------------------
     Two cumulative lines over a window of days: what left the account by
     its date, and the same money by the day it was for. A line with no
     forDate was for the day it was paid. Money paid in the window for a
     day outside it shows on the paid line only, and money for a day in the
     window paid outside it shows on the for line only: that gap IS the
     point. */
  /* ---- Where the money went, by place (D-338) --------------------------
     A window of the log folded by place: every counted occurrence (the
     month's own reader, so a recurring bill, a statement line and a
     receipt typed by hand all count once, a potential date never, a
     repayment received as money back), keyed the way the list above keys.
     Discretionary money is the part a person chose: a category the catalog
     files under wants; spending, not savings, a contribution or a debt
     payment; and nothing marked fixed. */
  function discretionary(row, catalog) {
    if (!row || row.fixed === true || !catalog || !CashFlow) return false;
    if (row.bucket && row.bucket !== 'expenses') return false;
    /* The catalog's own word: a category in the wants bucket is "real
       spending, but discretionary" (data/expense_categories.json). */
    var c = CashFlow.categoryById(catalog, row.categoryId);
    return !!(c && c.bucket === 'wants');
  }
  function shiftYm(ym, n) { var d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function byPlace(h, tables, opts) {
    var o = opts || {};
    var catalog = (tables || {}).expenseCategories || null;
    var today = Schema.localDay(o.today);
    var last = /^\d{4}-\d{2}$/.test(o.month || '') ? o.month : today.slice(0, 7);
    var n = o.months === undefined || o.months === null ? 1 : Math.max(0, Math.floor(o.months));
    var months = [];
    if (n > 0) { for (var i = n - 1; i >= 0; i--) months.push(shiftYm(last, -i)); }
    else {
      var seen = {};
      (((h || {}).expenses || {}).entries || []).forEach(function (e) { if (e && e.source === 'log' && e.active !== false && e.date && ISO.test(e.date)) seen[e.date.slice(0, 7)] = true; });
      months = Object.keys(seen).filter(function (m) { return m <= last; }).sort();
      /* A recurring line counts every month from its first; the window
         runs from the earliest dated line to the month shown. */
      if (months.length) { for (var m = months[0]; m <= last; m = shiftYm(m, 1)) if (months.indexOf(m) < 0) months.push(m); months.sort(); }
    }
    var groups = {}, total = 0, disc = 0, count = 0;
    months.forEach(function (m) {
      (CashFlow ? CashFlow.logInMonth(h, catalog, m).rows : []).forEach(function (r) {
        var k = key(r.descriptor || r.categoryId || '');
        if (!k) return;
        var g = groups[k] = groups[k] || { key: k, label: r.descriptor || k, count: 0, totalCents: 0, discretionaryCents: 0, cats: {}, lastDate: null };
        var isDisc = discretionary(r, catalog);
        g.count += r.credit ? 0 : 1;
        g.totalCents += r.cents;
        if (isDisc) g.discretionaryCents += r.cents;
        g.cats[r.categoryId || 'other'] = (g.cats[r.categoryId || 'other'] || 0) + r.cents;
        if (!g.lastDate || r.date >= g.lastDate) { g.lastDate = r.date; if (r.descriptor) g.label = r.descriptor; }
        total += r.cents; if (isDisc) disc += r.cents; if (!r.credit) count++;
      });
    });
    var rows = Object.keys(groups).map(function (k) {
      var g = groups[k];
      var top = Object.keys(g.cats).sort(function (a, b) { return g.cats[b] - g.cats[a]; })[0] || null;
      return { key: g.key, label: g.label, count: g.count, totalCents: g.totalCents, discretionaryCents: g.discretionaryCents, categoryId: top, lastDate: g.lastDate };
    });
    rows.sort(function (a, b) { return b.totalCents - a.totalCents || (a.label < b.label ? -1 : 1); });
    return { from: months.length ? months[0] : null, to: months.length ? months[months.length - 1] : null, months: months.length,
      rows: rows, totalCents: total, discretionaryCents: disc, count: count };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(day, n) { var d = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n); return iso(d); }
  function monthEnd(ym) { return iso(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0)); }
  function slope(h, opts) {
    var o = opts || {};
    var today = o.today && ISO.test(o.today) ? o.today : Schema.localDay();
    var ym = /^\d{4}-\d{2}$/.test(o.month || '') ? o.month : today.slice(0, 7);
    var from = ym + '-01', to = ym === today.slice(0, 7) && today < monthEnd(ym) ? today : monthEnd(ym);
    var paidBy = {}, forBy = {};
    var ahead = 0, aheadN = 0, behind = 0, behindN = 0, paidTotal = 0, forTotal = 0, count = 0;
    lines(h).forEach(function (e) {
      var f = e.forDate && ISO.test(e.forDate) ? e.forDate : e.date;
      if (e.date >= from && e.date <= to) {
        paidBy[e.date] = (paidBy[e.date] || 0) + e.amountCents; paidTotal += e.amountCents; count++;
        if (f > e.date) { ahead += e.amountCents; aheadN++; }
        else if (f < e.date) { behind += e.amountCents; behindN++; }
      }
      if (f >= from && f <= to) { forBy[f] = (forBy[f] || 0) + e.amountCents; forTotal += e.amountCents; }
    });
    var days = [], cp = 0, cf = 0;
    for (var d = from; d <= to; d = addDays(d, 1)) {
      cp += paidBy[d] || 0; cf += forBy[d] || 0;
      days.push({ date: d, paidCents: paidBy[d] || 0, forCents: forBy[d] || 0, cumPaidCents: cp, cumForCents: cf });
    }
    return { month: ym, from: from, to: to, today: today, days: days, count: count, paidCents: paidTotal, forCents: forTotal, aheadCents: ahead, aheadCount: aheadN, behindCents: behind, behindCount: behindN };
  }

  return { key: key, lines: lines, rules: rules, setRule: setRule, categoryFor: categoryFor, list: list, refile: refile, slope: slope, discretionary: discretionary, byPlace: byPlace };
});
