/* ==========================================================================
   engine/tax/aca.js, the marketplace premium tax credit for one year.
   D-341.
   --------------------------------------------------------------------------
   MAGI for this credit = AGI + the untaxed part of Social Security
                          + tax-exempt interest (federal.js hands it over).
   FPL comes from data/tax/fpl.json for the household size, using the
   guidelines published the January before the coverage year.
   expected contribution = applicable percentage x MAGI, the percentage
   read off the band table in data/tax/aca-applicable-pct.json and
   interpolated inside the band.
   credit = benchmark silver premium minus the expected contribution,
   floored at zero. Under the cliff rule there is no credit above 400% of
   FPL; under the enhanced rule the contribution is capped at the top
   percentage with no ceiling. Below 100% of FPL there is no credit either
   way, and below 138% an expansion state puts the household in Medicaid.
   The benchmark premium is an input: it depends on age and ZIP and the
   app never guesses one for real; the default is a placeholder with a
   "look it up at healthcare.gov" hint in assumptionsUsed.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Tables: require('../tables.js') };
  else deps = { Tables: root.SLAF && root.SLAF.Engine && root.SLAF.Engine.Tables };
  var api = factory(deps.Tables);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Aca = api; }
})(typeof self !== 'undefined' ? self : null, function (Tables) {
  'use strict';

  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }
  function pct(r) { return (Math.round(r * 10000) / 100) + '%'; }

  /** The poverty line for a household size in a coverage year, in cents. */
  function fplCents(fpl, size, coverageYear, inflation) {
    var guidelineYear = coverageYear + (fpl.coverageYearUsesGuidelineYear || -1);
    var years = Object.keys(fpl.guidelines).map(Number).sort(function (a, b) { return a - b; });
    var use = years[0], last = years[years.length - 1];
    for (var i = 0; i < years.length; i++) if (years[i] <= guidelineYear) use = years[i];
    var g = fpl.guidelines[String(use)];
    var n = Math.max(1, size || 1);
    var dollarsFpl = g.firstPerson + g.eachAdditionalPerson * (n - 1);
    var grow = guidelineYear > last ? Math.pow(1 + (inflation || 0), guidelineYear - last) : 1;
    return { cents: Math.round(dollarsFpl * grow * 100), guidelineYear: use, indexedFrom: guidelineYear > last ? last : null };
  }

  /** The applicable percentage at a share of FPL under a rule, or null when
      outside the eligible range. */
  function applicablePct(rule, share) {
    if (share < rule.eligibleFrom) return null;
    if (rule.eligibleUpTo !== null && share > rule.eligibleUpTo) return null;
    var bands = rule.bands;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var top = b.toFpl === null ? Infinity : b.toFpl;
      if (share >= b.fromFpl && (share < top || (i === bands.length - 1))) {
        if (b.toFpl === null || b.toFpl === b.fromFpl) return b.initialPct;
        var t = (share - b.fromFpl) / (b.toFpl - b.fromFpl);
        return b.initialPct + (b.finalPct - b.initialPct) * Math.min(1, Math.max(0, t));
      }
    }
    return bands[bands.length - 1].finalPct;
  }

  /**
   * compute({ magiCents, householdSize, coverageYear, rule: 'cliff'|'enhanced',
   *           benchmarkAnnualCents, inflation, medicaidExpansion }, tables)
   *   medicaidExpansion true (an expansion state such as New York): under
   *   138% of the poverty line the household is on Medicaid and pays no
   *   premium; false: it pays the full benchmark below 100% and the
   *   credit applies from 100%.
   */
  function compute(input, tables) {
    var fpl = tables.fpl, pctTable = tables.acaPct;
    var ruleId = input.rule || pctTable.currentLaw;
    var rule = pctTable.rules[ruleId] || pctTable.rules[pctTable.currentLaw];
    var line = fplCents(fpl, input.householdSize, input.coverageYear, input.inflation);
    var magi = Math.max(0, input.magiCents || 0);
    var share = line.cents ? magi / line.cents : 0;
    var benchmark = Math.max(0, input.benchmarkAnnualCents || 0);
    var out = { rule: ruleId, fplCents: line.cents, fplGuidelineYear: line.guidelineYear, fplShare: Math.round(share * 1000) / 1000,
      applicablePct: null, expectedContributionCents: null, creditCents: 0, premiumAfterCreditCents: benchmark,
      eligible: false, overCliff: false, medicaidTerritory: share < (fpl.medicaidExpansionShare || 1.38), explain: [] };
    if (input.medicaidExpansion && out.medicaidTerritory) {
      out.premiumAfterCreditCents = 0;
      out.explain.push('Income is ' + pct(share) + ' of the poverty line (' + dollars(line.cents) + ' for ' + (input.householdSize || 1) + '), under 138%: in an expansion state the household is on Medicaid and pays no premium.');
      return out;
    }
    var p = applicablePct(rule, share);
    if (p === null) {
      if (rule.eligibleUpTo !== null && share > rule.eligibleUpTo) {
        out.overCliff = true;
        out.explain.push('Income is ' + pct(share) + ' of the poverty line (' + dollars(line.cents) + ' for ' + (input.householdSize || 1) + '), over the 400% ceiling, so there is no credit and the full ' + dollars(benchmark) + ' premium is paid.');
      } else {
        out.explain.push('Income is under the poverty line (' + dollars(line.cents) + '), where the marketplace credit does not apply; Medicaid does in an expansion state.');
      }
      return out;
    }
    var expected = Math.round(magi * p);
    var credit = Math.max(0, benchmark - expected);
    out.applicablePct = Math.round(p * 10000) / 10000;
    out.expectedContributionCents = expected;
    out.creditCents = credit;
    out.premiumAfterCreditCents = benchmark - credit;
    out.eligible = true;
    out.explain.push('Income is ' + pct(share) + ' of the poverty line (' + dollars(line.cents) + ' for ' + (input.householdSize || 1) + '). The household is expected to pay ' + pct(p) + ' of income, ' + dollars(expected) + ', toward the ' + dollars(benchmark) + ' benchmark plan; the credit covers the ' + dollars(credit) + ' above that.');
    if (out.medicaidTerritory) out.explain.push('Under 138% of the poverty line an expansion state such as New York moves the household to Medicaid instead.');
    return out;
  }

  return { compute: compute, fplCents: fplCents, applicablePct: applicablePct };
});
