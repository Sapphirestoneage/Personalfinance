/* ==========================================================================
   engines/subscriptions.js — the subscription finder. DECISIONS.md D-215 (J5).
   --------------------------------------------------------------------------
   From the dated entries in the expense log (a bank import, or lines
   logged by hand): charges that repeat on a regular rhythm at a similar
   amount. Each with its yearly cost and its cost in hours of work at the
   real hourly wage. The person confirms, dismisses, or marks "cancel
   this", which is a reminder and never an action; the decision lives in
   household.subscriptions. Feeds the Expenses door's level 4 and the
   Money Wrapped leak line.

     Subscriptions.find(h, tables)  → [{ key, label, rhythm, count,
                                       typicalCents, yearlyCents, hours,
                                       status, firstDate, lastDate }]
     Subscriptions.decide(list, key, status) → the new decisions list
     Subscriptions.leak(h, tables)  → { count, yearlyCents, hours } over the
                                       ones not dismissed
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Hourly: (function () { try { return require('./hourly.js'); } catch (e) { return null; } })() };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Hourly: root.SLAF && root.SLAF.Hourly };
  }
  var api = factory(deps.Money, deps.Schema, deps.Hourly);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Subscriptions = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Hourly) {
  'use strict';
  var RHYTHMS = [
    { id: 'weekly', min: 6, max: 8, perYear: 52, label: 'every week' },
    { id: 'fortnightly', min: 13, max: 15, perYear: 26, label: 'every two weeks' },
    { id: 'monthly', min: 26, max: 35, perYear: 12, label: 'every month' },
    { id: 'quarterly', min: 85, max: 97, perYear: 4, label: 'every three months' },
    { id: 'yearly', min: 350, max: 380, perYear: 1, label: 'every year' }
  ];
  var SIMILAR = 1.15;                    /* max over min of the amounts */
  var STATUSES = ['confirmed', 'dismissed', 'cancel'];
  function key(desc) { return String(desc || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' '); }
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  function rhythmOf(gaps) {
    if (!gaps.length) return null;
    for (var i = 0; i < RHYTHMS.length; i++) {
      var r = RHYTHMS[i];
      if (gaps.every(function (g) { return g >= r.min && g <= r.max; })) return r;
    }
    return null;
  }
  function decisions(h) { return ((h && h.subscriptions) || []).filter(function (d) { return d && d.key; }); }
  function find(household, tables) {
    var h = household || {};
    var entries = ((h.expenses || {}).entries || []).filter(function (e) { return e && e.date && Money.isEntered(e.amountCents) && e.amountCents > 0 && e.period === 'once' && e.hidden !== true; });
    var groups = {};
    entries.forEach(function (e) { var k = key(e.descriptor || e.categoryId || ''); if (!k) return; (groups[k] = groups[k] || []).push(e); });
    var wage = Hourly && Hourly.realHourlyWage ? Hourly.realHourlyWage(h, tables) : null;
    var wageCents = wage && Money.isOk(wage) && wage.value > 0 ? wage.value : null;
    var dec = {}; decisions(h).forEach(function (d) { dec[d.key] = d; });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var list = groups[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (list.length < 2) return;
      var amounts = list.map(function (e) { return e.amountCents; });
      var lo = Math.min.apply(null, amounts), hi = Math.max.apply(null, amounts);
      if (lo <= 0 || hi / lo > SIMILAR) return;
      var gaps = []; for (var i = 1; i < list.length; i++) gaps.push(days(list[i - 1].date, list[i].date));
      var r = rhythmOf(gaps);
      if (!r) return;
      var typical = Math.round(amounts.reduce(function (s, a) { return s + a; }, 0) / amounts.length);
      var yearly = typical * r.perYear;
      out.push({ key: k, label: list[list.length - 1].descriptor || k, rhythm: r.id, rhythmLabel: r.label, count: list.length, typicalCents: typical, yearlyCents: yearly,
        hours: wageCents ? Math.round(yearly / wageCents * 10) / 10 : null, status: dec[k] ? dec[k].status : null, firstDate: list[0].date, lastDate: list[list.length - 1].date, categoryId: list[list.length - 1].categoryId || null });
    });
    out.sort(function (a, b) { return b.yearlyCents - a.yearlyCents; });
    return out;
  }
  function decide(list, k, status, label, yearlyCents) {
    var out = (list || []).filter(function (d) { return d && d.key !== k; });
    if (STATUSES.indexOf(status) === -1) return out;
    out.push({ key: k, status: status, label: label || k, yearlyCents: Money.isEntered(yearlyCents) ? yearlyCents : null, at: Schema.localDay() });
    return out;
  }
  function leak(household, tables) {
    var found = find(household, tables).filter(function (s) { return s.status !== 'dismissed'; });
    var yearly = found.reduce(function (s, x) { return s + x.yearlyCents; }, 0);
    var hours = found.every(function (x) { x.hours !== null; }) ? null : null;
    var known = found.filter(function (x) { return x.hours !== null; });
    return { count: found.length, yearlyCents: yearly, hours: known.length === found.length && found.length ? Math.round(known.reduce(function (s, x) { return s + x.hours; }, 0) * 10) / 10 : null, cancel: found.filter(function (x) { return x.status === 'cancel'; }).length };
  }
  return { find: find, decide: decide, leak: leak, key: key, RHYTHMS: RHYTHMS, STATUSES: STATUSES, SIMILAR: SIMILAR };
});
