/* ==========================================================================
   safeword/shared/demo.js, the example household. SF-002.
   --------------------------------------------------------------------------
   Vesper: a pro domme in a mid-size US city, four ways of earning and a
   part-time vanilla job, a rented dungeon by the hour, a partner in the
   house with a small tribute protocol, papers half done. Every number is
   invented for scale. No real person's figures are in this file or any
   other tracked file; safeword/test/run.js checks.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Demo = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  function household() { return {
    version: 1,
    you: { name: 'Vesper', filingStatus: 'single', state: 'IL', age: 31, sessionCents: 45000, sessionsMonth: 14 },
    streams: [
      { id: 's-sessions', kind: 'inperson', label: 'Sessions', lowMonthCents: 250000, typicalMonthCents: 600000, platformFeeRate: 0, processorFeeRate: 0.03, cashShare: 0.7, monthsActive: 12, railId: 'r-cash' },
      { id: 's-subs', kind: 'subs', label: 'Subscriber page', lowMonthCents: 90000, typicalMonthCents: 140000, platformFeeRate: 0.2, processorFeeRate: 0, cashShare: 0, monthsActive: 12, railId: 'r-platform' },
      { id: 's-clips', kind: 'clips', label: 'Clip store', lowMonthCents: 20000, typicalMonthCents: 60000, platformFeeRate: 0.35, processorFeeRate: 0, cashShare: 0, monthsActive: 12, railId: 'r-bank-a' },
      { id: 's-tribute', kind: 'tribute', label: 'Tributes', lowMonthCents: 0, typicalMonthCents: 50000, platformFeeRate: 0, processorFeeRate: 0.03, cashShare: 0.1, monthsActive: 12, railId: 'r-app' },
      { id: 's-job', kind: 'vanilla', label: 'Bookshop, two days a week', lowMonthCents: 120000, typicalMonthCents: 120000, platformFeeRate: 0, processorFeeRate: 0, cashShare: 0, monthsActive: 12, railId: 'r-bank-a' }
    ],
    costs: [
      { id: 'c-space', kind: 'space', label: 'Dungeon, by the hour', monthCents: 90000, fixed: true, deductible: 'usually' },
      { id: 'c-gear', kind: 'gear', label: 'Gear', monthCents: 15000, fixed: false, deductible: 'usually' },
      { id: 'c-look', kind: 'wardrobe', label: 'Latex, boots, nails', monthCents: 25000, fixed: false, deductible: 'sometimes' },
      { id: 'c-ads', kind: 'ads', label: 'Listings', monthCents: 22000, fixed: true, deductible: 'usually' },
      { id: 'c-screen', kind: 'screening', label: 'Screening service', monthCents: 4000, fixed: true, deductible: 'usually' },
      { id: 'c-photos', kind: 'content', label: 'Shoots', monthCents: 15000, fixed: false, deductible: 'usually' },
      { id: 'c-web', kind: 'web', label: 'Site and booking', monthCents: 3500, fixed: true, deductible: 'usually' },
      { id: 'c-phone', kind: 'privacy', label: 'Work phone, mail service', monthCents: 10500, fixed: true, deductible: 'usually' },
      { id: 'c-cpa', kind: 'pro', label: 'Accountant', monthCents: 12000, fixed: true, deductible: 'usually' },
      { id: 'c-supplies', kind: 'supplies', label: 'Gloves, laundry, the rest', monthCents: 6000, fixed: false, deductible: 'usually' }
    ],
    rails: [
      { id: 'r-bank-a', kind: 'bank', label: 'Bank A, checking', balanceCents: 420000, closeRisk: 'medium', forWork: true, isFund: false },
      { id: 'r-bank-b', kind: 'bank', label: 'Bank B, savings', balanceCents: 650000, closeRisk: 'low', forWork: false, isFund: true },
      { id: 'r-platform', kind: 'platform', label: 'Subscriber page balance', balanceCents: 38000, closeRisk: 'high', forWork: true, isFund: false },
      { id: 'r-app', kind: 'app', label: 'Payment app', balanceCents: 12000, closeRisk: 'high', forWork: true, isFund: false },
      { id: 'r-cash', kind: 'cash', label: 'Cash at home', balanceCents: 110000, closeRisk: 'low', forWork: true, isFund: false }
    ],
    play: [
      { id: 'k-events', kind: 'events', label: 'Two cons a year', yearCents: 180000 },
      { id: 'k-gear', kind: 'gear', label: 'Rope and leather', yearCents: 60000 },
      { id: 'k-club', kind: 'membership', label: 'Club dues and parties', yearCents: 48000 },
      { id: 'k-class', kind: 'education', label: 'Classes', yearCents: 30000 }
    ],
    personal: { leanMonthCents: 280000, typicalMonthCents: 390000 },
    fund: { targetMonths: 6, setAsideRate: 0.1 },
    taxes: { setAsideRate: 0.25, priorYearLiabilityCents: 980000, priorYearAgiCents: 5400000, paidThisYearCents: 490000, countSometimes: false },
    longgame: { account: 'sep', balanceCents: 1200000, monthCents: 40000, annualRate: 0.05, stopAge: 60, exitYear: 2034, cushionMonths: 12 },
    house: {
      people: [
        { id: 'p-me', name: 'Vesper', role: 'me', incomeMonthCents: null, leanMonthCents: null, share: null },
        { id: 'p-ash', name: 'Ash', role: 'submissive', incomeMonthCents: 310000, leanMonthCents: 210000, share: null }
      ],
      sharedMonthCents: 240000, splitRule: 'proportional',
      protocol: { fromId: 'p-ash', toId: 'p-me', monthCents: 30000, capCents: 40000, reviewDate: '2026-12-01', safeword: true }
    },
    papers: { will: 'none', beneficiaries: 'done', healthProxy: 'started', financialPoa: 'none', digital: 'none', names: 'started', emergency: 'started', wishes: 'none' },
    meta: { demo: true, updated: null }
  }; }
  return { household: household };
});
