/* ==========================================================================
   shared/blocks.js — a block: a hypothetical laid on the real household.
   --------------------------------------------------------------------------
   A block (a home, a car, a kid, a job change, a sabbatical, a move, a side
   hustle, an inheritance, a marriage) is four answers at most and the DAITE
   lines those answers produce, read from data/blocks/<type>.json. It never
   dissolves into household facts: it lives in the scenarios store beside
   the household (shared/scenarios.js) and reaches a room only through
   Spine.householdAt(date, { blocks }), which lays every active block whose
   dates cover the date onto a COPY of the household. DECISIONS.md D-178.

     use(tables)                         hand it the loaded reference tables
     questions(type)                     the block type's questions
     expand(type, answers, household)    the lines, evaluated; each keeps its
                                         first figure as `estimate`
     build(type, answers, household, opts)  a block ready for addBlock
     monthKey(date)                      'YYYY-MM'
     windowsAt(block, blocks)            the block's dates, cut where another
                                         block `replaces` it
     covers(block, date, blocks)         is a window of this block open on date?
     apply(household, block, date)       one block onto a copy of the household
     applyAll(household, blocks, date)   every active block that covers the date
   No expansion logic in a room; no interaction rules between blocks beyond
   addition and `replaces` (D-180 is the hook for more).
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node
    ? { Money: require('./money.js'), Schema: require('./schema.js'), Expr: require('./expr.js'), Projection: require('../engines/projection.js') }
    : { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Expr: root.SLAF && root.SLAF.Expr, Projection: root.SLAF && root.SLAF.Projection };
  var api = factory(deps.Money, deps.Schema, deps.Expr, deps.Projection);
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Blocks = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Expr, Projection) {
  'use strict';

  var MONTHS = 12;
  var TABLE_KEYS = { home: 'blockHome', car: 'blockCar', kid: 'blockKid', jobchange: 'blockJobchange', sabbatical: 'blockSabbatical',
    geo: 'blockGeo', hustle: 'blockHustle', inheritance: 'blockInheritance', marriage: 'blockMarriage' };
  var FILES = { home: 'home', car: 'car', kid: 'kid', jobchange: 'jobchange', sabbatical: 'sabbatical', geo: 'geo', hustle: 'hustle', inheritance: 'inheritance', marriage: 'marriage' };
  var TABLES = null;

  function use(tables) { TABLES = tables || TABLES; return TABLES; }
  function tables() {
    if (TABLES) return TABLES;
    if (typeof module === 'object' && module.exports) {
      /* Tests and node: read every table the expansions name straight from data/. */
      var fs = require('fs'), path = require('path');
      var R = require('./reference.js');
      var out = {};
      Object.keys(R.TABLE_FILES).forEach(function (k) {
        try { out[k] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', R.TABLE_FILES[k]), 'utf8')); } catch (e) { /* a dnd-side table */ }
      });
      TABLES = out;
    }
    return TABLES || {};
  }
  function table(type) { return tables()[TABLE_KEYS[type]] || null; }
  function types() { return Object.keys(TABLE_KEYS); }
  function questions(type) { var t = table(type); return t ? (t.questions || []).slice() : []; }

  /* ---- The household figures an expansion may read ($name) --------------- */
  function context(household) {
    var h = household || {};
    var fat = Schema.fat(h);
    var gross = Schema.grossAnnualIncomeCents(h);
    var rent = Schema.rentMonthlyCents ? Schema.rentMonthlyCents(h) : null;
    var cash = Schema.cashCents(h);
    return {
      grossAnnualCents: Money.isOk(gross) ? gross.value : null,
      rentMonthlyCents: rent && Money.isEntered(rent.cents) ? rent.cents : (Money.isOk(fat.accommodation) ? fat.accommodation.value : null),
      accommodationMonthlyCents: Money.isOk(fat.accommodation) ? fat.accommodation.value : null,
      transportationMonthlyCents: Money.isOk(fat.transportation) ? fat.transportation.value : null,
      foodMonthlyCents: Money.isOk(fat.food) ? fat.food.value : null,
      cashCents: Money.isOk(cash) ? cash.value : null,
      state: h.state || null
    };
  }
  function fn(name, rawArgs, env) {
    var args = {};
    var missing = false;
    Object.keys(rawArgs).forEach(function (k) { var v = Expr.evaluate(rawArgs[k], env); if (v === null) missing = true; args[k] = v; });
    if (missing) return null;
    if (name === 'levelPayment') {
      var r = Projection.levelPaymentCents({ principalCents: args.principalCents, annualRate: args.annualRate, months: args.months });
      return Money.isOk(r) ? r.value : null;
    }
    return null;
  }
  function env(answers, household) {
    return { answers: answers || {}, ctx: context(household), lines: {}, tables: tables(), household: household, fn: fn };
  }
  function evalExtra(extra, e) {
    if (!extra) return null;
    var out = {};
    Object.keys(extra).forEach(function (k) { out[k] = Expr.evaluate(extra[k], e); });
    return out;
  }

  /**
   * The lines a type produces for these answers, each with the figure it
   * arrived at, its source (national · state · user), its confidence, and
   * `estimate` - the same figure, kept forever once a person overwrites
   * `delta`. A line whose `when` does not hold is left out; a line whose
   * figure cannot be worked out is kept with delta null and says why.
   */
  function expand(type, answers, household) {
    var t = table(type);
    if (!t) return Money.incomplete('No expansion table for block type "' + type + '".', ['blocks/' + (FILES[type] || type) + '.json']);
    var e = env(answers, household);
    var out = [];
    (t.lines || []).forEach(function (spec) {
      if (spec.when !== undefined) {
        var ok = Expr.evaluate(spec.when, e);
        if (!ok) return;
      }
      var raw = spec.delta === null || spec.delta === undefined ? null : Expr.evaluate(spec.delta, e);
      /* A cents figure is rounded; a share (a path ending in '*') is kept
         to four places, since a 3% move must not round to nothing. */
      var isShare = /\*$/.test(spec.path);
      var delta = raw === null ? null : (isShare ? Math.round(raw * 10000) / 10000 : Math.round(raw));
      var source = spec.source || 'national';
      if (spec.stateSource) {
        var st = Expr.evaluate(spec.stateSource, e);
        source = st === null || st === undefined ? 'national' : 'state';
      }
      var extra = evalExtra(spec.extra, e);
      out.push({
        id: spec.id, label: spec.label, path: spec.path, kind: spec.kind,
        delta: delta, estimate: delta,
        source: source, confidence: spec.confidence || t.confidence || 'convention',
        note: spec.note || '',
        extra: extra,
        reason: delta === null && spec.delta !== null ? 'Not enough entered to work this line out yet.' : null
      });
    });
    return Money.ok(out, { type: type, version: t.version, source: t.source, confidence: t.confidence });
  }

  /** A block ready for Scenarios.addBlock: type, answers, dates, lines. */
  function build(type, answers, household, opts) {
    var o = opts || {};
    var t = table(type);
    var lines = expand(type, answers, household);
    if (!Money.isOk(lines)) return lines;
    var a = answers || {};
    var start = a.when ? monthKey(a.when) : (o.start ? monthKey(o.start) : null);
    var end = null;
    if (t && t.endsAfterMonths !== undefined && start) {
      var months = Expr.evaluate(t.endsAfterMonths, env(a, household));
      if (Money.isEntered(months) && months > 0) end = addMonths(start, Math.round(months));
    }
    var note = null;
    if (type === 'marriage' && a.combine === false) note = 'Not combining finances: nothing moves in your numbers.';
    return Money.ok({
      type: type, label: o.label || null, status: o.status || 'considering', active: o.active !== false,
      dates: start ? [{ start: start, end: end }] : [],
      replaces: o.replaces || null, answers: JSON.parse(JSON.stringify(a)), lines: lines.value, note: note
    });
  }

  /* ---- Dates: 'YYYY-MM' ------------------------------------------------- */
  function monthKey(d) {
    if (d === null || d === undefined) return null;
    if (d instanceof Date) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var s = String(d);
    var m = /^(\d{4})-(\d{2})/.exec(s);
    return m ? m[1] + '-' + m[2] : null;
  }
  function addMonths(key, n) {
    var m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return null;
    var total = parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) - 1) + n;
    return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0');
  }
  function minKey(a, b) { if (!a) return b; if (!b) return a; return a < b ? a : b; }

  /**
   * The block's windows, cut where a later block replaces it: a 2030 car
   * replacing the 2027 car ends the old block's lines on the new block's
   * start. More than one date on a block is more than one window.
   */
  function windowsAt(block, blocks) {
    var cut = null;
    (blocks || []).forEach(function (b) {
      if (b.id !== block.id && b.replaces === block.id && b.active !== false) {
        (b.dates || []).forEach(function (d) { if (d.start) cut = minKey(cut, d.start); });
      }
    });
    return (block.dates || []).filter(function (d) { return d.start; }).map(function (d) {
      var end = d.end || null;
      if (cut && (!end || cut < end)) end = cut;
      return { start: d.start, end: end, cutBy: cut && end === cut ? cut : null };
    }).filter(function (w) { return !w.end || w.end > w.start; });
  }
  function covers(block, date, blocks) {
    var key = monthKey(date);
    if (!key) return false;
    return windowsAt(block, blocks).some(function (w) { return w.start <= key && (!w.end || key < w.end); });
  }
  function started(block, date, blocks) {
    var key = monthKey(date);
    if (!key) return false;
    return windowsAt(block, blocks).some(function (w) { return w.start <= key; });
  }

  /* ---- Applying lines to a copy of the household ------------------------ */
  function cents(v) { return Money.isEntered(v) ? v : 0; }
  function addBucket(h, key, delta) {
    h.expenses = h.expenses || {};
    h.expenses.needs = h.expenses.needs || {};
    var b = h.expenses.needs[key] = h.expenses.needs[key] || { monthlyCents: null };
    /* A blank line takes the delta as its whole: the block is the only
       thing on it, and the reader sees that from `applied`. */
    b.monthlyCents = Math.max(0, cents(b.monthlyCents) + delta);
  }
  function primaryIncomeSource(h) {
    var you = Schema.primaryPerson(h);
    if (!you) { you = Schema.createPerson({ label: 'You', role: 'adult' }); h.people = (h.people || []).concat([you]); }
    you.incomeSources = you.incomeSources || [];
    var best = null;
    you.incomeSources.forEach(function (s) { if (!best || cents(s.grossAnnualIncomeCents) > cents(best.grossAnnualIncomeCents)) best = s; });
    if (!best) { best = Schema.createIncomeSource({ personId: you.id, source: 'Pay', grossAnnualIncomeCents: null }); you.incomeSources.push(best); }
    return { person: you, source: best };
  }
  function firstAsset(h, category) {
    return (h.assets || []).filter(function (a) { return a.category === category; })[0] || null;
  }

  function applyLine(h, line, block) {
    var p = line.path;
    var d = line.delta;
    var extra = line.extra || {};
    var tag = block.label + ' (block)';
    if (p === 'taxes.state') { if (extra.state) h.state = extra.state; return; }
    if (d === null || d === undefined) return;
    var monthly = line.kind === 'annual' ? Math.round(d / MONTHS) : d;

    if (p.indexOf('expenses.needs.') === 0) {
      var key = p.slice('expenses.needs.'.length);
      if (key === '*') {
        /* A share on every needs line (a move): delta is a share, not cents. */
        var share = d;
        Schema.FAT_NEEDS.forEach(function (k) {
          var line2 = Schema.fat(h)[k];
          if (Money.isOk(line2)) addBucket(h, k, Math.round(line2.value * share));
        });
        return;
      }
      addBucket(h, key, monthly); return;
    }
    if (p === 'expenses.wants') { h.expenses.wants = h.expenses.wants || { totalCents: null, therapy: null }; h.expenses.wants.totalCents = Math.max(0, cents(h.expenses.wants.totalCents) + monthly); return; }
    if (p === 'expenses.applied' || p === 'expenses') {
      h.expenses = h.expenses || {};
      h.expenses.applied = h.expenses.applied || [];
      h.expenses.applied.push({ label: line.label, monthlyCents: monthly, blockId: block.id, blockLabel: block.label, source: line.source });
      return;
    }
    if (p === 'income.grossAnnualCents') {
      var ps = primaryIncomeSource(h);
      var annual = line.kind === 'monthly' ? d * MONTHS : d;
      ps.source.grossAnnualIncomeCents = Math.max(0, cents(ps.source.grossAnnualIncomeCents) + annual);
      return;
    }
    if (p === 'income.netMonthlyCents' || p === 'income.extraMonthlyCents') {
      var ps2 = primaryIncomeSource(h);
      var src = Schema.createIncomeSource({ id: 'block_' + block.id + '_' + (line.id || 'net'), personId: ps2.person.id, source: line.label + ' - ' + tag, type: 'other', grossAnnualIncomeCents: Math.round(monthly * MONTHS) });
      src.netOfTax = true; src.block = block.id;
      ps2.person.incomeSources.push(src);
      return;
    }
    if (p === 'debt.items') {
      h.debts = h.debts || [];
      var debt = Schema.createDebt({ id: 'block_' + block.id + '_' + (line.id || 'debt'), label: line.label + ' - ' + tag, balanceCents: Math.max(0, d), rate: Money.isEntered(extra.rate) ? extra.rate : null, minPaymentCents: Money.isEntered(extra.minPaymentCents) ? extra.minPaymentCents : null, type: extra.type || 'other' });
      debt.block = block.id;
      h.debts.push(debt);
      if (h.meta && h.meta.hasDebt === false) h.meta.hasDebt = true;
      return;
    }
    if (p === 'assets.cashCents') {
      var cashAsset = firstAsset(h, 'cash');
      if (!cashAsset) { cashAsset = Schema.createAsset({ id: 'block_' + block.id + '_cash', label: 'Cash - ' + tag, category: 'cash', valueCents: 0, liquid: true }); h.assets = (h.assets || []).concat([cashAsset]); }
      cashAsset.valueCents = cents(cashAsset.valueCents) + d;         /* can go below zero: the planner shows it */
      return;
    }
    if (p === 'assets.invested') {
      var inv = Schema.createAsset({ id: 'block_' + block.id + '_' + (line.id || 'invested'), label: line.label + ' - ' + tag, category: extra.category || 'investment', valueCents: d, taxCharacter: extra.taxCharacter || 'taxable' });
      inv.block = block.id; h.assets = (h.assets || []).concat([inv]); return;
    }
    if (p === 'assets.property' || p === 'assets.vehicles') {
      var thing = Schema.createAsset({ id: 'block_' + block.id + '_' + (line.id || 'thing'), label: line.label + ' - ' + tag, category: extra.category || (p === 'assets.vehicles' ? 'vehicle' : 'real_estate'), valueCents: d });
      thing.block = block.id; h.assets = (h.assets || []).concat([thing]); return;
    }
    /* A family path this file does not know how to lay on: recorded, not
       silently dropped, so the planner can list it. */
    h.meta = h.meta || {};
    h.meta.unappliedBlockLines = (h.meta.unappliedBlockLines || []).concat([{ blockId: block.id, path: p, delta: d }]);
  }

  /** One block onto a COPY of the household, for a date: monthly and annual
      lines while a window is open, one-offs once a window has started. */
  function apply(household, block, date, blocks) {
    var h = JSON.parse(JSON.stringify(household || {}));
    if (!block || block.active === false) return h;
    var open = covers(block, date, blocks || [block]);
    var begun = started(block, date, blocks || [block]);
    (block.lines || []).forEach(function (line) {
      if (line.kind === 'oneoff' ? begun : open) applyLine(h, line, block);
    });
    h.meta = h.meta || {};
    h.meta.blocksApplied = (h.meta.blocksApplied || []).concat(open || begun ? [{ id: block.id, label: block.label, type: block.type, open: open }] : []);
    return h;
  }
  /** Every active block that touches the date, additively, in store order. */
  function applyAll(household, blocks, date) {
    var list = (blocks || []).filter(function (b) { return b && b.active !== false; });
    var h = JSON.parse(JSON.stringify(household || {}));
    list.forEach(function (b) { h = apply(h, b, date, list); });
    h.meta = h.meta || {};
    h.meta.blocksAt = monthKey(date);
    h.meta.blocksApplied = h.meta.blocksApplied || [];
    return h;
  }

  return { use: use, TABLE_KEYS: TABLE_KEYS, types: types, table: table, questions: questions, context: context,
    expand: expand, build: build, monthKey: monthKey, addMonths: addMonths, windowsAt: windowsAt, covers: covers,
    apply: apply, applyAll: applyAll };
});
