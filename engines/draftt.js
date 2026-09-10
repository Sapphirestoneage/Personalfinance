/* ==========================================================================
   engines/draftt.js — the measuring stick: seven shares against seven bands.
   --------------------------------------------------------------------------
   D · R · A · F · T · T · (T): debt payments, retirement saving, rent or
   mortgage, food, getting around, taxes, and therapy while it is tracked.
   Each row is a share of take-home pay (retirement and taxes of gross, as
   the brief says) against the band the person has picked from
   data/bands.json. A band stated on the other basis is converted on the fly
   so the row compares like with like, and the row says which basis it is
   on. One verdict word a row: under · in · over. No charts.

   Every figure is a Result; a blank input makes its row incomplete and
   names the field, never a zero. The engine WRITES NOTHING; the source
   picks come in as `prefs` and are stored per user (shared/prefs.js).
   DECISIONS.md D-173.

     rows(household, tables, prefs)  → { basis, rows[], takeHomeMonthlyCents, grossMonthlyCents }
     sourcesFor(tables, rowId)       → [{ id, label, low, high, basis, note }]
     bandFor(tables, rowId, sourceId, ratio) → the band on the row's basis
     verdict(share, band)            → 'under' | 'in' | 'over'
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/money.js'), require('../shared/schema.js'), require('./cashflow.js'));
  } else {
    root.SLAF = root.SLAF || {};
    root.SLAF.Draftt = factory(root.SLAF.Money, root.SLAF.Schema, root.SLAF.CashFlow);
  }
}(typeof self !== 'undefined' ? self : this, function (Money, Schema, CashFlow) {
  'use strict';

  var ORDER = ['debt', 'retirement', 'accommodation', 'food', 'transportation', 'taxes', 'therapy'];
  var OWNER = {
    debt: ['debt-payoff', 'debts'], retirement: ['start', 'q-plan'], accommodation: ['expenses', 'spending'],
    food: ['expenses', 'spending'], transportation: ['expenses', 'spending'], taxes: ['tax', 'number'], therapy: ['expenses', 'spending']
  };

  function table(tables) { return (tables && tables.bands) || null; }
  function letter(tables, id) { var t = table(tables); return t && t.letters ? t.letters[id] || null : null; }

  function sourcesFor(tables, rowId) {
    var L = letter(tables, rowId);
    var t = table(tables);
    if (!L) return [];
    return Object.keys(L.sources).map(function (id) {
      var s = L.sources[id];
      return { id: id, label: (t.sourceLabels || {})[id] || id, low: s.low, high: s.high, basis: s.basis || t.basisDefault || 'takeHome', note: s.note };
    });
  }

  /**
   * The band for a row on the ROW's basis. `ratio` is gross ÷ take-home:
   * a band stated on gross, read on take-home, is that much wider in
   * take-home terms; a take-home band read on gross is that much narrower.
   */
  function bandFor(tables, rowId, sourceId, ratio) {
    var L = letter(tables, rowId);
    if (!L) return null;
    var id = sourceId && L.sources[sourceId] ? sourceId : L['default'];
    var s = L.sources[id];
    var t = table(tables);
    var stated = s.basis || t.basisDefault || 'takeHome';
    var measure = L.measure || 'takeHome';
    var f = 1;
    if (stated !== measure && Money.isEntered(ratio) && ratio > 0) f = stated === 'gross' && measure === 'takeHome' ? ratio : 1 / ratio;
    return {
      sourceId: id, label: (t.sourceLabels || {})[id] || id, note: s.note,
      low: s.low * f, high: s.high >= 1 ? 1 : s.high * f,
      statedLow: s.low, statedHigh: s.high, statedBasis: stated, basis: measure, converted: stated !== measure
    };
  }

  function verdict(share, band) {
    if (!Money.isEntered(share) || !band) return null;
    if (share < band.low - 1e-9) return 'under';
    if (share > band.high + 1e-9) return 'over';
    return 'in';
  }

  /* ---- The amounts, a month, each from its owner ------------------------ */
  function debtMinimumsNonMortgage(h) {
    if (Schema.saidNoDebt(h)) return Money.ok(0, { none: true });
    var debts = Schema.aggregatableDebts(h).filter(function (d) { return d.type !== 'mortgage'; });
    var summed = Money.sumCents(debts.map(function (d) { return d.minPaymentCents; }));
    if (summed.counted === 0) {
      if (Schema.aggregatableDebts(h).length) return Money.ok(0, { none: true, mortgageOnly: true });
      return Money.incomplete('Add your debts and their minimums to see this.', ['monthlyDebtPayments']);
    }
    return Money.ok(summed.total, { count: summed.counted });
  }

  function retirementMonthly(h, tables) {
    var c = CashFlow.savingsRateContributed(h, tables);
    if (!Money.isOk(c)) return c;
    return Money.ok(Math.round(c.annualSavingsCents / 12), { parts: c.parts, annualCents: c.annualSavingsCents });
  }

  function rows(household, tables, prefs) {
    var h = household || {};
    var p = prefs || {};
    var takeMonthly = Schema.takeHomeMonthlyCents(h, tables);
    var gross = Schema.grossAnnualIncomeCents(h);
    var grossMonthly = Money.isOk(gross) ? Money.ok(Math.round(gross.value / 12)) : gross;
    var ratio = Money.isOk(takeMonthly) && Money.isOk(grossMonthly) && takeMonthly.value > 0 ? grossMonthly.value / takeMonthly.value : null;
    var fat = Schema.fat(h);
    var tax = Schema.estimatedAnnualTaxCents(h, tables);

    var amounts = {
      debt: debtMinimumsNonMortgage(h),
      retirement: retirementMonthly(h, tables),
      accommodation: fat.accommodation,
      food: fat.food,
      transportation: fat.transportation,
      taxes: Money.isOk(tax) ? Money.ok(Math.round(tax.value / 12), { effectiveRate: tax.effectiveRate }) : tax,
      therapy: fat.therapyTracked ? fat.therapy : null
    };

    var out = [];
    ORDER.forEach(function (id) {
      var L = letter(tables, id);
      if (!L) return;
      var amount = amounts[id];
      if (amount === null) return;                       /* therapy off: no row */
      var measure = L.measure || 'takeHome';
      var denom = measure === 'gross' ? grossMonthly : takeMonthly;
      var share;
      if (id === 'taxes' && Money.isOk(amount)) share = Money.ok(amount.effectiveRate);
      else if (!Money.isOk(amount)) share = amount;
      else if (!Money.isOk(denom)) share = denom;
      else share = Money.safeDivide(amount.value, denom.value, { denominatorName: measure === 'gross' ? 'grossAnnualIncome' : 'takeHome', zeroReason: 'No income, so no share.' });
      var sourceId = p[id] || L['default'];
      var band = bandFor(tables, id, sourceId, ratio);
      out.push({
        id: id, letter: L.letter, label: L.label, sub: L.sub, measure: measure,
        amountCents: Money.isOk(amount) ? amount.value : null,
        amount: amount, share: share,
        band: band, sourceId: band ? band.sourceId : null,
        verdict: Money.isOk(share) ? verdict(share.value, band) : null,
        owner: OWNER[id],
        missing: Money.isOk(share) ? [] : (share.missing || [])
      });
    });
    return { basis: 'takeHome', ratio: ratio, takeHomeMonthlyCents: takeMonthly, grossMonthlyCents: grossMonthly, rows: out, version: table(tables) ? table(tables).version : null };
  }

  return { ORDER: ORDER, OWNER: OWNER, rows: rows, sourcesFor: sourcesFor, bandFor: bandFor, verdict: verdict,
    debtMinimumsNonMortgage: debtMinimumsNonMortgage, retirementMonthly: retirementMonthly };
}));
