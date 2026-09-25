/* ==========================================================================
   coach/engines/session.js, what the coach screens read. CD-001, CD-004.
   --------------------------------------------------------------------------
   Pure: a household and the tables in, plain objects out, never a write.
   Every figure comes from a SPARKS engine the coach carries a byte-identical
   copy of (Tier0, CashFlow, Opening, Debt, Countdown; coach/tools/vendor.js),
   so the coach's numbers are the rooms' numbers. The two rail ratios SPARKS
   computes inside Ratios (liquidity, housing) are read here from the same
   Schema readers, and coach/test/run.js holds them equal to SPARKS' Ratios.

     path(table, pathId, client)     the ordered stops, the client's own order
                                     and skips applied: [{ id, title, ..., items }]
     items(stop)                     its fields (one each; a list is one item),
                                     then its questions: 'field:dob', 'list:debt', 'q:want'
     done(stop, h, T, ctx)           the doneWhen tests: { done, tests: [{ test, pass, why }] }
     stage(stops, h, T, ctx)         the first stop not done: { index, stop, of }
     rail(h, T, ids)                 [{ id, label, unit, value, ok, text, zone, reason }]
     figures(h, T, ids)              a stop's own read-outs, same shape
     fiBand(h, T)                    { hasDate, worst, likely, best (months), text, ... }
     netWorth(h)                     cents or null
     recap(before, after, T, ctx)    the plain-words diff of two households
     goals(h, T, opts)               each goal: amount, date, monthly need, landing, status
     lifeMap(h, T, opts)             the Client View's timeline
     checkinStatus(checkins, now)    'in' | 'late' | 'missing'
     roughCount(h, now)              rough or stale entries (meta.fields)

   ctx for done/stage/recap: { stopId, notes, homework, decisions, sessionId,
   ticked, stops, stopsCovered, readings: fn(h) -> { id: { label, text } } }.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node ? {
    Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'),
    CashFlow: require('./cashflow.js'), Opening: require('./opening.js'), Countdown: require('./countdown.js'), Debt: require('./debt.js')
  } : ['Money', 'Schema', 'Tier0', 'CashFlow', 'Opening', 'Countdown', 'Debt'].reduce(function (o, k) { o[k] = root.SLAF && root.SLAF[k]; return o; }, {});
  var api = factory(deps);
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Session = api; }
})(typeof self !== 'undefined' ? self : null, function (D) {
  'use strict';
  var Money = D.Money, Schema = D.Schema;

  function isOk(r) { return !!(r && r.status === 'ok'); }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  /* ---- The path ---------------------------------------------------------- */
  function items(stop) {
    var rows = (stop.fields || []).map(function (f) { return /^list:/.test(f) ? { id: f, kind: 'list', list: f.slice(5) } : { id: 'field:' + f, kind: 'field', fieldId: f }; });
    var qs = (stop.questions || []).map(function (q) { return { id: 'q:' + q.id, kind: 'question', text: q.text }; });
    return rows.concat(qs);
  }
  function path(table, pathId, client) {
    var t = table || {};
    var paths = t.paths || [];
    var p = paths.filter(function (x) { return x.id === pathId; })[0] || paths[0];
    if (!p) return [];
    var order = p.stops.slice();
    var c = client || {};
    if (Array.isArray(c.stopOrder) && c.stopOrder.length) {
      var known = c.stopOrder.filter(function (id) { return t.stops && t.stops[id]; });
      order = known.concat(order.filter(function (id) { return known.indexOf(id) === -1; }));
    }
    return order.filter(function (id) { return t.stops && t.stops[id]; }).map(function (id) {
      var s = t.stops[id];
      return Object.assign({ id: id, skipped: !!(c.skipped && c.skipped[id]) }, JSON.parse(JSON.stringify(s)), { items: items(s) });
    });
  }

  /* ---- Done when: evaluated, never typed ---------------------------------- */
  function goalHasDate(g) { return !!(g && g.targetDate && /^\d{4}-\d{2}/.test(g.targetDate)); }
  var TESTS = {
    goalsWithDates: function (h, T, c, spec) {
      var n = (h.goals || []).filter(goalHasDate).length, min = spec.min || 1;
      return { pass: n >= min, why: n + ' of ' + min + ' goals with a date' };
    },
    takeHomeKnown: function (h, T) {
      var r = safe(function () { return Schema.takeHomeMonthlyCents(h, T); });
      return { pass: isOk(r), why: isOk(r) ? 'take-home ' + Money.formatCents(r.value) + ' a month' : 'take-home not known yet' };
    },
    surplusComputes: function (h, T) {
      var r = safe(function () { return D.CashFlow.monthlySurplusCents(h, T && T.expenseCategories, T); });
      return { pass: isOk(r), why: isOk(r) ? 'surplus ' + Money.formatCents(r.value) + ' a month' : 'the surplus does not compute yet' };
    },
    debtFreeDate: function (h, T) {
      if (h.meta && h.meta.hasDebt === false) return { pass: true, why: 'no debt' };
      if (!(h.debts || []).length) return { pass: false, why: 'no debts listed, and "no debt" not said' };
      var r = safe(function () { return D.Debt.simulate(h, T.debtRules, {}); });
      return { pass: isOk(r), why: isOk(r) ? 'debt-free in ' + monthsText(r.months) + ' at the minimums alone' : 'no debt-free date yet' };
    },
    emergencyMonths: function (h) {
      var r = safe(function () { return D.Tier0.emergencyFundMonths(h); });
      return { pass: isOk(r), why: isOk(r) ? (Math.round(r.value * 10) / 10) + ' months of cushion' : 'emergency months do not compute yet' };
    },
    stopNoted: function (h, T, c) {
      var n = (c.notes || []).filter(function (x) { return x.stopId === c.stopId && x.kind === 'shared' && x.text; }).length
        + (c.homework || []).filter(function (x) { return x.stopId === c.stopId && x.text; }).length;
      return { pass: n > 0, why: n ? 'named in a shared note or homework' : 'not named in a shared note or homework yet' };
    },
    netWorth: function (h) {
      var r = safe(function () { return D.Tier0.netWorth(h); });
      return { pass: isOk(r), why: isOk(r) ? 'net worth ' + Money.formatCents(r.value) : 'net worth does not compute yet' };
    },
    savingsRate: function (h, T) {
      var r = safe(function () { return D.Tier0.savingsRate(h, T).excludingMatch; });
      return { pass: isOk(r), why: isOk(r) ? 'savings rate ' + Money.formatRate(r.value) : 'savings rate does not compute yet' };
    },
    marginalRate: function (h) {
      var a = safe(function () { return Schema.resolveAssumptions(h); }) || {};
      var v = Money.isEntered(a.marginalRate) ? a.marginalRate : null;
      return { pass: v !== null, why: v !== null ? 'marginal rate ' + Money.formatRate(v) : 'marginal rate not known yet' };
    },
    goalsPlanned: function (h, T) {
      var gs = goals(h, T, {});
      if (!gs.length) return { pass: false, why: 'no goals yet' };
      var ok = gs.filter(function (g) { return g.monthlyCents !== null; }).length;
      return { pass: ok === gs.length, why: ok + ' of ' + gs.length + ' goals have a monthly number' };
    },
    decisionVerdicts: function (h, T, c) {
      var ds = c.decisions || [];
      if (!ds.length) return { pass: false, why: 'no decisions listed yet' };
      var n = ds.filter(function (d) { return ['go', 'wait', 'no'].indexOf(d.verdict) >= 0; }).length;
      return { pass: n === ds.length, why: n + ' of ' + ds.length + ' decisions have a verdict' };
    }
  };
  function done(stop, h, T, ctx) {
    var c = Object.assign({ stopId: stop.id }, ctx || {});
    var tests = (stop.doneWhen || []).map(function (spec) {
      var fn = TESTS[spec.test];
      if (!fn) return { test: spec.test, pass: false, why: 'unknown test' };
      var r = fn(h || {}, T || {}, c, spec);
      return { test: spec.test, pass: !!r.pass, why: r.why };
    });
    return { done: tests.length > 0 && tests.every(function (t) { return t.pass; }), tests: tests };
  }
  function stage(stops, h, T, ctx) {
    var live = stops.filter(function (s) { return !s.skipped; });
    for (var i = 0; i < live.length; i++) {
      if (!done(live[i], h, T, Object.assign({}, ctx, { stopId: live[i].id })).done) return { index: i, stop: live[i], of: live.length };
    }
    return { index: live.length, stop: null, of: live.length };
  }

  /* ---- The rail --------------------------------------------------------- */
  function unitText(unit, v) {
    if (v === null || v === undefined) return Money.NOT_YET || 'not yet';
    if (unit === 'rate') return Money.formatRate(v);
    if (unit === 'months') return (Math.round(v * 10) / 10) + ' months';
    if (unit === 'years') return (Math.round(v * 10) / 10) + ' years';
    if (unit === 'multiple') return (Math.round(v * 10) / 10) + 'x';
    if (unit === 'cents') return Money.formatCents(v);
    return String(Math.round(v * 100) / 100);
  }
  /* The rail's five and the stops' read-outs. Tier0, CashFlow and Debt own
     their formulas; liquidity and housing are two Schema readers over one
     another, exactly as engines/ratios.js context() reads them (its
     'accommodation' basis: this app keeps no categorised month). */
  function liquidAssets(h) {
    var liquid = 0, n = 0;
    Schema.aggregatableAssets(h).forEach(function (a) { if (Money.isEntered(a.valueCents) && a.liquid) { liquid += a.valueCents; n++; } });
    if (n) return liquid;
    var cash = safe(function () { return Schema.cashCents(h); });
    return isOk(cash) ? cash.value : null;
  }
  function val(r) { return isOk(r) ? r.value : null; }
  var READ = {
    savingsRate: function (h, T) { return D.Tier0.savingsRate(h, T).excludingMatch; },
    debtToIncome: function (h) { return D.Tier0.debtToIncome(h); },
    emergencyFundMonths: function (h) { return D.Tier0.emergencyFundMonths(h); },
    liquidityRatio: function (h) { return Money.safeDivide(liquidAssets(h), val(Schema.monthlyExpensesCents(h)), { denominatorName: 'monthlyExpenses' }); },
    housingRatio: function (h) {
      var typed = h.expenses && h.expenses.needs && h.expenses.needs.accommodation ? h.expenses.needs.accommodation.monthlyCents : null;
      if (!Money.isEntered(typed)) return Money.incomplete('Add what the roof costs to see this.', ['accommodationMonthly']);
      var g = val(Schema.grossAnnualIncomeCents(h));
      return Money.safeDivide(typed, Money.isEntered(g) ? g / 12 : null, { denominatorName: 'grossAnnualIncome' });
    },
    netWorth: function (h) { return D.Tier0.netWorth(h); },
    takeHome: function (h, T) { return Schema.takeHomeMonthlyCents(h, T); },
    surplus: function (h, T) { return D.CashFlow.monthlySurplusCents(h, T.expenseCategories, T); },
    spending: function (h) { return Schema.monthlyExpensesCents(h); },
    totalDebt: function (h) { return Schema.totalDebtCents(h); },
    debtPayments: function (h) { return Schema.monthlyDebtPaymentsCents(h); },
    debtFree: function (h, T) {
      if (h.meta && h.meta.hasDebt === false) return Money.ok(0);
      var r = D.Debt.simulate(h, T.debtRules, {});
      return isOk(r) ? Money.ok(r.months) : r;
    },
    cash: function (h) { return Schema.cashCents(h); },
    invested: function (h) { return Schema.investmentsCents(h); },
    marginalRate: function (h) { var a = Schema.resolveAssumptions(h); return Money.isEntered(a.marginalRate) ? Money.ok(a.marginalRate) : Money.incomplete('Not known yet.', ['marginalRate']); },
    goalsMonthly: function (h, T) { var gs = goals(h, T, {}); if (!gs.length) return Money.incomplete('No goals yet.', ['goals']); var n = 0; for (var i = 0; i < gs.length; i++) { if (gs[i].monthlyCents === null) return Money.incomplete('A goal has no price or date yet.', ['goals']); n += gs[i].monthlyCents; } return Money.ok(n); }
  };
  function readOne(id, h, T, defs) {
    var d = (defs && defs[id]) || { label: id, unit: null };
    var r = READ[id] ? safe(function () { return READ[id](h, T); }) : null;
    var ok = isOk(r), v = ok ? r.value : null;
    var zone = ok ? verdict(id, v, T.ratioBenchmarks) : 'none';
    return { id: id, label: d.label, unit: d.unit, value: v, ok: ok, text: d.unit === 'monthsText' ? (ok ? monthsText(v) : 'not yet') : unitText(d.unit, v), zone: zone, reason: ok ? null : (r && r.reason) || null };
  }
  /* The band colours, read the way engines/ratios.js verdict() reads them. */
  function verdict(id, value, table) {
    var band = table && table.bands ? table.bands[id] : null;
    if (!band || !Money.isEntered(value) || band.good === null || band.warn === null) return 'none';
    var good = band.direction === 'lower' ? value <= band.good : value >= band.good;
    var warn = band.direction === 'lower' ? value <= band.warn : value >= band.warn;
    return good ? 'good' : warn ? 'watch' : 'out';
  }
  function defsOf(T) { return (T.sessionPaths && T.sessionPaths.readouts) || {}; }
  function rail(h, T, ids) { return (ids || (T.sessionPaths && T.sessionPaths.rail) || []).map(function (id) { return readOne(id, h, T, defsOf(T)); }); }
  function figures(h, T, ids) { return (ids || []).map(function (id) { return readOne(id, h, T, defsOf(T)); }); }
  function netWorth(h) { var r = safe(function () { return D.Tier0.netWorth(h); }); return isOk(r) ? r.value : null; }
  function monthsText(m) {
    if (m === null || m === undefined || !isFinite(m)) return null;
    var y = Math.floor(m / 12), mo = Math.round(m - y * 12);
    if (mo === 12) { y++; mo = 0; }
    return y + (y === 1 ? ' year' : ' years') + (mo ? ' ' + mo + (mo === 1 ? ' month' : ' months') : '');
  }
  function fiBand(h, T) {
    var r = safe(function () { return D.Opening.read(h, T); });
    var b = r && r.band;
    if (!b || !b.runs || !b.hasDate) return { hasDate: false, alreadyThere: !!(b && b.alreadyThere), text: b && b.alreadyThere ? 'already there' : 'no date yet', missing: r ? r.missing || [] : [] };
    var R = b.runs;
    function yearOf(age) { return Money.isEntered(age) ? Math.floor(age) : null; }
    return { hasDate: true, worst: R.worst.months, likely: R.likely.months, best: R.best.months,
      likelyAge: R.likely.age, worstAge: R.worst.age, bestAge: R.best.age,
      text: monthsText(R.best.months) + ' to ' + monthsText(R.worst.months) + ', likely ' + monthsText(R.likely.months),
      ageText: Money.isEntered(R.likely.age) ? 'around age ' + yearOf(R.best.age) + ' to ' + yearOf(R.worst.age) : null };
  }

  /* ---- The recap: two households in plain words ---------------------------- */
  function numbers(h, T) {
    var out = {};
    function put(id, label, r, fmt) { out[id] = { label: label, value: isOk(r) ? r.value : null, text: isOk(r) ? fmt(r.value) : null }; }
    put('netWorth', 'Net worth', safe(function () { return D.Tier0.netWorth(h); }), Money.formatCents);
    put('takeHome', 'Take-home, a month', safe(function () { return Schema.takeHomeMonthlyCents(h, T); }), Money.formatCents);
    put('surplus', 'Left over, a month', safe(function () { return D.CashFlow.monthlySurplusCents(h, T.expenseCategories, T); }), Money.formatCents);
    put('spending', 'Spending, a month', safe(function () { return Schema.monthlyExpensesCents(h); }), Money.formatCents);
    return out;
  }
  function itemLines(before, after, list, name) {
    var lines = [];
    var b = {}; (before[list] || []).forEach(function (x) { b[x.id] = x; });
    var a = {}; (after[list] || []).forEach(function (x) { a[x.id] = x; });
    var fields = list === 'debts'
      ? [['balanceCents', 'balance', Money.formatCents], ['rate', 'rate', function (v) { return Money.formatRate(v, { decimals: 1 }); }], ['minPaymentCents', 'payment', Money.formatCents]]
      : [['valueCents', 'value', Money.formatCents]];
    Object.keys(a).forEach(function (id) {
      var x = a[id], label = x.label || name;
      if (!b[id]) {
        var said = fields.filter(function (f) { return Money.isEntered(x[f[0]]); }).map(function (f) { return f[1] + ' ' + f[2](x[f[0]]); });
        lines.push('Added ' + label + (said.length ? ': ' + said.join(', ') : ''));
        return;
      }
      fields.forEach(function (f) {
        var was = b[id][f[0]], now = x[f[0]];
        if (was === now || (!Money.isEntered(was) && !Money.isEntered(now))) return;
        lines.push(label + ' ' + f[1] + ': ' + (Money.isEntered(was) ? f[2](was) : 'not yet') + ' to ' + (Money.isEntered(now) ? f[2](now) : 'not yet'));
      });
    });
    Object.keys(b).forEach(function (id) { if (!a[id]) lines.push('Removed ' + (b[id].label || name)); });
    return lines;
  }
  function recap(before, after, T, ctx) {
    var c = ctx || {};
    var B = before || {}, A = after || {};
    var sections = [];
    /* what we covered */
    var covered = (c.stops || []).filter(function (s) { return (c.stopsCovered || []).indexOf(s.id) >= 0; }).map(function (s) {
      var n = (c.ticked || []).filter(function (t) { return t.stopId === s.id; }).length;
      return s.title + (n ? ' (' + n + (n === 1 ? ' item' : ' items') + ' done)' : '');
    });
    sections.push({ id: 'covered', title: 'What we covered', lines: covered.length ? covered : ['We talked; no stop was marked covered.'] });
    /* numbers that changed */
    var changed = [];
    if (typeof c.readings === 'function') {
      var rb = c.readings(B), ra = c.readings(A);
      Object.keys(ra).forEach(function (id) {
        var x = ra[id], y = rb[id];
        var was = y ? y.text : null, now = x.text;
        if (was === now || /listed$/.test(String(now)) || /listed$/.test(String(was))) return;
        var line = x.label + ': ' + (was || 'not yet') + ' to ' + (now || 'not yet');
        if (changed.indexOf(line) === -1) changed.push(line);     /* two fields, one label and one figure: say it once */
      });
    }
    changed = changed.concat(itemLines(B, A, 'debts', 'A debt'), itemLines(B, A, 'assets', 'An account'));
    sections.push({ id: 'numbers', title: 'Numbers that changed', lines: changed.length ? changed : ['No number changed.'] });
    /* ratios before and after */
    var rb2 = rail(B, T), ra2 = rail(A, T);
    var nb = numbers(B, T), na = numbers(A, T);
    var ratioLines = ra2.filter(function (r) { return r.id !== 'netWorth'; }).map(function (r, i) {
      var was = rb2[i].text, now = r.text;
      var was2 = rb2.filter(function (x) { return x.id === r.id; })[0]; was = was2 ? was2.text : was; return r.label + ': ' + (was === now ? now + ' (same)' : was + ' to ' + now);
    });
    ratioLines.unshift('Net worth: ' + (nb.netWorth.text || 'not yet') + (nb.netWorth.text === na.netWorth.text ? ' (same)' : ' to ' + (na.netWorth.text || 'not yet')));
    sections.push({ id: 'ratios', title: 'Ratios before and after', lines: ratioLines });
    /* FI band */
    var fb = fiBand(B, T), fa = fiBand(A, T);
    sections.push({ id: 'fi', title: 'Financial independence', lines: [fb.text === fa.text ? 'The FI date: ' + fa.text + ' (same)' : 'The FI date: ' + fb.text + ' before, ' + fa.text + ' now'] });
    /* shared notes and homework: this session's only; coach notes never */
    var shared = (c.notes || []).filter(function (n) { return n.kind === 'shared' && (!c.sessionId || n.sessionId === c.sessionId) && n.text; }).map(function (n) { return n.text; });
    if (shared.length) sections.push({ id: 'notes', title: 'Notes', lines: shared });
    var hw = (c.homework || []).filter(function (x) { return !x.doneAt && x.text; }).map(function (x) { return x.text + (x.dueOn ? ' (by ' + x.dueOn + ')' : ''); });
    sections.push({ id: 'homework', title: 'Homework', lines: hw.length ? hw : ['None this time.'] });
    var text = sections.map(function (s) { return s.title + '\n' + s.lines.map(function (l) { return '- ' + l; }).join('\n'); }).join('\n\n');
    return { sections: sections, text: text };
  }

  /* ---- Goals and the life map ----------------------------------------------- */
  function addMonths(iso, n) {
    var d = new Date(iso + (iso.length <= 10 ? 'T00:00:00Z' : ''));
    d.setUTCMonth(d.getUTCMonth() + Math.ceil(n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
  }
  /* Each goal through engines/countdown.js, the one countdown SPARKS has,
     at no growth (a goal's money sits in cash): the monthly figure that
     lands it by its date, and when it lands at what goes in now. */
  function goals(h, T, opts) {
    var o = opts || {};
    var asOf = o.asOf || Schema.localDay();
    return (h.goals || []).map(function (g) {
      var total = Money.isEntered(g.lumpTargetCents) ? g.lumpTargetCents : null;
      var saved = Money.isEntered(g.savedCents) ? g.savedCents : 0;
      var mu = g.targetDate ? Schema.monthsUntil(g.targetDate, asOf) : null;
      var months = isOk(mu) ? mu.value : null;       /* the count engines/goals.js uses */
      var need = total !== null && months !== null && months > 0 ? D.Countdown.monthlyNeededCents(total, saved, 0, months) : (total !== null && saved >= total ? 0 : null);
      var cd = total !== null ? D.Countdown.goalCountdown({ targetCents: total, savedCents: saved, monthlyContributionCents: g.monthlyContributionCents, annualRate: 0, from: asOf.slice(0, 7) }) : null;
      var lands = cd && isOk(cd) && !cd.neverAtThisPace ? cd.date : null;
      var going = Money.isEntered(g.monthlyContributionCents) ? g.monthlyContributionCents : 0;
      var status, statusText;
      if (total === null || !g.targetDate || need === null) { status = 'decide'; statusText = 'needs a decision'; }
      else if (saved >= total) { status = 'on-track'; statusText = 'already there'; }
      else if (going >= need) { status = 'on-track'; statusText = 'on track'; }
      else { status = 'short'; statusText = 'needs ' + Money.formatCents(need - going) + ' a month more'; }
      return { id: g.id, name: g.name || 'A goal', targetDate: g.targetDate || null, totalCents: total, savedCents: saved, monthlyCents: need, landsOn: lands, status: status, statusText: statusText };
    });
  }
  function ageAt(dob, iso) {
    if (!dob || !iso) return null;
    var a = new Date(dob + 'T00:00:00Z'), b = new Date((iso.length === 7 ? iso + '-01' : iso.slice(0, 10)) + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return (b - a) / (365.25 * 24 * 3600 * 1000);
  }
  function yearsUntil(iso, asOf) {
    if (!iso) return null;
    var a = new Date(asOf.slice(0, 10) + 'T00:00:00Z'), b = new Date((iso.length === 7 ? iso + '-01' : iso.slice(0, 10)) + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return (b - a) / (365.25 * 24 * 3600 * 1000);
  }
  function lifeMap(h, T, opts) {
    var o = opts || {};
    var asOf = o.asOf || Schema.localDay();
    var person = safe(function () { return Schema.primaryPerson(h); });
    var dob = person && person.dob ? person.dob : null;
    var age = ageAt(dob, asOf);
    var band = fiBand(h, T);
    var gl = goals(h, T, { asOf: asOf }).map(function (g) { return Object.assign({}, g, { age: ageAt(dob, g.targetDate) }); });
    var op = safe(function () { return D.Opening.read(h, T); });
    var marks = [];
    if (op && op.coast && Money.isEntered(op.coast.coastAge) && !op.coast.neverAtThisPace) marks.push({ id: 'coast', label: 'Coast FI', age: op.coast.coastAge });
    if (band.hasDate) {
      marks.push({ id: 'fi-best', label: 'FI, the good case', age: band.bestAge });
      marks.push({ id: 'fi-likely', label: 'FI, likely', age: band.likelyAge });
      marks.push({ id: 'fi-worst', label: 'FI, the slow case', age: band.worstAge });
    }
    ((T.retirementMilestones && T.retirementMilestones.milestones) || []).forEach(function (m) { marks.push({ id: 'multiple-' + m.age, label: m.multiple + 'x salary saved', age: m.age, kind: 'benchmark' }); });
    ((T.milestones && T.milestones.milestones) || []).forEach(function (m) { if (m.age) marks.push({ id: m.id, label: m.label, age: m.age.years + (m.age.months || 0) / 12, kind: 'rule' }); });
    var blocks = (o.decisions || []).filter(function (d) { return d.showClient; }).map(function (d) {
      return { id: d.id, label: d.label, verdict: d.verdict || null, age: ageAt(dob, d.startsOn), years: yearsUntil(d.startsOn, asOf), from: d.startsOn };
    });
    gl.forEach(function (g) { g.years = yearsUntil(g.targetDate, asOf); });
    marks.forEach(function (m) { m.years = age !== null ? m.age - age : null; });
    if (band.hasDate) { band.bestYears = band.best / 12; band.likelyYears = band.likely / 12; band.worstYears = band.worst / 12; }
    var endAge = Math.max(age !== null ? age + 10 : 70, band.hasDate ? band.worstAge + 5 : 0,
      gl.reduce(function (m, g) { return g.age !== null && g.age > m ? g.age : m; }, 0));
    var startAge = age !== null ? Math.floor(age) : null;
    var limit = Math.ceil(Math.min(Math.max(endAge, (startAge || 0) + 10), 100));
    return { asOf: asOf, age: age, startAge: startAge, endAge: limit, band: band, goals: gl,
      marks: marks.filter(function (m) { return age === null || (m.age >= age - 0.01 && m.age <= limit); }), blocks: blocks, hasAge: age !== null };
  }

  /* ---- Check-ins -------------------------------------------------------- */
  function checkinStatus(checkins, now) {
    var t = now ? new Date(now) : new Date();
    var last = (checkins || []).map(function (c) { return c.date; }).filter(Boolean).sort().pop();
    if (!last) return 'missing';
    var days = (t - new Date(last + (last.length <= 10 ? 'T00:00:00Z' : ''))) / 86400000;
    if (days <= 35) return 'in';
    if (days <= 65) return 'late';
    return 'missing';
  }
  /* Rough (typed as a guess, quick entry, a sheet) or stale (over 180
     days since it was said), from the stamps coach/shared/fields.js writes. */
  var STALE_DAYS = 180;
  function roughCount(h, now) {
    var t = now ? new Date(now).getTime() : Date.now();
    var f = (h && h.meta && h.meta.fields) || {};
    return Object.keys(f).filter(function (k) { var m = f[k] || {}; return m.confidence === 'roughly' || (m.asOf && (t - Date.parse(m.asOf)) / 86400000 > STALE_DAYS); }).length;
  }

  return { path: path, items: items, done: done, stage: stage, TESTS: Object.keys(TESTS), READOUTS: Object.keys(READ), rail: rail, figures: figures, fiBand: fiBand, netWorth: netWorth,
    numbers: numbers, recap: recap, goals: goals, lifeMap: lifeMap, checkinStatus: checkinStatus, roughCount: roughCount, monthsText: monthsText, ageAt: ageAt };
});
