/* ==========================================================================
   engines/exercises.js — the exercise library: every doable unit in one
   shape, five kinds, and the `run` kind computed on the household.
   DECISIONS.md D-131.
   --------------------------------------------------------------------------
     micro   the first fifteen minutes of a skill, zero cost
     quest   an "I don't know" from the quiz turned into a look-up (v6.3)
     dare    the daily and thirty-day loop items (v6.3)
     canon   a named exercise from the FI canon, credited to its source and
             described in our own words — never quoted
     run     a calculation the APP performs on the household through the
             engine that owns it, which the person then judges; it carries a
             result to store and compare later

   An exercise that does not attach to a skill is not in the library.
   Completing one boosts its skill to Open, never to Done (the tree engine
   counts `exercise:<id>` as a met boost for every skill it advances).

   A `run` never renders a number the household has not entered: an unmet
   `requires` keeps it locked and names the field, with the owner room to
   add it in, per the no-silent-zero rule. The rooms' own engines do the
   arithmetic; nothing is re-derived here.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Ownership: require('../shared/ownership.js'), Gate: require('../shared/gate.js'),
             SkillTree: require('./skilltree.js'), Fire: require('./fire.js'), Tier0: require('./tier0.js'), Projection: require('./projection.js'),
             Decumulation: require('./decumulation.js'), Statement: require('./statement.js'), CashFlow: require('./cashflow.js'), Events: require('./events.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Gate: S.Gate, SkillTree: S.SkillTree, Fire: S.Fire, Tier0: S.Tier0, Projection: S.Projection,
             Decumulation: S.Decumulation || null, Statement: S.Statement || null, CashFlow: S.CashFlow, Events: S.Events || null };
  }
  var api = factory(deps);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Exercises = api; }
})(typeof self !== 'undefined' ? self : null, function (D) {
  'use strict';
  var Money = D.Money, Schema = D.Schema, Ownership = D.Ownership, Gate = D.Gate, SkillTree = D.SkillTree;
  var Fire = D.Fire, Tier0 = D.Tier0, Projection = D.Projection, Decumulation = D.Decumulation, Statement = D.Statement, CashFlow = D.CashFlow, Events = D.Events;

  var KINDS = ['micro', 'quest', 'dare', 'canon', 'run'];
  var DEFAULT_MAX_MINUTES = 15;
  var SWR_ROWS = [0.03, 0.035, 0.04, 0.045];            /* the 4 × 5 grid: withdrawal rates … */
  var EXPENSE_COLS = [0.7, 0.85, 1, 1.15, 1.3];          /* … against the month, scaled */
  var MILESTONES = [0.25, 0.5, 0.75, 1];
  var MONTHS = 12;

  function table(T) { var t = T && T.exercises; if (!t || !t.exercises) throw new Error('The exercise library (data/exercises.json) is not loaded.'); return t; }
  function all(T) { return table(T).exercises; }
  function byId(T, id) { return all(T).filter(function (e) { return e.id === id; })[0] || null; }

  /* ---- Who it is for --------------------------------------------------------- */
  function applies(h, ex) {
    var sit = Gate ? Gate.situationOf(h) : null;
    return (ex.appliesWhen || []).every(function (c) {
      if (c.field !== 'situation' || !sit) return true;
      var v = c.value || [];
      return c.op === 'notIn' ? v.indexOf(sit) < 0 : v.indexOf(sit) >= 0;
    });
  }

  /* ---- What a run needs, named ---------------------------------------------- */
  function missingFields(h, ex) {
    return (ex.requires || []).filter(function (id) {
      var f = Ownership && Ownership.field(id);
      if (!f) return false;
      if (f.applies && !f.applies(h || {})) return false;
      var r; try { r = f.read(h || {}); } catch (e) { return true; }
      return !Money.isOk(r);
    }).map(function (id) {
      var f = Ownership.field(id);
      return { id: id, label: f.label, room: f.owner, href: Ownership.linkTo(f.owner, f.anchor), text: 'Needs: ' + f.label + '.' };
    });
  }

  /* ---- The runs ---------------------------------------------------------------- */
  function fireOpts(T, extra) { return Object.assign({}, extra || {}); }
  var RUNS = {
    fireNumber: function (h, T) {
      var r = Fire.calculateFIRE(h, T, fireOpts(T));
      if (!Money.isOk(r)) return r;
      return Money.ok(r.value, { figures: { fireNumberCents: r.value }, summary: Money.formatCents(r.value) + ' is the number: a year of spending divided by the withdrawal rate.' });
    },
    sensitivityGrid: function (h, T) {
      var rows = [];
      for (var i = 0; i < SWR_ROWS.length; i++) {
        var row = [];
        for (var j = 0; j < EXPENSE_COLS.length; j++) {
          var r = Fire.calculateFIRE(h, T, { expenseFactor: EXPENSE_COLS[j], localOverrides: { swrRate: SWR_ROWS[i] } });
          if (!Money.isOk(r)) return r;
          row.push(r.value);
        }
        rows.push(row);
      }
      var base = Fire.calculateFIRE(h, T, {});
      return Money.ok(rows[2][2], { figures: { rows: SWR_ROWS, cols: EXPENSE_COLS, cells: rows, baseCents: Money.isOk(base) ? base.value : null },
        summary: 'From ' + Money.formatCents(rows[0][0]) + ' (3% on 70% of the month) to ' + Money.formatCents(rows[3][4]) + ' (4.5% on 130%). You stand at ' + Money.formatCents(rows[2][2]) + '.' });
    },
    milestones: function (h, T) {
      var p = Tier0.fireProgress(h, T);
      if (!Money.isOk(p)) return p;
      var rates = Tier0.savingsRate(h, T);
      var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
      if (!Money.isOk(basis)) return basis;
      var a = Schema.resolveAssumptions(h);
      var years = MILESTONES.map(function (m) {
        var y = Projection.yearsToTargetCents({ startCents: p.investmentsCents, targetCents: Math.round(p.fireNumberCents * m), annualRate: a.expectedReturnRate, annualContributionCents: basis.annualSavingsCents });
        return { share: m, years: Money.isOk(y) ? y.value : null, reached: p.investmentsCents >= p.fireNumberCents * m };
      });
      return Money.ok(years[3].years, { figures: { milestones: years, fireNumberCents: p.fireNumberCents, investmentsCents: p.investmentsCents },
        summary: years.map(function (m) { return Math.round(m.share * 100) + '%: ' + (m.reached ? 'reached' : m.years === null ? 'never at this pace' : Math.round(m.years * 10) / 10 + ' years'); }).join(' · ') });
    },
    savingsRateBothWays: function (h, T) {
      var rates = Tier0.savingsRate(h, T);
      var ex = rates.excludingMatch, inc = rates.includingMatch;
      if (!Money.isOk(ex)) return ex;
      var contributed = CashFlow && CashFlow.savingsRateContributed ? CashFlow.savingsRateContributed(h, T) : null;
      return Money.ok(ex.value, { figures: { residual: ex.value, withMatch: Money.isOk(inc) ? inc.value : null, contributed: contributed && Money.isOk(contributed) ? contributed.value : null },
        summary: 'Residual: ' + Money.formatRate(ex.value, { decimals: 0 }) + (Money.isOk(inc) ? ' · with the match: ' + Money.formatRate(inc.value, { decimals: 0 }) : '') + (contributed && Money.isOk(contributed) ? ' · counted as contributed: ' + Money.formatRate(contributed.value, { decimals: 0 }) : ' · the contributed figure needs your 401(k) percentage.') });
    },
    withdrawalVsVpw: function (h, T) {
      if (!Decumulation) return Money.incomplete('The decumulation engine is not loaded.', ['decumulation']);
      var p = Decumulation.plan(h, T, {});
      if (!Money.isOk(p)) return p;
      return Money.ok(p.value, { figures: { yearsUntilEmpty: p.yearsUntilEmpty, lastsToAge: p.lastsToAge, drawCents: p.drawCents, never: p.never },
        summary: p.never ? 'At this draw the money never runs out.' : 'At ' + Money.formatCents(p.drawCents) + ' a year it lasts ' + Math.round(p.value) + ' years' + (p.lastsToAge ? ', to age ' + Math.round(p.lastsToAge) : '') + '.' });
    },
    bridge: function (h, T) {
      if (!Statement) return Money.incomplete('The statement engine is not loaded.', ['statement']);
      var b = Statement.bridgeGap(h, T, {});
      if (!Money.isOk(b)) return b;
      return Money.ok(b.value, { figures: { shortCents: b.value, gapYears: b.gapYears, fiAge: b.fiAge, accessAge: b.accessAge },
        summary: b.gapYears > 0 ? Money.formatCents(b.value) + ' short for the ' + b.gapYears + ' years between ' + b.fiAge + ' and ' + b.accessAge + '.' : 'No bridge needed: the access age comes first.' });
    },
    worstYear: function (h, T) {
      if (!Statement) return Money.incomplete('The statement engine is not loaded.', ['statement']);
      var w = Statement.worstPlausibleYear(h, T);
      if (!Money.isOk(w)) return w;
      return Money.ok(w.value, { figures: { uncoveredCents: w.value, costCents: w.costCents, months: w.months },
        summary: 'A worst year costs ' + Money.formatCents(w.costCents) + '; ' + (w.value > 0 ? Money.formatCents(w.value) + ' of it stands uncovered.' : 'the cash covers it.') });
    },
    tripleD: function (h, T, opts) {
      if (!Events) return Money.incomplete('The events engine is not loaded.', ['events']);
      var template = opts && opts.template;
      if (!template) return Money.incomplete('Pick a life event to run three ways.', ['template']);
      var r = Events.runAll(h, template, (opts && opts.given) || {}, { tables: T });
      if (!r || !r.disaster) return Money.incomplete('The event could not be run.', ['template']);
      return Money.ok(0, { figures: r, summary: 'Dream, default and disaster run for ' + (template.title || template.id) + '.' });
    }
  };
  function runFor(key) {
    if (!key) return null;
    if (key.indexOf('fireVariant:') === 0) {
      var vid = key.slice(12);
      return function (h, T) {
        var r = Fire.calculateFIRE(h, T, { variantId: vid });
        if (!Money.isOk(r)) return r;
        return Money.ok(r.value, { figures: { fireNumberCents: r.value, variant: vid }, summary: Money.formatCents(r.value) + ' for ' + vid + '.' });
      };
    }
    return RUNS[key] || null;
  }

  /**
   * compute(h, T, id, opts) — a `run` exercise's figure, or why not. A
   * non-run returns incomplete: there is nothing to compute.
   */
  function compute(h, T, id, opts) {
    var ex = byId(T, id);
    if (!ex) return Money.incomplete('No exercise with that id.', ['id']);
    if (ex.kind !== 'run') return Money.incomplete('Not a run: there is nothing to compute.', []);
    var missing = missingFields(h, ex);
    if (missing.length) return Money.incomplete(missing.map(function (m) { return m.text; }).join(' '), missing.map(function (m) { return m.id; }));
    var fn = runFor(ex.compute);
    if (!fn) return Money.incomplete('This run has no calculation bound to it yet.', ['compute']);
    return fn(h, T, opts);
  }

  /**
   * list(h, T, opts) — the library as it applies to this household.
   *   opts.kind          one of KINDS, or null for all
   *   opts.maxMinutes    default 15; null for no cap
   *   opts.snapshots     for the tree engine
   * Each row: the exercise plus done (ISO | null), locked (a run whose
   * requires are unmet), reasons [{ text, href }], skill { id, name, state },
   * result (what a done run computed), band order for sorting.
   */
  function list(h, T, opts) {
    var o = opts || {};
    var cap = o.maxMinutes === undefined ? DEFAULT_MAX_MINUTES : o.maxMinutes;
    var tree = SkillTree ? SkillTree.evaluate(h, T, { snapshots: o.snapshots, exercises: table(T) }) : null;
    var done = (h && h.exercises && h.exercises.done) || {};
    var results = (h && h.exercises && h.exercises.results) || {};
    var bandOrder = {};
    (tree ? tree.bands : []).forEach(function (b) { bandOrder[b.id] = b.order; });
    var current = tree && tree.currentBand ? bandOrder[tree.currentBand] : 1;
    var rows = all(T).filter(function (ex) { return applies(h, ex); })
      .filter(function (ex) { return !o.kind || ex.kind === o.kind; })
      .filter(function (ex) { return cap === null || !Money.isEntered(ex.minutes) || ex.minutes <= cap; })
      .map(function (ex) {
        var missing = ex.kind === 'run' ? missingFields(h, ex) : [];
        var skillRow = tree ? tree.byId[ex.advances[0]] : null;
        var skillDef = SkillTree ? SkillTree.byId(T, ex.advances[0]) : null;
        var fogged = skillRow && skillRow.state === 'fogged';
        return Object.assign({}, ex, {
          done: done[ex.id] || null, result: results[ex.id] || null,
          locked: missing.length > 0, reasons: missing.map(function (m) { return { text: m.text + ' Add it in ' + (m.room || 'Start Here') + '.', href: m.href }; }),
          skill: skillRow ? { id: skillRow.id, name: fogged ? null : (skillDef && skillDef.name), state: skillRow.state } : null,
          notYours: !skillRow, fogged: !!fogged,
          bandOrder: bandOrder[ex.band] || 99, distance: Math.abs((bandOrder[ex.band] || 99) - current)
        });
      })
      .filter(function (r) { return !r.notYours && !r.fogged; });
    rows.sort(function (a, b) { return (a.distance - b.distance) || (a.bandOrder - b.bandOrder) || ((a.done ? 1 : 0) - (b.done ? 1 : 0)) || (a.minutes - b.minutes) || a.title.localeCompare(b.title); });
    var counts = { all: rows.length, done: rows.filter(function (r) { return r.done; }).length, locked: rows.filter(function (r) { return r.locked; }).length };
    KINDS.forEach(function (k) { counts[k] = rows.filter(function (r) { return r.kind === k; }).length; });
    return Money.ok(counts.done, { rows: rows, counts: counts, currentBand: tree ? tree.currentBand : null });
  }

  return {
    KINDS: KINDS,
    DEFAULT_MAX_MINUTES: DEFAULT_MAX_MINUTES,
    SWR_ROWS: SWR_ROWS,
    EXPENSE_COLS: EXPENSE_COLS,
    MILESTONES: MILESTONES,
    all: all,
    byId: byId,
    applies: applies,
    missingFields: missingFields,
    compute: compute,
    list: list
  };
});
