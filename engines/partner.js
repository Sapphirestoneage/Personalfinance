/* ==========================================================================
   engines/partner.js — two incomes, one shared month.
   DECISIONS.md D-099.
   --------------------------------------------------------------------------
   Two adults share a month of costs. This file works out, under the mode
   the household chose (household.partner.splitMode), what each of them
   pays of the shared month, what each keeps after their share, how heavy
   the share is against each take-home, and how much of the household's
   income is one paycheque.

     equal          each pays half
     proportional   each pays shared × own income ÷ household income
     pooled         no shares: all income in, the shared month out, the
                    rest is joint

   The shared month is household.partner.sharedMonthlyCents when typed and
   the household month (Schema.monthlyExpensesCents) until then; the result
   says which. The mode is 'equal' until one is chosen; the result says that
   too, so the room can show it as a default rather than a fact.

   Nothing is re-derived: a person's take-home comes from
   Tier0.takeHomeMonthlyCents run on a household holding only that person's
   income at the household's filing status (an approximation, and said as
   one — a joint return taxes the combined income, not each pay), and the
   share of income that is one paycheque is the incomeConcentration ratio
   from engines/ratios.js.

   Every function returns a Money Result. Missing inputs produce an
   incomplete Result with a reason, never a number.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Ratios: require('./ratios.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Ratios: S.Ratios };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Ratios);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Partner = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Ratios) {
  'use strict';

  var MONTHS = 12;
  var MODES = ['equal', 'proportional', 'pooled'];
  var DEFAULT_MODE = 'equal';
  var HEAVY_SHARE = 0.5;   /* a share above half of a take-home is the watch line */
  var LABELS = { equal: 'Equal halves', proportional: 'In proportion to income', pooled: 'One pool' };

  function modeLabel(mode) { return LABELS[mode] || mode; }

  /** The convention row for a mode from data/partner_conventions.json, or null. */
  function convention(tables, mode) {
    var t = tables && tables.partnerConventions;
    var rows = (t && t.modes) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === mode) return rows[i];
    return null;
  }

  /* One person's figures: their gross a year (the sum of their income
     sources; null when none is entered), and their take-home a month by
     running Tier0 on a household holding only them. */
  function personFigures(household, person, fallbackLabel, tables) {
    var summed = Money.sumCents((person.incomeSources || []).map(function (s) { return s.grossAnnualIncomeCents; }));
    var gross = summed.counted === 0 ? null : summed.total;
    var out = {
      id: person.id,
      label: person.label || fallbackLabel,
      grossAnnualCents: gross,
      grossMonthlyCents: gross === null ? null : Math.round(gross / MONTHS),
      takeHomeCents: null, takeHomeReason: null, effectiveRate: null,
      shareCents: null, keepsCents: null, burden: null
    };
    if (gross === null) { out.takeHomeReason = 'No pay entered.'; return out; }
    var solo = Object.assign({}, household, { people: [person] });
    var th = Tier0.takeHomeMonthlyCents(solo, tables);
    if (Money.isOk(th)) { out.takeHomeCents = th.value; out.effectiveRate = Money.isEntered(th.effectiveRate) ? th.effectiveRate : null; }
    else out.takeHomeReason = th.reason;
    return out;
  }

  /**
   * split(household, tables) → Result
   *   value          the primary's share (equal, proportional) or the shared
   *                  month (pooled), in cents
   *   mode           'equal' | 'proportional' | 'pooled' — the one applied
   *   modeChosen     the stored choice, or null when the default was used
   *   modeFallback   why a chosen mode could not be applied (proportional
   *                  without both incomes falls back to equal), or null
   *   sharedCents    the shared month
   *   sharedSource   'typed' | 'household'
   *   people         [you, them] — see personFigures, with shareCents,
   *                  keepsCents and burden (share ÷ take-home) filled in
   *   totalGrossCents, totalTakeHomeCents   sums when both are known, else null
   *   poolInCents, poolLeftCents            pooled only: what comes in a month
   *                                         and what is left after the shared
   *                                         month; null when take-home is unknown
   *   outOfPocketCents  how far the shared month exceeds the two take-homes
   *                     together, or null when it does not
   *   zeroEarner        the label of an adult whose entered pay is zero under
   *                     proportional, else null
   *   heavy             the people whose share is more than half their take-home
   *   zone              'out' when the shared month exceeds what comes in,
   *                     'watch' when a share is more than half a take-home,
   *                     else null
   *   concentration     the incomeConcentration ratio (largest income ÷
   *                     household income), or null; concentrationReason says why
   *   lowerIndex, higherIndex   which of people[] takes home less and more
   */
  function split(household, tables) {
    var h = household || {};
    var T = tables || {};
    var adults = Schema.adults(h);
    if (adults.length < 2) {
      var solo = Money.incomplete('Just you — this room is for two adults. Add the other of you in Start Here.', ['partner']);
      solo.justYou = true;
      return solo;
    }
    var plan = Schema.createPartnerPlan(h.partner);
    var mode = plan.splitMode || DEFAULT_MODE;

    var shared, sharedSource;
    if (Money.isEntered(plan.sharedMonthlyCents)) { shared = plan.sharedMonthlyCents; sharedSource = 'typed'; }
    else {
      var spend = Schema.monthlyExpensesCents(h);
      if (!Money.isOk(spend)) return Money.incomplete('Add the household month in Start Here, or type the shared costs, to see this.', ['sharedMonthlyCents']);
      shared = spend.value; sharedSource = 'household';
    }
    if (shared < 0) return Money.incomplete('A shared month below zero is not a month of costs.', ['sharedMonthlyCents']);

    var people = [personFigures(h, adults[0], 'You', T), personFigures(h, adults[1], 'The other of you', T)];
    var you = people[0], them = people[1];
    var bothGross = you.grossAnnualCents !== null && them.grossAnnualCents !== null;
    var totalGross = bothGross ? you.grossAnnualCents + them.grossAnnualCents : null;
    var bothTakeHome = you.takeHomeCents !== null && them.takeHomeCents !== null;
    var totalTakeHome = bothTakeHome ? you.takeHomeCents + them.takeHomeCents : null;

    var applied = mode, fallback = null, zeroEarner = null;
    if (mode === 'proportional') {
      if (!bothGross) {
        applied = 'equal';
        fallback = (them.grossAnnualCents === null ? 'Their pay' : 'Your pay') + ' is not entered, so this is halves until it is — add it in Start Here.';
      } else if (totalGross <= 0) {
        applied = 'equal';
        fallback = 'Neither of you has pay entered above zero, so this is halves.';
      } else if (you.grossAnnualCents === 0 || them.grossAnnualCents === 0) {
        zeroEarner = (you.grossAnnualCents === 0 ? you : them).label;
      }
    }

    var shares = null;
    if (applied === 'equal') { var half = Math.round(shared / 2); shares = [half, shared - half]; }
    else if (applied === 'proportional') { var yours = Math.round(shared * you.grossAnnualCents / totalGross); shares = [yours, shared - yours]; }

    var heavy = [];
    people.forEach(function (p, i) {
      if (!shares) return;
      p.shareCents = shares[i];
      if (p.takeHomeCents === null) return;
      p.keepsCents = p.takeHomeCents - p.shareCents;
      p.burden = p.takeHomeCents > 0 ? p.shareCents / p.takeHomeCents : null;
      if (p.burden !== null && p.burden > HEAVY_SHARE) heavy.push(p.label);
    });

    var poolIn = applied === 'pooled' ? totalTakeHome : null;
    var poolLeft = poolIn === null ? null : poolIn - shared;
    var outOfPocket = totalTakeHome !== null && shared > totalTakeHome ? shared - totalTakeHome : null;
    var zone = outOfPocket !== null ? 'out' : heavy.length ? 'watch' : null;

    var conc = Ratios.byId('incomeConcentration').compute(Ratios.context(h, T));

    var lower = 0, higher = 1;
    if (bothTakeHome ? them.takeHomeCents < you.takeHomeCents : (bothGross && them.grossAnnualCents < you.grossAnnualCents)) { lower = 1; higher = 0; }

    return Money.ok(applied === 'pooled' ? shared : shares[0], {
      mode: applied, modeChosen: plan.splitMode, modeFallback: fallback,
      sharedCents: shared, sharedSource: sharedSource,
      people: people,
      totalGrossCents: totalGross, totalTakeHomeCents: totalTakeHome,
      poolInCents: poolIn, poolLeftCents: poolLeft,
      outOfPocketCents: outOfPocket,
      zeroEarner: zeroEarner,
      heavy: heavy,
      zone: zone,
      concentration: Money.isOk(conc) ? conc.value : null,
      concentrationReason: Money.isOk(conc) ? null : conc.reason,
      lowerIndex: lower, higherIndex: higher
    });
  }

  return { MODES: MODES, DEFAULT_MODE: DEFAULT_MODE, HEAVY_SHARE: HEAVY_SHARE, modeLabel: modeLabel, convention: convention, split: split };
});
