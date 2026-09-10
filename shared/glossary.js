/* ==========================================================================
   shared/glossary.js - the gloss dictionary, and a hover for the page.
   --------------------------------------------------------------------------
   Lane 2, section 4 (DECISIONS.md L-4). shared/glossary.json holds every
   term the rooms put on screen with one plain sentence each. This file
   is the one way anything reads it:

     Glossary.get(term)          → { term, plain, also, domain } or null,
                                   matched on the term or any alias,
                                   case-insensitive
     Glossary.terms()            → every entry
     Glossary.find(text)         → the entries whose term or alias appears
                                   in a piece of text, longest first
     Glossary.mark(root, opts)   → wraps the FIRST occurrence of each term
                                   inside `root` in <abbr class="slaf-gloss"
                                   title="…">, a hover in every browser and
                                   a long-press on a phone; returns how
                                   many were wrapped. Text nodes only:
                                   never inside <abbr>, <a>, <input>,
                                   <script>, <style>, <code> or an element
                                   with data-no-gloss.
     Glossary.load(basePath)     → in a browser, fetches the JSON (default
                                   ../shared/glossary.json from a room)
                                   and resolves to the api; in node the
                                   JSON is required directly.

   Not wired into any room: docs/lane2-proposals.md P-6 says how a room
   would call it after render. No number lives here.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Glossary = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var TABLE = null;
  var index = null;

  function use(table) { TABLE = table && Array.isArray(table.terms) ? table : TABLE; index = null; return api; }
  function table() {
    if (TABLE) return TABLE;
    if (typeof module === 'object' && module.exports) { try { TABLE = require('./glossary.json'); } catch (e) { TABLE = null; } }
    return TABLE;
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function buildIndex() {
    index = {};
    var t = table();
    ((t && t.terms) || []).forEach(function (e) {
      index[norm(e.term)] = e;
      (e.also || []).forEach(function (a) { if (!index[norm(a)]) index[norm(a)] = e; });
    });
    return index;
  }
  function get(term) {
    var i = index || buildIndex();
    return i[norm(term)] || null;
  }
  function terms() { var t = table(); return t && t.terms ? t.terms.slice() : []; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* A word boundary that also works for terms starting or ending in a
     digit or a symbol: nothing alphanumeric on either side. */
  function pattern(word) { return new RegExp('(^|[^A-Za-z0-9])(' + escapeRe(word) + ')(?![A-Za-z0-9])', 'i'); }
  function names(e) { return [e.term].concat(e.also || []).filter(Boolean); }
  function find(text) {
    var s = String(text || '');
    return terms().filter(function (e) {
      return names(e).some(function (n) { return pattern(n).test(s); });
    }).sort(function (a, b) { return b.term.length - a.term.length; });
  }

  var SKIP = { ABBR: 1, A: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1, SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, SVG: 1, OPTION: 1, LABEL: 0 };
  function skipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP[n.tagName] || (n.hasAttribute && n.hasAttribute('data-no-gloss'))) return true;
    }
    return false;
  }
  function textNodes(rootEl) {
    var out = [];
    var doc = rootEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.createTreeWalker) return out;
    var walker = doc.createTreeWalker(rootEl, 4 /* NodeFilter.SHOW_TEXT */, null, false);
    var n;
    while ((n = walker.nextNode())) { if (n.nodeValue && /\S/.test(n.nodeValue) && !skipped(n.parentNode)) out.push(n); }
    return out;
  }
  /**
   * mark(rootEl, opts): wrap the first occurrence of each glossary term in
   * a hover. opts.className (default 'slaf-gloss'), opts.only (array of
   * terms to limit to), opts.max (stop after this many). Returns the count.
   * Runs once per root: a second call finds the <abbr>s and skips them.
   */
  function mark(rootEl, opts) {
    var o = opts || {};
    if (!rootEl || typeof document === 'undefined') return 0;
    var cls = o.className || 'slaf-gloss';
    var list = terms().sort(function (a, b) { return b.term.length - a.term.length; });
    if (o.only) { var only = o.only.map(norm); list = list.filter(function (e) { return names(e).some(function (n) { return only.indexOf(norm(n)) >= 0; }); }); }
    var done = {};
    var count = 0;
    var nodes = textNodes(rootEl);
    for (var i = 0; i < nodes.length && (!o.max || count < o.max); i++) {
      var node = nodes[i];
      for (var j = 0; j < list.length; j++) {
        var e = list[j];
        if (done[e.term]) continue;
        var ns = names(e), m = null, word = null;
        for (var k = 0; k < ns.length && !m; k++) { m = pattern(ns[k]).exec(node.nodeValue); if (m) word = m[2]; }
        if (!m) continue;
        var at = m.index + m[1].length;
        var before = node.nodeValue.slice(0, at), after = node.nodeValue.slice(at + word.length);
        var abbr = document.createElement('abbr');
        abbr.className = cls;
        abbr.setAttribute('title', e.plain);
        abbr.setAttribute('data-term', e.term);
        abbr.setAttribute('tabindex', '0');
        abbr.textContent = word;
        var parent = node.parentNode;
        var rest = document.createTextNode(after);
        node.nodeValue = before;
        parent.insertBefore(abbr, node.nextSibling);
        parent.insertBefore(rest, abbr.nextSibling);
        done[e.term] = true;
        count++;
        /* Keep scanning the remainder of this text node for other terms. */
        node = rest;
        nodes.splice(i + 1, 0, rest);
        break;
      }
    }
    return count;
  }
  function load(basePath) {
    if (TABLE) return Promise.resolve(api);
    var base = basePath === undefined ? '../shared/' : basePath;
    if (typeof fetch !== 'function') { table(); return Promise.resolve(api); }
    return fetch(base + 'glossary.json').then(function (r) { if (!r.ok) throw new Error('Could not load glossary.json (' + r.status + ')'); return r.json(); })
      .then(function (json) { use(json); return api; });
  }

  var api = { use: use, get: get, terms: terms, find: find, mark: mark, load: load };
  return api;
});
