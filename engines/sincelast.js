/* ==========================================================================
   engines/sincelast.js — earned vs learned. DECISIONS.md D-211 (H2).
   --------------------------------------------------------------------------
   Comparing now to the last snapshot, every change is one of two kinds:

     earned    money that moved: a moving row (moves: true) updated with a
               later as-of date; a balance paid down, a market change
     learned   knowledge added: a first entry, a confidence upgrade from
               suggested, rough or memory to confirmed, or a fixed fact
               corrected (a fixed row is not money moving)

   The two are never mixed into one number without the split. The strip:
   "Net worth +$2,100: $700 earned, $1,400 learned (you entered your Roth
   basis)." Net worth's split uses its own terms: cash, investments, other
   assets add, total owed subtracts; the earned part is the sum of the
   earned changes of those terms, learned is the rest of the move.

     SinceLast.compute(h, snapshot, tables) → { since, changes, netWorth, strip }
     SinceLast.strip(h, snapshot, tables)   → the one sentence, or null
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Ownership: require('../shared/ownership.js'), LedgerRows: require('../shared/ledger-rows.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Ownership: root.SLAF && root.SLAF.Ownership, LedgerRows: root.SLAF && root.SLAF.LedgerRows };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.LedgerRows);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.SinceLast = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, LedgerRows) {
  'use strict';
  var NW_TERMS = { cashSavings: 1, investments: 1, otherAssets: 1, totalDebt: -1 };
  var BELOW_SURE = { roughly: true, unsure: true, unknown: true };
  function isNum(v) { return typeof v === 'number' && !isNaN(v); }
  function entered(v) { return v !== null && v !== undefined; }
  function readNow(h, id) {
    var f = Ownership.FIELDS[id];
    if (!f) return null;
    var r = f.read(h);
    return Money.isOk(r) ? r.value : null;
  }
  function compute(household, snapshot, tables) {
    var h = household || {};
    if (!snapshot || !snapshot.fields) return null;
    var before = snapshot.fields, metaBefore = snapshot.fieldMeta || {};
    var since = snapshot.timestamp;
    var changes = [];
    Object.keys(Ownership.FIELDS).forEach(function (id) {
      var row = LedgerRows.byId(id);
      /* Facts only: a computed row is read through its terms below, and a
         one-line-per-item row through the aggregate it feeds. */
      if (!row || row.kind === 'computed' || row.repeat || /^prefs\./.test(row.path || '')) return;
      var was = Object.prototype.hasOwnProperty.call(before, id) ? before[id] : undefined;
      var now = readNow(h, id);
      var mb = metaBefore[id] || null;
      var mn = Schema.meta(h, id);
      var wasEntered = entered(was), nowEntered = entered(now);
      var valueChanged = JSON.stringify(was === undefined ? null : was) !== JSON.stringify(now === undefined ? null : now);
      var confidenceUp = wasEntered && nowEntered && !valueChanged && mb && BELOW_SURE[mb.confidence] && mn.confidence === 'sure';
      var sourceUp = wasEntered && nowEntered && !valueChanged && mb && (mb.source === 'suggested' || mb.source === 'memory') && mn.source !== mb.source && mn.confidence === 'sure';
      if (!valueChanged && !confidenceUp && !sourceUp) return;
      var kind, note;
      if (!wasEntered && nowEntered) { kind = 'learned'; note = 'you entered ' + row.label.toLowerCase(); }
      else if (!valueChanged) { kind = 'learned'; note = 'you confirmed ' + row.label.toLowerCase(); }
      else if (!nowEntered) { kind = 'learned'; note = 'you cleared ' + row.label.toLowerCase(); }
      else if (row.moves && mn.asOf && since && mn.asOf > since) { kind = 'earned'; note = row.label.toLowerCase() + ' moved'; }
      else if (row.moves) { kind = 'earned'; note = row.label.toLowerCase() + ' changed'; }
      else { kind = 'learned'; note = 'you corrected ' + row.label.toLowerCase(); }
      var delta = isNum(was) && isNum(now) ? now - was : (isNum(now) && !wasEntered ? now : null);
      changes.push({ id: id, label: row.label, kind: kind, before: was === undefined ? null : was, after: now, delta: delta, note: note, unit: row.unit });
    });
    /* Net worth, split by its own terms. */
    var nwBefore = isNum(before.netWorth) ? before.netWorth : null;
    var nwNow = readNow(h, 'netWorth');
    var nw = null;
    if (isNum(nwBefore) && isNum(nwNow)) {
      /* Each term on its own: a term that was already there and moved is
         earned (they are all balances, which move); a term entered for
         the first time is learned. Learned is the rest of the move, so the
         two always add up to the whole. */
      var earned = 0, learnedLines = [];
      Object.keys(NW_TERMS).forEach(function (id) {
        var was = before[id], now = readNow(h, id);
        if (!isNum(now) && !isNum(was)) return;
        var d = (isNum(now) ? now : 0) - (isNum(was) ? was : 0);
        if (d === 0) return;
        var row = LedgerRows.byId(id);
        if (isNum(was)) earned += NW_TERMS[id] * d;
        else learnedLines.push('you entered ' + (row ? row.label.toLowerCase() : id));
      });
      var delta = nwNow - nwBefore;
      var learned = delta - earned;
      /* A new account, thing or debt by name, when the snapshot kept the
         items (Instruments.snapshot does); otherwise the plain phrase. */
      if (learned !== 0 && !learnedLines.length) {
        var raw = snapshot.rawInputs || null;
        if (raw) {
          var had = {};
          (raw.assets || []).concat(raw.debts || []).forEach(function (x) { if (x && x.id) had[x.id] = true; });
          (h.assets || []).concat(h.debts || []).forEach(function (x) { if (x && x.id && !had[x.id]) learnedLines.push('you entered ' + (x.label || x.type || 'a new line')); });
        }
        if (!learnedLines.length) learnedLines.push('a first entry among what you own or owe');
      }
      nw = { before: nwBefore, after: nwNow, delta: delta, earned: earned, learned: learned, learnedLines: learnedLines };
    }
    return { since: since, changes: changes, netWorth: nw, earned: changes.filter(function (c) { return c.kind === 'earned'; }), learned: changes.filter(function (c) { return c.kind === 'learned'; }) };
  }
  function signed(c) { return (c < 0 ? '−' : '+') + Money.formatCents(Math.abs(c)); }
  function strip(household, snapshot, tables) {
    var r = compute(household, snapshot, tables);
    if (!r) return null;
    var day = r.since ? String(r.since).slice(0, 10) : '';
    if (r.netWorth && r.netWorth.delta !== 0) {
      var nw = r.netWorth;
      var learnedNote = nw.learned !== 0 && nw.learnedLines.length ? ' (' + nw.learnedLines.slice(0, 2).join('; ') + ')' : '';
      var also = r.learned.filter(function (c) { return !NW_TERMS[c.id]; });
      return 'Net worth ' + signed(nw.delta) + ' since ' + day + ': ' + Money.formatCents(Math.abs(nw.earned)) + ' earned, ' + Money.formatCents(Math.abs(nw.learned)) + ' learned' + learnedNote + '.'
        + (also.length ? ' Also learned: ' + also.slice(0, 2).map(function (c) { return c.note; }).join('; ') + '.' : '');
    }
    if (!r.changes.length) return 'Nothing changed since ' + day + '.';
    return 'Since ' + day + ': ' + r.earned.length + ' number' + (r.earned.length === 1 ? '' : 's') + ' moved, ' + r.learned.length + ' learned' + (r.learned.length ? ' (' + r.learned.slice(0, 2).map(function (c) { return c.note; }).join('; ') + ')' : '') + '.';
  }
  return { compute: compute, strip: strip, NW_TERMS: NW_TERMS };
});
