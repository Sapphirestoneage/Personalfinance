/* ==========================================================================
   moneymodels/shared/store.js, everything this app remembers. MM-002.
   --------------------------------------------------------------------------
   One key in localStorage, `moneymodels.v1`, never a `slaf.` or `coach.` key:
     { version: 1, facts: { key: value }, quizzes: { levelId: index },
       checks: { levelId: { itemId: true } }, updated: iso }
   Empty is not zero: a fact that was never typed is absent (null on read),
   a typed 0 is 0. Money is integer cents. Text is a trimmed string.
   Nothing here computes; engines/model.js reads the state this hands back.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.MM = root.MM || {}; root.MM.Store = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var KEY = 'moneymodels.v1';
  var listeners = [];
  function storage() { return (typeof localStorage !== 'undefined') ? localStorage : null; }
  function blank() { return { version: 1, facts: {}, quizzes: {}, checks: {}, updated: null }; }
  function load() {
    var s = storage(); if (!s) return blank();
    try {
      var raw = s.getItem(KEY); if (!raw) return blank();
      var o = JSON.parse(raw);
      if (!o || o.version !== 1) return blank();
      return { version: 1, facts: o.facts || {}, quizzes: o.quizzes || {}, checks: o.checks || {}, updated: o.updated || null };
    } catch (e) { return blank(); }
  }
  function save(state) {
    state.updated = new Date().toISOString();
    var s = storage(); if (s) s.setItem(KEY, JSON.stringify(state));
    listeners.forEach(function (fn) { fn(state); });
    return state;
  }
  function onChange(fn) { listeners.push(fn); }

  /* A value is stored only when it is a real answer. null or '' removes it. */
  function setFact(key, value) {
    var st = load();
    if (value === null || value === undefined || value === '') delete st.facts[key];
    else st.facts[key] = value;
    return save(st);
  }
  function setQuiz(levelId, index) {
    var st = load();
    if (index === null || index === undefined) delete st.quizzes[levelId]; else st.quizzes[levelId] = index;
    return save(st);
  }
  function setCheck(levelId, itemId, on) {
    var st = load();
    st.checks[levelId] = st.checks[levelId] || {};
    if (on) st.checks[levelId][itemId] = true; else delete st.checks[levelId][itemId];
    if (!Object.keys(st.checks[levelId]).length) delete st.checks[levelId];
    return save(st);
  }
  function reset() { var s = storage(); if (s) s.removeItem(KEY); var st = blank(); listeners.forEach(function (fn) { fn(st); }); return st; }

  /* The example numbers: every fact, every quiz answered right, every box ticked. */
  function loadDemo(demo, levels) {
    var st = blank();
    Object.keys(demo.facts).forEach(function (k) { st.facts[k] = demo.facts[k]; });
    Object.keys(demo.quizzes || {}).forEach(function (k) { st.quizzes[k] = demo.quizzes[k]; });
    if (demo.checklists === 'all') {
      levels.forEach(function (lv) { if (lv.kind === 'checklist') { st.checks[lv.id] = {}; lv.items.forEach(function (it) { st.checks[lv.id][it.id] = true; }); } });
    }
    return save(st);
  }
  function exportJson() { var st = load(); return JSON.stringify({ moneymodelsExport: 1, exported: new Date().toISOString(), state: st }, null, 2); }
  function importJson(text) {
    var o = JSON.parse(text);
    if (!o || o.moneymodelsExport !== 1 || !o.state || o.state.version !== 1) throw new Error('That is not a Money Models file.');
    return save({ version: 1, facts: o.state.facts || {}, quizzes: o.state.quizzes || {}, checks: o.state.checks || {}, updated: null });
  }
  function hasAnything(state) { state = state || load(); return Object.keys(state.facts).length + Object.keys(state.quizzes).length + Object.keys(state.checks).length > 0; }
  return { KEY: KEY, blank: blank, load: load, save: save, onChange: onChange, setFact: setFact, setQuiz: setQuiz, setCheck: setCheck, reset: reset, loadDemo: loadDemo, exportJson: exportJson, importJson: importJson, hasAnything: hasAnything };
});
