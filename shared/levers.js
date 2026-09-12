/* ==========================================================================
   shared/levers.js — the lever library: get, applies, apply. Nothing more.
   --------------------------------------------------------------------------
   A lever is one line in data/levers.json: what it moves, by how much, the
   hours it costs, whether it keeps paying through a job loss, one
   flexibility tag, and when it applies. This file reads that table and
   offers three things — plus the implied hourly wage of any lever, since
   every room that offers one should show it. No categories, no weights,
   no plugin system. DECISIONS.md D-174.

     use(table)                     hand it data/levers.json once (a page
                                    does this after Reference.load)
     get(id)                        the lever, or null
     all()                          every lever, in table order
     applies(id, household)         its appliesWhen, read against the house
     apply(id, household, opts)     a NEW household with the moves applied;
                                    never mutates. opts.scale (0–1) halves a
                                    lever for a "half of each" combination
     monthlyGainCents(id, h)        Result: what it moves, a month, positive
                                    when money comes in or spending goes out
     impliedHourlyCents(id, h)      Result: monthly gain ÷ (hoursPerWeek × 4.33)

   `appliesWhen` is one of a few fixed phrases, read by hand — never eval'd.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Levers = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var TABLE = null;
  function use(table) { TABLE = table && table.levers ? table : (table && table.levers === undefined && table.hustle ? { levers: table } : table); return TABLE; }
  function table() {
    if (TABLE) return TABLE;
    if (typeof module === 'object' && module.exports) { try { TABLE = require('../data/levers.json'); } catch (e) { TABLE = null; } }
    return TABLE;
  }
  function factor() { var t = table(); return t && Money.isEntered(t.hoursPerMonthFactor) ? t.hoursPerMonthFactor : 4.33; }

  function get(id) {
    var t = table();
    if (!t || !t.levers || !t.levers[id]) return null;
    return Object.assign({ id: id }, t.levers[id]);
  }
  function all() {
    var t = table();
    return t && t.levers ? Object.keys(t.levers).map(get) : [];
  }

  /* ---- appliesWhen: a few fixed phrases, read by hand ------------------- */
  function situationOf(h) {
    var p = Schema.primaryPerson(h);
    var s = p && p.employmentStatus;
    return s === 'retired' ? 'retired' : s === 'unemployed' ? 'betweenJobs' : s === 'student' ? 'student'
      : s === 'selfEmployed' ? 'selfEmployed' : s === 'both' ? 'mixed' : s ? 'employed' : null;
  }
  function gateModule() {
    if (typeof module === 'object' && module.exports) { try { return require('./gate.js'); } catch (e) { return null; } }
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF.Gate ? g.SLAF.Gate : null;
  }
  function clause(text, h) {
    var c = String(text).trim();
    if (c === 'always') return true;
    if (c === 'situation != retired') return situationOf(h) !== 'retired';
    /* 18.2 (D-183): the Ledger rows use the same reader, a few more phrases. */
    var m = /^situation (==|!=) (\w+)$/.exec(c);
    if (m) return (situationOf(h) === m[2]) === (m[1] === '==');
    /* `gate.<branch>` defers to shared/gate.js, so a row's appliesWhen and
       a room's requires read ONE definition of the branch instead of two
       copies that can drift (D-213). gate.js requires only money.js and
       schema.js, so reading it from here cannot cycle. */
    var gm = /^gate\.(\w+)$/.exec(c);
    if (gm) { var G = gateModule(); return G ? G.exists(h, gm[1]) : true; }
    if (c === 'household.two') return !!(Schema.householdOfTwo && Schema.householdOfTwo(h));
    if (c === 'dependents.any') return !!(h && Array.isArray(h.dependents) && h.dependents.length);
    if (c === 'debt.any') return !!(h && (h.debts || []).length);
    if (c === 'debt.studentLoan') return !!(h && (h.debts || []).some(function (d) { return d.type === 'student_loan'; }));
    if (c === 'income.variable') { var so = situationOf(h); return so === 'selfEmployed' || so === 'mixed' || !!(h && h.variableIncome && (Money.isEntered(h.variableIncome.bufferMonths) || Money.isEntered(h.variableIncome.windowMonths))); }
    if (c === 'cover.hsa') return !!(h && (h.assets || []).some(function (a) { return a.taxCharacter === 'hsa'; })) || !!(h && h.retirement && Money.isEntered(h.retirement.hsaContributedCents));
    if (c === 'asset.invested') return true;
    if (c === 'assets.property.length > 0') return ((h && h.property) || []).length > 0;
    /* A priced home in Housing Decision is the intent to buy. */
    if (c === 'intent.buy') return !!(h && h.housing && Money.isEntered(h.housing.priceCents) && h.housing.priceCents > 0);
    /* No room asks about remote work yet (D-174): the lever waits for a
       fact rather than assuming one. A stored meta.remoteOk would say yes. */
    if (c === 'income.remoteOk') return !!(h && h.meta && h.meta.remoteOk === true);
    return false;
  }
  /** A bare appliesWhen phrase against a household (18.2 shares it). */
  function appliesWhen(text, household) {
    return String(text || 'always').split('||').some(function (c) { return clause(c, household || {}); });
  }
  function applies(id, household) {
    var L = get(id);
    if (!L) return false;
    return appliesWhen(L.appliesWhen, household);
  }

  /* ---- apply: a new household, the moves written onto DAITE paths ------- */
  function scaleSources(h, share) {
    (h.people || []).forEach(function (p) {
      (p.incomeSources || []).forEach(function (s) {
        if (Money.isEntered(s.grossAnnualIncomeCents)) s.grossAnnualIncomeCents = Math.round(s.grossAnnualIncomeCents * (1 + share));
      });
    });
  }
  function scaleBucket(h, key, share) {
    var b = h.expenses && h.expenses.needs && h.expenses.needs[key];
    if (b && Money.isEntered(b.monthlyCents)) b.monthlyCents = Math.max(0, Math.round(b.monthlyCents * (1 + share)));
  }
  function apply(id, household, opts) {
    var L = get(id);
    var scale = opts && Money.isEntered(opts.scale) ? opts.scale : 1;
    var h = Schema.createHousehold(JSON.parse(JSON.stringify(household || {})));
    if (!L) return h;
    Object.keys(L.moves).forEach(function (path) {
      var v = L.moves[path] * scale;
      if (path === 'income.extraMonthlyCents') {
        /* Net extra income, as its own source, tagged so a reader that
           knows levers can treat it as after tax. */
        var you = Schema.primaryPerson(h) || (h.people[0] = Schema.createPerson({ label: 'You', role: 'adult' }));
        you.incomeSources = (you.incomeSources || []).filter(function (s) { return s.lever !== id; });
        you.incomeSources.push(Schema.createIncomeSource({ id: 'lever_' + id, personId: you.id, source: L.label + ' (lever)', type: 'other', grossAnnualIncomeCents: Math.round(v * 12) }));
        you.incomeSources[you.incomeSources.length - 1].lever = id;
        you.incomeSources[you.incomeSources.length - 1].netOfTax = true;
      } else if (path === 'income.grossAnnualCents') {
        scaleSources(h, v);
      } else if (path === 'expenses.needs.*') {
        Schema.FAT_NEEDS.forEach(function (k) { scaleBucket(h, k, v); });
      } else if (path.indexOf('expenses.needs.') === 0) {
        scaleBucket(h, path.slice('expenses.needs.'.length), v);
      }
    });
    h.meta = h.meta || {};
    h.meta.leversApplied = ((household && household.meta && household.meta.leversApplied) || []).concat([{ id: id, scale: scale }]);
    return h;
  }

  /* ---- What a lever is worth, a month, and an hour ----------------------- */
  function monthlyGainCents(id, household) {
    var L = get(id);
    if (!L) return Money.incomplete('No such lever.', ['lever']);
    var h = household || {};
    var total = 0, missing = [];
    Object.keys(L.moves).forEach(function (path) {
      var v = L.moves[path];
      if (path === 'income.extraMonthlyCents') { total += v; return; }
      if (path === 'income.grossAnnualCents') {
        var g = Schema.grossAnnualIncomeCents(h);
        if (!Money.isOk(g)) { missing.push('grossAnnualIncome'); return; }
        total += Math.round(g.value * v / 12); return;
      }
      var fat = Schema.fat(h);
      var keys = path === 'expenses.needs.*' ? Schema.FAT_NEEDS : [path.slice('expenses.needs.'.length)];
      keys.forEach(function (k) {
        var r = fat[k];
        if (!r || !Money.isOk(r)) { missing.push(k + 'Monthly'); return; }
        total += Math.round(-r.value * v);        /* a cut in spending is a gain */
      });
    });
    if (missing.length) return Money.incomplete('This lever needs ' + missing.join(', ') + ' to be priced.', missing);
    return Money.ok(total, { leverId: id });
  }
  /** THE hourly formula: a month's gain over the hours a month it costs.
      Every room that prices a lever an hour comes through here. */
  function hourlyFor(monthlyGainCents, hoursPerWeek) {
    if (!Money.isEntered(hoursPerWeek) || hoursPerWeek <= 0) {
      return Money.incomplete('This costs no hours, so there is no hourly figure.', ['hoursPerWeek']);
    }
    if (!Money.isEntered(monthlyGainCents)) return Money.incomplete('No monthly gain to price.', ['monthlyGainCents']);
    var hoursPerMonth = hoursPerWeek * factor();
    return Money.ok(Math.round(monthlyGainCents / hoursPerMonth), { monthlyGainCents: monthlyGainCents, hoursPerMonth: hoursPerMonth, hoursPerWeek: hoursPerWeek });
  }
  /** opts.monthlyGainCents / opts.hoursPerWeek override the lever's own
      figures — the adventure's steppers move them (D-176). */
  function impliedHourlyCents(id, household, opts) {
    var L = get(id);
    if (!L) return Money.incomplete('No such lever.', ['lever']);
    var o = opts || {};
    var gain = Money.isEntered(o.monthlyGainCents) ? Money.ok(o.monthlyGainCents) : monthlyGainCents(id, household);
    if (!Money.isOk(gain)) return gain;
    var hours = Money.isEntered(o.hoursPerWeek) ? o.hoursPerWeek : L.hoursPerWeek;
    if (!Money.isEntered(hours) || hours <= 0) {
      return Money.incomplete('This lever costs no hours, so there is no hourly figure.', ['hoursPerWeek']);
    }
    return hourlyFor(gain.value, hours);
  }

  return { use: use, get: get, all: all, applies: applies, appliesWhen: appliesWhen, apply: apply, monthlyGainCents: monthlyGainCents, impliedHourlyCents: impliedHourlyCents, hourlyFor: hourlyFor, factor: factor, situationOf: situationOf };
});
