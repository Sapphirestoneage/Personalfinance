/* ==========================================================================
   engine/tax/state.js, state income tax. D-341.
   --------------------------------------------------------------------------
   A state with a file in data/tax/states/ runs its own schedule: state
   taxable income is federal AGI less what the file subtracts (Social
   Security, a pension and IRA exclusion past an age) less the state
   standard deduction, through the state's brackets. New York is the first
   file. Any other state uses the flat effective rate in the assumptions
   on federal AGI, and says so; no rate set means no state tax and a
   warning. Nine states have no income tax: a file of type `none` or the
   flat rate 0 covers them.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Tables: require('../tables.js') };
  else deps = { Tables: root.SLAF && root.SLAF.Engine && root.SLAF.Engine.Tables };
  var api = factory(deps.Tables);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.State = api; }
})(typeof self !== 'undefined' ? self : null, function (Tables) {
  'use strict';

  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }
  function pct(r) { return (Math.round(r * 10000) / 100) + '%'; }

  /**
   * compute({ state, filingStatus, agiCents, socialSecurityTaxableCents,
   *           pensionAndIraByPerson: [{ cents, age }], flatRate }, factor)
   * Returns { taxCents, taxableIncomeCents, marginalRate, method, explain, warnings }
   */
  function compute(input, factor) {
    var code = input.state ? String(input.state).toUpperCase() : null;
    var file = code ? Tables.state(code) : null;
    var status = input.filingStatus || 'single';
    var agi = Math.max(0, input.agiCents || 0);
    var out = { taxCents: 0, taxableIncomeCents: 0, marginalRate: 0, method: 'none', state: code, explain: [], warnings: [] };
    if (file && file.type === 'none') { out.explain.push(file.label + ' has no income tax.'); return out; }
    if (!file || file.type !== 'brackets') {
      var rate = input.flatRate;
      if (rate === null || rate === undefined) {
        if (code) out.warnings.push('No schedule for ' + code + ' yet and no flat state rate set: state tax is counted as zero.');
        else out.warnings.push('No state set: state tax is counted as zero.');
        return out;
      }
      out.method = 'flat';
      out.taxableIncomeCents = agi;
      out.taxCents = Math.round(agi * rate);
      out.marginalRate = rate;
      out.explain.push('State tax at the flat ' + pct(rate) + ' you set, on adjusted gross income of ' + dollars(agi) + '.');
      return out;
    }
    var sf = file.indexed === false ? 1 : factor;
    var taxable = agi;
    var subtracted = [];
    if (file.subtractSocialSecurity && input.socialSecurityTaxableCents) {
      taxable -= input.socialSecurityTaxableCents; subtracted.push(dollars(input.socialSecurityTaxableCents) + ' of Social Security');
    }
    if (file.pensionAndIraExclusion) {
      var ex = file.pensionAndIraExclusion, cap = Tables.cents(Tables.indexDollars(ex.perPersonUpTo, sf, file.indexed));
      (input.pensionAndIraByPerson || []).forEach(function (p) {
        if (p && p.age !== null && p.age >= ex.fromAge && p.cents > 0) {
          var amt = Math.min(p.cents, cap); taxable -= amt; subtracted.push(dollars(amt) + ' of pension and IRA income');
        }
      });
    }
    var std = Tables.byStatus({ standardDeduction: file.standardDeduction, indexed: file.indexed }, 'standardDeduction', status, sf);
    taxable = Math.max(0, taxable - std);
    var rows = Tables.brackets({ single: file.brackets.single, married_joint: file.brackets.married_joint, married_separate: file.brackets.married_separate,
      head_of_household: file.brackets.head_of_household, indexed: file.indexed }, status, sf);
    var lad = Tables.ladder(taxable, rows);
    out.method = 'brackets';
    out.taxableIncomeCents = Math.round(taxable);
    out.taxCents = lad.taxCents;
    out.marginalRate = lad.marginalRate;
    out.explain.push(file.label + ': adjusted gross income ' + dollars(agi) + (subtracted.length ? ', less ' + subtracted.join(' and ') : '') + ', less the ' + dollars(std) + ' state standard deduction, is ' + dollars(taxable) + ' taxable.');
    lad.bands.forEach(function (b) { out.explain.push(dollars(b.amountCents) + ' at ' + pct(b.rate) + ': ' + dollars(b.taxCents) + '.'); });
    if (file.recaptureStartsAt && agi > Tables.cents(Tables.indexDollars(file.recaptureStartsAt, sf, file.indexed))) {
      out.warnings.push(file.label + ' phases its lower rates out above ' + dollars(file.recaptureStartsAt * 100) + ' of income (tax benefit recapture); that extra is not modelled, so the state figure is a little low.');
    }
    return out;
  }

  return { compute: compute };
});
