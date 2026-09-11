/* ==========================================================================
   engines/wrapped.js — Money Wrapped. DECISIONS.md D-213 (I1).
   --------------------------------------------------------------------------
   A year-end card from the year's snapshots, four lines, no amounts:

     days of freedom bought   how far the FI date moved, in days, between
                              the year's first and last snapshot (each
                              re-run through engines/tier0.js from the
                              raw inputs the snapshot froze)
     the priciest recurring cost, in hours of work at the real hourly wage
     the biggest single earned change, as a percent of where it started
     how many numbers you learned about yourself (first entries and
                              confidence upgrades since the year's first
                              snapshot, from engines/sincelast.js)

   Available every December and on demand. Every line is a count, a
   percent, hours or days; a cents value never reaches the card.

     Wrapped.year(h, snapshots, tables, { year }) → { year, lines, ok, missing }
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Hourly: require('./hourly.js'), SinceLast: require('./sincelast.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Tier0: root.SLAF && root.SLAF.Tier0, Hourly: root.SLAF && root.SLAF.Hourly, SinceLast: root.SLAF && root.SLAF.SinceLast };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Hourly, deps.SinceLast);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Wrapped = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Hourly, SinceLast) {
  'use strict';
  var DAYS_PER_YEAR = 365.25;
  function householdAt(snap) {
    var r = snap && snap.rawInputs;
    if (!r) return null;
    return Schema.createHousehold({ people: r.people, assets: r.assets, debts: r.debts, expenses: r.expenses, filingStatus: r.filingStatus, state: r.state, capturingFullMatch: r.capturingFullMatch, retirement: r.retirement, insurance: r.insurance });
  }
  function inYear(snaps, year) {
    return (snaps || []).filter(function (s) { return s && typeof s.timestamp === 'string' && s.timestamp.slice(0, 4) === String(year); })
      .sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : 1; });
  }
  /* The priciest recurring cost: the four monthly lines, the yearly lines,
     the monthly entries; the biggest a year, in hours at the real wage. */
  function priciest(h, tables) {
    var cands = [];
    var e = h.expenses || {};
    var needs = e.needs || {};
    [['food', 'Food'], ['accommodation', 'Rent or mortgage'], ['transportation', 'Getting around']].forEach(function (p) {
      var v = needs[p[0]] && Money.isEntered(needs[p[0]].monthlyCents) ? needs[p[0]].monthlyCents : (Money.isEntered(needs[p[0]]) ? needs[p[0]] : null);
      if (Money.isEntered(v) && v > 0) cands.push({ label: p[1], annualCents: v * 12 });
    });
    if (e.wants && Money.isEntered(e.wants.totalCents) && e.wants.totalCents > 0) cands.push({ label: 'Everything else', annualCents: e.wants.totalCents * 12 });
    (e.annual || []).forEach(function (l) { if (Money.isEntered(l.amountCents) && l.amountCents > 0) cands.push({ label: l.label || 'A yearly cost', annualCents: l.amountCents }); });
    (e.entries || []).forEach(function (x) { if (x && x.period === 'monthly' && Money.isEntered(x.amountCents) && x.amountCents > 0) cands.push({ label: x.label || x.categoryId || 'A monthly line', annualCents: x.amountCents * 12 }); });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return b.annualCents - a.annualCents; });
    var top = cands[0];
    var wage = Hourly && Hourly.realHourlyWage ? Hourly.realHourlyWage(h, tables) : null;
    if (!wage || !Money.isOk(wage) || wage.value <= 0) return { label: top.label, hours: null };
    return { label: top.label, hours: Math.round(top.annualCents / wage.value) };
  }
  function year(household, snapshots, tables, opts) {
    var h = household || {}, o = opts || {};
    var y = o.year || Number(Schema.localDay().slice(0, 4));
    var snaps = inYear(snapshots, y);
    var lines = [], missing = [];
    /* 1. days of freedom */
    var first = snaps.filter(function (s) { return s.rawInputs; })[0] || null;
    var hFirst = first ? householdAt(first) : null;
    var yFirst = hFirst ? Tier0.yearsToFire(hFirst, tables, null, { fractional: true }) : null;
    var yNow = Tier0.yearsToFire(h, tables, null, { fractional: true });
    if (yFirst && Money.isOk(yFirst) && Money.isOk(yNow)) {
      var days = Math.round((yFirst.value - yNow.value) * DAYS_PER_YEAR);
      lines.push({ id: 'freedom', value: days, unit: 'days', text: days === 0 ? 'The FI date held its ground this year.' : (days > 0 ? days + ' days of freedom bought: the FI date moved ' + days + ' days closer.' : Math.abs(days) + ' days of freedom given back: the FI date moved ' + Math.abs(days) + ' days further out.') });
    } else { missing.push('a snapshot from earlier in ' + y + ' with the FI inputs'); lines.push({ id: 'freedom', value: null, unit: 'days', text: 'Days of freedom: needs a snapshot from earlier in the year with income, spending and investments in it.' }); }
    /* 2. priciest recurring cost in hours */
    var p = priciest(h, tables);
    if (p && p.hours !== null) lines.push({ id: 'priciest', value: p.hours, unit: 'hours', text: 'The priciest recurring cost, ' + p.label.toLowerCase() + ', took about ' + p.hours + ' hours of work this year.' });
    else { missing.push(p ? 'the real hourly wage' : 'a recurring cost'); lines.push({ id: 'priciest', value: null, unit: 'hours', text: p ? 'The priciest recurring cost is ' + p.label.toLowerCase() + '; in hours of work it needs the real hourly wage (hours and commute).' : 'The priciest recurring cost needs a spending line.' }); }
    /* 3. biggest earned change, 4. numbers learned */
    var base = snaps[0] || null;
    if (base && SinceLast) {
      var r = SinceLast.compute(h, base, tables);
      var earned = (r && r.earned || []).filter(function (c) { return typeof c.before === 'number' && c.before !== 0 && typeof c.delta === 'number'; })
        .map(function (c) { return { label: c.label, pct: Math.round(c.delta / Math.abs(c.before) * 100) }; })
        .sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
      if (earned.length) lines.push({ id: 'earned', value: earned[0].pct, unit: 'percent', text: 'Biggest single earned change: ' + earned[0].label.toLowerCase() + ' ' + (earned[0].pct >= 0 ? 'up' : 'down') + ' ' + Math.abs(earned[0].pct) + '%.' });
      else lines.push({ id: 'earned', value: null, unit: 'percent', text: 'No money moved since the year’s first snapshot; every change was something you learned.' });
      var n = (r && r.learned || []).length;
      lines.push({ id: 'learned', value: n, unit: 'count', text: n === 0 ? 'No new numbers learned since the year’s first snapshot.' : 'You learned ' + n + ' number' + (n === 1 ? '' : 's') + ' about yourself this year.' });
    } else {
      missing.push('a snapshot from earlier in ' + y);
      lines.push({ id: 'earned', value: null, unit: 'percent', text: 'Biggest earned change: needs a snapshot from earlier in the year.' });
      lines.push({ id: 'learned', value: null, unit: 'count', text: 'Numbers learned: needs a snapshot from earlier in the year.' });
    }
    return { year: y, lines: lines, ok: lines.every(function (l) { return l.value !== null; }), missing: missing, snapshots: snaps.length };
  }
  return { year: year, priciest: priciest, householdAt: householdAt, inYear: inYear };
});
