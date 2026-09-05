/* ==========================================================================
   engines/giving.js — a share of income given, in dollars and in life.
   DECISIONS.md D-098 (the Giving room).
   --------------------------------------------------------------------------
   One plan: a year's giving is the typed target when there is one, else
   gross × the share. From that, a month, the share of gross (derived when
   a target was typed over it), the conventions in dollars for this income
   (read from data/giving_conventions.json, never literals), and the price
   in life through the lens — months FI moves later, hours at the real
   hourly wage. Nothing here is a second formula: the FI arithmetic is the
   lens's, the wage is the hourly engine's, and what was actually given
   last month is the ratios engine's giving rate read back.

   Giving is taken out of GROSS here. Cash Flow's giving rate reads gifts
   over TAKE-HOME, so the two shares are not the same number; lastMonth()
   returns both the rate and the dollars so a room can say which it shows.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'),
             Lens: require('../shared/lens.js'), Ratios: require('./ratios.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Lens: S.Lens || null, Ratios: S.Ratios || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Lens, deps.Ratios);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Giving = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Lens, Ratios) {
  'use strict';

  var MONTHS = 12;

  function table(tables) {
    var t = tables && tables.givingConventions;
    return t && Array.isArray(t.shares) && t.shares.length ? t : null;
  }

  /**
   * The conventions in dollars for this income. `rows[i].cents` is null
   * when there is no gross to apply the share to — the share still shows.
   */
  function conventions(grossCents, tables) {
    var t = table(tables);
    if (!t) return Money.incomplete('The giving conventions table is not loaded.', ['givingConventions']);
    var rows = t.shares.map(function (s) {
      return { id: s.id, pct: s.pct, label: s.label, note: s.note,
               cents: Money.isEntered(grossCents) && Money.isEntered(s.pct) ? Math.round(grossCents * s.pct) : null };
    });
    return Money.ok(rows.length, { rows: rows, version: t.version, source: t.source, confidence: t.confidence, deduction: t.deduction || null });
  }

  /** One convention by id ('start', 'average', 'five', 'tithe'), or null. */
  function convention(tables, id) {
    var t = table(tables);
    if (!t) return null;
    for (var i = 0; i < t.shares.length; i++) if (t.shares[i].id === id) return t.shares[i];
    return null;
  }

  /** The share the room proposes when the box is empty: the table says which. */
  function proposedShare(tables) {
    var t = table(tables);
    var row = t ? convention(tables, t.proposeId) : null;
    return row && Money.isEntered(row.pct) ? { value: row.pct, note: row.note } : null;
  }

  /**
   * plan(h, T) → Result. value = the year's giving in cents.
   *   mode          'target' when a year's target was typed (it wins), else 'share'
   *   share         the share of gross: as typed, or derived target ÷ gross
   *   monthlyCents  the year over twelve
   *   conventions   [{ id, pct, label, note, cents }] for this income
   *   pushed        Lens.apply(annual, 'pushed') — months FI moves later
   *   hours         Lens.apply(annual, 'hours')  — hours of life at the real wage
   * Incomplete when nothing is entered, or a share is entered with no
   * income to apply it to (a target still works with no income at all).
   */
  function plan(household, tables) {
    var h = household || {};
    var g = h.giving || {};
    var gross = Schema.grossAnnualIncomeCents(h);
    var grossCents = Money.isOk(gross) ? gross.value : null;
    var target = Money.isEntered(g.annualTargetCents) ? g.annualTargetCents : null;
    var share = Money.isEntered(g.pctOfIncome) ? g.pctOfIncome : null;

    var annual, mode, effective;
    if (target !== null) {
      annual = Math.round(target);
      mode = 'target';
      effective = grossCents !== null && grossCents > 0 ? annual / grossCents : null;
    } else if (share !== null) {
      if (grossCents === null) return Money.incomplete('Add your income to turn a share into dollars — or type a year’s target instead.', ['grossAnnualIncome']);
      annual = Math.round(grossCents * share);
      mode = 'share';
      effective = share;
    } else {
      return Money.incomplete('Enter a share of income, or a year’s target in dollars.', ['pctOfIncome', 'annualTargetCents']);
    }

    var conv = conventions(grossCents, tables);
    var pushed = Lens ? Lens.apply(annual, 'pushed', h, tables) : Money.incomplete('The lens is not loaded.', ['lens']);
    var hours = Lens ? Lens.apply(annual, 'hours', h, tables) : Money.incomplete('The lens is not loaded.', ['lens']);

    return Money.ok(annual, {
      annualCents: annual,
      monthlyCents: Math.round(annual / MONTHS),
      mode: mode,
      share: effective,
      shareDerived: mode === 'target',
      enteredShare: share,
      targetCents: target,
      grossCents: grossCents,
      nothing: annual === 0,
      conventions: Money.isOk(conv) ? conv.rows : [],
      conventionsResult: conv,
      pushed: pushed,
      hours: hours
    });
  }

  /**
   * What was actually given last month, when Cash Flow has a categorised
   * month: the ratios engine's giving rate (gifts ÷ take-home) read back,
   * with the dollars it divided. Incomplete with the ratio's own reason
   * otherwise.
   */
  function lastMonth(household, tables) {
    if (!Ratios) return Money.incomplete('The ratios engine is not loaded.', ['ratios']);
    var def = Ratios.byId('givingRate');
    if (!def) return Money.incomplete('No giving rate in the ratios engine.', ['givingRate']);
    var c = Ratios.context(household || {}, tables);
    var r = def.compute(c);
    if (!Money.isOk(r)) return r;
    return Money.ok(r.value, { rate: r.value, giftsMonthlyCents: c.giftsMonthly, takeHomeMonthlyCents: c.takeHomeMonthly, basis: 'takeHome' });
  }

  return { MONTHS: MONTHS, conventions: conventions, convention: convention, proposedShare: proposedShare, plan: plan, lastMonth: lastMonth };
});
