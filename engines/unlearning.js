/* ==========================================================================
   engines/unlearning.js — which advice still applies to you, and what you
   have let go of. BRIEF §8, DECISIONS.md D-101.
   --------------------------------------------------------------------------
   Every line in data/unlearning.json names a piece of advice and when it
   applies: a range of FOO steps, a ratio's zone, or both. Against your
   step (engines/foo.js) and your banded ratios (engines/ratios.js) it
   sorts into four columns:

     applies   — your step is inside the range and the ratio is in the zone
     stop      — you are past it (step above the range, or the ratio has
                 left the zone): the thing to stop believing
     notYet    — you are before it (step below the range)
     unknown   — nothing to judge by: no placement, or the ratio does not
                 compute yet

   No model call: each rule is a range and the reasons are the ranges. The
   household remembers which rules it has let go of (household.unlearning
   .dropped, owned by the Unlearning room); a rule let go of while it still
   applies or is not yet due is flagged "let go early" rather than hidden.

   The dashboard's learn/unlearn block (engines/advice.js, D-096) is the
   top line of this ladder — one item, restated for the household's
   numbers. This file is the whole ladder and does not repeat its items.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Foo: require('./foo.js'), Ratios: require('./ratios.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Foo: S.Foo, Ratios: S.Ratios };
  }
  var api = factory(deps.Money, deps.Foo, deps.Ratios);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Unlearning = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Foo, Ratios) {
  'use strict';

  var STATUSES = ['applies', 'stop', 'notYet', 'unknown'];
  var LABELS = { applies: 'still applies', stop: 'stop believing', notYet: 'not yet', unknown: 'unknown' };
  var FIRST_STEP = 0, LAST_STEP = 9;

  /** The ids you have let go of, always a list. */
  function droppedIds(household) {
    var d = household && household.unlearning && household.unlearning.dropped;
    return Array.isArray(d) ? d.filter(function (id) { return typeof id === 'string' && id; }) : [];
  }

  /**
   * Your step, or the range it could be in, and your zone per banded ratio.
   *   step      the exact step when the ladder places you (an unmet step), else null
   *   range     [min, max]: exact → [step, step]; the ladder stopped on a step it
   *             could not judge → [that step, 9] (you are at least there); no
   *             ladder at all → null
   *   zones     { ratioId: 'good' | 'watch' | 'out' } for every ratio with a verdict
   * A rule is judged against the range, so a household the ladder cannot
   * finish still hears "you are past this" where that is certain.
   */
  function standing(household, tables, opts) {
    var foo = Foo.evaluate(household, tables);
    var step = null, range = null;
    if (foo.placement && Money.isEntered(foo.placement.step)) { step = foo.placement.step; range = [step, step]; }
    else if (foo.stoppedAt && foo.stoppedAt.status === 'unknown' && tables && tables.fooRules) {
      /* Stopped on a step it could not judge: you are at least there — but
         only if a step below it was met. Unknown at step 0 is nothing known. */
      var ladder = tables.fooRules.ladder || [];
      for (var i = 0; i < ladder.length; i++) if (ladder[i].key === foo.stoppedAt.key && ladder[i].step > FIRST_STEP) { range = [ladder[i].step, LAST_STEP]; break; }
    }
    else if (foo.stoppedAt && foo.stoppedAt.status === 'met') { step = LAST_STEP; range = [LAST_STEP, LAST_STEP]; }
    var zones = {};
    var all = Ratios.all(household, tables, opts || {});
    all.rows.forEach(function (r) { if (r.ok && r.verdict && r.verdict.zone && r.verdict.zone !== 'none') zones[r.id] = r.verdict.zone; });
    return { step: step, range: range, zones: zones, fooStatus: foo.status, fooReason: foo.reason || null };
  }

  function stepWord(steps) { return steps[0] === steps[1] ? 'step ' + steps[0] : 'steps ' + steps[0] + '–' + steps[1]; }
  function whereWord(st) { return st.step !== null ? 'step ' + st.step : 'at least step ' + st.range[0]; }

  /** One rule against a standing. Pure: the same rule and standing always sort the same way. */
  function judge(rule, st, dropped) {
    var byStep = null, byRatio = null, why = [];
    if (rule.steps) {
      if (!st.range) { byStep = 'unknown'; why.push('the ladder has not placed you yet'); }
      else if (rule.steps[1] < st.range[0]) { byStep = 'stop'; why.push(whereWord(st) + ' is past ' + stepWord(rule.steps)); }
      else if (rule.steps[0] > st.range[1]) { byStep = 'notYet'; why.push('you are on ' + whereWord(st) + '; this is for ' + stepWord(rule.steps)); }
      else if (rule.steps[0] <= st.range[0] && rule.steps[1] >= st.range[1]) { byStep = 'applies'; why.push(whereWord(st) + ' is inside ' + stepWord(rule.steps)); }
      else { byStep = 'unknown'; why.push('you are somewhere from step ' + st.range[0] + ' to ' + st.range[1] + '; this is for ' + stepWord(rule.steps)); }
    }
    if (rule.ratio) {
      var zone = st.zones[rule.ratio.id];
      if (zone === undefined) { byRatio = 'unknown'; why.push(rule.ratio.id + ' has no verdict yet'); }
      else if (rule.ratio.zones.indexOf(zone) >= 0) { byRatio = 'applies'; why.push(rule.ratio.id + ' is ' + zone); }
      else { byRatio = 'stop'; why.push(rule.ratio.id + ' is ' + zone + ', not ' + rule.ratio.zones.join(' or ')); }
    }
    var status;
    if (rule.steps && rule.ratio) {
      /* Both must hold: a step outside the range decides; otherwise the ratio. */
      status = byStep === 'notYet' ? 'notYet' : byStep === 'stop' ? 'stop' : byStep === 'unknown' || byRatio === 'unknown' ? 'unknown' : byRatio;
    } else {
      status = byStep || byRatio || 'unknown';
    }
    var isDropped = (dropped || []).indexOf(rule.id) >= 0;
    return {
      id: rule.id, advice: rule.advice, source: rule.source, note: rule.note || null,
      steps: rule.steps || null, ratio: rule.ratio || null,
      amountCents: Money.isEntered(rule.amountCents) ? rule.amountCents : null,
      months: Money.isEntered(rule.months) ? rule.months : null,
      status: status, statusLabel: LABELS[status],
      why: why.join('; ') || 'nothing to judge by yet',
      dropped: isDropped,
      letGoEarly: isDropped && (status === 'applies' || status === 'notYet')
    };
  }

  /**
   * Every rule sorted, with the counts. The value is the number of rules
   * that no longer apply — marked stop believing and not yet let go of.
   * Incomplete (with the rows still attached, so a chart can draw the
   * empty columns) when nothing at all can be judged.
   */
  function classify(household, tables, opts) {
    var table = tables && tables.unlearning;
    if (!table || !Array.isArray(table.rules)) return Money.incomplete('The unlearning table is not loaded.', ['unlearning']);
    var h = household || {};
    var st = standing(h, tables, opts);
    var dropped = droppedIds(h);
    var rows = table.rules.map(function (r) { return judge(r, st, dropped); });
    var columns = {};
    STATUSES.forEach(function (s) { columns[s] = rows.filter(function (r) { return r.status === s; }); });
    var droppedRows = rows.filter(function (r) { return r.dropped; });
    var toDrop = columns.stop.filter(function (r) { return !r.dropped; });
    var letGoEarly = rows.filter(function (r) { return r.letGoEarly; });
    var counts = {
      total: rows.length, applies: columns.applies.length, stop: columns.stop.length, notYet: columns.notYet.length, unknown: columns.unknown.length,
      dropped: droppedRows.length, stopDropped: columns.stop.filter(function (r) { return r.dropped; }).length, toDrop: toDrop.length, letGoEarly: letGoEarly.length
    };
    var extra = {
      rows: rows, columns: columns, counts: counts, dropped: droppedRows, toDrop: toDrop, letGoEarly: letGoEarly,
      next: toDrop[0] || null, step: st.step, range: st.range, zones: st.zones,
      zone: toDrop.length === 0 ? 'good' : 'watch', referenceVersion: table.version || null
    };
    if (counts.unknown === rows.length) {
      var r = Money.incomplete('Nothing to sort by yet: the ladder has not placed you and no ratio has a verdict. A month’s spending and your cash are where it starts.', ['monthlyExpenses', 'cashSavings']);
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
      return r;
    }
    return Money.ok(toDrop.length, extra);
  }

  /**
   * What the stop-believing rules are about, in cents, for the lens: a rule
   * with amountCents is that amount; a rule about N months is N months of
   * the household's spending when a month is known. Rules about neither
   * carry nothing, and an empty list is the honest answer.
   */
  function amounts(classified, monthlyExpensesCents) {
    if (!classified || !classified.columns) return [];
    var out = [];
    classified.columns.stop.forEach(function (r) {
      if (r.amountCents !== null) out.push({ id: r.id, label: r.advice, cents: r.amountCents });
      else if (r.months !== null && Money.isEntered(monthlyExpensesCents) && monthlyExpensesCents > 0) out.push({ id: r.id, label: r.advice + ' (' + r.months + ' × a month of spending)', cents: Math.round(r.months * monthlyExpensesCents) });
    });
    return out;
  }

  /** The list with one id added or removed; never a duplicate, never a blank. */
  function toggle(dropped, id, letGo) {
    var list = (dropped || []).filter(function (x) { return typeof x === 'string' && x && x !== id; });
    if (letGo && typeof id === 'string' && id) list.push(id);
    return list;
  }

  return { STATUSES: STATUSES, LABELS: LABELS, FIRST_STEP: FIRST_STEP, LAST_STEP: LAST_STEP, droppedIds: droppedIds, standing: standing, judge: judge, classify: classify, amounts: amounts, toggle: toggle };
});
