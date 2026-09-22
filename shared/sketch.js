/* ==========================================================================
   shared/sketch.js, band 1 in words anyone can answer. D-336.
   --------------------------------------------------------------------------
   data/levels.json says what the 180 levels are; shared/solar.js says where a
   household stands in them. This says how to ASK the first eighteen, the
   Sketch band, of someone who has never used a money app: the question in
   plain words, what counts and what to leave out, where to look on a phone,
   what to do when the answer is not known, and, for the three questions that
   are really a sum, the pieces to add up.

     use(table)            take data/sketch_help.json (once per page)
     help(levelId)         the entry, or null for a level with none
     parts(levelId)        the add-it-up boxes, or [] for a level with none
     total(cents[])        the sum of the boxes that were filled:
                           Money.ok(cents, { of }) or Money.incomplete

   NOTHING HERE IS A NUMBER THE APP INVENTS. total() adds what the person
   typed and nothing else; a blank box is not a zero, it is a box that was
   left out of the sum, and a sum of no boxes is incomplete rather than 0.
   The total is written through the field's owner like any other answer, and
   the pieces are never stored: they are scratch, and asking again is cheap.

   The starting number offered beside a question is not here either. That is
   shared/suggest.js, one rule per row, so the same guess appears wherever
   the row is asked and carries the same "how I got this" line.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('./money.js') : (root.SLAF || {}).Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Sketch = api; }
}(typeof self !== 'undefined' ? self : this, function (Money) {
  'use strict';

  var TABLE = null;

  function use(table) { TABLE = table && table.levels ? table : null; return TABLE; }
  function table() { return TABLE; }

  function help(levelId) {
    if (!TABLE || !levelId) return null;
    return TABLE.levels[levelId] || null;
  }
  function parts(levelId) {
    var h = help(levelId);
    return h && h.parts && h.parts.length ? h.parts.slice() : [];
  }

  /** The sum of the boxes that hold a figure. A blank box is not a zero:
      it is left out, and the count of what went in comes back with the
      total so the screen can say "the 2 boxes you filled". Nothing filled
      is incomplete, never 0. */
  function total(values) {
    var list = (values || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
    if (!list.length) return Money.incomplete('Nothing typed in the boxes yet.', []);
    var sum = 0;
    for (var i = 0; i < list.length; i++) sum += list[i];
    return Money.ok(Math.round(sum), { of: list.length });
  }

  return { use: use, table: table, help: help, parts: parts, total: total };
}));
