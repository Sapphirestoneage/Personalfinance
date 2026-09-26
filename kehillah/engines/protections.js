/* ==========================================================================
   kehillah/engines/protections.js, the papers. KD-003.
   --------------------------------------------------------------------------
     Protections.read(table, plan)
       plan: { shape, status: { paperId: 'done' | 'todo' | 'na' } }
       -> {
            rows: [{ id, label, status, urgent, lowCents, highCents }],
            done, todo, na, unanswered,
            urgentTodo: [id],                         urgent for this shape and not done
            costLowCents, costHighCents: ok | incomplete   for every paper still to do
            share                                     done / (done + todo), or null
          }
   A paper with no status is "unanswered", never assumed done or not.
   ========================================================================== */
(function (root, factory) {
  var Money = typeof module === 'object' && module.exports ? require('../shared/money.js') : root.SLAF.Money;
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Protections = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  function read(table, plan) {
    plan = plan || {}; var status = plan.status || {};
    var rows = table.papers.map(function (p) {
      var s = status[p.id] === 'done' || status[p.id] === 'todo' || status[p.id] === 'na' ? status[p.id] : null;
      return { id: p.id, label: p.label, plain: p.plain, where: p.where, status: s, urgent: !!plan.shape && p.urgentFor.indexOf(plan.shape) !== -1, lowCents: p.lowCents, highCents: p.highCents };
    });
    var count = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
    var todo = rows.filter(function (r) { return r.status === 'todo'; });
    var done = count('done'), na = count('na'), unanswered = count(null);
    var cost = todo.length ? { low: Money.ok(todo.reduce(function (s, r) { return s + r.lowCents; }, 0)), high: Money.ok(todo.reduce(function (s, r) { return s + r.highCents; }, 0)) }
      : { low: Money.incomplete(unanswered ? 'say which papers are done' : 'nothing left to do', []), high: Money.incomplete(unanswered ? 'say which papers are done' : 'nothing left to do', []) };
    return { rows: rows, done: done, todo: todo.length, na: na, unanswered: unanswered,
      urgentTodo: todo.filter(function (r) { return r.urgent; }).map(function (r) { return r.id; }),
      costLowCents: cost.low, costHighCents: cost.high, share: done + todo.length ? done / (done + todo.length) : null };
  }
  return { read: read };
});
