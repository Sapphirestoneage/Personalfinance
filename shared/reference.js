/* ==========================================================================
   shared/reference.js — loader + lookups for the versioned tables in data/.
   --------------------------------------------------------------------------
   SPEC.md §7: reference tables are config, never inline in a calculator.
   SPEC.md §6: every computed output records WHICH VERSION of a table it
   used, so a snapshot does not silently recompute against next year's data.

   Every lookup here is pure: it takes the already-loaded table as its first
   argument. That is what lets test/run.js re-derive the same numbers outside
   the browser. `load()` is the only asynchronous part.

   Results use the Money Result contract, plus two extra statuses that only
   a bounded lookup table can produce:
       'below_chart' — the value sits under the table's lowest breakpoint
       'above_chart' — the value sits over the table's highest breakpoint
   Neither is an error and neither is an extrapolated fake percentile.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports)
    ? require('./money.js')
    : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Reference = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var TABLE_FILES = {
    effectiveTaxRates: 'effective_tax_rates_2026.json',
    retirementMilestones: 'retirement_milestones.json',
    netWorthPercentiles: 'net_worth_percentiles_scf_2022.json',
    irsLimits: 'irs_limits_2026.json',
    fooRules: 'foo_rules.json',
    expenseCategories: 'expense_categories.json',
    budgetTemplates: 'budget_templates.json',
    debtRules: 'debt_rules.json',
    fireVariants: 'fire_variants.json',
    seTax: 'se_tax_2026.json',
    goalTemplates: 'goal_templates.json',
    liquidityBenchmarks: 'liquidity_benchmarks.json',
    values: 'values.json',
    hassleDefaults: 'hassle_defaults.json'
  };

  var cache = {};

  /* Where this file itself was loaded from. data/ sits beside shared/, so
     resolving '../data/' against this URL gives the right path from ANY page,
     at any depth, without the room having to know how deep it is. */
  var SELF_URL = (typeof document !== 'undefined' && document.currentScript)
    ? document.currentScript.src : null;

  function defaultBase() {
    if (!SELF_URL || typeof URL === 'undefined') return 'data/';
    return new URL('../data/', SELF_URL).href;
  }

  /**
   * Load the named tables (default: all). Browser only — resolves with
   * { effectiveTaxRates, retirementMilestones, … }.
   * `basePath` is optional; omit it and the path is derived from where
   * shared/reference.js itself was served from.
   */
  function load(names, basePath) {
    var wanted = names && names.length ? names : Object.keys(TABLE_FILES);
    var base = basePath === undefined ? defaultBase() : basePath;
    return Promise.all(wanted.map(function (name) {
      if (cache[name]) return Promise.resolve([name, cache[name]]);
      var file = TABLE_FILES[name];
      if (!file) return Promise.reject(new Error('Unknown reference table: ' + name));
      return fetch(base + file).then(function (res) {
        if (!res.ok) throw new Error('Could not load ' + file + ' (' + res.status + ')');
        return res.json();
      }).then(function (json) {
        cache[name] = json;
        return [name, json];
      });
    })).then(function (pairs) {
      var out = {};
      pairs.forEach(function (p) { out[p[0]] = p[1]; });
      return out;
    });
  }

  function outOfRange(status, reason, meta) {
    var r = { status: status, value: null, reason: reason, missing: [] };
    if (meta) { for (var k in meta) { if (Object.prototype.hasOwnProperty.call(meta, k)) r[k] = meta[k]; } }
    return r;
  }

  /* ---- Effective tax rate ----------------------------------------------
     Flat lookup by gross income band + filing status. SPEC.md §10.       */

  function lookupEffectiveTaxRate(table, grossAnnualIncomeDollars, filingStatus) {
    if (!table) return Money.incomplete('Tax reference table is not loaded.', ['effectiveTaxRates']);
    if (!Money.isEntered(grossAnnualIncomeDollars)) {
      return Money.incomplete('Add your gross income to estimate taxes.', ['grossAnnualIncome']);
    }
    if (!filingStatus) {
      return Money.incomplete('Choose a filing status to estimate taxes.', ['filingStatus']);
    }
    var bands = table.brackets[filingStatus];
    if (!bands) {
      return Money.incomplete('No tax table for filing status "' + filingStatus + '".', ['filingStatus']);
    }
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (b.upToGrossIncome === null || grossAnnualIncomeDollars <= b.upToGrossIncome) {
        return Money.ok(b.effectiveRate, {
          referenceVersion: table.version,
          referenceId: table.id,
          precision: table.precision
        });
      }
    }
    /* Unreachable while the last band has upToGrossIncome === null. */
    return Money.incomplete('Income is outside the tax reference table.', ['grossAnnualIncome']);
  }

  /* ---- Retirement milestone --------------------------------------------
     Target savings multiple for an age, linearly interpolated between the
     named milestones. SPEC.md §13.                                       */

  function lookupRetirementMultiple(table, age) {
    if (!table) return Money.incomplete('Retirement milestone table is not loaded.', ['retirementMilestones']);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to see this.', ['dob']);

    var ms = table.milestones;
    if (age < table.minAge) {
      return outOfRange('below_chart',
        'These benchmarks start at age ' + table.minAge + '.',
        { referenceVersion: table.version, referenceId: table.id });
    }
    if (age <= ms[0].age) {
      /* Between minAge and the first milestone, scale linearly up to it. */
      var span = ms[0].age - table.minAge;
      var frac = span === 0 ? 1 : (age - table.minAge) / span;
      return Money.ok(ms[0].multiple * frac, {
        referenceVersion: table.version, referenceId: table.id, interpolated: true
      });
    }
    for (var i = 0; i < ms.length - 1; i++) {
      var lo = ms[i], hi = ms[i + 1];
      if (age >= lo.age && age <= hi.age) {
        var t = (age - lo.age) / (hi.age - lo.age);
        return Money.ok(lo.multiple + t * (hi.multiple - lo.multiple), {
          referenceVersion: table.version, referenceId: table.id, interpolated: age !== lo.age
        });
      }
    }
    var last = ms[ms.length - 1];
    return Money.ok(last.multiple, {
      referenceVersion: table.version, referenceId: table.id, beyondLastMilestone: true
    });
  }

  /* ---- Net worth percentile --------------------------------------------
     SPEC.md §6: a table that cannot rank a value says so. It never
     extrapolates a fake percentile, and never hides a negative.          */

  function lookupNetWorthPercentile(table, netWorthDollars, age) {
    if (!table) return Money.incomplete('Percentile table is not loaded.', ['netWorthPercentiles']);
    if (!Money.isEntered(netWorthDollars)) {
      return Money.incomplete('Add your balances to see where this ranks.', ['netWorth']);
    }
    if (!Money.isEntered(age)) {
      return Money.incomplete('Add your date of birth to compare against your age group.', ['dob']);
    }

    var band = null;
    for (var i = 0; i < table.bands.length; i++) {
      if (age >= table.bands[i].minAge && age <= table.bands[i].maxAge) { band = table.bands[i]; break; }
    }
    if (!band) {
      return outOfRange('below_chart', 'No percentile band for that age.',
        { referenceVersion: table.version, referenceId: table.id });
    }

    var meta = {
      referenceVersion: table.version,
      referenceId: table.id,
      bandLabel: band.label,
      precision: table.precision
    };
    var pts = band.breakpoints;

    if (netWorthDollars < 0) {
      return outOfRange('below_chart',
        'Below the chart — a negative net worth is not ranked by this table.', meta);
    }
    if (netWorthDollars < pts[0].netWorth) {
      return outOfRange('below_chart',
        'Below the ' + pts[0].percentile + 'th percentile for ' + band.label + '.', meta);
    }
    var top = pts[pts.length - 1];
    if (netWorthDollars > top.netWorth) {
      return outOfRange('above_chart',
        'Above the ' + top.percentile + 'th percentile for ' + band.label + '.', meta);
    }
    for (var j = 0; j < pts.length - 1; j++) {
      var lo = pts[j], hi = pts[j + 1];
      if (netWorthDollars >= lo.netWorth && netWorthDollars <= hi.netWorth) {
        var span = hi.netWorth - lo.netWorth;
        var t = span === 0 ? 0 : (netWorthDollars - lo.netWorth) / span;
        return Money.ok(lo.percentile + t * (hi.percentile - lo.percentile),
          Object.assign({ interpolated: true }, meta));
      }
    }
    return outOfRange('below_chart', 'Could not place this value on the chart.', meta);
  }

  /* ---- Liquidity band ---------------------------------------------------
     Which conventional coverage band a number of months of expenses falls
     in. Context for a self-reported SWAN Number, never a verdict on it —
     see data/liquidity_benchmarks.json. SPEC.md §13, Tier 1.5.          */

  function lookupLiquidityBand(table, months) {
    if (!table) return Money.incomplete('Liquidity benchmark table is not loaded.', ['liquidityBenchmarks']);
    if (!Money.isEntered(months)) {
      return Money.incomplete('Needs a number of months to place.', ['months']);
    }
    if (months < 0) {
      return outOfRange('below_chart', 'A negative number of months has no band.',
        { referenceVersion: table.version, referenceId: table.id });
    }
    var bands = table.bands;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (b.maxMonths === null || months <= b.maxMonths) {
        return Money.ok(b.id, {
          referenceVersion: table.version,
          referenceId: table.id,
          band: b,
          label: b.label,
          blurb: b.blurb
        });
      }
    }
    /* Unreachable while the last band has maxMonths === null. */
    return outOfRange('above_chart', 'Beyond the last band.',
      { referenceVersion: table.version, referenceId: table.id });
  }

  /* ---- Provenance --------------------------------------------------------
     Every table says how much its numbers are worth, in a field rather than
     in prose, so a room can print it and a test can require it:

       'sourced'    traceable to a named primary source, quoted as published
       'convention' a rule of thumb or a stated convention, not a measurement
       'unverified' believed current, not checked against the primary source

     This exists because the alternative is what a placeholder data layer
     does by default: return a plausible number with no way for anything
     downstream to know it was invented. A believable wrong answer is worse
     than a missing one — see INTEROP.md.                                 */

  var CONFIDENCE_LEVELS = ['sourced', 'convention', 'unverified'];

  var CONFIDENCE_LABELS = {
    sourced:    'from a named source',
    convention: 'a stated convention, not a measurement',
    unverified: 'not re-checked against the source'
  };

  /** One table's provenance, ready to render. */
  function provenanceOf(table) {
    if (!table) return null;
    return {
      id: table.id || null,
      version: table.version || null,
      asOf: table.asOf || null,
      confidence: table.confidence || 'unverified',
      label: CONFIDENCE_LABELS[table.confidence] || CONFIDENCE_LABELS.unverified,
      note: table.confidenceNote || null,
      source: table.source || null
    };
  }

  /**
   * The provenance of the named tables, weakest first, so a room can lead
   * with the figure a reader should trust least. Pass the loaded tables and
   * the names the room actually used — not everything it happened to load.
   */
  function provenance(tables, names) {
    var rank = { unverified: 0, convention: 1, sourced: 2 };
    return (names || []).map(function (n) {
      return provenanceOf(tables && tables[n]);
    }).filter(Boolean).sort(function (a, b) {
      return rank[a.confidence] - rank[b.confidence];
    });
  }

  /** Collect the version stamp of every table used, for a snapshot. */
  function versionsOf(tables) {
    var out = {};
    Object.keys(tables || {}).forEach(function (k) {
      if (tables[k] && tables[k].version) out[k] = tables[k].version;
    });
    return out;
  }

  return {
    TABLE_FILES: TABLE_FILES,
    load: load,
    lookupEffectiveTaxRate: lookupEffectiveTaxRate,
    lookupRetirementMultiple: lookupRetirementMultiple,
    lookupNetWorthPercentile: lookupNetWorthPercentile,
    lookupLiquidityBand: lookupLiquidityBand,
    CONFIDENCE_LEVELS: CONFIDENCE_LEVELS,
    CONFIDENCE_LABELS: CONFIDENCE_LABELS,
    provenanceOf: provenanceOf,
    provenance: provenance,
    versionsOf: versionsOf,
    _cache: cache
  };
});
