/* ==========================================================================
   shared/lens.js — the one toggle every room has.
   BRIEF "Lens function", DECISIONS.md D-094.
   --------------------------------------------------------------------------
   Four ways to read the same dollars:
     $        dollars
     hours    hours of your life at your real hourly wage (absent when there
              is no wage: retired, between jobs)
     bought   months of FI moved earlier if this amount were saved instead
     pushed   months FI moves later if this amount is spent
   Core provides it; rooms never reimplement it. The FI arithmetic is the
   projection engine's years-to-target with the real return, the FI number
   and this year's savings — the same three the dashboard's Distance uses.
   The chosen mode is per session (sessionStorage), never a household fact.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Gate: require('./gate.js'),
             Tier0: require('../engines/tier0.js'), Projection: require('../engines/projection.js'), Hourly: require('../engines/hourly.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Gate: S.Gate, Tier0: S.Tier0, Projection: S.Projection, Hourly: S.Hourly || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Gate, deps.Tier0, deps.Projection, deps.Hourly);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Lens = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Gate, Tier0, Projection, Hourly) {
  'use strict';

  var MODES = [
    { id: '$',      label: '$',       long: 'in dollars' },
    { id: 'hours',  label: 'hours',   long: 'in hours of your life' },
    { id: 'bought', label: 'bought',  long: 'months of FI bought if saved instead' },
    { id: 'pushed', label: 'pushed',  long: 'months FI is pushed if spent' }
  ];
  var STORE_KEY = 'slaf.lens';

  function wage(household, tables) {
    if (!Hourly || !Gate.exists(household, 'realHourlyWage')) return null;
    var w = Hourly.realHourlyWage(household, tables);
    return Money.isOk(w) && w.value > 0 ? w.value : null;
  }

  /** The modes that exist for this household: hours only with a wage. */
  function available(household, tables) {
    var w = wage(household, tables);
    return MODES.filter(function (m) { return m.id !== 'hours' || w !== null; });
  }

  /** What the FI arithmetic needs, once. */
  function fiInputs(household, tables) {
    var fire = Tier0.fireNumber(household);
    if (!Money.isOk(fire)) return fire;
    var inv = Schema.investmentsCents(household);
    if (!Money.isOk(inv)) return Money.incomplete('Add your investments to see FI move.', ['investments']);
    var rates = Tier0.savingsRate(household, tables);
    var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    if (!Money.isOk(basis)) return Money.incomplete('Add your income to see FI move.', basis.missing);
    if (basis.annualSavingsCents <= 0) return Money.incomplete('Nothing is being saved, so FI does not move.', ['savingsRate']);
    var a = Schema.resolveAssumptions(household);
    return Money.ok(fire.value, { investmentsCents: inv.value, annualSavingsCents: basis.annualSavingsCents, rate: a.returnReal, targetCents: fire.value });
  }
  function yearsFrom(startCents, fi) {
    if (startCents >= fi.targetCents) return Money.ok(0, { alreadyThere: true });
    return Projection.yearsToTargetCents({ startCents: Math.max(0, startCents), targetCents: fi.targetCents, annualRate: fi.rate, annualContributionCents: fi.annualSavingsCents, fractional: true });
  }

  /**
   * apply(cents, mode, h, tables) → Result. `value` is dollars (cents),
   * hours, or months; `unit` says which; `display` is the string to show.
   */
  function apply(cents, mode, household, tables) {
    if (!Money.isEntered(cents)) return Money.incomplete('Nothing to show.', []);
    if (mode === 'hours') {
      var w = wage(household, tables);
      if (w === null) return Money.incomplete('No real hourly wage for this situation.', ['realHourlyWage']);
      return Money.ok(cents / w, { unit: 'hours', display: Money.formatAsTime(cents, w), wageCents: w });
    }
    if (mode === 'bought' || mode === 'pushed') {
      var fi = fiInputs(household, tables);
      if (!Money.isOk(fi)) return fi;
      var now = yearsFrom(fi.investmentsCents, fi);
      var then = yearsFrom(fi.investmentsCents + (mode === 'bought' ? cents : -cents), fi);
      if (!Money.isOk(now) || !Money.isOk(then)) return Money.incomplete('FI is out of reach at these assumptions, so it cannot move.', ['savingsRate']);
      var raw = (mode === 'bought' ? now.value - then.value : then.value - now.value) * 12;
      var months = Math.round(raw);
      return Money.ok(months, { unit: 'months', display: formatMonths(months, mode, raw), yearsNow: now.value, yearsThen: then.value });
    }
    return Money.ok(cents, { unit: 'cents', display: Money.formatCents(cents) });
  }
  function formatMonths(months, mode, raw) {
    var abs = Math.abs(months);
    var body = abs >= 24 ? (Math.round(abs / 12 * 10) / 10) + ' yrs' : abs + ' mo';
    var tail = mode === 'bought' ? ' sooner' : ' later';
    if (months === 0) return (raw && Math.abs(raw) > 0.01) ? 'FI < 1 mo' + tail : 'FI unmoved';
    return 'FI ' + body + tail;
  }
  /** The string, or the em dash with the reason on the Result. */
  function format(cents, mode, household, tables) {
    var r = apply(cents, mode, household, tables);
    return Money.isOk(r) ? r.display : Money.EM_DASH;
  }

  /* ---- The chosen mode, this session ---------------------------------------- */
  function mode() {
    try { var m = sessionStorage.getItem(STORE_KEY); return MODES.some(function (x) { return x.id === m; }) ? m : '$'; } catch (e) { return '$'; }
  }
  function setMode(m) {
    try { sessionStorage.setItem(STORE_KEY, m); } catch (e) { /* fine */ }
    return mode();
  }
  /** The toggle's markup: one button a mode, the current one pressed. */
  function toggleHtml(household, tables, id) {
    var cur = mode();
    return '<div class="slaf-lens" id="' + (id || 'lens') + '" role="group" aria-label="Read these numbers as">' + available(household, tables).map(function (m) {
      return '<button type="button" class="slaf-lens-btn" data-lens="' + m.id + '" aria-pressed="' + (m.id === cur) + '" title="' + m.long + '">' + m.label + '</button>';
    }).join('') + '</div>';
  }

  return { MODES: MODES, STORE_KEY: STORE_KEY, wage: wage, available: available, fiInputs: fiInputs, apply: apply, format: format, formatMonths: formatMonths, mode: mode, setMode: setMode, toggleHtml: toggleHtml };
});
