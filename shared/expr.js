/* ==========================================================================
   shared/expr.js — the one expression language reference data is written in.
   --------------------------------------------------------------------------
   Event templates (engines/events.js, D-086) and block expansion tables
   (shared/blocks.js, D-178) both describe money moves as small JSON
   expressions rather than code, so the tables stay data. This is the one
   evaluator; neither engine keeps a copy.

     number                       itself
     "@id"                        an answer
     "$name"                      a household figure from the context
     "^id"                        an earlier line in the same table
     {"*": [..]} {"+": [..]}      arithmetic; {"-": [a, b]} {"/": [a, b]}
     {"max": [..]} {"min": [..]} {"round": x} {"neg": x}
     {"if": [cond, a, b]}         cond: {"eq"|"ne"|"gt"|"lt"|"gte"|"lte": [a, b]}, {"and"|"or": [..]}
     {"coalesce": [..]}           the first that is not null
     {"table": "name", "path": [k, "@id", ...]}   a reference-table lookup
     {"cents": x}                 dollars to cents
     {"fn": "name", "args": {}}   a named engine call, answered by env.fn
   A null anywhere makes the result null: "not enough to say".
   env: { answers, ctx, lines, tables, fn(name, rawArgs, env) }
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Expr = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  function evaluate(x, env) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (typeof x === 'boolean') return x;
    if (typeof x === 'string') {
      if (x.charAt(0) === '@') { var a = env.answers[x.slice(1)]; return a === undefined ? null : a; }
      if (x.charAt(0) === '$') { var c = env.ctx[x.slice(1)]; return c === undefined ? null : c; }
      if (x.charAt(0) === '^') { var l = env.lines && env.lines[x.slice(1)]; return l === undefined ? null : l; }
      return x;
    }
    if (Array.isArray(x)) return x.map(function (y) { return evaluate(y, env); });
    var op = Object.keys(x)[0];
    var args = x[op];
    function all(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) { var v = evaluate(list[i], env); if (v === null) return null; out.push(v); }
      return out;
    }
    var v;
    switch (op) {
      case '*': v = all(args); return v && v.reduce(function (t, n) { return t * n; }, 1);
      case '+': v = all(args); return v && v.reduce(function (t, n) { return t + n; }, 0);
      case '-': v = all(args); return v && (v.length === 1 ? -v[0] : v[0] - v[1]);
      case '/': v = all(args); return v && (v[1] === 0 ? null : v[0] / v[1]);
      case 'max': v = all(args); return v && Math.max.apply(null, v);
      case 'min': v = all(args); return v && Math.min.apply(null, v);
      case 'round': v = evaluate(args, env); return v === null ? null : Math.round(v);
      case 'neg': v = evaluate(args, env); return v === null ? null : -v;
      case 'cents': v = evaluate(args, env); return v === null ? null : Math.round(v * 100);
      case 'eq': v = all(args); return v && v[0] === v[1];
      case 'ne': v = all(args); return v && v[0] !== v[1];
      case 'gt': v = all(args); return v && v[0] > v[1];
      case 'lt': v = all(args); return v && v[0] < v[1];
      case 'gte': v = all(args); return v && v[0] >= v[1];
      case 'lte': v = all(args); return v && v[0] <= v[1];
      case 'and': v = all(args); return v && v.every(Boolean);
      case 'or': v = all(args); return v && v.some(Boolean);
      case 'if': var cond = evaluate(args[0], env); if (cond === null) return null; return evaluate(cond ? args[1] : args[2], env);
      case 'coalesce': { for (var ci = 0; ci < args.length; ci++) { var cv = evaluate(args[ci], env); if (cv !== null) return cv; } return null; }
      case 'fn': return typeof env.fn === 'function' ? env.fn(x.fn, x.args || {}, env) : null;
      case 'table': {
        var table = env.tables && env.tables[x.table];
        if (!table) return null;
        var node = table;
        var path = x.path || [];
        for (var i = 0; i < path.length; i++) {
          var key = evaluate(path[i], env);
          if (key === null || node === null || node === undefined || typeof node !== 'object') return null;
          node = node[key];
        }
        return node === undefined ? null : node;
      }
      default: return null;
    }
  }

  return { evaluate: evaluate };
});
