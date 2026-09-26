/* ==========================================================================
   leads/shared/store.js, everything the ladder remembers. LD-004.
   --------------------------------------------------------------------------
   One key, leads.state.v1, in this browser's localStorage. Never a slaf.,
   coach. or dnd. key: the ladder reads no household and no client.

     {
       v: 1,
       start:  { sells, serves, customers, budget, team, goal, first },
       levels: { <levelId>: { values: { key: v }, ticks: [bool], confirmed, later, at } },
       kpis:   { <Machine input key>: number | null },
       log:    [ { date: 'YYYY-MM-DD', planet, count } ],
       prefs:  { charts: { <chartId>: { type, theme, colors } }, view },
       demo:   true when the example numbers are loaded
     }

     Store.load()                 the state (a fresh one if none)
     Store.save(state)            write it
     Store.answer(id, key, v)     one field of one level
     Store.tick(id, i, on)        one box of one level's checklist
     Store.confirm(id)            the "got it"
     Store.later(id, on)          the come-back flag
     Store.setStart(key, v)       one Start Here answer
     Store.setKpi(key, v)         one Machine number (null clears it)
     Store.addLog(date, planet, count), Store.dropLog(i)
     Store.setChartPref(id, patch), Store.prefs()
     Store.demo()                 load the example numbers (marked demo)
     Store.reset()                forget everything
     Store.exportJson(), Store.importJson(text)
   The Machine page owns the kpis; a level that needs one links there. A
   level owns its own answers. No number is stored in two places.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Store = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var KEY = 'leads.state.v1';
  var SIG = 'leadsLadderExport';
  var listeners = [];
  function storage() { return (typeof localStorage !== 'undefined') ? localStorage : null; }
  function fresh() { return { v: 1, start: {}, levels: {}, kpis: {}, log: [], prefs: { charts: {} }, demo: false }; }
  function load() {
    var s = storage(); if (!s) return fresh();
    var raw = s.getItem(KEY); if (!raw) return fresh();
    try { var st = JSON.parse(raw); if (!st || st.v !== 1) return fresh(); return normalise(st); } catch (e) { return fresh(); }
  }
  function normalise(st) {
    var f = fresh();
    ['start', 'levels', 'kpis', 'prefs'].forEach(function (k) { if (!st[k] || typeof st[k] !== 'object') st[k] = f[k]; });
    if (!Array.isArray(st.log)) st.log = [];
    if (!st.prefs.charts) st.prefs.charts = {};
    st.demo = !!st.demo;
    return st;
  }
  function save(st) {
    var s = storage(); if (s) s.setItem(KEY, JSON.stringify(st));
    listeners.forEach(function (fn) { try { fn(st); } catch (e) { /* a listener never breaks a save */ } });
    return st;
  }
  function onChange(fn) { listeners.push(fn); }
  function edit(fn) { var st = load(); fn(st); return save(st); }
  function box(st, id) { st.levels[id] = st.levels[id] || { values: {}, ticks: [], confirmed: false, later: false }; st.levels[id].at = new Date().toISOString(); return st.levels[id]; }

  function answer(id, key, v) { return edit(function (st) { var b = box(st, id); if (v === '' || v === null || v === undefined) delete b.values[key]; else b.values[key] = v; }); }
  function tick(id, i, on) { return edit(function (st) { var b = box(st, id); b.ticks[i] = !!on; }); }
  function confirm(id) { return edit(function (st) { box(st, id).confirmed = true; }); }
  function later(id, on) { return edit(function (st) { box(st, id).later = !!on; }); }
  function setStart(key, v) { return edit(function (st) { if (v === '' || v === null || v === undefined) delete st.start[key]; else st.start[key] = v; }); }
  function setKpi(key, v) { return edit(function (st) { if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) delete st.kpis[key]; else st.kpis[key] = v; }); }
  function addLog(date, planet, count) { return edit(function (st) { st.log.push({ date: date, planet: planet, count: count }); st.log.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }); }
  function dropLog(i) { return edit(function (st) { st.log.splice(i, 1); }); }
  function prefs() { return load().prefs; }
  function setChartPref(id, patch) {
    return edit(function (st) {
      var c = st.prefs.charts[id] || {};
      for (var k in patch) { if (patch[k] === null) delete c[k]; else if (k === 'colors') { c.colors = c.colors || {}; for (var s in patch.colors) c.colors[s] = patch.colors[s]; } else c[k] = patch[k]; }
      st.prefs.charts[id] = c;
    });
  }
  function setPref(key, v) { return edit(function (st) { st.prefs[key] = v; }); }

  /* ---- The example numbers -----------------------------------------------------
     A made-up piano teacher. Every figure is invented; the flag says so on
     every page until the person starts over. */
  function demo() {
    var st = fresh();
    st.demo = true;
    st.start = { sells: 'Piano lessons for adults who gave up as kids', serves: 'Busy adults in their 30s and 40s', customers: 'some', budget: 'some', team: 'solo', goal: 20, first: 'warm' };
    st.kpis = { reachPerDay: 100, daysPerMonth: 22, replyRate: 0.05, bookRate: 0.4, showRate: 0.7, closeRate: 0.3, firstPurchaseCents: 30000, monthlyCents: 20000, monthsKept: 8, marginRate: 0.7, adSpendCents: 300000, laborCents: 0, customersNow: 12, churnRate: 0.08, referralRate: 0.1 };
    var done = function (id, values, ticks, confirmed) { st.levels[id] = { values: values || {}, ticks: ticks || [], confirmed: !!confirmed, later: false, at: '2026-09-20T12:00:00.000Z' }; };
    done('magnet-1', { who: 'Adults who quit piano as kids', problem: 'Not knowing which songs are easy enough to start with' });
    done('magnet-2', { kind: 'reveal', why: 'They do not know how rusty they are, so a five-minute playing check shows them where to start.' });
    done('magnet-3', { delivery: 'information', what: 'A twelve-minute video that finds your level and gives you three songs' });
    done('magnet-4', { name1: 'The Rusty Fingers Test', name2: 'Find your first three songs in twelve minutes', name3: 'The adult beginner\'s starting map', pick: '1' });
    done('magnet-5', {}, [true, true, true, true, true]);
    done('magnet-6', {}, [true, true, true, false, true]);
    done('warm-1', {}, [], true);
    done('warm-2', { person: 'Sam', aca: 'Saw you finished the marathon, that is a serious year of training. How are the knees holding up?' });
    done('warm-3', { phone: 420, email: 310, social: 900 });
    done('warm-4', { platform: 'text', why: 'Most of my list is in my phone and they reply within the day' });
    done('warm-5', { who: 'adults who quit piano as kids', outcome: 'playing a song they love', time: 'thirty days', without: 'scales, theory, or a teacher who sighs' });
    done('warm-6', {}, [true, true, true, true, false, true]);
    done('content-1', {}, [], true);
    done('content-2', { ratio: '5', style: 'both' });
    done('cold-1', {}, [], true);
    done('paid-1', {}, [], true);
    done('referrals-1', {}, [], true);
    var today = new Date(), log = [];
    var counts = [100, 110, 95, 0, 120, 100, 100, 130, 60, 100, 105, 100, 100, 115];
    for (var i = counts.length - 1; i >= 0; i--) { var d = new Date(today.getTime() - i * 86400000); if (counts[counts.length - 1 - i] > 0) log.push({ date: d.toISOString().slice(0, 10), planet: 'warm', count: counts[counts.length - 1 - i] }); }
    st.log = log;
    return save(st);
  }
  function reset() { var s = storage(); if (s) s.removeItem(KEY); return save(fresh()); }
  function exportJson() { var st = load(); var out = {}; out[SIG] = 1; out.state = st; out.at = new Date().toISOString(); return JSON.stringify(out, null, 2); }
  function importJson(text) {
    var o; try { o = JSON.parse(text); } catch (e) { throw new Error('That file is not a ladder export.'); }
    if (!o || !o[SIG] || !o.state) throw new Error('That file is not a ladder export.');
    return save(normalise(o.state));
  }
  return { KEY: KEY, SIG: SIG, load: load, save: save, onChange: onChange, fresh: fresh, answer: answer, tick: tick, confirm: confirm, later: later, setStart: setStart, setKpi: setKpi,
    addLog: addLog, dropLog: dropLog, prefs: prefs, setChartPref: setChartPref, setPref: setPref, demo: demo, reset: reset, exportJson: exportJson, importJson: importJson };
});
