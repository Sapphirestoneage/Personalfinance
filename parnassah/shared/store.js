/* ==========================================================================
   parnassah/shared/store.js, the one family, in this browser only. PN-002.
   --------------------------------------------------------------------------
   One object under `parnassah.household.v1`. Never a `slaf.` or `coach.`
   key: Parnassah reads nothing of SPARKS and SPARKS reads nothing of it.

   Every money field is integer cents or null. null means "not entered";
   0 means the family typed zero. Nothing here turns one into the other.

     Store.blank()                a household with every field null
     Store.load()                 what this browser holds, migrated, or blank()
     Store.save(h)                write it, stamp savedAt, tell the listeners
     Store.onChange(fn)           fn(h) after every save
     Store.demo()                 the example family (fictional, PN-003)
     Store.clear()                forget everything
     Store.exportJson(h)          the text of a backup file
     Store.importJson(text)       a household from a backup, or throws
     Store.kid(h, id)             one child, or null
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Store = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var KEY = 'parnassah.household.v1';
  var SIGNATURE = 'parnassahExport';
  var listeners = [];

  function storage() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }

  function blank() {
    return {
      schemaVersion: 1,
      savedAt: null,
      household: { name: null, region: null, community: null, grossAnnualCents: null, takeHomeMonthlyCents: null, retirementMonthlyCents: null, olderParentBirthYear: null },
      kids: [],
      tuition: { assistanceShare: null, siblingShare: null, siblingFrom: 3, overrides: { early: null, elementary: null, high: null, gap: null } },
      year: { events: {}, shabbatWeeklyCents: null, campSleepawayCents: null, campDayCents: null },
      tzedakah: { rateId: 'maaser', customRate: null, baseId: 'net', taxAnnualCents: null, gifts: [] },
      milestones: { barmitzvahCents: null, batmitzvahCents: null, weddingCents: null, weddingShareId: 'flop', customShare: null, weddingAge: null, supportAnnualCents: null, supportYears: null,
        aliyah: { on: null, year: null, pilotCents: null, liftCents: null, landingCents: null } },
      home: { priceCents: null, downShare: null, ratePercent: null, years: null, taxRate: null, insuranceRate: null, currentHousingMonthlyCents: null },
      plan: { emergencyCents: null, leanMonthCents: null, lifeCoverCents: null, hasWill: null, hasDisability: null, retirementBalanceCents: null, returnRate: null, simchaMonthlyCents: null }
    };
  }

  /* Fill any key the stored object lacks, so an older file still reads. */
  function merge(base, over) {
    if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
    var out = {};
    Object.keys(base).forEach(function (k) {
      var b = base[k], o = over[k];
      out[k] = (b && typeof b === 'object' && !Array.isArray(b)) ? merge(b, o === undefined ? {} : o) : (o === undefined ? b : o);
    });
    Object.keys(over).forEach(function (k) { if (!(k in out)) out[k] = over[k]; });
    return out;
  }

  function migrate(raw) {
    var h = merge(blank(), raw || {});
    h.schemaVersion = 1;
    h.kids = (h.kids || []).map(function (k, i) { return merge({ id: 'k' + (i + 1), name: null, birthYear: null, sex: null, gapYear: null, camp: null }, k); });
    h.tzedakah.gifts = (h.tzedakah.gifts || []).map(function (g, i) { return merge({ id: 'g' + (i + 1), label: null, kind: 'other', cents: null }, g); });
    return h;
  }

  function load() {
    var s = storage(); if (!s) return blank();
    var raw = s.getItem(KEY); if (!raw) return blank();
    try { return migrate(JSON.parse(raw)); } catch (e) { return blank(); }
  }
  function save(h) {
    h.savedAt = new Date().toISOString();
    var s = storage(); if (s) s.setItem(KEY, JSON.stringify(h));
    listeners.forEach(function (fn) { fn(h); });
    return h;
  }
  function onChange(fn) { listeners.push(fn); }
  function clear() { var s = storage(); if (s) s.removeItem(KEY); }
  function kid(h, id) { for (var i = 0; i < h.kids.length; i++) if (h.kids[i].id === id) return h.kids[i]; return null; }
  function nextId(list, prefix) { var n = 0; list.forEach(function (x) { var m = /^[a-z]+(\d+)$/.exec(x.id || ''); if (m) n = Math.max(n, Number(m[1])); }); return prefix + (n + 1); }

  function exportJson(h) { return JSON.stringify({ format: SIGNATURE, version: 1, exportedAt: new Date().toISOString(), household: h }, null, 2); }
  function importJson(text) {
    var o = JSON.parse(text);
    if (!o || o.format !== SIGNATURE || !o.household) throw new Error('That is not a Parnassah backup.');
    return migrate(o.household);
  }

  /* ---- The example family (PN-003) ------------------------------------------
     The Adlers are fictional and every figure is invented for the demo. This
     repository is public: no real household is ever in it. */
  function demo() {
    var h = blank();
    var c = function (d) { return Math.round(d * 100); };
    h.household = { name: 'The Adlers (example)', region: 'nynj', community: 'teaneck', grossAnnualCents: c(360000), takeHomeMonthlyCents: c(19800), retirementMonthlyCents: c(1500), olderParentBirthYear: 1985 };
    h.kids = [
      { id: 'k1', name: 'Noam', birthYear: 2014, sex: 'boy', gapYear: true, camp: 'sleepaway' },
      { id: 'k2', name: 'Talia', birthYear: 2016, sex: 'girl', gapYear: true, camp: 'day' },
      { id: 'k3', name: 'Eitan', birthYear: 2019, sex: 'boy', gapYear: null, camp: 'day' },
      { id: 'k4', name: 'Maya', birthYear: 2022, sex: 'girl', gapYear: null, camp: 'none' }
    ];
    h.tuition = { assistanceShare: 0.25, siblingShare: null, siblingFrom: 3, overrides: { early: null, elementary: c(25500), high: c(39000), gap: c(30000) } };
    h.year = { events: { shul: c(2800), seats: 0, sukkot: c(350), yomtov: c(900), chanukah: c(400), purim: c(450), pesach: c(2500), shavuot: c(300), mikvah: c(400), eruv: c(150), israel: null },
      shabbatWeeklyCents: c(240), campSleepawayCents: c(9500), campDayCents: c(4500) };
    h.tzedakah = { rateId: 'maaser', customRate: null, baseId: 'net', taxAnnualCents: c(95000), gifts: [
      { id: 'g1', label: 'Shul building fund', kind: 'shul', cents: c(1800) },
      { id: 'g2', label: 'School dinner and scholarship fund', kind: 'school', cents: c(3600) },
      { id: 'g3', label: 'Tomchei Shabbos and the gemach', kind: 'local', cents: c(2400) },
      { id: 'g4', label: 'Israel', kind: 'israel', cents: c(1800) },
      { id: 'g5', label: 'The kollel and the yeshiva', kind: 'torah', cents: c(1200) }
    ] };
    h.milestones = { barmitzvahCents: c(25000), batmitzvahCents: c(18000), weddingCents: c(80000), weddingShareId: 'flop', customShare: null, weddingAge: 24, supportAnnualCents: c(18000), supportYears: 2,
      aliyah: { on: false, year: null, pilotCents: null, liftCents: null, landingCents: null } };
    h.home = { priceCents: c(950000), downShare: 0.2, ratePercent: 0.0625, years: 30, taxRate: 0.026, insuranceRate: 0.004, currentHousingMonthlyCents: c(4200) };
    h.plan = { emergencyCents: c(22000), leanMonthCents: c(9200), lifeCoverCents: c(1500000), hasWill: false, hasDisability: true, retirementBalanceCents: c(310000), returnRate: 0.05, simchaMonthlyCents: c(1000) };
    return h;
  }

  return { KEY: KEY, SIGNATURE: SIGNATURE, blank: blank, migrate: migrate, load: load, save: save, onChange: onChange, clear: clear, demo: demo, kid: kid, nextId: nextId, exportJson: exportJson, importJson: importJson };
});
