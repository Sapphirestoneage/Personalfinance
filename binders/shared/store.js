/* ==========================================================================
   binders/shared/store.js, everything the Binders remember. PB-001.
   --------------------------------------------------------------------------
   One key in this browser, binders.v1, and nothing of SPARKS (no slaf. key
   is read or written). Answers are keyed by exercise key, which is unique
   across data/playbooks.json; the checklist ticks are keyed by level id.

     use(storage)              swap the storage (tests hand in a fake)
     load() / save(state)      the whole state, migrated on read
     answer(key, value)        write one answer (null clears it)
     rough(key, isRough)       mark an answer as a rough guess
     tick(levelId, i, on)      one checklist item
     clear()                   forget everything
     exportJson() / importJson(text)

   Empty is not zero: an unanswered exercise is absent from answers, never
   stored as 0 or "". Money is integer cents. No real data ships in this
   repo: the example answers live in data/example.json and are loaded only
   behind "Try with example answers".
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.BINDERS = root.BINDERS || {}; root.BINDERS.Store = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var KEY = 'binders.v1';
  var storage = null;
  function use(s) { storage = s; return storage; }
  function store() { return storage || (typeof localStorage !== 'undefined' ? localStorage : null); }

  function blank() { return { version: 1, answers: {}, rough: {}, checks: {}, prefs: {}, updatedAt: null }; }
  function migrate(raw) {
    var s = blank();
    if (!raw || typeof raw !== 'object') return s;
    if (raw.answers && typeof raw.answers === 'object') s.answers = raw.answers;
    if (raw.rough && typeof raw.rough === 'object') s.rough = raw.rough;
    if (raw.checks && typeof raw.checks === 'object') s.checks = raw.checks;
    if (raw.prefs && typeof raw.prefs === 'object') s.prefs = raw.prefs;
    if (typeof raw.updatedAt === 'string') s.updatedAt = raw.updatedAt;
    return s;
  }
  function load() {
    var st = store();
    if (!st) return blank();
    var text = null;
    try { text = st.getItem(KEY); } catch (e) { return blank(); }
    if (!text) return blank();
    try { return migrate(JSON.parse(text)); } catch (e) { return blank(); }
  }
  function save(state) {
    var st = store();
    state.updatedAt = new Date().toISOString();
    if (st) { try { st.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked: the page keeps working */ } }
    return state;
  }
  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'number') return !isFinite(v);
    return false;
  }
  function answer(key, value) {
    var s = load();
    if (isEmpty(value)) { delete s.answers[key]; delete s.rough[key]; }
    else s.answers[key] = value;
    return save(s);
  }
  function rough(key, on) {
    var s = load();
    if (on) s.rough[key] = true; else delete s.rough[key];
    return save(s);
  }
  function tick(levelId, i, on) {
    var s = load();
    s.checks[levelId] = s.checks[levelId] || {};
    if (on) s.checks[levelId][i] = true; else delete s.checks[levelId][i];
    if (Object.keys(s.checks[levelId]).length === 0) delete s.checks[levelId];
    return save(s);
  }
  function pref(key, value) {
    var s = load();
    if (value === undefined) return s.prefs[key];
    if (value === null) delete s.prefs[key]; else s.prefs[key] = value;
    save(s);
    return value;
  }
  function clear() { var st = store(); if (st) { try { st.removeItem(KEY); } catch (e) { /* nothing to clear */ } } return blank(); }
  function exportJson() { return JSON.stringify({ app: 'binders', key: KEY, exportedAt: new Date().toISOString(), state: load() }, null, 2); }
  function importJson(text) {
    var raw = JSON.parse(text);
    var state = raw && raw.state ? raw.state : raw;
    return save(migrate(state));
  }
  function loadState(state) { return save(migrate(state)); }
  return { KEY: KEY, use: use, load: load, save: save, answer: answer, rough: rough, tick: tick, pref: pref, clear: clear, isEmpty: isEmpty, exportJson: exportJson, importJson: importJson, loadState: loadState, blank: blank };
});
