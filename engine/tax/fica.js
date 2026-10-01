/* ==========================================================================
   engine/tax/fica.js, payroll tax on wages and self-employment tax on
   profit. D-341.
   --------------------------------------------------------------------------
   Wages, per person:   6.2% Social Security up to the wage base,
                        1.45% Medicare on all of it.
   Self-employment:     net earnings are 92.35% of profit; 12.4% Social
                        Security on net earnings up to whatever of the
                        wage base the person's wages have not used;
                        2.9% Medicare on all net earnings. Half of that
                        combined tax comes off income (IRC 164(f)).
   Additional Medicare: 0.9% on wages plus SE net earnings above the
                        filing-status threshold, which is per return (a
                        couple's wages are added together) and not indexed.
   Every figure in cents. Rates and bases from data/tax/2026.json.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Fica = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  /**
   * compute({ wagesByPerson: [cents...], seProfitByPerson: [cents...], filingStatus }, tax, factor)
   *   tax is data/tax/2026.json; factor the index factor for the year.
   * Returns { socialSecurityCents, medicareCents, additionalMedicareCents,
   *           seTaxCents, halfSeDeductionCents, employeeFicaCents, totalCents,
   *           perPerson: [...], explain }
   */
  function compute(input, tax, factor) {
    var f = tax.federal.fica, se = tax.federal.selfEmploymentTax;
    var base = Math.round(f.socialSecurityWageBase * factor) * 100;
    var status = input.filingStatus || 'single';
    var addThreshold = (f.additionalMedicareThreshold[status] !== undefined ? f.additionalMedicareThreshold[status] : f.additionalMedicareThreshold.single) * 100;
    var wages = input.wagesByPerson || [], profits = input.seProfitByPerson || [];
    var n = Math.max(wages.length, profits.length);
    var out = { socialSecurityCents: 0, medicareCents: 0, additionalMedicareCents: 0, seTaxCents: 0,
      halfSeDeductionCents: 0, employeeFicaCents: 0, totalCents: 0, perPerson: [], explain: [] };
    var medicareBase = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.max(0, wages[i] || 0), p = Math.max(0, profits[i] || 0);
      var ssW = Math.min(w, base) * f.socialSecurityRateEmployee;
      var medW = w * f.medicareRateEmployee;
      var net = p * se.netEarningsFactor;
      var roomLeft = Math.max(0, base - Math.min(w, base));
      var ssSe = Math.min(net, roomLeft) * se.socialSecurityRate;
      var medSe = net * se.medicareRate;
      var seTax = ssSe + medSe;
      medicareBase += w + net;
      out.perPerson.push({ wagesCents: w, seProfitCents: p, seNetEarningsCents: Math.round(net),
        socialSecurityCents: Math.round(ssW), medicareCents: Math.round(medW), seTaxCents: Math.round(seTax) });
      out.socialSecurityCents += ssW; out.medicareCents += medW; out.seTaxCents += seTax;
      if (w) out.explain.push('Wages of ' + dollars(w) + ': Social Security ' + pct(f.socialSecurityRateEmployee) + ' on the first ' + dollars(base) + ', Medicare ' + pct(f.medicareRateEmployee) + ' on all of it.');
      if (p) out.explain.push('Self-employment profit of ' + dollars(p) + ': ' + pct(se.netEarningsFactor) + ' counts as net earnings; ' + pct(se.socialSecurityRate) + ' Social Security on the part under the wage base, ' + pct(se.medicareRate) + ' Medicare on all of it. Half of that comes off income.');
    }
    var extra = Math.max(0, medicareBase - addThreshold) * f.additionalMedicareRate;
    if (extra) out.explain.push('Additional Medicare tax of ' + pct(f.additionalMedicareRate) + ' on earnings over ' + dollars(addThreshold) + '.');
    out.additionalMedicareCents = Math.round(extra);
    out.halfSeDeductionCents = Math.round(out.seTaxCents * se.deductibleShare);
    out.socialSecurityCents = Math.round(out.socialSecurityCents);
    out.medicareCents = Math.round(out.medicareCents);
    out.seTaxCents = Math.round(out.seTaxCents);
    out.employeeFicaCents = out.socialSecurityCents + out.medicareCents;
    out.totalCents = out.employeeFicaCents + out.seTaxCents + out.additionalMedicareCents;
    return out;
  }

  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }
  function pct(r) { return (Math.round(r * 10000) / 100) + '%'; }

  return { compute: compute };
});
