/* ==========================================================================
   moneymodels/engines/model.js, every reading the app shows. MM-003.
   --------------------------------------------------------------------------
   Pure. Tables and a store state in, readings out; nothing is written.

     Model.use(tables)                    the levels, recipes and plays
     Model.values(state)                  facts plus a true for each finished level
     Model.levelState(level, state)       'done' | 'part' | 'open'
     Model.planets(state)                 progress: bands, rows, cleared, rings, next
     Model.recipes(state)                 every recipe: ready, value, missing
     Model.recipe(id, state)              one
     Model.plays(state)                   every play: open, waiting
     Model.next(state, n)                 the next levels to do, ranked
     Model.fmt(value, unit)               a figure as words

   Empty is not zero: a fact that is absent makes a recipe "not yet" and the
   recipe names what it is missing; nothing defaults a blank to zero. Money is integer
   cents; percents are whole numbers (25 means 25%). A formula that cannot
   divide (no customers, no churn) hands back null with a note, never NaN.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.MM = root.MM || {}; root.MM.Model = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var T = null, LEVELS = [], BY_ID = {}, RECIPES = [], RECIPE_BY_ID = {}, PLAYS = [], PLANETS = [], BANDS = [], FIELD_LEVEL = {};

  function use(tables) {
    T = tables;
    LEVELS = tables.levels.levels; PLANETS = tables.levels.planets; BANDS = tables.levels.bands;
    RECIPES = tables.recipes.recipes; PLAYS = tables.plays.plays;
    BY_ID = {}; RECIPE_BY_ID = {}; FIELD_LEVEL = {};
    LEVELS.forEach(function (lv) { BY_ID[lv.id] = lv; (lv.fields || []).forEach(function (f) { FIELD_LEVEL[f.key] = lv.id; }); FIELD_LEVEL[lv.id] = lv.id; });
    RECIPES.forEach(function (r) { RECIPE_BY_ID[r.id] = r; });
    return api;
  }
  function has(v) { return v !== null && v !== undefined && v !== ''; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  /* ---- Levels --------------------------------------------------------------- */
  function levelState(lv, state) {
    state = state || { facts: {}, quizzes: {}, checks: {} };
    if (lv.kind === 'quiz') return state.quizzes[lv.id] === lv.quiz.answer ? 'done' : (has(state.quizzes[lv.id]) ? 'part' : 'open');
    if (lv.kind === 'checklist') {
      var t = state.checks[lv.id] || {}, n = lv.items.filter(function (it) { return t[it.id]; }).length;
      return n === lv.items.length ? 'done' : n ? 'part' : 'open';
    }
    var n2 = lv.fields.filter(function (f) { return has(state.facts[f.key]); }).length;
    return n2 === lv.fields.length ? 'done' : n2 ? 'part' : 'open';
  }
  function values(state) {
    var v = {};
    Object.keys(state.facts || {}).forEach(function (k) { if (has(state.facts[k])) v[k] = state.facts[k]; });
    LEVELS.forEach(function (lv) { if (levelState(lv, state) === 'done') v[lv.id] = true; });
    return v;
  }
  function planets(state) {
    var out = PLANETS.map(function (p) {
      var levels = LEVELS.filter(function (l) { return l.planet === p.id; });
      var bands = BANDS.map(function (b) {
        var rows = levels.filter(function (l) { return l.band === b.band; }).map(function (l) { return { level: l, state: levelState(l, state) }; });
        var done = rows.filter(function (r) { return r.state === 'done'; }).length;
        return { band: b.band, name: b.name, rows: rows, done: done, cleared: done === rows.length && rows.length > 0 };
      });
      var done = bands.reduce(function (s, b) { return s + b.done; }, 0);
      var cleared = 0; while (cleared < bands.length && bands[cleared].cleared) cleared++;
      return { id: p.id, label: p.label, short: p.short, blurb: p.blurb, hue: p.hue, bands: bands, done: done, total: levels.length, orbit: cleared };
    });
    var rings = 0; while (rings < BANDS.length && out.every(function (p) { return p.bands[rings].cleared; })) rings++;
    var done = out.reduce(function (s, p) { return s + p.done; }, 0), total = out.reduce(function (s, p) { return s + p.total; }, 0);
    return { planets: out, rings: rings, done: done, total: total, next: next(state, 3) };
  }

  /* ---- Recipes ---------------------------------------------------------------
     A formula gets the values map and returns a number, a string, an object
     (for a chart) or { value: null, note } when it cannot divide. */
  function pct(v) { return v / 100; }
  function div(a, b, note) { return b > 0 ? a / b : { value: null, note: note }; }
  function seqCash(v) { /* cash collected in the first month, per customer */
    return v.attrPrice + v.upPrice * pct(v.upTake) + v.downPrice * (1 - pct(v.upTake)) * pct(v.downTake) + v.contPrice * pct(v.contJoin);
  }
  function seqGp(v) {
    return (v.attrPrice - v.attrCost) + (v.upPrice - v.upCost) * pct(v.upTake) + (v.downPrice - v.downCost) * (1 - pct(v.upTake)) * pct(v.downTake) + (v.contPrice - v.contCost) * pct(v.contJoin);
  }
  function cacOf(v) { return v.newCustomers > 0 ? v.adSpend / v.newCustomers : null; }
  function months(v) { return v.churn > 0 ? 100 / v.churn : null; }
  function ltgpOf(v) {
    var m = months(v); if (m === null) return null;
    return (v.attrPrice - v.attrCost) + (v.upPrice - v.upCost) * pct(v.upTake) + (v.downPrice - v.downCost) * (1 - pct(v.upTake)) * pct(v.downTake) + (v.contPrice - v.contCost) * pct(v.contJoin) * m;
  }
  function annualLiftOf(v) { return (v.contAnnualPrice - v.contPrice) * pct(v.contAnnualTake) * pct(v.contJoin); }
  /* Cumulative gross profit by day, for 365 days. */
  function timeline(v, days) {
    var cac = cacOf(v), out = [], cum = 0, join = pct(v.contJoin), contGp = v.contPrice - v.contCost, m;
    for (var d = 0; d <= days; d++) {
      if (d === 0) cum += v.attrPrice - v.attrCost;
      if (d === v.upWhen) cum += (v.upPrice - v.upCost) * pct(v.upTake) + (v.downPrice - v.downCost) * (1 - pct(v.upTake)) * pct(v.downTake);
      if (d >= v.contFirstDays && (d - v.contFirstDays) % 30 === 0) { m = (d - v.contFirstDays) / 30; cum += contGp * join * Math.pow(1 - pct(v.churn), m); }
      out.push(cum);
    }
    return { days: out, cac: cac };
  }
  var NO_CUSTOMERS = 'No customers last month, so there is nothing to divide by.';
  var NO_CHURN = 'With zero churn nobody ever leaves, so the months are endless. Type the real figure.';
  var F = {
    gpPerSale: function (v) { return v.price - v.deliveryCost; },
    grossMargin: function (v) { return div((v.price - v.deliveryCost) * 100, v.price, 'A free main offer has no margin to speak of.'); },
    cac: function (v) { return div(v.adSpend, v.newCustomers, NO_CUSTOMERS); },
    firstSaleGap: function (v) { var c = cacOf(v); return c === null ? { value: null, note: NO_CUSTOMERS } : v.price - v.deliveryCost - c; },
    affordableCustomers: function (v) { var c = cacOf(v); return c === null ? { value: null, note: NO_CUSTOMERS } : c > 0 ? Math.floor(v.growthCash / c) : { value: null, note: 'Customers cost nothing, so there is no ceiling here.' }; },
    cpl: function (v) { return div(v.adSpend, v.leads, 'No leads, so there is nothing to divide by.'); },
    impliedCustomers: function (v) { return Math.round(v.leads * pct(v.attrConversion)); },
    attrGp: function (v) { return v.attrPrice - v.attrCost; },
    upGp: function (v) { return v.upPrice - v.upCost; },
    upExpected: function (v) { return (v.upPrice - v.upCost) * pct(v.upTake); },
    downGp: function (v) { return v.downPrice - v.downCost; },
    downExpected: function (v) { return (v.downPrice - v.downCost) * (1 - pct(v.upTake)) * pct(v.downTake); },
    contGp: function (v) { return v.contPrice - v.contCost; },
    expectedMonths: function (v) { var m = months(v); return m === null ? { value: null, note: NO_CHURN } : m; },
    contLtgp: function (v) { var m = months(v); return m === null ? { value: null, note: NO_CHURN } : (v.contPrice - v.contCost) * pct(v.contJoin) * m; },
    collected30: function (v) { return seqCash(v); },
    gp30: function (v) { return seqGp(v); },
    ratio30: function (v) { var c = cacOf(v); return c === null ? { value: null, note: NO_CUSTOMERS } : div(seqGp(v), c, 'Customers cost nothing, so any cash at all is infinite return.'); },
    maxCac: function (v) { return seqGp(v) / 2; },
    ltgp: function (v) { var l = ltgpOf(v); return l === null ? { value: null, note: NO_CHURN } : l; },
    ltgpCac: function (v) { var l = ltgpOf(v), c = cacOf(v); if (l === null) return { value: null, note: NO_CHURN }; if (c === null) return { value: null, note: NO_CUSTOMERS }; return div(l, c, 'Customers cost nothing, so the ratio is infinite.'); },
    cashPerLead: function (v) { return seqGp(v) * pct(v.attrConversion); },
    capacityHeadroom: function (v) { return v.capacity - v.newCustomers; },
    breakEvenCustomers: function (v) { var g = seqGp(v); return g > 0 ? Math.ceil(v.fixedCosts / g) : { value: null, note: 'The sequence makes no gross profit in 30 days, so no number of customers covers fixed costs.' }; },
    unitEconomics: function (v) {
      var c = cacOf(v); if (c === null) return { value: null, note: NO_CUSTOMERS };
      var cash = seqCash(v), gp = seqGp(v), left = gp - c;
      return { chart: 'stack', total: cash, parts: [ { id: 'delivery', label: 'Delivery', value: cash - gp }, { id: 'cac', label: 'Cost of the customer', value: c }, { id: 'left', label: left >= 0 ? 'Left over' : 'Short', value: left } ] };
    },
    waterfall30: function (v) {
      var c = cacOf(v); if (c === null) return { value: null, note: NO_CUSTOMERS };
      return { chart: 'waterfall', cac: c, steps: [
        { id: 'attr', label: 'Attraction', value: v.attrPrice - v.attrCost },
        { id: 'up', label: 'Upsell', value: (v.upPrice - v.upCost) * pct(v.upTake) },
        { id: 'down', label: 'Downsell', value: (v.downPrice - v.downCost) * (1 - pct(v.upTake)) * pct(v.downTake) },
        { id: 'cont', label: 'Continuity, month 1', value: (v.contPrice - v.contCost) * pct(v.contJoin) } ] };
    },
    funnel: function (v) {
      var buyers = 100 * pct(v.attrConversion), ups = buyers * pct(v.upTake), downs = (buyers - ups) * pct(v.downTake), members = buyers * pct(v.contJoin);
      return { chart: 'funnel', rows: [ { id: 'leads', label: 'Leads', value: 100 }, { id: 'buyers', label: 'Take the attraction offer', value: buyers }, { id: 'ups', label: 'Take the upsell', value: ups }, { id: 'downs', label: 'Take the downsell', value: downs }, { id: 'members', label: 'Join continuity', value: members } ] };
    },
    retentionCurve: function (v) {
      var pts = []; for (var m = 0; m <= 12; m++) pts.push(100 * Math.pow(1 - pct(v.churn), m));
      return { chart: 'line', unit: 'percent', x: 'Month', points: pts };
    },
    growthCurve: function (v) {
      var c = cacOf(v); if (c === null) return { value: null, note: NO_CUSTOMERS };
      if (c <= 0) return { value: null, note: 'Customers cost nothing, so the curve has no ceiling but capacity.' };
      var gp = seqGp(v), re = pct(v.reinvestShare), flat = Math.min(v.capacity, v.growthCash / c), with_ = [], without = [], cash = v.growthCash, n;
      for (var m = 1; m <= 12; m++) { n = Math.min(v.capacity, cash / c); with_.push(n); without.push(flat); cash = v.growthCash + re * gp * n; }
      return { chart: 'lines', unit: 'count', x: 'Month', series: [ { id: 'reinvest', label: 'Reinvesting', points: with_ }, { id: 'flat', label: 'Same budget each month', points: without } ], cap: v.capacity };
    },
    health: function (v) {
      var c = cacOf(v), l = ltgpOf(v);
      var axes = [
        { id: 'margin', label: 'Margin', value: v.price > 0 ? (v.price - v.deliveryCost) / v.price * 100 : null, target: 50, unit: 'percent' },
        { id: 'ratio30', label: '30-day ratio', value: c > 0 ? seqGp(v) / c : null, target: 2, unit: 'ratio' },
        { id: 'ltgpCac', label: 'LTGP to CAC', value: c > 0 && l !== null ? l / c : null, target: 3, unit: 'ratio' },
        { id: 'upTake', label: 'Upsell take', value: v.upTake, target: 30, unit: 'percent' },
        { id: 'retention', label: 'Monthly retention', value: 100 - v.churn, target: 95, unit: 'percent' },
        { id: 'conversion', label: 'Lead conversion', value: v.attrConversion, target: 20, unit: 'percent' } ];
      return { chart: 'radar', axes: axes };
    },
    offerLine: function (v) { return 'For ' + v.customer + ': ' + v.promise + '.'; },
    constraintRead: function (v) {
      var m = { customers: 'Not enough customers: build Attraction first.', perCustomer: 'Each customer does not pay enough: build Upsell, then Downsell.', stay: 'They do not stay: build Continuity.', cost: 'It costs too much to serve them: cut the cost to deliver before adding offers.' };
      return m[v.constraint] || v.constraint;
    },
    sequenceGaps: function (v) {
      var none = function (s) { return /^\s*(nothing|none|no|n\/a|nada|-)\s*\.?$/i.test(String(s)); };
      var gaps = []; if (none(v.seqNext)) gaps.push('an upsell'); if (none(v.seqNo)) gaps.push('a downsell'); if (none(v.seqOngoing)) gaps.push('continuity');
      return gaps.length ? 'Missing today: ' + gaps.join(', ') + '.' : 'All four offers exist today. The work is sharpening them.';
    },
    attrPlayRead: function (v) { return playLabel(v.attrPlay); }, upPlayRead: function (v) { return playLabel(v.upPlay); },
    downPlayRead: function (v) { return playLabel(v.downPlay); }, contPlayRead: function (v) { return playLabel(v.contPlay); },
    attrOfferWritten: function (v) { return v.attrOffer + ' Then: ' + v.attrString + '.'; },
    upScriptWritten: function (v) { return v.upScript + ' On a no: ' + v.upNoReply; },
    downScriptWritten: function (v) { return v.downScript + ' Smaller: ' + v.downCut + '.'; },
    contScriptWritten: function (v) { return v.contScript + ' To stay: ' + v.contHook + '.'; },
    northStarRead: function (v) { return optionLabel('K7', 'northStar', v.northStar); },
    scoreboardSet: function (v) { return v.scoreboardWhere + '. ' + v.scoreboardWho + '.'; },
    modelWritten: function (v) { return '1. ' + v.attrOffer + ' 2. ' + v.upScript + ' 3. ' + v.downScript + ' 4. ' + v.contScript; },
    baselinePayback: function (v) { return v.daysToCash; },
    baselineRatio: function (v) { var c = cacOf(v); return c === null ? { value: null, note: NO_CUSTOMERS } : div(v.cash30Today, c, 'Customers cost nothing.'); },
    beforeAfter: function (v) { var c = cacOf(v); return c === null ? { value: null, note: NO_CUSTOMERS } : { chart: 'bars', unit: 'cents', line: c, lineLabel: 'Cost of a customer', bars: [ { id: 'before', label: 'Today', value: v.cash30Today }, { id: 'planned', label: 'Planned', value: seqCash(v) } ] }; },
    effectiveUpTake: function (v) { return pct(v.showRate) * pct(v.upOfferedShare) * v.upTake; },
    attrGpNet: function (v) { return v.attrPrice - v.attrCost - v.attrPrice * pct(v.refundRate); },
    downCash30: function (v) { return v.downPrice * pct(v.planFirstShare) * (1 - pct(v.upTake)) * pct(v.downTake); },
    cash30Verified: function (v) {
      var g = v.attrPrice - v.attrCost;
      if (v.upWhen <= 30) { g += (v.upPrice - v.upCost) * pct(v.upTake); g += (v.downPrice * pct(v.planFirstShare) - v.downCost) * (1 - pct(v.upTake)) * pct(v.downTake); }
      if (v.contFirstDays <= 30) g += (v.contPrice - v.contCost) * pct(v.contJoin);
      return g;
    },
    paybackDays: function (v) {
      var t = timeline(v, 365); if (t.cac === null) return { value: null, note: NO_CUSTOMERS };
      for (var d = 0; d < t.days.length; d++) if (t.days[d] >= t.cac) return d;
      return { value: null, note: 'The sequence does not pay back the cost of a customer inside a year.' };
    },
    paybackChart: function (v) { var t = timeline(v, 90); if (t.cac === null) return { value: null, note: NO_CUSTOMERS }; return { chart: 'line', unit: 'cents', x: 'Day', points: t.days, line: t.cac, lineLabel: 'Cost of a customer', mark: 30, markLabel: 'Day 30' }; },
    planLeak: function (v) { return v.downPrice * (1 - pct(v.planFirstShare)) * pct(v.planDefault) * (1 - pct(v.upTake)) * pct(v.downTake); },
    retain3Check: function (v) { return { chart: 'bars', unit: 'percent', bars: [ { id: 'predicted', label: 'Predicted by churn', value: 100 * Math.pow(1 - pct(v.churn), 3) }, { id: 'measured', label: 'Measured', value: v.retain3 } ] }; },
    measuredRatio: function (v) { var c = cacOf(v); return c === null ? { value: null, note: NO_CUSTOMERS } : div(v.measuredCash30, c, 'Customers cost nothing.'); },
    planVsActual: function (v) { var c = cacOf(v); return c === null ? { value: null, note: NO_CUSTOMERS } : { chart: 'bars', unit: 'cents', line: c, lineLabel: 'Cost of a customer', bars: [ { id: 'before', label: 'Before', value: v.cash30Today }, { id: 'planned', label: 'Planned', value: seqCash(v) }, { id: 'measured', label: 'Measured', value: v.measuredCash30 } ] }; },
    customerGrowth: function (v) { return div((v.measuredNewCustomers - v.newCustomers) * 100, v.newCustomers, NO_CUSTOMERS); },
    gpPerHour: function (v) { return div(seqGp(v), v.hoursPerCustomer, 'No hours: type at least one.'); },
    firstPlanetRead: function (v) { var p = PLANETS.filter(function (x) { return x.id === v.firstPlanet; })[0]; return p ? p.label : v.firstPlanet; },
    attrStacked: function (v) { return v.attrStack === 'none' ? 'None yet' : playLabel(v.attrStack); },
    runRevenue: function (v) { return v.attrCap * seqCash(v); },
    up2Expected: function (v) { return v.up2Price * pct(v.up2Take) * pct(v.upTake); },
    ltgpFull: function (v) { var l = ltgpOf(v); return l === null ? { value: null, note: NO_CHURN } : l + v.up2Price * pct(v.up2Take) * pct(v.upTake) + annualLiftOf(v); },
    anchorGap: function (v) { return div(v.upPrice * 100, v.anchorPrice, 'A free anchor anchors nothing.'); },
    entryDownExpected: function (v) { return v.entryDownPrice * pct(v.entryDownTake) * (1 - pct(v.attrConversion)); },
    cashPerLeadFull: function (v) { return seqGp(v) * pct(v.attrConversion) + v.entryDownPrice * pct(v.entryDownTake) * (1 - pct(v.attrConversion)); },
    downStacked: function (v) { return optionLabel('D14', 'downCut2', v.downCut2); },
    annualLift: function (v) { return annualLiftOf(v); },
    gp30Stacked: function (v) { return seqGp(v) + annualLiftOf(v); },
    contStacked: function (v) { return optionLabel('C14', 'contHook2', v.contHook2); },
    breakEvenTake: function (v) { var g = v.upPrice - v.upCost, g2 = g + v.upPrice * pct(v.priceRaise); return div(v.upTake * g, g2, 'The raised upsell makes no gross profit.'); },
    bottleneckRead: function (v) { return optionLabel('K14', 'bottleneck', v.bottleneck); }
  };
  function playLabel(id) { var p = PLAYS.filter(function (x) { return x.id === id; })[0]; return p ? p.label : String(id); }
  function optionLabel(levelId, key, id) {
    var lv = BY_ID[levelId]; if (!lv) return String(id);
    var f = (lv.fields || []).filter(function (x) { return x.key === key; })[0];
    var o = f && f.options ? f.options.filter(function (x) { return x.id === id; })[0] : null;
    return o ? o.label : String(id);
  }

  function recipe(id, state, v) {
    var r = RECIPE_BY_ID[id]; if (!r) return null;
    v = v || values(state);
    var missing = r.needs.filter(function (k) { return !has(v[k]); }).map(function (k) { return { key: k, level: FIELD_LEVEL[k] || null }; });
    var out = { id: r.id, label: r.label, tier: r.tier, kind: r.kind, unit: r.unit || null, says: r.says, ready: missing.length === 0, missing: missing, value: null, note: null };
    if (!out.ready) return out;
    if (r.kind === 'badge') { out.value = true; return out; }
    var fn = F[r.id]; if (!fn) { out.note = 'No formula.'; return out; }
    var res = fn(v);
    if (res && typeof res === 'object' && !res.chart && 'value' in res) { out.value = res.value; out.note = res.note || null; out.ready = out.value !== null; }
    else out.value = res;
    return out;
  }
  function recipes(state) { var v = values(state); return RECIPES.map(function (r) { return recipe(r.id, state, v); }); }
  function formulaFor(id) { return F[id] || null; }

  /* ---- Plays (the moons) ------------------------------------------------------- */
  function test(rule, v, rec) {
    var val;
    if (RECIPE_BY_ID[rule.of]) { var r = rec[rule.of]; if (!r || !r.ready) return false; val = r.value; }
    else { if (!has(v[rule.of])) return false; val = v[rule.of]; }
    if (rule.op === 'known') return true;
    if (typeof val !== 'number') return false;
    if (rule.op === '>=') return val >= rule.value; if (rule.op === '<=') return val <= rule.value;
    if (rule.op === '>') return val > rule.value; if (rule.op === '<') return val < rule.value;
    if (rule.op === '==') return val === rule.value;
    return false;
  }
  function plays(state) {
    var v = values(state), rec = {};
    RECIPES.forEach(function (r) { rec[r.id] = recipe(r.id, state, v); });
    return PLAYS.map(function (p) {
      var waiting = p.when.filter(function (rule) { return !test(rule, v, rec); }).map(function (rule) { return rule.says; });
      var chosen = [v.attrPlay, v.attrStack, v.upPlay, v.downPlay, v.contPlay].indexOf(p.id) >= 0;
      var t = (state.checks || {})['play:' + p.id] || {}, ticked = p.steps.filter(function (s, i) { return t['s' + i]; }).length;
      return { id: p.id, planet: p.planet, label: p.label, what: p.what, steps: p.steps, when: p.when, open: waiting.length === 0, waiting: waiting, chosen: chosen, ticked: ticked };
    });
  }

  /* ---- Next up ---------------------------------------------------------------
     Open levels ranked: band first (never above band 2 until every planet has
     finished band 1), then how many recipes the level would finish, then the
     planet the constraint points at, then planet order. */
  function next(state, n) {
    var v = values(state), all = PLANETS.map(function (p) { return p.id; });
    var band1 = all.every(function (pid) { return LEVELS.filter(function (l) { return l.planet === pid && l.band === 1; }).every(function (l) { return levelState(l, state) === 'done'; }); });
    var prefer = v.firstPlanet || ({ customers: 'attr', perCustomer: 'up', stay: 'cont', cost: 'found' })[v.constraint] || null;
    var open = LEVELS.filter(function (l) { return levelState(l, state) !== 'done' && (band1 || l.band <= 2); });
    function completes(l) {
      var gives = {}; (l.fields || []).forEach(function (f) { gives[f.key] = true; }); gives[l.id] = true;
      return RECIPES.filter(function (r) { return r.needs.some(function (k) { return gives[k]; }) && r.needs.every(function (k) { return gives[k] || has(v[k]); }); }).length;
    }
    var ranked = open.map(function (l) { return { level: l, band: l.band, gain: completes(l), pref: l.planet === prefer ? 0 : 1, order: all.indexOf(l.planet), state: levelState(l, state) }; });
    ranked.sort(function (a, b) { return a.band - b.band || b.gain - a.gain || a.pref - b.pref || a.order - b.order || a.level.level - b.level.level; });
    return ranked.slice(0, n || 3).map(function (x) {
      var p = PLANETS.filter(function (q) { return q.id === x.level.planet; })[0];
      var why = x.state === 'part' ? 'Half done already.' : x.gain ? ('Lights ' + x.gain + (x.gain === 1 ? ' figure.' : ' figures.')) : x.level.band === 1 ? 'Read it, answer one question.' : 'Next in order.';
      return { level: x.level, planetLabel: p.label, why: why };
    });
  }

  /* ---- Words ------------------------------------------------------------------ */
  function fmtCents(c, short) {
    var neg = c < 0, a = Math.abs(c), d = a / 100, s;
    if (short && d >= 1000000) s = (d / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    else if (short && d >= 10000) s = Math.round(d / 1000) + 'k';
    else s = Math.round(d).toLocaleString('en-US');
    return (neg ? '-$' : '$') + s;
  }
  function fmt(value, unit, short) {
    if (value === null || value === undefined) return 'not yet';
    if (typeof value === 'boolean') return value ? 'earned' : 'not yet';
    if (typeof value === 'string') return value;
    if (typeof value !== 'number') return '';
    if (unit === 'cents') return fmtCents(value, short);
    if (unit === 'percent') return (Math.round(value * 10) / 10).toLocaleString('en-US') + '%';
    if (unit === 'ratio') return (Math.round(value * 10) / 10).toLocaleString('en-US') + 'x';
    if (unit === 'count') return Math.round(value).toLocaleString('en-US');
    if (unit === 'days') return Math.round(value) + (Math.round(value) === 1 ? ' day' : ' days');
    if (unit === 'months') return (Math.round(value * 10) / 10) + ' months';
    return String(Math.round(value * 100) / 100);
  }
  function status(id, value) {
    if (typeof value !== 'number') return null;
    if (id === 'ratio30' || id === 'measuredRatio' || id === 'baselineRatio') return value >= 2 ? 'good' : value >= 1 ? 'watch' : 'out';
    if (id === 'ltgpCac') return value >= 3 ? 'good' : value >= 1 ? 'watch' : 'out';
    if (id === 'grossMargin') return value >= 50 ? 'good' : value >= 30 ? 'watch' : 'out';
    if (id === 'firstSaleGap' || id === 'planLeak') return value >= 0 ? 'good' : 'watch';
    if (id === 'paybackDays') return value <= 30 ? 'good' : value <= 90 ? 'watch' : 'out';
    return null;
  }
  var api = { use: use, values: values, levelState: levelState, planets: planets, recipes: recipes, recipe: recipe, plays: plays, next: next, fmt: fmt, status: status, formulaFor: formulaFor,
    levels: function () { return LEVELS; }, planetList: function () { return PLANETS; }, bandList: function () { return BANDS; }, level: function (id) { return BY_ID[id] || null; }, recipeDef: function (id) { return RECIPE_BY_ID[id] || null; }, levelOfField: function (k) { return FIELD_LEVEL[k] || null; } };
  return api;
});
