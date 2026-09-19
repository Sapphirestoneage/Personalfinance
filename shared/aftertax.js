/* ==========================================================================
   shared/aftertax.js — net worth as listed, or after deferred tax (15.3).
   --------------------------------------------------------------------------
   A 401(k) dollar is not a whole dollar. When the switch `afterTaxNetWorth`
   (Settings, Accuracy group; default on) is on, the Statement, the front
   door, the FIRE Number and the Financial Snapshot show net worth with a
   two-position control, "as listed" / "after deferred tax", defaulting to
   after tax, and print the difference as one line: "$X of this is the tax
   bill you'll pay later." The maths is engines/tax.js afterTaxNetWorth
   (the marginal bracket at projected FI spending, never today's) over
   Schema.afterTaxValue per holding. Nothing here stores a fact: the
   position is a preference (shared/prefs.js), the switch a preference, the
   figures a view.

     AfterTax.on(h)                 the switch
     AfterTax.basis(h)              'afterTax' | 'listed' (always listed when off)
     AfterTax.setBasis(b)
     AfterTax.pick(h, tables)       { basis, listed, afterTax, shown, line, deferredTaxCents }
     AfterTax.controlHtml(h)        the two buttons, '' when the switch is off
     AfterTax.lineText(afterTax)    the one line, with what was assumed
     AfterTax.mount(host, {household, onChange})
   DECISIONS.md D-181.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  function dep(name, file) {
    if (node) { try { return require(file); } catch (e) { return null; } }
    return root && root.SLAF && root.SLAF[name] ? root.SLAF[name] : null;
  }
  var api = factory(function () { return dep('Money', './money.js'); }, function () { return dep('Features', './features.js'); },
    function () { return dep('Prefs', './prefs.js'); }, function () { return dep('Tax', '../engines/tax.js'); }, function () { return dep('Tier0', '../engines/tier0.js'); });
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.AfterTax = api; }
})(typeof self !== 'undefined' ? self : null, function (money, features, prefs, tax, tier0) {
  'use strict';
  var FEATURE = 'afterTaxNetWorth';
  var PREF = 'netWorth.basis';
  var BASES = ['afterTax', 'listed'];

  function on(household) { var F = features(); return !!(F && F.on(FEATURE, household)); }
  function basis(household) {
    if (!on(household)) return 'listed';
    var P = prefs();
    var b = P ? P.get(PREF, null) : null;
    return BASES.indexOf(b) > -1 ? b : 'afterTax';
  }
  function setBasis(b) { var P = prefs(); if (P && BASES.indexOf(b) > -1) P.set(PREF, b); return b; }

  function pct(rate) { return (Math.round(rate * 1000) / 10) + '%'; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** The one line under the figure: the deferred bill, and what was assumed to get it. */
  function lineText(afterTax) {
    var M = money();
    if (!afterTax || !M.isOk(afterTax)) return afterTax && afterTax.reason ? 'After deferred tax: ' + afterTax.reason : '';
    var d = afterTax.deferredTaxCents;
    var rates = afterTax.rates || {};
    var head = d > 0
      ? M.formatCents(d) + ' of this is the tax bill you’ll pay later, at ' + pct(rates.withdrawalRate) + ' on pre-tax withdrawals at your spending.'
      : 'Nothing here is owed to tax later at your spending: the bracket on withdrawals is ' + pct(rates.withdrawalRate || 0) + ' and the gains rate is ' + pct(rates.capitalGainsRate || 0) + '.';
    var notes = [];
    (afterTax.assumed || []).forEach(function (k) {
      if (k === 'orientation') notes.push('which accounts are pre-tax was read from their kind, not from you');
      if (k === 'basis') notes.push('what you paid for the taxable holdings was taken as 60% of their value');
      if (k === 'filingStatus') notes.push('filing status was taken as single');
    });
    return head + (notes.length ? ' Assumed: ' + notes.join('; ') + '.' : '');
  }

  /** Both figures, and the one the position shows. */
  function pick(household, tables) {
    var M = money(), T = tax(), T0 = tier0();
    var listed = T0 ? T0.netWorth(household) : M.incomplete('Tier 0 is not loaded.', ['tier0']);
    var after = on(household) && T ? T.afterTaxNetWorth(household, tables) : null;
    var b = basis(household);
    var shown = b === 'afterTax' && after && M.isOk(after) ? after : listed;
    return {
      basis: b,
      on: on(household),
      listed: listed,
      afterTax: after,
      shown: shown,
      deferredTaxCents: after && M.isOk(after) ? after.deferredTaxCents : null,
      line: after ? lineText(after) : ''
    };
  }

  function controlHtml(household) {
    if (!on(household)) return '';
    var b = basis(household);
    return '<span class="slaf-seg" role="group" aria-label="Net worth basis" data-nw-basis>'
      + '<button type="button" data-basis="afterTax" aria-pressed="' + (b === 'afterTax') + '">After deferred tax</button>'
      + '<button type="button" data-basis="listed" aria-pressed="' + (b === 'listed') + '">As listed</button>'
      + '</span>';
  }

  function mount(host, opts) {
    if (!host) return null;
    var o = opts || {};
    var read = typeof o.household === 'function' ? o.household : function () { return o.household || {}; };
    function paint() { host.innerHTML = controlHtml(read()); host.hidden = !on(read()); }
    host.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-basis]') : null;
      if (!b) return;
      setBasis(b.getAttribute('data-basis'));
      paint();
      if (typeof o.onChange === 'function') o.onChange(basis(read()));
    });
    paint();
    var F = features();
    if (F && typeof F.ready === 'function') F.ready().then(function () { paint(); if (typeof o.onChange === 'function') o.onChange(basis(read())); });
    return { paint: paint };
  }

  return { FEATURE: FEATURE, PREF: PREF, on: on, basis: basis, setBasis: setBasis, pick: pick, lineText: lineText, controlHtml: controlHtml, mount: mount, esc: esc };
});
