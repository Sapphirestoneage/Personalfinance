/* ==========================================================================
   engines/gap.js — the monthly gap, refined level by level. D-248.
   --------------------------------------------------------------------------
   The one number a household wants first is what is left of a month after
   spending and the debt minimums: the gap. This file reads it at four
   levels of precision, each a short list of things to enter, so the app
   can say where you are and exactly what makes the number more exact:

     1  Rough      pay, one spending number, total debt
                   take-home is estimated from the tables
     2  Exact pay  a recurring paycheck logged in Income
                   take-home is what actually lands (D-246)
     3  Split      spending in four lines, every debt with its minimum
     4  Actual     a month closed in Budget
                   the gap is what really happened, averaged

   One formula throughout: take-home less spending less the minimums,
   engines/debt.js freeMonthlyCents for levels 1 to 3 and
   realizedFreeMonthlyCents for level 4. This file decides nothing about
   the money; it decides which inputs are in and which level that makes.
   `needs` are ownership field ids, so every missing input is a link.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Ownership: require('../shared/ownership.js'), Debt: require('./debt.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Debt: S.Debt };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.Debt);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Gap = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, Debt) {
  'use strict';

  var LEVELS = [
    { n: 1, id: 'rough', label: 'Rough', say: 'from your pay, one spending number and what you owe',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'totalDebt'],
      basis: 'take-home estimated from the tax tables' },
    { n: 2, id: 'pay', label: 'Exact pay', say: 'with a real paycheck logged',
      needs: ['ledgerIncome'],
      basis: 'take-home from your logged paychecks' },
    { n: 3, id: 'split', label: 'Spending split', say: 'with spending in four lines and every debt’s minimum',
      needs: ['foodMonthly', 'accommodationMonthly', 'transportationMonthly', 'wantsMonthly', 'monthlyDebtPayments'],
      basis: 'food, a roof, getting around and the rest, typed; each debt’s minimum' },
    { n: 4, id: 'actual', label: 'Actual', say: 'from months you have closed',
      needs: ['closedMonth'],
      basis: 'what actually came in and went out, the last closed months' }
  ];

  /* A need that is not an ownership field: a closed month with income. */
  function closedMonthDescribe(h, from) {
    var r = Debt.realizedFreeMonthlyCents(h);
    return { fieldId: 'closedMonth', label: 'A closed month', href: Ownership.linkTo('budget', 'close', from), ownerId: 'budget', ownerTitle: 'Budget',
      applies: true, isSet: Money.isOk(r) };
  }

  /* Level 1's view of the household: the same numbers with the income log
     set aside, so the gap it reports is the estimate a first round gives,
     and level 2's difference from it is what the logged pay changed. */
  function withoutLog(h) {
    return Object.assign({}, h, { ledger: Object.assign({}, h.ledger || {}, { income: [] }) });
  }

  function describe(fieldId, h, from) {
    if (fieldId === 'closedMonth') return closedMonthDescribe(h, from);
    var d = Ownership.describe(fieldId, h, from);
    return d ? { fieldId: fieldId, label: d.label, href: d.href, ownerId: d.ownerId, ownerTitle: d.ownerTitle, applies: d.applies, isSet: d.isSet } : null;
  }

  /** levels(h, tables, from) → { levels, current, next, gap, reachedCount } */
  function levels(household, tables, from) {
    var h = household || {};
    var out = [], prevGap = null;
    LEVELS.forEach(function (spec) {
      var missing = [];
      spec.needs.forEach(function (id) {
        var d = describe(id, h, from || 'dashboard');
        if (!d || !d.applies || d.isSet) return;
        missing.push({ fieldId: d.fieldId, label: d.label, href: d.href, ownerTitle: d.ownerTitle });
      });
      var reached = missing.length === 0;
      var gap = null;
      if (reached) {
        if (spec.id === 'actual') gap = Debt.realizedFreeMonthlyCents(h);
        else if (spec.id === 'rough') gap = Debt.freeMonthlyCents(withoutLog(h), tables);   /* as level 1 sees it: the estimate */
        else gap = Debt.freeMonthlyCents(h, tables);
      }
      var level = { n: spec.n, id: spec.id, label: spec.label, say: spec.say, basis: spec.basis, needs: spec.needs.slice(), missing: missing,
        reached: reached && !!gap && Money.isOk(gap), gap: gap, gapCents: gap && Money.isOk(gap) ? gap.value : null, deltaCents: null };
      if (level.reached && prevGap !== null) level.deltaCents = level.gapCents - prevGap;
      if (level.reached) prevGap = level.gapCents;
      out.push(level);
    });
    /* The level you are on is the highest one reached with every lower
       level reached too: a closed month with no pay logged is still
       level 1, because level 2's exactness is missing from it. */
    var current = null;
    for (var i = 0; i < out.length; i++) { if (out[i].reached) current = out[i]; else break; }
    var next = null;
    for (var j = 0; j < out.length; j++) { if (!out[j].reached) { next = out[j]; break; } }
    return { levels: out, current: current, next: next, gap: current ? current.gap : null, gapCents: current ? current.gapCents : null,
      reachedCount: current ? current.n : 0, total: LEVELS.length };
  }

  return { LEVELS: LEVELS, levels: levels };
});
