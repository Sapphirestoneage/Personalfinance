/* ==========================================================================
   engines/rankguess.js — the money dysmorphia test. DECISIONS.md D-213 (I3).
   --------------------------------------------------------------------------
   Before the percentile is shown, the person guesses where they rank for
   their age on a slider; then the guess sits beside the real band from
   data/net_worth_percentiles_scf_2022.json. Bands, never ranks. Below the
   median the copy says what the next band takes, never how far behind.
   The guess stays local.

     RankGuess.band(pct)                the band a percentile falls in
     RankGuess.compare(guessPct, h, tables) → { status, guess, real, same,
                                        direction, nextBand, line, missing }
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Tier0: root.SLAF && root.SLAF.Tier0 };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.RankGuess = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';
  var BANDS = [
    { id: 'bottom', from: 0, to: 25, label: 'the bottom quarter' },
    { id: 'lowerMiddle', from: 25, to: 50, label: 'below the middle' },
    { id: 'upperMiddle', from: 50, to: 75, label: 'above the middle' },
    { id: 'top', from: 75, to: 101, label: 'the top quarter' }
  ];
  function band(pct) {
    if (!Money.isEntered(pct)) return null;
    for (var i = 0; i < BANDS.length; i++) if (pct >= BANDS[i].from && pct < BANDS[i].to) return BANDS[i];
    return pct >= 100 ? BANDS[3] : BANDS[0];
  }
  function breakpoint(table, ageLabel, percentile) {
    var b = ((table && table.bands) || []).filter(function (x) { return x.label === ageLabel; })[0];
    if (!b) return null;
    var bp = (b.breakpoints || []).filter(function (x) { return x.percentile === percentile; })[0];
    return bp ? bp.netWorth : null;
  }
  function compare(guessPct, household, tables) {
    var T = tables || {};
    var real = Tier0.netWorthPercentile(household, T);
    if (!Money.isOk(real)) return { status: 'incomplete', missing: real.missing, reason: real.reason, guess: band(guessPct) };
    var g = band(guessPct), r = band(real.value);
    var same = g && r && g.id === r.id;
    var direction = same ? 'same' : (g && r && BANDS.indexOf(g) > BANDS.indexOf(r) ? 'guessedHigher' : 'guessedLower');
    var nextBand = null;
    if (real.value < 50) {
      var nextPct = real.value < 25 ? 25 : 50;
      var nw = Tier0.netWorth(household);
      var cut = breakpoint(T.netWorthPercentiles, real.bandLabel, nextPct);
      if (cut !== null && Money.isOk(nw)) nextBand = { percentile: nextPct, label: band(nextPct).label, moreCents: Math.max(0, Math.round(cut * 100 - nw.value)) };
    }
    var line = same ? 'Your guess landed in the right band: ' + r.label + ' for ' + real.bandLabel + '.'
      : 'You guessed ' + g.label + '; the survey puts you ' + r.label + ' for ' + real.bandLabel + '.';
    if (nextBand) line += ' The next band, ' + nextBand.label + ', takes about ' + Money.formatCents(nextBand.moreCents) + ' more.';
    return { status: 'ok', guess: g, real: r, realBandLabel: real.bandLabel, same: same, direction: direction, nextBand: nextBand, line: line, referenceVersion: real.referenceVersion, precision: real.precision };
  }
  return { BANDS: BANDS, band: band, compare: compare };
});
