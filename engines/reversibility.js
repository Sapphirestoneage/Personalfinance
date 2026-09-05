/* ==========================================================================
   engines/reversibility.js — what a decision costs to undo, and how long.
   BRIEF §8 "Reversibility", DECISIONS.md D-101.
   --------------------------------------------------------------------------
   data/reversibility.json lists decisions, each with a formula for the cost
   of undoing it and the months it takes, written in the life-events
   expression language (engines/events.js) over the household context
   ("$monthlyExpensesCents"), the reference tables ({"table": ..}) and the
   room's own answers ("@price"). This file evaluates the formula — never a
   second copy of the arithmetic — and reads the verdict off the result:

     a door             ≤ a month of spending AND ≤ a month to undo
     a one-way street   > six months of spending OR > a year to undo,
                        or anything the table marks reversible: false
     a heavy door       everything between

   A decision the table cannot price (undoCents null) says so; nothing here
   pretends to put a figure on a child or a marriage.

     list(T)                          the decisions
     byId(T, id)                      one of them
     slots(decision)                  its questions split by unit: money
                                      first, then choice, then number
     answers(decision, given, h, T)   { answers, defaulted } — what was
                                      given, else the question's default
     verdict(cents, months, spend, r) 'a door' | 'a heavy door' |
                                      'a one-way street' | null
     undo(h, id, given, T)            the Result the room renders
     describe(expr)                   a formula as readable text
     references(decision)             every table figure a formula reads
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Events: require('./events.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Events: S.Events || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Events);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Reversibility = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Events) {
  'use strict';

  /* The verdict's thresholds, in months of spending and months of time. */
  var DOOR = { spendMonths: 1, months: 1 };
  var ONE_WAY = { spendMonths: 6, months: 12 };
  var VERDICTS = { door: 'a door', heavy: 'a heavy door', oneWay: 'a one-way street' };
  var ZONES = { 'a door': 'good', 'a heavy door': 'watch', 'a one-way street': 'out' };

  function list(tables) { return (tables && tables.reversibility && tables.reversibility.decisions) || []; }
  function byId(tables, id) {
    var l = list(tables);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  /* ---- Questions by the kind of box they need --------------------------------
     The room's boxes are built once and fixed in kind, so a question is
     assigned to a slot by its unit rather than by its position: dollars
     questions to the money boxes, in table order; a question with choices
     to the choice box; anything else to the number boxes. */
  function unitOf(q) {
    if (q && q.choices && q.choices.length) return 'choice';
    if (q && q.unit === 'dollars') return 'money';
    return 'number';
  }
  function slots(decision) {
    var out = { money: [], choice: [], number: [] };
    ((decision && decision.questions) || []).forEach(function (q) { out[unitOf(q)].push(q); });
    return out;
  }

  /* ---- Answers ----------------------------------------------------------------
     What was given, else the question's default evaluated over the context
     (a default may be an expression, "$housingMonthlyCents"). `defaulted`
     names the questions the default answered, so the room can say so. */
  function answers(decision, given, household, tables, context) {
    var out = { answers: {}, defaulted: [] };
    if (!Events || !decision) return out;
    var ctx = context || Events.context(household || Schema.createHousehold({}), tables || {});
    var g = given || {};
    (decision.questions || []).forEach(function (q) {
      var v = g[q.id];
      if (v === undefined || v === null || v === '') {
        v = Events.evaluate(q.default === undefined ? null : q.default, { answers: out.answers, ctx: ctx, tables: tables || {}, household: household });
        if (v !== null && v !== undefined) out.defaulted.push(q.id);
      }
      out.answers[q.id] = v === undefined ? null : v;
    });
    return out;
  }

  /* ---- The verdict --------------------------------------------------------------
     Sized against a month of spending. Unknown months cannot make a door
     (a door needs both legs known and small); unknown spending cannot make
     a verdict at all. A decision the table marks irreversible is a one-way
     street whatever it costs. */
  function verdict(cents, months, spendingCents, reversible) {
    if (reversible === false) return VERDICTS.oneWay;
    if (!Money.isEntered(cents)) return VERDICTS.oneWay;
    if (!Money.isEntered(spendingCents) || spendingCents <= 0) return null;
    var monthsOfSpending = cents / spendingCents;
    if (monthsOfSpending > ONE_WAY.spendMonths || (Money.isEntered(months) && months > ONE_WAY.months)) return VERDICTS.oneWay;
    if (monthsOfSpending <= DOOR.spendMonths && Money.isEntered(months) && months <= DOOR.months) return VERDICTS.door;
    return VERDICTS.heavy;
  }

  /* ---- undo(h, id, given, T) → Result --------------------------------------------
     value: the cost to undo in cents, or null when the table has no honest
     figure (irreversible / unpriced — the extras say which). */
  function undo(household, id, given, tables) {
    var h = household || Schema.createHousehold({});
    if (!id) return Money.incomplete('Pick a decision.', ['reversibilityDecision']);
    var d = byId(tables, id);
    if (!d) return Money.incomplete('No decision called "' + id + '" in the table.', ['reversibilityDecision']);
    var spend = Schema.monthlyExpensesCents(h);
    var spendingCents = Money.isOk(spend) ? spend.value : null;
    var base = { decision: { id: d.id, label: d.label }, reversible: d.reversible, why: d.why, spendingCents: spendingCents,
      answers: {}, defaulted: [], irreversible: d.reversible === false, unpriced: d.undoCents === null };
    if (d.undoCents === null) {
      /* No figure is honest: the child, the marriage. */
      return Money.ok(null, Object.assign(base, { months: null, monthsOfSpending: null, verdict: VERDICTS.oneWay, zone: ZONES[VERDICTS.oneWay] }));
    }
    if (!Events) return Money.incomplete('The events engine is not loaded.', ['events']);
    var ctx = Events.context(h, tables || {});
    var a = answers(d, given, h, tables, ctx);
    var env = { answers: a.answers, ctx: ctx, tables: tables || {}, household: h };
    var cents = Events.evaluate(d.undoCents, env);
    var months = d.undoMonths === null || d.undoMonths === undefined ? null : Events.evaluate(d.undoMonths, env);
    var missing = (d.questions || []).filter(function (q) { return a.answers[q.id] === null || a.answers[q.id] === undefined; });
    if (!Money.isEntered(cents)) {
      if (missing.length) return Money.incomplete('Answer: ' + missing.map(function (q) { return q.ask.toLowerCase(); }).join(', ') + '.', missing.map(function (q) { return q.id; }));
      var needs = formulaNeeds(d, ctx);
      return Money.incomplete(needs.length ? 'Needs ' + needs.join(' and ') + ' to price the undo.' : 'Not enough entered to price the undo.', needs.length ? needs : ['household']);
    }
    cents = Math.round(cents);
    months = Money.isEntered(months) ? Math.round(months * 10) / 10 : null;
    var v = verdict(cents, months, spendingCents, d.reversible);
    return Money.ok(cents, Object.assign(base, {
      answers: a.answers, defaulted: a.defaulted, months: months,
      monthsOfSpending: Money.isEntered(spendingCents) && spendingCents > 0 ? cents / spendingCents : null,
      verdict: v, zone: v === null ? null : ZONES[v],
      verdictReason: v === null ? 'Needs a month of spending to say which kind of decision it is.' : null
    }));
  }

  /* Which household figures a formula reads that the context cannot supply. */
  var CONTEXT_FIELDS = { monthlyExpensesCents: 'monthlyExpenses', cashCents: 'cashSavings', grossAnnualCents: 'grossAnnualIncome', housingMonthlyCents: 'housing a month', takeHomeMonthlyCents: 'grossAnnualIncome' };
  function formulaNeeds(decision, ctx) {
    var out = [];
    walk(decision.undoCents, function (x) {
      if (typeof x === 'string' && x.charAt(0) === '$') {
        var k = x.slice(1);
        if (!Money.isEntered(ctx[k]) && out.indexOf(CONTEXT_FIELDS[k] || k) === -1) out.push(CONTEXT_FIELDS[k] || k);
      }
    });
    return out;
  }
  function walk(x, fn) {
    fn(x);
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(function (y) { walk(y, fn); }); return; }
    if (x.table) { (x.path || []).forEach(function (p) { walk(p, fn); }); return; }
    Object.keys(x).forEach(function (k) { walk(x[k], fn); });
  }

  /* ---- The formula, in words ---------------------------------------------------
     For the assumptions drawer: exactly what the table says, readable. */
  var NAMES = { monthlyExpensesCents: 'a month of spending', housingMonthlyCents: 'housing a month', cashCents: 'cash', grossAnnualCents: 'gross income a year', takeHomeMonthlyCents: 'take-home a month' };
  function describe(x, decision) {
    if (x === null || x === undefined) return 'no figure';
    if (typeof x === 'number') return String(x);
    if (typeof x === 'string') {
      if (x.charAt(0) === '@') {
        var q = ((decision && decision.questions) || []).filter(function (qq) { return qq.id === x.slice(1); })[0];
        return q ? q.ask.toLowerCase() : x.slice(1);
      }
      if (x.charAt(0) === '$') return NAMES[x.slice(1)] || x.slice(1);
      return x;
    }
    if (Array.isArray(x)) return x.map(function (y) { return describe(y, decision); }).join(', ');
    var op = Object.keys(x)[0], args = x[op];
    var parts = Array.isArray(args) ? args.map(function (y) { return describe(y, decision); }) : [describe(args, decision)];
    switch (op) {
      case '*': return parts.join(' × ');
      case '+': return '(' + parts.join(' + ') + ')';
      case '-': return parts.length === 1 ? '−' + parts[0] : '(' + parts.join(' − ') + ')';
      case '/': return parts.join(' ÷ ');
      case 'coalesce': return parts[0] + (parts.length > 1 ? ', else ' + parts.slice(1).join(', else ') : '');
      case 'table': return String(x.table) + '.' + (x.path || []).map(function (p) { return describe(p, decision); }).join('.');
      case 'max': return 'the larger of ' + parts.join(' and ');
      case 'min': return 'the smaller of ' + parts.join(' and ');
      case 'round': return 'round(' + parts[0] + ')';
      case 'cents': return parts[0] + ' in cents';
      default: return op + '(' + parts.join(', ') + ')';
    }
  }

  /* Every table lookup a decision's formulas make: [{ table, path }]. A path
     segment that is an answer ("@distance") stays as written. */
  function references(decision) {
    var out = [];
    [decision && decision.undoCents, decision && decision.undoMonths].forEach(function (expr) {
      walk(expr, function (x) {
        if (x && typeof x === 'object' && !Array.isArray(x) && x.table) {
          var key = x.table + '.' + (x.path || []).join('.');
          if (!out.some(function (r) { return r.key === key; })) out.push({ key: key, table: x.table, path: (x.path || []).slice() });
        }
      });
    });
    return out;
  }

  return {
    DOOR: DOOR, ONE_WAY: ONE_WAY, VERDICTS: VERDICTS, ZONES: ZONES,
    list: list, byId: byId, unitOf: unitOf, slots: slots,
    answers: answers, verdict: verdict, undo: undo,
    describe: describe, references: references
  };
});
