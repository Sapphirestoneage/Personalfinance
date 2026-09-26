/* ==========================================================================
   kehillah/shared/demo.js, the example household. KD-002.
   --------------------------------------------------------------------------
   Two adults, Noa and Sam, partnered and not married, with a chosen family
   of six around their Shabbat table. Every number is invented and round.
   Loaded only behind "Try with example numbers", and marked as the demo
   while it is in. No real financial data, ever.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Demo = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  function build() {
    return {
      v: 1, demo: true, updated: null,
      year: {
        lines: { dues: 120000, 'hh-tickets': 0, 'hh-food': 18000, sukkah: 6000, hanukkah: 15000, purim: 8000, pesach: 45000, shavuot: 3000, shabbat: 4000, kosher: 0, 'tzedakah-year': null, camp: null, school: null, lifecycle: 250000, travel: 60000 },
        savedCents: 40000
      },
      tzedakah: {
        incomeCents: 7800000, base: 'net', rate: 0.10, rateId: 'maaser',
        gifts: [
          { id: 'g1', cause: 'queer-jewish', label: 'Keshet', cents: 18000, level: 2, date: '2026-09-21', note: 'Yom Kippur pledge' },
          { id: 'g2', cause: 'free-loan', label: 'Hebrew Free Loan', cents: 25000, level: 1, date: '2026-09-25', note: '' },
          { id: 'g3', cause: 'trans-mutual-aid', label: 'A friend\'s surgery fund', cents: 10000, level: 5, date: '2026-09-14', note: '' }
        ]
      },
      protections: {
        shape: 'partnered',
        status: { will: 'todo', 'healthcare-proxy': 'done', poa: 'todo', hipaa: 'done', beneficiaries: 'todo', guardianship: 'na', 'second-parent': 'na', cohabitation: 'todo', funeral: 'todo', 'documents-name': 'done' },
        notes: {}
      },
      cushion: { monthCents: 380000, savedCents: 520000, monthlyCents: 30000 },
      family: { path: 'reciprocal-ivf', tries: 2, perTryCents: 2500000, onceCents: 300000, coveredCents: 1500000, savedCents: 1200000, monthlyCents: 90000, afterward: { 'second-parent': 300000, leave: 800000, 'first-year': 1200000 } },
      care: {
        insured: true, deductibleCents: 250000, oopMaxCents: 700000,
        items: { hrt: { cents: 4000, covered: true }, labs: { cents: 40000, covered: true }, therapy: { cents: 24000, covered: false }, top: { cents: 1100000, covered: true }, hair: { cents: 300000, covered: false }, travel: { cents: 150000, covered: false } },
        hsa: { type: 'individual', soFarCents: 120000 },
        savedCents: 350000, monthlyCents: 45000,
        names: { court: 21000, passport: 16500, licence: 3200, documents: 5000 }
      },
      gemach: { amountCents: 800000, termMonths: 36, cardApr: 0.249, loanApr: 0.129, monthlyCents: 30000 },
      elul: { yearly: { next: 'Sign the will and the power of attorney before Pesach.' }, monthly: {}, yearlyAt: '2026-09-06', monthlyAt: null }
    };
  }
  return { build: build, names: 'Noa and Sam' };
});
