/* ==========================================================================
   shared/instruments.js — the six numbers on the dashboard's first screen,
   and the one place a snapshot learns what to freeze.
   --------------------------------------------------------------------------
   The dashboard shows six instruments above the fold; a snapshot has to
   carry every one of them so that "since last time" never means re-running
   an old input against a newer reference table (D-056). If the two lists
   lived in two files they would drift, so this is the list, and both the
   dashboard and the Refresh page read it.

   Nothing is computed here. Every value is a call into an engine that
   already owns the formula — Tier0, Ratios, Foo — and comes back as the
   Result it produced. BRIEF §1.5.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('./money.js'),
      Schema: require('./schema.js'),
      Spine: require('./spine-v2.js'),
      Reference: require('./reference.js'),
      Tier0: require('../engines/tier0.js'),
      Ratios: require('../engines/ratios.js'),
      Foo: require('../engines/foo.js'),
      CashFlow: require('../engines/cashflow.js')
    };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Spine: S.Spine, Reference: S.Reference,
             Tier0: S.Tier0, Ratios: S.Ratios, Foo: S.Foo, CashFlow: S.CashFlow };
  }
  var api = factory(deps.Money, deps.Schema, deps.Spine, deps.Reference, deps.Tier0, deps.Ratios, deps.Foo, deps.CashFlow);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Instruments = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Spine, Reference, Tier0, Ratios, Foo, CashFlow) {
  'use strict';

  var MS_PER_DAY = 86400000;

  /* The six, in the order they sit on the panel. `cap` is the eyebrow,
     `label` the plain name, `unit` how to format, `band` which
     ratio_benchmarks row colours it (null = no colour). */
  var INSTRUMENTS = [
    { id: 'netWorth',            cap: 'Altitude', label: 'Net worth',    unit: 'cents',  band: null },
    { id: 'savingsRate',         cap: 'Thrust',   label: 'Savings rate', unit: 'rate',   band: 'savingsRate' },
    { id: 'emergencyFundMonths', cap: 'Fuel',     label: 'Runway',       unit: 'months', band: 'emergencyFundMonths' },
    { id: 'debtToIncome',        cap: 'Load',     label: 'Debt-to-income', unit: 'rate', band: 'debtToIncome' },
    { id: 'fiEtaYear',           cap: 'Distance', label: 'FI year',      unit: 'year',   band: null },
    { id: 'fooStep',             cap: 'Heading',  label: 'FOO step',     unit: 'step',   band: null }
  ];

  function etaYear(household, tables, now) {
    var y = Tier0.yearsToFire(household, tables);
    if (!Money.isOk(y)) return y;
    var nowMs = now === undefined ? Date.now() : now;
    var year = new Date(nowMs + y.value * 365.25 * MS_PER_DAY).getFullYear();
    return Money.ok(year, {
      years: y.value,
      alreadyThere: y.alreadyThere === true,
      contributionBasis: y.contributionBasis,
      expectedReturnRate: y.expectedReturnRate
    });
  }

  function fooStep(household, tables) {
    var foo = Foo.evaluate(household, tables);
    if (foo.status !== 'ok' && !foo.placement) {
      return Money.incomplete(foo.reason || 'Not enough entered to place you on the ladder yet.', []);
    }
    if (!foo.placement || !Money.isEntered(foo.placement.step)) {
      return Money.incomplete((foo.placement && foo.placement.reason) || 'Not enough entered to place you on the ladder yet.', []);
    }
    return Money.ok(foo.placement.step, {
      title: foo.placement.title || foo.placement.label || null,
      flags: foo.flags || []
    });
  }

  /**
   * compute(h, tables, now?) → { rows: [...], byId: {...}, foo }
   * Each row: the INSTRUMENTS entry plus `result` (a Result) and `verdict`
   * from the ratio bands where one applies.
   */
  function compute(household, tables, now) {
    var rates = Tier0.savingsRate(household, tables);
    var ratios = Ratios.all(household, tables, { snapshots: Spine.listSnapshots() });
    function ratioRow(id) {
      return ratios.rows.filter(function (r) { return r.id === id; })[0] || null;
    }
    var results = {
      netWorth: Tier0.netWorth(household),
      /* The CONTRIBUTED rate is the headline when the 401(k) percentage is
         known — what actually went somewhere — and the residual (gross
         less spending less tax) stands in until then. D-080. */
      savingsRate: (function () {
        var c = CashFlow.savingsRateContributed(household, tables);
        return Money.isOk(c) ? c : rates.excludingMatch;
      })(),
      emergencyFundMonths: Tier0.emergencyFundMonths(household),
      debtToIncome: Tier0.debtToIncome(household),
      fiEtaYear: etaYear(household, tables, now),
      fooStep: fooStep(household, tables)
    };
    var byId = {};
    var rows = INSTRUMENTS.map(function (spec) {
      var band = spec.band ? ratioRow(spec.band) : null;
      var row = {
        id: spec.id, cap: spec.cap, label: spec.label, unit: spec.unit,
        result: results[spec.id],
        ok: Money.isOk(results[spec.id]),
        verdict: band ? band.verdict : null,
        bandRow: band
      };
      byId[spec.id] = row;
      return row;
    });
    return { rows: rows, byId: byId, savingsRates: rates };
  }

  /** Flat { id: Result } — what a snapshot freezes as computedOutputs. */
  function outputs(household, tables, now) {
    var c = compute(household, tables, now);
    var out = {};
    c.rows.forEach(function (r) { out[r.id] = r.result; });
    /* Both savings-rate variants, so a delta on either is possible later. */
    out.savingsRateIncludingMatch = c.savingsRates.includingMatch;
    return out;
  }

  /** Take a snapshot carrying every instrument. Returns the record. */
  function snapshot(household, tables, extra) {
    var h = household || Spine.getProfile();
    return Spine.appendSnapshot(Object.assign({
      rawInputs: {
        people: h.people, assets: h.assets, debts: h.debts,
        expenses: h.expenses, filingStatus: h.filingStatus, state: h.state,
        capturingFullMatch: h.capturingFullMatch,
        retirement: h.retirement, insurance: h.insurance
      },
      assumptionsUsed: Schema.resolveAssumptions(h),
      referenceVersions: Reference.versionsOf(tables),
      computedOutputs: outputs(h, tables)
    }, extra || {}));
  }

  /** { id: snapshotDelta } for every instrument; null entries where none. */
  function deltas(household, tables, now) {
    var c = compute(household, tables, now);
    var out = {};
    c.rows.forEach(function (r) { out[r.id] = Spine.snapshotDelta(r.id, r.result); });
    return out;
  }

  function format(row) {
    var r = row.result;
    if (!Money.isOk(r)) return Money.EM_DASH;
    switch (row.unit) {
      case 'cents':  return Money.formatCents(r.value);
      case 'rate':   return Money.formatRate(r.value, { decimals: 1 });
      case 'months': return Money.formatMonths(r.value);
      case 'year':   return r.alreadyThere ? 'Now' : String(r.value);
      case 'step':   return 'Step ' + r.value;
      default:       return String(r.value);
    }
  }

  /** A signed, unit-aware delta string, or '' when there is nothing to say. */
  function formatDelta(row, delta) {
    if (!delta || delta.delta === null || delta.delta === 0) return '';
    var d = delta.delta, sign = d > 0 ? '+' : '−', a = Math.abs(d);
    switch (row.unit) {
      case 'cents':  return sign + Money.formatCents(a);
      case 'rate':   return sign + (Math.round(a * 1000) / 10) + ' pts';
      case 'months': return sign + (Math.round(a * 10) / 10) + ' mo';
      case 'year':   return sign + a + ' yr';
      case 'step':   return sign + a + ' step' + (a === 1 ? '' : 's');
      default:       return sign + a;
    }
  }

  return {
    INSTRUMENTS: INSTRUMENTS,
    compute: compute,
    outputs: outputs,
    snapshot: snapshot,
    deltas: deltas,
    format: format,
    formatDelta: formatDelta
  };
});
